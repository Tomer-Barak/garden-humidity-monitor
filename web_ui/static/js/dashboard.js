class HumidityDashboard {
    constructor() {
        this.chart = null;
        this.refreshInterval = null;
        this.sensorNames = this.loadCustomSensorNames();
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadDevices();
        await this.loadSensors();
        await this.loadData();
        this.startAutoRefresh();
    }

    setupEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => this.loadData());
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
    }

    // Custom sensor names management
    loadCustomSensorNames() {
        try {
            const stored = localStorage.getItem('customSensorNames');
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.error('Error loading custom sensor names:', error);
            return {};
        }
    }

    saveCustomSensorNames(names) {
        try {
            localStorage.setItem('customSensorNames', JSON.stringify(names));
            this.sensorNames = names;
        } catch (error) {
            console.error('Error saving custom sensor names:', error);
        }
    }

    getDisplayName(sensorId, deviceId) {
        const key = `${deviceId}:${sensorId}`;
        return this.sensorNames[key] || sensorId || 'Unknown Sensor';
    }

    async openSensorNamesModal() {
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

        sensors.forEach(sensor => {
            const key = `${sensor.device_id}:${sensor.sensor_id}`;
            const currentCustomName = this.sensorNames[key] || '';
            
            const sensorItem = document.createElement('div');
            sensorItem.className = 'sensor-name-item';
            
            sensorItem.innerHTML = `
                <div class="sensor-original-name">
                    ${sensor.sensor_id}
                    <div class="sensor-device-info">Device: ${sensor.device_id}</div>
                </div>
                <input 
                    type="text" 
                    class="sensor-custom-input" 
                    data-sensor-key="${key}"
                    value="${currentCustomName}"
                    placeholder="Enter custom display name..."
                >
            `;
            
            container.appendChild(sensorItem);
        });
    }

    saveSensorNames() {
        const inputs = document.querySelectorAll('.sensor-custom-input');
        const newNames = {};
        
        inputs.forEach(input => {
            const key = input.dataset.sensorKey;
            const value = input.value.trim();
            if (value) {
                newNames[key] = value;
            }
        });
        
        this.saveCustomSensorNames(newNames);
        this.closeSensorNamesModal();
        
        // Refresh the display
        this.loadSensors();
        this.loadData();
        
        // Show confirmation
        this.showSuccess('Sensor names updated successfully!');
    }

    resetSensorNames() {
        if (confirm('Are you sure you want to reset all custom sensor names to their original values?')) {
            this.saveCustomSensorNames({});
            this.closeSensorNamesModal();
            
            // Refresh the display
            this.loadSensors();
            this.loadData();
            
            this.showSuccess('Sensor names reset to default!');
        }
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
        // Target: ~360 data points (same as 1 hour of 10-second intervals)
        const targetDataPoints = 360;
        
        // Only sample if we expect more than 400 data points (small buffer)
        const expectedDataPoints = hours * 360; // 360 readings per hour (10-second intervals)
        if (expectedDataPoints > 400) {
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

        const sensorKeys = Object.keys(sensorGroups);
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
        
        // Show sampling indicator if data was sampled
        this.updateSamplingIndicator(isSampled, readings.length);
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

        // Add subtitle if data is sampled
        if (isSampled) {
            baseOptions.plugins.subtitle = {
                display: true,
                text: 'Data is sampled for performance (~360 points)',
                font: {
                    size: 11,
                    style: 'italic'
                },
                color: '#7f8c8d'
            };
        }

        return baseOptions;
    }

    updateSamplingIndicator(isSampled, dataPointCount) {
        // Remove existing indicator
        const existingIndicator = document.querySelector('.sampling-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        if (isSampled) {
            const indicator = document.createElement('div');
            indicator.className = 'sampling-indicator';
            indicator.style.cssText = `
                background: #f8f9fa;
                border: 1px solid #e9ecef;
                border-radius: 4px;
                padding: 8px 12px;
                margin: 5px 0;
                font-size: 12px;
                color: #6c757d;
                text-align: center;
            `;
            indicator.innerHTML = `
                📊 Data sampled for performance: showing ${dataPointCount} points 
                <span style="font-weight: 500;">(full resolution available for "Last Hour")</span>
            `;
            
            const chartContainer = document.querySelector('.chart-container');
            chartContainer.appendChild(indicator);
        }
    }

    updateTable(readings) {
        const tbody = document.querySelector('#readingsTable tbody');
        tbody.innerHTML = '';

        if (!readings || readings.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="5" style="text-align: center; color: #7f8c8d;">No recent readings available</td>';
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
            
            row.innerHTML = `
                <td>${date.toLocaleString('en-GB', { 
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                })}</td>
                <td><span class="device-badge">${reading.device_id}</span></td>
                <td><span class="sensor-badge">${sensorInfo}</span></td>
                <td><strong>${reading.humidity_percent.toFixed(1)}%</strong></td>
                <td>${reading.raw_value}</td>
            `;
            tbody.appendChild(row);
        });
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
            this.loadData();
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
document.addEventListener('DOMContentLoaded', () => {
    new HumidityDashboard();
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
`;
document.head.appendChild(style);
