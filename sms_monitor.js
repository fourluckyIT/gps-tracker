const { io } = require("socket.io-client");

// Connect to the GPS Tracker Server
const SERVER_URL = "http://143.14.200.117"; // หรือ "http://localhost:3000" ถ้ารันบนเครื่องตัวเอง
const socket = io(SERVER_URL);

console.log(`📡 Connecting to ${SERVER_URL} for SMS Monitoring...`);

socket.on("connect", () => {
    console.log("✅ Connected to WebSocket Server");
});

socket.on("device_update", (data) => {
    // กรองเฉพาะสถานะ "2" (CRASH) หรือที่มีคำว่า CRASH
    const isCrash = data.status === "2" || (data.status && data.status.includes("CRASH"));

    if (isCrash) {
        // สร้างลิจก์ Google Maps
        const googleMapsLink = `https://www.google.com/maps?q=${data.lat},${data.lng}`;

        console.log("\n🚨 CRASH DETECTED! PREPARING SMS...");
        console.log("========================================");
        console.log(`To: [Center Number / Auto SMS System]`);
        console.log(`Message: ผู้ใช้รถประสบอุบัติเหตุ`);
        console.log(`Device ID: ${data.device_id}`);
        console.log(`พิกัด: ${googleMapsLink}`);
        console.log("========================================\n");

        // TODO: เรียก API ยิง SMS ของจริงตรงนี้ (เช่น Twilio, ThaiBulkSMS)
        // sendSms(centerNumber, message);
    }
});

socket.on("disconnect", () => {
    console.log("❌ Disconnected");
});
