#include "TimeLib.h"
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>
#include <TinyGPSPlus.h>

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(0x53);
TinyGPSPlus gps;
BLEScan *pBLEScan;

namespace mainFunc {
int wakeupPin = 0;
float thresthold = 2.25;  // m/s^2   เเรงสั่นสะเทือน (Alarm)
float fallDetect = 75.0;  // degrees เเจ้งเตือนการเอียง
int driveStatus;
int process;
bool flag;
uint64_t t0, t1;
}

namespace bluetoothFunc {
String targetAddress1 = "ff:ff:50:00:20:73";  // กุญเเจ 1
String targetAddress2 = "28:9b:a2:70:48:7e";  // กุญเเจ 2 (สำรอง)
int thresthold = -100;                        // dbm    ปรับความเเรงสัญญาณของกุญเเจ
int timeOut = 6000;                           // ms.    หมดเวลารอเช็ค BLE
int scanTime = 2;                             // sec.   เวลาเปิดรอรับสัญญาณ BLE
const int sampleSize = 3;
int rssiArray[sampleSize];
int rssiIndex = 0;
int avgRSSI = -100;
bool state, flag;
uint64_t t0;
}

namespace a7670cFunc {
int rxPin = 5;
int txPin = 6;
int timeOut = 5000;  // ms.      หมดเวลารอรับข้อมูล
RTC_DATA_ATTR int process;
String message, data;
RTC_DATA_ATTR bool state;
uint64_t t0;
}

namespace adxl345Func {
int sdaPin = 7;
int sclPin = 9;
int tUpdate = 100;  // ms. เวลา update adxl345
float data[3];
float magnitude;
uint64_t t0;
}

namespace gpsFunc {
int enPin = 10;
int rxPin = 20;
int txPin = 21;
float thresthold = 0.5;  // m/s^2    เเรงสั่นสะเทือนให้ GPS Update
long timeOut = 180000;   // ms.      หมดเวลารอ GPS Update
bool state;
RTC_DATA_ATTR double locationLat, locationLng;
RTC_DATA_ATTR time_t timeStamp[2];
uint64_t t0, t1;
}

namespace buzzerFunc {
int outPin = 2;
int beepNum;
bool state;
uint64_t t0;
}

namespace ledFunc {
int outPin = 8;
uint64_t t0;
}

namespace sleepFunc {
uint64_t t0;
}

int getMovingAverage(int newRSSI) {
  bluetoothFunc::rssiArray[bluetoothFunc::rssiIndex] = newRSSI;
  bluetoothFunc::rssiIndex = (bluetoothFunc::rssiIndex + 1) % bluetoothFunc::sampleSize;
  long sum = 0;
  for (int i = 0; i < bluetoothFunc::sampleSize; i++) {
    sum += bluetoothFunc::rssiArray[i];
  }
  return sum / bluetoothFunc::sampleSize;
}

class MyAdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) {
    String foundAddress = advertisedDevice.getAddress().toString().c_str();
    if (foundAddress == bluetoothFunc::targetAddress1 || foundAddress == bluetoothFunc::targetAddress2) {
      int rawRSSI = advertisedDevice.getRSSI();
      bluetoothFunc::avgRSSI = getMovingAverage(rawRSSI);
      if (bluetoothFunc::avgRSSI > bluetoothFunc::thresthold) {
        bluetoothFunc::flag = true;
        //Serial.printf(">>> Target Device Detected! [RSSI: %d]\n", bluetoothFunc::avgRSSI);
      } else {
        Serial.printf("Device Found (Too Far): %d dBm\n", bluetoothFunc::avgRSSI);
      }
    }
  }
};

void BLEScanTask(void *pvParameters) {
  for (;;) {
    pBLEScan->start(bluetoothFunc::scanTime, false);
    pBLEScan->clearResults();
    vTaskDelay(1000 / portTICK_PERIOD_MS);
  }
}

