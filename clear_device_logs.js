const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tracker.db');

const DEVICE_ID = '0B:72:A0:58:53:19';

db.serialize(() => {
    console.log(`--- Clearing Logs for Device ${DEVICE_ID} ---`);

    db.run("DELETE FROM logs WHERE device_id = ?", [DEVICE_ID], function (err) {
        if (err) {
            console.error(err);
        } else {
            console.log(`Deleted ${this.changes} records.`);
        }
        db.close();
    });
});
