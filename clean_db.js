const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tracker.db');

db.serialize(() => {
    console.log("Cleaning database...");

    // Clean tables
    db.run("DELETE FROM devices", (err) => {
        if (err) console.error("Error cleaning devices:", err);
        else console.log("Devices table cleaned.");
    });

    db.run("DELETE FROM logs", (err) => {
        if (err) console.error("Error cleaning logs:", err);
        else console.log("Logs table cleaned.");
    });

    db.run("DELETE FROM geofences", (err) => {
        if (err) console.error("Error cleaning geofences:", err);
        else console.log("Geofences table cleaned.");
    });

    db.run("VACUUM", (err) => {
        if (err) console.error("Error vacuuming:", err);
        else console.log("Database vacuumed.");
    });
});

db.close();
