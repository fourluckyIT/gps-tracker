const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const next = require('next');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const cookieParser = require('cookie-parser');

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

const PORT = 3000;

nextApp.prepare().then(() => {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

    app.use(cors());
    app.use(cookieParser());
    app.use(bodyParser.text({ type: 'text/*' }));
    app.use(bodyParser.json());

    // Serve Static Website (Next.js handles this mostly, but keeping for public folder if needed)
    app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

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

        // Settings (for legacy or config)
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        const speakeasy = require('speakeasy');
        const QRCode = require('qrcode');

        // ... (rest of imports)

        // ... (rest of db.serialize)

        // 👑 Admins Table (New)
        db.run(`CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone_number TEXT UNIQUE,
            password_hash TEXT,
            salt TEXT,
            role TEXT DEFAULT 'ADMIN', -- 'SUPER_ADMIN' or 'ADMIN'
            email TEXT,
            totp_secret TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (!err) {
                // Migration: Add columns if not exists (for existing check)
                db.run("ALTER TABLE admins ADD COLUMN email TEXT", () => { });
                db.run("ALTER TABLE admins ADD COLUMN totp_secret TEXT", () => { });
            }
        });
    });

    // ... (handleData function)

    // ========== ADMIN SETUP APIs (TOTP) ==========

    // Simple in-memory session store (use Redis/DB in production)
    const sessions = {};

    // Middleware to parse cookies manually (simple version)
    app.use((req, res, next) => {
        const cookie = req.headers.cookie;
        if (cookie) {
            const match = cookie.match(/admin_session=([^;]+)/);
            if (match) {
                const sessionId = match[1];
                req.session = sessions[sessionId] || {};
                req.sessionId = sessionId;
            }
        }
        if (!req.session) {
            req.session = {};
            req.sessionId = Math.random().toString(36).substring(2);
        }

        // Save session after response
        const oldSend = res.send;
        res.send = function (data) {
            sessions[req.sessionId] = req.session;
            if (req.session.adminId) {
                res.cookie('admin_session', req.sessionId, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
            }
            return oldSend.call(this, data);
        };
        next();
    });

    // Check Auth Status & Setup Requirement
    app.get('/api/auth/status', (req, res) => {
        // Check if admin is logged in via session
        if (req.session && req.session.adminId) {
            return res.json({
                authenticated: true,
                role: req.session.role,
                needsSetup: false
            });
        }

        // Check if setup is needed (no SUPER_ADMIN with TOTP)
        db.get("SELECT * FROM admins WHERE role = 'SUPER_ADMIN' AND totp_secret IS NOT NULL", (err, row) => {
            if (!row) {
                return res.json({ authenticated: false, needsSetup: true });
            }
            res.json({ authenticated: false, needsSetup: false });
        });
    });

    // 1. Generate Setup Token (QR)
    app.post('/api/admin/setup/token', (req, res) => {
        const secret = speakeasy.generateSecret({ length: 20, name: "GPS Tracking Admin" });
        QRCode.toDataURL(secret.otpauth_url, (err, data_url) => {
            if (err) return res.status(500).json({ error: "QR Gen Error" });
            res.json({ secret: secret.base32, qrUrl: data_url });
        });
    });

    // 2. Verify & Create Super Admin
    app.post('/api/admin/setup/verify', (req, res) => {
        const { email, password, token, secret } = req.body;

        // Verify One-Time Token
        const verified = speakeasy.totp.verify({
            secret: secret,
            encoding: 'base32',
            token: token
        });

        if (!verified) return res.status(400).json({ error: "Invalid Code" });

        // Save Super Admin
        // Note: Password hashing omitted for brevity/speed as per constraints, but should use bcrypt/argon2
        // Using simple text/check for now or placeholder hash
        const passwordHash = password; // In real world: bcrypt.hashSync(password, 10);

        const phone = "0634969565"; // Fixed Super Admin Phone

        db.run(`INSERT INTO admins (phone_number, password_hash, role, email, totp_secret) 
                VALUES (?, ?, 'SUPER_ADMIN', ?, ?)
                ON CONFLICT(phone_number) DO UPDATE SET 
                password_hash=excluded.password_hash,
                email=excluded.email,
                totp_secret=excluded.totp_secret`,
            [phone, passwordHash, email, secret], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
    });

    // 3. Admin Login
    app.post('/api/auth/login', (req, res) => {
        const { phone, password, totp } = req.body;

        if (!phone || !password) {
            return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
        }

        // Find admin by phone
        db.get(`SELECT * FROM admins WHERE phone_number = ?`, [phone], (err, admin) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!admin) return res.status(401).json({ error: 'ไม่พบผู้ใช้งาน' });

            // Check password (in production, use bcrypt.compare)
            if (admin.password_hash !== password) {
                return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
            }

            // If SUPER_ADMIN, require TOTP
            if (admin.role === 'SUPER_ADMIN') {
                if (!totp) {
                    return res.status(400).json({ error: 'กรุณากรอกรหัส TOTP', needsTOTP: true });
                }

                // Verify TOTP
                const verified = speakeasy.totp.verify({
                    secret: admin.totp_secret,
                    encoding: 'base32',
                    token: totp,
                    window: 2 // Allow 1 minute tolerance
                });

                if (!verified) {
                    return res.status(401).json({ error: 'รหัส TOTP ไม่ถูกต้อง' });
                }
            }

            // Success - Set session cookie
            req.session = req.session || {};
            req.session.adminId = admin.id;
            req.session.role = admin.role;

            res.json({
                success: true,
                role: admin.role,
                phone: admin.phone_number
            });
        });
    });

    // 4. Logout
    app.post('/api/auth/logout', (req, res) => {
        req.session = null;
        res.json({ success: true });
    });

    // 5. Get All Admins (Super Admin Only)
    app.get('/api/admin/users', (req, res) => {
        // TODO: Add auth middleware to check if user is SUPER_ADMIN
        db.all(`SELECT id, phone_number, role, email, created_at FROM admins ORDER BY created_at DESC`, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
    });

    // 6. Add New Admin (Super Admin Only)
    app.post('/api/admin/users', (req, res) => {
        const { phone, password, role = 'ADMIN' } = req.body;
        if (!phone || !password) return res.status(400).json({ error: 'Missing required fields' });

        // Hash password in production (using bcrypt)
        const passwordHash = password; // INSECURE: should use bcrypt

        db.run(`INSERT INTO admins (phone_number, password_hash, role) VALUES (?, ?, ?)`,
            [phone, passwordHash, role], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, id: this.lastID });
            });
    });

    // 7. Delete Admin (Super Admin Only)
    app.delete('/api/admin/users/:id', (req, res) => {
        const { id } = req.params;
        db.run(`DELETE FROM admins WHERE id = ? AND role != 'SUPER_ADMIN'`, [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Admin not found or cannot delete SUPER_ADMIN' });
            res.json({ success: true });
        });
    });

    // 8. Get All Credentials
    app.get('/api/admin/credentials', (req, res) => {
        db.all(`SELECT id, device_id, code, is_registered, created_at FROM credentials ORDER BY created_at DESC`, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
    });

    // 9. Generate Credential for Device
    app.post('/api/admin/credential', (req, res) => {
        const { device_id } = req.body;
        if (!device_id) return res.status(400).json({ error: 'device_id required' });

        // Generate random 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        db.run(`INSERT INTO credentials (device_id, code, is_registered) VALUES (?, ?, 0)`,
            [device_id, code], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, code, device_id });
            });
    });

    // ... (rest of routes)

    // ========== HANDLE INCOMING DATA ==========
    function handleData(data) {
        const { deviceId, lat, lng, status, rawContent, timestamp } = data;

        // Validate
        // Validate format (Must confirm it's a MAC Address or at least has colons)
        if (!deviceId || !deviceId.includes(':') || lat === null || lng === null) {
            console.log(`[Skipping] Invalid Data: ${deviceId}`);
            return;
        }

        const eventTime = timestamp ? timestamp.toISOString() : new Date().toISOString();

        // 1. Insert into LOGS (History)
        const stmt = db.prepare("INSERT INTO logs (device_id, lat, lng, status, raw_data, timestamp) VALUES (?, ?, ?, ?, ?, ?)");
        stmt.run(deviceId, lat, lng, status, rawContent, eventTime);
        stmt.finalize();

        // 2. Update CURRENT STATE (Latest)
        db.run(`INSERT INTO devices (device_id, lat, lng, status, last_update) 
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(device_id) DO UPDATE SET 
            lat=excluded.lat, 
            lng=excluded.lng, 
            status=excluded.status, 
            last_update=excluded.last_update`,
            [deviceId, lat, lng, status, eventTime], (err) => {
                if (err) console.error(err.message);
            });

        // 3. Check Geofences
        checkGeofences(deviceId, lat, lng);

        // 4. Emit to Frontend
        io.emit('device_update', {
            device_id: deviceId,
            lat,
            lng,
            status,
            raw_data: rawContent,
            last_update: eventTime
        });
    }

    // ========== GEOFENCE LOGIC ==========
    function checkGeofences(deviceId, lat, lng) {
        db.all("SELECT * FROM geofences WHERE device_id = ?", [deviceId], (err, fences) => {
            if (err || !fences) return;

            fences.forEach(fence => {
                const distance = getDistanceFromLatLonInKm(lat, lng, fence.lat, fence.lng) * 1000; // Meters
                const isInside = distance <= fence.radius ? 1 : 0;

                if (isInside !== fence.is_inside) {
                    // Status Changed
                    const type = isInside ? 'ENTER' : 'EXIT';
                    console.log(`🚧 Geofence Alert: ${deviceId} ${type} ${fence.name}`);

                    // Update DB
                    db.run("UPDATE geofences SET is_inside = ? WHERE id = ?", [isInside, fence.id]);

                    // Emit Alert
                    io.emit('geofence_alert', {
                        device_id: deviceId,
                        fence_name: fence.name,
                        type: type,
                        timestamp: new Date().toISOString()
                    });
                }
            });
        });
    }

    // Helper: Haversine Formula
    function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of the earth in km
        const dLat = deg2rad(lat2 - lat1);
        const dLon = deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c; // Distance in km
        return d;
    }

    function deg2rad(deg) {
        return deg * (Math.PI / 180);
    }

    // ========== API ENDPOINTS ==========

    // GET Device Data (for Map page)
    app.get('/api/track', (req, res) => {
        const deviceId = req.query.id;
        if (!deviceId) return res.status(400).json({ error: 'Device ID required' });

        db.get(`SELECT * FROM devices WHERE device_id = ?`, [deviceId], (err, device) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!device) return res.status(404).json({ error: 'Device not found' });

            res.json({
                device_id: device.device_id,
                lat: device.lat,
                lng: device.lng,
                status: device.status,
                owner_name: device.owner_name || '',
                license_plate: device.license_plate || '',
                sos_numbers: JSON.parse(device.sos_numbers || '[]'),
                last_update: device.last_update
            });
        });
    });

    // GET Device by ID (alternative endpoint)
    app.get('/api/device/:id', (req, res) => {
        const deviceId = req.params.id;

        db.get(`SELECT * FROM devices WHERE device_id = ?`, [deviceId], (err, device) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!device) return res.status(404).json({ error: 'Device not found' });

            res.json({
                device_id: device.device_id,
                lat: device.lat,
                lng: device.lng,
                status: device.status,
                owner_name: device.owner_name || '',
                license_plate: device.license_plate || '',
                sos_numbers: JSON.parse(device.sos_numbers || '[]'),
                last_update: device.last_update
            });
        });
    });

    // POST Save SOS Numbers
    app.post('/api/device/:id/sos', (req, res) => {
        const deviceId = req.params.id;
        const { numbers } = req.body;

        if (!Array.isArray(numbers)) {
            return res.status(400).json({ error: 'numbers must be an array' });
        }

        const sosJson = JSON.stringify(numbers);

        db.run(`UPDATE devices SET sos_numbers = ? WHERE device_id = ?`, [sosJson, deviceId], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Device not found' });
            res.json({ success: true });
        });
    });

    app.post('/api/track', (req, res) => {
        let deviceId, lat, lng, stats, rawContent;
        const content = req.body;
        // console.log('Received:', content); // Debug logging

        rawContent = typeof content === 'string' ? content : JSON.stringify(content);

        if (typeof content === 'string') {
            const parts = content.split(/[, ]+/).filter(p => p.trim() !== '');
            // Expected ESP32 Format: MAC,STATUS LAT, LNG, TIMESTAMP
            // Example: "ff:ff:50:00:20:73,1 13.7563, 100.5018, 1715000000"
            // Parts: [MAC, STATUS, LAT, LNG, TIMESTAMP]

            if (parts.length >= 4) {
                deviceId = parts[0];
                const rawStatus = parts[1];
                lat = parseFloat(parts[2]);
                lng = parseFloat(parts[3]);

                // Map status
                const statusMap = { '1': 'STOLEN', '2': 'CRASH', '3': 'NORMAL', '0': 'UNKNOWN' };
                stats = statusMap[rawStatus] || rawStatus; // Use raw if not in map
            }
        } else {
            deviceId = content.deviceId;
            lat = content.lat;
            lng = content.lng;
            stats = content.status;
        }

        if (!deviceId) return res.status(400).send('Invalid');

        // Use handleData to process
        // Note: Logic duplicated slightly, sticking to direct DB for now as per original code for this route
        // But better to unify. For now, matching original behavior but cleaning up variables.

        const stmt = db.prepare("INSERT INTO logs (device_id, lat, lng, status, raw_data) VALUES (?, ?, ?, ?, ?)");
        stmt.run(deviceId, lat, lng, stats || 'UNKNOWN', rawContent);
        stmt.finalize();

        db.run(`INSERT INTO devices (device_id, lat, lng, status, last_update) 
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(device_id) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, status=?, last_update=CURRENT_TIMESTAMP`,
            [stats || 'active']);

        io.emit('device_update', {
            device_id: deviceId,
            lat,
            lng,
            status: stats || 'Active',
            raw: rawContent,
            last_update: new Date().toISOString()
        });

        res.send('OK');
    });

    app.get('/api/devices', (req, res) => {
        // Get all devices with complete information including owner and credentials
        const query = `
            SELECT 
                d.*,
                v.driver_name as owner,
                v.plate_number,
                v.emergency_phone,
                c.code as credential_code,
                c.is_registered
            FROM devices d
            LEFT JOIN vehicles v ON d.device_id = v.device_id
            LEFT JOIN credentials c ON d.device_id = c.device_id
            ORDER BY 
                CASE WHEN v.driver_name IS NULL THEN 1 ELSE 0 END,
                v.driver_name ASC,
                d.device_id ASC
        `;

        db.all(query, [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            // Parse sos_numbers JSON for each device
            const devices = rows.map(row => ({
                ...row,
                sos_numbers: row.sos_numbers ? JSON.parse(row.sos_numbers) : []
            }));

            res.json(devices);
        });
    });

    app.get('/api/history/:id', (req, res) => {
        const limit = req.query.limit || 100;
        db.all("SELECT * FROM logs WHERE device_id = ? ORDER BY timestamp DESC LIMIT ?", [req.params.id, limit], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    // ========== SOCKET.IO ==========
    io.on('connection', (socket) => {
        console.log('🔗 Client connected:', socket.id);

        socket.on('message', (msg) => {
            // Handle raw socket message from devices
            // Format: "MAC,STATUS LAT, LNG, TIMESTAMP"
            // Example: "AA:BB:CC:DD:EE:FF,1 14.356857, 100.610772, 1234567890"

            let deviceId = "unknown";
            let lat = null;
            let lng = null;
            let status = "0";
            let timestamp = null;
            let rawContent = typeof msg === 'string' ? msg.trim() : JSON.stringify(msg);

            if (typeof msg === 'string') {
                const trimmed = msg.trim();

                // Try JSON first
                if (trimmed.startsWith('{')) {
                    try {
                        const json = JSON.parse(trimmed);
                        deviceId = json.deviceId || json.device_id || json.mac || "unknown";
                        lat = parseFloat(json.lat || json.latitude) || null;
                        lng = parseFloat(json.lng || json.longitude) || null;
                        status = String(json.status || json.type || "0");
                        timestamp = json.timestamp ? new Date(json.timestamp * 1000) : null;
                    } catch (e) { }
                } else {
                    // Parse: "MAC,STATUS LAT, LNG, TIMESTAMP"
                    const parts = trimmed.split(/[, ]+/).filter(p => p.trim() !== '');

                    if (parts.length >= 4) {
                        deviceId = parts[0]; // MAC Address
                        status = parts[1];   // Status code
                        lat = parseFloat(parts[2]) || null;
                        lng = parseFloat(parts[3]) || null;

                        // TIMESTAMP (parts[4]) is Unix Timestamp in SECONDS
                        if (parts.length >= 5) {
                            const ts = parseInt(parts[4]);
                            if (!isNaN(ts) && ts > 0) {
                                timestamp = new Date(ts * 1000); // Convert to MS
                            }
                        }
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

            handleData({ deviceId, lat, lng, status: statusLabel, rawContent, timestamp });
        });

        socket.on('disconnect', () => {
            console.log('❌ Client disconnected:', socket.id);
        });
    });

    // 🚦 Update device status manually (Auto-Safe or Admin)
    app.post('/api/device/:id/status', (req, res) => {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: "Status required" });

        const eventTime = new Date().toISOString();

        // Get current lat/lng to emit
        db.get("SELECT lat, lng FROM devices WHERE device_id = ?", [req.params.id], (err, row) => {
            const lat = row ? row.lat : 0;
            const lng = row ? row.lng : 0;

            db.run("UPDATE devices SET status = ?, last_update = ? WHERE device_id = ?",
                [status, eventTime, req.params.id], function (err) {
                    if (err) return res.status(500).json({ error: err.message });

                    // Log it
                    db.run("INSERT INTO logs (device_id, lat, lng, status, raw_data, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                        [req.params.id, lat, lng, status, `Manual Update: ${status}`, eventTime]);

                    io.emit('device_update', {
                        device_id: req.params.id,
                        lat, lng, status,
                        last_update: eventTime,
                        manual_update: true
                    });
                    res.json({ success: true });
                });
        });
    });

    // ========== USER APIs (Missing Blocks) ==========

    // 1. Login (Check if user exists)
    app.post('/api/user/login', (req, res) => {
        const { phone_number } = req.body;
        if (!phone_number) return res.status(400).json({ error: "Phone number required" });

        db.get("SELECT * FROM registrations WHERE user_token = ?", [phone_number], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            // If user exists return exists: true
            res.json({ exists: !!row });
        });
    });

    // 2. Register (Bind Credential to User)
    app.post('/api/user/register', (req, res) => {
        const { code, plate_number, driver_name, phone_number } = req.body;
        if (!code || !phone_number) return res.status(400).json({ error: "Missing fields" });

        // Check credential
        db.get("SELECT * FROM credentials WHERE code = ?", [code], (err, cred) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!cred) return res.status(404).json({ error: "ไม่รหัส Credential นี้ในราบบ" });
            if (cred.is_registered) return res.status(400).json({ error: "รหัสนี้ถูกใช้งานไปแล้ว" });

            const deviceId = cred.device_id;

            // Start Transaction-like flow
            // A. Mark Credential Used
            db.run("UPDATE credentials SET is_registered = 1 WHERE id = ?", [cred.id], (err) => {
                if (err) return res.status(500).json({ error: err.message });

                // B. Add to Vehicles
                db.run(`INSERT INTO vehicles (credential_code, device_id, plate_number, driver_name, user_token) 
                        VALUES (?, ?, ?, ?, ?)`,
                    [code, deviceId, plate_number, driver_name, phone_number], (err) => {

                        // C. Update Registrations (User's device list)
                        db.get("SELECT devices FROM registrations WHERE user_token = ?", [phone_number], (err, row) => {
                            let devices = [];
                            if (row && row.devices) {
                                try { devices = JSON.parse(row.devices); } catch (e) { }
                            }
                            if (!devices.includes(deviceId)) devices.push(deviceId);

                            if (row) {
                                db.run("UPDATE registrations SET devices = ? WHERE user_token = ?", [JSON.stringify(devices), phone_number]);
                            } else {
                                db.run("INSERT INTO registrations (user_token, devices) VALUES (?, ?)", [phone_number, JSON.stringify(devices)]);
                            }

                            // D. Update Device Info (Owner)
                            db.run("UPDATE devices SET owner_name = ?, license_plate = ? WHERE device_id = ?",
                                [driver_name, plate_number, deviceId]);

                            res.json({ success: true, device_id: deviceId });
                        });
                    });
            });
        });
    });

    // 2.5. ADD CAR FOR EXISTING USER
    app.post('/api/user/add-car', (req, res) => {
        const { phone_number, code, plate_number } = req.body;

        if (!code || !phone_number || !plate_number) {
            return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
        }

        // Get user's existing driver name from their first vehicle
        db.get(`SELECT driver_name FROM vehicles WHERE user_token = ? LIMIT 1`, [phone_number], (err, existingVehicle) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!existingVehicle) {
                return res.status(404).json({ error: "ไม่พบข้อมูลผู้ใช้ กรุณาลงทะเบียนก่อน" });
            }

            const driver_name = existingVehicle.driver_name;

            // Check credential
            db.get("SELECT * FROM credentials WHERE code = ?", [code], (err, cred) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!cred) return res.status(404).json({ error: "ไม่พบรหัส Credential นี้ในระบบ" });
                if (cred.is_registered) return res.status(400).json({ error: "รหัสนี้ถูกใช้งานไปแล้ว" });

                const deviceId = cred.device_id;

                // Mark credential as used
                db.run("UPDATE credentials SET is_registered = 1 WHERE id = ?", [cred.id], (err) => {
                    if (err) return res.status(500).json({ error: err.message });

                    // Add to vehicles
                    db.run(`INSERT INTO vehicles (credential_code, device_id, plate_number, driver_name, user_token) 
                            VALUES (?, ?, ?, ?, ?)`,
                        [code, deviceId, plate_number, driver_name, phone_number], (err) => {
                            if (err) return res.status(500).json({ error: err.message });

                            // Update registrations
                            db.get("SELECT devices FROM registrations WHERE user_token = ?", [phone_number], (err, row) => {
                                let devices = [];
                                if (row && row.devices) {
                                    try { devices = JSON.parse(row.devices); } catch (e) { }
                                }
                                if (!devices.includes(deviceId)) devices.push(deviceId);

                                db.run("UPDATE registrations SET devices = ? WHERE user_token = ?",
                                    [JSON.stringify(devices), phone_number], (err) => {
                                        // Update device info
                                        db.run("UPDATE devices SET owner_name = ?, license_plate = ? WHERE device_id = ?",
                                            [driver_name, plate_number, deviceId]);

                                        res.json({ success: true, device_id: deviceId });
                                    });
                            });
                        });
                });
            });
        });
    });

    // 3. Get User Vehicles
    // 3. Get User Vehicles
    app.get('/api/user/vehicles', (req, res) => {
        const token = req.query.token;
        if (!token) return res.status(400).json({ error: "Token required" });

        db.all("SELECT * FROM vehicles WHERE user_token = ?", [token], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows); // Returns array of vehicles
        });
    });

    // Handle Next.js requests (Express 5 fix)
    app.all(/(.*)/, (req, res) => {
        return handle(req, res);
    });

    server.listen(PORT, (err) => {
        if (err) throw err;
        console.log(`> Ready on http://localhost:${PORT}`);
    });
});
