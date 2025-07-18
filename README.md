# Garden Multi-Sensor Humidity Monitoring System

## Introduction

This project began as a simple idea: to monitor soil moisture levels in a garden using ESP32 microcontrollers. Over time, it evolved into a robust system capable of handling multiple sensors per device, storing data in a database, and visualizing trends through a responsive web dashboard. The goal was to create a solution that is not only functional but also scalable and easy to use for anyone interested in smart gardening.

## The Problem

Maintaining optimal soil moisture is critical for healthy plant growth, but manually checking soil conditions can be time-consuming and inconsistent. I wanted to automate this process, enabling real-time monitoring and historical analysis of soil moisture levels across multiple areas of a garden.

## The Solution

The Garden Multi-Sensor Humidity Monitoring System combines hardware, software, and web technologies to provide a complete solution:

- **ESP32 Microcontrollers**: Each device supports multiple capacitive soil moisture sensors, allowing for detailed monitoring of different garden zones.
- **Python Flask Server**: A lightweight server collects data from ESP32 devices, stores it in a SQLite database, and serves a web-based dashboard.
- **Responsive Web Dashboard**: A user-friendly interface visualizes soil moisture trends, enabling gardeners to make informed decisions.

## Features

- **Multi-Sensor Support**: Each ESP32 can handle up to 3 sensors, with customizable configurations.
- **Real-Time Monitoring**: Continuous data collection with adjustable intervals.
- **Data Storage**: Historical readings are stored in a SQLite database.
- **Interactive Dashboard**: Visualize trends, filter data by device or sensor, and view multiple sensors on the same chart.
- **Progressive Web App (PWA)**: Install the dashboard on mobile devices for easy access.
- **Automatic Cleanup**: Old data is purged to manage database size.

## System Architecture

```
┌─────────────────┐      HTTP      ┌──────────────┐      HTTP      ┌─────────────┐
│  ESP32 with     │ ───────────────▶ Python Flask ◀────────────── │ Web Browser │
│ Multiple Sensors│  JSON Payload  │    Server    │  JSON/HTML     │  Dashboard  │
│ (3 sensors max) │                │              │                │             │
└─────────────────┘                └──────────────┘                └─────────────┘
                                          │
                                          │ SQLite
                                          ▼
                                    ┌──────────────┐
                                    │  humidity.db │
                                    │ (with sensor │
                                    │ identification)│
                                    └──────────────┘
```

## How It Works

### ESP32 Firmware

The ESP32 reads analog values from soil moisture sensors, converts them to humidity percentages, and sends the data to the server via HTTP POST requests. Each sensor is identified by name and GPIO pin.

### Python Flask Server

The server receives data from ESP32 devices, stores it in a SQLite database, and provides API endpoints for retrieving and visualizing the data. It also serves the web dashboard.

### Web Dashboard

The dashboard is a responsive interface that allows users to:
- View real-time and historical data
- Filter data by device or sensor
- Visualize trends with interactive charts

## Getting Started

### Hardware Requirements

- ESP32 development board
- Capacitive soil moisture sensors (up to 3 per ESP32)
- Power supply for ESP32
- Server/computer to run the Python application

### Software Setup

#### ESP32

1. Install the Arduino IDE and ESP32 board support.
2. Install required libraries: WiFi, HTTPClient, ArduinoJson.
3. Open `esp32.ino` in the Arduino IDE.
4. Copy `config.h.example` to `config.h` and update it with your WiFi credentials and server IP.
5. Adjust pin configuration and calibration values in `config.h` if needed.
6. Upload the sketch to your ESP32.

#### Python Server

1. Ensure Python 3.6+ is installed.
2. Install required packages:
   ```
   pip install flask pytz
   ```
3. Configure server settings in `server.py` (e.g., port, database path).
4. Run the server:
   ```
   python server.py
   ```

#### Web Dashboard

Access the dashboard by navigating to:
```
http://[server-ip]:8080
```

## API Endpoints

The server provides several API endpoints for interacting with the data:
- **POST /humidity**: Submit humidity data.
- **GET /humidity/latest**: Retrieve the latest readings.
- **GET /humidity/history**: Retrieve historical data.
- **GET /humidity/stats**: Retrieve statistical data.
- **GET /health**: Check server health.

## Customization

### ESP32 Configuration

Modify `config.h` to adjust the number of sensors, GPIO pins, and sensor names:
```cpp
#define NUM_SENSORS 3
#define HUMIDITY_PINS {32, 33, 34}
#define SENSOR_NAMES {"Garden_1", "Garden_2", "Garden_3"}
```

### Server Settings

Update the `CONFIG` dictionary in `server.py` to customize server behavior:
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

## Future Plans

- Add authentication for the dashboard.
- Implement alerts for low humidity levels.
- Support additional sensor types (e.g., temperature, light).
- Develop a mobile app for notifications.
- Integrate automated irrigation control.

## License

This project is open-source and available under the [MIT License](LICENSE).

## Acknowledgments

- The Flask team for their excellent web framework.
- The ESP32 community for their support and documentation.

## Contributors

- **Tomer Barak** - Project creator and developer.
