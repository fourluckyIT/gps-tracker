const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tracker.db');

db.serialize(() => {
    console.log("--- Latest 20 Log Records ---");
    db.each("SELECT * FROM logs ORDER BY id DESC LIMIT 5", (err, row) => {
        if (err) {
            console.error(err);
        } else {
            console.log(row);
        }
    });
});

db.close();
