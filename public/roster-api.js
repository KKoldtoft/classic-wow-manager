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

async function togglePlayerInRaid(eventId, discordUserId, inRaid) {
    const response = await fetch(`/api/roster/${eventId}/player/${discordUserId}/in-raid`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inRaid }),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to toggle in-raid status');
    }
    return response.json();
}

async function updatePlayerPosition(eventId, discordUserId, targetPartyId, targetSlotId) {
    const response = await fetch(`/api/roster/${eventId}/player/${discordUserId}/position`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPartyId, targetSlotId }),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update player position');
    }
    return response.json();
} 

async function movePlayerToBench(eventId, discordUserId) {
    const response = await fetch(`/api/roster/${eventId}/player/${discordUserId}/bench`, {
        method: 'POST',
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to move player to bench');
    }
    return response.json();
} 

async function getRegisteredCharacter(discordUserId) {
    const response = await fetch(`/api/registered-character/${discordUserId}`);
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to get registered character');
    }
    return response.json();
} 

async function addCharacterToRoster(eventId, characterData, targetPartyId, targetSlotId) {
    const response = await fetch(`/api/roster/${eventId}/add-character`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            characterName: characterData.characterName,
            class: characterData.class,
            discordId: characterData.discordId,
            spec: characterData.spec,
            targetPartyId: targetPartyId,
            targetSlotId: targetSlotId
        }),
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 409) {
            // This is a conflict that needs user confirmation
            const conflictError = new Error(errorData.message || 'Character conflict detected');
            conflictError.isConflict = true;
            conflictError.conflictData = errorData;
            throw conflictError;
        }
        throw new Error(errorData.message || 'Failed to add character to roster');
    }
    return response.json();
}

async function addCharacterToRosterForce(eventId, characterData, targetPartyId, targetSlotId) {
    const response = await fetch(`/api/roster/${eventId}/add-character/force`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            characterName: characterData.characterName,
            class: characterData.class,
            discordId: characterData.discordId,
            spec: characterData.spec,
            targetPartyId: targetPartyId,
            targetSlotId: targetSlotId
        }),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to force add character to roster');
    }
    return response.json();
}

async function addExistingPlayerToRoster(eventId, characterData, targetPartyId, targetSlotId) {
    const response = await fetch(`/api/roster/${eventId}/add-existing-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            characterName: characterData.characterName,
            class: characterData.class,
            discordId: characterData.discordId,
            spec: characterData.spec,
            targetPartyId: targetPartyId,
            targetSlotId: targetSlotId
        }),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add existing player to roster');
    }
    return response.json();
}

// Event metadata: raidleader and cut
async function getEventRaidleader(eventId) {
    const r = await fetch(`/api/events/${encodeURIComponent(eventId)}/raidleader`);
    if (!r.ok) return { success: false };
    return r.json();
}

// Replace assignments across all panels: replace occurrences of sourceName with targetName
async function replaceAssignments(eventId, sourceName, targetName, matchMode = 'exact') {
    const lowerSrc = String(sourceName||'').trim().toLowerCase();
    const lowerTgt = String(targetName||'').trim().toLowerCase();
    if (!lowerSrc || !lowerTgt) throw new Error('Missing names');

    // Prefer backend bulk-safe endpoint to handle class/spec/color and accept states
    const resp = await fetch(`/api/assignments/${encodeURIComponent(eventId)}/replace-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromName: sourceName, toName: targetName, matchMode })
    });
    if (!resp.ok) {
        const err = await resp.json().catch(()=>({message:'Failed to replace assignments'}));
        throw new Error(err.message || 'Failed to replace assignments');
    }
    const data = await resp.json();
    return { replacedCount: Number(data.replacedCount||0), replacedList: Array.isArray(data.replacedList)?data.replacedList:[] };
}

async function setEventRaidleader(eventId, raidleaderName, raidleaderCut) {
    const r = await fetch(`/api/events/${encodeURIComponent(eventId)}/raidleader`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raidleaderName, raidleaderCut })
    });
    if (!r.ok) {
        const err = await r.json().catch(()=>({message:'Failed'}));
        throw new Error(err.message || 'Failed to save raidleader');
    }
    return r.json();
}
// Check if a player exists in the players table by exact (discord_id, character_name, class)
async function checkPlayerExists(discordUserId, characterName, characterClass) {
    const url = `/api/players/search?q=${encodeURIComponent(characterName)}`;
    const response = await fetch(url);
    if (!response.ok) return false;
    const rows = await response.json();
    const lowerName = (characterName || '').toLowerCase();
    const lowerClass = (characterClass || '').toLowerCase();
    return rows.some(r => (r.discord_id === discordUserId) && (r.character_name?.toLowerCase() === lowerName) && (r.class?.toLowerCase() === lowerClass));
}

// Fix a player's character name in the players table (and update the roster override name for the given event)
async function fixPlayerName(discordUserId, oldName, newName, characterClass, eventId) {
    const response = await fetch(`/api/players/${discordUserId}/fix-name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName, newName, characterClass, eventId })
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fix player name');
    }
    return response.json();
}