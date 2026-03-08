const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://postgres:Kairostribe2025@localhost:5432/sonnet_chat',
});

async function query(text, params) {
    const result = await pool.query(text, params);
    return result;
}

async function test() {
    try {
        const res = await query(`
            SELECT m.id AS "messageId", m.room_id AS "roomId", m.sender_id AS "senderId",
                   m.recipient_id AS "recipientId", m.type, m.kind, m.text, m.status, m.timestamp, m.reactions, m.is_edited AS "isEdited",
                   u.username AS "senderName", u.profile_pic AS "senderProfile",
                   fm.filename, fm.path, fm.mimetype, fm.size AS "fileSize",
                   rm.id AS "replyToId", rm.text AS "replyToText", ru.username AS "replyToSenderName", rm.kind AS "replyToKind"
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.id
            LEFT JOIN file_metadata fm ON fm.message_id = m.id
            LEFT JOIN messages rm ON m.reply_to_id = rm.id
            LEFT JOIN users ru ON rm.sender_id = ru.id
            WHERE m.room_id = $1 AND m.type = 'group'
            ORDER BY m.timestamp ASC
            LIMIT 50
        `, ['public']);
        console.log("Success, got", res.rows.length, "rows");
    } catch (e) {
        console.error("Error:", e.message);
    }
    process.exit();
}

test();
