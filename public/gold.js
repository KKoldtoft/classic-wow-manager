// Gold Pot Page JavaScript

class GoldPotManager {
    constructor() {
        this.allPlayers = [];
        this.filteredPlayers = [];
        this.currentEventId = null;
        
        this.initializeEventListeners();
        this.loadData();
    }

    initializeEventListeners() {
        // Filter change listeners
        const classFilter = document.getElementById('classFilter');
        
        if (classFilter) {
            classFilter.addEventListener('change', () => this.applyFilters());
        }
    }

    async loadData() {
        try {
            // Prefer URL param /event/:eventId/gold; fallback to localStorage
            let eventIdFromUrl = null;
            try {
                const parts = window.location.pathname.split('/').filter(Boolean);
                const idx = parts.indexOf('event');
                if (idx >= 0 && parts[idx + 1]) {
                    eventIdFromUrl = parts[idx + 1];
                }
            } catch {}

            // Get the active event session ID
            this.currentEventId = eventIdFromUrl || localStorage.getItem('activeEventSession');

            // Normalize URL: if we have an active event but current URL is not event-scoped, redirect
            try {
                const parts = window.location.pathname.split('/').filter(Boolean);
                const isEventScoped = parts.includes('event') && parts[parts.indexOf('event') + 1];
                const isGoldPage = parts.includes('gold');
                if (!isEventScoped && isGoldPage && this.currentEventId) {
                    window.location.replace(`/event/${this.currentEventId}/gold`);
                    return;
                }
            } catch {}

            if (eventIdFromUrl) {
                localStorage.setItem('activeEventSession', eventIdFromUrl);
                if (typeof updateRaidBar === 'function') {
                    setTimeout(() => updateRaidBar(), 0);
                }
            }
            
            if (!this.currentEventId) {
                this.showError('No active event session found. Please select an event from the events page.');
                return;
            }

            console.log('Loading gold pot data for event:', this.currentEventId);
            
            // Fetch event details and confirmed players in parallel
            const [eventData, playersData] = await Promise.all([
                this.fetchEventDetails(),
                this.fetchConfirmedPlayers()
            ]);

            // Store and display players
            this.allPlayers = playersData || [];
            this.applyFilters();
            
            // Show content
            this.showContent();
            
        } catch (error) {
            console.error('Error loading gold pot data:', error);
            this.showError(error.message || 'Failed to load gold pot data');
        }
    }

    async fetchEventDetails() {
        try {
            // Fetch event details to get the event name
            const response = await fetch(`/api/roster/${this.currentEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch event details: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
            
        } catch (error) {
            console.warn('Could not fetch event details, using default name');
            return { name: 'Unknown Event' };
        }
    }

    async fetchConfirmedPlayers() {
        const response = await fetch(`/api/confirmed-logs/${this.currentEventId}/all-players`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch confirmed players: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('Fetched confirmed players:', result.data);
        
        return result.data;
    }



    applyFilters() {
        const classFilter = document.getElementById('classFilter');
        const selectedClass = classFilter ? classFilter.value : '';

        this.filteredPlayers = this.allPlayers.filter(player => {
            // Class filter
            if (selectedClass && player.character_class !== selectedClass) {
                return false;
            }

            return true;
        });

        this.renderPlayers();
    }

    renderPlayers() {
        const playersGrid = document.getElementById('playersGrid');
        
        if (!playersGrid) {
            console.error('Players grid element not found');
            return;
        }

        if (this.filteredPlayers.length === 0) {
            this.showEmptyState();
            return;
        }

        // Sort players by class, then by name
        const sortedPlayers = this.filteredPlayers.slice().sort((a, b) => {
            const classOrder = this.getClassSortOrder(a.character_class) - this.getClassSortOrder(b.character_class);
            if (classOrder !== 0) return classOrder;
            
            return a.character_name.localeCompare(b.character_name);
        });

        let playersHtml = '';
        
        sortedPlayers.forEach(player => {
            const classLower = player.character_class.toLowerCase();
            
            playersHtml += `
                <div class="player-card ${classLower}" data-class="${player.character_class}">
                    <div class="player-info">
                        <div class="player-details">
                            <div class="player-name">${player.character_name}</div>
                            <div class="player-class">${player.character_class}</div>
                        </div>
                    </div>
                </div>
            `;
        });

        playersGrid.innerHTML = playersHtml;
    }

    showEmptyState() {
        const playersGrid = document.getElementById('playersGrid');
        
        if (playersGrid) {
            playersGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <h3>No Players Found</h3>
                    <p>No confirmed players match your current filter criteria. Try adjusting the filters or check back after running log analysis.</p>
                </div>
            `;
        }
    }

    getClassSortOrder(characterClass) {
        const classOrder = {
            'Warrior': 1,
            'Rogue': 2,
            'Hunter': 3,
            'Mage': 4,
            'Warlock': 5,
            'Shaman': 6,
            'Paladin': 7,
            'Druid': 8,
            'Priest': 9
        };
        return classOrder[characterClass] || 999;
    }

    showLoading() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        const errorDisplay = document.getElementById('errorDisplay');
        const goldContent = document.getElementById('goldContent');
        
        if (loadingIndicator) loadingIndicator.style.display = 'flex';
        if (errorDisplay) errorDisplay.style.display = 'none';
        if (goldContent) goldContent.style.display = 'none';
    }

    showError(message) {
        const loadingIndicator = document.getElementById('loadingIndicator');
        const errorDisplay = document.getElementById('errorDisplay');
        const goldContent = document.getElementById('goldContent');
        const errorMessage = document.getElementById('errorMessage');
        
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (errorDisplay) errorDisplay.style.display = 'block';
        if (goldContent) goldContent.style.display = 'none';
        if (errorMessage) errorMessage.textContent = message;
    }

    showContent() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        const errorDisplay = document.getElementById('errorDisplay');
        const goldContent = document.getElementById('goldContent');
        
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (errorDisplay) errorDisplay.style.display = 'none';
        if (goldContent) goldContent.style.display = 'block';
    }
}

// Initialize the Gold Pot Manager when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GoldPotManager();
}); 