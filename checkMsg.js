require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { query, pool } = require('./db');

async function checkAll() {
    try {
        const res = await query(`SELECT room_id, type, text FROM messages`);
        console.log("All messages:", res.rows);
    } catch (e) { }
    pool.end();
}
checkAll();
