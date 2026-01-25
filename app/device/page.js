"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { db } from "../../lib/firebase";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";

// Ntfy Topic Name
const TOPIC_NAME = "gps-tracker-hub-8376c";

function DeviceHistoryContent() {
    const searchParams = useSearchParams();
    const deviceId = searchParams.get('id');

    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!deviceId) return;

        const streamUrl = `https://ntfy.sh/${TOPIC_NAME}/sse`;
        console.log("Loading history for:", deviceId);

        const loadData = async () => {
            const combinedLogs = [];
            const seenIds = new Set();

            // 1. Fetch Permanent History from Firebase (Firestore)
            try {
                const q = query(
                    collection(db, "logs"),
                    where("device_id", "==", deviceId),
                    orderBy("timestamp", "desc"),
                    limit(100)
                );
                const querySnapshot = await getDocs(q);
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    if (!seenIds.has(data.ntfy_id)) {
                        combinedLogs.push({
                            id: data.ntfy_id,
                            timestamp: new Date(data.timestamp).toLocaleString(),
                            rawContent: data.raw_content,
                            source: 'firebase'
                        });
                        seenIds.add(data.ntfy_id);
                    }
                });
                console.log(`Loaded ${querySnapshot.size} logs from Firebase`);
            } catch (err) {
                console.error("Firebase fetch error:", err);
            }

            // 2. Fetch BUFFER from Ntfy (Archive)
            try {
                const res = await fetch(`https://ntfy.sh/${TOPIC_NAME}/json?poll=1&since=all`);
                const text = await res.text();
                const lines = text.trim().split('\n');

                const ntfyLogs = [];
                lines.forEach(line => {
                    if (!line) return;
                    try {
                        const data = JSON.parse(line);
                        if (data.event === 'message' && data.message) {
                            const parts = data.message.split(',');
                            if (parts.length >= 1 && parts[0]?.trim() === deviceId) {
                                if (!seenIds.has(data.id)) {
                                    ntfyLogs.push({
                                        id: data.id,
                                        timestamp: new Date(data.time * 1000).toLocaleString(),
                                        rawContent: parts.slice(1).join(', '),
                                        source: 'ntfy-buffer'
                                    });
                                    seenIds.add(data.id);
                                }
                            }
                        }
                    } catch (e) { }
                });

                // Combine: Ntfy (Newest) + Firebase (Oldest)
                // Note: Ntfy gives oldest-first. We reverse it.
                combinedLogs.unshift(...ntfyLogs.reverse());

            } catch (err) {
                console.error("Ntfy fetch error:", err);
            }

            setHistory(combinedLogs);
            setLoading(false);
        };

        loadData();

        // 3. Realtime Stream
        const eventSource = new EventSource(streamUrl);

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.event === 'message' && data.message) {
                    const parts = data.message.split(',');
                    if (parts.length >= 1 && parts[0]?.trim() === deviceId) {
                        setHistory(prev => {
                            if (prev.some(p => p.id === data.id)) return prev;

                            const newLog = {
                                id: data.id,
                                timestamp: new Date(data.time * 1000).toLocaleString(),
                                rawContent: parts.slice(1).join(', '),
                                source: 'live'
                            };
                            return [newLog, ...prev];
                        });
                    }
                }
            } catch (e) { }
        };

        return () => eventSource.close();
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
                {loading && <div className="loading">Syncing history (Cloud + Stream)...</div>}

                {!loading && history.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
                        No history found. Waiting for data...
                    </div>
                )}

                {history.length > 0 && (
                    <table className="device-table">
                        <thead>
                            <tr>
                                <th>Time Recieved</th>
                                <th>Data Payload</th>
                                <th>Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((log) => (
                                <tr key={log.id}>
                                    <td style={{ color: '#a1a1aa', width: '200px' }}>
                                        {log.timestamp}
                                    </td>
                                    <td style={{ fontFamily: 'monospace', color: 'var(--secondary)' }}>
                                        {log.rawContent}
                                    </td>
                                    <td style={{ fontSize: '0.8rem', opacity: 0.5 }}>
                                        {log.source === 'firebase' ? '🔒 Cloud DB' : (log.source === 'live' ? '⚡️ Live' : '📡 Ntfy')}
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
