// public/script.js
document.addEventListener('DOMContentLoaded', async () => {
    const authContainer = document.getElementById('auth-container');
    const fetchEventsButton = document.getElementById('fetch-events-button');
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
            // User is logged in, display avatar
            const avatarUrl = user.avatar
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
                : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`;

            authContainer.innerHTML = `
                <img src="${avatarUrl}" alt="${user.username}'s avatar" class="user-avatar" title="Logged in as ${user.username}#${user.discriminator || ''}\nClick to Logout">
            `;
            // Add logout functionality to the avatar
            authContainer.querySelector('.user-avatar').addEventListener('click', () => {
                window.location.href = '/auth/logout';
            });
            // Show fetch events button if logged in
            if (fetchEventsButton) {
                fetchEventsButton.style.display = 'block';
            }

        } else {
            // User is not logged in, display login button
            authContainer.innerHTML = `
                <button class="discord-button" onclick="window.location.href='/auth/discord'">
                    <i class="fab fa-discord discord-icon"></i>
                    Sign in with Discord
                </button>
            `;
            // Hide fetch events button if not logged in
            if (fetchEventsButton) {
                fetchEventsButton.style.display = 'none';
            }
        }
    }

    // Add event listener for the fetch events button
    if (fetchEventsButton) { // Ensure button exists before adding listener
        fetchEventsButton.addEventListener('click', async () => {
            eventsList.innerHTML = '<p>Fetching events...</p>';
            try {
                const response = await fetch('/api/events');
                const data = await response.json();

                // Check if data.scheduledEvents exists and is an array with items
                if (data && data.scheduledEvents && Array.isArray(data.scheduledEvents) && data.scheduledEvents.length > 0) {
                    eventsList.innerHTML = ''; // Clear previous message

                    const todayEvents = [];
                    const otherEvents = [];
                    // Get today's date string in CET for comparison
                    const todayInCET = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Copenhagen' });

                    data.scheduledEvents.forEach(event => {
                        const eventStartDate = new Date(event.startTime * 1000); // Convert Unix timestamp (seconds) to Date object (milliseconds)
                        const eventDateInCET = eventStartDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Copenhagen' });

                        if (eventDateInCET === todayInCET) {
                            todayEvents.push(event);
                        } else {
                            otherEvents.push(event);
                        }
                    });

                    // Sort events: Today's events first, then others
                    const sortedEvents = todayEvents.concat(otherEvents);

                    let todayEventsRendered = 0; // Track how many "Today" events are rendered

                    sortedEvents.forEach(event => {
                        const eventDiv = document.createElement('div');
                        eventDiv.classList.add('event-panel'); // Apply panel styling

                        const eventStartDate = new Date(event.startTime * 1000); // Re-create for formatting

                        // --- Formatting for CET (Central European Time) ---
                        const optionsDay = { weekday: 'long', timeZone: 'Europe/Copenhagen' };
                        const optionsDate = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Copenhagen' };
                        const optionsTime = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Copenhagen' };

                        const formattedDayName = eventStartDate.toLocaleDateString('en-US', optionsDay); // e.g., "Sunday"
                        const formattedDate = eventStartDate.toLocaleDateString('en-GB', optionsDate); // e.g., "27/07/2026"
                        const formattedStartTime = eventStartDate.toLocaleTimeString('en-GB', optionsTime); // e.g., "20:00"

                        // Determine if event is today and format display accordingly
                        const isToday = eventStartDate.toLocaleDateString('en-GB', { timeZone: 'Europe/Copenhagen' }) === todayInCET;
                        
                        let dateDisplayHTML;
                        if (isToday) {
                            dateDisplayHTML = `<span class="event-today-text">Today</span>`;
                            todayEventsRendered++; // Increment count for spacing
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

                    // Add spacing after "Today" events if any were found
                    if (todayEventsRendered > 0 && otherEvents.length > 0) {
                        const spacerDiv = document.createElement('div');
                        spacerDiv.classList.add('today-events-spacer');
                        eventsList.appendChild(spacerDiv);
                    }

                } else {
                    eventsList.innerHTML = '<p>No upcoming events found for this server.</p>';
                }
            } catch (error) {
                eventsList.innerHTML = '<p>An error occurred while fetching events.</p>';
                console.error('Client-side error fetching events:', error);
            }
        });
    }

    // Initial UI update on page load
    updateAuthUI();
});