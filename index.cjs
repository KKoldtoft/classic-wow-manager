// index.cjs
require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { Pool } = require('pg');
const path = require('path'); // Node.js path module for serving static files

const app = express();
const PORT = process.env.PORT || 3000;

// --- Database Configuration ---
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

let dbConnectionStatus = 'Connecting...'; // Initial status for display

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

// --- Session Configuration ---
app.use(session({
  secret: process.env.SESSION_SECRET, // Use a strong, random string from .env
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 60 * 60 * 1000, // 1 hour
    secure: process.env.NODE_ENV === 'production' // Use secure cookies in production (HTTPS)
  }
}));

// --- Passport.js Configuration ---
app.use(passport.initialize());
app.use(passport.session());

// Passport serialization and deserialization
// This determines what user data is stored in the session
passport.serializeUser((user, done) => {
  done(null, user); // Store the entire user object in the session
});

passport.deserializeUser((obj, done) => {
  done(null, obj); // Retrieve the user object from the session
});

// Discord OAuth2 Strategy
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: `${process.env.APP_BASE_URL}/auth/discord/callback`,
    scope: ['identify', 'email'] // Request user ID, username, avatar, and email
},
(accessToken, refreshToken, profile, done) => {
    // This function is called when a user successfully authenticates with Discord.
    // In a real app, you would save/update user data in your database here.
    // For now, we'll just pass the Discord profile directly.
    return done(null, profile);
}));

// --- Express Routes ---

// Serve static files from the 'public' directory
// This line MUST be before any routes that might conflict with static file names.
app.use(express.static('public'));

// Discord OAuth routes
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
  passport.authenticate('discord', {
    failureRedirect: '/'
  }),
  (req, res) => {
    res.redirect('/');
  }
);

// Logout route
app.get('/auth/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

// Endpoint to get user data (for frontend)
app.get('/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      loggedIn: true,
      id: req.user.id,
      username: req.user.username,
      discriminator: req.user.discriminator,
      avatar: req.user.avatar,
      email: req.user.email
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// Route to get database connection status (for frontend to update dynamically if needed)
app.get('/api/db-status', (req, res) => {
  res.json({ status: dbConnectionStatus });
});

// Existing route to test database connection and fetch data
app.get('/db-test', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    client.release();

    res.json({
      message: 'Database connection successful!',
      currentTime: result.rows[0].current_time
    });
  } catch (err) {
    console.error('Error executing query:', err.stack);
    res.status(500).json({
        message: 'Error connecting to or querying the database.',
        error: err.message
    });
  }
});

// NEW: Explicitly serve index.html for the root path
// This helps ensure the main page is always served correctly.
app.get('/', (req, res) => {
  res.sendFile(path.resolve('public', 'index.html'));
});


// Catch-all route to serve your main index.html file for all other frontend routes.
// This MUST be the LAST route definition in your application, after all other API/specific routes.
app.get('*', (req, res) => {
  res.sendFile(path.resolve('public', 'index.html'));
});


// --- Server Start ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// --- Graceful Shutdown ---
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  pool.end(() => {
    console.log('Database pool has ended.');
    process.exit(0);
  });
});