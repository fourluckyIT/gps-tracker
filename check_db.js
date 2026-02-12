const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('tracker.db');

db.serialize(() => {
    console.log("--- Geofences ---");
    db.each("SELECT * FROM geofences", (err, row) => {
        console.log(row);
    });

    console.log("--- Devices ---");
    db.each("SELECT * FROM devices WHERE device_id IN ('94:77:FE:1A:81:BD', 'e2:80:00:54:53:48')", (err, row) => {
        console.log(row);
    });
});
