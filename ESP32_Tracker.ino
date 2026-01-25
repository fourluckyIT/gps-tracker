#include <HardwareSerial.h>

// ----------------------------------------------------------------
//  A7670C DIRECT TO VERCEL (SSL/HTTPS)
// ----------------------------------------------------------------
#define MODEM_RX_PIN 9
#define MODEM_TX_PIN 10

HardwareSerial SerialAT(1);

// *** ใส่ Vercel URL ของพี่ตรงนี้ *** 
// เช่น "https://gps-tracker-abcd.vercel.app/api/track"
String vercelUrl = "YOUR_VERCEL_URL_HERE/api/track"; 

String deviceId = "A7670C_DIRECT";
unsigned long lastTime = 0;
unsigned long timerDelay = 10000; 

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
  Serial.println(">> Init Modem (Direct Vercel SSL)...");
  SerialAT.println("AT");
  delay(500);
  SerialAT.println("AT+HTTPTERM");
  delay(500);
  while(SerialAT.available()) SerialAT.read();
  
  SerialAT.println("AT+HTTPINIT");
  waitForResponse("OK", 5000);
  
  // Basic SSL Config for A7670C (Ignore Cert Check)
  // 0 = No SSL, 1 = SSL without Context, ... depends on firmware
  // Usually AT+HTTPSSL=1 works for A7670C Series
  Serial.println(">> Enabling SSL...");
  SerialAT.println("AT+HTTPSSL=1"); 
  waitForResponse("OK", 5000);
  
  SerialAT.println("AT+HTTPPARA=\"URL\",\"" + vercelUrl + "\"");
  waitForResponse("OK", 5000);
  
  // Important: Set Content-Type to text/plain for our CSV API
  SerialAT.println("AT+HTTPPARA=\"CONTENT\",\"text/plain\"");
  waitForResponse("OK", 5000);
}

void setup() {
  Serial.begin(115200);
  SerialAT.begin(115200, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN);
  delay(5000);
  
  initModem();
}

void loop() {
  // Auto-Recovery
  if (SerialAT.available()) {
    String line = SerialAT.readStringUntil('\n');
    if (line.indexOf("*ATREADY") != -1 || line.indexOf("PB DONE") != -1) {
       Serial.println(">> Modem Reset! Re-init...");
       delay(2000);
       initModem();
    }
  }

  if ((millis() - lastTime) > timerDelay) {
    if (vercelUrl.indexOf("YOUR_VERCEL") != -1) {
       Serial.println(">> PLEASE SET VERCEL URL IN CODE <<");
       lastTime = millis();
       return;
    }

    float lat = 13.555 + (random(0,100)/1000.0);
    float lng = 100.555 + (random(0,100)/1000.0);
    
    // CSV Format: ID, LAT, LNG, STATUS
    String dataMsg = deviceId + "," + String(lat,6) + "," + String(lng,6) + ",DIRECT_SSL";
    
    Serial.println("\n--- Sending Direct to Vercel ---");
    Serial.println(dataMsg);
    
    SerialAT.print("AT+HTTPDATA=");
    SerialAT.print(dataMsg.length());
    SerialAT.println(",5000"); 
    
    String resp = waitForResponse("DOWNLOAD", 3000);
    
    if (resp.indexOf("DOWNLOAD") != -1) {
      SerialAT.print(dataMsg);
      waitForResponse("OK", 3000);
      
      SerialAT.println("AT+HTTPACTION=1"); // POST
      
    } else {
      Serial.println(">> Failed to get DOWNLOAD. Re-init...");
      initModem();
    }
    
    lastTime = millis();
  }
}