void setup() {
  Serial.begin(9600, SERIAL_8N1, gpsFunc::rxPin, gpsFunc::txPin);           // gps & debug
  Serial1.begin(115200, SERIAL_8N1, a7670cFunc::rxPin, a7670cFunc::txPin);  // a7670c sim
  Wire.begin(adxl345Func::sdaPin, adxl345Func::sclPin);                     // adxl345

  gpio_hold_dis((gpio_num_t)mainFunc::wakeupPin);
  gpio_hold_dis((gpio_num_t)gpsFunc::enPin);
  gpio_hold_dis((gpio_num_t)ledFunc::outPin);
  gpio_hold_dis((gpio_num_t)buzzerFunc::outPin);

  pinMode(mainFunc::wakeupPin, INPUT_PULLUP);
  pinMode(gpsFunc::enPin, OUTPUT);
  pinMode(ledFunc::outPin, OUTPUT);
  pinMode(buzzerFunc::outPin, OUTPUT);
  digitalWrite(buzzerFunc::outPin, HIGH);

  a7670cFunc::message.reserve(512);

  accel.begin();
  accel.setRange(ADXL345_RANGE_16_G);
  writeRegister(0x24, 0x10);  // ตั้งค่า Threshold (0x04, 0x08, 0x10, 0x20)
  writeRegister(0x27, 0xF0);  // ตั้งค่าตรวจจับ 3 แกน และใช้ AC Mode (หักล้างแรงโน้มถ่วง)
  writeRegister(0x2F, 0x00);  // เลือกให้ Interrupt ออกที่ขา INT1
  writeRegister(0x2E, 0x10);  // เปิดใช้งาน Activity Interrupt
  readRegister(0x30);         //เคลียร์ Interrupt เก่าที่อาจค้างอยู่

  BLEDevice::init("");
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);

  for (int i = 0; i < bluetoothFunc::sampleSize; i++) {
    bluetoothFunc::rssiArray[i] = -100;
  }
  xTaskCreatePinnedToCore(BLEScanTask, "BLE_Task", 10000, NULL, 1, NULL, 0);

  esp_deep_sleep_enable_gpio_wakeup(1ULL << (gpio_num_t)mainFunc::wakeupPin, ESP_GPIO_WAKEUP_GPIO_HIGH);
}

void loop() {
  mainRun();
  gpsRun();
  adxl345Run();
  a7670cRun();
  buzzerRun();
  ledRun();
  bluetoothRun();
  sleepRun();
}

