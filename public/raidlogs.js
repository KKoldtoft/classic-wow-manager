// Raid Logs JavaScript

class RaidLogsManager {
    constructor() {
        this.activeEventId = null;
        this.logData = null;
        this.abilitiesData = [];
        this.abilitiesSettings = { calculation_divisor: 10, max_points: 20 };
        this.manaPotionsData = [];
        this.manaPotionsSettings = { threshold: 10, points_per_potion: 3, max_points: 10 };
        this.runesData = [];
        this.runesSettings = { usage_divisor: 2, points_per_division: 1 };
        this.interruptsData = [];
        this.interruptsSettings = { points_per_interrupt: 1, interrupts_needed: 1, max_points: 5 };
        this.disarmsData = [];
        this.disarmsSettings = { points_per_disarm: 1, disarms_needed: 1, max_points: 5 };
        this.sunderData = [];
        this.sunderSettings = { point_ranges: [] };
        this.curseData = [];
        this.curseSettings = { uptime_threshold: 85, points: 10 };
        this.curseShadowData = [];
        this.curseShadowSettings = { uptime_threshold: 85, points: 10 };
        this.curseElementsData = [];
        this.curseElementsSettings = { uptime_threshold: 85, points: 10 };
        this.faerieFireData = [];
        this.faerieFireSettings = { uptime_threshold: 85, points: 10 };
        this.scorchData = [];
        this.scorchSettings = { tier1_max: 99, tier1_points: 0, tier2_max: 199, tier2_points: 5, tier3_points: 10 };
        this.demoShoutData = [];
        this.demoShoutSettings = { tier1_max: 99, tier1_points: 0, tier2_max: 199, tier2_points: 5, tier3_points: 10 };
        this.polymorphData = [];
        this.polymorphSettings = { points_per_division: 1, polymorphs_needed: 2, max_points: 5 };
        this.powerInfusionData = [];
        this.powerInfusionSettings = { points_per_division: 1, infusions_needed: 2, max_points: 10 };
        this.decursesData = [];
        this.decursesSettings = { points_per_division: 1, decurses_needed: 3, max_points: 10, min_points: -10, average_decurses: 0 };
        this.voidDamageData = [];
        this.voidDamageSettings = { void_blast_penalty: -10, void_zone_penalty: -5 };
        this.playerStreaksData = [];
        this.guildMembersData = [];
        this.rewardSettings = {};
        this.worldBuffsData = [];
        this.worldBuffsRequiredBuffs = 6;
        this.worldBuffsChannelId = null;
        this.frostResistanceData = [];
        this.maxFrostResistance = 0;
        this.worldBuffsArchiveUrl = null;
        this.frostResistanceArchiveUrl = null;
        this.specData = {};
        this.floatingNav = null;
        this.sectionObserver = null;
        this.navOriginalTop = 0;
        this.isScrolling = false;
        this.scrollTimeout = null;
        this.manualRewardsData = [];
        this.playersData = [];
        this.currentUser = null;
        this.isEditingEntry = false;
        this.editingEntryId = null;
        this.primaryRoles = null;
        // Discord class icon emote IDs (fallback when spec icon is missing)
        this.classIconEmotes = {
            'warrior': '579532030153588739',
            'paladin': '579532029906124840',
            'hunter': '579532029880827924',
            'rogue': '579532030086217748',
            'priest': '637564323442720768',
            'shaman': '579532030056857600',
            'mage': '579532030161977355',
            'warlock': '579532029851336716',
            'druid': '579532029675438081'
        };
        this.initializeEventListeners();
        this.loadSpecData();
        this.loadRaidLogsData();
    }

    initializeEventListeners() {
        // Listen for storage changes to reload data when event changes
        window.addEventListener('storage', (e) => {
            if (e.key === 'activeEventSession') {
                this.loadRaidLogsData();
            }
        });

        // Add click handlers for page navigation buttons
        this.setupPageNavigationButtons();
        
        // Set up stats panel toggle buttons
        this.setupStatsPanelToggle();
        
        // Initialize floating navigation
        this.initializeFloatingNavigation();
        
        // Initialize manual rewards functionality
        this.initializeManualRewards();
    }

    setupPageNavigationButtons() {
        // Guild Members page button
        const guildMembersButton = document.getElementById('guild-members-page-button');
        if (guildMembersButton) {
            guildMembersButton.onclick = () => {
                window.location.href = '/guild-members';
            };
            guildMembersButton.title = 'View full Guild Members page';
        }

        // Regular Attendance page button
        const attendanceButton = document.getElementById('attendance-page-button');
        if (attendanceButton) {
            attendanceButton.onclick = () => {
                window.location.href = '/attendance';
            };
            attendanceButton.title = 'View full Regular Attendance page';
        }
    }

