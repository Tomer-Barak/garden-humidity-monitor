class HumidityDashboard {
    constructor() {
        this.chart = null;
        this.refreshInterval = null;
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
                    const displayName = sensor.sensor_id || `Pin ${sensor.sensor_pin}`;
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

        const response = await fetch(`/humidity/history?${params}`);
        const data = await response.json();

        if (data.status === 'success') {
            this.updateChart(data.readings);
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

    updateChart(readings) {
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
            
            const sensorName = selectedSensor || sensorKeys[0] || 'Humidity';
            
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
                options: this.getChartOptions()
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
                
                datasets.push({
                    label: sensorKey,
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
                options: this.getChartOptions()
            });
        }
    }

    getChartOptions() {
        return {
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
            const sensorInfo = reading.sensor_id ? reading.sensor_id : (reading.sensor_pin ? `Pin ${reading.sensor_pin}` : 'Unknown');
            
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
