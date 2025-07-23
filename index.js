// index.js
const express = require('express');
const { Pool } = require('pg'); // Import Pool from pg

const app = express();
const PORT = process.env.PORT || 3000;

// --- Database Configuration ---
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false // Required for Heroku Postgres connections from Node.js
  }
});

// Variable to track database connection status for display on screen
let dbConnectionStatus = 'Connecting...';

// Test the database connection when the app starts
pool.connect()
  .then(client => {
    console.log('Connected to PostgreSQL database!');
    dbConnectionStatus = 'Connected'; // Update status on success
    client.release(); // Release the client back to the pool immediately after testing connection
  })
  .catch(err => {
    console.error('Error connecting to PostgreSQL database:', err.stack);
    dbConnectionStatus = 'Failed to Connect'; // Update status on failure
  });

// --- Express Routes ---

// Updated root route to show database connection status
app.get('/', (req, res) => {
  res.send(`<h1>Hello from Heroku!</h1><p>This is my Node.js app.</p><p>Database Status: <strong>${dbConnectionStatus}</strong></p>`);
});

// NEW: Route to test database connection and fetch data
app.get('/db-test', async (req, res) => {
  try {
    const client = await pool.connect();
    // Example query: Fetch current timestamp from the database
    const result = await client.query('SELECT NOW() as current_time');
    client.release(); // Release the client back to the pool

    res.json({
      message: 'Database connection successful!',
      currentTime: result.rows[0].current_time
    });
  } catch (err) {
    console.error('Error executing query:', err.stack);
    // Send a more informative error for the user to see
    res.status(500).json({
        message: 'Error connecting to or querying the database.',
        error: err.message // Send a simplified error message
    });
  }
});

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// --- Graceful Shutdown (Important for database connections) ---
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  pool.end(() => { // Close the database connection pool
    console.log('Database pool has ended.');
    process.exit(0);
  });
});