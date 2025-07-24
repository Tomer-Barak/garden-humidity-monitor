class HumidityDashboard {
    constructor() {
        this.chart = null;
        this.refreshInterval = null;
        this.sensorConfigs = {};
        this.globalThreshold = 30.0;
        this.selectedFile = null;
        this.cameraStream = null;
        this.currentRotation = 0; // Track current rotation in degrees
        this.setupMemoryUpdateListener();
        this.init();
    }

    async init() {
        this.setupEventListeners();
        
        // Load cached memory immediately for instant display
        this.loadCachedMemory();
        
        // Load configuration and device/sensor data
        await this.loadSensorConfigs();
        await this.loadDevices();
        await this.loadSensors();
        
        // Load fresh data in parallel
        await Promise.all([
            this.loadData(),
            this.loadLatestMemory()
        ]);
        
        // Set initial time range labels based on default selection (24h)
        const initialHours = document.getElementById('timeRange').value;
        this.updateTimeRangeLabels(initialHours);
        
        this.startAutoRefresh();
    }

    setupEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadSensorConfigs(); // Refresh sensor configs when manually refreshing
            this.loadData();
            this.loadLatestMemory(); // Refresh memories too (will use cache first)
        });
        document.getElementById('deviceSelect').addEventListener('change', () => {
            this.loadSensors();
            this.loadData();
        });
        document.getElementById('sensorSelect').addEventListener('change', () => this.loadData());
        document.getElementById('timeRange').addEventListener('change', () => this.loadData());
        
        // Sensor names modal event listeners
        document.getElementById('editSensorNamesBtn').addEventListener('click', () => this.openSensorNamesModal());
        document.getElementById('saveSensorNames').addEventListener('click', () => this.saveSensorNames());
        document.getElementById('resetSensorNames').addEventListener('click', () => this.resetSensorNames());
        document.getElementById('cancelSensorNames').addEventListener('click', () => this.closeSensorNamesModal());
        document.querySelector('.close-modal').addEventListener('click', () => this.closeSensorNamesModal());
        
        // Close modal when clicking outside
        document.getElementById('sensorNamesModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('sensorNamesModal')) {
                this.closeSensorNamesModal();
            }
        });
        
        // Memory modal event listeners
        document.getElementById('writeMemoryBtn').addEventListener('click', () => this.openMemoryModal());
        document.getElementById('viewAllMemoriesBtn').addEventListener('click', () => {
            window.location.href = '/memories';
        });
        document.getElementById('saveMemoryBtn').addEventListener('click', () => this.saveMemory());
        document.getElementById('cancelMemoryBtn').addEventListener('click', () => this.closeMemoryModal());
        document.getElementById('closeMemoryModal').addEventListener('click', () => this.closeMemoryModal());
        
        // Character counter for memory
        document.getElementById('memoryTextInput').addEventListener('input', () => this.updateCharCounter());
        
        // Save username when typing
        document.getElementById('userNameInput').addEventListener('input', () => this.saveUserName());
        
        // Photo functionality
        document.getElementById('selectPhotoBtn').addEventListener('click', () => this.selectPhoto());
        document.getElementById('removePhotoBtn').addEventListener('click', () => this.removePhoto());
        document.getElementById('photoInput').addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Photo rotation controls
        document.getElementById('rotateLeftBtn').addEventListener('click', () => this.rotatePhoto(-90));
        document.getElementById('rotateRightBtn').addEventListener('click', () => this.rotatePhoto(90));
        document.getElementById('resetRotationBtn').addEventListener('click', () => this.resetRotation());
        
        // Close memory modal when clicking outside
        document.getElementById('memoryModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('memoryModal')) {
                this.closeMemoryModal();
            }
        });
        
        // Memory form submission
        document.getElementById('memoryForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveMemory();
        });
        
        // RTL toggle
        document.getElementById('rtlToggle').addEventListener('click', () => this.toggleRTL());
    }

    // Custom sensor names management - now server-side only
    getDisplayName(sensorId, deviceId) {
        const key = `${deviceId}:${sensorId}`;
        // Use server-side config for display name
        const serverConfig = this.sensorConfigs[key];
        if (serverConfig && serverConfig.display_name) {
            return serverConfig.display_name;
        }
        return sensorId || 'Unknown Sensor';
    }

    async loadSensorConfigs() {
        try {
            const response = await fetch('/api/sensor-config');
            const data = await response.json();
            
            if (data.status === 'success') {
                this.globalThreshold = data.global_threshold;
                this.sensorConfigs = {};
                
                console.log('Raw sensor configs from server:', data.sensor_configs); // Debug log
                
                // Convert array to key-value pairs for easier lookup
                data.sensor_configs.forEach(config => {
                    const key = `${config.device_id}:${config.sensor_id}`;
                    this.sensorConfigs[key] = config;
                });
                
                console.log('Processed sensor configs:', this.sensorConfigs); // Debug log
            }
        } catch (error) {
            console.error('Error loading sensor configs:', error);
        }
    }

    async openSensorNamesModal() {
        // Reload sensor configs to get latest data
        await this.loadSensorConfigs();
        // Load all available sensors
        await this.loadAllSensorsForModal();
        document.getElementById('sensorNamesModal').style.display = 'block';
    }

    closeSensorNamesModal() {
        document.getElementById('sensorNamesModal').style.display = 'none';
    }

    async loadAllSensorsForModal() {
        try {
            const response = await fetch('/api/sensors');
            const data = await response.json();
            
            if (data.status === 'success') {
                this.populateSensorNamesForm(data.sensors);
            }
        } catch (error) {
            console.error('Error loading sensors for modal:', error);
        }
    }

    populateSensorNamesForm(sensors) {
        const container = document.getElementById('sensorNamesList');
        container.innerHTML = '';

        if (sensors.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #7f8c8d;">No sensors found. Sensors will appear here once they start sending data.</p>';
            return;
        }

        // Add global threshold section
        const globalSection = document.createElement('div');
        globalSection.className = 'global-threshold-section';
        globalSection.innerHTML = `
            <h4 style="margin: 0 0 15px 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 5px;">
                Global Settings
            </h4>
            <div class="global-threshold-item">
                <label>Global Humidity Threshold (%):</label>
                <input 
                    type="number" 
                    id="globalThresholdInput" 
                    value="${this.globalThreshold}"
                    min="0" 
                    max="100" 
                    step="0.1"
                    placeholder="30.0"
                >
                <small style="color: #7f8c8d;">This threshold applies to sensors without individual thresholds</small>
            </div>
        `;
        container.appendChild(globalSection);

        // Add individual sensors section
        const sensorsSection = document.createElement('div');
        sensorsSection.innerHTML = `
            <h4 style="margin: 20px 0 15px 0; color: #2c3e50; border-bottom: 2px solid #e74c3c; padding-bottom: 5px;">
                Individual Sensor Settings
            </h4>
        `;
        container.appendChild(sensorsSection);

        sensors.forEach(sensor => {
            const key = `${sensor.device_id}:${sensor.sensor_id}`;
            const currentConfig = this.sensorConfigs[key] || {};
            const currentCustomName = currentConfig.display_name || '';
            const currentThreshold = currentConfig.humidity_threshold !== null && currentConfig.humidity_threshold !== undefined ? currentConfig.humidity_threshold : '';
            // Convert SQLite integer (0/1) to boolean properly
            const alertsEnabled = currentConfig.alerts_enabled === 1 || currentConfig.alerts_enabled === true;
            
            // Debug log to see alert state
            console.log(`Sensor ${sensor.sensor_id}: alerts_enabled in config = ${currentConfig.alerts_enabled}, computed alertsEnabled = ${alertsEnabled}`);
            
            const sensorItem = document.createElement('div');
            sensorItem.className = 'sensor-config-item';
            
            sensorItem.innerHTML = `
                <div class="sensor-original-name">
                    ${sensor.sensor_id}
                    <div class="sensor-device-info">Device: ${sensor.device_id}</div>
                </div>
                <div class="sensor-config-inputs">
                    <div class="config-row">
                        <label>Display Name:</label>
                        <input 
                            type="text" 
                            class="sensor-custom-input" 
                            data-sensor-key="${key}"
                            value="${currentCustomName}"
                            placeholder="Enter custom display name..."
                        >
                    </div>
                    <div class="config-row">
                        <label>Humidity Threshold (%):</label>
                        <input 
                            type="number" 
                            class="sensor-threshold-input" 
                            data-sensor-key="${key}"
                            value="${currentThreshold}"
                            min="0" 
                            max="100" 
                            step="0.1"
                            placeholder="Use global (${this.globalThreshold}%)"
                        >
                    </div>
                    <div class="config-row">
                        <label class="alert-toggle">
                            <input 
                                type="checkbox" 
                                class="sensor-alerts-toggle" 
                                data-sensor-key="${key}"
                                ${alertsEnabled ? 'checked' : ''}
                            >
                            <span class="checkmark"></span>
                            Alerts Enabled
                        </label>
                    </div>
                </div>
            `;
            
            container.appendChild(sensorItem);
        });
    }

    async saveSensorNames() {
        const nameInputs = document.querySelectorAll('.sensor-custom-input');
        const thresholdInputs = document.querySelectorAll('.sensor-threshold-input');
        const alertToggles = document.querySelectorAll('.sensor-alerts-toggle');
        const globalThresholdInput = document.getElementById('globalThresholdInput');
        
        // Prepare data for server
        const sensorConfigs = [];
        
        nameInputs.forEach(input => {
            const key = input.dataset.sensorKey;
            // Split only on the last colon to handle device IDs with colons (MAC addresses)
            const lastColonIndex = key.lastIndexOf(':');
            const deviceId = key.substring(0, lastColonIndex);
            const sensorId = key.substring(lastColonIndex + 1);
            const value = input.value.trim();
            
            // Find corresponding threshold and alert settings
            const thresholdInput = document.querySelector(`.sensor-threshold-input[data-sensor-key="${key}"]`);
            const alertToggle = document.querySelector(`.sensor-alerts-toggle[data-sensor-key="${key}"]`);
            
            let threshold = null;
            if (thresholdInput && thresholdInput.value.trim() !== '') {
                const thresholdValue = parseFloat(thresholdInput.value.trim());
                if (!isNaN(thresholdValue) && thresholdValue >= 0) {
                    threshold = thresholdValue;
                }
            }
            
            const alertsEnabled = alertToggle ? alertToggle.checked : true;
            
            sensorConfigs.push({
                device_id: deviceId,
                sensor_id: sensorId,
                display_name: value || null,
                humidity_threshold: threshold,
                alerts_enabled: alertsEnabled
            });
        });
        
        // Prepare request data
        const requestData = {
            sensor_configs: sensorConfigs
        };
        
        // Add global threshold if changed
        if (globalThresholdInput && globalThresholdInput.value) {
            const globalThreshold = parseFloat(globalThresholdInput.value);
            if (globalThreshold > 0) {
                requestData.global_threshold = globalThreshold;
            }
        }
        
        try {
            const response = await fetch('/api/sensor-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                // Reload configs from server
                await this.loadSensorConfigs();
                
                this.closeSensorNamesModal();
                
                // Refresh the display
                await this.loadSensors();
                await this.loadData();
                
                this.showSuccess('Sensor configuration updated successfully!');
            } else {
                this.showError('Failed to update sensor configuration: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error saving sensor configuration:', error);
            this.showError('Failed to save sensor configuration');
        }
    }

    async toggleSensorAlerts(deviceId, sensorId, enabled) {
        try {
            const response = await fetch(`/api/sensor-alerts/${deviceId}/${sensorId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ enabled })
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                // Update local config
                const key = `${deviceId}:${sensorId}`;
                if (!this.sensorConfigs[key]) {
                    this.sensorConfigs[key] = {};
                }
                this.sensorConfigs[key].alerts_enabled = enabled;
                
                const action = enabled ? 'enabled' : 'disabled';
                this.showSuccess(`Alerts ${action} for ${this.getDisplayName(sensorId, deviceId)}`);
            } else {
                this.showError('Failed to update alert settings: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error toggling sensor alerts:', error);
            this.showError('Failed to update alert settings');
        }
    }

    resetSensorNames() {
        if (confirm('Are you sure you want to reset all custom sensor names and thresholds to their default values?')) {
            // Reset server-side config by clearing all display names and thresholds
            // We need to send configs for all existing sensors with null values
            const resetConfigs = [];
            
            // Get all existing sensor configs and reset them
            Object.keys(this.sensorConfigs).forEach(key => {
                const lastColonIndex = key.lastIndexOf(':');
                const deviceId = key.substring(0, lastColonIndex);
                const sensorId = key.substring(lastColonIndex + 1);
                
                resetConfigs.push({
                    device_id: deviceId,
                    sensor_id: sensorId,
                    display_name: null,
                    humidity_threshold: null,
                    alerts_enabled: true
                });
            });
            
            const resetData = {
                global_threshold: 30.0,
                sensor_configs: resetConfigs
            };
            
            fetch('/api/sensor-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(resetData)
            }).then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    this.loadSensorConfigs();
                    this.closeSensorNamesModal();
                    
                    // Refresh the display
                    this.loadSensors();
                    this.loadData();
                    
                    this.showSuccess('Sensor configuration reset to default!');
                } else {
                    this.showError('Failed to reset configuration');
                }
            }).catch(error => {
                console.error('Error resetting configuration:', error);
                this.showError('Failed to reset configuration');
            });
        }
    }

    // Memory functionality
    async loadLatestMemory() {
        // First, try to load cached memory to avoid showing placeholder
        this.loadCachedMemory();
        
        try {
            const response = await fetch('/api/memories');
            const data = await response.json();
            
            if (data.status === 'success' && data.memories.length > 0) {
                const latestMemory = data.memories[0];
                this.displayLatestMemory(latestMemory);
                // Cache the latest memory for future loads
                this.cacheLatestMemory(latestMemory);
            } else {
                // Only show "no memory" if we don't have cached data
                if (!this.hasCachedMemory()) {
                    this.displayNoMemory();
                }
            }
        } catch (error) {
            console.error('Error loading latest memory:', error);
            // Only show "no memory" if we don't have cached data
            if (!this.hasCachedMemory()) {
                this.displayNoMemory();
            }
        }
    }

    loadCachedMemory() {
        const cachedMemory = localStorage.getItem('gardenLatestMemory');
        if (cachedMemory) {
            try {
                const memory = JSON.parse(cachedMemory);
                this.displayLatestMemory(memory, true); // true indicates this is cached data
            } catch (error) {
                console.error('Error parsing cached memory:', error);
                localStorage.removeItem('gardenLatestMemory');
            }
        }
    }

    cacheLatestMemory(memory) {
        try {
            localStorage.setItem('gardenLatestMemory', JSON.stringify(memory));
        } catch (error) {
            console.error('Error caching memory:', error);
        }
    }

    hasCachedMemory() {
        return localStorage.getItem('gardenLatestMemory') !== null;
    }

    displayLatestMemory(memory, isCached = false) {
        const container = document.getElementById('latestMemory');
        
        // Parse timestamp as UTC and convert to local time
        const date = new Date(memory.created_at + (memory.created_at.includes('Z') ? '' : 'Z'));
        
        // Format date in user's local timezone
        const formattedDate = date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });

        // Detect if text contains Hebrew characters
        const hasHebrew = /[\u0590-\u05FF]/.test(memory.memory_text);
        const textDirectionClass = hasHebrew ? 'rtl-text' : 'ltr-text';

        // Add a subtle indicator for cached data
        const cacheIndicator = isCached ? '<span class="cache-indicator" title="Refreshing...">⟳</span>' : '';

        // Photo HTML
        const photoHtml = memory.photo_filename && !memory.photo_filename.startsWith('temp_') ? 
            `<div class="memory-photo">
                <img src="/api/memories/photos/${memory.photo_filename}" 
                     alt="Memory photo" 
                     onclick="dashboard.showPhotoModal('${memory.photo_filename}')">
            </div>` : (memory.photo_filename && memory.photo_filename.startsWith('temp_') ? 
                `<div class="memory-photo">
                    <div class="photo-processing">📸 Photo processing...</div>
                </div>` : '');

        container.innerHTML = `
            <div class="memory-content ${textDirectionClass}">${this.escapeHtml(memory.memory_text)}</div>
            ${photoHtml}
            <div class="memory-meta">
                <span class="memory-author">👤 ${this.escapeHtml(memory.user_name)}</span>
                <span class="memory-date">🕒 ${formattedDate}</span>
                ${cacheIndicator}
            </div>
        `;
    }

    displayNoMemory() {
        const container = document.getElementById('latestMemory');
        container.innerHTML = '<div class="memory-placeholder">No memories yet. Share your first garden observation!</div>';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    openMemoryModal() {
        document.getElementById('memoryModal').style.display = 'block';
        this.loadUserName();
        this.loadRTLPreference();
        document.getElementById('memoryTextInput').focus();
        this.updateCharCounter();
        this.setupEmojiPicker();
        
        // Handle mobile keyboard resize
        this.setupMobileKeyboardHandling();
    }

    closeMemoryModal() {
        document.getElementById('memoryModal').style.display = 'none';
        // Clear the memory text but keep the user name
        document.getElementById('memoryTextInput').value = '';
        this.updateCharCounter();
        this.removePhoto();
        this.stopCamera();
        
        // Clean up mobile keyboard handling
        this.cleanupMobileKeyboardHandling();
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
            
            console.log('Starting memory save process...');
            console.log('User name:', userName);
            console.log('Memory text length:', memoryText.length);
            console.log('Selected file:', this.selectedFile);
            
            // Create FormData for file upload support
            const formData = new FormData();
            formData.append('user_name', userName);
            formData.append('memory_text', memoryText);
            
            if (this.selectedFile) {
                console.log('Adding photo to FormData:', this.selectedFile.name, 'Size:', this.selectedFile.size);
                console.log('File type:', this.selectedFile.type);
                
                // Check file size (10MB limit)
                if (this.selectedFile.size > 10 * 1024 * 1024) {
                    throw new Error('File too large. Maximum size is 10MB.');
                }
                
                formData.append('photo', this.selectedFile);
                
                // Add rotation parameter if there's any rotation applied
                if (this.currentRotation !== 0) {
                    formData.append('rotation', this.currentRotation.toString());
                    console.log('Adding rotation:', this.currentRotation);
                }
            }
            
            console.log('Sending request to /api/memories...');
            
            const response = await fetch('/api/memories', {
                method: 'POST',
                body: formData  // Don't set Content-Type, browser will set it with boundary
            });
            
            console.log('Response received:', response.status, response.statusText);
            
            if (!response.ok) {
                console.error('Response not OK:', response.status, response.statusText);
                const errorText = await response.text();
                console.error('Error response body:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            console.log('Parsing response JSON...');
            const data = await response.json();
            console.log('Response data:', data);
            
            if (data.status === 'success') {
                this.saveUserName(); // Save the username for future use
                this.closeMemoryModal();
                this.showSuccess('Memory saved successfully! 🌱');
                
                // If server returned the memory data, display it immediately
                if (data.memory) {
                    this.displayLatestMemory(data.memory);
                    // Cache the new memory
                    this.cacheLatestMemory(data.memory);
                } else {
                    // Fallback: create a memory object for immediate display
                    const newMemory = {
                        id: data.memory_id,
                        user_name: userName,
                        memory_text: memoryText,
                        photo_filename: this.selectedFile ? `temp_${Date.now()}_${this.selectedFile.name}` : null,
                        created_at: new Date().toISOString()
                    };
                    
                    // Immediately display the new memory (optimistic update)
                    this.displayLatestMemory(newMemory);
                    
                    // Fetch the actual memory from server after a short delay to ensure it's available
                    setTimeout(async () => {
                        await this.loadLatestMemory(); // This will show the actual server data with correct photo path
                    }, 500);
                }
                
                // Clear any old cached memory since we have a new one
                localStorage.removeItem('gardenLatestMemory');
                
                // Notify other tabs about the new memory
                this.notifyMemoryUpdate();
            } else {
                this.showError('Failed to save memory: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error saving memory:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            this.showError('Failed to save memory: ' + error.message);
        } finally {
            // Re-enable save button
            const saveBtn = document.getElementById('saveMemoryBtn');
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    }

    setupMemoryUpdateListener() {
        // Listen for memory updates from other tabs/windows
        window.addEventListener('storage', (e) => {
            if (e.key === 'memoryUpdated' && e.newValue) {
                // A memory was updated in another tab, clear cache and refresh our display
                localStorage.removeItem('gardenLatestMemory');
                this.loadLatestMemory();
            }
        });
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
        
        // Add scroll chaining for better mobile experience
        this.setupEmojiScrollChaining();
    }
    
    setupEmojiScrollChaining() {
        const emojiPicker = document.querySelector('.emoji-picker');
        const modalBody = document.querySelector('#memoryModal .modal-body');
        
        if (!emojiPicker || !modalBody) return;
        
        // Handle mouse wheel events for desktop
        emojiPicker.addEventListener('wheel', (e) => {
            const atTop = emojiPicker.scrollTop === 0;
            const atBottom = emojiPicker.scrollTop >= (emojiPicker.scrollHeight - emojiPicker.clientHeight);
            
            // Always prevent default first to stop immediate bubbling
            e.preventDefault();
            
            // If at boundaries and trying to scroll beyond, manually scroll the modal
            if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
                modalBody.scrollTop += e.deltaY;
            } else {
                // Scroll within the emoji picker
                emojiPicker.scrollTop += e.deltaY;
            }
        });
        
        // Handle touch events for mobile with better logic
        let touchStartY = 0;
        let touchStartScrollTop = 0;
        let isScrollingEmoji = false;
        
        emojiPicker.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
            touchStartScrollTop = emojiPicker.scrollTop;
            isScrollingEmoji = true; // User started touch in emoji area
        }, { passive: true });
        
        emojiPicker.addEventListener('touchmove', (e) => {
            if (!isScrollingEmoji) return;
            
            const touchY = e.touches[0].clientY;
            const touchDeltaY = touchStartY - touchY;
            const currentScrollTop = emojiPicker.scrollTop;
            
            const atTop = currentScrollTop <= 0;
            const atBottom = currentScrollTop >= (emojiPicker.scrollHeight - emojiPicker.clientHeight - 1);
            
            // Always prevent default to stop dual scrolling
            e.preventDefault();
            e.stopPropagation();
            
            // Reduce sensitivity by using a smaller multiplier
            const scrollSensitivity = 0.1; // Much lower sensitivity
            const modalScrollSensitivity = 0.1; // Match emoji scroll sensitivity for consistent feel
            
            // If at boundaries and trying to scroll beyond, scroll the modal instead
            if ((touchDeltaY < 0 && atTop) || (touchDeltaY > 0 && atBottom)) {
                modalBody.scrollTop += touchDeltaY * modalScrollSensitivity;
            } else {
                // Scroll within the emoji picker with reduced sensitivity
                emojiPicker.scrollTop += touchDeltaY * scrollSensitivity;
            }
        }, { passive: false }); // passive: false to allow preventDefault
        
        emojiPicker.addEventListener('touchend', () => {
            isScrollingEmoji = false;
        }, { passive: true });
        
        // Reset flag if touch leaves the emoji area
        emojiPicker.addEventListener('touchleave', () => {
            isScrollingEmoji = false;
        }, { passive: true });
    }
    
    isMobileDevice() {
        // Check for touch capability and screen size
        const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isSmallScreen = window.innerWidth <= 768;
        return hasTouchScreen || isSmallScreen;
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
            textarea.placeholder = 'Share your garden observation, discovery, or note...';
            localStorage.setItem('gardenMemoryRTL', 'false');
        } else {
            // Switch to RTL
            textarea.classList.remove('ltr-text');
            textarea.classList.add('rtl-text');
            toggle.classList.add('active');
            toggleText.textContent = '←A English';
            textarea.placeholder = 'שתפ/י את התצפית, הגילוי או הערה על הגינה שלך...';
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
            textarea.placeholder = 'שתפ/י את התצפית, הגילוי או הערה על הגינה שלך...';
        } else {
            textarea.classList.add('ltr-text');
            textarea.classList.remove('rtl-text');
            toggle.classList.remove('active');
            toggleText.textContent = 'א→ Hebrew';
            textarea.placeholder = 'Share your garden observation, discovery, or note...';
        }
    }

    getTextDirection() {
        return localStorage.getItem('gardenMemoryRTL') === 'true' ? 'rtl' : 'ltr';
    }

    // Mobile keyboard handling for better modal behavior
    setupMobileKeyboardHandling() {
        if (!this.isMobileDevice()) return;
        
        // Store original viewport height
        this.originalViewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        
        // Set up viewport change listeners
        if (window.visualViewport) {
            this.handleViewportChange = this.handleViewportChange.bind(this);
            window.visualViewport.addEventListener('resize', this.handleViewportChange);
        } else {
            // Fallback for older browsers
            this.handleWindowResize = this.handleWindowResize.bind(this);
            window.addEventListener('resize', this.handleWindowResize);
        }
    }
    
    cleanupMobileKeyboardHandling() {
        if (!this.isMobileDevice()) return;
        
        // Remove viewport change listeners
        if (window.visualViewport && this.handleViewportChange) {
            window.visualViewport.removeEventListener('resize', this.handleViewportChange);
        } else if (this.handleWindowResize) {
            window.removeEventListener('resize', this.handleWindowResize);
        }
        
        // Reset any applied styles
        const modal = document.getElementById('memoryModal');
        const modalContent = modal ? modal.querySelector('.modal-content') : null;
        const modalBody = modal ? modal.querySelector('.modal-body') : null;
        
        if (modalContent) {
            modalContent.style.maxHeight = '';
            modalContent.style.marginTop = '';
            modalContent.style.marginBottom = '';
        }
        
        if (modalBody) {
            modalBody.style.maxHeight = '';
        }
    }
    
    handleViewportChange() {
        if (!window.visualViewport) return;
        
        const currentHeight = window.visualViewport.height;
        const heightDifference = this.originalViewportHeight - currentHeight;
        
        // If keyboard is open (height reduced significantly)
        if (heightDifference > 150) {
            this.adjustModalForKeyboard(currentHeight);
        } else {
            this.resetModalSize();
        }
    }
    
    handleWindowResize() {
        const currentHeight = window.innerHeight;
        const heightDifference = this.originalViewportHeight - currentHeight;
        
        // If keyboard is open (height reduced significantly)
        if (heightDifference > 150) {
            this.adjustModalForKeyboard(currentHeight);
        } else {
            this.resetModalSize();
        }
    }
    
    adjustModalForKeyboard(availableHeight) {
        const modal = document.getElementById('memoryModal');
        const modalContent = modal ? modal.querySelector('.modal-content') : null;
        const modalBody = modal ? modal.querySelector('.modal-body') : null;
        
        if (!modalContent || !modalBody) return;
        
        // Calculate available space for modal
        const maxModalHeight = Math.max(availableHeight - 40, 300); // Minimum 300px
        const headerFooterHeight = 140; // Approximate height of header + footer
        const maxBodyHeight = maxModalHeight - headerFooterHeight;
        
        // Apply dynamic sizing
        modalContent.style.maxHeight = `${maxModalHeight}px`
        modalContent.style.marginTop = '20px';
        modalContent.style.marginBottom = '20px';
        modalBody.style.maxHeight = `${Math.max(maxBodyHeight, 200)}px`;
        
        // Ensure the active input stays visible
        this.ensureInputVisible();
    }
    
    resetModalSize() {
        const modal = document.getElementById('memoryModal');
        const modalContent = modal ? modal.querySelector('.modal-content') : null;
        const modalBody = modal ? modal.querySelector('.modal-body') : null;
        
        if (!modalContent || !modalBody) return;
        
        // Reset to CSS defaults
        modalContent.style.maxHeight = '';
        modalContent.style.marginTop = '';
        modalContent.style.marginBottom = '';
        modalBody.style.maxHeight = '';
    }
    
    ensureInputVisible() {
        // Find the currently focused input/textarea
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
            // Small delay to let the keyboard animation finish
            setTimeout(() => {
                activeElement.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center',
                    inline: 'nearest' 
                });
            }, 150);
        }
    }

    // Photo functionality methods
    selectPhoto() {
        document.getElementById('photoInput').click();
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            // Validate file type
            const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                this.showError('Invalid file type. Please select PNG, JPG, JPEG, GIF, or WEBP.');
                return;
            }
            
            // Validate file size (10MB)
            if (file.size > 10 * 1024 * 1024) {
                this.showError('File too large. Maximum size is 10MB.');
                return;
            }
            
            this.selectedFile = file;
            this.showPhotoPreview(file);
        }
    }

    showPhotoPreview(file) {
        const preview = document.getElementById('photoPreview');
        const previewImage = document.getElementById('previewImage');
        const photoName = document.getElementById('photoName');
        const photoSize = document.getElementById('photoSize');
        const removeBtn = document.getElementById('removePhotoBtn');
        const rotationControls = document.getElementById('photoRotationControls');
        
        // Create object URL for preview
        const objectUrl = URL.createObjectURL(file);
        previewImage.src = objectUrl;
        photoName.textContent = file.name;
        photoSize.textContent = this.formatFileSize(file.size);
        
        preview.style.display = 'block';
        removeBtn.style.display = 'inline-flex';
        rotationControls.style.display = 'block';
        
        // Reset rotation
        this.currentRotation = 0;
        this.updatePhotoRotation();
        
        // Clean up previous object URL
        previewImage.onload = () => {
            if (this.previousObjectUrl) {
                URL.revokeObjectURL(this.previousObjectUrl);
            }
            this.previousObjectUrl = objectUrl;
        };
    }

    removePhoto() {
        this.selectedFile = null;
        this.currentRotation = 0;
        document.getElementById('photoPreview').style.display = 'none';
        document.getElementById('removePhotoBtn').style.display = 'none';
        document.getElementById('photoRotationControls').style.display = 'none';
        document.getElementById('photoInput').value = '';
        
        // Clean up object URL
        if (this.previousObjectUrl) {
            URL.revokeObjectURL(this.previousObjectUrl);
            this.previousObjectUrl = null;
        }
        
        this.stopCamera();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    rotatePhoto(degrees) {
        this.currentRotation = (this.currentRotation + degrees) % 360;
        if (this.currentRotation < 0) {
            this.currentRotation += 360;
        }
        this.updatePhotoRotation();
    }

    resetRotation() {
        this.currentRotation = 0;
        this.updatePhotoRotation();
    }

    updatePhotoRotation() {
        const previewImage = document.getElementById('previewImage');
        const rotationDisplay = document.getElementById('rotationDisplay');
        
        // Update rotation display
        rotationDisplay.textContent = `${this.currentRotation}°`;
        
        // Remove all rotation classes
        previewImage.className = previewImage.className.replace(/\brotate-\d+\b/g, '');
        
        // Add appropriate rotation class
        if (this.currentRotation !== 0) {
            previewImage.classList.add(`rotate-${this.currentRotation}`);
        }
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

    showSuccess(message) {
        // Create or update success message
        let successDiv = document.querySelector('.success');
        if (!successDiv) {
            successDiv = document.createElement('div');
            successDiv.className = 'success';
            successDiv.style.cssText = `
                background: #27ae60;
                color: white;
                padding: 10px;
                border-radius: 5px;
                margin: 10px 0;
                text-align: center;
            `;
            document.querySelector('.container').insertBefore(successDiv, document.querySelector('.controls'));
        }
        successDiv.textContent = message;
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (successDiv && successDiv.parentNode) {
                successDiv.parentNode.removeChild(successDiv);
            }
        }, 3000);
    }

    async loadDevices() {
        try {
            const response = await fetch('/api/devices');
            const data = await response.json();
            
            if (data.status === 'success') {
                const select = document.getElementById('deviceSelect');
                select.innerHTML = '<option value="">All Devices</option>';
                
                data.devices.forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.device_id;
                    option.textContent = `${device.device_id} (${device.reading_count} readings)`;
                    select.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading devices:', error);
            this.showError('Failed to load devices');
        }
    }

    async loadSensors() {
        const deviceId = document.getElementById('deviceSelect').value;
        
        try {
            let url = '/api/sensors';
            if (deviceId) {
                url = `/api/devices/${deviceId}/sensors`;
            }
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.status === 'success') {
                const select = document.getElementById('sensorSelect');
                select.innerHTML = '<option value="">All Sensors</option>';
                
                const sensors = data.sensors || [];
                sensors.forEach(sensor => {
                    const option = document.createElement('option');
                    option.value = sensor.sensor_id;
                    const displayName = this.getDisplayName(sensor.sensor_id, sensor.device_id || deviceId);
                    option.textContent = `${displayName} (${sensor.reading_count} readings)`;
                    select.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading sensors:', error);
            this.showError('Failed to load sensors');
        }
    }

    async loadData() {
        const deviceId = document.getElementById('deviceSelect').value;
        const sensorId = document.getElementById('sensorSelect').value;
        const hours = document.getElementById('timeRange').value;
        
        try {
            // Update status indicator
            document.getElementById('status').className = 'status-indicator online';
            
            // Load stats
            await this.loadStats(deviceId, sensorId, hours);
            
            // Load history for chart
            await this.loadHistory(deviceId, sensorId, hours);
            
            // Load recent readings
            await this.loadRecentReadings(deviceId, sensorId);
            
        } catch (error) {
            console.error('Error loading data:', error);
            document.getElementById('status').className = 'status-indicator';
            this.showError('Failed to load data');
        }
    }

    async loadStats(deviceId, sensorId, hours) {
        const params = new URLSearchParams();
        if (deviceId) params.append('device_id', deviceId);
        if (sensorId) params.append('sensor_id', sensorId);
        params.append('hours', hours);

        // Update the card headers to reflect the selected time range
        this.updateTimeRangeLabels(hours);

        const response = await fetch(`/humidity/stats?${params}`);
        const data = await response.json();

        if (data.status === 'success' && data.humidity) {
            document.getElementById('currentHumidity').textContent = 
                data.humidity.current !== null && data.humidity.current !== undefined ? data.humidity.current.toFixed(1) : '--';
            document.getElementById('avgHumidity').textContent = 
                data.humidity.avg !== null && data.humidity.avg !== undefined ? data.humidity.avg.toFixed(1) : '--';
            document.getElementById('minMaxHumidity').textContent = 
                data.humidity.min !== undefined && data.humidity.min !== null ? 
                `${data.humidity.min.toFixed(1)} / ${data.humidity.max.toFixed(1)}` : '--';
            document.getElementById('totalReadings').textContent = data.total_readings || '--';
        } else {
            // No data available
            document.getElementById('currentHumidity').textContent = '--';
            document.getElementById('avgHumidity').textContent = '--';
            document.getElementById('minMaxHumidity').textContent = '--';
            document.getElementById('totalReadings').textContent = '0';
        }
    }

    async loadHistory(deviceId, sensorId, hours) {
        const params = new URLSearchParams();
        if (deviceId) params.append('device_id', deviceId);
        if (sensorId) params.append('sensor_id', sensorId);
        params.append('hours', hours);
        
        // Add sampling for longer time periods to improve performance
        // Target: ~720 data points (double the original 360 for better resolution)
        const targetDataPoints = 720;
        
        // Only sample if we expect more than 800 data points (small buffer)
        const expectedDataPoints = hours * 360; // 360 readings per hour (10-second intervals)
        if (expectedDataPoints > 800) {
            params.append('sample_size', targetDataPoints);
        }

        const response = await fetch(`/humidity/history?${params}`);
        const data = await response.json();

        if (data.status === 'success') {
            this.updateChart(data.readings, data.sampled);
        }
    }

    async loadRecentReadings(deviceId, sensorId) {
        const params = new URLSearchParams();
        if (deviceId) params.append('device_id', deviceId);
        if (sensorId) params.append('sensor_id', sensorId);
        params.append('limit', '10');

        const response = await fetch(`/humidity/latest?${params}`);
        const data = await response.json();

        if (data.status === 'success') {
            this.updateTable(data.readings);
        }
    }

    updateChart(readings, isSampled = false) {
        const ctx = document.getElementById('humidityChart').getContext('2d');
        
        if (this.chart) {
            this.chart.destroy();
        }

        if (!readings || readings.length === 0) {
            // Show empty chart message
            ctx.font = '16px Arial';
            ctx.fillStyle = '#7f8c8d';
            ctx.textAlign = 'center';
            ctx.fillText('No data available', ctx.canvas.width / 2, ctx.canvas.height / 2);
            return;
        }

        // Sort readings by timestamp (oldest first for chart)
        const sortedReadings = readings.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        // Group readings by sensor if we have multiple sensors
        const sensorGroups = {};
        const selectedSensor = document.getElementById('sensorSelect').value;
        
        sortedReadings.forEach(reading => {
            const sensorKey = reading.sensor_id || 'Unknown Sensor';
            if (!sensorGroups[sensorKey]) {
                sensorGroups[sensorKey] = [];
            }
            sensorGroups[sensorKey].push(reading);
        });

        // Sort sensor keys to ensure consistent color assignment
        // ID-ed sensors (garden_1, garden_2, etc.) come first in sorted order
        // Non-ID-ed sensors (Unknown Sensor) come last
        const sensorKeys = Object.keys(sensorGroups).sort((a, b) => {
            // Put "Unknown Sensor" or sensors without proper IDs at the end
            if (a === 'Unknown Sensor' && b !== 'Unknown Sensor') return 1;
            if (b === 'Unknown Sensor' && a !== 'Unknown Sensor') return -1;
            
            // For proper sensor IDs, sort alphabetically/numerically
            // This ensures garden_1, garden_2, garden_3... maintain consistent order
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });
        
        const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#34495e'];
        
        let datasets = [];
        
        // Get current time range for label formatting
        const hours = parseInt(document.getElementById('timeRange').value);
        const isWeekView = hours >= 168 && hours < 720; // 168 hours = 1 week, 720 hours = 1 month
        const isMonthView = hours >= 720; // 720 hours = 1 month
        
        if (selectedSensor || sensorKeys.length === 1) {
            // Single sensor view - use all readings
            let labels, humidityData;
            
            if (isWeekView || isMonthView) {
                // For week and month views, we'll use time-based x-axis
                // Keep the original timestamps for proper time scale
                labels = sortedReadings.map(r => new Date(r.created_at));
                humidityData = sortedReadings.map(r => ({
                    x: new Date(r.created_at),
                    y: r.humidity_percent
                }));
            } else {
                // For shorter periods, use formatted time labels
                labels = sortedReadings.map(r => {
                    const date = new Date(r.created_at);
                    return date.toLocaleTimeString('en-GB', { 
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                });
                humidityData = sortedReadings.map(r => r.humidity_percent);
            }
            
            // Use custom name if available
            let sensorName = selectedSensor || sensorKeys[0] || 'Humidity';
            if (sortedReadings.length > 0) {
                const deviceId = sortedReadings[0].device_id;
                sensorName = this.getDisplayName(sensorName, deviceId);
            }
            
            datasets.push({
                label: sensorName,
                data: humidityData,
                borderColor: colors[0],
                backgroundColor: `${colors[0]}20`,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: colors[0],
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2
            });
            
            this.chart = new Chart(ctx, {
                type: 'line',
                data: { labels: isWeekView || isMonthView ? undefined : labels, datasets },
                options: this.getChartOptions(isSampled, isWeekView, isMonthView)
            });
        } else {
            // Multiple sensors view - create dataset for each sensor
            // Find common time points or use all unique times
            const allTimes = [...new Set(sortedReadings.map(r => r.created_at))].sort();
            let labels;
            
            if (isWeekView || isMonthView) {
                // For week and month views, use actual timestamps
                labels = allTimes.map(time => new Date(time));
            } else {
                // For shorter periods, use formatted time labels
                labels = allTimes.map(time => {
                    const date = new Date(time);
                    return date.toLocaleTimeString('en-GB', { 
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                });
            }
            
            sensorKeys.forEach((sensorKey, index) => {
                const sensorReadings = sensorGroups[sensorKey];
                const color = colors[index % colors.length];
                
                let sensorData;
                if (isWeekView || isMonthView) {
                    // For time-based charts, create x,y data points
                    sensorData = allTimes.map(time => {
                        const reading = sensorReadings.find(r => r.created_at === time);
                        return reading ? {
                            x: new Date(time),
                            y: reading.humidity_percent
                        } : null;
                    }).filter(point => point !== null);
                } else {
                    // For regular charts, use simple array
                    sensorData = allTimes.map(time => {
                        const reading = sensorReadings.find(r => r.created_at === time);
                        return reading ? reading.humidity_percent : null;
                    });
                }
                
                // Use custom name if available
                let displayName = sensorKey;
                if (sensorReadings.length > 0) {
                    const deviceId = sensorReadings[0].device_id;
                    displayName = this.getDisplayName(sensorKey, deviceId);
                }
                
                datasets.push({
                    label: displayName,
                    data: sensorData,
                    borderColor: color,
                    backgroundColor: `${color}20`,
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: color,
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2,
                    spanGaps: true
                });
            });
            
            this.chart = new Chart(ctx, {
                type: 'line',
                data: { labels: isWeekView || isMonthView ? undefined : labels, datasets },
                options: this.getChartOptions(isSampled, isWeekView, isMonthView)
            });
        }
    }

    getChartOptions(isSampled = false, isWeekView = false, isMonthView = false) {
        let xAxisConfig = {
            title: {
                display: true,
                text: 'Time'
            },
            grid: {
                color: 'rgba(0,0,0,0.1)'
            },
            ticks: {
                maxTicksLimit: 12,
                autoSkip: true,
                autoSkipPadding: 10
            }
        };

        if (isWeekView || isMonthView) {
            // Use time scale for week and month views
            xAxisConfig = {
                type: 'time',
                title: {
                    display: true,
                    text: 'Date'
                },
                grid: {
                    color: 'rgba(0,0,0,0.1)'
                },
                time: {
                    tooltipFormat: isMonthView ? 'MMM DD, YYYY' : 'ddd MMM DD, HH:mm',
                    displayFormats: {
                        hour: 'HH:mm',
                        day: isWeekView ? 'ddd DD' : 'MMM DD',
                        week: 'MMM DD',
                        month: 'MMM YYYY'
                    }
                },
                ticks: {
                    source: 'auto',
                    autoSkip: true,
                    maxTicksLimit: isWeekView ? 7 : 15,
                    // Force ticks to align with meaningful boundaries
                    callback: function(value, index, ticks) {
                        const date = new Date(value);
                        if (isWeekView) {
                            // For week view, show ticks at midnight of each day
                            return date.toLocaleDateString('en-GB', { 
                                weekday: 'short',
                                day: 'numeric'
                            });
                        } else if (isMonthView) {
                            // For month view, show dates every few days
                            return date.toLocaleDateString('en-GB', { 
                                day: 'numeric',
                                month: 'short'
                            });
                        }
                        return value;
                    }
                }
            };

            // For week view, configure to show daily ticks
            if (isWeekView) {
                xAxisConfig.time.unit = 'day';
                xAxisConfig.time.stepSize = 1;
            } else if (isMonthView) {
                // For month view, let Chart.js auto-determine but prefer every 2-3 days
                xAxisConfig.time.unit = 'day';
                xAxisConfig.time.stepSize = 2;
            }
        }
        
        const baseOptions = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Humidity (%)'
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.1)'
                    }
                },
                x: xAxisConfig
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            }
        };

        return baseOptions;
    }

    updateTable(readings) {
        const tbody = document.querySelector('#readingsTable tbody');
        tbody.innerHTML = '';

        if (!readings || readings.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="6" style="text-align: center; color: #7f8c8d;">No recent readings available</td>';
            tbody.appendChild(row);
            return;
        }

        readings.forEach(reading => {
            const row = document.createElement('tr');
            // server_timestamp is already in Israel time with timezone info
            const date = new Date(reading.created_at);
            let sensorInfo = reading.sensor_id ? reading.sensor_id : (reading.sensor_pin ? `Pin ${reading.sensor_pin}` : 'Unknown');
            
            // Use custom name if available
            if (reading.sensor_id) {
                sensorInfo = this.getDisplayName(reading.sensor_id, reading.device_id);
            }
            
            // Get alert status for this sensor
            const sensorKey = `${reading.device_id}:${reading.sensor_id}`;
            const sensorConfig = this.sensorConfigs[sensorKey] || {};
            // Convert SQLite integer (0/1) to boolean properly
            const alertsEnabled = sensorConfig.alerts_enabled === 1 || sensorConfig.alerts_enabled === true;
            const threshold = sensorConfig.humidity_threshold || this.globalThreshold;
            const isBelowThreshold = reading.humidity_percent < threshold;
            
            // Alert status column
            let alertStatusHtml = '';
            if (reading.sensor_id) {
                const alertClass = alertsEnabled ? 'alert-enabled' : 'alert-disabled';
                const alertText = alertsEnabled ? '🔔' : '🔕';
                const thresholdInfo = `Threshold: ${threshold}%`;
                const statusClass = isBelowThreshold ? 'below-threshold' : '';
                
                alertStatusHtml = `
                    <span class="alert-status ${alertClass} ${statusClass}" 
                          title="${thresholdInfo}" 
                          onclick="dashboard.toggleSensorAlerts('${reading.device_id}', '${reading.sensor_id}', ${!alertsEnabled})">
                        ${alertText}
                    </span>
                `;
            } else {
                alertStatusHtml = '<span style="color: #bdc3c7;">—</span>';
            }
            
            row.innerHTML = `
                <td>${date.toLocaleString('en-GB', { 
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                })}</td>
                <td><span class="sensor-badge">${sensorInfo}</span></td>
                <td><strong>${reading.humidity_percent.toFixed(1)}%</strong></td>
                <td>${reading.raw_value}</td>
                <td><span class="device-badge">${reading.device_id}</span></td>
                <td>${alertStatusHtml}</td>
            `;
            tbody.appendChild(row);
        });
    }

    updateTimeRangeLabels(hours) {
        // Find the stat cards that need updating
        const avgHeader = document.querySelector('.stat-card:nth-child(2) h3');
        const minMaxHeader = document.querySelector('.stat-card:nth-child(3) h3');
        const totalReadingsHeader = document.querySelector('.stat-card:nth-child(4) h3');
        
        // Update the headers based on the selected time range
        if (avgHeader && minMaxHeader && totalReadingsHeader) {
            let timeText;
            
            // Determine the time text based on hours
            if (hours == 1) {
                timeText = '(1h)';
            } else if (hours == 6) {
                timeText = '(6h)';
            } else if (hours == 24) {
                timeText = '(24h)';
            } else if (hours == 168) {
                timeText = '(1w)';
            } else if (hours == 720) {
                timeText = '(1m)';
            } else {
                timeText = `(${hours}h)`;
            }
            
            // Update the text content
            avgHeader.textContent = `Average ${timeText}`;
            minMaxHeader.textContent = `Min/Max ${timeText}`;
            totalReadingsHeader.textContent = `Total Readings ${timeText}`;
        }
    }

    showError(message) {
        // Create or update error message
        let errorDiv = document.querySelector('.error');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.className = 'error';
            document.querySelector('.container').insertBefore(errorDiv, document.querySelector('.controls'));
        }
        errorDiv.textContent = message;
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (errorDiv && errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }

    startAutoRefresh() {
        // Refresh every 30 seconds
        this.refreshInterval = setInterval(() => {
            this.loadSensorConfigs(); // Keep sensor configs in sync
            this.loadData();
            this.loadLatestMemory(); // Keep memories in sync
        }, 30000);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
}

// Initialize dashboard when page loads
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new HumidityDashboard();
});

// Add some additional CSS for device and sensor badges
const style = document.createElement('style');
style.textContent = `
    .device-badge {
        background: #e3f2fd;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
        color: #1976d2;
        font-weight: 500;
    }
    .sensor-badge {
        background: #f3e5f5;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
        color: #7b1fa2;
        font-weight: 500;
    }
    
    /* Sensor configuration modal styles */
    .sensor-config-item {
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 15px;
        background: #fafafa;
    }
    
    .sensor-config-inputs {
        margin-top: 10px;
    }
    
    .config-row {
        display: flex;
        align-items: center;
        margin-bottom: 10px;
        gap: 10px;
        flex-wrap: wrap;
    }
    
    .config-row label {
        min-width: 140px;
        font-weight: 500;
        color: #555;
        flex-shrink: 0;
    }
    
    .config-row input[type="text"], 
    .config-row input[type="number"] {
        flex: 1;
        min-width: 0;
        max-width: 200px;
        padding: 6px 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-sizing: border-box;
    }
    
    .global-threshold-section {
        background: #f8f9fa;
        border: 2px solid #3498db;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 20px;
    }
    
    .global-threshold-item {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }
    
    .global-threshold-item label {
        font-weight: 500;
        color: #2c3e50;
        min-width: 200px;
        flex-shrink: 0;
    }
    
    .global-threshold-item input {
        padding: 8px 12px;
        border: 1px solid #bdc3c7;
        border-radius: 4px;
        width: 100px;
        box-sizing: border-box;
    }
    
    .global-threshold-item small {
        flex-basis: 100%;
        margin-top: 5px;
    }
    
    /* Alert toggle styles */
    .alert-toggle {
        display: flex;
        align-items: center;
        cursor: pointer;
        user-select: none;
    }
    
    .alert-toggle input[type="checkbox"] {
        display: none;
    }
    
    .checkmark {
        width: 20px;
        height: 20px;
        background: #fff;
        border: 2px solid #bdc3c7;
        border-radius: 4px;
        margin-right: 8px;
        position: relative;
        transition: all 0.2s;
    }
    
    .alert-toggle input:checked + .checkmark {
        background: #27ae60;
        border-color: #27ae60;
    }
    
    .alert-toggle input:checked + .checkmark::after {
        content: '✓';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        font-weight: bold;
        font-size: 12px;
    }
    
    /* Alert status indicators in table */
    .alert-status {
        cursor: pointer;
        font-size: 16px;
        padding: 4px;
        border-radius: 50%;
        transition: all 0.2s;
        display: inline-block;
        width: 24px;
        height: 24px;
        text-align: center;
        line-height: 16px;
    }
    
    .alert-status:hover {
        background: rgba(52, 152, 219, 0.1);
        transform: scale(1.1);
    }
    
    .alert-enabled {
        opacity: 1;
    }
    
    .alert-disabled {
        opacity: 0.4;
        filter: grayscale(100%);
    }
    
    .alert-status.below-threshold {
        background: rgba(231, 76, 60, 0.2);
        border: 1px solid #e74c3c;
    }
    
    /* Cache indicator for memories */
    .cache-indicator {
        color: #95a5a6;
        font-size: 12px;
        margin-left: 8px;
        opacity: 0.7;
        animation: spin 2s linear infinite;
    }
    
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    
    /* Photo processing indicator */
    .photo-processing {
        background: #f8f9fa;
        border: 2px dashed #bdc3c7;
        border-radius: 8px;
        padding: 20px;
        text-align: center;
        color: #7f8c8d;
        font-style: italic;
    }
`;
document.head.appendChild(style);
