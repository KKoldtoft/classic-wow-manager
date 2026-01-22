/**
 * Four Horsemen Rotation Assistant
 * Real-time encounter assistant with timeline player and TTS callouts
 */
(() => {
  // ============================================
  // CONFIGURATION
  // ============================================
  const CONFIG = {
    FIRST_MARK_TIME: 20000,    // 20 seconds for first mark
    MARK_INTERVAL: 15000,      // 15 seconds between subsequent marks
    TOTAL_MARKS: 12,
    UPDATE_INTERVAL: 100,      // Progress bar update frequency (ms)
    SPEECH_RATE: 1.0,          // TTS speech rate (0.5 - 2.0)
    CHARS_PER_SECOND: 10,      // Conservative estimate - slower = more buffer time
  };

  // Boss marker icon URLs
  const BOSS_ICONS = {
    skull: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/1_skull_faqei8.png',
    cross: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/2_cross_kj9wuf.png',
    square: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/3_square_yqucv9.png',
    moon: 'https://res.cloudinary.com/duthjs0c3/image/upload/v1754765896/4_moon_vwhoen.png',
  };

  // Boss names mapped to markers
  const BOSS_NAMES = {
    skull: 'Thane',
    cross: 'Mograine',
    square: 'Zeliek',
    moon: 'Blaumeux',
  };

  // Clockwise rotation order (for healer rotation description)
  const CLOCKWISE_ORDER = ['skull', 'cross', 'square', 'moon'];

  // Tank grid assignments per phase (Classic tactics - 8 tanks)
  const TANK_GRID = {
    1: ['cross', null, null, null],
    2: [null, 'cross', null, null],
    3: ['skull', 'skull', 'cross', null],
    4: [null, null, null, 'cross'],
    5: ['moon', 'safe', 'square', 'safe'],
    6: [null, 'moon', 'safe', 'square'],
    7: ['square', 'safe', 'moon', 'safe'],
    8: [null, 'square', 'safe', 'moon'],
  };

  // ============================================
  // STATE
  // ============================================
  let eventId = null;
  let healers = [];
  let tanks = [];
  let timelineEvents = [];
  let isPlaying = false;
  let startTime = null;
  let pausedAt = null;
  let animationFrame = null;
  let firedEvents = new Set();
  let firedSpeech = new Set();
  let voiceEnabled = true;
  let selectedVoice = null;
  let measuredDurations = {};  // Cache measured speech durations

  // ============================================
  // DOM ELEMENTS
  // ============================================
  const playBtn = document.getElementById('play-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const resetBtn = document.getElementById('reset-btn');
  const currentTimeEl = document.getElementById('current-time');
  const totalTimeEl = document.getElementById('total-time');
  const playerStatus = document.getElementById('player-status');
  const progressBar = document.getElementById('progress-bar');
  const progressHead = document.getElementById('progress-head');
  const consoleOutput = document.getElementById('console-output');
  const clearConsoleBtn = document.getElementById('clear-console');
  const backLink = document.getElementById('back-to-assignments');
  const voiceToggle = document.getElementById('voice-toggle');
  const voiceSelect = document.getElementById('voice-select');
  const testVoiceBtn = document.getElementById('test-voice-btn');

  // ============================================
  // INITIALIZATION
  // ============================================
  async function init() {
    // Extract event ID from URL
    const pathMatch = window.location.pathname.match(/\/event\/(\d+)/);
    if (pathMatch) {
      eventId = pathMatch[1];
    }

    // Set up back link
    if (backLink && eventId) {
      backLink.href = `/event/${eventId}/assignments/military`;
    }

    // Set up raid bar links
    setupRaidBarLinks();

    // Calculate and display total time
    const totalTime = CONFIG.FIRST_MARK_TIME + (CONFIG.TOTAL_MARKS - 1) * CONFIG.MARK_INTERVAL;
    totalTimeEl.textContent = formatTime(totalTime);

    // Initialize TTS
    initTTS();

    // Load assignments
    await loadAssignments();

    // Generate timeline events
    generateTimelineEvents();

    // Populate the grid UI
    populateTimelineGrid();

    // Set up event listeners
    setupEventListeners();
  }

  function setupRaidBarLinks() {
    const raidBar = document.getElementById('raid-bar');
    const raidTitle = document.getElementById('raid-title');
    const rosterLink = document.getElementById('raid-roster-link');
    const assignmentsLink = document.getElementById('raid-assignments-link');

    if (eventId) {
      raidBar.style.display = 'flex';
      if (rosterLink) rosterLink.href = `/roster?eventId=${eventId}`;
      if (assignmentsLink) assignmentsLink.href = `/event/${eventId}/assignments/military`;

      fetch(`/api/events/${eventId}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.event && data.event.event_title) {
            raidTitle.textContent = data.event.event_title;
          }
        })
        .catch(() => {});
    }
  }

  // ============================================
  // TEXT-TO-SPEECH
  // ============================================
  let availableVoices = [];
  let currentUtterance = null;
  let isSpeaking = false;
  let hasWarmedUp = false;
  
  function initTTS() {
    if (!('speechSynthesis' in window)) {
      logToConsole('system', 'Warning: Text-to-Speech not supported in this browser');
      if (voiceSelect) voiceSelect.innerHTML = '<option>Not supported</option>';
      return;
    }

    logToConsole('system', 'Initializing Text-to-Speech...');

    // Populate voice selector when voices are loaded
    function loadVoices() {
      availableVoices = speechSynthesis.getVoices();
      console.log('[TTS] Voices loaded:', availableVoices.length);
      
      if (voiceSelect && availableVoices.length > 0) {
        voiceSelect.innerHTML = '';
        
        // Prefer English voices
        const englishVoices = availableVoices.filter(v => v.lang.startsWith('en'));
        const voicesToShow = englishVoices.length > 0 ? englishVoices : availableVoices;
        
        voicesToShow.forEach((voice, index) => {
          const option = document.createElement('option');
          option.value = index;
          option.textContent = `${voice.name} (${voice.lang})`;
          option.dataset.voiceName = voice.name;
          voiceSelect.appendChild(option);
        });
        
        // Select first English voice by default, prefer "Google" or "Microsoft" voices
        const preferredVoice = voicesToShow.find(v => 
          v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Daniel')
        ) || voicesToShow[0];
        selectedVoice = preferredVoice;
        
        const preferredIndex = voicesToShow.indexOf(preferredVoice);
        if (preferredIndex >= 0) voiceSelect.value = preferredIndex;
        
        logToConsole('system', `TTS ready. ${voicesToShow.length} voices available. Selected: ${selectedVoice?.name || 'default'}`);
      } else if (availableVoices.length === 0) {
        logToConsole('system', 'No TTS voices found yet, waiting...');
      }
    }

    // Chrome loads voices async - need to wait for them
    speechSynthesis.onvoiceschanged = loadVoices;
    
    // Also try loading immediately (Firefox loads sync)
    loadVoices();
    
    // Fallback: try again after a short delay
    setTimeout(loadVoices, 100);
    setTimeout(loadVoices, 500);

    // Voice select change handler
    if (voiceSelect) {
      voiceSelect.addEventListener('change', () => {
        const englishVoices = availableVoices.filter(v => v.lang.startsWith('en'));
        const voicesToUse = englishVoices.length > 0 ? englishVoices : availableVoices;
        const index = parseInt(voiceSelect.value, 10);
        selectedVoice = voicesToUse[index] || voicesToUse[0];
        console.log('[TTS] Voice changed to:', selectedVoice?.name);
        logToConsole('system', `Voice changed to: ${selectedVoice?.name || 'default'}`);
      });
    }

    // Voice toggle handler
    if (voiceToggle) {
      voiceToggle.addEventListener('change', () => {
        voiceEnabled = voiceToggle.checked;
        logToConsole('system', `Voice ${voiceEnabled ? 'enabled' : 'disabled'}`);
      });
    }

    // Test voice button
    if (testVoiceBtn) {
      testVoiceBtn.addEventListener('click', () => {
        console.log('[TTS] Test button clicked');
        
        // Ensure we have voices
        if (availableVoices.length === 0) {
          availableVoices = speechSynthesis.getVoices();
        }
        if (availableVoices.length > 0 && !selectedVoice) {
          const englishVoices = availableVoices.filter(v => v.lang.startsWith('en'));
          selectedVoice = (englishVoices.length > 0 ? englishVoices : availableVoices)[0];
        }
        
        // Warm up if not done yet
        if (!hasWarmedUp) {
          warmUpSpeech();
          hasWarmedUp = true;
        }
        
        logToConsole('system', `Testing voice: ${selectedVoice?.name || 'default'}`);
        
        // Give warmup a moment, then speak test message
        setTimeout(() => {
          speak('Testing voice. 3, 2, 1, rotate now.', () => {
            logToConsole('system', 'Test complete');
          });
        }, 200);
      });
    }
  }

  function speak(text, onEnd = null) {
    console.log('[TTS] speak() called');
    
    if (!voiceEnabled) {
      if (onEnd) onEnd();
      return;
    }
    
    if (!('speechSynthesis' in window)) {
      if (onEnd) onEnd();
      return;
    }

    // IMPORTANT: Cancel previous speech to prevent queue buildup
    // This is necessary because Chrome's speech queue can get backed up
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = CONFIG.SPEECH_RATE;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Get fresh voice reference if needed
    if (!selectedVoice && availableVoices.length > 0) {
      selectedVoice = availableVoices.find(v => v.lang.startsWith('en')) || availableVoices[0];
    }
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onstart = () => {
      console.log('[TTS] Speech started');
      isSpeaking = true;
    };
    
    utterance.onend = () => {
      console.log('[TTS] Speech ended');
      isSpeaking = false;
      if (onEnd) onEnd();
    };
    
    utterance.onerror = (e) => {
      // Only log non-interrupted errors
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.error('[TTS] Speech error:', e.error);
        logToConsole('system', `TTS Error: ${e.error}`);
      }
      isSpeaking = false;
      if (onEnd) onEnd();
    };

    // Use setTimeout to avoid Chrome's speech synthesis bugs
    setTimeout(() => {
      speechSynthesis.speak(utterance);
      
      // Chrome workaround: resume if paused
      if (speechSynthesis.paused) {
        speechSynthesis.resume();
      }
    }, 10);
  }
  
  // Warm up speechSynthesis on first user interaction (Chrome requirement)
  function warmUpSpeech() {
    if (!('speechSynthesis' in window)) return;
    
    console.log('[TTS] Warming up speech...');
    
    // Force voices to load
    speechSynthesis.getVoices();
    
    // Speak a short utterance to initialize the audio system
    const warmup = new SpeechSynthesisUtterance('.');
    warmup.volume = 0.01; // Very quiet but not silent
    warmup.rate = 2; // Fast
    speechSynthesis.speak(warmup);
  }

  function estimateSpeechDuration(text) {
    // Estimate based on character count and speech rate
    const chars = text.length;
    const baseSeconds = chars / CONFIG.CHARS_PER_SECOND;
    const adjustedSeconds = baseSeconds / CONFIG.SPEECH_RATE;
    // Add small buffer for pauses
    return (adjustedSeconds + 0.5) * 1000;
  }

  function measureSpeechDuration(text) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve(estimateSpeechDuration(text));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = CONFIG.SPEECH_RATE;
      utterance.volume = 0; // Silent measurement
      
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      const startMs = Date.now();
      utterance.onend = () => {
        const duration = Date.now() - startMs;
        resolve(duration);
      };
      utterance.onerror = () => {
        resolve(estimateSpeechDuration(text));
      };

      speechSynthesis.speak(utterance);
    });
  }

  // ============================================
  // DATA LOADING & PARSING
  // ============================================
  async function loadAssignments() {
    if (!eventId) {
      logToConsole('system', 'No event ID found in URL');
      return;
    }

    try {
      logToConsole('system', 'Loading Four Horsemen assignments...');
      
      const response = await fetch(`/api/assignments/${eventId}`);
      const data = await response.json();

      if (!data.success || !Array.isArray(data.panels)) {
        throw new Error('Failed to load assignments');
      }

      const horsePanel = data.panels.find(p => 
        String(p.wing || '').toLowerCase().includes('military') &&
        String(p.boss || '').toLowerCase().includes('four') &&
        !String(p.boss || '').toLowerCase().includes('cleave')
      );

      if (!horsePanel) {
        throw new Error('Four Horsemen panel not found. Make sure assignments are set up.');
      }

      parseHealers(horsePanel.entries || []);
      parseTanks(horsePanel);

      logToConsole('system', `Loaded ${healers.length} healers and ${tanks.length} tanks`);

    } catch (error) {
      logToConsole('system', `Error: ${error.message}`);
      console.error('Failed to load assignments:', error);
    }
  }

  function parseHealers(entries) {
    healers = [];
    
    for (const entry of entries) {
      const assignment = String(entry.assignment || '');
      const name = String(entry.character_name || '');
      
      const match = assignment.match(/start on (\w+) rotate on (\d+)/i);
      if (match && name) {
        const marker = match[1].toLowerCase();
        const rotation = parseInt(match[2], 10);
        
        if (BOSS_NAMES[marker] && rotation >= 1 && rotation <= 3) {
          healers.push({
            name,
            marker,
            rotation,
            markerUrl: entry.marker_icon_url || BOSS_ICONS[marker],
          });
        }
      }
    }

    healers.sort((a, b) => {
      if (a.rotation !== b.rotation) return a.rotation - b.rotation;
      return CLOCKWISE_ORDER.indexOf(a.marker) - CLOCKWISE_ORDER.indexOf(b.marker);
    });
  }

  function parseTanks(panel) {
    tanks = [];
    
    const tanksByRow = panel.horsemen_tanks || {};
    const entries = Array.isArray(panel.entries) ? panel.entries : [];
    
    for (let row = 1; row <= 8; row++) {
      let tankName = null;
      
      if (tanksByRow[row] && Array.isArray(tanksByRow[row]) && tanksByRow[row][0]) {
        tankName = tanksByRow[row][0];
      }
      
      if (!tankName) {
        const gridEntry = entries.find(e => {
          const a = String(e.assignment || '');
          return a === `__HGRID__:${row}:1`;
        });
        if (gridEntry && gridEntry.character_name) {
          tankName = gridEntry.character_name;
        }
      }
      
      if (tankName) {
        tanks.push({ name: tankName, row });
      }
    }
  }

  // ============================================
  // TIMELINE GENERATION
  // ============================================
  function generateTimelineEvents() {
    timelineEvents = [];

    for (let mark = 1; mark <= CONFIG.TOTAL_MARKS; mark++) {
      const time = mark === 1 
        ? CONFIG.FIRST_MARK_TIME 
        : CONFIG.FIRST_MARK_TIME + (mark - 1) * CONFIG.MARK_INTERVAL;

      const rotationNum = ((mark - 1) % 3) + 1;
      const rotatingHealers = healers.filter(h => h.rotation === rotationNum);

      const isTankRotation = [4, 7, 10].includes(mark);
      const phase = Math.ceil(mark / 3);
      
      let rotatingTanks = [];
      if (isTankRotation) {
        rotatingTanks = getTanksForPhaseTransition(phase);
      }

      const event = {
        mark,
        time,
        rotationNum,
        healers: rotatingHealers,
        tanks: rotatingTanks,
        isTankRotation,
        phase,
      };

      // First, generate message without the "X seconds" prefix to estimate duration
      const messageBody = generateTTSMessageBody(mark, rotatingHealers, rotatingTanks, isTankRotation);
      
      // Estimate how long this message will take to speak
      // Add ~2 seconds for the "X seconds to mark Y" prefix
      const bodyDuration = estimateSpeechDuration(messageBody);
      const prefixDuration = 2000; // ~2 seconds for "X seconds to mark Y, "
      event.estimatedDuration = bodyDuration + prefixDuration;
      
      // Calculate when to START speaking so message ends at the mark
      event.speechStartTime = Math.max(0, time - event.estimatedDuration);
      
      // Now calculate how many seconds until the mark (this is the speech duration in seconds)
      const secondsUntilMark = Math.round(event.estimatedDuration / 1000);
      
      // Generate the final message with the correct seconds
      event.ttsMessage = `${secondsUntilMark} seconds to mark ${mark}, ${messageBody}`;

      timelineEvents.push(event);
    }

    logToConsole('system', 'Timeline generated with speech timing');
  }

  function getTanksForPhaseTransition(newPhase) {
    const result = [];
    
    for (const tank of tanks) {
      const grid = TANK_GRID[tank.row];
      if (!grid) continue;
      
      const newAssignment = grid[newPhase - 1];
      
      if (newAssignment && newAssignment !== 'safe') {
        result.push({
          ...tank,
          to: newAssignment,
          toBoss: BOSS_NAMES[newAssignment],
        });
      }
    }
    
    return result;
  }

  // Generate just the body of the TTS message (without "X seconds to mark Y" prefix)
  function generateTTSMessageBody(mark, healerList, tankList, hasTanks) {
    const healerNames = healerList.map(h => h.name).join(', ');
    const tankNames = tankList.map(t => t.name).join(', ');
    
    if (hasTanks && tankNames) {
      return `${healerNames} rotate on mark ${mark} and ${tankNames} pick up your targets on mark ${mark}`;
    } else {
      return `${healerNames}, rotate on mark ${mark}`;
    }
  }

  // ============================================
  // UI POPULATION
  // ============================================
  function populateTimelineGrid() {
    for (let mark = 1; mark <= CONFIG.TOTAL_MARKS; mark++) {
      const event = timelineEvents.find(e => e.mark === mark);
      if (!event) continue;

      const healersCell = document.getElementById(`healers-mark-${mark}`);
      if (healersCell) {
        if (event.healers.length > 0) {
          healersCell.innerHTML = event.healers.map(h => 
            `<span class="player-name healer" title="${BOSS_NAMES[h.marker]}">${h.name}</span>`
          ).join('');
        } else {
          healersCell.innerHTML = '<span class="no-action">-</span>';
        }
      }

      const tanksCell = document.getElementById(`tanks-mark-${mark}`);
      if (tanksCell) {
        if (event.isTankRotation && event.tanks.length > 0) {
          tanksCell.innerHTML = event.tanks.map(t => 
            `<span class="player-name tank" title="Go to ${t.toBoss}">${t.name}</span>`
          ).join('');
        } else {
          tanksCell.innerHTML = '<span class="no-action">-</span>';
        }
      }
    }
  }

  // ============================================
  // PLAYER CONTROLS
  // ============================================
  function setupEventListeners() {
    playBtn.addEventListener('click', play);
    pauseBtn.addEventListener('click', pause);
    resetBtn.addEventListener('click', reset);
    clearConsoleBtn.addEventListener('click', clearConsole);
  }

  function play() {
    if (isPlaying) return;

    // Warm up speech synthesis on first play
    if (!hasWarmedUp && 'speechSynthesis' in window) {
      warmUpSpeech();
      hasWarmedUp = true;
    }

    isPlaying = true;
    playBtn.style.display = 'none';
    pauseBtn.style.display = 'flex';
    playerStatus.textContent = 'Playing';
    playerStatus.className = 'player-status playing';

    if (pausedAt !== null) {
      startTime = Date.now() - pausedAt;
      pausedAt = null;
      logToConsole('system', 'Resumed');
    } else {
      // Fresh start - cancel any pending speech
      if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        isSpeaking = false;
      }
      startTime = Date.now();
      firedEvents.clear();
      firedSpeech.clear();
      logToConsole('mark', '--- Combat Started ---');
    }

    tick();
  }

  function pause() {
    if (!isPlaying) return;

    isPlaying = false;
    pausedAt = Date.now() - startTime;
    playBtn.style.display = 'flex';
    pauseBtn.style.display = 'none';
    playerStatus.textContent = 'Paused';
    playerStatus.className = 'player-status';

    // Stop any ongoing speech
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      isSpeaking = false;
    }

    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    logToConsole('system', 'Paused');
  }

  function reset() {
    isPlaying = false;
    startTime = null;
    pausedAt = null;
    firedEvents.clear();
    firedSpeech.clear();

    // Stop any ongoing speech
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      isSpeaking = false;
    }

    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    playBtn.style.display = 'flex';
    pauseBtn.style.display = 'none';
    playerStatus.textContent = 'Ready';
    playerStatus.className = 'player-status';

    progressBar.style.width = '0%';
    progressHead.style.left = '0%';
    currentTimeEl.textContent = '0:00';

    document.querySelectorAll('.timeline-cell.current-mark').forEach(el => {
      el.classList.remove('current-mark');
    });
    document.querySelectorAll('.timeline-cell.past').forEach(el => {
      el.classList.remove('past');
    });
    document.querySelectorAll('.timeline-cell.active').forEach(el => {
      el.classList.remove('active');
    });

    logToConsole('system', 'Reset. Ready to start.');
  }

  function tick() {
    if (!isPlaying) return;

    const elapsed = Date.now() - startTime;
    const totalTime = CONFIG.FIRST_MARK_TIME + (CONFIG.TOTAL_MARKS - 1) * CONFIG.MARK_INTERVAL;
    const progress = Math.min(elapsed / totalTime, 1);

    progressBar.style.width = `${progress * 100}%`;
    progressHead.style.left = `${progress * 100}%`;
    currentTimeEl.textContent = formatTime(elapsed);

    // Check for speech to fire (fires BEFORE the mark)
    for (const event of timelineEvents) {
      if (!firedSpeech.has(event.mark) && elapsed >= event.speechStartTime) {
        fireSpeech(event);
        firedSpeech.add(event.mark);
      }
    }

    // Check for mark events to fire (fires AT the mark)
    for (const event of timelineEvents) {
      if (!firedEvents.has(event.mark) && elapsed >= event.time) {
        fireMarkEvent(event);
        firedEvents.add(event.mark);
      }
    }

    updateCellHighlights(elapsed);

    if (elapsed >= totalTime) {
      finish();
      return;
    }

    animationFrame = requestAnimationFrame(tick);
  }

  function fireSpeech(event) {
    // Log the TTS message to console
    logToConsole('speech', event.ttsMessage);
    
    // Speak the message
    speak(event.ttsMessage);
  }

  function fireMarkEvent(event) {
    // Log the mark (this fires when the mark actually ticks)
    logToConsole('mark', `=== Mark ${event.mark} ===`);
  }

  function updateCellHighlights(elapsed) {
    let currentMark = 0;
    for (const event of timelineEvents) {
      if (elapsed >= event.time) {
        currentMark = event.mark;
      }
    }

    for (let mark = 1; mark <= CONFIG.TOTAL_MARKS; mark++) {
      const headerCell = document.querySelector(`.header-cell[data-mark="${mark}"]`);
      const healersCell = document.getElementById(`healers-mark-${mark}`);
      const tanksCell = document.getElementById(`tanks-mark-${mark}`);

      const cells = [headerCell, healersCell, tanksCell].filter(Boolean);

      cells.forEach(cell => {
        cell.classList.remove('current-mark', 'past', 'active');
        
        if (mark === currentMark) {
          cell.classList.add('current-mark', 'active');
        } else if (mark < currentMark) {
          cell.classList.add('past');
        }
      });
    }
  }

  function finish() {
    isPlaying = false;
    playBtn.style.display = 'flex';
    pauseBtn.style.display = 'none';
    playerStatus.textContent = 'Finished';
    playerStatus.className = 'player-status finished';

    logToConsole('mark', '=== Encounter Complete ===');
  }

  // ============================================
  // CONSOLE OUTPUT
  // ============================================
  function logToConsole(type, message) {
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    
    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    timestamp.textContent = `[${formatTime(startTime ? Date.now() - startTime : 0)}]`;
    
    line.appendChild(timestamp);
    line.appendChild(document.createTextNode(message));
    
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

  function clearConsole() {
    consoleOutput.innerHTML = '<div class="console-line system">[System] Console cleared.</div>';
  }

  // ============================================
  // UTILITIES
  // ============================================
  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  // ============================================
  // START
  // ============================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
