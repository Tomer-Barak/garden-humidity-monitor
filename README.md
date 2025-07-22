# Garden Multi-Sensor Humidity Monitoring System

![Garden Dashboard](web_ui/static/icons/garden-192.png)

## Introduction

The Garden Multi-Sensor Humidity Monitoring System is a comprehensive IoT solution designed to monitor soil moisture levels using ESP32 microcontrollers. The system provides real-time data collection, storage, and visualization capabilities through a web-based dashboard. This scalable architecture supports multiple sensors per device and offers historical data analysis for informed irrigation management.

## Overview

Optimal soil moisture management is essential for healthy plant growth and efficient water usage. Manual monitoring methods are labor-intensive and provide limited temporal coverage. This system addresses these challenges by providing automated, continuous monitoring capabilities with data logging and trend analysis.

## System Architecture

The system implements a three-tier architecture comprising sensor nodes, data processing server, and user interface:

- **ESP32 Microcontrollers**: Each device supports multiple capacitive soil moisture sensors, allowing for detailed monitoring of different garden zones.
- **Python Flask Server**: A lightweight server collects data from ESP32 devices, stores it in a SQLite database, and serves a web-based dashboard.
- **Responsive Web Dashboard**: A user-friendly interface visualizes soil moisture trends, enabling gardeners to make informed decisions.

## Features

- **Multi-Sensor Support**: Each ESP32 can handle up to 3 sensors, with customizable configurations.
- **Real-Time Monitoring**: Continuous data collection with adjustable intervals.
- **Data Storage**: Historical readings are stored in a SQLite database.
- **Interactive Dashboard**: Visualize trends, filter data by device or sensor, and view multiple sensors on the same chart.
- **Garden Memory Book**: A collaborative journaling system for tracking observations, discoveries, and gardening notes with emoji support.
- **Progressive Web App (PWA)**: Mobile-responsive dashboard with offline capability for cross-platform access.
- **Automated Data Management**: Configurable data retention policies with automatic cleanup routines.
- **Multi-Language Support**: Hebrew/RTL text support for international users.

## System Architecture

```
┌─────────────────┐      HTTP      ┌──────────────┐      HTTP      ┌─────────────┐
│  ESP32 with     │ ───────────────▶ Python Flask ◀────────────── │ Web Browser │
│ Multiple Sensors│  JSON Payload  │    Server    │  JSON/HTML     │  Dashboard  │
│ (3 sensors max) │                │   + Memory   │                │ + Memory    │
└─────────────────┘                │     API      │                │   Book      │
                                    └──────────────┘                └─────────────┘
                                          │
                                          │ SQLite
                                          ▼
                                    ┌──────────────┐
                                    │  humidity.db │
                                    │ + memories   │
                                    │   table      │
                                    └──────────────┘
```

## Implementation Details

### ESP32 Firmware

The ESP32 microcontroller firmware performs analog-to-digital conversion of capacitive soil moisture sensor readings, applies calibration algorithms to convert raw values to humidity percentages, and transmits structured data to the server via HTTP POST requests. Each sensor is uniquely identified by name and GPIO pin assignment.

### Python Flask Server

The server application implements RESTful API endpoints for data ingestion and retrieval. It maintains persistent storage using SQLite database and provides both raw data access and aggregated statistics. The server also hosts the web dashboard and implements configurable data retention policies.

### Web Dashboard

The responsive web interface provides real-time monitoring capabilities and historical data visualization through interactive charts. Features include device and sensor filtering, multi-sensor comparison views, and mobile-optimized design patterns.

### Garden Memory Book

The Garden Memory Book is a collaborative journaling feature that enables family members and gardeners to document their observations, discoveries, and gardening experiences. This feature transforms the monitoring system from a purely technical tool into a shared family garden diary.

#### Key Features

- **Collaborative Journaling**: Multiple family members can contribute memories and observations
- **Rich Text Support**: Full emoji support with an organized emoji picker featuring 90+ garden-related emojis
- **Persistent Storage**: All memories are stored in the database and persist across sessions
- **Multi-Language Support**: Hebrew/RTL text support with automatic text direction detection
- **Real-Time Sync**: Cross-tab communication ensures all open instances stay synchronized
- **Dual Interface**: 
  - **Dashboard Memory Card**: Quick view of the latest memory with easy access to write new ones
  - **Dedicated Memory Book**: Full browsing experience with all historical memories

#### Use Cases

The Memory Book bridges the gap between technical data and human experience:

