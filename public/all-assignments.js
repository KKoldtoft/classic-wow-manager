(function() {
  // Utility: Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getActiveEventId() {
    // Prefer URL param /event/:eventId/assignments/allassignments
    const parts = window.location.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('event');
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    // Fallback to localStorage
    return localStorage.getItem('activeEventSession');
  }

  function classToCssName(cls) {
    return String(cls || 'unknown')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
  }

  function getSpecIconHtml(specName, characterClass, specEmote, specIconUrl, isPlaceholder = false) {
    // Placeholder players get white skull icon
    if (isPlaceholder) {
      return `<i class="fas fa-skull spec-icon-compact placeholder-icon" style="color: #ffffff;" title="Placeholder - No Discord ID"></i>`;
    }
    if (specEmote) {
      return `<img src="https://cdn.discordapp.com/emojis/${specEmote}.png" class="spec-icon-compact" alt="${escapeHtml(specName || '')}" loading="lazy" decoding="async">`;
    }
    const url = specIconUrl || '';
    if (url) return `<img src="${escapeHtml(url)}" class="spec-icon-compact" alt="${escapeHtml(specName || '')}" loading="lazy" decoding="async">`;
    const canonicalClass = (characterClass || 'Unknown').trim();
    return `<i class="fas fa-user-circle spec-icon-compact unknown-spec" style="color: #aaa;" title="${escapeHtml(canonicalClass)}"></i>`;
  }

  const VALID_CLASS_SET = new Set(['warrior','paladin','hunter','rogue','priest','shaman','mage','warlock','druid']);

  function canonicalizeClass(rawClass, rosterFallback) {
    const a = String(rawClass || '').trim().toLowerCase();
    const b = String(rosterFallback || '').trim().toLowerCase();
    let candidate = a || b;
    if (candidate === 'tank') candidate = 'warrior';
    if (VALID_CLASS_SET.has(candidate)) return candidate;
    if (VALID_CLASS_SET.has(b)) return b;
    return 'unknown';
  }

  async function fetchRoster(eventId) {
    try {
      const res = await fetch(`/api/assignments/${eventId}/roster`);
      const data = await res.json();
      if (!data.success) return [];
      return Array.isArray(data.roster) ? data.roster : [];
    } catch { return []; }
  }

  function getRosterClassByName(roster, name) {
    const lower = String(name || '').toLowerCase();
    const r = Array.isArray(roster) ? roster.find(x => String(x.character_name || '').toLowerCase() === lower) : null;
    return r?.class_name || '';
  }

  // Wing ordering and display configuration
  const WING_ORDER = [
    { key: 'main', name: 'Main Assignments', icon: 'fa-home', dungeon: 'Naxxramas', wing: '', isMain: true },
    { key: 'spider', name: 'Spider Wing', icon: 'fa-spider', dungeon: 'Naxxramas', wing: 'Spider Wing' },
    { key: 'plague', name: 'Plague Wing', icon: 'fa-biohazard', dungeon: 'Naxxramas', wing: 'Plague Wing' },
    { key: 'abomination', name: 'Abomination Wing', icon: 'fa-skull-crossbones', dungeon: 'Naxxramas', wing: 'Abomination Wing' },
    { key: 'military', name: 'Military Wing', icon: 'fa-chess-knight', dungeon: 'Naxxramas', wing: 'Military Wing' },
    { key: 'frostwyrm', name: 'Frostwyrm Lair', icon: 'fa-dragon', dungeon: 'Naxxramas', wing: 'Frostwyrm Lair' }
  ];

  // Boss icon mapping
  function getBossIconUrl(bossName) {
    const key = String(bossName || '').toLowerCase();
    if (key.includes('faerlina')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754815959/3kvUdFR_kx7gif.png';
    if (key.includes('maex')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754984024/Maexx15928_o8jkro.png';
    if (key.includes('razu')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754989023/182497_v3yeko.webp';
    if (key.includes('goth')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1768217339/25200_gkfm0m.webp';
    if (key.includes('horse')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754993478/-16062_absih8.png';
    if (key.includes('heig')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755075234/16309_kpg0jp.png';
    if (key.includes('noth')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755074097/16590_ezmekl.png';
    if (key.includes('loatheb')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755080534/Fungal_monster_s0zutr.webp';
    if (key.includes('patch')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755085582/patchwerk_wfd5z4.gif';
    if (key.includes('grobb')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755086620/24792_gahise.png';
    if (key.includes('thadd')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755087787/dfka9xt-cbdf45c1-45b9-460b-a997-5a46c4de0a65_txsidf.png';
    if (key.includes('gluth')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755087393/27103_rdbmzc.png';
    if (key.includes('sapph')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755093137/oUwfSmi_mp74xg.gif';
    if (key.includes('kel')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755110522/15945_eop7se.png';
    if (key.includes('anub')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754809667/30800_etmqmc.png';
    return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754809667/30800_etmqmc.png'; // Default
  }

  function buildAssignmentCard(panel, roster) {
    const { boss, entries } = panel;
    const bossIconUrl = panel.boss_icon_url || getBossIconUrl(boss);
    
    // Filter out special grid entries
    const visibleEntries = (Array.isArray(entries) ? entries : []).filter(en => {
      const a = String(en.assignment || '');
      return !(a.startsWith('__HGRID__:') || a.startsWith('__SPORE__:') || a.startsWith('__KEL__:') || a.startsWith('__CTHUN__:'));
    });

    const card = document.createElement('div');
    card.className = 'boss-card';

    const header = document.createElement('div');
    header.className = 'boss-card-header';
    header.innerHTML = `
      <img src="${escapeHtml(bossIconUrl)}" alt="${escapeHtml(boss)}" class="boss-icon-small">
      <h3>${escapeHtml(boss)}</h3>
    `;

    const body = document.createElement('div');
    body.className = 'boss-card-body';

    if (visibleEntries.length === 0) {
      body.innerHTML = '<div class="boss-card-empty">No assignments</div>';
    } else {
      visibleEntries.forEach(entry => {
        const charName = entry.character_name || 'Unknown';
        const markerUrl = entry.marker_icon_url || '';
        const assignment = entry.assignment || '';
        const specEmote = entry.spec_emote || '';
        const specIconUrl = entry.spec_icon_url || '';
        const specName = entry.spec_name || '';
        const isPlaceholder = entry.is_placeholder || false;
        
        const rosterClass = getRosterClassByName(roster, charName);
        const characterClass = entry.character_class || rosterClass || 'unknown';
        const canonClass = canonicalizeClass(characterClass, '');

        const assignmentDiv = document.createElement('div');
        assignmentDiv.className = 'assignment-compact';
        assignmentDiv.setAttribute('data-class', canonClass);

        let html = '<div class="character-badge">';
        html += getSpecIconHtml(specName, characterClass, specEmote, specIconUrl, isPlaceholder);
        html += `<span class="character-name-compact" data-class="${canonClass}">${escapeHtml(charName)}</span>`;
        html += '</div>';

        if (markerUrl) {
          html += `<img src="${escapeHtml(markerUrl)}" class="marker-icon-compact" alt="Marker">`;
        }

        if (assignment && assignment.trim()) {
          html += `<span class="assignment-text-compact">${escapeHtml(assignment)}</span>`;
        }

        assignmentDiv.innerHTML = html;
        body.appendChild(assignmentDiv);
      });
    }

    card.appendChild(header);
    card.appendChild(body);
    return card;
  }

  function buildWingSection(wingConfig, panels, roster) {
    const section = document.createElement('div');
    section.className = 'wing-section';
    section.id = `wing-${wingConfig.key}`;

    const header = document.createElement('div');
    header.className = 'wing-header';
    header.innerHTML = `
      <i class="fas ${wingConfig.icon}"></i>
      <h2>${escapeHtml(wingConfig.name)}</h2>
    `;

    const separator = document.createElement('div');
    separator.className = 'wing-separator';

    const grid = document.createElement('div');
    grid.className = 'boss-grid';

    // Filter panels for this wing
    const wingPanels = panels.filter(p => {
      if (wingConfig.isMain) {
        // Main assignments: panels with empty or null wing
        return p.dungeon === wingConfig.dungeon && (!p.wing || p.wing.trim() === '');
      } else {
        // Specific wing
        return p.dungeon === wingConfig.dungeon && p.wing === wingConfig.wing;
      }
    });

    if (wingPanels.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'boss-card-empty';
      emptyMsg.style.gridColumn = '1 / -1';
      emptyMsg.textContent = 'No assignments for this wing';
      grid.appendChild(emptyMsg);
    } else {
      wingPanels.forEach(panel => {
        const card = buildAssignmentCard(panel, roster);
        grid.appendChild(card);
      });
    }

    section.appendChild(header);
    section.appendChild(separator);
    section.appendChild(grid);
    return section;
  }

  async function initialize() {
    const eventId = getActiveEventId();
    if (!eventId) {
      document.getElementById('loading').innerHTML = '<i class="fas fa-exclamation-triangle"></i> No active raid event selected';
      return;
    }

    try {
      // Fetch assignments and roster in parallel
      const [assignmentsRes, roster] = await Promise.all([
        fetch(`/api/assignments/${eventId}`),
        fetchRoster(eventId)
      ]);

      const assignmentsData = await assignmentsRes.json();
      
      if (!assignmentsData.success) {
        throw new Error('Failed to load assignments');
      }

      const panels = assignmentsData.panels || [];
      
      // Hide loading, show content
      document.getElementById('loading').style.display = 'none';
      const content = document.getElementById('content');
      content.style.display = 'block';

      // Build sections for each wing in order
      WING_ORDER.forEach(wingConfig => {
        const section = buildWingSection(wingConfig, panels, roster);
        content.appendChild(section);
      });

    } catch (error) {
      console.error('Error loading assignments:', error);
      document.getElementById('loading').innerHTML = '<i class="fas fa-exclamation-triangle"></i> Failed to load assignments';
    }
  }

  // Initialize raid bar navigation
  function initializeRaidBar() {
    const eventId = getActiveEventId();
    if (!eventId) return;

    const raidBar = document.getElementById('raid-bar');
    const raidTitle = document.getElementById('raid-title');
    const raidRosterLink = document.getElementById('raid-roster-link');
    const raidAssignmentsLink = document.getElementById('raid-assignments-link');
    const raidAllAssignmentsLink = document.getElementById('raid-all-assignments-link');
    const raidLogsLink = document.getElementById('raid-logs-link');
    const raidGoldpotLink = document.getElementById('raid-goldpot-link');
    const raidLootLink = document.getElementById('raid-loot-link');

    if (raidBar) raidBar.style.display = 'flex';
    if (raidRosterLink) raidRosterLink.href = `/event/${eventId}/roster`;
    if (raidAssignmentsLink) raidAssignmentsLink.href = `/event/${eventId}/assignments`;
    if (raidAllAssignmentsLink) raidAllAssignmentsLink.href = `/event/${eventId}/assignments/allassignments`;
    if (raidLogsLink) raidLogsLink.href = `/raidlogs?eventId=${eventId}`;
    if (raidGoldpotLink) raidGoldpotLink.href = `/gold?eventId=${eventId}`;
    if (raidLootLink) raidLootLink.href = `/loot?eventId=${eventId}`;

    // Fetch and display event title
    fetch(`/api/raid-helper-events/${eventId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.event && raidTitle) {
          raidTitle.textContent = data.event.title || 'Raid Event';
        }
      })
      .catch(err => console.error('Error fetching event title:', err));
  }

  // Run on page load
  document.addEventListener('DOMContentLoaded', () => {
    initializeRaidBar();
    initialize();
  });
})();
