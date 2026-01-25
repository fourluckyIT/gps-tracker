"use client";

import { useState } from "react";

const TOPIC_NAME = "gps-tracker-hub-8376c";

export default function TestPage() {
    const [deviceId, setDeviceId] = useState("TEST_SIM_01");
    const [data, setData] = useState("13.123,100.123,Active,99%");
    const [status, setStatus] = useState("");

    const sendData = async () => {
        setStatus("Sending...");
        try {
            const csvPayload = `${deviceId},${data}`;
            const url = `https://ntfy.sh/${TOPIC_NAME}`;

            // Ntfy supports simple POST requests.
            // We send the data in the body.
            await fetch(url, {
                method: 'POST',
                body: csvPayload
            });

            setStatus(`Signal Fired! 📡 (Ntfy): ${csvPayload}`);

        } catch (e) {
            console.error(e);
            setStatus("Error: " + e.message);
        }
    };

    return (
        <main className="container" style={{ maxWidth: '600px', paddingTop: '4rem' }}>
            <h1>🛰️ Signal Simulator (Ntfy)</h1>

            <div className="dashboard-card">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#a1a1aa' }}>Device ID</label>
                        <input
                            type="text"
                            value={deviceId}
                            onChange={(e) => setDeviceId(e.target.value)}
                            style={{
                                width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
                                border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.3)',
                                color: 'white', fontSize: '1.1rem'
                            }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#a1a1aa' }}>Data (CSV Format)</label>
                        <input
                            type="text"
                            value={data}
                            onChange={(e) => setData(e.target.value)}
                            placeholder="Lat,Lng,Status,..."
                            style={{
                                width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
                                border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.3)',
                                color: 'white', fontFamily: 'monospace'
                            }}
                        />
                    </div>

                    <button
                        onClick={sendData}
                        style={{
                            padding: '1rem', borderRadius: '0.5rem', border: 'none',
                            background: 'linear-gradient(to right, var(--primary), var(--secondary))',
                            color: 'black', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer',
                            marginTop: '1rem'
                        }}
                    >
                        SHOOT SIGNAL 📡
                    </button>

                    {status && (
                        <div style={{
                            padding: '1rem', borderRadius: '0.5rem',
                            background: 'rgba(34, 211, 238, 0.1)',
                            color: '#22d3ee',
                            textAlign: 'center',
                            border: '1px solid rgba(34, 211, 238, 0.2)'
                        }}>
                            {status}
                        </div>
                    )}

                    <div style={{ marginTop: '2rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem', textAlign: 'center' }}>
                        <a href="/" style={{ color: 'var(--primary)', textDecoration: 'none' }}>← Monitor Data</a>
                    </div>

                </div>
            </div>
        </main>
    );
}
