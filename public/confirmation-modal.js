// public/confirmation-modal.js - Reusable Confirmation Modal System

class ConfirmationModal {
    constructor(options = {}) {
        this.title = options.title || 'Confirm Action';
        this.message = options.message || 'Are you sure?';
        this.type = options.type || 'confirm'; // 'alert', 'confirm', 'custom'
        this.buttons = options.buttons || this.getDefaultButtons();
        this.onConfirm = options.onConfirm || null;
        this.onCancel = options.onCancel || null;
        this.modal = null;
        this.allowHtmlContent = options.allowHtmlContent || false;
    }

    getDefaultButtons() {
        switch (this.type) {
            case 'alert':
                return [{ text: 'OK', action: 'confirm', style: 'primary' }];
            case 'confirm':
                return [
                    { text: 'Cancel', action: 'cancel', style: 'secondary' },
                    { text: 'Confirm', action: 'confirm', style: 'primary' }
                ];
            default:
                return [
                    { text: 'Cancel', action: 'cancel', style: 'secondary' },
                    { text: 'OK', action: 'confirm', style: 'primary' }
                ];
        }
    }

    show() {
        this.createModal();
        document.body.appendChild(this.modal);
        
        // Focus on the primary button
        const primaryButton = this.modal.querySelector('.btn-primary');
        if (primaryButton) {
            setTimeout(() => primaryButton.focus(), 100);
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
        this.modal.className = 'confirmation-overlay';
        
        const buttonsHtml = this.buttons.map(button => 
            `<button type="button" class="btn btn-${button.style}" data-action="${button.action}">${button.text}</button>`
        ).join('');

        // Handle message content based on allowHtmlContent flag
        const messageContent = this.allowHtmlContent ? this.message : this.escapeHtml(this.message);

        this.modal.innerHTML = `
            <div class="confirmation-modal">
                <div class="modal-header">
                    <h3>${this.escapeHtml(this.title)}</h3>
                    <button type="button" class="close-button" aria-label="Close">&times;</button>
                </div>
                
                <div class="modal-body">
                    <div class="confirmation-message">${messageContent}</div>
                </div>
                
                <div class="modal-footer">
                    ${buttonsHtml}
                </div>
            </div>
        `;

        this.attachEventListeners();
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    attachEventListeners() {
        // Close button
        const closeButton = this.modal.querySelector('.close-button');
        closeButton.addEventListener('click', () => this.handleAction('cancel'));

        // Action buttons
        this.modal.querySelectorAll('[data-action]').forEach(button => {
            button.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.handleAction(action);
            });
        });

        // Overlay click (close when clicking outside modal)
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.handleAction('cancel');
            }
        });

        // Escape key
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    handleKeyDown(e) {
        if (e.key === 'Escape') {
            this.handleAction('cancel');
        }
        if (e.key === 'Enter' && this.type === 'alert') {
            this.handleAction('confirm');
        }
    }

    handleAction(action) {
        if (action === 'confirm' && this.onConfirm) {
            this.onConfirm();
        } else if (action === 'cancel' && this.onCancel) {
            this.onCancel();
        }
        
        this.hide();
        document.removeEventListener('keydown', this.handleKeyDown.bind(this));
    }
}

// Utility functions for common modal types
window.ConfirmationModal = ConfirmationModal;

window.showAlert = function(title, message, callback = null) {
    const modal = new ConfirmationModal({
        type: 'alert',
        title: title,
        message: message,
        allowHtmlContent: true,
        onConfirm: callback
    });
    modal.show();
};

window.showConfirm = function(title, message, onConfirm = null, onCancel = null) {
    const modal = new ConfirmationModal({
        type: 'confirm',
        title: title,
        message: message,
        allowHtmlContent: true,
        onConfirm: onConfirm,
        onCancel: onCancel
    });
    modal.show();
};

window.showCustomModal = function(options) {
    const modal = new ConfirmationModal(options);
    modal.show();
}; 