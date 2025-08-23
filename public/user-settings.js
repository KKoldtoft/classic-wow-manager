// public/user-settings.js

document.addEventListener('DOMContentLoaded', async () => {
    await loadUserCharacters();
    await loadAccountInfo();
});

async function loadUserCharacters() {
    const charactersContainer = document.getElementById('user-characters-list');
    
    try {
        const response = await fetch('/api/my-characters');
        if (!response.ok) {
            if (response.status === 401) {
                charactersContainer.innerHTML = '<p class="error-message">Please sign in to view your characters.</p>';
                return;
            }
            throw new Error('Failed to fetch characters');
        }

        const characters = await response.json();

        if (characters && characters.length > 0) {
            charactersContainer.innerHTML = ''; // Clear loading message
            
            const charactersList = document.createElement('div');
            charactersList.classList.add('characters-grid');
            
            characters.forEach(char => {
                const characterCard = document.createElement('div');
                characterCard.classList.add('character-card', `class-${char.class.toLowerCase().replace(/\s+/g, '-')}`);
                
                characterCard.innerHTML = `
                    <div class="character-header">
                        <h3 class="character-name">${char.character_name}</h3>
                        <span class="character-level">Level ${char.level || 'Unknown'}</span>
                    </div>
                    <div class="character-details">
                        <div class="character-class">${char.class}</div>
                        <div class="character-race">${char.race}</div>
                        ${char.guild ? `<div class="character-guild">&lt;${char.guild}&gt;</div>` : ''}
                    </div>
                    <div class="character-meta">
                        <small>Added: ${new Date(char.created_at).toLocaleDateString()}</small>
                    </div>
                `;
                
                charactersList.appendChild(characterCard);
            });
            
            charactersContainer.appendChild(charactersList);
        } else {
            charactersContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-slash"></i>
                    <h3>No Characters Found</h3>
                    <p>You haven't added any characters yet. Add your first character to get started!</p>
                    <a href="/roster" class="btn btn-primary">
                        <i class="fas fa-plus"></i> Add Character
                    </a>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading characters:', error);
        charactersContainer.innerHTML = '<p class="error-message">Failed to load characters. Please try again later.</p>';
    }
}

async function loadAccountInfo() {
    const accountInfoContainer = document.getElementById('account-info');
    
    try {
        const response = await fetch('/user');
        if (!response.ok) {
            throw new Error('Failed to fetch account info');
        }

        const user = await response.json();

        if (user.loggedIn) {
            const avatarUrl = user.avatar
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
                : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`;

            accountInfoContainer.innerHTML = `
                <div class="account-details">
                    <div class="account-avatar">
                        <img src="${avatarUrl}" alt="${user.username}'s avatar">
                    </div>
                    <div class="account-info-text">
                        <div class="info-row">
                            <strong>Username:</strong> ${user.username}
                        </div>
                        <div class="info-row">
                            <strong>Discord ID:</strong> ${user.id}
                        </div>
                        ${user.email ? `<div class="info-row"><strong>Email:</strong> ${user.email}</div>` : ''}
                        <div class="info-row">
                            <strong>Role:</strong> ${user.hasManagementRole ? 'Management' : 'Member'}
                            ${user.hasManagementRole ? '<i class="fas fa-crown" style="color: #ffd700; margin-left: 5px;"></i>' : ''}
                        </div>
                    </div>
                </div>
            `;
        } else {
            accountInfoContainer.innerHTML = '<p class="error-message">Not logged in</p>';
        }
    } catch (error) {
        console.error('Error loading account info:', error);
        accountInfoContainer.innerHTML = '<p class="error-message">Failed to load account information.</p>';
    }
} 