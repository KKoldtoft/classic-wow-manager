// voice-check.js - "Who is not in Discord?" feature
// Auto-refreshes every 5 seconds to show real-time voice channel status

(function() {
    'use strict';

    const REFRESH_INTERVAL_MS = 5000; // 5 seconds
    let refreshTimer = null;
    let countdownTimer = null;
    let countdownValue = 5;
    let isRefreshing = false;

    // Class name to CSS class mapping
    function getClassCss(className) {
        if (!className) return '';
        const normalized = className.toLowerCase().replace(/\s+/g, '-');
        return `class-${normalized}`;
    }

    // Format event start time
    function formatEventTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const isTomorrow = date.toDateString() === tomorrow.toDateString();
        
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        
        if (isToday) {
            return `Today at ${timeStr}`;
        } else if (isTomorrow) {
            return `Tomorrow at ${timeStr}`;
        } else {
            const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            return `${dateStr} at ${timeStr}`;
        }
    }

    // Render voice state icons (mute/deaf)
    function renderVoiceStateIcons(state) {
        if (!state) return '';
        const icons = [];
        
        // Server muted (by admin)
        if (state.mute) {
            icons.push('<i class="fas fa-microphone-slash active" title="Server Muted"></i>');
        }
        // Self muted
        else if (state.selfMute) {
            icons.push('<i class="fas fa-microphone-slash" title="Self Muted"></i>');
        }
        
        // Server deafened (by admin)
        if (state.deaf) {
            icons.push('<i class="fas fa-volume-mute active" title="Server Deafened"></i>');
        }
        // Self deafened
        else if (state.selfDeaf) {
            icons.push('<i class="fas fa-volume-mute" title="Self Deafened"></i>');
        }
        
        // Streaming
        if (state.streaming) {
            icons.push('<i class="fas fa-broadcast-tower" title="Streaming" style="color: #9b59b6;"></i>');
        }
        
        // Video
        if (state.video) {
            icons.push('<i class="fas fa-video" title="Camera On" style="color: #3498db;"></i>');
        }
        
        // Suppressed (stage audience)
        if (state.suppress) {
            icons.push('<i class="fas fa-hand-paper" title="Suppressed (Stage Audience)" style="color: #f39c12;"></i>');
        }
        
        return icons.length > 0 ? `<div class="voice-state-icons">${icons.join('')}</div>` : '';
    }

    // Render a player card
    function renderPlayerCard(player) {
        const avatarUrl = player.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
        const discordName = player.discordName || 'Unknown';
        const characterName = player.characterName;
        const characterClass = player.characterClass;
        const discordId = player.discordId;
        const status = player.status;
        const voiceState = player.voiceState;
        
        const classCss = characterClass ? getClassCss(characterClass) : '';
        
        let characterBadge = '';
        if (characterName) {
            characterBadge = `<span class="character-name ${classCss}">${escapeHtml(characterName)}</span>`;
        }
        
        const voiceIcons = renderVoiceStateIcons(voiceState);
        
        return `
            <div class="player-card" data-discord-id="${escapeHtml(discordId)}">
                <img class="player-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(discordName)}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                <div class="player-info">
                    <div class="player-names">
                        <span class="discord-name">${escapeHtml(discordName)}</span>
                        ${characterBadge}
                    </div>
                    <div class="discord-id">${escapeHtml(discordId)}</div>
                </div>
                <div class="player-status">
                    ${voiceIcons}
                    <div class="status-icon ${status}" title="${getStatusTitle(status)}"></div>
                </div>
            </div>
        `;
    }

    function getStatusTitle(status) {
        switch (status) {
            case 'online': return 'In voice channel and in roster';
            case 'missing': return 'In roster but NOT in voice channel';
            case 'extra': return 'In voice channel but NOT in roster';
            default: return status;
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Render the full content with 3 columns
    function renderContent(data) {
        const content = document.getElementById('content');
        if (!content) return;
        
        const online = data.combined.filter(p => p.status === 'online');
        const missing = data.combined.filter(p => p.status === 'missing');
        const extra = data.combined.filter(p => p.status === 'extra');
        
        // Check if we have any data
        if (online.length === 0 && missing.length === 0 && extra.length === 0) {
            const eventId = getEventId();
            if (!eventId) {
                content.innerHTML = '<div class="empty-section">No event selected. <a href="/" style="color: var(--online);">Go to Upcoming Raids</a> to select an event first.</div>';
            } else {
                content.innerHTML = '<div class="empty-section">No roster data found for this event. Make sure the roster is set up.</div>';
            }
            return;
        }
        
        // Clone the template
        const template = document.getElementById('columns-template');
        const clone = template.content.cloneNode(true);
        
        // Populate Online column
        const colOnline = clone.getElementById('col-online');
        const listOnline = clone.getElementById('list-online');
        const countOnline = clone.getElementById('count-online');
        if (online.length > 0) {
            countOnline.textContent = online.length;
            listOnline.innerHTML = online.map(renderPlayerCard).join('');
        } else {
            colOnline.classList.add('hidden');
        }
        
        // Populate Missing column
        const colMissing = clone.getElementById('col-missing');
        const listMissing = clone.getElementById('list-missing');
        const countMissing = clone.getElementById('count-missing');
        if (missing.length > 0) {
            countMissing.textContent = missing.length;
            listMissing.innerHTML = missing.map(renderPlayerCard).join('');
        } else {
            colMissing.classList.add('hidden');
        }
        
        // Populate Extra column  
        const colExtra = clone.getElementById('col-extra');
        const listExtra = clone.getElementById('list-extra');
        const countExtra = clone.getElementById('count-extra');
        if (extra.length > 0) {
            countExtra.textContent = extra.length;
            listExtra.innerHTML = extra.map(renderPlayerCard).join('');
        } else {
            colExtra.classList.add('hidden');
        }
        
        // Count visible columns and set class
        const visibleCount = [online.length, missing.length, extra.length].filter(n => n > 0).length;
        const container = clone.querySelector('.columns-container');
        if (visibleCount === 2) {
            container.classList.add('cols-2');
        } else if (visibleCount === 1) {
            container.classList.add('cols-1');
        }
        
        // Clear and append
        content.innerHTML = '';
        content.appendChild(clone);
    }

    // Update stats
    function updateStats(data) {
        document.getElementById('stat-online').textContent = data.onlineCount || 0;
        document.getElementById('stat-missing').textContent = data.missingCount || 0;
        document.getElementById('stat-extra').textContent = data.extraCount || 0;
    }

    // Update event info
    function updateEventInfo(data) {
        const eventInfo = document.getElementById('event-info');
        if (!eventInfo) return;
        
        if (data.eventTitle) {
            const timeStr = data.eventStartTime ? formatEventTime(data.eventStartTime) : '';
            const channelStr = data.channelName ? `<i class="fas fa-headphones"></i> ${escapeHtml(data.channelName)}` : '';
            eventInfo.innerHTML = `<strong>${escapeHtml(data.eventTitle)}</strong>${timeStr ? ` • ${timeStr}` : ''}${channelStr ? ` • ${channelStr}` : ''}`;
        } else if (data.message) {
            eventInfo.innerHTML = `<span style="color: var(--extra);">${escapeHtml(data.message)}</span>`;
        } else {
            eventInfo.innerHTML = '<span style="color: var(--missing);">No event selected</span>';
        }
        
        // Show debug info if available (in console)
        if (data._debug) {
            console.log('[Voice Check Debug]', {
                rosterSource: data._debug.rosterSource,
                trackedVoiceChannels: data._debug.trackedVoiceChannels,
                targetChannelId: data.channelId,
                rosterCount: data.rosterCount,
                voiceCount: data.voiceCount
            });
        }
    }

    // Get event ID from URL or localStorage
    function getEventId() {
        // First check URL parameter
        const params = new URLSearchParams(window.location.search);
        let eventId = params.get('eventId');
        
        // If not in URL, check localStorage (set by roster page)
        if (!eventId) {
            eventId = localStorage.getItem('activeEventInSession');
        }
        
        return eventId || null;
    }

    // Update URL with event ID (without reloading)
    function updateUrlWithEventId(eventId) {
        if (!eventId) return;
        
        const url = new URL(window.location);
        if (url.searchParams.get('eventId') !== eventId) {
            url.searchParams.set('eventId', eventId);
            window.history.replaceState({}, '', url);
        }
    }

    // Fetch data from API
    async function fetchData() {
        const eventId = getEventId();
        
        // Update URL if we got eventId from localStorage
        if (eventId) {
            updateUrlWithEventId(eventId);
        }
        
        let url = '/api/voice-check';
        if (eventId) {
            url += `?eventId=${encodeURIComponent(eventId)}`;
        }
        
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return response.json();
    }

    // Refresh data
    async function refresh() {
        if (isRefreshing) return;
        
        isRefreshing = true;
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.classList.add('refreshing');
        }
        
        try {
            const data = await fetchData();
            
            if (!data.ok) {
                throw new Error(data.error || 'Unknown error');
            }
            
            updateEventInfo(data);
            updateStats(data);
            renderContent(data);
            
        } catch (err) {
            console.error('Voice check refresh error:', err);
            const content = document.getElementById('content');
            if (content) {
                content.innerHTML = `
                    <div class="error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <div>Error loading data: ${escapeHtml(err.message)}</div>
                        <div style="font-size: 0.85rem; margin-top: 8px;">Will retry automatically...</div>
                    </div>
                `;
            }
        } finally {
            isRefreshing = false;
            if (refreshBtn) {
                refreshBtn.classList.remove('refreshing');
            }
            resetCountdown();
        }
    }

    // Countdown display
    function updateCountdown() {
        const el = document.getElementById('countdown');
        if (el) {
            el.textContent = countdownValue;
        }
    }

    function resetCountdown() {
        countdownValue = Math.ceil(REFRESH_INTERVAL_MS / 1000);
        updateCountdown();
    }

    function tickCountdown() {
        countdownValue = Math.max(0, countdownValue - 1);
        updateCountdown();
    }

    // Initialize
    function init() {
        // Initial load
        refresh();
        
        // Set up auto-refresh
        refreshTimer = setInterval(refresh, REFRESH_INTERVAL_MS);
        countdownTimer = setInterval(tickCountdown, 1000);
        resetCountdown();
        
        // Manual refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                clearInterval(refreshTimer);
                clearInterval(countdownTimer);
                refresh().then(() => {
                    refreshTimer = setInterval(refresh, REFRESH_INTERVAL_MS);
                    countdownTimer = setInterval(tickCountdown, 1000);
                });
            });
        }
        
        // Pause refresh when tab is not visible
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                clearInterval(refreshTimer);
                clearInterval(countdownTimer);
            } else {
                refresh();
                refreshTimer = setInterval(refresh, REFRESH_INTERVAL_MS);
                countdownTimer = setInterval(tickCountdown, 1000);
            }
        });
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
