#include <HardwareSerial.h>

// ----------------------------------------------------------------
//  SCENARIO SIMULATOR (4 BUTTONS)
//  Format: ID, EVENT, STATS, LAT, LNG, TIME
// ----------------------------------------------------------------

// --- PIN DEFINITIONS (ESP32-C3 SuperMini) ---
// Note: Use internal Pull-up. Connect Button to GND.
#define BTN_STOLEN  2  // Button 1: Event 888 (Stolen)
#define BTN_MOVE_B  3  // Button 2: Move to Point B
#define BTN_MOVE_C  4  // Button 3: Move to Point C
#define BTN_CRASH   5  // Button 4: Event 777/666 (Crash/Recover)

#define MODEM_RX_PIN 9
#define MODEM_TX_PIN 10

HardwareSerial SerialAT(1);

String serverUrl = "http://143.14.200.117/api/track"; 
String deviceId = "A7670C_WALKER";

// --- COORDINATES ---
// Start: 13.816589, 100.640261
float startLat = 13.816589;
float startLng = 100.640261;

// Point B: 13.817343, 100.640117
float destBLat = 13.817343;
float destBLng = 100.640117;

// Point C: 13.816353, 100.638860
float destCLat = 13.816353;
float destCLng = 100.638860;

// Current State
float currentLat = startLat;
float currentLng = startLng;
bool isCrashed = false;

unsigned long lastDebounce = 0;
int lastBtn4State = HIGH;

String waitForResponse(String expected, unsigned long timeout) {
  unsigned long start = millis();
  String response = "";
  while (millis() - start < timeout) {
    while (SerialAT.available()) response += (char)SerialAT.read();
    if (response.indexOf(expected) != -1) return response;
  }
  return response;
}

void initModem() {
  Serial.println(">> Init Modem...");
  SerialAT.println("AT"); delay(500);
  SerialAT.println("AT+HTTPTERM"); delay(500); 
  while(SerialAT.available()) SerialAT.read();
  SerialAT.println("AT+HTTPINIT"); waitForResponse("OK", 3000);
  SerialAT.println("AT+HTTPPARA=\"URL\",\"" + serverUrl + "\""); waitForResponse("OK", 3000);
  SerialAT.println("AT+HTTPPARA=\"CONTENT\",\"text/plain\""); waitForResponse("OK", 3000);
}

void sendPacket(String eventID, String status, float lat, float lng, bool sendToServer) {
  String packet = deviceId + "," + 
                  eventID + "," + 
                  status + "," + 
                  String(lat, 6) + "," + 
                  String(lng, 6) + "," + 
                  String(millis()/1000);

  Serial.println("LOG: " + packet); // Show in Serial Monitor

  if (sendToServer) {
    Serial.println(">> Uploading to Server...");
    SerialAT.print("AT+HTTPDATA=");
    SerialAT.print(packet.length());
    SerialAT.println(",2000");
    if (waitForResponse("DOWNLOAD", 3000).indexOf("DOWNLOAD") != -1) {
       SerialAT.print(packet);
       waitForResponse("OK", 2000);
       SerialAT.println("AT+HTTPACTION=1");
       
       // Wait for Result Code (colon is important to skip Echo)
       String response = waitForResponse("+HTTPACTION:", 10000); 
       Serial.println(">> Server Response: " + response);

       if (response.indexOf(",200,") != -1) {
          Serial.println(">> Upload Success (200 OK)");
       } else {
          Serial.println(">> Upload FAILED or Error Code");
       }
    } else {
       SerialAT.println("AT+HTTPTERM");
       initModem();
    }
  }
}

void moveCar(float targetLat, float targetLng) {
  Serial.println(">> Moving Car...");
  float stepLat = (targetLat - currentLat) / 50.0;
  float stepLng = (targetLng - currentLng) / 50.0;

  for (int i=0; i<50; i++) {
    currentLat += stepLat;
    currentLng += stepLng;
    // Show in Serial ONLY (No Webhook)
    sendPacket("000", "MOVING", currentLat, currentLng, false);
    delay(100); // 100ms * 50 = 5 seconds total move time
  }
  
  // Final Arrived Packet (Send to Server)
  sendPacket("000", "ARRIVED", currentLat, currentLng, true);
}

void setup() {
  Serial.begin(115200);
  SerialAT.begin(115200, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN);
  
  pinMode(BTN_STOLEN, INPUT_PULLUP);
  pinMode(BTN_MOVE_B, INPUT_PULLUP);
  pinMode(BTN_MOVE_C, INPUT_PULLUP);
  pinMode(BTN_CRASH, INPUT_PULLUP);

  delay(3000);
  initModem();
  
  // Initial Position Report
  Serial.println(">> Ready at Start Position");
  sendPacket("000", "READY", currentLat, currentLng, true);
}

void loop() {
  // Button 1: Stolen (888)
  if (digitalRead(BTN_STOLEN) == LOW) {
    delay(200); // Debounce
    sendPacket("888", "STOLEN_ALERT", currentLat, currentLng, true);
    while(digitalRead(BTN_STOLEN) == LOW); // Wait release
  }

  // Button 2: Move to B
  if (digitalRead(BTN_MOVE_B) == LOW) {
    delay(200);
    moveCar(destBLat, destBLng);
    while(digitalRead(BTN_MOVE_B) == LOW);
  }

  // Button 3: Move to C
  if (digitalRead(BTN_MOVE_C) == LOW) {
    delay(200);
    moveCar(destCLat, destCLng);
    while(digitalRead(BTN_MOVE_C) == LOW);
  }

  // Button 4: Crash Toggle (777 / 666)
  if (digitalRead(BTN_CRASH) == LOW) {
    delay(200);
    if (!isCrashed) {
      isCrashed = true;
      sendPacket("777", "CRASH_DETECTED", currentLat, currentLng, true);
    } else {
      isCrashed = false;
      sendPacket("666", "RECOVERED", currentLat, currentLng, true);
    }
    while(digitalRead(BTN_CRASH) == LOW);
  }
}
