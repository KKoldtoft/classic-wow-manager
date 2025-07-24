// index.cjs
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { Pool } = require('pg');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

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
    scope: ['identify', 'email', 'guilds']
},
(accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

// --- Express Routes ---

// Critical: Place express.static as the FIRST middleware to handle static files.
app.use(express.static('public'));

// Route to serve the Roster page for specific event IDs - HIGH PRIORITY
app.get('/event_id/:eventId/roster', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'roster.html'));
});


// All API and authentication routes should come AFTER express.static AND the roster HTML route
app.get('/auth/discord', passport.authenticate('discord');

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
  } catch (error) {
    console.error('Error executing query:', error.stack);
    res.status(500).json({
        message: 'Error connecting to or querying the database.',
        error: error.message
    });
  }
});

app.get('/api/events', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized. Please sign in with Discord.' });
  }

  const raidHelperApiKey = process.env.RAID_HELPER_API_KEY;
  if (!raidHelperApiKey) {
      console.error('RAID_HELPER_API_KEY is not set in environment variables.');
      return res.status(500).json({ message: 'Server configuration error: API key missing.' });
  }

  const discordGuildId = '777268886939893821';

  try {
    const response = await axios.get(
      `https://raid-helper.dev/api/v3/servers/${discordGuildId}/scheduledevents`,
      {
        headers: {
          'Authorization': `${raidHelperApiKey}`,
          'User-Agent': 'ClassicWoWManagerApp/1.0.0 (Node.js)'
        }
      }
    );

    console.log('Raid-Helper API Raw Response Data (200 OK):', JSON.stringify(response.data, null, 2));

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching Raid-Helper events:', error.response ? error.response.data : error.message);
    if (error.response) {
      console.error('Raid-Helper API Error Response Details (Non-200):', {
          status: error.response.status,
          headers: error.response.headers,
          data: error.response.data
      });
    }
    res.status(error.response ? error.response.status : 500).json({
      message: 'Failed to fetch events from Raid-Helper.',
      error: error.response ? (error.response.data || error.message) : error.message
    });
  }
});

app.get('/api/roster/:eventId', async (req, res) => {
    const eventId = req.params.eventId;
    if (!eventId) {
        return res.status(400).json({ message: 'Event ID is required.' });
    }

    try {
        const response = await axios.get(`https://raid-helper.dev/api/raidplan/${eventId}`);
        console.log(`Fetched Roster for Event ID ${eventId}:`, JSON.stringify(response.data, null, 2));
        res.json(response.data);
    } catch (error) {
        console.error(`Error fetching roster for event ${eventId}:`, error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({
            message: `Failed to fetch roster for event ${eventId}.`,
            error: error.response ? (error.response.data || error.message) : error.message
        });
    }
});

// REMOVED: app.get('/') explicitly
// Combined into a single catch-all that serves index.html for all non-API/non-roster routes.
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