// public/roster.js

document.addEventListener('DOMContentLoaded', async () => {
    const rosterGrid = document.getElementById('roster-grid');
    const rosterEventTitle = document.getElementById('roster-event-title');
    const compToolButton = document.getElementById('comp-tool-button');
    const revertButton = document.getElementById('revert-roster-button');

    const pathParts = window.location.pathname.split('/');
    const eventKeywordIndex = pathParts.indexOf('event');
    const eventId = (eventKeywordIndex !== -1 && pathParts.length > eventKeywordIndex + 1) ? pathParts[eventKeywordIndex + 1] : null;

    if (!eventId) {
        rosterGrid.innerHTML = '<p>Error: Event ID not found in URL.</p>';
        return;
    }

    if (compToolButton) {
        compToolButton.href = `https://raid-helper.dev/raidplan/${eventId}`;
    }

    let isManaged = false;
    let specData = {};
    let initialRosterSnapshot = {};

    try {
        const response = await fetch('/api/specs');
        specData = await response.json();
    } catch (error) {
        console.error('Failed to load spec data:', error);
    }

    async function renderRoster() {
        rosterEventTitle.textContent = `Roster for Event ID: ${eventId} (Loading...)`;
        try {
            const rosterData = await fetchRoster(eventId);
            isManaged = rosterData.isManaged;

            if (Object.keys(initialRosterSnapshot).length === 0 && !isManaged) {
                rosterData.raidDrop.forEach(p => {
                    if (p.userid) {
                        initialRosterSnapshot[p.userid] = p.mainCharacterName || p.name;
                    }
                });
            }

            updateRevertButtonVisibility();
            renderGrid(rosterData);
        } catch (error) {
            rosterGrid.innerHTML = `<p>Error fetching roster: ${error.message}</p>`;
        }
    }

    function renderGrid(rosterData) {
        const { raidDrop, partyPerRaid, slotPerParty, partyNames, title } = rosterData;
        rosterGrid.style.gridTemplateColumns = `repeat(${partyPerRaid}, 1fr)`;
        rosterGrid.innerHTML = '';
        
        const rosterMatrix = Array(partyPerRaid).fill(null).map(() => Array(slotPerParty).fill(null));
        raidDrop.forEach(p => {
            if (p.partyId >= 1 && p.partyId <= partyPerRaid && p.slotId >= 1 && p.slotId <= slotPerParty) {
                rosterMatrix[p.partyId - 1][p.slotId - 1] = p;
            }
        });

        for (let i = 0; i < partyPerRaid; i++) {
            const columnDiv = document.createElement('div');
            columnDiv.classList.add('roster-column');
            if (partyNames && partyNames[i]) {
                const partyName = document.createElement('div');
                partyName.classList.add('party-name');
                partyName.textContent = partyNames[i];
                columnDiv.appendChild(partyName);
            }

            for (let j = 0; j < slotPerParty; j++) {
                const cellDiv = document.createElement('div');
                cellDiv.classList.add('roster-cell');
                const player = rosterMatrix[i][j];

                if (player && player.name) {
                    cellDiv.classList.add('player-filled');
                    const displayName = player.mainCharacterName || player.name;
                    const nameClass = player.mainCharacterName ? 'player-name' : 'player-name unregistered-name';

                    let specIconHTML = '';
                    if (player.spec_emote) {
                        specIconHTML = `<img src="https://cdn.discordapp.com/emojis/${player.spec_emote}.png" class="spec-icon">`;
                    }
                    
                    let dropdownContentHTML = `<div class="dropdown-item"><b>Signed up as:</b> ${player.name}</div>`;
                    
                    // --- Actions Section ---
                    dropdownContentHTML += '<div class="dropdown-header">Actions</div>';
                    
                    const canonicalClass = getCanonicalClass(player.class);
                    const specsForClass = specData[canonicalClass] || [];
                    if (specsForClass.length > 0) {
                        let specSubmenuHTML = '<div class="spec-submenu">';
                        specsForClass.forEach(spec => {
                            specSubmenuHTML += `<div class="dropdown-item" data-action="swap-spec" data-userid="${player.userid}" data-spec-name="${spec.name}">${spec.name}</div>`;
                        });
                        specSubmenuHTML += '</div>';
                        dropdownContentHTML += `<div class="dropdown-item has-submenu"><i class="fas fa-magic menu-icon"></i>Swap Spec ${specSubmenuHTML}</div>`;
                    }

                    const initialName = initialRosterSnapshot[player.userid];
                    if (isManaged && player.mainCharacterName !== initialName) {
                        dropdownContentHTML += `<div class="dropdown-item" data-action="revert-char" data-userid="${player.userid}"><i class="fas fa-undo menu-icon"></i>Revert to Original</div>`;
                    }

                    // --- Alts Section ---
                    if (player.altCharacters && player.altCharacters.length > 0) {
                        dropdownContentHTML += '<div class="dropdown-separator"></div>';
                        dropdownContentHTML += '<div class="dropdown-header">Switch to Alt</div>';
                        
                        dropdownContentHTML += player.altCharacters.map(alt => {
                            const iconHtml = alt.icon ? `<img src="https://cdn.discordapp.com/emojis/${alt.icon}.png" class="menu-icon">` : '<i class="fas fa-user menu-icon"></i>';
                            const colorStyle = alt.color ? `style="color: rgb(${alt.color});"` : '';
                            return `<div class="dropdown-item" data-action="swap-char" data-userid="${player.userid}" data-alt-name="${alt.name}" data-alt-class="${alt.class}">${iconHtml}<span ${colorStyle}>${alt.name}</span></div>`;
                        }).join('');
                    }

                    cellDiv.innerHTML = `
                        <div class="${nameClass}" data-character-name="${displayName}" data-discord-name="${player.name}">${specIconHTML}<span>${displayName}</span></div>
                        <div class="dropdown-toggle"><i class="fas fa-chevron-down"></i></div>
                        <div class="player-details-dropdown">${dropdownContentHTML}</div>`;

                    if (player.color) {
                        const color = player.color;
                        if (typeof color === 'string' && color.includes(',')) { // RGB color
                            cellDiv.style.backgroundColor = `rgb(${color})`;
                            const rgb = color.split(',').map(Number);
                            const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
                            cellDiv.style.color = brightness < 128 ? 'white' : 'black';
                        } else { // Handle hex or other color formats
                            cellDiv.style.backgroundColor = color;
                            // A robust solution for text color on any background is complex,
                            // but we can default to black or white based on a simple hex check.
                            const hexColor = color.startsWith('#') ? color.substring(1) : color;
                            const r = parseInt(hexColor.substr(0, 2), 16);
                            const g = parseInt(hexColor.substr(2, 2), 16);
                            const b = parseInt(hexColor.substr(4, 2), 16);
                            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                            cellDiv.style.color = brightness < 128 ? 'white' : 'black';
                        }
                    }
                } else {
                    cellDiv.innerHTML = '<div class="player-name">Empty</div>';
                }
                columnDiv.appendChild(cellDiv);
            }
            rosterGrid.appendChild(columnDiv);
        }

        if (title) {
            rosterEventTitle.textContent = title;
        }
        setupEventListeners();
    }

    function setupEventListeners() {
        document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const dropdown = toggle.nextElementSibling;
                document.querySelectorAll('.player-details-dropdown').forEach(d => {
                    if (d !== dropdown) d.classList.remove('show');
                });
                dropdown.classList.toggle('show');
            });
        });

        document.querySelectorAll('[data-action="swap-char"]').forEach(item => {
            item.addEventListener('click', async (e) => {
                const { userid, altName, altClass } = e.currentTarget.dataset;
                try {
                    // Ensure the API call is awaited and handles the response
                    const result = await updatePlayerCharacter(eventId, userid, altName, altClass);
                    console.log('Update successful:', result.message);
                    renderRoster(); // Re-render to show changes
                } catch (error) {
                    console.error('Failed to swap character:', error);
                    alert(`Error swapping character: ${error.message}`);
                }
            });
        });

        document.querySelectorAll('[data-action="revert-char"]').forEach(item => {
            item.addEventListener('click', async (e) => {
                const { userid } = e.currentTarget.dataset;
                try {
                    // Pass null to signal a revert to the original character
                    const result = await updatePlayerCharacter(eventId, userid, null, null);
                    console.log('Revert successful:', result.message);
                    renderRoster();
                } catch (error) {
                    console.error('Failed to revert character:', error);
                    alert(`Error reverting character: ${error.message}`);
                }
            });
        });

        document.querySelectorAll('[data-action="swap-spec"]').forEach(item => {
            item.addEventListener('click', async (e) => {
                const { userid, specName } = e.currentTarget.dataset;
                try {
                    await updatePlayerSpec(eventId, userid, specName);
                    renderRoster();
                } catch (error) {
                    console.error('Failed to swap spec:', error);
                    alert(`Error swapping spec: ${error.message}`);
                }
            });
        });
    }

    function getCanonicalClass(className) {
        if (!className) return 'unknown';
        const lower = className.toLowerCase();
        if (lower.includes('death knight')) return 'death knight';
        if (lower.includes('druid')) return 'druid';
        if (lower.includes('hunter')) return 'hunter';
        if (lower.includes('mage')) return 'mage';
        if (lower.includes('paladin')) return 'paladin';
        if (lower.includes('priest')) return 'priest';
        if (lower.includes('rogue')) return 'rogue';
        if (lower.includes('shaman')) return 'shaman';
        if (lower.includes('warlock')) return 'warlock';
        if (lower.includes('warrior')) return 'warrior';
        return 'unknown';
    }
    
    function setupNameToggle() {
        const toggleNamesButton = document.getElementById('toggle-names-button');
        if (!toggleNamesButton) return;

        let showDiscordNames = false;

        toggleNamesButton.addEventListener('click', () => {
            showDiscordNames = !showDiscordNames;
            toggleNamesButton.classList.toggle('active', showDiscordNames);

            document.querySelectorAll('.player-name').forEach(nameDiv => {
                const span = nameDiv.querySelector('span');
                if (span) {
                    span.textContent = showDiscordNames 
                        ? nameDiv.dataset.discordName 
                        : nameDiv.dataset.characterName;
                }
            });

            toggleNamesButton.innerHTML = showDiscordNames
                ? '<i class="fas fa-user-check"></i> Show Char Names'
                : '<i class="fas fa-user-secret"></i> Show Disc Names';
        });
    }

    function updateRevertButtonVisibility() {
        revertButton.style.display = isManaged ? 'inline-flex' : 'none';
    }

    revertButton.addEventListener('click', async () => {
        if (confirm('Are you sure you want to revert to the unmanaged roster? All local changes will be lost.')) {
            try {
                await revertToUnmanaged(eventId);
                isManaged = false;
                updateRevertButtonVisibility();
                renderRoster();
            } catch (error) {
                alert(`Failed to revert: ${error.message}`);
            }
        }
    });

    window.addEventListener('click', () => {
        document.querySelectorAll('.player-details-dropdown.show').forEach(d => d.classList.remove('show'));
    });

    renderRoster();
    setupNameToggle();
});