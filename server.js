const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const next = require('next');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const cookieParser = require('cookie-parser');

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.text({ type: 'text/*' }));
app.use(bodyParser.json());
app.use(cookieParser());

const crypto = require('crypto');

// --- AUTH MIDDLEWARE ---
const requireAuth = (req, res, next) => {
    // Allow public routes
    const publicPaths = [
        '/api/auth/status',
        '/api/auth/verify',
        '/api/auth/setup',
        '/api/auth/logout',
        '/api/track', // IoT device input
        '/api/user/login', // App login
        '/api/user/verify', // App verify
        '/api/user/register', // App register
        '/api/user/add-vehicle', // App add vehicle
        '/api/user/vehicles' // App list vehicles
    ];

    if (publicPaths.includes(req.path)) return next();

    // Check cookie
    const token = req.cookies.admin_token;
    if (token === 'AUTHENTICATED') {
        return next();
    }

    // Attempt to verify 2FA status from DB to ensure it's enabled
    db.get("SELECT value FROM settings WHERE key = 'admin_2fa_enabled'", (err, row) => {
        const enabled = row && row.value === 'true';
        if (!enabled) {
            return next(); // If security not set up, allow access (or could redirect to setup)
        }
        res.status(401).json({ error: "Unauthorized" });
    });
};

// Apply middleware to API routes only
app.use('/api', requireAuth);

// --- AUTH ROUTES ---

// Check 2FA Status
app.get('/api/auth/status', (req, res) => {
    const token = req.cookies.admin_token;
    const authenticated = token === 'AUTHENTICATED';

    db.get("SELECT value FROM settings WHERE key = 'admin_2fa_enabled'", (err, row) => {
        const enabled = row ? row.value === 'true' : false;
        res.json({ enabled, authenticated });
    });
});

// Setup 2FA (Email + Password + Generate Secret)
app.post('/api/auth/setup', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and Password required" });

    // Check if already enabled
    db.get("SELECT value FROM settings WHERE key = 'admin_2fa_enabled'", (err, row) => {
        if (row && row.value === 'true') {
            if (req.cookies.admin_token !== 'AUTHENTICATED') {
                return res.status(403).json({ error: "System already secured" });
            }
        }

        // 1. Hash Password
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');

        // 2. Generate 2FA Secret
        const secret = speakeasy.generateSecret({ name: `GPS Tracker (${email})` });

        // 3. Save Everything
        db.serialize(() => {
            db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_email', ?)", [email]);
            db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_salt', ?)", [salt]);
            db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password', ?)", [hash]);
            db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_2fa_secret', ?)", [secret.base32]);
        });

        QRCode.toDataURL(secret.otpauth_url, (err, data_url) => {
            res.json({ secret: secret.base32, qr_code: data_url });
        });
    });
});

// Verify 2FA & Login
app.post('/api/auth/verify', (req, res) => {
    const { email, password, token } = req.body;

    // Fetch settings
    db.all("SELECT key, value FROM settings WHERE key IN ('admin_email', 'admin_salt', 'admin_password', 'admin_2fa_secret', 'admin_2fa_enabled')", (err, rows) => {
        if (err || !rows) return res.status(500).json({ error: "Database error" });

        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);

        if (!settings.admin_2fa_secret) return res.status(400).json({ error: "Security not set up" });

        // 1. Verify Email
        if (settings.admin_email && settings.admin_email !== email) {
            return res.status(401).json({ error: "Invalid Email" });
        }

        // 2. Verify Password
        if (settings.admin_password && settings.admin_salt) {
            const hash = crypto.pbkdf2Sync(password, settings.admin_salt, 1000, 64, 'sha512').toString('hex');
            if (hash !== settings.admin_password) {
                return res.status(401).json({ error: "Invalid Password" });
            }
        }

        // 3. Verify TOTP
        const verified = speakeasy.totp.verify({
            secret: settings.admin_2fa_secret,
            encoding: 'base32',
            token: token,
            window: 1 // Allow 30s drift
        });

        if (verified) {
            // Mark as enabled on first successful login if not already
            if (settings.admin_2fa_enabled !== 'true') {
                db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_2fa_enabled', 'true')");
            }

            res.cookie('admin_token', 'AUTHENTICATED', {
                httpOnly: true,
                maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
            });
            res.json({ success: true });
        } else {
            res.status(401).json({ error: "Invalid 2FA Code" });
        }
    });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.json({ success: true });
});

