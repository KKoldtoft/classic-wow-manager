// index.cjs
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { Pool } = require('pg');
const path = require('path');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// --- Warcraft Logs API (v2 GraphQL) Configuration ---
const WCL_TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const WCL_API_URL = 'https://classic.warcraftlogs.com/api/v2/client'; // default for Classic
const WCL_CLIENT_ID = process.env.WCL_CLIENT_ID;
const WCL_CLIENT_SECRET = process.env.WCL_CLIENT_SECRET;

let wclAccessToken = null;
let wclTokenExpiresAt = 0; // epoch ms
const reportMetaCache = new Map(); // key: `${apiUrl}::${reportCode}` -> { actorsById, abilitiesById, fetchedAt }

// --- Live View shared state (in-memory) ---
let activeLive = null; // { reportInput: string, startedAt: number, startedBy: { id, username } }

async function getWclAccessToken() {
  if (!WCL_CLIENT_ID || !WCL_CLIENT_SECRET) {
    throw new Error('Missing WCL_CLIENT_ID or WCL_CLIENT_SECRET env vars');
  }
  const now = Date.now();
  if (wclAccessToken && now < (wclTokenExpiresAt - 60000)) {
    return wclAccessToken;
  }
  const form = new URLSearchParams();
  form.append('grant_type', 'client_credentials');
  const response = await axios.post(WCL_TOKEN_URL, form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    auth: { username: WCL_CLIENT_ID, password: WCL_CLIENT_SECRET },
    timeout: 20000
  });
  const data = response.data || {};
  if (!data.access_token) {
    throw new Error('Failed to obtain Warcraft Logs access token');
  }
  wclAccessToken = data.access_token;
  const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  wclTokenExpiresAt = now + (expiresInSec * 1000);
  return wclAccessToken;
}

function getWclApiUrlFromInput(input) {
  const str = String(input || '');
  const lower = str.toLowerCase();
  // Handle raw host paths without scheme, or full URLs
  if (lower.includes('vanilla.warcraftlogs.com')) return 'https://vanilla.warcraftlogs.com/api/v2/client';
  if (lower.includes('classic.warcraftlogs.com')) return 'https://classic.warcraftlogs.com/api/v2/client';
  if (lower.includes('www.warcraftlogs.com') || lower.includes('warcraftlogs.com/reports/')) return 'https://www.warcraftlogs.com/api/v2/client';
  // Try URL parsing as a fallback (in case of other subdomains)
  try {
    const u = new URL(str.startsWith('http') ? str : `https://${str}`);
    const host = (u.hostname || '').toLowerCase();
    if (host.includes('vanilla.warcraftlogs.com')) return 'https://vanilla.warcraftlogs.com/api/v2/client';
    if (host.includes('classic.warcraftlogs.com')) return 'https://classic.warcraftlogs.com/api/v2/client';
    if (host.includes('www.warcraftlogs.com')) return 'https://www.warcraftlogs.com/api/v2/client';
  } catch (_) {}
  return WCL_API_URL; // default to Classic
}

function extractWclReportCode(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  const match = trimmed.match(/\/reports\/([A-Za-z0-9]{16,})/);
  if (match && match[1]) return match[1];
  const codeOnly = trimmed.replace(/^https?:\/\//i, '').split(/[?#\s]/)[0];
  if (/^[A-Za-z0-9]+$/.test(codeOnly)) return codeOnly;
  return null;
}

async function fetchWclEventsPage(params) {
  const { reportCode, startTime, endTime, apiUrl } = params;
  const token = await getWclAccessToken();
  const query = `query($code: String!, $start: Float!, $end: Float!) {
    reportData {
      report(code: $code) {
        startTime
        events(startTime: $start, endTime: $end) {
          data
          nextPageTimestamp
        }
      }
    }
  }`;
  const variables = { code: reportCode, start: Math.max(0, Number(startTime || 0)), end: Math.max(0, Number(endTime || 0)) };
  let resp;
  try {
    resp = await axios.post(apiUrl || WCL_API_URL, { query, variables }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  } catch (err) {
    const status = err.response && err.response.status;
    const data = err.response && err.response.data;
    const details = typeof data === 'object' ? JSON.stringify(data) : String(data || '');
    throw new Error(`HTTP error from WCL API ${status || ''}: ${details}`.trim());
  }
  const body = resp.data;
  if (body.errors) {
    const message = body.errors.map(e => e.message).join('; ');
    throw new Error(`Warcraft Logs GraphQL error: ${message}`);
  }
  const report = body && body.data && body.data.reportData && body.data.reportData.report;
  if (!report || !report.events) {
    throw new Error('Invalid Warcraft Logs response');
  }
  return {
    reportStartTime: report.startTime,
    events: Array.isArray(report.events.data) ? report.events.data : [],
    nextPageTimestamp: report.events.nextPageTimestamp != null ? report.events.nextPageTimestamp : null
  };
}

async function fetchWclEarliestFightStart(params) {
  const { reportCode, apiUrl } = params;
  const token = await getWclAccessToken();
  const query = `query($code: String!) {\n    reportData {\n      report(code: $code) {\n        fights { startTime }\n      }\n    }\n  }`;
  const variables = { code: reportCode };
  const resp = await axios.post(apiUrl || WCL_API_URL, { query, variables }, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    timeout: 20000
  });
  const body = resp.data;
  if (body.errors) {
    return 0; // fallback to start
  }
  const fights = body && body.data && body.data.reportData && body.data.reportData.report && body.data.reportData.report.fights;
  if (!Array.isArray(fights) || fights.length === 0) return 0;
  let minStart = Infinity;
  for (const f of fights) {
    if (f && typeof f.startTime === 'number' && f.startTime < minStart) minStart = f.startTime;
  }
  if (!isFinite(minStart)) return 0;
  return Math.max(0, Math.floor(minStart));
}

async function fetchWclReportMeta(params) {
  const { reportCode, apiUrl } = params;
  const cacheKey = `${apiUrl || WCL_API_URL}::${reportCode}`;
  const cached = reportMetaCache.get(cacheKey);
  if (cached && (Date.now() - cached.fetchedAt) < 60 * 60 * 1000) { // 1 hour
    return cached;
  }
  const token = await getWclAccessToken();
  const query = `query($code: String!) {\n    reportData {\n      report(code: $code) {\n        masterData {\n          actors { id name type subType }\n          abilities { gameID name type }\n        }\n      }\n    }\n  }`;
  const variables = { code: reportCode };
  let resp;
  try {
    resp = await axios.post(apiUrl || WCL_API_URL, { query, variables }, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 30000
    });
  } catch (err) {
    // On failure, return empty meta to avoid blocking
    return { actorsById: {}, abilitiesById: {}, fetchedAt: Date.now(), partial: true };
  }
  const body = resp.data;
  const report = body && body.data && body.data.reportData && body.data.reportData.report;
  const master = report && report.masterData;
  const actors = (master && Array.isArray(master.actors)) ? master.actors : [];
  const abilities = (master && Array.isArray(master.abilities)) ? master.abilities : [];
  const actorsById = {};
  for (const a of actors) {
    if (a && a.id != null) actorsById[a.id] = { name: a.name || String(a.id), type: a.type || null, subType: a.subType || null };
  }
  const abilitiesById = {};
  for (const ab of abilities) {
    if (ab && ab.gameID != null) abilitiesById[ab.gameID] = { name: ab.name || String(ab.gameID), type: ab.type || null };
  }
  const meta = { actorsById, abilitiesById, fetchedAt: Date.now() };
  reportMetaCache.set(cacheKey, meta);
  return meta;
}

async function fetchWclFights(params) {
  const { reportCode, apiUrl } = params;
  const token = await getWclAccessToken();
  const query = `query($code: String!) {\n    reportData {\n      report(code: $code) {\n        fights { id encounterID name startTime endTime kill }\n      }\n    }\n  }`;
  const variables = { code: reportCode };
  let resp;
  try {
    resp = await axios.post(apiUrl || WCL_API_URL, { query, variables }, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 30000
    });
  } catch (err) {
    const status = err.response && err.response.status;
    const data = err.response && err.response.data;
    const details = typeof data === 'object' ? JSON.stringify(data) : String(data || '');
    throw new Error(`HTTP error from WCL API ${status || ''}: ${details}`.trim());
  }
  const body = resp.data;
  if (body.errors) {
    const message = body.errors.map(e => e.message).join('; ');
    throw new Error(`Warcraft Logs GraphQL error: ${message}`);
  }
  const fights = body && body.data && body.data.reportData && body.data.reportData.report && body.data.reportData.report.fights;
  return Array.isArray(fights) ? fights : [];
}

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// --- Cloudinary Configuration ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

// Initialize Raid-Helper events cache table
initializeRaidHelperEventsCacheTable();

    // Initialize raid durations table
initializeRaidDurationsTable();

    // Initialize assignments tables
    initializeAssignmentsTables();

// Migrate player confirmed logs table
migratePlayerConfirmedLogsTable();
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

// Assignments tables initialization
async function initializeAssignmentsTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS raid_assignments (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(100) NOT NULL,
        dungeon TEXT NOT NULL,
        wing TEXT NOT NULL DEFAULT '',
        boss TEXT NOT NULL,
        strategy_text TEXT,
        image_url TEXT,
        image_url_full TEXT,
        boss_icon_url TEXT,
        video_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_id, dungeon, wing, boss)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS raid_assignment_entries (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(100) NOT NULL,
        dungeon TEXT NOT NULL,
        wing TEXT NOT NULL DEFAULT '',
        boss TEXT NOT NULL,
        character_name TEXT NOT NULL,
        class_name TEXT,
        class_color TEXT,
        spec_name TEXT,
        spec_emote TEXT,
        marker_icon_url TEXT,
        assignment TEXT,
        sort_index INTEGER DEFAULT 0,
        character_discord_id TEXT,
        accept_status TEXT,
        accept_set_by TEXT,
        accept_updated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS raid_assignment_entry_accepts (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(100) NOT NULL,
        dungeon TEXT NOT NULL,
        wing TEXT NOT NULL DEFAULT '',
        boss TEXT NOT NULL,
        character_name TEXT NOT NULL,
        accept_status TEXT,
        accept_set_by TEXT,
        accept_updated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_id, dungeon, wing, boss, character_name)
      );
    `);
    // Ensure new columns exist when upgrading
    await pool.query(`ALTER TABLE raid_assignment_entries ADD COLUMN IF NOT EXISTS marker_icon_url TEXT`);
    await pool.query(`ALTER TABLE raid_assignment_entries ADD COLUMN IF NOT EXISTS character_discord_id TEXT`);
    await pool.query(`ALTER TABLE raid_assignment_entries ADD COLUMN IF NOT EXISTS accept_status TEXT`);
    await pool.query(`ALTER TABLE raid_assignment_entries ADD COLUMN IF NOT EXISTS accept_set_by TEXT`);
    await pool.query(`ALTER TABLE raid_assignment_entries ADD COLUMN IF NOT EXISTS accept_updated_at TIMESTAMP`);
    await pool.query(`ALTER TABLE raid_assignments ADD COLUMN IF NOT EXISTS video_url TEXT`);
    await pool.query(`ALTER TABLE raid_assignments ADD COLUMN IF NOT EXISTS image_url_full TEXT`);
    await pool.query(`ALTER TABLE raid_assignments ADD COLUMN IF NOT EXISTS boss_icon_url TEXT`);
    await pool.query(`ALTER TABLE raid_assignment_entry_accepts ADD COLUMN IF NOT EXISTS accept_status TEXT`);
    await pool.query(`ALTER TABLE raid_assignment_entry_accepts ADD COLUMN IF NOT EXISTS accept_set_by TEXT`);
    await pool.query(`ALTER TABLE raid_assignment_entry_accepts ADD COLUMN IF NOT EXISTS accept_updated_at TIMESTAMP`);
    console.log('✅ Assignments tables initialized');
  } catch (error) {
    console.error('❌ Error initializing assignments tables:', error);
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

// Function to create Raid-Helper events cache table if it doesn't exist
async function initializeRaidHelperEventsCacheTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS raid_helper_events_cache (
        event_id VARCHAR(50) PRIMARY KEY,
        event_data JSONB NOT NULL,
        cached_at TIMESTAMP DEFAULT NOW(),
        last_accessed TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_raid_events_cached 
      ON raid_helper_events_cache(cached_at)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_raid_events_accessed 
      ON raid_helper_events_cache(last_accessed)
    `);
    
    console.log('✅ Raid-Helper events cache table initialized');
  } catch (error) {
    console.error('❌ Error creating Raid-Helper events cache table:', error);
  }
}

// Events cache helper functions
const EVENTS_CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds
const HISTORIC_EVENTS_CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds
const EVENTS_CACHE_KEY = 'raid_helper_events';
const HISTORIC_EVENTS_CACHE_KEY = 'raid_helper_historic_events';

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
    
    console.log('🔄 No valid cached events found - will fetch fresh data');
    return null;
  } catch (error) {
    console.error('❌ Error retrieving cached events:', error);
    return null;
  }
}

// Function to migrate player_confirmed_logs table to support multiple characters per user
async function migratePlayerConfirmedLogsTable() {
  try {
    console.log('🔧 Checking player_confirmed_logs table structure...');
    
    // Check if table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'player_confirmed_logs'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('📝 player_confirmed_logs table does not exist yet - will be created with correct structure');
      return;
    }
    
    // Check current primary key constraint
    const currentPK = await pool.query(`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name = 'player_confirmed_logs' 
      AND constraint_type = 'PRIMARY KEY';
    `);
    
    if (currentPK.rows.length > 0) {
      // Check if it's the old constraint (raid_id, discord_id) vs new (raid_id, discord_id, character_name)
      const pkColumns = await pool.query(`
        SELECT column_name 
        FROM information_schema.key_column_usage 
        WHERE table_name = 'player_confirmed_logs' 
        AND constraint_name = $1
        ORDER BY ordinal_position;
      `, [currentPK.rows[0].constraint_name]);
      
      const columnNames = pkColumns.rows.map(row => row.column_name);
      console.log('🔍 Current primary key columns:', columnNames);
      
      if (columnNames.length === 2 && columnNames.includes('raid_id') && columnNames.includes('discord_id')) {
        console.log('🔧 Migrating primary key to include character_name...');
        
        await pool.query('BEGIN');
        try {
          // Drop the old constraint
          await pool.query(`ALTER TABLE player_confirmed_logs DROP CONSTRAINT ${currentPK.rows[0].constraint_name}`);
          
          // Add new primary key constraint
          await pool.query(`ALTER TABLE player_confirmed_logs ADD PRIMARY KEY (raid_id, discord_id, character_name)`);
          
          await pool.query('COMMIT');
          console.log('✅ Successfully migrated player_confirmed_logs primary key');
        } catch (error) {
          await pool.query('ROLLBACK');
          console.error('❌ Failed to migrate primary key:', error);
          console.log('⚠️ Continuing with error handling in place for old constraint');
        }
      } else {
        console.log('✅ Primary key structure is already correct');
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking player_confirmed_logs migration:', error);
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

async function getCachedHistoricEvents() {
  try {
    const result = await pool.query(
      'SELECT events_data, expires_at FROM events_cache WHERE cache_key = $1 AND expires_at > NOW()',
      [HISTORIC_EVENTS_CACHE_KEY]
    );
    
    if (result.rows.length > 0) {
      console.log('💾 Using cached historic events data');
      return result.rows[0].events_data;
    }
    
    console.log('🔄 No valid cached historic events found - will fetch fresh data');
    return null;
  } catch (error) {
    console.error('❌ Error retrieving cached historic events:', error);
    return null;
  }
}

async function setCachedHistoricEvents(eventsData) {
  try {
    const expiresAt = new Date(Date.now() + HISTORIC_EVENTS_CACHE_TTL);
    
    await pool.query(`
      INSERT INTO events_cache (cache_key, events_data, expires_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (cache_key) 
      DO UPDATE SET 
        events_data = EXCLUDED.events_data,
        created_at = CURRENT_TIMESTAMP,
        expires_at = EXCLUDED.expires_at
    `, [HISTORIC_EVENTS_CACHE_KEY, JSON.stringify(eventsData), expiresAt]);
    
    console.log('💾 Historic events cached successfully, expires at:', expiresAt.toISOString());
  } catch (error) {
    console.error('❌ Error caching historic events:', error);
  }
}

// Raid-Helper individual event cache helper functions
const RAID_HELPER_EVENT_CACHE_TTL_HOURS = 6; // 6 hours default TTL

async function getCachedRaidHelperEvent(eventId, maxAgeHours = RAID_HELPER_EVENT_CACHE_TTL_HOURS) {
    try {
        const result = await pool.query(`
            SELECT event_data, cached_at 
            FROM raid_helper_events_cache 
            WHERE event_id = $1 
            AND cached_at > NOW() - INTERVAL '${maxAgeHours} hours'
        `, [eventId]);
        
        if (result.rows.length > 0) {
            // Update last_accessed timestamp
            await pool.query(`
                UPDATE raid_helper_events_cache 
                SET last_accessed = NOW() 
                WHERE event_id = $1
            `, [eventId]);
            
            console.log(`📦 [CACHE] Hit for event ${eventId} (cached: ${result.rows[0].cached_at})`);
            return result.rows[0].event_data;
        }
        
        console.log(`🔍 [CACHE] Miss for event ${eventId}`);
        return null;
    } catch (error) {
        console.error(`❌ [CACHE] Error checking cache for event ${eventId}:`, error);
        return null;
    }
}

async function setCachedRaidHelperEvent(eventId, eventData) {
    try {
        await pool.query(`
            INSERT INTO raid_helper_events_cache (event_id, event_data, cached_at, last_accessed)
            VALUES ($1, $2, NOW(), NOW())
            ON CONFLICT (event_id) 
            DO UPDATE SET 
                event_data = $2,
                cached_at = NOW(),
                last_accessed = NOW()
        `, [eventId, JSON.stringify(eventData)]);
        
        console.log(`💾 [CACHE] Stored event ${eventId}`);
    } catch (error) {
        console.error(`❌ [CACHE] Error storing event ${eventId}:`, error);
    }
}

async function cleanupRaidHelperEventCache(olderThanDays = 365) {
    try {
        const result = await pool.query(`
            DELETE FROM raid_helper_events_cache 
            WHERE cached_at < NOW() - INTERVAL '${olderThanDays} days'
            RETURNING event_id
        `);
        
        if (result.rows.length > 0) {
            console.log(`🧹 [CACHE] Cleaned up ${result.rows.length} old Raid-Helper event cache entries`);
        }
        
        return result.rows.length;
    } catch (error) {
        console.error('❌ [CACHE] Error cleaning up Raid-Helper event cache:', error);
        return 0;
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

  const events = response.data.postedEvents || [];
  if (events.length > 0) {
    console.log('📊 Sample event structure:', JSON.stringify(events[0], null, 2));
  }
  
  return events;
}

async function fetchHistoricEventsFromAPI() {
  const raidHelperApiKey = process.env.RAID_HELPER_API_KEY;
  if (!raidHelperApiKey) {
    throw new Error('RAID_HELPER_API_KEY is not set in environment variables.');
  }

  const discordGuildId = '777268886939893821';
  const nowUnixTimestamp = Math.floor(Date.now() / 1000);
  const oneYearInSeconds = 365 * 24 * 60 * 60;
  const pastUnixTimestamp = nowUnixTimestamp - oneYearInSeconds;

      console.log('🌐 Fetching historic events from Raid-Helper API (last year)...');

  const response = await axios.get(
    `https://raid-helper.dev/api/v3/servers/${discordGuildId}/events`,
    {
      headers: {
        'Authorization': `${raidHelperApiKey}`,
        'User-Agent': 'ClassicWoWManagerApp/1.0.0 (Node.js)'
      },
      params: {
        StartTimeFilter: pastUnixTimestamp,
        EndTimeFilter: nowUnixTimestamp,
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

// Initialize raid durations table for storing calculated durations
async function initializeRaidDurationsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS raid_durations (
                event_id VARCHAR(50) PRIMARY KEY,
                duration_minutes INTEGER NOT NULL,
                calculated_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Raid durations table initialized');
    } catch (error) {
        console.error('❌ Error creating raid durations table:', error);
    }
}

// Discord channel name cache and fetching
const DISCORD_CHANNEL_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
let discordChannelCache = new Map();
let discordChannelCacheTime = 0;

// Function to get Discord channel names directly from Discord API
async function getDiscordChannelNames(guildId) {
  const now = Date.now();
  
  // Check if we have valid cached data
  if (discordChannelCache.size > 0 && (now - discordChannelCacheTime) < DISCORD_CHANNEL_CACHE_TTL) {
    console.log('💾 Using cached Discord channel names');
    return discordChannelCache;
  }
  
  try {
    console.log('🔄 Fetching fresh Discord channel names...');
    console.log(`🤖 Bot token configured: ${process.env.DISCORD_BOT_TOKEN ? 'Yes' : 'No'}`);
    
    if (!process.env.DISCORD_BOT_TOKEN) {
      console.log('⚠️ No bot token configured - cannot fetch channel names');
      return new Map();
    }
    
    const response = await axios.get(
      `https://discord.com/api/v10/guilds/${guildId}/channels`,
      {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
          'User-Agent': 'ClassicWoWManagerApp/1.0.0 (Node.js)'
        },
        timeout: 10000
      }
    );
    
    console.log(`📊 Discord API response: ${response.data.length} channels returned`);
    
    // Build channel mapping
    const newChannelCache = new Map();
    response.data.forEach(channel => {
      if (channel.type === 0) { // Text channels only
        newChannelCache.set(channel.id, channel.name);
        if (newChannelCache.size <= 5) {
          console.log(`📍 Channel mapping: ${channel.id} → ${channel.name}`);
        }
      }
    });
    
    // Update cache
    discordChannelCache = newChannelCache;
    discordChannelCacheTime = now;
    
    console.log(`✅ Cached ${discordChannelCache.size} Discord channel names`);
    return discordChannelCache;
    
  } catch (error) {
    console.error('❌ Error fetching Discord channel names:', error.message);
    console.error('❌ Full error:', error.response ? error.response.data : error);
    
    // Return existing cache if available, even if expired
    if (discordChannelCache.size > 0) {
      console.log('⚠️ Using stale Discord channel cache due to API error');
      return discordChannelCache;
    }
    
    console.log('🚫 No Discord channel names available - will use fallback format');
    return new Map();
  }
}

// Function to enrich events with Discord channel names (MUCH MORE RELIABLE)
async function enrichEventsWithDiscordChannelNames(events) {
  const discordGuildId = '777268886939893821';
  
  console.log(`🔄 Starting Discord channel enrichment for ${events.length} events`);
  
  // Get channel names from Discord API
  const channelNameMap = await getDiscordChannelNames(discordGuildId);
  console.log(`📊 Discord API returned ${channelNameMap.size} channel mappings`);
  
  // Debug: Show first few channel mappings
  const sampleChannels = Array.from(channelNameMap.entries()).slice(0, 3);
  console.log('📍 Sample channel mappings:', sampleChannels);
  
  // Apply channel names to events
  const enrichedEvents = events.map(event => {
    const channelId = event.channelId || event.channelID || event.channel_id || event.discordChannelId;
    
    // Debug: Log channel ID detection for first few events
    if (events.indexOf(event) < 3) {
      console.log(`🔍 Event ${event.id}: channelId="${channelId}", has mapping: ${channelNameMap.has(channelId)}`);
    }
    
    if (channelId && channelNameMap.has(channelId)) {
      return {
        ...event,
        channelName: channelNameMap.get(channelId), // No # prefix here - frontend adds it
        channelId: channelId
      };
    }
    
    // Fallback for unknown channels - no # prefix
    return {
      ...event,
      channelName: channelId ? `channel-${channelId.slice(-4)}` : null,
      channelId: channelId || null
    };
  });
  
  console.log(`🎯 Enriched ${enrichedEvents.length} events with Discord channel names`);
  return enrichedEvents;
}

// Function to filter events to historic (last year) and enrich with channel names
async function enrichHistoricEventsWithDiscordChannelNames(events) {
  console.log(`🔄 Starting historic events filtering and enrichment for ${events.length} events`);
  
  // CRITICAL: Filter to historic events (past events, last year)
  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
  const historicEvents = events.filter(event => {
    if (!event.startTime) return false;
    const eventStartDate = new Date(parseInt(event.startTime) * 1000);
    return eventStartDate < now && eventStartDate >= oneYearAgo;
  }).sort((a, b) => parseInt(b.startTime) - parseInt(a.startTime)); // Sort newest first
  
  console.log(`📊 Filtered to ${historicEvents.length} historic events (last year) from ${events.length} total`);
  
  // Now enrich with Discord channel names
  return await enrichEventsWithDiscordChannelNames(historicEvents);
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

// Serve the migration helper page
app.get('/fix-rewards', (req, res) => {
    res.sendFile(path.join(__dirname, 'fix_heroku_rewards.html'));
});

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

app.get('/rpb_import', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'rpb_import.html'));
});

app.get('/gold', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'gold.html'));
});

app.get('/loot', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'loot.html'));
});

app.get('/raidlogs', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'raidlogs.html'));
});

// Minimal live view page
app.get('/live', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'live.html'));
});


// All API and authentication routes should come AFTER express.static AND specific HTML routes
app.get('/auth/discord', (req, res, next) => {
	// Build a safe return path to embed in the OAuth state parameter
	const returnToParam = typeof req.query.returnTo === 'string' ? req.query.returnTo : null;
	let safeReturnTo = '/';
	if (returnToParam && returnToParam.startsWith('/')) {
		safeReturnTo = returnToParam;
	} else if (typeof req.headers.referer === 'string') {
		try {
			const refererUrl = new URL(req.headers.referer);
			const refererPath = refererUrl.pathname + refererUrl.search + refererUrl.hash;
			if (refererPath && refererPath.startsWith('/')) {
				safeReturnTo = refererPath;
			}
		} catch (_) {
			// Ignore invalid referer header
		}
	}
	// Stash on request for the authenticate call to use as state
	req.oauthReturnState = encodeURIComponent(safeReturnTo);
	return next();
}, (req, res, next) => passport.authenticate('discord', { state: req.oauthReturnState })(req, res, next));

app.get('/auth/discord/callback',
  passport.authenticate('discord', {
    failureRedirect: '/'
  }),
  (req, res) => {
    // Prefer the OAuth state param as source of truth for return path
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    let destination = '/';
    try {
      const decoded = decodeURIComponent(state || '');
      if (decoded && decoded.startsWith('/')) destination = decoded;
    } catch (_) {}
    res.redirect(destination);
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

// Warcraft Logs events incremental polling endpoint
// Query params:
// - report: report code or full URL
// - cursor: nextPageTimestamp from previous response, or 0 to start
// - windowMs: how far ahead to request from cursor (default 15000ms)
app.get('/api/wcl/events', async (req, res) => {
  try {
    const reportInput = String(req.query.report || '');
    const reportCode = extractWclReportCode(reportInput);
    if (!reportCode) {
      return res.status(400).json({ error: 'Missing or invalid report parameter' });
    }
    const cursor = Number(req.query.cursor || 0);
    const windowMs = Math.min(60000, Math.max(1000, Number(req.query.windowMs || 15000)));
    let start = Math.max(0, Math.floor(cursor));
    const apiUrl = getWclApiUrlFromInput(reportInput);
    // If first request and no data yet, jump to earliest fight start (buffered back by 5s)
    if (start === 0) {
      const earliest = await fetchWclEarliestFightStart({ reportCode, apiUrl });
      if (earliest > 0) {
        start = Math.max(0, earliest - 5000);
      }
    }
    const end = start + windowMs;

    const page = await fetchWclEventsPage({ reportCode, startTime: start, endTime: end, apiUrl });
    const meta = await fetchWclReportMeta({ reportCode, apiUrl });
    // Ensure monotonic next cursor: prefer API nextPageTimestamp; otherwise advance by window
    const nextCursor = page.nextPageTimestamp != null ? page.nextPageTimestamp : end;

    // Update shared live progress only when host advances (prevents viewers from racing ahead)
    try {
      if (activeLive && typeof activeLive.reportInput === 'string') {
        const sameReport = extractWclReportCode(activeLive.reportInput) === reportCode;
        if (sameReport && req.isAuthenticated && req.isAuthenticated()) {
          const isHost = activeLive.startedBy && String(req.user && req.user.id) === String(activeLive.startedBy.id);
          if (isHost) {
            const candidate = Math.max(start, nextCursor);
            if (typeof candidate === 'number' && (activeLive.currentCursorMs == null || candidate > activeLive.currentCursorMs)) {
              activeLive.currentCursorMs = candidate;
            }
          }
        }
      }
    } catch (_) {}

    res.json({
      reportStartTime: page.reportStartTime,
      events: page.events,
      nextCursor,
      meta: {
        actorsById: meta.actorsById || {},
        abilitiesById: meta.abilitiesById || {}
      }
    });
  } catch (err) {
    console.error('WCL events error:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Failed to fetch events', details: String(err && err.message ? err.message : err) });
  }
});

// Simple token status endpoint to debug OAuth
app.get('/api/wcl/token-status', async (req, res) => {
  try {
    const token = await getWclAccessToken();
    res.json({ ok: true, tokenPreview: `${token.slice(0, 8)}...`, expiresAt: wclTokenExpiresAt });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
});

// Live session control and status
app.get('/api/wcl/live/status', (req, res) => {
  res.json({ active: !!activeLive, live: activeLive });
});

// Map of assigned characters for an event: name -> { class, spec, color, party_id, slot_id }
app.get('/api/events/:eventId/assigned-characters', async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const result = await pool.query(
      `SELECT assigned_char_name, assigned_char_class, assigned_char_spec, player_color, party_id, slot_id
       FROM roster_overrides
       WHERE event_id = $1 AND assigned_char_name IS NOT NULL`,
      [eventId]
    );
    const map = {};
    for (const row of result.rows) {
      if (!row.assigned_char_name) continue;
      const key = String(row.assigned_char_name).toLowerCase();
      map[key] = {
        name: row.assigned_char_name,
        class: row.assigned_char_class || null,
        spec: row.assigned_char_spec || null,
        color: row.player_color || null,
        partyId: row.party_id || null,
        slotId: row.slot_id || null,
      };
    }
    res.json({ assigned: map });
  } catch (err) {
    console.error('assigned-characters error', err);
    res.status(500).json({ error: 'Failed to load assigned characters' });
  }
});

app.post('/api/wcl/live/start', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Authentication required' });
    const isMgmt = await hasManagementRole(req.user.accessToken);
    if (!isMgmt) return res.status(403).json({ error: 'Management role required' });

    const reportInput = String(req.body && req.body.report || '');
    const reportCode = extractWclReportCode(reportInput);
    if (!reportCode) return res.status(400).json({ error: 'Invalid report parameter' });
    const startCursorMs = Math.max(0, Number(req.body && req.body.startCursorMs || 0));
    activeLive = {
      reportInput,
      startCursorMs,
      currentCursorMs: startCursorMs,
      startedAt: Date.now(),
      startedBy: { id: req.user.id, username: req.user.username }
    };
    res.json({ ok: true, live: activeLive });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start live', details: String(err && err.message ? err.message : err) });
  }
});

app.post('/api/wcl/live/stop', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Authentication required' });
    const isMgmt = await hasManagementRole(req.user.accessToken);
    if (!isMgmt) return res.status(403).json({ error: 'Management role required' });
    activeLive = null;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to stop live', details: String(err && err.message ? err.message : err) });
  }
});

