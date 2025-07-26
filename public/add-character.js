// public/add-character.js - Reusable Add Character Feature

class AddCharacterModal {
    constructor(options = {}) {
        this.showSpecField = options.showSpecField || false;
        this.onSubmit = options.onSubmit || null;
        this.onCancel = options.onCancel || null;
        this.modal = null;
        this.classData = {
            'death knight': { color: '196,30,59', specs: ['Blood', 'Frost', 'Unholy'] },
            'druid': { color: '255,125,10', specs: ['Balance', 'Feral Combat', 'Restoration'] },
            'hunter': { color: '171,212,115', specs: ['Beast Mastery', 'Marksmanship', 'Survival'] },
            'mage': { color: '105,204,240', specs: ['Arcane', 'Fire', 'Frost'] },
            'paladin': { color: '245,140,186', specs: ['Holy', 'Protection', 'Retribution'] },
            'priest': { color: '255,255,255', specs: ['Discipline', 'Holy', 'Shadow'] },
            'rogue': { color: '255,245,105', specs: ['Assassination', 'Combat', 'Subtlety'] },
            'shaman': { color: '0,112,222', specs: ['Elemental', 'Enhancement', 'Restoration'] },
            'warlock': { color: '148,130,201', specs: ['Affliction', 'Demonology', 'Destruction'] },
            'warrior': { color: '199,156,110', specs: ['Arms', 'Fury', 'Protection'] }
        };
    }

    show() {
        this.createModal();
        document.body.appendChild(this.modal);
        
        // Focus on first input
        const firstInput = this.modal.querySelector('input');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    }

    hide() {
        if (this.modal && this.modal.parentNode) {
            this.modal.parentNode.removeChild(this.modal);
        }
        this.modal = null;
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'add-character-overlay';
        
        const classOptions = Object.keys(this.classData).map(className => 
            `<option value="${className}">${className.charAt(0).toUpperCase() + className.slice(1)}</option>`
        ).join('');

        const specField = this.showSpecField ? `
            <div class="form-group">
                <label for="add-char-spec">Spec:</label>
                <select id="add-char-spec" name="spec" disabled>
                    <option value="">Select Class First</option>
                </select>
                <small class="help-text">Choose a class above to see available specializations.</small>
            </div>
        ` : '';

        this.modal.innerHTML = `
            <div class="add-character-modal">
                <div class="modal-header">
                    <h3>Add New Character</h3>
                    <button type="button" class="close-button" aria-label="Close">&times;</button>
                </div>
                
                <form class="add-character-form">
                    <div class="form-group">
                        <label for="add-char-name">Character Name *:</label>
                        <input type="text" id="add-char-name" name="characterName" required placeholder="Enter character name">
                        <small class="help-text">The name must match the player's in-game character name perfectly and exactly.</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="add-char-class">Class *:</label>
                        <select id="add-char-class" name="class" required>
                            <option value="">Select Class</option>
                            ${classOptions}
                        </select>
                    </div>
                    
                    ${specField}
                    
                    <div class="form-group">
                        <label for="add-char-discord">Discord ID *:</label>
                        <input type="text" id="add-char-discord" name="discordId" required placeholder="Enter Discord ID (e.g., 123456789012345678)">
                        <small class="help-text">You can get Discord ID by right-clicking a user and selecting "Copy ID"</small>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn btn-cancel">Cancel</button>
                        <button type="submit" class="btn btn-primary">Add Character</button>
                    </div>
                </form>
            </div>
        `;

        this.attachEventListeners();
    }

    attachEventListeners() {
        // Close button
        const closeButton = this.modal.querySelector('.close-button');
        closeButton.addEventListener('click', () => this.handleCancel());

        // Cancel button
        const cancelButton = this.modal.querySelector('.btn-cancel');
        cancelButton.addEventListener('click', () => this.handleCancel());

        // Overlay click (close when clicking outside modal)
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.handleCancel();
            }
        });

        // Form submission
        const form = this.modal.querySelector('.add-character-form');
        form.addEventListener('submit', (e) => this.handleSubmit(e));

        // Escape key
        document.addEventListener('keydown', this.handleKeyDown.bind(this));

        // Class change - update preview color and populate spec options
        const classSelect = this.modal.querySelector('#add-char-class');
        classSelect.addEventListener('change', (e) => {
            const selectedClass = e.target.value;
            const formGroup = e.target.closest('.form-group');
            
            if (selectedClass && this.classData[selectedClass]) {
                const color = this.classData[selectedClass].color;
                formGroup.style.borderLeft = `4px solid rgb(${color})`;
                
                // Update spec field if it exists
                if (this.showSpecField) {
                    this.updateSpecOptions(selectedClass);
                }
            } else {
                formGroup.style.borderLeft = '';
                
                // Disable spec field if no class selected
                if (this.showSpecField) {
                    this.updateSpecOptions('');
                }
            }
        });
    }

    updateSpecOptions(selectedClass) {
        const specSelect = this.modal.querySelector('#add-char-spec');
        if (!specSelect) return;

        if (!selectedClass || !this.classData[selectedClass]) {
            // No class selected or invalid class
            specSelect.disabled = true;
            specSelect.innerHTML = '<option value="">Select Class First</option>';
            return;
        }

        // Populate spec options for the selected class
        const specs = this.classData[selectedClass].specs;
        specSelect.disabled = false;
        specSelect.innerHTML = '<option value="">Select Specialization</option>' + 
            specs.map(spec => `<option value="${spec}">${spec}</option>`).join('');
    }

    handleKeyDown(e) {
        if (e.key === 'Escape') {
            this.handleCancel();
        }
    }

    handleCancel() {
        if (this.onCancel) {
            this.onCancel();
        }
        this.hide();
        document.removeEventListener('keydown', this.handleKeyDown.bind(this));
    }

    handleSubmit(e) {
        e.preventDefault();
        
        const form = e.target;
        const formData = new FormData(form);
        const data = {
            characterName: formData.get('characterName').trim(),
            class: formData.get('class'),
            discordId: formData.get('discordId').trim()
        };

        if (this.showSpecField) {
            data.spec = formData.get('spec');
        }

        // Basic validation
        if (!data.characterName || !data.class || !data.discordId) {
            showAlert('Validation Error', 'Please fill in all required fields');
            return;
        }

        // Discord ID validation (should be 17-19 digits)
        if (!/^\d{17,19}$/.test(data.discordId)) {
            showAlert('Invalid Discord ID', 'Discord ID should be 17-19 digits long');
            return;
        }

        if (this.onSubmit) {
            this.onSubmit(data);
        }

        this.hide();
        document.removeEventListener('keydown', this.handleKeyDown.bind(this));
    }
}

// Export for use in other modules
window.AddCharacterModal = AddCharacterModal; 