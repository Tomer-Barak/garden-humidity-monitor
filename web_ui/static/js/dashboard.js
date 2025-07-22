class HumidityDashboard {
    constructor() {
        this.chart = null;
        this.refreshInterval = null;
        this.sensorConfigs = {};
        this.globalThreshold = 30.0;
        this.setupMemoryUpdateListener();
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadSensorConfigs();
        await this.loadDevices();
        await this.loadSensors();
        await this.loadData();
        await this.loadLatestMemory();
        
        // Set initial time range labels based on default selection (24h)
        const initialHours = document.getElementById('timeRange').value;
        this.updateTimeRangeLabels(initialHours);
        
        this.startAutoRefresh();
    }

    setupEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadSensorConfigs(); // Refresh sensor configs when manually refreshing
            this.loadData();
            this.loadLatestMemory(); // Refresh memories too
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
        try {
            const response = await fetch('/api/memories');
            const data = await response.json();
            
            if (data.status === 'success' && data.memories.length > 0) {
                this.displayLatestMemory(data.memories[0]);
            } else {
                this.displayNoMemory();
            }
        } catch (error) {
            console.error('Error loading latest memory:', error);
            this.displayNoMemory();
        }
    }

    displayLatestMemory(memory) {
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

        container.innerHTML = `
            <div class="memory-content ${textDirectionClass}">${this.escapeHtml(memory.memory_text)}</div>
            <div class="memory-meta">
                <span class="memory-author">👤 ${this.escapeHtml(memory.user_name)}</span>
                <span class="memory-date">🕒 ${formattedDate}</span>
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
    }

    closeMemoryModal() {
        document.getElementById('memoryModal').style.display = 'none';
        // Clear the memory text but keep the user name
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
                await this.loadLatestMemory(); // Reload to show the new memory
                
                // Notify other tabs about the new memory
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

    setupMemoryUpdateListener() {
        // Listen for memory updates from other tabs/windows
        window.addEventListener('storage', (e) => {
            if (e.key === 'memoryUpdated' && e.newValue) {
                // A memory was updated in another tab, refresh our display
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
        
        if (selectedSensor || sensorKeys.length === 1) {
            // Single sensor view - use all readings
            const labels = sortedReadings.map(r => {
                const date = new Date(r.created_at);
                return date.toLocaleTimeString('en-GB', { 
                    hour: '2-digit',
                    minute: '2-digit'
                });
            });
            const humidityData = sortedReadings.map(r => r.humidity_percent);
            
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
                data: { labels, datasets },
                options: this.getChartOptions(isSampled)
            });
        } else {
            // Multiple sensors view - create dataset for each sensor
            // Find common time points or use all unique times
            const allTimes = [...new Set(sortedReadings.map(r => r.created_at))].sort();
            const labels = allTimes.map(time => {
                const date = new Date(time);
                return date.toLocaleTimeString('en-GB', { 
                    hour: '2-digit',
                    minute: '2-digit'
                });
            });
            
            sensorKeys.forEach((sensorKey, index) => {
                const sensorReadings = sensorGroups[sensorKey];
                const color = colors[index % colors.length];
                
                // Map sensor readings to all time points
                const sensorData = allTimes.map(time => {
                    const reading = sensorReadings.find(r => r.created_at === time);
                    return reading ? reading.humidity_percent : null;
                });
                
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
                data: { labels, datasets },
                options: this.getChartOptions(isSampled)
            });
        }
    }

    getChartOptions(isSampled = false) {
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
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.1)'
                    }
                }
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
`;
document.head.appendChild(style);
