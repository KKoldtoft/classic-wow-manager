// public/script.js
document.addEventListener('DOMContentLoaded', async () => {
    const authContainer = document.getElementById('auth-container');
    const eventsList = document.getElementById('events-list');

    console.log('script.js: DOMContentLoaded event fired.'); // DEBUG LOG S1

    // Function to fetch user status (no changes)
    async function getUserStatus() {
        try {
            const response = await fetch('/user');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('script.js: Error fetching user status:', error);
            return { loggedIn: false };
        }
    }

    // Function to update the UI based on login status (no changes)
    async function updateAuthUI() {
        const user = await getUserStatus();

        if (user.loggedIn) {
            const avatarUrl = user.avatar
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
                : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`;

            authContainer.innerHTML = `
                <img src="${avatarUrl}" alt="${user.username}'s avatar" class="user-avatar" title="Logged in as ${user.username}#${user.discriminator || ''}\nClick to Logout">
            `;
            authContainer.querySelector('.user-avatar').addEventListener('click', () => {
                window.location.href = '/auth/logout';
            });
            
            fetchAndDisplayEvents();

        } else {
            authContainer.innerHTML = `
                <button class="discord-button" onclick="window.location.href='/auth/discord'">
                    <i class="fab fa-discord discord-icon"></i>
                    Sign in with Discord
                </button>
            `;
            eventsList.innerHTML = '<p>Please sign in with Discord to view upcoming events.</p>';
        }
    }

    // Function to fetch and display events (now called directly)
    async function fetchAndDisplayEvents() {
        eventsList.innerHTML = '<p>Fetching events...</p>';
        const filterInfo = document.getElementById('filter-info');

        try {
            const response = await fetch('/api/events');
            const data = await response.json();

            console.log('script.js: Data received from /api/events:', data); // DEBUG LOG S2

            // Check if data.scheduledEvents exists and is an array with items
            if (data && Array.isArray(data.scheduledEvents) && data.scheduledEvents.length > 0) {
                console.log('script.js: Found scheduledEvents array with length:', data.scheduledEvents.length); // DEBUG LOG S3
                eventsList.innerHTML = ''; // Clear previous message

                const today = new Date();
                today.setHours(0, 0, 0, 0); // Normalize to the beginning of the day in the local timezone

                const formattedToday = today.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
                filterInfo.innerHTML = `<p>Showing raids for <strong>${formattedToday}</strong> and later.</p>`;

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
                        console.log(`Event: ${event.title || 'Untitled'}, Start: ${eventStartDate.toLocaleString()}, Is Upcoming: ${isUpcoming}`);
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

                upcomingEvents.forEach(event => {
                    try {
                        const eventDiv = document.createElement('div');
                        eventDiv.classList.add('event-panel');
                        
                        const eventId = event.id || 'unknown';
                        const eventTitle = event.title || 'Untitled Event';

                        if (eventId !== 'unknown') {
                            eventDiv.style.cursor = 'pointer';
                            eventDiv.addEventListener('click', () => {
                                console.log('script.js: Navigating to roster for event ID:', eventId); // DEBUG LOG S8
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

                        eventDiv.innerHTML = `
                            <h3>${eventTitle}</h3>
                            <div class="event-time-info">
                                <p><i class="far fa-calendar-alt event-icon"></i> ${dateDisplayHTML}</p>
                                <p><i class="far fa-clock event-icon"></i> ${formattedStartTime}</p>
                            </div>
                        `;
                        eventsList.appendChild(eventDiv);
                    } catch (renderError) {
                        console.error('Error rendering a single event. Skipping it.', renderError);
                        console.error('Problematic event data:', event);
                    }
                });

            } else {
                eventsList.innerHTML = '<p>No upcoming events found for this server.</p>';
                console.log('script.js: Data is empty or invalid format. Full data object:', data); // DEBUG LOG S10
            }
        } catch (error) {
            eventsList.innerHTML = '<p>An error occurred while fetching events. Check console for details.</p>';
            console.error('script.js: Client-side error during fetch operation:', error); // DEBUG LOG S11
        }
    }

    // Initial UI update on page load
    updateAuthUI();
});