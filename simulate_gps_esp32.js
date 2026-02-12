const fetch = require('node-fetch');

const DEVICE_ID = '0B:72:A0:58:53:19';
const SERVER_URL = 'http://localhost:3000/api/track';

// Location 1: Victory Monument (Approx)
const LOC_1 = { lat: 13.7649, lng: 100.5383 };

// Location 2: Chatuchak Park (Approx 2km North)
// 1 degree lat is ~111km. 2km is ~0.018 degrees.
const LOC_2 = { lat: 13.7649 + 0.018, lng: 100.5383 };

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sendData(status, lat, lng) {
    const timestamp = Math.floor(Date.now() / 1000);
    // Format: MAC,STATUS LAT, LNG, TIMESTAMP 
    // Example: 0B:72:A0:58:53:19,1 13.7829, 100.5383, 1715000000
    const payload = `${DEVICE_ID},${status} ${lat}, ${lng}, ${timestamp}`;

    console.log(`[${new Date().toLocaleTimeString()}] Sending: ${status} (Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)})`);

    try {
        const response = await fetch(SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: payload
        });
        const text = await response.text();
        console.log(`Response: ${text}`);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

async function runSimulation() {
    console.log(`--- Starting Simulation for ${DEVICE_ID} ---`);
    console.log("Scenario: Normal -> Stolen (2km) -> Wait 20s -> Stolen -> Wait 30s -> Normal");

    // 1. Normal at Location 1
    console.log("\n1. Sending NORMAL at Location 1");
    await sendData(3, LOC_1.lat, LOC_1.lng);
    await sleep(2000); // Give it a moment to process

    // 2. Stolen at Location 2 (2km away)
    console.log("\n2. Sending STOLEN at Location 2 (2km jump)");
    await sendData(1, LOC_2.lat, LOC_2.lng);

    // 3. Wait 20 seconds
    console.log("\n3. Waiting 20 seconds...");
    await sleep(20000);

    // 4. Stolen at Location 2 (Repeat)
    console.log("\n4. Sending STOLEN at Location 2 (Again)");
    await sendData(1, LOC_2.lat, LOC_2.lng);

    // 5. Wait 30 seconds
    console.log("\n5. Waiting 30 seconds...");
    await sleep(30000);

    // 6. Normal at Location 1 (Back to start)
    console.log("\n6. Sending NORMAL at Location 1");
    await sendData(3, LOC_1.lat, LOC_1.lng);

    console.log("\n--- Simulation Complete ---");
}

runSimulation();
