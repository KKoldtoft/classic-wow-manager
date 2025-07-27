// public/script.js
document.addEventListener('DOMContentLoaded', async () => {
    const eventsList = document.getElementById('events-list');

    // The user status and auth UI are now handled by top-bar.js
    // We just need to check if the user is logged in to fetch events.
    async function checkLoginAndFetch() {
        try {
            const response = await fetch('/user');
            const user = await response.json();
            
            if (user.loggedIn) {
                fetchAndDisplayEvents();
                fetchAndDisplayMyCharacters();
            } else {
                document.getElementById('events-list').innerHTML = '<p>Please sign in with Discord to view upcoming events.</p>';
                const myCharsContainer = document.getElementById('my-characters-list');
                if (myCharsContainer) {
                    myCharsContainer.innerHTML = '<p>Please sign in to see your characters.</p>';
                }
            }
        } catch (error) {
            console.error('Error checking user status:', error);
        }
    }

    async function fetchAndDisplayMyCharacters() {
        const myCharsContainer = document.getElementById('my-characters-list');
        if (!myCharsContainer) return; // Don't run if the container doesn't exist

        myCharsContainer.innerHTML = '<p>Loading my characters...</p>';

        try {
            const response = await fetch('/api/my-characters');
            if (!response.ok) {
                myCharsContainer.innerHTML = '<p>Could not load characters. Are you signed in?</p>';
                return;
            }

            const characters = await response.json();

            if (characters && characters.length > 0) {
                myCharsContainer.innerHTML = ''; // Clear loading message
                const list = document.createElement('ul');
                list.classList.add('character-list');
                characters.forEach(char => {
                    const listItem = document.createElement('li');
                    listItem.classList.add('character-item', `class-${char.class.toLowerCase().replace(/\s+/g, '-')}`);
                    listItem.innerHTML = `<span class="char-name">${char.character_name}</span> <span class="char-class">${char.class}</span>`;
                    list.appendChild(listItem);
                });
                myCharsContainer.appendChild(list);
            } else {
                myCharsContainer.innerHTML = '<p>No characters found for your Discord account.</p>';
            }

        } catch (error) {
            console.error('Error fetching user characters:', error);
            myCharsContainer.innerHTML = '<p>An error occurred while fetching your characters.</p>';
        }
    }

    // Channel name cache
    const channelNameCache = new Map();

    // Function to fetch channel name from Discord API
    async function fetchChannelName(channelId) {
        console.log('🔍 fetchChannelName called with channelId:', channelId);
        
        if (!channelId) {
            console.log('❌ No channelId provided, returning #unknown');
            return '#unknown';
        }
        
        // Check cache first
        if (channelNameCache.has(channelId)) {
            const cachedName = channelNameCache.get(channelId);
            console.log('✅ Found cached channel name:', cachedName);
            return cachedName;
        }

        // Quick authentication check
        try {
            console.log('🔐 Checking user authentication status...');
            const authResponse = await fetch('/user');
            const authData = await authResponse.json();
            console.log('🔐 Auth status:', authData.loggedIn ? 'Logged in' : 'Not logged in');
            
            if (!authData.loggedIn) {
                console.log('❌ User not authenticated, skipping Discord API call');
                const fallbackName = `#${channelId}`;
                channelNameCache.set(channelId, fallbackName);
                return fallbackName;
            }
        } catch (authError) {
            console.error('❌ Error checking authentication:', authError);
            const fallbackName = `#${channelId}`;
            channelNameCache.set(channelId, fallbackName);
            return fallbackName;
        }

        try {
            // First test if Discord API routing works at all
            console.log('🧪 Testing basic Discord API routing...');
            try {
                const basicTestResponse = await fetch('/api/discord/test');
                const basicTestData = await basicTestResponse.json();
                console.log('✅ Basic Discord API test:', basicTestData);
            } catch (testError) {
                console.error('❌ Basic Discord API test failed:', testError);
            }
            
            console.log('🌐 Fetching channel info from API:', `/api/discord/channel/${channelId}`);
            
            // Test if the endpoint exists first
            console.log('🧪 Testing API endpoint availability...');
            const testResponse = await fetch(`/api/discord/channel/${channelId}`, { method: 'HEAD' });
            console.log('🧪 HEAD request status:', testResponse.status);
            
            const response = await fetch(`/api/discord/channel/${channelId}`);
            console.log('📡 API response status:', response.status);
            console.log('📡 API response headers:', Object.fromEntries(response.headers.entries()));
            
            // Check if response is actually JSON
            const contentType = response.headers.get('content-type');
            console.log('📄 Response content type:', contentType);
            
            if (!response.ok) {
                console.error('❌ API response not OK:', response.status, response.statusText);
                const errorText = await response.text();
                console.error('❌ Error response body:', errorText.substring(0, 500));
                throw new Error(`API returned ${response.status}: ${response.statusText}`);
            }
            
            if (!contentType || !contentType.includes('application/json')) {
                console.error('❌ Response is not JSON, content-type:', contentType);
                const responseText = await response.text();
                console.error('❌ Response body (first 500 chars):', responseText.substring(0, 500));
                throw new Error('API returned non-JSON response');
            }
            
            const channelData = await response.json();
            console.log('📋 Channel data received:', channelData);
            
            const channelName = channelData.name ? `#${channelData.name}` : `#${channelId}`;
            console.log('🏷️ Final channel name:', channelName);
            
            // Cache the result
            channelNameCache.set(channelId, channelName);
            console.log('💾 Cached channel name for future use');
            
            return channelName;
        } catch (error) {
            console.error('❌ Error fetching channel name:', error);
            const fallbackName = `#${channelId}`;
            channelNameCache.set(channelId, fallbackName);
            console.log('🔄 Using fallback name:', fallbackName);
            return fallbackName;
        }
    }

    // Function to get channel name (sync version for immediate display)
    function getChannelName(channelId) {
        console.log('🔄 getChannelName called with channelId:', channelId);
        
        // Simple mapping for immediate display (fallback)
        const fallbackMapping = {
            '1202206206782091264': '📅sunday-aqbwl',
            // Add more as needed
        };
        
        const cachedName = channelNameCache.get(channelId);
        const fallbackName = fallbackMapping[channelId];
        const finalName = cachedName || fallbackName || `#${channelId}`;
        
        console.log('📝 Channel name resolution:', {
            channelId,
            cached: cachedName,
            fallback: fallbackName,
            final: finalName
        });
        
        return finalName;
    }

    // Function to fetch and display events (now called directly)
    async function fetchAndDisplayEvents() {
        if (!eventsList) return; // Don't run if the container doesn't exist
        eventsList.innerHTML = '<p>Fetching events...</p>';

        try {
            const response = await fetch('/api/events');
            const data = await response.json();

            // Events data received (debug log removed)

            // Check if data.scheduledEvents exists and is an array with items
            if (data && Array.isArray(data.scheduledEvents) && data.scheduledEvents.length > 0) {
                console.log('📅 Found scheduled events:', data.scheduledEvents.length);
                console.log('🔍 Sample event data:', data.scheduledEvents[0]);
                eventsList.innerHTML = ''; // Clear previous message

                const today = new Date();
                today.setHours(0, 0, 0, 0); // Normalize to the beginning of the day in the local timezone

                const formattedToday = today.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
                // filterInfo.innerHTML = `<p>Showing raids for <strong>${formattedToday}</strong> and later.</p>`; // This line was removed

                const upcomingEvents = data.scheduledEvents.filter(event => {
                    try {
                        if (typeof event.startTime !== 'number') {
                            console.warn('Event is missing a numeric startTime. Skipping.', event);
                            return false;
                        }

                        const eventStartDate = new Date(event.startTime * 1000);
                        
                        if (isNaN(eventStartDate.getTime())) {
                            console.warn('Event has an invalid startTime, resulting in an invalid date. Skipping.', event);
                            return false;
                        }

                        const isUpcoming = eventStartDate >= today;
                        // Event processing (debug log removed)
                        return isUpcoming;
                    } catch (filterError) {
                        console.error('An error occurred during event filtering. Skipping this event.', filterError);
                        console.error('Problematic event during filtering:', event);
                        return false;
                    }
                });

                if (upcomingEvents.length === 0) {
                    eventsList.innerHTML = '<p>No upcoming events found for this server.</p>';
                    return;
                }
                
                upcomingEvents.sort((a, b) => a.startTime - b.startTime);

                upcomingEvents.forEach(async (event, index) => {
                    console.log(`🎯 Processing event ${index + 1}:`, {
                        id: event.id,
                        title: event.title,
                        channelId: event.channelId,
                        signUpCount: event.signUpCount
                    });
                    
                    try {
                        const eventDiv = document.createElement('div');
                        eventDiv.classList.add('event-panel');
                        eventDiv.setAttribute('data-event-index', index); // For updating later
                        
                        const eventId = event.id || 'unknown';
                        const eventTitle = event.title || 'Untitled Event';

                        if (eventId !== 'unknown') {
                            eventDiv.style.cursor = 'pointer';
                            eventDiv.addEventListener('click', () => {
                                // Navigating to roster (debug log removed)
                                window.location.href = `/event/${eventId}/roster`;
                            });
                        }

                        const eventStartDate = new Date(event.startTime * 1000);

                        // --- Date Formatting Logic ---
                        const cetTimeZone = 'Europe/Copenhagen';
                        const nowInCET = new Date();

                        // Get today's date at midnight in CET
                        const todayAtMidnightCET = new Date(nowInCET.toLocaleDateString('en-CA', { timeZone: cetTimeZone }));

                        // Normalize event start date to date only
                        const eventDateOnly = new Date(eventStartDate.toLocaleDateString('en-CA', { timeZone: cetTimeZone }));

                        let dateDisplayHTML;
                        if (eventDateOnly.getTime() === todayAtMidnightCET.getTime()) {
                            dateDisplayHTML = `<span class="event-today-text">Today</span>`;
                            eventDiv.classList.add('event-panel-today');
                        } else {
                            const optionsDay = { weekday: 'long', timeZone: cetTimeZone };
                            const optionsDate = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: cetTimeZone };
                            const formattedDayName = eventStartDate.toLocaleDateString('en-US', optionsDay);
                            const formattedDate = eventStartDate.toLocaleDateString('en-GB', optionsDate);
                            dateDisplayHTML = `${formattedDayName} (${formattedDate})`;
                        }
                        
                        const optionsTime = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: cetTimeZone };
                        const formattedStartTime = eventStartDate.toLocaleTimeString('en-GB', optionsTime);
                        // --- End Date Formatting Logic ---

                        // Get signup count and initial channel name
                        const signUpCount = event.signUpCount || '0';
                        const initialChannelName = getChannelName(event.channelId);

                        eventDiv.innerHTML = `
                            <h3>${eventTitle}</h3>
                            <div class="event-time-info">
                                <p><i class="far fa-calendar-alt event-icon"></i> ${dateDisplayHTML}</p>
                                <p><i class="far fa-clock event-icon"></i> ${formattedStartTime}</p>
                                <p><i class="fas fa-user event-icon"></i> ${signUpCount} Signed</p>
                                <p class="channel-info"><i class="fas fa-hashtag event-icon"></i> ${initialChannelName}</p>
                            </div>
                        `;
                        eventsList.appendChild(eventDiv);

                        // Fetch real channel name asynchronously and update
                        if (event.channelId) {
                            console.log('🚀 Starting async channel fetch for event:', event.id, 'channelId:', event.channelId);
                            fetchChannelName(event.channelId).then(realChannelName => {
                                console.log('✅ Got real channel name:', realChannelName, 'for event:', event.id);
                                const channelInfoElement = eventDiv.querySelector('.channel-info');
                                if (channelInfoElement) {
                                    console.log('🔄 Updating channel display from:', channelInfoElement.innerHTML, 'to:', realChannelName);
                                    channelInfoElement.innerHTML = `<i class="fas fa-hashtag event-icon"></i> ${realChannelName}`;
                                } else {
                                    console.error('❌ Could not find .channel-info element in event div');
                                }
                            }).catch(error => {
                                console.error('❌ Error updating channel name for event:', event.id, error);
                            });
                        } else {
                            console.log('⚠️ No channelId found for event:', event.id);
                        }
                    } catch (renderError) {
                        console.error('Error rendering a single event. Skipping it.', renderError);
                        console.error('Problematic event data:', event);
                    }
                });

            } else {
                eventsList.innerHTML = '<p>No upcoming events found for this server.</p>';
                // No events data available (debug log removed)
            }
        } catch (error) {
            eventsList.innerHTML = '<p>An error occurred while fetching events. Check console for details.</p>';
            console.error('script.js: Client-side error during fetch operation:', error); // DEBUG LOG S11
        }
    }

    // Initial check on page load
    checkLoginAndFetch();
});