    setupStatsPanelToggle() {
        // Set up toggle functionality for stats panel
        const toggleButtons = document.querySelectorAll('.stats-toggle-btn');
        const dashboardPanel = document.getElementById('dashboard-panel');
        const shamePanel = document.getElementById('shame-panel');

        toggleButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetPanel = button.getAttribute('data-panel');
                
                // Remove active class from all buttons
                toggleButtons.forEach(btn => btn.classList.remove('active'));
                // Add active class to clicked button
                button.classList.add('active');
                
                // Hide all panels
                dashboardPanel.style.display = 'none';
                shamePanel.style.display = 'none';
                
                // Show the selected panel
                if (targetPanel === 'dashboard') {
                    dashboardPanel.style.display = 'grid';
                } else if (targetPanel === 'shame') {
                    shamePanel.style.display = 'grid';
                }
            });
        });
    }

    initializeFloatingNavigation() {
        this.floatingNav = document.getElementById('floating-nav');
        if (!this.floatingNav) return;

        // Setup navigation button click handlers
        const navButtons = this.floatingNav.querySelectorAll('.nav-btn');
        navButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = button.getAttribute('data-target');
                this.scrollToSection(targetId);
            });
        });

        // Setup scroll listener for active highlighting only
        this.setupScrollListener();
        
        // Setup intersection observer for section highlighting
        this.setupSectionObserver();
        
        // Initialize highlight position
        this.initializeHighlight();
        
        // Store the original position
        this.storeOriginalPosition();
    }

    setupScrollListener() {
        let lastScrollTime = 0;
        
        // Handle manual scroll interruption during programmatic scrolling
        const handleManualScroll = () => {
            const now = Date.now();
            
            // Only set isScrolling flag if we're actually in a programmatic scroll
            if (this.isScrolling && (now - lastScrollTime) > 50) {
                // Manual scroll detected during programmatic scroll
                this.isScrolling = false;
                if (this.scrollTimeout) {
                    clearTimeout(this.scrollTimeout);
                    this.scrollTimeout = null;
                }
            }
            lastScrollTime = now;
        };

        // Listen for scroll events (for manual scroll detection)
        window.addEventListener('scroll', handleManualScroll, { passive: true });
    }

    setupSectionObserver() {
        // Clean up existing observer
        if (this.sectionObserver) {
            this.sectionObserver.disconnect();
        }

        const options = {
            root: null,
            rootMargin: '-20% 0px -60% 0px',
            threshold: 0.1
        };

        this.sectionObserver = new IntersectionObserver((entries) => {
            // Don't update during programmatic scrolling
            if (this.isScrolling) return;

            // Pick the entry with the largest intersection ratio to reduce churn
            let bestEntry = null;
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                if (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio) {
                    bestEntry = entry;
                }
            }
            if (bestEntry) {
                this.updateActiveNavButton(bestEntry.target.id);
            }
        }, options);

        // Observe all scroll target sections
        const sections = document.querySelectorAll('.scroll-target');
        sections.forEach(section => {
            this.sectionObserver.observe(section);
        });
    }

    updateActiveNavButton(sectionId) {
        if (this.currentActiveSectionId === sectionId) return;
        this.currentActiveSectionId = sectionId;
        const navButtons = this.floatingNav.querySelectorAll('.nav-btn');
        let activeButton = null;
        
        navButtons.forEach(button => {
            const targetId = button.getAttribute('data-target');
            if (targetId === sectionId) {
                button.classList.add('active');
                activeButton = button;
            } else {
                button.classList.remove('active');
            }
        });
        
        if (activeButton) {
            // Use synchronized animation during scrolling
            const duration = this.isScrolling ? 800 : null;
            this.animateHighlight(activeButton, duration);
        }
    }

    animateHighlight(activeButton, duration = null) {
        const navButtonsContainer = this.floatingNav.querySelector('.nav-buttons');
        
        // Get button position and dimensions
        const buttonRect = activeButton.getBoundingClientRect();
        const containerRect = navButtonsContainer.getBoundingClientRect();
        
        const leftOffset = buttonRect.left - containerRect.left;
        const width = buttonRect.width;
        
        // Temporarily override transition duration if specified
        if (duration) {
            navButtonsContainer.style.setProperty('--highlight-transition-duration', `${duration}ms`);
        }
        
        // Use CSS custom properties to animate the highlight
        navButtonsContainer.style.setProperty('--highlight-left', `${leftOffset}px`);
        navButtonsContainer.style.setProperty('--highlight-width', `${width}px`);
        
        // Update the pseudo-element styles
        if (!navButtonsContainer.dataset.hasHighlight) {
            navButtonsContainer.dataset.hasHighlight = 'true';
            // Add dynamic styles for the highlight
            const style = document.createElement('style');
            style.textContent = `
                .nav-buttons[data-has-highlight="true"]::before {
                    opacity: 1;
                    left: var(--highlight-left, 8px);
                    width: var(--highlight-width, 0px);
                    transition: all var(--highlight-transition-duration, 0.8s) cubic-bezier(0.4, 0, 0.2, 1);
                }
            `;
            document.head.appendChild(style);
        }
        
        // Reset duration override after animation
        if (duration) {
            setTimeout(() => {
                navButtonsContainer.style.removeProperty('--highlight-transition-duration');
            }, duration + 100);
        }
    }

    scrollToSection(targetId) {
        const targetSection = document.getElementById(targetId);
        if (!targetSection) return;

        let scrollTarget = targetSection;

        // Handle special case for DPS/HPS button
        if (targetId === 'god-gamer-container') {
            const dpsSection = document.querySelector('.god-gamer-dps-section');
            const healerSection = document.querySelector('.god-gamer-healer-section');
            
            // Check if God Gamer sections are visible
            const godGamerVisible = (dpsSection && dpsSection.style.display !== 'none') || 
                                   (healerSection && healerSection.style.display !== 'none');
            
            // If God Gamer sections are not visible, scroll to main DPS/Healers section instead
            if (!godGamerVisible) {
                const mainRankingsContainer = document.querySelector('.rankings-container:not([class*="-container"])');
                if (mainRankingsContainer) {
                    scrollTarget = mainRankingsContainer;
                }
            }
        }

        // Calculate target position accounting for nav height
        const targetRect = scrollTarget.getBoundingClientRect();
        const currentScroll = window.pageYOffset;
        const navHeight = this.floatingNav.offsetHeight;
        const offset = 120; // Additional offset for spacing (100px more than before)
        
        const targetPosition = currentScroll + targetRect.top - navHeight - offset;
        
        // Update active button immediately with synchronized animation
        this.updateActiveNavButton(targetId);
        
        // Smooth scroll with custom easing
        this.smoothScrollTo(targetPosition, 800);
    }

    smoothScrollTo(targetPosition, duration = 800) {
        const startPosition = window.pageYOffset;
        const distance = targetPosition - startPosition;
        let start = null;

        // Set scrolling state to prevent intersection observer interference
        this.isScrolling = true;
        
        // Clear any existing scroll timeout
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
        }

        // Easing function (ease-in-out cubic)
        const easeInOutCubic = (t) => {
            return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
        };

        const step = (timestamp) => {
            if (!start) start = timestamp;
            const progress = Math.min((timestamp - start) / duration, 1);
            const easedProgress = easeInOutCubic(progress);
            
            window.scrollTo(0, startPosition + distance * easedProgress);
            
            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                // Scroll complete - re-enable intersection observer after a small delay
                this.scrollTimeout = setTimeout(() => {
                    this.isScrolling = false;
                }, 200);
            }
        };

        requestAnimationFrame(step);
    }

    initializeHighlight() {
        // Find the initially active button and set up highlight
        const activeButton = this.floatingNav.querySelector('.nav-btn.active');
        if (activeButton) {
            this.animateHighlight(activeButton);
        }
    }

    storeOriginalPosition() {
        // Store the original Y position of the nav for scroll calculations
        // Make sure the nav is in its static position first
        this.floatingNav.classList.remove('floating', 'attached');
        this.floatingNav.style.top = '';
        
        // Force a reflow to ensure proper positioning
        this.floatingNav.offsetHeight;
        
        const rect = this.floatingNav.getBoundingClientRect();
        this.navOriginalTop = rect.top + window.pageYOffset;
        
        console.log('Stored nav original position:', this.navOriginalTop);
    }

    async loadRaidLogsData() {
        this.activeEventId = localStorage.getItem('activeEventSession');
        
        if (!this.activeEventId) {
            this.showNoData('No active raid session found');
            return;
        }

        console.log(`📊 Loading raid logs data for event: ${this.activeEventId}`);
        
        this.showLoading();
        
        try {
            // Fetch log data, raid statistics, abilities data, mana potions data, runes data, interrupts data, disarms data, sunder data, curse data, player streaks, and reward settings in parallel
            await Promise.all([
                this.fetchLogData(), // Now includes backend role enhancement via roster_overrides
                this.fetchRaidStats(),
                this.fetchAbilitiesData(),
                this.fetchManaPotionsData(),
                this.fetchRunesData(),
                this.fetchInterruptsData(),
                this.fetchDisarmsData(),
                this.fetchSunderData(),
                this.fetchCurseData(),
                this.fetchCurseShadowData(),
                this.fetchCurseElementsData(),
                this.fetchFaerieFireData(),
                this.fetchScorchData(),
                this.fetchDemoShoutData(),
                this.fetchPolymorphData(),
                this.fetchPowerInfusionData(),
                this.fetchDecursesData(),
                this.fetchShameData(),
                this.fetchPlayerStreaksData(),
                this.fetchGuildMembersData(),
                this.fetchRewardSettings(),
                this.fetchWorldBuffsData(),
                this.fetchFrostResistanceData(),
                this.fetchWorldBuffsArchiveUrl(),
                this.fetchFrostResistanceArchiveUrl(),
                this.fetchManualRewardsData(),
                this.fetchCurrentUser(),
                this.fetchPrimaryRoles().then(roles => this.primaryRoles = roles),
                this.fetchVoidDamageData()
            ]);
            this.displayRaidLogs();
            this.displayManualRewards();
            
            // Update the original position now that content is loaded
            setTimeout(() => {
                this.storeOriginalPosition();
            }, 100);
        } catch (error) {
            console.error('Error loading raid logs data:', error);
            this.showError('Failed to load raid logs data');
        }
    }

    async fetchLogData() {
        console.log(`📖 Fetching log data for event: ${this.activeEventId}`);
        
        const response = await fetch(`/api/log-data/${this.activeEventId}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch log data: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch log data');
        }
        
        this.logData = result.data || [];
        console.log(`📊 Loaded ${this.logData.length} log entries (enhanced with roster data)`);
    }

    async fetchRaidStats() {
        console.log(`📊 Fetching raid statistics for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/raid-stats/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch raid stats: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch raid stats');
            }
            
            this.raidStats = result.data || {};
            console.log(`📊 Loaded raid statistics:`, this.raidStats);
            
            // Update stat cards immediately
            this.updateStatCards();
            
        } catch (error) {
            console.error('Error fetching raid statistics:', error);
            // Don't fail the whole page if stats fail - just show default values
            this.raidStats = {};
            this.updateStatCards();
        }
    }

    async fetchAbilitiesData() {
        console.log(`💣 Fetching abilities data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/abilities-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch abilities data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch abilities data');
            }
            
            this.abilitiesData = result.data || [];
            this.abilitiesSettings = result.settings || { calculation_divisor: 10, max_points: 20 };
            console.log(`💣 Loaded abilities data:`, this.abilitiesData);
            console.log(`💣 Loaded abilities settings:`, this.abilitiesSettings);
            
        } catch (error) {
            console.error('Error fetching abilities data:', error);
            // Don't fail the whole page if abilities fail - just show empty data
            this.abilitiesData = [];
            this.abilitiesSettings = { calculation_divisor: 10, max_points: 20 }; // fallback
        }
    }

    async fetchRewardSettings() {
        console.log(`🏆 Fetching reward settings...`);
        
        try {
            const response = await fetch(`/api/reward-settings`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch reward settings: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch reward settings');
            }
            
            this.rewardSettings = result.settings || {};
            console.log(`🏆 Loaded reward settings:`, this.rewardSettings);
            
        } catch (error) {
            console.error('Error fetching reward settings:', error);
            // Don't fail the whole page if settings fail - use fallback values
            this.rewardSettings = {
                damage: { points_array: [80, 70, 55, 40, 35, 30, 25, 20, 15, 10, 8, 6, 5, 4, 3] },
                healing: { points_array: [80, 65, 60, 55, 40, 35, 30, 20, 15, 10] },
                abilities: { calculation_divisor: 10, max_points: 20 }
            };
        }
    }

    async fetchWorldBuffsData() {
        console.log(`🌍 Fetching world buffs data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/world-buffs-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch world buffs data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch world buffs data');
            }
            
            this.worldBuffsData = result.data || [];
            this.worldBuffsRequiredBuffs = result.requiredBuffs || 6;
            this.worldBuffsChannelId = result.channelId;
            this.worldBuffsIncludeDMF = result.includeDMF || false;
            console.log(`🌍 Loaded world buffs data:`, this.worldBuffsData);
            console.log(`🌍 Required buffs for this event: ${this.worldBuffsRequiredBuffs}`);
            console.log(`🌍 Include DMF in missing buffs: ${this.worldBuffsIncludeDMF}`);
            
        } catch (error) {
            console.error('Error fetching world buffs data:', error);
            // Don't fail the whole page if world buffs fail - just show empty data
            this.worldBuffsData = [];
            this.worldBuffsRequiredBuffs = 6;
            this.worldBuffsIncludeDMF = false;
        }
    }

    async fetchFrostResistanceData() {
        console.log(`🧊 Fetching frost resistance data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/frost-resistance-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch frost resistance data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch frost resistance data');
            }
            
            this.frostResistanceData = result.data || [];
            this.maxFrostResistance = result.maxFrostResistance || 0;
            console.log(`🧊 Loaded frost resistance data:`, this.frostResistanceData);
            console.log(`🧊 Max frost resistance: ${this.maxFrostResistance}`);
            
        } catch (error) {
            console.error('Error fetching frost resistance data:', error);
            // Don't fail the whole page if frost resistance fails - just show empty data
            this.frostResistanceData = [];
            this.maxFrostResistance = 0;
        }
    }

    async fetchWorldBuffsArchiveUrl() {
        console.log(`🌍 Fetching world buffs archive URL for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/rpb-tracking/${this.activeEventId}?analysisType=world_buffs`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch world buffs archive URL: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success && result.hasData && result.archiveUrl) {
                this.worldBuffsArchiveUrl = result.archiveUrl;
                console.log(`🌍 Loaded world buffs archive URL: ${this.worldBuffsArchiveUrl}`);
            } else {
                console.log(`🌍 No world buffs archive URL found for event: ${this.activeEventId}`);
                this.worldBuffsArchiveUrl = null;
            }
            
        } catch (error) {
            console.error('Error fetching world buffs archive URL:', error);
            this.worldBuffsArchiveUrl = null;
        }
    }

    async fetchFrostResistanceArchiveUrl() {
        console.log(`🧊 Fetching frost resistance archive URL for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/rpb-tracking/${this.activeEventId}?analysisType=frost_resistance`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch frost resistance archive URL: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success && result.hasData && result.archiveUrl) {
                this.frostResistanceArchiveUrl = result.archiveUrl;
                console.log(`🧊 Loaded frost resistance archive URL: ${this.frostResistanceArchiveUrl}`);
            } else {
                console.log(`🧊 No frost resistance archive URL found for event: ${this.activeEventId}`);
                this.frostResistanceArchiveUrl = null;
            }
            
        } catch (error) {
            console.error('Error fetching frost resistance archive URL:', error);
            this.frostResistanceArchiveUrl = null;
        }
    }

    async fetchManaPotionsData() {
        console.log(`🧪 Fetching mana potions data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/mana-potions-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch mana potions data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch mana potions data');
            }
            
            this.manaPotionsData = result.data || [];
            this.manaPotionsSettings = result.settings || { threshold: 10, points_per_potion: 3, max_points: 10 };
            console.log(`🧪 Loaded mana potions data:`, this.manaPotionsData);
            console.log(`🧪 Loaded mana potions settings:`, this.manaPotionsSettings);
            
        } catch (error) {
            console.error('Error fetching mana potions data:', error);
            // Don't fail the whole page if mana potions fail - just show empty data
            this.manaPotionsData = [];
            this.manaPotionsSettings = { threshold: 10, points_per_potion: 3, max_points: 10 }; // fallback
        }
    }

    async fetchRunesData() {
        console.log(`🔮 Fetching runes data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/runes-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch runes data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch runes data');
            }
            
            this.runesData = result.data || [];
            this.runesSettings = result.settings || { usage_divisor: 2, points_per_division: 1 };
            console.log(`🔮 Loaded runes data:`, this.runesData);
            console.log(`🔮 Loaded runes settings:`, this.runesSettings);
            
        } catch (error) {
            console.error('Error fetching runes data:', error);
            // Don't fail the whole page if runes fail - just show empty data
            this.runesData = [];
            this.runesSettings = { usage_divisor: 2, points_per_division: 1 }; // fallback
        }
    }

    async fetchInterruptsData() {
        console.log(`⚡ Fetching interrupts data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/interrupts-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch interrupts data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch interrupts data');
            }
            
            this.interruptsData = result.data || [];
            this.interruptsSettings = result.settings || { points_per_interrupt: 1, interrupts_needed: 1, max_points: 5 };
            console.log(`⚡ Loaded interrupts data:`, this.interruptsData);
            console.log(`⚡ Loaded interrupts settings:`, this.interruptsSettings);
            
        } catch (error) {
            console.error('Error fetching interrupts data:', error);
            // Don't fail the whole page if interrupts fail - just show empty data
            this.interruptsData = [];
            this.interruptsSettings = { points_per_interrupt: 1, interrupts_needed: 1, max_points: 5 }; // fallback
        }
    }

    async fetchDisarmsData() {
        console.log(`🛡️ Fetching disarms data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/disarms-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch disarms data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch disarms data');
            }
            
            this.disarmsData = result.data || [];
            this.disarmsSettings = result.settings || { points_per_disarm: 1, disarms_needed: 1, max_points: 5 };
            console.log(`🛡️ Loaded disarms data:`, this.disarmsData);
            console.log(`🛡️ Loaded disarms settings:`, this.disarmsSettings);
            
        } catch (error) {
            console.error('Error fetching disarms data:', error);
            // Don't fail the whole page if disarms fail - just show empty data
            this.disarmsData = [];
            this.disarmsSettings = { points_per_disarm: 1, disarms_needed: 1, max_points: 5 }; // fallback
        }
    }

    async fetchSunderData() {
        console.log(`⚔️ Fetching sunder armor data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/sunder-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch sunder data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch sunder data');
            }
            
            this.sunderData = result.data || [];
            this.sunderSettings = result.settings || { point_ranges: [] };
            console.log(`⚔️ Loaded sunder data:`, this.sunderData);
            console.log(`⚔️ Loaded sunder settings:`, this.sunderSettings);
            
        } catch (error) {
            console.error('Error fetching sunder data:', error);
            // Don't fail the whole page if sunder fails - just show empty data
            this.sunderData = [];
            this.sunderSettings = { point_ranges: [] }; // fallback
        }
    }

    async fetchCurseData() {
        console.log(`🔮 Fetching curse of recklessness data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/curse-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch curse data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch curse data');
            }
            
            this.curseData = result.data || [];
            this.curseSettings = result.settings || { uptime_threshold: 85, points: 10 };
            console.log(`🔮 Loaded curse data:`, this.curseData);
            console.log(`🔮 Loaded curse settings:`, this.curseSettings);
            
        } catch (error) {
            console.error('Error fetching curse data:', error);
            // Don't fail the whole page if curse fails - just show empty data
            this.curseData = [];
            this.curseSettings = { uptime_threshold: 85, points: 10 }; // fallback
        }
    }

    async fetchCurseShadowData() {
        console.log(`🌑 Fetching curse of shadow data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/curse-shadow-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch curse shadow data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch curse shadow data');
            }
            
            this.curseShadowData = result.data || [];
            this.curseShadowSettings = result.settings || { uptime_threshold: 85, points: 10 };
            console.log(`🌑 Loaded curse shadow data:`, this.curseShadowData);
            console.log(`🌑 Loaded curse shadow settings:`, this.curseShadowSettings);
            
        } catch (error) {
            console.error('Error fetching curse shadow data:', error);
            // Don't fail the whole page if curse shadow fails - just show empty data
            this.curseShadowData = [];
            this.curseShadowSettings = { uptime_threshold: 85, points: 10 }; // fallback
        }
    }

    async fetchCurseElementsData() {
        console.log(`❄️ Fetching curse of elements data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/curse-elements-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch curse elements data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch curse elements data');
            }
            
            this.curseElementsData = result.data || [];
            this.curseElementsSettings = result.settings || { uptime_threshold: 85, points: 10 };
            console.log(`❄️ Loaded curse elements data:`, this.curseElementsData);
            console.log(`❄️ Loaded curse elements settings:`, this.curseElementsSettings);
            
        } catch (error) {
            console.error('Error fetching curse elements data:', error);
            // Don't fail the whole page if curse elements fails - just show empty data
            this.curseElementsData = [];
            this.curseElementsSettings = { uptime_threshold: 85, points: 10 }; // fallback
        }
    }

    async fetchFaerieFireData() {
        console.log(`🌟 Fetching faerie fire data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/faerie-fire-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch faerie fire data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch faerie fire data');
            }
            
            this.faerieFireData = result.data || [];
            this.faerieFireSettings = result.settings || { uptime_threshold: 85, points: 10 };
            console.log(`🌟 Loaded faerie fire data:`, this.faerieFireData);
            console.log(`🌟 Loaded faerie fire settings:`, this.faerieFireSettings);
            
        } catch (error) {
            console.error('Error fetching faerie fire data:', error);
            // Don't fail the whole page if faerie fire fails - just show empty data
            this.faerieFireData = [];
            this.faerieFireSettings = { uptime_threshold: 85, points: 10 }; // fallback
        }
    }

    async fetchScorchData() {
        console.log(`🔥 Fetching scorch data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/scorch-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch scorch data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch scorch data');
            }
            
            this.scorchData = result.data || [];
            this.scorchSettings = result.settings || { tier1_max: 99, tier1_points: 0, tier2_max: 199, tier2_points: 5, tier3_points: 10 };
            console.log(`🔥 Loaded scorch data:`, this.scorchData);
            console.log(`🔥 Loaded scorch settings:`, this.scorchSettings);
            
        } catch (error) {
            console.error('Error fetching scorch data:', error);
            // Don't fail the whole page if scorch fails - just show empty data
            this.scorchData = [];
            this.scorchSettings = { tier1_max: 99, tier1_points: 0, tier2_max: 199, tier2_points: 5, tier3_points: 10 }; // fallback
        }
    }

    async fetchDemoShoutData() {
        console.log(`⚔️ Fetching demoralizing shout data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/demo-shout-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch demoralizing shout data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch demoralizing shout data');
            }
            
            this.demoShoutData = result.data || [];
            this.demoShoutSettings = result.settings || { tier1_max: 99, tier1_points: 0, tier2_max: 199, tier2_points: 5, tier3_points: 10 };
            console.log(`⚔️ Loaded demoralizing shout data:`, this.demoShoutData);
            console.log(`⚔️ Loaded demoralizing shout settings:`, this.demoShoutSettings);
            
        } catch (error) {
            console.error('Error fetching demoralizing shout data:', error);
            // Don't fail the whole page if demoralizing shout fails - just show empty data
            this.demoShoutData = [];
            this.demoShoutSettings = { tier1_max: 99, tier1_points: 0, tier2_max: 199, tier2_points: 5, tier3_points: 10 }; // fallback
        }
    }

    async fetchPolymorphData() {
        console.log(`🔮 Fetching polymorph data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/polymorph-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch polymorph data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch polymorph data');
            }
            
            this.polymorphData = result.data || [];
            this.polymorphSettings = result.settings || { points_per_division: 1, polymorphs_needed: 2, max_points: 5 };
            console.log(`🔮 Loaded polymorph data:`, this.polymorphData);
            console.log(`🔮 Loaded polymorph settings:`, this.polymorphSettings);
            
        } catch (error) {
            console.error('Error fetching polymorph data:', error);
            // Don't fail the whole page if polymorph fails - just show empty data
            this.polymorphData = [];
            this.polymorphSettings = { points_per_division: 1, polymorphs_needed: 2, max_points: 5 }; // fallback
        }
    }

    async fetchPowerInfusionData() {
        console.log(`💫 Fetching power infusion data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/power-infusion-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch power infusion data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch power infusion data');
            }
            
            this.powerInfusionData = result.data || [];
            this.powerInfusionSettings = result.settings || { points_per_division: 1, infusions_needed: 2, max_points: 10 };
            console.log(`💫 Loaded power infusion data:`, this.powerInfusionData);
            console.log(`💫 Loaded power infusion settings:`, this.powerInfusionSettings);
            
        } catch (error) {
            console.error('Error fetching power infusion data:', error);
            // Don't fail the whole page if power infusion fails - just show empty data
            this.powerInfusionData = [];
            this.powerInfusionSettings = { points_per_division: 1, infusions_needed: 2, max_points: 10 }; // fallback
        }
    }

    async fetchDecursesData() {
        console.log(`🪄 Fetching decurses data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/decurses-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch decurses data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch decurses data');
            }
            
            this.decursesData = result.data || [];
            this.decursesSettings = result.settings || { points_per_division: 1, decurses_needed: 3, max_points: 10, min_points: -10, average_decurses: 0 };
            console.log(`🪄 Loaded decurses data:`, this.decursesData);
            console.log(`🪄 Loaded decurses settings:`, this.decursesSettings);
            
        } catch (error) {
            console.error('Error fetching decurses data:', error);
            // Don't fail the whole page if decurses fails - just show empty data
            this.decursesData = [];
            this.decursesSettings = { points_per_division: 1, decurses_needed: 3, max_points: 10, min_points: -10, average_decurses: 0 }; // fallback
        }
    }

    async fetchPrimaryRoles() {
        if (!this.activeEventId) {
            console.log('🎯 [PRIMARY ROLES] No active event ID');
            return null;
        }

        try {
            console.log(`🎯 [PRIMARY ROLES] Fetching primary roles for event: ${this.activeEventId}`);
            const response = await fetch(`/api/player-role-mapping/${this.activeEventId}/primary-roles`);
            
            if (!response.ok) {
                console.log(`🎯 [PRIMARY ROLES] No primary roles data available (${response.status})`);
                return null;
            }
            
            const data = await response.json();
            
            if (data.success && data.primaryRoles) {
                console.log(`✅ [PRIMARY ROLES] Loaded ${data.count} primary roles`);
                return data.primaryRoles;
            } else {
                console.log('🎯 [PRIMARY ROLES] No primary roles in response');
                return null;
            }
        } catch (error) {
            console.error('❌ [PRIMARY ROLES] Error fetching primary roles:', error);
            return null;
        }
    }

    async fetchVoidDamageData() {
        if (!this.activeEventId) {
            console.log('💜 [VOID DAMAGE] No active event ID');
            return;
        }

        try {
            console.log(`💜 [VOID DAMAGE] Fetching void damage data for event: ${this.activeEventId}`);
            const response = await fetch(`/api/void-damage/${this.activeEventId}`);
            
            if (!response.ok) {
                console.log(`💜 [VOID DAMAGE] No void damage data available (${response.status})`);
                this.voidDamageData = [];
                return;
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.voidDamageData = data.data || [];
                if (data.settings) {
                    this.voidDamageSettings = { ...this.voidDamageSettings, ...data.settings };
                }
                console.log(`✅ [VOID DAMAGE] Loaded ${this.voidDamageData.length} players with void damage`);
            } else {
                console.log('💜 [VOID DAMAGE] Failed to load void damage data');
                this.voidDamageData = [];
            }
        } catch (error) {
            console.error('❌ [VOID DAMAGE] Error fetching void damage data:', error);
            this.voidDamageData = [];
        }
    }

    async fetchShameData() {
        console.log(`💀 Fetching shame data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/shame-data/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch shame data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch shame data');
            }
            
            this.shameData = result.data || {};
            console.log(`💀 Loaded shame data:`, this.shameData);
            
        } catch (error) {
            console.error('Error fetching shame data:', error);
            // Don't fail the whole page if shame data fails - just show empty data
            this.shameData = {};
        }
    }

    async fetchPlayerStreaksData() {
        console.log(`🔥 Fetching player streaks data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/player-streaks/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch player streaks data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch player streaks data');
            }
            
            this.playerStreaksData = result.data || [];
            console.log(`🔥 Loaded player streaks data:`, this.playerStreaksData);
            console.log(`🔥 Found ${this.playerStreaksData.length} players with streak >= 4`);
            
        } catch (error) {
            console.error('Error fetching player streaks data:', error);
            // Don't fail the whole page if player streaks fails - just show empty data
            this.playerStreaksData = [];
        }
    }

    async fetchGuildMembersData() {
        console.log(`🏰 Fetching guild members data for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/guild-members/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch guild members data: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch guild members data');
            }
            
            this.guildMembersData = result.data || [];
            console.log(`🏰 Loaded guild members data:`, this.guildMembersData);
            console.log(`🏰 Found ${this.guildMembersData.length} guild members in raid`);
            
        } catch (error) {
            console.error('Error fetching guild members data:', error);
            // Don't fail the whole page if guild members fails - just show empty data
            this.guildMembersData = [];
        }
    }

    updateStatCards() {
        // Update RPB Archive card
        this.updateRPBArchiveCard();
        
        // Update Raid Duration card
        this.updateRaidDurationCard();
        
        // Update Bosses Killed card
        this.updateBossesKilledCard();
        
        // Update Last Boss card
        this.updateLastBossCard();
        
        // Update WoW Logs card
        this.updateWoWLogsCard();
        
        // Update Total Points card
        this.updateTotalPointsCard();
    }

    updateRPBArchiveCard() {
        const button = document.getElementById('rpb-archive-button');
        const detail = document.getElementById('rpb-archive-detail');
        
        if (this.raidStats.rpb && this.raidStats.rpb.archiveUrl) {
            // Enable button and set URL
            button.disabled = false;
            button.onclick = () => window.open(this.raidStats.rpb.archiveUrl, '_blank');
            
            // Update detail text
            if (this.raidStats.rpb.archiveName) {
                detail.textContent = this.raidStats.rpb.archiveName;
            } else {
                detail.textContent = 'Archive available';
            }
        } else {
            // Keep button disabled
            button.disabled = true;
            detail.textContent = 'No archive available';
        }
    }

    updateRaidDurationCard() {
        const valueElement = document.getElementById('raid-duration-value');
        const detailElement = document.querySelector('.raid-duration .stat-detail');
        
        if (this.raidStats.stats && this.raidStats.stats.totalTime) {
            const hours = Math.floor(this.raidStats.stats.totalTime / 60);
            const minutes = this.raidStats.stats.totalTime % 60;
            
            // Format as "2h 35m" for values over 60 minutes, otherwise just "89m"
            if (hours > 0) {
                valueElement.textContent = `${hours}h ${minutes}m`;
            } else {
                valueElement.textContent = `${this.raidStats.stats.totalTime}m`;
            }
            
            // Show active fight time in detail if available
            if (this.raidStats.stats.activeFightTime) {
                detailElement.textContent = `${this.raidStats.stats.activeFightTime}m active fight time`;
            } else {
                detailElement.textContent = 'Total raid duration';
            }
        } else {
            valueElement.textContent = '--';
            detailElement.textContent = 'Minutes';
        }
    }

    updateBossesKilledCard() {
        const valueElement = document.getElementById('bosses-killed-value');
        
        if (this.raidStats.stats && this.raidStats.stats.bossesKilled !== undefined) {
            valueElement.textContent = this.raidStats.stats.bossesKilled;
        } else {
            valueElement.textContent = '--';
        }
    }

    updateLastBossCard() {
        const valueElement = document.getElementById('last-boss-value');
        const detailElement = document.getElementById('last-boss-detail');
        
        if (this.raidStats.stats && this.raidStats.stats.lastBoss) {
            valueElement.textContent = this.raidStats.stats.lastBoss;
            detailElement.textContent = 'Final boss defeated';
        } else {
            valueElement.textContent = '--';
            detailElement.textContent = 'No boss data';
        }
    }

    updateWoWLogsCard() {
        const button = document.getElementById('wow-logs-button');
        const detail = document.getElementById('wow-logs-detail');
        
        if (this.raidStats.stats && this.raidStats.stats.logUrl) {
            // Enable button and set URL
            button.disabled = false;
            button.onclick = () => window.open(this.raidStats.stats.logUrl, '_blank');
            detail.textContent = 'View detailed logs';
        } else {
            // Keep button disabled
            button.disabled = true;
            detail.textContent = 'No logs available';
        }
    }

    updateTotalPointsCard() {
        const valueElement = document.getElementById('total-points-value');
        
        if (!valueElement) return;
        
        try {
            // Calculate total points using the formula:
            // (Number of players in raid) × 100 + (all positive values) - (all negative values)
            
            // Get number of players from log data
            const numberOfPlayers = this.logData ? this.logData.length : 0;
            
            // Base points = number of players × 100
            const basePoints = numberOfPlayers * 100;
            
            // Calculate points from all rankings on the page
            let positivePoints = 0;
            let negativePoints = 0;
            
            // Add points from damage rankings
            if (this.logData && this.rewardSettings.damage && this.rewardSettings.damage.points_array) {
                const damagePoints = this.rewardSettings.damage.points_array;
                for (let i = 0; i < Math.min(this.logData.length, damagePoints.length); i++) {
                    positivePoints += damagePoints[i];
                }
            }
            
            // Add points from healing rankings
            if (this.logData && this.rewardSettings.healing && this.rewardSettings.healing.points_array) {
                const healingPoints = this.rewardSettings.healing.points_array;
                const healers = this.logData.filter(player => 
                    player.role_detected === 'healer' || player.healing_amount > player.damage_amount
                );
                for (let i = 0; i < Math.min(healers.length, healingPoints.length); i++) {
                    positivePoints += healingPoints[i];
                }
            }
            
            // Add points from abilities
            if (this.abilitiesData && this.abilitiesSettings) {
                this.abilitiesData.forEach(player => {
                    if (player.points > 0) positivePoints += player.points;
                    else if (player.points < 0) negativePoints += Math.abs(player.points);
                });
            }
            
            // Add points from mana potions
            if (this.manaPotionsData && this.manaPotionsSettings) {
                this.manaPotionsData.forEach(player => {
                    if (player.points > 0) positivePoints += player.points;
                });
            }
            
            // Add points from runes
            if (this.runesData && this.runesSettings) {
                this.runesData.forEach(player => {
                    if (player.points > 0) positivePoints += player.points;
                });
            }
            
            // Add points from interrupts
            if (this.interruptsData && this.interruptsSettings) {
                this.interruptsData.forEach(player => {
                    if (player.points > 0) positivePoints += player.points;
                });
            }
            
            // Add points from disarms
            if (this.disarmsData && this.disarmsSettings) {
                this.disarmsData.forEach(player => {
                    if (player.points > 0) positivePoints += player.points;
                });
            }
            
            // Add points from sunder armor
            if (this.sunderData && this.sunderSettings && this.sunderSettings.point_ranges) {
                this.sunderData.forEach(player => {
                    if (player.points > 0) positivePoints += player.points;
                    else if (player.points < 0) negativePoints += Math.abs(player.points);
                });
            }
            
            // Add points from curses
            if (this.curseData && this.curseSettings) {
                this.curseData.forEach(player => {
                    if (player.points > 0) positivePoints += player.points;
                });
            }
            
            // Add points from curse shadow
            if (this.curseShadowData && this.curseShadowSettings) {
                this.curseShadowData.forEach(player => {
                    if (player.points > 0) positivePoints += player.points;
                });
            }
            
            // Add points from curse elements
            if (this.curseElementsData && this.curseElementsSettings) {
                this.curseElementsData.forEach(player => {
                    if (player.points > 0) positivePoints += player.points;
                });
            }
            
            // Add points from faerie fire
            if (this.faerieFireData && this.faerieFireSettings) {
                this.faerieFireData.forEach(player => {
                    if (player.points > 0) positivePoints += player.points;
                });
            }
            
            // Add points from scorch
            if (this.scorchData && this.scorchSettings) {
                this.scorchData.forEach(player => {
                    if (player.points > 0) positivePoints += player.points;
                });
            }
            
            // Add points from demoralizing shout
            if (this.demoShoutData && this.demoShoutSettings) {
                this.demoShoutData.forEach(player => {
                    if (player.points > 0) positivePoints += player.points;
                });
            }
            
            // Add points from polymorph
            if (this.polymorphData && this.polymorphSettings) {
                this.polymorphData.forEach(player => {
                    if (player.points > 0) positivePoints += player.points;
                });
            }
            
            // Add points from power infusion
            if (this.powerInfusionData && this.powerInfusionSettings) {
                this.powerInfusionData.forEach(player => {
                    if (player.points > 0) positivePoints += player.points;
                });
            }
            
            // Add points from decurses
            if (this.decursesData && this.decursesSettings) {
                this.decursesData.forEach(player => {
                    if (player.points > 0) positivePoints += player.points;
                    else if (player.points < 0) negativePoints += Math.abs(player.points);
                });
            }
            
            // Add points from manual rewards/deductions
            if (this.manualRewardsData) {
                this.manualRewardsData.forEach(entry => {
                    const points = parseFloat(entry.points);
                    if (points > 0) positivePoints += points;
                    else if (points < 0) negativePoints += Math.abs(points);
                });
            }
            
            // Calculate final total
            const totalPoints = basePoints + positivePoints - negativePoints;
            
            // Display the result
            valueElement.textContent = this.formatNumber(totalPoints);
            
            console.log(`📊 [TOTAL POINTS] Base: ${basePoints}, Positive: ${positivePoints}, Negative: ${negativePoints}, Total: ${totalPoints}`);
            
        } catch (error) {
            console.error('❌ [TOTAL POINTS] Error calculating total points:', error);
            valueElement.textContent = '--';
        }
    }


    displayRaidLogs() {
        if (!this.logData || this.logData.length === 0) {
            console.log(`❌ No log data found for event: ${this.activeEventId}`);
            this.showNoData(`No raid logs data available for event: ${this.activeEventId}`);
            return;
        }

        // Debug: Log all role_detected values (enhanced by backend)
        console.log('🔍 [DEBUG] All role_detected values (backend enhanced):', this.logData.map(p => ({
            name: p.character_name,
            role: p.role_detected,
            spec: p.spec_name,
            source: p.role_source,
            damage: p.damage_amount,
            healing: p.healing_amount
        })));

        // Filter and sort damage dealers (DPS and Tank roles that do damage)
        const damageDealer = this.logData
            .filter(player => {
                const role = (player.role_detected || '').toLowerCase();
                const damage = parseInt(player.damage_amount) || 0;
                return (role === 'dps' || role === 'tank') && damage > 0;
            })
            .sort((a, b) => (parseInt(b.damage_amount) || 0) - (parseInt(a.damage_amount) || 0));

        // Filter and sort healers
        const healers = this.logData
            .filter(player => {
                const role = (player.role_detected || '').toLowerCase();
                const healing = parseInt(player.healing_amount) || 0;
                return role === 'healer' && healing > 0;
            })
            .sort((a, b) => (parseInt(b.healing_amount) || 0) - (parseInt(a.healing_amount) || 0));

        console.log(`📊 Found ${damageDealer.length} damage dealers and ${healers.length} healers`);
        console.log('🔍 [DEBUG] Damage dealers:', damageDealer.map(p => `${p.character_name} (${p.role_detected})`));
        console.log('🔍 [DEBUG] Healers:', healers.map(p => `${p.character_name} (${p.role_detected})`));

        // Calculate God Gamer awards
        const godGamerDPS = this.calculateGodGamerDPS(damageDealer);
        const godGamerHealer = this.calculateGodGamerHealer(healers);

        // Display the rankings
        this.displayPlayerStreaksRankings(this.playerStreaksData);
        this.displayGuildMembersRankings(this.guildMembersData);
        this.displayGodGamerDPS(godGamerDPS);
        this.displayGodGamerHealer(godGamerHealer);
        this.displayDamageRankings(damageDealer);
        this.displayHealerRankings(healers);
        this.displayTooLowDamageRankings(damageDealer);
        this.displayTooLowHealingRankings(healers);
        this.displayShamanHealers(healers);
        this.displayPriestHealers(healers);
        this.displayDruidHealers(healers);
        this.displayWorldBuffsRankings(this.worldBuffsData);
        this.displayFrostResistanceRankings(this.frostResistanceData);
        this.displayAbilitiesRankings(this.abilitiesData);
        this.displayManaPotionsRankings(this.manaPotionsData);
        this.displayRunesRankings(this.runesData);
        this.displayInterruptsRankings(this.interruptsData);
        this.displayDisarmsRankings(this.disarmsData);
        this.displaySunderRankings(this.sunderData);
        this.displayCurseRankings(this.curseData);
        this.displayCurseShadowRankings(this.curseShadowData);
        this.displayCurseElementsRankings(this.curseElementsData);
        this.displayFaerieFireRankings(this.faerieFireData);
        this.displayScorchRankings(this.scorchData);
        this.displayDemoShoutRankings(this.demoShoutData);
        this.displayPolymorphRankings(this.polymorphData);
        this.displayPowerInfusionRankings(this.powerInfusionData);
                    this.displayDecursesRankings(this.decursesData);
            this.displayVoidDamageRankings(this.voidDamageData);
        this.updateAbilitiesHeader();
        this.updateManaPotionsHeader();
        this.updateRunesHeader();
        this.updateInterruptsHeader();
        this.updateDisarmsHeader();
        this.updateSunderHeader();
        this.updateCurseHeader();
        this.updateCurseShadowHeader();
        this.updateCurseElementsHeader();
        this.updateFaerieFireHeader();
        this.updateScorchHeader();
        this.updateDemoShoutHeader();
        this.updatePolymorphHeader();
        this.updatePowerInfusionHeader();
                    this.updateDecursesHeader();
            this.updateVoidDamageHeader();
        this.updateFrostResistanceHeader();
        this.updateArchiveButtons();
        this.displayWallOfShame();
        
        this.hideLoading();
        this.showContent();
    }

    displayPlayerStreaksRankings(players) {
        const container = document.getElementById('player-streaks-list');
        const section = container.closest('.rankings-section');
        section.classList.add('streak-section');

        if (!players || players.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-fire"></i>
                    <p>No players with 4+ week attendance streak in this raid</p>
                </div>
            `;
            return;
        }

        console.log(`🔥 Displaying ${players.length} players with streaks >= 4`);

        // Calculate points for each player based on streak
        const calculatePoints = (streak) => {
            if (streak <= 3) return 0;
            if (streak === 4) return 3;
            if (streak === 5) return 6;
            if (streak === 6) return 9;
            if (streak === 7) return 12;
            return 15; // 8+ weeks
        };

        // Get max streak for percentage calculation
        const maxStreak = Math.max(...players.map(p => p.player_streak));

        container.innerHTML = players.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const points = calculatePoints(player.player_streak);
            const fillPercentage = Math.round((player.player_streak / maxStreak) * 100);
            
            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%">
                        <div class="character-name">${this.getClassIconHtml(player.character_class)}${player.character_name}</div>
                        <div class="character-details" title="${player.player_streak} consecutive weeks">
                            ${player.player_streak} weeks
                        </div>
                    </div>
                    <div class="performance-amount">
                        <div class="amount-value">${points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    displayGuildMembersRankings(players) {
        const container = document.getElementById('guild-members-list');
        const section = container.closest('.rankings-section');
        section.classList.add('guild-section');

        if (!players || players.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-shield-alt"></i>
                    <p>No guild members found in this raid</p>
                </div>
            `;
            return;
        }

        console.log(`🏰 Displaying ${players.length} guild members`);

        // Since all guild members get 10 points, they all have 100% fill
        container.innerHTML = players.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            
            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                                         <div class="character-info class-${characterClass}" style="--fill-percentage: 100%">
                         <div class="character-name">${this.getClassIconHtml(player.character_class)}${player.character_name}</div>
                         <div class="character-details" title="Guild member: ${player.guild_character_name}">
                             Guild Member
                         </div>
                     </div>
                    <div class="performance-amount">
                        <div class="amount-value">10</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    calculateGodGamerDPS(players) {
        if (players.length < 2) {
            return null; // Need at least 2 players to compare
        }

        const firstPlace = parseInt(players[0].damage_amount) || 0;
        const secondPlace = parseInt(players[1].damage_amount) || 0;
        const difference = firstPlace - secondPlace;

        console.log(`⚔️ [GOD GAMER DPS] #1: ${players[0].character_name} (${firstPlace.toLocaleString()}) vs #2: ${players[1].character_name} (${secondPlace.toLocaleString()}) = ${difference.toLocaleString()} difference`);

        if (difference >= 250000) {
            return {
                ...players[0],
                title: "God Gamer DPS",
                points: 30,
                trophy: "gold",
                difference: difference,
                secondPlace: players[1]
            };
        } else if (difference >= 150000) {
            return {
                ...players[0],
                title: "Demi God DPS",
                points: 20,
                trophy: "silver",
                difference: difference,
                secondPlace: players[1]
            };
        }

        return null; // Difference not large enough
    }

    calculateGodGamerHealer(players) {
        if (players.length < 2) {
            return null; // Need at least 2 players to compare
        }

        const firstPlace = parseInt(players[0].healing_amount) || 0;
        const secondPlace = parseInt(players[1].healing_amount) || 0;
        const difference = firstPlace - secondPlace;

        console.log(`❤️ [GOD GAMER HEALER] #1: ${players[0].character_name} (${firstPlace.toLocaleString()}) vs #2: ${players[1].character_name} (${secondPlace.toLocaleString()}) = ${difference.toLocaleString()} difference`);

        if (difference >= 250000) {
            return {
                ...players[0],
                title: "God Gamer Healer",
                points: 20,
                trophy: "gold",
                difference: difference,
                secondPlace: players[1]
            };
        } else if (difference >= 150000) {
            return {
                ...players[0],
                title: "Demi God Healer",
                points: 15,
                trophy: "silver",
                difference: difference,
                secondPlace: players[1]
            };
        }

        return null; // Difference not large enough
    }

    displayGodGamerDPS(godGamer) {
        const container = document.getElementById('god-gamer-dps-list');
        const section = container.closest('.rankings-section');
        
        if (!godGamer) {
            // Hide the entire section if no god gamer
            section.style.display = 'none';
            return;
        }

        // Show the section
        section.style.display = 'block';
        section.classList.add('god-gamer-dps');

        const characterClass = this.normalizeClassName(godGamer.character_class);
        const formattedDamage = this.formatNumber(parseInt(godGamer.damage_amount) || 0);
        const formattedDifference = this.formatNumber(godGamer.difference);
        const trophyIcon = godGamer.trophy === 'gold' ? 
            '<i class="fas fa-trophy trophy-icon gold"></i>' : 
            '<i class="fas fa-trophy trophy-icon silver"></i>';

        container.innerHTML = `
            <div class="ranking-item">
                <div class="ranking-position">
                    ${trophyIcon}
                </div>
                <div class="character-info class-${characterClass}" style="--fill-percentage: 100%;">
                    <div class="character-name">
                        ${this.getSpecIconHtml(godGamer.spec_name, godGamer.character_class)}${godGamer.character_name}
                    </div>
                    <div class="character-details" title="${formattedDamage} damage (+${formattedDifference} over #2)">
                        ${formattedDamage} damage (+${formattedDifference} ahead)
                    </div>
                </div>
                <div class="performance-amount" title="${godGamer.title}: ${formattedDifference} more damage than ${godGamer.secondPlace.character_name}">
                    <div class="amount-value">${godGamer.points}</div>
                    <div class="points-label">points</div>
                </div>
            </div>
        `;
    }

    displayGodGamerHealer(godGamer) {
        const container = document.getElementById('god-gamer-healer-list');
        const section = container.closest('.rankings-section');
        
        if (!godGamer) {
            // Hide the entire section if no god gamer
            section.style.display = 'none';
            return;
        }

        // Show the section
        section.style.display = 'block';
        section.classList.add('god-gamer-healer');

        const characterClass = this.normalizeClassName(godGamer.character_class);
        const formattedHealing = this.formatNumber(parseInt(godGamer.healing_amount) || 0);
        const formattedDifference = this.formatNumber(godGamer.difference);
        const trophyIcon = godGamer.trophy === 'gold' ? 
            '<i class="fas fa-trophy trophy-icon gold"></i>' : 
            '<i class="fas fa-trophy trophy-icon silver"></i>';

        container.innerHTML = `
            <div class="ranking-item">
                <div class="ranking-position">
                    ${trophyIcon}
                </div>
                <div class="character-info class-${characterClass}" style="--fill-percentage: 100%;">
                    <div class="character-name">
                        ${this.getSpecIconHtml(godGamer.spec_name, godGamer.character_class)}${godGamer.character_name}
                    </div>
                    <div class="character-details" title="${formattedHealing} healing (+${formattedDifference} over #2)">
                        ${formattedHealing} healing (+${formattedDifference} ahead)
                    </div>
                </div>
                <div class="performance-amount" title="${godGamer.title}: ${formattedDifference} more healing than ${godGamer.secondPlace.character_name}">
                    <div class="amount-value">${godGamer.points}</div>
                    <div class="points-label">points</div>
                </div>
            </div>
        `;
    }

    displayDamageRankings(players) {
        const container = document.getElementById('damage-dealers-list');
        const section = container.closest('.rankings-section');
        section.classList.add('damage');

        // Get dynamic damage points array
        const damagePoints = this.rewardSettings.damage?.points_array || [80, 70, 55, 40, 35, 30, 25, 20, 15, 10, 8, 6, 5, 4, 3];

        // Filter out players with 0 points and preserve original position
        const playersWithPoints = players.map((player, index) => ({
            ...player,
            originalPosition: index + 1
        })).filter(player => {
            const points = player.originalPosition <= damagePoints.length ? damagePoints[player.originalPosition - 1] : 0;
            return points > 0;
        });

        if (playersWithPoints.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-sword"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max damage for percentage calculation
        const maxDamage = parseInt(playersWithPoints[0].damage_amount) || 1;

        container.innerHTML = playersWithPoints.map((player, index) => {
            const position = player.originalPosition;
            const trophyHtml = this.getTrophyHtml(position);
            const characterClass = this.normalizeClassName(player.character_class);
            const formattedDamage = this.formatNumber(parseInt(player.damage_amount) || 0);
            const playerDamage = parseInt(player.damage_amount) || 0;
            const fillPercentage = Math.max(5, (playerDamage / maxDamage) * 100); // Minimum 5% for visibility
            
            // Calculate points (based on array length, rest get 0)
            const points = position <= damagePoints.length ? damagePoints[position - 1] : 0;

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        ${trophyHtml}
                        ${position <= 3 ? '' : `<span class="ranking-number">#${position}</span>`}
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getSpecIconHtml(player.spec_name, player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${formattedDamage} damage">
                            ${this.truncateWithTooltip(`${formattedDamage} damage`).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${(parseInt(player.damage_amount) || 0).toLocaleString()} damage">
                        <div class="amount-value">${points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    displayHealerRankings(players) {
        const container = document.getElementById('healers-list');
        const section = container.closest('.rankings-section');
        section.classList.add('healing');

        // Get dynamic healing points array
        const healingPoints = this.rewardSettings.healing?.points_array || [80, 65, 60, 55, 40, 35, 30, 20, 15, 10];

        // Filter out players with 0 points and preserve original position
        const playersWithPoints = players.map((player, index) => ({
            ...player,
            originalPosition: index + 1
        })).filter(player => {
            const points = player.originalPosition <= healingPoints.length ? healingPoints[player.originalPosition - 1] : 0;
            return points > 0;
        });

        if (playersWithPoints.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-heart"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max healing for percentage calculation
        const maxHealing = parseInt(playersWithPoints[0].healing_amount) || 1;

        container.innerHTML = playersWithPoints.map((player, index) => {
            const position = player.originalPosition;
            const trophyHtml = this.getTrophyHtml(position);
            const characterClass = this.normalizeClassName(player.character_class);
            const formattedHealing = this.formatNumber(parseInt(player.healing_amount) || 0);
            const playerHealing = parseInt(player.healing_amount) || 0;
            const fillPercentage = Math.max(5, (playerHealing / maxHealing) * 100); // Minimum 5% for visibility
            
            // Calculate points (based on array length, rest get 0)
            const points = position <= healingPoints.length ? healingPoints[position - 1] : 0;

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        ${trophyHtml}
                        ${position <= 3 ? '' : `<span class="ranking-number">#${position}</span>`}
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getSpecIconHtml(player.spec_name, player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${formattedHealing} healing">
                            ${this.truncateWithTooltip(`${formattedHealing} healing`).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${(parseInt(player.healing_amount) || 0).toLocaleString()} healing">
                        <div class="amount-value">${points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    displayTooLowDamageRankings(players) {
        const container = document.getElementById('too-low-damage-list');
        const section = container.closest('.rankings-section');
        section.classList.add('too-low-damage');

        // Get active fight time in seconds (convert from minutes)
        const activeFightTimeSeconds = (this.raidStats.stats && this.raidStats.stats.activeFightTime) 
            ? this.raidStats.stats.activeFightTime * 60 
            : null;

        if (!activeFightTimeSeconds) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Active fight time not available</p>
                </div>
            `;
            return;
        }

        // Filter players by primary role - only show DPS players
        let filteredPlayers = players;
        if (this.primaryRoles) {
            console.log(`🎯 [TOO LOW DAMAGE] Filtering ${players.length} players by primary role`);
            filteredPlayers = players.filter(player => {
                const playerName = player.character_name.toLowerCase();
                const primaryRole = this.primaryRoles[playerName];
                const isDPS = primaryRole === 'dps';
                
                if (!isDPS && primaryRole) {
                    console.log(`🚫 [TOO LOW DAMAGE] Excluding ${player.character_name} (primary role: ${primaryRole})`);
                }
                
                return isDPS;
            });
            console.log(`✅ [TOO LOW DAMAGE] Filtered to ${filteredPlayers.length} DPS players`);
        } else {
            console.log('⚠️ [TOO LOW DAMAGE] No primary roles data available, showing all players');
        }

        // Calculate DPS and filter players with penalty points
        const playersWithPenalties = filteredPlayers.map(player => {
            const damage = parseFloat(player.damage_amount) || 0;
            const dps = damage / activeFightTimeSeconds;
            
            let points = 0;
            if (dps < 150) {
                points = -100;
            } else if (dps < 200) {
                points = -50;
            } else if (dps < 250) {
                points = -25;
            }

            return {
                ...player,
                dps: dps,
                points: points
            };
        }).filter(player => player.points < 0) // Only show players with penalties
          .sort((a, b) => a.dps - b.dps); // Sort by DPS ascending (worst first)

        if (playersWithPenalties.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-thumbs-up"></i>
                    <p>All damage dealers have adequate DPS!</p>
                </div>
            `;
            return;
        }

        // Get max DPS for percentage calculation (use highest DPS even if it's low)
        const maxDPS = Math.max(...playersWithPenalties.map(p => p.dps), 1);

        container.innerHTML = playersWithPenalties.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const formattedDamage = this.formatNumber(parseInt(player.damage_amount) || 0);
            const fillPercentage = Math.max(5, (player.dps / maxDPS) * 100); // Minimum 5% for visibility
            
            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getSpecIconHtml(player.spec_name, player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${formattedDamage} damage (${player.dps.toFixed(1)} DPS)">
                            ${this.truncateWithTooltip(`${player.dps.toFixed(1)} DPS`).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.dps.toFixed(1)} damage per second">
                        <div class="amount-value negative">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    displayTooLowHealingRankings(players) {
        const container = document.getElementById('too-low-healing-list');
        const section = container.closest('.rankings-section');
        section.classList.add('too-low-healing');

        // Get active fight time in seconds (convert from minutes)
        const activeFightTimeSeconds = (this.raidStats.stats && this.raidStats.stats.activeFightTime) 
            ? this.raidStats.stats.activeFightTime * 60 
            : null;

        if (!activeFightTimeSeconds) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Active fight time not available</p>
                </div>
            `;
            return;
        }

        // Filter players by primary role - only show healer players
        let filteredPlayers = players;
        if (this.primaryRoles) {
            console.log(`🎯 [TOO LOW HEALING] Filtering ${players.length} players by primary role`);
            filteredPlayers = players.filter(player => {
                const playerName = player.character_name.toLowerCase();
                const primaryRole = this.primaryRoles[playerName];
                const isHealer = primaryRole === 'healer';
                
                if (!isHealer && primaryRole) {
                    console.log(`🚫 [TOO LOW HEALING] Excluding ${player.character_name} (primary role: ${primaryRole})`);
                }
                
                return isHealer;
            });
            console.log(`✅ [TOO LOW HEALING] Filtered to ${filteredPlayers.length} healer players`);
        } else {
            console.log('⚠️ [TOO LOW HEALING] No primary roles data available, showing all players');
        }

        // Calculate HPS and filter players with penalty points
        const playersWithPenalties = filteredPlayers.map(player => {
            const healing = parseFloat(player.healing_amount) || 0;
            const hps = healing / activeFightTimeSeconds;
            
            let points = 0;
            if (hps < 85) {
                points = -100;
            } else if (hps < 100) {
                points = -50;
            } else if (hps < 125) {
                points = -25;
            }

            return {
                ...player,
                hps: hps,
                points: points
            };
        }).filter(player => player.points < 0) // Only show players with penalties
          .sort((a, b) => a.hps - b.hps); // Sort by HPS ascending (worst first)

        if (playersWithPenalties.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-thumbs-up"></i>
                    <p>All healers have adequate HPS!</p>
                </div>
            `;
            return;
        }

        // Get max HPS for percentage calculation (use highest HPS even if it's low)
        const maxHPS = Math.max(...playersWithPenalties.map(p => p.hps), 1);

        container.innerHTML = playersWithPenalties.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const formattedHealing = this.formatNumber(parseInt(player.healing_amount) || 0);
            const fillPercentage = Math.max(5, (player.hps / maxHPS) * 100); // Minimum 5% for visibility
            
            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getSpecIconHtml(player.spec_name, player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${formattedHealing} healing (${player.hps.toFixed(1)} HPS)">
                            ${this.truncateWithTooltip(`${player.hps.toFixed(1)} HPS`).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.hps.toFixed(1)} healing per second">
                        <div class="amount-value negative">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    displayShamanHealers(healers) {
        const container = document.getElementById('shaman-healers-list');
        const section = container.closest('.rankings-section');
        
        // Filter shamans and take top 3
        const shamanHealers = healers
            .filter(player => {
                const className = (player.character_class || '').toLowerCase();
                return className.includes('shaman');
            })
            .slice(0, 3); // Top 3 shamans

        if (shamanHealers.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        section.classList.add('shaman-healers');

        const pointsArray = [25, 20, 15]; // Points for positions 1, 2, 3
        const maxHealing = parseInt(shamanHealers[0].healing_amount) || 1;

        container.innerHTML = shamanHealers.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const formattedHealing = this.formatNumber(parseInt(player.healing_amount) || 0);
            const playerHealing = parseInt(player.healing_amount) || 0;
            const fillPercentage = Math.max(5, (playerHealing / maxHealing) * 100);
            const points = pointsArray[index] || 0;

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getSpecIconHtml(player.spec_name, player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${formattedHealing} healing">
                            ${this.truncateWithTooltip(`${formattedHealing} healing`).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${(parseInt(player.healing_amount) || 0).toLocaleString()} healing">
                        <div class="amount-value">${points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    displayPriestHealers(healers) {
        const container = document.getElementById('priest-healers-list');
        const section = container.closest('.rankings-section');
        
        // Filter priests and take top 2
        const priestHealers = healers
            .filter(player => {
                const className = (player.character_class || '').toLowerCase();
                return className.includes('priest');
            })
            .slice(0, 2); // Top 2 priests

        if (priestHealers.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        section.classList.add('priest-healers');

        const pointsArray = [20, 15]; // Points for positions 1, 2
        const maxHealing = parseInt(priestHealers[0].healing_amount) || 1;

        container.innerHTML = priestHealers.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const formattedHealing = this.formatNumber(parseInt(player.healing_amount) || 0);
            const playerHealing = parseInt(player.healing_amount) || 0;
            const fillPercentage = Math.max(5, (playerHealing / maxHealing) * 100);
            const points = pointsArray[index] || 0;

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getSpecIconHtml(player.spec_name, player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${formattedHealing} healing">
                            ${this.truncateWithTooltip(`${formattedHealing} healing`).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${(parseInt(player.healing_amount) || 0).toLocaleString()} healing">
                        <div class="amount-value">${points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    displayDruidHealers(healers) {
        const container = document.getElementById('druid-healers-list');
        const section = container.closest('.rankings-section');
        
        // Filter druids and take top 1
        const druidHealers = healers
            .filter(player => {
                const className = (player.character_class || '').toLowerCase();
                return className.includes('druid');
            })
            .slice(0, 1); // Top 1 druid

        if (druidHealers.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        section.classList.add('druid-healers');

        const pointsArray = [15]; // Points for position 1
        const maxHealing = parseInt(druidHealers[0].healing_amount) || 1;

        container.innerHTML = druidHealers.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const formattedHealing = this.formatNumber(parseInt(player.healing_amount) || 0);
            const playerHealing = parseInt(player.healing_amount) || 0;
            const fillPercentage = 100; // Always 100% since it's the top druid
            const points = pointsArray[index] || 0;

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getSpecIconHtml(player.spec_name, player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${formattedHealing} healing">
                            ${this.truncateWithTooltip(`${formattedHealing} healing`).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${(parseInt(player.healing_amount) || 0).toLocaleString()} healing">
                        <div class="amount-value">${points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    displayAbilitiesRankings(players) {
        const container = document.getElementById('abilities-list');
        const section = container.closest('.rankings-section');
        section.classList.add('abilities');

        // Filter out players with 0 abilities used and sort by total_used (highest first)
        const playersWithAbilities = players.filter(player => player.total_used > 0)
            .sort((a, b) => b.total_used - a.total_used);

        if (playersWithAbilities.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-bomb"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max abilities used for percentage calculation
        const maxAbilities = Math.max(...playersWithAbilities.map(p => p.total_used)) || 1;

        container.innerHTML = playersWithAbilities.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.total_used / maxAbilities) * 100); // Minimum 5% for visibility

            // Create breakdown of abilities used
            const abilities = [];
            if (player.dense_dynamite > 0) abilities.push(`${player.dense_dynamite} Dynamite`);
            if (player.goblin_sapper_charge > 0) abilities.push(`${player.goblin_sapper_charge} Sappers`);
            if (player.stratholme_holy_water > 0) abilities.push(`${player.stratholme_holy_water} Holy Water`);
            
            const abilitiesText = abilities.join(', ') || 'No abilities used';

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${abilitiesText}">
                            ${this.truncateWithTooltip(abilitiesText).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="Total: ${player.total_used} abilities, Avg targets: ${player.avg_targets_hit.toFixed(1)}">
                        <div class="amount-value">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateAbilitiesHeader() {
        const headerElement = document.querySelector('.abilities-section .section-header p');
        if (headerElement && this.abilitiesSettings) {
            const { calculation_divisor, max_points } = this.abilitiesSettings;
            headerElement.textContent = `Ranked by calculated points (abilities used × avg targets ÷ ${calculation_divisor}, max ${max_points})`;
        }
    }

    displayWorldBuffsRankings(players) {
        const container = document.getElementById('world-buffs-list');
        const section = container.closest('.rankings-section');
        section.classList.add('world-buffs');

        // Filter to only show players with fewer than 6 buffs
        const playersWithMissingBuffs = players.filter(player => 
            player.total_buffs < 6
        );

        // Sort players by points (highest first, least negative), then by total buffs
        const sortedPlayers = [...playersWithMissingBuffs].sort((a, b) => {
            if (b.points !== a.points) {
                return b.points - a.points; // Higher points first (less negative)
            }
            return b.total_buffs - a.total_buffs; // Then by total buffs
        });

        // Calculate max buffs for progress bar (highest buff count in the raid)
        const maxBuffsInRaid = Math.max(...players.map(p => p.total_buffs), 1);

        if (sortedPlayers.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-magic"></i>
                    <p>All players have 6+ buffs!</p>
                </div>
            `;
            return;
        }

        // Update header text based on required buffs
        this.updateWorldBuffsHeader();

        console.log(`🌍 [WORLD BUFFS] Displaying ${sortedPlayers.length} players with missing buffs (max buffs in raid: ${maxBuffsInRaid})`);
        
        container.innerHTML = sortedPlayers.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class || 'unknown');
            
            // Calculate fill percentage based on buff count vs max in raid (for progress bar)
            const fillPercentage = Math.max(5, (player.total_buffs / maxBuffsInRaid) * 100);
            
            console.log(`🌍 [WORLD BUFFS] ${player.character_name}: class=${player.character_class} -> normalized=${characterClass}, buffs=${player.total_buffs}/${maxBuffsInRaid}, fill=${fillPercentage}%`);
            
            // Determine buff count status for styling
            let buffCountClass = 'buff-count';
            if (player.total_buffs < this.worldBuffsRequiredBuffs - 2) {
                buffCountClass += ' low';
            } else if (player.total_buffs < this.worldBuffsRequiredBuffs) {
                buffCountClass += ' medium';
            } else {
                buffCountClass += ' high';
            }

            // Create missing buffs text
            let missingBuffsText = '';
            if (player.missing_buffs && player.missing_buffs.length > 0) {
                console.log(`🌍 [FRONTEND] ${player.character_name} has missing_buffs:`, player.missing_buffs, 'includeDMF:', this.worldBuffsIncludeDMF);
                const shortNames = player.missing_buffs
                    .filter(buff => {
                        // Only show DMF as missing if at least 10 players have it
                        if (buff === 'DMF') {
                            console.log(`🌍 [FRONTEND] Player ${player.character_name} missing DMF, includeDMF: ${this.worldBuffsIncludeDMF}`);
                            return this.worldBuffsIncludeDMF;
                        }
                        return true;
                    })
                    .map(buff => {
                        // Map category names to display names
                        switch(buff) {
                            case 'Ony': return 'Ony';
                            case 'Rend': return 'Rend';
                            case 'ZG': return 'ZG';
                            case 'Songflower': return 'Songflower';
                            case 'DM Tribute': return 'DM Tribute';
                            case 'DMF': return 'DMF';
                            default: return buff;
                        }
                    });
                
                if (shortNames.length > 0) {
                    missingBuffsText = `Missing: ${shortNames.join(', ')}`;
                }
            }

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name class-${characterClass}">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details">
                            <div class="${buffCountClass}">${player.total_buffs} buffs</div>
                            ${missingBuffsText ? `<div class="buff-details missing-buffs">${missingBuffsText}</div>` : ''}
                        </div>
                    </div>
                    <div class="performance-amount" title="Points: ${player.points} (${player.points < 0 ? player.points / -10 : 0} missing buffs)">
                        <div class="amount-value ${player.points < 0 ? 'negative' : ''}">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateWorldBuffsHeader() {
        const headerElement = document.getElementById('world-buffs-header-text');
        if (headerElement && this.worldBuffsRequiredBuffs) {
            headerElement.textContent = `Points for missing world buffs (-10 per buff below ${this.worldBuffsRequiredBuffs})`;
        }
    }

    displayFrostResistanceRankings(players) {
        const container = document.getElementById('frost-resistance-list');
        if (!container) return;
        
        const section = container.closest('.rankings-section');
        section.classList.add('frost-resistance-section');

        // Filter players by primary role - only show DPS players
        let filteredPlayers = players;
        if (this.primaryRoles) {
            console.log(`🧊 [FROST RESISTANCE] Filtering ${players.length} players by primary role`);
            filteredPlayers = players.filter(player => {
                const playerName = player.character_name.toLowerCase();
                const primaryRole = this.primaryRoles[playerName];
                const isDPS = primaryRole === 'dps';
                
                if (!isDPS && primaryRole) {
                    console.log(`🚫 [FROST RESISTANCE] Excluding ${player.character_name} (primary role: ${primaryRole})`);
                }
                
                return isDPS;
            });
            console.log(`✅ [FROST RESISTANCE] Filtered to ${filteredPlayers.length} DPS players`);
        } else {
            console.log('⚠️ [FROST RESISTANCE] No primary roles data available, showing all players');
        }

        // Show the section if we have data
        if (filteredPlayers.length > 0) {
            section.style.display = 'block';
        } else {
            section.style.display = 'none';
            return;
        }

        // Filter out players with 0 points for display, but keep all players for progress calculations
        const playersToDisplay = filteredPlayers.filter(player => player.points !== 0);
        
        // Use all filtered players (including 0-point players) to calculate max frost resistance for progress bars
        const maxFrostResForProgress = Math.max(...filteredPlayers.map(p => p.frost_resistance), 1);
        
        console.log(`🧊 [FROST RESISTANCE] Total DPS players: ${filteredPlayers.length}, Displaying: ${playersToDisplay.length} (excluding 0-point players)`);
        console.log(`🧊 [FROST RESISTANCE] Max frost resistance for progress bars: ${maxFrostResForProgress}`);
        
        if (playersToDisplay.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-snowflake"></i>
                    <p>All DPS players have adequate frost resistance!</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = playersToDisplay.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class || 'unknown');
            
            // Recalculate progress percentage using all players' max frost resistance (including 0-point players)
            const fillPercentage = Math.max(5, maxFrostResForProgress > 0 ? Math.round((player.frost_resistance / maxFrostResForProgress) * 100) : 0);
            
            console.log(`🧊 [FROST RESISTANCE] ${player.character_name}: class=${player.character_class} -> normalized=${characterClass}, frost_res=${player.frost_resistance}, fill=${fillPercentage}%, type=${player.dps_type}`);
            
            // Determine frost resistance status for styling
            let frostResClass = 'frost-res-amount';
            const isPhysical = player.dps_type === 'physical';
            const isCaster = player.dps_type === 'caster';
            
            if (isPhysical) {
                if (player.frost_resistance < 80) {
                    frostResClass += ' very-low';
                } else if (player.frost_resistance < 130) {
                    frostResClass += ' low';
                } else {
                    frostResClass += ' good';
                }
            } else if (isCaster) {
                if (player.frost_resistance < 80) {
                    frostResClass += ' very-low';
                } else if (player.frost_resistance < 150) {
                    frostResClass += ' low';
                } else {
                    frostResClass += ' good';
                }
            }

            // Create DPS type and threshold info
            const thresholdInfo = isPhysical ? 
                `Physical DPS (130+ recommended)` : 
                `Caster DPS (150+ recommended)`;

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name class-${characterClass}">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details">
                            <div class="${frostResClass}">${player.frost_resistance} frost resistance</div>
                            <div class="frost-res-details">${thresholdInfo}</div>
                        </div>
                    </div>
                    <div class="performance-amount" title="Points: ${player.points} (${player.dps_type} DPS)">
                        <div class="amount-value ${player.points < 0 ? 'negative' : ''}">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateFrostResistanceHeader() {
        const headerElement = document.getElementById('frost-resistance-header-text');
        if (headerElement) {
            headerElement.textContent = `Points for frost resistance (Physical: -5 <130, -10 <80 | Caster: -5 <150, -10 <80)`;
        }
    }

    updateArchiveButtons() {
        // Update World Buffs archive button
        const worldBuffsButton = document.getElementById('world-buffs-archive-button');
        if (worldBuffsButton) {
            if (this.worldBuffsArchiveUrl) {
                worldBuffsButton.classList.remove('disabled');
                worldBuffsButton.onclick = () => window.open(this.worldBuffsArchiveUrl, '_blank');
                worldBuffsButton.title = 'View archived World Buffs sheet';
                console.log(`🌍 World Buffs archive button enabled with URL: ${this.worldBuffsArchiveUrl}`);
            } else {
                worldBuffsButton.classList.add('disabled');
                worldBuffsButton.onclick = null;
                worldBuffsButton.title = 'No archived World Buffs sheet found for this event';
                console.log(`🌍 World Buffs archive button disabled - no URL found`);
            }
        }

        // Update Frost Resistance archive button
        const frostResButton = document.getElementById('frost-resistance-archive-button');
        if (frostResButton) {
            if (this.frostResistanceArchiveUrl) {
                frostResButton.classList.remove('disabled');
                frostResButton.onclick = () => window.open(this.frostResistanceArchiveUrl, '_blank');
                frostResButton.title = 'View archived Frost Resistance sheet';
                console.log(`🧊 Frost Resistance archive button enabled with URL: ${this.frostResistanceArchiveUrl}`);
            } else {
                frostResButton.classList.add('disabled');
                frostResButton.onclick = null;
                frostResButton.title = 'No archived Frost Resistance sheet found for this event';
                console.log(`🧊 Frost Resistance archive button disabled - no URL found`);
            }
        }
    }

    displayManaPotionsRankings(players) {
        const container = document.getElementById('mana-potions-list');
        const section = container.closest('.rankings-section');
        section.classList.add('mana-potions');

        // Filter out players with 0 potions used and sort by potions_used (highest first)
        const playersWithPotions = players.filter(player => player.potions_used > 0)
            .sort((a, b) => b.potions_used - a.potions_used);

        if (playersWithPotions.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-flask"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max potions used for percentage calculation
        const maxPotions = Math.max(...playersWithPotions.map(p => p.potions_used)) || 1;

        container.innerHTML = playersWithPotions.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.potions_used / maxPotions) * 100); // Minimum 5% for visibility

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${player.potions_used} potions used (${player.extra_potions} above threshold)">
                            ${this.truncateWithTooltip(`${player.potions_used} potions used (${player.extra_potions} above threshold)`).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.potions_used} potions used, ${player.extra_potions} above threshold of ${this.manaPotionsSettings.threshold}">
                        <div class="amount-value">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateManaPotionsHeader() {
        const headerElement = document.querySelector('.mana-potions-section .section-header p');
        if (headerElement && this.manaPotionsSettings) {
            const { threshold, points_per_potion, max_points } = this.manaPotionsSettings;
            headerElement.textContent = `Ranked by points (${points_per_potion} pts per potion above ${threshold}, max ${max_points})`;
        }
    }

    displayRunesRankings(players) {
        const container = document.getElementById('runes-list');
        const section = container.closest('.rankings-section');
        section.classList.add('runes');

        // Filter out players with 0 runes used and sort by total_runes (highest first)
        const playersWithRunes = players.filter(player => player.total_runes > 0)
            .sort((a, b) => b.total_runes - a.total_runes);

        if (playersWithRunes.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-magic"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max runes used for percentage calculation
        const maxRunes = Math.max(...playersWithRunes.map(p => p.total_runes)) || 1;

        container.innerHTML = playersWithRunes.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.total_runes / maxRunes) * 100); // Minimum 5% for visibility

            // Create breakdown of runes used
            const runes = [];
            if (player.dark_runes > 0) runes.push(`${player.dark_runes} Dark`);
            if (player.demonic_runes > 0) runes.push(`${player.demonic_runes} Demonic`);
            
            const runesText = runes.join(', ') || 'No runes used';

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${runesText} (${player.total_runes} total)">
                            ${this.truncateWithTooltip(`${runesText} (${player.total_runes} total)`).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.total_runes} runes used (${Math.floor(player.total_runes / this.runesSettings.usage_divisor)} divisions)">
                        <div class="amount-value">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateRunesHeader() {
        const headerElement = document.querySelector('.runes-section .section-header p');
        if (headerElement && this.runesSettings) {
            const { usage_divisor, points_per_division } = this.runesSettings;
            const pointsText = points_per_division === 1 ? 'pt' : 'pts';
            const runesText = usage_divisor === 1 ? 'rune' : 'runes';
            headerElement.textContent = `Ranked by points (${points_per_division} ${pointsText} per ${usage_divisor} ${runesText})`;
        }
    }

    displayInterruptsRankings(players) {
        const container = document.getElementById('interrupts-list');
        const section = container.closest('.rankings-section');
        section.classList.add('interrupts');

        // Filter out players with 0 interrupts and sort by interrupts_used (highest first)
        const playersWithInterrupts = players.filter(player => player.interrupts_used > 0)
            .sort((a, b) => b.interrupts_used - a.interrupts_used);

        if (playersWithInterrupts.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-hand-paper"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max interrupts for percentage calculation
        const maxInterrupts = Math.max(...playersWithInterrupts.map(p => p.interrupts_used)) || 1;

        container.innerHTML = playersWithInterrupts.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.interrupts_used / maxInterrupts) * 100); // Minimum 5% for visibility

            const interruptsText = `${player.interrupts_used} interrupts`;

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${interruptsText}">
                            ${this.truncateWithTooltip(interruptsText).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.interrupts_used} interrupts (max ${this.interruptsSettings.max_points} points)">
                        <div class="amount-value">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateInterruptsHeader() {
        const headerElement = document.querySelector('.interrupts-section .section-header p');
        if (headerElement && this.interruptsSettings) {
            const { points_per_interrupt, interrupts_needed, max_points } = this.interruptsSettings;
            const pointsText = points_per_interrupt === 1 ? 'pt' : 'pts';
            const interruptsText = interrupts_needed === 1 ? 'interrupt' : 'interrupts';
            headerElement.textContent = `Ranked by points (${points_per_interrupt} ${pointsText} per ${interrupts_needed} ${interruptsText}, max ${max_points})`;
        }
    }

    displayDisarmsRankings(players) {
        const container = document.getElementById('disarms-list');
        const section = container.closest('.rankings-section');
        section.classList.add('disarms');

        // Filter out players with 0 disarms and sort by disarms_used (highest first)
        const playersWithDisarms = players.filter(player => player.disarms_used > 0)
            .sort((a, b) => b.disarms_used - a.disarms_used);

        if (playersWithDisarms.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-shield-alt"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max disarms for percentage calculation
        const maxDisarms = Math.max(...playersWithDisarms.map(p => p.disarms_used)) || 1;

        container.innerHTML = playersWithDisarms.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.disarms_used / maxDisarms) * 100); // Minimum 5% for visibility

            const disarmsText = `${player.disarms_used} disarms`;

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${disarmsText}">
                            ${this.truncateWithTooltip(disarmsText).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.disarms_used} disarms (max ${this.disarmsSettings.max_points} points)">
                        <div class="amount-value">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateDisarmsHeader() {
        const headerElement = document.querySelector('.disarms-section .section-header p');
        if (headerElement && this.disarmsSettings) {
            const { points_per_disarm, disarms_needed, max_points } = this.disarmsSettings;
            const pointsText = points_per_disarm === 1 ? 'pt' : 'pts';
            const disarmsText = disarms_needed === 1 ? 'disarm' : 'disarms';
            headerElement.textContent = `Ranked by points (${points_per_disarm} ${pointsText} per ${disarms_needed} ${disarmsText}, max ${max_points})`;
        }
    }

    displaySunderRankings(players) {
        const container = document.getElementById('sunder-list');
        const section = container.closest('.rankings-section');
        section.classList.add('sunder');

        // Filter out players with 0 or negative points for display, but show all non-zero
        const playersWithPoints = players.filter(player => player.points !== 0);

        if (playersWithPoints.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-shield-virus"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max sunder count for percentage calculation
        const maxSunderCount = Math.max(...playersWithPoints.map(p => p.sunder_count)) || 1;

        container.innerHTML = playersWithPoints.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.sunder_count / maxSunderCount) * 100); // Minimum 5% for visibility

            const sunderText = `${player.sunder_count} sunders (${player.raw_value})`;
            
            // Determine point color based on the range color
            let pointColor = '#ff6b35'; // default
            if (player.color === 'red') pointColor = '#dc3545';
            else if (player.color === 'gray') pointColor = '#6c757d';
            else if (player.color === 'green') pointColor = '#28a745';
            else if (player.color === 'blue') pointColor = '#007bff';

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${sunderText}">
                            ${this.truncateWithTooltip(sunderText).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.sunder_count} sunders applied">
                        <div class="amount-value" style="color: ${pointColor}">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateSunderHeader() {
        const headerElement = document.querySelector('.sunder-section .section-header p');
        if (headerElement && this.sunderSettings && this.sunderSettings.point_ranges) {
            const ranges = this.sunderSettings.point_ranges;
            if (ranges.length > 0) {
                // Create a summary of ranges
                const rangeTexts = ranges.map(r => {
                    if (r.min === 0 && r.max < 50) return `<${r.max + 1}: ${r.points}pts`;
                    if (r.max >= 999) return `${r.min}+: ${r.points}pts`;
                    return `${r.min}-${r.max}: ${r.points}pts`;
                });
                headerElement.textContent = `Ranked by points (${rangeTexts.join(', ')})`;
            }
        }
    }

    displayCurseRankings(players) {
        const container = document.getElementById('curse-recklessness-list');
        const section = container.closest('.rankings-section');
        section.classList.add('curse', 'curse-recklessness');

        // Filter out players with 0 points and sort by uptime percentage (highest first)
        const playersWithUptime = players.filter(player => player.uptime_percentage >= 0)
            .sort((a, b) => b.uptime_percentage - a.uptime_percentage);

        if (playersWithUptime.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-magic"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max uptime for percentage calculation
        const maxUptime = Math.max(...playersWithUptime.map(p => p.uptime_percentage)) || 1;

        container.innerHTML = playersWithUptime.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.uptime_percentage / maxUptime) * 100); // Minimum 5% for visibility

            const uptimeText = `${player.uptime_percentage.toFixed(1)}% uptime`;
            
            // Determine point color based on uptime threshold
            let pointColor = '#ff6b35'; // default
            if (player.points > 0) pointColor = '#28a745'; // green for points earned
            else pointColor = '#dc3545'; // red for no points

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${uptimeText}">
                            ${this.truncateWithTooltip(uptimeText).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.uptime_percentage.toFixed(1)}% uptime (threshold: ${this.curseSettings.uptime_threshold}%)">
                        <div class="amount-value" style="color: ${pointColor}">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateCurseHeader() {
        const headerElement = document.querySelector('.curse-recklessness-section .section-header p');
        if (headerElement && this.curseSettings) {
            const { uptime_threshold, points } = this.curseSettings;
            headerElement.textContent = `Ranked by points (>${uptime_threshold}% uptime: ${points}pts)`;
        }
    }

    displayCurseShadowRankings(players) {
        const container = document.getElementById('curse-shadow-list');
        const section = container.closest('.rankings-section');
        section.classList.add('curse', 'curse-shadow');

        // Filter out players with 0 points and sort by uptime percentage (highest first)
        const playersWithUptime = players.filter(player => player.uptime_percentage >= 0)
            .sort((a, b) => b.uptime_percentage - a.uptime_percentage);

        if (playersWithUptime.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-magic"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max uptime for percentage calculation
        const maxUptime = Math.max(...playersWithUptime.map(p => p.uptime_percentage)) || 1;

        container.innerHTML = playersWithUptime.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.uptime_percentage / maxUptime) * 100); // Minimum 5% for visibility

            const uptimeText = `${player.uptime_percentage.toFixed(1)}% uptime`;
            
            // Determine point color based on uptime threshold
            let pointColor = '#ff6b35'; // default
            if (player.points > 0) pointColor = '#28a745'; // green for points earned
            else pointColor = '#dc3545'; // red for no points

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${uptimeText}">
                            ${this.truncateWithTooltip(uptimeText).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.uptime_percentage.toFixed(1)}% uptime (threshold: ${this.curseShadowSettings.uptime_threshold}%)">
                        <div class="amount-value" style="color: ${pointColor}">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateCurseShadowHeader() {
        const headerElement = document.querySelector('.curse-shadow-section .section-header p');
        if (headerElement && this.curseShadowSettings) {
            const { uptime_threshold, points } = this.curseShadowSettings;
            headerElement.textContent = `Ranked by points (>${uptime_threshold}% uptime: ${points}pts)`;
        }
    }

    displayCurseElementsRankings(players) {
        const container = document.getElementById('curse-elements-list');
        const section = container.closest('.rankings-section');
        section.classList.add('curse', 'curse-elements');

        // Filter out players with 0 points and sort by uptime percentage (highest first)
        const playersWithUptime = players.filter(player => player.uptime_percentage >= 0)
            .sort((a, b) => b.uptime_percentage - a.uptime_percentage);

        if (playersWithUptime.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-magic"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max uptime for percentage calculation
        const maxUptime = Math.max(...playersWithUptime.map(p => p.uptime_percentage)) || 1;

        container.innerHTML = playersWithUptime.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.uptime_percentage / maxUptime) * 100); // Minimum 5% for visibility

            const uptimeText = `${player.uptime_percentage.toFixed(1)}% uptime`;
            
            // Determine point color based on uptime threshold
            let pointColor = '#ff6b35'; // default
            if (player.points > 0) pointColor = '#28a745'; // green for points earned
            else pointColor = '#dc3545'; // red for no points

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${uptimeText}">
                            ${this.truncateWithTooltip(uptimeText).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.uptime_percentage.toFixed(1)}% uptime (threshold: ${this.curseElementsSettings.uptime_threshold}%)">
                        <div class="amount-value" style="color: ${pointColor}">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateCurseElementsHeader() {
        const headerElement = document.querySelector('.curse-elements-section .section-header p');
        if (headerElement && this.curseElementsSettings) {
            const { uptime_threshold, points } = this.curseElementsSettings;
            headerElement.textContent = `Ranked by points (>${uptime_threshold}% uptime: ${points}pts)`;
        }
    }

    displayFaerieFireRankings(players) {
        const container = document.getElementById('faerie-fire-list');
        const section = container.closest('.rankings-section');
        section.classList.add('curse', 'faerie-fire');

        // Filter out players with 0 points and sort by uptime percentage (highest first)
        const playersWithUptime = players.filter(player => player.uptime_percentage >= 0)
            .sort((a, b) => b.uptime_percentage - a.uptime_percentage);

        if (playersWithUptime.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-magic"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max uptime for percentage calculation
        const maxUptime = Math.max(...playersWithUptime.map(p => p.uptime_percentage)) || 1;

        container.innerHTML = playersWithUptime.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.uptime_percentage / maxUptime) * 100); // Minimum 5% for visibility

            const uptimeText = `${player.uptime_percentage.toFixed(1)}% uptime`;
            
            // Determine point color based on uptime threshold
            let pointColor = '#ff6b35'; // default
            if (player.points > 0) pointColor = '#28a745'; // green for points earned
            else pointColor = '#dc3545'; // red for no points

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${uptimeText}">
                            ${this.truncateWithTooltip(uptimeText).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.uptime_percentage.toFixed(1)}% uptime (threshold: ${this.faerieFireSettings.uptime_threshold}%)">
                        <div class="amount-value" style="color: ${pointColor}">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateFaerieFireHeader() {
        const headerElement = document.querySelector('.faerie-fire-section .section-header p');
        if (headerElement && this.faerieFireSettings) {
            const { uptime_threshold, points } = this.faerieFireSettings;
            headerElement.textContent = `Ranked by points (>${uptime_threshold}% uptime: ${points}pts)`;
        }
    }

    displayScorchRankings(players) {
        const container = document.getElementById('scorch-list');
        const section = container.closest('.rankings-section');
        section.classList.add('scorch');

        // Filter out players with negative scorch count and sort by scorch count (highest first)
        const playersWithScorch = players.filter(player => player.scorch_count >= 0)
            .sort((a, b) => b.scorch_count - a.scorch_count);

        if (playersWithScorch.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-fire"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max scorch count for percentage calculation
        const maxScorch = Math.max(...playersWithScorch.map(p => p.scorch_count)) || 1;

        container.innerHTML = playersWithScorch.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.scorch_count / maxScorch) * 100); // Minimum 5% for visibility

            const scorchText = `${player.scorch_count} scorches`;
            
            // Determine point color based on scorch tiers
            let pointColor = '#dc3545'; // red for 0 points
            if (player.points > 5) pointColor = '#28a745'; // green for 10pts
            else if (player.points > 0) pointColor = '#ffc107'; // yellow for 5pts

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${scorchText}">
                            ${this.truncateWithTooltip(scorchText).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.scorch_count} scorches (tiers: 0-${this.scorchSettings.tier1_max}: ${this.scorchSettings.tier1_points}pts, ${this.scorchSettings.tier1_max + 1}-${this.scorchSettings.tier2_max}: ${this.scorchSettings.tier2_points}pts, ${this.scorchSettings.tier2_max + 1}+: ${this.scorchSettings.tier3_points}pts)">
                        <div class="amount-value" style="color: ${pointColor}">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateScorchHeader() {
        const headerElement = document.querySelector('.scorch-section .section-header p');
        if (headerElement && this.scorchSettings) {
            const { tier1_max, tier1_points, tier2_max, tier2_points, tier3_points } = this.scorchSettings;
            headerElement.textContent = `Ranked by points (0-${tier1_max}: ${tier1_points}pts, ${tier1_max + 1}-${tier2_max}: ${tier2_points}pts, ${tier2_max + 1}+: ${tier3_points}pts)`;
        }
    }

    displayDemoShoutRankings(players) {
        const container = document.getElementById('demo-shout-list');
        const section = container.closest('.rankings-section');
        section.classList.add('demo-shout');

        // Filter out players with less than 10 demo shouts and sort by demo shout count (highest first)
        const playersWithDemoShout = players.filter(player => player.demo_shout_count >= 10)
            .sort((a, b) => b.demo_shout_count - a.demo_shout_count);

        if (playersWithDemoShout.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-shield-alt"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max demo shout count for percentage calculation
        const maxDemoShout = Math.max(...playersWithDemoShout.map(p => p.demo_shout_count)) || 1;

        container.innerHTML = playersWithDemoShout.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.demo_shout_count / maxDemoShout) * 100); // Minimum 5% for visibility

            const demoShoutText = `${player.demo_shout_count} demo shouts`;
            
            // Determine point color based on demo shout tiers
            let pointColor = '#dc3545'; // red for 0 points
            if (player.points > 5) pointColor = '#28a745'; // green for 10pts
            else if (player.points > 0) pointColor = '#ffc107'; // yellow for 5pts

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${demoShoutText}">
                            ${this.truncateWithTooltip(demoShoutText).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.demo_shout_count} demoralizing shouts (tiers: 0-${this.demoShoutSettings.tier1_max}: ${this.demoShoutSettings.tier1_points}pts, ${this.demoShoutSettings.tier1_max + 1}-${this.demoShoutSettings.tier2_max}: ${this.demoShoutSettings.tier2_points}pts, ${this.demoShoutSettings.tier2_max + 1}+: ${this.demoShoutSettings.tier3_points}pts)">
                        <div class="amount-value" style="color: ${pointColor}">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateDemoShoutHeader() {
        const headerElement = document.querySelector('.demo-shout-section .section-header p');
        if (headerElement && this.demoShoutSettings) {
            const { tier1_max, tier1_points, tier2_max, tier2_points, tier3_points } = this.demoShoutSettings;
            headerElement.textContent = `Ranked by points (0-${tier1_max}: ${tier1_points}pts, ${tier1_max + 1}-${tier2_max}: ${tier2_points}pts, ${tier2_max + 1}+: ${tier3_points}pts)`;
        }
    }

    displayPolymorphRankings(players) {
        const container = document.getElementById('polymorph-list');
        const section = container.closest('.rankings-section');
        section.classList.add('polymorph');

        // Filter out players with 0 polymorphs and sort by polymorphs used (highest first)
        const playersWithPolymorphs = players.filter(player => player.polymorphs_used > 0)
            .sort((a, b) => b.polymorphs_used - a.polymorphs_used);

        if (playersWithPolymorphs.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-magic"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max polymorphs for percentage calculation
        const maxPolymorphs = Math.max(...playersWithPolymorphs.map(p => p.polymorphs_used)) || 1;

        container.innerHTML = playersWithPolymorphs.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.polymorphs_used / maxPolymorphs) * 100); // Minimum 5% for visibility

            const polymorphText = `${player.polymorphs_used} polymorphs`;

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${polymorphText}">
                            ${this.truncateWithTooltip(polymorphText).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.polymorphs_used} polymorphs (${Math.floor(player.polymorphs_used / this.polymorphSettings.polymorphs_needed)} divisions, max ${this.polymorphSettings.max_points} points)">
                        <div class="amount-value">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updatePolymorphHeader() {
        const headerElement = document.querySelector('.polymorph-section .section-header p');
        if (headerElement && this.polymorphSettings) {
            const { points_per_division, polymorphs_needed, max_points } = this.polymorphSettings;
            const pointsText = points_per_division === 1 ? 'pt' : 'pts';
            const polymorphsText = polymorphs_needed === 1 ? 'polymorph' : 'polymorphs';
            headerElement.textContent = `Ranked by points (${points_per_division} ${pointsText} per ${polymorphs_needed} ${polymorphsText}, max ${max_points})`;
        }
    }

    displayPowerInfusionRankings(players) {
        const container = document.getElementById('power-infusion-list');
        const section = container.closest('.rankings-section');
        section.classList.add('power-infusion');

        // Filter out players with 0 infusions and sort by total infusions (highest first)
        const playersWithInfusions = players.filter(player => player.total_infusions > 0)
            .sort((a, b) => b.total_infusions - a.total_infusions);

        if (playersWithInfusions.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-bolt"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max infusions for percentage calculation
        const maxInfusions = Math.max(...playersWithInfusions.map(p => p.total_infusions)) || 1;

        container.innerHTML = playersWithInfusions.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.total_infusions / maxInfusions) * 100); // Minimum 5% for visibility

            // Create breakdown showing boss and trash separately
            const infusionBreakdown = [];
            if (player.boss_infusions > 0) infusionBreakdown.push(`${player.boss_infusions} on bosses`);
            if (player.trash_infusions > 0) infusionBreakdown.push(`${player.trash_infusions} on trash`);
            
            const infusionText = `${player.total_infusions} total (${infusionBreakdown.join(', ')})`;
            
            // Show raw values in tooltip for debugging
            const rawBreakdown = [];
            if (player.boss_raw) rawBreakdown.push(`Bosses: ${player.boss_raw}`);
            if (player.trash_raw) rawBreakdown.push(`Trash: ${player.trash_raw}`);
            const tooltipText = rawBreakdown.length > 0 ? `${infusionText} - Raw: ${rawBreakdown.join(', ')}` : infusionText;

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${tooltipText}">
                            ${this.truncateWithTooltip(infusionText).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${tooltipText}">
                        <div class="amount-value">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updatePowerInfusionHeader() {
        const headerElement = document.querySelector('.power-infusion-section .section-header p');
        if (headerElement && this.powerInfusionSettings) {
            const { points_per_division, infusions_needed, max_points } = this.powerInfusionSettings;
            const pointsText = points_per_division === 1 ? 'pt' : 'pts';
            const infusionsText = infusions_needed === 1 ? 'infusion' : 'infusions';
            headerElement.textContent = `Ranked by points (${points_per_division} ${pointsText} per ${infusions_needed} ${infusionsText}, max ${max_points}, excludes self-casts)`;
        }
    }

    displayDecursesRankings(players) {
        const container = document.getElementById('decurses-list');
        const section = container.closest('.rankings-section');
        section.classList.add('decurses');

        // Filter out players with 0 decurses and sort by decurses used (highest first)
        const playersWithDecurses = players.filter(player => player.decurses_used > 0)
            .sort((a, b) => b.decurses_used - a.decurses_used);

        if (playersWithDecurses.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-magic"></i>
                    <p>Nothing to see, move along</p>
                </div>
            `;
            return;
        }

        // Get max decurses for percentage calculation
        const maxDecurses = Math.max(...playersWithDecurses.map(p => p.decurses_used)) || 1;

        container.innerHTML = playersWithDecurses.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const fillPercentage = Math.max(5, (player.decurses_used / maxDecurses) * 100); // Minimum 5% for visibility

            const decursesText = `${player.decurses_used} decurses`;
            const differenceText = player.difference_from_average >= 0 ? 
                `+${player.difference_from_average.toFixed(1)} vs avg` : 
                `${player.difference_from_average.toFixed(1)} vs avg`;
            
            // Color points based on positive/negative
            let pointColor = '#ff6b35'; // default
            if (player.points > 0) pointColor = '#28a745'; // green for positive
            else if (player.points < 0) pointColor = '#dc3545'; // red for negative

            const tooltipText = `${decursesText} (${differenceText}, avg: ${this.decursesSettings.average_decurses.toFixed(1)})`;

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getClassIconHtml(player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${tooltipText}">
                            ${this.truncateWithTooltip(`${decursesText} (${differenceText})`).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${tooltipText}">
                        <div class="amount-value" style="color: ${pointColor}">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateDecursesHeader() {
        const headerElement = document.querySelector('.decurses-section .section-header p');
        if (headerElement && this.decursesSettings) {
            const { points_per_division, decurses_needed, max_points, min_points } = this.decursesSettings;
            const pointsText = points_per_division === 1 ? 'pt' : 'pts';
            const decursesText = decurses_needed === 1 ? 'decurse' : 'decurses';
            headerElement.textContent = `Ranked by average-based points (${points_per_division} ${pointsText} per ${decurses_needed} ${decursesText} vs avg, ${min_points} to +${max_points})`;
        }
    }

    displayVoidDamageRankings(players) {
        const container = document.getElementById('void-damage-list');
        const section = container.closest('.rankings-section');
        section.classList.add('void-damage');

        if (!players || players.length === 0) {
            container.innerHTML = `
                <div class="rankings-empty">
                    <i class="fas fa-shield-alt"></i>
                    <p>No players took avoidable void damage!</p>
                </div>
            `;
            return;
        }

        // Get max void damage for percentage calculation
        const maxVoidDamage = Math.max(...players.map(p => p.total_void_damage), 1);

        container.innerHTML = players.map((player, index) => {
            const position = index + 1;
            const characterClass = this.normalizeClassName(player.character_class);
            const formattedDamage = this.formatNumber(player.total_void_damage);
            const fillPercentage = Math.max(5, (player.total_void_damage / maxVoidDamage) * 100);
            
            // Show breakdown of void damage types
            const damageBreakdown = [];
            if (player.void_blast_damage > 0) {
                damageBreakdown.push(`Void Blast: ${this.formatNumber(player.void_blast_damage)}`);
            }
            if (player.void_zone_damage > 0) {
                damageBreakdown.push(`Void Zone: ${this.formatNumber(player.void_zone_damage)}`);
            }
            const breakdownText = damageBreakdown.join(', ');

            return `
                <div class="ranking-item">
                    <div class="ranking-position">
                        <span class="ranking-number">#${position}</span>
                    </div>
                    <div class="character-info class-${characterClass}" style="--fill-percentage: ${fillPercentage}%;">
                        <div class="character-name">
                            ${this.getSpecIconHtml(player.spec_name, player.character_class)}${player.character_name}
                        </div>
                        <div class="character-details" title="${formattedDamage} void damage">
                            ${formattedDamage} damage
                        </div>
                        <div class="void-details" title="${breakdownText}">
                            ${this.truncateWithTooltip(breakdownText, 30).displayText}
                        </div>
                    </div>
                    <div class="performance-amount" title="${player.total_void_damage.toLocaleString()} void damage taken">
                        <div class="amount-value negative">${player.points}</div>
                        <div class="points-label">points</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateVoidDamageHeader() {
        const headerElement = document.querySelector('.void-damage-section .section-header p');
        if (headerElement && this.voidDamageSettings) {
            const { void_blast_penalty, void_zone_penalty } = this.voidDamageSettings;
            headerElement.textContent = `Players who took damage from Void Blast (${void_blast_penalty} pts) or Void Zone (${void_zone_penalty} pts)`;
        }
    }

    normalizeClassName(className) {
        if (!className) return 'unknown';
        
        // Convert to lowercase and replace spaces with dashes
        let normalized = className.toLowerCase().replace(/\s+/g, '-');
        
        // Fix common typos
        const typoFixes = {
            'priets': 'priest',
            'preist': 'priest',
            'mge': 'mage',
            'warior': 'warrior',
            'shamn': 'shaman',
            'huntter': 'hunter',
            'druid': 'druid',
            'roge': 'rogue',
            'paldin': 'paladin',
            'warlok': 'warlock'
        };
        
        // Apply typo fixes
        if (typoFixes[normalized]) {
            normalized = typoFixes[normalized];
        }
        
        return normalized;
    }

    truncateWithTooltip(text, maxLength = 20) {
        if (!text || text.length <= maxLength) {
            return {
                displayText: text || '',
                titleText: text || ''
            };
        }
        
        return {
            displayText: text.substring(0, maxLength) + '...',
            titleText: text
        };
    }

    getTrophyHtml(position) {
        switch (position) {
            case 1:
                return '<i class="fas fa-trophy trophy-icon gold"></i>';
            case 2:
                return '<i class="fas fa-trophy trophy-icon silver"></i>';
            case 3:
                return '<i class="fas fa-trophy trophy-icon bronze"></i>';
            default:
                return '';
        }
    }

    formatNumber(num) {
        if (num === 0) return '0';
        
        // Convert to millions/thousands for readability
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        } else {
            return num.toLocaleString();
        }
    }

    showLoading() {
        document.getElementById('loading-indicator').style.display = 'flex';
        document.getElementById('raid-logs-container').style.display = 'none';
        document.getElementById('no-data-message').style.display = 'none';
        document.getElementById('error-display').style.display = 'none';
    }

    hideLoading() {
        document.getElementById('loading-indicator').style.display = 'none';
    }

    showContent() {
        document.getElementById('raid-logs-container').style.display = 'block';
        document.getElementById('no-data-message').style.display = 'none';
        document.getElementById('error-display').style.display = 'none';
    }

    showNoData(message) {
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('raid-logs-container').style.display = 'none';
        document.getElementById('error-display').style.display = 'none';
        
        const noDataMessage = document.getElementById('no-data-message');
        noDataMessage.style.display = 'flex';
        
        // Update the message if provided
        if (message) {
            const messageElement = noDataMessage.querySelector('.no-data-content p');
            if (messageElement) {
                messageElement.textContent = message;
            }
        }
    }

    showError(message) {
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('raid-logs-container').style.display = 'none';
        document.getElementById('no-data-message').style.display = 'none';
        
        const errorDisplay = document.getElementById('error-display');
        errorDisplay.style.display = 'flex';
        
        const errorMessage = document.getElementById('error-message');
        if (errorMessage) {
            errorMessage.textContent = message;
        }
    }

    async loadSpecData() {
        try {
            const response = await fetch('/api/specs');
            this.specData = await response.json();
            console.log('📋 Loaded spec data:', this.specData);
        } catch (error) {
            console.error('Failed to load spec data:', error);
        }
    }

    getSpecIconUrl(specName, characterClass) {
        if (!this.specData || !specName || !characterClass) return null;
        
        // Normalize class name to match the spec data structure
        const canonicalClass = this.getCanonicalClass(characterClass);
        const specsForClass = this.specData[canonicalClass] || [];
        
        // Find the spec with matching name (try exact match first, then case-insensitive)
        let spec = specsForClass.find(s => s.name === specName);
        if (!spec) {
            spec = specsForClass.find(s => s.name.toLowerCase() === specName.toLowerCase());
        }
        
        // Special handling for "Restoration1" (Shaman) -> "Restoration"
        if (!spec && specName === 'Restoration1' && canonicalClass === 'shaman') {
            spec = specsForClass.find(s => s.name === 'Restoration');
        }
        
        if (spec && spec.emote) {
            return `https://cdn.discordapp.com/emojis/${spec.emote}.png`;
        }
        
        return null;
    }

    getCanonicalClass(className) {
        if (!className) return 'unknown';
        const lower = className.toLowerCase();
        if (lower.includes('death knight')) return 'death knight';
        if (lower.includes('druid')) return 'druid';
        if (lower.includes('hunter')) return 'hunter';
        if (lower.includes('mage')) return 'mage';
        if (lower.includes('paladin')) return 'paladin';
        if (lower.includes('priest')) return 'priest';
        if (lower.includes('rogue')) return 'rogue';
        if (lower.includes('shaman')) return 'shaman';
        if (lower.includes('warlock')) return 'warlock';
        if (lower.includes('warrior')) return 'warrior';
        return 'unknown';
    }

    // Fallback: return class icon based on character class
    getClassIconHtml(characterClass) {
        const canonicalClass = this.getCanonicalClass(characterClass);
        const emoteId = this.classIconEmotes[canonicalClass];
        if (emoteId) {
            return `<img src="https://cdn.discordapp.com/emojis/${emoteId}.png" class="spec-icon" alt="${canonicalClass}" width="20" height="20" loading="lazy" decoding="async">`;
        }
        return `<i class="fas fa-user-circle spec-icon unknown-spec" style="color: #aaa;" title="${canonicalClass}"></i>`;
    }

    getSpecIconHtml(specName, characterClass) {
        // Priority 1: roster override spec emote if available
        if (specName && specName !== 'null') {
            const player = this.logData.find(p =>
                p.character_class === characterClass &&
                p.spec_name === specName &&
                p.roster_spec_emote
            );
            if (player && player.roster_spec_emote) {
                return `<img src="https://cdn.discordapp.com/emojis/${player.roster_spec_emote}.png" class="spec-icon" alt="${specName}" width="20" height="20" loading="lazy" decoding="async">`;
            }

            // Priority 2: spec icon from SPEC_DATA mapping
            const iconUrl = this.getSpecIconUrl(specName, characterClass);
            if (iconUrl) {
                return `<img src="${iconUrl}" class="spec-icon" alt="${specName}" width="20" height="20" loading="lazy" decoding="async">`;
            }
        }

        // Priority 3: fall back to class icon so every player has an icon
        return this.getClassIconHtml(characterClass);
    }

    displayWallOfShame() {
        console.log('💀 Displaying Wall of Shame');
        
        // Update the shame data regardless - the toggle button will show/hide
        this.updateMostDeathsCard();
        this.updateMostTrashDeathsCard();
        this.updateMostAvoidableDamageCard();
        this.updateMostFriendlyDamageCard();
        
        // Show or hide the shame toggle button based on data availability
        const shameToggleBtn = document.querySelector('.stats-toggle-btn[data-panel="shame"]');
        if (this.shameData && Object.keys(this.shameData).length > 0) {
            if (shameToggleBtn) {
                shameToggleBtn.style.display = 'block';
            }
        } else {
            if (shameToggleBtn) {
                shameToggleBtn.style.display = 'none';
            }
        }
    }

    updateMostDeathsCard() {
        const valueElement = document.getElementById('most-deaths-value');
        const detailElement = document.getElementById('most-deaths-detail');
        
        if (this.shameData.most_deaths) {
            const player = this.shameData.most_deaths;
            const characterClass = this.normalizeClassName(player.character_class);
            
            valueElement.textContent = player.character_name;
            // Apply class color to the player name
            valueElement.className = `stat-value class-${characterClass}`;
            
            // Extract total deaths from the ability_value (format: "3 (1)")
            const totalDeaths = player.ability_value ? player.ability_value.split(' ')[0] : '0';
            detailElement.textContent = `${totalDeaths} total deaths`;
        } else {
            valueElement.textContent = '--';
            valueElement.className = 'stat-value';
            detailElement.textContent = 'No death data';
        }
    }

    updateMostTrashDeathsCard() {
        const valueElement = document.getElementById('most-trash-deaths-value');
        const detailElement = document.getElementById('most-trash-deaths-detail');
        
        if (this.shameData.most_deaths) {
            const player = this.shameData.most_deaths;
            const characterClass = this.normalizeClassName(player.character_class);
            
            valueElement.textContent = player.character_name;
            // Apply class color to the player name
            valueElement.className = `stat-value class-${characterClass}`;
            
            // Extract trash deaths from the ability_value (format: "3 (1)")
            const trashDeaths = player.ability_value ? player.ability_value.match(/\((\d+)\)/)?.[1] || '0' : '0';
            detailElement.textContent = `${trashDeaths} trash deaths`;
        } else {
            valueElement.textContent = '--';
            valueElement.className = 'stat-value';
            detailElement.textContent = 'No trash death data';
        }
    }

    updateMostAvoidableDamageCard() {
        const valueElement = document.getElementById('most-avoidable-damage-value');
        const detailElement = document.getElementById('most-avoidable-damage-detail');
        
        if (this.shameData.most_avoidable_damage) {
            const player = this.shameData.most_avoidable_damage;
            const characterClass = this.normalizeClassName(player.character_class);
            
            valueElement.textContent = player.character_name;
            // Apply class color to the player name
            valueElement.className = `stat-value class-${characterClass}`;
            
            const damage = this.formatNumber(player.ability_value || 0);
            detailElement.textContent = `${damage} avoidable damage`;
        } else {
            valueElement.textContent = '--';
            valueElement.className = 'stat-value';
            detailElement.textContent = 'No avoidable damage data';
        }
    }

    updateMostFriendlyDamageCard() {
        const valueElement = document.getElementById('most-friendly-damage-value');
        const detailElement = document.getElementById('most-friendly-damage-detail');
        
        if (this.shameData.most_friendly_damage) {
            const player = this.shameData.most_friendly_damage;
            const characterClass = this.normalizeClassName(player.character_class);
            
            valueElement.textContent = player.character_name;
            // Apply class color to the player name
            valueElement.className = `stat-value class-${characterClass}`;
            
            const damage = this.formatNumber(player.ability_value || 0);
            detailElement.textContent = `${damage} friendly damage`;
        } else {
            valueElement.textContent = '--';
            valueElement.className = 'stat-value';
            detailElement.textContent = 'No friendly damage data';
        }
    }

    // --- Manual Rewards and Deductions Methods ---
    
    initializeManualRewards() {
        console.log('⚖️ [MANUAL REWARDS] Initializing manual rewards functionality');
        
        // Initialize event listeners for the form
        this.setupManualRewardsEventListeners();
    }
    
    setupManualRewardsEventListeners() {
        // Player name input and dropdown
        const playerNameInput = document.getElementById('player-name-input');
        const playerDropdown = document.getElementById('player-dropdown');
        
        if (playerNameInput) {
            playerNameInput.addEventListener('input', (e) => {
                this.handlePlayerSearch(e.target.value);
            });
            
            playerNameInput.addEventListener('keydown', (e) => {
                this.handlePlayerSearchKeydown(e);
            });
            
            // Reposition dropdown on focus to handle edit mode vs add mode differences
            playerNameInput.addEventListener('focus', () => {
                setTimeout(() => {
                    const dropdown = document.getElementById('player-dropdown');
                    if (dropdown && dropdown.style.display === 'block') {
                        this.positionDropdown();
                    }
                }, 50); // Small delay to ensure any form transformations are applied
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.player-search-container')) {
                    playerDropdown.style.display = 'none';
                }
            });
        }
        
        // Add entry button
        const addEntryBtn = document.getElementById('add-entry-btn');
        if (addEntryBtn) {
            addEntryBtn.addEventListener('click', () => {
                this.handleAddEntry();
            });
        }
        
        // Cancel edit button
        const cancelEditBtn = document.getElementById('cancel-edit-btn');
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', () => {
                this.cancelEdit();
            });
        }

        // Add templates button
        const addTemplatesBtn = document.getElementById('add-templates-btn');
        if (addTemplatesBtn) {
            addTemplatesBtn.addEventListener('click', () => {
                this.handleAddFromTemplates();
            });
        }

        // Grouped template buttons
        const add4HTanksBtn = document.getElementById('add-templates-4h-tanks-btn');
        if (add4HTanksBtn) {
            add4HTanksBtn.addEventListener('click', () => {
                this.handleAddFromTemplates([5,6,7,8]);
            });
        }
        const addRazMcBtn = document.getElementById('add-templates-raz-mc-btn');
        if (addRazMcBtn) {
            addRazMcBtn.addEventListener('click', () => {
                this.handleAddFromTemplates([9,10]);
            });
        }
        const addPullerBtn = document.getElementById('add-templates-puller-btn');
        if (addPullerBtn) {
            addPullerBtn.addEventListener('click', () => {
                this.handleAddFromTemplates([11]);
            });
        }
        const addGluthKiteBtn = document.getElementById('add-templates-gluth-kite-btn');
        if (addGluthKiteBtn) {
            addGluthKiteBtn.addEventListener('click', () => {
                this.handleAddFromTemplates([12]);
            });
        }
        const addSummonersBtn = document.getElementById('add-templates-summoners-btn');
        if (addSummonersBtn) {
            addSummonersBtn.addEventListener('click', () => {
                this.handleAddFromTemplates([13,14,15]);
            });
        }
        
        // Form inputs for real-time validation
        const inputs = ['player-name-input', 'description-input', 'points-input'];
        inputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', () => {
                    this.validateForm();
                });
            }
        });
        
        // Reposition dropdown on scroll/resize to maintain correct position
        const repositionDropdown = () => {
            const dropdown = document.getElementById('player-dropdown');
            if (dropdown && dropdown.style.display === 'block') {
                this.positionDropdown();
            }
        };
        
        window.addEventListener('scroll', repositionDropdown);
        window.addEventListener('resize', repositionDropdown);
    }
    
    async fetchCurrentUser() {
        console.log('👤 [MANUAL REWARDS] Fetching current user info');
        
        try {
            const response = await fetch('/user');
            if (response.ok) {
                this.currentUser = await response.json();
                console.log('👤 [MANUAL REWARDS] Current user:', this.currentUser);
            } else {
                console.log('👤 [MANUAL REWARDS] User not logged in');
                this.currentUser = null;
            }
        } catch (error) {
            console.error('❌ [MANUAL REWARDS] Error fetching user:', error);
            this.currentUser = null;
        }
    }
    
    async fetchManualRewardsData() {
        if (!this.activeEventId) {
            console.log('⚖️ [MANUAL REWARDS] No active event ID, skipping manual rewards fetch');
            return;
        }
        
        console.log(`⚖️ [MANUAL REWARDS] Fetching manual rewards for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/manual-rewards/${this.activeEventId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch manual rewards: ${response.status}`);
            }
            
            const result = await response.json();
            this.manualRewardsData = result.data || [];
            
            console.log(`⚖️ [MANUAL REWARDS] Loaded ${this.manualRewardsData.length} manual entries`);
            
            // Also fetch player list for the dropdown
            await this.fetchPlayersForDropdown();
            
        } catch (error) {
            console.error('❌ [MANUAL REWARDS] Error fetching manual rewards:', error);
            this.manualRewardsData = [];
        }
    }
    
    async fetchPlayersForDropdown() {
        if (!this.activeEventId) return;
        
        console.log(`👥 [MANUAL REWARDS] Fetching players for dropdown for event: ${this.activeEventId}`);
        
        try {
            const response = await fetch(`/api/manual-rewards/${this.activeEventId}/players`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch players: ${response.status}`);
            }
            
            const result = await response.json();
            this.playersData = result.data || [];
            
            console.log(`👥 [MANUAL REWARDS] Loaded ${this.playersData.length} players for dropdown`);
            
        } catch (error) {
            console.error('❌ [MANUAL REWARDS] Error fetching players:', error);
            this.playersData = [];
        }
    }
    
    displayManualRewards() {
        console.log('⚖️ [MANUAL REWARDS] Displaying manual rewards panel');
        
        const hasManagementRole = this.currentUser?.hasManagementRole || false;
        
        // Show/hide elements based on management role
        const form = document.getElementById('manual-rewards-form');
        const actionsHeader = document.getElementById('actions-header');
        const accessDeniedMessage = document.getElementById('access-denied-message');
        const manualRewardsContent = document.getElementById('manual-rewards-content');
        
        const templatesSection = document.getElementById('manual-rewards-templates');

        if (hasManagementRole) {
            console.log('⚖️ [MANUAL REWARDS] User has management role, showing full interface');
            if (form) form.style.display = 'block';
            if (templatesSection) templatesSection.style.display = 'block';
            if (actionsHeader) actionsHeader.style.display = 'table-cell';
            if (accessDeniedMessage) accessDeniedMessage.style.display = 'none';
            if (manualRewardsContent) manualRewardsContent.style.display = 'block';
            
            this.populateManualRewardsTable();
        } else {
            console.log('⚖️ [MANUAL REWARDS] User does not have management role, showing read-only view');
            if (form) form.style.display = 'none';
            if (templatesSection) templatesSection.style.display = 'none';
            if (actionsHeader) actionsHeader.style.display = 'none';
            if (accessDeniedMessage) accessDeniedMessage.style.display = 'block';
            if (manualRewardsContent) manualRewardsContent.style.display = 'none';
        }
    }
    
    populateManualRewardsTable() {
        const listContainer = document.getElementById('manual-rewards-list');
        const noEntriesMessage = document.getElementById('no-entries-message');
        const hasManagementRole = this.currentUser?.hasManagementRole || false;
        
        if (!listContainer) return;
        
        // Clear existing items
        listContainer.innerHTML = '';
        
        if (this.manualRewardsData.length === 0) {
            if (noEntriesMessage) noEntriesMessage.style.display = 'block';
            return;
        }
        
        if (noEntriesMessage) noEntriesMessage.style.display = 'none';
        
        this.manualRewardsData.forEach((entry, index) => {
            const rankingItem = this.createManualRewardItem(entry, index + 1, hasManagementRole);
            listContainer.appendChild(rankingItem);
        });
    }
    
    createManualRewardItem(entry, position, hasManagementRole) {
        const rankingItem = document.createElement('div');
        rankingItem.className = 'ranking-item';
        
        // Check if this is a template entry (empty player name)
        const isTemplateEntry = !entry.player_name || entry.player_name.trim() === '';
        const hasIcon = entry.icon_url && entry.icon_url.trim() !== '';
        
        if (isTemplateEntry) {
            rankingItem.classList.add('template-entry');
        }
        
        if (hasIcon) {
            rankingItem.classList.add('has-template-icon');
        }
        
        // Position or Icon
        const positionDiv = document.createElement('div');
        positionDiv.className = 'ranking-position';
        
        // Use icon for template entries, position number for regular entries
        if (isTemplateEntry && entry.icon_url) {
            positionDiv.innerHTML = `<img src="${entry.icon_url}" alt="Template Icon" class="template-icon" title="${entry.description}">`;
        } else if (entry.icon_url) {
            // Entry has player name but originated from template, keep the icon
            positionDiv.innerHTML = `<img src="${entry.icon_url}" alt="Template Icon" class="template-icon" title="${entry.description}">`;
        } else {
            // Regular manual entry, use position number
            positionDiv.textContent = position;
        }
        
        // Character Info
        const characterInfo = document.createElement('div');
        characterInfo.className = `character-info ${entry.player_class ? `class-${this.normalizeClassName(entry.player_class)}` : 'class-unknown'}`;
        
        // Character Name
        const characterName = document.createElement('div');
        characterName.className = 'character-name';
        
        if (isTemplateEntry) {
            characterName.innerHTML = '<em>Click Edit to assign player</em>';
            characterName.classList.add('needs-player');
        } else {
            characterName.textContent = entry.player_name;
        }
        
        // Character Details (description)
        const characterDetails = document.createElement('div');
        characterDetails.className = 'character-details';
        characterDetails.textContent = entry.description;
        characterDetails.title = entry.description; // Tooltip for full text
        
        characterInfo.appendChild(characterName);
        characterInfo.appendChild(characterDetails);
        
        // Performance Amount (Points)
        const performanceAmount = document.createElement('div');
        performanceAmount.className = 'performance-amount';
        
        const amountValue = document.createElement('div');
        amountValue.className = 'amount-value';
        const points = parseFloat(entry.points);
        amountValue.textContent = points > 0 ? `+${points}` : points.toString();
        
        if (points > 0) {
            amountValue.classList.add('positive');
        } else if (points < 0) {
            amountValue.classList.add('negative');
        }
        
        performanceAmount.appendChild(amountValue);
        
        // Actions (only for management users)
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'manual-rewards-actions';
        
        if (hasManagementRole) {
            const editBtn = document.createElement('button');
            editBtn.className = 'btn-edit';
            editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit';
            editBtn.onclick = () => this.editEntry(entry);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-delete';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
            deleteBtn.onclick = () => this.deleteEntry(entry);
            
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(deleteBtn);
        }
        
        // Append all elements
        rankingItem.appendChild(positionDiv);
        rankingItem.appendChild(characterInfo);
        rankingItem.appendChild(performanceAmount);
        if (hasManagementRole) {
            rankingItem.appendChild(actionsDiv);
        }
        
        return rankingItem;
    }
    
    handlePlayerSearch(searchTerm) {
        const dropdown = document.getElementById('player-dropdown');
        if (!dropdown) return;
        
        console.log('🔍 [PLAYER SEARCH] Search term:', searchTerm);
        console.log('🔍 [PLAYER SEARCH] Players data length:', this.playersData?.length || 0);
        
        if (!searchTerm.trim()) {
            dropdown.style.display = 'none';
            return;
        }
        
        // Ensure playersData exists and is an array
        if (!this.playersData || !Array.isArray(this.playersData)) {
            console.warn('⚠️ [PLAYER SEARCH] Players data not available, attempting to fetch...');
            
            // Show loading state in dropdown
            dropdown.innerHTML = '<div style="padding: 8px; color: #888; font-style: italic;">Loading players...</div>';
            dropdown.style.display = 'block';
            this.positionDropdown();
            
            this.fetchPlayersForDropdown().then(() => {
                // Retry search after fetching data
                if (this.playersData && Array.isArray(this.playersData)) {
                    this.handlePlayerSearch(searchTerm);
                } else {
                    dropdown.innerHTML = '<div style="padding: 8px; color: #888; font-style: italic;">No players available</div>';
                }
            }).catch(error => {
                console.error('❌ [PLAYER SEARCH] Failed to fetch players:', error);
                dropdown.innerHTML = '<div style="padding: 8px; color: #888; font-style: italic;">Error loading players</div>';
            });
            return;
        }
        
        const filteredPlayers = this.playersData.filter(player => 
            player.player_name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        console.log('🔍 [PLAYER SEARCH] Filtered players:', filteredPlayers.length);
        
        this.populatePlayerDropdown(filteredPlayers);
        
        if (filteredPlayers.length > 0) {
            this.positionDropdown(); // Reposition when showing
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    }
    
    populatePlayerDropdown(players) {
        const dropdown = document.getElementById('player-dropdown');
        if (!dropdown) return;
        
        dropdown.innerHTML = '';
        
        // Position the dropdown below the input field using fixed positioning
        this.positionDropdown();
        
        players.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = `player-dropdown-item ${player.player_class ? `class-${this.normalizeClassName(player.player_class)}` : 'class-unknown'}`;
            if (index === 0) item.classList.add('selected');
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = player.player_name;
            nameSpan.className = `player-name ${player.player_class ? `class-${this.normalizeClassName(player.player_class)}` : ''}`;
            
            const classSpan = document.createElement('span');
            classSpan.className = 'player-class';
            classSpan.textContent = player.player_class ? `(${player.player_class})` : '';
            
            item.appendChild(nameSpan);
            item.appendChild(classSpan);
            
            item.onclick = () => this.selectPlayer(player);
            
            dropdown.appendChild(item);
        });
    }
    
    positionDropdown() {
        // Let CSS handle positioning naturally with position: absolute
        console.log('🔍 [DROPDOWN] Using CSS positioning (position: absolute)');
    }
    
    handlePlayerSearchKeydown(e) {
        const dropdown = document.getElementById('player-dropdown');
        if (!dropdown || dropdown.style.display === 'none') return;
        
        const items = dropdown.querySelectorAll('.player-dropdown-item');
        const currentSelected = dropdown.querySelector('.player-dropdown-item.selected');
        let selectedIndex = Array.from(items).indexOf(currentSelected);
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                this.updateDropdownSelection(items, selectedIndex);
                break;
            case 'ArrowUp':
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                this.updateDropdownSelection(items, selectedIndex);
                break;
            case 'Enter':
                e.preventDefault();
                if (currentSelected) {
                    currentSelected.click();
                }
                break;
            case 'Escape':
                e.preventDefault();
                dropdown.style.display = 'none';
                break;
        }
    }
    
    updateDropdownSelection(items, selectedIndex) {
        items.forEach((item, index) => {
            if (index === selectedIndex) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }
    
    selectPlayer(player) {
        const playerNameInput = document.getElementById('player-name-input');
        const dropdown = document.getElementById('player-dropdown');
        
        if (playerNameInput) {
            playerNameInput.value = player.player_name;
            playerNameInput.dataset.selectedPlayerId = player.discord_id || '';
            playerNameInput.dataset.selectedPlayerClass = player.player_class || '';
        }
        
        if (dropdown) {
            dropdown.style.display = 'none';
        }
        
        this.validateForm();
    }
    
    validateForm() {
        const playerNameInput = document.getElementById('player-name-input');
        const descriptionInput = document.getElementById('description-input');
        const pointsInput = document.getElementById('points-input');
        const addBtn = document.getElementById('add-entry-btn');
        
        if (!playerNameInput || !descriptionInput || !pointsInput || !addBtn) return;
        
        const isValid = 
            playerNameInput.value.trim() !== '' &&
            descriptionInput.value.trim() !== '' &&
            pointsInput.value !== '' &&
            !isNaN(parseFloat(pointsInput.value));
        
        addBtn.disabled = !isValid;
        addBtn.textContent = this.isEditingEntry ? 'Update Entry' : 'Add Entry';
    }
    
    async handleAddEntry() {
        const playerNameInput = document.getElementById('player-name-input');
        const descriptionInput = document.getElementById('description-input');
        const pointsInput = document.getElementById('points-input');
        
        if (!playerNameInput || !descriptionInput || !pointsInput) return;
        
        const entryData = {
            player_name: playerNameInput.value.trim(),
            player_class: playerNameInput.dataset.selectedPlayerClass || null,
            discord_id: playerNameInput.dataset.selectedPlayerId || null,
            description: descriptionInput.value.trim(),
            points: parseFloat(pointsInput.value)
        };
        
        console.log('⚖️ [MANUAL REWARDS] Adding/updating entry:', entryData);
        
        try {
            let response;
            if (this.isEditingEntry) {
                response = await fetch(`/api/manual-rewards/${this.activeEventId}/${this.editingEntryId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(entryData)
                });
            } else {
                response = await fetch(`/api/manual-rewards/${this.activeEventId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(entryData)
                });
            }
            
            if (!response.ok) {
                throw new Error(`Failed to save entry: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('✅ [MANUAL REWARDS] Entry saved successfully:', result);
            
            // Refresh data and display
            await this.fetchManualRewardsData();
            this.populateManualRewardsTable();
            this.clearForm();
            
            // Update total points card
            this.updateTotalPointsCard();
            
        } catch (error) {
            console.error('❌ [MANUAL REWARDS] Error saving entry:', error);
            alert('Failed to save entry. Please try again.');
        }
    }
    
    editEntry(entry) {
        console.log('✏️ [MANUAL REWARDS] Editing entry:', entry);
        
        const playerNameInput = document.getElementById('player-name-input');
        const descriptionInput = document.getElementById('description-input');
        const pointsInput = document.getElementById('points-input');
        const addBtn = document.getElementById('add-entry-btn');
        const cancelBtn = document.getElementById('cancel-edit-btn');
        
        if (playerNameInput) {
            playerNameInput.value = entry.player_name;
            playerNameInput.dataset.selectedPlayerId = entry.discord_id || '';
            playerNameInput.dataset.selectedPlayerClass = entry.player_class || '';
        }
        if (descriptionInput) descriptionInput.value = entry.description;
        if (pointsInput) pointsInput.value = entry.points;
        
        this.isEditingEntry = true;
        this.editingEntryId = entry.id;
        
        if (addBtn) addBtn.textContent = 'Update Entry';
        if (cancelBtn) cancelBtn.style.display = 'inline-flex';
        
        // Highlight form and scroll to it
        const form = document.getElementById('manual-rewards-form');
        if (form) {
            // Add highlight class
            form.classList.add('form-active');
            
            // Scroll to form
            form.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Focus on player name input after scroll completes
            setTimeout(() => {
                if (playerNameInput) {
                    playerNameInput.focus();
                    // Select existing text for easy replacement if it's empty or placeholder text
                    if (!entry.player_name || entry.player_name.trim() === '') {
                        playerNameInput.select();
                    }
                    
                    // Reposition dropdown after form transformation settles
                    setTimeout(() => {
                        const dropdown = document.getElementById('player-dropdown');
                        if (dropdown && dropdown.style.display === 'block') {
                            this.positionDropdown();
                        }
                    }, 100);
                }
            }, 500); // Wait for scroll animation to complete
        }
    }
    
    async deleteEntry(entry) {
        if (!confirm(`Are you sure you want to delete this entry?\n\nPlayer: ${entry.player_name}\nDescription: ${entry.description}\nPoints: ${entry.points}`)) {
            return;
        }
        
        console.log('🗑️ [MANUAL REWARDS] Deleting entry:', entry);
        
        try {
            const response = await fetch(`/api/manual-rewards/${this.activeEventId}/${entry.id}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error(`Failed to delete entry: ${response.status}`);
            }
            
            console.log('✅ [MANUAL REWARDS] Entry deleted successfully');
            
            // Refresh data and display
            await this.fetchManualRewardsData();
            this.populateManualRewardsTable();
            
            // Update total points card
            this.updateTotalPointsCard();
            
        } catch (error) {
            console.error('❌ [MANUAL REWARDS] Error deleting entry:', error);
            alert('Failed to delete entry. Please try again.');
        }
    }
    
    cancelEdit() {
        console.log('↩️ [MANUAL REWARDS] Cancelling edit');
        
        this.isEditingEntry = false;
        this.editingEntryId = null;
        
        const addBtn = document.getElementById('add-entry-btn');
        const cancelBtn = document.getElementById('cancel-edit-btn');
        const form = document.getElementById('manual-rewards-form');
        
        if (addBtn) addBtn.textContent = 'Add Entry';
        if (cancelBtn) cancelBtn.style.display = 'none';
        
        // Remove form highlight
        if (form) {
            form.classList.remove('form-active');
        }
        
        this.clearForm();
    }
    
    clearForm() {
        const playerNameInput = document.getElementById('player-name-input');
        const descriptionInput = document.getElementById('description-input');
        const pointsInput = document.getElementById('points-input');
        const dropdown = document.getElementById('player-dropdown');
        const form = document.getElementById('manual-rewards-form');
        
        if (playerNameInput) {
            playerNameInput.value = '';
            playerNameInput.dataset.selectedPlayerId = '';
            playerNameInput.dataset.selectedPlayerClass = '';
        }
        if (descriptionInput) descriptionInput.value = '';
        if (pointsInput) pointsInput.value = '';
        if (dropdown) dropdown.style.display = 'none';
        
        // Remove form highlight when clearing
        if (form) {
            form.classList.remove('form-active');
        }
        
        // Reset editing state
        this.isEditingEntry = false;
        this.editingEntryId = null;
        
        // Reset button states
        const addBtn = document.getElementById('add-entry-btn');
        const cancelBtn = document.getElementById('cancel-edit-btn');
        if (addBtn) addBtn.textContent = 'Add Entry';
        if (cancelBtn) cancelBtn.style.display = 'none';
        
        this.validateForm();
    }

    async handleAddFromTemplates(templateIds = null) {
        console.log('📋 [TEMPLATES] Adding entries from templates');
        
        if (!this.activeEventId) {
            console.error('❌ [TEMPLATES] No active event ID');
            alert('Please select an event first');
            return;
        }

        const addTemplatesBtn = document.getElementById('add-templates-btn');
        const groupButtons = [
            document.getElementById('add-templates-4h-tanks-btn'),
            document.getElementById('add-templates-raz-mc-btn'),
            document.getElementById('add-templates-puller-btn'),
            document.getElementById('add-templates-gluth-kite-btn'),
            document.getElementById('add-templates-summoners-btn')
        ].filter(Boolean);
        
        try {
            // Disable button during operation
            if (addTemplatesBtn) {
                addTemplatesBtn.disabled = true;
                addTemplatesBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
            }
            groupButtons.forEach(btn => { btn.disabled = true; });

            console.log(`📋 [TEMPLATES] Fetching templates for event: ${this.activeEventId}`);
            
            const response = await fetch(`/api/manual-rewards/${this.activeEventId}/from-templates`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: templateIds && Array.isArray(templateIds) ? JSON.stringify({ templateIds }) : undefined
            });

            const result = await response.json();
            console.log('📋 [TEMPLATES] Templates response:', result);

            if (result.success) {
                console.log(`✅ [TEMPLATES] Successfully added ${result.templatesInserted} template entries`);
                
                // Show success message
                alert(`Successfully added ${result.templatesInserted} template entries! Click "Edit" on each entry to assign player names.`);
                
                // Refresh the manual rewards data
                await this.fetchManualRewardsData();
                this.populateManualRewardsTable();
                
            } else {
                console.error('❌ [TEMPLATES] Failed to add templates:', result.message);
                alert(`Failed to add templates: ${result.message}`);
            }

        } catch (error) {
            console.error('❌ [TEMPLATES] Error adding templates:', error);
            alert('Error adding templates. Please try again.');
        } finally {
            // Re-enable button
            if (addTemplatesBtn) {
                addTemplatesBtn.disabled = false;
                addTemplatesBtn.innerHTML = '<i class="fas fa-clipboard-list"></i> Add from templates';
            }
            groupButtons.forEach(btn => { btn.disabled = false; });
        }
    }
}

// Initialize the raid logs manager when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing Raid Logs Manager');
    new RaidLogsManager();
}); 