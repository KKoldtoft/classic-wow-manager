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
    
    // Initialize events cache table
initializeEventsCacheTable();

// Initialize RPB tracking table
initializeRPBTrackingTable();
  })
  .catch(err => {
    console.error('Error connecting to PostgreSQL database:', err.stack);
    dbConnectionStatus = 'Failed to Connect';
  });

// Function to create events cache table if it doesn't exist
async function initializeEventsCacheTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events_cache (
        id SERIAL PRIMARY KEY,
        cache_key VARCHAR(100) UNIQUE NOT NULL,
        events_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      )
    `);
    console.log('✅ Events cache table initialized');
  } catch (error) {
    console.error('❌ Error creating events cache table:', error);
  }
}

// Function to create RPB tracking table if it doesn't exist
async function initializeRPBTrackingTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rpb_tracking (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(100) NOT NULL,
        log_url TEXT NOT NULL,
        rpb_status VARCHAR(20) DEFAULT 'pending',
        rpb_completed_at TIMESTAMP,
        archive_url TEXT,
        archive_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_id, log_url)
      )
    `);
    console.log('✅ RPB tracking table initialized');
  } catch (error) {
    console.error('❌ Error creating RPB tracking table:', error);
  }
}

// Events cache helper functions
const EVENTS_CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds
const EVENTS_CACHE_KEY = 'raid_helper_events';

async function getCachedEvents() {
  try {
    const result = await pool.query(
      'SELECT events_data, expires_at FROM events_cache WHERE cache_key = $1 AND expires_at > NOW()',
      [EVENTS_CACHE_KEY]
    );
    
    if (result.rows.length > 0) {
      console.log('💾 Using cached events data');
      return result.rows[0].events_data;
    }
    
    console.log('🔄 No valid cached events found');
    return null;
  } catch (error) {
    console.error('❌ Error retrieving cached events:', error);
    return null;
  }
}

async function setCachedEvents(eventsData) {
  try {
    const expiresAt = new Date(Date.now() + EVENTS_CACHE_TTL);
    
    await pool.query(`
      INSERT INTO events_cache (cache_key, events_data, expires_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (cache_key) 
      DO UPDATE SET 
        events_data = EXCLUDED.events_data,
        created_at = CURRENT_TIMESTAMP,
        expires_at = EXCLUDED.expires_at
    `, [EVENTS_CACHE_KEY, JSON.stringify(eventsData), expiresAt]);
    
    console.log('💾 Events cached successfully, expires at:', expiresAt.toISOString());
  } catch (error) {
    console.error('❌ Error caching events:', error);
  }
}

async function fetchEventsFromAPI() {
  const raidHelperApiKey = process.env.RAID_HELPER_API_KEY;
  if (!raidHelperApiKey) {
    throw new Error('RAID_HELPER_API_KEY is not set in environment variables.');
  }

  const discordGuildId = '777268886939893821';
  const nowUnixTimestamp = Math.floor(Date.now() / 1000);
  const oneYearInSeconds = 365 * 24 * 60 * 60;
  const futureUnixTimestamp = nowUnixTimestamp + oneYearInSeconds;

  console.log('🌐 Fetching fresh events from Raid-Helper API...');

  const response = await axios.get(
    `https://raid-helper.dev/api/v3/servers/${discordGuildId}/events`,
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

  return response.data.postedEvents || [];
}

async function enrichEventsWithChannelNames(events) {
  // Use global cache for channel names (10 minute TTL)
  if (!global.channelNameCache) {
    global.channelNameCache = new Map();
  }
  const channelNameCache = global.channelNameCache;
  const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
  
  // CRITICAL: Filter and sort events exactly like the frontend does
  const today = new Date();
  const upcomingEvents = events.filter(event => {
    if (!event.startTime) return false;
    const eventStartDate = new Date(parseInt(event.startTime) * 1000);
    return eventStartDate >= today;
  }).sort((a, b) => parseInt(a.startTime) - parseInt(b.startTime));
  
  // OPTIMIZATION: Only enrich the first 10 upcoming events to avoid rate limits
  const eventsToEnrich = upcomingEvents.slice(0, 10);
  const remainingEvents = upcomingEvents.slice(10);
  
  console.log(`📊 Filtered to ${upcomingEvents.length} upcoming events, processing ${eventsToEnrich.length} for channel names, skipping ${remainingEvents.length}`);
  
  // Helper function to fetch channel name with retry and rate limit handling
  const fetchChannelNameWithRetry = async (eventId, maxRetries = 3) => {
    const cacheKey = `channel_${eventId}`;
    const cached = channelNameCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`💾 Using cached channelName for event ${eventId}: "${cached.channelName}"`);
      return cached.channelName;
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Fetching channelName for event ${eventId} (attempt ${attempt}/${maxRetries})`);
        
        const eventDetailResponse = await axios.get(
          `https://raid-helper.dev/api/v2/events/${eventId}`,
          {
            headers: {
              'Authorization': `${process.env.RAID_HELPER_API_KEY}`,
              'User-Agent': 'ClassicWoWManagerApp/1.0.0 (Node.js)'
            },
            timeout: 8000
          }
        );
        
        const channelName = eventDetailResponse.data.channelName;
        console.log(`📡 API Response for event ${eventId}: channelName="${channelName}"`);
        
        if (channelName && 
            channelName.trim() && 
            channelName !== eventId &&
            !channelName.match(/^\d+$/)) {
          console.log(`✅ Valid channelName found: "${channelName}"`);
          
          channelNameCache.set(cacheKey, {
            channelName: channelName,
            timestamp: Date.now()
          });
          
          return channelName;
        }
        
        console.log(`⚠️ Invalid or empty channelName: "${channelName}"`);
        
        channelNameCache.set(cacheKey, {
          channelName: null,
          timestamp: Date.now()
        });
        
        return null;
        
      } catch (error) {
        console.log(`❌ Attempt ${attempt} failed for event ${eventId}:`, error.message);
        
        if (error.response && error.response.status === 429) {
          const rateLimitDelay = attempt * 2000;
          console.log(`🚦 Rate limit hit, waiting ${rateLimitDelay}ms before retry...`);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
            continue;
          }
        }
        
        if (attempt === maxRetries) {
          console.log(`💥 All ${maxRetries} attempts failed for event ${eventId}`);
          
          channelNameCache.set(cacheKey, {
            channelName: null,
            timestamp: Date.now()
          });
          
          return null;
        }
        
        const delay = attempt * 1500;
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return null;
  };
  
  // Enrich events with channel names
  const enrichedEvents = [];
  const startTime = Date.now();
  const TOTAL_TIMEOUT = 30000; // 30 second total timeout
  
  for (let i = 0; i < eventsToEnrich.length; i++) {
    const event = eventsToEnrich[i];
    
    if (Date.now() - startTime > TOTAL_TIMEOUT) {
      console.log(`⏰ Timeout reached, skipping remaining ${eventsToEnrich.length - i} events`);
      for (let j = i; j < eventsToEnrich.length; j++) {
        enrichedEvents.push({
          ...eventsToEnrich[j],
          channelName: null
        });
      }
      break;
    }
    
    try {
      const channelName = await fetchChannelNameWithRetry(event.id);
      console.log(`📋 Final result for event ${event.id}: channelName = "${channelName}"`);
      
      enrichedEvents.push({
        ...event,
        channelName: channelName
      });
      
      if (i < eventsToEnrich.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 750));
      }
      
    } catch (error) {
      console.log(`💀 Critical error processing event ${event.id}:`, error);
      enrichedEvents.push({
        ...event,
        channelName: null
      });
    }
  }
  
  // Add remaining upcoming events without channel names
  remainingEvents.forEach(event => {
    enrichedEvents.push({
      ...event,
      channelName: null
    });
  });
  
  // Add all past events without channel names
  const pastEvents = events.filter(event => {
    if (!event.startTime) return true;
    const eventStartDate = new Date(parseInt(event.startTime) * 1000);
    return eventStartDate < today;
  });
  
  pastEvents.forEach(event => {
    enrichedEvents.push({
      ...event,
      channelName: null
    });
  });
  
  const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`⏱️ Channel name processing completed in ${processingTime}s`);
  
  const totalEvents = enrichedEvents.length;
  const totalUpcomingEvents = upcomingEvents.length;
  const processedEvents = eventsToEnrich.length;
  const eventsWithChannelNames = enrichedEvents.filter(e => e.channelName).length;
  const successRate = processedEvents > 0 ? ((eventsWithChannelNames / processedEvents) * 100).toFixed(1) : 0;
  
  console.log(`📈 Channel name fetch summary: ${eventsWithChannelNames}/${processedEvents} processed upcoming events (${successRate}% success rate), ${totalUpcomingEvents} total upcoming, ${totalEvents} total returned`);
  
  return enrichedEvents;
}

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
    scope: ['identify', 'email', 'guilds', 'guilds.members.read']
},
(accessToken, refreshToken, profile, done) => {
    // Store the access token in the profile for later use
    profile.accessToken = accessToken;
    profile.refreshToken = refreshToken;
    return done(null, profile);
}));

