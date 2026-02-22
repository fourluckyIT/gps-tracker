/**
 * 🔧 ESP32 Full Condition Simulator
 * ===================================
 * จำลองการส่งข้อมูลจาก ESP32 ครบทุกเงื่อนไข
 * อ้างอิงจากโค้ด: test_all_active_high_v0_2.ino
 * 
 * รูปแบบข้อมูลจริง (text/plain):
 *   MAC,TYPE LAT, LNG, TIMESTAMP
 *   เช่น "ff:ff:50:00:20:73,1 13.74690000, 100.53490000, 1771598000"
 * 
 * Status Types จาก ESP32:
 *   0 = BLE Key Disconnected  → Server maps to "UNKNOWN"
 *   1 = Alarm (ถูกโจรกรรม)     → Server maps to "STOLEN"
 *   2 = Driving Abnormal (ล้ม) → Server maps to "CRASH"  
 *   3 = Driving Normal (ปกติ)  → Server maps to "NORMAL"
 * 
 * สถานการณ์จำลอง:
 *   Scene 1: รถจอดนิ่ง กุญแจอยู่ใกล้ → ขับปกติ (type 3)
 *   Scene 2: ขับอยู่ รถเอียงผิดปกติ   → Crash/เอียง (type 2)
 *   Scene 3: รถกลับมาปกติ             → กลับสู่ปกติ (type 3)
 *   Scene 4: กุญแจหาย BLE หลุด       → BLE Disconnected (type 0)
 *   Scene 5: มีการสั่นสะเทือน ไม่มีกุญแจ → Alarm/ถูกโจรกรรม (type 1)
 *   Scene 6: เจ้าของกลับมา กุญแจเชื่อมต่อ → กลับสู่ปกติ (type 3)
 */

const fetch = require('node-fetch');

// ============ CONFIG ============
const SERVER_URL = "http://143.14.200.117/api/track";

// BLE Key Address (จาก ESP32 code: bluetoothFunc::targetAddress1)
const BLE_KEY_MAC = "ff:ff:50:00:20:73";

// Device MAC (ที่ลงทะเบียนใน DB)
const DEVICE_ID = "1C:AB:77:2B:A2:C0";

// ============ LOCATIONS ============
// จำลองเส้นทาง กรุงเทพ
const LOCATIONS = {
    // Scene 1-3: ขับรถในกรุงเทพ
    startParking: { lat: 13.746900, lng: 100.534900, name: "🅿️ จอดที่สยาม" },
    driving1: { lat: 13.748200, lng: 100.536100, name: "🚗 ถ.พระราม 1" },
    driving2: { lat: 13.750100, lng: 100.538400, name: "🚗 แยกราชประสงค์" },
    crashPoint: { lat: 13.751800, lng: 100.540200, name: "💥 จุดรถเอียง" },
    recoveryPoint: { lat: 13.752500, lng: 100.541000, name: "✅ กลับมาปกติ" },
    // Scene 4-6: จอดแล้วถูกขโมย
    parkingSpot: { lat: 13.753000, lng: 100.541500, name: "🅿️ จอดรถห้าง" },
    stolenMove1: { lat: 13.755000, lng: 100.543000, name: "🚨 รถเคลื่อนที่(ไม่มีกุญแจ)" },
    stolenMove2: { lat: 13.757500, lng: 100.545500, name: "🚨 รถถูกลากไป" },
    ownerReturn: { lat: 13.753000, lng: 100.541500, name: "🔑 เจ้าของกลับมา" },
};

// ============ HELPERS ============
function getTimestamp() {
    return Math.floor(Date.now() / 1000);
}

function formatESP32Data(mac, type, lat, lng, timestamp) {
    // ตรงตามรูปแบบจริงจาก ESP32:
    // sentToServer(bluetoothFunc::targetAddress1 + ",1 " + String(lat, 8) + ", " + String(lng, 8) + ", " + String(timestamp))
    return `${mac},${type} ${lat.toFixed(8)}, ${lng.toFixed(8)}, ${timestamp}`;
}

