require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { query, pool } = require('./db');

async function testSearchAPI() {
    try {
        const fetch = require('node-fetch'); // actually, node 18+ has native fetch
        const res = await fetch('http://localhost:3004/messages/search?q=d&type=private&senderId=1&recipientId=2'); // test exact query
        const data = await res.text();
        console.log("Response text:", data);

        const q2 = await fetch('http://localhost:3004/messages/search?q=c&type=private&senderId=2&recipientId=3');
        const data2 = await q2.text();
        console.log("Response 2:", data2);
    } catch (e) { console.error(e.message) }

    // Check if the backend is matching correctly
    try {
        const dbRes = await query(`SELECT id, text FROM messages WHERE text ILIKE '%d%' LIMIT 5;`);
        console.log("DB Matches for 'd':", dbRes.rows);
    } catch (e) { }
    pool.end();
}

testSearchAPI();
