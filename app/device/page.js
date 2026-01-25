"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

// VPS Configuration
const API_URL = "http://143.14.200.117/api";

function DeviceHistoryContent() {
    const searchParams = useSearchParams();
    const deviceId = searchParams.get('id');

    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!deviceId) return;

        // Poll History from VPS
        const fetchHistory = async () => {
            try {
                const res = await fetch(`${API_URL}/history/${deviceId}?limit=50`);
                if (res.ok) {
                    const data = await res.json();
                    setHistory(data);
                    setLoading(false);
                }
            } catch (error) {
                console.error("Error fetching history:", error);
            }
        };

        fetchHistory(); // 1st call
        const interval = setInterval(fetchHistory, 2000); // Poll every 2s

        return () => clearInterval(interval);
    }, [deviceId]);

    if (!deviceId) return <div className="loading">Invalid Device ID</div>;

    return (
        <main className="container">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
                <Link href="/" style={{
                    marginRight: '1rem',
                    padding: '0.5rem 1rem',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    color: 'white'
                }}>
                    ← Back
                </Link>
                <h1>History Log: <span style={{ color: 'var(--primary)' }}>{deviceId}</span></h1>
            </div>

            <div className="dashboard-card">
                {loading && <div className="loading">Syncing with VPS Database...</div>}

                {!loading && history.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
                        No history found for this device.
                    </div>
                )}

                {history.length > 0 && (
                    <table className="device-table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Coordinates (Lat, Lng)</th>
                                <th>Raw Data</th>
                                <th>Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((log) => (
                                <tr key={log.id}>
                                    <td style={{ color: '#a1a1aa', width: '200px' }}>
                                        {new Date(log.timestamp).toLocaleString()}
                                    </td>
                                    <td style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                                        {log.lat}, {log.lng}
                                    </td>
                                    <td style={{ fontFamily: 'monospace', color: 'var(--secondary)' }}>
                                        {log.raw_data}
                                    </td>
                                    <td style={{ fontSize: '0.8rem', opacity: 0.5 }}>
                                        💾 VPS DB
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </main>
    );
}

export default function DevicePage() {
    return (
        <Suspense fallback={<div className="loading">Loading...</div>}>
            <DeviceHistoryContent />
        </Suspense>
    );
}
