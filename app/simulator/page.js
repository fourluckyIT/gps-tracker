"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Play, Pause, Plus, Trash2, Send, Zap, ArrowLeft, RotateCcw } from "lucide-react";

const SERVER_URL = typeof window !== 'undefined' ? window.location.origin : "http://localhost:3000";

// Thai locations for simulation
const THAI_LOCATIONS = [
    { name: "กรุงเทพฯ (สยาม)", lat: 13.7461, lng: 100.5345 },
    { name: "กรุงเทพฯ (อโศก)", lat: 13.7371, lng: 100.5601 },
    { name: "กรุงเทพฯ (สีลม)", lat: 13.7263, lng: 100.5234 },
    { name: "เชียงใหม่ (เมือง)", lat: 18.7883, lng: 98.9853 },
    { name: "ภูเก็ต (ป่าตอง)", lat: 7.8961, lng: 98.3008 },
    { name: "พัทยา", lat: 12.9236, lng: 100.8825 },
    { name: "อยุธยา", lat: 14.3532, lng: 100.5685 },
    { name: "ขอนแก่น", lat: 16.4322, lng: 102.8236 },
    { name: "หาดใหญ่", lat: 7.0086, lng: 100.4747 },
    { name: "นครราชสีมา", lat: 14.9799, lng: 102.0978 },
];

const STATUS_OPTIONS = [
    { value: "3", label: "✅ ปกติ (NORMAL)", color: "#22C55E" },
    { value: "1", label: "🚨 ถูกขโมย (STOLEN)", color: "#EF4444" },
    { value: "2", label: "💥 อุบัติเหตุ (CRASH)", color: "#F97316" },
    { value: "0", label: "❓ ไม่ทราบ (UNKNOWN)", color: "#6B7280" },
];

function generateMac() {
    const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
    return `${hex()}:${hex()}:${hex()}:${hex()}:${hex()}:${hex()}`;
}

