// public/players.js
document.addEventListener('DOMContentLoaded', async () => {
    const playerListContainer = document.getElementById('player-list-container');

    async function fetchAndDisplayPlayers() {
        try {
            const response = await fetch('/api/players');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const players = await response.json();

            if (players && players.length > 0) {
                playerListContainer.innerHTML = ''; // Clear loading message

                const table = document.createElement('table');
                table.classList.add('player-table');

                // Create table header
                const thead = document.createElement('thead');
                thead.innerHTML = `
                    <tr>
                        <th>Character Name</th>
                        <th>Discord ID</th>
                        <th>Class</th>
                    </tr>
                `;
                table.appendChild(thead);

                // Create table body
                const tbody = document.createElement('tbody');
                players.forEach(player => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${player.character_name}</td>
                        <td>${player.discord_id}</td>
                        <td class="class-${player.class.toLowerCase()}">${player.class}</td>
                    `;
                    tbody.appendChild(row);
                });
                table.appendChild(tbody);

                playerListContainer.appendChild(table);
            } else {
                playerListContainer.innerHTML = '<p>No players found in the database.</p>';
            }
        } catch (error) {
            console.error('Error fetching players:', error);
            playerListContainer.innerHTML = '<p>An error occurred while fetching the player list. Please check the console.</p>';
        }
    }

    fetchAndDisplayPlayers();
}); 