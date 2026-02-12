const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

const PORT = 3000;

nextApp.prepare().then(() => {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

    app.use(cors());
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

        // 👑 Admins Table (New)
        db.run(`CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone_number TEXT UNIQUE,
            password_hash TEXT,
            salt TEXT,
            role TEXT DEFAULT 'ADMIN', -- 'SUPER_ADMIN' or 'ADMIN'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    });

    // ========== HANDLE INCOMING DATA ==========
    function handleData(data) {
        const { deviceId, lat, lng, status, rawContent, timestamp } = data;

        // Validate
        if (!deviceId || lat === null || lng === null) return;

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

    app.post('/api/track', (req, res) => {
        let deviceId, lat, lng, stats, rawContent;
        const content = req.body;
        // console.log('Received:', content); // Debug logging

        rawContent = typeof content === 'string' ? content : JSON.stringify(content);

        if (typeof content === 'string') {
            const parts = content.split(',');
            // Format: ID,??,STATUS,LAT,LNG,TIMESTAMP
            if (parts.length >= 5) {
                deviceId = parts[0];
                stats = parts[2];
                lat = parseFloat(parts[3]);
                lng = parseFloat(parts[4]);
            } else if (parts.length >= 3) {
                deviceId = parts[0];
                lat = parseFloat(parts[1]);
                lng = parseFloat(parts[2]);
            }
        } else {
            deviceId = content.deviceId;
            lat = content.lat;
            lng = content.lng;
        }

        if (!deviceId) return res.status(400).send('Invalid');

        // Use handleData to process
        // Note: Logic duplicated slightly, sticking to direct DB for now as per original code for this route
        // But better to unify. For now, matching original behavior but cleaning up variables.

        const stmt = db.prepare("INSERT INTO logs (device_id, lat, lng, raw_data) VALUES (?, ?, ?, ?)");
        stmt.run(deviceId, lat, lng, rawContent);
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
        db.all("SELECT * FROM devices", [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
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

    // Next.js handler
    app.all('*', (req, res) => {
        return handle(req, res);
    });

    server.listen(PORT, (err) => {
        if (err) throw err;
        console.log(`> Ready on http://localhost:${PORT}`);
    });
});
