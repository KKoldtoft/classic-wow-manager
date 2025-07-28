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
        
        // Add Admin settings option only for management users
        if (user.hasManagementRole) {
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
}

// Scroll behavior for sticky header
let lastScrollTop = 0;
let scrollTimeout = null;

function handleScroll() {
    const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const topBar = document.querySelector('.top-bar');
    
    if (!topBar) return;
    
    // Clear any existing timeout
    if (scrollTimeout) {
        clearTimeout(scrollTimeout);
    }
    
    // Only hide/show after user stops scrolling rapidly
    scrollTimeout = setTimeout(() => {
        if (currentScrollTop > lastScrollTop && currentScrollTop > 60) {
            // Scrolling down - hide the bar
            topBar.classList.add('hidden');
        } else {
            // Scrolling up - show the bar
            topBar.classList.remove('hidden');
        }
        
        // Handle opacity based on scroll position
        if (currentScrollTop > 0) {
            // Not at top - reduce opacity
            topBar.classList.add('scrolled');
        } else {
            // At top - full opacity
            topBar.classList.remove('scrolled');
        }
        
        lastScrollTop = currentScrollTop <= 0 ? 0 : currentScrollTop; // For Mobile or negative scrolling
    }, 50); // Small delay to prevent excessive triggering
}

// Run the functions when the document is ready.
document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    highlightActiveNav();

    // Add scroll listener for sticky header behavior
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Global click listener to close the dropdown
    window.addEventListener('click', () => {
        const dropdown = document.getElementById('user-dropdown-menu');
        if (dropdown && dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
        }
    });
}); 