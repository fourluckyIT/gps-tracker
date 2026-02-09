"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { io } from "socket.io-client";
import { MapPin, Clock, AlertTriangle, Car, ChevronRight, X, Wifi, WifiOff } from "lucide-react";

const SERVER_URL = typeof window !== 'undefined' ? window.location.origin : "http://localhost:3000";

const STATUS_CONFIG = {
    'STOLEN': { color: '#EF4444', bg: '#FEE2E2', label: '🚨 ถูกขโมย', priority: 1 },
    'CRASH': { color: '#F97316', bg: '#FFEDD5', label: '💥 อุบัติเหตุ', priority: 2 },
    'NORMAL': { color: '#22C55E', bg: '#DCFCE7', label: '✅ ปกติ', priority: 3 },
    'UNKNOWN': { color: '#6B7280', bg: '#F3F4F6', label: '❓ ไม่ทราบ', priority: 4 },
};

export default function Dashboard() {
    const [devices, setDevices] = useState([]);
    const [connected, setConnected] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [credentials, setCredentials] = useState({});
    const [generatingCode, setGeneratingCode] = useState(null);

    // 2FA State
    const [authStatus, setAuthStatus] = useState('loading'); // loading, authenticated, unauthenticated, setup_required
    const [authData, setAuthData] = useState({ secret: '', qr_code: '' });
    const [totpCode, setTotpCode] = useState('');
    const [authError, setAuthError] = useState('');

    // Check Auth Status on Load
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const res = await fetch(`${SERVER_URL}/api/auth/status`);
                const data = await res.json();
                if (data.authenticated) {
                    setAuthStatus('authenticated');
                } else if (!data.enabled) {
                    // Fetch Setup Data if 2FA not enabled
                    const setupRes = await fetch(`${SERVER_URL}/api/auth/setup`, { method: 'POST' });
                    const setupData = await setupRes.json();
                    setAuthData(setupData);
                    setAuthStatus('setup_required');
                } else {
                    setAuthStatus('unauthenticated');
                }
            } catch (err) {
                console.error("Auth check failed", err);
                setAuthStatus('error');
            }
        };
        checkAuth();
    }, []);

    // Fetch initial devices (Only if authenticated - handled by conditionals later, but fetch will fail/auth error if not)
    useEffect(() => {
        if (authStatus !== 'authenticated') return;
        fetch(`${SERVER_URL}/api/devices`)
            .then(res => res.json())
            .then(data => setDevices(data || []))
            .catch(err => console.error("Fetch error:", err));
    }, [authStatus]);

    // WebSocket for real-time updates
    useEffect(() => {
        if (authStatus !== 'authenticated') return;
        const socket = io(SERVER_URL, { transports: ["websocket"] });

        socket.on("connect", () => setConnected(true));
        socket.on("disconnect", () => setConnected(false));
        // ... rest of socket logic
        socket.on("device_update", (data) => {
            setDevices(prev => {
                const exists = prev.find(d => d.device_id === data.device_id);
                if (exists) {
                    return prev.map(d => d.device_id === data.device_id
                        ? { ...d, lat: data.lat, lng: data.lng, status: data.status, last_update: data.last_update }
                        : d
                    );
                } else {
                    return [{ device_id: data.device_id, lat: data.lat, lng: data.lng, status: data.status, last_update: data.last_update }, ...prev];
                }
            });
        });

        socket.on("clear_data", () => setDevices([]));
        return () => socket.disconnect();
    }, [authStatus]);

    // Fetch credentials on load
    useEffect(() => {
        if (authStatus !== 'authenticated') return;
        fetch(`${SERVER_URL}/api/admin/credentials`)
            .then(res => res.json())
            .then(data => {
                const map = {};
                (data || []).forEach(c => { map[c.device_id] = c; });
                setCredentials(map);
            })
            .catch(console.error);
    }, [authStatus]);

    // Generate credential for device
    const generateCredential = async (deviceId) => {
        setGeneratingCode(deviceId);
        try {
            const res = await fetch(`${SERVER_URL}/api/admin/credential`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device_id: deviceId }),
            });
            const data = await res.json();
            if (data.success) {
                setCredentials(prev => ({
                    ...prev,
                    [deviceId]: { code: data.code, is_registered: 0 }
                }));
            }
        } catch (err) {
            console.error(err);
        }
        setGeneratingCode(null);
    };

    // Fetch logs when device selected
    const openLogs = (device) => {
        setSelectedDevice(device);
        setLogsLoading(true);
        fetch(`${SERVER_URL}/api/history/${device.device_id}?limit=50`)
            .then(res => res.json())
            .then(data => {
                setLogs(data || []);
                setLogsLoading(false);
            })
            .catch(err => {
                console.error("Logs fetch error:", err);
                setLogsLoading(false);
            });
    };

    // Verify 2FA
    const handleVerify = async () => {
        setAuthError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/auth/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: totpCode, secret: authData.secret }) // Send secret only if setup
            });
            const data = await res.json();
            if (data.success) {
                setAuthStatus('authenticated');
            } else {
                setAuthError('รหัสไม่ถูกต้อง กรุณาลองใหม่');
            }
        } catch (err) {
            setAuthError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
        }
    };

    const getStatusConfig = (status) => STATUS_CONFIG[status] || STATUS_CONFIG['UNKNOWN'];

    // --- AUTH UI RENDERING ---
    if (authStatus === 'loading') return <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;

    if (authStatus === 'setup_required') {
        return (
            <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px' }}>
                <div style={{ background: '#111', padding: '40px', borderRadius: '12px', border: '1px solid #333', textAlign: 'center', maxWidth: '400px' }}>
                    <h1 style={{ fontSize: '1.5rem', marginBottom: '10px' }}>🔐 ตั้งค่าความปลอดภัย 2FA</h1>
                    <p style={{ color: '#aaa', marginBottom: '20px' }}>สแกน QR Code ด้วย Google Authenticator</p>

                    {authData.qr_code && <img src={authData.qr_code} alt="QR Code" style={{ borderRadius: '8px', marginBottom: '20px', display: 'block', marginLeft: 'auto', marginRight: 'auto' }} />}

                    <p style={{ color: '#666', fontSize: '0.8rem', marginBottom: '20px', wordBreak: 'break-all' }}>Secret: {authData.secret}</p>

                    <input
                        type="text"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        placeholder="กรอกรหัส 6 หลัก"
                        style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: 'white', borderRadius: '8px', fontSize: '1.2rem', textAlign: 'center', marginBottom: '10px' }}
                    />

                    {authError && <p style={{ color: '#EF4444', marginBottom: '10px' }}>{authError}</p>}

                    <button
                        onClick={handleVerify}
                        style={{ width: '100%', padding: '12px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        ยืนยันและเปิดใช้งาน
                    </button>
                </div>
            </div>
        );
    }

    if (authStatus === 'unauthenticated') {
        return (
            <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px' }}>
                <div style={{ background: '#111', padding: '40px', borderRadius: '12px', border: '1px solid #333', textAlign: 'center', maxWidth: '350px', width: '100%' }}>
                    <h1 style={{ fontSize: '1.5rem', marginBottom: '20px' }}>🔐 เข้าสู่ระบบ</h1>

                    <input
                        type="text"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        placeholder="รหัส 2FA 6 หลัก"
                        style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: 'white', borderRadius: '8px', fontSize: '1.2rem', textAlign: 'center', marginBottom: '20px' }}
                        onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                    />

                    {authError && <p style={{ color: '#EF4444', marginBottom: '20px' }}>{authError}</p>}

                    <button
                        onClick={handleVerify}
                        style={{ width: '100%', padding: '12px', background: '#22C55E', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        เข้าสู่ระบบ
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
            {/* Header */}
            <header style={{ background: '#111', borderBottom: '1px solid #222', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    🛰️ GPS Tracker Dashboard
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Link href="/simulator" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '8px 16px', borderRadius: '8px', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 'bold' }}>
                        🧪 Simulator
                    </Link>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', color: connected ? '#22C55E' : '#EF4444' }}>
                        {connected ? <Wifi size={18} /> : <WifiOff size={18} />}
                        {connected ? "Connected" : "Disconnected"}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                    <StatCard icon="📡" label="อุปกรณ์ทั้งหมด" value={devices.length} color="#3B82F6" />
                    <StatCard icon="🚨" label="แจ้งเตือน" value={devices.filter(d => d.status === 'STOLEN' || d.status === 'CRASH').length} color="#EF4444" />
                    <StatCard icon="✅" label="ปกติ" value={devices.filter(d => d.status === 'NORMAL').length} color="#22C55E" />
                </div>

                {/* Devices Table */}
                <div style={{ background: '#111', borderRadius: '12px', overflow: 'hidden', border: '1px solid #222' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #222', fontWeight: 'bold', fontSize: '1rem' }}>
                        📋 รายการอุปกรณ์
                    </div>

                    {devices.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                            <Car size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                            <p>ยังไม่มีอุปกรณ์</p>
                            <p style={{ fontSize: '0.875rem' }}>รอรับข้อมูลจาก ESP32...</p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#1a1a1a', fontSize: '0.75rem', textTransform: 'uppercase', color: '#888' }}>
                                        <th style={{ padding: '12px 16px', textAlign: 'left' }}>MAC Address</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left' }}>สถานะ</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left' }}>พิกัด</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left' }}>อัพเดทล่าสุด</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'center' }}>Credential</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {devices.map((device, idx) => {
                                        const cfg = getStatusConfig(device.status);
                                        const cred = credentials[device.device_id];
                                        return (
                                            <tr key={device.device_id} style={{ borderBottom: '1px solid #222', cursor: 'pointer' }} onClick={() => openLogs(device)}>
                                                <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                                                    {device.device_id}
                                                </td>
                                                <td style={{ padding: '14px 16px' }}>
                                                    <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', background: cfg.bg, color: cfg.color }}>
                                                        {cfg.label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '14px 16px', fontSize: '0.85rem', color: '#aaa' }}>
                                                    {device.lat?.toFixed(5)}, {device.lng?.toFixed(5)}
                                                </td>
                                                <td style={{ padding: '14px 16px', fontSize: '0.85rem', color: '#888' }}>
                                                    {device.last_update ? new Date(device.last_update).toLocaleString('th-TH') : '-'}
                                                </td>
                                                <td style={{ padding: '14px 16px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                                    {cred ? (
                                                        <span style={{
                                                            fontFamily: 'monospace',
                                                            fontSize: '0.9rem',
                                                            fontWeight: 'bold',
                                                            color: cred.is_registered ? '#22C55E' : '#FBBF24',
                                                            background: cred.is_registered ? '#052e16' : '#422006',
                                                            padding: '4px 10px',
                                                            borderRadius: '6px',
                                                        }}>
                                                            {cred.code} {cred.is_registered ? '✅' : '⏳'}
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={() => generateCredential(device.device_id)}
                                                            disabled={generatingCode === device.device_id}
                                                            style={{
                                                                background: '#8B5CF6',
                                                                color: 'white',
                                                                border: 'none',
                                                                padding: '6px 12px',
                                                                borderRadius: '6px',
                                                                cursor: 'pointer',
                                                                fontSize: '0.75rem',
                                                                opacity: generatingCode === device.device_id ? 0.5 : 1,
                                                            }}
                                                        >
                                                            {generatingCode === device.device_id ? '...' : '🔑 สร้างรหัส'}
                                                        </button>
                                                    )}
                                                </td>
                                                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                    <Link href={`/map?id=${encodeURIComponent(device.device_id)}`} onClick={(e) => e.stopPropagation()}>
                                                        <button style={{ background: '#3B82F6', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                            🗺️ Map
                                                        </button>
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>

            {/* Logs Modal */}
            {selectedDevice && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setSelectedDevice(null)}>
                    <div style={{ background: '#111', borderRadius: '16px', width: '100%', maxWidth: '600px', maxHeight: '80vh', overflow: 'hidden', border: '1px solid #333' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0, fontSize: '1rem' }}>📜 Log: {selectedDevice.device_id}</h2>
                            <button onClick={() => setSelectedDevice(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>
                        <div style={{ maxHeight: '60vh', overflow: 'auto', padding: '12px' }}>
                            {logsLoading ? (
                                <p style={{ textAlign: 'center', color: '#888', padding: '20px' }}>กำลังโหลด...</p>
                            ) : logs.length === 0 ? (
                                <p style={{ textAlign: 'center', color: '#888', padding: '20px' }}>ไม่มีประวัติ</p>
                            ) : (
                                logs.map((log, idx) => (
                                    <div key={log.id || idx} style={{ padding: '10px 12px', background: '#1a1a1a', borderRadius: '8px', marginBottom: '8px', fontSize: '0.85rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span style={{ color: getStatusConfig(log.status).color, fontWeight: 'bold' }}>{getStatusConfig(log.status).label}</span>
                                            <span style={{ color: '#666' }}>{new Date(log.timestamp).toLocaleString('th-TH')}</span>
                                        </div>
                                        <div style={{ color: '#aaa' }}>📍 {log.lat?.toFixed(5)}, {log.lng?.toFixed(5)}</div>
                                    </div>
                                ))
                            )}
                        </div>
                        <div style={{ padding: '12px 20px', borderTop: '1px solid #222' }}>
                            <Link href={`/map?id=${encodeURIComponent(selectedDevice.device_id)}`}>
                                <button style={{ width: '100%', background: '#4ECDC4', color: 'black', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}>
                                    🗺️ เปิดแผนที่
                                </button>
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ icon, label, value, color }) {
    return (
        <div style={{ background: '#111', border: '1px solid #222', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{icon}</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color }}>{value}</div>
            <div style={{ fontSize: '0.75rem', color: '#888' }}>{label}</div>
        </div>
    );
}
