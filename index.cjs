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

// New endpoint to get registered character for a Discord user ID
app.get('/api/registered-character/:discordUserId', async (req, res) => {
    const { discordUserId } = req.params;
    let client;
    
    try {
        client = await pool.connect();
        
        // Get the first registered character for this Discord user (their main character)
        const result = await client.query(
            'SELECT character_name, class FROM players WHERE discord_id = $1 ORDER BY character_name LIMIT 1',
            [discordUserId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No registered character found for this Discord user.' });
        }
        
        const character = result.rows[0];
        res.json({
            characterName: character.character_name,
            characterClass: character.class
        });
        
    } catch (error) {
        console.error('Error fetching registered character:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    } finally {
        if (client) client.release();
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
      // Time filters set (debug logs removed)


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

    // API response data logged (debug removed for cleaner logs)

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
    try {
        const rosterResponse = await axios.get(`https://raid-helper.dev/api/raidplan/${eventId}`, {
            timeout: 10000, // 10 second timeout
            headers: {
                'User-Agent': 'Classic-WoW-Manager/1.0'
            }
        });
        if (!rosterResponse.data || !rosterResponse.data.raidDrop) {
            throw new Error('Roster data not found or is invalid from Raid Helper API.');
        }
        return rosterResponse.data;
    } catch (error) {
        console.error(`Failed to fetch roster data from Raid Helper API for event ${eventId}:`, error.message);
        
        // Return a minimal roster structure for managed rosters to work
        return {
            raidDrop: [],
            partyPerRaid: 8,
            slotPerParty: 5,
            partyNames: ['Group 1', 'Group 2', 'Group 3', 'Group 4', 'Group 5', 'Group 6', 'Group 7', 'Group 8'],
            title: `Event ${eventId} (Offline Mode)`
        };
    }
}

// This function takes an array of player objects and enriches them
// with main character names and alt characters from the database.
async function enrichPlayersWithDbData(players, client) {
    if (!players || !Array.isArray(players) || players.length === 0) {
        return [];
    }

    // 1. Separate actual player objects from nulls
    const playerObjects = players.filter(p => p && p.userid);
    
    // 2. If no actual players, no need to query DB
    if (playerObjects.length === 0) {
        return players; // Return the original array (e.g., [null, null] for empty slots)
    }
    
    // 3. Get all characters for the found discord IDs
    const discordIds = [...new Set(playerObjects.map(p => p.userid))];
    const dbResult = await client.query('SELECT discord_id, character_name, class FROM players WHERE discord_id = ANY($1::text[])', [discordIds]);
    const allPlayerChars = {};
    dbResult.rows.forEach(row => {
        if (!allPlayerChars[row.discord_id]) allPlayerChars[row.discord_id] = [];
        allPlayerChars[row.discord_id].push(row);
    });

    // 4. Create a map of enriched players for easy lookup
    const enrichedPlayersMap = new Map();
    playerObjects.forEach(player => {
        const userChars = allPlayerChars[player.userid] || [];
        let mainChar = userChars.find(c => c.character_name === player.name) || userChars[0];
        
        // Detect if there's a class/spec mismatch indicating API data is newer than DB data
        let mainCharacterClass = player.class; // Start with API class
        let mainCharacterName = player.name; // Start with API name
        
        // Only use DB data if there's a clear match and no obvious mismatch
        if (mainChar && mainChar.class) {
            const apiCanonicalClass = getCanonicalClass(player.class);
            const dbCanonicalClass = getCanonicalClass(mainChar.class);
            
            // If classes match or player has no specific spec, use DB data
            if (apiCanonicalClass === dbCanonicalClass || !player.spec_emote) {
                mainCharacterClass = mainChar.class;
                mainCharacterName = mainChar.character_name;
            } else {
                // There's a mismatch - try to find a better character name for the spec
                // Look for characters in the database that match the API class
                const matchingChar = userChars.find(c => getCanonicalClass(c.class) === apiCanonicalClass);
                if (matchingChar) {
                    mainCharacterName = matchingChar.character_name;
                    console.log(`🔄 Name correction: ${player.name} -> ${matchingChar.character_name} (class mismatch detected)`);
                }
            }
        }

        const alts = userChars
            .filter(char => char && char.character_name !== mainCharacterName)
            .map(alt => {
                const canonicalClass = getCanonicalClass(alt.class);
                return {
                    name: alt.character_name,
                    class: alt.class,
                    color: CLASS_COLORS[canonicalClass],
                    icon: CLASS_ICONS[canonicalClass]
                };
            });
        
        // ALWAYS calculate color based on the definitive canonical class.
        const canonicalClass = getCanonicalClass(mainCharacterClass);
        const playerColor = CLASS_COLORS[canonicalClass] || CLASS_COLORS['unknown'];

        enrichedPlayersMap.set(player.userid, {
            ...player,
            mainCharacterName,
            altCharacters: alts,
            class: mainCharacterClass,
            color: playerColor // Use the recalculated, correct color.
        });
    });

    // 5. Rebuild the original array, substituting enriched players and preserving nulls
    return players.map(p => {
        if (!p || !p.userid) return null; // If it was null or a bad player object, return null
        return enrichedPlayersMap.get(p.userid) || p; // Get the enriched version, or the original if lookup fails
    });
}

// This function is now a simple wrapper around enrichPlayersWithDbData
async function enrichRosterWithDbData(rosterData, client) {
    if (!rosterData || !rosterData.raidDrop) {
        return rosterData;
    }
    const enrichedPlayers = await enrichPlayersWithDbData(rosterData.raidDrop, client);
    return { ...rosterData, raidDrop: enrichedPlayers };
}

// Helper to "fork" a roster from the API into the DB if it's not already managed
async function forkRosterIfNeeded(eventId, client) {
    const checkResult = await client.query('SELECT event_id FROM roster_overrides WHERE event_id = $1 LIMIT 1', [eventId]);
    if (checkResult.rows.length > 0) {
        return; // Already forked
    }

    console.log(`Forking roster for event ${eventId}...`);
    const rosterDataFromApi = await getRosterDataFromApi(eventId);
    const enrichedRoster = await enrichRosterWithDbData(rosterDataFromApi, client);

    const insertPromises = enrichedRoster.raidDrop.map(player => {
        if (!player || !player.userid) return null; // Skip empty slots or players without IDs
        const query = `
            INSERT INTO roster_overrides 
            (event_id, discord_user_id, original_signup_name, assigned_char_name, assigned_char_class, assigned_char_spec, assigned_char_spec_emote, player_color, party_id, slot_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;
        const values = [
            eventId,
            player.userid,
            player.name, // original_signup_name
            player.mainCharacterName,
            player.class,
            player.spec,
            player.spec_emote,
            player.color,
            player.partyId,
            player.slotId
        ];
        return client.query(query, values);
    }).filter(Boolean);

    await Promise.all(insertPromises);
    console.log(`Roster for event ${eventId} successfully forked.`);
}

// Helper to get a single player's full data, ready for insertion into overrides
async function getPlayerForInsert(eventId, discordUserId, client) {
    const fullEventData = await getFullEventDataFromApi(eventId);
    const signup = fullEventData.signUps.find(s => s.userId === discordUserId);
    if (!signup) throw new Error(`Player with Discord ID ${discordUserId} not found in signups for event ${eventId}.`);

    const playerToEnrich = [{
        userid: signup.userId,
        name: signup.name,
        class: signup.className,
        spec: signup.specName,
        spec_emote: signup.specEmoteId || signup.classEmoteId,
        color: null, // Let enrichPlayersWithDbData determine the correct color
    }];
    
    const [enrichedPlayer] = await enrichPlayersWithDbData(playerToEnrich, client);
    return enrichedPlayer;
}

async function getFullEventDataFromApi(eventId) {
    try {
        const response = await axios.get(`https://raid-helper.dev/api/v2/events/${eventId}`, {
            timeout: 10000, // 10 second timeout
            headers: { 
                'Authorization': process.env.RAID_HELPER_API_KEY,
                'User-Agent': 'ClassicWoWManagerApp/1.0.0 (Node.js)'
            }
        });
        // More robust check: The v2 endpoint returns an object with a 'signUps' array.
        if (!response.data || typeof response.data !== 'object' || !Array.isArray(response.data.signUps)) {
            console.error('[DETAILED LOG] Unexpected API response structure:', response.data);
            throw new Error('Full event data not found or is invalid from Raid Helper API v2.');
        }
        return response.data;
    } catch (error) {
        console.error(`Failed to fetch full event data from Raid Helper API for event ${eventId}:`, error.message);
        
        // Return minimal event data structure for offline mode
        return {
            signUps: []
        };
    }
}


app.get('/api/roster/:eventId', async (req, res) => {
    const { eventId } = req.params;
    let client;
    try {
        client = await pool.connect();
        let rosterData;
        const managedRosterResult = await client.query('SELECT * FROM roster_overrides WHERE event_id = $1', [eventId]);



        const rosterDataFromApi = await getRosterDataFromApi(eventId);
        if (managedRosterResult.rows.length > 0) {
            // Roster IS managed. Reconstruct it from overrides and full signup data.
            const fullEventData = await getFullEventDataFromApi(eventId);

            // Enrich all signed-up players at once for efficiency
            const allSignedUpPlayers = fullEventData.signUps.map(signup => ({
                userid: signup.userId,
                name: signup.name,
                class: signup.className,
                spec: signup.specName,
                spec_emote: signup.specEmoteId || signup.classEmoteId,
                status: signup.status,
            }));
            const enrichedAllPlayers = await enrichPlayersWithDbData(allSignedUpPlayers, client);
            const enrichedPlayersMap = new Map(enrichedAllPlayers.map(p => [p.userid, p]));

            const finalRosterPlayers = [];
            const playersInRosterOverrides = new Set();

            managedRosterResult.rows.forEach(override => {
                if (override.party_id !== null) { // Only add players assigned to a party to the roster
                    const basePlayer = enrichedPlayersMap.get(override.discord_user_id);
                    
                    if (basePlayer) {
                        // Player exists in original signups - use enriched data
                        finalRosterPlayers.push({
                            ...basePlayer,
                            mainCharacterName: override.assigned_char_name,
                            class: override.assigned_char_class,
                            spec: override.assigned_char_spec,
                            spec_emote: override.assigned_char_spec_emote,
                            partyId: override.party_id,
                            slotId: override.slot_id,
                            color: override.player_color,
                        });
                    } else {
                        // Player doesn't exist in original signups - create from override data only
                        finalRosterPlayers.push({
                            userid: override.discord_user_id,
                            name: override.original_signup_name,
                            mainCharacterName: override.assigned_char_name,
                            class: override.assigned_char_class,
                            spec: override.assigned_char_spec,
                            spec_emote: override.assigned_char_spec_emote,
                            partyId: override.party_id,
                            slotId: override.slot_id,
                            color: override.player_color,
                            altCharacters: [], // No alt data for manually added characters
                            status: 'confirmed' // Assume confirmed for manually added
                        });
                    }
                    playersInRosterOverrides.add(override.discord_user_id);
                }
            });

            rosterData = { ...rosterDataFromApi, raidDrop: finalRosterPlayers, isManaged: true };

            // Bench logic: players who are in signups but NOT in a roster spot in our overrides table
            const benchPlayers = enrichedAllPlayers.filter(p => !playersInRosterOverrides.has(p.userid));
            rosterData.bench = benchPlayers;

        } else {
            // Roster is NOT managed - original logic
            rosterData = await enrichRosterWithDbData(rosterDataFromApi, client);
            rosterData.isManaged = false;

            // Original bench logic for unmanaged rosters
            try {
                const fullEventData = await getFullEventDataFromApi(eventId);
                const raidDropPlayerIds = new Set(rosterData.raidDrop.map(p => p && p.userid).filter(Boolean));
                
                const benchSignups = fullEventData.signUps.filter(signup => {
                    return signup.userId && !raidDropPlayerIds.has(signup.userId);
                });

                let benchPlayers = benchSignups.map(signup => {
                    const canonicalClass = getCanonicalClass(signup.className);
                    return {
                        userid: signup.userId,
                        name: signup.name,
                        class: signup.className,
                        spec: signup.specName,
                        spec_emote: signup.specEmoteId || signup.classEmoteId,
                        class_emote: signup.classEmoteId,
                        status: signup.status,
                        color: CLASS_COLORS[canonicalClass] || null,
                        partyId: null, 
                        slotId: null
                    };
                });
                
                rosterData.bench = await enrichPlayersWithDbData(benchPlayers, client);
            } catch (error) {
                console.warn(`\n[WARNING] Could not fetch/process bench data for event ${eventId}.\nThe main roster will be displayed, but the bench will be empty.\n\n[DETAILED ERROR] ${error.stack}\n`);
                rosterData.bench = [];
            }
        }
        
        res.json(rosterData);
    } catch (error) {
        console.error(`Error in /api/roster/:eventId for event ${eventId}:\n`, error);
        res.status(500).json({ message: 'Internal Server Error' });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// Helper function to get details that might not be in our DB
async function getRaidDetailsFromRaidHelper(eventId) {
    try {
        const response = await axios.get(`https://raid-helper.dev/api/raidplan/${eventId}`);
        const event = response.data;
        return {
            title: event.name,
            partyPerRaid: event.raid.parties,
            slotPerParty: event.raid.slots,
            partyNames: event.raid.party_names.map(p => p.name)
        };
    } catch (error) {
        console.error('Error fetching Raid-Helper event details:', error.response ? error.response.data : error.message);
        if (error.response) {
            console.error('Raid-Helper API Error Response Details (Non-200):', {
                status: error.response.status,
                headers: error.response.headers,
                data: error.response.data
            });
        }
        throw new Error(`Failed to fetch event details for event ID: ${eventId}`);
    }
}

// Endpoint to handle swapping a player's character
app.put('/api/roster/:eventId/player/:discordUserId', async (req, res) => {
    const { eventId, discordUserId } = req.params;
    let { characterName, characterClass } = req.body;

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        await forkRosterIfNeeded(eventId, client);

        if (!characterName) { // This is a "revert to registered character" action
            // Get the first registered character for this Discord user
            const originalCharacterResult = await client.query(
                'SELECT character_name, class FROM players WHERE discord_id = $1 ORDER BY character_name LIMIT 1',
                [discordUserId]
            );
            const originalCharacter = originalCharacterResult.rows[0];

            if (!originalCharacter) {
                throw new Error(`Could not find original registered character for discord user ${discordUserId}`);
            }

            const canonicalClass = getCanonicalClass(originalCharacter.class);
            const color = CLASS_COLORS[canonicalClass] || '#808080';
            const classIcon = CLASS_ICONS[canonicalClass] || null;
            
            await client.query(
                `UPDATE roster_overrides SET assigned_char_name = $1, assigned_char_class = $2, player_color = $3, assigned_char_spec = NULL, assigned_char_spec_emote = $4 WHERE event_id = $5 AND discord_user_id = $6`,
                [originalCharacter.character_name, originalCharacter.class, color, classIcon, eventId, discordUserId]
            );

        } else { // This is a "swap to alt" action
            const canonicalClass = getCanonicalClass(characterClass);
            const color = CLASS_COLORS[canonicalClass] || '#808080';
            
            // When swapping characters, reset spec to null and use class icon
            const classIcon = CLASS_ICONS[canonicalClass] || null;

            await client.query(
                `UPDATE roster_overrides 
                 SET assigned_char_name = $1, assigned_char_class = $2, player_color = $3, assigned_char_spec = NULL, assigned_char_spec_emote = $4
                 WHERE event_id = $5 AND discord_user_id = $6`,
                [characterName, characterClass, color, classIcon, eventId, discordUserId]
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

// Endpoint to handle updating a player's spec
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
            const insertPromises = enrichedRoster.raidDrop.filter(p => p && p.userid).map(p => {
                const params = [eventId, p.userid, p.name, p.mainCharacterName || p.name, p.class, p.spec, p.spec_emote, p.color, p.partyId, p.slotId];
                return client.query(`INSERT INTO roster_overrides (event_id, discord_user_id, original_signup_name, assigned_char_name, assigned_char_class, assigned_char_spec, assigned_char_spec_emote, player_color, party_id, slot_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (event_id, discord_user_id) DO NOTHING`, params);
            });
            await Promise.all(insertPromises);
        }

        // Get the player class after ensuring the override exists
        let playerClass;
        if (checkResult.rows.length > 0) {
            playerClass = checkResult.rows[0].assigned_char_class;
        } else {
            // Query again after the INSERT operations to get the class
            const updatedResult = await client.query('SELECT assigned_char_class FROM roster_overrides WHERE event_id = $1 AND discord_user_id = $2', [eventId, discordUserId]);
            if (updatedResult.rows.length === 0) {
                throw new Error(`Player ${discordUserId} not found in roster for event ${eventId}`);
            }
            playerClass = updatedResult.rows[0].assigned_char_class;
        }
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

// Endpoint to handle adding a new character to roster
app.post('/api/roster/:eventId/add-character', async (req, res) => {
    const { eventId } = req.params;
    const { characterName, class: characterClass, discordId, spec, targetPartyId, targetSlotId } = req.body;

    let client;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Validate input
        if (!characterName || !characterClass || !discordId || !targetPartyId || !targetSlotId) {
            throw new Error('Missing required fields');
        }

        // Validate Discord ID format
        if (!/^\d{17,19}$/.test(discordId)) {
            throw new Error('Invalid Discord ID format');
        }

        // Check if there's already a player in this position
        const existingPlayer = await client.query(
            'SELECT discord_user_id FROM roster_overrides WHERE event_id = $1 AND party_id = $2 AND slot_id = $3',
            [eventId, targetPartyId, targetSlotId]
        );

        if (existingPlayer.rows.length > 0) {
            throw new Error('Position is already occupied');
        }

        // Check for existing characters with same name and class (refuse creation)
        const exactMatch = await client.query(
            'SELECT character_name FROM players WHERE LOWER(character_name) = LOWER($1) AND class = $2',
            [characterName, characterClass]
        );

        if (exactMatch.rows.length > 0) {
            return res.status(409).json({ 
                error: 'EXACT_DUPLICATE',
                message: `A character named "${characterName}" with class "${characterClass}" already exists. Please choose a different name or class.`
            });
        }

        // Check for existing characters with same name but different class (show warning)
        const nameMatch = await client.query(
            'SELECT character_name, class FROM players WHERE LOWER(character_name) = LOWER($1) AND class != $2',
            [characterName, characterClass]
        );

        if (nameMatch.rows.length > 0) {
            const existingClass = nameMatch.rows[0].class;
            return res.status(409).json({ 
                error: 'NAME_CONFLICT',
                message: `A character named "${characterName}" already exists with class "${existingClass}". Are you sure you want to create this character with class "${characterClass}"?`,
                existingCharacter: {
                    name: characterName,
                    class: existingClass
                }
            });
        }

        // Check for existing characters with same Discord ID (show warning)
        const discordIdMatches = await client.query(
            'SELECT character_name, class FROM players WHERE discord_id = $1',
            [discordId]
        );

        if (discordIdMatches.rows.length > 0) {
            return res.status(409).json({ 
                error: 'DISCORD_ID_CONFLICT',
                message: `There ${discordIdMatches.rows.length === 1 ? 'is already 1 character' : `are already ${discordIdMatches.rows.length} characters`} with this Discord ID. Do you want to create this character?`,
                existingCharacters: discordIdMatches.rows.map(row => ({
                    name: row.character_name,
                    class: row.class
                }))
            });
        }

        // Ensure roster is managed by creating initial overrides if needed
        await forkRosterIfNeeded(eventId, client);

        // Get canonical class and determine spec
        const canonicalClass = getCanonicalClass(characterClass);
        const specsForClass = SPEC_DATA[canonicalClass] || [];
        
        // Use provided spec if valid, otherwise use default
        let selectedSpec;
        if (spec && specsForClass.find(s => s.name === spec)) {
            selectedSpec = specsForClass.find(s => s.name === spec);
        } else {
            selectedSpec = specsForClass.length > 0 ? specsForClass[0] : { name: characterClass, emote: null };
        }

        // Get class color
        const classColors = {
            'death knight': '196,30,59',
            'druid': '255,125,10',
            'hunter': '171,212,115',
            'mage': '105,204,240',
            'paladin': '245,140,186',
            'priest': '255,255,255',
            'rogue': '255,245,105',
            'shaman': '0,112,222',
            'warlock': '148,130,201',
            'warrior': '199,156,110'
        };
        const playerColor = classColors[canonicalClass] || '128,128,128';

        // First, add the character to the main players table
        await client.query(`
            INSERT INTO players (discord_id, character_name, class) 
            VALUES ($1, $2, $3)
            ON CONFLICT (discord_id, character_name) DO NOTHING`,
            [discordId, characterName, characterClass]
        );

        // Then, insert the new character into the roster
        await client.query(`
            INSERT INTO roster_overrides 
            (event_id, discord_user_id, original_signup_name, assigned_char_name, assigned_char_class, assigned_char_spec, assigned_char_spec_emote, player_color, party_id, slot_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (event_id, discord_user_id) 
            DO UPDATE SET 
                assigned_char_name = EXCLUDED.assigned_char_name,
                assigned_char_class = EXCLUDED.assigned_char_class,
                assigned_char_spec = EXCLUDED.assigned_char_spec,
                assigned_char_spec_emote = EXCLUDED.assigned_char_spec_emote,
                player_color = EXCLUDED.player_color,
                party_id = EXCLUDED.party_id,
                slot_id = EXCLUDED.slot_id`,
            [eventId, discordId, characterName, characterName, characterClass, selectedSpec.name, selectedSpec.emote, playerColor, targetPartyId, targetSlotId]
        );

        await client.query('COMMIT');
        res.json({ 
            message: 'Character added to roster successfully',
            character: {
                characterName,
                class: characterClass,
                discordId,
                spec: selectedSpec.name,
                partyId: targetPartyId,
                slotId: targetSlotId
            }
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error adding character to roster:', error);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    } finally {
        if (client) client.release();
    }
});

// Endpoint to handle adding a new character to roster (force creation, bypassing warnings)
app.post('/api/roster/:eventId/add-character/force', async (req, res) => {
    const { eventId } = req.params;
    const { characterName, class: characterClass, discordId, spec, targetPartyId, targetSlotId } = req.body;

    let client;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Validate input
        if (!characterName || !characterClass || !discordId || !targetPartyId || !targetSlotId) {
            throw new Error('Missing required fields');
        }

        // Validate Discord ID format
        if (!/^\d{17,19}$/.test(discordId)) {
            throw new Error('Invalid Discord ID format');
        }

        // Check if there's already a player in this position
        const existingPlayer = await client.query(
            'SELECT discord_user_id FROM roster_overrides WHERE event_id = $1 AND party_id = $2 AND slot_id = $3',
            [eventId, targetPartyId, targetSlotId]
        );

        if (existingPlayer.rows.length > 0) {
            throw new Error('Position is already occupied');
        }

        // Still check for exact duplicates (same name + class) as these should never be allowed
        const exactMatch = await client.query(
            'SELECT character_name FROM players WHERE LOWER(character_name) = LOWER($1) AND class = $2',
            [characterName, characterClass]
        );

        if (exactMatch.rows.length > 0) {
            throw new Error(`A character named "${characterName}" with class "${characterClass}" already exists. Cannot create duplicate.`);
        }

        // Continue with creation (bypassing name and Discord ID warnings)
        await forkRosterIfNeeded(eventId, client);

        // Get canonical class and determine spec
        const canonicalClass = getCanonicalClass(characterClass);
        const specsForClass = SPEC_DATA[canonicalClass] || [];
        
        // Use provided spec if valid, otherwise use default
        let selectedSpec;
        if (spec && specsForClass.find(s => s.name === spec)) {
            selectedSpec = specsForClass.find(s => s.name === spec);
        } else {
            selectedSpec = specsForClass.length > 0 ? specsForClass[0] : { name: characterClass, emote: null };
        }

        // Get class color
        const classColors = {
            'death knight': '196,30,59',
            'druid': '255,125,10',
            'hunter': '171,212,115',
            'mage': '105,204,240',
            'paladin': '245,140,186',
            'priest': '255,255,255',
            'rogue': '255,245,105',
            'shaman': '0,112,222',
            'warlock': '148,130,201',
            'warrior': '199,156,110'
        };
        const playerColor = classColors[canonicalClass] || '128,128,128';

        // First, add the character to the main players table
        await client.query(`
            INSERT INTO players (discord_id, character_name, class) 
            VALUES ($1, $2, $3)
            ON CONFLICT (discord_id, character_name) DO NOTHING`,
            [discordId, characterName, characterClass]
        );

        // Then, insert the new character into the roster
        await client.query(`
            INSERT INTO roster_overrides 
            (event_id, discord_user_id, original_signup_name, assigned_char_name, assigned_char_class, assigned_char_spec, assigned_char_spec_emote, player_color, party_id, slot_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (event_id, discord_user_id) 
            DO UPDATE SET 
                assigned_char_name = EXCLUDED.assigned_char_name,
                assigned_char_class = EXCLUDED.assigned_char_class,
                assigned_char_spec = EXCLUDED.assigned_char_spec,
                assigned_char_spec_emote = EXCLUDED.assigned_char_spec_emote,
                player_color = EXCLUDED.player_color,
                party_id = EXCLUDED.party_id,
                slot_id = EXCLUDED.slot_id`,
            [eventId, discordId, characterName, characterName, characterClass, selectedSpec.name, selectedSpec.emote, playerColor, targetPartyId, targetSlotId]
        );

        await client.query('COMMIT');
        res.json({ 
            message: 'Character added to roster successfully',
            character: {
                characterName,
                class: characterClass,
                discordId,
                spec: selectedSpec.name,
                partyId: targetPartyId,
                slotId: targetSlotId
            }
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error force adding character to roster:', error);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    } finally {
        if (client) client.release();
    }
});

// Endpoint to handle moving a player
app.put('/api/roster/:eventId/player/:discordUserId/position', async (req, res) => {
    const { eventId, discordUserId } = req.params;
    const targetPartyId = parseInt(req.body.targetPartyId, 10);
    const targetSlotId = parseInt(req.body.targetSlotId, 10);
    let client;

    try {
        console.log(`[MOVE DEBUG] Starting move: eventId=${eventId}, discordUserId=${discordUserId}, targetParty=${targetPartyId}, targetSlot=${targetSlotId}`);
        
        client = await pool.connect();
        await client.query('BEGIN');
        
        console.log('[MOVE DEBUG] Database transaction started');

        await forkRosterIfNeeded(eventId, client);
        console.log('[MOVE DEBUG] Roster forked if needed');

        const sourcePlayerRes = await client.query('SELECT party_id, slot_id FROM roster_overrides WHERE event_id = $1 AND discord_user_id = $2', [eventId, discordUserId]);
        const sourcePlayer = sourcePlayerRes.rows[0];
        const isSourcePlayerInRoster = !!(sourcePlayer && sourcePlayer.party_id !== null);
        console.log(`[MOVE DEBUG] Source player query result:`, { sourcePlayer, isSourcePlayerInRoster });

        const targetPlayerRes = await client.query('SELECT discord_user_id FROM roster_overrides WHERE event_id = $1 AND party_id = $2 AND slot_id = $3', [eventId, targetPartyId, targetSlotId]);
        const targetPlayer = targetPlayerRes.rows[0];
        console.log(`[MOVE DEBUG] Target player query result:`, { targetPlayer });

        if (isSourcePlayerInRoster) {
            // --- MOVING A PLAYER WHO IS ALREADY IN THE ROSTER ---
            if (targetPlayer && targetPlayer.discord_user_id === discordUserId) {
                // Source and target are the same player in the same slot. No action taken.
            } else {
                if (targetPlayer) { // It's a SWAP with another player
                    await client.query(
                        `UPDATE roster_overrides SET party_id = $1, slot_id = $2 WHERE event_id = $3 AND discord_user_id = $4`,
                        [sourcePlayer.party_id, sourcePlayer.slot_id, eventId, targetPlayer.discord_user_id]
                    );
                }
                // This query always runs for a move-to-empty or a swap with another player
                await client.query(
                    `UPDATE roster_overrides SET party_id = $1, slot_id = $2 WHERE event_id = $3 AND discord_user_id = $4`,
                    [targetPartyId, targetSlotId, eventId, discordUserId]
                );
            }
        } else {
            // --- MOVING A PLAYER FROM THE BENCH ---
            if (targetPlayer) {
                // A player is in the destination. DELETE them from the roster.
                // They will reappear on the bench because they're still in the API signups.
                await client.query(`DELETE FROM roster_overrides WHERE event_id = $1 AND discord_user_id = $2`, [eventId, targetPlayer.discord_user_id]);
            }

            // The player might exist in our table but with NULL position (if they were moved to bench).
            // A simple delete is cleaner than checking and avoids conflicts.
            await client.query(`DELETE FROM roster_overrides WHERE event_id = $1 AND discord_user_id = $2`, [eventId, discordUserId]);
            
            // Now, insert a fresh record for the player from the bench into their new spot.
            const playerToInsert = await getPlayerForInsert(eventId, discordUserId, client);
            await client.query(
                `INSERT INTO roster_overrides (event_id, discord_user_id, original_signup_name, assigned_char_name, assigned_char_class, assigned_char_spec, assigned_char_spec_emote, player_color, party_id, slot_id) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [eventId, discordUserId, playerToInsert.name, playerToInsert.mainCharacterName, playerToInsert.class, playerToInsert.spec, playerToInsert.spec_emote, playerToInsert.color, targetPartyId, targetSlotId]
            );
        }

        await client.query('COMMIT');
        console.log('[MOVE DEBUG] Transaction committed successfully');
        res.status(200).json({ message: 'Player position updated successfully.' });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('[MOVE DEBUG] Error occurred:', error.message);
        console.error('[MOVE DEBUG] Full error stack:', error.stack);
        console.error('[MOVE DEBUG] Error details:', {
            name: error.name,
            code: error.code,
            detail: error.detail,
            hint: error.hint,
            position: error.position,
            internalPosition: error.internalPosition,
            internalQuery: error.internalQuery,
            where: error.where,
            schema: error.schema,
            table: error.table,
            column: error.column,
            dataType: error.dataType,
            constraint: error.constraint
        });
        res.status(500).json({ message: 'Internal Server Error', debug: error.message });
    } finally {
        if (client) client.release();
    }
});

app.post('/api/roster/:eventId/player/:discordUserId/bench', async (req, res) => {
    const { eventId, discordUserId } = req.params;
    let client;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Forking ensures the roster is managed, which is a prerequisite for benching.
        await forkRosterIfNeeded(eventId, client);

        // Check if the player is actually in the roster before trying to "bench" them.
        const rosterCheck = await client.query(
            'SELECT * FROM roster_overrides WHERE event_id = $1 AND discord_user_id = $2 AND party_id IS NOT NULL',
            [eventId, discordUserId]
        );

        if (rosterCheck.rows.length === 0) {
            // It's good practice to send a success response even if no action was taken,
            // as the desired state (player on bench) is already met.
            await client.query('COMMIT'); // Commit the no-op transaction
            return res.status(200).json({ message: 'Player is already on the bench.' });
        }

        // Deleting the player's override record effectively "benches" them.
        // They will reappear on the bench on the next fetch because they are still in the original API signups.
        await client.query('DELETE FROM roster_overrides WHERE event_id = $1 AND discord_user_id = $2', [eventId, discordUserId]);

        await client.query('COMMIT');
        res.status(200).json({ message: 'Player moved to bench successfully.' });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error benching player:', error.stack);
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

// --- Database Migration Endpoints ---
app.post('/api/admin/setup-database', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        // Create players table
        await client.query(`
            CREATE TABLE IF NOT EXISTS players (
                discord_id VARCHAR(255),
                character_name VARCHAR(255),
                class VARCHAR(50),
                PRIMARY KEY (discord_id, character_name)
            )
        `);
        
        // Create roster_overrides table
        await client.query(`
            CREATE TABLE IF NOT EXISTS roster_overrides (
                event_id VARCHAR(255),
                discord_user_id VARCHAR(255),
                original_signup_name VARCHAR(255),
                assigned_char_name VARCHAR(255),
                assigned_char_class VARCHAR(50),
                assigned_char_spec VARCHAR(50),
                assigned_char_spec_emote VARCHAR(50),
                player_color VARCHAR(50),
                party_id INTEGER,
                slot_id INTEGER,
                PRIMARY KEY (event_id, discord_user_id)
            )
        `);
        
        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_players_discord_id ON players (discord_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_roster_overrides_event_id ON roster_overrides (event_id)
        `);
        
        // Fix column size for spec emotes (Discord IDs can be 17-19 chars)
        await client.query(`
            ALTER TABLE roster_overrides 
            ALTER COLUMN assigned_char_spec_emote TYPE VARCHAR(50)
        `);
        
        res.json({ 
            success: true, 
            message: 'Database tables created successfully!' 
        });
        
    } catch (error) {
        console.error('Error setting up database:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error setting up database', 
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Simple test endpoint
app.get('/api/test', (req, res) => {
    console.log('[TEST] Test endpoint called');
    res.json({ message: 'Test endpoint working', timestamp: new Date().toISOString() });
});

app.put('/api/test-put', (req, res) => {
    console.log('[TEST] PUT test endpoint called with body:', req.body);
    res.json({ message: 'PUT test endpoint working', body: req.body, timestamp: new Date().toISOString() });
});

// Debug endpoint to check database schema and data
app.get('/api/admin/debug-db', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        // Get table structure
        const schemaResult = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'roster_overrides' 
            ORDER BY ordinal_position
        `);
        
        // Get sample data from roster_overrides
        const dataResult = await client.query('SELECT * FROM roster_overrides LIMIT 5');
        
        // Get sample data from players  
        const playersResult = await client.query('SELECT * FROM players LIMIT 5');
        
        res.json({
            success: true,
            schema: {
                roster_overrides_columns: schemaResult.rows,
                sample_roster_data: dataResult.rows,
                sample_players_data: playersResult.rows
            }
        });
        
    } catch (error) {
        console.error('Error debugging database:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Cleanup endpoint to remove players without Discord IDs
app.post('/api/admin/cleanup-players', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        // First, check how many players have empty/null Discord IDs
        const countResult = await client.query(`
            SELECT COUNT(*) as count 
            FROM players 
            WHERE discord_id IS NULL OR discord_id = ''
        `);
        
        const countToDelete = parseInt(countResult.rows[0].count);
        
        if (countToDelete === 0) {
            return res.json({
                success: true,
                message: 'No players found with empty Discord IDs.',
                deletedCount: 0
            });
        }
        
        // Delete players without Discord IDs
        const deleteResult = await client.query(`
            DELETE FROM players 
            WHERE discord_id IS NULL OR discord_id = ''
        `);
        
        res.json({
            success: true,
            message: `Successfully removed ${deleteResult.rowCount} players without Discord IDs.`,
            deletedCount: deleteResult.rowCount
        });
        
    } catch (error) {
        console.error('Error cleaning up players:', error);
        res.status(500).json({
            success: false,
            message: 'Error cleaning up players',
            error: error.message
        });
    } finally {
        if (client) client.release();
    }
});

app.post('/api/admin/migrate-players', async (req, res) => {
    const fs = require('fs');
    const path = require('path');
    let client;
    
    try {
        // Read players.tsv file
        const tsvPath = path.join(__dirname, 'players.tsv');
        if (!fs.existsSync(tsvPath)) {
            return res.status(400).json({ 
                success: false, 
                message: 'players.tsv file not found' 
            });
        }
        
        const tsvContent = fs.readFileSync(tsvPath, 'utf8');
        const lines = tsvContent.split('\n');
        
        client = await pool.connect();
        let processedCount = 0;
        let errors = [];
        
        for (const line of lines) {
            if (line.trim() !== '') {
                const fields = line.split('\t');
                if (fields.length >= 3) {
                    const discordId = fields[0].trim();
                    const characterName = fields[1].trim();
                    const characterClass = fields[2].trim();
                    
                    if (characterName !== '' && characterClass !== '') {
                        try {
                            await client.query(`
                                INSERT INTO players (discord_id, character_name, class) 
                                VALUES ($1, $2, $3) 
                                ON CONFLICT (discord_id, character_name) DO NOTHING
                            `, [discordId, characterName, characterClass]);
                            processedCount++;
                        } catch (error) {
                            errors.push(`Error processing ${characterName}: ${error.message}`);
                        }
                    }
                }
            }
        }
        
        res.json({ 
            success: true, 
            message: `Migration completed! Processed ${processedCount} records.`,
            processedCount,
            errors: errors.length > 0 ? errors : undefined
        });
        
    } catch (error) {
        console.error('Error migrating players:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error migrating players', 
            error: error.message 
        });
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