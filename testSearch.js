require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { query, pool } = require('./db');

async function testSearchAndRead() {
    try {
        console.log("Testing search query for 'c'...");
        const result = await query(
            `SELECT m.id AS "messageId", m.room_id AS "roomId", m.sender_id AS "senderId",
                    m.text, m.timestamp
             FROM messages m
             WHERE m.room_id = $1 AND m.type = 'group' AND m.text ILIKE $2
             ORDER BY m.timestamp DESC
             LIMIT 10`,
            ['public', '%c%']
        );
        console.log("Search result length:", result.rows.length);
        if (result.rows.length > 0) {
            console.log("First search result:", result.rows[0]);
        }

    } catch (e) {
        console.error("Query failed:", e.message);
    } finally {
        pool.end();
    }
}

testSearchAndRead();