void mainRun() {
  if (mainFunc::process == 0) {
    mainFunc::t0 = millis();
    mainFunc::process = 1;
  } else if (mainFunc::process == 1) {
    if (millis() - mainFunc::t1 > 2000) {
      mainFunc::t0 = millis();
      mainFunc::process = 2;
    } else if (bluetoothFunc::state) {
      mainFunc::t0 = millis();
      mainFunc::process = 2;
    }
  } else if (mainFunc::process == 2) {
    if (adxl345Func::magnitude >= mainFunc::thresthold) {
      if (bluetoothFunc::state) {
        mainFunc::process = 5;
      } else {
        mainFunc::process = 3;
      }
    }
  } else if (mainFunc::process == 3) {
    buzzerFunc::beepNum = 50;
    Serial.println("status: alarm !!");
    //sentToServer(toJSON(bluetoothFunc::targetAddress1, 1, gpsFunc::locationLat, gpsFunc::locationLng, gpsFunc::timeStamp[0]));
    sentToServer(bluetoothFunc::targetAddress1 + ",1 " + String(gpsFunc::locationLat, 8) + ", " + String(gpsFunc::locationLng, 8) + ", " + String(gpsFunc::timeStamp[0]));

    mainFunc::process = 4;
  } else if (mainFunc::process == 4) {
    if (!buzzerFunc::state) {
      mainFunc::process = 2;
    } else if (bluetoothFunc::state) {
      buzzerFunc::beepNum = 1;
      mainFunc::process = 2;
    }
  } else if (mainFunc::process == 5) {
    Serial.println("status: driving mode");
    mainFunc::t0 = millis();
    mainFunc::process = 6;
  } else if (mainFunc::process == 6) {
    if (bluetoothFunc::state) {
      if (abs(adxl345Func::data[0]) >= (mainFunc::fallDetect * 10.0 / 90.0) || abs(adxl345Func::data[1]) >= (mainFunc::fallDetect * 10.0 / 90.0)) {
        if (millis() - mainFunc::t0 > 3000) {
          Serial.println("status: driving abnormal !!");
          //sentToServer(toJSON(bluetoothFunc::targetAddress1, 2, gpsFunc::locationLat, gpsFunc::locationLng, gpsFunc::timeStamp[0]));
          sentToServer(bluetoothFunc::targetAddress1 + ",2 " + String(gpsFunc::locationLat, 8) + ", " + String(gpsFunc::locationLng, 8) + ", " + String(gpsFunc::timeStamp[0]));
          
          mainFunc::t0 = millis();
          mainFunc::process = 7;
        }
      } else {
        mainFunc::t0 = millis();
      }
    } else {
      mainFunc::process = 2;
    }
  } else if (mainFunc::process == 7) {
    if (abs(adxl345Func::data[0]) <= (30.0 * 10.0 / 90.0) && abs(adxl345Func::data[1]) <= (30.0 * 10.0 / 90.0)) {
      if (millis() - mainFunc::t0 > 3000) {
        Serial.println("status: driving normal");
        //sentToServer(toJSON(bluetoothFunc::targetAddress1, 3, gpsFunc::locationLat, gpsFunc::locationLng, gpsFunc::timeStamp[0]));
        sentToServer(bluetoothFunc::targetAddress1 + ",3 " + String(gpsFunc::locationLat, 8) + ", " + String(gpsFunc::locationLng, 8) + ", " + String(gpsFunc::timeStamp[0]));
        
        mainFunc::t0 = millis();
        mainFunc::process = 6;
      }
    } else {
      mainFunc::t0 = millis();
    }
  }
}

void gpsRun() {
  if (abs(adxl345Func::magnitude) >= gpsFunc::thresthold) {
    gpsFunc::state = false;
    gpsFunc::t0 = millis();
    gpsFunc::t1 = millis();
  }

  if (digitalRead(gpsFunc::enPin)) {
    if (millis() - gpsFunc::t1 > gpsFunc::timeOut) {
      digitalWrite(gpsFunc::enPin, LOW);
      gpsFunc::state = true;
    }

    if (gpsFunc::state) {
      if (millis() - gpsFunc::t0 > 5000) {
        digitalWrite(gpsFunc::enPin, LOW);
        Serial.println("status: GPS deep sleep");
      }
      gpsFunc::t1 = millis();
    }
  } else {
    if (!gpsFunc::state) {
      digitalWrite(gpsFunc::enPin, HIGH);
      Serial.println("status: GPS update....");

      gpsFunc::t0 = millis();
      gpsFunc::t1 = millis();
    }
  }

  while (Serial.available() > 0) {
    if (gps.encode(Serial.read())) {
      if (gps.location.isValid() && gps.date.isValid() && gps.time.isValid()) {
        gpsFunc::locationLat = gps.location.lat();
        gpsFunc::locationLng = gps.location.lng();

        tmElements_t te;

        te.Second = gps.time.second();
        te.Hour = gps.time.hour();
        te.Minute = gps.time.minute();
        te.Day = gps.date.day();
        te.Month = gps.date.month();
        te.Year = gps.date.year() - 1970;
        gpsFunc::timeStamp[0] = makeTime(te);

        if (gpsFunc::timeStamp[0] != gpsFunc::timeStamp[1]) {
          gpsFunc::timeStamp[1] = gpsFunc::timeStamp[0];
          gpsFunc::state = true;
          Serial.println("status: GPS " + String(gpsFunc::locationLat, 8) + " , " + String(gpsFunc::locationLng, 8) + " --> " + String(gpsFunc::timeStamp[0]));
        }
      }
    }
  }
}