// --- Role-Based Access Control Functions ---

// Your Discord server ID - update this with your actual server ID
const DISCORD_GUILD_ID = '777268886939893821'; // Your guild ID from the events API

// Define management role - the only role that matters
const MANAGEMENT_ROLE_NAME = 'Management';

// Function to fetch user's guild member data including roles (with caching)
async function fetchUserGuildMember(accessToken, guildId) {
    // Create cache key based on access token and guild ID
    const cacheKey = `${accessToken.substring(0, 10)}_${guildId}`;
    
    // Check cache first
    const cached = userMemberCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < USER_CACHE_TTL) {
        console.log(`💾 Using cached user member data (${cached.data.roles.length} roles)`);
        return cached.data;
    }

    try {
        console.log(`🔍 Fetching guild member data for guild ${guildId}`);
        const response = await axios.get(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'User-Agent': 'ClassicWoWManagerApp/1.0.0 (Node.js)'
            }
        });
        
        console.log(`✅ Guild member data received:`, response.data);
        
        // Cache the successful response
        userMemberCache.set(cacheKey, {
            data: response.data,
            timestamp: Date.now()
        });
        
        return response.data;
    } catch (error) {
        console.error('❌ Error fetching guild member data:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            message: error.message
        });
        
        // If we have stale cached data and it's a rate limit error, use the stale data
        if (error.response?.status === 429 && cached) {
            console.log(`⚠️ Rate limited, using stale cached data (${Math.floor((Date.now() - cached.timestamp) / 1000)}s old)`);
            return cached.data;
        }
        
        return null;
    }
}

// Cache for guild roles to avoid repeated API calls
let guildRolesCache = null;
let guildRolesCacheTime = 0;

// Cache for user member data to avoid repeated API calls
const userMemberCache = new Map();
const USER_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const GUILD_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Clean up old cache entries every 30 minutes
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, value] of userMemberCache.entries()) {
        if (now - value.timestamp > USER_CACHE_TTL * 2) { // Remove entries older than 30 minutes
            userMemberCache.delete(key);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} old cache entries`);
    }
}, 30 * 60 * 1000); // Run every 30 minutes

// Function to fetch guild roles to map role IDs to names
async function fetchGuildRoles(guildId) {
    // Check cache first
    if (guildRolesCache && (Date.now() - guildRolesCacheTime) < GUILD_CACHE_TTL) {
        console.log(`💾 Using cached guild roles (${guildRolesCache.length} roles)`);
        return guildRolesCache;
    }

    try {
        console.log(`🔍 Fetching guild roles for guild ${guildId}`);
        console.log(`🤖 Bot token configured: ${process.env.DISCORD_BOT_TOKEN ? 'Yes' : 'No'}`);
        
        if (!process.env.DISCORD_BOT_TOKEN) {
            console.log('⚠️ No bot token configured - cannot fetch guild roles');
            return [];
        }
        
        const response = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
            headers: {
                'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
                'User-Agent': 'ClassicWoWManagerApp/1.0.0 (Node.js)'
            }
        });
        
        console.log(`✅ Guild roles received: ${response.data.length} roles`);
        
        // Cache the results
        guildRolesCache = response.data;
        guildRolesCacheTime = Date.now();
        
        return response.data;
    } catch (error) {
        console.error('❌ Error fetching guild roles:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            message: error.message,
            botTokenExists: !!process.env.DISCORD_BOT_TOKEN
        });
        return [];
    }
}

// Check if user has Management role
async function hasManagementRole(accessToken) {
    const memberData = await fetchUserGuildMember(accessToken, DISCORD_GUILD_ID);
    if (!memberData || !memberData.roles) {
        console.log('❌ No member data or roles found');
        return false;
    }

    const guildRoles = await fetchGuildRoles(DISCORD_GUILD_ID);
    if (guildRoles.length === 0) {
        console.log('⚠️ No guild roles available - cannot verify Management role');
        return false;
    }
    
    const roleMap = new Map(guildRoles.map(role => [role.id, role.name]));

    // DEBUG: Show user's actual role names
    const userRoleNames = memberData.roles
        .map(roleId => roleMap.get(roleId))
        .filter(roleName => roleName !== undefined);
    console.log(`👤 User's actual role names: [${userRoleNames.join(', ')}]`);

    // Check if user has "Management" role
    const hasRole = memberData.roles.some(roleId => {
        const roleName = roleMap.get(roleId);
        return roleName === MANAGEMENT_ROLE_NAME;
    });
    
    console.log(`🔍 Checking for "${MANAGEMENT_ROLE_NAME}" role: ${hasRole ? '✅ FOUND' : '❌ NOT FOUND'}`);
    
    // DEBUG: Check for similar role names
    const similarRoles = userRoleNames.filter(name => 
        name.toLowerCase().includes('manage') || 
        name.toLowerCase().includes('admin') || 
        name.toLowerCase().includes('officer')
    );
    if (similarRoles.length > 0) {
        console.log(`💡 Found similar roles: [${similarRoles.join(', ')}]`);
    }
    
    return hasRole;
}

// Middleware to require Management role
async function requireManagement(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    const hasRole = await hasManagementRole(req.user.accessToken);
    if (!hasRole) {
        return res.status(403).json({ message: 'Management role required' });
    }

    next();
}

// --- Express Routes ---

// Add the JSON middleware to parse request bodies
app.use(express.json());

// 🎯 Discord API endpoints removed - we now get channel names directly from Raid-Helper API!

// Critical: Place express.static as the FIRST middleware to handle static files.
app.use(express.static('public'));

// Route to serve the Roster page for specific event IDs - HIGH PRIORITY
app.get('/event/:eventId/roster', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'roster.html'));
});