async function sendToServer(data, description) {
    const timestamp = new Date().toLocaleTimeString('th-TH');
    try {
        const response = await fetch(SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: data
        });
        const result = await response.text();
        console.log(`  [${timestamp}] ${description}`);
        console.log(`    📡 Data: ${data}`);
        console.log(`    ✅ Response: ${result}`);
        return result;
    } catch (error) {
        console.log(`  [${timestamp}] ${description}`);
        console.log(`    ❌ Error: ${error.message}`);
        return null;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function printSeparator(title) {
    console.log('\n' + '═'.repeat(60));
    console.log(`  ${title}`);
    console.log('═'.repeat(60));
}

function printSceneBox(num, title, description) {
    console.log('\n┌─────────────────────────────────────────────────────┐');
    console.log(`│  Scene ${num}: ${title.padEnd(42)}│`);
    console.log(`│  ${description.padEnd(51)}│`);
    console.log('└─────────────────────────────────────────────────────┘');
}

// ============ SCENES ============

async function scene1_drivingNormal() {
    printSceneBox(1, "🚗 ขับรถปกติ (กุญแจอยู่ใกล้)", "BLE OK → Vibration → Driving Mode → type 3");

    const loc = LOCATIONS.driving1;
    const data = formatESP32Data(DEVICE_ID, 3, loc.lat, loc.lng, getTimestamp());
    await sendToServer(data, `${loc.name} → สถานะ: NORMAL (type 3)`);

    await sleep(3000);

    const loc2 = LOCATIONS.driving2;
    const data2 = formatESP32Data(DEVICE_ID, 3, loc2.lat, loc2.lng, getTimestamp());
    await sendToServer(data2, `${loc2.name} → สถานะ: NORMAL (type 3)`);
}

async function scene2_drivingAbnormal() {
    printSceneBox(2, "💥 รถเอียงผิดปกติ (Tilt > 75°)", "Driving + tilt detected > 3sec → type 2");

    const loc = LOCATIONS.crashPoint;
    const data = formatESP32Data(DEVICE_ID, 2, loc.lat, loc.lng, getTimestamp());
    await sendToServer(data, `${loc.name} → สถานะ: CRASH (type 2)`);
}

async function scene3_recoveryToNormal() {
    printSceneBox(3, "✅ กลับสู่ปกติ (Tilt < 30°)", "Tilt returns to normal > 3sec → type 3");

    const loc = LOCATIONS.recoveryPoint;
    const data = formatESP32Data(DEVICE_ID, 3, loc.lat, loc.lng, getTimestamp());
    await sendToServer(data, `${loc.name} → สถานะ: NORMAL (type 3)`);
}

async function scene4_bleDisconnected() {
    printSceneBox(4, "🔓 กุญแจ BLE หลุด (Key Lost)", "BLE timeout 6sec → type 0 (UNKNOWN)");

    const loc = LOCATIONS.parkingSpot;
    const data = formatESP32Data(DEVICE_ID, 0, loc.lat, loc.lng, getTimestamp());
    await sendToServer(data, `${loc.name} → สถานะ: UNKNOWN (type 0) - BLE Key Lost`);
}

async function scene5_alarmStolen() {
    printSceneBox(5, "🚨 Alarm! ถูกโจรกรรม", "Vibration + NO BLE Key → type 1 (STOLEN)");

    const loc = LOCATIONS.stolenMove1;
    const data = formatESP32Data(DEVICE_ID, 1, loc.lat, loc.lng, getTimestamp());
    await sendToServer(data, `${loc.name} → สถานะ: STOLEN (type 1) - Buzzer 50 beeps!`);

    await sleep(3000);

    // รถถูกลากไปตำแหน่งใหม่ ยังส่ง alarm อยู่
    const loc2 = LOCATIONS.stolenMove2;
    const data2 = formatESP32Data(DEVICE_ID, 1, loc2.lat, loc2.lng, getTimestamp());
    await sendToServer(data2, `${loc2.name} → สถานะ: STOLEN (type 1) - ยังโดนขโมยอยู่!`);
}

async function scene6_ownerReturns() {
    printSceneBox(6, "🔑 เจ้าของกลับมา (BLE Reconnect)", "BLE Key detected → back to Normal → type 3");

    const loc = LOCATIONS.ownerReturn;
    const data = formatESP32Data(DEVICE_ID, 3, loc.lat, loc.lng, getTimestamp());
    await sendToServer(data, `${loc.name} → สถานะ: NORMAL (type 3) - เจ้าของมาแล้ว!`);
}

// ============ MAIN ============

async function runFullSimulation() {
    printSeparator('🔧 ESP32 FULL CONDITION SIMULATOR');
    console.log(`  Device: ${DEVICE_ID}`);
    console.log(`  BLE Key: ${BLE_KEY_MAC}`);
    console.log(`  Server: ${SERVER_URL}`);
    console.log(`  Time: ${new Date().toLocaleString('th-TH')}`);
    printSeparator('เริ่มจำลองทั้งหมด 6 สถานการณ์');

    // === สถานการณ์ที่ 1: ขับรถปกติ ===
    await scene1_drivingNormal();
    await sleep(4000);

    // === สถานการณ์ที่ 2: รถเอียง/ล้ม ===
    await scene2_drivingAbnormal();
    await sleep(4000);

    // === สถานการณ์ที่ 3: กลับมาปกติ ===
    await scene3_recoveryToNormal();
    await sleep(4000);

    // === สถานการณ์ที่ 4: กุญแจหาย ===
    await scene4_bleDisconnected();
    await sleep(4000);

    // === สถานการณ์ที่ 5: ถูกขโมย! ===
    await scene5_alarmStolen();
    await sleep(4000);

    // === สถานการณ์ที่ 6: เจ้าของกลับมา ===
    await scene6_ownerReturns();

    // === Summary ===
    printSeparator('📊 สรุปผลการจำลอง');
    console.log('  ✅ Scene 1: Driving Normal (type 3 → NORMAL)');
    console.log('  ✅ Scene 2: Driving Abnormal/Crash (type 2 → CRASH)');
    console.log('  ✅ Scene 3: Recovery to Normal (type 3 → NORMAL)');
    console.log('  ✅ Scene 4: BLE Key Disconnected (type 0 → UNKNOWN)');
    console.log('  ✅ Scene 5: Alarm/Stolen (type 1 → STOLEN)');
    console.log('  ✅ Scene 6: Owner Returns (type 3 → NORMAL)');
    console.log('\n  รวม: ส่งข้อมูล 8 ครั้ง ครอบคลุมทุก type (0, 1, 2, 3)');
    printSeparator('จบการจำลอง');
}

runFullSimulation();