void adxl345Run() {
  if (millis() - adxl345Func::t0 >= adxl345Func::tUpdate) {
    adxl345Func::t0 = millis();
    sensors_event_t event;
    accel.getEvent(&event);
    adxl345Func::data[0] = event.acceleration.x;
    adxl345Func::data[1] = event.acceleration.y;
    adxl345Func::data[2] = event.acceleration.z;

    //Serial.println(String(adxl345Func::data[0]) + "\t" + String(adxl345Func::data[1]) + "\t" + String(adxl345Func::data[2]));
    adxl345Func::magnitude = sqrt(pow(adxl345Func::data[0], 2) + pow(adxl345Func::data[1], 2) + pow(adxl345Func::data[2], 2)) - 9.81;
  }
}

void sentToServer(String data) {
  if (a7670cFunc::state) {
    a7670cFunc::state = false;
    a7670cFunc::data = data;
    if (a7670cFunc::process == 0) a7670cFunc::process = 1;
    else a7670cFunc::process = 13;
  }
}

String command(int i) {
  String str;
  if (i == 0) str = "AT+HTTPTERM";
  else if (i == 1) str = "AT+HTTPINIT";
  else if (i == 2) str = "AT+CSSLCFG=\"sslversion\",0,4";
  else if (i == 3) str = "AT+CSSLCFG=\"authmode\",0,0";
  else if (i == 4) str = "AT+HTTPPARA=\"URL\",\"http://143.14.200.117/api/track\"";
  //else if (i == 4) str = "AT+HTTPPARA=\"URL\",\"http://webhook.site/16206143-39c3-4d5b-8c14-78b967a7b5f9\"";
  //else if (i == 5) str = "AT+HTTPPARA=\"CONTENT\",\"application/json\"";
  else if (i == 5) str = "AT+HTTPPARA=\"CONTENT\",\"text/plain\"";

  else if (i == 6) str = "AT+HTTPDATA=";
  else if (i == 7) str = "";
  else if (i == 8) str = "AT+HTTPACTION=1";
  else if (i == 9) str = "AT+HTTPREAD=0,500";
  else if (i == 10) str = "AT+CFUN=0";
  else if (i == 11) str = "AT+CFUN=1";
  else if (i == 12) str = "AT+CREG?";
  return str;
}