// Fights listing for a report
app.get('/api/wcl/fights', async (req, res) => {
  try {
    const reportInput = String(req.query.report || '');
    const reportCode = extractWclReportCode(reportInput);
    if (!reportCode) return res.status(400).json({ error: 'Missing or invalid report parameter' });
    const apiUrl = getWclApiUrlFromInput(reportInput);
    const fights = await fetchWclFights({ reportCode, apiUrl });
    res.json({ fights });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch fights', details: String(err && err.message ? err.message : err) });
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

// --- Assignments API ---
app.get('/api/assignments/:eventId', async (req, res) => {
  const { eventId } = req.params;
  try {
    // Ensure core Naxx Spider Wing panels exist (Anub'Rekhan, Grand Widow Faerlina)
    const base = await pool.query(
      `SELECT * FROM raid_assignments WHERE event_id = $1 ORDER BY id ASC`,
      [eventId]
    );

    // Always ensure Anub'Rekhan exists
    await pool.query(
      `INSERT INTO raid_assignments (event_id, dungeon, wing, boss, strategy_text, image_url, image_url_full, boss_icon_url, video_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (event_id, dungeon, wing, boss) DO NOTHING`,
      [
        eventId,
        'Naxxramas',
        'Spider Wing',
        "Anub'Rekhan",
        'Assignments will appear here.',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754768041/Anubian_mid_eeb1zj.jpg',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754768042/Anubian_full_s1fmvs.png',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754809667/30800_etmqmc.png',
        'https://www.youtube.com/embed/yEh16DOAs-k?si=sbFC_3eSplmFyuav&start=13&controls=0&modestbranding=1&rel=0&iv_load_policy=3'
      ]
    );
    // Always ensure Grand Widow Faerlina exists
    await pool.query(
      `INSERT INTO raid_assignments (event_id, dungeon, wing, boss, strategy_text, image_url, image_url_full, boss_icon_url, video_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (event_id, dungeon, wing, boss) DO NOTHING`,
      [
        eventId,
        'Naxxramas',
        'Spider Wing',
        'Grand Widow Faerlina',
        "Kill the 2 followers fast (Skull and Cross), then nuke boss. Move out of rain of fire.\n\nAssigned priests use mind control and Widow's Embrace to dispel Enrage from the boss.",
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754816216/Faerlina_mid_xzjrtj.jpg',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754816215/Faerlina_full_wdeu9g.png',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754815959/3kvUdFR_kx7gif.png',
        'https://www.youtube.com/embed/JaAJ01RTsP4'
      ]
    );

    const panelsResult = await pool.query(
      `SELECT id, dungeon, wing, boss, strategy_text, image_url, image_url_full, boss_icon_url, video_url
       FROM raid_assignments WHERE event_id = $1
       ORDER BY dungeon, wing NULLS FIRST, boss`,
      [eventId]
    );
    const entriesResult = await pool.query(
      `SELECT * FROM raid_assignment_entries WHERE event_id = $1 ORDER BY sort_index, id`,
      [eventId]
    );
    const acceptsResult = await pool.query(
      `SELECT event_id, dungeon, wing, boss, character_name, accept_status, accept_set_by, accept_updated_at
       FROM raid_assignment_entry_accepts WHERE event_id = $1`,
      [eventId]
    );
    const acceptKey = (e) => `${e.event_id}|${(e.dungeon||'')}|${(e.wing||'')}|${(e.boss||'')}|${(e.character_name||'').toLowerCase()}`;
    const acceptsMap = new Map(acceptsResult.rows.map(r => [acceptKey(r), r]));

    const panels = panelsResult.rows.map(p => ({
      ...p,
      entries: entriesResult.rows
        .filter(e => e.dungeon === p.dungeon && (e.wing || '') === (p.wing || '') && e.boss === p.boss)
        .map(e => {
          const key = `${eventId}|${p.dungeon||''}|${p.wing||''}|${p.boss||''}|${(e.character_name||'').toLowerCase()}`;
          const acc = acceptsMap.get(key);
          return {
            ...e,
            accept_status: acc?.accept_status || null,
            accept_set_by: acc?.accept_set_by || null,
            accept_updated_at: acc?.accept_updated_at || null,
          };
        })
    }));

    res.json({ success: true, panels });
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch assignments' });
  }
});

// Management action to insert Faerlina panel with defaults
app.post('/api/assignments/:eventId/seed/faerlina', requireManagement, async (req, res) => {
  const { eventId } = req.params;
  const dungeon = 'Naxxramas';
  const wing = 'Spider Wing';
  const boss = 'Grand Widow Faerlina';
  const strategy = 'Kill the 2 followers fast (Skull and Cross), then nuke boss. Move out of rain of fire.\n\nAssigned priests use mind control and Widow\'s Embrace to dispel Enrage from the boss.';
  const imageMid = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754816216/Faerlina_mid_xzjrtj.jpg';
  const imageFull = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754816215/Faerlina_full_wdeu9g.png';
  const bossIcon = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754815959/3kvUdFR_kx7gif.png';
  const video = 'https://www.youtube.com/embed/JaAJ01RTsP4';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO raid_assignments (event_id, dungeon, wing, boss, strategy_text, image_url, image_url_full, boss_icon_url, video_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (event_id, dungeon, wing, boss)
       DO UPDATE SET strategy_text = EXCLUDED.strategy_text, image_url = EXCLUDED.image_url, image_url_full = EXCLUDED.image_url_full, boss_icon_url = EXCLUDED.boss_icon_url, video_url = EXCLUDED.video_url, updated_at = NOW()`,
      [eventId, dungeon, wing, boss, strategy, imageMid, imageFull, bossIcon, video]
    );
    // Build template entries from current roster
    const rosterRes = await client.query(
      `SELECT assigned_char_name AS character_name, assigned_char_class AS class_name, assigned_char_spec AS spec_name, assigned_char_spec_emote AS spec_emote, party_id, slot_id
         FROM roster_overrides WHERE event_id = $1 AND assigned_char_name IS NOT NULL`,
      [eventId]
    );
    const templates = buildFaerlinaTemplateEntries(rosterRes.rows);
    // Clear existing entries for this panel and insert defaults
    await client.query(
      `DELETE FROM raid_assignment_entries WHERE event_id = $1 AND dungeon = $2 AND wing = $3 AND boss = $4`,
      [eventId, dungeon, wing, boss]
    );
    let sortIndex = 0;
    for (const t of templates) {
      await client.query(
        `INSERT INTO raid_assignment_entries (event_id, dungeon, wing, boss, character_name, marker_icon_url, assignment, sort_index)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [eventId, dungeon, wing, boss, t.character_name, t.marker_icon_url || null, t.assignment || null, sortIndex++]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding Faerlina panel:', err);
    res.status(500).json({ success: false, message: 'Failed to seed Faerlina panel' });
  } finally {
    client.release();
  }
});

// Helper for Faerlina default templates
function buildFaerlinaTemplateEntries(roster) {
  const byPartySlot = (p, s) => roster.find(r => Number(r.party_id) === Number(p) && Number(r.slot_id) === Number(s));
  const findPriestsSorted = () => roster.filter(r => String(r.class_name).toLowerCase() === 'priest')
    .sort((a,b) => (Number(a.party_id)||99) - (Number(b.party_id)||99) || (Number(a.slot_id)||99) - (Number(b.slot_id)||99));
  const priests = findPriestsSorted();
  const p1 = priests[0];
  const p2 = priests[1];
  const entries = [];
  const icons = {
    skull: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/1_skull_faqei8.png',
    cross: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/2_cross_kj9wuf.png',
    square: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/3_square_yqucv9.png',
    moon: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/4_moon_vwhoen.png',
    triangle: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/5_triangle_rbpjyi.png',
    diamond: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/6_diamond_hre1uj.png',
    circle: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/7_circle_zayctt.png'
  };
  const pushIf = (r, icon, text) => { if (r) entries.push({ character_name: r.character_name, marker_icon_url: icon, assignment: text }); };
  // #1 G1 S1 tank boss (square)
  pushIf(byPartySlot(1,1), icons.square, 'Tank the boss');
  // #2 G1 S2 tank left 2 adds (triangle)
  pushIf(byPartySlot(1,2), icons.triangle, 'Tank the left 2 adds');
  // #3 G1 S2 tank left 2 adds (moon)
  pushIf(byPartySlot(1,2), icons.moon, 'Tank the left 2 adds');
  // #4 G1 S3 tank right 2 adds (diamond)
  pushIf(byPartySlot(1,3), icons.diamond, 'Tank the right 2 adds');
  // #5 G1 S3 tank right 2 adds (circle)
  pushIf(byPartySlot(1,3), icons.circle, 'Tank the right 2 adds');
  // #6 G2 S1 tank Skull
  pushIf(byPartySlot(2,1), icons.skull, 'Tank Skull');
  // #7 G2 S2 tank Cross
  pushIf(byPartySlot(2,2), icons.cross, 'Tank Cross (pull it to boss)');
  // #8 First priest MC
  if (p1) entries.push({ character_name: p1.character_name, marker_icon_url: icons.diamond, assignment: "Use mind control and Widow's Embrace to dispel Enrage from the boss. Start with Diamond and Circle targets." });
  // #9 First priest MC Circle
  if (p1) entries.push({ character_name: p1.character_name, marker_icon_url: icons.circle, assignment: "Use mind control and Widow's Embrace to dispel Enrage from the boss. Start with Diamond and Circle targets." });
  // #10 Second priest backup
  if (p2) entries.push({ character_name: p2.character_name, marker_icon_url: icons.circle, assignment: 'Backup mindcontrol in case the assigned priest dies or fails.' });
  return entries;
}
// Accept/Decline API: player can update own entry; managers can update any
app.post('/api/assignments/:eventId/entry/accept', express.json(), async (req, res) => {
  const { eventId } = req.params;
  const { dungeon, wing = '', boss, character_name, accept_status } = req.body || {};
  if (!eventId || !dungeon || !boss || !character_name || !['accept','decline',null,''].includes(accept_status)) {
    return res.status(400).json({ success: false, message: 'Invalid payload' });
  }
  const isAuthed = req.isAuthenticated && req.isAuthenticated();
  if (!isAuthed) return res.status(401).json({ success: false, message: 'Login required' });
  const actingUserId = req.user?.id;
  try {
    // Determine if acting user is manager
    let isManager = false;
    try { isManager = await hasManagementRole(req.user.accessToken); } catch {}
    // Verify ownership: character_name in roster_overrides for this event must have discord_user_id == acting user
    const ownerRes = await pool.query(
      `SELECT discord_user_id FROM roster_overrides WHERE event_id = $1 AND LOWER(assigned_char_name) = LOWER($2) LIMIT 1`,
      [eventId, character_name]
    );
    const ownerId = ownerRes.rows[0]?.discord_user_id || null;
    const canEdit = isManager || (ownerId && ownerId === actingUserId);
    if (!canEdit) return res.status(403).json({ success: false, message: 'Forbidden' });

    await pool.query(
      `INSERT INTO raid_assignment_entry_accepts (event_id, dungeon, wing, boss, character_name, accept_status, accept_set_by, accept_updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (event_id, dungeon, wing, boss, character_name)
       DO UPDATE SET accept_status = EXCLUDED.accept_status, accept_set_by = EXCLUDED.accept_set_by, accept_updated_at = NOW()`,
      [eventId, dungeon, wing || '', boss, character_name, accept_status || null, actingUserId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating accept status:', error);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// Returns roster for assignments for a given event, enriched with class color and spec icon
app.get('/api/assignments/:eventId/roster', async (req, res) => {
  const { eventId } = req.params;
  try {
    const result = await pool.query(
      `SELECT 
         ro.assigned_char_name AS character_name,
         ro.assigned_char_class AS class_name,
         ro.assigned_char_spec AS spec_name,
         ro.assigned_char_spec_emote AS spec_emote,
         ro.discord_user_id,
         ro.party_id,
         ro.slot_id,
         csm.class_color_hex AS class_color,
         csm.spec_icon_url
       FROM roster_overrides ro
       LEFT JOIN class_spec_mappings csm 
         ON LOWER(csm.class_name) = LOWER(ro.assigned_char_class)
        AND LOWER(csm.spec_name) = LOWER(ro.assigned_char_spec)
       WHERE ro.event_id = $1
         AND ro.assigned_char_name IS NOT NULL
       ORDER BY ro.assigned_char_name`,
      [eventId]
    );
    res.json({ success: true, roster: result.rows });
  } catch (error) {
    console.error('Error fetching assignments roster:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch roster' });
  }
});

app.post('/api/assignments/:eventId/save', requireManagement, express.json(), async (req, res) => {
  const { eventId } = req.params;
  const { panels } = req.body || {};
  if (!Array.isArray(panels)) return res.status(400).json({ success: false, message: 'Invalid payload' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Build roster lookup for validation and spec/class derivation
    const rosterRes = await client.query(
      `SELECT assigned_char_name, assigned_char_class, assigned_char_spec, assigned_char_spec_emote, discord_user_id
         FROM roster_overrides WHERE event_id = $1 AND assigned_char_name IS NOT NULL`,
      [eventId]
    );
    const rosterByName = new Map();
    for (const r of rosterRes.rows) {
      rosterByName.set(String(r.assigned_char_name).toLowerCase(), r);
    }
    // Preload class/spec mapping
    const csmRes = await client.query(`SELECT class_name, spec_name, class_color_hex FROM class_spec_mappings`);
    const csmKey = (c, s) => `${String(c).toLowerCase()}|${String(s).toLowerCase()}`;
    const csmMap = new Map();
    for (const m of csmRes.rows) csmMap.set(csmKey(m.class_name, m.spec_name), m);
    for (const panel of panels) {
      const { dungeon, wing = null, boss, strategy_text, image_url, entries = [] } = panel;
      if (!dungeon || !boss) continue;
        await client.query(
          `INSERT INTO raid_assignments (event_id, dungeon, wing, boss, strategy_text, image_url, image_url_full, boss_icon_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (event_id, dungeon, wing, boss)
           DO UPDATE SET strategy_text = EXCLUDED.strategy_text, image_url = EXCLUDED.image_url, image_url_full = EXCLUDED.image_url_full, boss_icon_url = EXCLUDED.boss_icon_url, updated_at = NOW()`,
          [eventId, dungeon, wing || '', boss, strategy_text || null, image_url || null, panel.image_url_full || null, panel.boss_icon_url || null]
      );
        // Update optional video_url if provided on payload
        if (panel.video_url !== undefined) {
          await client.query(
            `UPDATE raid_assignments SET video_url = $1, updated_at = NOW() WHERE event_id = $2 AND dungeon = $3 AND COALESCE(wing,'') = $4 AND boss = $5`,
            [panel.video_url || null, eventId, dungeon, wing || '', boss]
          );
        }
        // Update optional image_url_full and boss_icon_url if provided
        if (panel.image_url_full !== undefined || panel.boss_icon_url !== undefined) {
          await client.query(
            `UPDATE raid_assignments SET image_url_full = COALESCE($1, image_url_full), boss_icon_url = COALESCE($2, boss_icon_url), updated_at = NOW()
             WHERE event_id = $3 AND dungeon = $4 AND COALESCE(wing,'') = $5 AND boss = $6`,
            [panel.image_url_full ?? null, panel.boss_icon_url ?? null, eventId, dungeon, wing || '', boss]
          );
        }

      // Clear and re-insert entries for this panel for simplicity
      await client.query(
        `DELETE FROM raid_assignment_entries WHERE event_id = $1 AND dungeon = $2 AND wing = $3 AND boss = $4`,
        [eventId, dungeon, wing || '', boss]
      );

      let sortIndex = 0;
      for (const entry of entries) {
        const { character_name, assignment, marker_icon_url, accept_status } = entry;
        if (!character_name) continue;
        const roster = rosterByName.get(String(character_name).toLowerCase());
        if (!roster) {
          throw new Error(`Player '${character_name}' is not in the roster for this event`);
        }
        const cls = roster.assigned_char_class || '';
        const spc = roster.assigned_char_spec || '';
        const emote = roster.assigned_char_spec_emote || null;
        const map = csmMap.get(csmKey(cls, spc));
        const classColor = map?.class_color_hex || null;
        await client.query(
          `INSERT INTO raid_assignment_entries
            (event_id, dungeon, wing, boss, character_name, class_name, class_color, spec_name, spec_emote, marker_icon_url, assignment, sort_index, character_discord_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [eventId, dungeon, wing || '', boss, character_name, cls || null, classColor, spc || null, emote, marker_icon_url || null, assignment || null, sortIndex++, roster?.discord_user_id || null]
        );
        // Persist acceptance state: upsert for accept/decline, clear for null/empty
        if (accept_status === 'accept' || accept_status === 'decline') {
          await client.query(
            `INSERT INTO raid_assignment_entry_accepts (event_id, dungeon, wing, boss, character_name, accept_status, accept_set_by, accept_updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
             ON CONFLICT (event_id, dungeon, wing, boss, character_name)
             DO UPDATE SET accept_status = EXCLUDED.accept_status, accept_set_by = EXCLUDED.accept_set_by, accept_updated_at = NOW()`,
            [eventId, dungeon, wing || '', boss, character_name, accept_status, req.user?.id || null]
          );
        } else {
          await client.query(
            `DELETE FROM raid_assignment_entry_accepts WHERE event_id = $1 AND dungeon = $2 AND wing = $3 AND boss = $4 AND character_name = $5`,
            [eventId, dungeon, wing || '', boss, character_name]
          );
        }
      }
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving assignments:', error);
    res.status(500).json({ success: false, message: 'Failed to save assignments' });
  } finally {
    client.release();
  }
});

// Page route
app.get('/event/:eventId/assignments', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'assignments.html'));
});

// Subpage routes for assignments wings
app.get('/event/:eventId/assignments/:wing', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'assignments.html'));
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

// Get all characters for a Discord user ID (for unmatched roster players display)
app.get('/api/players/by-discord-id/:discordUserId', async (req, res) => {
    const { discordUserId } = req.params;
    let client;
    
    try {
        client = await pool.connect();
        
        // Get all characters for this Discord user
        const result = await client.query(
            'SELECT character_name, class FROM players WHERE discord_id = $1 ORDER BY character_name',
            [discordUserId]
        );
        
        res.json({
            success: true,
            discordId: discordUserId,
            characters: result.rows
        });
        
    } catch (error) {
        console.error('Error fetching characters by Discord ID:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error fetching characters',
            error: error.message 
        });
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
    let cachedEvents = await getCachedEvents();
    
    if (!cachedEvents) {
      // No cached data, fetch fresh data
      console.log('🔄 Cache miss - fetching fresh events data and enriching with channel names');
      const events = await fetchEventsFromAPI();
      console.log(`📡 Fetched ${events.length} raw events from API`);
      const enrichedEvents = await enrichEventsWithDiscordChannelNames(events);
      console.log(`✅ Enriched ${enrichedEvents.length} events with Discord channel names`);
      
      // Cache the enriched events
      await setCachedEvents(enrichedEvents);
      cachedEvents = enrichedEvents;
    } else {
      console.log('💾 Using cached events data - no enrichment needed');
    }
    
    // Apply channel filters to the events
    const channelFilters = await getChannelFilterSettings();
    
    // Filter out events from hidden channels
    const filteredEvents = cachedEvents.filter(event => {
      // If no channel ID, show the event (default)
      if (!event.channelId) return true;
      
      // If channel has filter setting, use it; otherwise default to visible (true)
      const isVisible = channelFilters.has(event.channelId) 
        ? channelFilters.get(event.channelId) 
        : true;
      
      return isVisible;
    });
    
    console.log(`📡 Filtered events: ${cachedEvents.length} total → ${filteredEvents.length} visible`);
    
    res.json({ scheduledEvents: filteredEvents });
    
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
    return res.status(401).json({ message: 'Unauthorized. Please sign in with Discord to refresh events.' });
  }

  try {
    console.log('🔄 Manual refresh requested - fetching fresh events data');
    
    // Fetch fresh data from API
    const events = await fetchEventsFromAPI();
    const enrichedEvents = await enrichEventsWithDiscordChannelNames(events);
    
    // Update the cache with fresh data
    await setCachedEvents(enrichedEvents);
    
    console.log(`🔍 [REFRESH DEBUG] About to apply filtering to ${enrichedEvents.length} events`);
    
    // Apply channel filters to the events (same as /api/events endpoint)
    const channelFilters = await getChannelFilterSettings();
    console.log(`🔍 [REFRESH DEBUG] Channel filters loaded: ${channelFilters.size} rules`);
    
    // Filter out events from hidden channels
    const filteredEvents = enrichedEvents.filter(event => {
      // If no channel ID, show the event (default)
      if (!event.channelId) return true;
      
      // If channel has filter setting, use it; otherwise default to visible (true)
      const isVisible = channelFilters.has(event.channelId) 
        ? channelFilters.get(event.channelId) 
        : true;
      
      return isVisible;
    });
    
    console.log(`📡 Filtered events: ${enrichedEvents.length} total → ${filteredEvents.length} visible`);
    console.log('✅ Events cache refreshed successfully');
    
    res.json({ 
      message: 'Events refreshed successfully',
      scheduledEvents: filteredEvents 
    });
    
  } catch (error) {
    console.error('Error refreshing events cache:', error.response ? error.response.data : error.message);
    res.status(error.response ? error.response.status : 500).json({
      message: 'Failed to refresh events.',
      error: error.response ? (error.response.data || error.message) : error.message
    });
  }
});

// COMPLETED EVENTS API ENDPOINTS  
// Cached endpoint to fetch completed Raid-Helper events (last year)
app.get('/api/events/historic', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized. Please sign in with Discord.' });
  }

  try {
    // Try to get cached historic events first
    let cachedEvents = await getCachedHistoricEvents();
    
    if (!cachedEvents) {
      // No cached data, fetch fresh data
      console.log('🔄 Cache miss - fetching fresh historic events data and enriching with channel names');
      const events = await fetchHistoricEventsFromAPI();
      console.log(`📡 Fetched ${events.length} raw historic events from API`);
      const enrichedEvents = await enrichHistoricEventsWithDiscordChannelNames(events);
      console.log(`✅ Enriched ${enrichedEvents.length} historic events with Discord channel names`);
      
      // Cache the enriched events
      await setCachedHistoricEvents(enrichedEvents);
      cachedEvents = enrichedEvents;
    } else {
      console.log('💾 Using cached historic events data - no enrichment needed');
    }
    
    // Apply channel filters to the historic events
    const channelFilters = await getChannelFilterSettings();
    
    // Filter out events from hidden channels
    const filteredEvents = cachedEvents.filter(event => {
      // Get the channel ID - try multiple possible property names
      const channelId = event.channelId || event.channelID || event.channel_id || event.discordChannelId;
      
      // If no channel ID, show the event (default)
      if (!channelId) return true;
      
      // If channel has filter setting, use it; otherwise default to visible (true)
      const isVisible = channelFilters.has(channelId) 
        ? channelFilters.get(channelId) 
        : true;
      
      return isVisible;
    });
    
    console.log(`📡 Filtered historic events: ${cachedEvents.length} total → ${filteredEvents.length} visible`);
    
    // Channel filtering should now work with Discord API channel names
    console.log(`🎯 Channel filtering: ${cachedEvents.length} total → ${filteredEvents.length} visible events`);
    
    res.json({ scheduledEvents: filteredEvents });
    
  } catch (error) {
    console.error('Error in /api/events/historic:', error.response ? error.response.data : error.message);
    if (error.response) {
      console.error('Raid-Helper API Error Response Details (Non-200):', {
          status: error.response.status,
          headers: error.response.headers,
          data: error.response.data
      });
    }
    res.status(error.response ? error.response.status : 500).json({
              message: 'Failed to fetch completed events from Raid-Helper.',
      error: error.response ? (error.response.data || error.message) : error.message
    });
  }
});

// Manual refresh endpoint for completed events cache
app.post('/api/events/historic/refresh', async (req, res) => {
  if (!req.isAuthenticated()) {
            return res.status(401).json({ message: 'Unauthorized. Please sign in with Discord to refresh completed events.' });
  }

  try {
    console.log('🔄 Manual refresh requested - fetching fresh historic events data');
    
    // Fetch fresh data from API
    const events = await fetchHistoricEventsFromAPI();
    const enrichedEvents = await enrichHistoricEventsWithDiscordChannelNames(events);
    
    // Update the cache with fresh data
    await setCachedHistoricEvents(enrichedEvents);
    
    console.log('✅ Historic events cache refreshed successfully');
    
    // Apply channel filters to the refreshed historic events (same as GET endpoint)
    const channelFilters = await getChannelFilterSettings();
    const filteredEvents = enrichedEvents.filter(event => {
      // Get the channel ID - try multiple possible property names
      const channelId = event.channelId || event.channelID || event.channel_id || event.discordChannelId;
      
      // If no channel ID, show the event (default)
      if (!channelId) return true;
      
      // If channel has filter setting, use it; otherwise default to visible (true)
      const isVisible = channelFilters.has(channelId) 
        ? channelFilters.get(channelId) 
        : true;
      
      return isVisible;
    });
    
    console.log(`📡 Filtered refreshed historic events: ${enrichedEvents.length} total → ${filteredEvents.length} visible`);
    
    res.json({ 
              message: 'Completed events refreshed successfully',
      scheduledEvents: filteredEvents 
    });
    
  } catch (error) {
    console.error('Error refreshing historic events cache:', error.response ? error.response.data : error.message);
    res.status(error.response ? error.response.status : 500).json({
      message: 'Failed to refresh historic events.',
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

// World Buffs Google Apps Script Proxy Endpoint
app.post('/api/logs/world-buffs', async (req, res) => {
  try {
    const { action, logUrl } = req.body;
    
    if (!action) {
      return res.status(400).json({ 
        success: false, 
        error: 'Action is required' 
      });
    }

    // Google Apps Script Web App URL for World Buffs
    const worldBuffsWebAppUrl = 'https://script.google.com/macros/s/AKfycbzQsvkeJ_CCrEHgRM4COkR5uF9b7SFQ1aIKSCG3SkWLEsu8C37Z0e1UJGNUqp54piTb5A/exec';
    
    // Prepare request data
    const requestData = { action };
    if (logUrl) {
      requestData.logUrl = logUrl;
    }

    console.log(`🌍 World Buffs ${action} request:`, requestData);
    
    // Allowed actions for World Buffs
    const allowedActions = ['populateWorldBuffs', 'checkStatus', 'clearStatus'];
    if (!allowedActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: `Invalid action '${action}'. Must be one of: ${allowedActions.join(', ')}`
      });
    }

    // Make request to Google Apps Script
    const response = await axios({
      method: 'POST',
      url: worldBuffsWebAppUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      data: requestData,
      timeout: action === 'populateWorldBuffs' ? 120000 : 30000, // 2 min for populate, 30s for status checks
    });

    console.log(`✅ World Buffs ${action} response:`, response.data);

    // Return the response from Google Apps Script
    res.json(response.data);

  } catch (error) {
    console.error('❌ World Buffs proxy error:', error);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        success: false,
        error: 'World Buffs processing timed out. Please try again.'
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
      error: error.message || 'Failed to communicate with World Buffs service'
    });
  }
});

// CLA Backup Google Apps Script Proxy Endpoint
app.post('/api/logs/cla-backup', async (req, res) => {
  try {
    const { action } = req.body;
    
    if (!action) {
      return res.status(400).json({ 
        success: false, 
        error: 'Action is required' 
      });
    }

    // World Buffs backup - calls the World Buffs spreadsheet (with updated backup code)
    const claBackupWebAppUrl = 'https://script.google.com/macros/s/AKfycbzQsvkeJ_CCrEHgRM4COkR5uF9b7SFQ1aIKSCG3SkWLEsu8C37Z0e1UJGNUqp54piTb5A/exec';
    
    // Prepare request data
    const requestData = { action };

    console.log(`🗄️ CLA Backup ${action} request:`, requestData);
    
    // Allowed actions for CLA Backup
    const allowedActions = ['createClaBackup', 'createClaBackupWebApp', 'createClaBackupWithCheck'];
    if (!allowedActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: `Invalid action '${action}'. Must be one of: ${allowedActions.join(', ')}`
      });
    }

    // Make request to Google Apps Script
    const response = await axios({
      method: 'POST',
      url: claBackupWebAppUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      data: requestData,
      timeout: 60000, // 1 minute timeout for backup creation
    });

    console.log(`✅ CLA Backup ${action} response:`, response.data);

    // Return the response from Google Apps Script
    res.json(response.data);

  } catch (error) {
    console.error('❌ CLA Backup proxy error:', error);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        success: false,
        error: 'CLA Backup creation timed out. Please try again.'
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
      error: error.message || 'Failed to communicate with CLA Backup service'
    });
  }
});

// Frost Resistance Google Apps Script Proxy Endpoint
app.post('/api/logs/frost-res', async (req, res) => {
  try {
    const { action, logUrl } = req.body;
    
    if (!action) {
      return res.status(400).json({ 
        success: false, 
        error: 'Action is required' 
      });
    }

    // Frost Resistance backup - calls the Frost Resistance spreadsheet (with updated backup code)
    const frostResWebAppUrl = 'https://script.google.com/macros/s/AKfycbz4Zp2dA4gED4qFAbBcPOqYTBfQbWP0znPULUgo-thTe41yh2KXIIl8dvbBjA9o5p45RQ/exec';
    
    // Prepare request data
    const requestData = { action };
    if (logUrl) {
      requestData.logUrl = logUrl;
    }

    console.log(`🧊 Frost Res ${action} request:`, requestData);
    
    // Allowed actions for Frost Resistance
    const allowedActions = ['populateFrostRes', 'checkStatus', 'clearStatus', 'createClaBackup', 'createClaBackupWebApp', 'createClaBackupWithCheck'];
    if (!allowedActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: `Invalid action '${action}'. Must be one of: ${allowedActions.join(', ')}`
      });
    }

    // Make request to Google Apps Script
    const response = await axios({
      method: 'POST',
      url: frostResWebAppUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      data: requestData,
      timeout: action === 'populateFrostRes' ? 120000 : 60000, // 2 min for populate, 1 min for backup/status
    });

    console.log(`✅ Frost Res ${action} response:`, response.data);

    // Return the response from Google Apps Script
    res.json(response.data);

  } catch (error) {
    console.error('❌ Frost Res proxy error:', error);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        success: false,
        error: 'Frost Resistance processing timed out. Please try again.'
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
      error: error.message || 'Failed to communicate with Frost Resistance service'
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
                    try {
                        // Deduplicate noisy logs unless explicitly enabled
                        if (process.env.DEBUG_NAME_CORRECTION === '1') {
                            console.log(`🔄 Name correction: ${player.name} -> ${matchingChar.character_name} (class mismatch detected)`);
                        }
                    } catch {}
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

        // Create sheet_imports table for tracking Google Sheet imports
        await client.query(`
            CREATE TABLE IF NOT EXISTS sheet_imports (
                id SERIAL PRIMARY KEY,
                event_id VARCHAR(255) NOT NULL,
                sheet_url TEXT NOT NULL,
                sheet_title VARCHAR(500),
                imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(event_id, sheet_url)
            )
        `);

        // Create sheet_player_abilities table for storing player ability data from sheets
        await client.query(`
            CREATE TABLE IF NOT EXISTS sheet_player_abilities (
                id SERIAL PRIMARY KEY,
                sheet_import_id INTEGER REFERENCES sheet_imports(id) ON DELETE CASCADE,
                event_id VARCHAR(255) NOT NULL,
                character_name VARCHAR(255) NOT NULL,
                character_class VARCHAR(50) NOT NULL,
                ability_name TEXT NOT NULL,
                ability_value TEXT NOT NULL,
                row_number INTEGER,
                column_number INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create sheet_players_buffs table for storing world buffs data from archived sheets
        await client.query(`
            CREATE TABLE IF NOT EXISTS sheet_players_buffs (
                id SERIAL PRIMARY KEY,
                sheet_import_id INTEGER REFERENCES sheet_imports(id) ON DELETE CASCADE,
                event_id VARCHAR(255) NOT NULL,
                character_name VARCHAR(255) NOT NULL,
                buff_name VARCHAR(100) NOT NULL,
                buff_value VARCHAR(50),
                color_status VARCHAR(100),
                background_color VARCHAR(20),
                amount_summary VARCHAR(50),
                score_summary VARCHAR(50),
                row_number INTEGER,
                column_number INTEGER,
                analysis_type VARCHAR(50) DEFAULT 'world_buffs',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create sheet_players_frostres table for storing frost resistance data from archived sheets
        await client.query(`
            CREATE TABLE IF NOT EXISTS sheet_players_frostres (
                id SERIAL PRIMARY KEY,
                sheet_import_id INTEGER REFERENCES sheet_imports(id) ON DELETE CASCADE,
                event_id VARCHAR(255) NOT NULL,
                character_name VARCHAR(255) NOT NULL,
                frost_resistance VARCHAR(50),
                row_number INTEGER,
                analysis_type VARCHAR(50) DEFAULT 'frost_resistance',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create reward_settings table for configurable rewards and deductions
        await client.query(`
            CREATE TABLE IF NOT EXISTS reward_settings (
                id SERIAL PRIMARY KEY,
                setting_type VARCHAR(50) NOT NULL,
                setting_name VARCHAR(100) NOT NULL,
                setting_value DECIMAL(10,2) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(setting_type, setting_name)
            )
        `);

        // Add a JSON column for array values
        await client.query(`
            ALTER TABLE reward_settings 
            ADD COLUMN IF NOT EXISTS setting_json JSONB
        `);

        // Insert default reward settings if they don't exist
        await client.query(`
            INSERT INTO reward_settings (setting_type, setting_name, setting_value, description)
            VALUES 
                ('abilities', 'calculation_divisor', 10, 'Divisor used in abilities points calculation: (total used × avg targets) ÷ divisor'),
                ('abilities', 'max_points', 20, 'Maximum points that can be earned from abilities (sappers, dynamite, holy water)'),
                ('mana_potions', 'threshold', 10, 'Minimum potions needed before earning points'),
                ('mana_potions', 'points_per_potion', 3, 'Points earned per potion above threshold'),
                ('mana_potions', 'max_points', 10, 'Maximum points that can be earned from mana potions'),
                ('runes', 'usage_divisor', 2, 'Number of runes needed per point'),
                ('runes', 'points_per_division', 1, 'Points earned per rune threshold reached'),
                ('interrupts', 'points_per_interrupt', 1, 'Points earned per interrupt'),
                ('interrupts', 'interrupts_needed', 1, 'Number of interrupts needed per point'),
                ('interrupts', 'max_points', 5, 'Maximum points that can be earned from interrupts'),
                ('disarms', 'points_per_disarm', 1, 'Points earned per disarm'),
                ('disarms', 'disarms_needed', 1, 'Number of disarms needed per point'),
                ('disarms', 'max_points', 5, 'Maximum points that can be earned from disarms'),
                ('curse', 'uptime_threshold', 85, 'Minimum uptime percentage required to earn points'),
                ('curse', 'points', 10, 'Points awarded for achieving uptime threshold'),
                ('curse_shadow', 'uptime_threshold', 85, 'Minimum uptime percentage required to earn points for Curse of Shadow'),
                ('curse_shadow', 'points', 10, 'Points awarded for achieving Curse of Shadow uptime threshold'),
                ('curse_elements', 'uptime_threshold', 85, 'Minimum uptime percentage required to earn points for Curse of Elements'),
                ('curse_elements', 'points', 10, 'Points awarded for achieving Curse of Elements uptime threshold'),
                ('faerie_fire', 'uptime_threshold', 85, 'Minimum uptime percentage required to earn points for Faerie Fire'),
                ('faerie_fire', 'points', 10, 'Points awarded for achieving Faerie Fire uptime threshold'),
                ('scorch', 'tier1_max', 99, 'Maximum scorch count for tier 1 (0 points)'),
                ('scorch', 'tier1_points', 0, 'Points awarded for tier 1 scorch count (0-99)'),
                ('scorch', 'tier2_max', 199, 'Maximum scorch count for tier 2 (5 points)'),
                ('scorch', 'tier2_points', 5, 'Points awarded for tier 2 scorch count (100-199)'),
                ('scorch', 'tier3_points', 10, 'Points awarded for tier 3 scorch count (200+)'),
                ('demo_shout', 'tier1_max', 99, 'Maximum demoralizing shout count for tier 1 (0 points)'),
                ('demo_shout', 'tier1_points', 0, 'Points awarded for tier 1 demoralizing shout count (0-99)'),
                ('demo_shout', 'tier2_max', 199, 'Maximum demoralizing shout count for tier 2 (5 points)'),
                ('demo_shout', 'tier2_points', 5, 'Points awarded for tier 2 demoralizing shout count (100-199)'),
                ('demo_shout', 'tier3_points', 10, 'Points awarded for tier 3 demoralizing shout count (200+)'),
                ('sunder', 'enabled', 1, 'Whether Sunder Armor tracking is enabled'),
                ('ui', 'background_blur', 0, 'Background image blur intensity (0-10)')
            ON CONFLICT (setting_type, setting_name) DO NOTHING
        `);

        // Insert sunder armor point ranges separately (JSON data)
        await client.query(`
            INSERT INTO reward_settings (setting_type, setting_name, setting_value, setting_json, description)
            VALUES 
                ('sunder', 'point_ranges', 0, '[
                  {"min": 0, "max": 49, "points": -10, "color": "red"},
                  {"min": 50, "max": 99, "points": 0, "color": "gray"},
                  {"min": 100, "max": 119, "points": 5, "color": "green"},
                  {"min": 120, "max": 999, "points": 10, "color": "blue"}
                ]', 'Point ranges for Sunder Armor performance')
            ON CONFLICT (setting_type, setting_name) DO NOTHING
        `);

        // Insert damage and healing point arrays
        await client.query(`
            INSERT INTO reward_settings (setting_type, setting_name, setting_value, setting_json, description)
            VALUES 
                ('damage', 'points_array', 0, '[80, 70, 55, 40, 35, 30, 25, 20, 15, 10, 8, 6, 5, 4, 3]', 'Points awarded for damage dealer rankings (positions 1-15)'),
                ('healing', 'points_array', 0, '[80, 65, 60, 55, 40, 35, 30, 20, 15, 10]', 'Points awarded for healer rankings (positions 1-10)')
            ON CONFLICT (setting_type, setting_name) DO NOTHING
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
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_sheet_imports_event_id ON sheet_imports (event_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_sheet_player_abilities_event_id ON sheet_player_abilities (event_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_sheet_player_abilities_character ON sheet_player_abilities (character_name, character_class)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_sheet_players_buffs_event_id ON sheet_players_buffs (event_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_sheet_players_buffs_character ON sheet_players_buffs (character_name, buff_name)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_sheet_players_buffs_analysis_type ON sheet_players_buffs (analysis_type)
        `);

        // Add indexes for sheet_players_frostres
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_sheet_players_frostres_event_id ON sheet_players_frostres (event_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_sheet_players_frostres_character ON sheet_players_frostres (character_name)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_sheet_players_frostres_analysis_type ON sheet_players_frostres (analysis_type)
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_reward_settings_type ON reward_settings (setting_type)
        `);
        
        // Only create analysis_type index if the column exists
        const analysisTypeColumnExists = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'rpb_tracking' AND column_name = 'analysis_type'
        `);
        
        if (analysisTypeColumnExists.rows.length > 0) {
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_rpb_tracking_analysis_type ON rpb_tracking (analysis_type)
            `);
            console.log('✅ [DB SETUP] Created index on analysis_type column');
        } else {
            console.log('ℹ️ [DB SETUP] Skipping analysis_type index - column does not exist yet');
        }
        
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
        
        // Create channel_filters table for Discord channel filtering
        await client.query(`
            CREATE TABLE IF NOT EXISTS channel_filters (
                channel_id TEXT PRIMARY KEY,
                channel_name TEXT,
                is_visible BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Add index for channel_filters
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_channel_filters_visible ON channel_filters (is_visible)
        `);
        
        // Create events_cache table for caching Raid-Helper API responses
        await client.query(`
            CREATE TABLE IF NOT EXISTS events_cache (
                cache_key VARCHAR(100) PRIMARY KEY,
                events_data JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL
            )
        `);
        
        // Create RPB tracking table
        await client.query(`
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

        // Add analysis_type column to rpb_tracking table (migration for World Buffs and Frost Resistance support)
        console.log('🔧 [DB MIGRATION] Checking if analysis_type column exists...');
        
        // Check if column already exists
        const columnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'rpb_tracking' AND column_name = 'analysis_type'
        `);
        
        if (columnCheck.rows.length === 0) {
            console.log('🔧 [DB MIGRATION] Adding analysis_type column...');
            await client.query(`
                ALTER TABLE rpb_tracking 
                ADD COLUMN analysis_type VARCHAR(50) DEFAULT 'rpb'
            `);
            console.log('✅ [DB MIGRATION] analysis_type column added successfully');
        } else {
            console.log('ℹ️ [DB MIGRATION] analysis_type column already exists');
        }

        // Update existing records to have 'rpb' as analysis_type if null
        console.log('🔧 [DB MIGRATION] Updating existing records...');
        try {
            const updateResult = await client.query(`
                UPDATE rpb_tracking 
                SET analysis_type = 'rpb' 
                WHERE analysis_type IS NULL OR analysis_type = ''
            `);
            console.log(`✅ [DB MIGRATION] Updated ${updateResult.rowCount} records with analysis_type = 'rpb'`);
        } catch (e) {
            console.error('❌ [DB MIGRATION] Error updating records:', e.message);
            throw e;
        }

        // Make analysis_type NOT NULL after setting defaults
        console.log('🔧 [DB MIGRATION] Setting analysis_type as NOT NULL...');
        try {
            await client.query(`
                ALTER TABLE rpb_tracking 
                ALTER COLUMN analysis_type SET NOT NULL
            `);
            console.log('✅ [DB MIGRATION] analysis_type set as NOT NULL');
        } catch (e) {
            console.log('ℹ️ [DB MIGRATION] analysis_type may already be NOT NULL:', e.message);
        }

        // Handle unique constraint migration more carefully
        console.log('🔧 [DB MIGRATION] Checking for existing constraints...');
        
        // First, let's see what constraints exist
        try {
            const constraintCheck = await client.query(`
                SELECT con.conname, con.contype
                FROM pg_constraint con
                JOIN pg_class rel ON rel.oid = con.conrelid
                WHERE rel.relname = 'rpb_tracking' AND con.contype = 'u'
            `);
            console.log('📋 [DB MIGRATION] Existing unique constraints:', constraintCheck.rows);
            
            // Drop any existing unique constraints on this table
            for (const constraint of constraintCheck.rows) {
                try {
                    await client.query(`ALTER TABLE rpb_tracking DROP CONSTRAINT IF EXISTS ${constraint.conname}`);
                    console.log(`✅ [DB MIGRATION] Dropped constraint: ${constraint.conname}`);
                } catch (dropError) {
                    console.log(`ℹ️ [DB MIGRATION] Could not drop constraint ${constraint.conname}:`, dropError.message);
                }
            }
        } catch (e) {
            console.log('ℹ️ [DB MIGRATION] Error checking constraints:', e.message);
        }

        // Create new unique index with analysis_type
        console.log('🔧 [DB MIGRATION] Creating new unique index...');
        
        // Verify analysis_type column exists before creating index
        const finalColumnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'rpb_tracking' AND column_name = 'analysis_type'
        `);
        
        if (finalColumnCheck.rows.length > 0) {
            try {
                await client.query(`
                    CREATE UNIQUE INDEX IF NOT EXISTS rpb_tracking_event_log_analysis_unique 
                    ON rpb_tracking (event_id, log_url, analysis_type)
                `);
                console.log('✅ [DB MIGRATION] New unique index created successfully');
            } catch (e) {
                console.error('❌ [DB MIGRATION] Error creating unique index:', e.message);
                // This might fail if there are duplicate records, which is okay for now
                console.log('ℹ️ [DB MIGRATION] Continuing despite index creation error...');
            }
        } else {
            console.error('❌ [DB MIGRATION] Cannot create index: analysis_type column does not exist!');
            throw new Error('analysis_type column was not created successfully');
        }
        
        // Create attendance_cache table for tracking weekly raid attendance
        await client.query(`
            CREATE TABLE IF NOT EXISTS attendance_cache (
                discord_id VARCHAR(255),
                discord_username VARCHAR(255),
                week_year INTEGER,
                week_number INTEGER,
                event_id VARCHAR(255),
                event_date DATE,
                channel_id VARCHAR(255),
                channel_name VARCHAR(255),
                character_name VARCHAR(255),
                character_class VARCHAR(50),
                player_streak INTEGER DEFAULT 0,
                cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (discord_id, week_year, week_number, event_id)
            )
        `);
        
        // Add player_streak column if it doesn't exist (for existing tables)
        await client.query(`
            ALTER TABLE attendance_cache 
            ADD COLUMN IF NOT EXISTS player_streak INTEGER DEFAULT 0
        `);
        
        // Create attendance_channel_filters table for filtering which channels to include
        await client.query(`
            CREATE TABLE IF NOT EXISTS attendance_channel_filters (
                channel_id VARCHAR(255) PRIMARY KEY,
                channel_name VARCHAR(255),
                is_included BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create channel_backgrounds table for storing background images for each channel
        await client.query(`
            CREATE TABLE IF NOT EXISTS channel_backgrounds (
                channel_id VARCHAR(255) PRIMARY KEY,
                channel_name VARCHAR(255),
                background_image_url VARCHAR(500),
                cloudinary_public_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Add cloudinary_public_id column if it doesn't exist (for existing tables)
        await client.query(`
            ALTER TABLE channel_backgrounds 
            ADD COLUMN IF NOT EXISTS cloudinary_public_id VARCHAR(255)
        `);

        // Create manual_rewards_deductions table for storing manual rewards and deductions
        await client.query(`
            CREATE TABLE IF NOT EXISTS manual_rewards_deductions (
                id SERIAL PRIMARY KEY,
                event_id VARCHAR(255) NOT NULL,
                player_name VARCHAR(255) NOT NULL,
                player_class VARCHAR(50),
                discord_id VARCHAR(255),
                description TEXT NOT NULL,
                points DECIMAL(10,2) NOT NULL,
                created_by VARCHAR(255) NOT NULL,
                icon_url VARCHAR(500),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add icon_url column to existing manual_rewards_deductions table if it doesn't exist
        try {
            await client.query(`
                ALTER TABLE manual_rewards_deductions 
                ADD COLUMN IF NOT EXISTS icon_url VARCHAR(500)
            `);
            console.log('✅ [SETUP] Added icon_url column to manual_rewards_deductions (if missing)');
        } catch (error) {
            console.log('⚠️ [SETUP] icon_url column might already exist:', error.message);
        }

        // Create manual_rewards_deductions_templates table for storing template rewards
        await client.query(`
            CREATE TABLE IF NOT EXISTS manual_rewards_deductions_templates (
                id SERIAL PRIMARY KEY,
                description TEXT NOT NULL,
                points DECIMAL(10,2) NOT NULL,
                player_name VARCHAR(255),
                icon_url VARCHAR(500),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert default templates if they don't exist
        console.log('🔧 [SETUP] Checking and inserting default templates...');
        const templatesCheck = await client.query('SELECT COUNT(*) FROM manual_rewards_deductions_templates');
        const templateCount = parseInt(templatesCheck.rows[0].count);
        
        if (templateCount === 0) {
            console.log('📝 [SETUP] Inserting default template data...');
            await client.query(`
                INSERT INTO manual_rewards_deductions_templates (description, points, player_name, icon_url) VALUES
                ('Main Tank', 100, '', 'https://wow.zamimg.com/images/wow/icons/large/ability_warrior_defensivestance.jpg'),
                ('Off Tank 1', 80, '', 'https://wow.zamimg.com/images/wow/icons/large/ability_warrior_defensivestance.jpg'),
                ('Off Tank 2', 50, '', 'https://wow.zamimg.com/images/wow/icons/large/ability_warrior_defensivestance.jpg'),
                ('Off Tank 3', 30, '', 'https://wow.zamimg.com/images/wow/icons/large/ability_warrior_defensivestance.jpg')
            `);
            console.log('✅ [SETUP] Default templates inserted successfully!');
        } else {
            console.log(`📋 [SETUP] Found ${templateCount} existing templates, skipping insertion`);
        }
        
        // Create indexes for attendance_cache
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_attendance_cache_discord_id ON attendance_cache (discord_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_attendance_cache_week ON attendance_cache (week_year, week_number)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_attendance_cache_event ON attendance_cache (event_id)
        `);
        
        // Create index for channel_backgrounds
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_channel_backgrounds_channel_name ON channel_backgrounds (channel_name)
        `);
        
        // Create indexes for manual_rewards_deductions
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_manual_rewards_event_id ON manual_rewards_deductions (event_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_manual_rewards_player ON manual_rewards_deductions (player_name, event_id)
        `);

        // Create indexes for manual_rewards_deductions_templates
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_templates_description ON manual_rewards_deductions_templates (description)
        `);
        
        // Create player_role_mapping table for comprehensive role tracking across multiple sources
        await client.query(`
            CREATE TABLE IF NOT EXISTS player_role_mapping (
                id SERIAL PRIMARY KEY,
                player_name VARCHAR(255) NOT NULL,
                character_class VARCHAR(50),
                discord_id VARCHAR(255),
                event_id VARCHAR(255) NOT NULL,
                warcraft_logs_role VARCHAR(50),
                raid_helper_role VARCHAR(50),
                managed_roster_role VARCHAR(50),
                warcraft_logs_role_event_1 VARCHAR(50),
                warcraft_logs_role_event_2 VARCHAR(50),
                warcraft_logs_role_event_3 VARCHAR(50),
                warcraft_logs_role_event_4 VARCHAR(50),
                warcraft_logs_role_event_5 VARCHAR(50),
                warcraft_logs_role_event_6 VARCHAR(50),
                warcraft_logs_role_event_7 VARCHAR(50),
                warcraft_logs_role_event_8 VARCHAR(50),
                warcraft_logs_role_event_9 VARCHAR(50),
                warcraft_logs_role_event_10 VARCHAR(50),
                warcraft_logs_role_event_11 VARCHAR(50),
                warcraft_logs_role_event_12 VARCHAR(50),
                warcraft_logs_role_event_13 VARCHAR(50),
                warcraft_logs_role_event_14 VARCHAR(50),
                warcraft_logs_role_event_15 VARCHAR(50),
                warcraft_logs_role_event_16 VARCHAR(50),
                warcraft_logs_role_event_17 VARCHAR(50),
                warcraft_logs_role_event_18 VARCHAR(50),
                warcraft_logs_role_event_19 VARCHAR(50),
                warcraft_logs_role_event_20 VARCHAR(50),
                primary_role VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(player_name, event_id)
            )
        `);
        
        // Add missing columns for existing tables (migration for events 6-20)
        console.log('🔄 [SETUP] Adding missing event columns if they don\'t exist...');
        for (let i = 6; i <= 20; i++) {
            try {
                await client.query(`
                    ALTER TABLE player_role_mapping 
                    ADD COLUMN IF NOT EXISTS warcraft_logs_role_event_${i} VARCHAR(50)
                `);
                console.log(`✅ [SETUP] Added column warcraft_logs_role_event_${i} (if missing)`);
            } catch (error) {
                console.log(`⚠️ [SETUP] Column warcraft_logs_role_event_${i} might already exist:`, error.message);
            }
        }
        
        // Add primary_role column if it doesn't exist
        try {
            await client.query(`
                ALTER TABLE player_role_mapping 
                ADD COLUMN IF NOT EXISTS primary_role VARCHAR(50)
            `);
            console.log(`✅ [SETUP] Added primary_role column (if missing)`);
        } catch (error) {
            console.log(`⚠️ [SETUP] primary_role column might already exist:`, error.message);
        }
        
        // Create indexes for player_role_mapping
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_player_role_mapping_event_id ON player_role_mapping (event_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_player_role_mapping_discord_id ON player_role_mapping (discord_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_player_role_mapping_player_class ON player_role_mapping (player_name, character_class)
        `);
        
        // Create class_spec_mappings table for fast class/spec -> role/icon/color lookups
        await client.query(`
            CREATE TABLE IF NOT EXISTS class_spec_mappings (
                class_name VARCHAR(50) NOT NULL,
                spec_name VARCHAR(50) NOT NULL,
                role VARCHAR(20) NOT NULL,
                spec_icon_url TEXT,
                class_icon_url TEXT,
                class_color_hex VARCHAR(7),
                PRIMARY KEY (class_name, spec_name)
            )
        `);
        
        // Helpful indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_class_spec_mappings_class ON class_spec_mappings (class_name)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_class_spec_mappings_role ON class_spec_mappings (role)
        `);

        // Seed class/spec mapping data (idempotent upsert)
        await client.query(`
            INSERT INTO class_spec_mappings (class_name, spec_name, role, spec_icon_url, class_icon_url, class_color_hex) VALUES
            ('Warrior','Protection','tank','https://cdn.discordapp.com/emojis/580801859221192714.png','https://cdn.discordapp.com/emojis/579532030153588739.png','#C79C6E'),
            ('Warrior','Fury','dps','https://cdn.discordapp.com/emojis/637564445215948810.png','https://cdn.discordapp.com/emojis/579532030153588739.png','#C79C6E'),
            ('Warrior','Arms','dps','https://cdn.discordapp.com/emojis/637564445031399474.png','https://cdn.discordapp.com/emojis/579532030153588739.png','#C79C6E'),
            ('Rogue','Combat','dps','https://cdn.discordapp.com/emojis/637564352333086720.png','https://cdn.discordapp.com/emojis/579532030086217748.png','#FFF569'),
            ('Rogue','Assassination','dps','https://cdn.discordapp.com/emojis/637564351707873324.png','https://cdn.discordapp.com/emojis/579532030086217748.png','#FFF569'),
            ('Rogue','Subtlety','dps','https://cdn.discordapp.com/emojis/637564352169508892.png','https://cdn.discordapp.com/emojis/579532030086217748.png','#FFF569'),
            ('Hunter','Beastmastery','dps','https://cdn.discordapp.com/emojis/637564202021814277.png','https://cdn.discordapp.com/emojis/579532029880827924.png','#ABD473'),
            ('Hunter','Marksmanship','dps','https://cdn.discordapp.com/emojis/637564202084466708.png','https://cdn.discordapp.com/emojis/579532029880827924.png','#ABD473'),
            ('Hunter','Survival','dps','https://cdn.discordapp.com/emojis/637564202130866186.png','https://cdn.discordapp.com/emojis/579532029880827924.png','#ABD473'),
            ('Mage','Arcane','dps','https://cdn.discordapp.com/emojis/637564231545389056.png','https://cdn.discordapp.com/emojis/579532030161977355.png','#69CCF0'),
            ('Mage','Fire','dps','https://cdn.discordapp.com/emojis/637564231239073802.png','https://cdn.discordapp.com/emojis/579532030161977355.png','#69CCF0'),
            ('Mage','Frost','dps','https://cdn.discordapp.com/emojis/637564231469891594.png','https://cdn.discordapp.com/emojis/579532030161977355.png','#69CCF0'),
            ('Warlock','Affliction','dps','https://cdn.discordapp.com/emojis/637564406984867861.png','https://cdn.discordapp.com/emojis/579532029851336716.png','#9482C9'),
            ('Warlock','Demonology','dps','https://cdn.discordapp.com/emojis/637564407001513984.png','https://cdn.discordapp.com/emojis/579532029851336716.png','#9482C9'),
            ('Warlock','Destruction','dps','https://cdn.discordapp.com/emojis/637564406682877964.png','https://cdn.discordapp.com/emojis/579532029851336716.png','#9482C9'),
            ('Shaman','Restoration','healer','https://cdn.discordapp.com/emojis/637564379847458846.png','https://cdn.discordapp.com/emojis/579532030056857600.png','#0070DE'),
            ('Shaman','Elemental','dps','https://cdn.discordapp.com/emojis/637564379595931649.png','https://cdn.discordapp.com/emojis/579532030056857600.png','#0070DE'),
            ('Shaman','Enhancement','dps','https://cdn.discordapp.com/emojis/637564379772223489.png','https://cdn.discordapp.com/emojis/579532030056857600.png','#0070DE'),
            ('Paladin','Holy','healer','https://cdn.discordapp.com/emojis/637564297622454272.png','https://cdn.discordapp.com/emojis/579532029906124840.png','#F58CBA'),
            ('Paladin','Protection','tank','https://cdn.discordapp.com/emojis/637564297647489034.png','https://cdn.discordapp.com/emojis/579532029906124840.png','#F58CBA'),
            ('Paladin','Retribution','dps','https://cdn.discordapp.com/emojis/637564297953673216.png','https://cdn.discordapp.com/emojis/579532029906124840.png','#F58CBA'),
            ('Priest','Discipline','healer','https://cdn.discordapp.com/emojis/637564323442720768.png','https://cdn.discordapp.com/emojis/579532029901799437.png','#FFFFFF'),
            ('Priest','Holy','healer','https://cdn.discordapp.com/emojis/637564323530539019.png','https://cdn.discordapp.com/emojis/579532029901799437.png','#FFFFFF'),
            ('Priest','Shadow','dps','https://cdn.discordapp.com/emojis/637564323291725825.png','https://cdn.discordapp.com/emojis/579532029901799437.png','#FFFFFF'),
            ('Druid','Balance','dps','https://cdn.discordapp.com/emojis/637564171994529798.png','https://cdn.discordapp.com/emojis/579532029675438081.png','#FF7D0A'),
            ('Druid','Dreamstate','dps','https://cdn.discordapp.com/emojis/982381290663866468.png','https://cdn.discordapp.com/emojis/579532029675438081.png','#FF7D0A'),
            ('Druid','Feral','tank','https://cdn.discordapp.com/emojis/637564172061900820.png','https://cdn.discordapp.com/emojis/579532029675438081.png','#FF7D0A'),
            ('Druid','Restoration','healer','https://cdn.discordapp.com/emojis/637564172007112723.png','https://cdn.discordapp.com/emojis/579532029675438081.png','#FF7D0A')
            ON CONFLICT (class_name, spec_name) DO UPDATE SET 
                role = EXCLUDED.role,
                spec_icon_url = EXCLUDED.spec_icon_url,
                class_icon_url = EXCLUDED.class_icon_url,
                class_color_hex = EXCLUDED.class_color_hex
        `);
        
        res.json({ 
            success: true, 
            message: 'Database tables created successfully!' 
        });
        
    } catch (error) {
        console.error('Error setting up database:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Error setting up database', 
            error: error.message,
            stack: error.stack 
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

// Class/Spec mapping viewer (Management only)
app.get('/api/admin/class-spec-mappings', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const hasRole = await hasManagementRole(req.user.accessToken);
    if (!hasRole) {
        return res.status(403).json({ success: false, message: 'Management role required' });
    }

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(`
            SELECT class_name, spec_name, role, spec_icon_url, class_icon_url, class_color_hex
            FROM class_spec_mappings
            ORDER BY class_name, spec_name
        `);
        res.json({ success: true, mappings: result.rows });
    } catch (error) {
        console.error('❌ [CLASS SPEC MAP] Error fetching mappings:', error);
        res.status(500).json({ success: false, message: 'Error fetching class/spec mappings' });
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
                    PRIMARY KEY (raid_id, discord_id, character_name)
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
        console.log(`🔧 [DB MANUAL] About to insert/update manual match:`, {
            raidId, discordId, characterName, characterClass, manually_matched: true
        });
        
        // First check if this exact combination already exists
        const existingPlayer = await client.query(`
            SELECT * FROM player_confirmed_logs 
            WHERE raid_id = $1 AND discord_id = $2 AND character_name = $3
        `, [raidId, discordId, characterName]);
        
        let result;
        if (existingPlayer.rows.length > 0) {
            // Update existing record
            console.log(`🔄 [DB MANUAL] Updating existing manual match for same character`);
            result = await client.query(`
                UPDATE player_confirmed_logs 
                SET character_class = $4, manually_matched = $5, confirmed_at = CURRENT_TIMESTAMP
                WHERE raid_id = $1 AND discord_id = $2 AND character_name = $3
                RETURNING *
            `, [raidId, discordId, characterName, characterClass, true]);
        } else {
            // Insert new record (allows multiple characters per Discord user)
            console.log(`➕ [DB MANUAL] Inserting new manual match (multiple chars per user allowed)`);
            try {
                result = await client.query(`
                    INSERT INTO player_confirmed_logs (raid_id, discord_id, character_name, character_class, manually_matched)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING *
                `, [raidId, discordId, characterName, characterClass, true]);
            } catch (insertError) {
                if (insertError.code === '23505') { // Unique violation
                    console.log(`🔄 [DB MANUAL] Constraint conflict - falling back to update existing record`);
                    result = await client.query(`
                        UPDATE player_confirmed_logs 
                        SET character_name = $3, character_class = $4, manually_matched = $5, confirmed_at = CURRENT_TIMESTAMP
                        WHERE raid_id = $1 AND discord_id = $2
                        RETURNING *
                    `, [raidId, discordId, characterName, characterClass, true]);
                } else {
                    throw insertError;
                }
            }
        }
        
        console.log(`✅ [DB MANUAL] Manual match stored/updated:`, result.rows[0]);
        
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
                    PRIMARY KEY (raid_id, discord_id, character_name)
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
            
            console.log(`🔧 [DB EXACT] About to insert/update exact match:`, {
                raidId, discordId, characterName, characterClass, manually_matched: false
            });
            
            // Check if this exact combination already exists
            const existingExact = await client.query(`
                SELECT * FROM player_confirmed_logs 
                WHERE raid_id = $1 AND discord_id = $2 AND character_name = $3
            `, [raidId, discordId, characterName]);
            
            let result;
            if (existingExact.rows.length > 0) {
                // Only update if it's not manually matched (preserve manual matches)
                if (!existingExact.rows[0].manually_matched) {
                    console.log(`🔄 [DB EXACT] Updating existing automatic match`);
                    result = await client.query(`
                        UPDATE player_confirmed_logs 
                        SET character_class = $4, confirmed_at = CURRENT_TIMESTAMP
                        WHERE raid_id = $1 AND discord_id = $2 AND character_name = $3 AND manually_matched = false
                        RETURNING *
                    `, [raidId, discordId, characterName, characterClass]);
                } else {
                    console.log(`⏭️ [DB EXACT] Skipping update - manual match takes precedence`);
                    result = { rows: [existingExact.rows[0]] };
                }
            } else {
                // Insert new automatic match
                console.log(`➕ [DB EXACT] Inserting new automatic match`);
                try {
                    result = await client.query(`
                        INSERT INTO player_confirmed_logs (raid_id, discord_id, character_name, character_class, manually_matched)
                        VALUES ($1, $2, $3, $4, $5)
                        RETURNING *
                    `, [raidId, discordId, characterName, characterClass, false]);
                } catch (insertError) {
                    if (insertError.code === '23505') { // Unique violation - skip this exact match
                        console.log(`⏭️ [DB EXACT] Skipping exact match due to constraint conflict (manual match likely exists)`);
                        result = { rows: [] };
                    } else {
                        throw insertError;
                    }
                }
            }
            
            console.log(`✅ [DB EXACT] Exact match result:`, result.rows[0]);
            
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

// Store player role mapping data for an event
app.post('/api/player-role-mapping/:eventId/store', async (req, res) => {
    const { eventId } = req.params;
    const { roleMappingData } = req.body;
    
    console.log(`🎯 [ROLE MAPPING] Storing role mapping for event: ${eventId}`);
    console.log(`🎯 [ROLE MAPPING] Received ${roleMappingData?.length || 0} role mapping records`);
    
    let client;
    try {
        client = await pool.connect();
        
        // First, clear existing data for this event
        await client.query('DELETE FROM player_role_mapping WHERE event_id = $1', [eventId]);
        console.log(`🗑️ [ROLE MAPPING] Cleared existing role mapping for event: ${eventId}`);
        
        if (!roleMappingData || roleMappingData.length === 0) {
            return res.json({ success: true, message: 'No role mapping data to store' });
        }
        
        // Insert new role mapping data
        for (const mapping of roleMappingData) {
            await client.query(`
                INSERT INTO player_role_mapping (
                    player_name, character_class, discord_id, event_id,
                    warcraft_logs_role, raid_helper_role, managed_roster_role,
                    warcraft_logs_role_event_1, warcraft_logs_role_event_2, warcraft_logs_role_event_3, 
                    warcraft_logs_role_event_4, warcraft_logs_role_event_5, warcraft_logs_role_event_6,
                    warcraft_logs_role_event_7, warcraft_logs_role_event_8, warcraft_logs_role_event_9,
                    warcraft_logs_role_event_10, warcraft_logs_role_event_11, warcraft_logs_role_event_12,
                    warcraft_logs_role_event_13, warcraft_logs_role_event_14, warcraft_logs_role_event_15,
                    warcraft_logs_role_event_16, warcraft_logs_role_event_17, warcraft_logs_role_event_18,
                    warcraft_logs_role_event_19, warcraft_logs_role_event_20, primary_role
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
                ON CONFLICT (player_name, event_id) 
                DO UPDATE SET
                    character_class = EXCLUDED.character_class,
                    discord_id = EXCLUDED.discord_id,
                    warcraft_logs_role = EXCLUDED.warcraft_logs_role,
                    raid_helper_role = EXCLUDED.raid_helper_role,
                    managed_roster_role = EXCLUDED.managed_roster_role,
                    warcraft_logs_role_event_1 = EXCLUDED.warcraft_logs_role_event_1,
                    warcraft_logs_role_event_2 = EXCLUDED.warcraft_logs_role_event_2,
                    warcraft_logs_role_event_3 = EXCLUDED.warcraft_logs_role_event_3,
                    warcraft_logs_role_event_4 = EXCLUDED.warcraft_logs_role_event_4,
                    warcraft_logs_role_event_5 = EXCLUDED.warcraft_logs_role_event_5,
                    warcraft_logs_role_event_6 = EXCLUDED.warcraft_logs_role_event_6,
                    warcraft_logs_role_event_7 = EXCLUDED.warcraft_logs_role_event_7,
                    warcraft_logs_role_event_8 = EXCLUDED.warcraft_logs_role_event_8,
                    warcraft_logs_role_event_9 = EXCLUDED.warcraft_logs_role_event_9,
                    warcraft_logs_role_event_10 = EXCLUDED.warcraft_logs_role_event_10,
                    warcraft_logs_role_event_11 = EXCLUDED.warcraft_logs_role_event_11,
                    warcraft_logs_role_event_12 = EXCLUDED.warcraft_logs_role_event_12,
                    warcraft_logs_role_event_13 = EXCLUDED.warcraft_logs_role_event_13,
                    warcraft_logs_role_event_14 = EXCLUDED.warcraft_logs_role_event_14,
                    warcraft_logs_role_event_15 = EXCLUDED.warcraft_logs_role_event_15,
                    warcraft_logs_role_event_16 = EXCLUDED.warcraft_logs_role_event_16,
                    warcraft_logs_role_event_17 = EXCLUDED.warcraft_logs_role_event_17,
                    warcraft_logs_role_event_18 = EXCLUDED.warcraft_logs_role_event_18,
                    warcraft_logs_role_event_19 = EXCLUDED.warcraft_logs_role_event_19,
                    warcraft_logs_role_event_20 = EXCLUDED.warcraft_logs_role_event_20,
                    primary_role = EXCLUDED.primary_role,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                mapping.player_name,
                mapping.character_class,
                mapping.discord_id,
                eventId,
                mapping.warcraft_logs_role,
                mapping.raid_helper_role,
                mapping.managed_roster_role,
                mapping.warcraft_logs_role_event_1,
                mapping.warcraft_logs_role_event_2,
                mapping.warcraft_logs_role_event_3,
                mapping.warcraft_logs_role_event_4,
                mapping.warcraft_logs_role_event_5,
                mapping.warcraft_logs_role_event_6,
                mapping.warcraft_logs_role_event_7,
                mapping.warcraft_logs_role_event_8,
                mapping.warcraft_logs_role_event_9,
                mapping.warcraft_logs_role_event_10,
                mapping.warcraft_logs_role_event_11,
                mapping.warcraft_logs_role_event_12,
                mapping.warcraft_logs_role_event_13,
                mapping.warcraft_logs_role_event_14,
                mapping.warcraft_logs_role_event_15,
                mapping.warcraft_logs_role_event_16,
                mapping.warcraft_logs_role_event_17,
                mapping.warcraft_logs_role_event_18,
                mapping.warcraft_logs_role_event_19,
                mapping.warcraft_logs_role_event_20,
                mapping.primary_role
            ]);
        }
        
        console.log(`✅ [ROLE MAPPING] Successfully stored ${roleMappingData.length} role mapping records`);
        res.json({ 
            success: true, 
            message: `Stored role mapping for ${roleMappingData.length} players`,
            eventId: eventId
        });
        
    } catch (error) {
        console.error('❌ [ROLE MAPPING] Error storing role mapping:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error storing role mapping data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Retrieve player role mapping data for an event
app.get('/api/player-role-mapping/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`🎯 [ROLE MAPPING] Retrieving role mapping for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check which columns exist first to build a safe query
        const columnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'player_role_mapping' 
            AND column_name LIKE 'warcraft_logs_role_event_%'
            ORDER BY column_name
        `);
        
        const existingEventColumns = columnCheck.rows.map(row => row.column_name);
        console.log(`🔍 [ROLE MAPPING] Found existing event columns: ${existingEventColumns.join(', ')}`);
        
        // Build dynamic SELECT query with only existing columns
        const baseColumns = `
            player_name,
            character_class,
            discord_id,
            warcraft_logs_role,
            raid_helper_role,
            managed_roster_role,
            warcraft_logs_role_event_1,
            warcraft_logs_role_event_2,
            warcraft_logs_role_event_3,
            warcraft_logs_role_event_4,
            warcraft_logs_role_event_5,
            primary_role
        `;
        
        const additionalEventColumns = existingEventColumns
            .filter(col => !['warcraft_logs_role_event_1', 'warcraft_logs_role_event_2', 'warcraft_logs_role_event_3', 'warcraft_logs_role_event_4', 'warcraft_logs_role_event_5'].includes(col))
            .join(',\n                ');
        
        const allColumns = additionalEventColumns ? 
            `${baseColumns},\n                ${additionalEventColumns},\n                created_at,\n                updated_at` :
            `${baseColumns},\n                created_at,\n                updated_at`;
        
        console.log(`🎯 [ROLE MAPPING] Using columns: ${allColumns.replace(/\s+/g, ' ')}`);
        
        const result = await client.query(`
            SELECT ${allColumns}
            FROM player_role_mapping 
            WHERE event_id = $1
            ORDER BY player_name
        `, [eventId]);
        
        console.log(`📖 [ROLE MAPPING] Found ${result.rows.length} role mapping records`);
        
        res.json({ 
            success: true, 
            data: result.rows,
            eventId: eventId,
            count: result.rows.length
        });
        
    } catch (error) {
        console.error('❌ [ROLE MAPPING] Error retrieving role mapping:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving role mapping data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get primary roles for an event (for filtering too-low performance panels)
app.get('/api/player-role-mapping/:eventId/primary-roles', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`🎯 [PRIMARY ROLES] Fetching primary roles for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Get primary roles for all players in this event
        const result = await client.query(`
            SELECT 
                player_name,
                primary_role
            FROM player_role_mapping 
            WHERE event_id = $1 
            AND primary_role IS NOT NULL
            ORDER BY player_name
        `, [eventId]);
        
        // Convert to a map for easy lookup
        const primaryRoles = {};
        result.rows.forEach(row => {
            primaryRoles[row.player_name.toLowerCase()] = row.primary_role.toLowerCase();
        });
        
        console.log(`📖 [PRIMARY ROLES] Found ${result.rows.length} players with primary roles`);
        
        res.json({ 
            success: true, 
            primaryRoles: primaryRoles,
            eventId: eventId,
            count: result.rows.length
        });
        
    } catch (error) {
        console.error('❌ [PRIMARY ROLES] Error fetching primary roles:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching primary roles',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Void damage tracking endpoint (Void Blast and Void Zone)
app.get('/api/void-damage/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    let client;
    try {
        client = await pool.connect();
        
        // Query for void damage taken from specific abilities
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                SUM(CASE WHEN ability_name = 'Void Blast (Shadow Fissure)' THEN CAST(ability_value AS INTEGER) ELSE 0 END) as void_blast_damage,
                SUM(CASE WHEN ability_name = 'Void Zone (Void Zone)' THEN CAST(ability_value AS INTEGER) ELSE 0 END) as void_zone_damage,
                SUM(CAST(ability_value AS INTEGER)) as total_void_damage,
                COUNT(*) as void_hits
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND (ability_name = 'Void Blast (Shadow Fissure)' OR ability_name = 'Void Zone (Void Zone)')
            AND ability_value ~ '^[0-9]+$'
            GROUP BY character_name, character_class
            ORDER BY total_void_damage DESC
        `, [eventId]);
        
        // Calculate points (-10 for Void Blast, -5 for Void Zone)
        const voidDamageData = result.rows.map(row => {
            const voidBlastDamage = parseInt(row.void_blast_damage) || 0;
            const voidZoneDamage = parseInt(row.void_zone_damage) || 0;
            
            let points = 0;
            if (voidBlastDamage > 0) points -= 10; // -10 for Void Blast
            if (voidZoneDamage > 0) points -= 5;   // -5 for Void Zone
            
            return {
                character_name: row.character_name,
                character_class: row.character_class,
                void_blast_damage: voidBlastDamage,
                void_zone_damage: voidZoneDamage,
                total_void_damage: parseInt(row.total_void_damage) || 0,
                void_hits: parseInt(row.void_hits) || 0,
                points: points
            };
        });
        
        console.log(`💜 [VOID DAMAGE] Found ${voidDamageData.length} players who took void damage`);
        
        res.json({
            success: true,
            data: voidDamageData,
            settings: {
                void_blast_penalty: -10,
                void_zone_penalty: -5,
                abilities: ['Void Blast (Shadow Fissure)', 'Void Zone (Void Zone)']
            }
        });
        
    } catch (error) {
        console.error('❌ [VOID DAMAGE] Error fetching void damage data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching void damage data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Helper function to map spec to role (matches frontend logic)
function mapSpecToRole(spec) {
    if (!spec) return 'unknown';
    
    const healingSpecs = ['Holy', 'Discipline', 'Restoration', 'Restoration1', 'Holy1'];
    const tankSpecs = ['Protection', 'Protection1', 'Guardian', 'Bear'];
    
    if (healingSpecs.includes(spec)) return 'healer';
    if (tankSpecs.includes(spec)) return 'tank';
    return 'dps';
}

// Retrieve stored log data for an event with roster override enhancements
app.get('/api/log-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`📖 [LOG DATA] Retrieving enhanced log data for event: ${eventId}`);
    
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
        
        // Enhanced query that joins with roster_overrides to get better role/spec data
        const result = await client.query(`
            SELECT 
                ld.character_name, 
                ld.character_class, 
                ld.discord_id, 
                ld.role_detected as original_role_detected,
                ld.role_source, 
                ld.spec_name as original_spec_name,
                ld.damage_amount, 
                ld.healing_amount, 
                ld.log_id, 
                ld.created_at,
                ro.assigned_char_spec as roster_spec,
                ro.assigned_char_spec_emote as roster_spec_emote
            FROM log_data ld
            LEFT JOIN roster_overrides ro ON (
                ld.event_id = ro.event_id AND 
                ld.discord_id = ro.discord_user_id
            )
            WHERE ld.event_id = $1 
            ORDER BY ld.damage_amount DESC, ld.healing_amount DESC
        `, [eventId]);
        
        const hasData = result.rows.length > 0;
        console.log(`📊 [LOG DATA] Found ${result.rows.length} player records for event: ${eventId}`);
        
        // Enhance the data with proper role detection
        const enhancedData = result.rows.map(row => {
            let finalRole = row.original_role_detected;
            let finalSpec = row.original_spec_name;
            
            // If we have roster override data, use that for role detection
            if (row.roster_spec) {
                finalRole = mapSpecToRole(row.roster_spec);
                finalSpec = row.roster_spec;
                console.log(`✅ [ROLE OVERRIDE] ${row.character_name}: ${row.roster_spec} → ${finalRole}`);
            }
            
            // Apply performance inference for players without any role detected
            if (!finalRole || finalRole === 'null' || finalRole === null) {
                const damage = parseInt(row.damage_amount) || 0;
                const healing = parseInt(row.healing_amount) || 0;
                
                // Simple threshold-based inference (can be refined later)
                if (damage > 1000000) { // 1M+ damage = likely DPS
                    finalRole = 'dps';
                    console.log(`⚔️ [PERFORMANCE INFERENCE] ${row.character_name}: DPS (${damage} damage)`);
                } else if (healing > 500000) { // 500K+ healing = likely healer
                    finalRole = 'healer';
                    console.log(`❤️ [PERFORMANCE INFERENCE] ${row.character_name}: Healer (${healing} healing)`);
                }
            }
            
            return {
                character_name: row.character_name,
                character_class: row.character_class,
                discord_id: row.discord_id,
                role_detected: finalRole,
                role_source: row.roster_spec ? 'roster_override' : row.role_source,
                spec_name: finalSpec,
                damage_amount: row.damage_amount,
                healing_amount: row.healing_amount,
                log_id: row.log_id,
                created_at: row.created_at,
                roster_spec_emote: row.roster_spec_emote
            };
        });
        
        console.log(`🎯 [LOG DATA] Enhanced ${enhancedData.length} records with roster override data`);
        
        res.json({ 
            success: true, 
            data: enhancedData,
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

// Get last raid (by event) for a specific character using log_data + cached event metadata
app.get('/api/character/last-raid', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const { discordId, characterName, characterClass } = req.query;
    if (!discordId || !characterName || !characterClass) {
        return res.status(400).json({ success: false, message: 'discordId, characterName and characterClass are required' });
    }

    let client;
    try {
        client = await pool.connect();

        // Ensure log_data exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'log_data'
            ) as exists;
        `);
        if (!tableCheck.rows[0].exists) {
            return res.json({ success: true, found: false });
        }

        const result = await client.query(`
            SELECT 
                ld.event_id,
                (ec.event_data->>'channelName') as channel_name,
                (ec.event_data->>'startTime')::bigint as start_time
            FROM log_data ld
            LEFT JOIN raid_helper_events_cache ec ON ec.event_id = ld.event_id
            WHERE LOWER(ld.character_name) = LOWER($1)
              AND LOWER(ld.character_class) = LOWER($2)
              AND ld.discord_id = $3
            ORDER BY COALESCE((ec.event_data->>'startTime')::bigint, 0) DESC, ld.created_at DESC
            LIMIT 1
        `, [characterName, characterClass, discordId]);

        if (result.rows.length === 0) {
            return res.json({ success: true, found: false });
        }

        const row = result.rows[0];
        return res.json({
            success: true,
            found: true,
            eventId: row.event_id,
            channelName: row.channel_name || null,
            startTime: row.start_time || null
        });
    } catch (error) {
        console.error('❌ [CHAR LAST RAID] Error:', error);
        return res.status(500).json({ success: false, message: 'Error fetching last raid for character' });
    } finally {
        if (client) client.release();
    }
});

// Get player streak data for raid logs
app.get('/api/player-streaks/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`🔥 [PLAYER STREAKS] Retrieving player streak data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if log_data table exists
        const logTableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'log_data'
            );
        `);
        
        if (!logTableCheck.rows[0].exists) {
            console.log('⚠️ [PLAYER STREAKS] log_data table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Check if attendance_cache table exists
        const attendanceTableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'attendance_cache'
            );
        `);
        
        if (!attendanceTableCheck.rows[0].exists) {
            console.log('⚠️ [PLAYER STREAKS] attendance_cache table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get players from the raid log and their streak data
        const result = await client.query(`
            SELECT 
                ld.character_name,
                ld.character_class,
                ld.discord_id,
                ac.player_streak,
                ac.discord_username
            FROM log_data ld
            LEFT JOIN (
                SELECT DISTINCT ON (discord_id) 
                    discord_id, 
                    player_streak,
                    discord_username
                FROM attendance_cache 
                ORDER BY discord_id, cached_at DESC
            ) ac ON ld.discord_id = ac.discord_id
            WHERE ld.event_id = $1
            AND ac.player_streak >= 4
            ORDER BY ac.player_streak DESC, ld.character_name ASC
        `, [eventId]);
        
        console.log(`🔥 [PLAYER STREAKS] Found ${result.rows.length} players with streak >= 4 for event: ${eventId}`);
        
        const playersWithStreaks = result.rows.map(row => ({
            character_name: row.character_name,
            character_class: row.character_class,
            discord_id: row.discord_id,
            discord_username: row.discord_username || `user-${row.discord_id.slice(-4)}`,
            player_streak: row.player_streak || 0
        }));
        
        res.json({ 
            success: true, 
            data: playersWithStreaks,
            eventId: eventId,
            minStreak: 4,
            totalCount: playersWithStreaks.length
        });
        
    } catch (error) {
        console.error('❌ [PLAYER STREAKS] Error retrieving player streak data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving player streak data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get guild membership data for raid logs
app.get('/api/guild-members/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`🏰 [GUILD MEMBERS] Retrieving guild membership data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if log_data table exists
        const logTableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'log_data'
            );
        `);
        
        if (!logTableCheck.rows[0].exists) {
            console.log('⚠️ [GUILD MEMBERS] log_data table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Check if guildies table exists
        const guildiesTableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'guildies'
            );
        `);
        
        if (!guildiesTableCheck.rows[0].exists) {
            console.log('⚠️ [GUILD MEMBERS] guildies table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get players from the raid log and check their guild membership
        // Use DISTINCT ON to only show each Discord user once
        const result = await client.query(`
            SELECT DISTINCT ON (ld.discord_id)
                ld.character_name,
                ld.character_class,
                ld.discord_id,
                g.discord_id as guild_member_id,
                g.character_name as guild_character_name
            FROM log_data ld
            LEFT JOIN guildies g ON ld.discord_id = g.discord_id
            WHERE ld.event_id = $1
            AND g.discord_id IS NOT NULL
            ORDER BY ld.discord_id, ld.character_name ASC
        `, [eventId]);
        
        console.log(`🏰 [GUILD MEMBERS] Found ${result.rows.length} guild members in raid for event: ${eventId}`);
        
        const guildMembers = result.rows.map(row => ({
            character_name: row.character_name,
            character_class: row.character_class,
            discord_id: row.discord_id,
            guild_character_name: row.guild_character_name || row.character_name,
            points: 10 // Fixed 10 points for guild members
        }));
        
        res.json({ 
            success: true, 
            data: guildMembers,
            eventId: eventId,
            pointsPerMember: 10,
            totalCount: guildMembers.length
        });
        
    } catch (error) {
        console.error('❌ [GUILD MEMBERS] Error retrieving guild membership data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving guild membership data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get abilities data for raid logs (Sappers, Dynamite, Holy Water)
app.get('/api/abilities-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`💣 [ABILITIES] Retrieving abilities data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_player_abilities'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [ABILITIES] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Query for specific abilities: Dense Dynamite, Goblin Sapper Charge, Stratholme Holy Water
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                ability_name,
                ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND ability_name IN ('Dense Dynamite', 'Goblin Sapper Charge', 'Stratholme Holy Water')
            ORDER BY character_name, ability_name
        `, [eventId]);
        
        console.log(`💣 [ABILITIES] Found ${result.rows.length} ability records for event: ${eventId}`);
        
        // Debug: Log the raw data
        console.log(`💣 [ABILITIES] Raw data sample:`, result.rows.slice(0, 3));
        
        // Group by character and calculate points
        const characterData = {};
        
        result.rows.forEach(row => {
            const { character_name, character_class, ability_name, ability_value } = row;
            
            if (!characterData[character_name]) {
                characterData[character_name] = {
                    character_name,
                    character_class,
                    dense_dynamite: 0,
                    dense_dynamite_targets: 0,
                    goblin_sapper_charge: 0,
                    goblin_sapper_targets: 0,
                    stratholme_holy_water: 0,
                    stratholme_targets: 0,
                    total_used: 0,
                    total_targets_hit: 0,
                    points: 0
                };
            }
            
            // Parse the value format: "count (⌀avg_targets)" or just "count"
            const parseAbilityValue = (value) => {
                if (!value) return { count: 0, avgTargets: 0 };
                
                // Try to match format: "9 (⌀5)" or "9 (avg5)" or "9"
                const match = value.toString().match(/^(\d+)(?:\s*\(.*?(\d+).*?\))?/);
                if (match) {
                    const count = parseInt(match[1]) || 0;
                    const avgTargets = parseInt(match[2]) || 0;
                    return { count, avgTargets };
                }
                
                // Fallback: try to extract just a number
                const numMatch = value.toString().match(/(\d+)/);
                return { count: numMatch ? parseInt(numMatch[1]) : 0, avgTargets: 0 };
            };
            
            const parsed = parseAbilityValue(ability_value);
            
            // Map ability names to our data structure
            switch (ability_name) {
                case 'Dense Dynamite':
                    characterData[character_name].dense_dynamite = parsed.count;
                    characterData[character_name].dense_dynamite_targets = parsed.avgTargets;
                    break;
                case 'Goblin Sapper Charge':
                    characterData[character_name].goblin_sapper_charge = parsed.count;
                    characterData[character_name].goblin_sapper_targets = parsed.avgTargets;
                    break;
                case 'Stratholme Holy Water':
                    characterData[character_name].stratholme_holy_water = parsed.count;
                    characterData[character_name].stratholme_targets = parsed.avgTargets;
                    break;
            }
        });
        
        // Get dynamic settings for all reward types
        const settingsResult = await client.query(`
            SELECT setting_type, setting_name, setting_value, setting_json
            FROM reward_settings 
            WHERE setting_type IN ('abilities', 'damage', 'healing', 'mana_potions', 'runes', 'interrupts', 'disarms', 'sunder', 'curse', 'curse_shadow', 'curse_elements', 'faerie_fire', 'scorch', 'demo_shout')
        `);
        
        const allSettings = {};
        settingsResult.rows.forEach(row => {
            if (!allSettings[row.setting_type]) {
                allSettings[row.setting_type] = {};
            }
            
            // Use JSON value if available, otherwise use numeric value
            let value;
            if (row.setting_json) {
                value = row.setting_json; // Already parsed by pg
            } else {
                value = parseFloat(row.setting_value);
            }
            
            allSettings[row.setting_type][row.setting_name] = value;
        });
        
        // Abilities settings
        const calculationDivisor = allSettings.abilities?.calculation_divisor || 10;
        const maxPoints = allSettings.abilities?.max_points || 20;
        
        // Damage and healing settings
        const damagePoints = allSettings.damage?.points_array || [80, 70, 55, 40, 35, 30, 25, 20, 15, 10, 8, 6, 5, 4, 3];
        const healingPoints = allSettings.healing?.points_array || [80, 65, 60, 55, 40, 35, 30, 20, 15, 10];
        
        console.log(`💣 [ABILITIES] Using dynamic settings: divisor=${calculationDivisor}, max_points=${maxPoints}`);
        console.log(`💥 [DAMAGE] Using dynamic points array (${damagePoints.length} positions):`, damagePoints);
        console.log(`💚 [HEALING] Using dynamic points array (${healingPoints.length} positions):`, healingPoints);

        // Calculate final stats and points for each character
        const finalData = Object.values(characterData).map(char => {
            const totalUsed = char.dense_dynamite + char.goblin_sapper_charge + char.stratholme_holy_water;
            
            // Calculate weighted average targets hit
            let totalTargetsWeighted = 0;
            let weightedCount = 0;
            
            if (char.dense_dynamite > 0) {
                totalTargetsWeighted += char.dense_dynamite * char.dense_dynamite_targets;
                weightedCount += char.dense_dynamite;
            }
            if (char.goblin_sapper_charge > 0) {
                totalTargetsWeighted += char.goblin_sapper_charge * char.goblin_sapper_targets;
                weightedCount += char.goblin_sapper_charge;
            }
            if (char.stratholme_holy_water > 0) {
                totalTargetsWeighted += char.stratholme_holy_water * char.stratholme_targets;
                weightedCount += char.stratholme_holy_water;
            }
            
            const avgTargets = weightedCount > 0 ? totalTargetsWeighted / weightedCount : 0;
            const points = Math.min(maxPoints, Math.floor((totalUsed * avgTargets) / calculationDivisor));
            
            return {
                ...char,
                total_used: totalUsed,
                avg_targets_hit: avgTargets,
                points: points
            };
        }).filter(char => char.total_used > 0) // Only include characters who used at least one ability
          .sort((a, b) => b.points - a.points); // Sort by points descending
        
        console.log(`💣 [ABILITIES] Processed ${finalData.length} characters with abilities usage`);
        console.log(`💣 [ABILITIES] Final data sample:`, finalData.slice(0, 2));
        
        res.json({ 
            success: true, 
            data: finalData,
            eventId: eventId,
            settings: {
                calculation_divisor: calculationDivisor,
                max_points: maxPoints
            }
        });
        
    } catch (error) {
        console.error('❌ [ABILITIES] Error retrieving abilities data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving abilities data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get shame data for Wall of Shame (deaths, avoidable damage, friendly damage)
app.get('/api/shame-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`💀 [SHAME] Retrieving shame data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_player_abilities'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [SHAME] Table does not exist, returning empty data');
            return res.json({ success: true, data: {} });
        }
        
        // Query for shame-related abilities
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                ability_name,
                ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND ability_name IN (
                '# of deaths in total (just on trash)',
                'Total avoidable damage taken',
                'Damage to hostile players (counts as done to self)'
            )
            ORDER BY character_name, ability_name
        `, [eventId]);
        
        console.log(`💀 [SHAME] Found ${result.rows.length} shame records for event: ${eventId}`);
        
        // Process the results to find the worst performers
        const shameData = {};
        const deathsData = [];
        const avoidableDamageData = [];
        const friendlyDamageData = [];
        
        result.rows.forEach(row => {
            const { character_name, character_class, ability_name, ability_value } = row;
            
            switch (ability_name) {
                case '# of deaths in total (just on trash)':
                    // Parse format like "3 (1)" - total deaths (trash deaths)
                    const deathMatch = ability_value.toString().match(/^(\d+)(?:\s*\((\d+)\))?/);
                    if (deathMatch) {
                        const totalDeaths = parseInt(deathMatch[1]) || 0;
                        if (totalDeaths > 0) {
                            deathsData.push({
                                character_name,
                                character_class,
                                ability_value: ability_value.toString(),
                                total_deaths: totalDeaths
                            });
                        }
                    }
                    break;
                    
                case 'Total avoidable damage taken':
                    const avoidableDamage = parseInt(ability_value) || 0;
                    if (avoidableDamage > 0) {
                        avoidableDamageData.push({
                            character_name,
                            character_class,
                            ability_value: avoidableDamage
                        });
                    }
                    break;
                    
                case 'Damage to hostile players (counts as done to self)':
                    const friendlyDamage = parseInt(ability_value) || 0;
                    if (friendlyDamage > 0) {
                        friendlyDamageData.push({
                            character_name,
                            character_class,
                            ability_value: friendlyDamage
                        });
                    }
                    break;
            }
        });
        
        // Find the worst performers
        if (deathsData.length > 0) {
            shameData.most_deaths = deathsData.sort((a, b) => b.total_deaths - a.total_deaths)[0];
        }
        
        if (avoidableDamageData.length > 0) {
            shameData.most_avoidable_damage = avoidableDamageData.sort((a, b) => b.ability_value - a.ability_value)[0];
        }
        
        if (friendlyDamageData.length > 0) {
            shameData.most_friendly_damage = friendlyDamageData.sort((a, b) => b.ability_value - a.ability_value)[0];
        }
        
        console.log(`💀 [SHAME] Processed shame data:`, shameData);
        
        res.json({ 
            success: true, 
            data: shameData
        });
        
    } catch (error) {
        console.error('❌ [SHAME] Error retrieving shame data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving shame data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get world buffs data for raid logs
app.get('/api/world-buffs-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`🌍 [WORLD BUFFS] Retrieving world buffs data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // First, get the channel ID for this event to determine buff requirements
        let channelId = null;
        try {
            const eventResult = await client.query(`
                SELECT event_data->>'channelId' as channel_id
                FROM raid_helper_events_cache 
                WHERE event_id = $1
            `, [eventId]);
            
            if (eventResult.rows.length > 0) {
                channelId = eventResult.rows[0].channel_id;
                console.log(`🌍 [WORLD BUFFS] Found channel ID: ${channelId} for event: ${eventId}`);
            }
        } catch (err) {
            console.warn(`🌍 [WORLD BUFFS] Could not determine channel ID for event ${eventId}:`, err.message);
        }
        
        // Base required buffs (without DMF)
        let baseRequiredBuffs = 5; // Default: Ony, Rend, ZG, Songflower, DM Tribute
        if (channelId === '1202206206782091264') {
            baseRequiredBuffs = 4; // 4 buffs for this channel
        } else if (channelId === '1184627341893316649' || channelId === '1195562433926934658') {
            baseRequiredBuffs = 6; // 6 buffs for these channels
        }
        
        // We'll determine final required buffs after checking DMF count
        let requiredBuffs = baseRequiredBuffs;
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_players_buffs'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [WORLD BUFFS] Table does not exist, returning empty data');
            return res.json({ success: true, data: [], requiredBuffs });
        }
        
        // First get summary data per character (amount_summary should be the same for all buffs of a character)
        const summaryResult = await client.query(`
            SELECT DISTINCT ON (character_name)
                character_name,
                amount_summary,
                score_summary
            FROM sheet_players_buffs 
            WHERE event_id = $1 
            AND analysis_type = 'world_buffs'
            AND amount_summary IS NOT NULL
            ORDER BY character_name
        `, [eventId]);
        
        // Then get all buff details
        const buffsResult = await client.query(`
            SELECT 
                character_name,
                buff_name,
                buff_value,
                color_status,
                background_color
            FROM sheet_players_buffs 
            WHERE event_id = $1 
            AND analysis_type = 'world_buffs'
            ORDER BY character_name, buff_name
        `, [eventId]);
        
        // Debug: Log actual buff names to understand the data structure
        const uniqueBuffNames = [...new Set(buffsResult.rows.map(row => row.buff_name))];
        console.log(`🌍 [WORLD BUFFS] Unique buff names in database:`, uniqueBuffNames);
        
        // Also get character class information from log_data if available
        const classResult = await client.query(`
            SELECT DISTINCT character_name, character_class
            FROM log_data
            WHERE event_id = $1
        `, [eventId]);
        
        console.log(`🌍 [WORLD BUFFS] Found ${buffsResult.rows.length} buff records for event: ${eventId}`);
        console.log(`🌍 [WORLD BUFFS] Found ${summaryResult.rows.length} characters with summary data for event: ${eventId}`);
        console.log(`🌍 [WORLD BUFFS] Found ${classResult.rows.length} characters with class data (log_data) for event: ${eventId}`);
        
        // Create character class lookup
        const characterClasses = {};
        classResult.rows.forEach(row => {
            characterClasses[row.character_name] = row.character_class;
        });
        
        // Create character summary lookup
        const characterSummaries = {};
        summaryResult.rows.forEach(row => {
            characterSummaries[row.character_name] = {
                amount_summary: row.amount_summary,
                score_summary: row.score_summary
            };
        });
        
        // Group by character and calculate points
        const characterData = {};
        
        // Initialize characters from summary data - but only for characters who were in the raid (have log_data)
        summaryResult.rows.forEach(row => {
            const character_name = row.character_name;
            
            // Only include characters who actually participated in the raid
            if (characterClasses[character_name]) {
                characterData[character_name] = {
                    character_name,
                    character_class: characterClasses[character_name],
                    buffs: {},
                    total_buffs: 0,
                    missing_buffs: [],
                    amount_summary: row.amount_summary,
                    score_summary: row.score_summary,
                    points: 0
                };
            }
        });
        
        // Add buff details
        buffsResult.rows.forEach(row => {
            const { character_name, buff_name, buff_value, color_status, background_color } = row;
            
            // Only process if we have summary data for this character
            if (characterData[character_name]) {
                characterData[character_name].buffs[buff_name] = {
                    buff_value,
                    color_status,
                    background_color
                };
            }
        });
        
        // First pass: Check if DMF should be included (10+ people must have it)
        let dmfCount = 0;
        Object.values(characterData).forEach(char => {
            if (char.buffs['DMF']) {
                dmfCount++;
            }
        });
        
        const includeDMF = dmfCount >= 10;
        
        // Update required buffs if DMF is included
        if (includeDMF) {
            requiredBuffs = baseRequiredBuffs + 1; // Add DMF to required count
        }
        
        console.log(`🌍 [WORLD BUFFS] DMF count: ${dmfCount}, included in calculations: ${includeDMF}`);
        console.log(`🌍 [WORLD BUFFS] Final required buffs: ${requiredBuffs} (base: ${baseRequiredBuffs}, +DMF: ${includeDMF})`);
        console.log(`🌍 [WORLD BUFFS] Characters with DMF:`, Object.keys(characterData).filter(name => characterData[name].buffs['DMF']));
        
        // Calculate points and missing buffs for each character
        const finalData = Object.values(characterData).map(char => {
            // Extract current buffs from amount_summary (format: "6 / 6" or "5/ 6")
            let currentBuffs = 0;
            if (char.amount_summary) {
                const match = char.amount_summary.match(/^(\d+)/);
                if (match) {
                    currentBuffs = parseInt(match[1]) || 0;
                }
                // Log parsing for debugging
                if (currentBuffs === 0) {
                    console.log(`🌍 [WORLD BUFFS] ${char.character_name}: amount_summary="${char.amount_summary}" -> parsed buffs=${currentBuffs}`);
                }
            } else {
                console.log(`🌍 [WORLD BUFFS] ${char.character_name}: No amount_summary data`);
            }
            
            char.total_buffs = currentBuffs;
            
            // Calculate penalty points for missing buffs
            if (currentBuffs < requiredBuffs) {
                const missingCount = requiredBuffs - currentBuffs;
                char.points = missingCount * -10; // -10 points per missing buff
            } else {
                char.points = 0; // No penalty if they have enough buffs
            }
            
            // Debug: Show all buffs for this character
            console.log(`🌍 [WORLD BUFFS] ${char.character_name} has buffs:`, Object.keys(char.buffs));
            
            // Determine missing buffs based on actual database buff names
            // Group related buffs together (DM Tribute has sub-buffs)
            let buffCategories = {
                'Ony': ['Nef/Ony'],
                'Rend': ['Rend'],
                'ZG': ['ZG heart'],
                'Songflower': ['Songflower'],
                'DM Tribute': ['Mol\'dar', 'Fengus', 'Slip\'kik']
            };
            
            // Only include DMF if 10+ people have it
            if (includeDMF) {
                buffCategories['DMF'] = ['DMF'];
            }
            
            char.missing_buffs = [];
            
            // Check each buff category
            for (const [categoryName, buffNames] of Object.entries(buffCategories)) {
                let hasAnyBuff = false;
                
                // Check if player has any buff from this category
                for (const buffName of buffNames) {
                    if (char.buffs[buffName]) {
                        hasAnyBuff = true;
                        break;
                    }
                }
                
                // If no buffs from this category, mark as missing
                if (!hasAnyBuff) {
                    char.missing_buffs.push(categoryName);
                }
            }
            
            console.log(`🌍 [WORLD BUFFS] ${char.character_name} missing buffs:`, char.missing_buffs);
            
            return char;
        });
        
        // Final deduplication step (ensure no character appears twice)
        const uniqueCharacters = new Map();
        finalData.forEach(char => {
            if (!uniqueCharacters.has(char.character_name)) {
                uniqueCharacters.set(char.character_name, char);
            }
        });
        
        const uniqueFinalData = Array.from(uniqueCharacters.values());
        
        // Sort by points (least negative first, then by total buffs)
        uniqueFinalData.sort((a, b) => {
            if (b.points !== a.points) {
                return b.points - a.points; // Higher points first (less negative)
            }
            return b.total_buffs - a.total_buffs; // Then by total buffs
        });
        
        console.log(`🌍 [WORLD BUFFS] Processed ${uniqueFinalData.length} characters with world buffs data (after deduplication)`);
        console.log(`🌍 [WORLD BUFFS] Character names in final data:`, uniqueFinalData.map(c => c.character_name));
        console.log(`🌍 [WORLD BUFFS] Final data sample:`, uniqueFinalData.slice(0, 2));
        console.log(`🌍 [WORLD BUFFS] API Response - includeDMF: ${includeDMF}, requiredBuffs: ${requiredBuffs}`);
        
        res.json({ 
            success: true, 
            data: uniqueFinalData,
            eventId: eventId,
            requiredBuffs: requiredBuffs,
            channelId: channelId,
            includeDMF: includeDMF
        });
        
    } catch (error) {
        console.error('❌ [WORLD BUFFS] Error retrieving world buffs data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving world buffs data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get frost resistance data for raid logs
app.get('/api/frost-resistance-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`🧊 [FROST RESISTANCE] Retrieving frost resistance data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if frost resistance table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_players_frostres'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [FROST RESISTANCE] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get frost resistance data
        const frostResResult = await client.query(`
            SELECT 
                character_name,
                frost_resistance
            FROM sheet_players_frostres 
            WHERE event_id = $1 
            AND analysis_type = 'frost_resistance'
            ORDER BY character_name
        `, [eventId]);
        
        // Get character class and role information from log_data
        const logDataResult = await client.query(`
            SELECT DISTINCT 
                character_name, 
                character_class,
                role_detected
            FROM log_data
            WHERE event_id = $1
        `, [eventId]);
        
        console.log(`🧊 [FROST RESISTANCE] Found ${frostResResult.rows.length} frost resistance records for event: ${eventId}`);
        console.log(`🧊 [FROST RESISTANCE] Found ${logDataResult.rows.length} characters with role/class data for event: ${eventId}`);
        
        // Create lookup maps
        const characterData = {};
        logDataResult.rows.forEach(row => {
            characterData[row.character_name] = {
                character_class: row.character_class,
                role_detected: row.role_detected
            };
        });
        
        // Process frost resistance data
        const processedData = [];
        let maxFrostRes = 0;
        
        frostResResult.rows.forEach(row => {
            const characterName = row.character_name;
            const frostRes = parseInt(row.frost_resistance) || 0;
            const logData = characterData[characterName];
            
            // Skip if no log data (not in raid) or if tank/healer
            if (!logData || 
                logData.role_detected === 'tank' || 
                logData.role_detected === 'healer') {
                return;
            }
            
            // Only include DPS players
            if (logData.role_detected === 'dps') {
                const characterClass = logData.character_class?.toLowerCase();
                
                // Determine if physical or caster DPS
                const physicalClasses = ['warrior', 'rogue', 'hunter'];
                const casterClasses = ['mage', 'warlock', 'priest', 'shaman'];
                
                let dpsType = null;
                let points = 0;
                
                if (physicalClasses.includes(characterClass)) {
                    dpsType = 'physical';
                    if (frostRes < 80) {
                        points = -10;
                    } else if (frostRes < 130) {
                        points = -5;
                    }
                } else if (casterClasses.includes(characterClass)) {
                    dpsType = 'caster';
                    if (frostRes < 80) {
                        points = -10;
                    } else if (frostRes < 150) {
                        points = -5;
                    }
                }
                
                if (dpsType) {
                    maxFrostRes = Math.max(maxFrostRes, frostRes);
                    
                    processedData.push({
                        character_name: characterName,
                        character_class: logData.character_class,
                        role_detected: logData.role_detected,
                        frost_resistance: frostRes,
                        dps_type: dpsType,
                        points: points
                    });
                }
            }
        });
        
        // Add progress percentage for visual bars
        processedData.forEach(char => {
            char.progress_percentage = maxFrostRes > 0 ? Math.round((char.frost_resistance / maxFrostRes) * 100) : 0;
        });
        
        // Sort by points (highest first), then by frost resistance (highest first)
        processedData.sort((a, b) => {
            if (b.points !== a.points) {
                return b.points - a.points; // Higher points first (less negative)
            }
            return b.frost_resistance - a.frost_resistance; // Then by frost resistance
        });
        
        console.log(`🧊 [FROST RESISTANCE] Processed ${processedData.length} DPS characters with frost resistance data`);
        console.log(`🧊 [FROST RESISTANCE] Max frost resistance: ${maxFrostRes}`);
        console.log(`🧊 [FROST RESISTANCE] Sample data:`, processedData.slice(0, 2));
        
        res.json({ 
            success: true, 
            data: processedData,
            eventId: eventId,
            maxFrostResistance: maxFrostRes
        });
        
    } catch (error) {
        console.error('❌ [FROST RESISTANCE] Error retrieving frost resistance data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving frost resistance data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get reward settings
app.get('/api/admin/reward-settings', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        const result = await client.query(`
            SELECT setting_type, setting_name, setting_value, setting_json, description
            FROM reward_settings 
            ORDER BY setting_type, setting_name
        `);
        
        // Group settings by type
        const settingsByType = {};
        result.rows.forEach(row => {
            if (!settingsByType[row.setting_type]) {
                settingsByType[row.setting_type] = {};
            }
            
            // Use JSON value if available, otherwise use numeric value
            let value;
            if (row.setting_json) {
                value = row.setting_json; // This will be parsed automatically by pg
            } else {
                value = parseFloat(row.setting_value);
            }
            
            settingsByType[row.setting_type][row.setting_name] = {
                value: value,
                description: row.description
            };
        });
        
        res.json({ 
            success: true, 
            settings: settingsByType
        });
        
    } catch (error) {
        console.error('❌ [REWARD SETTINGS] Error retrieving settings:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving reward settings',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Update reward settings
app.post('/api/admin/reward-settings', async (req, res) => {
    const { settings } = req.body;
    
    if (!settings) {
        return res.status(400).json({ 
            success: false, 
            message: 'Settings data is required' 
        });
    }
    
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        
        console.log('🔧 [REWARD SETTINGS] Updating settings:', JSON.stringify(settings, null, 2));
        
        // Update each setting
        for (const settingType of Object.keys(settings)) {
            for (const settingName of Object.keys(settings[settingType])) {
                const value = settings[settingType][settingName];
                
                console.log(`🔧 [REWARD SETTINGS] Updating ${settingType}.${settingName}:`, value, 'Type:', typeof value, 'IsArray:', Array.isArray(value));
                
                // Determine if this is a JSON array or numeric value
                if (Array.isArray(value)) {
                    await client.query(`
                        UPDATE reward_settings 
                        SET setting_json = $1, setting_value = 0, updated_at = CURRENT_TIMESTAMP
                        WHERE setting_type = $2 AND setting_name = $3
                    `, [JSON.stringify(value), settingType, settingName]);
                } else {
                    await client.query(`
                        UPDATE reward_settings 
                        SET setting_value = $1, setting_json = NULL, updated_at = CURRENT_TIMESTAMP
                        WHERE setting_type = $2 AND setting_name = $3
                    `, [value, settingType, settingName]);
                }
            }
        }
        
        await client.query('COMMIT');
        console.log('✅ [REWARD SETTINGS] Updated reward settings successfully');
        
        res.json({ 
            success: true, 
            message: 'Reward settings updated successfully'
        });
        
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('❌ [REWARD SETTINGS] Error updating settings:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating reward settings',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get mana potion data for raid logs
app.get('/api/mana-potions-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`🧪 [MANA POTIONS] Retrieving mana potion data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_player_abilities'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [MANA POTIONS] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get dynamic settings for mana potions calculation
        const settingsResult = await client.query(`
            SELECT setting_name, setting_value
            FROM reward_settings 
            WHERE setting_type = 'mana_potions'
        `);
        
        const settings = {};
        settingsResult.rows.forEach(row => {
            settings[row.setting_name] = parseFloat(row.setting_value);
        });
        
        const threshold = settings.threshold || 10;
        const pointsPerPotion = settings.points_per_potion || 3;
        const maxPoints = settings.max_points || 10;
        
        console.log(`🧪 [MANA POTIONS] Using dynamic settings: threshold=${threshold}, points_per_potion=${pointsPerPotion}, max_points=${maxPoints}`);
        
        // Query for Major Mana Potion usage
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND ability_name = 'Major Mana Potion'
            ORDER BY character_name
        `, [eventId]);
        
        console.log(`🧪 [MANA POTIONS] Found ${result.rows.length} potion records for event: ${eventId}`);
        console.log(`🧪 [MANA POTIONS] Raw data sample:`, result.rows.slice(0, 3));
        
        // Process and calculate points for each character
        const finalData = result.rows.map(row => {
            // Parse the potion count (might be "15" or "15 (some text)")
            const potionMatch = row.ability_value.toString().match(/(\d+)/);
            const potionsUsed = potionMatch ? parseInt(potionMatch[1]) : 0;
            
            // Calculate points: potions above threshold * points per potion, capped at max
            const extraPotions = Math.max(0, potionsUsed - threshold);
            const points = Math.min(maxPoints, extraPotions * pointsPerPotion);
            
            return {
                character_name: row.character_name,
                character_class: row.character_class,
                potions_used: potionsUsed,
                extra_potions: extraPotions,
                points: points
            };
        }).filter(char => char.potions_used > 0) // Only include characters who used potions
          .sort((a, b) => b.points - a.points); // Sort by points descending
        
        console.log(`🧪 [MANA POTIONS] Processed ${finalData.length} characters with potion usage`);
        console.log(`🧪 [MANA POTIONS] Final data sample:`, finalData.slice(0, 2));
        
        res.json({ 
            success: true, 
            data: finalData,
            eventId: eventId,
            settings: {
                threshold: threshold,
                points_per_potion: pointsPerPotion,
                max_points: maxPoints
            }
        });
        
    } catch (error) {
        console.error('❌ [MANA POTIONS] Error retrieving mana potion data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving mana potion data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get runes data for raid logs
app.get('/api/runes-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`🔮 [RUNES] Retrieving runes data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_player_abilities'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [RUNES] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get dynamic settings for runes calculation
        const settingsResult = await client.query(`
            SELECT setting_name, setting_value
            FROM reward_settings 
            WHERE setting_type = 'runes'
        `);
        
        const settings = {};
        settingsResult.rows.forEach(row => {
            settings[row.setting_name] = parseFloat(row.setting_value);
        });
        
        const usageDivisor = settings.usage_divisor || 2;
        const pointsPerDivision = settings.points_per_division || 1;
        
        console.log(`🔮 [RUNES] Using dynamic settings: usage_divisor=${usageDivisor}, points_per_division=${pointsPerDivision}`);
        
        // Query for Dark Rune and Demonic Rune usage
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                ability_name,
                ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND (ability_name = 'Dark Rune' OR ability_name = 'Demonic Rune' OR ability_name = 'Demonic Rune/Dark Rune')
            ORDER BY character_name, ability_name
        `, [eventId]);
        
        console.log(`🔮 [RUNES] Found ${result.rows.length} rune records for event: ${eventId}`);
        console.log(`🔮 [RUNES] Raw data sample:`, result.rows.slice(0, 3));
        
        // Process and calculate points for each character (combine both rune types)
        const characterData = {};
        
        result.rows.forEach(row => {
            const characterName = row.character_name;
            
            if (!characterData[characterName]) {
                characterData[characterName] = {
                    character_name: row.character_name,
                    character_class: row.character_class,
                    dark_runes: 0,
                    demonic_runes: 0,
                    total_runes: 0
                };
            }
            
            // Parse the rune count (might be "5" or "5 (some text)")
            const runeMatch = row.ability_value.toString().match(/(\d+)/);
            const runesUsed = runeMatch ? parseInt(runeMatch[1]) : 0;
            
            if (row.ability_name === 'Dark Rune') {
                characterData[characterName].dark_runes = runesUsed;
            } else if (row.ability_name === 'Demonic Rune') {
                characterData[characterName].demonic_runes = runesUsed;
            } else if (row.ability_name === 'Demonic Rune/Dark Rune') {
                // Combined entry - add to total for both types
                characterData[characterName].dark_runes += runesUsed;
                characterData[characterName].demonic_runes += runesUsed;
            }
            
            characterData[characterName].total_runes = characterData[characterName].dark_runes + characterData[characterName].demonic_runes;
        });
        
        // Calculate points and convert to array
        const finalData = Object.values(characterData).map(char => {
            // Calculate points: floor(total_runes / divisor) * points_per_division
            const points = Math.floor(char.total_runes / usageDivisor) * pointsPerDivision;
            
            return {
                ...char,
                points: points
            };
        }).filter(char => char.total_runes > 0) // Only include characters who used runes
          .sort((a, b) => b.points - a.points); // Sort by points descending
        
        console.log(`🔮 [RUNES] Processed ${finalData.length} characters with rune usage`);
        console.log(`🔮 [RUNES] Final data sample:`, finalData.slice(0, 2));
        
        res.json({ 
            success: true, 
            data: finalData,
            eventId: eventId,
            settings: {
                usage_divisor: usageDivisor,
                points_per_division: pointsPerDivision
            }
        });
        
    } catch (error) {
        console.error('❌ [RUNES] Error retrieving runes data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving runes data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get interrupts data for raid logs
app.get('/api/interrupts-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`⚡ [INTERRUPTS] Retrieving interrupts data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_player_abilities'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [INTERRUPTS] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get dynamic settings for interrupts calculation
        const settingsResult = await client.query(`
            SELECT setting_name, setting_value
            FROM reward_settings 
            WHERE setting_type = 'interrupts'
        `);
        
        const settings = {};
        settingsResult.rows.forEach(row => {
            settings[row.setting_name] = parseFloat(row.setting_value);
        });
        
        const pointsPerInterrupt = settings.points_per_interrupt || 1;
        const interruptsNeeded = settings.interrupts_needed || 1;
        const maxPoints = settings.max_points || 5;
        
        console.log(`⚡ [INTERRUPTS] Using dynamic settings: points_per_interrupt=${pointsPerInterrupt}, interrupts_needed=${interruptsNeeded}, max_points=${maxPoints}`);
        
        // Query for "# of interrupted spells" usage
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND ability_name = '# of interrupted spells'
            ORDER BY character_name
        `, [eventId]);
        
        console.log(`⚡ [INTERRUPTS] Found ${result.rows.length} interrupt records for event: ${eventId}`);
        console.log(`⚡ [INTERRUPTS] Raw data sample:`, result.rows.slice(0, 3));
        
        // Process and calculate points for each character
        const finalData = result.rows.map(row => {
            // Parse the interrupt count (might be "3" or "3 (some text)")
            const interruptMatch = row.ability_value.toString().match(/(\d+)/);
            const interruptsUsed = interruptMatch ? parseInt(interruptMatch[1]) : 0;
            
            // Calculate points: min(max_points, floor(interrupts / needed) * points_per)
            const points = Math.min(maxPoints, Math.floor(interruptsUsed / interruptsNeeded) * pointsPerInterrupt);
            
            return {
                character_name: row.character_name,
                character_class: row.character_class,
                interrupts_used: interruptsUsed,
                points: points
            };
        }).filter(char => char.interrupts_used > 0) // Only include characters who interrupted
          .sort((a, b) => b.points - a.points); // Sort by points descending
        
        console.log(`⚡ [INTERRUPTS] Processed ${finalData.length} characters with interrupts`);
        console.log(`⚡ [INTERRUPTS] Final data sample:`, finalData.slice(0, 2));
        
        res.json({ 
            success: true, 
            data: finalData,
            eventId: eventId,
            settings: {
                points_per_interrupt: pointsPerInterrupt,
                interrupts_needed: interruptsNeeded,
                max_points: maxPoints
            }
        });
        
    } catch (error) {
        console.error('❌ [INTERRUPTS] Error retrieving interrupts data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving interrupts data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get disarms data for raid logs
app.get('/api/disarms-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`🛡️ [DISARMS] Retrieving disarms data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_player_abilities'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [DISARMS] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get dynamic settings for disarms calculation
        const settingsResult = await client.query(`
            SELECT setting_name, setting_value
            FROM reward_settings 
            WHERE setting_type = 'disarms'
        `);
        
        const settings = {};
        settingsResult.rows.forEach(row => {
            settings[row.setting_name] = parseFloat(row.setting_value);
        });
        
        const pointsPerDisarm = settings.points_per_disarm || 1;
        const disarmsNeeded = settings.disarms_needed || 1;
        const maxPoints = settings.max_points || 5;
        
        console.log(`🛡️ [DISARMS] Using dynamic settings: points_per_disarm=${pointsPerDisarm}, disarms_needed=${disarmsNeeded}, max_points=${maxPoints}`);
        
        // Query for "Disarm" usage
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND ability_name = 'Disarm'
            ORDER BY character_name
        `, [eventId]);
        
        console.log(`🛡️ [DISARMS] Found ${result.rows.length} disarm records for event: ${eventId}`);
        console.log(`🛡️ [DISARMS] Raw data sample:`, result.rows.slice(0, 3));
        
        // Process and calculate points for each character
        const finalData = result.rows.map(row => {
            // Parse the disarm count (might be "3" or "3 (some text)")
            const disarmMatch = row.ability_value.toString().match(/(\d+)/);
            const disarmsUsed = disarmMatch ? parseInt(disarmMatch[1]) : 0;
            
            // Calculate points: min(max_points, floor(disarms / needed) * points_per)
            const points = Math.min(maxPoints, Math.floor(disarmsUsed / disarmsNeeded) * pointsPerDisarm);
            
            return {
                character_name: row.character_name,
                character_class: row.character_class,
                disarms_used: disarmsUsed,
                points: points
            };
        }).filter(char => char.disarms_used > 0) // Only include characters who disarmed
          .sort((a, b) => b.points - a.points); // Sort by points descending
        
        console.log(`🛡️ [DISARMS] Processed ${finalData.length} characters with disarms`);
        console.log(`🛡️ [DISARMS] Final data sample:`, finalData.slice(0, 2));
        
        res.json({ 
            success: true, 
            data: finalData,
            eventId: eventId,
            settings: {
                points_per_disarm: pointsPerDisarm,
                disarms_needed: disarmsNeeded,
                max_points: maxPoints
            }
        });
        
    } catch (error) {
        console.error('❌ [DISARMS] Error retrieving disarms data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving disarms data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get all reward settings for raid logs page
app.get('/api/reward-settings', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        const result = await client.query(`
            SELECT setting_type, setting_name, setting_value, setting_json
            FROM reward_settings 
            ORDER BY setting_type, setting_name
        `);
        
        // Group settings by type
        const settingsByType = {};
        result.rows.forEach(row => {
            if (!settingsByType[row.setting_type]) {
                settingsByType[row.setting_type] = {};
            }
            
            // Use JSON value if available, otherwise use numeric value
            let value;
            if (row.setting_json) {
                value = row.setting_json; // Already parsed by pg
            } else {
                value = parseFloat(row.setting_value);
            }
            
            settingsByType[row.setting_type][row.setting_name] = value;
        });
        
        res.json({ 
            success: true, 
            settings: settingsByType
        });
        
    } catch (error) {
        console.error('❌ [REWARD SETTINGS] Error retrieving settings:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving reward settings',
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

// Raid-Helper API proxy endpoint for CORS with caching
app.get('/api/raid-helper/events/:eventId', async (req, res) => {
    const { eventId } = req.params;
    const forceRefresh = req.query.refresh === 'true';
    
    try {
        // Try cache first (unless force refresh requested)
        if (!forceRefresh) {
            const cachedData = await getCachedRaidHelperEvent(eventId);
            if (cachedData) {
                console.log(`📦 [CACHE] Serving cached data for event: ${eventId}`);
                return res.json(cachedData);
            }
        }
        
        console.log(`🔄 Fetching fresh Raid-Helper data for event: ${eventId}`);
        
        const response = await axios.get(`https://raid-helper.dev/api/v2/events/${eventId}`, {
            timeout: 10000,
            headers: { 
                'Authorization': process.env.RAID_HELPER_API_KEY,
                'User-Agent': 'ClassicWoWManagerApp/1.0.0 (Node.js)'
            }
        });
        
        // Cache the fresh data
        await setCachedRaidHelperEvent(eventId, response.data);
        
        console.log(`✅ Raid-Helper data fetched and cached for event: ${eventId}`);
        res.json(response.data);
        
    } catch (error) {
        console.error(`❌ Failed to fetch Raid-Helper data for event ${eventId}:`, error.message);
        
        // Fallback to stale cache if API fails (up to 7 days old)
        if (!forceRefresh) {
            const staleCache = await getCachedRaidHelperEvent(eventId, 24 * 7); // 7 days
            if (staleCache) {
                console.log(`🔄 [FALLBACK] Using stale cache for event ${eventId} due to API failure`);
                return res.json(staleCache);
            }
        }
        
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

// --- Manual Rewards and Deductions API Endpoints ---
// Get manual rewards/deductions for an event
app.get('/api/manual-rewards/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`⚖️ [MANUAL REWARDS] Retrieving manual rewards/deductions for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'manual_rewards_deductions'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [MANUAL REWARDS] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get manual rewards/deductions for this event
        const result = await client.query(`
            SELECT 
                id,
                player_name,
                player_class,
                discord_id,
                description,
                points,
                created_by,
                created_at,
                updated_at,
                icon_url
            FROM manual_rewards_deductions 
            WHERE event_id = $1 
            ORDER BY created_at ASC
        `, [eventId]);
        
        console.log(`⚖️ [MANUAL REWARDS] Found ${result.rows.length} manual entries for event: ${eventId}`);
        
        res.json({ 
            success: true, 
            data: result.rows,
            eventId: eventId
        });
        
    } catch (error) {
        console.error('❌ [MANUAL REWARDS] Error retrieving manual rewards/deductions:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving manual rewards/deductions',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Add manual reward/deduction entry
app.post('/api/manual-rewards/:eventId', requireManagement, async (req, res) => {
    const { eventId } = req.params;
    const { player_name, player_class, discord_id, description, points } = req.body;
    const createdBy = req.user?.id || 'unknown';
    
    console.log(`⚖️ [MANUAL REWARDS] Adding entry for event: ${eventId}, player: ${player_name}, points: ${points}`);
    
    if (!player_name || !description || points === undefined || points === null) {
        return res.status(400).json({ 
            success: false, 
            message: 'Missing required fields: player_name, description, and points are required' 
        });
    }
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'manual_rewards_deductions'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [MANUAL REWARDS] Table does not exist');
            return res.status(500).json({ 
                success: false, 
                message: 'Manual rewards table does not exist. Please run database setup first.' 
            });
        }
        
        // Insert new entry
        const result = await client.query(`
            INSERT INTO manual_rewards_deductions 
            (event_id, player_name, player_class, discord_id, description, points, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [eventId, player_name, player_class, discord_id, description, points, createdBy]);
        
        const newEntry = result.rows[0];
        console.log(`✅ [MANUAL REWARDS] Created entry with ID: ${newEntry.id}`);
        
        res.json({ 
            success: true, 
            data: newEntry,
            message: 'Manual reward/deduction added successfully'
        });
        
    } catch (error) {
        console.error('❌ [MANUAL REWARDS] Error adding manual entry:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error adding manual reward/deduction',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Update manual reward/deduction entry
app.put('/api/manual-rewards/:eventId/:entryId', requireManagement, async (req, res) => {
    const { eventId, entryId } = req.params;
    const { player_name, player_class, discord_id, description, points } = req.body;
    
    console.log(`⚖️ [MANUAL REWARDS] Updating entry ${entryId} for event: ${eventId}`);
    
    if (!player_name || !description || points === undefined || points === null) {
        return res.status(400).json({ 
            success: false, 
            message: 'Missing required fields: player_name, description, and points are required' 
        });
    }
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'manual_rewards_deductions'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [MANUAL REWARDS] Table does not exist');
            return res.status(500).json({ 
                success: false, 
                message: 'Manual rewards table does not exist. Please run database setup first.' 
            });
        }
        
        // Update entry
        const result = await client.query(`
            UPDATE manual_rewards_deductions 
            SET player_name = $1, player_class = $2, discord_id = $3, description = $4, points = $5, updated_at = CURRENT_TIMESTAMP
            WHERE id = $6 AND event_id = $7
            RETURNING *
        `, [player_name, player_class, discord_id, description, points, entryId, eventId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Manual entry not found' 
            });
        }
        
        const updatedEntry = result.rows[0];
        console.log(`✅ [MANUAL REWARDS] Updated entry ID: ${updatedEntry.id}`);
        
        res.json({ 
            success: true, 
            data: updatedEntry,
            message: 'Manual reward/deduction updated successfully'
        });
        
    } catch (error) {
        console.error('❌ [MANUAL REWARDS] Error updating manual entry:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating manual reward/deduction',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Delete manual reward/deduction entry
app.delete('/api/manual-rewards/:eventId/:entryId', requireManagement, async (req, res) => {
    const { eventId, entryId } = req.params;
    
    console.log(`⚖️ [MANUAL REWARDS] Deleting entry ${entryId} for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'manual_rewards_deductions'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [MANUAL REWARDS] Table does not exist');
            return res.status(500).json({ 
                success: false, 
                message: 'Manual rewards table does not exist. Please run database setup first.' 
            });
        }
        
        // Delete entry
        const result = await client.query(`
            DELETE FROM manual_rewards_deductions 
            WHERE id = $1 AND event_id = $2
            RETURNING *
        `, [entryId, eventId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Manual entry not found' 
            });
        }
        
        const deletedEntry = result.rows[0];
        console.log(`✅ [MANUAL REWARDS] Deleted entry ID: ${deletedEntry.id}`);
        
        res.json({ 
            success: true, 
            data: deletedEntry,
            message: 'Manual reward/deduction deleted successfully'
        });
        
    } catch (error) {
        console.error('❌ [MANUAL REWARDS] Error deleting manual entry:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error deleting manual reward/deduction',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get player list for dropdown (from current raid participants)
app.get('/api/manual-rewards/:eventId/players', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`👥 [MANUAL REWARDS] Getting player list for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        let players = [];
        
        // Try to get players from log_data first
        const logTableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'log_data'
            );
        `);
        
        if (logTableCheck.rows[0].exists) {
            const logResult = await client.query(`
                SELECT DISTINCT 
                    character_name as player_name,
                    character_class as player_class,
                    discord_id
                FROM log_data 
                WHERE event_id = $1 
                ORDER BY character_name
            `, [eventId]);
            
            players = logResult.rows;
            console.log(`👥 [MANUAL REWARDS] Found ${players.length} players from log_data`);
        }
        
        // If no players from log_data, try confirmed logs
        if (players.length === 0) {
            const confirmedTableCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'player_confirmed_logs'
                );
            `);
            
            if (confirmedTableCheck.rows[0].exists) {
                const confirmedResult = await client.query(`
                    SELECT DISTINCT 
                        character_name as player_name,
                        character_class as player_class,
                        discord_id
                    FROM player_confirmed_logs 
                    WHERE raid_id = $1 
                    ORDER BY character_name
                `, [eventId]);
                
                players = confirmedResult.rows;
                console.log(`👥 [MANUAL REWARDS] Found ${players.length} players from confirmed logs`);
            }
        }
        
        res.json({ 
            success: true, 
            data: players,
            eventId: eventId
        });
        
    } catch (error) {
        console.error('❌ [MANUAL REWARDS] Error getting player list:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error getting player list',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// --- Manual Rewards Templates API Endpoints ---
// Get all templates
app.get('/api/manual-rewards-templates', async (req, res) => {
    console.log('📋 [TEMPLATES] Retrieving all templates');
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if templates table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'manual_rewards_deductions_templates'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [TEMPLATES] Templates table does not exist');
            return res.json({ 
                success: false, 
                message: 'Templates table does not exist. Please run database setup first.',
                data: [] 
            });
        }
        
        // Get all templates
        const result = await client.query(`
            SELECT 
                id,
                description,
                points,
                player_name,
                icon_url,
                created_at,
                updated_at
            FROM manual_rewards_deductions_templates 
            ORDER BY points DESC, description ASC
        `);
        
        console.log(`📋 [TEMPLATES] Found ${result.rows.length} templates`);
        
        res.json({ 
            success: true, 
            data: result.rows
        });
        
    } catch (error) {
        console.error('❌ [TEMPLATES] Error retrieving templates:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving templates',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Insert templates into manual rewards for an event
app.post('/api/manual-rewards/:eventId/from-templates', requireManagement, async (req, res) => {
    const { eventId } = req.params;
    const createdBy = req.user?.id || 'unknown';
    const templateIdsRaw = req.body?.templateIds;

    const templateIds = Array.isArray(templateIdsRaw)
        ? templateIdsRaw
            .map((id) => parseInt(id, 10))
            .filter((n) => Number.isFinite(n))
        : null;

    console.log(`📋 [TEMPLATES] Inserting templates for event: ${eventId} by user: ${createdBy}`);
    if (templateIds && templateIds.length > 0) {
        console.log(`📋 [TEMPLATES] Requested templateIds: ${templateIds.join(', ')}`);
    } else {
        console.log('📋 [TEMPLATES] No specific templateIds provided - will insert all templates');
    }

    let client;
    try {
        client = await pool.connect();

        // Check if templates table exists
        const templatesTableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'manual_rewards_deductions_templates'
            );
        `);

        if (!templatesTableCheck.rows[0].exists) {
            console.log('⚠️ [TEMPLATES] Templates table does not exist');
            return res.status(400).json({ 
                success: false, 
                message: 'Templates table does not exist. Please go to the Admin page and click "Create Templates Table" or "Setup Database".'
            });
        }

        // Check if manual rewards table exists
        const rewardsTableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'manual_rewards_deductions'
            );
        `);

        if (!rewardsTableCheck.rows[0].exists) {
            console.log('⚠️ [TEMPLATES] Manual rewards table does not exist');
            return res.status(400).json({ 
                success: false, 
                message: 'Manual rewards table does not exist. Please run database setup first.'
            });
        }

        // Get templates (optionally filtered by provided IDs)
        let templatesResult;
        if (templateIds && templateIds.length > 0) {
            templatesResult = await client.query(
                `SELECT id, description, points, player_name, icon_url
                 FROM manual_rewards_deductions_templates
                 WHERE id = ANY($1::int[])
                 ORDER BY id ASC`,
                [templateIds]
            );
        } else {
            templatesResult = await client.query(`
                SELECT id, description, points, player_name, icon_url
                FROM manual_rewards_deductions_templates 
                ORDER BY points DESC, description ASC
            `);
        }

        if (templatesResult.rows.length === 0) {
            console.log('⚠️ [TEMPLATES] No templates found');
            return res.json({ 
                success: true, 
                message: 'No templates found to insert',
                data: []
            });
        }

        // Insert each template as a manual reward entry (with empty player_name for manual editing)
        const insertedEntries = [];
        for (const template of templatesResult.rows) {
            console.log(`📝 [TEMPLATES] Inserting template: ${template.description} (${template.points} pts)`);

            const insertResult = await client.query(
                `INSERT INTO manual_rewards_deductions (
                    event_id, player_name, description, points, created_by, icon_url
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *`,
                [
                    eventId,
                    '', // Empty player name - to be filled by user
                    template.description,
                    template.points,
                    createdBy,
                    template.icon_url,
                ]
            );

            insertedEntries.push(insertResult.rows[0]);
        }

        console.log(`✅ [TEMPLATES] Successfully inserted ${insertedEntries.length} template entries for event: ${eventId}`);

        res.json({ 
            success: true, 
            message: `Successfully inserted ${insertedEntries.length} template entries`,
            data: insertedEntries,
            templatesInserted: insertedEntries.length,
        });

    } catch (error) {
        console.error('❌ [TEMPLATES] Error inserting templates:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error inserting templates',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Create templates table separately (for troubleshooting)
app.post('/api/admin/create-templates-table', async (req, res) => {
    console.log('📋 [ADMIN] Creating templates table manually...');
    
    let client;
    try {
        client = await pool.connect();
        
        // Create manual_rewards_deductions_templates table
        await client.query(`
            CREATE TABLE IF NOT EXISTS manual_rewards_deductions_templates (
                id SERIAL PRIMARY KEY,
                description TEXT NOT NULL,
                points DECIMAL(10,2) NOT NULL,
                player_name VARCHAR(255),
                icon_url VARCHAR(500),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('✅ [ADMIN] Templates table created successfully');

        // Create index
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_templates_description ON manual_rewards_deductions_templates (description)
        `);
        
        console.log('✅ [ADMIN] Templates table index created');

        // Add icon_url column to existing templates table if it doesn't exist
        try {
            await client.query(`
                ALTER TABLE manual_rewards_deductions_templates 
                ADD COLUMN IF NOT EXISTS icon_url VARCHAR(500)
            `);
            console.log('✅ [ADMIN] Added icon_url column to templates table (if missing)');
        } catch (error) {
            console.log('⚠️ [ADMIN] icon_url column might already exist in templates table:', error.message);
        }

        // Prefer importing from CSV shipped with the repo so Heroku matches localhost
        const csvPath = path.join(__dirname, 'manual_rewards_deductions_templates.csv');
        let importedCount = 0;

        // Start a transaction for deterministic results
        await client.query('BEGIN');

        if (fs.existsSync(csvPath)) {
            console.log('📄 [ADMIN] Found CSV for templates at:', csvPath);
            const csvRaw = fs.readFileSync(csvPath, 'utf8');
            const lines = csvRaw.split(/\r?\n/).filter(l => l.trim().length > 0);
            if (lines.length > 1) {
                // Remove header
                lines.shift();

                // Clear current table content to mirror local
                await client.query('TRUNCATE TABLE manual_rewards_deductions_templates RESTART IDENTITY');

                const parseCsvLine = (line) => {
                    const result = [];
                    let current = '';
                    let inQuotes = false;
                    for (let i = 0; i < line.length; i++) {
                        const ch = line[i];
                        if (ch === '"') {
                            if (inQuotes && line[i + 1] === '"') {
                                current += '"';
                                i++;
                            } else {
                                inQuotes = !inQuotes;
                            }
                        } else if (ch === ',' && !inQuotes) {
                            result.push(current);
                            current = '';
                        } else {
                            current += ch;
                        }
                    }
                    result.push(current);
                    return result.map(v => v.replace(/^\"|\"$/g, ''));
                };

                for (const line of lines) {
                    const cols = parseCsvLine(line);
                    if (cols.length < 7) continue; // skip malformed
                    const [id, description, points, player_name, created_at, updated_at, icon_url] = cols;
                    await client.query(
                        `INSERT INTO manual_rewards_deductions_templates (id, description, points, player_name, created_at, updated_at, icon_url)
                         VALUES ($1,$2,$3,$4,$5,$6,$7)
                         ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description, points = EXCLUDED.points, player_name = EXCLUDED.player_name, icon_url = EXCLUDED.icon_url, updated_at = EXCLUDED.updated_at`,
                        [id ? parseInt(id, 10) : null, description, parseFloat(points), player_name || null, created_at || null, updated_at || null, icon_url || null]
                    );
                    importedCount++;
                }

                // Ensure the serial sequence is aligned after explicit id inserts
                await client.query(`SELECT setval(pg_get_serial_sequence('manual_rewards_deductions_templates','id'), COALESCE((SELECT MAX(id) FROM manual_rewards_deductions_templates), 1), true)`);
                console.log(`✅ [ADMIN] Imported ${importedCount} templates from CSV`);
            } else {
                console.log('⚠️ [ADMIN] CSV appears empty beyond header; skipping import.');
            }
        } else {
            console.log('⚠️ [ADMIN] CSV not found; falling back to default seed set.');
            const templatesCheck = await client.query('SELECT COUNT(*) FROM manual_rewards_deductions_templates');
            const templateCount = parseInt(templatesCheck.rows[0].count);
            if (templateCount === 0) {
                await client.query(`
                    INSERT INTO manual_rewards_deductions_templates (description, points, player_name, icon_url) VALUES
                    ('Main Tank', 100, '', 'https://wow.zamimg.com/images/wow/icons/large/ability_warrior_defensivestance.jpg'),
                    ('Off Tank 1', 80, '', 'https://wow.zamimg.com/images/wow/icons/large/ability_warrior_defensivestance.jpg'),
                    ('Off Tank 2', 50, '', 'https://wow.zamimg.com/images/wow/icons/large/ability_warrior_defensivestance.jpg'),
                    ('Off Tank 3', 30, '', 'https://wow.zamimg.com/images/wow/icons/large/ability_warrior_defensivestance.jpg')
                `);
                importedCount = 4;
                console.log('✅ [ADMIN] Default templates inserted.');
            } else {
                importedCount = templateCount;
                console.log(`📋 [ADMIN] Found ${templateCount} existing templates, no changes.`);
            }
        }

        await client.query('COMMIT');

        res.json({ 
            success: true, 
            message: 'Templates table created and populated successfully from CSV.',
            templatesCount: importedCount
        });
        
    } catch (error) {
        console.error('❌ [ADMIN] Error creating templates table:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error creating templates table', 
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Cache management endpoints for Raid-Helper events
app.get('/api/cache/raid-helper/stats', async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_events,
                COUNT(CASE WHEN cached_at > NOW() - INTERVAL '6 hours' THEN 1 END) as fresh_events,
                COUNT(CASE WHEN cached_at <= NOW() - INTERVAL '6 hours' THEN 1 END) as stale_events,
                MIN(cached_at) as oldest_cache,
                MAX(cached_at) as newest_cache,
                AVG(EXTRACT(EPOCH FROM (NOW() - cached_at))/3600) as avg_age_hours
            FROM raid_helper_events_cache
        `);
        
        const sizeStats = await pool.query(`
            SELECT pg_size_pretty(pg_total_relation_size('raid_helper_events_cache')) as table_size
        `);
        
        res.json({
            success: true,
            stats: {
                ...stats.rows[0],
                table_size: sizeStats.rows[0].table_size
            }
        });
    } catch (error) {
        console.error('❌ Error getting cache stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get cache stats'
        });
    }
});

app.post('/api/cache/raid-helper/cleanup', async (req, res) => {
    try {
        const { olderThanDays = 30 } = req.body;
        const cleanedCount = await cleanupRaidHelperEventCache(olderThanDays);
        
        res.json({
            success: true,
            message: `Cleaned up ${cleanedCount} old cache entries`,
            cleanedCount
        });
    } catch (error) {
        console.error('❌ Error cleaning cache:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clean cache'
        });
    }
});

app.delete('/api/cache/raid-helper/events/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        
        const result = await pool.query(`
            DELETE FROM raid_helper_events_cache 
            WHERE event_id = $1
            RETURNING event_id
        `, [eventId]);
        
        if (result.rows.length > 0) {
            res.json({
                success: true,
                message: `Cache cleared for event ${eventId}`
            });
        } else {
            res.status(404).json({
                success: false,
                message: `No cache found for event ${eventId}`
            });
        }
    } catch (error) {
        console.error('❌ Error clearing cache:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear cache'
        });
    }
});

// Google Apps Script proxy endpoint for RPB archiving
app.post('/api/logs/rpb-archive', async (req, res) => {
    console.log('📁 [RPB ARCHIVE] Starting Google Apps Script proxy request');
    console.log('🔍 [RPB ARCHIVE] Environment check - NODE_ENV:', process.env.NODE_ENV);
    
    try {
        // HARDCODED URL to bypass whatever parsing issue is happening
        const scriptUrl = 'https://script.google.com/macros/s/AKfycbyilOtCQnVteduqKoRPSE0VNAne9tVPkQezaePajGMUiAiMNKmpn0flIdNBgL8tx5Eo/exec';
        
        console.log('🔄 [RPB ARCHIVE] Using hardcoded URL:', scriptUrl.substring(0, 50) + '...');
        
        // Make the request to Google Apps Script with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const response = await fetch(scriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'createRpbBackup'
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        console.log('📊 [RPB ARCHIVE] Response status:', response.status, response.statusText);
        console.log('📊 [RPB ARCHIVE] Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ [RPB ARCHIVE] Google Apps Script error response:', errorText);
            throw new Error(`Google Apps Script request failed: ${response.status} ${response.statusText}. Response: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('✅ [RPB ARCHIVE] Google Apps Script response:', result);
        
        // Return the result from Google Apps Script
        res.json(result);
        
    } catch (error) {
        console.error('❌ [RPB ARCHIVE] Error calling Google Apps Script:', error);
        
        // Enhanced error reporting
        let errorMessage = error.message || 'Failed to create RPB backup';
        if (error.name === 'AbortError') {
            errorMessage = 'Google Apps Script request timed out after 30 seconds';
        } else if (error.code === 'ENOTFOUND') {
            errorMessage = 'Could not connect to Google Apps Script. Check network connectivity.';
        } else if (error.code === 'ECONNRESET') {
            errorMessage = 'Connection to Google Apps Script was reset. Try again.';
        }
        
        console.log('🔍 [RPB ARCHIVE] Full error details:', {
            name: error.name,
            code: error.code,
            message: error.message,
            stack: error.stack
        });
        
        res.status(500).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Get sunder armor data for raid logs
app.get('/api/sunder-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`⚔️ [SUNDER] Retrieving sunder armor data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_player_abilities'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [SUNDER] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get dynamic settings for sunder armor calculation
        const settingsResult = await client.query(`
            SELECT setting_name, setting_value, setting_json
            FROM reward_settings 
            WHERE setting_type = 'sunder'
        `);
        
        console.log(`⚔️ [SUNDER] Raw settings from DB:`, settingsResult.rows);
        
        const settings = {};
        settingsResult.rows.forEach(row => {
            if (row.setting_json) {
                try {
                    // Handle case where setting_json might be a string or already parsed
                    if (typeof row.setting_json === 'string') {
                        settings[row.setting_name] = JSON.parse(row.setting_json);
                    } else {
                        settings[row.setting_name] = row.setting_json;
                    }
                } catch (error) {
                    console.error(`⚔️ [SUNDER] Error parsing JSON for ${row.setting_name}:`, error);
                    settings[row.setting_name] = null;
                }
            } else {
                settings[row.setting_name] = parseFloat(row.setting_value);
            }
        });
        
        console.log(`⚔️ [SUNDER] Parsed settings:`, settings);
        
        const pointRanges = settings.point_ranges || [
            {"min": 0, "max": 49, "points": -10, "color": "red"},
            {"min": 50, "max": 99, "points": 0, "color": "gray"},
            {"min": 100, "max": 119, "points": 5, "color": "green"},
            {"min": 120, "max": 999, "points": 10, "color": "blue"}
        ];
        
        console.log(`⚔️ [SUNDER] Using point ranges:`, pointRanges);
        
        // Query for "Sunder Armor% on targets < 5 stacks" usage
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND ability_name = 'Sunder Armor% on targets < 5 stacks'
            ORDER BY character_name
        `, [eventId]);
        
        console.log(`⚔️ [SUNDER] Found ${result.rows.length} sunder records for event: ${eventId}`);
        console.log(`⚔️ [SUNDER] Raw data sample:`, result.rows.slice(0, 3));
        
        // Process and calculate points for each character
        const finalData = result.rows.map(row => {
            // Parse the sunder count from "112 (64%)" format - extract first number
            const sunderMatch = row.ability_value.toString().match(/(\d+)/);
            const sunderCount = sunderMatch ? parseInt(sunderMatch[1]) : 0;
            
            // Find the appropriate range and calculate points
            const range = pointRanges.find(r => sunderCount >= r.min && sunderCount <= r.max);
            const points = range ? range.points : 0;
            const color = range ? range.color : 'gray';
            
            return {
                character_name: row.character_name,
                character_class: row.character_class,
                sunder_count: sunderCount,
                points: points,
                color: color,
                raw_value: row.ability_value
            };
        }).filter(char => char.sunder_count > 0) // Only include characters who used sunder
          .sort((a, b) => b.points - a.points || b.sunder_count - a.sunder_count); // Sort by points, then by count
        
        console.log(`⚔️ [SUNDER] Processed ${finalData.length} characters with sunder usage`);
        console.log(`⚔️ [SUNDER] Final data sample:`, finalData.slice(0, 2));
        
        res.json({ 
            success: true, 
            data: finalData,
            eventId: eventId,
            settings: {
                point_ranges: pointRanges
            }
        });
        
    } catch (error) {
        console.error('❌ [SUNDER] Error retrieving sunder data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving sunder data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get curse of recklessness data for raid logs
app.get('/api/curse-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`🔮 [CURSE] Retrieving curse of recklessness data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_player_abilities'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [CURSE] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get dynamic settings for curse of recklessness calculation
        const settingsResult = await client.query(`
            SELECT setting_name, setting_value, setting_json
            FROM reward_settings 
            WHERE setting_type = 'curse'
        `);
        
        console.log(`🔮 [CURSE] Raw settings from DB:`, settingsResult.rows);
        
        const settings = {};
        settingsResult.rows.forEach(row => {
            if (row.setting_json) {
                try {
                    if (typeof row.setting_json === 'string') {
                        settings[row.setting_name] = JSON.parse(row.setting_json);
                    } else {
                        settings[row.setting_name] = row.setting_json;
                    }
                } catch (error) {
                    console.error(`🔮 [CURSE] Error parsing JSON for ${row.setting_name}:`, error);
                    settings[row.setting_name] = null;
                }
            } else {
                settings[row.setting_name] = parseFloat(row.setting_value);
            }
        });
        
        console.log(`🔮 [CURSE] Parsed settings:`, settings);
        
        const uptimeThreshold = settings.uptime_threshold || 85;
        const points = settings.points || 10;
        
        console.log(`🔮 [CURSE] Using settings: threshold=${uptimeThreshold}%, points=${points}`);
        
        // Query for "Curse of Recklessness (uptime% - overall: XX%)" usage
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                ability_name,
                ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND ability_name LIKE 'Curse of Recklessness (uptime%% - overall: %)'
            ORDER BY character_name
        `, [eventId]);
        
        console.log(`🔮 [CURSE] Found ${result.rows.length} curse records for event: ${eventId}`);
        console.log(`🔮 [CURSE] Raw data sample:`, result.rows.slice(0, 3));
        
        // Process and calculate points for each character
        const finalData = result.rows.map(row => {
            // Parse the uptime percentage from "133 (85%)" format - extract percentage from brackets
            const uptimeMatch = row.ability_value.toString().match(/\((\d+(?:\.\d+)?)%\)/);
            const uptimePercentage = uptimeMatch ? parseFloat(uptimeMatch[1]) : 0;
            
            // Calculate points based on threshold
            const earnedPoints = uptimePercentage > uptimeThreshold ? points : 0;
            
            return {
                character_name: row.character_name,
                character_class: row.character_class,
                uptime_percentage: uptimePercentage,
                points: earnedPoints,
                raw_value: row.ability_value
            };
        }).filter(char => char.uptime_percentage >= 0) // Include all characters with valid uptime data
          .sort((a, b) => b.uptime_percentage - a.uptime_percentage); // Sort by uptime percentage descending
        
        console.log(`🔮 [CURSE] Processed ${finalData.length} characters with curse uptime data`);
        console.log(`🔮 [CURSE] Final data sample:`, finalData.slice(0, 2));
        
        res.json({ 
            success: true, 
            data: finalData,
            eventId: eventId,
            settings: {
                uptime_threshold: uptimeThreshold,
                points: points
            }
        });
        
    } catch (error) {
        console.error('❌ [CURSE] Error retrieving curse data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving curse data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get curse of shadow data for raid logs
app.get('/api/curse-shadow-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`🌑 [CURSE SHADOW] Retrieving curse of shadow data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_player_abilities'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [CURSE SHADOW] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get dynamic settings for curse of shadow calculation
        const settingsResult = await client.query(`
            SELECT setting_name, setting_value, setting_json
            FROM reward_settings 
            WHERE setting_type = 'curse_shadow'
        `);
        
        console.log(`🌑 [CURSE SHADOW] Raw settings from DB:`, settingsResult.rows);
        
        const settings = {};
        settingsResult.rows.forEach(row => {
            if (row.setting_json) {
                try {
                    if (typeof row.setting_json === 'string') {
                        settings[row.setting_name] = JSON.parse(row.setting_json);
                    } else {
                        settings[row.setting_name] = row.setting_json;
                    }
                } catch (error) {
                    console.error(`🌑 [CURSE SHADOW] Error parsing JSON for ${row.setting_name}:`, error);
                    settings[row.setting_name] = null;
                }
            } else {
                settings[row.setting_name] = parseFloat(row.setting_value);
            }
        });
        
        console.log(`🌑 [CURSE SHADOW] Parsed settings:`, settings);
        
        const uptimeThreshold = settings.uptime_threshold || 85;
        const points = settings.points || 10;
        
        console.log(`🌑 [CURSE SHADOW] Using settings: threshold=${uptimeThreshold}%, points=${points}`);
        
        // Query for "Curse of Shadow (uptime% - overall: XX%)" usage
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                ability_name,
                ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND ability_name LIKE 'Curse of Shadow (uptime%% - overall: %)'
            ORDER BY character_name
        `, [eventId]);
        
        console.log(`🌑 [CURSE SHADOW] Found ${result.rows.length} curse shadow records for event: ${eventId}`);
        console.log(`🌑 [CURSE SHADOW] Raw data sample:`, result.rows.slice(0, 3));
        
        // Process and calculate points for each character
        const finalData = result.rows.map(row => {
            // Parse the uptime percentage from "133 (85%)" format - extract percentage from brackets
            const uptimeMatch = row.ability_value.toString().match(/\((\d+(?:\.\d+)?)%\)/);
            const uptimePercentage = uptimeMatch ? parseFloat(uptimeMatch[1]) : 0;
            
            // Calculate points based on threshold
            const earnedPoints = uptimePercentage > uptimeThreshold ? points : 0;
            
            return {
                character_name: row.character_name,
                character_class: row.character_class,
                uptime_percentage: uptimePercentage,
                points: earnedPoints,
                raw_value: row.ability_value
            };
        }).filter(char => char.uptime_percentage >= 0) // Include all characters with valid uptime data
          .sort((a, b) => b.uptime_percentage - a.uptime_percentage); // Sort by uptime percentage descending
        
        console.log(`🌑 [CURSE SHADOW] Processed ${finalData.length} characters with curse shadow uptime data`);
        console.log(`🌑 [CURSE SHADOW] Final data sample:`, finalData.slice(0, 2));
        
        res.json({ 
            success: true, 
            data: finalData,
            eventId: eventId,
            settings: {
                uptime_threshold: uptimeThreshold,
                points: points
            }
        });
        
    } catch (error) {
        console.error('❌ [CURSE SHADOW] Error retrieving curse shadow data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving curse shadow data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get curse of elements data for raid logs
app.get('/api/curse-elements-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`❄️ [CURSE ELEMENTS] Retrieving curse of elements data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_player_abilities'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [CURSE ELEMENTS] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get dynamic settings for curse of elements calculation
        const settingsResult = await client.query(`
            SELECT setting_name, setting_value, setting_json
            FROM reward_settings 
            WHERE setting_type = 'curse_elements'
        `);
        
        console.log(`❄️ [CURSE ELEMENTS] Raw settings from DB:`, settingsResult.rows);
        
        const settings = {};
        settingsResult.rows.forEach(row => {
            if (row.setting_json) {
                try {
                    if (typeof row.setting_json === 'string') {
                        settings[row.setting_name] = JSON.parse(row.setting_json);
                    } else {
                        settings[row.setting_name] = row.setting_json;
                    }
                } catch (error) {
                    console.error(`❄️ [CURSE ELEMENTS] Error parsing JSON for ${row.setting_name}:`, error);
                    settings[row.setting_name] = null;
                }
            } else {
                settings[row.setting_name] = parseFloat(row.setting_value);
            }
        });
        
        console.log(`❄️ [CURSE ELEMENTS] Parsed settings:`, settings);
        
        const uptimeThreshold = settings.uptime_threshold || 85;
        const points = settings.points || 10;
        
        console.log(`❄️ [CURSE ELEMENTS] Using settings: threshold=${uptimeThreshold}%, points=${points}`);
        
        // Query for "Curse of the Elements (uptime% - overall: XX%)" usage
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                ability_name,
                ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND ability_name LIKE 'Curse of the Elements (uptime%% - overall: %)'
            ORDER BY character_name
        `, [eventId]);
        
        console.log(`❄️ [CURSE ELEMENTS] Found ${result.rows.length} curse elements records for event: ${eventId}`);
        console.log(`❄️ [CURSE ELEMENTS] Raw data sample:`, result.rows.slice(0, 3));
        
        // Process and calculate points for each character
        const finalData = result.rows.map(row => {
            // Parse the uptime percentage from "133 (85%)" format - extract percentage from brackets
            const uptimeMatch = row.ability_value.toString().match(/\((\d+(?:\.\d+)?)%\)/);
            const uptimePercentage = uptimeMatch ? parseFloat(uptimeMatch[1]) : 0;
            
            // Calculate points based on threshold
            const earnedPoints = uptimePercentage > uptimeThreshold ? points : 0;
            
            return {
                character_name: row.character_name,
                character_class: row.character_class,
                uptime_percentage: uptimePercentage,
                points: earnedPoints,
                raw_value: row.ability_value
            };
        }).filter(char => char.uptime_percentage >= 0) // Include all characters with valid uptime data
          .sort((a, b) => b.uptime_percentage - a.uptime_percentage); // Sort by uptime percentage descending
        
        console.log(`❄️ [CURSE ELEMENTS] Processed ${finalData.length} characters with curse elements uptime data`);
        console.log(`❄️ [CURSE ELEMENTS] Final data sample:`, finalData.slice(0, 2));
        
        res.json({ 
            success: true, 
            data: finalData,
            eventId: eventId,
            settings: {
                uptime_threshold: uptimeThreshold,
                points: points
            }
        });
        
    } catch (error) {
        console.error('❌ [CURSE ELEMENTS] Error retrieving curse elements data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving curse elements data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get faerie fire data for raid logs
app.get('/api/faerie-fire-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`🌟 [FAERIE FIRE] Retrieving faerie fire data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_player_abilities'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [FAERIE FIRE] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get dynamic settings for faerie fire calculation
        const settingsResult = await client.query(`
            SELECT setting_name, setting_value, setting_json
            FROM reward_settings 
            WHERE setting_type = 'faerie_fire'
        `);
        
        console.log(`🌟 [FAERIE FIRE] Raw settings from DB:`, settingsResult.rows);
        
        const settings = {};
        settingsResult.rows.forEach(row => {
            if (row.setting_json) {
                try {
                    if (typeof row.setting_json === 'string') {
                        settings[row.setting_name] = JSON.parse(row.setting_json);
                    } else {
                        settings[row.setting_name] = row.setting_json;
                    }
                } catch (error) {
                    console.error(`🌟 [FAERIE FIRE] Error parsing JSON for ${row.setting_name}:`, error);
                    settings[row.setting_name] = null;
                }
            } else {
                settings[row.setting_name] = parseFloat(row.setting_value);
            }
        });
        
        console.log(`🌟 [FAERIE FIRE] Parsed settings:`, settings);
        
        const uptimeThreshold = settings.uptime_threshold || 85;
        const points = settings.points || 10;
        
        console.log(`🌟 [FAERIE FIRE] Using settings: threshold=${uptimeThreshold}%, points=${points}`);
        
        // Query for "Faerie Fire (uptime% - overall: XX%)" usage
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                ability_name,
                ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND ability_name LIKE 'Faerie Fire (uptime%% - overall: %)'
            ORDER BY character_name
        `, [eventId]);
        
        console.log(`🌟 [FAERIE FIRE] Found ${result.rows.length} faerie fire records for event: ${eventId}`);
        console.log(`🌟 [FAERIE FIRE] Raw data sample:`, result.rows.slice(0, 3));
        
        // Process and calculate points for each character
        const finalData = result.rows.map(row => {
            // Parse the uptime percentage from "133 (85%)" format - extract percentage from brackets
            const uptimeMatch = row.ability_value.toString().match(/\((\d+(?:\.\d+)?)%\)/);
            const uptimePercentage = uptimeMatch ? parseFloat(uptimeMatch[1]) : 0;
            
            // Calculate points based on threshold
            const earnedPoints = uptimePercentage > uptimeThreshold ? points : 0;
            
            return {
                character_name: row.character_name,
                character_class: row.character_class,
                uptime_percentage: uptimePercentage,
                points: earnedPoints,
                raw_value: row.ability_value
            };
        }).filter(char => char.uptime_percentage >= 0) // Include all characters with valid uptime data
          .sort((a, b) => b.uptime_percentage - a.uptime_percentage); // Sort by uptime percentage descending
        
        console.log(`🌟 [FAERIE FIRE] Processed ${finalData.length} characters with faerie fire uptime data`);
        console.log(`🌟 [FAERIE FIRE] Final data sample:`, finalData.slice(0, 2));
        
        res.json({ 
            success: true, 
            data: finalData,
            eventId: eventId,
            settings: {
                uptime_threshold: uptimeThreshold,
                points: points
            }
        });
        
    } catch (error) {
        console.error('❌ [FAERIE FIRE] Error retrieving faerie fire data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving faerie fire data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get scorch data for raid logs
app.get('/api/scorch-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`🔥 [SCORCH] Retrieving scorch data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_player_abilities'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [SCORCH] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get dynamic settings for scorch calculation
        const settingsResult = await client.query(`
            SELECT setting_name, setting_value, setting_json
            FROM reward_settings 
            WHERE setting_type = 'scorch'
        `);
        
        console.log(`🔥 [SCORCH] Raw settings from DB:`, settingsResult.rows);
        
        const settings = {};
        settingsResult.rows.forEach(row => {
            if (row.setting_json) {
                try {
                    if (typeof row.setting_json === 'string') {
                        settings[row.setting_name] = JSON.parse(row.setting_json);
                    } else {
                        settings[row.setting_name] = row.setting_json;
                    }
                } catch (error) {
                    console.error(`🔥 [SCORCH] Error parsing JSON for ${row.setting_name}:`, error);
                    settings[row.setting_name] = null;
                }
            } else {
                settings[row.setting_name] = parseFloat(row.setting_value);
            }
        });
        
        console.log(`🔥 [SCORCH] Parsed settings:`, settings);
        
        const tier1Max = settings.tier1_max || 99;
        const tier1Points = settings.tier1_points || 0;
        const tier2Max = settings.tier2_max || 199;
        const tier2Points = settings.tier2_points || 5;
        const tier3Points = settings.tier3_points || 10;
        
        console.log(`🔥 [SCORCH] Using settings: 0-${tier1Max}=${tier1Points}pts, ${tier1Max + 1}-${tier2Max}=${tier2Points}pts, ${tier2Max + 1}+=${tier3Points}pts`);
        
        // Query for "Scorch% on targets < 5 stacks" usage
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                ability_name,
                ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND ability_name = 'Scorch% on targets < 5 stacks'
            ORDER BY character_name
        `, [eventId]);
        
        console.log(`🔥 [SCORCH] Found ${result.rows.length} scorch records for event: ${eventId}`);
        console.log(`🔥 [SCORCH] Raw data sample:`, result.rows.slice(0, 3));
        
        // Process and calculate points for each character
        const finalData = result.rows.map(row => {
            // Parse the scorch count from "334 (74%)" format - extract number before brackets
            const scorchMatch = row.ability_value.toString().match(/^(\d+)/);
            const scorchCount = scorchMatch ? parseInt(scorchMatch[1]) : 0;
            
            // Calculate points based on tiers
            let earnedPoints = tier1Points; // default 0-99 range
            if (scorchCount > tier2Max) {
                earnedPoints = tier3Points; // 200+
            } else if (scorchCount > tier1Max) {
                earnedPoints = tier2Points; // 100-199
            }
            
            return {
                character_name: row.character_name,
                character_class: row.character_class,
                scorch_count: scorchCount,
                points: earnedPoints,
                raw_value: row.ability_value
            };
        }).filter(char => char.scorch_count >= 0) // Include all characters with valid scorch data
          .sort((a, b) => b.scorch_count - a.scorch_count); // Sort by scorch count descending
        
        console.log(`🔥 [SCORCH] Processed ${finalData.length} characters with scorch data`);
        console.log(`🔥 [SCORCH] Final data sample:`, finalData.slice(0, 2));
        
        res.json({ 
            success: true, 
            data: finalData,
            eventId: eventId,
            settings: {
                tier1_max: tier1Max,
                tier1_points: tier1Points,
                tier2_max: tier2Max,
                tier2_points: tier2Points,
                tier3_points: tier3Points
            }
        });
        
    } catch (error) {
        console.error('❌ [SCORCH] Error retrieving scorch data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving scorch data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get demoralizing shout data for raid logs
app.get('/api/demo-shout-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`⚔️ [DEMO SHOUT] Retrieving demoralizing shout data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_player_abilities'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [DEMO SHOUT] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get dynamic settings for demoralizing shout calculation
        const settingsResult = await client.query(`
            SELECT setting_name, setting_value, setting_json
            FROM reward_settings 
            WHERE setting_type = 'demo_shout'
        `);
        
        console.log(`⚔️ [DEMO SHOUT] Raw settings from DB:`, settingsResult.rows);
        
        const settings = {};
        settingsResult.rows.forEach(row => {
            if (row.setting_json) {
                try {
                    if (typeof row.setting_json === 'string') {
                        settings[row.setting_name] = JSON.parse(row.setting_json);
                    } else {
                        settings[row.setting_name] = row.setting_json;
                    }
                } catch (error) {
                    console.error(`⚔️ [DEMO SHOUT] Error parsing JSON for ${row.setting_name}:`, error);
                    settings[row.setting_name] = null;
                }
            } else {
                settings[row.setting_name] = parseFloat(row.setting_value);
            }
        });
        
        console.log(`⚔️ [DEMO SHOUT] Parsed settings:`, settings);
        
        const tier1Max = settings.tier1_max || 99;
        const tier1Points = settings.tier1_points || 0;
        const tier2Max = settings.tier2_max || 199;
        const tier2Points = settings.tier2_points || 5;
        const tier3Points = settings.tier3_points || 10;
        
        console.log(`⚔️ [DEMO SHOUT] Using settings: 0-${tier1Max}=${tier1Points}pts, ${tier1Max + 1}-${tier2Max}=${tier2Points}pts, ${tier2Max + 1}+=${tier3Points}pts`);
        
        // Query for "Demoralizing Shout (uptime% - overall: XX%)" usage
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                ability_name,
                ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND ability_name LIKE 'Demoralizing Shout (uptime%% - overall: %)'
            ORDER BY character_name
        `, [eventId]);
        
        console.log(`⚔️ [DEMO SHOUT] Found ${result.rows.length} demoralizing shout records for event: ${eventId}`);
        console.log(`⚔️ [DEMO SHOUT] Raw data sample:`, result.rows.slice(0, 3));
        
        // Process and calculate points for each character
        const finalData = result.rows.map(row => {
            // Parse the demoralizing shout count from "113 (51%)" format - extract number before brackets
            const demoShoutMatch = row.ability_value.toString().match(/^(\d+)/);
            const demoShoutCount = demoShoutMatch ? parseInt(demoShoutMatch[1]) : 0;
            
            // Calculate points based on tiers
            let earnedPoints = tier1Points; // default 0-99 range
            if (demoShoutCount > tier2Max) {
                earnedPoints = tier3Points; // 200+
            } else if (demoShoutCount > tier1Max) {
                earnedPoints = tier2Points; // 100-199
            }
            
            return {
                character_name: row.character_name,
                character_class: row.character_class,
                demo_shout_count: demoShoutCount,
                points: earnedPoints,
                raw_value: row.ability_value
            };
        }).filter(char => char.demo_shout_count >= 0) // Include all characters with valid demo shout data
          .sort((a, b) => b.demo_shout_count - a.demo_shout_count); // Sort by demo shout count descending
        
        console.log(`⚔️ [DEMO SHOUT] Processed ${finalData.length} characters with demoralizing shout data`);
        console.log(`⚔️ [DEMO SHOUT] Final data sample:`, finalData.slice(0, 2));
        
        res.json({ 
            success: true, 
            data: finalData,
            eventId: eventId,
            settings: {
                tier1_max: tier1Max,
                tier1_points: tier1Points,
                tier2_max: tier2Max,
                tier2_points: tier2Points,
                tier3_points: tier3Points
            }
        });
        
    } catch (error) {
        console.error('❌ [DEMO SHOUT] Error retrieving demoralizing shout data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving demoralizing shout data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get polymorph data for raid logs
app.get('/api/polymorph-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`🔮 [POLYMORPH] Retrieving polymorph data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_player_abilities'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [POLYMORPH] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get dynamic settings for polymorph calculation
        const settingsResult = await client.query(`
            SELECT setting_name, setting_value
            FROM reward_settings 
            WHERE setting_type = 'polymorph'
        `);
        
        const settings = {};
        settingsResult.rows.forEach(row => {
            settings[row.setting_name] = parseFloat(row.setting_value);
        });
        
        const pointsPerDivision = settings.points_per_division || 1;
        const polymorphsNeeded = settings.polymorphs_needed || 2;
        const maxPoints = settings.max_points || 5;
        
        console.log(`🔮 [POLYMORPH] Using dynamic settings: points_per_division=${pointsPerDivision}, polymorphs_needed=${polymorphsNeeded}, max_points=${maxPoints}`);
        
        // Query for "Polymorph" ability usage
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND ability_name = 'Polymorph'
            ORDER BY character_name
        `, [eventId]);
        
        console.log(`🔮 [POLYMORPH] Found ${result.rows.length} polymorph records for event: ${eventId}`);
        console.log(`🔮 [POLYMORPH] Raw data sample:`, result.rows.slice(0, 3));
        
        // Process and calculate points for each character
        const finalData = result.rows.map(row => {
            // Parse the polymorph count (might be "6" or "6 (some text)")
            const polymorphMatch = row.ability_value.toString().match(/(\d+)/);
            const polymorphsUsed = polymorphMatch ? parseInt(polymorphMatch[1]) : 0;
            
            // Calculate points: min(max_points, floor(polymorphs / needed) * points_per_division)
            // 1 point per 2 polymorphs, max 5 points
            const points = Math.min(maxPoints, Math.floor(polymorphsUsed / polymorphsNeeded) * pointsPerDivision);
            
            return {
                character_name: row.character_name,
                character_class: row.character_class,
                polymorphs_used: polymorphsUsed,
                points: points
            };
        }).filter(char => char.polymorphs_used > 0) // Only include characters who used polymorph
          .sort((a, b) => b.points - a.points); // Sort by points descending
        
        console.log(`🔮 [POLYMORPH] Processed ${finalData.length} characters with polymorphs`);
        console.log(`🔮 [POLYMORPH] Final data sample:`, finalData.slice(0, 2));
        
        res.json({ 
            success: true, 
            data: finalData,
            eventId: eventId,
            settings: {
                points_per_division: pointsPerDivision,
                polymorphs_needed: polymorphsNeeded,
                max_points: maxPoints
            }
        });
        
    } catch (error) {
        console.error('❌ [POLYMORPH] Error retrieving polymorph data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving polymorph data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get power infusion data for raid logs
app.get('/api/power-infusion-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`💫 [POWER_INFUSION] Retrieving power infusion data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_player_abilities'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [POWER_INFUSION] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get dynamic settings for power infusion calculation
        const settingsResult = await client.query(`
            SELECT setting_name, setting_value
            FROM reward_settings 
            WHERE setting_type = 'power_infusion'
        `);
        
        const settings = {};
        settingsResult.rows.forEach(row => {
            settings[row.setting_name] = parseFloat(row.setting_value);
        });
        
        const pointsPerDivision = settings.points_per_division || 1;
        const infusionsNeeded = settings.infusions_needed || 2;
        const maxPoints = settings.max_points || 10;
        
        console.log(`💫 [POWER_INFUSION] Using dynamic settings: points_per_division=${pointsPerDivision}, infusions_needed=${infusionsNeeded}, max_points=${maxPoints}`);
        
        // Query for both power infusion abilities
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                ability_name,
                ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND (ability_name = 'Power Infusion used or gained* on bosses' 
                OR ability_name = 'Power Infusion used or gained* on trash')
            ORDER BY character_name, ability_name
        `, [eventId]);
        
        console.log(`💫 [POWER_INFUSION] Found ${result.rows.length} power infusion records for event: ${eventId}`);
        console.log(`💫 [POWER_INFUSION] Raw data sample:`, result.rows.slice(0, 5));
        
        // Group by character and combine abilities
        const characterMap = new Map();
        
        result.rows.forEach(row => {
            const characterName = row.character_name;
            
            if (!characterMap.has(characterName)) {
                characterMap.set(characterName, {
                    character_name: characterName,
                    character_class: row.character_class,
                    boss_infusions: 0,
                    trash_infusions: 0,
                    boss_raw: '',
                    trash_raw: ''
                });
            }
            
            const character = characterMap.get(characterName);
            const abilityValue = row.ability_value.toString();
            
            // Parse ability value: "15 (5 self)" -> 15 - 5 = 10
            // or "5" -> 5
            const mainMatch = abilityValue.match(/^(\d+)/);
            const selfMatch = abilityValue.match(/\((\d+)\s+self\)/i);
            
            const mainCount = mainMatch ? parseInt(mainMatch[1]) : 0;
            const selfCount = selfMatch ? parseInt(selfMatch[1]) : 0;
            const effectiveCount = Math.max(0, mainCount - selfCount);
            
            if (row.ability_name.includes('bosses')) {
                character.boss_infusions = effectiveCount;
                character.boss_raw = abilityValue;
            } else if (row.ability_name.includes('trash')) {
                character.trash_infusions = effectiveCount;
                character.trash_raw = abilityValue;
            }
        });
        
        // Process and calculate points for each character
        const finalData = Array.from(characterMap.values()).map(character => {
            const totalInfusions = character.boss_infusions + character.trash_infusions;
            
            // Calculate points: min(max_points, floor(infusions / needed) * points_per_division)
            // 1 point per 2 power infusions, max 5 points
            const points = Math.min(maxPoints, Math.floor(totalInfusions / infusionsNeeded) * pointsPerDivision);
            
            return {
                character_name: character.character_name,
                character_class: character.character_class,
                boss_infusions: character.boss_infusions,
                trash_infusions: character.trash_infusions,
                total_infusions: totalInfusions,
                boss_raw: character.boss_raw,
                trash_raw: character.trash_raw,
                points: points
            };
        }).filter(char => char.total_infusions > 0) // Only include characters who used power infusion
          .sort((a, b) => b.total_infusions - a.total_infusions); // Sort by total infusions descending
        
        console.log(`💫 [POWER_INFUSION] Processed ${finalData.length} characters with power infusions`);
        console.log(`💫 [POWER_INFUSION] Final data sample:`, finalData.slice(0, 2));
        
        res.json({ 
            success: true, 
            data: finalData,
            eventId: eventId,
            settings: {
                points_per_division: pointsPerDivision,
                infusions_needed: infusionsNeeded,
                max_points: maxPoints
            }
        });
        
    } catch (error) {
        console.error('❌ [POWER_INFUSION] Error retrieving power infusion data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving power infusion data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Get decurses data for raid logs
app.get('/api/decurses-data/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`🪄 [DECURSES] Retrieving decurses data for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'sheet_player_abilities'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            console.log('⚠️ [DECURSES] Table does not exist, returning empty data');
            return res.json({ success: true, data: [] });
        }
        
        // Get dynamic settings for decurses calculation
        const settingsResult = await client.query(`
            SELECT setting_name, setting_value
            FROM reward_settings 
            WHERE setting_type = 'decurses'
        `);
        
        const settings = {};
        settingsResult.rows.forEach(row => {
            settings[row.setting_name] = parseFloat(row.setting_value);
        });
        
        const pointsPerDivision = settings.points_per_division || 1;
        const decursesNeeded = settings.decurses_needed || 3;
        const maxPoints = settings.max_points || 10;
        const minPoints = settings.min_points || -10;
        
        console.log(`🪄 [DECURSES] Using dynamic settings: points_per_division=${pointsPerDivision}, decurses_needed=${decursesNeeded}, max_points=${maxPoints}, min_points=${minPoints}`);
        
        // Query for "Remove Lesser Curse" usage by mages
        const result = await client.query(`
            SELECT 
                character_name,
                character_class,
                ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            AND ability_name = 'Remove Lesser Curse'
            AND character_class = 'Mage'
            ORDER BY character_name
        `, [eventId]);
        
        console.log(`🪄 [DECURSES] Found ${result.rows.length} decurse records for event: ${eventId}`);
        console.log(`🪄 [DECURSES] Raw data sample:`, result.rows.slice(0, 3));
        
        if (result.rows.length === 0) {
            return res.json({ 
                success: true, 
                data: [],
                eventId: eventId,
                settings: {
                    points_per_division: pointsPerDivision,
                    decurses_needed: decursesNeeded,
                    max_points: maxPoints,
                    min_points: minPoints,
                    average_decurses: 0
                }
            });
        }
        
        // Parse decurse counts
        const mageData = result.rows.map(row => {
            const decurseMatch = row.ability_value.toString().match(/(\d+)/);
            const decursesUsed = decurseMatch ? parseInt(decurseMatch[1]) : 0;
            
            return {
                character_name: row.character_name,
                character_class: row.character_class,
                decurses_used: decursesUsed
            };
        });
        
        // Calculate average decurses
        const totalDecurses = mageData.reduce((sum, mage) => sum + mage.decurses_used, 0);
        const averageDecurses = mageData.length > 0 ? totalDecurses / mageData.length : 0;
        
        console.log(`🪄 [DECURSES] Average decurses: ${averageDecurses.toFixed(1)} (total: ${totalDecurses}, mages: ${mageData.length})`);
        
        // Calculate points for each mage based on difference from average
        const finalData = mageData.map(mage => {
            const differenceFromAverage = mage.decurses_used - averageDecurses;
            
            // Calculate points: +1 point per 3 above average, -1 point per 3 below average
            const rawPoints = Math.floor(differenceFromAverage / decursesNeeded) * pointsPerDivision;
            
            // Cap at max/min points
            const points = Math.max(minPoints, Math.min(maxPoints, rawPoints));
            
            return {
                character_name: mage.character_name,
                character_class: mage.character_class,
                decurses_used: mage.decurses_used,
                difference_from_average: differenceFromAverage,
                points: points
            };
        }).sort((a, b) => b.decurses_used - a.decurses_used); // Sort by decurses used descending
        
        console.log(`🪄 [DECURSES] Processed ${finalData.length} mages with decurses`);
        console.log(`🪄 [DECURSES] Final data sample:`, finalData.slice(0, 2));
        
        res.json({ 
            success: true, 
            data: finalData,
            eventId: eventId,
            settings: {
                points_per_division: pointsPerDivision,
                decurses_needed: decursesNeeded,
                max_points: maxPoints,
                min_points: minPoints,
                average_decurses: averageDecurses
            }
        });
        
    } catch (error) {
        console.error('❌ [DECURSES] Error retrieving decurses data:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving decurses data',
            error: error.message 
        });
    } finally {
        if (client) client.release();
    }
});

// Debug endpoint for checking environment variables on Heroku (remove after debugging)
app.get('/api/debug/env', (req, res) => {
    const googleVars = Object.keys(process.env).filter(key => key.startsWith('GOOGLE_'));
    
    res.json({
        NODE_ENV: process.env.NODE_ENV,
        hasGoogleAppsScriptUrl: !!process.env.GOOGLE_APPS_SCRIPT_URL,
        googleVarsCount: googleVars.length,
        googleVars: googleVars,
        scriptUrlLength: process.env.GOOGLE_APPS_SCRIPT_URL ? process.env.GOOGLE_APPS_SCRIPT_URL.length : 0,
        scriptUrlStart: process.env.GOOGLE_APPS_SCRIPT_URL ? process.env.GOOGLE_APPS_SCRIPT_URL.substring(0, 50) + '...' : 'NOT SET'
    });
});

// Migration endpoint to add missing reward settings
app.post('/api/admin/migrate-reward-settings', async (req, res) => {
    let client;
    try {
        console.log('🔧 [MIGRATION] Starting reward settings migration...');
        client = await pool.connect();
        
        // Check current reward settings
        const currentSettings = await client.query(`
            SELECT setting_type, setting_name 
            FROM reward_settings 
            ORDER BY setting_type, setting_name
        `);
        
        console.log('📊 [MIGRATION] Current settings:', currentSettings.rows.map(r => `${r.setting_type}.${r.setting_name}`));
        
        // Insert missing reward settings
        const result = await client.query(`
            INSERT INTO reward_settings (setting_type, setting_name, setting_value, description)
            VALUES 
                ('mana_potions', 'threshold', 10, 'Minimum potions needed before earning points'),
                ('mana_potions', 'points_per_potion', 3, 'Points earned per potion above threshold'),
                ('mana_potions', 'max_points', 10, 'Maximum points that can be earned from mana potions'),
                ('runes', 'usage_divisor', 2, 'Number of runes needed per point'),
                ('runes', 'points_per_division', 1, 'Points earned per rune threshold reached'),
                ('interrupts', 'points_per_interrupt', 1, 'Points earned per interrupt'),
                ('interrupts', 'interrupts_needed', 1, 'Number of interrupts needed per point'),
                ('interrupts', 'max_points', 5, 'Maximum points that can be earned from interrupts'),
                ('disarms', 'points_per_disarm', 1, 'Points earned per disarm'),
                ('disarms', 'disarms_needed', 1, 'Number of disarms needed per point'),
                ('disarms', 'max_points', 5, 'Maximum points that can be earned from disarms'),
                ('sunder', 'enabled', 1, 'Whether Sunder Armor tracking is enabled')
            ON CONFLICT (setting_type, setting_name) DO NOTHING
            RETURNING setting_type, setting_name
        `);
        
        // Insert sunder armor point ranges separately (JSON data)
        const sunderResult = await client.query(`
            INSERT INTO reward_settings (setting_type, setting_name, setting_value, setting_json, description)
            VALUES 
                ('sunder', 'point_ranges', 0, '[
                  {"min": 0, "max": 49, "points": -10, "color": "red"},
                  {"min": 50, "max": 99, "points": 0, "color": "gray"},
                  {"min": 100, "max": 119, "points": 5, "color": "green"},
                  {"min": 120, "max": 999, "points": 10, "color": "blue"}
                ]', 'Point ranges for Sunder Armor performance')
            ON CONFLICT (setting_type, setting_name) DO NOTHING
            RETURNING setting_type, setting_name
        `);
        
        console.log(`✅ [MIGRATION] Added ${result.rows.length} new reward settings:`, result.rows);
        console.log(`✅ [MIGRATION] Added ${sunderResult.rows.length} sunder settings:`, sunderResult.rows);
        
        // Get final count
        const finalSettings = await client.query(`
            SELECT setting_type, COUNT(*) as count
            FROM reward_settings 
            GROUP BY setting_type
            ORDER BY setting_type
        `);
        
        res.json({
            success: true,
            message: `Migration completed. Added ${result.rows.length} new settings.`,
            addedSettings: result.rows,
            finalCounts: finalSettings.rows
        });
        
    } catch (error) {
        console.error('❌ [MIGRATION] Migration failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (client) client.release();
    }
});

// --- RPB Tracking Endpoints ---

// Get tracking status for an event (with optional analysis type and logUrl)
app.get('/api/rpb-tracking/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { analysisType, logUrl } = req.query; // Optional query parameters
    
    console.log(`📊 [TRACKING] Getting tracking status for event: ${eventId}, type: ${analysisType || 'all'}, logUrl: ${logUrl || 'any'}`);
    
    let query, params;
    
    if (analysisType && logUrl) {
      // Get specific analysis type and logUrl
      query = 'SELECT * FROM rpb_tracking WHERE event_id = $1 AND analysis_type = $2 AND log_url = $3 ORDER BY created_at DESC LIMIT 1';
      params = [eventId, analysisType, logUrl];
    } else if (analysisType) {
      // Get specific analysis type (most recent first)
      query = 'SELECT * FROM rpb_tracking WHERE event_id = $1 AND analysis_type = $2 ORDER BY created_at DESC, id DESC LIMIT 1';
      params = [eventId, analysisType];
    } else {
      // Get all analysis types for the event
      query = 'SELECT * FROM rpb_tracking WHERE event_id = $1 ORDER BY analysis_type, created_at DESC';
      params = [eventId];
    }
    
    const result = await pool.query(query, params);
    
    // Debug: Show all matching records
    if (analysisType === 'world_buffs') {
      console.log(`🔍 [TRACKING DEBUG] Found ${result.rows.length} world_buffs records for event ${eventId}:`);
      result.rows.forEach((row, index) => {
        console.log(`🔍 [TRACKING DEBUG] Record ${index + 1}:`, {
          id: row.id,
          log_url: row.log_url,
          archive_url: row.archive_url,
          archive_name: row.archive_name,
          created_at: row.created_at,
          rpb_status: row.rpb_status
        });
      });
    }
    
    if (result.rows.length === 0) {
      console.log(`📊 [TRACKING] No tracking found for event: ${eventId}, type: ${analysisType || 'any'}`);
      return res.json({
        success: true,
        hasData: false,
        data: null
      });
    }
    
    if (analysisType) {
      // Return single analysis result (backward compatibility)
      const tracking = result.rows[0];
      console.log(`📊 [TRACKING] Found ${analysisType} tracking for event ${eventId}: ${tracking.rpb_status}`);
      
      res.json({
        success: true,
        hasRPB: true, // Keep for backward compatibility
        hasData: true,
        status: tracking.rpb_status,
        logUrl: tracking.log_url,
        completedAt: tracking.rpb_completed_at,
        archiveUrl: tracking.archive_url,
        archiveName: tracking.archive_name,
        analysisType: tracking.analysis_type
      });
    } else {
      // Return all analysis types
      console.log(`📊 [TRACKING] Found ${result.rows.length} tracking records for event ${eventId}`);
      
      const trackingData = {};
      result.rows.forEach(row => {
        trackingData[row.analysis_type] = {
          status: row.rpb_status,
          logUrl: row.log_url,
          completedAt: row.rpb_completed_at,
          archiveUrl: row.archive_url,
          archiveName: row.archive_name,
          analysisType: row.analysis_type
        };
      });
      
      res.json({
        success: true,
        hasData: true,
        data: trackingData
      });
    }
    
  } catch (error) {
    console.error('❌ [TRACKING] Error getting tracking status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// --- Google Sheet Import Endpoints ---

// Import World Buffs or Frost Resistance data from Google Sheet
app.post('/api/import-world-buffs', async (req, res) => {
  const { sheetUrl, eventId, analysisType = 'world_buffs' } = req.body;
  
  try {
    
    if (!sheetUrl || !eventId) {
      return res.status(400).json({
        success: false,
        message: 'Sheet URL and Event ID are required'
      });
    }

    const logPrefix = analysisType === 'frost_resistance' ? '🧊 [FROST RES IMPORT]' : '🌍 [WORLD BUFFS IMPORT]';
    console.log(`${logPrefix} Starting import for event ${eventId} from ${sheetUrl}`);

    // Extract sheet ID from URL
    const sheetIdMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!sheetIdMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Google Sheets URL format'
      });
    }

    const sheetId = sheetIdMatch[1];
    
    // Try multiple CSV export methods (ordered to try more flexible options first)
    const csvUrls = [
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`, // Gets first sheet with data
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&single=true`, // Single sheet export
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`, // Specifically first tab
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&single=true&gid=0` // Single sheet, first tab
    ];

    let csvResponse = null;
    let successfulUrl = null;

    for (const csvUrl of csvUrls) {
      try {
        console.log(`${logPrefix} Trying CSV URL: ${csvUrl}`);
        
        csvResponse = await axios.get(csvUrl, {
          timeout: 60000, // Increased to 60 seconds
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          validateStatus: function (status) {
            return status >= 200 && status < 300;
          },
          maxRedirects: 5
        });
        
        // Check if response is actually CSV (not HTML error page)
        const contentType = csvResponse.headers['content-type'] || '';
        if (contentType.includes('text/csv') || contentType.includes('text/plain') || 
            !csvResponse.data.includes('<!DOCTYPE html>')) {
          successfulUrl = csvUrl;
          console.log(`✅ ${logPrefix} Successfully fetched CSV from: ${csvUrl}`);
          break;
        } else {
          console.log(`❌ ${logPrefix} Response was HTML, not CSV from: ${csvUrl}`);
          csvResponse = null;
        }
      } catch (error) {
        console.log(`❌ ${logPrefix} Failed to fetch from ${csvUrl}: ${error.message}`);
        continue;
      }
    }

    if (!csvResponse) {
      throw new Error('Unable to fetch CSV data from any of the attempted URLs. Please ensure the sheet is publicly accessible.');
    }

    const csvData = csvResponse.data;
    console.log(`${logPrefix} Received CSV data, length: ${csvData.length} characters`);
    console.log(`${logPrefix} First 500 characters of CSV data:`, csvData.substring(0, 500));
    console.log(`${logPrefix} CSV data (first 10 lines):`, csvData.split('\n').slice(0, 10));

    let dbResult;
    let sheetTitle = 'Unknown Sheet';

    if (analysisType === 'frost_resistance') {
      // Parse Frost Resistance CSV data
      const parsedData = parseFrostResCSV(csvData, eventId, analysisType);
      
      // Store frost resistance data in database
      dbResult = await storeFrostResDataInDB(parsedData, eventId, sheetUrl, sheetTitle, analysisType);
      
      const actionMessage = 'imported'; // Frost res doesn't have wasReplacement logic yet
      console.log(`${logPrefix} Successfully ${actionMessage} ${dbResult.playerCount} players with frost resistance data`);

      res.json({
        success: true,
        message: `Successfully imported ${dbResult.playerCount} players with frost resistance data`,
        eventId: eventId,
        sheetTitle: sheetTitle,
        playerCount: dbResult.playerCount,
        frostResCount: dbResult.playerCount // Use playerCount as frostResCount for consistency
      });
    } else {
      // Parse World Buffs CSV data
      const parsedData = parseWorldBuffsCSV(csvData, eventId, analysisType);
      
      if (!parsedData.success) {
        return res.status(400).json(parsedData);
      }

      // Store world buffs data in database
      dbResult = await storeWorldBuffsDataInDB(parsedData.data, eventId, sheetUrl, parsedData.sheetTitle, analysisType);

      const actionMessage = dbResult.wasReplacement ? 'replaced' : 'imported';
      console.log(`${logPrefix} Successfully ${actionMessage} ${dbResult.playerCount} players with ${dbResult.buffsCount} buff entries`);

      res.json({
        success: true,
        message: dbResult.wasReplacement 
          ? `Successfully replaced existing data with ${dbResult.playerCount} players and ${dbResult.buffsCount} buff entries`
          : `Successfully imported ${dbResult.playerCount} players with ${dbResult.buffsCount} buff entries`,
        eventId: eventId,
        sheetTitle: parsedData.sheetTitle,
        playerCount: dbResult.playerCount,
        buffsCount: dbResult.buffsCount,
        wasReplacement: dbResult.wasReplacement
      });
    }

  } catch (error) {
    const logPrefix = analysisType === 'frost_resistance' ? '🧊 [FROST RES IMPORT]' : '🌍 [WORLD BUFFS IMPORT]';
    console.error(`❌ ${logPrefix} Error importing sheet:`, error);
    
    let errorMessage = analysisType === 'frost_resistance' ? 'Failed to import Frost Resistance data' : 'Failed to import World Buffs data';
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      errorMessage = 'Unable to connect to Google Sheets. Please check the URL and try again.';
    } else if (error.response && error.response.status === 404) {
      errorMessage = 'Sheet not found or not publicly accessible. Please make sure the sheet is shared publicly.';
    } else if (error.response && error.response.status === 403) {
      errorMessage = 'Access denied to the sheet. Please make sure the sheet is shared publicly.';
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message
    });
  }
});

// Import data from Google Sheet
app.post('/api/import-sheet', async (req, res) => {
  try {
    const { sheetUrl, eventId } = req.body;
    
    if (!sheetUrl || !eventId) {
      return res.status(400).json({
        success: false,
        message: 'Sheet URL and Event ID are required'
      });
    }

    console.log(`📊 [SHEET IMPORT] Starting import for event ${eventId} from ${sheetUrl}`);

    // Extract sheet ID from URL
    const sheetIdMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!sheetIdMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Google Sheets URL format'
      });
    }

    const sheetId = sheetIdMatch[1];
    
    // Try multiple CSV export methods (ordered to try more flexible options first)
    const csvUrls = [
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`, // Gets first sheet with data
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&single=true`, // Single sheet export
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`, // Specifically first tab
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&single=true&gid=0` // Single sheet, first tab
    ];

    let csvResponse = null;
    let successfulUrl = null;

    for (const csvUrl of csvUrls) {
      try {
        console.log(`📊 [SHEET IMPORT] Trying CSV URL: ${csvUrl}`);
        
        csvResponse = await axios.get(csvUrl, {
          timeout: 60000, // Increased to 60 seconds
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          validateStatus: function (status) {
            return status >= 200 && status < 300;
          },
          maxRedirects: 5
        });
        
        // Check if response is actually CSV (not HTML error page)
        const contentType = csvResponse.headers['content-type'] || '';
        if (contentType.includes('text/csv') || contentType.includes('text/plain') || 
            !csvResponse.data.includes('<!DOCTYPE html>')) {
          successfulUrl = csvUrl;
          console.log(`✅ [SHEET IMPORT] Successfully fetched CSV from: ${csvUrl}`);
          break;
        } else {
          console.log(`❌ [SHEET IMPORT] Response was HTML, not CSV from: ${csvUrl}`);
          csvResponse = null;
        }
      } catch (error) {
        console.log(`❌ [SHEET IMPORT] Failed to fetch from ${csvUrl}: ${error.message}`);
        continue;
      }
    }

    if (!csvResponse) {
      throw new Error('Unable to fetch CSV data from any of the attempted URLs. Please ensure the sheet is publicly accessible.');
    }

    const csvData = csvResponse.data;
    console.log(`📊 [SHEET IMPORT] Received CSV data, length: ${csvData.length} characters`);
    console.log(`📊 [SHEET IMPORT] First 500 characters of CSV data:`, csvData.substring(0, 500));
    console.log(`📊 [SHEET IMPORT] Lines 5-10 of CSV data:`, csvData.split('\n').slice(4, 10));

    // Parse CSV data
    const parsedData = parseGoogleSheetCSV(csvData, eventId);
    
    if (!parsedData.success) {
      return res.status(400).json(parsedData);
    }

    // Store data in database
    const dbResult = await storeSheetDataInDB(parsedData.data, eventId, sheetUrl, parsedData.sheetTitle);

    const actionMessage = dbResult.wasReplacement ? 'replaced' : 'imported';
    console.log(`📊 [SHEET IMPORT] Successfully ${actionMessage} ${dbResult.playerCount} players with ${dbResult.abilitiesCount} abilities`);

    // Fetch the stored data to return
    const storedData = await getStoredSheetData(eventId);

    res.json({
      success: true,
      message: dbResult.wasReplacement 
        ? `Successfully replaced existing data with ${dbResult.playerCount} players and ${dbResult.abilitiesCount} abilities`
        : `Successfully imported ${dbResult.playerCount} players with ${dbResult.abilitiesCount} abilities`,
      eventId: eventId,
      sheetTitle: parsedData.sheetTitle,
      playerCount: dbResult.playerCount,
      abilitiesCount: dbResult.abilitiesCount,
      playerData: storedData,
      wasReplacement: dbResult.wasReplacement
    });

  } catch (error) {
    console.error('❌ [SHEET IMPORT] Error importing sheet:', error);
    
    let errorMessage = 'Failed to import sheet data';
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      errorMessage = 'Unable to connect to Google Sheets. Please check the URL and try again.';
    } else if (error.response && error.response.status === 404) {
      errorMessage = 'Sheet not found or not publicly accessible. Please make sure the sheet is shared publicly.';
    } else if (error.response && error.response.status === 403) {
      errorMessage = 'Access denied to the sheet. Please make sure the sheet is shared publicly.';
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message
    });
  }
});

// Debug endpoint to see raw CSV data
app.post('/api/debug-csv', async (req, res) => {
  try {
    const { sheetUrl } = req.body;
    const sheetIdMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!sheetIdMatch) {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    const sheetId = sheetIdMatch[1];
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    
    const csvResponse = await axios.get(csvUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const csvData = csvResponse.data;
    const lines = csvData.split('\n');
    
    res.json({
      success: true,
      totalLines: lines.length,
      first10Lines: lines.slice(0, 10),
      row7: lines[6] || 'Row 7 not found',
      row8: lines[7] || 'Row 8 not found',
      row9: lines[8] || 'Row 9 not found'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to parse Google Sheet CSV data
function parseGoogleSheetCSV(csvData, eventId) {
  try {
    console.log(`📊 [SHEET PARSER] Starting CSV parsing for event ${eventId}`);
    
    // Split CSV into rows
    const rows = csvData.split('\n').map(row => {
      // Simple CSV parser - handles basic quoted fields
      const cells = [];
      let currentCell = '';
      let inQuotes = false;
      
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"' && (i === 0 || row[i-1] === ',')) {
          inQuotes = true;
        } else if (char === '"' && inQuotes && (i === row.length - 1 || row[i+1] === ',')) {
          inQuotes = false;
        } else if (char === ',' && !inQuotes) {
          cells.push(currentCell.trim());
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
      cells.push(currentCell.trim());
      return cells;
    });

    console.log(`📊 [SHEET PARSER] Parsed ${rows.length} rows`);

    // Get sheet title from first row if available
    let sheetTitle = 'Unknown Sheet';
    if (rows.length > 0 && rows[0].length > 0) {
      sheetTitle = rows[0][0] || 'Unknown Sheet';
    }

    // Find row 8 (index 7) which contains character names and classes  
    if (rows.length < 8) {
      throw new Error('Sheet does not have enough rows. Expected at least 8 rows.');
    }

    const characterRow = rows[7]; // Row 8 (0-indexed)
    console.log(`📊 [SHEET PARSER] Character row (row 8): ${characterRow.length} columns`);

    // Parse character names and their classes
    const characters = parseCharacterRow(characterRow);
    console.log(`📊 [SHEET PARSER] Found ${characters.length} characters`);

    // Parse ability data starting from row 10 (index 9)
    const abilityData = [];
    for (let rowIndex = 9; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      if (row.length === 0 || row[0] === '') continue; // Skip empty rows

      // Skip rows that don't have any data for our characters
      let hasData = false;
      for (const char of characters) {
        if (char.columnIndex < row.length && row[char.columnIndex] && row[char.columnIndex].trim() !== '') {
          hasData = true;
          break;
        }
      }
      if (!hasData) continue;

      // Process each character's value for this ability
      characters.forEach(char => {
        if (char.columnIndex < row.length) {
          const value = row[char.columnIndex];
          if (value && value.trim() !== '') {
            // Get ability name specific to this character's class
            const characterAbilityName = getAbilityNameForCharacter(row, char, rowIndex + 1);
            if (characterAbilityName) {
              abilityData.push({
                character_name: char.name,
                character_class: char.class,
                ability_name: characterAbilityName,
                ability_value: value.trim(),
                row_number: rowIndex + 1,
                column_number: char.columnIndex + 1
              });
            }
          }
        }
      });
    }

    console.log(`📊 [SHEET PARSER] Parsed ${abilityData.length} ability entries`);

    return {
      success: true,
      data: abilityData,
      sheetTitle: sheetTitle
    };

  } catch (error) {
    console.error('❌ [SHEET PARSER] Error parsing CSV:', error);
    return {
      success: false,
      message: `Failed to parse sheet data: ${error.message}`
    };
  }
}

// Helper function to parse character row and identify classes
function parseCharacterRow(row) {
  const characters = [];
  const classLabels = ['Druids', 'Hunters', 'Mages', 'Priests', 'Rogues', 'Shamans', 'Paladins', 'Warlocks', 'Warriors'];
  
  let currentClass = null;
  let currentClassColumn = -1;

  for (let i = 0; i < row.length; i++) {
    const cell = row[i];
    
    if (classLabels.includes(cell)) {
      // Found a class label
      currentClass = cell.replace('s', ''); // Remove 's' to get singular form
      currentClassColumn = i;
      console.log(`📊 [SHEET PARSER] Found class ${currentClass} at column ${i + 1}`);
    } else if (currentClass && cell && cell.trim() !== '') {
      // Found a character name under current class
      characters.push({
        name: cell.trim(),
        class: currentClass,
        columnIndex: i,
        classColumnIndex: currentClassColumn
      });
      console.log(`📊 [SHEET PARSER] Found character ${cell.trim()} (${currentClass}) at column ${i + 1}`);
    }
  }

  return characters;
}

// Helper function to get ability name for a specific character
function getAbilityNameForCharacter(row, character, rowNumber) {
  // First, try to find ability name in this character's class column
  if (character.classColumnIndex >= 0 && character.classColumnIndex < row.length) {
    const abilityName = row[character.classColumnIndex];
    if (abilityName && abilityName.trim() !== '') {
      return abilityName.trim();
    }
  }

  // If no class-specific ability found, check column B (index 1) for general abilities
  if (row.length > 1 && row[1] && row[1].trim() !== '') {
    return row[1].trim();
  }

  return null;
}

// Helper function to store sheet data in database
async function storeSheetDataInDB(abilityData, eventId, sheetUrl, sheetTitle) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Check if there are existing entries for this event ID
    const existingCheck = await client.query(`
      SELECT COUNT(*) as count FROM sheet_imports WHERE event_id = $1
    `, [eventId]);

    const hasExistingData = parseInt(existingCheck.rows[0].count) > 0;

    if (hasExistingData) {
      console.log(`🗑️ [SHEET DB] Found existing data for event ${eventId}, deleting old entries...`);
      
      // Delete existing player abilities for this event (cascade will handle this, but let's be explicit)
      await client.query(`
        DELETE FROM sheet_player_abilities WHERE event_id = $1
      `, [eventId]);
      
      // Delete existing sheet imports for this event
      await client.query(`
        DELETE FROM sheet_imports WHERE event_id = $1
      `, [eventId]);
      
      console.log(`✅ [SHEET DB] Successfully deleted old data for event ${eventId}`);
    }

    // Insert new sheet import record
    const importResult = await client.query(`
      INSERT INTO sheet_imports (event_id, sheet_url, sheet_title)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [eventId, sheetUrl, sheetTitle]);

    const sheetImportId = importResult.rows[0].id;

    // Insert new ability data
    let abilitiesCount = 0;
    const playerCounts = new Set();

    for (const ability of abilityData) {
      await client.query(`
        INSERT INTO sheet_player_abilities 
        (sheet_import_id, event_id, character_name, character_class, ability_name, ability_value, row_number, column_number)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        sheetImportId,
        eventId,
        ability.character_name,
        ability.character_class,
        ability.ability_name,
        ability.ability_value,
        ability.row_number,
        ability.column_number
      ]);
      
      abilitiesCount++;
      playerCounts.add(ability.character_name);
    }

    await client.query('COMMIT');
    console.log(`📊 [SHEET DB] Stored ${abilitiesCount} abilities for ${playerCounts.size} players`);

    return {
      playerCount: playerCounts.size,
      abilitiesCount: abilitiesCount,
      wasReplacement: hasExistingData
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Helper function to get stored sheet data
async function getStoredSheetData(eventId) {
  const result = await pool.query(`
    SELECT character_name, character_class, ability_name, ability_value, row_number, column_number
    FROM sheet_player_abilities 
    WHERE event_id = $1 
    ORDER BY character_name, ability_name
    LIMIT 5000
  `, [eventId]);

  return result.rows;
}

// Helper function to parse World Buffs CSV data
function parseWorldBuffsCSV(csvData, eventId, analysisType) {
  try {
    console.log(`🌍 [WORLD BUFFS PARSER] Starting CSV parsing for event ${eventId}`);
    
    // Split CSV into rows
    const rows = csvData.split('\n').map(row => {
      // Simple CSV parser - handles basic quoted fields
      const cells = [];
      let currentCell = '';
      let inQuotes = false;
      
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"' && (i === 0 || row[i-1] === ',')) {
          inQuotes = true;
        } else if (char === '"' && inQuotes && (i === row.length - 1 || row[i+1] === ',')) {
          inQuotes = false;
        } else if (char === ',' && !inQuotes) {
          cells.push(currentCell.trim());
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
      cells.push(currentCell.trim());
      return cells;
    });

    console.log(`🌍 [WORLD BUFFS PARSER] Parsed ${rows.length} rows`);

    // Get sheet title from first row if available
    let sheetTitle = 'World Buffs Analysis';
    if (rows.length > 0 && rows[0].length > 0) {
      sheetTitle = rows[0][0] || 'World Buffs Analysis';
    }

    // Check if we have enough rows
    if (rows.length < 5) {
      throw new Error('Sheet does not have enough rows. Expected at least 5 rows.');
    }

    // Get buff names from row 4 (index 3) - columns E through L (indices 4-11)
    const buffRow = rows[3]; // Row 4 (0-indexed)
    const buffNames = [];
    const buffColumns = [4, 5, 6, 7, 8, 9, 10, 11]; // E, F, G, H, I, J, K, L
    
    buffColumns.forEach((colIndex, arrayIndex) => {
      if (colIndex < buffRow.length && buffRow[colIndex] && buffRow[colIndex].trim() !== '') {
        buffNames.push({
          name: buffRow[colIndex].trim(),
          columnIndex: colIndex
        });
      }
    });

    console.log(`🌍 [WORLD BUFFS PARSER] Found ${buffNames.length} buff types:`, buffNames.map(b => b.name));

    // Parse player data starting from row 5 (index 4)
    const buffData = [];
    
    for (let rowIndex = 4; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      if (row.length === 0) continue; // Skip empty rows
      
      // Get player name from column B (index 1)
      const playerName = row[1] ? row[1].trim() : '';
      if (!playerName || playerName === '') continue; // Skip rows without player names
      
      // Get amount and score summaries from columns C and D (indices 2, 3)
      const amountSummary = row[2] ? row[2].trim() : '';
      const scoreSummary = row[3] ? row[3].trim() : '';
      
      console.log(`🌍 [WORLD BUFFS PARSER] Processing player: ${playerName}, Amount: ${amountSummary}, Score: ${scoreSummary}`);
      
      // Process each buff for this player
      buffNames.forEach(buff => {
        if (buff.columnIndex < row.length) {
          const buffValue = row[buff.columnIndex] ? row[buff.columnIndex].trim() : '';
          
          // Determine color status based on buff value content
          const colorStatus = determineBuffColorStatus(buffValue);
          
          if (buffValue !== '') {
            buffData.push({
              character_name: playerName,
              buff_name: buff.name,
              buff_value: buffValue,
              color_status: colorStatus.status,
              background_color: colorStatus.color,
              amount_summary: amountSummary,
              score_summary: scoreSummary,
              row_number: rowIndex + 1,
              column_number: buff.columnIndex + 1,
              analysis_type: analysisType
            });
          }
        }
      });
    }

    console.log(`🌍 [WORLD BUFFS PARSER] Parsed ${buffData.length} buff entries`);

    return {
      success: true,
      data: buffData,
      sheetTitle: sheetTitle
    };

  } catch (error) {
    console.error('❌ [WORLD BUFFS PARSER] Error parsing CSV:', error);
    return {
      success: false,
      message: `Failed to parse World Buffs data: ${error.message}`
    };
  }
}

// Helper function for World Buffs data - simplified without color detection
function determineBuffColorStatus(buffValue) {
  // Just return the raw value without trying to detect colors from CSV
  // CSV exports don't contain background color information
  return { status: null, color: null };
}

// Parse Frost Resistance CSV data
function parseFrostResCSV(csvData, eventId, analysisType) {
  console.log('📊 [FROST RES PARSER] Starting to parse CSV data...');
  
  // Split CSV into rows with proper quoted field handling
  const rows = csvData.split('\n').map(row => {
    // Simple CSV parser - handles basic quoted fields
    const cells = [];
    let currentCell = '';
    let inQuotes = false;
    
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"' && (i === 0 || row[i-1] === ',')) {
        inQuotes = true;
      } else if (char === '"' && inQuotes && (i === row.length - 1 || row[i+1] === ',')) {
        inQuotes = false;
      } else if (char === ',' && !inQuotes) {
        cells.push(currentCell.trim());
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    cells.push(currentCell.trim());
    return cells;
  });
  
  const frostResData = [];
  
  // Process data starting from row 5 (index 4)
  for (let rowIndex = 4; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!row || row.length < 3) continue;
    
    const playerName = row[1] ? row[1].trim() : ''; // Column B (index 1)
    const frostResValue = row[2] ? row[2].trim() : ''; // Column C (index 2)
    
    if (playerName !== '' && frostResValue !== '') {
      frostResData.push({
        character_name: playerName,
        frost_resistance: frostResValue,
        row_number: rowIndex + 1,
        analysis_type: analysisType
      });
      
      console.log(`📊 [FROST RES PARSER] Row ${rowIndex + 1}: ${playerName} = ${frostResValue} FR`);
    }
  }
  
  console.log(`📊 [FROST RES PARSER] Parsed ${frostResData.length} frost resistance entries`);
  return frostResData;
}

// Helper function to store World Buffs data in database
async function storeWorldBuffsDataInDB(buffData, eventId, sheetUrl, sheetTitle, analysisType) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Check if there are existing entries for this event ID and analysis type
    const existingCheck = await client.query(`
      SELECT COUNT(*) as count FROM sheet_imports 
      WHERE event_id = $1 AND sheet_url = $2
    `, [eventId, sheetUrl]);

    const hasExistingData = parseInt(existingCheck.rows[0].count) > 0;

    if (hasExistingData) {
      console.log(`🗑️ [WORLD BUFFS DB] Found existing data for event ${eventId}, deleting old entries...`);
      
      // Delete existing buffs data for this event and analysis type
      await client.query(`
        DELETE FROM sheet_players_buffs 
        WHERE event_id = $1 AND analysis_type = $2
      `, [eventId, analysisType]);
      
      // Delete existing sheet imports for this event and URL
      await client.query(`
        DELETE FROM sheet_imports WHERE event_id = $1 AND sheet_url = $2
      `, [eventId, sheetUrl]);
      
      console.log(`✅ [WORLD BUFFS DB] Successfully deleted old data for event ${eventId}`);
    }

    // Insert new sheet import record
    const importResult = await client.query(`
      INSERT INTO sheet_imports (event_id, sheet_url, sheet_title)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [eventId, sheetUrl, sheetTitle]);

    const sheetImportId = importResult.rows[0].id;

    // Insert new buff data
    let buffsCount = 0;
    const playerCounts = new Set();

    for (const buff of buffData) {
      await client.query(`
        INSERT INTO sheet_players_buffs 
        (sheet_import_id, event_id, character_name, buff_name, buff_value, color_status, background_color, amount_summary, score_summary, row_number, column_number, analysis_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        sheetImportId,
        eventId,
        buff.character_name,
        buff.buff_name,
        buff.buff_value,
        buff.color_status,
        buff.background_color,
        buff.amount_summary,
        buff.score_summary,
        buff.row_number,
        buff.column_number,
        buff.analysis_type
      ]);
      
      buffsCount++;
      playerCounts.add(buff.character_name);
    }

    await client.query('COMMIT');
    console.log(`🌍 [WORLD BUFFS DB] Stored ${buffsCount} buff entries for ${playerCounts.size} players`);

    return {
      playerCount: playerCounts.size,
      buffsCount: buffsCount,
      wasReplacement: hasExistingData
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Helper function to store Frost Resistance data in database
async function storeFrostResDataInDB(frostResData, eventId, sheetUrl, sheetTitle, analysisType) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Check if there are existing entries for this event ID and analysis type
    const existingCheck = await client.query(`
      SELECT COUNT(*) as count FROM sheet_imports 
      WHERE event_id = $1 AND sheet_url = $2
    `, [eventId, sheetUrl]);

    const hasExistingData = parseInt(existingCheck.rows[0].count) > 0;

    if (hasExistingData) {
      console.log('📊 [FROST RES STORE] Found existing data, replacing...');
      
      // Delete existing frost resistance data for this event and sheet
      await client.query(`
        DELETE FROM sheet_players_frostres 
        WHERE event_id = $1 AND sheet_import_id IN (
          SELECT id FROM sheet_imports WHERE event_id = $1 AND sheet_url = $2
        )
      `, [eventId, sheetUrl]);
      
      // Update existing sheet_imports record
      const updateImport = await client.query(`
        UPDATE sheet_imports 
        SET imported_at = CURRENT_TIMESTAMP, sheet_title = $3
        WHERE event_id = $1 AND sheet_url = $2
        RETURNING id
      `, [eventId, sheetUrl, sheetTitle]);
      
      var sheetImportId = updateImport.rows[0].id;
    } else {
      console.log('📊 [FROST RES STORE] Creating new import record...');
      
      // Create new sheet_imports record
      const newImport = await client.query(`
        INSERT INTO sheet_imports (event_id, sheet_url, sheet_title, imported_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        RETURNING id
      `, [eventId, sheetUrl, sheetTitle]);
      
      var sheetImportId = newImport.rows[0].id;
    }

    // Insert frost resistance data
    if (frostResData.length > 0) {
      const insertQuery = `
        INSERT INTO sheet_players_frostres 
        (sheet_import_id, event_id, character_name, frost_resistance, row_number, analysis_type)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;

      for (const frostRes of frostResData) {
        await client.query(insertQuery, [
          sheetImportId,
          eventId,
          frostRes.character_name,
          frostRes.frost_resistance,
          frostRes.row_number,
          frostRes.analysis_type
        ]);
      }
    }

    await client.query('COMMIT');
    
    console.log(`✅ [FROST RES STORE] Successfully stored ${frostResData.length} frost resistance entries`);
    return {
      success: true,
      playerCount: frostResData.length,
      sheetImportId: sheetImportId
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [FROST RES STORE] Error storing data:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Debug endpoint to check database data
app.get('/api/debug-db/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    // Check sheet_imports table
    const importsResult = await pool.query(`
      SELECT id, event_id, sheet_url, sheet_title, imported_at 
      FROM sheet_imports 
      WHERE event_id = $1 
      ORDER BY imported_at DESC
    `, [eventId]);
    
    // Check sheet_player_abilities table - get summary
    const abilitiesCountResult = await pool.query(`
      SELECT 
        character_name, 
        character_class, 
        COUNT(*) as ability_count
      FROM sheet_player_abilities 
      WHERE event_id = $1 
      GROUP BY character_name, character_class 
      ORDER BY character_name
    `, [eventId]);
    
    // Get sample abilities for Ariela to verify the parsing fix
    const arielaSampleResult = await pool.query(`
      SELECT 
        character_name, 
        character_class, 
        ability_name, 
        ability_value, 
        row_number, 
        column_number
      FROM sheet_player_abilities 
      WHERE event_id = $1 AND character_name = 'Ariela'
      ORDER BY ability_name
      LIMIT 10
    `, [eventId]);
    
    // Get total counts
    const totalResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT character_name) as total_players,
        COUNT(*) as total_abilities
      FROM sheet_player_abilities 
      WHERE event_id = $1
    `, [eventId]);
    
    res.json({
      success: true,
      eventId,
      imports: importsResult.rows,
      playerCounts: abilitiesCountResult.rows,
      arielaSample: arielaSampleResult.rows,
      totals: totalResult.rows[0]
    });
    
  } catch (error) {
    console.error('Database debug error:', error);
    res.status(500).json({
      success: false,
      message: 'Database query failed',
      error: error.message
    });
  }
});

// Update tracking status for an event
app.post('/api/rpb-tracking/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { logUrl, status, archiveUrl, archiveName, analysisType = 'rpb' } = req.body;
    
    console.log(`📊 [TRACKING] Updating ${analysisType} status for event ${eventId}: ${status}`);
    
    // First, try to insert a new record
    try {
      const insertResult = await pool.query(
        `INSERT INTO rpb_tracking (event_id, log_url, analysis_type, rpb_status, rpb_completed_at, archive_url, archive_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          eventId, 
          logUrl, 
          analysisType,
          status, 
          status === 'completed' ? new Date() : null,
          archiveUrl || null,
          archiveName || null
        ]
      );
      
      console.log(`✅ [TRACKING] Created new ${analysisType} tracking for event ${eventId}`);
      return res.json({
        success: true,
        tracking: insertResult.rows[0]
      });
      
    } catch (insertError) {
      // If insert fails due to unique constraint, update instead
      if (insertError.code === '23505') { // unique_violation
        console.log(`📊 [TRACKING] Record exists, updating ${analysisType} tracking for event ${eventId}`);
        
        const updateResult = await pool.query(
          `UPDATE rpb_tracking 
           SET rpb_status = $4, 
               rpb_completed_at = $5,
               archive_url = COALESCE($6, archive_url),
               archive_name = COALESCE($7, archive_name),
               updated_at = CURRENT_TIMESTAMP
           WHERE event_id = $1 AND log_url = $2 AND analysis_type = $3
           RETURNING *`,
          [
            eventId, 
            logUrl, 
            analysisType,
            status, 
            status === 'completed' ? new Date() : null,
            archiveUrl,
            archiveName
          ]
        );
        
        console.log(`✅ [TRACKING] Updated ${analysisType} tracking for event ${eventId}`);
        return res.json({
          success: true,
          tracking: updateResult.rows[0]
        });
      } else {
        throw insertError;
      }
    }
    
  } catch (error) {
    console.error(`❌ [TRACKING] Error updating ${req.body.analysisType || 'rpb'} status:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ====================================
// CHANNEL FILTER API ENDPOINTS
// ====================================

// Get channel filter settings for admin
app.get('/api/admin/channel-filters', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // Check if user has management role
  const hasRole = await hasManagementRole(req.user.accessToken);
  if (!hasRole) {
    return res.status(403).json({ success: false, message: 'Management role required' });
  }

  try {
    // Get both upcoming and completed events to find all channels with raids
    const [upcomingEventsResponse, historicEventsResponse] = await Promise.all([
              fetchEventsFromAPI().then(events => enrichEventsWithDiscordChannelNames(events)),
        getCachedHistoricEvents() || fetchHistoricEventsFromAPI().then(events => enrichHistoricEventsWithDiscordChannelNames(events))
    ]);
    
    // Filter to upcoming events only for upcoming
    const today = new Date();
    const upcomingEvents = upcomingEventsResponse.filter(event => {
      if (!event.startTime) return false;
      const eventStartDate = new Date(parseInt(event.startTime) * 1000);
      return eventStartDate >= today;
    });

    // Completed events are already filtered in their function
    const historicEvents = historicEventsResponse || [];

    // Extract unique channels from BOTH upcoming and completed events
    const channelMap = new Map();
    
    // Process upcoming events
    upcomingEvents.forEach(event => {
      const channelId = event.channelId || event.channelID || event.channel_id || event.discordChannelId;
      if (channelId) {
        const channelName = event.channelName || `Channel ${channelId}`;
        if (channelMap.has(channelId)) {
          channelMap.get(channelId).upcoming_count++;
        } else {
          channelMap.set(channelId, {
            channel_id: channelId,
            channel_name: channelName,
            upcoming_count: 1,
            historic_count: 0,
            is_visible: true // Default to visible
          });
        }
      }
    });
    
    // Process completed events
    historicEvents.forEach(event => {
      const channelId = event.channelId || event.channelID || event.channel_id || event.discordChannelId;
      if (channelId) {
        const channelName = event.channelName || `Channel ${channelId}`;
        if (channelMap.has(channelId)) {
          channelMap.get(channelId).historic_count++;
        } else {
          channelMap.set(channelId, {
            channel_id: channelId,
            channel_name: channelName,
            upcoming_count: 0,
            historic_count: 1,
            is_visible: true // Default to visible
          });
        }
      }
    });

    console.log(`🔍 Channel loading debug: Found ${upcomingEvents.length} upcoming and ${historicEvents.length} completed events`);
    console.log(`📊 Extracted ${channelMap.size} unique channels from both upcoming and completed events`);

    // Get existing filter settings from database
    const filterResult = await pool.query('SELECT channel_id, is_visible FROM channel_filters');
    const existingFilters = new Map();
    filterResult.rows.forEach(row => {
      existingFilters.set(row.channel_id, row.is_visible);
    });

    // Merge current channels with existing filter settings
    const channels = Array.from(channelMap.values()).map(channel => ({
      ...channel,
      raid_count: (channel.upcoming_count || 0) + (channel.historic_count || 0), // Total count
      is_visible: existingFilters.has(channel.channel_id) 
        ? existingFilters.get(channel.channel_id)
        : true // Default to visible for new channels
    }));

    // Sort by channel name
    channels.sort((a, b) => (a.channel_name || '').localeCompare(b.channel_name || ''));

    res.json({
      success: true,
      channels: channels
    });

  } catch (error) {
    console.error('Error fetching channel filters:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching channel filter data'
    });
  }
});

// Save channel filter settings
app.post('/api/admin/channel-filters', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // Check if user has management role
  const hasRole = await hasManagementRole(req.user.accessToken);
  if (!hasRole) {
    return res.status(403).json({ success: false, message: 'Management role required' });
  }

  const { filters } = req.body;

  if (!Array.isArray(filters)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid filters data - expected array'
    });
  }

  try {
    // Create channel_filters table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS channel_filters (
        channel_id TEXT PRIMARY KEY,
        channel_name TEXT,
        is_visible BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Clear events cache so changes take effect immediately
    await pool.query('DELETE FROM events_cache WHERE cache_key = $1', [EVENTS_CACHE_KEY]);
    console.log('🗑️ Cleared events cache due to channel filter update');

    // Update each filter setting
    for (const filter of filters) {
      const { channel_id, is_visible } = filter;
      
      if (!channel_id || typeof is_visible !== 'boolean') {
        continue; // Skip invalid entries
      }

      await pool.query(`
        INSERT INTO channel_filters (channel_id, is_visible, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (channel_id)
        DO UPDATE SET 
          is_visible = EXCLUDED.is_visible,
          updated_at = CURRENT_TIMESTAMP
      `, [channel_id, is_visible]);
    }

    console.log(`📡 Updated channel filters for ${filters.length} channels`);

    res.json({
      success: true,
      message: `Successfully updated ${filters.length} channel filter settings`
    });

  } catch (error) {
    console.error('Error saving channel filters:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving channel filter settings'
    });
  }
});

// Function to get channel filter settings (for internal use)
async function getChannelFilterSettings() {
  try {
    const result = await pool.query('SELECT channel_id, is_visible FROM channel_filters');
    const filters = new Map();
    result.rows.forEach(row => {
      filters.set(row.channel_id, row.is_visible);
    });
    return filters;
  } catch (error) {
    console.error('Error fetching channel filters:', error);
    return new Map(); // Return empty map as fallback
  }
}

// ====================================
// LOOT MANAGEMENT API ENDPOINTS
// ====================================

// Get loot items for an event
app.get('/api/loot/:eventId', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const { eventId } = req.params;
  let client;

  try {
    client = await pool.connect();
    
    // Check if loot_items table exists, if not return empty array
    const tableCheckResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'loot_items'
      );
    `);
    
    if (!tableCheckResult.rows[0].exists) {
      console.log('[LOOT] loot_items table does not exist yet, returning empty array');
      return res.json({
        success: true,
        items: []
      });
    }
    
    const result = await client.query(`
      SELECT item_name, player_name, gold_amount, wowhead_link, icon_link, created_at
      FROM loot_items 
      WHERE event_id = $1 
      ORDER BY created_at DESC, item_name ASC
    `, [eventId]);

    res.json({
      success: true,
      items: result.rows
    });
  } catch (error) {
    console.error('Error fetching loot items:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching loot items'
    });
  } finally {
    if (client) client.release();
  }
});

// Import loot items from Gargul string
app.post('/api/loot/import', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // Check if user has management role
  const hasRole = await hasManagementRole(req.user.accessToken);
  if (!hasRole) {
    return res.status(403).json({ success: false, message: 'Management role required' });
  }

  const { eventId, items, expandExisting } = req.body;

  if (!eventId || !items || !Array.isArray(items)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid request data'
    });
  }

  let client;

  try {
    client = await pool.connect();
    
    // Start transaction
    await client.query('BEGIN');

    // Create loot_items table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS loot_items (
        id SERIAL PRIMARY KEY,
        event_id TEXT NOT NULL,
        item_name TEXT NOT NULL,
        player_name TEXT NOT NULL,
        gold_amount INTEGER DEFAULT 0,
        wowhead_link TEXT,
        icon_link TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index if it doesn't exist
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_loot_items_event_id ON loot_items (event_id)
    `);

    // If not expanding existing list, delete current items for this event
    if (!expandExisting) {
      await client.query('DELETE FROM loot_items WHERE event_id = $1', [eventId]);
      console.log(`[LOOT] Cleared existing items for event ${eventId}`);
    }

    // Insert new items
    let insertedCount = 0;
    for (const item of items) {
      await client.query(`
        INSERT INTO loot_items (event_id, item_name, player_name, gold_amount, wowhead_link, icon_link)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        eventId,
        item.item_name,
        item.player_name,
        item.gold_amount || 0,
        item.wowhead_link,
        item.icon_link
      ]);
      insertedCount++;
    }

    // Commit transaction
    await client.query('COMMIT');

    console.log(`[LOOT] Successfully imported ${insertedCount} items for event ${eventId}`);

    res.json({
      success: true,
      message: `Successfully imported ${insertedCount} items`,
      itemsImported: insertedCount
    });
  } catch (error) {
    // Rollback transaction on error
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
    }
    
    console.error('Error importing loot items:', error);
    res.status(500).json({
      success: false,
      message: 'Error importing loot items'
    });
  } finally {
    if (client) client.release();
  }
});

// Get raid statistics for dashboard including RPB archive URL and WarcraftLogs data
app.get('/api/raid-stats/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    console.log(`📊 [RAID STATS] Fetching raid statistics for event: ${eventId}`);
    
    let client;
    try {
        client = await pool.connect();
        
        // Get RPB archive information
        const rpbResult = await client.query(`
            SELECT archive_url, archive_name, rpb_completed_at
            FROM rpb_tracking 
            WHERE event_id = $1 AND archive_url IS NOT NULL
            ORDER BY created_at DESC 
            LIMIT 1
        `, [eventId]);
        
        // Get log data to find the latest log_id for WarcraftLogs API call
        const logResult = await client.query(`
            SELECT log_id 
            FROM log_data 
            WHERE event_id = $1 
            ORDER BY created_at DESC 
            LIMIT 1
        `, [eventId]);
        
        let rpbData = null;
        let raidStats = {
            totalTime: null,
            activeFightTime: null,
            bossesKilled: 0,
            lastBoss: null,
            firstMob: null,
            logUrl: null
        };
        
        // Process RPB data if available
        if (rpbResult.rows.length > 0) {
            const rpb = rpbResult.rows[0];
            rpbData = {
                archiveUrl: rpb.archive_url,
                archiveName: rpb.archive_name,
                completedAt: rpb.rpb_completed_at
            };
        }
        
                // Fetch WarcraftLogs data if we have a log_id
        if (logResult.rows.length > 0) {
            const logId = logResult.rows[0].log_id;
            console.log(`📖 [RAID STATS] Fetching WarcraftLogs data for log: ${logId}`);
            
            // Set log URL for the WoW Logs widget
            raidStats.logUrl = `https://vanilla.warcraftlogs.com/reports/${logId}`;
            
            try {
                // Use WarcraftLogs API to get raid statistics - use the same key as frontend
                const wclApiKey = process.env.WCL_API_KEY || 'e5c41ab0436b3a44c0e9c2fbd6cf016d';
                if (wclApiKey) {
                    // First, get fights data to determine time range (same as frontend)
                    const fightsUrl = `https://vanilla.warcraftlogs.com:443/v1/report/fights/${logId}?translate=true&api_key=${wclApiKey}`;
                    console.log(`🥊 [RAID STATS] Getting fights data: ${fightsUrl}`);
                    
                    const fightsResponse = await fetch(fightsUrl);
                    if (fightsResponse.ok) {
                        const fightsData = await fightsResponse.json();
                        console.log(`⚔️ [RAID STATS] Fights count: ${fightsData.fights?.length || 0}`);
                        
                        // Get time range from fights (same logic as frontend)
                        let logStartTime = 0;
                        let logEndTime = 0;
                        if (fightsData.fights && fightsData.fights.length > 0) {
                            logStartTime = fightsData.fights[0].start_time;
                            logEndTime = fightsData.fights[fightsData.fights.length - 1].end_time;
                        }
                        console.log(`⏱️ [RAID STATS] Time range: ${logStartTime} - ${logEndTime}`);
                        
                        // Calculate actual raid duration (including downtime)
                        const actualRaidDuration = logEndTime - logStartTime;
                        const actualRaidMinutes = Math.round(actualRaidDuration / 60000);
                        console.log(`🕒 [RAID STATS] Actual raid duration: ${actualRaidMinutes} minutes`);
                        
                        // Store the actual duration
                        raidStats.totalTime = actualRaidMinutes;
                        
                        // Save duration to database for use on front page
                        try {
                            await client.query(`
                                INSERT INTO raid_durations (event_id, duration_minutes, updated_at) 
                                VALUES ($1, $2, NOW()) 
                                ON CONFLICT (event_id) 
                                DO UPDATE SET duration_minutes = $2, updated_at = NOW()
                            `, [eventId, actualRaidMinutes]);
                            console.log(`💾 [RAID STATS] Saved duration ${actualRaidMinutes}min for event ${eventId}`);
                        } catch (saveError) {
                            console.warn(`⚠️ [RAID STATS] Failed to save duration for event ${eventId}:`, saveError.message);
                        }
                        
                        // Find the last boss from fights data
                        const bossKills = fightsData.fights.filter(fight => fight.boss > 0 && fight.kill === true);
                        if (bossKills.length > 0) {
                            const lastBossFight = bossKills[bossKills.length - 1];
                            raidStats.lastBoss = lastBossFight.name;
                            raidStats.bossesKilled = bossKills.length;
                            console.log(`👑 [RAID STATS] Last boss from fights: ${lastBossFight.name}, Total bosses killed: ${bossKills.length}`);
                        }
                        
                        // Now get damage data with time range
                        const wclUrl = `https://vanilla.warcraftlogs.com:443/v1/report/tables/damage-done/${logId}?start=${logStartTime}&end=${logEndTime}&translate=true&api_key=${wclApiKey}`;
                        console.log(`🔗 [RAID STATS] WCL Damage URL: ${wclUrl}`);
                        
                        const wclResponse = await fetch(wclUrl);
                        console.log(`📡 [RAID STATS] WCL Response status: ${wclResponse.status}`);
                        
                        if (wclResponse.ok) {
                            const wclData = await wclResponse.json();
                            console.log(`📊 [RAID STATS] WCL Data keys: ${Object.keys(wclData)}`);
                            console.log(`📊 [RAID STATS] TotalTime: ${wclData.totalTime}, Entries count: ${wclData.entries?.length || 0}`);
                            
                            // Store active fight time for display
                            if (wclData.totalTime) {
                                raidStats.activeFightTime = Math.round(wclData.totalTime / 60000); // Convert ms to minutes
                            }
                            
                            // Only update boss counts if we didn't get them from fights data
                            if (wclData.entries && raidStats.bossesKilled === 0) {
                                const bosses = wclData.entries.filter(entry => 
                                    entry.targets && entry.targets.some(target => target.type === "Boss")
                                );
                                
                                if (bosses.length > 0) {
                                    // Count unique boss targets as fallback
                                    const uniqueBosses = new Set();
                                    bosses.forEach(boss => {
                                        if (boss.targets) {
                                            boss.targets.forEach(target => {
                                                if (target.type === "Boss") {
                                                    uniqueBosses.add(target.name);
                                                }
                                            });
                                        }
                                    });
                                    
                                    raidStats.bossesKilled = uniqueBosses.size;
                                    
                                    // Find the last boss as fallback
                                    const bossArray = Array.from(uniqueBosses);
                                    if (bossArray.length > 0 && !raidStats.lastBoss) {
                                        raidStats.lastBoss = bossArray[bossArray.length - 1];
                                    }
                                }
                            }
                            
                            console.log(`✅ [RAID STATS] WarcraftLogs data processed: ${raidStats.totalTime}min, ${raidStats.bossesKilled} bosses`);
                        } else {
                            const errorText = await wclResponse.text();
                            console.warn(`⚠️ [RAID STATS] WarcraftLogs damage API error: ${wclResponse.status} - ${errorText}`);
                        }
                    } else {
                        const errorText = await fightsResponse.text();
                        console.warn(`⚠️ [RAID STATS] WarcraftLogs fights API error: ${fightsResponse.status} - ${errorText}`);
                    }
                } else {
                    console.warn(`⚠️ [RAID STATS] No WCL_API_KEY found, using fallback`);
                }
            } catch (wclError) {
                console.error('❌ [RAID STATS] Error fetching WarcraftLogs data:', wclError);
            }
        }
        
        res.json({
            success: true,
            data: {
                rpb: rpbData,
                stats: raidStats
            }
        });
        
    } catch (error) {
        console.error('❌ [RAID STATS] Error fetching raid statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching raid statistics',
            error: error.message
        });
    } finally {
        if (client) client.release();
    }
});

// Get saved raid duration (from WarcraftLogs calculation)
app.get('/api/event-duration/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized. Please sign in with Discord.' });
    }
    
    try {
        console.log(`⏱️ [EVENT DURATION] Fetching saved duration for event: ${eventId}`);
        
        const result = await pool.query(
            'SELECT duration_minutes FROM raid_durations WHERE event_id = $1',
            [eventId]
        );
        
        if (result.rows.length === 0) {
            console.log(`❌ [EVENT DURATION] No saved duration found for event: ${eventId}`);
            return res.json({ success: false, error: 'Duration not calculated yet' });
        }
        
        const durationMinutes = result.rows[0].duration_minutes;
        console.log(`⏱️ [EVENT DURATION] Found saved duration for event ${eventId}: ${durationMinutes} minutes`);
        
        return res.json({
            success: true,
            duration: durationMinutes
        });
        
    } catch (error) {
        console.error(`❌ [EVENT DURATION] Error for event ${eventId}:`, error.message);
        return res.json({ success: false, error: 'Database error' });
    }
});

// Get total gold pot for an event (sum of all gold amounts)
app.get('/api/event-goldpot/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized. Please sign in with Discord.' });
    }
    
    try {
        console.log(`💰 [EVENT GOLDPOT] Fetching gold pot for event: ${eventId}`);
        
        const result = await pool.query(
            'SELECT COALESCE(SUM(gold_amount), 0) as total_gold FROM loot_items WHERE event_id = $1',
            [eventId]
        );
        
        const totalGold = result.rows[0].total_gold;
        console.log(`💰 [EVENT GOLDPOT] Gold pot for event ${eventId}: ${totalGold} gold`);
        
        return res.json({
            success: true,
            goldPot: parseInt(totalGold) || 0
        });
        
    } catch (error) {
        console.error(`❌ [EVENT GOLDPOT] Error for event ${eventId}:`, error.message);
        return res.json({ success: false, error: 'Database error' });
    }
});

// Get biggest item for an event (item with highest gold amount)
app.get('/api/event-biggestitem/:eventId', async (req, res) => {
    const { eventId } = req.params;
    
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized. Please sign in with Discord.' });
    }
    
    try {
        console.log(`💎 [EVENT BIGGESTITEM] Fetching biggest item for event: ${eventId}`);
        
        const result = await pool.query(
            'SELECT item_name, gold_amount, icon_link FROM loot_items WHERE event_id = $1 ORDER BY gold_amount DESC LIMIT 1',
            [eventId]
        );
        
        if (result.rows.length === 0) {
            console.log(`❌ [EVENT BIGGESTITEM] No items found for event: ${eventId}`);
            return res.json({ success: false, error: 'No items found' });
        }
        
        const biggestItem = result.rows[0];
        console.log(`💎 [EVENT BIGGESTITEM] Biggest item for event ${eventId}: ${biggestItem.item_name} (${biggestItem.gold_amount} gold)`);
        
        return res.json({
            success: true,
            itemName: biggestItem.item_name,
            goldAmount: biggestItem.gold_amount,
            iconLink: biggestItem.icon_link
        });
        
    } catch (error) {
        console.error(`❌ [EVENT BIGGESTITEM] Error for event ${eventId}:`, error.message);
        return res.json({ success: false, error: 'Database error' });
    }
});

// Get top 10 most expensive items across all events for Items Hall of Fame
app.get('/api/items-hall-of-fame', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized. Please sign in with Discord.' });
    }
    
    try {
        console.log(`🏆 [ITEMS HALL OF FAME] Fetching top 10 most expensive items`);
        
        // Check if loot_items table exists, if not return empty array
        const tableExists = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'loot_items'
            );
        `);
        
        if (!tableExists.rows[0].exists) {
            console.log('[ITEMS HALL OF FAME] loot_items table does not exist yet, returning empty array');
            return res.json({
                success: true,
                items: []
            });
        }
        
        const result = await pool.query(`
            SELECT 
                li.item_name,
                li.player_name,
                li.gold_amount,
                li.icon_link,
                li.event_id,
                ec.event_data->>'channelName' as channel_name,
                (ec.event_data->>'startTime')::bigint as start_time
            FROM loot_items li
            LEFT JOIN raid_helper_events_cache ec ON li.event_id = ec.event_id
            WHERE li.gold_amount > 0
            ORDER BY li.gold_amount DESC
            LIMIT 10
        `);
        
        const hallOfFameItems = result.rows.map(item => ({
            itemName: item.item_name,
            playerName: item.player_name,
            goldAmount: item.gold_amount,
            iconLink: item.icon_link,
            eventId: item.event_id,
            channelName: item.channel_name,
            startTime: item.start_time
        }));
        
        console.log(`🏆 [ITEMS HALL OF FAME] Found ${hallOfFameItems.length} items for hall of fame`);
        
        return res.json({
            success: true,
            items: hallOfFameItems
        });
        
    } catch (error) {
        console.error(`❌ [ITEMS HALL OF FAME] Error fetching hall of fame items:`, error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ===========================
// ATTENDANCE TRACKING API
// ===========================

// Helper function to calculate ISO week number (Monday = start of week)
function getISOWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    // Thursday in current week decides the year
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    // January 4 is always in week 1
    const week1 = new Date(d.getFullYear(), 0, 4);
    // Adjust to Thursday in week 1 and count weeks from there
    return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

// Helper function to get week year (can be different from calendar year)
function getWeekYear(date) {
    const d = new Date(date);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    return d.getFullYear();
}

// Helper function to get the first Monday of January for a given year
function getFirstMondayOfJanuary(year) {
    const firstDay = new Date(year, 0, 1); // January 1st
    const dayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // If January 1st is Monday (1), use it; otherwise find next Monday
    const daysToAdd = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
    const firstMonday = new Date(year, 0, 1 + daysToAdd);
    return firstMonday;
}

// Helper function to get week number based on first Monday of January
function getCustomWeekNumber(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const firstMonday = getFirstMondayOfJanuary(year);
    
    // If date is before first Monday, it belongs to previous year
    if (d < firstMonday) {
        const prevYearFirstMonday = getFirstMondayOfJanuary(year - 1);
        const weeksDiff = Math.floor((d - prevYearFirstMonday) / (7 * 24 * 60 * 60 * 1000));
        return {
            weekYear: year - 1,
            weekNumber: weeksDiff + 1
        };
    }
    
    // Calculate weeks from first Monday of this year
    const weeksDiff = Math.floor((d - firstMonday) / (7 * 24 * 60 * 60 * 1000));
    return {
        weekYear: year,
        weekNumber: weeksDiff + 1
    };
}

// Helper function to calculate player streak from attendance cache
async function calculatePlayerStreak(client, discordId, currentWeek) {
    try {
        // Get the last 15 weeks of data for this player
        const weeks = [];
        const now = new Date();
        for (let i = 14; i >= 0; i--) {
            const weekDate = new Date(now);
            weekDate.setDate(weekDate.getDate() - (i * 7));
            const weekInfo = getCustomWeekNumber(weekDate);
            weeks.push(weekInfo);
        }
        
        // Get attendance data for this player, respecting channel filters
        const attendanceResult = await client.query(`
            SELECT DISTINCT ac.week_year, ac.week_number
            FROM attendance_cache ac
            LEFT JOIN attendance_channel_filters acf ON ac.channel_id = acf.channel_id
            WHERE ac.discord_id = $1
            AND (ac.week_year, ac.week_number) IN (${weeks.map((_, i) => `($${i * 2 + 2}, $${i * 2 + 3})`).join(', ')})
            AND (acf.is_included IS NULL OR acf.is_included = true)
            ORDER BY ac.week_year DESC, ac.week_number DESC
        `, [discordId, ...weeks.flatMap(w => [w.weekYear, w.weekNumber])]);
        
        const attendedWeeks = new Set(
            attendanceResult.rows.map(row => `${row.week_year}-${row.week_number}`)
        );
        
        // Sort weeks in reverse chronological order (most recent first)
        const sortedWeeks = [...weeks].sort((a, b) => {
            if (a.weekYear !== b.weekYear) {
                return b.weekYear - a.weekYear;
            }
            return b.weekNumber - a.weekNumber;
        });
        
        // Calculate consecutive attendance streak from most recent week backwards
        let streak = 0;
        for (const week of sortedWeeks) {
            const weekKey = `${week.weekYear}-${week.weekNumber}`;
            if (attendedWeeks.has(weekKey)) {
                streak++;
            } else {
                break; // Streak broken
            }
        }
        
        return streak;
        
    } catch (error) {
        console.error('❌ Error calculating player streak:', error);
        return 0;
    }
}

// Helper function to update player_streak for all characters of a given player
async function updatePlayerStreakForAllCharacters(client, discordId, currentWeek) {
    try {
        // Calculate the current streak for this player
        const streak = await calculatePlayerStreak(client, discordId, currentWeek);
        
        // Update all characters for this player with the calculated streak
        await client.query(`
            UPDATE attendance_cache 
            SET player_streak = $1 
            WHERE discord_id = $2
        `, [streak, discordId]);
        
        console.log(`✅ Updated streak (${streak}) for all characters of player ${discordId}`);
        return streak;
        
    } catch (error) {
        console.error('❌ Error updating player streak for all characters:', error);
        return 0;
    }
}

// Get attendance data for display
app.get('/api/attendance', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        // Get current week info
        const now = new Date();
        const currentWeekInfo = getCustomWeekNumber(now);
        
        // Calculate the last 15 weeks
        const weeks = [];
        for (let i = 14; i >= 0; i--) {
            const weekDate = new Date(now);
            weekDate.setDate(weekDate.getDate() - (i * 7));
            const weekInfo = getCustomWeekNumber(weekDate);
            weeks.push(weekInfo);
        }
        
        // Get all unique discord IDs from the attendance data, respecting channel filters
        // We'll get the most recent player_streak for each player
        const playersResult = await client.query(`
            SELECT DISTINCT ON (ac.discord_id) 
                ac.discord_id, 
                ac.discord_username, 
                ac.player_streak
            FROM attendance_cache ac
            LEFT JOIN attendance_channel_filters acf ON ac.channel_id = acf.channel_id
            WHERE (ac.week_year, ac.week_number) IN (${weeks.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')})
            AND (acf.is_included IS NULL OR acf.is_included = true)
            ORDER BY ac.discord_id, ac.week_year DESC, ac.week_number DESC, ac.cached_at DESC
        `, weeks.flatMap(w => [w.weekYear, w.weekNumber]));
        
        // Get attendance data for all players and weeks, respecting channel filters
        const attendanceResult = await client.query(`
            SELECT ac.discord_id, ac.week_year, ac.week_number, ac.event_id, ac.channel_name, ac.character_name, ac.character_class, ac.player_streak
            FROM attendance_cache ac
            LEFT JOIN attendance_channel_filters acf ON ac.channel_id = acf.channel_id
            WHERE (ac.week_year, ac.week_number) IN (${weeks.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')})
            AND (acf.is_included IS NULL OR acf.is_included = true)
            ORDER BY ac.discord_id, ac.week_year, ac.week_number, ac.event_id
        `, weeks.flatMap(w => [w.weekYear, w.weekNumber]));
        
        // Organize attendance data by player and week
        const attendanceByPlayer = {};
        const weekStats = {};
        
        attendanceResult.rows.forEach(row => {
            if (!attendanceByPlayer[row.discord_id]) {
                attendanceByPlayer[row.discord_id] = {};
            }
            const weekKey = `${row.week_year}-${row.week_number}`;
            if (!attendanceByPlayer[row.discord_id][weekKey]) {
                attendanceByPlayer[row.discord_id][weekKey] = [];
            }
            attendanceByPlayer[row.discord_id][weekKey].push({
                eventId: row.event_id,
                channelName: row.channel_name,
                characterName: row.character_name,
                characterClass: row.character_class
            });
            
            // Track stats for each week
            if (!weekStats[weekKey]) {
                weekStats[weekKey] = {
                    players: new Set(),
                    characters: new Set()
                };
            }
            weekStats[weekKey].players.add(row.discord_id);
            if (row.character_name) {
                weekStats[weekKey].characters.add(`${row.discord_id}-${row.character_name}`);
            }
        });
        
        // Convert sets to counts and add to weeks data
        const enrichedWeeks = weeks.map(week => {
            const weekKey = `${week.weekYear}-${week.weekNumber}`;
            const stats = weekStats[weekKey];
            const playerCount = stats ? stats.players.size : 0;
            const characterCount = stats ? stats.characters.size : 0;
            
            return {
                ...week,
                playerCount: playerCount,
                characterCount: characterCount
            };
        });
        
        res.json({
            success: true,
            data: {
                weeks: enrichedWeeks,
                players: playersResult.rows,
                attendance: attendanceByPlayer,
                currentWeek: currentWeekInfo
            }
        });
        
    } catch (error) {
        console.error('❌ [ATTENDANCE] Error fetching attendance data:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching attendance data',
            error: error.message
        });
    } finally {
        if (client) client.release();
    }
});

// Clear cache and rebuild attendance data
app.post('/api/attendance/rebuild', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        console.log('🔄 [ATTENDANCE] Starting cache rebuild...');
        
        // Clear existing cache
        await client.query('DELETE FROM attendance_cache');
        console.log('✅ [ATTENDANCE] Cleared existing cache');
        
        // Get all log_data entries with event_id and discord_id
        const logDataResult = await client.query(`
            SELECT DISTINCT event_id, discord_id, character_name, character_class
            FROM log_data
            WHERE event_id IS NOT NULL AND discord_id IS NOT NULL
            ORDER BY event_id
        `);
        
        console.log(`📊 [ATTENDANCE] Found ${logDataResult.rows.length} unique attendance records`);
        
        let processedEvents = 0;
        let skippedEvents = 0;
        let rateLimitDelay = 1000; // Start with 1 second delay
        
        // Process each unique event
        const uniqueEvents = [...new Set(logDataResult.rows.map(row => row.event_id))];
        
        for (const eventId of uniqueEvents) {
            try {
                console.log(`🔍 [ATTENDANCE] Processing event ${eventId}...`);
                
                // Fetch event data from Raid Helper API with retry logic
                let eventData = null;
                let attempts = 0;
                const maxAttempts = 3;
                
                while (attempts < maxAttempts && !eventData) {
                    try {
                        const response = await fetch(`https://raid-helper.dev/api/v2/events/${eventId}`);
                        
                        if (response.status === 429) {
                            // Rate limited - increase delay and retry
                            rateLimitDelay = Math.min(rateLimitDelay * 2, 10000); // Max 10 seconds
                            console.warn(`⚠️ [ATTENDANCE] Rate limited for event ${eventId}, waiting ${rateLimitDelay}ms...`);
                            await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
                            attempts++;
                            continue;
                        }
                        
                        if (!response.ok) {
                            console.warn(`⚠️ [ATTENDANCE] API error for event ${eventId}: ${response.status}`);
                            break;
                        }
                        
                        eventData = await response.json();
                        // Reset delay on success
                        rateLimitDelay = Math.max(rateLimitDelay / 2, 1000);
                        
                    } catch (apiError) {
                        console.error(`❌ [ATTENDANCE] API error for event ${eventId}:`, apiError.message);
                        attempts++;
                        if (attempts < maxAttempts) {
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }
                    }
                }
                
                if (!eventData || !eventData.date || !eventData.channelId) {
                    console.warn(`⚠️ [ATTENDANCE] Skipping event ${eventId} - incomplete data`);
                    skippedEvents++;
                    continue;
                }
                
                // Parse date (format: "4-7-2025" = day-month-year)
                const dateParts = eventData.date.split('-');
                if (dateParts.length !== 3) {
                    console.warn(`⚠️ [ATTENDANCE] Invalid date format for event ${eventId}: ${eventData.date}`);
                    skippedEvents++;
                    continue;
                }
                
                const eventDate = new Date(
                    parseInt(dateParts[2]), // year
                    parseInt(dateParts[1]) - 1, // month (0-based)
                    parseInt(dateParts[0]) // day
                );
                
                // Calculate week info
                const weekInfo = getCustomWeekNumber(eventDate);
                
                // Clean up channel name for display
                let channelDisplayName = '#unknown-channel';
                if (eventData.channelName && 
                    eventData.channelName.trim() && 
                    eventData.channelName !== eventData.channelId &&
                    !eventData.channelName.match(/^\d+$/)) {
                    channelDisplayName = eventData.channelName.replace(/^📅/, '').trim();
                } else if (eventData.channelId) {
                    channelDisplayName = `channel-${eventData.channelId.slice(-4)}`;
                }
                
                // Get all players for this event
                const eventPlayers = logDataResult.rows.filter(row => row.event_id === eventId);
                
                // Get discord usernames for these players
                const discordIds = [...new Set(eventPlayers.map(p => p.discord_id))];
                const usernameResult = await client.query(`
                    SELECT DISTINCT discord_id, character_name as username
                    FROM guildies
                    WHERE discord_id = ANY($1) AND character_name IS NOT NULL
                    LIMIT 1
                `, [discordIds]);
                
                const usernameMap = {};
                usernameResult.rows.forEach(row => {
                    usernameMap[row.discord_id] = row.username;
                });
                
                // Insert attendance records
                const processedPlayers = new Set();
                for (const player of eventPlayers) {
                    const username = usernameMap[player.discord_id] || `user-${player.discord_id.slice(-4)}`;
                    
                    await client.query(`
                        INSERT INTO attendance_cache (
                            discord_id, discord_username, week_year, week_number,
                            event_id, event_date, channel_id, channel_name,
                            character_name, character_class, player_streak
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        ON CONFLICT (discord_id, week_year, week_number, event_id) 
                        DO UPDATE SET
                            discord_username = EXCLUDED.discord_username,
                            event_date = EXCLUDED.event_date,
                            channel_id = EXCLUDED.channel_id,
                            channel_name = EXCLUDED.channel_name,
                            character_name = EXCLUDED.character_name,
                            character_class = EXCLUDED.character_class,
                            player_streak = EXCLUDED.player_streak,
                            cached_at = CURRENT_TIMESTAMP
                    `, [
                        player.discord_id,
                        username,
                        weekInfo.weekYear,
                        weekInfo.weekNumber,
                        eventId,
                        eventDate,
                        eventData.channelId,
                        channelDisplayName,
                        player.character_name,
                        player.character_class,
                        0 // Temporary value, will be updated below
                    ]);
                    
                    // Track which players we need to update streaks for
                    processedPlayers.add(player.discord_id);
                }
                
                // Update player streaks for all affected players
                for (const discordId of processedPlayers) {
                    await updatePlayerStreakForAllCharacters(client, discordId, weekInfo);
                }
                
                processedEvents++;
                console.log(`✅ [ATTENDANCE] Processed event ${eventId} (${eventPlayers.length} players)`);
                
                // Add delay between API calls to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
                
            } catch (eventError) {
                console.error(`❌ [ATTENDANCE] Error processing event ${eventId}:`, eventError);
                skippedEvents++;
            }
        }
        
        console.log(`🎉 [ATTENDANCE] Cache rebuild complete! Processed: ${processedEvents}, Skipped: ${skippedEvents}`);
        
        res.json({
            success: true,
            message: 'Attendance cache rebuilt successfully',
            stats: {
                processed: processedEvents,
                skipped: skippedEvents,
                total: uniqueEvents.length
            }
        });
        
    } catch (error) {
        console.error('❌ [ATTENDANCE] Error rebuilding attendance cache:', error);
        res.status(500).json({
            success: false,
            message: 'Error rebuilding attendance cache',
            error: error.message
        });
    } finally {
        if (client) client.release();
    }
});

// Rebuild attendance cache for a specific week
app.post('/api/attendance/rebuild-week', async (req, res) => {
    let client;
    try {
        const { weekYear, weekNumber } = req.body;
        
        if (!weekYear || !weekNumber) {
            return res.status(400).json({
                success: false,
                message: 'Missing weekYear or weekNumber parameters'
            });
        }
        
        client = await pool.connect();
        
        console.log(`🔄 [ATTENDANCE] Starting cache rebuild for Week ${weekNumber}, ${weekYear}...`);
        
        // Clear existing cache for this specific week
        await client.query(`
            DELETE FROM attendance_cache 
            WHERE week_year = $1 AND week_number = $2
        `, [weekYear, weekNumber]);
        
        console.log(`✅ [ATTENDANCE] Cleared existing cache for Week ${weekNumber}, ${weekYear}`);
        
        // Calculate the date range for this week
        const firstMondayOfYear = getFirstMondayOfJanuary(weekYear);
        const weekStartDate = new Date(firstMondayOfYear);
        weekStartDate.setDate(firstMondayOfYear.getDate() + (weekNumber - 1) * 7);
        
        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setDate(weekStartDate.getDate() + 6);
        
        console.log(`📅 [ATTENDANCE] Week ${weekNumber}, ${weekYear} date range: ${weekStartDate.toDateString()} to ${weekEndDate.toDateString()}`);
        
        // Get all log_data entries for events in this week
        const logDataResult = await client.query(`
            SELECT DISTINCT ld.event_id, ld.discord_id, ld.character_name, ld.character_class
            FROM log_data ld
            JOIN raid_helper_events_cache rhec ON ld.event_id = rhec.event_id
            WHERE ld.event_id IS NOT NULL 
            AND ld.discord_id IS NOT NULL
            AND rhec.event_data->>'date' IS NOT NULL
        `);
        
        console.log(`📊 [ATTENDANCE] Found ${logDataResult.rows.length} potential attendance records`);
        
        let processedEvents = 0;
        let skippedEvents = 0;
        let rateLimitDelay = 500; // Start with shorter delay for single week
        
        // Filter events that fall within the target week
        const weekEvents = new Map();
        
        for (const row of logDataResult.rows) {
            try {
                // Try to get event data from cache first
                const cacheResult = await client.query(`
                    SELECT event_data FROM raid_helper_events_cache 
                    WHERE event_id = $1 AND cached_at > NOW() - INTERVAL '7 days'
                `, [row.event_id]);
                
                let eventData = null;
                
                if (cacheResult.rows.length > 0) {
                    eventData = cacheResult.rows[0].event_data;
                } else {
                    // Fetch from API if not in cache or cache is old
                    const response = await fetch(`https://raid-helper.dev/api/v2/events/${row.event_id}`);
                    if (response.ok) {
                        eventData = await response.json();
                        
                        // Update cache
                        await client.query(`
                            INSERT INTO raid_helper_events_cache (event_id, event_data, cached_at, last_accessed)
                            VALUES ($1, $2, NOW(), NOW())
                            ON CONFLICT (event_id) DO UPDATE SET
                                event_data = EXCLUDED.event_data,
                                cached_at = EXCLUDED.cached_at,
                                last_accessed = EXCLUDED.last_accessed
                        `, [row.event_id, JSON.stringify(eventData)]);
                    }
                    
                    // Add delay only for API calls
                    await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
                }
                
                if (!eventData || !eventData.date) {
                    continue;
                }
                
                // Parse event date
                const dateParts = eventData.date.split('-');
                if (dateParts.length !== 3) {
                    continue;
                }
                
                const eventDate = new Date(
                    parseInt(dateParts[2]), // year
                    parseInt(dateParts[1]) - 1, // month (0-based)
                    parseInt(dateParts[0]) // day
                );
                
                // Check if event falls within the target week
                if (eventDate >= weekStartDate && eventDate <= weekEndDate) {
                    if (!weekEvents.has(row.event_id)) {
                        weekEvents.set(row.event_id, {
                            eventData,
                            eventDate,
                            players: []
                        });
                    }
                    weekEvents.get(row.event_id).players.push(row);
                }
                
            } catch (error) {
                console.error(`❌ [ATTENDANCE] Error processing event ${row.event_id}:`, error);
            }
        }
        
        console.log(`🎯 [ATTENDANCE] Found ${weekEvents.size} events in Week ${weekNumber}, ${weekYear}`);
        
        // Process each event in the target week
        for (const [eventId, { eventData, eventDate, players }] of weekEvents) {
            try {
                // Calculate week info
                const weekInfo = getCustomWeekNumber(eventDate);
                
                // Clean up channel name for display
                let channelDisplayName = '#unknown-channel';
                if (eventData.channelName && 
                    eventData.channelName.trim() && 
                    eventData.channelName !== eventData.channelId &&
                    !eventData.channelName.match(/^\d+$/)) {
                    channelDisplayName = eventData.channelName.replace(/^📅/, '').trim();
                } else if (eventData.channelId) {
                    channelDisplayName = `channel-${eventData.channelId.slice(-4)}`;
                }
                
                // Get discord usernames for these players
                const discordIds = [...new Set(players.map(p => p.discord_id))];
                const usernameResult = await client.query(`
                    SELECT DISTINCT discord_id, character_name as username
                    FROM guildies
                    WHERE discord_id = ANY($1) AND character_name IS NOT NULL
                    LIMIT 1
                `, [discordIds]);
                
                const usernameMap = {};
                usernameResult.rows.forEach(row => {
                    usernameMap[row.discord_id] = row.username;
                });
                
                // Insert attendance records
                const processedPlayers = new Set();
                for (const player of players) {
                    const username = usernameMap[player.discord_id] || `user-${player.discord_id.slice(-4)}`;
                    
                    await client.query(`
                        INSERT INTO attendance_cache (
                            discord_id, discord_username, week_year, week_number,
                            event_id, event_date, channel_id, channel_name,
                            character_name, character_class, player_streak
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        ON CONFLICT (discord_id, week_year, week_number, event_id) 
                        DO UPDATE SET
                            discord_username = EXCLUDED.discord_username,
                            event_date = EXCLUDED.event_date,
                            channel_id = EXCLUDED.channel_id,
                            channel_name = EXCLUDED.channel_name,
                            character_name = EXCLUDED.character_name,
                            character_class = EXCLUDED.character_class,
                            player_streak = EXCLUDED.player_streak,
                            cached_at = CURRENT_TIMESTAMP
                    `, [
                        player.discord_id,
                        username,
                        weekInfo.weekYear,
                        weekInfo.weekNumber,
                        eventId,
                        eventDate,
                        eventData.channelId,
                        channelDisplayName,
                        player.character_name,
                        player.character_class,
                        0 // Temporary value, will be updated below
                    ]);
                    
                    // Track which players we need to update streaks for
                    processedPlayers.add(player.discord_id);
                }
                
                // Update player streaks for all affected players
                for (const discordId of processedPlayers) {
                    await updatePlayerStreakForAllCharacters(client, discordId, weekInfo);
                }
                
                processedEvents++;
                console.log(`✅ [ATTENDANCE] Processed event ${eventId} (${players.length} players) for Week ${weekNumber}, ${weekYear}`);
                
            } catch (eventError) {
                console.error(`❌ [ATTENDANCE] Error processing event ${eventId}:`, eventError);
                skippedEvents++;
            }
        }
        
        console.log(`🎉 [ATTENDANCE] Week ${weekNumber}, ${weekYear} cache rebuild complete! Processed: ${processedEvents}, Skipped: ${skippedEvents}`);
        
        res.json({
            success: true,
            message: `Attendance cache rebuilt successfully for Week ${weekNumber}, ${weekYear}`,
            stats: {
                processed: processedEvents,
                skipped: skippedEvents,
                total: weekEvents.size,
                weekYear,
                weekNumber
            }
        });
        
    } catch (error) {
        console.error(`❌ [ATTENDANCE] Error rebuilding attendance cache for specific week:`, error);
        res.status(500).json({
            success: false,
            message: 'Error rebuilding attendance cache for specific week',
            error: error.message
        });
    } finally {
        if (client) client.release();
    }
});

// Test endpoint for week calculation
app.get('/api/attendance/week-test', (req, res) => {
    const testDate = req.query.date ? new Date(req.query.date) : new Date();
    const weekInfo = getCustomWeekNumber(testDate);
    
    res.json({
        success: true,
        data: {
            inputDate: testDate.toISOString(),
            weekYear: weekInfo.weekYear,
            weekNumber: weekInfo.weekNumber,
            firstMondayOfYear: getFirstMondayOfJanuary(weekInfo.weekYear).toISOString()
        }
    });
});

// Get attendance channel filters
app.get('/api/admin/attendance-channel-filters', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        // Get all unique channels from attendance_cache with event counts
        const channelsResult = await client.query(`
            SELECT 
                channel_id,
                channel_name,
                COUNT(DISTINCT event_id) as event_count,
                COUNT(*) as attendance_records
            FROM attendance_cache
            WHERE channel_id IS NOT NULL AND channel_name IS NOT NULL
            GROUP BY channel_id, channel_name
            ORDER BY event_count DESC, channel_name ASC
        `);
        
        // Get current filter settings
        const filtersResult = await client.query(`
            SELECT channel_id, is_included
            FROM attendance_channel_filters
        `);
        
        const filterMap = {};
        filtersResult.rows.forEach(row => {
            filterMap[row.channel_id] = row.is_included;
        });
        
        // Combine channel data with filter settings
        const channels = channelsResult.rows.map(row => ({
            channel_id: row.channel_id,
            channel_name: row.channel_name,
            event_count: parseInt(row.event_count),
            attendance_records: parseInt(row.attendance_records),
            is_included: filterMap[row.channel_id] !== undefined ? filterMap[row.channel_id] : true
        }));
        
        res.json({
            success: true,
            channels: channels
        });
        
    } catch (error) {
        console.error('❌ [ATTENDANCE FILTERS] Error fetching channel filters:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching attendance channel filters',
            error: error.message
        });
    } finally {
        if (client) client.release();
    }
});

// Save attendance channel filters
app.post('/api/admin/attendance-channel-filters', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        const { filters } = req.body;
        
        if (!filters || !Array.isArray(filters)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid filters data'
            });
        }
        
        console.log(`🔄 [ATTENDANCE FILTERS] Saving filters for ${filters.length} channels...`);
        
        // Start transaction
        await client.query('BEGIN');
        
        for (const filter of filters) {
            // Get channel name
            const channelResult = await client.query(`
                SELECT channel_name FROM attendance_cache 
                WHERE channel_id = $1 
                LIMIT 1
            `, [filter.channelId]);
            
            const channelName = channelResult.rows[0]?.channel_name || 'Unknown Channel';
            
            // Upsert filter setting
            await client.query(`
                INSERT INTO attendance_channel_filters (channel_id, channel_name, is_included, updated_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (channel_id) 
                DO UPDATE SET 
                    channel_name = EXCLUDED.channel_name,
                    is_included = EXCLUDED.is_included,
                    updated_at = CURRENT_TIMESTAMP
            `, [filter.channelId, channelName, filter.isIncluded]);
            
            console.log(`✅ [ATTENDANCE FILTERS] ${filter.isIncluded ? 'Included' : 'Excluded'} channel: ${channelName}`);
        }
        
        await client.query('COMMIT');
        
        console.log(`🎉 [ATTENDANCE FILTERS] Filter settings saved successfully!`);
        
        res.json({
            success: true,
            message: 'Attendance channel filters updated successfully'
        });
        
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('❌ [ATTENDANCE FILTERS] Error saving channel filters:', error);
        res.status(500).json({
            success: false,
            message: 'Error saving attendance channel filters',
            error: error.message
        });
    } finally {
        if (client) client.release();
    }
});

