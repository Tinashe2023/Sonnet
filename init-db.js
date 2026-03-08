const fs = require('fs');
const path = require('path');
const { query, pool } = require('./db');

async function initDb() {
    try {
        console.log('Reading schema.sql...');
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        console.log('Executing schema.sql on database...');
        // Split by semicolon isn't always safe if there are internal semicolons,
        // but for our simple schema.sql, a single query block should work fine 
        // in 'pg' driver since it supports multiple statements in one query string.
        await query(schemaSql);
        console.log('✅ schema.sql executed successfully.');

        // Also run the manual migration logic that was in migrate.js
        console.log('Running migrate.js additions...');
        await query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;');
        console.log('✅ Additional migrations executed successfully.');

        console.log('Database initialization complete!');
    } catch (err) {
        console.error('❌ Error initializing database:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

initDb();
