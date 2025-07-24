// public/roster.js
document.addEventListener('DOMContentLoaded', async () => {
    const rosterGrid = document.getElementById('roster-grid');
    const rosterEventTitle = document.getElementById('roster-event-title');

    // Extract event ID from the URL
    const pathParts = window.location.pathname.split('/');
    // Expected URL format: /event_id=123/roster
    // So eventId should be at index 1 after splitting by '/', and remove 'event_id=' prefix
    const eventIdParam = pathParts[pathParts.length - 2];
    const eventId = eventIdParam ? eventIdParam.replace('event_id=', '') : null;

    if (!eventId) {
        rosterGrid.innerHTML = '<p>Error: Event ID not found in URL.</p>';
        rosterEventTitle.textContent = 'Error Loading Roster';
        return;
    }

    rosterEventTitle.textContent = `Roster for Event ID: ${eventId}`; // Initial title, will update with actual title

    try {
        const response = await fetch(`/api/roster/${eventId}`);
        const rosterData = await response.json();

        if (response.ok) {
            if (rosterData && rosterData.raidDrop) {
                const partyPerRaid = rosterData.partyPerRaid; // Number of columns
                const slotPerParty = rosterData.slotPerParty; // Cells per column (rows)
                const raidDrop = rosterData.raidDrop; // Array of players

                // Set grid columns dynamically based on partyPerRaid
                rosterGrid.style.gridTemplateColumns = `repeat(${partyPerRaid}, 1fr)`;
                rosterGrid.innerHTML = ''; // Clear loading message

                // Create a 2D array to hold player data for easy lookup
                const rosterMatrix = Array(partyPerRaid).fill(null).map(() => Array(slotPerParty).fill(null));

                // Populate the matrix with actual player data
                raidDrop.forEach(player => {
                    // partyId is 1-indexed, slotId is 1-indexed
                    if (player.partyId >= 1 && player.partyId <= partyPerRaid &&
                        player.slotId >= 1 && player.slotId <= slotPerParty) {
                        rosterMatrix[player.partyId - 1][player.slotId - 1] = player;
                    }
                });

                // Dynamically build the roster grid
                for (let i = 0; i < partyPerRaid; i++) {
                    const columnDiv = document.createElement('div');
                    columnDiv.classList.add('roster-column');
                    
                    // Add Party Name (if available) - Assuming partyNames array is in order
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
                            // Set background color using the 'color' property from JSON
                            // Ensure color is a valid CSS format (e.g., "#HEX" or "rgb(r,g,b)")
                            if (player.color) {
                                cellDiv.style.backgroundColor = player.color;
                            }
                        } else {
                            // Empty cell - keep default dark grey
                            cellDiv.textContent = 'Empty'; // Or leave blank for true empty
                        }
                        columnDiv.appendChild(cellDiv);
                    }
                    rosterGrid.appendChild(columnDiv);
                }

                // Update event title with the actual title from rosterData if available
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