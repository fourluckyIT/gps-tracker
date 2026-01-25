const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const PORT = 80;

app.use(cors());
app.use(bodyParser.text({ type: 'text/*' })); 
app.use(bodyParser.json());

// 🔥 แก้ตรงนี้: ให้มันเติม .html อัตโนมัติ 🔥
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const db = new sqlite3.Database('tracker.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS devices (device_id TEXT PRIMARY KEY, lat REAL, lng REAL, status TEXT, last_update DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT, lat REAL, lng REAL, raw_data TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
});

app.post('/api/track', (req, res) => {
    let deviceId, lat, lng, stats, rawContent;
    const content = req.body;
    rawContent = typeof content === 'string' ? content : JSON.stringify(content);

    if (typeof content === 'string') {
        const parts = content.split(',');
        if (parts.length >= 5) {
            deviceId = parts[0]; stats = parts[2]; lat = parseFloat(parts[3]); lng = parseFloat(parts[4]);
        } else if (parts.length >= 3) {
            deviceId = parts[0]; lat = parseFloat(parts[1]); lng = parseFloat(parts[2]);
        }
    } else { deviceId = content.deviceId; lat = content.lat; lng = content.lng; }
    
    if (!deviceId) return res.status(400).send('Invalid');

    const stmt = db.prepare("INSERT INTO logs (device_id, lat, lng, raw_data) VALUES (?, ?, ?, ?)");
    stmt.run(deviceId, lat, lng, rawContent);
    stmt.finalize();

    db.run(`INSERT INTO devices (device_id, lat, lng, status, last_update) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(device_id) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, status=?, last_update=CURRENT_TIMESTAMP`, [stats || 'active']);
    
    io.emit('device_update', {
        device_id: deviceId, lat, lng, status: stats || 'Active', 
        raw: rawContent, last_update: new Date().toISOString()
    });
    res.send('OK');
});

app.get('/api/devices', (req, res) => { db.all("SELECT * FROM devices", [], (err, rows) => res.json(rows)); });
app.get('/api/history/:id', (req, res) => { db.all("SELECT * FROM logs WHERE device_id = ? ORDER BY timestamp DESC LIMIT 100", [req.params.id], (err, rows) => res.json(rows)); });
app.use((req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
