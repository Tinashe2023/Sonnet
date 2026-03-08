require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { query, pool } = require('./db');

async function checkDb() {
    try {
        const result = await query(`SELECT id, type, sender_id, recipient_id, room_id, text, status FROM messages ORDER BY timestamp DESC LIMIT 20`);
        console.log("Recent messages:");
        result.rows.forEach(r => console.log(r));

        const unreadCountGrouped = await query(`SELECT type, status, count(*) FROM messages GROUP BY type, status`);
        console.log("\nCount grouped:");
        console.log(unreadCountGrouped.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkDb();
