#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include "config.h"  // Include configuration file

// ESP32 Multi-Sensor Humidity Monitor
// Supports multiple humidity sensors configured in config.h
// Each sensor is read independently and data is averaged before transmission

// Use configuration values from config.h
const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;
const char* serverIP = SERVER_IP;
const int serverPort = SERVER_PORT;
const char* endpoint = SERVER_ENDPOINT;

// Multiple sensor configuration
const int humidityPins[NUM_SENSORS] = HUMIDITY_PINS;
const char* sensorNames[NUM_SENSORS] = SENSOR_NAMES;

// Timing
unsigned long lastSensorRead = 0;
unsigned long lastServerSend = 0;

// Averaging variables for multiple sensors
struct SensorData {
  float humiditySum;
  int readingCount;
  int lastRawValue;
};

SensorData sensors[NUM_SENSORS];

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Initialize sensor data structures
  for (int i = 0; i < NUM_SENSORS; i++) {
    sensors[i].humiditySum = 0;
    sensors[i].readingCount = 0;
    sensors[i].lastRawValue = 0;
  }

  // Configure ADC for humidity sensors
  analogReadResolution(12);  // Set ADC resolution to 12 bits
  analogSetAttenuation(ADC_11db);  // Set attenuation for 3.3V range

  Serial.println("Connecting to Wi-Fi...");
  WiFi.begin(ssid, password);

  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    attempt++;
    if (attempt > 30) {
      Serial.println("Connection failed.");
      return;
    }
  }

  Serial.println("");
  Serial.println("Connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  // Initialize OTA
  ArduinoOTA.setHostname("ESP32_HumiditySensor");
  ArduinoOTA.setPassword("admin");  // Set OTA password for security

  ArduinoOTA.onStart([]() {
    String type;
    if (ArduinoOTA.getCommand() == U_FLASH) {
      type = "sketch";
    } else { // U_SPIFFS
      type = "filesystem";
    }
    Serial.println("Start updating " + type);
  });

  ArduinoOTA.onEnd([]() {
    Serial.println("\nOTA Update complete!");
  });

  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
  });

  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("Error[%u]: ", error);
    if (error == OTA_AUTH_ERROR) {
      Serial.println("Auth Failed");
    } else if (error == OTA_BEGIN_ERROR) {
      Serial.println("Begin Failed");
    } else if (error == OTA_CONNECT_ERROR) {
      Serial.println("Connect Failed");
    } else if (error == OTA_RECEIVE_ERROR) {
      Serial.println("Receive Failed");
    } else if (error == OTA_END_ERROR) {
      Serial.println("End Failed");
    }
  });

  ArduinoOTA.begin();
  Serial.println("OTA ready");
  Serial.print("OTA hostname: ");
  Serial.println(ArduinoOTA.getHostname());
}

void loop() {
  // Handle OTA updates
  ArduinoOTA.handle();
  
  unsigned long currentTime = millis();
  
  // Read all sensors every SENSOR_INTERVAL
  if (currentTime - lastSensorRead >= SENSOR_INTERVAL) {
    Serial.println("--- Sensor Readings ---");
    
    for (int i = 0; i < NUM_SENSORS; i++) {
      int rawValue = analogRead(humidityPins[i]);
      float humidityPercent = readHumidity(rawValue);
      
      // Accumulate readings for averaging
      sensors[i].humiditySum += humidityPercent;
      sensors[i].readingCount++;
      sensors[i].lastRawValue = rawValue;  // Store last raw value for server transmission
      
      // Print current reading
      Serial.print(sensorNames[i]);
      Serial.print(" (Pin ");
      Serial.print(humidityPins[i]);
      Serial.print(") - Raw: ");
      Serial.print(rawValue);
      Serial.print(" | Humidity: ");
      Serial.print(humidityPercent);
      Serial.println("%");
    }
    
    lastSensorRead = currentTime;
    
    // Send averages to server every SERVER_INTERVAL
    if (currentTime - lastServerSend >= SERVER_INTERVAL) {
      Serial.println("--- Sending Data to Server ---");
      
      for (int i = 0; i < NUM_SENSORS; i++) {
        float avgHumidity = sensors[i].humiditySum / sensors[i].readingCount;
        Serial.print("Sending ");
        Serial.print(sensorNames[i]);
        Serial.print(" average humidity: ");
        Serial.print(avgHumidity);
        Serial.print("% (from ");
        Serial.print(sensors[i].readingCount);
        Serial.println(" readings)");
        
        sendHumidityData(i, sensors[i].lastRawValue, avgHumidity);
        
        // Reset averaging for this sensor
        sensors[i].humiditySum = 0;
        sensors[i].readingCount = 0;
      }
      
      lastServerSend = currentTime;
    }
  }
}

void sendHumidityData(int sensorIndex, int rawValue, float humidityPercent) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    
    // Create URL
    String url = "http://" + String(serverIP) + ":" + String(serverPort) + endpoint;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    // Create JSON payload
    StaticJsonDocument<300> doc;
    doc["device_id"] = "ESP32_" + WiFi.macAddress();
    doc["sensor_id"] = sensorNames[sensorIndex];
    doc["sensor_pin"] = humidityPins[sensorIndex];
    doc["raw_value"] = rawValue;
    doc["humidity_percent"] = humidityPercent;
    doc["timestamp"] = millis();
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    // Send POST request
    int httpResponseCode = http.POST(jsonString);
    
    if (httpResponseCode > 0) {
      Serial.print("HTTP Response for ");
      Serial.print(sensorNames[sensorIndex]);
      Serial.print(": ");
      Serial.println(httpResponseCode);
      if (httpResponseCode == 200) {
        Serial.print("Data sent successfully for ");
        Serial.println(sensorNames[sensorIndex]);
      }
    } else {
      Serial.print("Error sending data for ");
      Serial.print(sensorNames[sensorIndex]);
      Serial.print(": ");
      Serial.println(httpResponseCode);
    }
    
    http.end();
  } else {
    Serial.println("WiFi not connected, cannot send data");
  }
}

float readHumidity(int rawValue) {
  // Convert raw ADC value to humidity percentage
  // Note: Capacitive sensors typically read lower values when wet
  float humidity = map(rawValue, WET_VALUE, DRY_VALUE, 100, 0);
  
  // Constrain to 0-100% range
  humidity = constrain(humidity, 0, 100);
  
  return humidity;
}

// Alternative mapping function if you prefer manual calculation
float readHumidityManual(int rawValue) {
  // Manual calculation method
  float humidity = 100.0 - ((float)(rawValue - WET_VALUE) / (float)(DRY_VALUE - WET_VALUE)) * 100.0;
  
  // Constrain to 0-100% range
  if (humidity < 0) humidity = 0;
  if (humidity > 100) humidity = 100;
  
  return humidity;
}