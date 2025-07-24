// public/roster.js
document.addEventListener('DOMContentLoaded', async () => {
    console.log('roster.js: DOMContentLoaded event fired. Script is running.'); // DEBUG LOG 1

    const rosterGrid = document.getElementById('roster-grid');
    const rosterEventTitle = document.getElementById('roster-event-title');
    const authContainer = document.getElementById('auth-container');

    // Extract event ID from the URL - NEW URL PATTERN
    const pathParts = window.location.pathname.split('/');
    const eventKeywordIndex = pathParts.indexOf('event');
    const eventId = (eventKeywordIndex !== -1 && pathParts.length > eventKeywordIndex + 1) ? pathParts[eventKeywordIndex + 1] : null;

    if (!eventId) {
        rosterGrid.innerHTML = '<p>Error: Event ID not found in URL.</p>';
        rosterEventTitle.textContent = 'Error Loading Roster';
        console.error('roster.js: Event ID could not be parsed from the URL.');
        return;
    }

    console.log(`roster.js: Successfully parsed Event ID from URL: ${eventId}`);

    rosterEventTitle.textContent = `Roster for Event ID: ${eventId} (Loading...)`;

    // Functionality for top-bar auth (copied from script.js)
    async function getUserStatus() {
        try {
            const response = await fetch('/user');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('roster.js: Error fetching user status for top bar:', error);
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

    console.log('roster.js: Attempting to fetch roster data from /api/roster/eventId...'); // DEBUG LOG 4
    try {
        const response = await fetch(`/api/roster/${eventId}`); // Use the hardcoded eventId
        console.log('roster.js: Fetch response received from /api/roster. Response object:', response); // DEBUG LOG 5
        
        if (!response.ok) {
            console.error('roster.js: HTTP Error Response for /api/roster:', response.status, response.statusText);
            const errorData = await response.json();
            console.error('roster.js: Error data from /api/roster:', errorData);
            rosterGrid.innerHTML = `<p>Error fetching roster: ${errorData.message || 'Server returned an error'}</p>`;
            return;
        }

        const rosterData = await response.json();
        console.log('roster.js: Roster data parsed successfully.', rosterData); // DEBUG LOG 6

        if (rosterData && rosterData.raidDrop) { // Check for rosterData.raidDrop
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
                        // Use innerHTML to structure the content
                        cellDiv.innerHTML = `
                            <div class="player-name">${player.name}</div>
                            <div class="player-id">${player.userId || 'No ID'}</div>
                        `;

                        if (player.color) {
                            cellDiv.style.backgroundColor = player.color;
                            if (player.color.includes(',')) {
                                cellDiv.style.backgroundColor = `rgb(${player.color})`;
                                const rgb = player.color.split(',').map(Number);
                                const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
                                if (brightness < 128) {
                                    cellDiv.style.color = 'white';
                                } else {
                                    cellDiv.style.color = 'black';
                                }
                            }
                        }
                    } else {
                        cellDiv.innerHTML = '<div class="player-name">Empty</div>';
                    }
                    columnDiv.appendChild(cellDiv);
                }
                rosterGrid.appendChild(columnDiv);
            }

            if (rosterData.title) {
                rosterEventTitle.textContent = rosterData.title;
            }
            console.log('roster.js: Roster rendered successfully.'); // DEBUG LOG 7

        } else {
            rosterGrid.innerHTML = '<p>No roster data found or invalid format. Check /api/roster/:eventId response.</p>';
            console.log('roster.js: No roster data found or invalid format.', rosterData); // DEBUG LOG 8
        }
    } catch (error) {
        rosterGrid.innerHTML = '<p>An error occurred while fetching roster data.</p>';
        console.error('roster.js: Client-side error during fetch operation. This might be a network issue or JSON parsing problem.', error); // DEBUG LOG 10
    }
});