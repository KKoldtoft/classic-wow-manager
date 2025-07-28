// public/script.js
document.addEventListener('DOMContentLoaded', async () => {
    const eventsList = document.getElementById('events-list');
    let lastRefreshTime = null;

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

    // 🎯 Discord API functions removed - we now get channel names directly from Raid-Helper API!

    // Function to fetch and display events (now called directly)
    async function fetchAndDisplayEvents() {
        if (!eventsList) return; // Don't run if the container doesn't exist
        
        // Set loading state
        setLoadingState(true);
        eventsList.innerHTML = '<p>Fetching events...</p>';

        try {
            const response = await fetch('/api/events');
            const data = await response.json();

            // Events data received (debug log removed)

            // Use the new helper function to display events
            if (data && data.scheduledEvents) {
                console.log('📅 Found scheduled events:', data.scheduledEvents.length);
                displayEvents(data.scheduledEvents);
                
                // Update last refresh time (only if this was from a cache miss)
                if (!lastRefreshTime || (Date.now() - lastRefreshTime) > 5000) {
                    lastRefreshTime = Date.now();
                    updateLastRefreshDisplay();
                }
            } else {
                eventsList.innerHTML = '<p>No upcoming events found for this server.</p>';
            }
        } catch (error) {
            eventsList.innerHTML = '<p>An error occurred while fetching events. Check console for details.</p>';
            console.error('script.js: Client-side error during fetch operation:', error); // DEBUG LOG S11
        } finally {
            setLoadingState(false);
        }
    }

    // Helper function to set loading state
    function setLoadingState(isLoading) {
        const refreshBtn = document.getElementById('refresh-events-btn');
        if (refreshBtn) {
            refreshBtn.disabled = isLoading;
            if (isLoading) {
                refreshBtn.classList.add('loading');
            } else {
                refreshBtn.classList.remove('loading');
            }
        }
    }
    
    // Helper function to update last refresh display
    function updateLastRefreshDisplay() {
        const lastRefreshElement = document.getElementById('last-refresh');
        if (lastRefreshElement && lastRefreshTime) {
            const now = Date.now();
            const diffMs = now - lastRefreshTime;
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            
            if (diffMinutes < 1) {
                lastRefreshElement.textContent = 'Last refresh: Just now';
            } else if (diffMinutes === 1) {
                lastRefreshElement.textContent = 'Last refresh: 1 min ago';
            } else {
                lastRefreshElement.textContent = `Last refresh: ${diffMinutes} min ago`;
            }
        }
    }

    // Refresh events functionality
    async function refreshEvents() {
        const refreshBtn = document.getElementById('refresh-events-btn');
        const refreshStatus = document.getElementById('refresh-status');
        
        if (!refreshBtn || !refreshStatus) return;
        
        try {
            // Update UI to show loading state
            setLoadingState(true);
            refreshStatus.textContent = 'Refreshing events...';
            refreshStatus.className = 'refresh-status';
            
            // Call the refresh endpoint
            const response = await fetch('/api/events/refresh', {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Success - update the events display with fresh data
            refreshStatus.textContent = 'Events refreshed successfully!';
            refreshStatus.className = 'refresh-status success';
            
            // Update last refresh time
            lastRefreshTime = Date.now();
            updateLastRefreshDisplay();
            
            // Update the events list with the fresh data
            if (data.scheduledEvents) {
                displayEvents(data.scheduledEvents);
            } else {
                // Fallback: re-fetch events normally
                fetchAndDisplayEvents();
            }
            
            // Clear success message after 3 seconds
            setTimeout(() => {
                refreshStatus.textContent = '';
                refreshStatus.className = 'refresh-status';
            }, 3000);
            
        } catch (error) {
            console.error('Error refreshing events:', error);
            refreshStatus.textContent = 'Failed to refresh events. Please try again.';
            refreshStatus.className = 'refresh-status error';
            
            // Clear error message after 5 seconds
            setTimeout(() => {
                refreshStatus.textContent = '';
                refreshStatus.className = 'refresh-status';
            }, 5000);
        } finally {
            // Reset button state
            setLoadingState(false);
        }
    }
    
    // Helper function to display events (extracted from fetchAndDisplayEvents)
    function displayEvents(scheduledEvents) {
        if (!eventsList) return;
        
        if (scheduledEvents && Array.isArray(scheduledEvents) && scheduledEvents.length > 0) {
            console.log('📅 Displaying events:', scheduledEvents.length);
            eventsList.innerHTML = ''; // Clear previous content
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const upcomingEvents = scheduledEvents.filter(event => {
                try {
                    if (typeof event.startTime !== 'number') {
                        return false;
                    }
                    const eventStartDate = new Date(event.startTime * 1000);
                    return eventStartDate >= today;
                } catch (error) {
                    return false;
                }
            });
            
            if (upcomingEvents.length === 0) {
                eventsList.innerHTML = '<p>No upcoming events found for this server.</p>';
                return;
            }
            
            upcomingEvents.sort((a, b) => a.startTime - b.startTime);
            
            upcomingEvents.forEach((event, index) => {
                try {
                    const eventDiv = document.createElement('div');
                    eventDiv.classList.add('event-panel');
                    eventDiv.setAttribute('data-event-index', index);
                    
                    const eventId = event.id || 'unknown';
                    const eventTitle = event.title || 'Untitled Event';

                    if (eventId !== 'unknown') {
                        eventDiv.style.cursor = 'pointer';
                        eventDiv.addEventListener('click', () => {
                            window.location.href = `/event/${eventId}/roster`;
                        });
                    }

                    const eventStartDate = new Date(event.startTime * 1000);
                    const cetTimeZone = 'Europe/Copenhagen';
                    const nowInCET = new Date();
                    const todayAtMidnightCET = new Date(nowInCET.toLocaleDateString('en-CA', { timeZone: cetTimeZone }));
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
                    const signUpCount = event.signUpCount || '0';
                    
                    let channelDisplayName = '#unknown-channel';
                    if (event.channelName && 
                        event.channelName.trim() && 
                        event.channelName !== event.channelId &&
                        !event.channelName.match(/^\d+$/)) {
                        channelDisplayName = `#${event.channelName}`;
                    } else if (event.channelId) {
                        channelDisplayName = `#channel-${event.channelId.slice(-4)}`;
                    }

                    eventDiv.innerHTML = `
                        <h3>${eventTitle}</h3>
                        <div class="event-time-info">
                            <p><i class="far fa-calendar-alt event-icon"></i> ${dateDisplayHTML}</p>
                            <p><i class="far fa-clock event-icon"></i> ${formattedStartTime}</p>
                            <p><i class="fas fa-user event-icon"></i> ${signUpCount} Signed</p>
                            <p class="channel-info"><i class="fas fa-hashtag event-icon"></i> ${channelDisplayName}</p>
                        </div>
                    `;
                    eventsList.appendChild(eventDiv);
                } catch (renderError) {
                    console.error('Error rendering event:', renderError);
                }
            });
        } else {
            eventsList.innerHTML = '<p>No upcoming events found for this server.</p>';
        }
    }

    // Add event listener for refresh button (no nested DOMContentLoaded needed)
    const refreshBtn = document.getElementById('refresh-events-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshEvents);
    }

    // Update last refresh timestamp every minute
    setInterval(() => {
        if (lastRefreshTime) {
            updateLastRefreshDisplay();
        }
    }, 60000); // Update every minute

    // Initial check on page load
    checkLoginAndFetch();
});