app.get('/players', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'players.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/guild-members', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'guild-members.html'));
});

app.get('/user-settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'user-settings.html'));
});

app.get('/logs', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'logs.html'));
});

app.get('/gold', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'gold.html'));
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

app.get('/user', async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      // Check if user has Management role
      console.log(`👤 Checking permissions for user ${req.user.username}`);
      const isManagement = await hasManagementRole(req.user.accessToken);

      res.json({
        loggedIn: true,
        id: req.user.id,
        username: req.user.username,
        discriminator: req.user.discriminator,
        avatar: req.user.avatar,
        email: req.user.email,
        hasManagementRole: isManagement,
        permissions: {
          canManage: isManagement
        }
      });
    } catch (error) {
      console.error('Error fetching user permissions:', error);
      // Fallback to basic user info if role fetching fails
      res.json({
        loggedIn: true,
        id: req.user.id,
        username: req.user.username,
        discriminator: req.user.discriminator,
        avatar: req.user.avatar,
        email: req.user.email,
        hasManagementRole: false,
        permissions: {
          canManage: false
        }
      });
    }
  } else {
    res.json({ loggedIn: false });
  }
});

app.get('/api/db-status', (req, res) => {
  res.json({ status: dbConnectionStatus });
});

// --- Role-Based Access Control Endpoints ---

// Endpoint to get user's permissions only
app.get('/api/user/permissions', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const isManagement = await hasManagementRole(req.user.accessToken);

    res.json({
      hasManagementRole: isManagement,
      permissions: {
        canManage: isManagement
      }
    });
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    res.status(500).json({ 
      message: 'Error fetching permissions',
      error: error.message 
    });
  }
});

// Management-only endpoint for user data
app.get('/api/management/users', requireManagement, async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT discord_id, character_name, class FROM players ORDER BY character_name');
    client.release();
    res.json({ 
      message: 'Management access granted',
      users: result.rows 
    });
  } catch (error) {
    console.error('Error fetching users:', error.stack);
    res.status(500).json({ message: 'Error fetching users from the database.' });
  }
});

// Management-only endpoint for roster statistics
app.get('/api/management/roster-stats', requireManagement, async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT 
        COUNT(DISTINCT event_id) as managed_events,
        COUNT(*) as total_roster_entries,
        COUNT(DISTINCT discord_user_id) as unique_players
      FROM roster_overrides
    `);
    client.release();
    res.json({ 
      message: 'Management access granted',
      stats: result.rows[0] 
    });
  } catch (error) {
    console.error('Error fetching roster stats:', error.stack);
    res.status(500).json({ message: 'Error fetching roster statistics.' });
  }
});

// Guild import preview endpoint - shows what will be added/removed/updated
app.post('/api/management/guild-import-preview', requireManagement, async (req, res) => {
  try {
    const { importData } = req.body;
    
    if (!importData || typeof importData !== 'string') {
      return res.status(400).json({ message: 'Import data is required' });
    }

    const client = await pool.connect();
    
    // Parse the import data
    const lines = importData.trim().split('\n');
    if (lines.length < 2) {
      client.release();
      return res.status(400).json({ message: 'Invalid import data format' });
    }

    // Skip header line and parse characters
    const importedChars = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].split(';');
      if (fields.length >= 17) {
        const level = parseInt(fields[2]);
        if (level === 60) { // Only import level 60 characters
          importedChars.push({
            character_name: fields[0],
            rank_name: fields[1],
            level: level,
            class: fields[3],
            race: fields[4],
            sex: fields[5],
            last_online_days: parseFloat(fields[6]) || null,
            main_alt: fields[7],
            player_alts: fields[8],
            join_date: fields[9],
            promo_date: fields[10],
            rank_history: fields[11],
            birthday: fields[12],
            public_note: fields[13],
            officer_note: fields[14],
            custom_note: fields[15],
            faction: fields[16]
          });
        }
      }
    }

    // Get current guildies from database
    const currentResult = await client.query('SELECT * FROM guildies');
    const currentGuildies = currentResult.rows;

    // Get players for discord ID matching
    const playersResult = await client.query('SELECT discord_id, character_name, class FROM players');
    const playersMap = new Map();
    playersResult.rows.forEach(player => {
      const key = `${player.character_name.toLowerCase()}_${player.class.toLowerCase()}`;
      playersMap.set(key, player.discord_id);
    });

    // Add discord_id to imported chars where possible
    importedChars.forEach(char => {
      const key = `${char.character_name.toLowerCase()}_${char.class.toLowerCase()}`;
      char.discord_id = playersMap.get(key) || null;
    });

    // Determine changes
    const currentCharMap = new Map(currentGuildies.map(char => [char.character_name, char]));
    const importedCharMap = new Map(importedChars.map(char => [char.character_name, char]));

    const toAdd = importedChars.filter(char => !currentCharMap.has(char.character_name));
    const toRemove = currentGuildies.filter(char => !importedCharMap.has(char.character_name));
    const toUpdate = [];

    // Check for updates
    for (const importedChar of importedChars) {
      const currentChar = currentCharMap.get(importedChar.character_name);
      if (currentChar) {
        // Compare relevant fields (excluding timestamps and discord_id changes)
        const hasChanges = (
          currentChar.rank_name !== importedChar.rank_name ||
          currentChar.level !== importedChar.level ||
          currentChar.class !== importedChar.class ||
          currentChar.race !== importedChar.race ||
          currentChar.sex !== importedChar.sex ||
          currentChar.last_online_days !== importedChar.last_online_days ||
          currentChar.main_alt !== importedChar.main_alt ||
          currentChar.player_alts !== importedChar.player_alts ||
          currentChar.join_date !== importedChar.join_date ||
          currentChar.promo_date !== importedChar.promo_date ||
          currentChar.rank_history !== importedChar.rank_history ||
          currentChar.birthday !== importedChar.birthday ||
          currentChar.public_note !== importedChar.public_note ||
          currentChar.officer_note !== importedChar.officer_note ||
          currentChar.custom_note !== importedChar.custom_note ||
          currentChar.faction !== importedChar.faction ||
          currentChar.discord_id !== importedChar.discord_id
        );

        if (hasChanges) {
          toUpdate.push({
            character_name: importedChar.character_name,
            changes: {
              old: currentChar,
              new: importedChar
            }
          });
        }
      }
    }

    client.release();

    res.json({
      success: true,
      summary: {
        totalImported: importedChars.length,
        toAdd: toAdd.length,
        toRemove: toRemove.length,
        toUpdate: toUpdate.length
      },
      changes: {
        toAdd,
        toRemove,
        toUpdate
      }
    });

  } catch (error) {
    console.error('Error previewing guild import:', error.stack);
    console.error('Error details:', error);
    res.status(500).json({ 
      message: 'Error processing guild import preview',
      error: error.message 
    });
  }
});

// Guild import execute endpoint - performs the actual import
app.post('/api/management/guild-import-execute', requireManagement, async (req, res) => {
  try {
    const { importData } = req.body;
    
    if (!importData || typeof importData !== 'string') {
      return res.status(400).json({ message: 'Import data is required' });
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Parse the import data (same logic as preview)
      const lines = importData.trim().split('\n');
      if (lines.length < 2) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ message: 'Invalid import data format' });
      }

      // Parse characters
      const importedChars = [];
      for (let i = 1; i < lines.length; i++) {
        const fields = lines[i].split(';');
        if (fields.length >= 17) {
          const level = parseInt(fields[2]);
          if (level === 60) {
            importedChars.push({
              character_name: fields[0],
              rank_name: fields[1],
              level: level,
              class: fields[3],
              race: fields[4],
              sex: fields[5],
              last_online_days: parseFloat(fields[6]) || null,
              main_alt: fields[7],
              player_alts: fields[8],
              join_date: fields[9],
              promo_date: fields[10],
              rank_history: fields[11],
              birthday: fields[12],
              public_note: fields[13],
              officer_note: fields[14],
              custom_note: fields[15],
              faction: fields[16]
            });
          }
        }
      }

      // Get players for discord ID matching
      const playersResult = await client.query('SELECT discord_id, character_name, class FROM players');
      const playersMap = new Map();
      playersResult.rows.forEach(player => {
        const key = `${player.character_name.toLowerCase()}_${player.class.toLowerCase()}`;
        playersMap.set(key, player.discord_id);
      });

      // Add discord_id to imported chars
      importedChars.forEach(char => {
        const key = `${char.character_name.toLowerCase()}_${char.class.toLowerCase()}`;
        char.discord_id = playersMap.get(key) || null;
      });

      // Clear existing guildies and insert new ones
      await client.query('DELETE FROM guildies');
      
      // Insert all imported characters
      for (const char of importedChars) {
        await client.query(`
          INSERT INTO guildies (
            character_name, rank_name, level, class, race, sex, last_online_days,
            main_alt, player_alts, join_date, promo_date, rank_history, birthday,
            public_note, officer_note, custom_note, faction, discord_id, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, CURRENT_TIMESTAMP)
          ON CONFLICT (character_name, class) 
          DO UPDATE SET 
            rank_name = EXCLUDED.rank_name,
            level = EXCLUDED.level,
            race = EXCLUDED.race,
            sex = EXCLUDED.sex,
            last_online_days = EXCLUDED.last_online_days,
            main_alt = EXCLUDED.main_alt,
            player_alts = EXCLUDED.player_alts,
            join_date = EXCLUDED.join_date,
            promo_date = EXCLUDED.promo_date,
            rank_history = EXCLUDED.rank_history,
            birthday = EXCLUDED.birthday,
            public_note = EXCLUDED.public_note,
            officer_note = EXCLUDED.officer_note,
            custom_note = EXCLUDED.custom_note,
            faction = EXCLUDED.faction,
            discord_id = EXCLUDED.discord_id,
            updated_at = CURRENT_TIMESTAMP
        `, [
          char.character_name, char.rank_name, char.level, char.class, char.race, char.sex,
          char.last_online_days, char.main_alt, char.player_alts, char.join_date, char.promo_date,
          char.rank_history, char.birthday, char.public_note, char.officer_note, char.custom_note,
          char.faction, char.discord_id
        ]);
      }

      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: `Successfully imported ${importedChars.length} guild members`,
        imported: importedChars.length
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error executing guild import:', error.stack);
    console.error('Error details:', error);
    res.status(500).json({ 
      message: 'Error executing guild import',
      error: error.message 
    });
  }
});

// Get all guild members - public endpoint
app.get('/api/guild-members', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT 
        character_name, 
        class, 
        level, 
        rank_name, 
        race, 
        sex,
        last_online_days,
        discord_id,
        CASE WHEN discord_id IS NOT NULL THEN true ELSE false END as has_discord_link
      FROM guildies 
      ORDER BY rank_name, character_name
    `);
    client.release();
    
    res.json({ 
      success: true,
      members: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching guild members:', error.stack);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching guild members',
      error: error.message 
    });
  }
});

