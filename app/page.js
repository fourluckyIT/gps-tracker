"use client";

import { useEffect, useState } from "react";
import { db } from "../lib/firebase"; // Import Firestore
import { doc, setDoc } from "firebase/firestore";

// Ntfy Topic Name (Must be unique)
const TOPIC_NAME = "gps-tracker-hub-8376c";

export default function Home() {
  const [devicesMap, setDevicesMap] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Connect to ntfy.sh SSE API
    const streamUrl = `https://ntfy.sh/${TOPIC_NAME}/sse`;
    console.log("Listening to stream:", streamUrl);

    const eventSource = new EventSource(streamUrl);

    eventSource.onopen = () => {
      setLoading(false);
    };

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.event === 'message' && data.message) {
          const rawText = data.message;
          const parts = rawText.split(',');

          if (parts.length >= 1) {
            const id = parts[0]?.trim();
            const content = parts.slice(1).join(', ');
            const timestamp = new Date(data.time * 1000).toISOString();

            // 1. Update React State
            setDevicesMap(prev => ({
              ...prev,
              [id]: {
                deviceId: id,
                rawContent: content,
                originalRaw: rawText,
                lastUpdated: timestamp
              }
            }));

            // 2. FORCE SYNC TO FIREBASE (Cloud Bridge)
            // We use the Ntfy Message ID as the Doc ID (Idempotent)
            try {
              await setDoc(doc(db, "logs", data.id), {
                ntfy_id: data.id,
                device_id: id,
                raw_content: content,
                timestamp: timestamp,
                created_at: new Date()
              });
              console.log("Synced to Firebase:", data.id);
            } catch (err) {
              console.error("Firebase Sync Error:", err);
            }
          }
        }
      } catch (e) {
        console.error("Parse error", e);
      }
    };

    return () => eventSource.close();
  }, []);

  const devices = Object.values(devicesMap).sort((a, b) =>
    new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
  );

  return (
    <main className="container">
      <h1>Realtime GPS Stream (Ntfy + Firebase Sync)</h1>

      <div className="dashboard-card">
        {loading ? (
          <div className="loading">Waiting for satellite stream...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="device-table">
              <thead>
                <tr>
                  <th>Device ID</th>
                  <th>Last Update</th>
                  <th>Data Content</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.deviceId} style={{ cursor: 'pointer', transition: 'background 0.2s' }}
                    onClick={() => window.location.href = `/device?id=${device.deviceId}`}>
                    <td style={{ fontWeight: 600, color: 'var(--primary)', textDecoration: 'underline', textUnderlineOffset: '4px' }}>
                      {device.deviceId} ↗
                    </td>
                    <td style={{ color: '#a1a1aa', whiteSpace: 'nowrap' }}>
                      {device.lastUpdated
                        ? new Date(device.lastUpdated).toLocaleTimeString()
                        : 'Just now'}
                    </td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>
                      {device.rawContent || device.originalRaw}
                    </td>
                  </tr>
                ))}
                {devices.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: '4rem', color: '#52525b' }}>
                      {/* Empty State */}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
