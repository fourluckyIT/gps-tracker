"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

// VPS Configuration
const API_URL = typeof window !== 'undefined'
    ? `${window.location.origin}/api`
    : "http://143.14.200.117/api";

function DeviceHistoryContent() {
    const searchParams = useSearchParams();
    const deviceId = searchParams.get('id');

    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(""); // YYYY-MM-DD
    const [onlyAlerts, setOnlyAlerts] = useState(false); // Monitor Mode Toggle

    useEffect(() => {
        if (!deviceId) return;

        // Poll History from VPS
        const fetchHistory = async () => {
            try {
                // If dateFilter is set, append query param
                const url = dateFilter
                    ? `${API_URL}/history/${deviceId}?date=${dateFilter}`
                    : `${API_URL}/history/${deviceId}?limit=100`;

                const res = await fetch(url);
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
        const interval = setInterval(fetchHistory, 5000); // Filtered: Poll slower (5s)

        return () => clearInterval(interval);
    }, [deviceId, dateFilter]); // Re-fetch on date change

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

            {/* Date Filter */}
            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: '#aaa' }}>Filter Date:</span>
                <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    style={{
                        padding: '8px',
                        background: '#222',
                        border: '1px solid #444',
                        color: 'white',
                        borderRadius: '4px',
                        fontSize: '1rem'
                    }}
                />
                {dateFilter && (
                    <button
                        onClick={() => setDateFilter("")}
                        style={{
                            padding: '8px 12px',
                            background: '#333',
                            border: 'none',
                            color: '#ccc',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Clear
                    </button>
                )}

                {/* Monitor Mode Toggle */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                    <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                        background: onlyAlerts ? '#ff4444' : '#333',
                        padding: '8px 12px',
                        borderRadius: '4px',
                        color: 'white',
                        fontWeight: 'bold',
                        transition: 'background 0.3s'
                    }}>
                        <input
                            type="checkbox"
                            checked={onlyAlerts}
                            onChange={(e) => setOnlyAlerts(e.target.checked)}
                            style={{ marginRight: '8px', width: '18px', height: '18px' }}
                        />
                        🚨 Monitor Mode (Show Only Alerts)
                    </label>
                </div>
            </div>

            <div className="dashboard-card">
                {loading && <div className="loading">Syncing with VPS Database...</div>}

                {!loading && history.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
                        No history found for {dateFilter ? `date ${dateFilter}` : "this device"}.
                    </div>
                )}

                {history.length > 0 && (
                    <table className="device-table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Coordinates (Lat, Lng)</th>
                                <th>Status / Type</th>
                                <th>Raw Data</th>
                                <th>Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((log) => {
                                // Try to extract status from raw_data if possible
                                let status = "-";
                                try {
                                    if (log.raw_data.startsWith('{')) {
                                        const j = JSON.parse(log.raw_data);
                                        status = j.status || j.type || "-";
                                    } else if (log.raw_data.includes(',')) {
                                        // Heuristic: ID, Status, Lat... 
                                        const p = log.raw_data.split(/[, ]+/).filter(x => x);
                                        if (p.length >= 4) status = p[1];
                                    }
                                } catch (e) { }

                                // Filter Logic: If Monitor Mode is ON, skip normal rows
                                if (onlyAlerts) {
                                    const isCritical = status === "1" || status === "2" || status.includes("STOLEN") || status.includes("CRASH");
                                    if (!isCritical) return null;
                                }

                                return (
                                    <tr key={log.id} style={{
                                        background:
                                            status === "1" || status.includes("STOLEN") ? "rgba(255, 68, 68, 0.2)" : // Red
                                                status === "2" || status.includes("CRASH") ? "rgba(255, 170, 0, 0.2)" : // Orange
                                                    status === "0" ? "rgba(255, 255, 0, 0.1)" : // Yellow (BLE Fail)
                                                        "transparent"
                                    }}>
                                        <td style={{ color: '#a1a1aa', width: '180px' }}>
                                            {new Date(log.timestamp).toLocaleString()}
                                        </td>
                                        <td style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                                            {log.lat?.toFixed(6)}, {log.lng?.toFixed(6)}
                                        </td>
                                        <td style={{
                                            color:
                                                status === "1" || status.includes("STOLEN") ? "#ff4444" :
                                                    status === "2" || status.includes("CRASH") ? "#ffaa00" :
                                                        status === "3" ? "#00ff9d" : "#ccc",
                                            fontWeight: (status === "1" || status === "2") ? "bold" : "normal"
                                        }}>
                                            {
                                                status === "1" || status.includes("STOLEN") ? "🚨 STOLEN (ขโมย)" :
                                                    status === "2" || status.includes("CRASH") ? "💥 CRASH (อุบัติเหตุ)" :
                                                        status === "3" || status.includes("NORMAL") ? "🚗 NORMAL (ปกติ)" :
                                                            status === "0" ? "⚠️ BLE FAIL" :
                                                                status
                                            }
                                        </td>
                                        <td style={{ fontFamily: 'monospace', color: 'var(--secondary)' }}>
                                            {log.raw_data}
                                        </td>
                                        <td style={{ fontSize: '0.8rem', opacity: 0.5 }}>
                                            💾 VPS DB
                                        </td>
                                    </tr>
                                );
                            })}
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
