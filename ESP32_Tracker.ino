#include <HardwareSerial.h>

// ----------------------------------------------------------------
//  SETTINGS FOR ESP32-C3 + A7670C (NTFY.SH HTTP POST)
// ----------------------------------------------------------------
#define MODEM_RX_PIN 9
#define MODEM_TX_PIN 10

HardwareSerial SerialAT(1);

String url = "http://ntfy.sh/gps-tracker-hub-8376c"; 
String deviceId = "A7670C_01";

unsigned long lastTime = 0;
unsigned long timerDelay = 10000; 

// Helper to wait for response
String waitForResponse(String expected, unsigned long timeout) {
  unsigned long start = millis();
  String response = "";
  while (millis() - start < timeout) {
    while (SerialAT.available()) {
      char c = SerialAT.read();
      response += c;
    }
    if (response.indexOf(expected) != -1) return response;
  }
  return response;
}

void initModem() {
  Serial.println(">> Initializing Modem...");
  SerialAT.println("AT");
  delay(500);
  SerialAT.println("AT+HTTPTERM"); // Close previous if any
  delay(500);
  
  // Clean Buffer
  while(SerialAT.available()) SerialAT.read();
  
  SerialAT.println("AT+HTTPINIT");
  waitForResponse("OK", 5000);
  
  SerialAT.println("AT+HTTPPARA=\"URL\",\"" + url + "\"");
  waitForResponse("OK", 5000);
}

void setup() {
  Serial.begin(115200);
  SerialAT.begin(115200, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN);
  delay(5000); // Wait for modem boot
  
  initModem();
}

void loop() {
  // Check if modem reset itself (Power issue check)
  if (SerialAT.available()) {
    String line = SerialAT.readStringUntil('\n');
    Serial.print("MODEM: "); Serial.println(line);
    if (line.indexOf("*ATREADY") != -1 || line.indexOf("PB DONE") != -1) {
       Serial.println(">> Modem Reset Detected! Re-initializing...");
       delay(2000);
       initModem();
    }
  }

  if ((millis() - lastTime) > timerDelay) {
    
    // Gen Data
    float lat = 13.555 + (random(0,100)/1000.0);
    float lng = 100.555 + (random(0,100)/1000.0);
    String dataMsg = deviceId + "," + String(lat,6) + "," + String(lng,6) + ",ACTIVE";
    
    Serial.println("\n--- Sending Data ---");
    Serial.println(dataMsg);
    
    // 1. Prepare Data
    // We check if AT+HTTPDATA gives DOWNLOAD or ERROR
    // If ERROR, we might need to Re-Init
    
    SerialAT.print("AT+HTTPDATA=");
    SerialAT.print(dataMsg.length());
    SerialAT.println(",5000"); 
    
    String resp = waitForResponse("DOWNLOAD", 3000);
    
    if (resp.indexOf("DOWNLOAD") != -1) {
      // 2. Send Actual Data
      SerialAT.print(dataMsg);
      waitForResponse("OK", 3000);
      
      // 3. POST Action
      SerialAT.println("AT+HTTPACTION=1");
      
    } else {
      Serial.println(">> Failed to get DOWNLOAD prompt. Re-initializing...");
      initModem();
    }
    
    lastTime = millis();
  }
}
