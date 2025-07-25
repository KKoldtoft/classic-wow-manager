// public/roster-api.js

async function fetchRoster(eventId) {
    const response = await fetch(`/api/roster/${eventId}`);
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch roster');
    }
    return response.json();
}

async function updatePlayerCharacter(eventId, discordUserId, newCharacterName, newCharacterClass) {
    const response = await fetch(`/api/roster/${eventId}/player/${discordUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            characterName: newCharacterName,
            characterClass: newCharacterClass
        }),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update player');
    }
    return response.json();
}

async function revertToUnmanaged(eventId) {
    const response = await fetch(`/api/roster/${eventId}/revert`, {
        method: 'POST',
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to revert roster');
    }
    return response.json();
}

async function updatePlayerSpec(eventId, discordUserId, newSpecName) {
    const response = await fetch(`/api/roster/${eventId}/player/${discordUserId}/spec`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specName: newSpecName }),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update player spec');
    }
    return response.json();
} 