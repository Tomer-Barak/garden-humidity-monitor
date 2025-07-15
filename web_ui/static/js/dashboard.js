class HumidityDashboard {
    constructor() {
        this.chart = null;
        this.refreshInterval = null;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadDevices();
        await this.loadData();
        this.startAutoRefresh();
    }

    setupEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => this.loadData());
        document.getElementById('deviceSelect').addEventListener('change', () => this.loadData());
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

    async loadData() {
        const deviceId = document.getElementById('deviceSelect').value;
        const hours = document.getElementById('timeRange').value;
        
        try {
            // Update status indicator
            document.getElementById('status').className = 'status-indicator online';
            
            // Load stats
            await this.loadStats(deviceId, hours);
            
            // Load history for chart
            await this.loadHistory(deviceId, hours);
            
            // Load recent readings
            await this.loadRecentReadings(deviceId);
            
        } catch (error) {
            console.error('Error loading data:', error);
            document.getElementById('status').className = 'status-indicator';
            this.showError('Failed to load data');
        }
    }

    async loadStats(deviceId, hours) {
        const params = new URLSearchParams();
        if (deviceId) params.append('device_id', deviceId);
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

    async loadHistory(deviceId, hours) {
        const params = new URLSearchParams();
        if (deviceId) params.append('device_id', deviceId);
        params.append('hours', hours);

        const response = await fetch(`/humidity/history?${params}`);
        const data = await response.json();

        if (data.status === 'success') {
            this.updateChart(data.readings);
        }
    }

    async loadRecentReadings(deviceId) {
        const params = new URLSearchParams();
        if (deviceId) params.append('device_id', deviceId);
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

        const labels = sortedReadings.map(r => {
            // server_timestamp is already in Israel time with timezone info
            const date = new Date(r.created_at);
            return date.toLocaleTimeString('en-GB', { 
                hour: '2-digit',
                minute: '2-digit'
            });
        });
        const humidityData = sortedReadings.map(r => r.humidity_percent);

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Humidity %',
                    data: humidityData,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,  // Hide data points
                    pointHoverRadius: 6,  // Show larger point on hover
                    pointHoverBackgroundColor: '#3498db',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2
                }]
            },
            options: {
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
            }
        });
    }

    updateTable(readings) {
        const tbody = document.querySelector('#readingsTable tbody');
        tbody.innerHTML = '';

        if (!readings || readings.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="4" style="text-align: center; color: #7f8c8d;">No recent readings available</td>';
            tbody.appendChild(row);
            return;
        }

        readings.forEach(reading => {
            const row = document.createElement('tr');
            // server_timestamp is already in Israel time with timezone info
            const date = new Date(reading.created_at);
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

// Add some additional CSS for device badges
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
`;
document.head.appendChild(style);
