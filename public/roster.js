// public/roster.js

document.addEventListener('DOMContentLoaded', async () => {
    const rosterGrid = document.getElementById('roster-grid');
    const rosterEventTitle = document.getElementById('roster-event-title');
    const compToolButton = document.getElementById('comp-tool-button');
    const revertButton = document.getElementById('revert-roster-button');
    const benchContainer = document.getElementById('bench-container');
    const benchedList = document.getElementById('benched-list');

    const pathParts = window.location.pathname.split('/');
    const eventKeywordIndex = pathParts.indexOf('event');
    const eventId = (eventKeywordIndex !== -1 && pathParts.length > eventKeywordIndex + 1) ? pathParts[eventKeywordIndex + 1] : null;

    if (!eventId) {
        rosterGrid.innerHTML = '<p>Error: Event ID not found in URL.</p>';
        return;
    }

    // Set active event session in localStorage when visiting roster directly
    localStorage.setItem('activeEventSession', eventId);
    console.log('🎯 Set active event session from roster page:', eventId);
    
    // Update raid bar if function is available
    if (typeof updateRaidBar === 'function') {
        updateRaidBar();
    }

    if (compToolButton) {
        compToolButton.href = `https://raid-helper.dev/raidplan/${eventId}`;
    }

    let isManaged = false;
    let specData = {};
    let currentRosterData = {};
    let playerCharacterHistory = {}; // Track all characters each player has used
    let playerCharacterDetails = {}; // Track class info for each character

    // Add utility functions for optimistic updates
    const OptimisticUpdates = {
        // Find a player cell by userid
        findPlayerCell(userid) {
            const cells = document.querySelectorAll('.roster-cell.player-filled');
            for (let cell of cells) {
                const nameDiv = cell.querySelector('.player-name');
                if (nameDiv && nameDiv.dataset.discordName) {
                    // We need to find by userid, but we only have discord name in DOM
                    // Let's check if this player matches by finding them in currentRosterData
                    const player = currentRosterData.raidDrop?.find(p => p && p.userid === userid);
                    if (player && nameDiv.dataset.discordName === player.name) {
                        return cell;
                    }
                }
            }
            // Also check bench
            const benchCells = document.querySelectorAll('#benched-list .roster-cell.player-filled');
            for (let cell of benchCells) {
                const nameDiv = cell.querySelector('.player-name');
                if (nameDiv && nameDiv.dataset.discordName) {
                    const player = currentRosterData.bench?.find(p => p && p.userid === userid);
                    if (player && nameDiv.dataset.discordName === player.name) {
                        return cell;
                    }
                }
            }
            return null;
        },

        // Update a specific cell with new player data
        async updatePlayerCell(cell, newPlayerData, isBenched = false) {
            if (!cell || !newPlayerData) return;

            // First, ensure the cell has the proper class for filled cells
            cell.classList.add('player-filled');

            const displayName = newPlayerData.mainCharacterName || newPlayerData.name;
            const nameClass = newPlayerData.mainCharacterName ? 'player-name' : 'player-name unregistered-name';
            const specIconHTML = newPlayerData.spec_emote ? `<img src="https://cdn.discordapp.com/emojis/${newPlayerData.spec_emote}.png" class="spec-icon">` : '';
            
            // Check if player is absent for bench display
            const discordAbsentEmoji = "612343589070045200";
            const isAbsent = newPlayerData.spec_emote === discordAbsentEmoji;
            if (isAbsent && isBenched) {
                cell.classList.add('absent-player');
            } else {
                cell.classList.remove('absent-player');
            }

            // Add confirmation status indicator
            let confirmationIconHTML = '';
            if (newPlayerData.isConfirmed === "confirmed" || newPlayerData.isConfirmed === true) {
                confirmationIconHTML = '<i class="fas fa-check confirmation-icon confirmed" title="Confirmed"></i>';
            } else {
                confirmationIconHTML = '<i class="fas fa-times confirmation-icon unconfirmed" title="Not Confirmed"></i>';
            }

            let dropdownContentHTML = await buildDropdownContent(newPlayerData, isBenched);

            cell.innerHTML = `
                <div class="${nameClass}" data-character-name="${displayName}" data-discord-name="${newPlayerData.name}">${specIconHTML}${confirmationIconHTML}<span>${displayName}</span></div>
                <div class="player-details-dropdown">${dropdownContentHTML}</div>`;

            applyPlayerColor(cell, newPlayerData.color);
            
            // Re-attach event listeners for this specific cell
            const updatedCell = this.attachCellEventListeners(cell);
            return updatedCell; // Return the updated cell reference
        },

        // Move player cell to a new position optimistically
        movePlayerToPosition(userid, targetPartyId, targetSlotId) {
            const sourceCell = this.findPlayerCell(userid);
            if (!sourceCell) return false;

            // Find target cell in roster grid
            const columns = document.querySelectorAll('.roster-column');
            if (targetPartyId < 1 || targetPartyId > columns.length) return false;
            
            const targetColumn = columns[targetPartyId - 1];
            const cells = targetColumn.querySelectorAll('.roster-cell');
            if (targetSlotId < 1 || targetSlotId > cells.length) return false; // cells array is 0-indexed, slots are 1-indexed
            
            const targetCell = cells[targetSlotId - 1]; // Convert 1-indexed slot to 0-indexed array

            // Get player data BEFORE any updates to avoid timing issues
            // Check both roster and bench for the moving player
            let movingPlayer = currentRosterData.raidDrop.find(p => p && p.userid === userid);
            let isMovingFromBench = false;
            
            if (!movingPlayer) {
                movingPlayer = currentRosterData.bench?.find(p => p && p.userid === userid);
                isMovingFromBench = true;
            }
            
            const targetPlayerInOriginalPos = currentRosterData.raidDrop.find(p => 
                p && p.partyId === parseInt(targetPartyId) && p.slotId === parseInt(targetSlotId));

            if (!movingPlayer) {
                console.error('Moving player not found in roster or bench:', userid);
                return false;
            }

            // Move operation starting (debug details removed)

            // Add moving animation
            sourceCell.classList.add('moving');
            if (targetCell.classList.contains('player-filled')) {
                targetCell.classList.add('moving');
            }

            // Store original content for potential rollback
            const sourceOriginalContent = sourceCell.innerHTML;
            const targetOriginalContent = targetCell.innerHTML;
            
            // Handle data updates based on source location
            if (isMovingFromBench) {
                // Moving from bench to roster
                // Remove from bench array
                const benchIndex = currentRosterData.bench.findIndex(p => p && p.userid === userid);
                if (benchIndex !== -1) {
                    currentRosterData.bench.splice(benchIndex, 1);
                }
                
                // Set roster position for the moving player
                movingPlayer.partyId = parseInt(targetPartyId);
                movingPlayer.slotId = parseInt(targetSlotId);
                
                // Add to roster array
                currentRosterData.raidDrop.push(movingPlayer);
                
                // If there's a target player, move them to bench
                if (targetPlayerInOriginalPos) {
                    // Remove target from roster
                    const targetIndex = currentRosterData.raidDrop.findIndex(p => p && p.userid === targetPlayerInOriginalPos.userid);
                    if (targetIndex !== -1) {
                        currentRosterData.raidDrop.splice(targetIndex, 1);
                    }
                    
                    // Clear target player's position data and add to bench
                    delete targetPlayerInOriginalPos.partyId;
                    delete targetPlayerInOriginalPos.slotId;
                    currentRosterData.bench.push(targetPlayerInOriginalPos);
                }
            } else {
                // Moving within roster (existing logic)
                // Store original positions before updating
                const originalPartyId = movingPlayer.partyId;
                const originalSlotId = movingPlayer.slotId;

                // Update positions in data immediately
                movingPlayer.partyId = parseInt(targetPartyId);
                movingPlayer.slotId = parseInt(targetSlotId);

                if (targetPlayerInOriginalPos) {
                    targetPlayerInOriginalPos.partyId = originalPartyId;
                    targetPlayerInOriginalPos.slotId = originalSlotId;
                }
            }

            // Update the cell contents after a brief delay for animation
            setTimeout(async () => {
                try {
                    let updatedSourceCell = sourceCell;
                    let updatedTargetCell = targetCell;

                    if (isMovingFromBench) {
                        // Moving from bench to roster
                        // Moving from bench to roster
                        
                        // Remove player from bench visually (sourceCell is in bench)
                        sourceCell.remove();
                        
                        // Update target cell with moving player
                        updatedTargetCell = await this.updatePlayerCell(targetCell, movingPlayer, false);
                        
                        // If there was a target player, add them to bench
                        if (targetPlayerInOriginalPos) {
                            // Player displaced to bench
                            // Show bench container if it was hidden
                            document.getElementById('bench-container').style.display = 'block';
                            await this.createBenchCell(targetPlayerInOriginalPos);
                        }
                        
                        // Hide bench if it's now empty
                        if (currentRosterData.bench.length === 0) {
                            document.getElementById('bench-container').style.display = 'none';
                        }
                        
                        updatedSourceCell = null; // No source cell to update
                    } else {
                        // Moving within roster (existing logic)
                        // Rebuild source cell
                        if (targetPlayerInOriginalPos) {
                            // There was a player in target - they go to source position
                            // Updating source cell
                            updatedSourceCell = await this.updatePlayerCell(sourceCell, targetPlayerInOriginalPos, false);
                                            } else {
                        // Target was empty - source becomes empty, restore empty slot functionality
                                                    // Making source cell empty
                        sourceCell.classList.remove('player-filled');
                        sourceCell.classList.add('empty-slot-clickable');
                        
                        // Figure out the party and slot IDs for this cell
                        const sourcePartyId = movingPlayer.partyId;
                        const sourceSlotId = movingPlayer.slotId;
                        const emptyDropdownContent = buildEmptySlotDropdownContent(sourcePartyId, sourceSlotId);
                        
                        sourceCell.innerHTML = `
                            <div class="player-name">Empty</div>
                            <div class="player-details-dropdown">${emptyDropdownContent}</div>`;
                        sourceCell.style.backgroundColor = '#777';
                        sourceCell.style.color = '';
                        
                        // Attach empty slot event listeners after a brief delay to ensure DOM is updated
                        setTimeout(() => {
                            if (sourceCell && sourceCell.parentNode) {
                                const updatedCell = attachEmptySlotListeners(sourceCell);
                                // updatedSourceCell is now the new cell reference
                                updatedSourceCell = updatedCell;
                            }
                        }, 10);
                    }

                        // Rebuild target cell with moving player
                        // Updating target cell with moving player
                        updatedTargetCell = await this.updatePlayerCell(targetCell, movingPlayer, false);
                    }

                    // Remove animation classes from the updated cell references
                    if (updatedSourceCell) {
                        updatedSourceCell.classList.remove('moving');
                    }
                    updatedTargetCell.classList.remove('moving');
                    
                    // Refresh all dropdown content to reflect current positions
                    await this.refreshAllDropdownContent();
                    
                    // Move visual update completed
                } catch (error) {
                    console.error('Error during visual update:', error);
                }
            }, 150);

            return { sourceOriginalContent, targetOriginalContent, sourceCell, targetCell };
        },

        // Move player to bench optimistically
        moveToBench(userid) {
            const sourceCell = this.findPlayerCell(userid);
            if (!sourceCell) return false;

            // Find the player data
            const playerIndex = currentRosterData.raidDrop.findIndex(p => p && p.userid === userid);
            if (playerIndex === -1) return false;

            const playerData = currentRosterData.raidDrop[playerIndex];
            
            // Store original for rollback
            const originalContent = sourceCell.innerHTML;
            const originalPosition = { partyId: playerData.partyId, slotId: playerData.slotId };

            // Add moving-to-bench animation
            sourceCell.classList.add('moving-to-bench');

            // Update source cell to empty after animation delay
            const self = this; // Capture 'this' reference for setTimeout
            setTimeout(() => {
                sourceCell.classList.remove('player-filled', 'moving-to-bench');
                sourceCell.classList.add('empty-slot-clickable');
                
                // Find the party and slot IDs for this cell by looking at its position in the grid
                const column = sourceCell.closest('.roster-column');
                const allColumns = Array.from(document.querySelectorAll('.roster-column'));
                const partyId = allColumns.indexOf(column) + 1;
                
                const cellsInColumn = Array.from(column.querySelectorAll('.roster-cell'));
                const slotId = cellsInColumn.indexOf(sourceCell) + 1;
                
                const emptyDropdownContent = buildEmptySlotDropdownContent(partyId, slotId);
                sourceCell.innerHTML = `
                    <div class="player-name">Empty</div>
                    <div class="player-details-dropdown">${emptyDropdownContent}</div>`;
                sourceCell.style.backgroundColor = '#777'; // Default empty cell color
                sourceCell.style.color = '';
                
                // Attach empty slot event listeners after a brief delay to ensure DOM is updated
                setTimeout(() => {
                    if (sourceCell && sourceCell.parentNode) {
                        attachEmptySlotListeners(sourceCell);
                    }
                }, 10);
            }, 200);

            // Add to bench visually
            const benchContainer = document.getElementById('bench-container');
            const benchedList = document.getElementById('benched-list');
            
            if (!currentRosterData.bench) currentRosterData.bench = [];
            currentRosterData.bench.push(playerData);
            
            // Remove from roster data
            currentRosterData.raidDrop.splice(playerIndex, 1);

            // Show bench if hidden
            benchContainer.style.display = 'block';

            // Create new bench cell with delay
            setTimeout(() => {
                this.createBenchCell(playerData);
            }, 300);

            return { originalContent, originalPosition, sourceCell, playerData };
        },

        // Create a new cell in the bench
        async createBenchCell(playerData) {
            const benchedList = document.getElementById('benched-list');
            const discordAbsentEmoji = "612343589070045200";
            const isAbsent = playerData.spec_emote === discordAbsentEmoji;
            
            const cellDiv = await createPlayerCell(playerData, true, isAbsent);
            benchedList.appendChild(cellDiv);
            
            this.attachCellEventListeners(cellDiv);
            return cellDiv;
        },

        // Update player spec optimistically
        async updatePlayerSpec(userid, newSpecName) {
            const cell = this.findPlayerCell(userid);
            if (!cell) return false;

            // Find player in data
            let playerData = currentRosterData.raidDrop?.find(p => p && p.userid === userid);
            if (!playerData) {
                playerData = currentRosterData.bench?.find(p => p && p.userid === userid);
            }
            if (!playerData) return false;

            // Store original for rollback
            const originalSpecEmote = playerData.spec_emote;

            // Add spec changing animation
            cell.classList.add('spec-changing');

            // Find new spec data
            const canonicalClass = getCanonicalClass(playerData.class);
            const specsForClass = specData[canonicalClass] || [];
            const newSpec = specsForClass.find(spec => spec.name === newSpecName);
            
            if (newSpec) {
                // Update the data immediately
                playerData.spec_emote = newSpec.emote;
                
                // Update the cell after animation delay
                setTimeout(async () => {
                    const isBenched = cell.closest('#benched-list') !== null;
                    const updatedCell = await this.updatePlayerCell(cell, playerData, isBenched);
                    updatedCell.classList.remove('spec-changing');
                    updatedCell.classList.add('success-update');
                    
                    // Refresh all dropdown content to reflect current state
                    await this.refreshAllDropdownContent();
                    
                    // Remove success animation
                    setTimeout(() => {
                        updatedCell.classList.remove('success-update');
                    }, 600);
                }, 250);

                return { originalSpecEmote, playerData };
            }
            return false;
        },

        // Update player character optimistically
        async updatePlayerCharacter(userid, newCharacterName, newCharacterClass) {
            const cell = this.findPlayerCell(userid);
            if (!cell) return false;

            // Find player in data
            let playerData = currentRosterData.raidDrop?.find(p => p && p.userid === userid);
            if (!playerData) {
                playerData = currentRosterData.bench?.find(p => p && p.userid === userid);
            }
            if (!playerData) return false;

            // Store original for rollback
            const originalData = {
                mainCharacterName: playerData.mainCharacterName,
                class: playerData.class,
                spec_emote: playerData.spec_emote,
                color: playerData.color
            };

            // Add character swapping animation
            cell.classList.add('character-swapping');

            // Update player data
            playerData.mainCharacterName = newCharacterName;
            playerData.class = newCharacterClass;
            
            // Update color based on new class
            const canonicalClass = getCanonicalClass(newCharacterClass);
            playerData.color = getClassColor(canonicalClass);

            // Reset spec to a default for the new class
            const specsForClass = specData[canonicalClass] || [];
            if (specsForClass.length > 0) {
                playerData.spec_emote = specsForClass[0].emote;
            }

            // Update the cell after animation delay
            setTimeout(async () => {
                const isBenched = cell.closest('#benched-list') !== null;
                const updatedCell = await this.updatePlayerCell(cell, playerData, isBenched);
                updatedCell.classList.remove('character-swapping');
                updatedCell.classList.add('success-update');
                
                // Refresh all dropdown content to reflect current state
                await this.refreshAllDropdownContent();
                
                // Remove success animation
                setTimeout(() => {
                    updatedCell.classList.remove('success-update');
                }, 600);
            }, 300);

            return { originalData, playerData };
        },

        // Refresh dropdown content for all player cells to reflect current positions
        async refreshAllDropdownContent() {
            // Update roster cells
            const rosterCells = document.querySelectorAll('.roster-cell.player-filled');
            for (const cell of rosterCells) {
                const nameDiv = cell.querySelector('.player-name');
                if (nameDiv && nameDiv.dataset.discordName) {
                    // Find the player data for this cell
                    let playerData = currentRosterData.raidDrop?.find(p => p && p.name === nameDiv.dataset.discordName);
                    if (playerData) {
                        const dropdownDiv = cell.querySelector('.player-details-dropdown');
                        if (dropdownDiv) {
                            const isBenched = cell.closest('#benched-list') !== null;
                            dropdownDiv.innerHTML = await buildDropdownContent(playerData, isBenched);
                        }
                    }
                }
            }

            // Update bench cells
            const benchCells = document.querySelectorAll('#benched-list .roster-cell.player-filled');
            for (const cell of benchCells) {
                const nameDiv = cell.querySelector('.player-name');
                if (nameDiv && nameDiv.dataset.discordName) {
                    // Find the player data for this cell
                    let playerData = currentRosterData.bench?.find(p => p && p.name === nameDiv.dataset.discordName);
                    if (playerData) {
                        const dropdownDiv = cell.querySelector('.player-details-dropdown');
                        if (dropdownDiv) {
                            dropdownDiv.innerHTML = await buildDropdownContent(playerData, true);
                        }
                    }
                }
            }

            // Re-attach dropdown listeners to all cells
            document.querySelectorAll('.roster-cell.player-filled').forEach(cell => {
                this.attachDropdownListeners(cell);
            });
        },

        // Attach event listeners to a specific cell
        attachCellEventListeners(cell) {
            if (!cell.classList.contains('player-filled')) return cell;

            // Remove existing listeners by cloning the node
            const newCell = cell.cloneNode(true);
            if (cell.parentNode) {
                cell.parentNode.replaceChild(newCell, cell);
            } else {
                console.warn('Cell has no parent node, cannot replace');
                return cell;
            }

            // Add click listener for dropdown
            newCell.addEventListener('click', (e) => {
                e.stopPropagation();
                const dropdown = newCell.querySelector('.player-details-dropdown');
                document.querySelectorAll('.player-details-dropdown').forEach(d => {
                    if (d !== dropdown) d.classList.remove('show');
                });
                dropdown.classList.toggle('show');
            });

            // Add listeners for dropdown actions
            this.attachDropdownListeners(newCell);
            
            return newCell; // Return the new cell reference
        },



        // Attach dropdown action listeners
        attachDropdownListeners(cell) {
            // Move player actions
            cell.querySelectorAll('[data-action="move-player"]:not(.disabled)').forEach(item => {
                item.addEventListener('click', async (e) => {
                    const { userid, targetParty, targetSlot } = e.currentTarget.dataset;
                    
                    // Optimistic update
                    const rollbackInfo = this.movePlayerToPosition(userid, targetParty, targetSlot);
                    
                    try {
                        await updatePlayerPosition(eventId, userid, targetParty, targetSlot);
                        // Success - update was already applied optimistically
                        isManaged = true; // Mark roster as managed
                        updateRevertButtonVisibility(); // Show revert button
                        const cell = this.findPlayerCell(userid);
                        if (cell) {
                            cell.classList.add('success-update');
                            setTimeout(() => cell.classList.remove('success-update'), 600);
                        }
                    } catch (error) {
                        // Rollback on error with animation
                        if (rollbackInfo) {
                            rollbackInfo.sourceCell.classList.add('error-rollback');
                            rollbackInfo.targetCell.classList.add('error-rollback');
                            
                            setTimeout(() => {
                                rollbackInfo.sourceCell.innerHTML = rollbackInfo.sourceOriginalContent;
                                rollbackInfo.targetCell.innerHTML = rollbackInfo.targetOriginalContent;
                                this.attachCellEventListeners(rollbackInfo.sourceCell);
                                this.attachCellEventListeners(rollbackInfo.targetCell);
                                
                                setTimeout(() => {
                                    rollbackInfo.sourceCell.classList.remove('error-rollback');
                                    rollbackInfo.targetCell.classList.remove('error-rollback');
                                }, 500);
                            }, 250);
                        }
                        showAlert('Move Error', `Error moving player: ${error.message}`);
                    }
                });
            });

            // Move to bench actions
            cell.querySelectorAll('[data-action="move-to-bench"]').forEach(item => {
                item.addEventListener('click', async (e) => {
                    const { userid } = e.currentTarget.dataset;
                    
                    showConfirm(
                        'Move to Bench',
                        'Are you sure you want to move this player to the bench?',
                        async () => {
                            // Optimistic update
                            const rollbackInfo = this.moveToBench(userid);
                            
                            try {
                                await movePlayerToBench(eventId, userid);
                                // Success - update was already applied optimistically
                                isManaged = true; // Mark roster as managed
                                updateRevertButtonVisibility(); // Show revert button
                            } catch (error) {
                                // Rollback on error with animation
                                if (rollbackInfo) {
                                    rollbackInfo.sourceCell.classList.add('error-rollback');
                                    
                                    setTimeout(() => {
                                        rollbackInfo.sourceCell.innerHTML = rollbackInfo.originalContent;
                                        rollbackInfo.sourceCell.classList.add('player-filled');
                                        this.attachCellEventListeners(rollbackInfo.sourceCell);
                                        
                                        // Remove from bench
                                        const benchIndex = currentRosterData.bench.findIndex(p => p && p.userid === userid);
                                        if (benchIndex !== -1) {
                                            currentRosterData.bench.splice(benchIndex, 1);
                                        }
                                        currentRosterData.raidDrop.push(rollbackInfo.playerData);
                                        
                                        setTimeout(() => {
                                            rollbackInfo.sourceCell.classList.remove('error-rollback');
                                        }, 500);
                                    }, 250);
                                }
                                showAlert('Bench Error', `Error moving player to bench: ${error.message}`);
                            }
                        }
                    );
                });
            });

            // Swap spec actions
            cell.querySelectorAll('[data-action="swap-spec"]').forEach(item => {
                item.addEventListener('click', async (e) => {
                    const { userid, specName } = e.currentTarget.dataset;
                    
                    // Optimistic update
                    const rollbackInfo = await this.updatePlayerSpec(userid, specName);
                    
                    try {
                        await updatePlayerSpec(eventId, userid, specName);
                        // Success - update was already applied optimistically (animation handled in updatePlayerSpec)
                        isManaged = true; // Mark roster as managed
                        updateRevertButtonVisibility(); // Show revert button
                    } catch (error) {
                        // Rollback on error with animation
                        if (rollbackInfo) {
                            rollbackInfo.playerData.spec_emote = rollbackInfo.originalSpecEmote;
                            const cell = this.findPlayerCell(userid);
                            if (cell) {
                                cell.classList.add('error-rollback');
                                setTimeout(async () => {
                                    const isBenched = cell.closest('#benched-list') !== null;
                                    const updatedCell = await this.updatePlayerCell(cell, rollbackInfo.playerData, isBenched);
                                    setTimeout(() => {
                                        updatedCell.classList.remove('error-rollback');
                                    }, 500);
                                }, 250);
                            }
                        }
                        showAlert('Spec Error', `Error swapping spec: ${error.message}`);
                    }
                });
            });

            // Toggle in-raid status actions
            cell.querySelectorAll('[data-action="toggle-in-raid"]').forEach(item => {
                item.addEventListener('click', async (e) => {
                    const { userid, currentStatus } = e.currentTarget.dataset;
                    const newStatus = currentStatus === 'true' ? false : true;
                    
                    try {
                        await togglePlayerInRaid(eventId, userid, newStatus);
                        
                        // Update the player data in our local state
                        const player = currentRosterData.raidDrop.find(p => p && p.userid === userid);
                        if (player) {
                            player.inRaid = newStatus;
                        }
                        
                        // Force dropdown rebuild to show updated status
                        const cell = this.findPlayerCell(userid);
                        if (cell) {
                            const dropdownDiv = cell.querySelector('.player-details-dropdown');
                            if (dropdownDiv) {
                                const isBenched = cell.closest('#benched-list') !== null;
                                const playerData = currentRosterData.raidDrop.find(p => p && p.userid === userid) || 
                                                 currentRosterData.bench?.find(p => p && p.userid === userid);
                                if (playerData) {
                                    dropdownDiv.innerHTML = await buildDropdownContent(playerData, isBenched);
                                    this.attachDropdownListeners(cell);
                                }
                            }
                        }
                        
                        // Apply visual effects for both toggles
                        applyInRaidVisibility();
                        applyConfirmedVisibility();
                        
                        isManaged = true; // Mark roster as managed
                        updateRevertButtonVisibility(); // Show revert button
                    } catch (error) {
                        showAlert('In-Raid Error', `Error toggling in-raid status: ${error.message}`);
                    }
                });
            });

            // Swap character actions
            cell.querySelectorAll('[data-action="swap-char"]:not(.disabled)').forEach(item => {
                item.addEventListener('click', async (e) => {
                    const { userid, altName, altClass } = e.currentTarget.dataset;
                    
                    // Optimistic update
                    const rollbackInfo = await this.updatePlayerCharacter(userid, altName, altClass);
                    
                    try {
                        await updatePlayerCharacter(eventId, userid, altName, altClass);
                        // Success - update was already applied optimistically (animation handled in updatePlayerCharacter)
                        isManaged = true; // Mark roster as managed
                        updateRevertButtonVisibility(); // Show revert button
                    } catch (error) {
                        // Rollback on error with animation
                        if (rollbackInfo) {
                            Object.assign(rollbackInfo.playerData, rollbackInfo.originalData);
                            const cell = this.findPlayerCell(userid);
                            if (cell) {
                                cell.classList.add('error-rollback');
                                setTimeout(async () => {
                                    const isBenched = cell.closest('#benched-list') !== null;
                                    const updatedCell = await this.updatePlayerCell(cell, rollbackInfo.playerData, isBenched);
                                    setTimeout(() => {
                                        updatedCell.classList.remove('error-rollback');
                                    }, 500);
                                }, 250);
                            }
                        }
                        showAlert('Character Swap Error', `Error swapping character: ${error.message}`);
                    }
                });
            });
        }
    };

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
            


            if (!rosterData || !rosterData.raidDrop) {
                throw new Error("Invalid or empty roster data received from server.");
            }

            currentRosterData = rosterData;
            isManaged = rosterData.isManaged;

            updateRevertButtonVisibility();
            await renderGrid(rosterData);
            await renderBench(rosterData.bench || []);
            setupEventListeners();
            setupToggleSwitches();
            setupNameToggle();
            setupHideInRaidToggle();
            setupHideBenchToggle();
            setupHideConfirmedToggle();
            setupPlayerSearchModal();
            
            // Apply all visibility effects after roster is rendered
            setTimeout(() => {
                applyInRaidVisibility();
                applyConfirmedVisibility();
            }, 100);
        } catch (error) {
            console.error('roster.js: A critical error occurred during renderRoster:', error);
            const rosterGrid = document.getElementById('roster-grid');
            rosterGrid.innerHTML = `<div style="color: #ffcccc; background-color: #3e2727; border: 1px solid #d32f2f; padding: 15px; border-radius: 5px;">
                <h3 style="margin-top: 0;">Error Rendering Roster</h3>
                <p>${error.message}</p>
                <pre style="white-space: pre-wrap; word-wrap: break-word;">${error.stack}</pre>
            </div>`;
        }
    }

    async function renderGrid(rosterData) {
        const { raidDrop, partyPerRaid, slotPerParty, partyNames, title } = rosterData;
            rosterGrid.style.gridTemplateColumns = `repeat(${partyPerRaid}, 1fr)`;
            rosterGrid.innerHTML = '';

            const rosterMatrix = Array(partyPerRaid).fill(null).map(() => Array(slotPerParty).fill(null));
        raidDrop.forEach(p => {
            if (p && p.partyId >= 1 && p.partyId <= partyPerRaid && p.slotId >= 1 && p.slotId <= slotPerParty) {
                rosterMatrix[p.partyId - 1][p.slotId - 1] = p;
                }
            });

            for (let i = 0; i < partyPerRaid; i++) {
                const columnDiv = document.createElement('div');
                columnDiv.classList.add('roster-column');
            const partyNameText = (partyNames && partyNames[i]) ? partyNames[i] : `Group ${i + 1}`;
                    const partyName = document.createElement('div');
                    partyName.classList.add('party-name');
            partyName.textContent = partyNameText;
                    columnDiv.appendChild(partyName);

                for (let j = 0; j < slotPerParty; j++) {
                    const cellDiv = document.createElement('div');
                    cellDiv.classList.add('roster-cell');
                    const player = rosterMatrix[i][j];

                    if (player && player.name) {
                        cellDiv.classList.add('player-filled');
                    const displayName = player.mainCharacterName || player.name;
                    const nameClass = player.mainCharacterName ? 'player-name' : 'player-name unregistered-name';
                    const specIconHTML = player.spec_emote ? `<img src="https://cdn.discordapp.com/emojis/${player.spec_emote}.png" class="spec-icon">` : '';
                    
                    // Add confirmation status indicator
                    let confirmationIconHTML = '';
                    if (player.isConfirmed === "confirmed" || player.isConfirmed === true) {
                        confirmationIconHTML = '<i class="fas fa-check confirmation-icon confirmed" title="Confirmed"></i>';
                    } else {
                        confirmationIconHTML = '<i class="fas fa-times confirmation-icon unconfirmed" title="Not Confirmed"></i>';
                    }

                    
                    let dropdownContentHTML = await buildDropdownContent(player, false);

                        cellDiv.innerHTML = `
                        <div class="${nameClass}" data-character-name="${displayName}" data-discord-name="${player.name}">${specIconHTML}${confirmationIconHTML}<span>${displayName}</span></div>
                        <div class="player-details-dropdown">${dropdownContentHTML}</div>`;

                    applyPlayerColor(cellDiv, player.color);
                    } else {
                        // Empty slot - make it clickable with "Add new character" option
                        cellDiv.classList.add('empty-slot-clickable');
                        const emptyDropdownContent = buildEmptySlotDropdownContent(i + 1, j + 1);
                        cellDiv.innerHTML = `
                            <div class="player-name">Empty</div>
                            <div class="player-details-dropdown">${emptyDropdownContent}</div>`;
                    }
                    columnDiv.appendChild(cellDiv);
                }
                rosterGrid.appendChild(columnDiv);
            }

        if (title) {
            rosterEventTitle.textContent = title;
        }
        // This is now called from renderRoster
        // setupEventListeners();
    }

    async function renderBench(benchData) {
        if (benchData.length > 0) {
            benchContainer.style.display = 'block';
            benchedList.innerHTML = '';

            // Sort players: real spec icons first, then Discord absent emoji last
            
            const sortedPlayers = benchData.sort((a, b) => {
                // Discord absent emoji ID from the provided URL
                const discordAbsentEmoji = "612343589070045200";
                
                // Determine if player has Discord absent emoji vs real spec icon
                const aIsAbsent = a.spec_emote === discordAbsentEmoji;
                const bIsAbsent = b.spec_emote === discordAbsentEmoji;
                
                // If one has real spec icon and one has absent emoji, real spec comes first
                if (!aIsAbsent && bIsAbsent) return -1;
                if (aIsAbsent && !bIsAbsent) return 1;
                
                return 0; // Keep original order for same category
            });

            // Display all players in the benched list (single column)
            for (const player of sortedPlayers) {
                // Players with Discord absent emoji get the additional absent icon
                const discordAbsentEmoji = "612343589070045200";
                const isAbsent = player.spec_emote === discordAbsentEmoji;
                const cellDiv = await createPlayerCell(player, true, isAbsent);
                benchedList.appendChild(cellDiv);
            }

        } else {
            benchContainer.style.display = 'none';
        }
    }

    async function createPlayerCell(player, isBenched, isAbsent = false) {
        const cellDiv = document.createElement('div');
        cellDiv.classList.add('roster-cell', 'player-filled');
        if (isAbsent) {
            cellDiv.classList.add('absent-player');
        }

        const displayName = player.mainCharacterName || player.name;
        let specIconHTML = player.spec_emote ? `<img src="https://cdn.discordapp.com/emojis/${player.spec_emote}.png" class="spec-icon">` : '';

        // Only add the extra absent icon if the player doesn't already have the Discord absent emoji as their spec icon
        if (isAbsent && player.spec_emote !== "612343589070045200") {
            specIconHTML += '<img src="https://cdn.discordapp.com/emojis/612343589070045200.png" class="spec-icon absent-icon">';
        }

        // Add confirmation status indicator
        let confirmationIconHTML = '';
        if (player.isConfirmed === "confirmed" || player.isConfirmed === true) {
            confirmationIconHTML = '<i class="fas fa-check confirmation-icon confirmed" title="Confirmed"></i>';
        } else {
            confirmationIconHTML = '<i class="fas fa-times confirmation-icon unconfirmed" title="Not Confirmed"></i>';
        }

        let dropdownContentHTML = await buildDropdownContent(player, isBenched);

        cellDiv.innerHTML = `
            <div class="player-name" data-character-name="${displayName}" data-discord-name="${player.name}">${specIconHTML}${confirmationIconHTML}<span>${displayName}</span></div>
            <div class="player-details-dropdown">${dropdownContentHTML}</div>`;

        applyPlayerColor(cellDiv, player.color);
        return cellDiv;
    }


        async function buildDropdownContent(player, isBenched) {
        let content = '<div class="dropdown-header">Actions</div>';

        let moveSubmenuHTML = '<div class="move-submenu">';
        for (let partyIdx = 0; partyIdx < currentRosterData.partyPerRaid; partyIdx++) {
            moveSubmenuHTML += `<div class="dropdown-header">${currentRosterData.partyNames[partyIdx] || `Group ${partyIdx + 1}`}</div>`;
            for (let slotIdx = 0; slotIdx < currentRosterData.slotPerParty; slotIdx++) {
                const targetPlayer = currentRosterData.raidDrop.find(p => p && p.partyId === partyIdx + 1 && p.slotId === slotIdx + 1);
                const targetLabel = targetPlayer ? `Swap with ${targetPlayer.mainCharacterName || targetPlayer.name}` : `Slot ${slotIdx + 1} (Empty)`;
                const isDisabled = !isBenched && player.partyId === partyIdx + 1 && player.slotId === slotIdx + 1;
                moveSubmenuHTML += `<div class="dropdown-item ${isDisabled ? 'disabled' : ''}" data-action="move-player" data-userid="${player.userid}" data-target-party="${partyIdx + 1}" data-target-slot="${slotIdx + 1}">${targetLabel}</div>`;
            }
        }
        moveSubmenuHTML += '</div>';
        content += `<div class="dropdown-item has-submenu"><i class="fas fa-arrows-alt menu-icon"></i>${isBenched ? 'Move to Roster' : 'Move Player'} ${moveSubmenuHTML}</div>`;

        if (!isBenched) {
            content += `<div class="dropdown-item" data-action="move-to-bench" data-userid="${player.userid}"><i class="fas fa-archive menu-icon"></i>Move to Bench</div>`;
        }

        // In raid toggle for roster players (not bench players)
        if (!isBenched) {
            const inRaidIcon = player.inRaid ? 'fas fa-check-circle' : 'fas fa-circle';
            const inRaidText = player.inRaid ? 'Mark not in raid' : 'Mark in raid';
            content += `<div class="dropdown-item" data-action="toggle-in-raid" data-userid="${player.userid}" data-current-status="${player.inRaid || false}"><i class="${inRaidIcon} menu-icon"></i>${inRaidText}</div>`;
        }

        // Only show spec swap for roster players, not bench players
        if (!isBenched) {
            const canonicalClass = getCanonicalClass(player.class);
            const specsForClass = specData[canonicalClass] || [];
            if (specsForClass.length > 0) {
                let specSubmenuHTML = '<div class="spec-submenu">';
                specsForClass.forEach(spec => {
                    specSubmenuHTML += `<div class="dropdown-item" data-action="swap-spec" data-userid="${player.userid}" data-spec-name="${spec.name}">${spec.name}</div>`;
                });
                specSubmenuHTML += '</div>';
                content += `<div class="dropdown-item has-submenu"><i class="fas fa-magic menu-icon"></i>Swap Spec ${specSubmenuHTML}</div>`;
            }
        }

        

                // Build complete character list (main + alts)
        const allCharacters = [];
        const currentCharacterName = player.mainCharacterName || player.name;
        const signupName = player.name;
        
        // Initialize or update character history for this player
        if (!playerCharacterHistory[player.userid]) {
            playerCharacterHistory[player.userid] = new Set();
        }
        if (!playerCharacterDetails[player.userid]) {
            playerCharacterDetails[player.userid] = {};
        }
        
        // Track current character with its class info
        if (currentCharacterName) {
            playerCharacterHistory[player.userid].add(currentCharacterName);
            playerCharacterDetails[player.userid][currentCharacterName] = {
                class: player.class,
                icon: null,
                color: null
            };
        }
        
        // Only track the signup name if it looks like a real character name (not Discord concatenated names)
        if (signupName && !signupName.includes('/') && signupName !== currentCharacterName) {
            playerCharacterHistory[player.userid].add(signupName);
            // Don't override if we already have better class info
            if (!playerCharacterDetails[player.userid][signupName]) {
                playerCharacterDetails[player.userid][signupName] = {
                    class: player.class,
                    icon: null,
                    color: null
                };
            }
        }
        
        // Track all alt characters with their detailed info
        if (player.altCharacters && player.altCharacters.length > 0) {
            player.altCharacters.forEach(alt => {
                playerCharacterHistory[player.userid].add(alt.name);
                playerCharacterDetails[player.userid][alt.name] = {
                    class: alt.class,
                    icon: alt.icon,
                    color: alt.color
                };
            });
        }
        
        // Character list building (debug removed for cleaner logs)
        
        const existingNames = new Set();
        
        // First, add the current character (what's displayed in the roster)
        if (currentCharacterName) {
            const currentCanonicalClass = getCanonicalClass(player.class);
            allCharacters.push({
                name: currentCharacterName,
                class: player.class,
                icon: null,
                color: getClassColor(currentCanonicalClass),
                isMain: false, // We'll determine if this is main later
                isCurrent: true
            });
            existingNames.add(currentCharacterName);
        }
        
        // Add registered character from database (if different from current)
        let registeredCharacter = null;
        try {
            registeredCharacter = await getRegisteredCharacter(player.userid);
            if (registeredCharacter && !existingNames.has(registeredCharacter.characterName)) {
                const mainCanonicalClass = getCanonicalClass(registeredCharacter.characterClass);
                allCharacters.push({
                    name: registeredCharacter.characterName,
                    class: registeredCharacter.characterClass,
                    icon: null,
                    color: getClassColor(mainCanonicalClass),
                    isMain: true,
                    isCurrent: false
                });
                existingNames.add(registeredCharacter.characterName);
                playerCharacterHistory[player.userid].add(registeredCharacter.characterName);
            } else if (registeredCharacter && registeredCharacter.characterName === currentCharacterName) {
                // Current character is the registered main character
                const currentCharIndex = allCharacters.findIndex(char => char.isCurrent);
                if (currentCharIndex !== -1) {
                    allCharacters[currentCharIndex].isMain = true;
                }
            }
        } catch (error) {
            // Silently handle 404 errors for users without registered characters
            if (!error.message.includes('404') && 
                !error.message.includes('Not Found') && 
                !error.message.includes('No registered character found')) {
                console.warn(`Could not fetch registered character for ${player.userid}:`, error);
            }
        }
        
        // Add ALL characters from history with their stored class information
        playerCharacterHistory[player.userid].forEach(characterName => {
            if (!existingNames.has(characterName)) {
                const charDetails = playerCharacterDetails[player.userid][characterName];
                const characterClass = charDetails ? charDetails.class : player.class;
                const characterIcon = charDetails ? charDetails.icon : null;
                const characterColor = charDetails ? charDetails.color : null;
                
                const canonicalClass = getCanonicalClass(characterClass);
                allCharacters.push({
                    name: characterName,
                    class: characterClass,
                    icon: characterIcon,
                    color: characterColor || getClassColor(canonicalClass),
                    isMain: false,
                    isCurrent: false
                });
                existingNames.add(characterName);
            }
        });
        
        if (allCharacters.length > 1) { // Only show if there are options to switch to
            content += '<div class="dropdown-separator"></div><div class="dropdown-header">Switch Character</div>';
            content += allCharacters.map(char => {
                const iconHtml = char.icon ? `<img src="https://cdn.discordapp.com/emojis/${char.icon}.png" class="menu-icon">` : '<i class="fas fa-user menu-icon"></i>';
                const colorStyle = char.color ? `style="color: rgb(${char.color});"` : '';
                const disabledClass = char.isCurrent ? ' disabled' : '';
                const itemText = char.isCurrent ? `${char.name} (Current)` : char.name;
                
                return `<div class="dropdown-item${disabledClass}" data-action="swap-char" data-userid="${player.userid}" data-alt-name="${char.name}" data-alt-class="${char.class}">${iconHtml}<span ${colorStyle}>${itemText}</span></div>`;
            }).join('');
        }
        return content;
    }

    function buildEmptySlotDropdownContent(partyId, slotId) {
        return `
            <div class="dropdown-header">Actions</div>
            <div class="dropdown-item" data-action="add-new-character" data-target-party="${partyId}" data-target-slot="${slotId}">
                <i class="fas fa-plus menu-icon"></i>Add New Character
            </div>
            <div class="dropdown-item" data-action="add-existing-player" data-target-party="${partyId}" data-target-slot="${slotId}">
                <i class="fas fa-search menu-icon"></i>Add Existing Player
            </div>
        `;
    }

    function applyPlayerColor(cellDiv, color) {
        if (!color) return;
        if (typeof color === 'string' && color.includes(',')) {
            cellDiv.style.backgroundColor = `rgb(${color})`;
            const rgb = color.split(',').map(Number);
            cellDiv.style.color = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 < 128 ? 'white' : 'black';
        } else {
            cellDiv.style.backgroundColor = color;
            const hexColor = color.startsWith('#') ? color.substring(1) : color;
            if (hexColor.length === 6) {
                const r = parseInt(hexColor.substr(0, 2), 16);
                const g = parseInt(hexColor.substr(2, 2), 16);
                const b = parseInt(hexColor.substr(4, 2), 16);
                cellDiv.style.color = (r * 299 + g * 587 + b * 114) / 1000 < 128 ? 'white' : 'black';
            }
        }
    }

    function attachEmptySlotListeners(cell) {
        // This function replicates the exact logic from setupEventListeners for a single empty slot
        
        // IMPORTANT: Remove any existing listeners first to prevent duplicates
        const newCell = cell.cloneNode(true);
        if (cell.parentNode) {
            cell.parentNode.replaceChild(newCell, cell);
        } else {
            console.warn('Empty slot cell has no parent node, cannot replace');
            return cell;
        }
        
        newCell.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = newCell.querySelector('.player-details-dropdown');
            
            document.querySelectorAll('.player-details-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.remove('show');
            });
            
            if (dropdown) {
                dropdown.classList.toggle('show');
            }
        });

        // Add listener for "Add new character" action
        const addCharacterItem = newCell.querySelector('[data-action="add-new-character"]');
        
        if (addCharacterItem) {
            addCharacterItem.addEventListener('click', (e) => {
                const { targetParty, targetSlot } = e.currentTarget.dataset;
                handleAddNewCharacter(parseInt(targetParty), parseInt(targetSlot));
            });
        }

        // Add listener for "Add existing player" action
        const addExistingPlayerItem = newCell.querySelector('[data-action="add-existing-player"]');
        
        if (addExistingPlayerItem) {
            addExistingPlayerItem.addEventListener('click', (e) => {
                const { targetParty, targetSlot } = e.currentTarget.dataset;
                openPlayerSearchModal(parseInt(targetParty), parseInt(targetSlot));
            });
        }
        
        return newCell; // Return the updated cell reference
    }

    function setupEventListeners() {
        // Attach listeners to filled player cells
        document.querySelectorAll('.roster-cell.player-filled').forEach(cell => {
            OptimisticUpdates.attachCellEventListeners(cell);
        });

        // Attach listeners to empty slots
        document.querySelectorAll('.roster-cell.empty-slot-clickable').forEach(cell => {
            attachEmptySlotListeners(cell);
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

    function getClassColor(canonicalClass) {
        const classColors = {
            'death knight': '196,30,59',
            'druid': '255,125,10',
            'hunter': '171,212,115',
            'mage': '105,204,240',
            'paladin': '245,140,186',
            'priest': '255,255,255',
            'rogue': '255,245,105',
            'shaman': '0,112,222',
            'warlock': '148,130,201',
            'warrior': '199,156,110'
        };
        return classColors[canonicalClass] || '128,128,128'; // Default gray
    }

    // General toggle switch functionality
    function setupToggleSwitches() {
        document.querySelectorAll('.toggle-switch').forEach(toggle => {
            toggle.addEventListener('click', () => {
                toggle.classList.toggle('active');
            });
        });
    }

    function setupNameToggle() {
        const toggleNamesSwitch = document.getElementById('toggle-names-switch');
        if (!toggleNamesSwitch) return;
        
        // Restore saved state from localStorage
        const savedState = localStorage.getItem('showDiscordNames');
        let showDiscordNames = savedState === 'true';
        if (showDiscordNames) {
            toggleNamesSwitch.classList.add('active');
        }
        
        // Apply initial state
        document.querySelectorAll('.player-name').forEach(nameDiv => {
            const span = nameDiv.querySelector('span');
            if (span) {
                span.textContent = showDiscordNames ? nameDiv.dataset.discordName : nameDiv.dataset.characterName;
            }
        });
        
        toggleNamesSwitch.addEventListener('click', () => {
            setTimeout(() => {
                showDiscordNames = toggleNamesSwitch.classList.contains('active');
                localStorage.setItem('showDiscordNames', showDiscordNames.toString());
                
                document.querySelectorAll('.player-name').forEach(nameDiv => {
                    const span = nameDiv.querySelector('span');
                    if (span) {
                        span.textContent = showDiscordNames ? nameDiv.dataset.discordName : nameDiv.dataset.characterName;
                    }
                });
            }, 10);
        });
    }

    function setupHideInRaidToggle() {
        const hideInRaidSwitch = document.getElementById('hide-in-raid-switch');
        if (!hideInRaidSwitch) return;
        
        // Restore saved state from localStorage (default to ON if not set)
        const savedState = localStorage.getItem('hideInRaid');
        if (savedState === null || savedState === 'true') {
            hideInRaidSwitch.classList.add('active');
        } else {
            hideInRaidSwitch.classList.remove('active');
        }
        applyInRaidVisibility(); // Apply initial state
        
        hideInRaidSwitch.addEventListener('click', () => {
            setTimeout(() => {
                const isActive = hideInRaidSwitch.classList.contains('active');
                localStorage.setItem('hideInRaid', isActive.toString());
                applyInRaidVisibility();
            }, 10);
        });
    }

    function setupHideBenchToggle() {
        const hideBenchSwitch = document.getElementById('hide-bench-switch');
        const benchContainer = document.getElementById('bench-container');
        if (!hideBenchSwitch || !benchContainer) return;
        
        // Restore saved state from localStorage
        const savedState = localStorage.getItem('hideBench');
        if (savedState === 'true') {
            hideBenchSwitch.classList.add('active');
            benchContainer.classList.add('bench-hidden');
        }
        
        hideBenchSwitch.addEventListener('click', () => {
            // Small delay to ensure the toggle class has been updated
            setTimeout(() => {
                // Check if toggle is active (ON state)
                const isActive = hideBenchSwitch.classList.contains('active');
                
                // Save state to localStorage
                localStorage.setItem('hideBench', isActive.toString());
                
                if (isActive) {
                    // Toggle is ON - hide the bench using CSS class
                    benchContainer.classList.add('bench-hidden');
                } else {
                    // Toggle is OFF - show the bench by removing CSS class
                    benchContainer.classList.remove('bench-hidden');
                }
            }, 10);
        });
    }

    function setupHideConfirmedToggle() {
        const hideConfirmedSwitch = document.getElementById('hide-confirmed-switch');
        if (!hideConfirmedSwitch) return;
        
        // Restore saved state from localStorage (default to OFF)
        const savedState = localStorage.getItem('hideConfirmed');
        if (savedState === 'true') {
            hideConfirmedSwitch.classList.add('active');
        }
        applyConfirmedVisibility(); // Apply initial state
        
        hideConfirmedSwitch.addEventListener('click', () => {
            setTimeout(() => {
                const isActive = hideConfirmedSwitch.classList.contains('active');
                localStorage.setItem('hideConfirmed', isActive.toString());
                applyConfirmedVisibility();
            }, 10);
        });
    }

    // Function to apply visual effects based on in-raid status
    function applyInRaidVisibility() {
        const hideInRaidSwitch = document.getElementById('hide-in-raid-switch');
        const isEnabled = hideInRaidSwitch && hideInRaidSwitch.classList.contains('active');
        
        if (isEnabled) {
            // Set opacity to 20% for players marked as "in raid" - only affect player name, not entire cell
            document.querySelectorAll('.roster-cell.player-filled').forEach(cell => {
                // Try multiple ways to find the user ID
                let userId = null;
                const dropdownItems = cell.querySelectorAll('[data-userid]');
                if (dropdownItems.length > 0) {
                    userId = dropdownItems[0].dataset.userid;
                }
                
                if (userId) {
                    const player = currentRosterData.raidDrop?.find(p => p && p.userid === userId) || 
                                 currentRosterData.bench?.find(p => p && p.userid === userId);
                    const playerName = cell.querySelector('.player-name');
                    if (player && player.inRaid) {
                        // Only dim the player name, not the entire cell
                        if (playerName) playerName.style.opacity = '0.2';
                    } else {
                        // Reset player name opacity (but check other toggles)
                        applyAllVisibilityEffects(playerName, player);
                    }
                }
            });
        } else {
            // Reset and reapply other visibility effects
            document.querySelectorAll('.roster-cell.player-filled').forEach(cell => {
                const userId = cell.querySelector('[data-userid]')?.dataset.userid;
                if (userId) {
                    const player = currentRosterData.raidDrop?.find(p => p && p.userid === userId) || 
                                 currentRosterData.bench?.find(p => p && p.userid === userId);
                    const playerName = cell.querySelector('.player-name');
                    applyAllVisibilityEffects(playerName, player);
                }
            });
        }
    }

    // Function to apply visual effects based on confirmed status
    function applyConfirmedVisibility() {
        const hideConfirmedSwitch = document.getElementById('hide-confirmed-switch');
        const isEnabled = hideConfirmedSwitch && hideConfirmedSwitch.classList.contains('active');
        
        if (isEnabled) {
            // Set opacity to 20% for players marked as "confirmed" - only affect player name, not entire cell
            document.querySelectorAll('.roster-cell.player-filled').forEach(cell => {
                // Try multiple ways to find the user ID
                let userId = null;
                const dropdownItems = cell.querySelectorAll('[data-userid]');
                if (dropdownItems.length > 0) {
                    userId = dropdownItems[0].dataset.userid;
                }
                
                if (userId) {
                    const player = currentRosterData.raidDrop?.find(p => p && p.userid === userId) || 
                                 currentRosterData.bench?.find(p => p && p.userid === userId);
                    const playerName = cell.querySelector('.player-name');
                    if (player && (player.isConfirmed === true || player.isConfirmed === "confirmed")) {
                        // Only dim the player name, not the entire cell
                        if (playerName) playerName.style.opacity = '0.2';
                    } else {
                        // Reset player name opacity (but check other toggles)
                        applyAllVisibilityEffects(playerName, player);
                    }
                }
            });
        } else {
            // Reset and reapply other visibility effects
            document.querySelectorAll('.roster-cell.player-filled').forEach(cell => {
                const userId = cell.querySelector('[data-userid]')?.dataset.userid;
                if (userId) {
                    const player = currentRosterData.raidDrop?.find(p => p && p.userid === userId) || 
                                 currentRosterData.bench?.find(p => p && p.userid === userId);
                    const playerName = cell.querySelector('.player-name');
                    applyAllVisibilityEffects(playerName, player);
                }
            });
        }
    }

    // Function to apply all visibility effects (both in-raid and confirmed)
    function applyAllVisibilityEffects(playerName, player) {
        if (!playerName || !player) return;
        
        const hideInRaidSwitch = document.getElementById('hide-in-raid-switch');
        const hideConfirmedSwitch = document.getElementById('hide-confirmed-switch');
        
        const hideInRaidEnabled = hideInRaidSwitch && hideInRaidSwitch.classList.contains('active');
        const hideConfirmedEnabled = hideConfirmedSwitch && hideConfirmedSwitch.classList.contains('active');
        
        // Check if player should be dimmed by either toggle
        const shouldDimForInRaid = hideInRaidEnabled && player.inRaid;
        const shouldDimForConfirmed = hideConfirmedEnabled && (player.isConfirmed === true || player.isConfirmed === "confirmed");
        
        if (shouldDimForInRaid || shouldDimForConfirmed) {
            playerName.style.opacity = '0.2';
        } else {
            playerName.style.opacity = '1';
        }
    }

    // Player search modal functionality
    let currentSearchTarget = null;

    function openPlayerSearchModal(partyId, slotId) {
        currentSearchTarget = { partyId, slotId };
        const overlay = document.getElementById('player-search-overlay');
        const input = document.getElementById('player-search-input');
        const results = document.getElementById('player-search-results');
        
        // Reset the modal
        input.value = '';
        results.innerHTML = '<div class="player-search-no-results">Type at least 3 characters to search</div>';
        
        // Show the modal
        overlay.style.display = 'flex';
        input.focus();
    }

    function closePlayerSearchModal() {
        const overlay = document.getElementById('player-search-overlay');
        overlay.style.display = 'none';
        currentSearchTarget = null;
    }

    async function searchPlayers(query) {
        if (query.length < 3) {
            const results = document.getElementById('player-search-results');
            results.innerHTML = '<div class="player-search-no-results">Type at least 3 characters to search</div>';
            return;
        }

        try {
            const response = await fetch(`/api/players/search?q=${encodeURIComponent(query)}`);
            const players = await response.json();
            
            const results = document.getElementById('player-search-results');
            
            if (players.length === 0) {
                results.innerHTML = '<div class="player-search-no-results">No players found</div>';
                return;
            }

            const playersHTML = players.map(player => {
                const canonicalClass = getCanonicalClass(player.class);
                const classColor = getClassColor(canonicalClass);
                const rgb = classColor.split(',').map(Number);
                const textColor = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 < 128 ? 'white' : 'black';
                
                return `
                    <div class="player-search-item" data-discord-id="${player.discord_id}" data-character-name="${player.character_name}" data-class="${player.class}" 
                         style="background-color: rgb(${classColor}); color: ${textColor};">
                        <div>
                            <div class="player-search-item-name">${player.character_name}</div>
                            <div class="player-search-item-class">${player.class}</div>
                        </div>
                    </div>
                `;
            }).join('');

            results.innerHTML = playersHTML;

            // Add click listeners to search results
            results.querySelectorAll('.player-search-item').forEach(item => {
                item.addEventListener('click', () => {
                    const discordId = item.dataset.discordId;
                    const characterName = item.dataset.characterName;
                    const characterClass = item.dataset.class;
                    
                    selectExistingPlayer(discordId, characterName, characterClass);
                });
            });

        } catch (error) {
            console.error('Error searching players:', error);
            const results = document.getElementById('player-search-results');
            results.innerHTML = '<div class="player-search-no-results">Error searching players</div>';
        }
    }

    async function selectExistingPlayer(discordId, characterName, characterClass) {
        if (!currentSearchTarget) return;

        const { partyId, slotId } = currentSearchTarget;

        try {
            // Close the modal first
            closePlayerSearchModal();

            // Add the existing player to the roster using force (bypass duplicate checks)
            const characterData = {
                characterName: characterName,
                class: characterClass,
                discordId: discordId,
                spec: null // Let the system determine default spec
            };

            await addExistingPlayerToRoster(eventId, characterData, partyId, slotId);
            
            // Mark roster as managed and show revert button
            isManaged = true;
            updateRevertButtonVisibility();
            
            // Reload the roster to show the change
            await renderRoster();
            
        } catch (error) {
            console.error('Error adding existing player:', error);
            showAlert('Add Player Error', `Error adding player to roster: ${error.message}`);
        }
    }

    function setupPlayerSearchModal() {
        const overlay = document.getElementById('player-search-overlay');
        const closeBtn = overlay.querySelector('.player-search-close');
        const input = document.getElementById('player-search-input');

        // Close modal when clicking close button
        closeBtn.addEventListener('click', closePlayerSearchModal);

        // Close modal when clicking outside
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closePlayerSearchModal();
            }
        });

        // Close modal when pressing Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.style.display === 'flex') {
                closePlayerSearchModal();
            }
        });

        // Search on input
        let searchTimeout;
        input.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchPlayers(e.target.value.trim());
            }, 300); // Debounce search by 300ms
        });
    }

    function updateRevertButtonVisibility() {
        revertButton.style.display = isManaged ? 'inline-flex' : 'none';
    }

    revertButton.addEventListener('click', async () => {
        showConfirm(
            'Revert to Unmanaged Roster',
            'Are you sure you want to revert to the unmanaged roster? All local changes will be lost.',
            async () => {
                try {
                    await revertToUnmanaged(eventId);
                    isManaged = false;
                    updateRevertButtonVisibility();
                    renderRoster();
                } catch (error) {
                    showAlert('Revert Error', `Failed to revert: ${error.message}`);
                }
            }
        );
    });

    function handleAddNewCharacter(targetPartyId, targetSlotId) {
        // Close any open dropdowns
        document.querySelectorAll('.player-details-dropdown.show').forEach(d => d.classList.remove('show'));
        
        // Create and show the add character modal with spec field enabled for roster
        const modal = new AddCharacterModal({
            showSpecField: true,
            onSubmit: async (characterData) => {
                try {
                    // Call the API to add the character to this position
                    await addCharacterToRoster(eventId, characterData, targetPartyId, targetSlotId);
                    
                    // Refresh the roster to show the new character
                    renderRoster();
                    
                    // Mark as managed and show revert button
                    isManaged = true;
                    updateRevertButtonVisibility();
                    
                    // Character added successfully
                } catch (error) {
                    console.error('Error adding character:', error);
                    
                    // Check if this is a conflict error that needs user confirmation
                    if (error.isConflict && error.conflictData) {
                        handleCharacterConflict(error.conflictData, characterData, targetPartyId, targetSlotId);
                        return; // Don't show generic error
                    }
                    
                    showAlert('Add Character Error', `Error adding character: ${error.message}`);
                }
            },
            onCancel: () => {
                // Character addition cancelled
            }
        });
        
        modal.show();
    }

    function getClassColor(className) {
        const classColors = {
            'death knight': '196,30,59',
            'druid': '255,125,10',
            'hunter': '171,212,115',
            'mage': '105,204,240',
            'paladin': '245,140,186',
            'priest': '255,255,255',
            'rogue': '255,245,105',
            'shaman': '0,112,222',
            'warlock': '148,130,201',
            'warrior': '199,156,110'
        };
        const canonical = getCanonicalClass(className);
        return classColors[canonical] || '128,128,128';
    }

    async function handleCharacterConflict(conflictData, characterData, targetPartyId, targetSlotId) {
        const { error, message, existingCharacter, existingCharacters } = conflictData;

        if (error === 'EXACT_DUPLICATE') {
            // Exact duplicate - refuse creation
            showAlert('Cannot Create Character', message);
            return;
        }

        if (error === 'NAME_CONFLICT') {
            // Same name, different class - show confirmation with color-coded classes
            const existingClassColor = getClassColor(existingCharacter.class);
            const newClassColor = getClassColor(characterData.class);
            
            const messageHtml = `
                <p>A character named <strong>"${existingCharacter.name}"</strong> already exists with class 
                <span style="color: rgb(${existingClassColor}); font-weight: bold;">${existingCharacter.class}</span>.</p>
                
                <p>Do you want to create this character with class 
                <span style="color: rgb(${newClassColor}); font-weight: bold;">${characterData.class}</span>?</p>
                
                <p style="color: #f39c12; margin-top: 15px;"><strong>⚠️ This will create two characters with the same name but different classes.</strong></p>
            `;

            showCustomModal({
                type: 'confirm',
                title: 'Character Name Conflict',
                message: messageHtml,
                allowHtmlContent: true,
                buttons: [
                    { text: 'Cancel', action: 'cancel', style: 'secondary' },
                    { text: 'Create Anyway', action: 'confirm', style: 'primary' }
                ],
                onConfirm: () => forceCreateCharacter(characterData, targetPartyId, targetSlotId)
            });
            return;
        }

        if (error === 'DISCORD_ID_CONFLICT') {
            // Multiple characters with same Discord ID - show detailed list with colors
            const characterListHtml = existingCharacters.map(char => {
                const classColor = getClassColor(char.class);
                return `<li style="display: flex; align-items: center; padding: 5px 0;">
                    <div style="width: 12px; height: 12px; background-color: rgb(${classColor}); border-radius: 2px; margin-right: 10px;"></div>
                    <span><strong>${char.name}</strong> <span style="color: rgb(${classColor}); font-weight: bold;">(${char.class})</span></span>
                </li>`;
            }).join('');

            const newCharColor = getClassColor(characterData.class);

            const messageHtml = `
                <p>${message}</p>
                
                <div style="margin: 15px 0;">
                    <strong>Existing characters:</strong>
                    <ul style="list-style: none; padding: 10px 0; margin: 0;">${characterListHtml}</ul>
                </div>
                
                <p>Do you want to create 
                <strong>"${characterData.characterName}"</strong> 
                <span style="color: rgb(${newCharColor}); font-weight: bold;">(${characterData.class})</span> anyway?</p>
            `;

            showCustomModal({
                type: 'confirm',
                title: 'Discord ID Conflict',
                message: messageHtml,
                allowHtmlContent: true,
                buttons: [
                    { text: 'Cancel', action: 'cancel', style: 'secondary' },
                    { text: 'Create Anyway', action: 'confirm', style: 'primary' }
                ],
                onConfirm: () => forceCreateCharacter(characterData, targetPartyId, targetSlotId)
            });
            return;
        }
    }

    async function forceCreateCharacter(characterData, targetPartyId, targetSlotId) {
        try {
            // Use the force creation endpoint
            await addCharacterToRosterForce(eventId, characterData, targetPartyId, targetSlotId);
            
            // Refresh the roster to show the new character
            renderRoster();
            
            // Mark as managed and show revert button
            isManaged = true;
            updateRevertButtonVisibility();
            
                            // Character force-created successfully
        } catch (error) {
            console.error('Error force creating character:', error);
            showAlert('Create Character Error', `Error creating character: ${error.message}`);
        }
    }

    window.addEventListener('click', () => {
        document.querySelectorAll('.player-details-dropdown.show').forEach(d => d.classList.remove('show'));
    });

    renderRoster();
    // setupNameToggle(); // Now called from inside renderRoster
});