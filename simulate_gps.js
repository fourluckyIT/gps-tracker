const fetch = require('node-fetch');

// Config
const SERVER_URL = "http://localhost:3000/api/track";
const DEVICE_ID = "0B:72:A0:58:53:19";

// Locations
const LOC_1 = { lat: 13.7469, lng: 100.5349 }; // Siam Paragon
const LOC_2 = { lat: 13.7649, lng: 100.5383 }; // Victory Monument (~2km away)

const sendData = async (lat, lng, status, stepName) => {
    try {
        const body = {
            deviceId: DEVICE_ID,
            lat: lat,
            lng: lng,
            status: status,
            speed: 60,
            battery: 85
        };

        const response = await fetch(SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.text();
        console.log(`[${new Date().toLocaleTimeString()}] ${stepName}: Sent ${status} at ${lat}, ${lng} -> Response:`, data);
    } catch (error) {
        console.error(`Error sending data:`, error);
    }
};

const runSimulation = async () => {
    console.log("🚀 Starting GPS Simulation for", DEVICE_ID);

    // 1. Normal at Location 1
    console.log("1. Sending Normal at Location 1...");
    await sendData(LOC_1.lat, LOC_1.lng, "normal", "Start (Normal)");

    // Wait 2 seconds to see the change clearly
    await new Promise(r => setTimeout(r, 2000));

    // 2. Stolen at Location 2 (2 KM away)
    console.log("2. Moving to Location 2 (Stolen)...");
    await sendData(LOC_2.lat, LOC_2.lng, "stolen", "Moved (Stolen)");

    // 3. Wait 20 seconds
    console.log("Waiting 20 seconds...");
    await new Promise(r => setTimeout(r, 20000));

    // 4. Stolen at Location 2 (Same location)
    console.log("3. Repeat Stolen at Location 2...");
    await sendData(LOC_2.lat, LOC_2.lng, "stolen", "Repeat (Stolen)");

    // 5. Wait 30 seconds
    console.log("Waiting 30 seconds...");
    await new Promise(r => setTimeout(r, 30000));

    // 6. Normal at Location 1 (Back to start)
    console.log("4. Back to Start (Normal)...");
    await sendData(LOC_1.lat, LOC_1.lng, "normal", "Back to Start (Normal)");

    console.log("✅ Simulation Complete");
};

runSimulation();