// ====================================
// CHANNEL BACKGROUNDS MANAGEMENT
// ====================================

// Configure Cloudinary storage for file uploads
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'wow-manager/channel-backgrounds',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        public_id: (req, file) => {
            // Create unique filename with timestamp
            const timestamp = Date.now();
            return `channel_bg_${timestamp}`;
        },
        transformation: [
            { width: 1920, height: 1080, crop: 'limit', quality: 'auto' }
        ]
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        // Only allow image files
        const allowedTypes = /\.(jpg|jpeg|png|gif|webp)$/i;
        if (allowedTypes.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (jpg, jpeg, png, gif, webp)'));
        }
    }
});

// Get all channel background mappings
app.get('/api/admin/channel-backgrounds', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Check if user has management role
    const hasRole = await hasManagementRole(req.user.accessToken);
    if (!hasRole) {
        return res.status(403).json({ success: false, message: 'Management role required' });
    }

    let client;
    try {
        client = await pool.connect();
        
        // Get all channel backgrounds
        const result = await client.query(`
            SELECT 
                channel_id,
                channel_name,
                background_image_url,
                created_at,
                updated_at
            FROM channel_backgrounds
            ORDER BY channel_name ASC
        `);
        
        res.json({
            success: true,
            backgrounds: result.rows
        });
        
    } catch (error) {
        console.error('❌ [CHANNEL BACKGROUNDS] Error loading backgrounds:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading channel backgrounds',
            error: error.message
        });
    } finally {
        if (client) client.release();
    }
});

