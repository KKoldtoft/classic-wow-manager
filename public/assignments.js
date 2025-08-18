(function() {
  // Determine current wing from location pathname
  function getCurrentWing() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('event');
    // Supported patterns:
    // /event/:eventId/assignments
    // /event/:eventId/assignments/:wing
    if (idx >= 0) {
      const afterEvent = parts.slice(idx);
      // afterEvent: ['event', ':eventId', 'assignments', ':wing?']
      if (afterEvent[2] === 'assignments') {
        return afterEvent[3] || 'main';
      }
    }
    // Non-event routes: /assignments or /assignments/:wing
    const aIdx = parts.indexOf('assignments');
    if (aIdx >= 0) {
      return parts[aIdx + 1] || 'main';
    }
    return 'main';
  }

  // Floating sub-navigation: set hrefs to real subpages and active state
  async function initializeFloatingNavigation() {
    const nav = document.getElementById('assignments-floating-nav');
    if (!nav) return;
    const buttonsContainer = document.getElementById('assignments-nav-buttons') || nav.querySelector('.nav-buttons');
    const eventId = getActiveEventId();
    let isNax = true; // default assume NAX to preserve current look
    try {
      if (eventId) {
        const res = await fetch(`/api/events/${eventId}/channel-flags`);
        const data = await res.json();
        if (data && data.success) {
          isNax = !!data.isNax;
        }
      }
    } catch {}

    // If not NAX, replace nav with simplified set
    if (!isNax && buttonsContainer) {
      buttonsContainer.innerHTML = `
        <a class="nav-btn" data-wing="main" href="#"><i class="fas fa-home"></i> <span>Main</span></a>
        <a class="nav-btn" data-wing="aq40" href="#"><i class="fas fa-mountain"></i> <span>AQ40</span></a>
        <a class="nav-btn" data-wing="bwl" href="#"><i class="fas fa-fire"></i> <span>BWL</span></a>
        <a class="nav-btn" data-wing="mc" href="#"><i class="fas fa-fire-alt"></i> <span>MC</span></a>
      `;
    }

    const buttons = Array.from(nav.querySelectorAll('.nav-btn'));
    const parts = window.location.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('event');
    const base = (idx >= 0 && parts[idx+1]) ? `/event/${parts[idx+1]}/assignments` : '/assignments';
    const currentWing = getCurrentWing();

    buttons.forEach(btn => {
      const wing = btn.dataset.wing || 'main';
      btn.setAttribute('href', wing === 'main' ? `${base}` : `${base}/${wing}`);
      btn.classList.toggle('active', wing === currentWing);
    });
  }

  function getActiveEventId() {
    // Prefer URL param /event/:eventId/assignments
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

  function getSpecIconHtml(specName, characterClass, specEmote, specIconUrl) {
    if (specEmote) {
      return `<img src="https://cdn.discordapp.com/emojis/${specEmote}.png" class="spec-icon" alt="${specName || ''}" width="50" loading="lazy" decoding="async">`;
    }
    const url = specIconUrl || '';
    if (url) return `<img src="${url}" class="spec-icon" alt="${specName || ''}" width="50" loading="lazy" decoding="async">`;
    const canonicalClass = (characterClass || 'Unknown').trim();
    return `<i class="fas fa-user-circle spec-icon unknown-spec" style="color: #aaa;" title="${canonicalClass}"></i>`;
  }

  const VALID_CLASS_SET = new Set(['warrior','paladin','hunter','rogue','priest','shaman','mage','warlock','druid']);

  function getRosterClassByName(roster, name) {
    const lower = String(name || '').toLowerCase();
    const r = Array.isArray(roster) ? roster.find(x => String(x.character_name || '').toLowerCase() === lower) : null;
    return r?.class_name || '';
  }

  function getRosterClassColorByName(roster, name) {
    const lower = String(name || '').toLowerCase();
    const r = Array.isArray(roster) ? roster.find(x => String(x.character_name || '').toLowerCase() === lower) : null;
    const className = String(r?.class_name || '').toLowerCase();
    const color = r?.class_color || '';
    if (color) return color;
    const CLASS_COLORS = { warrior:'#C79C6E', paladin:'#F58CBA', hunter:'#ABD473', rogue:'#FFF569', priest:'#FFFFFF', shaman:'#0070DE', mage:'#69CCF0', warlock:'#9482C9', druid:'#FF7D0A', unknown:'#e0e0e0' };
    return CLASS_COLORS[className] || CLASS_COLORS.unknown;
  }

  function canonicalizeClass(rawClass, rosterFallback) {
    const a = String(rawClass || '').trim().toLowerCase();
    const b = String(rosterFallback || '').trim().toLowerCase();
    let candidate = a || b;
    if (candidate === 'tank') candidate = 'warrior';
    if (VALID_CLASS_SET.has(candidate)) return candidate;
    if (VALID_CLASS_SET.has(b)) return b;
    return 'unknown';
  }

  async function fetchUser() {
    try {
      const res = await fetch('/user');
      return await res.json();
    } catch {
      return { loggedIn: false };
    }
  }

  async function fetchRoster(eventId) {
    try {
      const res = await fetch(`/api/assignments/${eventId}/roster`);
      const data = await res.json();
      if (!data.success) return [];
      return Array.isArray(data.roster) ? data.roster : [];
    } catch { return []; }
  }

  function buildPanel(panel, user, roster) {
    const { dungeon, wing, boss, strategy_text, image_url } = panel;
    const canManage = !!(user && user.loggedIn && user.hasManagementRole);
    const headerTitle = boss || 'Encounter';
    const entries = Array.isArray(panel.entries) ? panel.entries : [];
    // Hide special-grid placeholder entries from the normal list
    const visibleEntries = entries.filter(en => {
      const a = String(en.assignment || '');
      return !(a.startsWith('__HGRID__:') || a.startsWith('__SPORE__:') || a.startsWith('__KEL__:'));
    });
    const nameToDiscordId = new Map((Array.isArray(roster)?roster:[]).map(r => [String(r.character_name||'').toLowerCase(), r.discord_user_id]));

    const panelDiv = document.createElement('div');
    panelDiv.className = 'manual-rewards-section main-panel';
    panelDiv.dataset.panelBoss = String(boss || '').toLowerCase();

    const header = document.createElement('div');
    header.className = 'section-header assignment-header';
    let bossIconUrl = panel.boss_icon_url || '';
    const bossKeyForIcon = String(headerTitle || boss || '').toLowerCase();
    if (!bossIconUrl) {
      if (bossKeyForIcon.includes('faerlina')) {
        bossIconUrl = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754815959/3kvUdFR_kx7gif.png';
      } else if (bossKeyForIcon.includes('maex')) {
        bossIconUrl = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754984024/Maexx15928_o8jkro.png';
      } else if (bossKeyForIcon.includes('razu')) {
        bossIconUrl = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754989023/182497_v3yeko.webp';
      } else if (bossKeyForIcon.includes('goth')) {
        bossIconUrl = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754991352/336px-Gothik_the_Harvester_full_pxt0rf.jpg';
      } else if (bossKeyForIcon.includes('horse')) {
        bossIconUrl = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754993478/-16062_absih8.png';
      } else if (bossKeyForIcon.includes('heig')) {
        bossIconUrl = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755075234/16309_kpg0jp.png';
      } else if (bossKeyForIcon.includes('noth')) {
        bossIconUrl = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755074097/16590_ezmekl.png';
      } else if (bossKeyForIcon.includes('loatheb')) {
        bossIconUrl = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755080534/Fungal_monster_s0zutr.webp';
      } else if (bossKeyForIcon.includes('patch')) {
        bossIconUrl = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755085582/patchwerk_wfd5z4.gif';
      } else if (bossKeyForIcon.includes('grobb')) {
        bossIconUrl = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755086620/24792_gahise.png';
      } else if (bossKeyForIcon.includes('thadd')) {
        bossIconUrl = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755087787/dfka9xt-cbdf45c1-45b9-460b-a997-5a46c4de0a65_txsidf.png';
      } else if (bossKeyForIcon.includes('gluth')) {
        bossIconUrl = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755087393/27103_rdbmzc.png';
      } else if (bossKeyForIcon.includes('sapph')) {
        bossIconUrl = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755093137/oUwfSmi_mp74xg.gif';
      } else if (bossKeyForIcon.includes('kel')) {
        bossIconUrl = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755110522/15945_eop7se.png';
      } else {
        bossIconUrl = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754809667/30800_etmqmc.png';
      }
    }
    header.innerHTML = `
      <h2><img src="${bossIconUrl}" alt="Boss" class="boss-icon"> ${headerTitle}</h2>
      <div class="assignments-actions" ${canManage ? '' : 'style="display:none;"'}>
        <button class="btn-add-defaults" title="Add default assignments" data-panel-key="${dungeon}|${wing || ''}|${boss}"><i class="fas fa-magic"></i> Add default assignments</button>
        <button class="btn-edit" title="Edit Panel" data-panel-key="${dungeon}|${wing || ''}|${boss}"><i class="fas fa-edit"></i> Edit</button>
        <button class="btn-save" style="display:none;" title="Save" data-panel-key="${dungeon}|${wing || ''}|${boss}"><i class="fas fa-save"></i> Save</button>
      </div>
    `;
    // Adjust oversize boss icons per boss
    try {
      const bossImgEl = header.querySelector('.boss-icon');
      if (bossImgEl && (bossKeyForIcon.includes('goth') || bossKeyForIcon.includes('horse'))) {
        bossImgEl.style.width = '70px';
        bossImgEl.style.height = '70px';
      }
    } catch {}

    const content = document.createElement('div');
    content.className = 'manual-rewards-content';

    const topLayout = document.createElement('div');
    topLayout.style.display = 'grid';
    topLayout.style.gridTemplateColumns = '2fr 1fr';
    topLayout.style.gap = '16px';
    topLayout.style.marginBottom = '16px';

    // Image / image URL
    const imgWrapper = document.createElement('div');
    let defaultMid = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754768041/Anubian_mid_eeb1zj.jpg';
    let defaultFull = panel.image_url_full || 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754768042/Anubian_full_s1fmvs.png';
    const panelKeyLower = String(headerTitle || boss || '').toLowerCase();
    if (panelKeyLower.includes('faerlina')) {
      defaultMid = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755113421/Faerlina_mid_dpcain.jpg';
      defaultFull = panel.image_url_full || 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755113422/Faerlina_full_osemdc.png';
    } else if (panelKeyLower.includes('maex')) {
      defaultMid = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755118454/Maexxna_mid_no9hfo.jpg';
      defaultFull = panel.image_url_full || 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755118572/Maexxna_full_uje68o.png';
    } else if (panelKeyLower.includes('razu')) {
      defaultMid = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755119195/Raz_mid_kffysm.jpg';
      defaultFull = panel.image_url_full || 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755119197/Raz_full_ixeyyh.png';
    } else if (panelKeyLower.includes('goth')) {
      // Default to Human side for Gothik; we'll provide a toggle to switch sides
      defaultMid = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755120092/Gothik_human_mid_mwb7ok.jpg';
      defaultFull = panel.image_url_full || 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755120092/Gothik_human_mid_mwb7ok.jpg';
    } else if (panelKeyLower.includes('patch')) {
      defaultMid = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755121524/Patchwerk_mid_zgey7f.jpg';
      defaultFull = panel.image_url_full || 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755121524/Patchwerk_full_s90vtk.png';
    } else if (panelKeyLower.includes('grobb')) {
      defaultMid = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755122356/Grobbulus_mid_aw4tig.jpg';
      defaultFull = panel.image_url_full || 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755122356/Grobbulus_full_ftbwtq.png';
    } else if (panelKeyLower.includes('gluth')) {
      defaultMid = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755150437/Gluth_mid_ju7cbx.jpg';
      defaultFull = panel.image_url_full || 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755150438/Gluth_full_bkqgdj.png';
    }
    let displayImageUrl = (image_url && !String(image_url).includes('placehold.co')) ? image_url : defaultMid;
    if (panelKeyLower.includes('faerlina') || panelKeyLower.includes('maex') || panelKeyLower.includes('razu') || panelKeyLower.includes('goth') || panelKeyLower.includes('patch') || panelKeyLower.includes('grobb') || panelKeyLower.includes('gluth')) {
      displayImageUrl = defaultMid;
    }

    const imgLink = document.createElement('a');
    imgLink.href = (panel.image_url_full && panel.image_url_full.trim().length > 0)
      ? panel.image_url_full
      : ((panelKeyLower.includes('faerlina') || panelKeyLower.includes('maex') || panelKeyLower.includes('razu') || panelKeyLower.includes('goth') || panelKeyLower.includes('patch') || panelKeyLower.includes('grobb') || panelKeyLower.includes('gluth')) ? defaultFull : displayImageUrl);
    imgLink.target = '_blank';
    imgLink.rel = 'noopener noreferrer';
    const img = document.createElement('img');
    img.className = 'assignment-img';
    img.src = displayImageUrl;
    img.alt = `${headerTitle} positions`;
    imgLink.appendChild(img);
    imgWrapper.appendChild(imgLink);

    // Gothik: add a right-side slider arrow to toggle between Human and Undead side images
    if (panelKeyLower.includes('goth')) {
      try {
        imgWrapper.style.position = 'relative';
        const human = {
          mid: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755120092/Gothik_human_mid_mwb7ok.jpg',
          full: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755120092/Gothik_human_mid_mwb7ok.jpg'
        };
        const undead = {
          mid: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755120767/Gothik_undead_mid_rwfabt.jpg',
          full: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755120765/Gothik_undead_full_s03qbn.png'
        };
        let currentSide = 'human';
        function applySide(side) {
          const src = side === 'undead' ? undead : human;
          img.src = src.mid;
          img.alt = `${headerTitle} positions (${side})`;
          imgLink.href = src.full;
        }
        applySide(currentSide);
        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.setAttribute('aria-label', 'Next image');
        nextBtn.style.position = 'absolute';
        nextBtn.style.right = '8px';
        nextBtn.style.top = '50%';
        nextBtn.style.transform = 'translateY(-50%)';
        nextBtn.style.width = '36px';
        nextBtn.style.height = '36px';
        nextBtn.style.borderRadius = '50%';
        nextBtn.style.border = '1px solid rgba(255,255,255,0.6)';
        nextBtn.style.background = 'rgba(0,0,0,0.45)';
        nextBtn.style.color = '#fff';
        nextBtn.style.cursor = 'pointer';
        nextBtn.style.display = 'flex';
        nextBtn.style.alignItems = 'center';
        nextBtn.style.justifyContent = 'center';
        nextBtn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
        nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
        nextBtn.addEventListener('click', (e) => {
          e.preventDefault();
          currentSide = currentSide === 'human' ? 'undead' : 'human';
          applySide(currentSide);
        });
        imgWrapper.appendChild(nextBtn);

        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.setAttribute('aria-label', 'Previous image');
        prevBtn.style.position = 'absolute';
        prevBtn.style.left = '8px';
        prevBtn.style.top = '50%';
        prevBtn.style.transform = 'translateY(-50%)';
        prevBtn.style.width = '36px';
        prevBtn.style.height = '36px';
        prevBtn.style.borderRadius = '50%';
        prevBtn.style.border = '1px solid rgba(255,255,255,0.6)';
        prevBtn.style.background = 'rgba(0,0,0,0.45)';
        prevBtn.style.color = '#fff';
        prevBtn.style.cursor = 'pointer';
        prevBtn.style.display = 'flex';
        prevBtn.style.alignItems = 'center';
        prevBtn.style.justifyContent = 'center';
        prevBtn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
        prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        prevBtn.addEventListener('click', (e) => {
          e.preventDefault();
          currentSide = currentSide === 'human' ? 'undead' : 'human';
          applySide(currentSide);
        });
        imgWrapper.appendChild(prevBtn);
      } catch {}
    }
    // Removed URL input under the image

    // Description (managed by panel Edit/Save)
    let currentStrategy = strategy_text || '';
    let currentVideoUrl = panel.video_url || '';
    const desc = document.createElement('div');
    function renderDesc(readOnly) {
      if (readOnly) {
        desc.innerHTML = `<p class="strategy-text" style="color:#ddd; line-height:1.4;">${currentStrategy || '—'}</p>`;
      } else {
        desc.innerHTML = `<textarea class="assignment-editable assignment-textarea" data-field="strategy_text" placeholder="Fight description...">${currentStrategy || ''}</textarea>`;
      }
    }
    renderDesc(true);

    // Right column wrapper to bottom-align the video with the image bottom
    const rightCol = document.createElement('div');
    rightCol.style.display = 'flex';
    rightCol.style.flexDirection = 'column';
    rightCol.style.height = '100%';
    rightCol.appendChild(desc);
    // Video URL input (only in edit mode)
    const videoInputWrap = document.createElement('div');
    videoInputWrap.style.marginTop = '8px';
    function renderVideoInput(readOnly) {
      if (readOnly) {
        videoInputWrap.innerHTML = '';
      } else {
        videoInputWrap.innerHTML = `
          <input class="assignment-editable" data-field="video_url" placeholder="YouTube embed URL (https://www.youtube.com/embed/...)" value="${currentVideoUrl || ''}" style="width:100%;" />
        `;
      }
    }
    renderVideoInput(true);
    rightCol.appendChild(videoInputWrap);
    const ytWrap = document.createElement('div');
    ytWrap.style.marginTop = 'auto';
    function renderVideo() {
      const fourHorsemenDefault = 'https://www.youtube.com/embed/nlKO8p3SMVw?controls=0&modestbranding=1&rel=0&iv_load_policy=3';
      const nothDefault = 'https://www.youtube.com/embed/qSFGc-x-luM?controls=0&modestbranding=1&rel=0&iv_load_policy=3';
      const heiganDefault = 'https://www.youtube.com/embed/dfSBp3Efjbk?controls=0&modestbranding=1&rel=0&iv_load_policy=3';
      const loathebDefault = 'https://www.youtube.com/embed/_zwIx3uzoFI?controls=0&modestbranding=1&rel=0&iv_load_policy=3';
      const genericDefault = 'https://www.youtube.com/embed/yEh16DOAs-k?si=sbFC_3eSplmFyuav&start=13&controls=0&modestbranding=1&rel=0&iv_load_policy=3';
      const key = String(headerTitle || boss || '').toLowerCase();
      const isFourHorsemen = key.includes('horse');
      const isNoth = key.includes('noth');
      const isHeigan = key.includes('heig');
      const isLoatheb = key.includes('loatheb');
      const fallback = isFourHorsemen ? fourHorsemenDefault : (isNoth ? nothDefault : (isHeigan ? heiganDefault : (isLoatheb ? loathebDefault : genericDefault)));
      const url = currentVideoUrl && currentVideoUrl.trim().length > 0 ? currentVideoUrl : fallback;
      ytWrap.innerHTML = `<iframe width="100%" height="215" src="${url}" title="Strategy video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
    }
    renderVideo();
    rightCol.appendChild(ytWrap);

    topLayout.appendChild(imgWrapper);
    topLayout.appendChild(rightCol);

    const list = document.createElement('div');
    list.className = 'assignment-entries';

    let isEditing = false;

    function renderEntryRow(e, i) {
      const row = document.createElement('div');
      row.className = 'assignment-entry-row ranking-item';
      row.dataset.entry = '1';
      if (e.accept_status) row.dataset.acceptStatus = e.accept_status;

      const charInfo = document.createElement('div');
      const current = {
        character_name: e.character_name || '',
        class_name: e.class_name || '',
        spec_name: e.spec_name || '',
        spec_emote: e.spec_emote || '',
        spec_icon_url: e.spec_icon_url || ''
      };
      function renderCharInfo(readOnly) {
        const rosterClsInit = getRosterClassByName(roster, current.character_name);
        const canonicalInit = canonicalizeClass(current.class_name, rosterClsInit);
        charInfo.className = `character-info class-${classToCssName(canonicalInit)}`;
        if (readOnly) {
          charInfo.innerHTML = `
            ${getSpecIconHtml(current.spec_name, current.class_name, current.spec_emote, current.spec_icon_url)}
            <span class="character-name" style="display:inline-flex; align-items:center;">${current.character_name}</span>
          `;
        } else {
          charInfo.innerHTML = `
            ${getSpecIconHtml(current.spec_name, current.class_name, current.spec_emote, current.spec_icon_url)}
            <select class="assignment-editable" data-field="character_name" style="max-width:260px;">
              <option value="">Select player...</option>
              ${roster.map(r => `<option value="${r.character_name}" data-class="${r.class_name || ''}" data-spec="${r.spec_name || ''}" data-emote="${r.spec_emote || ''}" data-specicon="${r.spec_icon_url || ''}" data-color="${r.class_color || ''}" ${r.character_name===current.character_name?'selected':''}>${r.character_name}</option>`).join('')}
            </select>
          `;
          const select = charInfo.querySelector('[data-field="character_name"]');
          const vSelect = String(panel.variant || '').toLowerCase();
          if (vSelect === 'buffs' && select) {
            Array.from(select.options).forEach(opt => {
              const cls = (opt.getAttribute('data-class') || '').toLowerCase();
              if (opt.value && !['mage','priest','druid'].includes(cls)) opt.remove();
            });
          } else if (vSelect === 'curses' && select) {
            Array.from(select.options).forEach(opt => {
              const cls = (opt.getAttribute('data-class') || '').toLowerCase();
              if (opt.value && !['mage','priest'].includes(cls)) opt.remove();
            });
          }
          select.addEventListener('change', async () => {
            const opt = select.selectedOptions[0];
            current.character_name = opt?.value || '';
            current.class_name = opt?.dataset.class || '';
            current.spec_name = opt?.dataset.spec || '';
            current.spec_emote = opt?.dataset.emote || '';
            current.spec_icon_url = opt?.dataset.specicon || '';
            const rosterCls = getRosterClassByName(roster, current.character_name);
            const canonical = canonicalizeClass(current.class_name, rosterCls);
            charInfo.className = `character-info class-${classToCssName(canonical)}`;
            // Update icon in-place
            charInfo.querySelector('.spec-icon')?.remove();
            const before = document.createElement('span');
            before.innerHTML = getSpecIconHtml(current.spec_name, current.class_name, current.spec_emote, current.spec_icon_url);
            charInfo.insertBefore(before.firstChild, charInfo.firstChild);
            const nameEl = charInfo.querySelector('.character-name');
            if (nameEl) nameEl.textContent = opt.value || '';
            if (String(panel.variant || '').toLowerCase() === 'buffs') {
              const cls = (current.class_name || '').toLowerCase();
              const iconMap = {
                mage: 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_magicalsentry.jpg',
                priest: 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_wordfortitude.jpg',
                druid: 'https://wow.zamimg.com/images/wow/icons/large/spell_nature_regeneration.jpg'
              };
              const iconUrl = iconMap[cls] || '';
              e.marker_icon_url = iconUrl;
              row.dataset.markerUrl = iconUrl;
              // re-render marker to apply icon immediately
              renderMarker(!isEditing);
            }
            // Reset acceptance on assigned player change (server + UI)
            row.dataset.acceptStatus = '';
            e.accept_status = '';
            try {
              const eventId = getActiveEventId();
              await fetch(`/api/assignments/${eventId}/entry/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dungeon, wing: wing || '', boss, character_name: current.character_name, accept_status: null })
              });
            } catch {}
            renderAcceptArea();
          });
        }
      }
      // Always initialize in view mode for everyone
      renderCharInfo(true);

      // Marker icon (view/edit)
      const markerUrls = [
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/1_skull_faqei8.png',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/2_cross_kj9wuf.png',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/3_square_yqucv9.png',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/4_moon_vwhoen.png',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/5_triangle_rbpjyi.png',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/6_diamond_hre1uj.png',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/7_circle_zayctt.png',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/8_star_kbuiaq.png'
      ];
      const markerWrapper = document.createElement('div');
      function renderMarker(readOnly) {
        markerWrapper.innerHTML = '';
        const box = document.createElement('div');
        box.className = 'marker-box';
        // helper to update box image
        function updateBox(url) {
          box.innerHTML = '';
          if (url) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = 'Marker';
            box.appendChild(img);
          }
        }
        const currentUrl = e.marker_icon_url || row.dataset.markerUrl || '';
        updateBox(currentUrl);
        row.dataset.markerUrl = currentUrl;
        if (!readOnly) {
          // cycle through: none -> icons -> back to none
          box.style.cursor = 'pointer';
          box.title = 'Click to cycle marker';
          box.addEventListener('click', async () => {
            const cur = row.dataset.markerUrl || '';
            const idx = markerUrls.indexOf(cur);
            let nextUrl = '';
            if (idx === -1) {
              nextUrl = markerUrls[0];
            } else if (idx < markerUrls.length - 1) {
              nextUrl = markerUrls[idx + 1];
            } else {
              nextUrl = '';
            }
            e.marker_icon_url = nextUrl || null;
            row.dataset.markerUrl = nextUrl;
            updateBox(nextUrl);
            // Reset acceptance on marker change (server + UI)
            row.dataset.acceptStatus = '';
            e.accept_status = '';
            try {
              const eventId = getActiveEventId();
              await fetch(`/api/assignments/${eventId}/entry/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dungeon, wing: wing || '', boss, character_name: (current.character_name||'').trim(), accept_status: null })
              });
            } catch {}
            renderAcceptArea();
          });
        }
        markerWrapper.appendChild(box);
      }
      if (canManage) {
        // Respect previously selected marker; if exists, keep it selected even in edit mode
        renderMarker(false);
      } else {
      renderMarker(true);
      }

      const assignText = document.createElement('div');
      // Always initialize in view mode
      assignText.className = 'entry-assignment-text';
      assignText.textContent = e.assignment || '';
      // Persist assignment text on the row for reliable toggles
      row.dataset.assignment = e.assignment || '';

      row.appendChild(charInfo);
      row.appendChild(markerWrapper);
      row.appendChild(assignText);

      // Accept/Decline controls or status icon
      const acceptCol = document.createElement('div');
      acceptCol.className = 'accept-col';
      row.appendChild(acceptCol);

      function getStatusIconHtml(status, interactive) {
        if (status === 'accept') return `<i class="fas fa-check-circle" style="color:#10b981; font-size:40px; line-height:40px;"></i>`;
        if (status === 'decline') return `<i class="fas fa-ban" style="color:#ef4444; font-size:40px; line-height:40px;"></i>`;
        const unsetColor = interactive ? '#fbbf24' : '#9ca3af';
        return `<i class="fas fa-question-circle" style="color:${unsetColor}; font-size:40px; line-height:40px;"></i>`;
      }

      function renderAcceptArea() {
        acceptCol.innerHTML = '';
        const charName = (current.character_name || '').trim();
        const ownerId = nameToDiscordId.get(charName.toLowerCase()) || null;
        const isOwner = !!(user && user.loggedIn && user.id && ownerId && String(user.id) === String(ownerId));
        const showControls = !!(user && user.loggedIn && (isOwner || (canManage && isEditing)));
        const curStatus = (row.dataset.acceptStatus !== undefined) ? row.dataset.acceptStatus : (e.accept_status || '');
        if (showControls) {
          const btn = document.createElement('button');
          btn.className = 'status-toggle-btn';
          btn.type = 'button';
          btn.innerHTML = getStatusIconHtml(curStatus, true);
          acceptCol.appendChild(btn);
          btn.addEventListener('click', async (ev) => {
            ev.preventDefault();
            const prev = (row.dataset.acceptStatus !== undefined) ? row.dataset.acceptStatus : (e.accept_status || '');
            let next = '';
            if (!prev) next = 'accept';
            else if (prev === 'accept') next = 'decline';
            else next = '';
            row.dataset.acceptStatus = next;
            e.accept_status = next;
              const eventId = getActiveEventId();
              try {
                await fetch(`/api/assignments/${eventId}/entry/accept`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dungeon, wing: wing || '', boss, character_name: charName, accept_status: next || null })
                });
              } catch {}
            btn.innerHTML = getStatusIconHtml(next, true);
          });
        } else {
          const status = document.createElement('div');
          status.className = 'status-icon';
          status.innerHTML = getStatusIconHtml(curStatus || '', false);
          acceptCol.appendChild(status);
        }
      }
      renderAcceptArea();

      if (canManage) {
        // Row mode toggler (controlled by panel-level edit/save)
        function setMode(readOnly) {
          const ta = row.querySelector('[data-field="assignment"]');
          if (readOnly) {
            assignText.className = 'entry-assignment-text';
            const finalText = (ta && typeof ta.value === 'string') ? ta.value : (row.dataset.assignment || '');
            assignText.textContent = finalText;
            row.dataset.assignment = finalText;
            renderCharInfo(true);
            renderMarker(true);
            // Ensure delete button is not visible in view mode
            const existingDel = row.querySelector('.delete-x');
            if (existingDel) existingDel.remove();
            isEditing = false;
            renderAcceptArea();
          } else {
            assignText.className = '';
            assignText.innerHTML = `<textarea class="assignment-editable assignment-assignment-textarea" data-field="assignment" placeholder="Assignment">${(row.dataset.assignment || '')}</textarea>`;
            renderCharInfo(false);
            renderMarker(false);
            // Reset acceptance when manager edits the assignment text
            const taLive = row.querySelector('[data-field="assignment"]');
            if (taLive) {
              taLive.addEventListener('input', () => { row.dataset.acceptStatus = ''; e.accept_status = ''; row.dataset.assignment = taLive.value || ''; renderAcceptArea(); });
            }
            // Add delete X in edit mode
            let del = row.querySelector('.delete-x');
            if (!del) {
              del = document.createElement('button');
              del.className = 'delete-x';
              del.innerHTML = '&times;';
              del.title = 'Delete assignment';
              del.addEventListener('click', () => { row.remove(); renumberRows(); });
              row.appendChild(del);
            }
            isEditing = true;
            renderAcceptArea();
          }
        }
        // Expose a helper on the row to allow parent Save button to set read-only mode after server save
        row._setReadOnly = () => setMode(true);
        row._setEdit = () => setMode(false);
      }

      list.appendChild(row);
    }

    function renumberRows() {
      Array.from(list.querySelectorAll('.ranking-position')).forEach((el, idx) => el.textContent = String(idx + 1));
    }

    visibleEntries.forEach((e, i) => renderEntryRow(e, i));

    content.appendChild(topLayout);
    content.appendChild(list);

    // Special section for The Four Horsemen: tanking rotation grid
    const isHorsemenPanel = String((boss || '')).toLowerCase().includes('horse');
    let horseGridWrap = null;
    let horseGridState = null; // { tanksByRow: {1:[name],...}, acceptByRow: {1:'accept'|'decline'|''} }
    if (isHorsemenPanel) {
      horseGridWrap = document.createElement('div');
      horseGridWrap.className = 'horsemen-grid-wrap';
      horseGridWrap.style.marginTop = '16px';
      horseGridWrap.style.padding = '12px 16px';
      horseGridWrap.style.borderTop = '1px solid var(--border-color, #3a3a3a)';

      // initialize state from saved payload or derive from hidden entries
      function deriveHorseFromEntries(allEntries) {
        const map = {};
        (Array.isArray(allEntries)?allEntries:[]).forEach(en => {
          const m = String(en.assignment||'').match(/^__HGRID__:(\d+):(\d+)$/);
          if (m) {
            const row = Number(m[1]);
            const slot = Number(m[2]);
            if (!map[row]) map[row] = [];
            map[row][slot-1] = en.character_name || null;
          }
        });
        return map;
      }
      function deriveHorseAcceptFromEntries(allEntries) {
        const map = {};
        (Array.isArray(allEntries)?allEntries:[]).forEach(en => {
          const m = String(en.assignment||'').match(/^__HGRID__:(\d+):(\d+)$/);
          if (m) {
            const row = Number(m[1]);
            if (map[row] === undefined) map[row] = en.accept_status || '';
          }
        });
        return map;
      }
      const initial = panel.horsemen_tanks || deriveHorseFromEntries(panel.entries);
      horseGridState = { tanksByRow: {}, acceptByRow: {} };
      for (let r = 1; r <= 8; r++) {
        const arr = Array.isArray(initial[r]) ? initial[r] : [];
        horseGridState.tanksByRow[r] = [arr[0] || null];
      }
      // pull accept states from hidden entries
      try { horseGridState.acceptByRow = deriveHorseAcceptFromEntries(panel.entries) || {}; } catch {}

      function getWarriorOptionsHtml(selectedName) {
        const warriors = Array.isArray(roster) ? roster.filter(r => String(r.class_name||'').toLowerCase()==='warrior') : [];
        const opts = ['<option value="">Select warrior...</option>'].concat(
          warriors.map(r => `<option value="${r.character_name}" ${String(r.character_name)===String(selectedName)?'selected':''}>${r.character_name}</option>`)
        );
        return opts.join('');
      }

      function renderBossCell(iconUrl, label) {
        const cell = document.createElement('div');
        cell.style.display = 'flex';
        cell.style.alignItems = 'center';
        cell.style.gap = '8px';
        const img = document.createElement('img');
        img.src = iconUrl; img.alt = label; img.width = 24; img.height = 24; img.loading = 'lazy';
        const span = document.createElement('span'); span.textContent = label; span.style.color = '#e5e7eb';
        cell.appendChild(img); cell.appendChild(span);
        return cell;
      }

      // Styled pill for boss assignments (Mograine/Thane/Zeliek/Blaumeux)
      function renderBossTag(iconUrl, label) {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.alignItems = 'center';
        wrap.style.justifyContent = 'center';
        wrap.style.width = '100%';
        wrap.style.textAlign = 'center';
        const cell = document.createElement('div');
        cell.style.display = 'inline-flex';
        cell.style.alignItems = 'center';
        cell.style.justifyContent = 'center';
        cell.style.gap = '6px';
        cell.style.padding = '6px 10px';
        cell.style.borderRadius = '8px';
        cell.style.background = 'rgb(199, 156, 110)';
        cell.style.width = '100px';
        const img = document.createElement('img');
        img.src = iconUrl; img.alt = label; img.width = 18; img.height = 18; img.loading = 'lazy';
        const span = document.createElement('span'); span.textContent = label; span.style.color = '#111827'; span.style.fontWeight = '700'; span.style.textAlign = 'center';
        cell.appendChild(img); cell.appendChild(span);
        wrap.appendChild(cell);
        return wrap;
      }

      function renderHorseGrid(readOnly) {
        horseGridWrap.innerHTML = '';
        const makeRow = (cells, idx, isHeader=false) => {
          const row = document.createElement('div');
          row.style.display = 'grid';
          row.style.gridTemplateColumns = '220px repeat(4, 1fr) 70px';
          row.style.gap = '10px';
          if (isHeader) {
            row.style.background = 'rgba(0,0,0,0.25)';
          } else {
            row.style.background = (idx % 2 === 0) ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
          }
          row.style.padding = '6px 8px';
          cells.forEach(c => row.appendChild(c));
          // Center align all columns except first (Warriors/title column)
          try {
            Array.from(row.children).forEach((child, idx) => {
              if (idx === 0) return;
              child.style.display = 'flex';
              child.style.alignItems = 'center';
              child.style.justifyContent = 'center';
            });
          } catch {}
          return row;
        };

        // icons
        const iconSkull  = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/1_skull_faqei8.png';
        const iconCross  = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/2_cross_kj9wuf.png';
        const iconSquare = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/3_square_yqucv9.png';
        const iconMoon   = 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/4_moon_vwhoen.png';
        const iconSword  = 'https://wow.zamimg.com/images/wow/icons/large/inv_sword_04.jpg';
        const iconSafe   = 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_bandage_12.jpg';
        const headerCell = (text) => { const d=document.createElement('div'); d.style.fontWeight='700'; d.style.color='#e5e7eb'; d.textContent=text; return d; };

        // header row
        const head = makeRow([
          headerCell('Warriors / Marks'),
          headerCell('1, 2 and 3'),
          headerCell('4, 5 and 6'),
          headerCell('7, 8 and 9'),
          headerCell('10, 11 and 12'),
          headerCell('')
        ], 0, true);
        horseGridWrap.appendChild(head);

        function renderWarriorCell(rowIdx, onChangeCb) {
          const cell = document.createElement('div');
          cell.style.display = 'flex';
          cell.style.flexDirection = 'column';
          cell.style.gap = '6px';
          const currentName = (horseGridState.tanksByRow[rowIdx] && horseGridState.tanksByRow[rowIdx][0]) || '';
          if (readOnly) {
            const wrap = document.createElement('div');
            wrap.style.minHeight = '28px';
            wrap.style.display = 'inline-flex';
            wrap.style.alignItems = 'center';
            wrap.style.gap = '8px';
            wrap.style.borderRadius = '6px';
            wrap.style.padding = '4px 8px';
            const cls = getRosterClassByName(roster, currentName);
            const color = getRosterClassColorByName(roster, currentName);
            wrap.style.background = color ? color : 'rgba(255,255,255,0.08)';
            const span = document.createElement('span'); span.textContent = currentName || '—'; span.style.color = '#000'; span.style.fontWeight='700';
            wrap.appendChild(span);
            cell.appendChild(wrap);
          } else {
            const sel = document.createElement('select');
            sel.className = 'assignment-editable';
            sel.innerHTML = getWarriorOptionsHtml(currentName);
            sel.addEventListener('change', () => {
              const val = sel.value || null;
              horseGridState.tanksByRow[rowIdx] = [val];
              // Reset acceptance when warrior changes
              horseGridState.acceptByRow[rowIdx] = '';
              try {
                const eventId = getActiveEventId();
                fetch(`/api/assignments/${eventId}/entry/accept`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ dungeon, wing: wing || '', boss, character_name: (val||'').trim(), accept_status: null })
                });
              } catch {}
              if (typeof onChangeCb === 'function') onChangeCb();
            });
            cell.appendChild(sel);
          }
          return cell;
        }

        function renderStatusCell(rowIdx, readOnly) {
          const cell = document.createElement('div');
          cell.className = 'accept-col';
          function getStatusIconHtml(status, interactive) {
            if (status === 'accept') return `<i class="fas fa-check-circle" style="color:#10b981; font-size:40px; line-height:40px;"></i>`;
            if (status === 'decline') return `<i class="fas fa-ban" style="color:#ef4444; font-size:40px; line-height:40px;"></i>`;
            const unsetColor = interactive ? '#fbbf24' : '#9ca3af';
            return `<i class="fas fa-question-circle" style="color:${unsetColor}; font-size:40px; line-height:40px;"></i>`;
          }
          function draw() {
            cell.innerHTML = '';
            const charName = (horseGridState.tanksByRow[rowIdx] && horseGridState.tanksByRow[rowIdx][0]) || '';
            const ownerId = nameToDiscordId.get(String(charName||'').toLowerCase()) || null;
            const isOwner = !!(user && user.loggedIn && user.id && ownerId && String(user.id) === String(ownerId));
            const showControls = !!(user && user.loggedIn && (isOwner || (!readOnly && canManage)));
            const curStatus = horseGridState.acceptByRow[rowIdx] || '';
            if (showControls) {
              const btn = document.createElement('button');
              btn.className = 'status-toggle-btn';
              btn.type = 'button';
              btn.innerHTML = getStatusIconHtml(curStatus, true);
              btn.addEventListener('click', async (ev) => {
                ev.preventDefault();
                const prev = horseGridState.acceptByRow[rowIdx] || '';
                let next = '';
                if (!prev) next = 'accept';
                else if (prev === 'accept') next = 'decline';
                else next = '';
                horseGridState.acceptByRow[rowIdx] = next;
                const eventId = getActiveEventId();
                try {
                  await fetch(`/api/assignments/${eventId}/entry/accept`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dungeon, wing: wing || '', boss, character_name: (charName||'').trim(), accept_status: next || null })
                  });
                } catch {}
                btn.innerHTML = getStatusIconHtml(next, true);
              });
              cell.appendChild(btn);
            } else {
              const status = document.createElement('div');
              status.className = 'status-icon';
              status.innerHTML = getStatusIconHtml(curStatus || '', false);
              cell.appendChild(status);
            }
          }
          cell._rerender = draw;
          draw();
          return cell;
        }

        // helper cell builders
        const bossMograine = () => renderBossTag(iconCross, 'Mograine');
        const bossThane    = () => renderBossTag(iconSkull, 'Thane');
        const bossZeliek   = () => renderBossTag(iconSquare, 'Zeliek');
        const bossBlaumeux = () => renderBossTag(iconMoon, 'Blaumeux');
        const cellDps      = () => renderBossCell(iconSword, 'DPS');
        const cellSafe     = () => renderBossCell(iconSafe, 'Safe Zone');

        const rows = [];
        // Helper to create a full row with status cell
        function makeFullRow(rowIdx, cellsForMarks) {
          const statusCell = renderStatusCell(rowIdx, readOnly);
          const warriorCell = renderWarriorCell(rowIdx, () => { try { statusCell._rerender && statusCell._rerender(); } catch {} });
          return makeRow([ warriorCell, ...cellsForMarks, statusCell ], rowIdx);
        }
        // Row 1: Mograine in col1; DPS in cols 2-4
        rows.push(makeFullRow(1, [ bossMograine(), cellDps(), cellDps(), cellDps() ]));
        // Row 2: DPS, Mograine, DPS, DPS
        rows.push(makeFullRow(2, [ cellDps(), bossMograine(), cellDps(), cellDps() ]));
        // Row 3: Thane, Thane, Mograine, DPS
        rows.push(makeFullRow(3, [ bossThane(), bossThane(), bossMograine(), cellDps() ]));
        // Row 4: DPS, DPS, DPS, Mograine
        rows.push(makeFullRow(4, [ cellDps(), cellDps(), cellDps(), bossMograine() ]));
        // Row 5: Blaumeux, Safe, Zeliek, Safe
        rows.push(makeFullRow(5, [ bossBlaumeux(), cellSafe(), bossZeliek(), cellSafe() ]));
        // Row 6: DPS, Blaumeux, Safe, Zeliek
        rows.push(makeFullRow(6, [ cellDps(), bossBlaumeux(), cellSafe(), bossZeliek() ]));
        // Row 7: Zeliek, Safe, Blaumeux, Safe
        rows.push(makeFullRow(7, [ bossZeliek(), cellSafe(), bossBlaumeux(), cellSafe() ]));
        // Row 8: DPS, Zeliek, Safe, Blaumeux
        rows.push(makeFullRow(8, [ cellDps(), bossZeliek(), cellSafe(), bossBlaumeux() ]));

        rows.forEach(r => horseGridWrap.appendChild(r));
      }

      // initial render in view mode (no tanks yet visible)
      renderHorseGrid(true);
      content.appendChild(horseGridWrap);
      // expose helpers to toggle and fetch state
      panelDiv._renderHorseGrid = (readOnly) => renderHorseGrid(readOnly);
      panelDiv._getHorseGridState = () => horseGridState;
    }

    // Special section for Loatheb: Spore Groups grid (6 groups x 5 slots)
    const isLoathebPanel = String((boss || '')).toLowerCase().includes('loatheb');
    let sporeGridWrap = null;
    let sporeGridState = null; // { groups: {1:[n1..n5],...,6:[..]} }
    if (isLoathebPanel) {
      sporeGridWrap = document.createElement('div');
      sporeGridWrap.className = 'spore-grid-wrap';
      sporeGridWrap.style.marginTop = '16px';
      sporeGridWrap.style.padding = '12px 16px';
      sporeGridWrap.style.borderTop = '1px solid var(--border-color, #3a3a3a)';
      sporeGridWrap.style.width = '100%';
      // Title above the grid
      const sporeTitle = document.createElement('div');
      sporeTitle.textContent = 'Spore Groups';
      sporeTitle.style.fontWeight = '700';
      sporeTitle.style.color = '#e5e7eb';
      sporeTitle.style.margin = '8px 0 6px 0';

      function deriveSporeFromEntries(allEntries) {
        const map = {};
        (Array.isArray(allEntries)?allEntries:[]).forEach(en => {
          const m = String(en.assignment||'').match(/^__SPORE__:(\d+):(\d+)$/);
          if (m) {
            const g = Number(m[1]);
            const s = Number(m[2]);
            if (!map[g]) map[g] = [];
            map[g][s-1] = en.character_name || null;
          }
        });
        return map;
      }
      const initialSpore = panel.spore_groups || deriveSporeFromEntries(panel.entries);
      sporeGridState = { groups: {} };
      for (let g=1; g<=6; g++) {
        const arr = Array.isArray(initialSpore[g]) ? initialSpore[g] : [];
        sporeGridState.groups[g] = [arr[0]||null, arr[1]||null, arr[2]||null, arr[3]||null, arr[4]||null];
      }

      function getAllPlayerOptionsHtml(selectedName) {
        const opts = ['<option value="">Select player...</option>'].concat(
          (Array.isArray(roster)?roster:[]).map(r => `<option value="${r.character_name}" ${String(r.character_name)===String(selectedName)?'selected':''}>${r.character_name}</option>`)
        );
        return opts.join('');
      }

      function renderSporeGrid(readOnly) {
        sporeGridWrap.innerHTML = '';
        // header
        const head = document.createElement('div');
        head.style.display = 'grid';
        head.style.gridTemplateColumns = 'repeat(6, 1fr)';
        head.style.gap = '10px';
        head.style.background = 'rgba(0,0,0,0.25)';
        head.style.padding = '6px 8px';
        for (let g=1; g<=6; g++) {
          const d = document.createElement('div');
          d.style.fontWeight = '700'; d.style.color = '#e5e7eb'; d.style.textAlign = 'center';
          d.textContent = `Group ${g}`;
          head.appendChild(d);
        }
        sporeGridWrap.appendChild(head);

        function makeRowForSlot(slotIdx) {
          const row = document.createElement('div');
          row.style.display = 'grid';
          row.style.gridTemplateColumns = 'repeat(6, 1fr)';
          row.style.gap = '10px';
          row.style.background = (slotIdx % 2 === 1) ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
          row.style.padding = '6px 8px';
          for (let g=1; g<=6; g++) {
            const cell = document.createElement('div');
            cell.style.display = 'flex';
            cell.style.alignItems = 'center';
            cell.style.justifyContent = 'center';
            const currentName = sporeGridState.groups[g][slotIdx-1] || '';
            if (readOnly) {
              const wrap = document.createElement('div');
              wrap.style.minHeight = '28px';
              wrap.style.display = 'inline-flex';
              wrap.style.alignItems = 'center';
              wrap.style.justifyContent = 'center';
              wrap.style.gap = '8px';
              wrap.style.borderRadius = '8px';
              wrap.style.padding = '6px 10px';
              wrap.style.width = '100px';
              const color = getRosterClassColorByName(roster, currentName);
              wrap.style.background = color ? color : 'rgba(255,255,255,0.08)';
              const span = document.createElement('span'); span.textContent = currentName || '—'; span.style.color = '#000'; span.style.fontWeight='700';
              wrap.appendChild(span);
              cell.appendChild(wrap);
            } else {
              const wrap = document.createElement('div');
              wrap.style.display = 'flex';
              wrap.style.alignItems = 'center';
              wrap.style.gap = '8px';
              const sel = document.createElement('select');
              sel.className = 'assignment-editable';
              sel.style.maxWidth = '220px';
              sel.innerHTML = getAllPlayerOptionsHtml(currentName);
              sel.addEventListener('change', () => {
                const val = sel.value || null;
                sporeGridState.groups[g][slotIdx-1] = val;
              });
              wrap.appendChild(sel);
              // Delete button
              const del = document.createElement('button');
              del.className = 'delete-x';
              del.innerHTML = '&times;';
              del.title = 'Remove player';
              del.addEventListener('click', () => { sporeGridState.groups[g][slotIdx-1] = null; renderSporeGrid(false); });
              wrap.appendChild(del);
              cell.appendChild(wrap);
            }
            row.appendChild(cell);
          }
          return row;
        }

        for (let s=1; s<=5; s++) {
          sporeGridWrap.appendChild(makeRowForSlot(s));
        }
      }

      // initial render view mode
      renderSporeGrid(true);
      content.appendChild(sporeTitle);
      content.appendChild(sporeGridWrap);
      panelDiv._renderSporeGrid = (readOnly) => renderSporeGrid(readOnly);
      panelDiv._getSporeGridState = () => sporeGridState;
    }

    // Special section for Kel'Thuzad: Group grid (A, B, C, D)
    const isKelPanel = String((boss || '')).toLowerCase().includes('kel');
    let kelGridWrap = null;
    let kelGridState = null; // { groups: {1:[...],2:[...],3:[...],4:[...] } }
    if (isKelPanel) {
      kelGridWrap = document.createElement('div');
      kelGridWrap.className = 'kel-grid-wrap';
      kelGridWrap.style.marginTop = '16px';
      kelGridWrap.style.padding = '12px 16px';
      kelGridWrap.style.borderTop = '1px solid var(--border-color, #3a3a3a)';
      kelGridWrap.style.width = '100%';

      const kelTitle = document.createElement('div');
      kelTitle.textContent = "Kel'Thuzad Groups";
      kelTitle.style.fontWeight = '700';
      kelTitle.style.color = '#e5e7eb';
      kelTitle.style.margin = '8px 0 6px 0';

      function deriveKelFromEntries(allEntries) {
        const map = {};
        (Array.isArray(allEntries)?allEntries:[]).forEach(en => {
          const m = String(en.assignment||'').match(/^__KEL__:(\d+):(\d+)$/);
          if (m) {
            const g = Number(m[1]);
            const s = Number(m[2]);
            if (!map[g]) map[g] = [];
            map[g][s-1] = en.character_name || null;
          }
        });
        return map;
      }
      const initialKel = panel.kel_groups || deriveKelFromEntries(panel.entries);
      kelGridState = { groups: { 1: [], 2: [], 3: [], 4: [] } };
      for (let g=1; g<=4; g++) {
        const arr = Array.isArray(initialKel[g]) ? initialKel[g] : [];
        // default to up to 8 slots; will expand dynamically when rendering
        kelGridState.groups[g] = arr.slice();
      }

      function renderKelGrid(readOnly) {
        kelGridWrap.innerHTML = '';
        // header
        const head = document.createElement('div');
        head.style.display = 'grid';
        head.style.gridTemplateColumns = 'repeat(4, 1fr)';
        head.style.gap = '10px';
        head.style.background = 'rgba(0,0,0,0.25)';
        head.style.padding = '6px 8px';
        const labelMeta = [
          { text: 'Group A', icon: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/5_triangle_rbpjyi.png' },
          { text: 'Group B', icon: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/6_diamond_hre1uj.png' },
          { text: 'Group C', icon: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/3_square_yqucv9.png' },
          { text: 'Tanks',   icon: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/7_circle_zayctt.png' }
        ];
        labelMeta.forEach(({text, icon}) => {
          const d = document.createElement('div');
          d.style.fontWeight='700'; d.style.color='#e5e7eb'; d.style.textAlign='center';
          d.style.display='flex'; d.style.alignItems='center'; d.style.justifyContent='center'; d.style.gap='6px';
          const img = document.createElement('img'); img.src = icon; img.alt = 'mark'; img.width = 18; img.height = 18; img.loading = 'lazy';
          const span = document.createElement('span'); span.textContent = text;
          d.appendChild(img); d.appendChild(span);
          head.appendChild(d);
        });
        kelGridWrap.appendChild(head);

        const groups = kelGridState.groups;
        const maxLen = Math.max(
          (groups[1]||[]).length,
          (groups[2]||[]).length,
          (groups[3]||[]).length,
          (groups[4]||[]).length,
          8
        );

        function makeRowForSlot(slotIdx) {
          const row = document.createElement('div');
          row.style.display = 'grid';
          row.style.gridTemplateColumns = 'repeat(4, 1fr)';
          row.style.gap = '10px';
          row.style.background = (slotIdx % 2 === 1) ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
          row.style.padding = '6px 8px';
          for (let g=1; g<=4; g++) {
            const cell = document.createElement('div');
            cell.style.display = 'flex';
            cell.style.alignItems = 'center';
            cell.style.justifyContent = 'center';
            const currentName = (groups[g] && groups[g][slotIdx-1]) || '';
            if (readOnly) {
              const wrap = document.createElement('div');
              wrap.style.minHeight = '28px';
              wrap.style.display = 'inline-flex';
              wrap.style.alignItems = 'center';
              wrap.style.justifyContent = 'center';
              wrap.style.gap = '8px';
              wrap.style.borderRadius = '8px';
              wrap.style.padding = '6px 10px';
              wrap.style.width = '100px';
              const color = getRosterClassColorByName(roster, currentName);
              wrap.style.background = color ? color : 'rgba(255,255,255,0.08)';
              const span = document.createElement('span'); span.textContent = currentName || '—'; span.style.color = '#000'; span.style.fontWeight='700';
              wrap.appendChild(span);
              cell.appendChild(wrap);
            } else {
              const wrap = document.createElement('div');
              wrap.style.display = 'flex';
              wrap.style.alignItems = 'center';
              wrap.style.gap = '8px';
              const sel = document.createElement('select');
              sel.className = 'assignment-editable';
              sel.style.maxWidth = '220px';
              sel.innerHTML = ['<option value="">Select player...</option>']
                .concat((Array.isArray(roster)?roster:[]).map(r => `<option value="${r.character_name}" ${String(r.character_name)===String(currentName)?'selected':''}>${r.character_name}</option>`))
                .join('');
              sel.addEventListener('change', () => {
                const val = sel.value || null;
                if (!groups[g]) groups[g] = [];
                groups[g][slotIdx-1] = val;
              });
              wrap.appendChild(sel);
              const del = document.createElement('button');
              del.className = 'delete-x';
              del.innerHTML = '&times;';
              del.title = 'Remove player';
              del.addEventListener('click', () => { if (!groups[g]) groups[g]=[]; groups[g][slotIdx-1] = null; renderKelGrid(false); });
              wrap.appendChild(del);
              cell.appendChild(wrap);
            }
            row.appendChild(cell);
          }
          return row;
        }

        for (let s=1; s<=maxLen; s++) {
          kelGridWrap.appendChild(makeRowForSlot(s));
        }
      }

      // initial render view mode
      renderKelGrid(true);
      content.appendChild(kelTitle);
      content.appendChild(kelGridWrap);
      panelDiv._renderKelGrid = (readOnly) => renderKelGrid(readOnly);
      panelDiv._getKelGridState = () => kelGridState;
    }

    panelDiv.appendChild(header);
    panelDiv.appendChild(content);

      if (canManage) {
        // Panel-level Edit/Save
        const editBtn = header.querySelector('.btn-edit');
        const saveBtn = header.querySelector('.btn-save');
        const addDefaultsBtn = header.querySelector('.btn-add-defaults');
        if (addDefaultsBtn) addDefaultsBtn.style.display = 'none'; // only visible in edit mode

        // Add controls
        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.gap = '10px';
        controls.style.padding = '0 20px 20px 20px';

        const addBtn = document.createElement('button');
        addBtn.className = 'btn-add';
        addBtn.innerHTML = '<i class="fas fa-plus"></i> Add Entry';
        addBtn.addEventListener('click', () => {
          const newEntry = { character_name: '', class_name: 'Warrior', spec_name: '', spec_emote: '', assignment: '', marker_icon_url: null };
          renderEntryRow(newEntry, list.children.length);
          renumberRows();
          // force edit mode for the new row
          const last = list.lastElementChild; if (last && typeof last._setEdit === 'function') last._setEdit();
        });

        controls.appendChild(addBtn);
        // hidden by default; only shown in edit mode
        controls.style.display = 'none';
        content.appendChild(controls);
        // Default templates per boss
        addDefaultsBtn?.addEventListener('click', async () => {
          try {
            // fetch roster to know party/slot mapping
            const eventId = getActiveEventId();
            const roster = await fetchRoster(eventId);
            const findBy = (party, slot) => roster.find(r => Number(r.party_id) === Number(party) && Number(r.slot_id) === Number(slot));
            const icons = {
              skull: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/1_skull_faqei8.png',
              cross: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/2_cross_kj9wuf.png',
              square: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/3_square_yqucv9.png',
              moon: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/4_moon_vwhoen.png',
              triangle: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/5_triangle_rbpjyi.png',
              diamond: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/6_diamond_hre1uj.png',
              circle: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/7_circle_zayctt.png',
              star: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/8_star_kbuiaq.png'
            };

            const toAdd = [];
            const bossKey = String(boss || '').toLowerCase();
            if (bossKey.includes("anub")) {
              const mt = findBy(1,1);
              const ot1 = findBy(1,2);
              const ot2 = findBy(1,3);
              if (mt) toAdd.push({ r: mt, icon: icons.skull, text: 'Main Tank. Pick up the boss and face it away from the raid.' });
              if (ot1) toAdd.push({ r: ot1, icon: icons.cross, text: 'Off Tank 1. Pick up the right add. Stack it on the boss and stand with the main tank. Use a FAP if needed.' });
              if (ot2) toAdd.push({ r: ot2, icon: icons.square, text: 'Off Tank 2. Pick up the left add. Stack it on the boss and stand with the main tank. Use a FAP if needed.' });
            } else if (bossKey.includes("faerlina")) {
              const pSorted = roster.filter(r => String(r.class_name).toLowerCase() === 'priest')
                .sort((a,b) => (Number(a.party_id)||99) - (Number(b.party_id)||99) || (Number(a.slot_id)||99) - (Number(b.slot_id)||99));
              const p1 = pSorted[0];
              const p2 = pSorted[1];
              // #1
              const g11 = findBy(1,1); if (g11) toAdd.push({ r: g11, icon: icons.square, text: 'Tank the boss' });
              // #2
              const g12 = findBy(1,2); if (g12) toAdd.push({ r: g12, icon: icons.triangle, text: 'Tank the left 2 adds' });
              // #3
              if (g12) toAdd.push({ r: g12, icon: icons.moon, text: 'Tank the left 2 adds' });
              // #4
              const g13 = findBy(1,3); if (g13) toAdd.push({ r: g13, icon: icons.diamond, text: 'Tank the right 2 adds' });
              // #5
              if (g13) toAdd.push({ r: g13, icon: icons.circle, text: 'Tank the right 2 adds' });
              // #6
              const g21 = findBy(2,1); if (g21) toAdd.push({ r: g21, icon: icons.skull, text: 'Tank Skull' });
              // #7
              const g22 = findBy(2,2); if (g22) toAdd.push({ r: g22, icon: icons.cross, text: 'Tank Cross (pull it to boss)' });
              // #8
              if (p1) toAdd.push({ r: p1, icon: icons.diamond, text: "Use mind control and Widow's Embrace to dispel Enrage from the boss. Start with Diamond and Circle targets." });
              // #9
              if (p1) toAdd.push({ r: p1, icon: icons.circle, text: "Use mind control and Widow's Embrace to dispel Enrage from the boss. Start with Diamond and Circle targets." });
              // #10
              if (p2) toAdd.push({ r: p2, icon: icons.circle, text: 'Backup mindcontrol in case the assigned priest dies or fails.' });
            } else if (bossKey.includes("maex")) {
              // Build Maexxna defaults
              // 1) Tank with skull from Main->Tanking panel
              try {
                const resAll = await fetch(`/api/assignments/${eventId}`);
                const dataAll = await resAll.json();
                if (dataAll && dataAll.success) {
                  const panelsAll = Array.isArray(dataAll.panels) ? dataAll.panels : [];
                  const tankPanel = panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking');
                  const skullUrl = icons.skull;
                  const skullEntry = tankPanel?.entries?.find(en => String(en.marker_icon_url||'').includes('skull')) || tankPanel?.entries?.[0];
                  if (skullEntry && skullEntry.character_name) {
                    const rMatch = roster.find(r => String(r.character_name).toLowerCase() === String(skullEntry.character_name).toLowerCase());
                    const rUse = rMatch || { character_name: skullEntry.character_name, class_name: skullEntry.class_name };
                    toAdd.push({ r: rUse, icon: skullUrl, text: 'Tank the boss (face it away from the raid)' });
                  }
                }
              } catch {}
              // 2) All hunters -> Kill the webs
              roster.filter(r=>String(r.class_name||'').toLowerCase()==='hunter')
                .forEach(r=>toAdd.push({ r, icon: null, text: 'Kill the webs' }));
              // 3) All warlocks -> Kill the webs
              roster.filter(r=>String(r.class_name||'').toLowerCase()==='warlock')
                .forEach(r=>toAdd.push({ r, icon: null, text: 'Kill the webs' }));
              // 4) Two mages with highest group/slot
              const magesDesc = roster.filter(r=>String(r.class_name||'').toLowerCase()==='mage')
                .sort((a,b)=> ((Number(b.party_id)||0)-(Number(a.party_id)||0)) || ((Number(b.slot_id)||0)-(Number(a.slot_id)||0)));
              if (magesDesc[0]) toAdd.push({ r: magesDesc[0], icon: null, text: 'Kill the webs' });
              if (magesDesc[1]) toAdd.push({ r: magesDesc[1], icon: null, text: 'Kill the webs' });
              // 5) All druids -> cleanse poison on tank
              roster.filter(r=>String(r.class_name||'').toLowerCase()==='druid')
                .forEach(r=>toAdd.push({ r, icon: null, text: 'Cleanse poison on Tank before webspray' }));
              // 6) Lowest shaman -> poison cleansing totem
              const shamansAsc = roster.filter(r=>String(r.class_name||'').toLowerCase()==='shaman')
                .sort((a,b)=> ((Number(a.party_id)||99)-(Number(b.party_id)||99)) || ((Number(a.slot_id)||99)-(Number(b.slot_id)||99)));
              if (shamansAsc[0]) toAdd.push({ r: shamansAsc[0], icon: null, text: 'Keep poison cleansing totem up for the tank before webspray.' });
            } else if (bossKey.includes("razu")) {
              // Instructor Razuvious defaults
              try {
                const resAll = await fetch(`/api/assignments/${eventId}`);
                const dataAll = await resAll.json();
                const panelsAll = Array.isArray(dataAll.panels) ? dataAll.panels : [];
                const tankPanel = panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking');
                const pickTankByIndex = (idx) => {
                  const en = tankPanel?.entries?.[idx-1];
                  if (!en || !en.character_name) return null;
                  return roster.find(r => String(r.character_name).toLowerCase() === String(en.character_name).toLowerCase()) || { character_name: en.character_name, class_name: en.class_name };
                };
                const t2 = pickTankByIndex(2);
                const t3 = pickTankByIndex(3);
                const t4 = pickTankByIndex(4);
                if (t2) toAdd.push({ r: t2, icon: icons.cross, text: 'Tank the left 2 adds (near but not on top of the priests)' });
                if (t2) toAdd.push({ r: t2, icon: icons.square, text: 'Tank the left 2 adds (near but not on top of the priests)' });
                if (t3) toAdd.push({ r: t3, icon: icons.moon, text: 'Tank the right 2 adds (near but not on top of the priests)' });
                if (t4) toAdd.push({ r: t4, icon: icons.diamond, text: 'Tank the right 2 adds (near but not on top of the priests)' });
              } catch {}
              // Priests: two lowest
              const priestsAsc = roster.filter(r=>String(r.class_name||'').toLowerCase()==='priest')
                .sort((a,b)=> ((Number(a.party_id)||99)-(Number(b.party_id)||99)) || ((Number(a.slot_id)||99)-(Number(b.slot_id)||99)));
              if (priestsAsc[0]) toAdd.push({ r: priestsAsc[0], icon: icons.cross, text: 'Mind control duty (You pull)' });
              if (priestsAsc[0]) toAdd.push({ r: priestsAsc[0], icon: icons.square, text: 'Mind control duty' });
              if (priestsAsc[1]) toAdd.push({ r: priestsAsc[1], icon: icons.moon, text: 'Mind control duty' });
              if (priestsAsc[1]) toAdd.push({ r: priestsAsc[1], icon: icons.diamond, text: 'Mind control duty' });
              // Warriors target dummies
              const crate = 'https://wow.zamimg.com/images/wow/icons/large/inv_crate_06.jpg';
              const warriorsG2 = roster.filter(r=>String(r.class_name||'').toLowerCase()==='warrior' && Number(r.party_id)===2)
                .sort((a,b)=> (Number(a.slot_id)||99)-(Number(b.slot_id)||99));
              const warriorsG3 = roster.filter(r=>String(r.class_name||'').toLowerCase()==='warrior' && Number(r.party_id)===3)
                .sort((a,b)=> (Number(a.slot_id)||99)-(Number(b.slot_id)||99));
              if (warriorsG2[0]) toAdd.push({ r: warriorsG2[0], icon: crate, text: 'Target Dummy #1' });
              if (warriorsG2[1]) toAdd.push({ r: warriorsG2[1], icon: crate, text: 'Target Dummy #2' });
              if (warriorsG2[2]) toAdd.push({ r: warriorsG2[2], icon: crate, text: 'Target Dummy #3' });
              if (warriorsG3[0]) toAdd.push({ r: warriorsG3[0], icon: crate, text: 'Target Dummy #4' });
              if (warriorsG3[1]) toAdd.push({ r: warriorsG3[1], icon: crate, text: 'Target Dummy #5' });
              if (warriorsG3[2]) toAdd.push({ r: warriorsG3[2], icon: crate, text: 'Target Dummy #6' });
            } else if (bossKey.includes("goth")) {
              // Gothik defaults
              try {
                const resAll = await fetch(`/api/assignments/${eventId}`);
                const dataAll = await resAll.json();
                const panelsAll = Array.isArray(dataAll.panels) ? dataAll.panels : [];
                const tankPanel = panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking');
                const findByMarker = (markerSubstr) => {
                  if (!tankPanel || !Array.isArray(tankPanel.entries)) return null;
                  const entry = tankPanel.entries.find(en => String(en.marker_icon_url||'').toLowerCase().includes(markerSubstr));
                  if (!entry || !entry.character_name) return null;
                  return roster.find(r => String(r.character_name).toLowerCase() === String(entry.character_name).toLowerCase()) || { character_name: entry.character_name, class_name: entry.class_name };
                };
                const skull = findByMarker('skull');
                const cross = findByMarker('cross');
                const square = findByMarker('square');
                const moon  = findByMarker('moon');
                const triangle = findByMarker('triangle');
                const diamond = findByMarker('diamond');
                if (skull)    toAdd.push({ r: skull,    icon: icons.skull,    text: 'Tank the middle platform' });
                if (cross)    toAdd.push({ r: cross,    icon: icons.cross,    text: 'Tank the left platform' });
                if (square)   toAdd.push({ r: square,   icon: icons.square,   text: 'Tank the right platform' });
                if (moon)     toAdd.push({ r: moon,     icon: icons.moon,     text: 'Tank the front pile' });
                if (triangle) toAdd.push({ r: triangle, icon: icons.triangle, text: 'Tank the left pile' });
                if (diamond)  toAdd.push({ r: diamond,  icon: icons.diamond,  text: 'Tank the back right pile' });
              } catch {}
              // Warlocks and Hunters pet/VW assignment
              roster.filter(r=>['warlock','hunter'].includes(String(r.class_name||'').toLowerCase()))
                .forEach(r=> toAdd.push({ r, icon: null, text: 'Place your Pet / Void Walker between the platforms to absorbe charge.' }));
              // Healers by side
              const isHealer = (r) => ['shaman','priest','druid'].includes(String(r.class_name||'').toLowerCase());
              const inGroups = (r, groups) => groups.includes(Number(r.party_id));
              const undeadHealers = roster.filter(r=>isHealer(r) && inGroups(r, [2,3,4,5]));
              const humanHealers  = roster.filter(r=>isHealer(r) && inGroups(r, [1,6,7]));
              undeadHealers.forEach(r=> toAdd.push({ r, icon: icons.star, text: 'Go heal Undead side.' }));
              humanHealers.forEach(r=> toAdd.push({ r, icon: icons.circle, text: 'Go heal Human side.' }));
              // Group 8 balancing
              let undeadCount = undeadHealers.length;
              let humanCount = humanHealers.length;
              const group8Healers = roster.filter(r=>isHealer(r) && Number(r.party_id)===8);
              group8Healers.forEach(r => {
                if (undeadCount <= humanCount) {
                  toAdd.push({ r, icon: icons.star, text: 'Go heal Undead side.' });
                  undeadCount += 1;
                } else {
                  toAdd.push({ r, icon: icons.circle, text: 'Go heal Human side.' });
                  humanCount += 1;
                }
              });
            } else if (bossKey.includes("noth")) {
              // Noth the Plaguebringer defaults
              try {
                const resAll = await fetch(`/api/assignments/${eventId}`);
                const dataAll = await resAll.json();
                const panelsAll = Array.isArray(dataAll.panels) ? dataAll.panels : [];
                const tankPanel = panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking' && (!p.wing || String(p.wing).trim()==='' || String(p.wing).toLowerCase()==='main'));
                const getTankByIndex = (idx) => {
                  const en = tankPanel?.entries?.[idx-1];
                  if (!en || !en.character_name) return null;
                  return roster.find(r => String(r.character_name).toLowerCase() === String(en.character_name).toLowerCase()) || { character_name: en.character_name, class_name: en.class_name };
                };
                const t1 = getTankByIndex(1);
                const t2 = getTankByIndex(2);
                const t3 = getTankByIndex(3);
                const t4 = getTankByIndex(4);
                if (t1) toAdd.push({ r: t1, icon: icons.skull,  text: 'Tank the boss' });
                if (t2) toAdd.push({ r: t2, icon: null,        text: 'Save Deathwish for the blink and pick up boss after blink and agro reset.' });
                if (t3) toAdd.push({ r: t3, icon: null,        text: 'Pick up adds' });
                if (t4) toAdd.push({ r: t4, icon: null,        text: 'Pick up adds' });
              } catch {}
            } else if (bossKey.includes("heig")) {
              // Heigan the Unclean defaults
              try {
                const resAll = await fetch(`/api/assignments/${eventId}`);
                const dataAll = await resAll.json();
                const panelsAll = Array.isArray(dataAll.panels) ? dataAll.panels : [];
                const tankPanel = panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking' && (!p.wing || String(p.wing).trim()==='' || String(p.wing).toLowerCase()==='main'));
                const getTankByIndex = (idx) => {
                  const en = tankPanel?.entries?.[idx-1];
                  if (!en || !en.character_name) return null;
                  return roster.find(r => String(r.character_name).toLowerCase() === String(en.character_name).toLowerCase()) || { character_name: en.character_name, class_name: en.class_name };
                };
                const t1 = getTankByIndex(1);
                if (t1) toAdd.push({ r: t1, icon: icons.skull, text: 'Tank the boss' });
                const priests = roster.filter(r => String(r.class_name||'').toLowerCase()==='priest')
                  .sort((a,b)=> ((Number(a.party_id)||99)-(Number(b.party_id)||99)) || ((Number(a.slot_id)||99)-(Number(b.slot_id)||99)));
                if (priests[0]) toAdd.push({ r: priests[0], icon: null, text: 'Instantly remove disease from the tank.' });
              } catch {}
            } else if (bossKey.includes("loatheb")) {
              // Loatheb defaults (list entries) + Spore Groups auto-assignment
              try {
                const resAll = await fetch(`/api/assignments/${eventId}`);
                const dataAll = await resAll.json();
                const panelsAll = Array.isArray(dataAll.panels) ? dataAll.panels : [];
                const tankPanel = panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking' && (!p.wing || String(p.wing).trim()==='' || String(p.wing).toLowerCase()==='main'))
                                   || panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking');
                const getTankByIndex = (idx) => {
                  const en = tankPanel?.entries?.[idx-1];
                  if (!en || !en.character_name) return null;
                  return roster.find(r => String(r.character_name).toLowerCase() === String(en.character_name).toLowerCase()) || { character_name: en.character_name, class_name: en.class_name };
                };
                const t1 = getTankByIndex(1);
                const t2 = getTankByIndex(2);
                if (t1) toAdd.push({ r: t1, icon: icons.skull, text: 'Tank the boss. (turn it 90 degree to it\'s left and move it a few steps back)' });
                if (t2) toAdd.push({ r: t2, icon: icons.skull, text: 'Backup tank. Get to 2nd on threat and put on a shield.' });
                // Healers by name (alphabetically), only shaman/druid/priest
                const healers = roster.filter(r=>['shaman','druid','priest'].includes(String(r.class_name||'').toLowerCase()))
                  .sort((a,b)=> String(a.character_name||'').localeCompare(String(b.character_name||'')));
                healers.forEach(r => toAdd.push({ r, icon: null, text: 'Heal the tank when it\'s your turn to heal.' }));

                // Spore Groups auto-fill
                if (isLoathebPanel && typeof panelDiv._getSporeGridState === 'function') {
                  const gridState = panelDiv._getSporeGridState();
                  // Collect tank IDs for exclusion
                  const pick = (idx) => {
                    const en = tankPanel?.entries?.[idx-1];
                    return en?.character_name ? String(en.character_name) : null;
                  };
                  const tankIds = [pick(1), pick(2), pick(3), pick(4)].filter(Boolean);
                  const mages = roster.filter(r=>String(r.class_name||'').toLowerCase()==='mage');
                  const warriorsAll = roster.filter(r=>String(r.class_name||'').toLowerCase()==='warrior');
                  const warriorNotTanks = warriorsAll.filter(r=>!tankIds.some(n=>String(n).toLowerCase()===String(r.character_name||'').toLowerCase()))
                    .sort((a,b)=> ((Number(a.party_id)||99)-(Number(b.party_id)||99)) || ((Number(a.slot_id)||99)-(Number(b.slot_id)||99)));
                  const rogues = roster.filter(r=>String(r.class_name||'').toLowerCase()==='rogue');
                  const warlocks = roster.filter(r=>String(r.class_name||'').toLowerCase()==='warlock');
                  const hunters = roster.filter(r=>String(r.class_name||'').toLowerCase()==='hunter');
                  const tanksFinal = tankIds.map(name => roster.find(r=>String(r.character_name).toLowerCase()===String(name).toLowerCase()) || { character_name: name });
                  const ordered = [...mages, ...warriorNotTanks, ...rogues, ...warlocks, ...hunters, ...tanksFinal];
                  let ptr = 0;
                  for (let g=1; g<=6; g++) {
                    for (let s=1; s<=5; s++) {
                      const r = ordered[ptr++];
                      gridState.groups[g][s-1] = r ? r.character_name : null;
                    }
                  }
                  if (typeof panelDiv._renderSporeGrid === 'function') panelDiv._renderSporeGrid(false);
                }
              } catch {}
            } else if (bossKey.includes("horse")) {
              // The Four Horsemen – healer rotation
              const isHealer = (r) => ['shaman','priest','druid'].includes(String(r.class_name||'').toLowerCase());
              // Order: shamans, priests, druids; then take up to 12 by group/slot
              const sortByGS = (a,b) => ((Number(a.party_id)||99)-(Number(b.party_id)||99)) || ((Number(a.slot_id)||99)-(Number(b.slot_id)||99));
              const shamans = roster.filter(r=>isHealer(r) && String(r.class_name||'').toLowerCase()==='shaman').sort(sortByGS);
              const priests = roster.filter(r=>isHealer(r) && String(r.class_name||'').toLowerCase()==='priest').sort(sortByGS);
              const druids  = roster.filter(r=>isHealer(r) && String(r.class_name||'').toLowerCase()==='druid').sort(sortByGS);
              const ordered = [...shamans, ...priests, ...druids].slice(0,12);
              const raidOrder = [
                { name: 'skull', icon: icons.skull },
                { name: 'cross', icon: icons.cross },
                { name: 'square', icon: icons.square },
                { name: 'moon',  icon: icons.moon }
              ];
              for (let i=0;i<ordered.length;i++) {
                const block = Math.floor(i/3); // 0..3
                const posInBlock = (i%3)+1;    // 1..3
                const raid = raidOrder[block] || raidOrder[raidOrder.length-1];
                const r = ordered[i];
                const text = `Start on ${raid.name} rotate on ${posInBlock}`;
                toAdd.push({ r, icon: raid.icon, text });
              }
              // Also populate tank grid from Main->Tanking panel (rows 1..8 map to tank indices 1..8)
              try {
                const resAll = await fetch(`/api/assignments/${eventId}`);
                const dataAll = await resAll.json();
                const panelsAll = Array.isArray(dataAll.panels) ? dataAll.panels : [];
                const tankPanel = panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking');
                const getTankByIndex = (idx) => {
                  const en = tankPanel?.entries?.[idx-1];
                  if (!en || !en.character_name) return null;
                  return roster.find(r => String(r.character_name).toLowerCase() === String(en.character_name).toLowerCase()) || { character_name: en.character_name, class_name: en.class_name };
                };
                if (isHorsemenPanel && typeof panelDiv._getHorseGridState === 'function') {
                  const state = panelDiv._getHorseGridState();
                  // Map rows to tank indices with swap: row1<-tank3, row3<-tank1; others 1:1
                  const indexMap = [null, 3, 2, 1, 4, 5, 6, 7, 8];
                  for (let row=1; row<=8; row++) {
                    const srcIdx = indexMap[row] ?? row;
                    const t = getTankByIndex(srcIdx);
                    state.tanksByRow[row] = [t ? t.character_name : null];
                  }
                  if (typeof panelDiv._renderHorseGrid === 'function') panelDiv._renderHorseGrid(true);
                }
              } catch {}
            } else if (bossKey.includes("loatheb")) {
              // Loatheb Spore Groups auto-assignment
              if (isLoathebPanel && typeof panelDiv._getSporeGridState === 'function') {
                // Build assignment list per rules
                const gridState = panelDiv._getSporeGridState();
                // 1) All Mages
                const mages = roster.filter(r=>String(r.class_name||'').toLowerCase()==='mage');
                // 2) All Warriors except 4 tanks from Main->Tanking (ID1..ID4)
                let tankIds = [];
                try {
                  const resAll = await fetch(`/api/assignments/${eventId}`);
                  const dataAll = await resAll.json();
                  const panelsAll = Array.isArray(dataAll.panels) ? dataAll.panels : [];
                  // Prefer Main page Tanking; fallback to any panel named Tanking
                  const tankPanel = panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking' && (!p.wing || String(p.wing).trim()==='' || String(p.wing).toLowerCase()==='main'))
                                   || panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking');
                  const pick = (idx) => {
                    const en = tankPanel?.entries?.[idx-1];
                    return en?.character_name ? String(en.character_name) : null;
                  };
                  tankIds = [pick(1), pick(2), pick(3), pick(4)].filter(Boolean);
                } catch {}
                const warriorsAll = roster.filter(r=>String(r.class_name||'').toLowerCase()==='warrior');
                const warriorNotTanks = warriorsAll.filter(r=>!tankIds.some(n=>String(n).toLowerCase()===String(r.character_name||'').toLowerCase()))
                  .sort((a,b)=> ((Number(a.party_id)||99)-(Number(b.party_id)||99)) || ((Number(a.slot_id)||99)-(Number(b.slot_id)||99)));
                // 3) All Rogues
                const rogues = roster.filter(r=>String(r.class_name||'').toLowerCase()==='rogue');
                // 4) All Warlocks
                const warlocks = roster.filter(r=>String(r.class_name||'').toLowerCase()==='warlock');
                // 5) All Hunters
                const hunters = roster.filter(r=>String(r.class_name||'').toLowerCase()==='hunter');
                // 6) Finally the 4 tanks ID1..ID4 in that order
                const tanksFinal = tankIds.map(name => roster.find(r=>String(r.character_name).toLowerCase()===String(name).toLowerCase()) || { character_name: name });

                const ordered = [
                  ...mages,
                  ...warriorNotTanks,
                  ...rogues,
                  ...warlocks,
                  ...hunters,
                  ...tanksFinal
                ];
                // Fill vertically by group: G1 S1..S5, then G2 S1..S5, ...
                let ptr = 0;
                for (let g=1; g<=6; g++) {
                  for (let s=1; s<=5; s++) {
                    const r = ordered[ptr++];
                    gridState.groups[g][s-1] = r ? r.character_name : null;
                  }
                }
                // re-render grid in edit mode for visibility
                if (typeof panelDiv._renderSporeGrid === 'function') panelDiv._renderSporeGrid(false);
              }
            } else if (bossKey.includes("patch")) {
              // Patchwerk defaults: 3 tanks + healer assignments
              try {
                const resAll = await fetch(`/api/assignments/${eventId}`);
                const dataAll = await resAll.json();
                const panelsAll = Array.isArray(dataAll.panels) ? dataAll.panels : [];
                const tankPanel = panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking' && (!p.wing || String(p.wing).trim()==='' || String(p.wing).toLowerCase()==='main'))
                                   || panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking');
                const findByMarker = (markerSubstr) => {
                  if (!tankPanel || !Array.isArray(tankPanel.entries)) return null;
                  const entry = tankPanel.entries.find(en => String(en.marker_icon_url||'').toLowerCase().includes(markerSubstr));
                  if (!entry || !entry.character_name) return null;
                  return roster.find(r => String(r.character_name).toLowerCase() === String(entry.character_name).toLowerCase()) || { character_name: entry.character_name, class_name: entry.class_name };
                };
                const t1 = findByMarker('skull');   // ID1 on main -> Skull
                const t2 = findByMarker('cross');   // ID2 on main -> Cross
                const t3 = findByMarker('square');  // ID3 on main -> Square
                if (t1) toAdd.push({ r: t1, icon: icons.circle,  text: 'Tank Boss' });
                if (t2) toAdd.push({ r: t2, icon: icons.star,    text: 'Absorb hateful strike' });
                if (t3) toAdd.push({ r: t3, icon: icons.diamond, text: 'Absorb hateful strike' });
                // Healers: all shamans, priests, druids alphabetically by character name
                const isHealer = (r) => ['shaman','priest','druid'].includes(String(r.class_name||'').toLowerCase());
                const healers = (Array.isArray(roster)?roster:[]).filter(isHealer)
                  .sort((a,b) => String(a.character_name||'').localeCompare(String(b.character_name||'')));
                const tankTargets = [ t1?.character_name || '', t2?.character_name || '', t3?.character_name || '' ];
                const tankIcons = [ icons.circle, icons.star, icons.diamond ];
                for (let i=0; i<healers.length; i++) {
                  // First 12 healers: 4 per tank (t1,t2,t3). Clip to available tanks if fewer than 3.
                  if (i < 12 && (t1 || t2 || t3)) {
                    const block = Math.floor(i / 4); // 0..2
                    const tankIdx = Math.min(block, (tankTargets.filter(Boolean).length || 1) - 1);
                    const targetName = tankTargets[tankIdx] || '';
                    if (targetName) {
                      toAdd.push({ r: healers[i], icon: tankIcons[tankIdx] || null, text: `Heal ${targetName}` });
                    } else {
                      toAdd.push({ r: healers[i], icon: null, text: 'FFA Heal tanks only' });
                    }
                  } else {
                    toAdd.push({ r: healers[i], icon: null, text: 'FFA Heal tanks only' });
                  }
                }
              } catch {}
            } else if (bossKey.includes("grobb")) {
              // Grobbulus defaults
              try {
                const resAll = await fetch(`/api/assignments/${eventId}`);
                const dataAll = await resAll.json();
                const panelsAll = Array.isArray(dataAll.panels) ? dataAll.panels : [];
                const tankPanel = panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking' && (!p.wing || String(p.wing).trim()==='' || String(p.wing).toLowerCase()==='main'))
                                   || panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking');
                const findByMarker = (markerSubstr) => {
                  if (!tankPanel || !Array.isArray(tankPanel.entries)) return null;
                  const entry = tankPanel.entries.find(en => String(en.marker_icon_url||'').toLowerCase().includes(markerSubstr));
                  if (!entry || !entry.character_name) return null;
                  return roster.find(r => String(r.character_name).toLowerCase() === String(entry.character_name).toLowerCase()) || { character_name: entry.character_name, class_name: entry.class_name };
                };
                const t1 = findByMarker('skull');
                const t2 = findByMarker('cross');
                const t3 = findByMarker('square');
                if (t1) toAdd.push({ r: t1, icon: icons.skull, text: 'Tank Boss' });
                if (t2) toAdd.push({ r: t2, icon: null, text: 'Tank slimes' });
                if (t3) toAdd.push({ r: t3, icon: null, text: 'Tank slimes (backup)' });
                // Lowest priest by group/slot
                const priests = (Array.isArray(roster)?roster:[])
                  .filter(r => String(r.class_name||'').toLowerCase()==='priest')
                  .sort((a,b)=> ((Number(a.party_id)||99)-(Number(b.party_id)||99)) || ((Number(a.slot_id)||99)-(Number(b.slot_id)||99)));
                if (priests[0]) toAdd.push({ r: priests[0], icon: null, text: 'Dispel when players is at the edge.' });
              } catch {}
            } else if (bossKey.includes("gluth")) {
              // Gluth defaults
              try {
                const resAll = await fetch(`/api/assignments/${eventId}`);
                const dataAll = await resAll.json();
                const panelsAll = Array.isArray(dataAll.panels) ? dataAll.panels : [];
                const tankPanel = panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking' && (!p.wing || String(p.wing).trim()==='' || String(p.wing).toLowerCase()==='main'))
                                   || panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking');
                const findByMarker = (markerSubstr) => {
                  if (!tankPanel || !Array.isArray(tankPanel.entries)) return null;
                  const entry = tankPanel.entries.find(en => String(en.marker_icon_url||'').toLowerCase().includes(markerSubstr));
                  if (!entry || !entry.character_name) return null;
                  return roster.find(r => String(r.character_name).toLowerCase() === String(entry.character_name).toLowerCase()) || { character_name: entry.character_name, class_name: entry.class_name };
                };
                const t1 = findByMarker('skull');
                const t2 = findByMarker('cross');
                const t3 = findByMarker('square');
                if (t1) toAdd.push({ r: t1, icon: icons.skull, text: 'Tank Boss' });
                if (t2) toAdd.push({ r: t2, icon: icons.skull, text: 'Backup Tank Boss (in casee main tank fails fear dodge)' });
                if (t3) toAdd.push({ r: t3, icon: 'https://wow.zamimg.com/images/wow/icons/large/spell_shadow_deathscream.jpg', text: 'Piercing Howl Tank adds' });
              } catch {}
            } else if (bossKey.includes("sapph")) {
              // Sapphiron defaults
              try {
                const resAll = await fetch(`/api/assignments/${eventId}`);
                const dataAll = await resAll.json();
                const panelsAll = Array.isArray(dataAll.panels) ? dataAll.panels : [];
                const tankPanel = panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking' && (!p.wing || String(p.wing).trim()==='' || String(p.wing).toLowerCase()==='main'))
                                   || panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking');
                const findByMarker = (markerSubstr) => {
                  if (!tankPanel || !Array.isArray(tankPanel.entries)) return null;
                  const entry = tankPanel.entries.find(en => String(en.marker_icon_url||'').toLowerCase().includes(markerSubstr));
                  if (!entry || !entry.character_name) return null;
                  return roster.find(r => String(r.character_name).toLowerCase() === String(entry.character_name).toLowerCase()) || { character_name: entry.character_name, class_name: entry.class_name };
                };
                const t1 = findByMarker('skull');
                const t2 = findByMarker('cross');
                if (t1) toAdd.push({ r: t1, icon: icons.skull, text: 'Tank Boss' });
                if (t2) toAdd.push({ r: t2, icon: icons.skull, text: 'Backup Tank Boss (Stay 2nd on threat)' });

                // Mages left/right split: use only mages for count and split (ignore druids)
                const mages = (Array.isArray(roster)?roster:[]).filter(r => String(r.class_name||'').toLowerCase()==='mage');
                const leftCap = Math.floor(mages.length / 2);
                const rightCap = mages.length - leftCap;
                const mageLeft = mages.slice(0, leftCap);
                const mageRight = mages.slice(leftCap, leftCap + rightCap);
                mageLeft.forEach(m => toAdd.push({ r: m, icon: null, text: 'Decurse Tank + left' }));
                mageRight.forEach(m => toAdd.push({ r: m, icon: null, text: 'Decurse Tank + right' }));

                // Healers: Shamans, Priests, Druids (in that order)
                const shamans = (Array.isArray(roster)?roster:[]).filter(r => String(r.class_name||'').toLowerCase()==='shaman');
                const priests = (Array.isArray(roster)?roster:[]).filter(r => String(r.class_name||'').toLowerCase()==='priest');
                const druidsH = (Array.isArray(roster)?roster:[]).filter(r => String(r.class_name||'').toLowerCase()==='druid');
                const healers = [...shamans, ...priests, ...druidsH];
                healers.forEach((r, i) => {
                  let text = '';
                  if (i === 0) text = 'Heal Tank + Group';
                  else if (i <= 4) text = 'Heal Group';
                  else if (i <= 7) text = 'Heal Group + Tank';
                  else if (i <= 11) text = 'Heal Tank';
                  else text = 'Heal Raid';
                  toAdd.push({ r, icon: null, text });
                });
              } catch {}
            } else if (bossKey.includes("kel")) {
              // Kel'Thuzad defaults
              try {
                const resAll = await fetch(`/api/assignments/${eventId}`);
                const dataAll = await resAll.json();
                const panelsAll = Array.isArray(dataAll.panels) ? dataAll.panels : [];
                const tankPanel = panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking' && (!p.wing || String(p.wing).trim()==='' || String(p.wing).toLowerCase()==='main'))
                                   || panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking');
                const findByMarker = (markerSubstr) => {
                  if (!tankPanel || !Array.isArray(tankPanel.entries)) return null;
                  const entry = tankPanel.entries.find(en => String(en.marker_icon_url||'').toLowerCase().includes(markerSubstr));
                  if (!entry || !entry.character_name) return null;
                  return roster.find(r => String(r.character_name).toLowerCase() === String(entry.character_name).toLowerCase()) || { character_name: entry.character_name, class_name: entry.class_name };
                };
                const id1 = findByMarker('skull');
                const id2 = findByMarker('cross');
                const id3 = findByMarker('square');
                const id4 = findByMarker('moon');
                if (id1) toAdd.push({ r: id1, icon: icons.skull, text: 'Tank Boss' });
                if (id2) toAdd.push({ r: id2, icon: icons.skull, text: 'Tank Boss' });
                if (id3) toAdd.push({ r: id3, icon: icons.skull, text: 'Tank Boss' });
                if (id4) toAdd.push({ r: id4, icon: icons.skull, text: 'Tank Boss' });
                // Build Kel grid: D gets the 4 tanks (ID1..ID4), B gets all rogues, remaining warriors spread across A,B,C
                if (isKelPanel && typeof panelDiv._getKelGridState === 'function') {
                  const state = panelDiv._getKelGridState();
                  const rogues = (Array.isArray(roster)?roster:[]).filter(r => String(r.class_name||'').toLowerCase()==='rogue');
                  const allWarriors = (Array.isArray(roster)?roster:[]).filter(r => String(r.class_name||'').toLowerCase()==='warrior');
                  const tankNames = [id1?.character_name, id2?.character_name, id3?.character_name, id4?.character_name].filter(Boolean).map(n => String(n).toLowerCase());
                  const remainingWarriors = allWarriors.filter(r => !tankNames.includes(String(r.character_name||'').toLowerCase()));
                  // D column (4): the tanks in order
                  state.groups[4] = [id1?.character_name||null, id2?.character_name||null, id3?.character_name||null, id4?.character_name||null].filter(Boolean);
                  // B column (2): all rogues
                  state.groups[2] = rogues.map(r => r.character_name);
                  // A(1), B(2) and C(3): spread remaining warriors evenly, extra goes to A then C
                  const targets = [1,2,3];
                  const counts = {1: (state.groups[1]||[]).length, 2: state.groups[2].length, 3: (state.groups[3]||[]).length};
                  for (const w of remainingWarriors) {
                    // choose group with minimum count among A,B,C, tie-breaker A then C then B
                    const order = [1,3,2];
                    let best = 1;
                    for (const g of order) { if (counts[g] < counts[best]) best = g; }
                    if (!state.groups[best]) state.groups[best] = [];
                    state.groups[best].push(w.character_name);
                    counts[best] += 1;
                  }
                  if (typeof panelDiv._renderKelGrid === 'function') panelDiv._renderKelGrid(false);
                }
                // Priests: 3 lowest by group/slot
                const priests = (Array.isArray(roster)?roster:[])
                  .filter(r => String(r.class_name||'').toLowerCase()==='priest')
                  .sort((a,b)=> ((Number(a.party_id)||99)-(Number(b.party_id)||99)) || ((Number(a.slot_id)||99)-(Number(b.slot_id)||99)))
                  .slice(0,3);
                const priestIcons = [icons.star, icons.moon, icons.cross];
                const priestTexts = ['Shackle Left, middle, right.', 'Shackle Left, middle, right.', 'Shackle Left, middle, right.'];
                priests.forEach((p, i) => { toAdd.push({ r: p, icon: priestIcons[i] || null, text: priestTexts[i] }); });
                // Shamans: 4 lowest by group/slot with mark-specific text
                const shamans = (Array.isArray(roster)?roster:[])
                  .filter(r => String(r.class_name||'').toLowerCase()==='shaman')
                  .sort((a,b)=> ((Number(a.party_id)||99)-(Number(b.party_id)||99)) || ((Number(a.slot_id)||99)-(Number(b.slot_id)||99)))
                  .slice(0,4);
                const shamanIcons = [icons.triangle, icons.diamond, icons.square, icons.circle];
                const shamanMarks = ['Triangle','Diamond','Square','Circle'];
                shamans.forEach((s, i) => {
                  const mark = shamanMarks[i] || 'Triangle';
                  toAdd.push({ r: s, icon: shamanIcons[i] || null, text: `NF+Chain Heal on ${mark}` });
                });
              } catch {}
            } else if (bossKey.includes("thadd")) {
              // Thaddius defaults
              try {
                const resAll = await fetch(`/api/assignments/${eventId}`);
                const dataAll = await resAll.json();
                const panelsAll = Array.isArray(dataAll.panels) ? dataAll.panels : [];
                const tankPanel = panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking' && (!p.wing || String(p.wing).trim()==='' || String(p.wing).toLowerCase()==='main'))
                                   || panelsAll.find(p => String(p.boss||'').toLowerCase()==='tanking');
                const findByMarker = (markerSubstr) => {
                  if (!tankPanel || !Array.isArray(tankPanel.entries)) return null;
                  const entry = tankPanel.entries.find(en => String(en.marker_icon_url||'').toLowerCase().includes(markerSubstr));
                  if (!entry || !entry.character_name) return null;
                  return roster.find(r => String(r.character_name).toLowerCase() === String(entry.character_name).toLowerCase()) || { character_name: entry.character_name, class_name: entry.class_name };
                };
                const id1 = findByMarker('skull');
                const id2 = findByMarker('cross');
                const id3 = findByMarker('square');
                const id4 = findByMarker('moon');
                if (id1) toAdd.push({ r: id1, icon: icons.skull, text: 'Tank Stalagg (Right Side)' });
                if (id3) toAdd.push({ r: id3, icon: icons.skull, text: 'Tank Stalagg (Right Side)' });
                if (id2) toAdd.push({ r: id2, icon: icons.cross, text: 'Tank Feugen (Left Side)' });
                if (id4) toAdd.push({ r: id4, icon: icons.cross, text: 'Tank Feugen (Left Side)' });
                if (id1) toAdd.push({ r: id1, icon: icons.skull, text: 'Tank Boss' });

                // Group 8 healers → split between sides (up to 5), extra goes right; if >=2 of same class, split across sides
                const healerClasses = new Set(['shaman','priest','druid']);
                const g8HealersAll = (Array.isArray(roster)?roster:[])
                  .filter(r => Number(r.party_id) === 8 && healerClasses.has(String(r.class_name||'').toLowerCase()))
                  .sort((a,b)=> (Number(a.slot_id)||99) - (Number(b.slot_id)||99));
                const g8Healers = g8HealersAll.slice(0, 5);
                if (g8Healers.length > 0) {
                  const classToPlayers = new Map();
                  for (const r of g8Healers) {
                    const cls = String(r.class_name||'').toLowerCase();
                    if (!classToPlayers.has(cls)) classToPlayers.set(cls, []);
                    classToPlayers.get(cls).push(r);
                  }
                  const left = [];
                  const right = [];
                  const placed = new Set();
                  // Ensure both sides get a player for classes with >= 2
                  for (const [cls, arr] of classToPlayers.entries()) {
                    if (arr.length >= 2) {
                      const a = arr[0]; const b = arr[1];
                      left.push(a); placed.add(a.character_name);
                      right.push(b); placed.add(b.character_name);
                    }
                  }
                  // Remaining players preserve original order
                  const leftovers = g8Healers.filter(r => !placed.has(r.character_name));
                  for (const r of leftovers) {
                    // bias right on tie so odd extra goes right
                    if (left.length < right.length) left.push(r); else right.push(r);
                  }
                  // Create entries
                  for (const r of left)  toAdd.push({ r, icon: null, text: 'Go left side' });
                  for (const r of right) toAdd.push({ r, icon: null, text: 'Go right side' });
                }
              } catch {}
            }

            // Insert at top in order; ensure edit mode for visibility
            Array.from(list.children).forEach(r => { if (typeof r._setEdit === 'function') r._setEdit(); });
            controls.style.display = 'flex';
            for (let i = toAdd.length - 1; i >= 0; i--) {
              const { r, icon, text } = toAdd[i];
              const entry = {
                character_name: r.character_name,
                class_name: r.class_name,
                spec_name: r.spec_name,
                spec_emote: r.spec_emote,
                marker_icon_url: icon,
                assignment: text
              };
              renderEntryRow(entry, 0);
              // move to top (prepend) by inserting before first child
              const newRow = list.lastElementChild;
              if (newRow) list.insertBefore(newRow, list.firstElementChild);
            }
            renumberRows();
          } catch {}
        });

        editBtn?.addEventListener('click', () => {
          Array.from(list.children).forEach(r => { if (typeof r._setEdit === 'function') r._setEdit(); });
          controls.style.display = 'flex';
          renderDesc(false);
          renderVideoInput(false);
          // show save, hide edit while in edit mode
          if (saveBtn) saveBtn.style.display = 'inline-block';
          if (editBtn) editBtn.style.display = 'none';
          if (addDefaultsBtn) addDefaultsBtn.style.display = 'inline-block';
          if (isHorsemenPanel && typeof panelDiv._renderHorseGrid === 'function') panelDiv._renderHorseGrid(false);
          if (isLoathebPanel && typeof panelDiv._renderSporeGrid === 'function') panelDiv._renderSporeGrid(false);
          if (isKelPanel && typeof panelDiv._renderKelGrid === 'function') panelDiv._renderKelGrid(false);
        });

        saveBtn?.addEventListener('click', async () => {
        const payloadPanel = {
            dungeon,
            wing: wing || '',
            boss,
            strategy_text: (content.querySelector('[data-field="strategy_text"]')?.value) || strategy_text || '',
            image_url: (content.querySelector('[data-field="image_url"]')?.value) || image_url || '',
            video_url: (content.querySelector('[data-field="video_url"]')?.value) || '',
            entries: []
          };
          // Persist Four Horsemen grid state if present
          if (isHorsemenPanel && horseGridState) {
            payloadPanel.horsemen_tanks = horseGridState.tanksByRow;
            // also persist as hidden entries so the state restores even if horsemen_tanks is missing
            Object.entries(horseGridState.tanksByRow).forEach(([row, arr]) => {
              const name = (arr||[])[0];
              if (!name) return;
              payloadPanel.entries.push({
                character_name: name,
                marker_icon_url: null,
                assignment: `__HGRID__:${row}:1`,
                accept_status: (horseGridState.acceptByRow && horseGridState.acceptByRow[row]) ? horseGridState.acceptByRow[row] : null
              });
            });
          }
          // Persist Loatheb Spore Groups if present
          if (isLoathebPanel && sporeGridState) {
            payloadPanel.spore_groups = sporeGridState.groups;
            Object.entries(sporeGridState.groups).forEach(([group, arr]) => {
              (arr||[]).forEach((name, idx) => {
                if (!name) return;
                payloadPanel.entries.push({
                  character_name: name,
                  marker_icon_url: null,
                  assignment: `__SPORE__:${group}:${idx+1}`,
                  accept_status: null
                });
              });
            });
          }
          // Persist Kel'Thuzad Groups if present
          if (isKelPanel && kelGridState) {
            payloadPanel.kel_groups = kelGridState.groups;
            Object.entries(kelGridState.groups).forEach(([group, arr]) => {
              (arr||[]).forEach((name, idx) => {
                if (!name) return;
                payloadPanel.entries.push({
                  character_name: name,
                  marker_icon_url: null,
                  assignment: `__KEL__:${group}:${idx+1}`,
                  accept_status: null
                });
              });
            });
          }
          for (const row of Array.from(list.children)) {
            if (!row.querySelector) continue;
            const getVal = sel => row.querySelector(sel)?.value || '';
            const entry = {
              character_name: getVal('[data-field="character_name"]') || row.querySelector('.character-name')?.textContent || '',
              marker_icon_url: row.dataset.markerUrl || null,
              assignment: getVal('[data-field="assignment"]') || row.querySelector('.entry-assignment-text')?.textContent || '',
              accept_status: row.dataset.acceptStatus || null
            };
            if (entry.character_name) payloadPanel.entries.push(entry);
          }

            const eventId = getActiveEventId();
            const res = await fetch(`/api/assignments/${eventId}/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ panels: [payloadPanel] })
            });
            // Switch to view mode
            Array.from(list.children).forEach(r => { if (typeof r._setReadOnly === 'function') r._setReadOnly(); });
            controls.style.display = 'none';
            currentStrategy = payloadPanel.strategy_text;
            currentVideoUrl = payloadPanel.video_url || '';
            renderDesc(true);
            renderVideoInput(true);
            renderVideo();
            // hide save, show edit
            if (saveBtn) saveBtn.style.display = 'none';
            if (editBtn) editBtn.style.display = 'inline-block';
            if (addDefaultsBtn) addDefaultsBtn.style.display = 'none';
          if (isHorsemenPanel && typeof panelDiv._renderHorseGrid === 'function') panelDiv._renderHorseGrid(true);
          if (isLoathebPanel && typeof panelDiv._renderSporeGrid === 'function') panelDiv._renderSporeGrid(true);
          if (isKelPanel && typeof panelDiv._renderKelGrid === 'function') panelDiv._renderKelGrid(true);
        });
    }

    return panelDiv;
  }

  // Lightweight panel builder for Main Assignments (no big image/video)
  function buildMainPanel(panel, user, roster) {
    const { dungeon, wing, boss, strategy_text } = panel;
    const canManage = !!(user && user.loggedIn && user.hasManagementRole);
    const headerTitle = boss || 'Panel';
    const entries = Array.isArray(panel.entries) ? panel.entries : [];
    const nameToDiscordId = new Map((Array.isArray(roster)?roster:[]).map(r => [String(r.character_name||'').toLowerCase(), r.discord_user_id]));

    const panelDiv = document.createElement('div');
    panelDiv.className = 'manual-rewards-section main-panel';
    panelDiv.dataset.panelBoss = String(boss || '').toLowerCase();
    if (panel.header_color) { try { panelDiv.style.setProperty('--panel-accent', panel.header_color); } catch {} }

    const header = document.createElement('div');
    header.className = 'section-header assignment-header';
    if (panel.header_color) header.style.background = panel.header_color;
    const headerImg = panel.header_icon_url || '';
    header.innerHTML = `
      <h2>${headerImg ? `<img src="${headerImg}" alt="Header" class="boss-icon" style="width:50px;height:50px;border-radius:50%;border:2px solid #fff;">` : ''} ${headerTitle}</h2>
      <div class="assignments-actions" ${canManage ? '' : 'style="display:none;"'}>
        <button class="btn-add-defaults" title="Add default assignments" data-panel-key="${dungeon}|${wing || ''}|${boss}"><i class="fas fa-magic"></i> Add default assignments</button>
        <button class="btn-edit" title="Edit Panel" data-panel-key="${dungeon}|${wing || ''}|${boss}"><i class="fas fa-edit"></i> Edit</button>
        <button class="btn-save" style="display:none;" title="Save" data-panel-key="${dungeon}|${wing || ''}|${boss}"><i class="fas fa-save"></i> Save</button>
      </div>
    `;

    const content = document.createElement('div');
    content.className = 'manual-rewards-content';

    // Optional short description
    let currentStrategy = strategy_text || '';
    const desc = document.createElement('div');
    function renderDesc(readOnly) {
      if (readOnly) {
        desc.innerHTML = currentStrategy ? `<p class="strategy-text" style="color:#ddd; line-height:1.4;">${currentStrategy}</p>` : '';
      } else {
        desc.innerHTML = `<textarea class="assignment-editable assignment-textarea" data-field="strategy_text" placeholder="Optional notes...">${currentStrategy || ''}</textarea>`;
      }
    }
    renderDesc(true);

    const list = document.createElement('div');
    list.className = 'assignment-entries';

    let isEditing = false;

    function renderEntryRow(e, i) {
      const row = document.createElement('div');
      row.className = 'assignment-entry-row ranking-item';
      row.dataset.entry = '1';
      if (e.accept_status) row.dataset.acceptStatus = e.accept_status;

      const charInfo = document.createElement('div');
      const current = {
        character_name: e.character_name || '',
        class_name: e.class_name || '',
        spec_name: e.spec_name || '',
        spec_emote: e.spec_emote || '',
        spec_icon_url: e.spec_icon_url || '',
        target_character_name: e.target_character_name || e.assignment || ''
      };
      function renderCharInfo(readOnly) {
        const rosterClsInit = getRosterClassByName(roster, current.character_name);
        const canonicalInit = canonicalizeClass(current.class_name, rosterClsInit);
        charInfo.className = `character-info class-${classToCssName(canonicalInit)}`;
        if (readOnly) {
          charInfo.innerHTML = `
            ${getSpecIconHtml(current.spec_name, current.class_name, current.spec_emote, current.spec_icon_url)}
            <span class="character-name" style="display:inline-flex; align-items:center;">${current.character_name}</span>
          `;
        } else {
          charInfo.innerHTML = `
            ${getSpecIconHtml(current.spec_name, current.class_name, current.spec_emote, current.spec_icon_url)}
            <select class="assignment-editable" data-field="character_name" style="max-width:260px;">
              <option value="">Select player...</option>
              ${roster.map(r => `<option value="${r.character_name}" data-class="${r.class_name || ''}" data-spec="${r.spec_name || ''}" data-emote="${r.spec_emote || ''}" data-specicon="${r.spec_icon_url || ''}" data-color="${r.class_color || ''}" ${r.character_name===current.character_name?'selected':''}>${r.character_name}</option>`).join('')}
            </select>
          `;
          const select = charInfo.querySelector('[data-field="character_name"]');
          select.addEventListener('change', async () => {
            const opt = select.selectedOptions[0];
            current.character_name = opt?.value || '';
            current.class_name = opt?.dataset.class || '';
            current.spec_name = opt?.dataset.spec || '';
            current.spec_emote = opt?.dataset.emote || '';
            current.spec_icon_url = opt?.dataset.specicon || '';
            const rosterCls = getRosterClassByName(roster, current.character_name);
            const canonical = canonicalizeClass(current.class_name, rosterCls);
            charInfo.className = `character-info class-${classToCssName(canonical)}`;
            charInfo.querySelector('.spec-icon')?.remove();
            const before = document.createElement('span');
            before.innerHTML = getSpecIconHtml(current.spec_name, current.class_name, current.spec_emote, current.spec_icon_url);
            charInfo.insertBefore(before.firstChild, charInfo.firstChild);
            const nameEl = charInfo.querySelector('.character-name');
            if (nameEl) nameEl.textContent = opt.value || '';
            // Auto-assign icon for buffs/curses based on class
            if (vSelect === 'buffs' || vSelect === 'curses') {
              const cls = (current.class_name || '').toLowerCase();
              const iconMap = vSelect === 'buffs' ? {
                mage: 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_magicalsentry.jpg',
                priest: 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_wordfortitude.jpg',
                druid: 'https://wow.zamimg.com/images/wow/icons/large/spell_nature_regeneration.jpg'
              } : {
                mage: 'https://wow.zamimg.com/images/wow/icons/large/spell_nature_removecurse.jpg',
                priest: 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_dispelmagic.jpg'
              };
              const iconUrl = iconMap[cls] || '';
              e.marker_icon_url = iconUrl;
              row.dataset.markerUrl = iconUrl;
              renderMarker(!isEditing);
            }
            // Reset acceptance on assigned player change
            row.dataset.acceptStatus = '';
            e.accept_status = '';
            try {
              const eventId = getActiveEventId();
              await fetch(`/api/assignments/${eventId}/entry/accept`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dungeon, wing: wing || '', boss, character_name: current.character_name, accept_status: null })
              });
            } catch {}
            renderAcceptArea();
          });
        }
        // Sapphiron defaults are handled in Add Defaults branch within this handler
      }
      renderCharInfo(true);

      // Marker icon (or fixed icon for healing variant)
      const markerUrls = [
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/1_skull_faqei8.png',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/2_cross_kj9wuf.png',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/3_square_yqucv9.png',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/4_moon_vwhoen.png',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/5_triangle_rbpjyi.png',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/6_diamond_hre1uj.png',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/7_circle_zayctt.png',
        'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/8_star_kbuiaq.png'
      ];
      const markerWrapper = document.createElement('div');
      function renderMarker(readOnly) {
        markerWrapper.innerHTML = '';
        const box = document.createElement('div');
        box.className = 'marker-box';
        function updateBox(url) {
          box.innerHTML = '';
          if (url) { const img = document.createElement('img'); img.src = url; img.alt = 'Marker'; box.appendChild(img); }
        }
        const vType = String(panel.variant || '').toLowerCase();
        let currentUrl = '';
        if (vType === 'healing') {
          currentUrl = panel.fixed_icon_url || '';
        } else if (vType === 'buffs' || vType === 'curses') {
          const cls = (current.class_name || '').toLowerCase();
          const iconMap = vType === 'buffs' ? {
            mage: 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_magicalsentry.jpg',
            priest: 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_wordfortitude.jpg',
            druid: 'https://wow.zamimg.com/images/wow/icons/large/spell_nature_regeneration.jpg'
          } : {
            mage: 'https://wow.zamimg.com/images/wow/icons/large/spell_nature_removecurse.jpg',
            priest: 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_dispelmagic.jpg'
          };
          currentUrl = e.marker_icon_url || row.dataset.markerUrl || iconMap[cls] || '';
        } else {
          currentUrl = e.marker_icon_url || row.dataset.markerUrl || '';
        }
        updateBox(currentUrl);
        row.dataset.markerUrl = currentUrl;
        if (!readOnly && !(vType === 'healing' || vType === 'buffs' || vType === 'curses')) {
          box.style.cursor = 'pointer';
          box.title = 'Click to cycle marker';
          box.addEventListener('click', async () => {
            const cur = row.dataset.markerUrl || '';
            const idx = markerUrls.indexOf(cur);
            let nextUrl = '';
            if (idx === -1) nextUrl = markerUrls[0];
            else if (idx < markerUrls.length - 1) nextUrl = markerUrls[idx + 1];
            else nextUrl = '';
            e.marker_icon_url = nextUrl || null;
            row.dataset.markerUrl = nextUrl;
            updateBox(nextUrl);
            // Reset acceptance on marker change
            row.dataset.acceptStatus = '';
            e.accept_status = '';
            try {
              const eventId = getActiveEventId();
              await fetch(`/api/assignments/${eventId}/entry/accept`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dungeon, wing: wing || '', boss, character_name: (current.character_name||'').trim(), accept_status: null })
              });
            } catch {}
            renderAcceptArea();
          });
        }
        markerWrapper.appendChild(box);
      }
      if (canManage) renderMarker(false); else renderMarker(true);

      const assignText = document.createElement('div');
      assignText.className = 'entry-assignment-text';
      const variantLower = String(panel.variant || '').toLowerCase();
      if (variantLower === 'healing') {
        const targetName = current.target_character_name || '';
        const tClass = getRosterClassByName(roster, targetName);
        const canonical = canonicalizeClass('', tClass);
        const color = getRosterClassColorByName(roster, targetName);
        assignText.innerHTML = `<span class="character-name class-${classToCssName(canonical)}" style="display:inline-flex; align-items:center; color:${color} !important;">${targetName}</span>`;
        row.dataset.assignment = targetName;
      } else if (variantLower === 'buffs') {
        assignText.textContent = e.assignment || '';
        row.dataset.assignment = e.assignment || '';
      } else {
        assignText.textContent = e.assignment || '';
        row.dataset.assignment = e.assignment || '';
      }

      row.appendChild(charInfo);
      row.appendChild(markerWrapper);
      row.appendChild(assignText);

      const acceptCol = document.createElement('div');
      acceptCol.className = 'accept-col';
      row.appendChild(acceptCol);

      function getStatusIconHtml(status, interactive) {
        if (status === 'accept') return `<i class=\"fas fa-check-circle\" style=\"color:#10b981; font-size:40px; line-height:40px;\"></i>`;
        if (status === 'decline') return `<i class=\"fas fa-ban\" style=\"color:#ef4444; font-size:40px; line-height:40px;\"></i>`;
        const unsetColor = interactive ? '#fbbf24' : '#9ca3af';
        return `<i class=\"fas fa-question-circle\" style=\"color:${unsetColor}; font-size:40px; line-height:40px;\"></i>`;
      }

      function renderAcceptArea() {
        acceptCol.innerHTML = '';
        const charName = (current.character_name || '').trim();
        const ownerId = nameToDiscordId.get(charName.toLowerCase()) || null;
        const isOwner = !!(user && user.loggedIn && user.id && ownerId && String(user.id) === String(ownerId));
        const showControls = !!(user && user.loggedIn && (isOwner || (canManage && isEditing)));
        const curStatus = (row.dataset.acceptStatus !== undefined) ? row.dataset.acceptStatus : (e.accept_status || '');
        if (showControls) {
          const btn = document.createElement('button');
          btn.className = 'status-toggle-btn';
          btn.type = 'button';
          btn.innerHTML = getStatusIconHtml(curStatus, true);
          acceptCol.appendChild(btn);
          btn.addEventListener('click', async (ev) => {
            ev.preventDefault();
            const prev = (row.dataset.acceptStatus !== undefined) ? row.dataset.acceptStatus : (e.accept_status || '');
            let next = '';
            if (!prev) next = 'accept';
            else if (prev === 'accept') next = 'decline';
            else next = '';
            row.dataset.acceptStatus = next;
            e.accept_status = next;
            const eventId = getActiveEventId();
            try {
              await fetch(`/api/assignments/${eventId}/entry/accept`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dungeon, wing: wing || '', boss, character_name: charName, accept_status: next || null })
              });
            } catch {}
            btn.innerHTML = getStatusIconHtml(next, true);
          });
        } else {
          const status = document.createElement('div');
          status.className = 'status-icon';
          status.innerHTML = getStatusIconHtml(curStatus || '', false);
          acceptCol.appendChild(status);
        }
      }
      renderAcceptArea();

      if (canManage) {
        function setMode(readOnly) {
          const isHealing = String(panel.variant || '').toLowerCase() === 'healing';
          const ta = row.querySelector('[data-field="assignment"]');
          if (readOnly) {
            assignText.className = 'entry-assignment-text';
            if (isHealing) {
              const finalTarget = row.querySelector('[data-field="target_character_name"]')?.value || (row.dataset.assignment || '');
              row.dataset.assignment = finalTarget;
              const tClass = getRosterClassByName(roster, finalTarget);
              const canonical = canonicalizeClass('', tClass);
              const color = getRosterClassColorByName(roster, finalTarget);
              assignText.innerHTML = `<span class=\"character-name class-${classToCssName(canonical)}\" style=\"display:inline-flex; align-items:center; color:${color} !important;\">${finalTarget}</span>`;
            } else {
              const finalText = (ta && typeof ta.value === 'string') ? ta.value : (row.dataset.assignment || '');
              assignText.textContent = finalText;
              row.dataset.assignment = finalText;
            }
            renderCharInfo(true);
            renderMarker(true);
            const existingDel = row.querySelector('.delete-x');
            if (existingDel) existingDel.remove();
            isEditing = false;
            renderAcceptArea();
          } else {
            assignText.className = '';
            if (isHealing) {
              assignText.innerHTML = `
                <select class=\"assignment-editable\" data-field=\"target_character_name\" style=\"max-width:260px;\">
                  <option value=\"\">Select target...</option>
                  ${roster.map(r => `<option value="${r.character_name}" ${r.character_name===(row.dataset.assignment||'')?'selected':''}>${r.character_name}</option>`).join('')}
                </select>
              `;
            } else {
              assignText.innerHTML = `<textarea class=\"assignment-editable assignment-assignment-textarea\" data-field=\"assignment\" placeholder=\"Assignment\">${(row.dataset.assignment || '')}</textarea>`;
            }
            renderCharInfo(false);
            renderMarker(false);
            const taLive = row.querySelector('[data-field="assignment"]');
            if (taLive) { taLive.addEventListener('input', () => { row.dataset.acceptStatus = ''; e.accept_status = ''; row.dataset.assignment = taLive.value || ''; renderAcceptArea(); }); }
            const targetSel = row.querySelector('[data-field="target_character_name"]');
            if (targetSel) { targetSel.addEventListener('change', () => { row.dataset.acceptStatus = ''; e.accept_status = ''; row.dataset.assignment = targetSel.value || ''; renderAcceptArea(); }); }
            let del = row.querySelector('.delete-x');
            if (!del) { del = document.createElement('button'); del.className = 'delete-x'; del.innerHTML = '&times;'; del.title = 'Delete assignment'; del.addEventListener('click', () => { row.remove(); renumberRows(); }); row.appendChild(del); }
            isEditing = true;
            renderAcceptArea();
          }
        }
        row._setReadOnly = () => setMode(true);
        row._setEdit = () => setMode(false);
      }

      list.appendChild(row);
    }

    function renumberRows() {
      Array.from(list.querySelectorAll('.ranking-position')).forEach((el, idx) => el.textContent = String(idx + 1));
    }

    entries.forEach((e, i) => renderEntryRow(e, i));

    content.appendChild(desc);
    content.appendChild(list);
    panelDiv.appendChild(header);
    panelDiv.appendChild(content);

    if (canManage) {
      const editBtn = header.querySelector('.btn-edit');
      const saveBtn = header.querySelector('.btn-save');
      const addDefaultsBtn = header.querySelector('.btn-add-defaults');
      if (addDefaultsBtn) addDefaultsBtn.style.display = 'none';

      const controls = document.createElement('div');
      controls.style.display = 'flex';
      controls.style.gap = '10px';
      controls.style.padding = '0 20px 20px 20px';

      const addBtn = document.createElement('button');
      addBtn.className = 'btn-add';
      addBtn.innerHTML = '<i class="fas fa-plus"></i> Add Entry';
      addBtn.addEventListener('click', () => {
        const newEntry = { character_name: '', class_name: 'Mage', spec_name: '', spec_emote: '', assignment: '', marker_icon_url: null };
        if (String(boss).toLowerCase() === 'buffs') newEntry.marker_icon_url = 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_magicalsentry.jpg';
        renderEntryRow(newEntry, list.children.length);
        // Restrict dropdown to Mage/Priest/Druid by removing other options
        if (String(boss).toLowerCase() === 'buffs') {
          const last = list.lastElementChild;
          const sel = last?.querySelector('[data-field="character_name"]');
          if (sel) {
            Array.from(sel.options).forEach(opt => {
              const cls = (opt.getAttribute('data-class') || '').toLowerCase();
              if (opt.value && !['mage','priest','druid'].includes(cls)) opt.remove();
            });
          }
        }
        renumberRows();
        const last = list.lastElementChild; if (last && typeof last._setEdit === 'function') last._setEdit();
      });
      controls.appendChild(addBtn);
      controls.style.display = 'none';
      content.appendChild(controls);

      // Defaults per panel (Tanking / Healing / Buffs / Curses)
      addDefaultsBtn?.addEventListener('click', async () => {
        try {
          const eventId = getActiveEventId();
          const rosterData = await fetchRoster(eventId);
          const sortByGS = (a,b) => ((Number(a.party_id)||99) - (Number(b.party_id)||99)) || ((Number(a.slot_id)||99) - (Number(b.slot_id)||99));
          const toAdd = [];
          const bossLower = String(boss).toLowerCase();
          if (bossLower === 'tanking') {
            const warriors = rosterData.filter(r => String(r.class_name||'').toLowerCase()==='warrior').sort(sortByGS);
            const icons = [
              'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/1_skull_faqei8.png',
              'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/2_cross_kj9wuf.png',
              'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/3_square_yqucv9.png',
              'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/4_moon_vwhoen.png',
              'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/5_triangle_rbpjyi.png',
              'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/6_diamond_hre1uj.png',
              'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/7_circle_zayctt.png',
              'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/8_star_kbuiaq.png'
            ];
            const labels = ['Main Tank','Off Tank 1','Off Tank 2','Off Tank 3','DPS Tank 1','DPS Tank 2','DPS Tank 3','DPS Tank 4'];
            for (let i=0; i<8 && i<warriors.length; i++) { const r=warriors[i]; toAdd.push({ r, icon: icons[i], text: labels[i] }); }
          } else if (bossLower === 'healing') {
            // Gather tank names from Tanking panel rendered above
            const containerEl = document.getElementById('assignments-container');
            const tankPanel = containerEl?.querySelector('.manual-rewards-section[data-panel-boss="tanking"]');
            const tankTargets = [];
            if (tankPanel) {
              const rows = Array.from(tankPanel.querySelectorAll('.assignment-entry-row'));
              for (const row of rows) {
                const sel = row.querySelector('[data-field="character_name"]');
                const nameEl = row.querySelector('.character-name');
                const val = (sel && sel.value) ? sel.value : (nameEl?.textContent?.trim() || '');
                if (val) tankTargets.push(val);
              }
            }
            const shamans = rosterData.filter(r => String(r.class_name||'').toLowerCase()==='shaman').sort(sortByGS);
            const priests = rosterData.filter(r => String(r.class_name||'').toLowerCase()==='priest').sort(sortByGS);
            const druids  = rosterData.filter(r => String(r.class_name||'').toLowerCase()==='druid').sort(sortByGS);
            const pushPair = (r, idx) => { if (r && tankTargets[idx]) toAdd.push({ r, icon: (panel.fixed_icon_url||''), text: tankTargets[idx] }); };
            for (let i=0;i<8;i++) pushPair(shamans[i], i);
            for (let i=0;i<4;i++) pushPair(priests[i], i);
            for (let i=0;i<2;i++) pushPair(druids[i],  i);
          } else if (bossLower === 'buffs') {
            const mages = rosterData.filter(r => String(r.class_name||'').toLowerCase()==='mage').sort(sortByGS);
            const priests = rosterData.filter(r => String(r.class_name||'').toLowerCase()==='priest').sort(sortByGS);
            const druids = rosterData.filter(r => String(r.class_name||'').toLowerCase()==='druid').sort(sortByGS);
            const groups = [1,2,3,4,5,6,7,8];
            const contiguousChunks = (count) => {
              if (count <= 0) return [];
              const base = Math.floor(groups.length / count);
              const rem = groups.length % count;
              const chunks = [];
              let idx = 0;
              for (let i=0;i<count;i++) {
                const take = base + (i < rem ? 1 : 0);
                chunks.push(groups.slice(idx, idx+take));
                idx += take;
              }
              return chunks;
            };
            const assign = (players, iconUrl) => {
              if (!players.length) return;
              const chunks = contiguousChunks(players.length);
              // give extra to higher group/slot players
              const sorted = players.slice().sort(sortByGS).reverse();
              for (let i=0;i<sorted.length;i++) {
                const r = sorted[i];
                const chunk = chunks[i] || [];
                if (!chunk.length) continue;
                let text = '';
                if (chunk.length === 8) text = 'All groups';
                else if (chunk.length === 1) text = `Group ${chunk[0]}`;
                else if (chunk.length === 2) text = `Group ${chunk[0]} and ${chunk[1]}`;
                else {
                  const head = chunk.slice(0, -1).join(', ');
                  text = `Group ${head} and ${chunk[chunk.length - 1]}`;
                }
                toAdd.push({ r, icon: iconUrl, text });
              }
            };
            assign(mages, 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_magicalsentry.jpg');
            assign(priests, 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_wordfortitude.jpg');
            assign(druids, 'https://wow.zamimg.com/images/wow/icons/large/spell_nature_regeneration.jpg');
          } else if (bossLower === 'decurse and dispel') {
            const mages = rosterData.filter(r => String(r.class_name||'').toLowerCase()==='mage').sort(sortByGS);
            const priests = rosterData.filter(r => String(r.class_name||'').toLowerCase()==='priest').sort(sortByGS);
            const groups = [1,2,3,4,5,6,7,8];
            const contiguousChunks = (count) => {
              if (count <= 0) return [];
              const base = Math.floor(groups.length / count);
              const rem = groups.length % count;
              const chunks = [];
              let idx = 0;
              for (let i=0;i<count;i++) {
                const take = base + (i < rem ? 1 : 0);
                chunks.push(groups.slice(idx, idx+take));
                idx += take;
              }
              return chunks;
            };
            const assign = (players, iconUrl) => {
              if (!players.length) return;
              const chunks = contiguousChunks(players.length);
              const sorted = players.slice().sort(sortByGS).reverse();
              for (let i=0;i<sorted.length;i++) {
                const r = sorted[i];
                const chunk = chunks[i] || [];
                if (!chunk.length) continue;
                let text = '';
                if (chunk.length === 8) text = 'All groups';
                else if (chunk.length === 1) text = `Group ${chunk[0]}`;
                else if (chunk.length === 2) text = `Group ${chunk[0]} and ${chunk[1]}`;
                else { const head = chunk.slice(0, -1).join(', '); text = `Group ${head} and ${chunk[chunk.length - 1]}`; }
                toAdd.push({ r, icon: iconUrl, text });
              }
            };
            assign(mages, 'https://wow.zamimg.com/images/wow/icons/large/spell_nature_removecurse.jpg');
            assign(priests, 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_dispelmagic.jpg');
          } else if (bossLower === 'curses and soul stones') {
            // Curses and Soul Stones
            const warlocks = rosterData.filter(r => String(r.class_name||'').toLowerCase()==='warlock').sort(sortByGS);
            const priests = rosterData.filter(r => String(r.class_name||'').toLowerCase()==='priest').sort(sortByGS);
            // Curses
            if (warlocks[0]) toAdd.push({ r: warlocks[0], icon: 'https://wow.zamimg.com/images/wow/icons/large/spell_shadow_unholystrength.jpg', text: 'Curse of Recklessness' });
            if (warlocks[1]) toAdd.push({ r: warlocks[1], icon: 'https://wow.zamimg.com/images/wow/icons/large/spell_shadow_chilltouch.jpg', text: 'Curse of the Elements' });
            if (warlocks[2]) toAdd.push({ r: warlocks[2], icon: 'https://wow.zamimg.com/images/wow/icons/large/spell_shadow_curseofachimonde.jpg', text: 'Curse of Shadow' });
            // Soulstones on lowest priests
            const soulIcon = 'https://wow.zamimg.com/images/wow/icons/large/inv_misc_orb_04.jpg';
            for (let i=0;i<3;i++) {
              if (warlocks[i] && priests[i]) {
                const pName = priests[i].character_name;
                toAdd.push({ r: warlocks[i], icon: soulIcon, text: `Soulstone on ${pName}` });
              }
            }
          } else if (bossLower === 'power infusion') {
            // Pair priests to mages in order (min length)
            const priests = rosterData.filter(r => String(r.class_name||'').toLowerCase()==='priest').sort(sortByGS);
            const mages = rosterData.filter(r => String(r.class_name||'').toLowerCase()==='mage').sort(sortByGS);
            const pairs = Math.min(priests.length, mages.length);
            const piIcon = 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_powerinfusion.jpg';
            for (let i=0;i<pairs;i++) {
              const pr = priests[i];
              const mg = mages[i];
              toAdd.push({ r: pr, icon: piIcon, text: mg.character_name, targetName: mg.character_name });
            }
          }
          Array.from(list.children).forEach(r => { if (typeof r._setEdit === 'function') r._setEdit(); });
          controls.style.display = 'flex';
          for (let i = 0; i < toAdd.length; i++) {
            const { r, icon, text, targetName } = toAdd[i];
            const entry = {
              character_name: r.character_name,
              class_name: r.class_name,
              spec_name: r.spec_name,
              spec_emote: r.spec_emote,
              marker_icon_url: icon,
              assignment: text,
              target_character_name: (String(panel.variant||'').toLowerCase()==='healing') ? (targetName || text) : ''
            };
            renderEntryRow(entry, list.children.length);
          }
          renumberRows();
        } catch {}
      });

      editBtn?.addEventListener('click', () => {
        Array.from(list.children).forEach(r => { if (typeof r._setEdit === 'function') r._setEdit(); });
        controls.style.display = 'flex';
        renderDesc(false);
        if (saveBtn) saveBtn.style.display = 'inline-block';
        if (editBtn) editBtn.style.display = 'none';
        if (addDefaultsBtn) addDefaultsBtn.style.display = 'inline-block';
      });

      saveBtn?.addEventListener('click', async () => {
        const payloadPanel = {
          dungeon,
          wing: wing || '',
          boss,
          strategy_text: (content.querySelector('[data-field="strategy_text"]')?.value) || strategy_text || '',
          image_url: '',
          video_url: '',
          entries: []
        };
        for (const row of Array.from(list.children)) {
          if (!row.querySelector) continue;
          const getVal = sel => row.querySelector(sel)?.value || '';
          const isHealing = String(panel.variant || '').toLowerCase() === 'healing';
          const targetText = isHealing ? (
            row.querySelector('[data-field="target_character_name"]')?.value ||
            row.dataset.assignment ||
            row.querySelector('.entry-assignment-text')?.textContent ||
            ''
          ) : (
            getVal('[data-field="assignment"]') || row.querySelector('.entry-assignment-text')?.textContent || ''
          );
          const entry = {
            character_name: getVal('[data-field="character_name"]') || row.querySelector('.character-name')?.textContent || '',
            marker_icon_url: row.dataset.markerUrl || null,
            assignment: targetText,
            accept_status: row.dataset.acceptStatus || null
          };
          if (entry.character_name) payloadPanel.entries.push(entry);
        }
        const eventId = getActiveEventId();
        await fetch(`/api/assignments/${eventId}/save`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ panels: [payloadPanel] })
        });
        Array.from(list.children).forEach(r => { if (typeof r._setReadOnly === 'function') r._setReadOnly(); });
        controls.style.display = 'none';
        currentStrategy = payloadPanel.strategy_text;
        renderDesc(true);
            if (saveBtn) saveBtn.style.display = 'none';
            if (editBtn) editBtn.style.display = 'inline-block';
            if (addDefaultsBtn) addDefaultsBtn.style.display = 'none';
        });
    }

    return panelDiv;
  }

  async function loadAssignments() {
    const container = document.getElementById('assignments-container');
    if (!container) return;

    const eventId = getActiveEventId();
    if (!eventId) {
      container.innerHTML = '<div class="no-data-message"><div class="no-data-content"><i class="fas fa-info-circle"></i><h3>No Event Selected</h3><p>Select an event from the top bar to view assignments.</p></div></div>';
      return;
    }

    try {
      const user = await fetchUser();
      const canManage = !!(user && user.loggedIn && user.hasManagementRole);
      const roster = await fetchRoster(eventId);
      const res = await fetch(`/api/assignments/${eventId}`);
      const data = await res.json();
      if (!data.success) throw new Error('Failed');

      container.innerHTML = '';
      const panels = Array.isArray(data.panels) && data.panels.length > 0 ? data.panels : [];
      if (panels.length === 0) {
        container.innerHTML = '<div class="no-data-message"><div class="no-data-content"><i class="fas fa-info-circle"></i><h3>No Assignments</h3><p>No assignments found for this event.</p></div></div>';
        return;
      }

      const wing = getCurrentWing();
      // Non-NAX placeholder pages
      if (['aq40','bwl','mc'].includes(wing)) {
        container.innerHTML = '<div class="no-data-message"><div class="no-data-content"><i class="fas fa-tools"></i><h3>Coming Soon</h3><p>This assignments page is coming soon.</p></div></div>';
        return;
      }
      if (wing === 'main') {
        // Build Main Assignments panels (lightweight)
        const existingTanking = panels.find(p => String(p.boss || '').toLowerCase() === 'tanking' && (!p.wing || String(p.wing).trim() === '' || String(p.wing).toLowerCase() === 'main'));
        const tankingPanel = buildMainPanel({
          dungeon: existingTanking?.dungeon || 'Naxxramas',
          wing: '',
          boss: 'Tanking',
          strategy_text: existingTanking?.strategy_text || '',
          entries: Array.isArray(existingTanking?.entries) ? existingTanking.entries : [],
          header_color: '#c79c6e',
          header_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754862751/spec-protection-icon_dalb4j.webp'
        }, user, roster);

        const existingHealing = panels.find(p => String(p.boss || '').toLowerCase() === 'healing' && (!p.wing || String(p.wing).trim() === '' || String(p.wing).toLowerCase() === 'main'));
        const healingPanel = buildMainPanel({
          dungeon: existingHealing?.dungeon || 'Naxxramas',
          wing: '',
          boss: 'Healing',
          strategy_text: 'Shamans, bounce chain heals of your tank assignment. Keep them alive.',
          entries: Array.isArray(existingHealing?.entries) ? existingHealing.entries : [],
          header_color: '#10b981',
          header_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754862895/healer-rankings.C-zTQI8l_jadafc.avif',
          variant: 'healing',
          fixed_icon_url: 'https://wow.zamimg.com/images/wow/icons/large/spell_nature_healingwavegreater.jpg'
        }, user, roster);

        const existingBuffs = panels.find(p => String(p.boss || '').toLowerCase() === 'buffs' && (!p.wing || String(p.wing).trim() === '' || String(p.wing).toLowerCase() === 'main'));
        const buffsPanel = buildMainPanel({
          dungeon: existingBuffs?.dungeon || 'Naxxramas',
          wing: '',
          boss: 'Buffs',
          strategy_text: existingBuffs?.strategy_text || '',
          entries: Array.isArray(existingBuffs?.entries) ? existingBuffs.entries : [],
          header_color: '#3b82f6',
          header_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754928905/F5MOdkB-_400x400_cbcyvn.jpg',
          variant: 'buffs',
          fixed_icon_url: ''
        }, user, roster);

        const existingCurses = panels.find(p => String(p.boss || '').toLowerCase() === 'decurse and dispel' && (!p.wing || String(p.wing).trim() === '' || String(p.wing).toLowerCase() === 'main'));
        const cursesPanel = buildMainPanel({
          dungeon: existingCurses?.dungeon || 'Naxxramas',
          wing: '',
          boss: 'Decurse and Dispel',
          strategy_text: existingCurses?.strategy_text || '',
          entries: Array.isArray(existingCurses?.entries) ? existingCurses.entries : [],
          header_color: '#8b5cf6',
          header_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754931090/gK6G8u8_KkcqMmsuGLztWpCgl6C96mfwdFQyj-lBPH0AirTtVAXtJa0FfboixUyScp0UoFHxwzwo9C1DDLJmuA_g781hm.webp',
          variant: 'curses',
          fixed_icon_url: ''
        }, user, roster);

        const existingSoul = panels.find(p => String(p.boss || '').toLowerCase() === 'curses and soul stones' && (!p.wing || String(p.wing).trim() === '' || String(p.wing).toLowerCase() === 'main'));
        const soulPanel = buildMainPanel({
          dungeon: existingSoul?.dungeon || 'Naxxramas',
          wing: '',
          boss: 'Curses and Soul Stones',
          strategy_text: existingSoul?.strategy_text || '',
          entries: Array.isArray(existingSoul?.entries) ? existingSoul.entries : [],
          header_color: '#7c3aed',
          header_icon_url: 'https://wow.zamimg.com/images/wow/icons/large/spell_shadow_unholystrength.jpg',
          variant: 'soul',
          fixed_icon_url: ''
        }, user, roster);

        const existingPI = panels.find(p => String(p.boss || '').toLowerCase() === 'power infusion' && (!p.wing || String(p.wing).trim() === '' || String(p.wing).toLowerCase() === 'main'));
        const piPanel = buildMainPanel({
          dungeon: existingPI?.dungeon || 'Naxxramas',
          wing: '',
          boss: 'Power Infusion',
          strategy_text: existingPI?.strategy_text || '',
          entries: Array.isArray(existingPI?.entries) ? existingPI.entries : [],
          header_color: '#f59e0b',
          header_icon_url: 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_powerinfusion.jpg',
          variant: 'pi',
          fixed_icon_url: 'https://wow.zamimg.com/images/wow/icons/large/spell_holy_powerinfusion.jpg'
        }, user, roster);

        // Place side by side using a simple grid wrapper
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = '1fr 1fr';
        grid.style.gap = '16px';
        grid.appendChild(tankingPanel);
        grid.appendChild(healingPanel);
        // Put Buffs and Curses side-by-side below
        const below = document.createElement('div');
        below.style.display = 'grid';
        below.style.gridTemplateColumns = '1fr 1fr';
        below.style.gap = '16px';
        below.style.marginTop = '16px';
        below.appendChild(buffsPanel);
        below.appendChild(cursesPanel);
        const below2 = document.createElement('div');
        below2.style.display = 'grid';
        below2.style.gridTemplateColumns = '1fr 1fr';
        below2.style.gap = '16px';
        below2.style.marginTop = '16px';
        // Put soul panel next to an empty spacer for now
        below2.appendChild(soulPanel);
        below2.appendChild(piPanel);
        container.appendChild(grid);
        container.appendChild(below);
        container.appendChild(below2);
        return;
      }

      // Wing specific pages
      const match = panels.filter(p => String(p.wing || '').toLowerCase().includes(wing));
      let toRender = match.length > 0 ? match : [];
        if (toRender.length === 0) {
        // Provide sensible defaults for certain wings when nothing is saved yet
        if (wing === 'military') {
          const razPanel = {
            dungeon: 'Naxxramas',
            wing: 'Military',
            boss: 'Razuvious',
            strategy_text: 'Priests pull with mind control. Off-tanks tank adds. Mana users run out before Disruption Shout. Melee throw target dummies when needed.',
            image_url: 'https://placehold.co/1200x675?text=Razuvious',
            video_url: 'https://www.youtube.com/embed/XdWewsnOrhU',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754989023/182497_v3yeko.webp',
            entries: []
          };
          const gothikPanel = {
            dungeon: 'Naxxramas',
            wing: 'Military',
            boss: 'Gothik',
            strategy_text: 'Warriors on Undead side. Ranged and Rogues on Human side. Pop Greater Stoneshield on wave 9. We don\'t shackle. Healers',
            image_url: 'https://placehold.co/1200x675?text=Gothik',
            video_url: 'https://www.youtube.com/embed/MrBGF1P3eMM',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754993060/336px-Gothik_the_Harvester_full_gzj2ho.jpg',
            entries: []
          };
          const fourHorsemenPanel = {
            dungeon: 'Naxxramas',
            wing: 'Military',
            boss: 'The Four Horsemen',
            strategy_text: 'We nuke down and commit on Thane.\n\nHealer rotation starts on first mark and then healers all roather on every 3rd mark.',
            image_url: 'https://placehold.co/1200x675?text=The+Four+Horsemen',
            video_url: 'https://www.youtube.com/embed/nlKO8p3SMVw?controls=0&modestbranding=1&rel=0&iv_load_policy=3',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754993478/-16062_absih8.png',
            entries: []
          };
          container.innerHTML = '';
          container.appendChild(buildPanel(razPanel, user, roster));
          container.appendChild(buildPanel(gothikPanel, user, roster));
          container.appendChild(buildPanel(fourHorsemenPanel, user, roster));
          return;
        }
        if (wing === 'spider') {
          const maexPanel = {
            dungeon: 'Naxxramas',
            wing: 'Spider',
            boss: 'Maexxna',
            strategy_text: '',
            image_url: 'https://placehold.co/1200x675?text=Maexxna',
            video_url: 'https://www.youtube.com/embed/m5j7EHv7Dfw',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754984024/Maexx15928_o8jkro.png',
            entries: []
          };
          container.innerHTML = '';
          container.appendChild(buildPanel(maexPanel, user, roster));
          return;
        }
        if (wing === 'plague') {
          const nothPanel = {
            dungeon: 'Naxxramas',
            wing: 'Plague',
            boss: 'Noth The Plaguebringer',
            strategy_text: 'Mages and Druids MUST decurse instantly and exclusively when boss casts curse.\n\nOff-tanks pick up adds and stack them on boss.\n\nWhen boss teleports, let tank pick it up and then kill it.',
            image_url: 'https://placehold.co/1200x675?text=Noth+The+Plaguebringer',
            video_url: '',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755074097/16590_ezmekl.png',
            entries: []
          };
          const heiganPanel = {
            dungeon: 'Naxxramas',
            wing: 'Plague',
            boss: 'Heigan The Unclean',
            strategy_text: 'We can dance if we want to, we can leave your friends behind, cause your friends don\'t dance, and if they don\'t dance, well, they\'re no friends of mine.\n\nMelle stack behind tank and move perfectly. In dance phase, casters dance with melee.',
            image_url: 'https://placehold.co/1200x675?text=Heigan+The+Unclean',
            video_url: 'https://www.youtube.com/embed/dfSBp3Efjbk?controls=0&modestbranding=1&rel=0&iv_load_policy=3',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755075234/16309_kpg0jp.png',
            entries: []
          };
          const loathebPanel = {
            dungeon: 'Naxxramas',
            wing: 'Plague',
            boss: 'Loatheb',
            strategy_text: 'Pre-pop and use GSPP. Get a health stone. Use bandage if needed.\n\nHealers follow healing rotation and only heal main-tank. Stand in front of the boss and behind the tank. Don\'t use any holy spells (it will put your heal on cooldown)',
            image_url: 'https://placehold.co/1200x675?text=Loatheb',
            video_url: 'https://www.youtube.com/embed/_zwIx3uzoFI?controls=0&modestbranding=1&rel=0&iv_load_policy=3',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755080534/Fungal_monster_s0zutr.webp',
            entries: []
          };
          container.innerHTML = '';
          container.appendChild(buildPanel(nothPanel, user, roster));
          container.appendChild(buildPanel(heiganPanel, user, roster));
          container.appendChild(buildPanel(loathebPanel, user, roster));
          return;
        }
        if (wing === 'abomination') {
          const patchPanel = {
            dungeon: 'Naxxramas',
            wing: 'Abomination',
            boss: 'Patchwerk',
            strategy_text: 'Tanks MUST stack perfectly. Top 3 on threat must be tanks. Melee DPS dip in slime to juke hateful strike. Healers spam consumes and keep tanks up. Heal only tanks.',
            image_url: 'https://placehold.co/1200x675?text=Patchwerk',
            video_url: 'https://www.youtube.com/embed/bmpVXEQYIcg',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755085582/patchwerk_wfd5z4.gif',
            entries: []
          };
          const grobbPanel = {
            dungeon: 'Naxxramas',
            wing: 'Abomination',
            boss: 'Grobbulus',
            strategy_text: "Boss must face away from raid. Don't dispel unless assigned. Melee stay at max range and cleve when slime is up. Drop slime pools at the edge of the room.",
            image_url: 'https://placehold.co/1200x675?text=Grobbulus',
            video_url: 'https://www.youtube.com/embed/WhqA3O6HIJk',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755086620/24792_gahise.png',
            entries: []
          };
          const gluthPanel = {
            dungeon: 'Naxxramas',
            wing: 'Abomination',
            boss: 'Gluth',
            strategy_text: 'Rotate tanks on healing debuff if needed. Kite adds far from Boss. No one raid heal. Only heal tanks. Mages help on adds with frost nova. Casters stay on max range to dodge fear. Hunters place slow trap for kiting. Shamans use Tremor if in melee and earth binding if in ranged group.',
            image_url: 'https://placehold.co/1200x675?text=Gluth',
            video_url: 'https://www.youtube.com/embed/JWf9-N609PA',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755087393/27103_rdbmzc.png',
            entries: []
          };
          const thaddPanel = {
            dungeon: 'Naxxramas',
            wing: 'Abomination',
            boss: 'Thaddius',
            strategy_text: 'Phase 1:\nOdd groups left - Even groups right. Kill adds at the same time. Casters max range. Off-tank taunt on tank swap.\n\nPhase 2:\nStack in front of boss. On Polarity Shift, Minus go left. Plus go right. Run trough the boss.\n\nNotes:\nPlus goes right\nMinus goes left\nMages, watch the ignite.',
            image_url: 'https://placehold.co/1200x675?text=Thaddius',
            video_url: 'https://www.youtube.com/embed/lgDJq4-i4kk',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755087787/dfka9xt-cbdf45c1-45b9-460b-a997-5a46c4de0a65_txsidf.png',
            entries: []
          };
          container.innerHTML = '';
          container.appendChild(buildPanel(patchPanel, user, roster));
          container.appendChild(buildPanel(grobbPanel, user, roster));
          container.appendChild(buildPanel(gluthPanel, user, roster));
          container.appendChild(buildPanel(thaddPanel, user, roster));
          return;
        }
        if (wing === 'frostwyrm_lair') {
          const sapphPanel = {
            dungeon: 'Naxxramas',
            wing: 'Frostwyrm_Lair',
            boss: 'Sapphiron',
            strategy_text: 'Positions & Pre-pop\nOdd groups left. Even groups right. Everyone pre-pop GFPP and GSPP when we unboon.\n\nLand phase\nMellee stand on max range. Avoid Blizzard and don\'t parry-haste the boss.\nCasters stack loosely for aoe healing and avoid Blizzard.\nShaman melee healers stand with your group so you can chain-heal yourself.\n\nAir phase\nSpread out in the half of the room towards the entrace of the room. When you get targeted for ice-block, pop a Greater Frost Protection Potion to stay alive.',
            image_url: 'https://placehold.co/1200x675?text=Sapphiron',
            video_url: 'https://www.youtube.com/embed/NwDFC6kFi7c',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755093137/oUwfSmi_mp74xg.gif',
            entries: []
          };
          const kelPanel = {
            dungeon: 'Naxxramas',
            wing: 'Frostwyrm_Lair',
            boss: "Kel'Thuzad",
            strategy_text: "Phase 1\nDont't die. Don't multi shot. Stay in the circle. Kill adds fast. Prioritze shooting skellingtons over killing abos.\n\nPhase 2\nMelee stack perfectly on your marks and backpeddle out when ground gets black. Casters and healers spread out in the room.\n\nHealers, heal Frost Blast targets fast.\n\nPhase 3\nPriests, shackle adds BEFORE they get to the middle. Keep them shackled.",
            image_url: 'https://placehold.co/1200x675?text=Kel%5C%27Thuzad',
            video_url: 'https://www.youtube.com/embed/GUIftNHHKNs',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755109693/imgbin-heroes-of-the-storm-kel-thuzad-arthas-menethil-storm-za4EdhZSa9A2GBvAUf1Gi8t4q_qxel5s.jpg',
            entries: []
          };
          container.innerHTML = '';
          container.appendChild(buildPanel(sapphPanel, user, roster));
          container.appendChild(buildPanel(kelPanel, user, roster));
          return;
        }
        container.innerHTML = '<div class="no-data-message"><div class="no-data-content"><i class="fas fa-info-circle"></i><h3>No Assignments</h3><p>No assignments found for this wing.</p></div></div>';
        return;
      }
      // Ordering for Spider Wing: Anub'Rekhan, Grand Widow Faerlina, Maexxna
      if (wing === 'spider') {
        const order = ['anub', 'faerlina', 'maex'];
        toRender = toRender.slice().sort((a, b) => {
          const ak = String(a.boss || '').toLowerCase();
          const bk = String(b.boss || '').toLowerCase();
          const ai = order.findIndex(k => ak.includes(k));
          const bi = order.findIndex(k => bk.includes(k));
          const av = ai === -1 ? 999 : ai;
          const bv = bi === -1 ? 999 : bi;
          return av - bv;
        });
      } else if (wing === 'military') {
        // Ensure Military Wing shows panels in order: Razuvious, Gothik, The Four Horsemen
        const hasRaz = toRender.some(p => String(p.boss || '').toLowerCase().includes('razu'));
        const hasGoth = toRender.some(p => String(p.boss || '').toLowerCase().includes('goth'));
        const hasHorse = toRender.some(p => String(p.boss || '').toLowerCase().includes('four') || String(p.boss || '').toLowerCase().includes('horse'));
        if (!hasRaz) {
          toRender.push({
            dungeon: 'Naxxramas',
            wing: 'Military',
            boss: 'Razuvious',
            strategy_text: 'Priests pull with mind control. Off-tanks tank adds. Mana users run out before Disruption Shout. Melee throw target dummies when needed.',
            image_url: 'https://placehold.co/1200x675?text=Razuvious',
            video_url: 'https://www.youtube.com/embed/XdWewsnOrhU',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754989023/182497_v3yeko.webp',
            entries: []
          });
        }
        if (!hasGoth) {
          toRender.push({
            dungeon: 'Naxxramas',
            wing: 'Military',
            boss: 'Gothik',
            strategy_text: 'Warriors on Undead side. Ranged and Rogues on Human side. Pop Greater Stoneshield on wave 9. We don\'t shackle. Healers',
            image_url: 'https://placehold.co/1200x675?text=Gothik',
            video_url: 'https://www.youtube.com/embed/MrBGF1P3eMM',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754993060/336px-Gothik_the_Harvester_full_gzj2ho.jpg',
            entries: []
          });
        }
        if (!hasHorse) {
          toRender.push({
            dungeon: 'Naxxramas',
            wing: 'Military',
            boss: 'The Four Horsemen',
            strategy_text: 'We nuke down and commit on Thane.\n\nHealer rotation starts on first mark and then healers all roather on every 3rd mark.',
            image_url: 'https://placehold.co/1200x675?text=The+Four+Horsemen',
            video_url: 'https://www.youtube.com/embed/nlKO8p3SMVw?controls=0&modestbranding=1&rel=0&iv_load_policy=3',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754993478/-16062_absih8.png',
            entries: []
          });
        }
        const order = ['razu', 'goth', 'four', 'horse'];
        toRender = toRender.slice().sort((a, b) => {
          const ak = String(a.boss || '').toLowerCase();
          const bk = String(b.boss || '').toLowerCase();
          const ai = order.findIndex(k => ak.includes(k));
          const bi = order.findIndex(k => bk.includes(k));
          const av = ai === -1 ? 999 : ai;
          const bv = bi === -1 ? 999 : bi;
          return av - bv;
        });
      } else if (wing === 'plague') {
        // Ensure Plague Wing shows panels in order: Noth, Heigan, Loatheb
        const order = ['noth', 'heig', 'loatheb'];
        toRender = toRender.slice().sort((a, b) => {
          const ak = String(a.boss || '').toLowerCase();
          const bk = String(b.boss || '').toLowerCase();
          const ai = order.findIndex(k => ak.includes(k));
          const bi = order.findIndex(k => bk.includes(k));
          const av = ai === -1 ? 999 : ai;
          const bv = bi === -1 ? 999 : bi;
          return av - bv;
        });
      } else if (wing === 'abomination') {
        // Ensure Abomination Wing ordering with Patchwerk, Grobbulus, Gluth, Thaddius
        const order = ['patch', 'grobb', 'gluth', 'thadd'];
        toRender = toRender.slice().sort((a, b) => {
          const ak = String(a.boss || '').toLowerCase();
          const bk = String(b.boss || '').toLowerCase();
          const ai = order.findIndex(k => ak.includes(k));
          const bi = order.findIndex(k => bk.includes(k));
          const av = ai === -1 ? 999 : ai;
          const bv = bi === -1 ? 999 : bi;
          return av - bv;
        });
      } else if (wing === 'frostwyrm_lair') {
        // Ensure Frostwyrm Lair ordering: Sapphiron, then Kel'Thuzad
        const order = ['sapph', 'kel'];
        toRender = toRender.slice().sort((a, b) => {
          const ak = String(a.boss || '').toLowerCase();
          const bk = String(b.boss || '').toLowerCase();
          const ai = order.findIndex(k => ak.includes(k));
          const bi = order.findIndex(k => bk.includes(k));
          const av = ai === -1 ? 999 : ai;
          const bv = bi === -1 ? 999 : bi;
          return av - bv;
        });
      }
      toRender.forEach(p => container.appendChild(buildPanel(p, user, roster)));

      // Spider Wing: ensure Maexxna panel is present even if not saved yet
      if (wing === 'spider') {
        const hasMaex = toRender.some(p => String(p.boss || '').toLowerCase().includes('maex'));
        if (!hasMaex) {
          const maexPanel = {
            dungeon: 'Naxxramas',
            wing: 'Spider',
            boss: 'Maexxna',
            strategy_text: '',
            image_url: 'https://placehold.co/1200x675?text=Maexxna',
            video_url: 'https://www.youtube.com/embed/m5j7EHv7Dfw',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754984024/Maexx15928_o8jkro.png',
            entries: []
          };
          // append after existing spider panels to ensure it's last
          container.appendChild(buildPanel(maexPanel, user, roster));
        }
      } else if (wing === 'military') {
        // Military Wing: ensure Razuvious and Gothik panels are present even if not saved yet
        const hasRaz = toRender.some(p => String(p.boss || '').toLowerCase().includes('razu'));
        const hasGoth = toRender.some(p => String(p.boss || '').toLowerCase().includes('goth'));
        if (!hasRaz) {
          const razPanel = {
            dungeon: 'Naxxramas',
            wing: 'Military',
            boss: 'Razuvious',
            strategy_text: 'Priests pull with mind control. Off-tanks tank adds. Mana users run out before Disruption Shout. Melee throw target dummies when needed.',
            image_url: 'https://placehold.co/1200x675?text=Razuvious',
            video_url: 'https://www.youtube.com/embed/XdWewsnOrhU',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754989023/182497_v3yeko.webp',
            entries: []
          };
          container.appendChild(buildPanel(razPanel, user, roster));
        }
        if (!hasGoth) {
          const gothikPanel = {
            dungeon: 'Naxxramas',
            wing: 'Military',
            boss: 'Gothik',
            strategy_text: 'Warriors on Undead side. Ranged and Rogues on Human side. Pop Greater Stoneshield on wave 9. We don\'t shackle. Healers',
            image_url: 'https://placehold.co/1200x675?text=Gothik',
            video_url: 'https://www.youtube.com/embed/MrBGF1P3eMM',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754991352/336px-Gothik_the_Harvester_full_pxt0rf.jpg',
            entries: []
          };
          container.appendChild(buildPanel(gothikPanel, user, roster));
        }
      } else if (wing === 'plague') {
        // Ensure Noth, Heigan and Loatheb are present by default
        const hasNoth = toRender.some(p => String(p.boss || '').toLowerCase().includes('noth'));
        const hasHeigan = toRender.some(p => String(p.boss || '').toLowerCase().includes('heig'));
        const hasLoatheb = toRender.some(p => String(p.boss || '').toLowerCase().includes('loatheb'));
        if (!hasNoth) {
          const nothPanel = {
            dungeon: 'Naxxramas',
            wing: 'Plague',
            boss: 'Noth The Plaguebringer',
            strategy_text: 'Mages and Druids MUST decurse instantly and exclusively when boss casts curse.\n\nOff-tanks pick up adds and stack them on boss.\n\nWhen boss teleports, let tank pick it up and then kill it.',
            image_url: 'https://placehold.co/1200x675?text=Noth+The+Plaguebringer',
            video_url: '',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755074097/16590_ezmekl.png',
            entries: []
          };
          container.appendChild(buildPanel(nothPanel, user, roster));
        }
        if (!hasHeigan) {
          const heiganPanel = {
            dungeon: 'Naxxramas',
            wing: 'Plague',
            boss: 'Heigan The Unclean',
            strategy_text: 'We can dance if we want to, we can leave your friends behind, cause your friends don\'t dance, and if they don\'t dance, well, they\'re no friends of mine.\n\nMelle stack behind tank and move perfectly. In dance phase, casters dance with melee.',
            image_url: 'https://placehold.co/1200x675?text=Heigan+The+Unclean',
            video_url: 'https://www.youtube.com/embed/dfSBp3Efjbk?controls=0&modestbranding=1&rel=0&iv_load_policy=3',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755075234/16309_kpg0jp.png',
            entries: []
          };
          container.appendChild(buildPanel(heiganPanel, user, roster));
        }
        if (!hasLoatheb) {
          const loathebPanel = {
            dungeon: 'Naxxramas',
            wing: 'Plague',
            boss: 'Loatheb',
            strategy_text: 'Pre-pop and use GSPP. Get a health stone. Use bandage if needed.\n\nHealers follow healing rotation and only heal main-tank. Stand in front of the boss and behind the tank. Don\'t use any holy spells (it will put your heal on cooldown)',
            image_url: 'https://placehold.co/1200x675?text=Loatheb',
            video_url: 'https://www.youtube.com/embed/_zwIx3uzoFI?controls=0&modestbranding=1&rel=0&iv_load_policy=3',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755080534/Fungal_monster_s0zutr.webp',
            entries: []
          };
          container.appendChild(buildPanel(loathebPanel, user, roster));
        }
      } else if (wing === 'abomination') {
        // Ensure Patchwerk, Grobbulus, Gluth and Thaddius panels are present even if not saved yet
        const hasPatch = toRender.some(p => String(p.boss || '').toLowerCase().includes('patch'));
        const hasGrobb = toRender.some(p => String(p.boss || '').toLowerCase().includes('grobb'));
        const hasGluth = toRender.some(p => String(p.boss || '').toLowerCase().includes('gluth'));
        const hasThadd = toRender.some(p => String(p.boss || '').toLowerCase().includes('thadd'));
        if (!hasPatch) {
          const patchPanel = {
            dungeon: 'Naxxramas',
            wing: 'Abomination',
            boss: 'Patchwerk',
            strategy_text: 'Tanks MUST stack perfectly. Top 3 on threat must be tanks. Melee DPS dip in slime to juke hateful strike. Healers spam consumes and keep tanks up. Heal only tanks.',
            image_url: 'https://placehold.co/1200x675?text=Patchwerk',
            video_url: 'https://www.youtube.com/embed/bmpVXEQYIcg',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755085582/patchwerk_wfd5z4.gif',
            entries: []
          };
          container.appendChild(buildPanel(patchPanel, user, roster));
        }
        if (!hasGrobb) {
          const grobbPanel = {
            dungeon: 'Naxxramas',
            wing: 'Abomination',
            boss: 'Grobbulus',
            strategy_text: "Boss must face away from raid. Don't dispel unless assigned. Melee stay at max range and cleve when slime is up. Drop slime pools at the edge of the room.",
            image_url: 'https://placehold.co/1200x675?text=Grobbulus',
            video_url: 'https://www.youtube.com/embed/WhqA3O6HIJk',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755086620/24792_gahise.png',
            entries: []
          };
          container.appendChild(buildPanel(grobbPanel, user, roster));
        }
        if (!hasGluth) {
          const gluthPanel = {
            dungeon: 'Naxxramas',
            wing: 'Abomination',
            boss: 'Gluth',
            strategy_text: 'Rotate tanks on healing debuff if needed. Kite adds far from Boss. No one raid heal. Only heal tanks. Mages help on adds with frost nova. Casters stay on max range to dodge fear. Hunters place slow trap for kiting. Shamans use Tremor if in melee and earth binding if in ranged group.',
            image_url: 'https://placehold.co/1200x675?text=Gluth',
            video_url: 'https://www.youtube.com/embed/JWf9-N609PA',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755087393/27103_rdbmzc.png',
            entries: []
          };
          container.appendChild(buildPanel(gluthPanel, user, roster));
        }
        if (!hasThadd) {
          const thaddPanel = {
            dungeon: 'Naxxramas',
            wing: 'Abomination',
            boss: 'Thaddius',
            strategy_text: 'Phase 1:\nOdd groups left - Even groups right. Kill adds at the same time. Casters max range. Off-tank taunt on tank swap.\n\nPhase 2:\nStack in front of boss. On Polarity Shift, Minus go left. Plus go right. Run trough the boss.\n\nNotes:\nPlus goes right\nMinus goes left\nMages, watch the ignite.',
            image_url: 'https://placehold.co/1200x675?text=Thaddius',
            video_url: 'https://www.youtube.com/embed/lgDJq4-i4kk',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755087787/dfka9xt-cbdf45c1-45b9-460b-a997-5a46c4de0a65_txsidf.png',
            entries: []
          };
          container.appendChild(buildPanel(thaddPanel, user, roster));
        }
      } else if (wing === 'frostwyrm_lair') {
        // Ensure Sapphiron and Kel'Thuzad panels are present even if not saved yet
        const hasSapph = toRender.some(p => String(p.boss || '').toLowerCase().includes('sapph'));
        const hasKel = toRender.some(p => String(p.boss || '').toLowerCase().includes('kel'));
        if (!hasSapph) {
          const sapphPanel = {
            dungeon: 'Naxxramas',
            wing: 'Frostwyrm_Lair',
            boss: 'Sapphiron',
            strategy_text: 'Positions & Pre-pop\nOdd groups left. Even groups right. Everyone pre-pop GFPP and GSPP when we unboon.\n\nLand phase\nMellee stand on max range. Avoid Blizzard and don\'t parry-haste the boss.\nCasters stack loosely for aoe healing and avoid Blizzard.\nShaman melee healers stand with your group so you can chain-heal yourself.\n\nAir phase\nSpread out in the half of the room towards the entrace of the room. When you get targeted for ice-block, pop a Greater Frost Protection Potion to stay alive.',
            image_url: 'https://placehold.co/1200x675?text=Sapphiron',
            video_url: 'https://www.youtube.com/embed/NwDFC6kFi7c',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755093137/oUwfSmi_mp74xg.gif',
            entries: []
          };
          container.appendChild(buildPanel(sapphPanel, user, roster));
        }
        if (!hasKel) {
          const kelPanel = {
            dungeon: 'Naxxramas',
            wing: 'Frostwyrm_Lair',
            boss: "Kel'Thuzad",
            strategy_text: "Phase 1\nDont't die. Don't multi shot. Stay in the circle. Kill adds fast. Prioritze shooting skellingtons over killing abos.\n\nPhase 2\nMelee stack perfectly on your marks and backpeddle out when ground gets black. Casters and healers spread out in the room.\n\nHealers, heal Frost Blast targets fast.\n\nPhase 3\nPriests, shackle adds BEFORE they get to the middle. Keep them shackled.",
            image_url: 'https://placehold.co/1200x675?text=Kel%5C%27Thuzad',
            video_url: 'https://www.youtube.com/embed/GUIftNHHKNs',
            boss_icon_url: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1755109693/imgbin-heroes-of-the-storm-kel-thuzad-arthas-menethil-storm-za4EdhZSa9A2GBvAUf1Gi8t4q_qxel5s.jpg',
            entries: []
          };
          container.appendChild(buildPanel(kelPanel, user, roster));
        }
      }

    } catch (e) {
      container.innerHTML = '<div class="error-display"><div class="error-content"><h3>Error</h3><p>Failed to load assignments.</p></div></div>';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Ensure raid bar/nav wired
    if (typeof updateRaidBar === 'function') updateRaidBar();
    // Normalize URL: if we have an active event but current URL is not event-scoped, redirect
    try {
      const parts = window.location.pathname.split('/').filter(Boolean);
      const isEventScoped = parts.includes('event') && parts[parts.indexOf('event') + 1];
      const isAssignmentsPage = parts.includes('assignments');
      const activeId = getActiveEventId();
      if (!isEventScoped && isAssignmentsPage && activeId) {
        const wing = getCurrentWing();
        const wingPath = wing && wing !== 'main' ? `/${wing}` : '';
        window.location.replace(`/event/${activeId}/assignments${wingPath}`);
        return;
      }
    } catch {}
    initializeFloatingNavigation();
    // Tag body for main page only
    try { if (getCurrentWing() === 'main') document.body.classList.add('assignments-main'); } catch {}
    loadAssignments();
  });
})();


