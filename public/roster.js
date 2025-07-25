// public/roster.js
document.addEventListener('DOMContentLoaded', async () => {
    console.log('roster.js: DOMContentLoaded event fired. Script is running.'); // DEBUG LOG 1

    const rosterGrid = document.getElementById('roster-grid');
    const rosterEventTitle = document.getElementById('roster-event-title');
    const compToolButton = document.getElementById('comp-tool-button');

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

    // Set the href for the Comp-tool button
    if (compToolButton) {
        compToolButton.href = `https://raid-helper.dev/raidplan/${eventId}`;
    }

    console.log(`roster.js: Successfully parsed Event ID from URL: ${eventId}`);

    rosterEventTitle.textContent = `Roster for Event ID: ${eventId} (Loading...)`;
    
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

                        const isRegistered = player.mainCharacterName && player.mainCharacterName !== 'No match';
                        const displayName = isRegistered ? player.mainCharacterName : player.name;
                        const nameClass = isRegistered ? 'player-name' : 'player-name unregistered-name';

                        let specIconHTML = '';
                        if (player.spec_emote) {
                            specIconHTML = `<img src="https://cdn.discordapp.com/emojis/${player.spec_emote}.png" class="spec-icon" alt="${player.spec}" title="${player.spec}">`;
                        }

                        // Build the dropdown content first
                        let dropdownContentHTML = `<div class="dropdown-item"><b>Signed up as:</b> ${player.name}</div>`;
                        dropdownContentHTML += `<div class="dropdown-item"><b>Discord ID:</b> ${player.userid || 'N/A'}</div>`;
                        if (player.altCharacters && player.altCharacters.length > 0) {
                            dropdownContentHTML += player.altCharacters.map(alt => `<div class="dropdown-item alt-char">${alt}</div>`).join('');
                        }

                        // Build the final cell HTML
                        cellDiv.innerHTML = `
                            <div class="${nameClass}" data-character-name="${displayName}" data-discord-name="${player.name}">${specIconHTML}<span>${displayName}</span></div>
                            <div class="dropdown-toggle"><i class="fas fa-chevron-down"></i></div>
                            <div class="player-details-dropdown">${dropdownContentHTML}</div>
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

            // Add event listeners to all new dropdown toggles
            document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
                toggle.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent the click from bubbling up
                    const dropdown = toggle.nextElementSibling;
                    const allDropdowns = document.querySelectorAll('.player-details-dropdown');
                    
                    // Close all other dropdowns
                    allDropdowns.forEach(d => {
                        if (d !== dropdown) {
                            d.classList.remove('show');
                        }
                    });

                    // Toggle the clicked one
                    dropdown.classList.toggle('show');
                });
            });

            const toggleNamesButton = document.getElementById('toggle-names-button');
            if (toggleNamesButton) {
                let showDiscordNames = false;
                toggleNamesButton.addEventListener('click', () => {
                    showDiscordNames = !showDiscordNames;
                    toggleNamesButton.classList.toggle('active', showDiscordNames);
                    
                    document.querySelectorAll('.player-name').forEach(nameDiv => {
                        const span = nameDiv.querySelector('span');
                        if (span) {
                            if (showDiscordNames) {
                                span.textContent = nameDiv.dataset.discordName;
                            } else {
                                span.textContent = nameDiv.dataset.characterName;
                            }
                        }
                    });

                    if (showDiscordNames) {
                        toggleNamesButton.innerHTML = '<i class="fas fa-user-check"></i> Show char names';
                    } else {
                        toggleNamesButton.innerHTML = '<i class="fas fa-user-secret"></i> Show disc names';
                    }
                });
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

    // Close dropdowns if clicking outside
    window.addEventListener('click', () => {
        document.querySelectorAll('.player-details-dropdown.show').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    });
});