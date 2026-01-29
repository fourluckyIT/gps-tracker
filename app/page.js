"use client";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";

// VPS URL (Socket)
const SERVER_URL = "http://143.14.200.117";
const STORAGE_KEY = "gps_tracker_devices";

export default function Home() {
  const [devices, setDevices] = useState({});
  const [connected, setConnected] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [logs, setLogs] = useState([]); // Real-time Log Stream

  // Load from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setDevices(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved devices:", e);
      }
    }
  }, []);

  // Save to localStorage whenever devices change
  useEffect(() => {
    if (mounted && Object.keys(devices).length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
    }
  }, [devices, mounted]);

  useEffect(() => {
    // 1. Connect to Socket
    console.log("Connecting to Socket...");
    const socket = io(SERVER_URL, {
      transports: ["websocket"], // Force WebSocket for speed
      reconnectionAttempts: 5
    });

    socket.on("connect", () => {
      console.log("Socket Connected!");
      setConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("Socket Disconnected");
      setConnected(false);
    });

    // 2. Listen for Realtime Pushes
    socket.on("device_update", (data) => {
      // data = { device_id, lat, lng, status, raw, ... }

      // A. Update Device State (Last Known)
      setDevices((prev) => ({
        ...prev,
        [data.device_id]: data
      }));

      // B. Append to Log Stream (Newest First)
      setLogs((prev) => {
        const newLogs = [data, ...prev];
        return newLogs.slice(0, 50); // Keep last 50
      });
    });

    // 3. Listen for Clear Event
    socket.on("clear_data", () => {
      setDevices({});
      setLogs([]);
      localStorage.removeItem(STORAGE_KEY);
    });

    // 4. Initial Fetch (Snapshot)
    fetch(`${SERVER_URL}/api/devices`)
      .then(res => res.json())
      .then(data => {
        const map = {};
        data.forEach(d => map[d.device_id] = d);
        setDevices(prev => ({ ...map, ...prev }));
      })
      .catch(err => console.error("Snapshot failed:", err));

    return () => socket.disconnect();
  }, []);

  const handleClear = async () => {
    if (!confirm("Are you sure you want to clear ALL data?")) return;
    await fetch(`${SERVER_URL}/api/clear`, { method: 'POST' });
  };

  // Sort by time (Newest top)
  const sortedList = Object.values(devices).sort((a, b) =>
    new Date(b.last_update) - new Date(a.last_update)
  );

  return (
    <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>SYSTEM_MONITOR_V2</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button onClick={handleClear} style={{ background: '#FF4444', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            🗑️ Clear Data
          </button>
          <div style={{ color: connected ? '#00ff9d' : '#ff0055', fontWeight: 'bold' }}>
            ● {connected ? 'ONLINE' : 'DISCONNECTED'}
          </div>
        </div>
      </div>

      {/* SECTION 1: DEVICE STATUS (Unique ID) */}
      <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: '#888' }}>Last Known Status (Unique Devices)</h2>
      <table className="device-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #333', textAlign: 'left' }}>
            <th style={{ padding: '10px' }}>DEVICE ID</th>
            <th style={{ padding: '10px' }}>STATUS</th>
            <th style={{ padding: '10px' }}>LAT / LNG</th>
            <th style={{ padding: '10px' }}>LAST UPDATE</th>
            <th style={{ padding: '10px' }}>RAW DATA</th>
          </tr>
        </thead>
        <tbody>
          {sortedList.length === 0 && (
            <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No active devices</td></tr>
          )}
          {sortedList.map((d) => (
            <tr key={d.device_id} style={{ borderBottom: '1px solid #222' }}>
              <td style={{ padding: '10px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <a href={`/device.html?id=${d.device_id}`} style={{ color: '#4ECDC4', textDecoration: 'none', border: '1px solid #4ECDC4', padding: '2px 6px', borderRadius: '4px' }}>📄 LOG</a>
                  <a href={`/map.html?id=${d.device_id}`} style={{ color: '#FFE66D', textDecoration: 'none', border: '1px solid #FFE66D', padding: '2px 6px', borderRadius: '4px' }}>🗺️ MAP</a>
                </div>
                <div style={{ marginTop: '5px', fontSize: '0.9rem', color: '#fff' }}>[{d.device_id}]</div>
              </td>
              <td style={{ padding: '10px', color: d.status === 'WALKING' ? '#00ff9d' : '#white' }}>{d.status || 'Active'}</td>
              <td style={{ padding: '10px', fontFamily: 'monospace' }}>{d.lat ? `${d.lat.toFixed(6)}, ${d.lng.toFixed(6)}` : '-'}</td>
              <td style={{ padding: '10px', color: '#888' }}>{new Date(d.last_update).toLocaleTimeString()}</td>
              <td style={{ padding: '10px', fontSize: '0.8rem', opacity: 0.7 }}>{d.raw || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* SECTION 2: LIVE STREAM (Log) */}
      <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: '#888', marginTop: '30px' }}>Live Data Feed (Incoming Packet Stream)</h2>
      <div style={{ background: '#111', borderRadius: '8px', padding: '10px', border: '1px solid #333', maxHeight: '400px', overflowY: 'auto' }}>
        {logs.length === 0 && <div style={{ color: '#666', padding: '10px', textAlign: 'center' }}>Waiting for data packets...</div>}
        {logs.map((log, i) => (
          <div key={i} style={{ display: 'flex', gap: '10px', padding: '8px', borderBottom: '1px solid #222', fontSize: '0.9rem' }}>
            <div style={{ color: '#666', minWidth: '80px' }}>{new Date(log.last_update).toLocaleTimeString()}</div>
            <div style={{ color: '#4ECDC4', minWidth: '120px' }}>[{log.device_id}]</div>
            <div style={{ color: '#fff', flex: 1, fontFamily: 'monospace' }}>{log.raw}</div>
          </div>
        ))}
      </div>

    </main>
  );
}
