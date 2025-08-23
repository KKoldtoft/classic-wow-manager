// public/attendance.js

class AttendanceManager {
    constructor() {
        this.attendanceData = null;
        this.isLoading = false;
        this.lastUpdated = null;
        this.canManage = false;
        
        this.initializeEventListeners();
        this.loadAttendanceData();
    }
    
    initializeEventListeners() {
        // No rebuild buttons anymore; attendance is computed live
    }
    
    async loadAttendanceData() {
        if (this.isLoading) return;
        
        // Determine management role and hide gated controls accordingly
        try {
            const uRes = await fetch('/user');
            if (uRes && uRes.ok) {
                const u = await uRes.json();
                this.canManage = !!(u && u.loggedIn && u.hasManagementRole);
            } else {
                this.canManage = false;
            }
        } catch (_) { this.canManage = false; }
        // Rebuild controls removed

        this.isLoading = true;
        this.showLoading();
        
        try {
            console.log('🔄 Loading attendance data...');
            
            const response = await fetch('/api/attendance');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.message || 'Failed to load attendance data');
            }
            
            this.attendanceData = result.data;
            this.lastUpdated = new Date();
            
            console.log('✅ Attendance data loaded:', this.attendanceData);
            
            this.renderAttendanceTable();
            this.updateCurrentWeekInfo();
            this.updateStatistics();
            this.showContent();
            
        } catch (error) {
            console.error('❌ Error loading attendance data:', error);
            this.showError(error.message);
        } finally {
            this.isLoading = false;
        }
    }
    
    // rebuildWeekRange removed
    
    calculateWeekRange(currentWeek, rangeNumber) {
        // Calculate the last 15 weeks split into 3 ranges of 5 weeks each
        // Range 1: weeks (current-14) to (current-10)
        // Range 2: weeks (current-9) to (current-5) 
        // Range 3: weeks (current-4) to current
        
        const currentWeekNumber = currentWeek.weekNumber;
        const currentYear = currentWeek.weekYear;
        
        let startOffset, endOffset;
        switch (rangeNumber) {
            case 1:
                startOffset = 14;
                endOffset = 10;
                break;
            case 2:
                startOffset = 9;
                endOffset = 5;
                break;
            case 3:
                startOffset = 4;
                endOffset = 0;
                break;
            default:
                throw new Error('Invalid range number');
        }
        
        // Calculate start week
        let startWeekNumber = currentWeekNumber - startOffset;
        let startYear = currentYear;
        if (startWeekNumber <= 0) {
            startYear--;
            startWeekNumber = 52 + startWeekNumber; // 52 weeks in a year
        }
        
        // Calculate end week
        let endWeekNumber = currentWeekNumber - endOffset;
        let endYear = currentYear;
        if (endWeekNumber <= 0) {
            endYear--;
            endWeekNumber = 52 + endWeekNumber;
        }
        
        return {
            startWeek: { weekNumber: startWeekNumber, weekYear: startYear },
            endWeek: { weekNumber: endWeekNumber, weekYear: endYear }
        };
    }
    
    // updateRebuildButtonTexts removed
    
    async rebuildWeekCache(weekYear, weekNumber, buttonElement) {
        if (this.isLoading) return;
        
        if (!confirm(`Rebuild attendance cache for Week ${weekNumber}, ${weekYear}?\n\nThis will clear and rebuild attendance data for this specific week only.`)) {
            return;
        }
        
        this.isLoading = true;
        
        // Disable the specific button and show loading state
        buttonElement.disabled = true;
        buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        buttonElement.classList.add('loading');
        
        try {
            console.log(`🔄 Rebuilding attendance cache for Week ${weekNumber}, ${weekYear}...`);
            
            const response = await fetch('/api/attendance/rebuild-week', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    weekYear: weekYear,
                    weekNumber: weekNumber
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.message || 'Failed to rebuild week cache');
            }
            
            console.log(`✅ Week ${weekNumber}, ${weekYear} cache rebuild completed:`, result.stats);
            
            // Show success message
            const stats = result.stats;
            alert(`Week ${weekNumber}, ${weekYear} cache rebuild completed!\n\nProcessed: ${stats.processed} events\nSkipped: ${stats.skipped} events\nTotal: ${stats.total} events`);
            
            // Reload data to show updated results
            await this.loadAttendanceData();
            
        } catch (error) {
            console.error(`❌ Error rebuilding cache for Week ${weekNumber}, ${weekYear}:`, error);
            alert(`Week ${weekNumber}, ${weekYear} cache rebuild failed:\n${error.message}`);
        } finally {
            this.isLoading = false;
            
            // Reset button state
            buttonElement.disabled = false;
            buttonElement.innerHTML = '<i class="fas fa-sync-alt"></i>';
            buttonElement.classList.remove('loading');
        }
    }
    

    
    getPlayerCharacters(playerId, weeks, attendance) {
        // Collect all unique characters for this player across all weeks
        const charactersMap = new Map();
        
        weeks.forEach(week => {
            const weekKey = `${week.weekYear}-${week.weekNumber}`;
            const playerAttendance = attendance[playerId];
            const weekAttendance = playerAttendance && playerAttendance[weekKey];
            
            if (weekAttendance && weekAttendance.length > 0) {
                weekAttendance.forEach(event => {
                    const characterName = event.characterName || 'Unknown';
                    const characterClass = (event.characterClass || 'unknown').toLowerCase();
                    
                    // Store the character with its class (use the most recent class if name appears multiple times)
                    charactersMap.set(characterName, characterClass);
                });
            }
        });
        
        // Convert to array and sort alphabetically
        return Array.from(charactersMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([name, characterClass]) => ({ name, characterClass }));
    }
    
    renderAttendanceTable() {
        if (!this.attendanceData || !this.attendanceData.weeks || !this.attendanceData.players) {
            this.showNoData();
            return;
        }
        
        const { weeks, players, attendance, currentWeek } = this.attendanceData;
        
        if (players.length === 0) {
            this.showNoData();
            return;
        }
        
        // Render table header
        this.renderTableHeader(weeks, currentWeek);
        
        // Render table body
        this.renderTableBody(weeks, players, attendance, currentWeek);
    }
    
    renderTableHeader(weeks, currentWeek) {
        const headerRow = document.getElementById('table-header');
        if (!headerRow) return;
        
        // Clear existing headers except player column
        headerRow.innerHTML = '<th class="player-column">Characters</th>';
        
        // Add week columns
        weeks.forEach(week => {
            const th = document.createElement('th');
            th.className = 'week-column';
            
            // Check if this is the current week
            if (week.weekYear === currentWeek.weekYear && week.weekNumber === currentWeek.weekNumber) {
                th.classList.add('current-week');
            }
            
            // Calculate the date range for this week
            const dateRange = this.getWeekDateRange(week.weekYear, week.weekNumber);
            
            // Format stats text
            const statsText = `${week.characterCount || 0} Characters, ${week.playerCount || 0} Players`;
            const shortStatsText = statsText.length > 20 ? `${week.characterCount || 0}C, ${week.playerCount || 0}P` : statsText;
            
            th.innerHTML = `
                <div>Week ${week.weekNumber}</div>
                <div style="font-size: 10px; opacity: 0.7;">${dateRange}</div>
                <div style="font-size: 10px; opacity: 0.6; margin-top: 2px;" title="${statsText}">${shortStatsText}</div>
            `;
            
            headerRow.appendChild(th);
        });
    }
    
    getWeekDateRange(weekYear, weekNumber) {
        // Get the first Monday of January for the given year
        const firstDay = new Date(weekYear, 0, 1);
        const dayOfWeek = firstDay.getDay();
        const daysToAdd = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
        const firstMonday = new Date(weekYear, 0, 1 + daysToAdd);
        
        // Calculate the Monday of the specified week
        const weekMonday = new Date(firstMonday);
        weekMonday.setDate(firstMonday.getDate() + (weekNumber - 1) * 7);
        
        // Calculate the Sunday of that week
        const weekSunday = new Date(weekMonday);
        weekSunday.setDate(weekMonday.getDate() + 6);
        
        // Format as dd-mm-yy
        const formatDate = (date) => {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = String(date.getFullYear()).slice(-2);
            return `${day}-${month}-${year}`;
        };
        
        return `${formatDate(weekMonday)} to ${formatDate(weekSunday)}`;
    }
    
    renderTableBody(weeks, players, attendance, currentWeek) {
        const tableBody = document.getElementById('table-body');
        if (!tableBody) return;
        
        // Clear existing rows
        tableBody.innerHTML = '';
        
        // Filter and sort players - only show players with at least 1 week attended in the past 15 weeks
        const filteredPlayers = players.filter(player => {
            const playerAttendance = attendance[player.discord_id] || {};
            let attendedWeeks = 0;
            
            weeks.forEach(week => {
                const weekKey = `${week.weekYear}-${week.weekNumber}`;
                const weekAttendance = playerAttendance[weekKey];
                if (weekAttendance && weekAttendance.length > 0) {
                    attendedWeeks++;
                }
            });
            
            return attendedWeeks > 0;
        });
        
        const sortedPlayers = [...filteredPlayers].sort((a, b) => 
            (a.discord_username || '').localeCompare(b.discord_username || '')
        );
        
        // Create rows for each player
        sortedPlayers.forEach(player => {
            const row = document.createElement('tr');
            
            // Player characters column with streak
            const playerCell = document.createElement('td');
            playerCell.className = 'player-column';
            
            const characters = this.getPlayerCharacters(player.discord_id, weeks, attendance);
            const streak = player.player_streak || 0;
            
            // Create character list HTML
            const charactersHtml = characters.length > 0 
                ? characters.map(char => 
                    `<div class="character-name-line class-${char.characterClass}">${char.name}</div>`
                  ).join('')
                : `<div class="character-name-line class-unknown">No characters</div>`;
            
            playerCell.innerHTML = `
                <div class="player-characters">
                    ${charactersHtml}
                </div>
                <span class="player-streak">[${streak}]</span>
            `;
            
            row.appendChild(playerCell);
            
            // Week columns
            weeks.forEach(week => {
                const weekCell = document.createElement('td');
                weekCell.className = 'week-column';
                
                // Check if this is the current week
                const isCurrentWeek = week.weekYear === currentWeek.weekYear && 
                                    week.weekNumber === currentWeek.weekNumber;
                
                if (isCurrentWeek) {
                    weekCell.classList.add('current-week');
                }
                
                // Get attendance for this player and week
                const weekKey = `${week.weekYear}-${week.weekNumber}`;
                const playerAttendance = attendance[player.discord_id];
                const weekAttendance = playerAttendance && playerAttendance[weekKey];
                
                // Create attendance cell
                const attendanceCell = document.createElement('div');
                attendanceCell.className = 'attendance-cell';
                
                if (weekAttendance && weekAttendance.length > 0) {
                    // Player attended this week
                    attendanceCell.classList.add('attended');
                    
                    if (isCurrentWeek) {
                        attendanceCell.classList.add('current-week');
                    }
                    
                    // Handle multiple events as separate boxes
                    if (weekAttendance.length > 1) {
                        attendanceCell.classList.add('multiple-events');
                        
                        // Create separate boxes for each event
                        const eventBoxes = weekAttendance.map(event => {
                            const characterName = event.characterName || 'Unknown';
                            const characterClass = (event.characterClass || 'unknown').toLowerCase();
                            const channelName = event.channelName || 'unknown-channel';
                            
                            return `
                                <div class="attendance-event-box">
                                    <div><span class="character-name class-${characterClass}">${characterName}</span></div>
                                    <div>${channelName}</div>
                                </div>
                            `;
                        }).join('');
                        
                        attendanceCell.innerHTML = eventBoxes;
                    } else {
                        // Single event - use the existing style
                        const event = weekAttendance[0];
                        const characterName = event.characterName || 'Unknown';
                        const characterClass = (event.characterClass || 'unknown').toLowerCase();
                        const channelName = event.channelName || 'unknown-channel';
                        
                        attendanceCell.innerHTML = `
                            <div class="attendance-details">
                                <div><span class="character-name class-${characterClass}">${characterName}</span></div>
                                <div>${channelName}</div>
                            </div>
                        `;
                    }
                    
                    // Add tooltip with more details
                    attendanceCell.title = weekAttendance.map(event => 
                        `${event.channelName} with ${event.characterName} (${event.characterClass})`
                    ).join(', ');
                    
                } else {
                    // Player did not attend this week
                    attendanceCell.classList.add('not-attended');
                    
                    if (isCurrentWeek) {
                        attendanceCell.classList.add('current-week');
                    }
                    
                    attendanceCell.textContent = 'Not Attended';
                    attendanceCell.title = 'No attendance recorded for this week';
                }
                
                weekCell.appendChild(attendanceCell);
                row.appendChild(weekCell);
            });
            
            tableBody.appendChild(row);
        });
    }
    
    updateCurrentWeekInfo() {
        const currentWeekInfo = document.getElementById('current-week-info');
        const lastUpdated = document.getElementById('last-updated');
        
        if (currentWeekInfo && this.attendanceData && this.attendanceData.currentWeek) {
            const { weekYear, weekNumber } = this.attendanceData.currentWeek;
            currentWeekInfo.textContent = `Current: Week ${weekNumber}, ${weekYear}`;
        }
        
        if (lastUpdated && this.lastUpdated) {
            lastUpdated.textContent = `Updated: ${this.lastUpdated.toLocaleTimeString()}`;
        }
    }
    
    updateStatistics() {
        if (!this.attendanceData || !this.attendanceData.players || !this.attendanceData.attendance) {
            return;
        }
        
        const { players, attendance, weeks } = this.attendanceData;
        
        // Calculate statistics for all 15 weeks
        let totalActivePlayersCount = 0;
        let activePlayersLast4WeeksCount = 0;
        let perfectAttendanceCount = 0;
        let totalAttendanceEvents = 0;
        let totalPossibleEvents = 0;
        
        // Get last 4 weeks for the second stat
        const last4Weeks = weeks.slice(-4);
        
        players.forEach(player => {
            const playerAttendance = attendance[player.discord_id] || {};
            
            let attendedWeeks = 0;
            let totalEvents = 0;
            let attendedLast4Weeks = 0;
            
            weeks.forEach(week => {
                const weekKey = `${week.weekYear}-${week.weekNumber}`;
                const weekAttendance = playerAttendance[weekKey];
                
                if (weekAttendance && weekAttendance.length > 0) {
                    attendedWeeks++;
                    totalEvents += weekAttendance.length;
                }
            });
            
            // Check last 4 weeks attendance
            last4Weeks.forEach(week => {
                const weekKey = `${week.weekYear}-${week.weekNumber}`;
                const weekAttendance = playerAttendance[weekKey];
                
                if (weekAttendance && weekAttendance.length > 0) {
                    attendedLast4Weeks++;
                }
            });
            
            totalAttendanceEvents += totalEvents;
            totalPossibleEvents += weeks.length;
            
            // Total active players: attended at least 1 week in last 15 weeks
            if (attendedWeeks > 0) {
                totalActivePlayersCount++;
            }
            
            // Active in last 4 weeks: attended at least 1 week in last 4 weeks
            if (attendedLast4Weeks > 0) {
                activePlayersLast4WeeksCount++;
            }
            
            // Perfect attendance: attended all 15 weeks
            if (attendedWeeks === weeks.length) {
                perfectAttendanceCount++;
            }
        });
        
        // Update statistics display
        document.getElementById('total-active-players').textContent = totalActivePlayersCount;
        document.getElementById('active-players-4-weeks').textContent = activePlayersLast4WeeksCount;
        document.getElementById('perfect-attendance').textContent = perfectAttendanceCount;
        
        // Calculate average attendance rate
        const averageAttendanceRate = totalPossibleEvents > 0 
            ? Math.round((totalAttendanceEvents / totalPossibleEvents) * 100)
            : 0;
        document.getElementById('average-attendance').textContent = `${averageAttendanceRate}%`;
    }
    
    showLoading(message = 'Loading attendance data...') {
        document.getElementById('loading-indicator').style.display = 'flex';
        document.getElementById('loading-indicator').querySelector('p').textContent = message;
        document.getElementById('error-display').style.display = 'none';
        document.getElementById('no-data-message').style.display = 'none';
        document.getElementById('attendance-table-container').style.display = 'none';
    }
    
    showError(message) {
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('error-display').style.display = 'block';
        document.getElementById('error-message').textContent = message;
        document.getElementById('no-data-message').style.display = 'none';
        document.getElementById('attendance-table-container').style.display = 'none';
    }
    
    showNoData() {
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('error-display').style.display = 'none';
        document.getElementById('no-data-message').style.display = 'block';
        document.getElementById('attendance-table-container').style.display = 'none';
    }
    
    showContent() {
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('error-display').style.display = 'none';
        document.getElementById('no-data-message').style.display = 'none';
        document.getElementById('attendance-stats').style.display = 'block';
        document.getElementById('attendance-table-container').style.display = 'block';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 Initializing Attendance Manager...');
    new AttendanceManager();
}); 