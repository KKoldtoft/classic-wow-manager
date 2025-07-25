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

// Add the JSON middleware to parse request bodies
app.use(express.json());

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

app.get('/api/my-characters', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'User not authenticated.' });
    }

    const discordId = req.user.id;

    try {
        const client = await pool.connect();
        const result = await client.query({
            text: 'SELECT character_name, class FROM players WHERE discord_id = $1 ORDER BY character_name',
            values: [discordId],
        });
        client.release();
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching user characters:', error.stack);
        res.status(500).json({ message: 'Error fetching characters from the database.' });
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
const CLASS_COLORS = {
    'death knight': '196, 31, 59',
    'druid': '255, 125, 10',
    'hunter': '171, 212, 115',
    'mage': '63, 199, 235',
    'paladin': '245, 140, 186',
    'priest': '255, 255, 255',
    'rogue': '255, 245, 105',
    'shaman': '0, 112, 222',
    'warlock': '135, 135, 237',
    'warrior': '199, 156, 110',
    'unknown': '128, 128, 128',
};

const CLASS_ICONS = {
    'warrior': '579532030153588739',
    'paladin': '579532029906124840', // Corrected Paladin Icon
    'hunter': '579532029880827924',
    'rogue': '579532030086217748',
    'priest': '579532029901799437',
    'shaman': '579532030056857600',
    'mage': '579532030161977355',
    'warlock': '579532029851336716',
    'druid': '579532029675438081',
};

const SPEC_DATA = {
    'warrior': [
        { name: 'Arms', emote: '637564445031399474' }, { name: 'Fury', emote: '637564445215948810' }, { name: 'Protection', emote: '637564444834136065' }
    ],
    'hunter': [
        { name: 'Beast Mastery', emote: '637564202021814277' }, { name: 'Marksmanship', emote: '637564202084466708' }, { name: 'Survival', emote: '637564202130866186' }
    ],
    'mage': [
        { name: 'Arcane', emote: '637564231545389056' }, { name: 'Fire', emote: '637564231239073802' }, { name: 'Frost', emote: '637564231469891594' }
    ],
    'paladin': [
        { name: 'Holy', emote: '637564297622454272' }, { name: 'Protection', emote: '637564297647489034' }, { name: 'Retribution', emote: '637564297953673216' }
    ],
    'priest': [
        { name: 'Discipline', emote: '637564323442720768' }, { name: 'Holy', emote: '637564323530539019' }, { name: 'Shadow', emote: '637564323291725825' }
    ],
    'rogue': [
        { name: 'Assassination', emote: '637564351707873324' }, { name: 'Combat', emote: '637564352333086720' }, { name: 'Subtlety', emote: '637564352169508892' }
    ],
    'shaman': [
        { name: 'Restoration', emote: '637564379847458846' }, { name: 'Enhancement', emote: '637564379772223489' }, { name: 'Elemental', emote: '637564379595931649' }
    ],
    'warlock': [
        { name: 'Affliction', emote: '637564406984867861' }, { name: 'Demonology', emote: '637564407001513984' }, { name: 'Destruction', emote: '637564406682877964' }
    ],
    'druid': [
        { name: 'Feral', emote: '637564172061900820' }, { name: 'Balance', emote: '637564171994529798' }, { name: 'Restoration', emote: '637564172007112723' }, { name: 'Bear', emote: '637564171696734209' }
    ]
};

const getCanonicalClass = (className) => {
    if (!className) return 'unknown';
    const lower = className.toLowerCase();

    // Handle common role names from Raid Helper and map them to a default class
    if (lower === 'tank') return 'warrior';
    
    // Handle class names
    if (lower.includes('death knight')) return 'death knight';
    if (lower.includes('druid')) return 'druid';
    if (lower.includes('hunter')) return 'hunter';
    if (lower.includes('mage')) return 'mage';
    if (lower.includes('pala')) return 'paladin';
    if (lower.includes('priest')) return 'priest';
    if (lower.includes('rogue')) return 'rogue';
    if (lower.includes('shaman')) return 'shaman';
    if (lower.includes('warlock')) return 'warlock';
    if (lower.includes('warrior')) return 'warrior';
    return 'unknown';
};

// Refactored helper to ONLY get data from the Raid Helper API
async function getRosterDataFromApi(eventId) {
    const rosterResponse = await axios.get(`https://raid-helper.dev/api/raidplan/${eventId}`);
    if (!rosterResponse.data || !rosterResponse.data.raidDrop) {
        throw new Error('Roster data not found or is invalid from Raid Helper API.');
    }
    return rosterResponse.data;
}

// Refactored helper to enrich API data with local database info
async function enrichRosterWithDbData(rosterData, client) {
    const discordIds = [...new Set(rosterData.raidDrop.map(p => p.userid).filter(id => id))];
    let mainsData = {};

    if (discordIds.length > 0) {
        const dbResult = await client.query('SELECT discord_id, character_name, class FROM players WHERE discord_id = ANY($1::text[])', [discordIds]);
        dbResult.rows.forEach(row => {
            if (!mainsData[row.discord_id]) mainsData[row.discord_id] = [];
            mainsData[row.discord_id].push(row);
        });
    }

    rosterData.raidDrop.forEach(player => {
        if (!player) return;
        player.altCharacters = [];

        if (player.userid && mainsData[player.userid]) {
            const potentialMains = mainsData[player.userid];
            const mainChar = potentialMains.find(main => main && main.class && getCanonicalClass(main.class) === getCanonicalClass(player.class));

            if (mainChar && mainChar.character_name) {
                player.mainCharacterName = mainChar.character_name;
                const alts = potentialMains.filter(p => p && p.character_name && p.character_name.toLowerCase() !== mainChar.character_name.toLowerCase());
                if (alts.length > 0) {
                    player.altCharacters = alts.map(alt => {
                        const canonicalClass = getCanonicalClass(alt.class);
                        return { name: alt.character_name, class: alt.class, color: CLASS_COLORS[canonicalClass], icon: CLASS_ICONS[canonicalClass] };
                    });
                }
            } else {
                player.mainCharacterName = player.name;
                player.altCharacters = potentialMains
                    .filter(alt => alt && alt.character_name)
                    .map(alt => {
                        const canonicalClass = getCanonicalClass(alt.class);
                        return { name: alt.character_name, class: alt.class, color: CLASS_COLORS[canonicalClass], icon: CLASS_ICONS[canonicalClass] };
                    });
            }
        } else {
            player.mainCharacterName = player.name;
        }
    });
    return rosterData;
}


app.get('/api/roster/:eventId', async (req, res) => {
    const { eventId } = req.params;
    let client;

    try {
        client = await pool.connect();
        const managedRosterResult = await client.query('SELECT * FROM roster_overrides WHERE event_id = $1', [eventId]);
        
        const rosterDataFromApi = await getRosterDataFromApi(eventId);

        if (managedRosterResult.rows.length > 0) {
            // Roster is MANAGED
            const managedPlayers = managedRosterResult.rows;
            const discordIds = [...new Set(managedPlayers.map(p => p.discord_user_id))];

            let allPlayerChars = {};
            if (discordIds.length > 0) {
                const dbResult = await client.query('SELECT discord_id, character_name, class FROM players WHERE discord_id = ANY($1::text[])', [discordIds]);
                dbResult.rows.forEach(row => {
                    if (!allPlayerChars[row.discord_id]) allPlayerChars[row.discord_id] = [];
                    allPlayerChars[row.discord_id].push(row);
                });
            }

            const players = managedPlayers.map(row => {
                const userChars = allPlayerChars[row.discord_user_id] || [];
                const alts = userChars
                    .filter(char => char.character_name !== row.assigned_char_name)
                    .map(alt => {
                        const canonicalClass = getCanonicalClass(alt.class);
                        return { name: alt.character_name, class: alt.class, color: CLASS_COLORS[canonicalClass], icon: CLASS_ICONS[canonicalClass] };
                    });

                return {
                    name: row.original_signup_name,
                    userid: row.discord_user_id,
                    partyId: row.party_id,
                    slotId: row.slot_id,
                    mainCharacterName: row.assigned_char_name,
                    spec: row.assigned_char_spec,
                    spec_emote: row.assigned_char_spec_emote,
                    color: row.player_color,
                    class: row.assigned_char_class,
                    altCharacters: alts,
                };
            });
            
            res.json({
                raidDrop: players,
                title: rosterDataFromApi.title,
                partyPerRaid: rosterDataFromApi.partyPerRaid,
                slotPerParty: rosterDataFromApi.slotPerParty,
                partyNames: rosterDataFromApi.partyNames,
                isManaged: true
            });

        } else {
            // Roster is NOT managed
            const enrichedRoster = await enrichRosterWithDbData(rosterDataFromApi, client);
            res.json({ ...enrichedRoster, isManaged: false });
        }
    } catch (error) {
        console.error(`Error fetching roster for event ${eventId}:`, error);
        res.status(500).json({ message: 'Internal Server Error' });
    } finally {
        if (client) client.release();
    }
});


// Helper function to get details that might not be in our DB
async function getRaidDetailsFromRaidHelper(eventId) {
    const response = await axios.get(`https://raid-helper.dev/api/v2/events/${eventId}`, {
        headers: { Authorization: `Bearer ${process.env.RAID_HELPER_API_KEY}` }
    });
    const event = response.data;
    return {
        title: event.name,
        partyPerRaid: event.raid.parties,
        slotPerParty: event.raid.slots,
        partyNames: event.raid.party_names.map(p => p.name)
    };
}


app.put('/api/roster/:eventId/player/:discordUserId', async (req, res) => {
    const { eventId, discordUserId } = req.params;
    let { characterName, characterClass } = req.body;
    let client;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const checkResult = await client.query('SELECT id FROM roster_overrides WHERE event_id = $1 LIMIT 1', [eventId]);

        if (checkResult.rows.length === 0) {
            // Forking logic: Create the managed roster first
            const rosterData = await getRosterDataFromApi(eventId);
            const enrichedRoster = await enrichRosterWithDbData(rosterData, client);
            
            const insertPromises = enrichedRoster.raidDrop
                .filter(p => p.userid)
                .map(p => {
                    const params = [eventId, p.userid, p.name, p.mainCharacterName || p.name, p.class, p.spec, p.spec_emote, p.color, p.partyId, p.slotId];
                    return client.query(
                        `INSERT INTO roster_overrides (event_id, discord_user_id, original_signup_name, assigned_char_name, assigned_char_class, assigned_char_spec, assigned_char_spec_emote, player_color, party_id, slot_id)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                         ON CONFLICT (event_id, discord_user_id) DO NOTHING`,
                        params
                    );
                });
            await Promise.all(insertPromises);
        }

        if (characterName === null) {
            // Revert Logic
            const apiRoster = await getRosterDataFromApi(eventId);
            const enrichedRoster = await enrichRosterWithDbData(apiRoster, client);
            const originalPlayerState = enrichedRoster.raidDrop.find(p => p.userid === discordUserId);

            if (originalPlayerState) {
                await client.query(
                    `UPDATE roster_overrides 
                     SET assigned_char_name = $1, assigned_char_class = $2, assigned_char_spec = $3, assigned_char_spec_emote = $4, player_color = $5
                     WHERE event_id = $6 AND discord_user_id = $7`,
                    [
                        originalPlayerState.mainCharacterName, // This now uses the CORRECT enriched name
                        originalPlayerState.class,
                        originalPlayerState.spec,
                        originalPlayerState.spec_emote,
                        originalPlayerState.color,
                        eventId,
                        discordUserId
                    ]
                );
            }
        } else if (characterName && characterClass) {
            // Swap Logic
            const canonicalClass = getCanonicalClass(characterClass);
            const newColor = CLASS_COLORS[canonicalClass] || CLASS_COLORS['unknown'];
            const newIcon = CLASS_ICONS[canonicalClass] || null;

            await client.query(
                `UPDATE roster_overrides 
                 SET assigned_char_name = $1, assigned_char_class = $2, player_color = $3, assigned_char_spec = NULL, assigned_char_spec_emote = $4
                 WHERE event_id = $5 AND discord_user_id = $6`,
                [characterName, characterClass, newColor, newIcon, eventId, discordUserId]
            );
        }

        await client.query('COMMIT');
        res.json({ message: 'Player character updated successfully.' });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error updating player character:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    } finally {
        if (client) client.release();
    }
});