void a7670cRun() {

  while (Serial1.available()) {
    char inChar = (char)Serial1.read();
    a7670cFunc::message += inChar;
    Serial.print(inChar);
  }

  auto nextProcess = [](int next) {
    a7670cFunc::message = "";
    a7670cFunc::t0 = millis();
    a7670cFunc::process = next;
  };

  if (a7670cFunc::process == 0) {
    a7670cFunc::state = true;
    if (millis() - a7670cFunc::t0 > 10000) {
      Serial.println("status: A7670C deep sleep");
      Serial1.println(command(10));
      nextProcess(12);
    }
  } else if (a7670cFunc::process == 1) {
    Serial1.println(command(0));
    nextProcess(2);
  } else if (a7670cFunc::process == 2) {
    if (a7670cFunc::message.indexOf("OK") > -1) {
      Serial1.println(command(1));
      nextProcess(3);
    } else if (a7670cFunc::message.indexOf("ERROR") > -1) {
      Serial1.println(command(1));
      nextProcess(3);
    } else if (millis() - a7670cFunc::t0 > a7670cFunc::timeOut) {
      Serial1.println(command(1));
      nextProcess(3);
    }
  } else if (a7670cFunc::process == 3) {
    if (a7670cFunc::message.indexOf("OK") > -1) {
      Serial1.println(command(2));
      nextProcess(4);
    } else if (a7670cFunc::message.indexOf("ERROR") > -1) {
      Serial1.println(command(2));
      nextProcess(4);
    } else if (millis() - a7670cFunc::t0 > a7670cFunc::timeOut) {
      Serial1.println(command(2));
      nextProcess(4);
    }
  } else if (a7670cFunc::process == 4) {
    if (a7670cFunc::message.indexOf("OK") > -1) {
      Serial1.println(command(3));
      nextProcess(5);
    } else if (a7670cFunc::message.indexOf("ERROR") > -1) {
      Serial1.println(command(3));
      nextProcess(5);
    } else if (millis() - a7670cFunc::t0 > a7670cFunc::timeOut) {
      Serial1.println(command(3));
      nextProcess(5);
    }
  } else if (a7670cFunc::process == 5) {
    if (a7670cFunc::message.indexOf("OK") > -1) {
      Serial1.println(command(4));
      nextProcess(6);
    } else if (a7670cFunc::message.indexOf("ERROR") > -1) {
      Serial1.println(command(4));
      nextProcess(6);
    } else if (millis() - a7670cFunc::t0 > a7670cFunc::timeOut) {
      Serial1.println(command(4));
      nextProcess(6);
    }
  } else if (a7670cFunc::process == 6) {
    if (a7670cFunc::message.indexOf("OK") > -1) {
      Serial1.println(command(5));
      nextProcess(7);
    } else if (a7670cFunc::message.indexOf("ERROR") > -1) {
      Serial1.println(command(5));
      nextProcess(7);
    } else if (millis() - a7670cFunc::t0 > a7670cFunc::timeOut) {
      Serial1.println(command(5));
      nextProcess(7);
    }
  } else if (a7670cFunc::process == 7) {
    Serial1.println(command(6) + String(a7670cFunc::data.length()) + ",5000");
    nextProcess(8);
  } else if (a7670cFunc::process == 8) {
    if (millis() - a7670cFunc::t0 > a7670cFunc::timeOut) {
      nextProcess(10);
    } else {
      if (a7670cFunc::message.indexOf("DOWNLOAD") > -1) {
        Serial1.print(command(7) + a7670cFunc::data);
        nextProcess(9);
      }
    }
  } else if (a7670cFunc::process == 9) {
    if (millis() - a7670cFunc::t0 > a7670cFunc::timeOut) {
      nextProcess(10);
    } else {
      if (a7670cFunc::message.indexOf("OK") > -1) {
        Serial1.println(command(8));
        nextProcess(10);
      }
    }
  } else if (a7670cFunc::process == 10) {
    if (millis() - a7670cFunc::t0 > a7670cFunc::timeOut + 10000) {
      Serial1.println(command(0));
      nextProcess(11);
    } else {
      if (a7670cFunc::message.indexOf("+HTTPACTION: 1,200") > -1) {
        Serial1.println(command(0));
        nextProcess(11);
      }
    }
  } else if (a7670cFunc::process == 11) {
    if (millis() - a7670cFunc::t0 > a7670cFunc::timeOut) {
      nextProcess(0);
    }
  }


  else if (a7670cFunc::process == 12) {
    // Standby
  } else if (a7670cFunc::process == 13) {
    Serial1.println(command(11));
    nextProcess(14);

  } else if (a7670cFunc::process == 14) {
    if (millis() - a7670cFunc::t0 > a7670cFunc::timeOut) {
      nextProcess(13);
    } else if (a7670cFunc::message.indexOf("OK") > -1) {
      nextProcess(15);
    }
  } else if (a7670cFunc::process == 15) {
    if (a7670cFunc::message.indexOf("+CREG: 0,1") > -1 || a7670cFunc::message.indexOf("+CREG: 0,5") > -1) {
      nextProcess(1);
    }
    if (millis() - a7670cFunc::t0 > 1000) {
      Serial1.println(command(12));
      a7670cFunc::t0 = millis();
    }
  }
}