// Upload background image for a channel
app.post('/api/admin/channel-backgrounds/upload', upload.single('backgroundImage'), async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Check if user has management role
    const hasRole = await hasManagementRole(req.user.accessToken);
    if (!hasRole) {
        return res.status(403).json({ success: false, message: 'Management role required' });
    }

    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No image file provided' });
    }

    const { channelId, channelName } = req.body;
    
    if (!channelId || !channelName) {
        return res.status(400).json({ success: false, message: 'Channel ID and name are required' });
    }

    let client;
    try {
        client = await pool.connect();
        
        // Get the Cloudinary URL from the uploaded file
        const imageUrl = req.file.path; // Cloudinary provides the full URL in req.file.path
        const publicId = req.file.filename; // Cloudinary public_id for deletion if needed
        
        // Check if this channel already has a background
        const existingResult = await client.query(`
            SELECT background_image_url, cloudinary_public_id FROM channel_backgrounds WHERE channel_id = $1
        `, [channelId]);
        
        // If there's an existing background, delete the old file from Cloudinary
        if (existingResult.rows.length > 0 && existingResult.rows[0].cloudinary_public_id) {
            try {
                await cloudinary.uploader.destroy(existingResult.rows[0].cloudinary_public_id);
                console.log(`🗑️ [CHANNEL BACKGROUNDS] Deleted old background from Cloudinary: ${existingResult.rows[0].cloudinary_public_id}`);
            } catch (deleteError) {
                console.warn(`⚠️ [CHANNEL BACKGROUNDS] Could not delete old Cloudinary image: ${deleteError.message}`);
            }
        }
        
        // Insert or update the channel background
        await client.query(`
            INSERT INTO channel_backgrounds (channel_id, channel_name, background_image_url, cloudinary_public_id)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (channel_id) DO UPDATE SET
                channel_name = EXCLUDED.channel_name,
                background_image_url = EXCLUDED.background_image_url,
                cloudinary_public_id = EXCLUDED.cloudinary_public_id,
                updated_at = CURRENT_TIMESTAMP
        `, [channelId, channelName, imageUrl, publicId]);
        
        console.log(`✅ [CHANNEL BACKGROUNDS] Background uploaded for channel: ${channelName} (${channelId})`);
        
        res.json({
            success: true,
            message: 'Background image uploaded successfully',
            imageUrl: imageUrl,
            channelId: channelId,
            channelName: channelName
        });
        
    } catch (error) {
        console.error('❌ [CHANNEL BACKGROUNDS] Error uploading background:', error);
        
        // Clean up the uploaded file from Cloudinary if database operation failed
        if (req.file && req.file.filename) {
            try {
                await cloudinary.uploader.destroy(req.file.filename);
                console.log(`🗑️ [CHANNEL BACKGROUNDS] Cleaned up failed upload from Cloudinary: ${req.file.filename}`);
            } catch (cleanupError) {
                console.warn(`⚠️ [CHANNEL BACKGROUNDS] Could not clean up failed upload: ${cleanupError.message}`);
            }
        }
        
        res.status(500).json({
            success: false,
            message: 'Error uploading background image',
            error: error.message
        });
    } finally {
        if (client) client.release();
    }
});

