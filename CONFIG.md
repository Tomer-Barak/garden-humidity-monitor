# Garden Multi-Sensor Humidity Monitoring - Configuration Guide

## Multi-Sensor ESP32 Configuration Setup

The ESP32 code now supports multiple humidity sensors per device and uses a separate configuration file for better security and easier management.

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

// Multi-Sensor Hardware Configuration
#define NUM_SENSORS 3
#define HUMIDITY_PINS {32, 33, 34}  // GPIO pins for your sensors
#define SENSOR_NAMES {"Garden_1", "Garden_2", "Garden_3"}  // Custom sensor names
```

### Step 2: Customize Sensor Configuration

**Default Configuration (3 Sensors):**
- Sensor 1: GPIO 32, named "Garden_1" 
- Sensor 2: GPIO 33, named "Garden_2"
- Sensor 3: GPIO 34, named "Garden_3"

**For Different Numbers of Sensors:**

**Single Sensor Setup:**
```cpp
#define NUM_SENSORS 1
#define HUMIDITY_PINS {32}
#define SENSOR_NAMES {"Main_Garden"}
```

**Two Sensor Setup:**
```cpp
#define NUM_SENSORS 2
#define HUMIDITY_PINS {32, 33}
#define SENSOR_NAMES {"Front_Garden", "Back_Garden"}
```

**Maximum Recommended (6 Sensors):**
```cpp
#define NUM_SENSORS 6
#define HUMIDITY_PINS {32, 33, 34, 35, 36, 39}
#define SENSOR_NAMES {"Zone_1", "Zone_2", "Zone_3", "Zone_4", "Zone_5", "Zone_6"}
```

### Step 3: GPIO Pin Selection

**Recommended ESP32 ADC Pins:**
- **ADC1 (Preferred)**: 32, 33, 34, 35, 36, 39
- **ADC2 (Use with caution)**: 0, 2, 4, 12, 13, 14, 15, 25, 26, 27

**Note**: ADC2 pins may have conflicts with WiFi. Use ADC1 pins when possible.

**Pin Characteristics:**
- **Pins 34, 35, 36, 39**: Input-only pins (no pull-up resistors)
- **Pins 32, 33**: Full GPIO functionality
- **Avoid**: Pins 6-11 (connected to flash memory)

### Step 4: Upload to ESP32

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

## Multi-Sensor Dashboard Usage

Once configured, the dashboard provides:

1. **Device Selection**: Choose specific ESP32 devices
2. **Sensor Selection**: Filter by individual sensors within a device
3. **Multi-Sensor Charts**: View multiple sensors with different colors
4. **Sensor Status**: See which sensors are active and their last readings

**Dashboard Features:**
- Automatic sensor detection
- Color-coded sensor identification
- Individual sensor statistics
- Time-based filtering per sensor
- Export capabilities (future feature)

## Migration from Single-Sensor Setup

**Existing Users:** The system automatically migrates single-sensor data:

1. **Database Migration**: Existing data is preserved with NULL sensor_id values
2. **Backward Compatibility**: Old ESP32 code continues to work
3. **Gradual Upgrade**: Update ESP32 devices one by one
4. **Mixed Environment**: Single and multi-sensor devices can coexist

## Troubleshooting Configuration

### Common Issues:

**Sensors Not Detected:**
- Check GPIO pin assignments in `HUMIDITY_PINS`
- Verify sensor connections
- Monitor serial output for sensor readings

**Compilation Errors:**
- Ensure array sizes match `NUM_SENSORS`
- Check for missing commas in pin/name arrays
- Verify all required libraries are installed

**Dashboard Issues:**
- Clear browser cache after updates
- Check browser console for JavaScript errors
- Verify server is receiving sensor data (check logs)

### Testing Multi-Sensor Setup:

1. **Serial Monitor**: Watch for sensor readings from all configured sensors
2. **Server Logs**: Verify data reception with sensor identification
3. **Dashboard**: Check that all sensors appear in the dropdown menus
4. **API Testing**: Use `/api/sensors` endpoint to verify sensor registration

## Server Configuration (server.py)

The server automatically supports multi-sensor data and uses the following default configuration:

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

**Multi-Sensor Features:**
- Automatic sensor detection and registration
- Sensor-based filtering in API endpoints
- Enhanced dashboard with sensor selection
- Backward compatibility with single-sensor data

## Sensor Calibration

Adjust these values based on your specific soil moisture sensors (applies to all sensors):

```cpp
const int DRY_VALUE = 3250;  // ADC value when completely dry
const int WET_VALUE = 1000;  // ADC value when completely wet
```

**To calibrate:**
1. Take readings with sensors in dry soil/air (note the values)
2. Take readings with sensors in wet soil/water (note the values)
3. Update DRY_VALUE and WET_VALUE in `config.h`
4. All sensors will use the same calibration values

**Per-Sensor Calibration (Advanced):**
If your sensors require different calibration values, you can modify the firmware to support individual sensor calibration arrays.
