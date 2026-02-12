const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tracker.db');

db.serialize(() => {
    console.log("--- Checking for Duplicates in Logs ---");

    // Check for exact duplicates (device_id + timestamp)
    const query = `
        SELECT device_id, timestamp, COUNT(*) as count 
        FROM logs 
        GROUP BY device_id, timestamp 
        HAVING count > 1
        ORDER BY count DESC
        LIMIT 20
    `;

    db.all(query, (err, rows) => {
        if (err) {
            console.error(err);
        } else {
            console.log(`Found ${rows.length} timestamps with duplicates:`);
            rows.forEach(row => {
                console.log(`Device: ${row.device_id}, Time: ${row.timestamp}, Count: ${row.count}`);
            });

            if (rows.length > 0) {
                // Show details of the first duplicate group
                console.log("\n--- Example Duplicate Records ---");
                db.all(`SELECT * FROM logs WHERE device_id = ? AND timestamp = ?`, [rows[0].device_id, rows[0].timestamp], (err, details) => {
                    console.log(details);
                });
            } else {
                console.log("\nNo exact duplicates found in DB.");

                // Check if we have logs very close to each other (e.g. within 1 second)
                console.log("\n--- Checking for Near-Duplicates (Same Device, < 1s diff) ---");
                // This is harder in SQL, let's just dump last 20 logs and inspect visually for now sorting by time
                db.all("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 20", (err, logs) => {
                    console.log(logs);
                });
            }
        }
    });
});
// db.close() runs async, might close before inner query. Put closing inside callbacks or let node exit.
