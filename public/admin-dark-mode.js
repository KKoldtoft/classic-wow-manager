/**
 * Admin Dark Mode Toggle Component
 * Manages light/dark mode theme switching with localStorage persistence
 */

(function() {
    'use strict';

    // Initialize dark mode from localStorage or system preference
    function initDarkMode() {
        const stored = localStorage.getItem('admin-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        // Remove both classes first to ensure clean state
        document.documentElement.classList.remove('dark');
        
        if (stored === 'dark' || (!stored && prefersDark)) {
            document.documentElement.classList.add('dark');
        }
        
        // Also update body if it exists
        if (document.body) {
            document.body.classList.remove('dark');
            if (stored === 'dark' || (!stored && prefersDark)) {
                document.body.classList.add('dark');
            }
        }
    }

    // Toggle dark mode
    function toggleDarkMode() {
        const isDark = document.documentElement.classList.toggle('dark');
        if (document.body) {
            document.body.classList.toggle('dark', isDark);
        }
        localStorage.setItem('admin-theme', isDark ? 'dark' : 'light');
        updateToggleButton();
    }

    // Update the toggle button icon based on current mode
    function updateToggleButton() {
        const toggle = document.getElementById('dark-mode-toggle');
        if (!toggle) return;
        
        const isDark = document.documentElement.classList.contains('dark');
        const icon = toggle.querySelector('i');
        
        if (icon) {
            icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        }
        
        toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
        toggle.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }

    // Initialize the toggle button in the nav bar
    function initToggleButton() {
        const toggle = document.getElementById('dark-mode-toggle');
        if (!toggle) {
            console.warn('Dark mode toggle button not found in navigation');
            return false;
        }
        
        // Use addEventListener instead of onclick for better compatibility
        // Remove any existing listeners first
        toggle.removeEventListener('click', toggleDarkMode);
        toggle.addEventListener('click', toggleDarkMode);
        updateToggleButton();
        console.log('Dark mode toggle initialized successfully');
        return true;
    }

    // Initialize IMMEDIATELY to prevent flash
    initDarkMode();

    // Try multiple initialization strategies to ensure button works
    let initAttempts = 0;
    const maxAttempts = 10;
    
    function tryInitButton() {
        initAttempts++;
        if (initToggleButton()) {
            console.log(`Dark mode button initialized on attempt ${initAttempts}`);
            return true;
        }
        
        if (initAttempts < maxAttempts) {
            setTimeout(tryInitButton, 100);
        } else {
            console.error('Failed to initialize dark mode toggle button after', maxAttempts, 'attempts');
        }
        return false;
    }

    // Initialize toggle button on DOM load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryInitButton);
    } else {
        // DOM already loaded
        tryInitButton();
    }

    // Expose global functions for manual control if needed
    window.adminDarkMode = {
        toggle: toggleDarkMode,
        init: initDarkMode,
        get isDark() {
            return document.documentElement.classList.contains('dark');
        }
    };
})();
