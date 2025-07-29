// rpb_import.js - Google Sheet Import functionality

document.addEventListener('DOMContentLoaded', function() {
    const importForm = document.getElementById('import-form');
    const statusSection = document.getElementById('status-section');
    const resultsSection = document.getElementById('results-section');
    const loadingIndicator = document.getElementById('loading-indicator');
    const importSummary = document.getElementById('import-summary');
    const playerDataTable = document.getElementById('player-data-table');

    // Pre-fill fields from active event session
    prefillFromActiveEvent();

    // Handle form submission
    importForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const sheetUrl = document.getElementById('sheet-url').value.trim();
        const eventId = document.getElementById('event-id').value.trim();

        if (!sheetUrl || !eventId) {
            alert('Please fill in both fields');
            return;
        }

        // Validate Google Sheets URL
        if (!isValidGoogleSheetsUrl(sheetUrl)) {
            alert('Please enter a valid Google Sheets URL');
            return;
        }

        await importSheetData(sheetUrl, eventId);
    });

    // Validate Google Sheets URL format
    function isValidGoogleSheetsUrl(url) {
        const googleSheetsPattern = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/;
        return googleSheetsPattern.test(url);
    }

    // Import sheet data
    async function importSheetData(sheetUrl, eventId) {
        // Show loading
        statusSection.style.display = 'block';
        resultsSection.style.display = 'none';
        loadingIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing Google Sheet...';

        try {
            const response = await fetch('/api/import-sheet', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sheetUrl: sheetUrl,
                    eventId: eventId
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                displayResults(result);
            } else {
                showError(result.message || 'Import failed');
            }
        } catch (error) {
            console.error('Import error:', error);
            showError('Network error occurred during import');
        }
    }

    // Display successful import results
    function displayResults(result) {
        statusSection.style.display = 'none';
        resultsSection.style.display = 'block';

        // Show summary
        const actionText = result.wasReplacement ? 'Data Replaced!' : 'Import Successful!';
        const actionIcon = result.wasReplacement ? 'fa-sync-alt' : 'fa-check-circle';
        const actionMessage = result.wasReplacement 
            ? '<p class="replacement-notice"><i class="fas fa-info-circle"></i> <strong>Note:</strong> Existing data for this event was replaced with new data.</p>'
            : '';
        
        importSummary.innerHTML = `
            <div class="success-message">
                <h3><i class="fas ${actionIcon}"></i> ${actionText}</h3>
                ${actionMessage}
                <p><strong>Sheet:</strong> ${result.sheetTitle || 'Unknown'}</p>
                <p><strong>Event ID:</strong> ${result.eventId}</p>
                <p><strong>Players Found:</strong> ${result.playerCount || 0}</p>
                <p><strong>Abilities Imported:</strong> ${result.abilitiesCount || 0}</p>
                <p><strong>Import Time:</strong> ${new Date().toLocaleString()}</p>
            </div>
        `;

        // Display player data table
        if (result.playerData && result.playerData.length > 0) {
            displayPlayerDataTable(result.playerData);
        }
    }

    // Display player data in a table
    function displayPlayerDataTable(playerData) {
        let tableHtml = `
            <h3>Imported Player Data</h3>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Character Name</th>
                            <th>Class</th>
                            <th>Ability</th>
                            <th>Value</th>
                            <th>Position</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        playerData.forEach(row => {
            tableHtml += `
                <tr>
                    <td>${escapeHtml(row.character_name)}</td>
                    <td>${escapeHtml(row.character_class)}</td>
                    <td>${escapeHtml(row.ability_name)}</td>
                    <td>${escapeHtml(row.ability_value)}</td>
                    <td>Row ${row.row_number}, Col ${row.column_number}</td>
                </tr>
            `;
        });

        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;

        playerDataTable.innerHTML = tableHtml;
    }

    // Show error message
    function showError(message) {
        statusSection.style.display = 'none';
        resultsSection.style.display = 'block';
        
        importSummary.innerHTML = `
            <div class="error-message">
                <h3><i class="fas fa-exclamation-triangle"></i> Import Failed</h3>
                <p>${escapeHtml(message)}</p>
            </div>
        `;
        
        playerDataTable.innerHTML = '';
    }

    // Utility function to escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});

// Function to pre-fill form fields from active event session
async function prefillFromActiveEvent() {
    try {
        const activeEventSession = localStorage.getItem('activeEventSession');
        
        if (!activeEventSession) {
            console.log('📋 [RPB_IMPORT] No active event session found');
            return;
        }

        console.log(`📋 [RPB_IMPORT] Found active event session: ${activeEventSession}`);
        
        let fieldsPreFilled = false;
        
        // Pre-fill the event ID field
        const eventIdField = document.getElementById('event-id');
        if (eventIdField) {
            eventIdField.value = activeEventSession;
            eventIdField.style.backgroundColor = '#e8f5e8';
            eventIdField.title = 'Auto-filled from active event session';
            fieldsPreFilled = true;
            console.log(`📋 [RPB_IMPORT] Pre-filled event ID: ${activeEventSession}`);
            
            // Clear visual indicator when user starts typing
            eventIdField.addEventListener('input', function() {
                this.style.backgroundColor = '';
                this.title = '';
            });
        }

        // Fetch RPB tracking data to get the archive URL
        const response = await fetch(`/api/rpb-tracking/${activeEventSession}`);
        
        if (response.ok) {
            const data = await response.json();
            console.log('📋 [RPB_IMPORT] RPB tracking data:', data);
            
            if (data.success && data.archiveUrl) {
                const sheetUrlField = document.getElementById('sheet-url');
                if (sheetUrlField) {
                    sheetUrlField.value = data.archiveUrl;
                    sheetUrlField.style.backgroundColor = '#e8f5e8';
                    sheetUrlField.title = 'Auto-filled from RPB archive URL';
                    fieldsPreFilled = true;
                    console.log(`📋 [RPB_IMPORT] Pre-filled sheet URL: ${data.archiveUrl}`);
                    
                    // Clear visual indicator when user starts typing
                    sheetUrlField.addEventListener('input', function() {
                        this.style.backgroundColor = '';
                        this.title = '';
                    });
                }
            } else {
                console.log('📋 [RPB_IMPORT] No archive URL found for this event');
            }
        } else {
            console.log('📋 [RPB_IMPORT] No RPB tracking found for this event');
        }
        
        // Show notification if any fields were pre-filled
        if (fieldsPreFilled) {
            showNotification('Fields auto-filled from active event session', 'info');
        }
    } catch (error) {
        console.error('📋 [RPB_IMPORT] Error pre-filling from active event:', error);
    }
}

// Helper function to show notifications
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Style the notification
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'info' ? '#d4edda' : '#f8d7da'};
        color: ${type === 'info' ? '#155724' : '#721c24'};
        border: 1px solid ${type === 'info' ? '#c3e6cb' : '#f5c6cb'};
        border-radius: 4px;
        padding: 12px 16px;
        z-index: 1000;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        font-size: 14px;
        max-width: 300px;
    `;
    
    document.body.appendChild(notification);
    
    // Remove notification after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

// Add some CSS for the table and messages
const style = document.createElement('style');
style.textContent = `
    .import-section {
        background: white;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .form-group {
        margin-bottom: 20px;
    }

    .form-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
        color: #333;
    }

    .form-input {
        width: 100%;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
        box-sizing: border-box;
    }

    .form-input:focus {
        outline: none;
        border-color: #007bff;
        box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
    }

    .form-help {
        display: block;
        margin-top: 5px;
        color: #666;
        font-size: 12px;
    }

    .btn {
        padding: 12px 20px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        text-decoration: none;
        display: inline-block;
        transition: background-color 0.2s;
    }

    .btn.primary {
        background-color: #007bff;
        color: white;
    }

    .btn.primary:hover {
        background-color: #0056b3;
    }

    .success-message {
        background: #d4edda;
        border: 1px solid #c3e6cb;
        color: #155724;
        padding: 15px;
        border-radius: 4px;
        margin-bottom: 20px;
    }

    .error-message {
        background: #f8d7da;
        border: 1px solid #f5c6cb;
        color: #721c24;
        padding: 15px;
        border-radius: 4px;
        margin-bottom: 20px;
    }

    .table-container {
        overflow-x: auto;
        margin-top: 20px;
    }

    .data-table {
        width: 100%;
        border-collapse: collapse;
        background: white;
        border-radius: 4px;
        overflow: hidden;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .data-table th,
    .data-table td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid #ddd;
    }

    .data-table th {
        background-color: #f8f9fa;
        font-weight: bold;
        color: #333;
    }

    .data-table tr:hover {
        background-color: #f5f5f5;
    }

    .loading {
        text-align: center;
        padding: 20px;
        color: #007bff;
    }
`;

document.head.appendChild(style); 