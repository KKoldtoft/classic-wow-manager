// public/top-bar.js

// This function fetches the user's login status from the server.
async function getUserStatus() {
    try {
        const response = await fetch('/user');
        if (!response.ok) return { loggedIn: false };
        return await response.json();
    } catch (error) {
        console.error('Error fetching user status:', error);
        return { loggedIn: false };
    }
}

// This function updates the top bar UI based on the user's login status.
async function updateAuthUI() {
    const authContainer = document.getElementById('auth-container');
    if (!authContainer) return;

    const user = await getUserStatus();

    if (user.loggedIn && user.username) {
        const avatarUrl = user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=32`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`;

        // Build dropdown menu items based on user permissions
        let dropdownItems = `<a href="/user-settings" class="dropdown-item">User settings</a>`;
        
        // Add management-only options for users with Management role
        if (user.hasManagementRole) {
            dropdownItems += `<a href="/logs" class="dropdown-item">Logs</a>`;
            dropdownItems += `<a href="/admin" class="dropdown-item">Admin settings</a>`;
        }
        
        dropdownItems += `<a href="/auth/logout" class="dropdown-item">Logout</a>`;

        authContainer.innerHTML = `
            <div class="user-info">
                <span class="user-name">${user.username}</span>
                <img src="${avatarUrl}" alt="${user.username}'s avatar" class="user-avatar-small" id="user-avatar-toggle">
                <div class="user-dropdown" id="user-dropdown-menu">
                    ${dropdownItems}
                </div>
            </div>
        `;

        // Add event listener for the new dropdown
        const avatarToggle = document.getElementById('user-avatar-toggle');
        const dropdownMenu = document.getElementById('user-dropdown-menu');
        
        avatarToggle.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevents the window click listener from firing immediately
            dropdownMenu.classList.toggle('show');
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

// This function highlights the active navigation link based on the current page.
function highlightActiveNav() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.top-nav-link');
    
    navLinks.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
    
    // Also highlight raid navigation links
    highlightActiveRaidNav();
}

// This function highlights the active raid navigation link based on the current page.
function highlightActiveRaidNav() {
    const currentPath = window.location.pathname;
    const raidNavLinks = document.querySelectorAll('.raid-nav-link');
    
    raidNavLinks.forEach(link => {
        const linkHref = link.getAttribute('href');
        
        // Special handling for different paths
        if (currentPath === '/gold' && link.id === 'raid-goldpot-link') {
            link.classList.add('active');
        } else if (currentPath === '/raidlogs' && link.id === 'raid-logs-link') {
            link.classList.add('active');
        } else if (currentPath.includes('/roster') && link.id === 'raid-roster-link') {
            link.classList.add('active');
        } else if (currentPath === '/attendance' && linkHref === '/attendance') {
            link.classList.add('active');
        } else if (linkHref && linkHref === currentPath) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Scroll behavior for sticky header
let lastScrollTop = 0;
let scrollTimeout = null;

function handleScroll() {
    const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const topBar = document.querySelector('.top-bar');
    const raidBar = document.querySelector('.raid-bar');
    
    if (!topBar) return;
    
    // Clear any existing timeout
    if (scrollTimeout) {
        clearTimeout(scrollTimeout);
    }
    
    // Only hide/show after user stops scrolling rapidly
    scrollTimeout = setTimeout(() => {
        if (currentScrollTop > lastScrollTop && currentScrollTop > 54) {
            // Scrolling down - hide main bar, dock raid bar to top
            topBar.classList.add('hidden');
            if (raidBar && raidBar.style.display !== 'none') {
                raidBar.classList.add('docked-top');
            }
        } else {
            // Scrolling up - show main bar, undock raid bar
            topBar.classList.remove('hidden');
            if (raidBar && raidBar.style.display !== 'none') {
                raidBar.classList.remove('docked-top');
            }
        }
        
        // Handle opacity based on scroll position for both bars
        if (currentScrollTop > 0) {
            // Not at top - reduce opacity
            topBar.classList.add('scrolled');
            if (raidBar && raidBar.style.display !== 'none') {
                raidBar.classList.add('scrolled');
            }
        } else {
            // At top - full opacity
            topBar.classList.remove('scrolled');
            if (raidBar && raidBar.style.display !== 'none') {
                raidBar.classList.remove('scrolled');
            }
        }
        
        lastScrollTop = currentScrollTop <= 0 ? 0 : currentScrollTop; // For Mobile or negative scrolling
    }, 50); // Small delay to prevent excessive triggering
}

// Upcoming Raids Dropdown functionality
async function loadUpcomingRaids() {
    const dropdownMenu = document.getElementById('upcoming-raids-menu');
    if (!dropdownMenu) return;

    try {
        const response = await fetch('/api/events');
        const data = await response.json();

        if (data && data.scheduledEvents && Array.isArray(data.scheduledEvents)) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Filter upcoming events
            const upcomingEvents = data.scheduledEvents.filter(event => {
                if (typeof event.startTime !== 'number') return false;
                const eventStartDate = new Date(event.startTime * 1000);
                return eventStartDate >= today;
            });

            // Sort by start time
            upcomingEvents.sort((a, b) => a.startTime - b.startTime);

            if (upcomingEvents.length === 0) {
                dropdownMenu.innerHTML = '<div class="dropdown-empty">No upcoming raids found</div>';
                return;
            }

            // Generate dropdown items
            let dropdownHTML = '';
            upcomingEvents.forEach(event => {
                const eventId = event.id;
                const eventTitle = event.title || 'Untitled Event';
                const eventStartDate = new Date(event.startTime * 1000);
                
                // Format day and time
                const cetTimeZone = 'Europe/Copenhagen';
                const nowInCET = new Date();
                const todayAtMidnightCET = new Date(nowInCET.toLocaleDateString('en-CA', { timeZone: cetTimeZone }));
                const eventDateOnly = new Date(eventStartDate.toLocaleDateString('en-CA', { timeZone: cetTimeZone }));

                let dayDisplay;
                if (eventDateOnly.getTime() === todayAtMidnightCET.getTime()) {
                    dayDisplay = 'Today';
                } else {
                    const optionsDay = { weekday: 'long', timeZone: cetTimeZone };
                    dayDisplay = eventStartDate.toLocaleDateString('en-US', optionsDay);
                }

                const optionsTime = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: cetTimeZone };
                const timeDisplay = eventStartDate.toLocaleTimeString('en-GB', optionsTime);

                dropdownHTML += `
                    <div class="dropdown-item" data-event-id="${eventId}">
                        <div class="dropdown-item-left">${eventTitle}</div>
                        <div class="dropdown-item-right">
                            <span>${dayDisplay}</span>
                            <span>|</span>
                            <span class="dropdown-item-time">${timeDisplay}</span>
                        </div>
                    </div>
                `;
            });

            dropdownMenu.innerHTML = dropdownHTML;

            // Add click handlers to dropdown items
            dropdownMenu.querySelectorAll('.dropdown-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const eventId = item.dataset.eventId;
                    if (eventId) {
                        // Set active session in localStorage
                        localStorage.setItem('activeEventSession', eventId);
                        console.log('🎯 Set active event session:', eventId);
                        
                        // Navigate to roster page
                        window.location.href = `/event/${eventId}/roster`;
                    }
                });
            });

        } else {
            dropdownMenu.innerHTML = '<div class="dropdown-empty">No events data available</div>';
        }
    } catch (error) {
        console.error('Error loading upcoming raids:', error);
        dropdownMenu.innerHTML = '<div class="dropdown-empty">Error loading raids</div>';
    }
}

