const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { query, pool } = require('./db');

async function migrate() {
    try {
        console.log("Adding is_edited column if not exists...");
        await query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;');
        console.log("Migration successful.");
    } catch (e) {
        console.error("Migration failed:", e.message);
    } finally {
        pool.end();
    }
}

migrate();
