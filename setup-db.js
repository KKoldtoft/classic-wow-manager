// setup-db.js
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

const tsvFilePath = path.join(__dirname, 'players.tsv');

async function setupDatabase() {
  const client = await pool.connect();
  try {
    console.log('Connected to the database.');

    // Step 1: Create the players table if it doesn't exist
    // Using a composite primary key to ensure unique player-character combinations.
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        discord_id VARCHAR(30) NOT NULL,
        character_name VARCHAR(100) NOT NULL,
        class VARCHAR(50) NOT NULL,
        PRIMARY KEY (discord_id, character_name)
      );
    `);
    console.log('Table "players" is ready.');

    // Step 2: Create an index on discord_id for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_players_discord_id ON players (discord_id);
    `);
    console.log('Index on "discord_id" is ready.');

    // Step 3: Read and parse the TSV file
    const fileContent = fs.readFileSync(tsvFilePath, 'utf8');
    const rows = fileContent.split('\n');
    console.log(`Found ${rows.length} rows in players.tsv.`);

    // Step 4: Insert data into the database
    let insertedCount = 0;
    // Use a transaction for bulk inserts
    await client.query('BEGIN');

    for (const row of rows) {
      if (!row) continue; // Skip empty rows

      const columns = row.split('\t');
      // Ensure the row has the expected format
      if (columns.length === 3 && columns[0].trim() !== '') {
        const [discord_id, character_name, character_class] = columns;

        // Use ON CONFLICT to avoid errors if a player-character combo already exists.
        const result = await client.query({
          text: `
            INSERT INTO players (discord_id, character_name, class)
            VALUES ($1, $2, $3)
            ON CONFLICT (discord_id, character_name) DO NOTHING;
          `,
          values: [discord_id.trim(), character_name.trim(), character_class.trim()],
        });

        if (result.rowCount > 0) {
            insertedCount++;
        }
      }
    }

    await client.query('COMMIT');
    console.log(`Successfully inserted ${insertedCount} new players.`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('An error occurred during database setup:', err.stack);
  } finally {
    client.release();
    console.log('Database connection released.');
    pool.end();
  }
}

setupDatabase(); 