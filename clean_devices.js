const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tracker.db');

db.serialize(() => {
    console.log("--- Cleaning Garbage Devices ---");
    // Delete where device_id does not look like a MAC address (no colons)
    db.run("DELETE FROM devices WHERE device_id NOT LIKE '%:%'", function (err) {
        if (err) console.error(err);
        else console.log(`Deleted ${this.changes} bad records.`);
    });
});

db.close();