void buzzerRun() {
  if (buzzerFunc::beepNum) {
    buzzerFunc::state = true;
    if (digitalRead(buzzerFunc::outPin)) {
      if (millis() - buzzerFunc::t0 >= 50) {  // ปรับเวลา ฺBuzzer On
        digitalWrite(buzzerFunc::outPin, LOW);
        buzzerFunc::t0 = millis();
        buzzerFunc::beepNum--;
      }
    } else {
      if (millis() - buzzerFunc::t0 >= 150) {  // ปรับเวลา ฺBuzzer Off
        digitalWrite(buzzerFunc::outPin, HIGH);
        buzzerFunc::t0 = millis();
      }
    }
  } else {
    buzzerFunc::state = false;
  }
}

void ledRun() {
  if (!digitalRead(ledFunc::outPin)) {
    if ((millis() - ledFunc::t0) >= 100) {
      ledFunc::t0 = millis();
      digitalWrite(ledFunc::outPin, HIGH);
    }
  } else {
    if ((millis() - ledFunc::t0) >= 1000) {
      ledFunc::t0 = millis();
      digitalWrite(ledFunc::outPin, LOW);
    }
  }
}

void bluetoothRun() {
  if (bluetoothFunc::state) {
    if (millis() - bluetoothFunc::t0 > bluetoothFunc::timeOut) {
      bluetoothFunc::state = false;
      Serial.println("status: BLE fail.");
      //sentToServer(toJSON(bluetoothFunc::targetAddress1, 0, gpsFunc::locationLat, gpsFunc::locationLng, gpsFunc::timeStamp[0]));
      sentToServer(bluetoothFunc::targetAddress1 + ",0 " + String(gpsFunc::locationLat, 8) + ", " + String(gpsFunc::locationLng, 8) + ", " + String(gpsFunc::timeStamp[0]));
      
      buzzerFunc::beepNum = 2;
    }
  }
  if (bluetoothFunc::flag) {
    bluetoothFunc::flag = false;
    if (!bluetoothFunc::state) {
      bluetoothFunc::state = true;
      Serial.println("status: BLE OK.");
      buzzerFunc::beepNum = 1;
    }

    bluetoothFunc::t0 = millis();
  }
}

void sleepRun() {
  if (!bluetoothFunc::state && !digitalRead(gpsFunc::enPin) && !buzzerFunc::state && (a7670cFunc::process == 12)) {
    if (millis() - sleepFunc::t0 > 5000) {

      digitalWrite(gpsFunc::enPin, LOW);
      digitalWrite(ledFunc::outPin, HIGH);
      digitalWrite(buzzerFunc::outPin, HIGH);

      gpio_hold_en((gpio_num_t)mainFunc::wakeupPin);
      gpio_hold_en((gpio_num_t)gpsFunc::enPin);
      gpio_hold_en((gpio_num_t)ledFunc::outPin);
      gpio_hold_en((gpio_num_t)buzzerFunc::outPin);

      gpio_deep_sleep_hold_en();

      readRegister(0x30);

      Serial.println("status: ESP32 deep sleep");
      esp_deep_sleep_start();
    }
  } else {
    sleepFunc::t0 = millis();
  }
}

void writeRegister(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(0x53);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

uint8_t readRegister(uint8_t reg) {
  uint8_t val = 0;
  Wire.beginTransmission(0x53);
  Wire.write(reg);
  Wire.endTransmission();
  Wire.requestFrom(0x53, 1);
  if (Wire.available()) {
    val = Wire.read();
  }
  return val;
}

String toJSON(String mac, int type, double lat, double lng, time_t timeStamp) {
  String jsonData = "{";
  jsonData += "\"address\":\"" + mac + "\",";
  jsonData += "\"type\":" + String(type) + ",";
  jsonData += "\"lat\":" + String(lat, 8) + ",";
  jsonData += "\"lng\":" + String(lng, 8) + ",";
  jsonData += "\"timestamp\":" + String(timeStamp);
  jsonData += "}";
  return jsonData;
}