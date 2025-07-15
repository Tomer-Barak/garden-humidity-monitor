#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "config.h"  // Include configuration file

// Use configuration values from config.h
const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;
const char* serverIP = SERVER_IP;
const int serverPort = SERVER_PORT;
const char* endpoint = SERVER_ENDPOINT;

// Timing
unsigned long lastSensorRead = 0;
unsigned long lastServerSend = 0;

// Averaging variables
float humiditySum = 0;
int readingCount = 0;
int lastRawValue = 0;  // Store last raw value for server transmission

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Configure ADC for humidity sensor
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
}

void loop() {
  unsigned long currentTime = millis();
  
  // Read sensor every SENSOR_INTERVAL
  if (currentTime - lastSensorRead >= SENSOR_INTERVAL) {
    int rawValue = analogRead(HUMIDITY_PIN);
    float humidityPercent = readHumidity(rawValue);
    
    // Accumulate readings for averaging
    humiditySum += humidityPercent;
    readingCount++;
    lastRawValue = rawValue;  // Store last raw value for server transmission
    
    // Print current reading
    Serial.print("Raw ADC Value: ");
    Serial.print(rawValue);
    Serial.print(" | Humidity: ");
    Serial.print(humidityPercent);
    Serial.println("%");
    
    lastSensorRead = currentTime;
    
    // Send average to server every SERVER_INTERVAL
    if (currentTime - lastServerSend >= SERVER_INTERVAL) {
      float avgHumidity = humiditySum / readingCount;
      Serial.print("Sending average humidity: ");
      Serial.print(avgHumidity);
      Serial.print("% (from ");
      Serial.print(readingCount);
      Serial.println(" readings)");
      
      sendHumidityData(lastRawValue, avgHumidity);
      
      // Reset averaging
      humiditySum = 0;
      readingCount = 0;
      lastServerSend = currentTime;
    }
  }
}

void sendHumidityData(int rawValue, float humidityPercent) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    
    // Create URL
    String url = "http://" + String(serverIP) + ":" + String(serverPort) + endpoint;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    // Create JSON payload
    StaticJsonDocument<200> doc;
    doc["device_id"] = "ESP32_" + WiFi.macAddress();
    doc["raw_value"] = rawValue;
    doc["humidity_percent"] = humidityPercent;
    doc["timestamp"] = millis();
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    // Send POST request
    int httpResponseCode = http.POST(jsonString);
    
    if (httpResponseCode > 0) {
      Serial.print("HTTP Response: ");
      Serial.println(httpResponseCode);
      if (httpResponseCode == 200) {
        Serial.println("Data sent successfully!");
      }
    } else {
      Serial.print("Error sending data: ");
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