export default function SimulatorPage() {
    const [devices, setDevices] = useState([]);
    const [logs, setLogs] = useState([]);
    const [autoSend, setAutoSend] = useState(false);
    const [interval, setInterval_] = useState(3);
    const [sending, setSending] = useState(false);

    // Add a new device
    const addDevice = () => {
        const location = THAI_LOCATIONS[Math.floor(Math.random() * THAI_LOCATIONS.length)];
        const newDevice = {
            id: Date.now(),
            mac: generateMac(),
            status: "3",
            lat: location.lat + (Math.random() - 0.5) * 0.01,
            lng: location.lng + (Math.random() - 0.5) * 0.01,
            locationName: location.name,
            enabled: true,
        };
        setDevices(prev => [...prev, newDevice]);
    };

    // Add multiple devices at once
    const addMultipleDevices = (count) => {
        const newDevices = [];
        for (let i = 0; i < count; i++) {
            const location = THAI_LOCATIONS[Math.floor(Math.random() * THAI_LOCATIONS.length)];
            newDevices.push({
                id: Date.now() + i,
                mac: generateMac(),
                status: String(Math.floor(Math.random() * 4)),
                lat: location.lat + (Math.random() - 0.5) * 0.01,
                lng: location.lng + (Math.random() - 0.5) * 0.01,
                locationName: location.name,
                enabled: true,
            });
        }
        setDevices(prev => [...prev, ...newDevices]);
    };

    // Remove device
    const removeDevice = (id) => {
        setDevices(prev => prev.filter(d => d.id !== id));
    };

    // Update device
    const updateDevice = (id, field, value) => {
        setDevices(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
    };

    // Move device slightly (simulate GPS drift)
    const moveDevice = (id) => {
        setDevices(prev => prev.map(d => {
            if (d.id !== id) return d;
            return {
                ...d,
                lat: d.lat + (Math.random() - 0.5) * 0.001,
                lng: d.lng + (Math.random() - 0.5) * 0.001,
            };
        }));
    };

    // Send data for one device
    const sendDevice = async (device) => {
        const payload = `${device.mac},${device.status} ${device.lat.toFixed(6)}, ${device.lng.toFixed(6)}, ${Date.now()}`;

        try {
            const res = await fetch(`${SERVER_URL}/api/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: payload,
            });

            const statusLabel = STATUS_OPTIONS.find(s => s.value === device.status)?.label || device.status;
            const logEntry = {
                id: Date.now(),
                time: new Date().toLocaleTimeString('th-TH'),
                mac: device.mac,
                status: statusLabel,
                success: res.ok,
            };
            setLogs(prev => [logEntry, ...prev.slice(0, 49)]);

            return res.ok;
        } catch (err) {
            const logEntry = {
                id: Date.now(),
                time: new Date().toLocaleTimeString('th-TH'),
                mac: device.mac,
                status: 'ERROR',
                success: false,
                error: err.message,
            };
            setLogs(prev => [logEntry, ...prev.slice(0, 49)]);
            return false;
        }
    };

    // Send all enabled devices
    const sendAll = async () => {
        setSending(true);
        const enabledDevices = devices.filter(d => d.enabled);

        for (const device of enabledDevices) {
            await sendDevice(device);
            // Add slight GPS movement
            moveDevice(device.id);
            await new Promise(r => setTimeout(r, 100)); // Small delay between sends
        }
        setSending(false);
    };

    // Auto-send effect
    useEffect(() => {
        if (!autoSend) return;

        const timer = setInterval(() => {
            sendAll();
        }, interval * 1000);

        return () => clearInterval(timer);
    }, [autoSend, interval, devices]);

    // Clear all data from server
    const clearServer = async () => {
        if (confirm('ยืนยันล้างข้อมูลทั้งหมดใน Server?')) {
            await fetch(`${SERVER_URL}/api/clear`, { method: 'POST' });
            setLogs([{ id: Date.now(), time: new Date().toLocaleTimeString('th-TH'), mac: 'SYSTEM', status: '🗑️ Server Cleared', success: true }]);
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
            {/* Header */}
            <header style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Link href="/" style={{ color: '#888', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
                        <ArrowLeft size={20} /> Dashboard
                    </Link>
                    <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        🧪 Device Simulator
                    </h1>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={clearServer} style={{ background: 'rgba(239,68,68,0.2)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <RotateCcw size={16} /> ล้าง Server
                    </button>
                </div>
            </header>

            <main style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '20px' }}>
                    {/* Left: Devices Panel */}
                    <div>
                        {/* Controls */}
                        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                                <button onClick={addDevice} style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Plus size={18} /> เพิ่ม 1 Device
                                </button>
                                <button onClick={() => addMultipleDevices(3)} style={{ background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    +3 Devices
                                </button>
                                <button onClick={() => addMultipleDevices(5)} style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    +5 Devices
                                </button>

                                <div style={{ flex: 1 }} />

                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.3)', padding: '8px 16px', borderRadius: '10px' }}>
                                    <span style={{ fontSize: '0.85rem', color: '#aaa' }}>Auto-send ทุก</span>
                                    <input
                                        type="number"
                                        value={interval}
                                        onChange={(e) => setInterval_(Math.max(1, parseInt(e.target.value) || 1))}
                                        style={{ width: '50px', background: '#333', border: '1px solid #444', borderRadius: '6px', padding: '6px', color: 'white', textAlign: 'center' }}
                                    />
                                    <span style={{ fontSize: '0.85rem', color: '#aaa' }}>วินาที</span>
                                </div>

                                <button
                                    onClick={() => setAutoSend(!autoSend)}
                                    style={{
                                        background: autoSend ? 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)' : 'linear-gradient(135deg, #56ab2f 0%, #a8e063 100%)',
                                        color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px'
                                    }}
                                >
                                    {autoSend ? <><Pause size={18} /> หยุด Auto</> : <><Play size={18} /> เริ่ม Auto</>}
                                </button>

                                <button onClick={sendAll} disabled={sending || devices.length === 0} style={{ background: sending ? '#444' : 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: sending ? 'not-allowed' : 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Zap size={18} /> ส่งทันที
                                </button>
                            </div>
                        </div>

                        {/* Devices List */}
                        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <h2 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                📱 Devices ({devices.length})
                            </h2>

                            {devices.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                                    <p>ยังไม่มี Device</p>
                                    <p style={{ fontSize: '0.875rem' }}>กดปุ่ม "เพิ่ม Device" เพื่อเริ่มต้น</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {devices.map((device) => {
                                        const statusOpt = STATUS_OPTIONS.find(s => s.value === device.status);
                                        return (
                                            <div key={device.id} style={{
                                                background: device.enabled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                                                borderRadius: '12px',
                                                padding: '16px',
                                                border: `1px solid ${device.enabled ? statusOpt?.color || '#444' : '#333'}`,
                                                opacity: device.enabled ? 1 : 0.5,
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={device.enabled}
                                                        onChange={(e) => updateDevice(device.id, 'enabled', e.target.checked)}
                                                        style={{ width: '18px', height: '18px', accentColor: '#4ECDC4' }}
                                                    />
                                                    <code style={{ flex: 1, fontSize: '0.9rem', color: '#fff', background: 'rgba(0,0,0,0.3)', padding: '6px 12px', borderRadius: '6px' }}>
                                                        {device.mac}
                                                    </code>
                                                    <span style={{ fontSize: '0.75rem', color: '#888' }}>{device.locationName}</span>
                                                    <button onClick={() => sendDevice(device)} style={{ background: '#3B82F6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' }}>
                                                        <Send size={14} />
                                                    </button>
                                                    <button onClick={() => removeDevice(device.id)} style={{ background: 'transparent', color: '#EF4444', border: 'none', padding: '6px', cursor: 'pointer' }}>
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>

                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                                                    <div>
                                                        <label style={{ fontSize: '0.7rem', color: '#888', display: 'block', marginBottom: '4px' }}>สถานะ</label>
                                                        <select
                                                            value={device.status}
                                                            onChange={(e) => updateDevice(device.id, 'status', e.target.value)}
                                                            style={{ width: '100%', background: '#222', border: '1px solid #444', borderRadius: '6px', padding: '8px', color: 'white', fontSize: '0.85rem' }}
                                                        >
                                                            {STATUS_OPTIONS.map(opt => (
                                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label style={{ fontSize: '0.7rem', color: '#888', display: 'block', marginBottom: '4px' }}>Latitude</label>
                                                        <input
                                                            type="number"
                                                            step="0.0001"
                                                            value={device.lat.toFixed(6)}
                                                            onChange={(e) => updateDevice(device.id, 'lat', parseFloat(e.target.value))}
                                                            style={{ width: '100%', background: '#222', border: '1px solid #444', borderRadius: '6px', padding: '8px', color: 'white', fontSize: '0.85rem' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={{ fontSize: '0.7rem', color: '#888', display: 'block', marginBottom: '4px' }}>Longitude</label>
                                                        <input
                                                            type="number"
                                                            step="0.0001"
                                                            value={device.lng.toFixed(6)}
                                                            onChange={(e) => updateDevice(device.id, 'lng', parseFloat(e.target.value))}
                                                            style={{ width: '100%', background: '#222', border: '1px solid #444', borderRadius: '6px', padding: '8px', color: 'white', fontSize: '0.85rem' }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Activity Log */}
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.1)', height: 'fit-content', position: 'sticky', top: '80px' }}>
                        <h2 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            📜 Activity Log
                            {autoSend && <span style={{ fontSize: '0.7rem', background: '#22C55E', padding: '4px 8px', borderRadius: '20px', animation: 'pulse 1s infinite' }}>🔴 LIVE</span>}
                        </h2>

                        <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
                            {logs.length === 0 ? (
                                <p style={{ color: '#666', textAlign: 'center', padding: '20px' }}>รอส่งข้อมูล...</p>
                            ) : (
                                logs.map((log) => (
                                    <div key={log.id} style={{
                                        padding: '10px 12px',
                                        background: log.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                        borderRadius: '8px',
                                        marginBottom: '8px',
                                        fontSize: '0.8rem',
                                        borderLeft: `3px solid ${log.success ? '#22C55E' : '#EF4444'}`
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span style={{ color: '#888' }}>{log.time}</span>
                                            <span style={{ color: log.success ? '#22C55E' : '#EF4444' }}>{log.success ? '✓' : '✗'}</span>
                                        </div>
                                        <div style={{ fontFamily: 'monospace', color: '#fff', wordBreak: 'break-all' }}>{log.mac}</div>
                                        <div style={{ color: '#aaa', marginTop: '2px' }}>{log.status}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </main>

            <style jsx global>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
        </div>
    );
}
