// Test script to simulate ESP32 data
const http = require('http');

const SERVER_URL = 'http://localhost:3000';

const testDevices = [
    { mac: 'AA:BB:CC:DD:EE:01', status: '3', lat: 13.7563, lng: 100.5018 },
    { mac: 'AA:BB:CC:DD:EE:02', status: '1', lat: 14.3568, lng: 100.6107 },
    { mac: 'AA:BB:CC:DD:EE:03', status: '2', lat: 13.8456, lng: 100.5678 },
];

function sendData(device) {
    const payload = `${device.mac},${device.status} ${device.lat}, ${device.lng}, ${Date.now()}`;

    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/track',
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }
    };

    const req = http.request(options, (res) => {
        console.log(`📡 [${device.mac}] Status: ${device.status} → Response: ${res.statusCode}`);
    });

    req.on('error', (e) => console.error(`❌ Error: ${e.message}`));
    req.write(payload);
    req.end();
}

console.log('🚀 Sending test data...\n');

testDevices.forEach((device, idx) => {
    setTimeout(() => sendData(device), idx * 500);
});

setTimeout(() => {
    console.log('\n✅ Test complete! Check http://localhost:3000');
}, 2000);
