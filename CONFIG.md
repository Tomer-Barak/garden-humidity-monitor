# Garden Humidity Monitoring - Configuration Template

## ESP32 Configuration Setup

The ESP32 code now uses a separate configuration file for better security and easier management.

### Step 1: Create Configuration File

1. Copy `config.h.example` to `config.h`:
   ```
   cp config.h.example config.h
   ```

2. Edit `config.h` with your actual values:

```cpp
// WiFi Configuration
#define WIFI_SSID "YourActualWiFiName"
#define WIFI_PASSWORD "YourActualPassword"

// Server Configuration  
#define SERVER_IP "192.168.1.100"  // Your actual server IP
```

### Step 2: Upload to ESP32

The `esp32.ino` file will automatically include and use the values from `config.h`.

**Important**: The `config.h` file is excluded from version control (in .gitignore) to keep your credentials safe!

## Alternative Configuration Methods

### Option 1: WiFiManager (Advanced)
You can use the WiFiManager library to configure WiFi through a web portal:

```cpp
#include <WiFiManager.h>

WiFiManager wifiManager;
wifiManager.autoConnect("ESP32-Garden");
```

### Option 2: SPIFFS Configuration (Advanced)
Store configuration in ESP32's flash memory:

```cpp
#include <SPIFFS.h>
#include <ArduinoJson.h>

// Load config from /config.json in SPIFFS
```

## Original Configuration Method

Before uploading the firmware to your ESP32, update these values in the `esp32.ino` file:

```cpp
// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";        // Replace with your WiFi network name
const char* password = "YOUR_WIFI_PASSWORD"; // Replace with your WiFi password

// Server configuration
const char* serverIP = "YOUR_SERVER_IP";     // Replace with your server's IP address
```

## Server Configuration (server.py)

The server uses the following default configuration:

```python
CONFIG = {
    'host': '0.0.0.0',           # Listen on all interfaces
    'port': 8080,                # Web server port
    'database': 'humidity.db',   # SQLite database file
    'log_file': 'humidity_server.log',  # Log file location
    'cleanup_days': 30,          # Days to keep data
    'timezone': 'Asia/Jerusalem' # Timezone for timestamps
}
```

You can modify these values in the `server.py` file to match your requirements.

## Example Network Setup

1. **Find your server's IP address:**
   - On Linux/Mac: `ip addr show` or `ifconfig`
   - On Windows: `ipconfig`

2. **Test connectivity:**
   - Ensure the ESP32 and server are on the same network
   - Test with: `ping YOUR_SERVER_IP`

3. **Firewall considerations:**
   - Make sure port 8080 is accessible from your ESP32
   - Configure firewall rules if necessary

## Hardware Pin Configuration

Default pin assignments in the ESP32 code:

```cpp
const int HUMIDITY_PIN = 32;     // GPIO32 for humidity sensor
const int ADC_RESOLUTION = 4095; // 12-bit ADC resolution
```

## Sensor Calibration

Adjust these values based on your specific soil moisture sensor:

```cpp
const int DRY_VALUE = 3250;  // ADC value when completely dry
const int WET_VALUE = 1000;  // ADC value when completely wet
```

To calibrate:
1. Take a reading with the sensor in dry soil/air (DRY_VALUE)
2. Take a reading with the sensor in wet soil/water (WET_VALUE)
3. Update the values in the code
