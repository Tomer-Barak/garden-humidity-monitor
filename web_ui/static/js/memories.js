class MemoriesPage {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadMemories();
        this.loadUserName();
    }

    setupEventListeners() {
        // Memory modal event listeners
        document.getElementById('writeMemoryBtn').addEventListener('click', () => this.openMemoryModal());
        document.getElementById('saveMemoryBtn').addEventListener('click', () => this.saveMemory());
        document.getElementById('cancelMemoryBtn').addEventListener('click', () => this.closeMemoryModal());
        document.getElementById('closeMemoryModal').addEventListener('click', () => this.closeMemoryModal());
        
        // Character counter
        document.getElementById('memoryTextInput').addEventListener('input', () => this.updateCharCounter());
        
        // Save username when typing
        document.getElementById('userNameInput').addEventListener('input', () => this.saveUserName());
        
        // Close modal when clicking outside
        document.getElementById('memoryModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('memoryModal')) {
                this.closeMemoryModal();
            }
        });
        
        // Form submission
        document.getElementById('memoryForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveMemory();
        });
        
        // RTL toggle
        document.getElementById('rtlToggle').addEventListener('click', () => this.toggleRTL());
    }

    async loadMemories() {
        try {
            const response = await fetch('/api/memories?all=true');
            const data = await response.json();
            
            if (data.status === 'success') {
                this.displayMemories(data.memories);
            } else {
                this.showError('Failed to load memories');
            }
        } catch (error) {
            console.error('Error loading memories:', error);
            this.showError('Failed to load memories');
        }
    }

    displayMemories(memories) {
        const container = document.getElementById('memoriesList');
        
        if (!memories || memories.length === 0) {
            container.innerHTML = `
                <div class="no-memories">
                    <h3>📝 No memories yet</h3>
                    <p>Be the first to share a garden observation or discovery!</p>
                    <button onclick="memoriesPage.openMemoryModal()" class="btn-primary" style="margin-top: 15px;">
                        ✏️ Write First Memory
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        
        memories.forEach(memory => {
            const memoryElement = document.createElement('div');
            memoryElement.className = 'memory-item';
            
            // Parse timestamp as UTC and convert to local time
            const date = new Date(memory.created_at + (memory.created_at.includes('Z') ? '' : 'Z'));
            
            // Format date in user's local timezone with full details
            const formattedDate = date.toLocaleString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short'
            });
            
            // Detect if text contains Hebrew characters
            const hasHebrew = /[\u0590-\u05FF]/.test(memory.memory_text);
            const textDirectionClass = hasHebrew ? 'rtl-text' : 'ltr-text';
            
            memoryElement.innerHTML = `
                <div class="memory-header">
                    <div class="memory-author">👤 ${this.escapeHtml(memory.user_name)}</div>
                    <div class="memory-date">🕒 ${formattedDate}</div>
                </div>
                <div class="memory-text ${textDirectionClass}">${this.escapeHtml(memory.memory_text)}</div>
            `;
            
            container.appendChild(memoryElement);
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    openMemoryModal() {
        document.getElementById('memoryModal').style.display = 'block';
        this.loadRTLPreference();
        document.getElementById('memoryTextInput').focus();
        this.updateCharCounter();
        this.setupEmojiPicker();
    }

    closeMemoryModal() {
        document.getElementById('memoryModal').style.display = 'none';
        // Clear the form
        document.getElementById('memoryTextInput').value = '';
        this.updateCharCounter();
    }

    updateCharCounter() {
        const textarea = document.getElementById('memoryTextInput');
        const counter = document.getElementById('charCount');
        const length = textarea.value.length;
        counter.textContent = length;
        
        // Change color if approaching limit
        if (length > 900) {
            counter.style.color = '#e74c3c';
        } else if (length > 800) {
            counter.style.color = '#f39c12';
        } else {
            counter.style.color = '#7f8c8d';
        }
    }

    loadUserName() {
        const savedName = localStorage.getItem('gardenMemoryUserName');
        if (savedName) {
            document.getElementById('userNameInput').value = savedName;
        }
    }

    saveUserName() {
        const userName = document.getElementById('userNameInput').value.trim();
        if (userName) {
            localStorage.setItem('gardenMemoryUserName', userName);
        }
    }

    async saveMemory() {
        const userName = document.getElementById('userNameInput').value.trim();
        const memoryText = document.getElementById('memoryTextInput').value.trim();
        
        if (!userName) {
            this.showError('Please enter your name');
            document.getElementById('userNameInput').focus();
            return;
        }
        
        if (!memoryText) {
            this.showError('Please enter a memory');
            document.getElementById('memoryTextInput').focus();
            return;
        }
        
        if (memoryText.length > 1000) {
            this.showError('Memory text is too long (maximum 1000 characters)');
            return;
        }
        
        try {
            // Disable save button during submission
            const saveBtn = document.getElementById('saveMemoryBtn');
            const originalText = saveBtn.textContent;
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            
            const response = await fetch('/api/memories', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_name: userName,
                    memory_text: memoryText
                })
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                this.saveUserName(); // Save the username for future use
                this.closeMemoryModal();
                this.showSuccess('Memory saved successfully! 🌱');
                await this.loadMemories(); // Reload memories to show the new one
                
                // Notify other tabs/windows about the new memory
                this.notifyMemoryUpdate();
            } else {
                this.showError('Failed to save memory: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error saving memory:', error);
            this.showError('Failed to save memory');
        } finally {
            // Re-enable save button
            const saveBtn = document.getElementById('saveMemoryBtn');
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showMessage(message, type) {
        // Remove existing messages
        const existingMessages = document.querySelectorAll('.success, .error');
        existingMessages.forEach(msg => msg.remove());
        
        // Create new message
        const messageDiv = document.createElement('div');
        messageDiv.className = type;
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            background: ${type === 'success' ? '#27ae60' : '#e74c3c'};
            color: white;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
            text-align: center;
            font-weight: 500;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;
        
        // Insert at the top of the container
        const container = document.querySelector('.memories-container');
        const header = document.querySelector('.memories-header');
        container.insertBefore(messageDiv, header.nextSibling);
        
        // Auto-hide after a few seconds
        setTimeout(() => {
            if (messageDiv && messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, type === 'success' ? 3000 : 5000);
    }

    notifyMemoryUpdate() {
        // Use localStorage to communicate between tabs
        // Set a timestamp to trigger storage event in other tabs
        localStorage.setItem('memoryUpdated', Date.now().toString());
        
        // Remove the item immediately to allow for future notifications
        setTimeout(() => {
            localStorage.removeItem('memoryUpdated');
        }, 100);
    }

    setupEmojiPicker() {
        // Add click listeners to emoji spans
        const emojis = document.querySelectorAll('#memoryModal .emoji');
        emojis.forEach(emoji => {
            emoji.addEventListener('click', () => {
                this.insertEmoji(emoji.getAttribute('data-emoji'));
            });
        });
    }

    insertEmoji(emojiChar) {
        const textarea = document.getElementById('memoryTextInput');
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        
        // Insert emoji at cursor position
        const newText = text.substring(0, start) + emojiChar + text.substring(end);
        textarea.value = newText;
        
        // Update cursor position
        const newCursorPos = start + emojiChar.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        
        // Update character counter
        this.updateCharCounter();
        
        // Focus back to textarea
        textarea.focus();
    }

    toggleRTL() {
        const textarea = document.getElementById('memoryTextInput');
        const toggle = document.getElementById('rtlToggle');
        const toggleText = document.getElementById('rtlToggleText');
        
        const isRTL = textarea.classList.contains('rtl-text');
        
        if (isRTL) {
            // Switch to LTR
            textarea.classList.remove('rtl-text');
            textarea.classList.add('ltr-text');
            toggle.classList.remove('active');
            toggleText.textContent = 'א→ Hebrew';
            localStorage.setItem('gardenMemoryRTL', 'false');
        } else {
            // Switch to RTL
            textarea.classList.remove('ltr-text');
            textarea.classList.add('rtl-text');
            toggle.classList.add('active');
            toggleText.textContent = '←A English';
            localStorage.setItem('gardenMemoryRTL', 'true');
        }
        
        textarea.focus();
    }

    loadRTLPreference() {
        const isRTL = localStorage.getItem('gardenMemoryRTL') === 'true';
        const textarea = document.getElementById('memoryTextInput');
        const toggle = document.getElementById('rtlToggle');
        const toggleText = document.getElementById('rtlToggleText');
        
        if (isRTL) {
            textarea.classList.add('rtl-text');
            textarea.classList.remove('ltr-text');
            toggle.classList.add('active');
            toggleText.textContent = '←A English';
        } else {
            textarea.classList.add('ltr-text');
            textarea.classList.remove('rtl-text');
            toggle.classList.remove('active');
            toggleText.textContent = 'א→ Hebrew';
        }
    }

    getTextDirection() {
        return localStorage.getItem('gardenMemoryRTL') === 'true' ? 'rtl' : 'ltr';
    }
}

// Initialize memories page when DOM loads
let memoriesPage;
document.addEventListener('DOMContentLoaded', () => {
    memoriesPage = new MemoriesPage();
});

// Add form styling
const style = document.createElement('style');
style.textContent = `
    .form-group {
        margin-bottom: 20px;
    }
    
    .form-group label {
        display: block;
        margin-bottom: 8px;
        font-weight: 500;
        color: #2c3e50;
    }
    
    .form-group input,
    .form-group textarea {
        width: 100%;
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 5px;
        font-size: 14px;
        font-family: inherit;
        box-sizing: border-box;
        resize: vertical;
    }
    
    .form-group input:focus,
    .form-group textarea:focus {
        outline: none;
        border-color: #3498db;
        box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.1);
    }
    
    .form-group small {
        display: block;
        margin-top: 5px;
        color: #7f8c8d;
        font-size: 12px;
    }
    
    .char-counter {
        text-align: right;
        margin-top: 5px;
        font-size: 12px;
        color: #7f8c8d;
    }
`;
document.head.appendChild(style);
