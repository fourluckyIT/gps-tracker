const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tracker.db');

db.serialize(() => {
    console.log("--- Deep Cleaning Logs ---");

    // Check counts
    db.all("SELECT status, count(*) as count FROM logs GROUP BY status", (err, rows) => {
        if (err) console.error(err);
        else console.log("Status distribution:", rows);

        // Delete NULL, empty, or string "null" or UNKNOWN
        const deleteQuery = "DELETE FROM logs WHERE status IS NULL OR status = 'null' OR status = 'NULL' OR status = '' OR status = 'undefined' OR status = 'UNKNOWN'";

        db.run(deleteQuery, function (err) {
            if (err) {
                console.error(err);
            } else {
                console.log(`Deleted ${this.changes} invalid records.`);
            }

            // Verify
            db.all("SELECT status, count(*) as count FROM logs GROUP BY status", (err, rowsAfter) => {
                console.log("Status distribution after clean:", rowsAfter);
                db.close();
            });
        });
    });
});
