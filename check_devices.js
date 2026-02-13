const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tracker.db');

db.serialize(() => {
    console.log("--- Checking Devices Table ---");
    db.all("SELECT device_id, status FROM devices", (err, rows) => {
        if (err) console.error(err);
        else {
            console.log("Total Devices:", rows.length);
            rows.forEach(r => console.log(`ID: ${r.device_id} | Status: ${r.status}`));
        }
        db.close();
    });
});
