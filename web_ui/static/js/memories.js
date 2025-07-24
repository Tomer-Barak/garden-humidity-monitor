class MemoriesPage {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadMemories();
    }

    setupEventListeners() {
        // No event listeners needed for viewing memories
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
                    <p style="margin-top: 15px;">
                        <a href="/" style="color: #3498db; text-decoration: none; font-weight: 500;">
                            🏠 Go to Dashboard to write your first memory
                        </a>
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        
        memories.forEach(memory => {
            this.addMemoryElement(container, memory);
        });
    }



    addMemoryElement(container, memory) {
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
        
        // Photo HTML
        const photoHtml = memory.photo_filename ? 
            `<div class="memory-photo">
                <img src="/api/memories/photos/${memory.photo_filename}" 
                     alt="Memory photo" 
                     onclick="memoriesPage.showPhotoModal('${memory.photo_filename}')">
            </div>` : '';
        
        memoryElement.innerHTML = `
            <div class="memory-header">
                <div class="memory-author">👤 ${this.escapeHtml(memory.user_name)}</div>
                <div class="memory-date">🕒 ${formattedDate}</div>
                <button class="delete-memory-btn" onclick="memoriesPage.deleteMemory(${memory.id})" title="Delete this memory">
                    🗑️
                </button>
            </div>
            <div class="memory-text ${textDirectionClass}">${this.escapeHtml(memory.memory_text)}</div>
            ${photoHtml}
        `;
        
        container.appendChild(memoryElement);
    }    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }



    async deleteMemory(memoryId) {
        if (!confirm('Are you sure you want to delete this memory? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`/api/memories/${memoryId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.status === 'success') {
                this.showSuccess('Memory deleted successfully! 🗑️');
                await this.loadMemories(); // Reload memories to remove the deleted one
            } else {
                this.showError('Failed to delete memory: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error deleting memory:', error);
            this.showError('Failed to delete memory: ' + error.message);
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



    showPhotoModal(filename) {
        // Create photo modal if it doesn't exist
        let modal = document.getElementById('photoModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'photoModal';
            modal.className = 'photo-modal';
            modal.innerHTML = `
                <span class="photo-modal-close">&times;</span>
                <div class="photo-modal-content">
                    <img src="/api/memories/photos/${filename}" alt="Memory photo">
                </div>
            `;
            document.body.appendChild(modal);
            
            // Add click handlers
            modal.querySelector('.photo-modal-close').onclick = () => {
                modal.style.display = 'none';
            };
            
            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            };
        } else {
            // Update image source
            modal.querySelector('img').src = `/api/memories/photos/${filename}`;
        }
        
        modal.style.display = 'block';
    }
}

// Initialize memories page when DOM loads
let memoriesPage;
document.addEventListener('DOMContentLoaded', () => {
    memoriesPage = new MemoriesPage();
});

// Add styling for memory display
const style = document.createElement('style');
style.textContent = `
    .delete-memory-btn {
        background: none;
        border: none;
        font-size: 16px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        transition: background-color 0.2s ease;
        margin-left: auto;
    }
    
    .delete-memory-btn:hover {
        background-color: rgba(231, 76, 60, 0.1);
    }
    
    .memory-header {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .memory-author, .memory-date {
        flex-shrink: 0;
    }
    
    .photo-modal {
        display: none;
        position: fixed;
        z-index: 1000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0,0,0,0.8);
    }
    
    .photo-modal-content {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        max-width: 90%;
        max-height: 90%;
    }
    
    .photo-modal-content img {
        width: 100%;
        height: auto;
        border-radius: 8px;
    }
    
    .photo-modal-close {
        position: absolute;
        top: 20px;
        right: 35px;
        color: white;
        font-size: 40px;
        font-weight: bold;
        cursor: pointer;
    }
    
    .photo-modal-close:hover {
        opacity: 0.7;
    }
`;
document.head.appendChild(style);
