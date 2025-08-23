-- Quick SQL queries to check the cache system
-- Run these in your database console/admin tool

-- 1. Check if the cache table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'raid_helper_events_cache';

-- 2. Check table structure
\d raid_helper_events_cache

-- 3. View cache contents (if any)
SELECT 
    event_id, 
    cached_at, 
    last_accessed,
    CASE 
        WHEN cached_at > NOW() - INTERVAL '6 hours' THEN 'Fresh' 
        ELSE 'Stale' 
    END as cache_status
FROM raid_helper_events_cache 
ORDER BY cached_at DESC;

-- 4. Check cache size
SELECT 
    COUNT(*) as total_events,
    pg_size_pretty(pg_total_relation_size('raid_helper_events_cache')) as table_size
FROM raid_helper_events_cache; 