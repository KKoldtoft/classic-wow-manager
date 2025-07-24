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
        try {
            const response = await fetch('/api/events');
            const data = await response.json();

            console.log('script.js: Data received from /api/events:', data); // DEBUG LOG S2

            // Check if data.scheduledEvents exists and is an array with items
            if (data && data.scheduledEvents && Array.isArray(data.scheduledEvents) && data.scheduledEvents.length > 0) {
                console.log('script.js: Found scheduledEvents array with length:', data.scheduledEvents.length); // DEBUG LOG S3
                eventsList.innerHTML = ''; // Clear previous message

                const todayEvents = [];
                const otherEvents = [];
                const todayInCET = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Copenhagen' });
                console.log('script.js: Today in CET for comparison:', todayInCET); // DEBUG LOG S4


                data.scheduledEvents.forEach(event => {
                    const eventStartDate = new Date(event.startTime * 1000);
                    const eventDateInCET = eventStartDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Copenhagen' });

                    console.log(`script.js: Processing event "${event.title}" - StartTime: ${event.startTime}, DateInCET: ${eventDateInCET}`); // DEBUG LOG S5

                    if (eventDateInCET === todayInCET) {
                        todayEvents.push(event);
                    } else {
                        otherEvents.push(event);
                    }
                });

                console.log('script.js: Today events count:', todayEvents.length, 'Other events count:', otherEvents.length); // DEBUG LOG S6

                // Sort Today's events (descending - newest first among today's events)
                todayEvents.sort((a, b) => (b.startTime - a.startTime));
                // Sort Other events (ascending - sooner first among other events)
                otherEvents.sort((a, b) => (a.startTime - b.startTime));

                // Combine: Today's events first, then others
                const sortedEvents = todayEvents.concat(otherEvents);
                console.log('script.js: Total sorted events to render:', sortedEvents.length, sortedEvents.map(e => e.title)); // DEBUG LOG S7

                let hasRenderedTodayEventSpacer = false; // Flag to ensure spacer is added only once

                sortedEvents.forEach(event => {
                    const eventDiv = document.createElement('div');
                    eventDiv.classList.add('event-panel');
                    
                    eventDiv.style.cursor = 'pointer';
                    eventDiv.addEventListener('click', () => {
                        console.log('script.js: Navigating to roster for event ID:', event.id); // DEBUG LOG S8
                        window.location.href = `/event/${event.id}/roster`;
                    });

                    const eventStartDate = new Date(event.startTime * 1000);

                    const optionsDay = { weekday: 'long', timeZone: 'Europe/Copenhagen' };
                    const optionsDate = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Copenhagen' };
                    const optionsTime = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Copenhagen' };

                    const formattedDayName = eventStartDate.toLocaleDateString('en-US', optionsDay);
                    const formattedDate = eventStartDate.toLocaleDateString('en-GB', optionsDate);
                    const formattedStartTime = eventStartDate.toLocaleTimeString('en-GB', optionsTime);

                    const isToday = eventStartDate.toLocaleDateString('en-GB', { timeZone: 'Europe/Copenhagen' }) === todayInCET;
                    
                    let dateDisplayHTML;
                    if (isToday) {
                        dateDisplayHTML = `<span class="event-today-text">Today</span>`;
                        eventDiv.classList.add('event-panel-today');
                        if (otherEvents.length > 0) {
                            hasRenderedTodayEventSpacer = true;
                        }
                    } else {
                        dateDisplayHTML = `${formattedDayName} (${formattedDate})`;
                    }

                    eventDiv.innerHTML = `
                        <h3>${event.title}</h3>
                        <div class="event-time-info">
                            <p><i class="far fa-calendar-alt event-icon"></i> ${dateDisplayHTML}</p>
                            <p><i class="far fa-clock event-icon"></i> ${formattedStartTime}</p>
                        </div>
                    `;
                    eventsList.appendChild(eventDiv);
                });

                // Add spacer ONLY if this is the last 'Today' event AND there are 'other' events to follow
                if (hasRenderedTodayEventSpacer && todayEvents.length > 0 && otherEvents.length > 0) { // Refined condition
                    const spacerDiv = document.createElement('div');
                    spacerDiv.classList.add('today-events-spacer');
                    eventsList.appendChild(spacerDiv);
                }
                console.log('script.js: Finished rendering events.'); // DEBUG LOG S9

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