app.get('/api/specs', (req, res) => {
    res.json(SPEC_DATA);
});

// New endpoint to update just the spec
app.put('/api/roster/:eventId/player/:discordUserId/spec', async (req, res) => {
    const { eventId, discordUserId } = req.params;
    const { specName } = req.body;
    let client;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Ensure the roster is managed before updating a spec
        const checkResult = await client.query('SELECT assigned_char_class FROM roster_overrides WHERE event_id = $1 AND discord_user_id = $2', [eventId, discordUserId]);

        if (checkResult.rows.length === 0) {
            // This case should ideally not be hit if the UI is correct, but as a fallback:
            const rosterData = await getRosterDataFromApi(eventId);
            const enrichedRoster = await enrichRosterWithDbData(rosterData, client);
            const insertPromises = enrichedRoster.raidDrop.filter(p => p.userid).map(p => {
                const params = [eventId, p.userid, p.name, p.mainCharacterName || p.name, p.class, p.spec, p.spec_emote, p.color, p.partyId, p.slotId];
                return client.query(`INSERT INTO roster_overrides (event_id, discord_user_id, original_signup_name, assigned_char_name, assigned_char_class, assigned_char_spec, assigned_char_spec_emote, player_color, party_id, slot_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (event_id, discord_user_id) DO NOTHING`, params);
            });
            await Promise.all(insertPromises);
        }

        const playerClass = checkResult.rows.length > 0 ? checkResult.rows[0].assigned_char_class : (await client.query('SELECT assigned_char_class FROM roster_overrides WHERE event_id = $1 AND discord_user_id = $2', [eventId, discordUserId])).rows[0].assigned_char_class;
        const canonicalClass = getCanonicalClass(playerClass);
        const specsForClass = SPEC_DATA[canonicalClass] || [];
        const selectedSpec = specsForClass.find(s => s.name === specName);

        if (selectedSpec) {
            await client.query(
                `UPDATE roster_overrides SET assigned_char_spec = $1, assigned_char_spec_emote = $2 WHERE event_id = $3 AND discord_user_id = $4`,
                [selectedSpec.name, selectedSpec.emote, eventId, discordUserId]
            );
        }

        await client.query('COMMIT');
        res.json({ message: 'Player spec updated successfully.' });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error updating player spec:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    } finally {
        if (client) client.release();
    }
});

app.post('/api/roster/:eventId/revert', async (req, res) => {
    const { eventId } = req.params;
    let client;

    try {
        client = await pool.connect();
        await client.query('DELETE FROM roster_overrides WHERE event_id = $1', [eventId]);
        res.json({ message: 'Roster reverted to unmanaged.' });
    } catch (error) {
        console.error(`Error reverting roster for event ${eventId}:`, error);
        res.status(500).json({ message: 'Internal Server Error' });
    } finally {
        if (client) client.release();
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