// Delete background for a channel
app.delete('/api/admin/channel-backgrounds/:channelId', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Check if user has management role
    const hasRole = await hasManagementRole(req.user.accessToken);
    if (!hasRole) {
        return res.status(403).json({ success: false, message: 'Management role required' });
    }

    const { channelId } = req.params;
    
    let client;
    try {
        client = await pool.connect();
        
        // Get the current background to delete the file
        const existingResult = await client.query(`
            SELECT background_image_url, channel_name, cloudinary_public_id FROM channel_backgrounds WHERE channel_id = $1
        `, [channelId]);
        
        if (existingResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Channel background not found' });
        }
        
        const { background_image_url, channel_name, cloudinary_public_id } = existingResult.rows[0];
        
        // Delete from database
        await client.query(`DELETE FROM channel_backgrounds WHERE channel_id = $1`, [channelId]);
        
        // Delete the image file from Cloudinary
        if (cloudinary_public_id) {
            try {
                await cloudinary.uploader.destroy(cloudinary_public_id);
                console.log(`🗑️ [CHANNEL BACKGROUNDS] Deleted background from Cloudinary: ${cloudinary_public_id}`);
            } catch (deleteError) {
                console.warn(`⚠️ [CHANNEL BACKGROUNDS] Could not delete from Cloudinary: ${deleteError.message}`);
            }
        } else if (background_image_url && background_image_url.includes('/uploads/backgrounds/')) {
            // Handle old local files for backward compatibility
            const filename = path.basename(background_image_url);
            const filePath = path.join(__dirname, 'public', 'uploads', 'backgrounds', filename);
            
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ [CHANNEL BACKGROUNDS] Deleted background file: ${filename}`);
            }
        }
        
        console.log(`✅ [CHANNEL BACKGROUNDS] Background deleted for channel: ${channel_name} (${channelId})`);
        
        res.json({
            success: true,
            message: 'Background image deleted successfully'
        });
        
    } catch (error) {
        console.error('❌ [CHANNEL BACKGROUNDS] Error deleting background:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting background image',
            error: error.message
        });
    } finally {
        if (client) client.release();
    }
});

// Get background for a specific channel (used by frontend)
app.get('/api/channel-background/:channelId', async (req, res) => {
    const { channelId } = req.params;
    
    let client;
    try {
        client = await pool.connect();
        
        const result = await client.query(`
            SELECT background_image_url FROM channel_backgrounds WHERE channel_id = $1
        `, [channelId]);
        
        if (result.rows.length > 0) {
            res.json({
                success: true,
                backgroundUrl: result.rows[0].background_image_url
            });
        } else {
            res.json({
                success: true,
                backgroundUrl: null // No custom background, use default
            });
        }
        
    } catch (error) {
        console.error('❌ [CHANNEL BACKGROUNDS] Error getting background:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting background image'
        });
    } finally {
        if (client) client.release();
    }
});

// ====================================
// BACKGROUND BLUR SETTINGS
// ====================================

// Get current background blur setting
app.get('/api/ui/background-blur', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        const result = await client.query(`
            SELECT setting_value FROM reward_settings 
            WHERE setting_type = 'ui' AND setting_name = 'background_blur'
        `);
        
        const blurValue = result.rows.length > 0 ? parseFloat(result.rows[0].setting_value) : 0;
        
        res.json({
            success: true,
            blurValue: blurValue
        });
        
    } catch (error) {
        console.error('❌ [BACKGROUND BLUR] Error getting blur setting:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting background blur setting'
        });
    } finally {
        if (client) client.release();
    }
});

// Update background blur setting
app.post('/api/admin/background-blur', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const hasRole = await hasManagementRole(req.user.accessToken);
    if (!hasRole) {
        return res.status(403).json({ success: false, message: 'Management role required' });
    }

    const { blurValue } = req.body;
    
    // Validate blur value (0-10)
    if (typeof blurValue !== 'number' || blurValue < 0 || blurValue > 10) {
        return res.status(400).json({ 
            success: false, 
            message: 'Blur value must be a number between 0 and 10' 
        });
    }

    let client;
    try {
        client = await pool.connect();
        
        await client.query(`
            INSERT INTO reward_settings (setting_type, setting_name, setting_value, description)
            VALUES ('ui', 'background_blur', $1, 'Background image blur intensity (0-10)')
            ON CONFLICT (setting_type, setting_name) DO UPDATE SET
                setting_value = EXCLUDED.setting_value,
                updated_at = CURRENT_TIMESTAMP
        `, [blurValue]);
        
        console.log(`✅ [BACKGROUND BLUR] Updated blur setting to: ${blurValue}`);
        
        res.json({
            success: true,
            message: 'Background blur setting updated successfully',
            blurValue: blurValue
        });
        
    } catch (error) {
        console.error('❌ [BACKGROUND BLUR] Error updating blur setting:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating background blur setting'
        });
    } finally {
        if (client) client.release();
    }
});

// Get current background darken setting
app.get('/api/ui/background-darken', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        
        const result = await client.query(`
            SELECT setting_value FROM reward_settings 
            WHERE setting_type = 'ui' AND setting_name = 'background_darken'
        `);
        
        const darkenValue = result.rows.length > 0 ? parseFloat(result.rows[0].setting_value) : 100;
        
        res.json({
            success: true,
            darkenValue: darkenValue
        });
        
    } catch (error) {
        console.error('❌ [BACKGROUND DARKEN] Error getting darken setting:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting background darken setting'
        });
    } finally {
        if (client) client.release();
    }
});

// Update background darken setting
app.post('/api/admin/background-darken', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const hasRole = await hasManagementRole(req.user.accessToken);
    if (!hasRole) {
        return res.status(403).json({ success: false, message: 'Management role required' });
    }

    const { darkenValue } = req.body;
    
    // Validate darken value (50-100, where 100 is no darkening, 50 is maximum darkening)
    if (typeof darkenValue !== 'number' || darkenValue < 50 || darkenValue > 100) {
        return res.status(400).json({ 
            success: false, 
            message: 'Darken value must be a number between 50 and 100' 
        });
    }

    let client;
    try {
        client = await pool.connect();
        
        await client.query(`
            INSERT INTO reward_settings (setting_type, setting_name, setting_value, description)
            VALUES ('ui', 'background_darken', $1, 'Background image brightness percentage (50-100, where 100 is no darkening)')
            ON CONFLICT (setting_type, setting_name) DO UPDATE SET
                setting_value = EXCLUDED.setting_value,
                updated_at = CURRENT_TIMESTAMP
        `, [darkenValue]);
        
        console.log(`✅ [BACKGROUND DARKEN] Updated darken setting to: ${darkenValue}`);
        
        res.json({
            success: true,
            message: 'Background darken setting updated successfully',
            darkenValue: darkenValue
        });
        
    } catch (error) {
        console.error('❌ [BACKGROUND DARKEN] Error updating darken setting:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating background darken setting'
        });
    } finally {
        if (client) client.release();
    }
});

// ====================================
// CATCH-ALL ROUTE (MUST BE LAST)
// ====================================

// Serve attendance page
app.get('/attendance', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'attendance.html'));
});

// API endpoint to verify imported data
app.get('/api/logs/verify-import/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        
        console.log(`🔍 [VERIFY] Checking imported data for event: ${eventId}`);
        
        // Query for World Buffs data
        const worldBuffsQuery = `
            SELECT character_name, buff_name, buff_value, color_status, analysis_type
            FROM sheet_players_buffs 
            WHERE event_id = $1 AND analysis_type = 'world_buffs'
            ORDER BY character_name ASC
            LIMIT 50
        `;
        
        // Query for Frost Resistance data  
        const frostResQuery = `
            SELECT character_name, frost_resistance, analysis_type
            FROM sheet_players_frostres 
            WHERE event_id = $1 AND analysis_type = 'frost_resistance'
            ORDER BY character_name ASC
            LIMIT 50
        `;
        
        // Query for RPB data
        const rpbQuery = `
            SELECT character_name, character_class, ability_name, ability_value
            FROM sheet_player_abilities 
            WHERE event_id = $1 
            ORDER BY character_name ASC
            LIMIT 50
        `;
        
        const [worldBuffsResult, frostResResult, rpbResult] = await Promise.all([
            pool.query(worldBuffsQuery, [eventId]),
            pool.query(frostResQuery, [eventId]),
            pool.query(rpbQuery, [eventId])
        ]);
        
        res.json({
            success: true,
            eventId: eventId,
            data: {
                worldBuffs: worldBuffsResult.rows,
                frostResistance: frostResResult.rows,
                rpb: rpbResult.rows
            },
            counts: {
                worldBuffs: worldBuffsResult.rows.length,
                frostResistance: frostResResult.rows.length,
                rpb: rpbResult.rows.length
            }
        });
        
    } catch (error) {
        console.error('❌ [VERIFY] Error fetching imported data:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Quick fix endpoint to update wrong archive URL
app.post('/api/fix-archive-url/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        const { correctUrl, analysisType = 'world_buffs' } = req.body;
        
        console.log(`🔧 [FIX] Updating ${analysisType} archive URL for event ${eventId} to: ${correctUrl}`);
        
        const result = await pool.query(
            `UPDATE rpb_tracking 
             SET archive_url = $1, 
                 updated_at = CURRENT_TIMESTAMP
             WHERE event_id = $2 AND analysis_type = $3`,
            [correctUrl, eventId, analysisType]
        );
        
        if (result.rowCount > 0) {
            console.log(`✅ [FIX] Updated ${result.rowCount} record(s)`);
            res.json({ success: true, updatedRows: result.rowCount });
        } else {
            console.log(`❌ [FIX] No records found to update`);
            res.json({ success: false, message: 'No records found to update' });
        }
        
    } catch (error) {
        console.error('❌ [FIX] Error updating archive URL:', error);
        res.status(500).json({ success: false, error: error.message });
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
// Periodic cleanup for Raid-Helper event cache (runs every 24 hours)
setInterval(async () => {
    try {
        console.log('🧹 [SCHEDULED] Running periodic Raid-Helper cache cleanup...');
        const cleanedCount = await cleanupRaidHelperEventCache(365); // Clean entries older than 1 year
        if (cleanedCount > 0) {
            console.log(`🧹 [SCHEDULED] Cleaned up ${cleanedCount} old cache entries`);
        } else {
            console.log('🧹 [SCHEDULED] No old cache entries to clean up');
        }
    } catch (error) {
        console.error('❌ [SCHEDULED] Error during periodic cache cleanup:', error);
    }
}, 24 * 60 * 60 * 1000); // 24 hours in milliseconds

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Run initial cache cleanup on startup
  setTimeout(async () => {
      try {
          console.log('🧹 [STARTUP] Running initial Raid-Helper cache cleanup...');
          await cleanupRaidHelperEventCache(365);
      } catch (error) {
          console.error('❌ [STARTUP] Error during initial cache cleanup:', error);
      }
  }, 5000); // Wait 5 seconds after startup
});

// Set server timeout to 5 minutes (300 seconds) for long-running operations
server.timeout = 300000;

// --- Graceful Shutdown ---
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  pool.end(() => {
    console.log('Database pool has ended.');
    process.exit(0);
  });
});