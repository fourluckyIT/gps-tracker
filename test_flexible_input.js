const io = require('socket.io-client');
const axios = require('axios');

const SOCKET_URL = 'http://localhost:3001';
const API_URL = 'http://localhost:3001/api/track';

async function runTests() {
    console.log("🚀 Starting Flexible Input Tests...");

    // 1. HTTP JSON Object
    try {
        await axios.post(API_URL, {
            deviceId: 'TEST_HTTP_JSON',
            lat: 13.001,
            lng: 100.001,
            stats: 'MOVING'
        });
        console.log("✅ HTTP JSON Object: OK");
    } catch (e) {
        console.error("❌ HTTP JSON Object: FAILED", e.message);
    }

    // 2. HTTP CSV String
    try {
        await axios.post(API_URL, "TEST_HTTP_CSV,EVENT_X,MOVING,13.002,100.002", {
            headers: { 'Content-Type': 'text/plain' }
        });
        console.log("✅ HTTP CSV String: OK");
    } catch (e) {
        console.error("❌ HTTP CSV String: FAILED", e.message);
    }

    // 3. HTTP Raw String (Minimal)
    try {
        await axios.post(API_URL, "TEST_HTTP_RAW_STR,13.003,100.003", {
            headers: { 'Content-Type': 'text/plain' }
        });
        console.log("✅ HTTP Raw String: OK");
    } catch (e) {
        console.error("❌ HTTP Raw String: FAILED", e.message);
    }

    // 4. WebSocket Tests
    const socket = io(SOCKET_URL);

    socket.on('connect', () => {
        console.log("🔌 Connected to WebSocket");

        // 4a. WS JSON String
        const jsonMsg = JSON.stringify({
            deviceId: 'TEST_WS_JSON',
            lat: 13.004,
            lng: 100.004,
            stats: 'IDLE'
        });
        socket.emit('message', jsonMsg);
        console.log("📤 Sent WS JSON String");

        // 4b. WS CSV String
        socket.emit('message', "TEST_WS_CSV,EVENT,MOVING,13.005,100.005");
        console.log("📤 Sent WS CSV String");

        // 4c. WS Raw String (Valid Lat/Lng logic triggers if 3 parts found)
        socket.emit('message', "TEST_WS_RAW,13.006,100.006");
        console.log("📤 Sent WS Raw String");

        // Wait a bit then exit
        setTimeout(() => {
            console.log("🏁 Tests sent. Check server logs for reception.");
            socket.disconnect();
        }, 2000);
    });
}

runTests();
