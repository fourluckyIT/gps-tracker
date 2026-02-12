const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tracker.db');

db.serialize(() => {
    console.log("--- Cleaning up Invalid Logs (Status is NULL) ---");

    // Check count before
    db.get("SELECT COUNT(*) as count FROM logs WHERE status IS NULL", (err, row) => {
        if (err) console.error(err);
        else console.log(`Found ${row.count} invalid records.`);

        // Delete
        db.run("DELETE FROM logs WHERE status IS NULL", function (err) {
            if (err) {
                console.error(err);
            } else {
                console.log(`Deleted ${this.changes} records.`);
                console.log("--- Cleanup Complete ---");
            }
        });
    });
});

db.close();
