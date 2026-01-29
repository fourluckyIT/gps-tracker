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

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.text({ type: 'text/*' }));
app.use(bodyParser.json());

// Database Setup
const db = new sqlite3.Database('tracker.db');
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS devices (device_id TEXT PRIMARY KEY, lat REAL, lng REAL, status TEXT, last_update DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT, lat REAL, lng REAL, raw_data TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
});

// 🛠️ Flexible Parser (Handle JSON, CSV, Text, Mixed Spaces)
function parseMessage(content) {
    let deviceId = "unknown_device";
    let lat = null;
    let lng = null;
    let stats = "raw_input";
    let rawContent;

    // 1. Try to parse as JSON
    if (typeof content === 'object' && content !== null) {
        if (content.deviceId || content.device_id || content.id || content.address) deviceId = content.deviceId || content.device_id || content.id || content.address;
        if (content.lat || content.latitude) lat = parseFloat(content.lat || content.latitude);
        if (content.lng || content.longitude || content.lon) lng = parseFloat(content.lng || content.longitude || content.lon);
        if (content.status || content.stats || content.msg || content.type) stats = content.status || content.stats || content.msg || content.type;
        rawContent = JSON.stringify(content);
    }
    else if (typeof content === 'string') {
        const trimmed = content.trim();
        rawContent = trimmed;

        // 2. Try JSON string
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                const json = JSON.parse(trimmed);
                if (json.deviceId || json.device_id || json.id || json.address) deviceId = json.deviceId || json.device_id || json.id || json.address;
                if (json.lat || json.latitude) lat = parseFloat(json.lat || json.latitude);
                if (json.lng || json.longitude || json.lon) lng = parseFloat(json.lng || json.longitude || json.lon);
                if (json.status || json.stats || json.type) stats = json.status || json.stats || json.type;
            } catch (e) { /* invalid json, fall through */ }
        }

        // 3. Robust Split (Comma OR Space) - Handles mixed formats
        const parts = rawContent.split(/[, ]+/).filter(p => p.trim() !== '');

        if (parts.length >= 4) {
            if (!isNaN(parseFloat(parts[2])) && !isNaN(parseFloat(parts[3]))) {
                deviceId = parts[0];
                stats = parts[1];
                lat = parseFloat(parts[2]);
                lng = parseFloat(parts[3]);
            }
            else if (!isNaN(parseFloat(parts[1])) && !isNaN(parseFloat(parts[2]))) {
                deviceId = parts[0];
                lat = parseFloat(parts[1]);
                lng = parseFloat(parts[2]);
            }
        }
        else if (parts.length === 2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
            deviceId = "Anonymous";
            lat = parseFloat(parts[0]);
            lng = parseFloat(parts[1]);
            stats = "location_only";
        }
    }

    if (deviceId === "unknown_device") deviceId = "Anonymous";
    return { deviceId, lat, lng, stats, rawContent };
}

// 📡 Handle Incoming Data (Save & Emit)
function handleData(data) {
    const { deviceId, lat, lng, stats, rawContent } = data;

    const stmt = db.prepare("INSERT INTO logs (device_id, lat, lng, raw_data) VALUES (?, ?, ?, ?)");
    stmt.run(deviceId, lat || 0, lng || 0, rawContent);
    stmt.finalize();

    if (lat !== null && lng !== null) {
        db.run(`INSERT INTO devices (device_id, lat, lng, status, last_update) 
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) 
                ON CONFLICT(device_id) 
                DO UPDATE SET lat=excluded.lat, lng=excluded.lng, status=?, last_update=CURRENT_TIMESTAMP`,
            [deviceId, lat, lng, stats, stats]);
    } else {
        db.run(`INSERT INTO devices (device_id, lat, lng, status, last_update) 
                VALUES (?, 0, 0, ?, CURRENT_TIMESTAMP) 
                ON CONFLICT(device_id) 
                DO UPDATE SET status=?, last_update=CURRENT_TIMESTAMP`,
            [deviceId, stats, stats]);
    }

    io.emit('device_update', { device_id: deviceId, lat, lng, status: stats, raw: rawContent, last_update: new Date() });
    return { success: true };
}

nextApp.prepare().then(() => {
    // 🌍 HTTP Endpoint
    app.post('/api/track', (req, res) => {
        console.log("HTTP Recv:", req.body);
        const parsed = parseMessage(req.body);
        const result = handleData(parsed);
        if (result.success) res.send('OK');
        else res.status(400).send(result.error);
    });

    // Clear Data Endpoint
    app.post('/api/clear', (req, res) => {
        db.serialize(() => {
            db.run("DELETE FROM logs");
            db.run("DELETE FROM devices");
        });
        console.log("Database cleared by user request");
        io.emit('clear_data');
        res.send('Cleared');
    });

    // API: Devices
    app.get('/api/devices', (req, res) => { db.all("SELECT * FROM devices", [], (err, rows) => res.json(rows)); });

    // API: History with Date Filter
    app.get('/api/history/:id', (req, res) => {
        const { date } = req.query; // YYYY-MM-DD
        let sql = "SELECT * FROM logs WHERE device_id = ?";
        let params = [req.params.id];

        if (date) {
            sql += " AND date(timestamp) = ?";
            params.push(date);
        }

        sql += " ORDER BY timestamp DESC LIMIT 500";
        db.all(sql, params, (err, rows) => res.json(rows));
    });

    // 🧹 Auto-Clear Logs
    const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
    setInterval(() => {
        db.run("DELETE FROM logs WHERE timestamp < datetime('now', '-7 days')", (err) => {
            if (!err) console.log("🧹 Auto-cleaned logs older than 7 days");
        });
    }, CLEANUP_INTERVAL);

    // 🔌 WebSocket Endpoint
    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);
        socket.on('message', (msg) => {
            console.log("WS Recv from " + socket.id + ":", msg);
            const parsed = parseMessage(msg);
            handleData(parsed);
        });
    });

    // Let Next.js handle everything else
    app.all(/(.*)/, (req, res) => {
        return handle(req, res);
    });

    server.listen(PORT, (err) => {
        if (err) throw err;
        console.log(`> Ready on http://localhost:${PORT}`);
    });
});