// DEBUG: Endpoint to recreate guildies table with correct structure
app.get('/api/debug/recreate-guildies-table', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Drop existing table if it exists
    await client.query(`DROP TABLE IF EXISTS guildies CASCADE`);
    
    // Create guildies table with composite primary key
    await client.query(`
      CREATE TABLE guildies (
        character_name VARCHAR(255),
        rank_name VARCHAR(100),
        level INTEGER,
        class VARCHAR(50),
        race VARCHAR(50),
        sex VARCHAR(20),
        last_online_days DECIMAL,
        main_alt VARCHAR(50),
        player_alts TEXT,
        join_date VARCHAR(50),
        promo_date VARCHAR(50),
        rank_history TEXT,
        birthday VARCHAR(50),
        public_note TEXT,
        officer_note TEXT,
        custom_note TEXT,
        faction VARCHAR(20),
        discord_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (character_name, class)
      )
    `);
    
    // Create indexes
    await client.query(`CREATE INDEX idx_guildies_discord_id ON guildies (discord_id)`);
    await client.query(`CREATE INDEX idx_guildies_class_name ON guildies (class, character_name)`);
    
    client.release();
    
    res.json({
      success: true,
      message: 'Guildies table recreated successfully with composite primary key (character_name, class)!'
    });
  } catch (error) {
    console.error('Error recreating guildies table:', error);
    res.status(500).json({ 
      error: error.message,
      success: false 
    });
  }
});

