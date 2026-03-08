const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
    console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err);
});

// Helper function for running queries
async function query(text, params) {
    const result = await pool.query(text, params);
    return result;
}

module.exports = { pool, query };