// ========== DATABASE SETUP ==========
const db = new sqlite3.Database('tracker.db');
db.serialize(() => {
    // Devices: 1 row per MAC (latest data)
    db.run(`CREATE TABLE IF NOT EXISTS devices (
        device_id TEXT PRIMARY KEY,
        lat REAL,
        lng REAL,
        status TEXT,
        owner_name TEXT DEFAULT '',
        license_plate TEXT DEFAULT '',
        sos_numbers TEXT DEFAULT '[]',
        last_update DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Logs: All historical data
    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT,
        lat REAL,
        lng REAL,
        status TEXT,
        raw_data TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Credentials: Admin creates when device first appears
    db.run(`CREATE TABLE IF NOT EXISTS credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        device_id TEXT,
        is_registered INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Registrations: User vehicle info
    db.run(`CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_token TEXT UNIQUE,
        devices TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Vehicle info linked to credentials
    db.run(`CREATE TABLE IF NOT EXISTS vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        credential_code TEXT,
        device_id TEXT,
        plate_number TEXT,
        driver_name TEXT,
        emergency_phone TEXT,
        vehicle_name TEXT,
        user_token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 🛡️ Geofences (Parking Spots) - Max 3 per device
    db.run(`CREATE TABLE IF NOT EXISTS geofences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT,
        name TEXT,
        lat REAL,
        lng REAL,
        radius REAL,
        is_inside INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Settings (for 2FA)
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);
});

// ========== DATA PARSER ==========
// Format: "MAC,STATUS LAT, LNG, TIMESTAMP"
// Example: "AA:BB:CC:DD:EE:FF,1 14.356857, 100.610772, 12345"
function parseMessage(content) {
    let deviceId = "unknown";
    let lat = null;
    let lng = null;
    let status = "0";
    let rawContent = typeof content === 'string' ? content.trim() : JSON.stringify(content);

    if (typeof content === 'string') {
        const trimmed = content.trim();

        // Try JSON first
        if (trimmed.startsWith('{')) {
            try {
                const json = JSON.parse(trimmed);
                deviceId = json.deviceId || json.device_id || json.mac || "unknown";
                lat = parseFloat(json.lat || json.latitude) || null;
                lng = parseFloat(json.lng || json.longitude) || null;
                status = String(json.status || json.type || "0");
            } catch (e) { }
        } else {
            // Parse: "MAC,STATUS LAT, LNG, TIMESTAMP"
            const parts = trimmed.split(/[, ]+/).filter(p => p.trim() !== '');

            if (parts.length >= 4) {
                deviceId = parts[0]; // MAC Address
                status = parts[1];   // Status code
                lat = parseFloat(parts[2]) || null;
                lng = parseFloat(parts[3]) || null;
            }
        }
    }

    // Map status codes to labels
    const statusMap = {
        '0': 'UNKNOWN',
        '1': 'STOLEN',
        '2': 'CRASH',
        '3': 'NORMAL'
    };
    const statusLabel = statusMap[status] || status;

    return { deviceId, lat, lng, status: statusLabel, rawContent };
}

// ========== HANDLE INCOMING DATA ==========
function handleData(data) {
    const { deviceId, lat, lng, status, rawContent } = data;

    // Save to logs (history)
    db.run(`INSERT INTO logs (device_id, lat, lng, status, raw_data) VALUES (?, ?, ?, ?, ?)`,
        [deviceId, lat || 0, lng || 0, status, rawContent]);

    // Upsert to devices (latest only)
    db.run(`INSERT INTO devices (device_id, lat, lng, status, last_update)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(device_id)
            DO UPDATE SET lat=excluded.lat, lng=excluded.lng, status=excluded.status, last_update=CURRENT_TIMESTAMP`,
        [deviceId, lat || 0, lng || 0, status]);

    // Emit to all connected clients
    io.emit('device_update', {
        device_id: deviceId,
        lat, lng, status,
        raw: rawContent,
        last_update: new Date().toISOString()
    });

    // 🛡️ CHECK GEOFENCES
    checkGeofences(deviceId, lat, lng);

    console.log(`📡 [${deviceId}] Status: ${status}, Lat: ${lat}, Lng: ${lng}`);
    return { success: true };
}

// ========== GEOFENCE LOGIC ==========
function checkGeofences(deviceId, lat, lng) {
    if (!lat || !lng) return;

    db.all("SELECT * FROM geofences WHERE device_id = ?", [deviceId], (err, fences) => {
        if (err) console.error("Geo DB Error:", err);
        if (!fences || fences.length === 0) {
            console.log(`No fences for ${deviceId}`);
            return;
        }

        fences.forEach(fence => {
            const distance = getDistanceFromLatLonInKm(lat, lng, fence.lat, fence.lng) * 1000; // Meters
            const isInside = distance <= fence.radius;
            const wasInside = fence.is_inside === 1;

            if (deviceId.includes('MOCK')) {
                console.log(`🔍 [Geo] ${fence.name}: ${distance.toFixed(1)}m / ${fence.radius}m | In: ${isInside} (Was: ${wasInside})`);
            }

            // ENTER Event
            if (isInside && !wasInside) {
                console.log(`🛡️ [ENTER] ${deviceId} entered ${fence.name}`);
                db.run("UPDATE geofences SET is_inside = 1 WHERE id = ?", [fence.id]);
                io.emit('geofence_alert', { device_id: deviceId, type: 'ENTER', name: fence.name, time: new Date() });

                // Log event
                db.run(`INSERT INTO logs (device_id, lat, lng, status, raw_data) VALUES (?, ?, ?, ?, ?)`,
                    [deviceId, lat, lng, 'GEOFENCE_ENTER', `Entered ${fence.name}`]);
            }

            // EXIT Event
            if (!isInside && wasInside) {
                console.log(`🛡️ [EXIT] ${deviceId} exited ${fence.name}`);
                db.run("UPDATE geofences SET is_inside = 0 WHERE id = ?", [fence.id]);
                io.emit('geofence_alert', { device_id: deviceId, type: 'EXIT', name: fence.name, time: new Date() });

                // Log event
                db.run(`INSERT INTO logs (device_id, lat, lng, status, raw_data) VALUES (?, ?, ?, ?, ?)`,
                    [deviceId, lat, lng, 'GEOFENCE_EXIT', `Exited ${fence.name}`]);
            }
        });
    });
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; // Km
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// ========== START SERVER ==========
nextApp.prepare().then(() => {

    // 📡 Receive data from ESP32
    app.post('/api/track', (req, res) => {
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        console.log(`📥 HTTP Recv from ${clientIp}:`, req.body);
        const parsed = parseMessage(req.body);
        handleData(parsed);
        res.send('OK');
    });

    // 📋 Get all devices (for Dashboard)
    app.get('/api/devices', (req, res) => {
        db.all("SELECT * FROM devices ORDER BY last_update DESC", [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
    });

    // 📋 Get single device
    app.get('/api/device/:id', (req, res) => {
        db.get("SELECT * FROM devices WHERE device_id = ?", [req.params.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: "Device not found" });
            try { row.sos_numbers = JSON.parse(row.sos_numbers || '[]'); } catch (e) { row.sos_numbers = []; }
            res.json(row);
        });
    });

    // 📜 Get device history/logs
    app.get('/api/history/:id', (req, res) => {
        const limit = parseInt(req.query.limit) || 500;
        db.all("SELECT * FROM logs WHERE device_id = ? ORDER BY timestamp DESC LIMIT ?",
            [req.params.id, limit], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json(rows || []);
            });
    });

    // 📝 Register device (owner name, license plate)
    app.post('/api/device/:id/register', (req, res) => {
        const { owner_name, license_plate } = req.body;
        db.run(`UPDATE devices SET owner_name = ?, license_plate = ? WHERE device_id = ?`,
            [owner_name || '', license_plate || '', req.params.id], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                io.emit('device_update', { device_id: req.params.id, registered: true });
                res.json({ success: true });
            });
    });

    // 🆘 Update SOS numbers
    app.post('/api/device/:id/sos', (req, res) => {
        const { numbers } = req.body;
        if (!Array.isArray(numbers)) return res.status(400).json({ error: "Invalid format" });

        const json = JSON.stringify(numbers.slice(0, 3));
        db.run("UPDATE devices SET sos_numbers = ? WHERE device_id = ?", [json, req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            io.emit('device_update', { device_id: req.params.id, sos_update: true });
            res.json({ success: true, numbers: JSON.parse(json) });
        });
    });

    // ========== CREDENTIAL SYSTEM ==========

    // 🔑 Generate credential code (Admin)
    app.post('/api/admin/credential', (req, res) => {
        const { device_id } = req.body;
        if (!device_id) return res.status(400).json({ error: "device_id required" });

        // Generate 6-character code
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();

        db.run(`INSERT INTO credentials (code, device_id) VALUES (?, ?)`,
            [code, device_id], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, code, device_id });
            });
    });

    // 🔑 Get all credentials (Admin)
    app.get('/api/admin/credentials', (req, res) => {
        db.all(`SELECT c.*, v.plate_number, v.driver_name 
                FROM credentials c 
                LEFT JOIN vehicles v ON c.code = v.credential_code
                ORDER BY c.created_at DESC`, [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
    });

    // 🔐 Verify credential code (User)
    app.post('/api/user/verify', (req, res) => {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: "code required" });

        db.get("SELECT * FROM credentials WHERE code = ?", [code.toUpperCase()], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: "Invalid code" });

            // Check if already registered
            db.get("SELECT * FROM vehicles WHERE credential_code = ?", [code.toUpperCase()], (err2, vehicle) => {
                res.json({
                    valid: true,
                    device_id: row.device_id,
                    is_registered: row.is_registered === 1,
                    vehicle: vehicle || null
                });
            });
        });
    });

    // 📱 Login with Phone Number (Check if user exists)
    app.post('/api/user/login', (req, res) => {
        const { phone_number } = req.body;
        if (!phone_number) return res.status(400).json({ error: "Phone number required" });

        // Check if any vehicle is linked to this phone number (user_token)
        db.all("SELECT * FROM vehicles WHERE user_token = ?", [phone_number], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (rows && rows.length > 0) {
                // User exists, return vehicles for auto-login
                res.json({ exists: true, user_token: phone_number, count: rows.length });
            } else {
                // New user
                res.json({ exists: false });
            }
        });
    });

    // 📝 Register vehicle (First time / New User)
    app.post('/api/user/register', (req, res) => {
        const { code, plate_number, driver_name, emergency_phone, phone_number } = req.body;

        // phone_number MUST be provided as it becomes the user_token
        if (!code || !plate_number || !phone_number) {
            return res.status(400).json({ error: "Missing required fields (code, plate, phone)" });
        }

        // Verify credential exists
        db.get("SELECT * FROM credentials WHERE code = ?", [code.toUpperCase()], (err, cred) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!cred) return res.status(404).json({ error: "Invalid credential" });

            const vehicleName = `${plate_number} - ${driver_name || 'Driver'}`;
            const token = phone_number; // Use Phone Number as Token

            // Insert vehicle
            db.run(`INSERT INTO vehicles (credential_code, device_id, plate_number, driver_name, emergency_phone, vehicle_name, user_token)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [code.toUpperCase(), cred.device_id, plate_number, driver_name || '', emergency_phone || '', vehicleName, token],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });

                    // Mark credential as registered
                    db.run("UPDATE credentials SET is_registered = 1 WHERE code = ?", [code.toUpperCase()]);

                    res.json({
                        success: true,
                        user_token: token,
                        vehicle: {
                            device_id: cred.device_id,
                            plate_number,
                            driver_name,
                            vehicle_name: vehicleName
                        }
                    });
                });
        });
    });

    // 🚗 Get user's vehicles (User)
    app.get('/api/user/vehicles', (req, res) => {
        const token = req.query.token || req.headers['x-user-token'];
        if (!token) return res.status(400).json({ error: "Token required" });

        db.all(`SELECT v.*, d.lat, d.lng, d.status, d.last_update
                FROM vehicles v
                LEFT JOIN devices d ON v.device_id = d.device_id
                WHERE v.user_token = ?
                ORDER BY v.created_at DESC`, [token], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
    });

    // ➕ Add vehicle to user account
    app.post('/api/user/add-vehicle', (req, res) => {
        const { code, plate_number, driver_name, emergency_phone, user_token } = req.body;
        if (!code || !plate_number || !user_token) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Use existing register logic but with existing token
        db.get("SELECT * FROM credentials WHERE code = ?", [code.toUpperCase()], (err, cred) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!cred) return res.status(404).json({ error: "Invalid credential" });
            if (cred.is_registered) return res.status(400).json({ error: "Credential already used" });

            const vehicleName = `${plate_number} - ${driver_name || 'รถใหม่'}`;

            db.run(`INSERT INTO vehicles (credential_code, device_id, plate_number, driver_name, emergency_phone, vehicle_name, user_token)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [code.toUpperCase(), cred.device_id, plate_number, driver_name || '', emergency_phone || '', vehicleName, user_token],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });

                    db.run("UPDATE credentials SET is_registered = 1 WHERE code = ?", [code.toUpperCase()]);

                    res.json({
                        success: true,
                        vehicle: {
                            device_id: cred.device_id,
                            plate_number,
                            driver_name,
                            vehicle_name: vehicleName
                        }
                    });
                });
        });
    });

    // 🗑️ Clear all data
    app.post('/api/clear', (req, res) => {
        db.serialize(() => {
            db.run("DELETE FROM logs");
            db.run("DELETE FROM devices");
            // Keep users/vehicles/geofences usually, but if full reset needed:
            // db.run("DELETE FROM vehicles");
            // db.run("DELETE FROM geofences");
        });
        io.emit('clear_data');
        console.log("🗑️ Database cleared");
        res.json({ success: true });
    });

    // ========== GEOFENCE API ==========

    // 🛡️ Get Geofences
    app.get('/api/geofence/:device_id', (req, res) => {
        db.all("SELECT * FROM geofences WHERE device_id = ?", [req.params.device_id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
    });

    // 🛡️ Add/Update Geofence (Max 3)
    app.post('/api/geofence', (req, res) => {
        const { device_id, name, lat, lng, radius } = req.body;
        if (!device_id || !name || !lat || !lng || !radius) return res.status(400).json({ error: "Missing fields" });

        db.all("SELECT * FROM geofences WHERE device_id = ?", [device_id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            if (rows.length >= 3) {
                return res.status(400).json({ error: "Maximum 3 geofences allowed. Please delete one first." });
            }

            // Calculate initial status
            let initialIsInside = false;
            db.get("SELECT lat, lng FROM devices WHERE device_id = ?", [device_id], (err, dev) => {
                if (dev && dev.lat && dev.lng) {
                    const dist = getDistanceFromLatLonInKm(lat, lng, dev.lat, dev.lng) * 1000;
                    if (dist <= radius) initialIsInside = true;
                }

                db.run("INSERT INTO geofences (device_id, name, lat, lng, radius, is_inside) VALUES (?, ?, ?, ?, ?, ?)",
                    [device_id, name, lat, lng, radius, initialIsInside ? 1 : 0], function (err) {
                        if (err) return res.status(500).json({ error: err.message });
                        console.log(`🛡️ Added Fence: ${name} for ${device_id} (Initial Inside: ${initialIsInside})`);
                        res.json({ success: true, id: this.lastID });
                    });
            });
        });
    });

    // 🛡️ Delete Geofence
    app.delete('/api/geofence/:id', (req, res) => {
        db.run("DELETE FROM geofences WHERE id = ?", [req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });

    // 🔌 WebSocket
    io.on('connection', (socket) => {
        console.log('🔗 Client connected:', socket.id);
        socket.on('message', (msg) => {
            const parsed = parseMessage(msg);
            handleData(parsed);
        });
        socket.on('disconnect', () => {
            console.log('❌ Client disconnected:', socket.id);
        });
    });

    // Next.js handler
    app.all(/(.*)/, (req, res) => handle(req, res));

    server.listen(PORT, (err) => {
        if (err) throw err;
        console.log(`🚀 Server ready on http://localhost:${PORT}`);
    });
});
