// public/script.js

// Global blur and darken settings
let globalBlurValue = 0;
let globalDarkenValue = 100;

// Function to load global blur setting
async function loadGlobalBlurSetting() {
    try {
        const response = await fetch('/api/ui/background-blur');
        const data = await response.json();
        
        if (data.success) {
            globalBlurValue = data.blurValue || 0;
        }
    } catch (error) {
        console.warn('Error loading blur setting:', error);
        globalBlurValue = 0;
    }
}

// Function to load global darken setting
async function loadGlobalDarkenSetting() {
    try {
        const response = await fetch('/api/ui/background-darken');
        const data = await response.json();
        
        if (data.success) {
            globalDarkenValue = data.darkenValue || 100;
        }
    } catch (error) {
        console.warn('Error loading darken setting:', error);
        globalDarkenValue = 100;
    }
}

// Function to apply channel-specific background images
async function applyChannelBackground(eventDiv, channelId, isGrayscale = false) {
    // Removed verbose debugging - keeping minimal logs
    
    try {
        const response = await fetch(`/api/channel-background/${channelId}`);
        const data = await response.json();
        
        let backgroundUrl = null;
        
        if (data.success && data.backgroundUrl) {
            backgroundUrl = data.backgroundUrl;
        } else {
            // Use default AQ40 background
            backgroundUrl = '/images/AQ40-background.png';
        }
        
        // ALWAYS apply the pseudo-element approach when blur > 0 OR darken < 100 (make it identical for both cases)
        if (globalBlurValue > 0 || globalDarkenValue < 100) {
            // Create a pseudo-element approach to apply effects only to the background
            eventDiv.style.position = 'relative';
            eventDiv.style.overflow = 'hidden';
            
            // Remove any existing pseudo-element
            const existingPseudo = eventDiv.querySelector('.background-pseudo');
            if (existingPseudo) {
                existingPseudo.remove();
            }
            
            // Create pseudo-element for filtered background
            const pseudoElement = document.createElement('div');
            pseudoElement.className = 'background-pseudo';
            
            // Build filter string - IDENTICAL for both cases
            let filterString = '';
            if (globalBlurValue > 0) {
                filterString += `blur(${globalBlurValue}px)`;
            }
            if (globalDarkenValue < 100) {
                if (filterString) filterString += ' ';
                filterString += `brightness(${globalDarkenValue}%)`;
            }
            if (isGrayscale) {
                if (filterString) filterString += ' ';
                filterString += 'grayscale(100%)';
            }
            
            // Apply styles using individual properties instead of cssText for better debugging
            pseudoElement.style.position = 'absolute';
            pseudoElement.style.top = '-10px';
            pseudoElement.style.left = '-10px';
            pseudoElement.style.right = '-10px';
            pseudoElement.style.bottom = '-10px';
            pseudoElement.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)), url('${backgroundUrl}')`;
            pseudoElement.style.backgroundSize = 'cover';
            pseudoElement.style.backgroundPosition = 'center';
            pseudoElement.style.filter = filterString;
            pseudoElement.style.zIndex = '0';
            pseudoElement.style.pointerEvents = 'none';
            
            eventDiv.insertBefore(pseudoElement, eventDiv.firstChild);
            
            // Remove the background from the main element to prevent double-background
            eventDiv.style.backgroundImage = 'none';
            
            console.log(`✅ Applied filtered background for ${isGrayscale ? 'historic' : 'upcoming'} raid with ${globalBlurValue}px blur and ${globalDarkenValue}% brightness`);
        } else {
            // No blur or darken - but we still need pseudo-element for historic events to apply grayscale to background only
            if (isGrayscale) {
                // Create pseudo-element for grayscale background (no blur or darken)
                eventDiv.style.position = 'relative';
                eventDiv.style.overflow = 'hidden';
                
                // Remove any existing pseudo-element
                const existingPseudo = eventDiv.querySelector('.background-pseudo');
                if (existingPseudo) {
                    existingPseudo.remove();
                }
                
                // Create pseudo-element for grayscale background
                const pseudoElement = document.createElement('div');
                pseudoElement.className = 'background-pseudo';
                
                // Apply styles for grayscale background (no blur or darken)
                pseudoElement.style.position = 'absolute';
                pseudoElement.style.top = '-10px';
                pseudoElement.style.left = '-10px';
                pseudoElement.style.right = '-10px';
                pseudoElement.style.bottom = '-10px';
                pseudoElement.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)), url('${backgroundUrl}')`;
                pseudoElement.style.backgroundSize = 'cover';
                pseudoElement.style.backgroundPosition = 'center';
                pseudoElement.style.filter = 'grayscale(100%)'; // Only grayscale, no blur or darken
                pseudoElement.style.zIndex = '0';
                pseudoElement.style.pointerEvents = 'none';
                
                eventDiv.insertBefore(pseudoElement, eventDiv.firstChild);
                eventDiv.style.backgroundImage = 'none';
                
                console.log(`⚫ Applied grayscale-only background for historic raid`);
            } else {
                // No effects - apply background normally to the div
                if (data.success && data.backgroundUrl) {
                    const backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)), url('${backgroundUrl}')`;
                    eventDiv.style.backgroundImage = backgroundImage;
                }
                // If no custom background, keep the default CSS background
            }
        }
    } catch (error) {
        console.warn('Error loading channel background, using fallback:', error);
        // Apply effects to default background if needed
        if (globalBlurValue > 0 || globalDarkenValue < 100 || isGrayscale) {
            applyEffectsToDefaultBackground(eventDiv, isGrayscale);
        }
    }
}

// Function to apply effects (blur/darken/grayscale) to default background (fallback)
function applyEffectsToDefaultBackground(eventDiv, isGrayscale = false) {
    // Always use pseudo-element for historic events (grayscale) or when effects are applied
    if (globalBlurValue > 0 || globalDarkenValue < 100 || isGrayscale) {
        eventDiv.style.position = 'relative';
        eventDiv.style.overflow = 'hidden';
        
        // Remove any existing pseudo-element
        const existingPseudo = eventDiv.querySelector('.background-pseudo');
        if (existingPseudo) {
            existingPseudo.remove();
        }
        
        // Create pseudo-element for filtered default background
        const pseudoElement = document.createElement('div');
        pseudoElement.className = 'background-pseudo';
        
        // Build filter string properly
        let filterString = '';
        if (globalBlurValue > 0) {
            filterString += `blur(${globalBlurValue}px)`;
        }
        if (globalDarkenValue < 100) {
            if (filterString) filterString += ' ';
            filterString += `brightness(${globalDarkenValue}%)`;
        }
        if (isGrayscale) {
            if (filterString) filterString += ' ';
            filterString += 'grayscale(100%)';
        }
        
        pseudoElement.style.cssText = `
            position: absolute;
            top: -10px;
            left: -10px;
            right: -10px;
            bottom: -10px;
            background-image: linear-gradient(rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.2)), url('/images/AQ40-background.png');
            background-size: cover;
            background-position: center;
            filter: ${filterString};
            z-index: 0;
            pointer-events: none;
        `;
        
        eventDiv.insertBefore(pseudoElement, eventDiv.firstChild);
        eventDiv.style.backgroundImage = 'none';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const eventsList = document.getElementById('events-list');
    const historicEventsList = document.getElementById('historic-events-list');
    let lastRefreshTime = null;
    let lastHistoricRefreshTime = null;

    // Load global blur and darken settings
    await loadGlobalBlurSetting();
    await loadGlobalDarkenSetting();

    // The user status and auth UI are now handled by top-bar.js
    // We just need to check if the user is logged in to fetch events.
    async function checkLoginAndFetch() {
        try {
            const response = await fetch('/user');
            const user = await response.json();
            
            if (user.loggedIn) {
                fetchAndDisplayEvents();
                fetchAndDisplayHistoricEvents();
                fetchAndDisplayMyCharacters();
                fetchAndDisplayItemsHallOfFame();
                
                // Show refresh buttons for logged-in users
                showRefreshButtons(true);
            } else {
                document.getElementById('events-list').innerHTML = '<p>Please sign in with Discord to view upcoming events.</p>';
                if (historicEventsList) {
                    document.getElementById('historic-events-list').innerHTML = '<p>Please sign in with Discord to view completed events.</p>';
                }
                const myCharsContainer = document.getElementById('my-characters-list');
                if (myCharsContainer) {
                    myCharsContainer.innerHTML = '<p>Please sign in to see your characters.</p>';
                }
                
                const hallOfFameContainer = document.getElementById('items-hall-of-fame-list');
                if (hallOfFameContainer) {
                    hallOfFameContainer.innerHTML = '<p>Please sign in to view the hall of fame.</p>';
                }
                
                // Hide refresh buttons for non-logged-in users
                showRefreshButtons(false);
            }
        } catch (error) {
            console.error('Error checking user status:', error);
            showRefreshButtons(false);
        }
    }
    
    // Function to show/hide refresh buttons based on login status
    function showRefreshButtons(show) {
        const upcomingRefreshBtn = document.getElementById('refresh-events-btn');
        const historicRefreshBtn = document.getElementById('refresh-historic-events-btn');
        
        if (upcomingRefreshBtn) {
            upcomingRefreshBtn.style.display = show ? 'inline-flex' : 'none';
        }
        if (historicRefreshBtn) {
            historicRefreshBtn.style.display = show ? 'inline-flex' : 'none';
        }
    }

    // Function to fetch and display event duration
    async function fetchEventDuration(eventId, delay = 0) {
        const durationElement = document.getElementById(`duration-${eventId}`);
        if (!durationElement) return;

        // Add delay to prevent overwhelming the server
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch(`/api/event-duration/${eventId}`, {
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.success && data.duration && typeof data.duration === 'number') {
                // Format duration like the raidlogs page
                const totalMinutes = data.duration;
                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;
                
                let formattedDuration;
                if (hours > 0) {
                    formattedDuration = `${hours}h ${minutes}m`;
                } else {
                    formattedDuration = `${totalMinutes}m`;
                }
                
                durationElement.innerHTML = `<p><i class="far fa-clock event-icon"></i> Time: ${formattedDuration}</p>`;
            } else {
                durationElement.innerHTML = `<p><i class="far fa-clock event-icon"></i> Duration N/A</p>`;
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn(`Duration fetch timeout for event ${eventId}`);
            } else {
                console.warn(`Error fetching duration for event ${eventId}:`, error.message);
            }
            durationElement.innerHTML = `<p><i class="far fa-clock event-icon"></i> Duration N/A</p>`;
        }
    }

    // Function to fetch and display event gold pot
    async function fetchEventGoldPot(eventId, delay = 0) {
        const goldPotElement = document.getElementById(`goldpot-${eventId}`);
        if (!goldPotElement) return;

        // Add delay to prevent overwhelming the server
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch(`/api/event-goldpot/${eventId}`, {
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.success && typeof data.goldPot === 'number') {
                goldPotElement.innerHTML = `<p><i class="fas fa-coins event-icon"></i> Gold pot: <span style="color: #FFD700;">${data.goldPot}g</span></p>`;
            } else {
                goldPotElement.innerHTML = `<p><i class="fas fa-coins event-icon"></i> Gold pot: <span style="color: #FFD700;">0g</span></p>`;
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.warn(`Error fetching gold pot for event ${eventId}:`, error.message);
            }
            goldPotElement.innerHTML = `<p><i class="fas fa-coins event-icon"></i> Gold pot: <span style="color: #FFD700;">N/A</span></p>`;
        }
    }

    // Function to fetch and display event biggest item
    async function fetchEventBiggestItem(eventId, delay = 0) {
        const biggestItemElement = document.getElementById(`biggestitem-${eventId}`);
        if (!biggestItemElement) return;

        // Add delay to prevent overwhelming the server
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch(`/api/event-biggestitem/${eventId}`, {
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.success && data.itemName) {
                const iconHtml = data.iconLink ? 
                    `<img src="${data.iconLink}" alt="${data.itemName}" class="item-icon-small" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 8px; border-radius: 4px;">` : 
                    `<i class="fas fa-gem event-icon"></i> `;
                biggestItemElement.innerHTML = `<p>${iconHtml}<span style="color: #a335ee;">${data.itemName}</span></p>`;
            } else {
                biggestItemElement.innerHTML = `<p><i class="fas fa-gem event-icon"></i> None</p>`;
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.warn(`Error fetching biggest item for event ${eventId}:`, error.message);
            }
            biggestItemElement.innerHTML = `<p><i class="fas fa-gem event-icon"></i> N/A</p>`;
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

    // Function to fetch and display Items Hall of Fame
    async function fetchAndDisplayItemsHallOfFame() {
        const hallOfFameContainer = document.getElementById('items-hall-of-fame-list');
        if (!hallOfFameContainer) return; // Don't run if the container doesn't exist

        hallOfFameContainer.innerHTML = '<p>Loading hall of fame...</p>';

        try {
            const response = await fetch('/api/items-hall-of-fame');
            if (!response.ok) {
                hallOfFameContainer.innerHTML = '<p>Could not load items. Are you signed in?</p>';
                return;
            }

            const data = await response.json();

            if (data.success && data.items && data.items.length > 0) {
                hallOfFameContainer.innerHTML = ''; // Clear loading message
                const list = document.createElement('div');
                list.classList.add('hall-of-fame-list');
                
                data.items.forEach((item, index) => {
                    const itemDiv = document.createElement('div');
                    itemDiv.classList.add('hall-of-fame-item');
                    
                    // Format the raid name like completed raids
                    let raidName = 'Unknown Raid';
                    if (item.channelName && item.channelName.trim() && !item.channelName.match(/^\d+$/)) {
                        raidName = item.channelName
                            .replace(/[^\w\s-]/g, '') // Remove emojis and special chars
                            .replace(/-/g, ' ') // Replace dashes with spaces
                            .trim()
                            .split(' ')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(' ');
                    }
                    
                    // Format date if available
                    let dateStr = '';
                    if (item.startTime) {
                        const eventDate = new Date(item.startTime * 1000);
                        const options = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Copenhagen' };
                        dateStr = ` - ${eventDate.toLocaleDateString('en-GB', options)}`;
                    }
                    
                    const raidDisplay = `${raidName}${dateStr}`;
                    
                    const iconHtml = item.iconLink ? 
                        `<img src="${item.iconLink}" alt="${item.itemName}" class="item-icon-large" style="width: 60px; height: 60px; border-radius: 8px; margin-right: 12px; vertical-align: top;">` : 
                        `<div style="width: 60px; height: 60px; background: #666; border-radius: 8px; margin-right: 12px; display: inline-block; vertical-align: top;"></div>`;
                    
                    itemDiv.innerHTML = `
                        <div class="hall-of-fame-content">
                            ${iconHtml}
                            <div class="hall-of-fame-details">
                                <div class="hall-of-fame-item-name" style="color: #a335ee; font-weight: bold; font-size: 14px;">${item.itemName}</div>
                                <div class="hall-of-fame-price" style="color: #FFD700; font-weight: bold; margin: 2px 0;">${item.goldAmount}g</div>
                                <div class="hall-of-fame-info" style="font-size: 12px; margin-top: 2px;">${item.playerName}, ${raidDisplay}</div>
                            </div>
                        </div>
                    `;
                    list.appendChild(itemDiv);
                });
                hallOfFameContainer.appendChild(list);
            } else {
                hallOfFameContainer.innerHTML = '<p>No items found in the hall of fame yet.</p>';
            }

        } catch (error) {
            console.error('Error fetching items hall of fame:', error);
            hallOfFameContainer.innerHTML = '<p>An error occurred while fetching the hall of fame.</p>';
        }
    }

    // 🎯 Discord API functions removed - we now get channel names directly from Raid-Helper API!

    // Function to fetch and display events (now called directly)
    async function fetchAndDisplayEvents() {
        if (!eventsList) return; // Don't run if the container doesn't exist
        
        // Set loading state
        setLoadingState(true);
        eventsList.innerHTML = '<p>Fetching events...</p>';

        try {
            const response = await fetch('/api/events');
            const data = await response.json();

            // Events data received (debug log removed)

            // Use the new helper function to display events
            if (data && data.scheduledEvents) {
                console.log('📅 Found scheduled events:', data.scheduledEvents.length);
                displayEvents(data.scheduledEvents);
                
                // Update last refresh time (only if this was from a cache miss)
                if (!lastRefreshTime || (Date.now() - lastRefreshTime) > 5000) {
                    lastRefreshTime = Date.now();
                    updateLastRefreshDisplay();
                }
            } else {
                eventsList.innerHTML = '<p>No upcoming events found for this server.</p>';
            }
        } catch (error) {
            eventsList.innerHTML = '<p>An error occurred while fetching events. Check console for details.</p>';
            console.error('script.js: Client-side error during fetch operation:', error); // DEBUG LOG S11
        } finally {
            setLoadingState(false);
        }
    }

    // Helper function to set loading state
    function setLoadingState(isLoading) {
        const refreshBtn = document.getElementById('refresh-events-btn');
        if (refreshBtn) {
            refreshBtn.disabled = isLoading;
            if (isLoading) {
                refreshBtn.classList.add('loading');
            } else {
                refreshBtn.classList.remove('loading');
            }
        }
    }

    // Helper function to set loading state for historic events
    function setHistoricLoadingState(isLoading) {
        const refreshBtn = document.getElementById('refresh-historic-events-btn');
        if (refreshBtn) {
            refreshBtn.disabled = isLoading;
            if (isLoading) {
                refreshBtn.classList.add('loading');
            } else {
                refreshBtn.classList.remove('loading');
            }
        }
    }
    
    // Helper function to update last refresh display
    function updateLastRefreshDisplay() {
        const lastRefreshElement = document.getElementById('last-refresh');
        if (lastRefreshElement && lastRefreshTime) {
            const now = Date.now();
            const diffMs = now - lastRefreshTime;
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            
            if (diffMinutes < 1) {
                lastRefreshElement.textContent = 'Last refresh: Just now';
            } else if (diffMinutes === 1) {
                lastRefreshElement.textContent = 'Last refresh: 1 min ago';
            } else {
                lastRefreshElement.textContent = `Last refresh: ${diffMinutes} min ago`;
            }
        }
    }

    // Helper function to update last historic refresh display
    function updateLastHistoricRefreshDisplay() {
        const lastRefreshElement = document.getElementById('last-historic-refresh');
        if (lastRefreshElement && lastHistoricRefreshTime) {
            const now = Date.now();
            const diffMs = now - lastHistoricRefreshTime;
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            
            if (diffMinutes < 1) {
                lastRefreshElement.textContent = 'Last refresh: Just now';
            } else if (diffMinutes === 1) {
                lastRefreshElement.textContent = 'Last refresh: 1 min ago';
            } else {
                lastRefreshElement.textContent = `Last refresh: ${diffMinutes} min ago`;
            }
        }
    }

    // Refresh events functionality
    async function refreshEvents() {
        const refreshBtn = document.getElementById('refresh-events-btn');
        const refreshStatus = document.getElementById('refresh-status');
        
        if (!refreshBtn || !refreshStatus) return;
        
        try {
            // Update UI to show loading state
            setLoadingState(true);
            refreshStatus.textContent = 'Refreshing events...';
            refreshStatus.className = 'refresh-status';
            
            // Call the refresh endpoint
            const response = await fetch('/api/events/refresh', {
                method: 'POST'
            });
            
            if (response.status === 401) {
                throw new Error('Please sign in with Discord to refresh events');
            }
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Success - update the events display with fresh data
            refreshStatus.textContent = 'Events refreshed successfully!';
            refreshStatus.className = 'refresh-status success';
            
            // Update last refresh time
            lastRefreshTime = Date.now();
            updateLastRefreshDisplay();
            
            // Update the events list with the fresh data
            if (data.scheduledEvents) {
                displayEvents(data.scheduledEvents);
            } else {
                // Fallback: re-fetch events normally
                fetchAndDisplayEvents();
            }
            
            // Clear success message after 3 seconds
            setTimeout(() => {
                refreshStatus.textContent = '';
                refreshStatus.className = 'refresh-status';
            }, 3000);
            
        } catch (error) {
            console.error('Error refreshing events:', error);
            refreshStatus.textContent = 'Failed to refresh events. Please try again.';
            refreshStatus.className = 'refresh-status error';
            
            // Clear error message after 5 seconds
            setTimeout(() => {
                refreshStatus.textContent = '';
                refreshStatus.className = 'refresh-status';
            }, 5000);
        } finally {
            // Reset button state
            setLoadingState(false);
        }
    }
    
    // Helper function to display events (extracted from fetchAndDisplayEvents)
    function displayEvents(scheduledEvents) {
        if (!eventsList) return;
        
        if (scheduledEvents && Array.isArray(scheduledEvents) && scheduledEvents.length > 0) {
            console.log('📅 Displaying events:', scheduledEvents.length);
            eventsList.innerHTML = ''; // Clear previous content
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const upcomingEvents = scheduledEvents.filter(event => {
                try {
                    if (typeof event.startTime !== 'number') {
                        return false;
                    }
                    const eventStartDate = new Date(event.startTime * 1000);
                    return eventStartDate >= today;
                } catch (error) {
                    return false;
                }
            });
            
            if (upcomingEvents.length === 0) {
                eventsList.innerHTML = '<p>No upcoming events found for this server.</p>';
                return;
            }
            
            upcomingEvents.sort((a, b) => a.startTime - b.startTime);
            
            upcomingEvents.forEach((event, index) => {
                try {
                    const eventDiv = document.createElement('div');
                    eventDiv.classList.add('event-panel');
                    eventDiv.setAttribute('data-event-index', index);
                    
                    const eventId = event.id || 'unknown';
                    const eventTitle = event.title || 'Untitled Event';
                    
                    // Apply channel-specific background if available
                    if (event.channelId) {
                        applyChannelBackground(eventDiv, event.channelId, false); // false = color (upcoming)
                    }

                    if (eventId !== 'unknown') {
                        eventDiv.style.cursor = 'pointer';
                        eventDiv.addEventListener('click', () => {
                            // Set active session in localStorage
                            localStorage.setItem('activeEventSession', eventId);
                            console.log('🎯 Set active event session from events page:', eventId);
                            
                            // Update raid bar if function is available
                            if (typeof updateRaidBar === 'function') {
                                updateRaidBar();
                            }
                            
                            window.location.href = `/event/${eventId}/roster`;
                        });
                    }

                    const eventStartDate = new Date(event.startTime * 1000);
                    const cetTimeZone = 'Europe/Copenhagen';
                    const nowInCET = new Date();
                    const todayAtMidnightCET = new Date(nowInCET.toLocaleDateString('en-CA', { timeZone: cetTimeZone }));
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
                    const signUpCount = event.signUpCount || '0';
                    
                    let channelDisplayName = '#unknown-channel';
                    if (event.channelName && 
                        event.channelName.trim() && 
                        event.channelName !== event.channelId &&
                        !event.channelName.match(/^\d+$/)) {
                        channelDisplayName = `#${event.channelName}`;
                    } else if (event.channelId) {
                        channelDisplayName = `#channel-${event.channelId.slice(-4)}`;
                    }

                    eventDiv.innerHTML = `
                        <h3>${eventTitle}</h3>
                        <div class="event-time-info">
                            <p><i class="far fa-calendar-alt event-icon"></i> ${dateDisplayHTML}</p>
                            <p><i class="far fa-clock event-icon"></i> ${formattedStartTime}</p>
                            <p><i class="fas fa-user event-icon"></i> ${signUpCount} Signed</p>
                            <p class="channel-info"><i class="fas fa-hashtag event-icon"></i> ${channelDisplayName}</p>
                        </div>
                    `;
                    eventsList.appendChild(eventDiv);
                } catch (renderError) {
                    console.error('Error rendering event:', renderError);
                }
            });
        } else {
            eventsList.innerHTML = '<p>No upcoming events found for this server.</p>';
        }
        }

    // Function to fetch and display historic events
    async function fetchAndDisplayHistoricEvents() {
        if (!historicEventsList) return; // Don't run if the container doesn't exist
        
        // Set loading state
        setHistoricLoadingState(true);
        historicEventsList.innerHTML = '<p>Fetching completed events...</p>';

        try {
            const response = await fetch('/api/events/historic');
            const data = await response.json();

            // Use the helper function to display historic events
            if (data && data.scheduledEvents) {
                console.log('📅 Found completed events:', data.scheduledEvents.length);
                displayHistoricEvents(data.scheduledEvents);
                
                // Update last refresh time (only if this was from a cache miss)
                if (!lastHistoricRefreshTime || (Date.now() - lastHistoricRefreshTime) > 5000) {
                    lastHistoricRefreshTime = Date.now();
                    updateLastHistoricRefreshDisplay();
                }
            } else {
                historicEventsList.innerHTML = '<p>No historic events found for this server.</p>';
            }
        } catch (error) {
            historicEventsList.innerHTML = '<p>An error occurred while fetching completed events. Check console for details.</p>';
            console.error('script.js: Client-side error during completed events fetch operation:', error);
        } finally {
            setHistoricLoadingState(false);
        }
    }

            // Helper function to display completed events (similar to displayEvents but for past events)
    function displayHistoricEvents(scheduledEvents) {
        if (!historicEventsList) return;
        
        if (scheduledEvents && Array.isArray(scheduledEvents) && scheduledEvents.length > 0) {
            console.log('📅 Displaying completed events:', scheduledEvents.length);
            historicEventsList.innerHTML = ''; // Clear previous content
            
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
            
            const historicEvents = scheduledEvents.filter(event => {
                try {
                    if (typeof event.startTime !== 'number') {
                        return false;
                    }
                    const eventStartDate = new Date(event.startTime * 1000);
                    return eventStartDate < now && eventStartDate >= thirtyDaysAgo;
                } catch (error) {
                    return false;
                }
            });
            
            if (historicEvents.length === 0) {
                historicEventsList.innerHTML = '<p>No completed events found for the last 30 days.</p>';
                return;
            }
            
            // Sort newest first for historic events
            historicEvents.sort((a, b) => b.startTime - a.startTime);
            
            historicEvents.forEach((event, index) => {
                try {
                    const eventDiv = document.createElement('div');
                    eventDiv.classList.add('event-panel', 'historic');
                    eventDiv.setAttribute('data-event-index', index);
                    
                    const eventId = event.id || 'unknown';
                    const eventTitle = event.title || 'Untitled Event';
                    
                    // Apply channel-specific background if available
                    if (event.channelId) {
                        applyChannelBackground(eventDiv, event.channelId, true); // true = grayscale (historic)
                    }

                    if (eventId !== 'unknown') {
                        eventDiv.style.cursor = 'pointer';
                        eventDiv.addEventListener('click', () => {
                            // Set active session in localStorage
                            localStorage.setItem('activeEventSession', eventId);
                            console.log('🎯 Set active event session from completed events:', eventId);
                            
                            // Update raid bar if function is available
                            if (typeof updateRaidBar === 'function') {
                                updateRaidBar();
                            }
                            
                            window.location.href = `/event/${eventId}/roster`;
                        });
                    }

                    const eventStartDate = new Date(event.startTime * 1000);
                    const cetTimeZone = 'Europe/Copenhagen';

                    // For completed events, get just the date in DD/MM/YYYY format
                    const optionsDate = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: cetTimeZone };
                    const formattedDate = eventStartDate.toLocaleDateString('en-GB', optionsDate);
                    
                    // Get and format channel name
                    let channelName = 'Unknown Channel';
                    if (event.channelName && 
                        event.channelName.trim() && 
                        event.channelName !== event.channelId &&
                        !event.channelName.match(/^\d+$/)) {
                        channelName = event.channelName;
                    } else if (event.channelId) {
                        channelName = `channel-${event.channelId.slice(-4)}`;
                    }
                    
                    // Clean and format channel name: remove emojis, replace dashes with spaces, capitalize words
                    const cleanChannelName = channelName
                        .replace(/[^\w\s-]/g, '') // Remove emojis and special chars except dashes and spaces
                        .replace(/-/g, ' ') // Replace dashes with spaces
                        .trim()
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ');
                    
                    // Create the combined headline: "Channel Name - DD/MM/YYYY"
                    const combinedHeadline = `${cleanChannelName} - ${formattedDate}`;

                    eventDiv.innerHTML = `
                        <h3>${combinedHeadline}</h3>
                        <div class="raid-duration" id="duration-${eventId}">
                            <p><i class="far fa-clock event-icon"></i> Loading...</p>
                        </div>
                        <div class="gold-pot" id="goldpot-${eventId}">
                            <p><i class="fas fa-coins event-icon"></i> Gold pot: Loading...</p>
                        </div>
                        <div class="biggest-item" id="biggestitem-${eventId}">
                            <p><i class="fas fa-gem event-icon"></i> Loading...</p>
                        </div>
                    `;
                    historicEventsList.appendChild(eventDiv);
                    
                    // Fetch scheduled duration, gold pot, and biggest item for this event with staggered delay
                    const delay = index * 300; // 300ms delay between each request  
                    fetchEventDuration(eventId, delay);
                    fetchEventGoldPot(eventId, delay + 100); // Small additional delay
                    fetchEventBiggestItem(eventId, delay + 200); // Small additional delay
                } catch (renderError) {
                    console.error('Error rendering completed event:', renderError);
                }
            });
        } else {
            historicEventsList.innerHTML = '<p>No completed events found for the last 30 days.</p>';
        }
    }

    // Refresh historic events functionality
    async function refreshHistoricEvents() {
        const refreshBtn = document.getElementById('refresh-historic-events-btn');
        const refreshStatus = document.getElementById('refresh-historic-status');
        
        if (!refreshBtn || !refreshStatus) return;
        
        try {
            // Update UI to show loading state
            setHistoricLoadingState(true);
            refreshStatus.textContent = 'Refreshing completed events...';
            refreshStatus.className = 'refresh-status';
            
            // Call the refresh endpoint
            const response = await fetch('/api/events/historic/refresh', {
                method: 'POST'
            });
            
            if (response.status === 401) {
                throw new Error('Please sign in with Discord to refresh completed events');
            }
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Success - update the events display with fresh data
            refreshStatus.textContent = 'Completed events refreshed successfully!';
            refreshStatus.className = 'refresh-status success';
            
            // Update last refresh time
            lastHistoricRefreshTime = Date.now();
            updateLastHistoricRefreshDisplay();
            
            // Update the events list with the fresh data
            if (data.scheduledEvents) {
                displayHistoricEvents(data.scheduledEvents);
            } else {
                // Fallback: re-fetch events normally
                fetchAndDisplayHistoricEvents();
            }
            
            // Clear success message after 3 seconds
            setTimeout(() => {
                refreshStatus.textContent = '';
                refreshStatus.className = 'refresh-status';
            }, 3000);
            
        } catch (error) {
            console.error('Error refreshing completed events:', error);
            refreshStatus.textContent = 'Failed to refresh completed events. Please try again.';
            refreshStatus.className = 'refresh-status error';
            
            // Clear error message after 5 seconds
            setTimeout(() => {
                refreshStatus.textContent = '';
                refreshStatus.className = 'refresh-status';
            }, 5000);
        } finally {
            // Reset button state
            setHistoricLoadingState(false);
        }
    }
    
    // Add event listener for refresh button (no nested DOMContentLoaded needed)
    const refreshBtn = document.getElementById('refresh-events-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshEvents);
    }

    // Add event listener for historic refresh button
    const historicRefreshBtn = document.getElementById('refresh-historic-events-btn');
    if (historicRefreshBtn) {
        historicRefreshBtn.addEventListener('click', refreshHistoricEvents);
    }

    // Update last refresh timestamp every minute
    setInterval(() => {
        if (lastRefreshTime) {
            updateLastRefreshDisplay();
        }
        if (lastHistoricRefreshTime) {
            updateLastHistoricRefreshDisplay();
        }
    }, 60000); // Update every minute

    // Function to apply effects to all existing event panels on page load
    function applyEffectsToAllPanels() {
        const eventPanels = document.querySelectorAll('.event-panel');
        eventPanels.forEach(panel => {
            // Only apply if it doesn't already have a pseudo-element
            if (!panel.querySelector('.background-pseudo')) {
                const isHistoric = panel.classList.contains('historic');
                // Apply pseudo-element if effects are enabled OR if it's a historic panel (needs grayscale)
                if (globalBlurValue > 0 || globalDarkenValue < 100 || isHistoric) {
                    applyEffectsToDefaultBackground(panel, isHistoric);
                }
            }
        });
    }

    // Apply effects to any existing panels after loading the setting
    setTimeout(applyEffectsToAllPanels, 500);

    // Add a simple test to verify blur is working for both types
    setTimeout(() => {
        const upcomingPanels = document.querySelectorAll('.event-panel:not(.historic)');
        const historicPanels = document.querySelectorAll('.event-panel.historic');
        console.log(`🔍 Panel verification - Upcoming: ${upcomingPanels.length}, Historic: ${historicPanels.length}, Blur setting: ${globalBlurValue}px`);
        
        if (globalBlurValue > 0) {
            upcomingPanels.forEach((panel, index) => {
                const pseudo = panel.querySelector('.background-pseudo');
                console.log(`📅 Upcoming panel ${index + 1}: ${pseudo ? '✅ Has blur pseudo-element' : '❌ Missing blur pseudo-element'}`);
                
                if (pseudo) {
                    const computedStyle = window.getComputedStyle(pseudo);
                    console.log(`🔍 Upcoming panel ${index + 1} pseudo styles:`, {
                        backgroundImage: computedStyle.backgroundImage,
                        filter: computedStyle.filter,
                        zIndex: computedStyle.zIndex,
                        position: computedStyle.position,
                        display: computedStyle.display,
                        opacity: computedStyle.opacity,
                        visibility: computedStyle.visibility
                    });
                }
            });
            
            historicPanels.forEach((panel, index) => {
                const pseudo = panel.querySelector('.background-pseudo');
                console.log(`📚 Historic panel ${index + 1}: ${pseudo ? '✅ Has blur pseudo-element' : '❌ Missing blur pseudo-element'}`);
                
                if (pseudo && index === 0) { // Just check the first one for comparison
                    const computedStyle = window.getComputedStyle(pseudo);
                    console.log(`🔍 Historic panel ${index + 1} pseudo styles:`, {
                        backgroundImage: computedStyle.backgroundImage,
                        filter: computedStyle.filter,
                        zIndex: computedStyle.zIndex,
                        position: computedStyle.position,
                        display: computedStyle.display,
                        opacity: computedStyle.opacity,
                        visibility: computedStyle.visibility
                    });
                }
            });
        }
    }, 2000);

    // Initial check on page load
    checkLoginAndFetch();
});