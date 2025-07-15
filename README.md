# Garden Humidity Monitoring System

A complete solution for monitoring soil humidity in your garden using ESP32 microcontrollers and a Python web server with a responsive dashboard.

![Garden Dashboard](web_ui/static/icons/garden-192.png)

## Overview

This project allows you to monitor soil moisture levels in your garden using capacitive soil moisture sensors connected to ESP32 microcontrollers. The data is sent to a central server which stores the readings in a SQLite database and provides a web-based dashboard for visualization.

### Features

- **ESP32-based Sensors**: Multiple sensor nodes can be deployed throughout your garden
- **Real-time Monitoring**: Continuous data collection with customizable intervals
- **Data Storage**: SQLite database for storing historical humidity readings
- **Web Dashboard**: Responsive web interface for monitoring humidity levels
- **PWA Support**: The dashboard can be installed as a Progressive Web App on mobile devices
- **Multi-device Support**: Track multiple sensor devices from a single dashboard
- **Data Visualization**: Interactive charts showing humidity trends
- **Automatic Cleanup**: Old data is automatically purged to manage database size

## System Architecture

```
┌─────────────┐      HTTP      ┌──────────────┐      HTTP      ┌─────────────┐
│  ESP32 with │ ───────────────▶ Python Flask ◀────────────── │ Web Browser │
│ Soil Sensor │  JSON Payload  │    Server    │  JSON/HTML     │  Dashboard  │
└─────────────┘                └──────────────┘                └─────────────┘
                                      │
                                      │ SQLite
                                      ▼
                                ┌──────────────┐
                                │  humidity.db │
                                └──────────────┘
```

## Hardware Requirements

- ESP32 development board
- Capacitive soil moisture sensor
- Power supply for ESP32 (battery or wired)
- Server/computer to run the Python application (e.g., Raspberry Pi)

## Software Components

### ESP32 Firmware (esp32.ino)

The ESP32 firmware reads analog values from the soil moisture sensor, converts them to humidity percentages, and sends the data to the server via HTTP POST requests.

### Python Server (server.py)

A Flask-based web server that:
- Receives data from ESP32 devices
- Stores readings in a SQLite database
- Provides API endpoints for retrieving humidity data
- Serves the web dashboard
- Performs automatic data cleanup

### Web Dashboard

A responsive web interface that provides:
- Real-time humidity monitoring
- Historical data visualization with charts
- Device selection and time range filtering
- PWA capabilities for mobile installation

## Installation and Setup

### Security Note

Before deploying this project, make sure to:
- Update the WiFi credentials in `esp32.ino`
- Change the server IP address to match your setup
- Keep sensitive configuration files (like those containing passwords) out of version control

For detailed configuration instructions, see [CONFIG.md](CONFIG.md).

### ESP32 Setup

1. Install the Arduino IDE and ESP32 board support
2. Install required libraries:
   - WiFi
   - HTTPClient
   - ArduinoJson
3. Open `esp32.ino` in the Arduino IDE
4. **Create your configuration file:**
   - Copy `config.h.example` to `config.h`
   - Edit `config.h` with your actual WiFi credentials and server IP
   - The `config.h` file is git-ignored for security
5. Adjust the pin configuration and calibration values in `config.h` if needed
6. Upload the sketch to your ESP32

### Server Setup

1. Ensure Python 3.6+ is installed
2. Install required Python packages:
   ```
   pip install flask pytz
   ```
3. Configure the server settings in `server.py` if needed:
   - Port number
   - Database path
   - Log file location
   - Data retention period
4. Run the server:
   ```
   python server.py
   ```

### Accessing the Dashboard

Once the server is running, access the dashboard by navigating to:
```
http://[server-ip]:8080
```

## API Endpoints

The server provides the following API endpoints:

- **POST /humidity**: Receives humidity data from ESP32 devices
- **GET /humidity/latest**: Returns the most recent humidity readings
- **GET /humidity/history**: Returns historical readings for a specified time period
- **GET /humidity/stats**: Returns statistical data about humidity readings
- **GET /health**: Health check endpoint
- **GET /api/devices**: Returns a list of all devices that have sent data

## Database Schema

The system uses a SQLite database with the following schema:

```sql
CREATE TABLE humidity_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    raw_value INTEGER NOT NULL,
    humidity_percent REAL NOT NULL,
    esp32_timestamp INTEGER,
    server_timestamp TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

## Customization

### ESP32 Calibration

The ESP32 firmware includes calibration values for the soil moisture sensor:
- `DRY_VALUE`: The ADC reading when the sensor is completely dry (default: 3250)
- `WET_VALUE`: The ADC reading when the sensor is completely wet (default: 1000)

You may need to adjust these values based on your specific sensor.

### Server Configuration

The server configuration is stored in the `CONFIG` dictionary in `server.py`:
```python
CONFIG = {
    'host': '0.0.0.0',
    'port': 8080,
    'database': 'humidity.db',
    'log_file': 'humidity_server.log',
    'log_level': logging.INFO,
    'cleanup_days': 30,
    'timezone': 'Asia/Jerusalem'
}
```

## Troubleshooting

- **ESP32 Connection Issues**: Ensure WiFi credentials are correct and the server is reachable
- **Sensor Reading Problems**: Check wiring and calibration values
- **Server Not Starting**: Verify that the port is not in use by another application
- **Database Errors**: Check file permissions for the database file
- **Missing Data**: Verify that the ESP32 is successfully sending data by checking the logs

## Future Improvements

- Add authentication for the dashboard
- Implement email/SMS alerts for low humidity levels
- Add support for additional sensor types (temperature, light, etc.)
- Create a mobile app for notifications
- Add water pump control for automated irrigation

## License

This project is open-source and available under the [MIT License](LICENSE).

## Contributors

- **Tomer Barak** - Initial work and project creator

## Acknowledgments

- The Flask team for the excellent web framework
- The ESP32 community for their support and documentation
