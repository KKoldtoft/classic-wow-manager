// public/roster.js
document.addEventListener('DOMContentLoaded', async () => {
    const rosterGrid = document.getElementById('roster-grid');
    const rosterEventTitle = document.getElementById('roster-event-title');
    const authContainer = document.getElementById('auth-container');

    // Extract event ID from the URL - NEW URL PATTERN
    const pathParts = window.location.pathname.split('/');
    // Expected URL format: /event/123/roster
    // So eventId should be at index 2 after splitting by '/', if 'event' is at index 1
    const eventKeywordIndex = pathParts.indexOf('event');
    const eventId = (eventKeywordIndex !== -1 && pathParts.length > eventKeywordIndex + 1) ? pathParts[eventKeywordIndex + 1] : null;

    console.log('Roster Page: Event ID found in URL:', eventId); // DEBUGGING LOG

    if (!eventId) {
        rosterGrid.innerHTML = '<p>Error: Event ID not found in URL.</p>';
        rosterEventTitle.textContent = 'Error Loading Roster';
        return;
    }

    rosterEventTitle.textContent = `Roster for Event ID: ${eventId} (Loading...)`;

    // Functionality for top-bar auth (copied from script.js)
    async function getUserStatus() {
        try {
            const response = await fetch('/user');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching user status for top bar:', error);
            return { loggedIn: false };
        }
    }

    async function updateAuthUIForRosterPage() {
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
        } else {
            authContainer.innerHTML = `
                <button class="discord-button" onclick="window.location.href='/auth/discord'">
                    <i class="fab fa-discord discord-icon"></i>
                    Sign in with Discord
                </button>
            `;
        }
    }
    updateAuthUIForRosterPage();

    try {
        const response = await fetch(`/api/roster/${eventId}`);
        const rosterData = await response.json();

        if (response.ok) {
            if (rosterData && rosterData.raidDrop) {
                const partyPerRaid = rosterData.partyPerRaid;
                const slotPerParty = rosterData.slotPerParty;
                const raidDrop = rosterData.raidDrop;

                rosterGrid.style.gridTemplateColumns = `repeat(${partyPerRaid}, 1fr)`;
                rosterGrid.innerHTML = '';

                const rosterMatrix = Array(partyPerRaid).fill(null).map(() => Array(slotPerParty).fill(null));

                raidDrop.forEach(player => {
                    if (player.partyId >= 1 && player.partyId <= partyPerRaid &&
                        player.slotId >= 1 && player.slotId <= slotPerParty) {
                        rosterMatrix[player.partyId - 1][player.slotId - 1] = player;
                    }
                });

                for (let i = 0; i < partyPerRaid; i++) {
                    const columnDiv = document.createElement('div');
                    columnDiv.classList.add('roster-column');
                    
                    if (rosterData.partyNames && rosterData.partyNames[i]) {
                        const partyName = document.createElement('div');
                        partyName.classList.add('party-name');
                        partyName.textContent = rosterData.partyNames[i];
                        columnDiv.appendChild(partyName);
                    }

                    for (let j = 0; j < slotPerParty; j++) {
                        const cellDiv = document.createElement('div');
                        cellDiv.classList.add('roster-cell');

                        const player = rosterMatrix[i][j];
                        if (player && player.name) {
                            cellDiv.classList.add('player-filled');
                            cellDiv.textContent = player.name;
                            if (player.color) {
                                cellDiv.style.backgroundColor = player.color;
                            }
                        } else {
                            cellDiv.textContent = 'Empty';
                        }
                        columnDiv.appendChild(cellDiv);
                    }
                    rosterGrid.appendChild(columnDiv);
                }

                if (rosterData.title) {
                    rosterEventTitle.textContent = rosterData.title;
                }

            } else {
                rosterGrid.innerHTML = '<p>No roster data found for this event.</p>';
            }
        } else {
            rosterGrid.innerHTML = `<p>Error fetching roster: ${rosterData.message || 'Unknown error'}</p>`;
            console.error('Error from /api/roster:', rosterData);
        }
    } catch (error) {
        rosterGrid.innerHTML = '<p>An error occurred while fetching roster data.</p>';
        console.error('Client-side error fetching roster:', error);
    }
});