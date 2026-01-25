#include <HardwareSerial.h>

// ----------------------------------------------------------------
//  MODE: SIMULATION (RANDOM WALK)
//  Format: ID, EVENT, STATS, LAT, LNG, TIME
// ----------------------------------------------------------------
#define MODEM_RX_PIN 9
#define MODEM_TX_PIN 10

HardwareSerial SerialAT(1);

// !!! VPS IP + API ENDPOINT !!!
String serverUrl = "http://143.14.200.117/api/track"; 
String deviceId = "A7670C_WALKER";

unsigned long lastTime = 0;
// HTTP LIMIT: Minimum 3000ms-5000ms. Do NOT set lower than 3000.
unsigned long timerDelay = 3000; 

// Simulation State
float currentLat = 13.7563;
float currentLng = 100.5018;
int eventCount = 0;

String waitForResponse(String expected, unsigned long timeout) {
  unsigned long start = millis();
  String response = "";
  while (millis() - start < timeout) {
    while (SerialAT.available()) {
      char c = SerialAT.read();
      Serial.write(c); 
      response += c;
    }
    if (response.indexOf(expected) != -1) return response;
  }
  return response;
}

void initModem() {
  Serial.println(">> Init Modem...");
  SerialAT.println("AT");
  delay(500);
  SerialAT.println("AT+HTTPTERM");
  delay(500); 
  while(SerialAT.available()) SerialAT.read();
  SerialAT.println("AT+HTTPINIT");
  waitForResponse("OK", 3000);
  SerialAT.println("AT+HTTPPARA=\"URL\",\"" + serverUrl + "\"");
  waitForResponse("OK", 3000);
  SerialAT.println("AT+HTTPPARA=\"CONTENT\",\"text/plain\"");
  waitForResponse("OK", 3000);
}

void setup() {
  Serial.begin(115200);
  SerialAT.begin(115200, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN);
  delay(3000);
  initModem();
  
  // Random Seed
  randomSeed(analogRead(0));
}

void loop() {
  while (SerialAT.available()) Serial.write(SerialAT.read());

  if ((millis() - lastTime) > timerDelay) {
    eventCount++;
    
    // 1. Random Walk Logic (Move ~10 meters)
    currentLat += (random(-100, 100) / 100000.0);
    currentLng += (random(-100, 100) / 100000.0);
    
    // 2. Prepare Data: ID, EVENT, STATS, LAT, LNG, TIME
    // Note: ESP32 time is just millis() here unless synced. Using millis/1000.
    String packet = deviceId + "," + 
                    String(eventCount) + "," + 
                    "WALKING" + "," + 
                    String(currentLat, 6) + "," + 
                    String(currentLng, 6) + "," + 
                    String(millis()/1000);

    Serial.println("\n--- Sending: " + packet + " ---");
    
    // 3. Send via HTTP
    SerialAT.print("AT+HTTPDATA=");
    SerialAT.print(packet.length());
    SerialAT.println(",2000"); // Reduced timeout for speed
    
    if (waitForResponse("DOWNLOAD", 3000).indexOf("DOWNLOAD") != -1) {
       SerialAT.print(packet);
       waitForResponse("OK", 2000);
       SerialAT.println("AT+HTTPACTION=1");
       
       // Note: We don't verify 200 OK here to save time for the next loop
       // Just wait a bit and go
       waitForResponse("+HTTPACTION", 3000); 
    } else {
       SerialAT.println("AT+HTTPTERM"); // Reset HTTP if stuck
       initModem();
    }

    lastTime = millis();
  }
}
