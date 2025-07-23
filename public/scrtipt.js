// public/script.js
document.addEventListener('DOMContentLoaded', async () => {
    const authContainer = document.getElementById('auth-container');

    // Function to fetch user status
    async function getUserStatus() {
        try {
            const response = await fetch('/user');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching user status:', error);
            return { loggedIn: false };
        }
    }

    // Function to update the UI based on login status
    async function updateAuthUI() {
        const user = await getUserStatus();

        if (user.loggedIn) {
            // User is logged in, display avatar
            const avatarUrl = user.avatar
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
                : `https://cdn.discordapp.com/embed/avatars/${user.discriminator % 5}.png`; // Default Discord avatar

            authContainer.innerHTML = `
                <img src="${avatarUrl}" alt="${user.username}'s avatar" class="user-avatar" title="Logged in as ${user.username}#${user.discriminator}\nClick to Logout">
            `;
            // Add logout functionality to the avatar
            authContainer.querySelector('.user-avatar').addEventListener('click', () => {
                window.location.href = '/auth/logout';
            });
        } else {
            // User is not logged in, display login button
            authContainer.innerHTML = `
                <button class="discord-button" onclick="window.location.href='/auth/discord'">
                    <i class="fab fa-discord discord-icon"></i>
                    Sign in with Discord
                </button>
            `;
        }
    }

    // Initial UI update
    updateAuthUI();
});