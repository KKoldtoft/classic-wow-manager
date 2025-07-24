// public/script.js
document.addEventListener('DOMContentLoaded', async () => {
    const authContainer = document.getElementById('auth-container');
    const eventsList = document.getElementById('events-list');

    // Function to fetch user status
    async function getUserStatus() {
        try {
            const response = await fetch('/user');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching user status:', error);
            return { loggedIn: false };
        }
    }

    // Function to update the UI based on login status
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

            if (data && data.scheduledEvents && Array.isArray(data.scheduledEvents) && data.scheduledEvents.length > 0) {
                eventsList.innerHTML = ''; // Clear previous message

                const todayEvents = [];
                const otherEvents = [];
                const todayInCET = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Copenhagen' });

                data.scheduledEvents.forEach(event => {
                    const eventStartDate = new Date(event.startTime * 1000);
                    const eventDateInCET = eventStartDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Copenhagen' });

                    if (eventDateInCET === todayInCET) {
                        todayEvents.push(event);
                    } else {
                        otherEvents.push(event);
                    }
                });

                // Sort Today's events (descending - newest first among today's events)
                todayEvents.sort((a, b) => (b.startTime - a.startTime));
                // Sort Other events (ascending - sooner first among other events)
                otherEvents.sort((a, b) => (a.startTime - b.startTime));

                // Combine: Today's events first, then others
                const sortedEvents = todayEvents.concat(otherEvents);

                let hasRenderedTodayEventSpacer = false; // Flag to ensure spacer is added only once

                sortedEvents.forEach(event => {
                    const eventDiv = document.createElement('div');
                    eventDiv.classList.add('event-panel');
                    
                    eventDiv.style.cursor = 'pointer';
                    eventDiv.addEventListener('click', () => {
                        // NEW URL PATTERN:
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
                        if (otherEvents.length > 0) { // If there are other events, we'll need a spacer
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

                    // Add spacer ONLY if this is the last 'Today' event AND there are 'other' events to follow
                    if (isToday && (sortedEvents.indexOf(event) === (todayEvents.length - 1)) && hasRenderedTodayEventSpacer) {
                        const spacerDiv = document.createElement('div');
                        spacerDiv.classList.add('today-events-spacer');
                        eventsList.appendChild(spacerDiv);
                    }
                });

            } else {
                eventsList.innerHTML = '<p>No upcoming events found for this server.</p>';
            }
        } catch (error) {
            eventsList.innerHTML = '<p>An error occurred while fetching events.</p>';
            console.error('Client-side error fetching events:', error);
        }
    }

    // Initial UI update on page load
    updateAuthUI();
});