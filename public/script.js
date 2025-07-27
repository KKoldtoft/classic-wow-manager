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
                // Found scheduled events (debug log removed)
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

                upcomingEvents.forEach(event => {
                    try {
                        const eventDiv = document.createElement('div');
                        eventDiv.classList.add('event-panel');
                        
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