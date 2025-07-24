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
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: connectionString,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
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
app.get('/event/:eventId/roster', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'roster.html'));
});

app.get('/players', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'players.html'));
});


// All API and authentication routes should come AFTER express.static AND specific HTML routes
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
  } catch (error) {
    console.error('Error executing query:', error.stack);
    res.status(500).json({
        message: 'Error connecting to or querying the database.',
        error: error.message
    });
  }
});

app.get('/api/players', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM players ORDER BY character_name');
        client.release();
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching players:', error.stack);
        res.status(500).json({ message: 'Error fetching players from the database.' });
    }
});

// UPDATED: Endpoint to fetch upcoming Raid-Helper events using /events endpoint with filters
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

  // Calculate Unix timestamps for filtering
  const nowUnixTimestamp = Math.floor(Date.now() / 1000); // Current time in seconds
  const oneYearInSeconds = 365 * 24 * 60 * 60;
  const futureUnixTimestamp = nowUnixTimestamp + oneYearInSeconds;

  // NEW: Log the timestamp values for debugging
  console.log(`Debug: StartTimeFilter (now): ${nowUnixTimestamp}`);
  console.log(`Debug: EndTimeFilter (1 year from now): ${futureUnixTimestamp}`);


  try {
    const response = await axios.get(
      `https://raid-helper.dev/api/v3/servers/${discordGuildId}/events`, // Changed from /scheduledevents to /events
      {
        headers: {
          'Authorization': `${raidHelperApiKey}`,
          'User-Agent': 'ClassicWoWManagerApp/1.0.0 (Node.js)'
        },
        params: {
            StartTimeFilter: nowUnixTimestamp,
            EndTimeFilter: futureUnixTimestamp,
        }
      }
    );

    console.log('Raid-Helper API Raw Response Data (200 OK):', JSON.stringify(response.data, null, 2));

    // FIX: The actual event data is in response.data.postedEvents.
    // We will send this back to the frontend under the expected 'scheduledEvents' key.
    res.json({ scheduledEvents: response.data.postedEvents || [] });
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

// A helper function to normalize class names to their canonical form
const getCanonicalClass = (className) => {
    if (typeof className !== 'string') {
        return '';
    }
    const lowerClass = className.toLowerCase().trim();
    const classMap = {
        'tank': 'warrior',
        // Add other mappings here if needed, e.g., 'prot': 'warrior'
    };
    return classMap[lowerClass] || lowerClass;
};

app.get('/api/roster/:eventId', async (req, res) => {
    const eventId = req.params.eventId;
    if (!eventId) {
        return res.status(400).json({ message: 'Event ID is required.' });
    }

    try {
        // Step 1: Fetch the main roster data from Raid-Helper
        const rosterResponse = await axios.get(`https://raid-helper.dev/api/raidplan/${eventId}`);
        const rosterData = rosterResponse.data;

        if (!rosterData || !rosterData.raidDrop) {
            return res.status(404).json({ message: 'Roster data not found or is invalid.' });
        }

        // Step 2: Collect all unique Discord IDs from the roster
        const discordIds = [...new Set(rosterData.raidDrop.map(p => p.userid).filter(id => id))];

        // Step 3: Fetch all potential main characters for these IDs from our database in one query
        let mainsData = {};
        if (discordIds.length > 0) {
            const dbClient = await pool.connect();
            try {
                const dbResult = await dbClient.query({
                    text: 'SELECT discord_id, character_name, class FROM players WHERE discord_id = ANY($1::text[])',
                    values: [discordIds],
                });
                // Organize mains by discord_id for quick lookup
                dbResult.rows.forEach(row => {
                    if (!mainsData[row.discord_id]) {
                        mainsData[row.discord_id] = [];
                    }
                    mainsData[row.discord_id].push(row);
                });
            } finally {
                dbClient.release();
            }
        }

        // Step 4: Cross-reference and add the main character name to each player in the roster
        rosterData.raidDrop.forEach(player => {
            if (player.userid && mainsData[player.userid]) {
                const potentialMains = mainsData[player.userid];
                const rosterPlayerCanonicalClass = getCanonicalClass(player.class);
                
                const mainChar = potentialMains.find(
                    main => getCanonicalClass(main.class) === rosterPlayerCanonicalClass
                );

                if (mainChar) {
                    player.mainCharacterName = mainChar.character_name;
                } else {
                    player.mainCharacterName = 'No match'; // Explicitly set "No match"
                }

                // Find all other characters (alts), excluding the one they signed up with
                const alts = potentialMains.filter(
                    alt => alt.character_name.toLowerCase() !== player.name.toLowerCase()
                );

                if (alts.length > 0) {
                    player.altCharacters = alts.map(alt => `(${alt.character_name}-${alt.class})`);
                }
            }
        });

        console.log(`Fetched and enriched Roster for Event ID ${eventId}`);
        res.json(rosterData);

    } catch (error) {
        console.error(`Error fetching roster for event ${eventId}:`, error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({
            message: `Failed to fetch roster for event ${eventId}.`,
            error: error.response ? (error.response.data || error.message) : error.message
        });
    }
});

// This route will handle both the root path ('/') AND any other unmatched paths,
// serving events.html. It MUST be the LAST route definition in your application.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'events.html')); // Corrected path to events.html
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