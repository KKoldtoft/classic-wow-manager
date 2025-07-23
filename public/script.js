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
                : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`; // Default Discord avatar

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
                    data.scheduledEvents.forEach(event => { // Iterate over the correct array
                        const eventDiv = document.createElement('div');
                        eventDiv.classList.add('event-item');
                        // Customize how you display event data based on Raid-Helper API response structure
                        // Example properties from your Postman response: title, description, postTime, leaderName, channelName
                        const eventPostDate = new Date(event.postTime * 1000); // postTime is Unix timestamp (seconds)
                        eventDiv.innerHTML = `
                            <h3>${event.title}</h3>
                            <p><strong>Posted:</strong> ${eventPostDate.toLocaleDateString()} at ${eventPostDate.toLocaleTimeString()}</p>
                            <p><strong>Leader:</strong> ${event.leaderName}</p>
                            <p><strong>Channel:</strong> #${event.channelName}</p>
                            <p><strong>Description:</strong> ${event.description || 'No description'}</p>
                            <hr>
                        `;
                        eventsList.appendChild(eventDiv);
                    });
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