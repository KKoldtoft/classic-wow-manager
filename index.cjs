// index.cjs
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { Pool } = require('pg');
const path = require('path'); // Ensure path module is imported

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

let dbConnectionStatus = 'Connecting...';

pool.connect()
  .then(client => {
    console.log('Connected to PostgreSQL database!');
    dbConnectionStatus = 'Connected';
    client.release();
  })
  .catch(err => {
    console.error('Error connecting to PostgreSQL database:', err.stack);
    dbConnectionStatus = 'Failed to Connect';
  });

// --- Session Configuration ---
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production'
  }
}));

// --- Passport.js Configuration ---
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: `${process.env.APP_BASE_URL}/auth/discord/callback`,
    scope: ['identify', 'email']
},
(accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

// --- Express Routes ---

// Critical: Place express.static as the FIRST middleware to handle static files.
// This ensures /style.css and /script.js are served correctly without falling through to other routes.
app.use(express.static(path.join(__dirname, 'public')));


// All API and authentication routes should come AFTER express.static
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
  passport.authenticate('discord', {
    failureRedirect: '/'
  }),
  (req, res) => {
    res.redirect('/');
  }
);

app.get('/auth/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

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

app.get('/api/db-status', (req, res) => {
  res.json({ status: dbConnectionStatus });
});

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

// Explicitly serve index.html for the root path.
// This should be the last app.get() route related to serving HTML directly.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all route to serve your main index.html file for all other frontend routes.
// This MUST be the LAST route definition in your application.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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