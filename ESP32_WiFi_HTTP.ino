#include <WiFi.h>
#include <HTTPClient.h>

// 🔧 CONFIGURATION 🔧
const char* ssid = "YOUR_WIFI_NAME";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "http://143.14.200.117/api/track"; // HTTP POST Endpoint

// Mock Location (Ayutthaya)
float lat = 14.356857;
float lng = 100.610772;

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);

  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi Connected!");
  Serial.print("IP: "); Serial.println(WiFi.localIP());
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "text/plain");

    // 📦 Construct Packet using MAC Address
    // Format: MAC, STATUS LAT, LNG, TIMESTAMP
    String mac = WiFi.macAddress();
    String status = "1"; // Status Code
    unsigned long timestamp = millis() / 1000;

    // Payload: "ff:ff:...,1 14.35..., 100.61..., 12345"
    String payload = mac + "," + status + " " + String(lat, 6) + ", " + String(lng, 6) + ", " + String(timestamp);

    Serial.println("Sending: " + payload);

    int httpResponseCode = http.POST(payload);

    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("Response: " + String(httpResponseCode) + " -> " + response);
    } else {
      Serial.print("Error on sending POST: ");
      Serial.println(httpResponseCode);
    }

    http.end();
  }

  // Simulate movement
  lat += 0.0001; 
  delay(5000); // Send every 5 seconds
}