function setupUpcomingRaidsDropdown() {
    const dropdownToggle = document.getElementById('upcoming-raids-dropdown');
    const dropdownMenu = document.getElementById('upcoming-raids-menu');

    if (!dropdownToggle || !dropdownMenu) return;

    dropdownToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isOpen = dropdownMenu.classList.contains('show');

        // Close all dropdowns first
        document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
            menu.classList.remove('show');
        });
        document.querySelectorAll('.dropdown-toggle.active').forEach(toggle => {
            toggle.classList.remove('active');
        });

        if (!isOpen) {
            // Open this dropdown
            dropdownMenu.classList.add('show');
            dropdownToggle.classList.add('active');
            
            // Load raids data when opening
            loadUpcomingRaids();
        }
    });
}

// Raid Bar functionality
async function updateRaidBar() {
    const activeEventId = localStorage.getItem('activeEventSession');
    const raidBar = document.getElementById('raid-bar');
    const raidTitle = document.getElementById('raid-title');
    
    if (!raidBar) return;
    
    if (activeEventId) {
        try {
            // Fetch events data to get the raid name
            const response = await fetch('/api/events');
            const data = await response.json();
            
            if (data && data.scheduledEvents) {
                const activeEvent = data.scheduledEvents.find(event => event.id === activeEventId);
                
                if (activeEvent) {
                    // Show the raid bar
                    raidBar.style.display = 'flex';
                    document.body.classList.add('has-raid-bar');
                    
                    // Update raid title
                    if (raidTitle) {
                        raidTitle.textContent = activeEvent.title || 'Unknown Raid';
                    }
                    
                    // Update navigation links
                    updateRaidNavigation(activeEventId);
                    
                    // Highlight active navigation after links are updated
                    setTimeout(() => highlightActiveRaidNav(), 100);
                    
                    console.log('🎯 Raid bar updated for:', activeEvent.title);
                } else {
                    // Event not found, clear the session
                    console.warn('Active event not found in current events, clearing session');
                    localStorage.removeItem('activeEventSession');
                    hideRaidBar();
                }
            }
        } catch (error) {
            console.error('Error updating raid bar:', error);
            hideRaidBar();
        }
    } else {
        hideRaidBar();
    }
}