- **Seasonal Observations**: "🌱 First tomato sprouts appeared today! Humidity levels have been perfect at 65% 📊"
- **Problem Tracking**: "🐛 Found aphids on the roses 😰 Applied organic spray 🧴 - let's monitor if humidity changes help"
- **Success Stories**: "🎉 First harvest of the season! 🥕🥬 The consistent moisture monitoring really paid off 👍"
- **Family Collaboration**: "👨‍🌾 Dad: Watered the garden this morning 💧" / "👩‍🌾 Mom: Plants look much happier now! 😊"
- **Learning Documentation**: "🤔 Noticed humidity drops quickly on sunny days ☀️ - might need automatic watering system"

#### Technical Implementation

- **Database Storage**: Memories are stored with user names, timestamps, and full text content
- **Cross-Platform Sync**: localStorage-based communication keeps all browser tabs synchronized
- **Smart Text Direction**: Automatic Hebrew text detection with manual RTL/LTR toggle
- **User Persistence**: Browser remembers user names for quick future entries
- **Responsive Design**: Optimized for both desktop and mobile devices

This feature transforms raw sensor data into meaningful family memories, creating a comprehensive record of gardening experiences that combines technical insights with human observations.

## Installation and Configuration

### Hardware Requirements

- ESP32 development board (ESP32-WROOM-32 or compatible)
- Capacitive soil moisture sensors (maximum 3 per ESP32 unit)
- Regulated power supply (3.3V/5V depending on sensor specifications)
- Host system for server deployment (Linux/Windows/macOS)

### Software Setup

#### ESP32 Firmware Deployment

1. Install Arduino IDE with ESP32 board support package.
2. Install required libraries: WiFi, HTTPClient, ArduinoJson.
3. Configure network and server parameters by copying `config.h.example` to `config.h`.
4. Update WiFi credentials and server IP address in configuration file.
5. Adjust sensor pin assignments and calibration parameters as needed.
6. Compile and upload firmware to ESP32 device.

#### Server Installation

1. Ensure Python 3.6+ runtime environment.
2. Install dependencies:
   ```
   pip install flask pytz
   ```
3. Configure server parameters in `server.py` (port, database path, retention policies).
4. Launch server:
   ```
   python server.py
   ```

#### Dashboard Access

Access the web interface at:
```
http://[server-ip]:8080
```

## API Documentation

The server exposes RESTful endpoints for data management and system monitoring:

### Sensor Data Endpoints
- **POST /humidity**: Submit sensor readings in JSON format.
- **GET /humidity/latest**: Retrieve most recent readings from all sensors.
- **GET /humidity/history**: Query historical data with optional filtering parameters.
- **GET /humidity/stats**: Obtain statistical summaries and aggregated metrics.

### Memory Book Endpoints
- **GET /api/memories**: Retrieve garden memories (latest only or all with `?all=true` parameter).
- **POST /api/memories**: Add a new garden memory with user name and text content.

### System Endpoints
- **GET /health**: System health check and status monitoring.
- **GET /memories**: Access the dedicated Garden Memory Book interface.

## Configuration Options

### ESP32 Sensor Configuration

Modify `config.h` to specify sensor array parameters:
```cpp
#define NUM_SENSORS 3
#define HUMIDITY_PINS {32, 33, 34}
#define SENSOR_NAMES {"Garden_1", "Garden_2", "Garden_3"}
```

### Server Configuration

Adjust operational parameters in the `CONFIG` dictionary within `server.py`:
```python
CONFIG = {
    'host': '0.0.0.0',
    'port': 8080,
    'database': 'humidity.db',
    'log_file': 'humidity_server.log',
    'cleanup_days': 30,
    'timezone': 'Asia/Jerusalem'
}
```

## Development Roadmap

### Completed Features ✅
- ✅ Garden Memory Book with collaborative journaling
- ✅ Emoji support with organized picker (90+ garden-related emojis)
- ✅ Hebrew/RTL text support with automatic detection
- ✅ Cross-tab synchronization for real-time updates
- ✅ Dual memory interface (dashboard card + dedicated book)

### Future Enhancements
- Implementation of authentication and authorization mechanisms
- Alert system for threshold-based notifications
- Support for additional sensor types (temperature, light intensity, pH)
- Mobile application development for push notifications
- Integration with automated irrigation control systems
- Memory search and filtering capabilities
- Photo attachments for garden memories
- Seasonal memory organization and tagging

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Technical Support

- Flask Framework: Official documentation and community support
- ESP32 Platform: Comprehensive documentation and developer resources

## Author

**Tomer Barak** - System architect and lead developer
