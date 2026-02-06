const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const next = require('next');

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

    console.log(`📡 [${deviceId}] Status: ${status}, Lat: ${lat}, Lng: ${lng}`);
    return { success: true };
}

// ========== START SERVER ==========
nextApp.prepare().then(() => {

    // 📡 Receive data from ESP32
    app.post('/api/track', (req, res) => {
        console.log("📥 HTTP Recv:", req.body);
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

    // 🗑️ Clear all data
    app.post('/api/clear', (req, res) => {
        db.serialize(() => {
            db.run("DELETE FROM logs");
            db.run("DELETE FROM devices");
        });
        io.emit('clear_data');
        console.log("🗑️ Database cleared");
        res.json({ success: true });
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
