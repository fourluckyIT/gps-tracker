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
      setDevices((prev) => ({
        ...prev,
        [data.device_id]: data // Auto Upsert/Overwrite
      }));
    });

    // 3. Initial Fetch (Snapshot)
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

  // Sort by time (Newest top)
  const sortedList = Object.values(devices).sort((a, b) =>
    new Date(b.last_update) - new Date(a.last_update)
  );

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>SYSTEM_MONITOR_V2</h1>
        <div style={{ color: connected ? '#00ff9d' : '#ff0055' }}>
          ● {connected ? 'REALTIME_SOCKET' : 'DISCONNECTED'}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>DEVICE ID (LINK)</th>
            <th>STATUS</th>
            <th>LAT / LNG</th>
            <th>LAST UPDATE</th>
            <th>RAW DATA</th>
          </tr>
        </thead>
        <tbody>
          {sortedList.length === 0 && (
            <tr><td colSpan={5} className="loading">Waiting for data stream...</td></tr>
          )}
          {sortedList.map((d) => (
            <tr key={d.device_id}>
              <td>
                <a href={`/device?id=${d.device_id}`} target="_blank" rel="noopener noreferrer">
                  [{d.device_id}] ↗
                </a>
              </td>
              <td className={d.status === 'WALKING' ? 'status-active' : ''}>
                {d.status || 'Active'}
              </td>
              <td style={{ fontFamily: 'monospace' }}>
                {d.lat?.toFixed(6)}, {d.lng?.toFixed(6)}
              </td>
              <td>
                {new Date(d.last_update).toLocaleTimeString()}
              </td>
              <td style={{ opacity: 0.5, fontSize: '0.8rem' }}>
                {d.raw || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