// DEBUG: Endpoint to create guildies table if it doesn't exist
app.get('/api/debug/create-guildies-table', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Create guildies table
    await client.query(`
      CREATE TABLE IF NOT EXISTS guildies (
        character_name VARCHAR(255),
        rank_name VARCHAR(100),
        level INTEGER,
        class VARCHAR(50),
        race VARCHAR(50),
        sex VARCHAR(20),
        last_online_days DECIMAL,
        main_alt VARCHAR(50),
        player_alts TEXT,
        join_date VARCHAR(50),
        promo_date VARCHAR(50),
        rank_history TEXT,
        birthday VARCHAR(50),
        public_note TEXT,
        officer_note TEXT,
        custom_note TEXT,
        faction VARCHAR(20),
        discord_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (character_name, class)
      )
    `);
    
    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_guildies_discord_id ON guildies (discord_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_guildies_class_name ON guildies (class, character_name)`);
    
    client.release();
    
    res.json({
      success: true,
      message: 'Guildies table created successfully!'
    });
  } catch (error) {
    console.error('Error creating guildies table:', error);
    res.status(500).json({ 
      error: error.message,
      success: false 
    });
  }
});

// DEBUG: Endpoint to check guildies table
app.get('/api/debug/check-guildies-table', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Check if guildies table exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'guildies'
      )
    `);
    
    let tableInfo = null;
    if (tableExists.rows[0].exists) {
      // Get table structure
      tableInfo = await client.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'guildies'
        ORDER BY ordinal_position
      `);
      
      // Count existing records
      const countResult = await client.query('SELECT COUNT(*) FROM guildies');
      tableInfo.recordCount = countResult.rows[0].count;
    }
    
    client.release();
    
    res.json({
      tableExists: tableExists.rows[0].exists,
      tableInfo: tableInfo ? {
        columns: tableInfo.rows,
        recordCount: tableInfo.recordCount
      } : null
    });
  } catch (error) {
    console.error('Error checking guildies table:', error);
    res.status(500).json({ error: error.message });
  }
});

// DEBUG: Endpoint to clear all caches and check roles
app.get('/api/debug/clear-cache', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    // Clear both caches
    guildRolesCache = null;
    guildRolesCacheTime = 0;
    userMemberCache.clear();
    console.log('🧹 All caches cleared (guild roles + user member data)');

    // Check roles again with fresh data
    const isManagement = await hasManagementRole(req.user.accessToken);
    
    res.json({
      message: 'All caches cleared and roles rechecked',
      hasManagementRole: isManagement,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error during cache clear and role check:', error);
    res.status(500).json({ 
      message: 'Error during debug check',
      error: error.message 
    });
  }
});

// DEBUG: Cache status endpoint
app.get('/api/debug/cache-status', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const now = Date.now();
  const guildCacheAge = guildRolesCache ? Math.floor((now - guildRolesCacheTime) / 1000) : null;
  
  res.json({
    guildRoles: {
      cached: !!guildRolesCache,
      ageSeconds: guildCacheAge,
      roles: guildRolesCache ? guildRolesCache.length : 0
    },
    userMembers: {
      totalCached: userMemberCache.size,
      entries: Array.from(userMemberCache.entries()).map(([key, value]) => ({
        key: key,
        ageSeconds: Math.floor((now - value.timestamp) / 1000),
        roles: value.data.roles.length
      }))
    },
    cacheTtls: {
      userCacheTtlMinutes: USER_CACHE_TTL / (60 * 1000),
      guildCacheTtlMinutes: GUILD_CACHE_TTL / (60 * 1000)
    },
    timestamp: new Date().toISOString()
  });
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

// Search players by name (minimum 3 characters)
app.get('/api/players/search', async (req, res) => {
    const { q } = req.query;
    
    if (!q || q.length < 3) {
        return res.json([]);
    }
    
    try {
        const client = await pool.connect();
        const result = await client.query(
            `SELECT discord_id, character_name, class 
             FROM players 
             WHERE LOWER(character_name) LIKE LOWER($1) 
             AND discord_id IS NOT NULL AND discord_id != ''
             ORDER BY character_name 
             LIMIT 10`,
            [`%${q}%`]
        );
        client.release();
        res.json(result.rows);
    } catch (error) {
        console.error('Error searching players:', error.stack);
        res.status(500).json({ message: 'Error searching players from the database.' });
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

// UPDATED: Cached endpoint to fetch upcoming Raid-Helper events
app.get('/api/events', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized. Please sign in with Discord.' });
  }

  try {
    // Try to get cached events first
    const cachedEvents = await getCachedEvents();
    
    if (cachedEvents) {
      // Return cached data
      res.json({ scheduledEvents: cachedEvents });
      return;
    }
    
    // No cached data, fetch fresh data
    console.log('🔄 Cache miss - fetching fresh events data');
    const events = await fetchEventsFromAPI();
    const enrichedEvents = await enrichEventsWithChannelNames(events);
    
    // Cache the enriched events
    await setCachedEvents(enrichedEvents);
    
    res.json({ scheduledEvents: enrichedEvents });
    
  } catch (error) {
    console.error('Error in /api/events:', error.response ? error.response.data : error.message);
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

// Manual refresh endpoint for events cache
app.post('/api/events/refresh', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized. Please sign in with Discord.' });
  }

  try {
    console.log('🔄 Manual refresh requested - fetching fresh events data');
    
    // Fetch fresh data from API
    const events = await fetchEventsFromAPI();
    const enrichedEvents = await enrichEventsWithChannelNames(events);
    
    // Update the cache with fresh data
    await setCachedEvents(enrichedEvents);
    
    console.log('✅ Events cache refreshed successfully');
    
    res.json({ 
      message: 'Events refreshed successfully',
      scheduledEvents: enrichedEvents 
    });
    
  } catch (error) {
    console.error('Error refreshing events cache:', error.response ? error.response.data : error.message);
    res.status(error.response ? error.response.status : 500).json({
      message: 'Failed to refresh events.',
      error: error.response ? (error.response.data || error.message) : error.message
    });
  }
});

// RPB Google Apps Script Proxy Endpoint
app.post('/api/logs/rpb', async (req, res) => {
  try {
    const { action, logUrl } = req.body;
    
    if (!action) {
      return res.status(400).json({ 
        success: false, 
        error: 'Action is required' 
      });
    }

    // Google Apps Script Web App URL
    const rpbWebAppUrl = 'https://script.google.com/macros/s/AKfycbyilOtCQnVteduqKoRPSE0VNAne9tVPkQezaePajGMUiAiMNKmpn0flIdNBgL8tx5Eo/exec';
    
    // Prepare request data
    const requestData = { action };
    if (logUrl) {
      requestData.logUrl = logUrl;
    }

    console.log(`🔄 RPB ${action} request:`, requestData);
    
    // Ensure clearF11 action is allowed
    const allowedActions = ['startRPB', 'checkStatus', 'clearF11', 'archiveRPB'];
    if (!allowedActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: `Invalid action '${action}'. Must be one of: ${allowedActions.join(', ')}`
      });
    }

    // Make request to Google Apps Script
    const response = await axios({
      method: 'POST',
      url: rpbWebAppUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      data: requestData,
      timeout: action === 'startRPB' ? 400000 : 30000, // 6.5 min for startRPB, 30s for status checks
    });

    console.log(`✅ RPB ${action} response:`, response.data);

    // Return the response from Google Apps Script
    res.json(response.data);

  } catch (error) {
    console.error('❌ RPB proxy error:', error);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        success: false,
        error: 'RPB processing timed out. Please try again.'
      });
    }

    if (error.response) {
      // Google Apps Script returned an error
      return res.status(error.response.status).json({
        success: false,
        error: error.response.data || 'Google Apps Script error'
      });
    }

    // Network or other error
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to communicate with RPB service'
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
                        // Find the original roster position to get isConfirmed status
                        const originalRosterPlayer = rosterDataFromApi.raidDrop?.find(p => p?.userid === override.discord_user_id);
                        finalRosterPlayers.push({
                            ...basePlayer,
                            mainCharacterName: override.assigned_char_name,
                            class: override.assigned_char_class,
                            spec: override.assigned_char_spec,
                            spec_emote: override.assigned_char_spec_emote,
                            partyId: override.party_id,
                            slotId: override.slot_id,
                            color: override.player_color,
                            isConfirmed: originalRosterPlayer?.isConfirmed || false,
                            inRaid: override.in_raid || false,
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
                            status: 'confirmed', // Assume confirmed for manually added
                            isConfirmed: true, // Manually added players are confirmed
                            inRaid: override.in_raid || false
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

// Endpoint to toggle a player's "in raid" status
app.put('/api/roster/:eventId/player/:discordUserId/in-raid', async (req, res) => {
    const { eventId, discordUserId } = req.params;
    const { inRaid } = req.body;

    let client;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // First ensure the player exists in roster_overrides
        const checkResult = await client.query('SELECT in_raid FROM roster_overrides WHERE event_id = $1 AND discord_user_id = $2', [eventId, discordUserId]);

        if (checkResult.rows.length === 0) {
            // If player doesn't exist in overrides, we need to fork the roster first
            await forkRosterIfNeeded(eventId, client);
        }

        // Update the in_raid status
        await client.query(
            `UPDATE roster_overrides SET in_raid = $1 WHERE event_id = $2 AND discord_user_id = $3`,
            [inRaid, eventId, discordUserId]
        );

        await client.query('COMMIT');
        res.json({ message: 'Player in-raid status updated successfully.', inRaid });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error updating player in-raid status:', error);
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

// Endpoint to add an existing player to roster (from players table)
app.post('/api/roster/:eventId/add-existing-player', async (req, res) => {
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

        // Verify the player exists in the players table
        const playerExists = await client.query(
            'SELECT character_name, class FROM players WHERE discord_id = $1 AND LOWER(character_name) = LOWER($2) AND class = $3',
            [discordId, characterName, characterClass]
        );

        if (playerExists.rows.length === 0) {
            throw new Error(`Player "${characterName}" with class "${characterClass}" not found in players database`);
        }

        // Fork roster if needed
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

        // Insert the existing player into the roster (no need to add to players table - they already exist)
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
            message: 'Existing player added to roster successfully',
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
        console.error('Error adding existing player to roster:', error);
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
        
        // Create player_confirmed_logs table for storing confirmed raid participants
        await client.query(`
            CREATE TABLE IF NOT EXISTS player_confirmed_logs (
                raid_id VARCHAR(255),
                discord_id VARCHAR(255),
                character_name VARCHAR(255),
                character_class VARCHAR(50),
                confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (raid_id, discord_id)
            )
        `);

        // Create log_data table for storing damage and healing data from WoW logs
        await client.query(`
            CREATE TABLE IF NOT EXISTS log_data (
                event_id VARCHAR(255),
                character_name VARCHAR(255),
                character_class VARCHAR(50),
                discord_id VARCHAR(255),
                role_detected VARCHAR(50),
                role_source VARCHAR(50),
                spec_name VARCHAR(50),
                damage_amount BIGINT DEFAULT 0,
                healing_amount BIGINT DEFAULT 0,
                log_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (event_id, character_name)
            )
        `);

        // Create guildies table for guild member data
        await client.query(`
            CREATE TABLE IF NOT EXISTS guildies (
                character_name VARCHAR(255),
                rank_name VARCHAR(100),
                level INTEGER,
                class VARCHAR(50),
                race VARCHAR(50),
                sex VARCHAR(20),
                last_online_days DECIMAL,
                main_alt VARCHAR(50),
                player_alts TEXT,
                join_date VARCHAR(50),
                promo_date VARCHAR(50),
                rank_history TEXT,
                birthday VARCHAR(50),
                public_note TEXT,
                officer_note TEXT,
                custom_note TEXT,
                faction VARCHAR(20),
                discord_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (character_name, class)
            )
        `);
        
        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_players_discord_id ON players (discord_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_roster_overrides_event_id ON roster_overrides (event_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_player_confirmed_logs_raid_id ON player_confirmed_logs (raid_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_log_data_event_id ON log_data (event_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_guildies_discord_id ON guildies (discord_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_guildies_class_name ON guildies (class, character_name)
        `);
        
        // Fix column size for spec emotes (Discord IDs can be 17-19 chars)
        await client.query(`
            ALTER TABLE roster_overrides 
            ALTER COLUMN assigned_char_spec_emote TYPE VARCHAR(50)
        `);
        
        // Add in_raid column for tracking who has joined the group in-game
        await client.query(`
            ALTER TABLE roster_overrides 
            ADD COLUMN IF NOT EXISTS in_raid BOOLEAN DEFAULT FALSE
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

// === CONFIRMED LOGS API ENDPOINTS ===

// Store confirmed player in logs
app.post('/api/confirmed-logs/:raidId/player', async (req, res) => {
    const { raidId } = req.params;
    const { discordId, characterName, characterClass } = req.body;
    
    console.log(`📝 [CONFIRM LOGS] Storing player: raidId=${raidId}, discordId=${discordId}, name=${characterName}, class=${characterClass}`);
    
    if (!discordId || !characterName || !characterClass) {
        console.error('❌ [CONFIRM LOGS] Missing required fields:', { raidId, discordId, characterName, characterClass });
        return res.status(400).json({ 
            success: false, 
            message: 'Missing required fields: discordId, characterName, characterClass' 
        });
    }
    
    let client;
    try {
        client = await pool.connect();
        console.log('✅ [CONFIRM LOGS] Database connected');
        
        // First check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'player_confirmed_logs'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('🔧 [CONFIRM LOGS] Table does not exist, creating...');
            await client.query(`
                CREATE TABLE player_confirmed_logs (
                    raid_id VARCHAR(255),
                    discord_id VARCHAR(255),
                    character_name VARCHAR(255),
                    character_class VARCHAR(50),
                    manually_matched BOOLEAN DEFAULT false,
                    confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (raid_id, discord_id)
                )
            `);
            console.log('✅ [CONFIRM LOGS] Table created successfully');
        } else {
            // Check if manually_matched column exists, add it if not
            const columnCheck = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'player_confirmed_logs' 
                AND column_name = 'manually_matched'
            `);
            
            if (columnCheck.rows.length === 0) {
                console.log('🔧 [CONFIRM LOGS] Adding manually_matched column...');
                await client.query(`
                    ALTER TABLE player_confirmed_logs 
                    ADD COLUMN manually_matched BOOLEAN DEFAULT false
                `);
                console.log('✅ [CONFIRM LOGS] Column added successfully');
            }
        }
        
        // Insert or update the confirmed player (manual match)
        const result = await client.query(`
            INSERT INTO player_confirmed_logs (raid_id, discord_id, character_name, character_class, manually_matched)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (raid_id, discord_id) 
            DO UPDATE SET 
                character_name = EXCLUDED.character_name,
                character_class = EXCLUDED.character_class,
                manually_matched = EXCLUDED.manually_matched,
                confirmed_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [raidId, discordId, characterName, characterClass, true]);
        
        console.log('✅ [CONFIRM LOGS] Player stored successfully:', result.rows[0]);
        res.json({ success: true, player: result.rows[0] });
        
    } catch (error) {
        console.error('❌ [CONFIRM LOGS] Error storing confirmed player:', error);
        console.error('❌ [CONFIRM LOGS] Error details:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            detail: error.detail
        });
        res.status(500).json({ 
            success: false, 
            message: 'Error storing confirmed player',
            error: error.message,
            detail: error.detail || 'No additional details'
        });
    } finally {
        if (client) client.release();
    }
});

// Get confirmed players for a raid
app.get('/api/confirmed-logs/:raidId/players', async (req, res) => {
    const { raidId } = req.params;
    const { manually_matched } = req.query;
    
    console.log(`🔍 [CONFIRM LOGS] Getting confirmed players for raid: ${raidId}, manually_matched: ${manually_matched}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'player_confirmed_logs'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [CONFIRM LOGS] Table does not exist, returning empty array');
            return res.json({ success: true, data: [] });
        }
        
        // Build query based on manually_matched filter
        let query = `SELECT * FROM player_confirmed_logs WHERE raid_id = $1`;
        let params = [raidId];
        
        if (manually_matched === 'true') {
            query += ` AND manually_matched = true`;
        } else if (manually_matched === 'false') {
            query += ` AND manually_matched = false`;
        }
        
        query += ` ORDER BY confirmed_at DESC`;
        
        const result = await client.query(query, params);
        
        console.log(`✅ [CONFIRM LOGS] Found ${result.rows.length} confirmed players for raid ${raidId}`);
        res.json({ success: true, data: result.rows });
        
    } catch (error) {
        console.error('❌ [CONFIRM LOGS] Error fetching confirmed players:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching confirmed players',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Bulk store automatically matched players
app.post('/api/confirmed-logs/:raidId/players/bulk', async (req, res) => {
    const { raidId } = req.params;
    const { players } = req.body;
    
    console.log(`📝 [CONFIRM LOGS] Bulk storing ${players?.length || 0} auto-matched players for raid: ${raidId}`);
    
    if (!players || !Array.isArray(players) || players.length === 0) {
        return res.status(400).json({ 
            success: false, 
            message: 'Players array is required and must not be empty' 
        });
    }
    
    let client;
    try {
        client = await pool.connect();
        
        // Ensure table exists (same logic as before)
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'player_confirmed_logs'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('🔧 [CONFIRM LOGS] Table does not exist, creating...');
            await client.query(`
                CREATE TABLE player_confirmed_logs (
                    raid_id VARCHAR(255),
                    discord_id VARCHAR(255),
                    character_name VARCHAR(255),
                    character_class VARCHAR(50),
                    manually_matched BOOLEAN DEFAULT false,
                    confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (raid_id, discord_id)
                )
            `);
            console.log('✅ [CONFIRM LOGS] Table created successfully');
        } else {
            // Check if manually_matched column exists
            const columnCheck = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'player_confirmed_logs' 
                AND column_name = 'manually_matched'
            `);
            
            if (columnCheck.rows.length === 0) {
                console.log('🔧 [CONFIRM LOGS] Adding manually_matched column...');
                await client.query(`
                    ALTER TABLE player_confirmed_logs 
                    ADD COLUMN manually_matched BOOLEAN DEFAULT false
                `);
                console.log('✅ [CONFIRM LOGS] Column added successfully');
            }
        }
        
        let insertedCount = 0;
        let updatedCount = 0;
        
        // Insert each player (automatically matched = false for manually_matched)
        for (const player of players) {
            const { discordId, characterName, characterClass } = player;
            
            if (!discordId || !characterName || !characterClass) {
                console.warn('⚠️ [CONFIRM LOGS] Skipping player with missing data:', player);
                continue;
            }
            
            const result = await client.query(`
                INSERT INTO player_confirmed_logs (raid_id, discord_id, character_name, character_class, manually_matched)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (raid_id, discord_id) 
                DO UPDATE SET 
                    character_name = EXCLUDED.character_name,
                    character_class = EXCLUDED.character_class,
                    manually_matched = CASE 
                        WHEN player_confirmed_logs.manually_matched = true THEN true 
                        ELSE EXCLUDED.manually_matched 
                    END,
                    confirmed_at = CURRENT_TIMESTAMP
                RETURNING *
            `, [raidId, discordId, characterName, characterClass, false]);
            
            if (result.rows.length > 0) {
                insertedCount++;
            }
        }
        
        console.log(`✅ [CONFIRM LOGS] Bulk operation completed: ${insertedCount} players processed`);
        res.json({ 
            success: true, 
            message: `Processed ${insertedCount} automatically matched players`,
            inserted: insertedCount
        });
        
    } catch (error) {
        console.error('❌ [CONFIRM LOGS] Error bulk storing players:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error bulk storing players',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Clear confirmed players for a raid (reset functionality)
app.delete('/api/confirmed-logs/:raidId/players', async (req, res) => {
    const { raidId } = req.params;
    
    console.log(`🗑️ [CONFIRM LOGS] Clearing confirmed players for raid: ${raidId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        const result = await client.query(
            `DELETE FROM player_confirmed_logs WHERE raid_id = $1 RETURNING *`,
            [raidId]
        );
        
        console.log(`✅ [CONFIRM LOGS] Cleared ${result.rows.length} confirmed players for raid ${raidId}`);
        res.json({ 
            success: true, 
            message: `Cleared ${result.rows.length} confirmed players`,
            data: result.rows
        });
        
    } catch (error) {
        console.error('❌ [CONFIRM LOGS] Error clearing confirmed players:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error clearing confirmed players',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get all confirmed players for the gold pot page
app.get('/api/confirmed-logs/:raidId/all-players', async (req, res) => {
    const { raidId } = req.params;
    
    console.log(`🏆 [GOLD POT] Getting all confirmed players for raid: ${raidId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'player_confirmed_logs'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [GOLD POT] Table does not exist, returning empty array');
            return res.json({ success: true, data: [] });
        }
        
        const result = await client.query(
            `SELECT discord_id, character_name, character_class, manually_matched, confirmed_at 
             FROM player_confirmed_logs 
             WHERE raid_id = $1 
             ORDER BY character_class, character_name`,
            [raidId]
        );
        
        console.log(`✅ [GOLD POT] Found ${result.rows.length} confirmed players for gold pot`);
        res.json({ success: true, data: result.rows });
        
    } catch (error) {
        console.error('❌ [GOLD POT] Error fetching confirmed players:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching confirmed players for gold pot',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Store log data (damage and healing) for an event
app.post('/api/log-data/:eventId/store', async (req, res) => {
    const { eventId } = req.params;
    const { logData } = req.body;
    
    console.log(`💾 [LOG DATA] Storing log data for event: ${eventId}`);
    console.log(`💾 [LOG DATA] Received ${logData?.length || 0} player records`);
    
    let client;
    try {
        client = await pool.connect();
        
        // First, clear existing data for this event
        await client.query('DELETE FROM log_data WHERE event_id = $1', [eventId]);
        console.log(`🗑️ [LOG DATA] Cleared existing data for event: ${eventId}`);
        
        if (!logData || logData.length === 0) {
            return res.json({ success: true, message: 'No data to store' });
        }
        
        // Insert new data
        for (const player of logData) {
            await client.query(`
                INSERT INTO log_data (
                    event_id, character_name, character_class, discord_id, 
                    role_detected, role_source, spec_name, damage_amount, 
                    healing_amount, log_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (event_id, character_name) 
                DO UPDATE SET
                    character_class = EXCLUDED.character_class,
                    discord_id = EXCLUDED.discord_id,
                    role_detected = EXCLUDED.role_detected,
                    role_source = EXCLUDED.role_source,
                    spec_name = EXCLUDED.spec_name,
                    damage_amount = EXCLUDED.damage_amount,
                    healing_amount = EXCLUDED.healing_amount,
                    log_id = EXCLUDED.log_id,
                    created_at = CURRENT_TIMESTAMP
            `, [
                eventId,
                player.characterName,
                player.characterClass,
                player.discordId,
                player.roleDetected,
                player.roleSource,
                player.specName,
                player.damageAmount || 0,
                player.healingAmount || 0,
                player.logId
            ]);
        }
        
        console.log(`✅ [LOG DATA] Successfully stored ${logData.length} player records`);
        res.json({ 
            success: true, 
            message: `Stored log data for ${logData.length} players`,
            eventId: eventId
        });
        
    } catch (error) {
        console.error('❌ [LOG DATA] Error storing log data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error storing log data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Retrieve stored log data for an event
app.get('/api/log-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`📖 [LOG DATA] Retrieving log data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'log_data'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [LOG DATA] Table does not exist, returning empty data');
            return res.json({ success: true, data: [], hasData: false });
        }
        
        const result = await client.query(`
            SELECT 
                character_name, character_class, discord_id, role_detected, 
                role_source, spec_name, damage_amount, healing_amount, 
                log_id, created_at
            FROM log_data 
            WHERE event_id = $1 
            ORDER BY damage_amount DESC, healing_amount DESC
        `, [eventId]);
        
        const hasData = result.rows.length > 0;
        console.log(`📊 [LOG DATA] Found ${result.rows.length} player records for event: ${eventId}`);
        
        res.json({ 
            success: true, 
            data: result.rows,
            hasData: hasData,
            eventId: eventId
        });
        
    } catch (error) {
        console.error('❌ [LOG DATA] Error retrieving log data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving log data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Search players from database (similar to roster functionality)
app.get('/api/search-players', async (req, res) => {
    const { query } = req.query;
    
    if (!query || query.length < 2) {
        return res.json([]);
    }
    
    let client;
    try {
        client = await pool.connect();
        
        const result = await client.query(`
            SELECT DISTINCT discord_id, character_name, class
            FROM players 
            WHERE LOWER(character_name) LIKE LOWER($1)
            ORDER BY character_name
            LIMIT 20
        `, [`%${query}%`]);
        
        res.json(result.rows);
        
    } catch (error) {
        console.error('Error searching players:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error searching players',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Add new character to database (similar to roster functionality)
app.post('/api/add-character', async (req, res) => {
    const { discordId, characterName, characterClass } = req.body;
    
    if (!discordId || !characterName || !characterClass) {
        return res.status(400).json({ 
            success: false, 
            message: 'Missing required fields: discordId, characterName, characterClass' 
        });
    }
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if character already exists
        const existingPlayer = await client.query(
            'SELECT discord_id FROM players WHERE LOWER(character_name) = LOWER($1) AND LOWER(class) = LOWER($2)',
            [characterName, characterClass]
        );
        
        if (existingPlayer.rows.length > 0) {
            return res.status(409).json({ 
                success: false, 
                message: 'Character already exists',
                existingDiscordId: existingPlayer.rows[0].discord_id
            });
        }
        
        // Insert new character
        await client.query(
            'INSERT INTO players (discord_id, character_name, class) VALUES ($1, $2, $3)',
            [discordId, characterName, characterClass]
        );
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error adding character:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error adding character',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Raid-Helper API proxy endpoint for CORS
app.get('/api/raid-helper/events/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    try {
        console.log(`🔄 Proxying Raid-Helper request for event: ${eventId}`);
        
        const response = await axios.get(`https://raid-helper.dev/api/v2/events/${eventId}`, {
            timeout: 10000,
            headers: { 
                'Authorization': process.env.RAID_HELPER_API_KEY,
                'User-Agent': 'ClassicWoWManagerApp/1.0.0 (Node.js)'
            }
        });
        
        console.log(`✅ Raid-Helper data fetched successfully for event: ${eventId}`);
        res.json(response.data);
        
    } catch (error) {
        console.error(`❌ Failed to fetch Raid-Helper data for event ${eventId}:`, error.message);
        
        if (error.response) {
            // API responded with error status
            res.status(error.response.status).json({
                error: 'Raid-Helper API error',
                message: error.response.data?.message || error.message,
                status: error.response.status
            });
        } else {
            // Network or other error
            res.status(500).json({
                error: 'Failed to fetch Raid-Helper data',
                message: error.message
            });
        }
    }
});

// Google Apps Script proxy endpoint for RPB archiving
app.post('/api/logs/rpb-archive', async (req, res) => {
    console.log('📁 [RPB ARCHIVE] Starting Google Apps Script proxy request');
    
    try {
        // Get the Google Apps Script URL from environment variables
        const scriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
        
        if (!scriptUrl) {
            console.error('❌ [RPB ARCHIVE] GOOGLE_APPS_SCRIPT_URL not configured in environment');
            return res.status(500).json({
                success: false,
                error: 'Google Apps Script URL not configured'
            });
        }
        
        console.log('🔄 [RPB ARCHIVE] Calling Google Apps Script:', scriptUrl);
        
        // Make the request to Google Apps Script
        const response = await fetch(scriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'createRpbBackup'
            })
        });
        
        if (!response.ok) {
            throw new Error(`Google Apps Script request failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('✅ [RPB ARCHIVE] Google Apps Script response:', result);
        
        // Return the result from Google Apps Script
        res.json(result);
        
    } catch (error) {
        console.error('❌ [RPB ARCHIVE] Error calling Google Apps Script:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create RPB backup'
        });
    }
});

// --- RPB Tracking Endpoints ---

// Get RPB status for an event
app.get('/api/rpb-tracking/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    console.log(`📊 [RPB TRACKING] Getting RPB status for event: ${eventId}`);
    
    const result = await pool.query(
      'SELECT * FROM rpb_tracking WHERE event_id = $1 ORDER BY created_at DESC LIMIT 1',
      [eventId]
    );
    
    if (result.rows.length === 0) {
      console.log(`📊 [RPB TRACKING] No RPB tracking found for event: ${eventId}`);
      return res.json({
        success: true,
        hasRPB: false,
        status: null
      });
    }
    
    const tracking = result.rows[0];
    console.log(`📊 [RPB TRACKING] Found RPB tracking for event ${eventId}: ${tracking.rpb_status}`);
    
    res.json({
      success: true,
      hasRPB: true,
      status: tracking.rpb_status,
      logUrl: tracking.log_url,
      completedAt: tracking.rpb_completed_at,
      archiveUrl: tracking.archive_url,
      archiveName: tracking.archive_name
    });
    
  } catch (error) {
    console.error('❌ [RPB TRACKING] Error getting RPB status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update RPB status for an event
app.post('/api/rpb-tracking/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { logUrl, status, archiveUrl, archiveName } = req.body;
    
    console.log(`📊 [RPB TRACKING] Updating RPB status for event ${eventId}: ${status}`);
    
    // First, try to insert a new record
    try {
      const insertResult = await pool.query(
        `INSERT INTO rpb_tracking (event_id, log_url, rpb_status, rpb_completed_at, archive_url, archive_name)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          eventId, 
          logUrl, 
          status, 
          status === 'completed' ? new Date() : null,
          archiveUrl || null,
          archiveName || null
        ]
      );
      
      console.log(`✅ [RPB TRACKING] Created new RPB tracking for event ${eventId}`);
      return res.json({
        success: true,
        tracking: insertResult.rows[0]
      });
      
    } catch (insertError) {
      // If insert fails due to unique constraint, update instead
      if (insertError.code === '23505') { // unique_violation
        console.log(`📊 [RPB TRACKING] Record exists, updating RPB tracking for event ${eventId}`);
        
        const updateResult = await pool.query(
          `UPDATE rpb_tracking 
           SET rpb_status = $3, 
               rpb_completed_at = $4,
               archive_url = COALESCE($5, archive_url),
               archive_name = COALESCE($6, archive_name),
               updated_at = CURRENT_TIMESTAMP
           WHERE event_id = $1 AND log_url = $2
           RETURNING *`,
          [
            eventId, 
            logUrl, 
            status, 
            status === 'completed' ? new Date() : null,
            archiveUrl,
            archiveName
          ]
        );
        
        console.log(`✅ [RPB TRACKING] Updated RPB tracking for event ${eventId}`);
        return res.json({
          success: true,
          tracking: updateResult.rows[0]
        });
      } else {
        throw insertError;
      }
    }
    
  } catch (error) {
    console.error('❌ [RPB TRACKING] Error updating RPB status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// This route will handle both the root path ('/') AND any other unmatched paths,
// serving events.html. It MUST be the LAST route definition in your application.
// BUT exclude API routes to avoid interfering with API endpoints.
app.get('*', (req, res) => {
  // Don't catch API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
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