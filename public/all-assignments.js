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
  const WING_ORDER_NAX = [
    { key: 'main', name: 'Main Assignments', icon: 'fa-home', dungeon: 'Naxxramas', wing: '', isMain: true },
    { key: 'spider', name: 'Spider Wing', icon: 'fa-spider', dungeon: 'Naxxramas', wing: ['Spider Wing', 'Spider'] },
    { key: 'plague', name: 'Plague Wing', icon: 'fa-biohazard', dungeon: 'Naxxramas', wing: 'Plague' },
    { key: 'abomination', name: 'Abomination Wing', icon: 'fa-skull-crossbones', dungeon: 'Naxxramas', wing: 'Abomination' },
    { key: 'military', name: 'Military Wing', icon: 'fa-chess-knight', dungeon: 'Naxxramas', wing: 'Military' },
    { key: 'frostwyrm', name: 'Frostwyrm Lair', icon: 'fa-dragon', dungeon: 'Naxxramas', wing: 'Frostwyrm_Lair' }
  ];

  const WING_ORDER_OTHER = [
    { key: 'main', name: 'Main Assignments', icon: 'fa-home', dungeon: 'Naxxramas', wing: '', isMain: true },
    { key: 'aq40', name: 'AQ40', icon: 'fa-mountain', dungeon: 'AQ40', wing: 'AQ40' },
    { key: 'bwl', name: 'BWL', icon: 'fa-fire', dungeon: 'BWL', wing: 'BWL', comingSoon: true },
    { key: 'mc', name: 'MC', icon: 'fa-fire-alt', dungeon: 'MC', wing: 'MC', comingSoon: true }
  ];

  // Boss ordering within each wing
  const BOSS_ORDER = {
    '': ['Tanking', 'Healing', 'Buffs', 'Decurse and Dispel', 'Curses and Soul Stones', 'Power Infusion'], // Main
    'Spider Wing': ["Anub'Rekhan", 'Grand Widow Faerlina', 'Maexxna'],
    'Spider': ["Anub'Rekhan", 'Grand Widow Faerlina', 'Maexxna'], // Alternative wing name
    'Plague': ['Noth The Plaguebringer', 'Heigan The Unclean', 'Loatheb'],
    'Abomination': ['Patchwerk', 'Grobbulus', 'Gluth', 'Thaddius'],
    'Military': ['Razuvious', 'Gothik', 'The Four Horsemen'],
    'Frostwyrm_Lair': ['Sapphiron', "Kel'Thuzad"],
    'AQ40': ['The Prophet Skeram', 'Bug Trio', 'Battleguard Sartura', 'Fankriss the Unyielding', 'Viscidus', 'Princess Huhuran', 'The Twin Emperors', 'Twins trash', 'Ouro', "C'Thun"]
  };

  function sortBossPanels(panels, wing) {
    const order = BOSS_ORDER[wing] || [];
    if (order.length === 0) return panels;
    
    return panels.sort((a, b) => {
      const aIndex = order.findIndex(name => a.boss.toLowerCase().includes(name.toLowerCase()));
      const bIndex = order.findIndex(name => b.boss.toLowerCase().includes(name.toLowerCase()));
      
      // If both found in order, sort by order
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      // If only a found, a comes first
      if (aIndex !== -1) return -1;
      // If only b found, b comes first
      if (bIndex !== -1) return 1;
      // Neither found, maintain original order
      return 0;
    });
  }

  // Boss icon mapping
  function getBossIconUrl(bossName) {
    const key = String(bossName || '').toLowerCase();
    
    // Main Assignments icons (match the /assignments page)
    if (key === 'tanking') return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754862751/spec-protection-icon_dalb4j.webp';
    if (key === 'healing') return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754862895/healer-rankings.C-zTQI8l_jadafc.avif';
    if (key === 'buffs') return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754928905/F5MOdkB-_400x400_cbcyvn.jpg';
    if (key === 'decurse and dispel') return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754931090/gK6G8u8_KkcqMmsuGLztWpCgl6C96mfwdFQyj-lBPH0AirTtVAXtJa0FfboixUyScp0UoFHxwzwo9C1DDLJmuA_g781hm.webp';
    if (key === 'curses and soul stones') return 'https://wow.zamimg.com/images/wow/icons/large/spell_shadow_unholystrength.jpg';
    if (key === 'power infusion') return 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_powerinfusion.jpg';
    
    // NAX Boss icons
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
    
    // AQ40 Boss icons
    if (key.includes('skeram')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756127451/15345_gqfi2d.png';
    if (key.includes('bug')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756630087/bug_trio_ofvrvg.png';
    if (key.includes('sartura')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756630715/sartura_soipg5.png';
    if (key.includes('fank')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756630878/fankriss_ju6b9b.png';
    if (key.includes('visc')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631416/viscidus_whpcsx.png';
    if (key.includes('huhu')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631406/huhuran_uhgd1p.png';
    if (key.includes('twin') && key.includes('emperor')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631414/twins_ufymht.png';
    if (key.includes('twins') && key.includes('trash')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631415/twinstrash_xwopji.png';
    if (key.includes('ouro')) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631413/ouro_vvmd0k.png';
    if (key.includes('cthun') || key.includes("c'thun")) return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1756631406/cthun_ke0e7s.png';
    
    return 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754809667/30800_etmqmc.png'; // Default
  }

  function buildSporeGridCard(panel, roster) {
    const card = document.createElement('div');
    card.className = 'boss-card spore-grid-card';
    card.style.gridColumn = '1 / -1'; // Span all columns

    const header = document.createElement('div');
    header.className = 'boss-card-header';
    header.innerHTML = `
      <i class="fas fa-bacterium" style="width: 32px; height: 32px; font-size: 24px; color: #22c55e;"></i>
      <h3>Loatheb Spore Groups</h3>
    `;

    const body = document.createElement('div');
    body.className = 'boss-card-body spore-grid-body';

    // Extract spore assignments
    const entries = Array.isArray(panel.entries) ? panel.entries : [];
    const sporeEntries = entries.filter(en => {
      const a = String(en.assignment || '');
      return a.startsWith('__SPORE__:');
    });

    // Organize by group
    const groups = {};
    sporeEntries.forEach(en => {
      const match = String(en.assignment || '').match(/^__SPORE__:(\d+):(\d+)$/);
      if (match) {
        const groupNum = Number(match[1]);
        const slotNum = Number(match[2]);
        if (!groups[groupNum]) groups[groupNum] = [];
        groups[groupNum][slotNum - 1] = {
          name: en.character_name,
          class: en.class_name,
          specEmote: en.spec_emote,
          specIconUrl: en.spec_icon_url,
          specName: en.spec_name,
          isPlaceholder: en.is_placeholder,
          acceptStatus: en.accept_status || ''
        };
      }
    });

    // Create grid layout
    const gridContainer = document.createElement('div');
    gridContainer.className = 'spore-groups-compact';
    
    Object.keys(groups).sort((a, b) => Number(a) - Number(b)).forEach(groupNum => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'spore-group-compact';
      
      const groupHeader = document.createElement('div');
      groupHeader.className = 'spore-group-header';
      groupHeader.textContent = `Group ${groupNum}`;
      groupDiv.appendChild(groupHeader);
      
      const slots = groups[groupNum];
      slots.forEach((player, idx) => {
        if (!player) return;
        
        const charName = player.name || 'Unknown';
        const rosterClass = getRosterClassByName(roster, charName);
        const characterClass = player.class || rosterClass || 'unknown';
        const canonClass = canonicalizeClass(characterClass, '');
        const acceptStatus = player.acceptStatus || '';

        const playerDiv = document.createElement('div');
        playerDiv.className = 'spore-player-compact';
        
        let html = '<div class="character-badge">';
        html += getSpecIconHtml(player.specName, characterClass, player.specEmote, player.specIconUrl, player.isPlaceholder);
        html += `<span class="character-name-compact" data-class="${canonClass}">${escapeHtml(charName)}</span>`;
        html += '</div>';
        
        // Add acceptance status indicator
        if (acceptStatus === 'accept') {
          html += `<i class="fas fa-check-circle acceptance-status-icon accepted" title="Accepted"></i>`;
        } else if (acceptStatus === 'decline') {
          html += `<i class="fas fa-ban acceptance-status-icon declined" title="Declined"></i>`;
        } else {
          html += `<i class="fas fa-circle acceptance-status-icon ignored" title="Ignored"></i>`;
        }
        
        playerDiv.innerHTML = html;
        groupDiv.appendChild(playerDiv);
      });
      
      gridContainer.appendChild(groupDiv);
    });

    body.appendChild(gridContainer);
    card.appendChild(header);
    card.appendChild(body);
    return card;
  }

  function buildCthunGridCard(panel, roster) {
    const card = document.createElement('div');
    card.className = 'boss-card cthun-grid-card';
    card.style.gridColumn = '1 / -1'; // Span all columns

    const header = document.createElement('div');
    header.className = 'boss-card-header';
    header.innerHTML = `
      <i class="fas fa-eye" style="width: 32px; height: 32px; font-size: 24px; color: #dc2626;"></i>
      <h3>C'Thun Positions</h3>
    `;

    const body = document.createElement('div');
    body.className = 'boss-card-body cthun-grid-body';

    // Extract C'Thun assignments
    const entries = Array.isArray(panel.entries) ? panel.entries : [];
    const cthunEntries = entries.filter(en => {
      const a = String(en.assignment || '');
      return a.startsWith('__CTHUN__:');
    });

    // Organize by group
    const groups = {};
    cthunEntries.forEach(en => {
      const match = String(en.assignment || '').match(/^__CTHUN__:(\d+):(\d+)$/);
      if (match) {
        const groupNum = Number(match[1]);
        const slotNum = Number(match[2]);
        if (!groups[groupNum]) groups[groupNum] = [];
        groups[groupNum][slotNum - 1] = {
          name: en.character_name,
          class: en.class_name,
          specEmote: en.spec_emote,
          specIconUrl: en.spec_icon_url,
          specName: en.spec_name,
          isPlaceholder: en.is_placeholder,
          acceptStatus: en.accept_status || ''
        };
      }
    });

    // Create grid layout
    const gridContainer = document.createElement('div');
    gridContainer.className = 'cthun-groups-compact';
    
    Object.keys(groups).sort((a, b) => Number(a) - Number(b)).forEach(groupNum => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'cthun-group-compact';
      
      const groupHeader = document.createElement('div');
      groupHeader.className = 'cthun-group-header';
      groupHeader.textContent = `Position ${groupNum}`;
      groupDiv.appendChild(groupHeader);
      
      const slots = groups[groupNum];
      slots.forEach((player, idx) => {
        if (!player) return;
        
        const charName = player.name || 'Unknown';
        const rosterClass = getRosterClassByName(roster, charName);
        const characterClass = player.class || rosterClass || 'unknown';
        const canonClass = canonicalizeClass(characterClass, '');
        const acceptStatus = player.acceptStatus || '';

        const playerDiv = document.createElement('div');
        playerDiv.className = 'cthun-player-compact';
        
        let html = '<div class="character-badge">';
        html += getSpecIconHtml(player.specName, characterClass, player.specEmote, player.specIconUrl, player.isPlaceholder);
        html += `<span class="character-name-compact" data-class="${canonClass}">${escapeHtml(charName)}</span>`;
        html += '</div>';
        
        // Add acceptance status indicator
        if (acceptStatus === 'accept') {
          html += `<i class="fas fa-check-circle acceptance-status-icon accepted" title="Accepted"></i>`;
        } else if (acceptStatus === 'decline') {
          html += `<i class="fas fa-ban acceptance-status-icon declined" title="Declined"></i>`;
        } else {
          html += `<i class="fas fa-circle acceptance-status-icon ignored" title="Ignored"></i>`;
        }
        
        playerDiv.innerHTML = html;
        groupDiv.appendChild(playerDiv);
      });
      
      gridContainer.appendChild(groupDiv);
    });

    body.appendChild(gridContainer);
    card.appendChild(header);
    card.appendChild(body);
    return card;
  }

  function buildKelGridCard(panel, roster) {
    const card = document.createElement('div');
    card.className = 'boss-card kel-grid-card';
    card.style.gridColumn = '1 / -1'; // Span all columns

    const header = document.createElement('div');
    header.className = 'boss-card-header';
    header.innerHTML = `
      <i class="fas fa-skull" style="width: 32px; height: 32px; font-size: 24px; color: #8b5cf6;"></i>
      <h3>Kel'Thuzad Groups</h3>
    `;

    const body = document.createElement('div');
    body.className = 'boss-card-body kel-grid-body';

    // Extract Kel'Thuzad assignments
    const entries = Array.isArray(panel.entries) ? panel.entries : [];
    const kelEntries = entries.filter(en => {
      const a = String(en.assignment || '');
      return a.startsWith('__KEL__:');
    });

    // Organize by group
    const groups = {};
    kelEntries.forEach(en => {
      const match = String(en.assignment || '').match(/^__KEL__:(\d+):(\d+)$/);
      if (match) {
        const groupNum = Number(match[1]);
        const slotNum = Number(match[2]);
        if (!groups[groupNum]) groups[groupNum] = [];
        groups[groupNum][slotNum - 1] = {
          name: en.character_name,
          class: en.class_name,
          specEmote: en.spec_emote,
          specIconUrl: en.spec_icon_url,
          specName: en.spec_name,
          isPlaceholder: en.is_placeholder,
          acceptStatus: en.accept_status || ''
        };
      }
    });

    // Group names and markers
    const groupConfig = {
      1: { name: 'Group A', marker: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/5_triangle_rbpjyi.png', description: 'Stack on left leg' },
      2: { name: 'Group B', marker: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/6_diamond_hre1uj.png', description: 'Stack on right leg' },
      3: { name: 'Group C', marker: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/3_square_yqucv9.png', description: 'Stack behind boss' },
      4: { name: 'Tanks', marker: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/7_circle_zayctt.png', description: 'Stack in front of boss' }
    };

    // Create grid layout
    const gridContainer = document.createElement('div');
    gridContainer.className = 'kel-groups-compact';
    
    Object.keys(groups).sort((a, b) => Number(a) - Number(b)).forEach(groupNum => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'kel-group-compact';
      
      const config = groupConfig[Number(groupNum)] || { name: `Group ${groupNum}`, marker: null };
      
      const groupHeader = document.createElement('div');
      groupHeader.className = 'kel-group-header';
      
      let headerHtml = '';
      if (config.marker) {
        headerHtml += `<img src="${escapeHtml(config.marker)}" class="group-marker-icon" alt="Marker">`;
      }
      headerHtml += `<span>${escapeHtml(config.name)}</span>`;
      
      groupHeader.innerHTML = headerHtml;
      groupDiv.appendChild(groupHeader);
      
      // Add description if available
      if (config.description) {
        const descDiv = document.createElement('div');
        descDiv.className = 'kel-group-description';
        descDiv.textContent = config.description;
        groupDiv.appendChild(descDiv);
      }
      
      const slots = groups[groupNum];
      slots.forEach((player, idx) => {
        if (!player) return;
        
        const charName = player.name || 'Unknown';
        const rosterClass = getRosterClassByName(roster, charName);
        const characterClass = player.class || rosterClass || 'unknown';
        const canonClass = canonicalizeClass(characterClass, '');
        const acceptStatus = player.acceptStatus || '';

        const playerDiv = document.createElement('div');
        playerDiv.className = 'kel-player-compact';
        
        let html = '<div class="character-badge">';
        html += getSpecIconHtml(player.specName, characterClass, player.specEmote, player.specIconUrl, player.isPlaceholder);
        html += `<span class="character-name-compact" data-class="${canonClass}">${escapeHtml(charName)}</span>`;
        html += '</div>';
        
        // Add acceptance status indicator
        if (acceptStatus === 'accept') {
          html += `<i class="fas fa-check-circle acceptance-status-icon accepted" title="Accepted"></i>`;
        } else if (acceptStatus === 'decline') {
          html += `<i class="fas fa-ban acceptance-status-icon declined" title="Declined"></i>`;
        } else {
          html += `<i class="fas fa-circle acceptance-status-icon ignored" title="Ignored"></i>`;
        }
        
        playerDiv.innerHTML = html;
        groupDiv.appendChild(playerDiv);
      });
      
      gridContainer.appendChild(groupDiv);
    });

    body.appendChild(gridContainer);
    card.appendChild(header);
    card.appendChild(body);
    return card;
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
    card.style.position = 'relative';
    card.style.paddingBottom = '50px';

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
        const acceptStatus = entry.accept_status || '';
        
        const rosterClass = getRosterClassByName(roster, charName);
        const characterClass = entry.class_name || rosterClass || 'unknown';
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
          html += `<span class="assignment-text-compact" title="${escapeHtml(assignment)}">${escapeHtml(assignment)}</span>`;
        }

        // Add acceptance status indicator
        if (acceptStatus === 'accept') {
          html += `<i class="fas fa-check-circle acceptance-status-icon accepted" title="Accepted"></i>`;
        } else if (acceptStatus === 'decline') {
          html += `<i class="fas fa-ban acceptance-status-icon declined" title="Declined"></i>`;
        } else {
          html += `<i class="fas fa-circle acceptance-status-icon ignored" title="Ignored"></i>`;
        }

        assignmentDiv.innerHTML = html;
        body.appendChild(assignmentDiv);
      });
    }

    card.appendChild(header);
    card.appendChild(body);

    // Add copy macro button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-macro-btn';
    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
    copyBtn.title = 'Copy macro';
    copyBtn.style.cssText = 'position: absolute; bottom: 10px; right: 10px; padding: 8px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; color: #3b82f6; cursor: pointer; font-size: 14px; transition: all 0.2s; z-index: 10;';
    
    copyBtn.addEventListener('mouseenter', () => {
      copyBtn.style.background = 'rgba(59, 130, 246, 0.3)';
      copyBtn.style.transform = 'scale(1.05)';
    });
    
    copyBtn.addEventListener('mouseleave', () => {
      copyBtn.style.background = 'rgba(59, 130, 246, 0.2)';
      copyBtn.style.transform = 'scale(1)';
    });
    
    copyBtn.addEventListener('click', () => {
      const panelName = boss || 'Assignment';
      
      // Collect assignments
      const assignments = [];
      visibleEntries.forEach(e => {
        const charName = (e.character_name || '').trim();
        const assignment = (e.assignment || '').trim();
        
        if (charName && assignment) {
          assignments.push({ charName, assignment });
        }
      });
      
      // Try full format first
      let lines = [`/rw ${panelName}`];
      assignments.forEach(a => {
        lines.push(`/ra ${a.charName} ${panelName} ${a.assignment}`);
      });
      let macroText = lines.join('\n');
      
      // If too long, use shortened format
      if (macroText.length > 255) {
        lines = [`/rw ${panelName}`];
        assignments.forEach(a => {
          // Abbreviate "Group X and Y" to "GX + GY"
          let shortAssignment = a.assignment
            .replace(/Group\s+(\d+)\s+and\s+(\d+)/gi, 'G$1 + G$2')
            .replace(/Group\s+(\d+)/gi, 'G$1');
          lines.push(`/ra ${a.charName} - ${shortAssignment}`);
        });
        macroText = lines.join('\n');
      }
      
      navigator.clipboard.writeText(macroText).then(() => {
        const originalHtml = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i>';
        copyBtn.style.color = '#10b981';
        copyBtn.style.borderColor = '#10b981';
        setTimeout(() => {
          copyBtn.innerHTML = originalHtml;
          copyBtn.style.color = '#3b82f6';
          copyBtn.style.borderColor = '#3b82f6';
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy macro:', err);
        alert('Failed to copy macro. Please try again.');
      });
    });
    
    card.appendChild(copyBtn);

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
    
    // Add main-grid class for Main Assignments
    if (wingConfig.isMain) {
      grid.classList.add('main-grid');
    }

    // Check for "coming soon" wings (BWL, MC)
    if (wingConfig.comingSoon) {
      const comingSoonMsg = document.createElement('div');
      comingSoonMsg.className = 'boss-card-empty';
      comingSoonMsg.style.gridColumn = '1 / -1';
      comingSoonMsg.style.fontSize = '1.2em';
      comingSoonMsg.style.color = '#6b7280';
      comingSoonMsg.innerHTML = '<i class="fas fa-clock" style="margin-right: 8px;"></i>Coming soon';
      grid.appendChild(comingSoonMsg);
      
      section.appendChild(header);
      section.appendChild(separator);
      section.appendChild(grid);
      return section;
    }

    // Filter panels for this wing
    let wingPanels = panels.filter(p => {
      if (wingConfig.isMain) {
        // Main assignments: panels with empty or null wing
        return p.dungeon === wingConfig.dungeon && (!p.wing || p.wing.trim() === '');
      } else {
        // Specific wing - support both single string and array of strings
        const wingMatch = Array.isArray(wingConfig.wing) 
          ? wingConfig.wing.includes(p.wing)
          : p.wing === wingConfig.wing;
        return p.dungeon === wingConfig.dungeon && wingMatch;
      }
    });
    
    // Sort panels by boss order - use first wing name if array
    const sortKey = Array.isArray(wingConfig.wing) ? wingConfig.wing[0] : wingConfig.wing;
    wingPanels = sortBossPanels(wingPanels, sortKey);

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
        
        const bossLower = String(panel.boss || '').toLowerCase();
        const entries = Array.isArray(panel.entries) ? panel.entries : [];
        
        // If this is Loatheb in Plague wing, check for spore grid
        if (bossLower.includes('loatheb') && wingConfig.wing === 'Plague') {
          const hasSpores = entries.some(en => String(en.assignment || '').startsWith('__SPORE__:'));
          if (hasSpores) {
            const sporeCard = buildSporeGridCard(panel, roster);
            grid.appendChild(sporeCard);
          }
        }
        
        // If this is Kel'Thuzad in Frostwyrm Lair, check for kel grid
        if (bossLower.includes('kel') && wingConfig.wing === 'Frostwyrm_Lair') {
          const hasKelGroups = entries.some(en => String(en.assignment || '').startsWith('__KEL__:'));
          if (hasKelGroups) {
            const kelCard = buildKelGridCard(panel, roster);
            grid.appendChild(kelCard);
          }
        }
        
        // If this is C'Thun in AQ40, check for cthun grid
        if ((bossLower.includes('cthun') || bossLower.includes("c'thun")) && wingConfig.wing === 'AQ40') {
          const hasCthunGroups = entries.some(en => String(en.assignment || '').startsWith('__CTHUN__:'));
          if (hasCthunGroups) {
            const cthunCard = buildCthunGridCard(panel, roster);
            grid.appendChild(cthunCard);
          }
        }
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
      // Detect if this is a NAX raid or not
      let isNax = false;
      try {
        const res = await fetch(`/api/events/${eventId}/channel-flags`);
        const data = await res.json();
        if (data && data.success && typeof data.isNax === 'boolean') {
          isNax = data.isNax;
        }
      } catch {}

      // Choose wing order based on raid type
      const WING_ORDER = isNax ? WING_ORDER_NAX : WING_ORDER_OTHER;

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

  // Floating sub-navigation: set hrefs to real subpages
  async function initializeFloatingNavigation() {
    const nav = document.getElementById('assignments-floating-nav');
    if (!nav) return;
    const buttonsContainer = document.getElementById('assignments-nav-buttons') || nav.querySelector('.nav-buttons');
    const eventId = getActiveEventId();
    let isNax = false;
    
    try {
      if (eventId) {
        const res = await fetch(`/api/events/${eventId}/channel-flags`);
        const data = await res.json();
        if (data && data.success && typeof data.isNax === 'boolean') {
          isNax = data.isNax;
        }
      }
    } catch {}

    // If not NAX, replace nav with simplified set
    if (!isNax && buttonsContainer) {
      buttonsContainer.innerHTML = `
        <a class="nav-btn" data-wing="main" href="#"><i class="fas fa-home"></i> <span>Main</span></a>
        <a class="nav-btn" data-wing="myassignments" href="#"><i class="fas fa-user-check"></i> <span>My Assignments</span></a>
        <a class="nav-btn active" data-wing="allassignments" href="#"><i class="fas fa-th-list"></i> <span>Compact</span></a>
        <a class="nav-btn" data-wing="aq40" href="#"><i class="fas fa-mountain"></i> <span>AQ40</span></a>
        <a class="nav-btn" data-wing="bwl" href="#"><i class="fas fa-fire"></i> <span>BWL</span></a>
        <a class="nav-btn" data-wing="mc" href="#"><i class="fas fa-fire-alt"></i> <span>MC</span></a>
      `;
    }

    const buttons = Array.from(nav.querySelectorAll('.nav-btn'));
    const parts = window.location.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('event');
    const base = (idx >= 0 && parts[idx+1]) ? `/event/${parts[idx+1]}/assignments` : '/assignments';

    buttons.forEach(btn => {
      const wing = btn.dataset.wing || 'main';
      btn.setAttribute('href', wing === 'main' ? `${base}` : `${base}/${wing}`);
      // Keep allassignments active
      if (wing === 'allassignments') {
        btn.classList.add('active');
      }
    });
  }

  // Run on page load
  document.addEventListener('DOMContentLoaded', () => {
    initializeRaidBar();
    initializeFloatingNavigation();
    initialize();
  });
})();