function hideRaidBar() {
    const raidBar = document.getElementById('raid-bar');
    if (raidBar) {
        raidBar.style.display = 'none';
        document.body.classList.remove('has-raid-bar');
    }
}

function updateRaidNavigation(eventId) {
    const rosterLink = document.getElementById('raid-roster-link');
    const assignmentsLink = document.getElementById('raid-assignments-link');
    const logsLink = document.getElementById('raid-logs-link');
    const goldpotLink = document.getElementById('raid-goldpot-link');
    
    // Update roster link
    if (rosterLink) {
        rosterLink.href = `/event/${eventId}/roster`;
    }
    
    // Assignments and Gold Pot are dead links for now
    if (assignmentsLink) {
        assignmentsLink.href = '#';
        assignmentsLink.addEventListener('click', (e) => {
            e.preventDefault();
            // TODO: Implement assignments functionality
        });
    }
    
    if (goldpotLink) {
        goldpotLink.href = '/gold';
        // Remove any existing event listeners
        goldpotLink.replaceWith(goldpotLink.cloneNode(true));
    }
    
    // Raid Logs link stays as /raidlogs - the raid logs page will use the localStorage session
    if (logsLink) {
        logsLink.href = '/raidlogs';
    }
}

// Run the functions when the document is ready.
document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    highlightActiveNav();
    setupUpcomingRaidsDropdown();
    updateRaidBar();
    
    // Ensure raid navigation highlighting is applied after everything loads
    setTimeout(() => highlightActiveRaidNav(), 200);

    // Add scroll listener for sticky header behavior
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Listen for localStorage changes to update raid bar
    window.addEventListener('storage', (e) => {
        if (e.key === 'activeEventSession') {
            updateRaidBar();
        }
    });

    // Global click listener to close dropdowns
    window.addEventListener('click', () => {
        // Close user dropdown
        const userDropdown = document.getElementById('user-dropdown-menu');
        if (userDropdown && userDropdown.classList.contains('show')) {
            userDropdown.classList.remove('show');
        }

        // Close upcoming raids dropdown
        const raidsDropdown = document.getElementById('upcoming-raids-menu');
        const raidsToggle = document.getElementById('upcoming-raids-dropdown');
        if (raidsDropdown && raidsDropdown.classList.contains('show')) {
            raidsDropdown.classList.remove('show');
            if (raidsToggle) {
                raidsToggle.classList.remove('active');
            }
        }
    });
}); 