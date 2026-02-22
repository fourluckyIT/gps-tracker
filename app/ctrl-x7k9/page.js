"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { io } from "socket.io-client";
import { MapPin, Clock, AlertTriangle, Car, ChevronRight, X, Wifi, WifiOff, LogOut } from "lucide-react";

const SERVER_URL = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? window.location.origin
    : "http://143.14.200.117";


const STATUS_CONFIG = {
    'STOLEN': { color: '#EF4444', bg: '#FEE2E2', label: '🚨 ถูกขโมย', priority: 1 },
    'CRASH': { color: '#F97316', bg: '#FFEDD5', label: '💥 อุบัติเหตุ', priority: 2 },
    'NORMAL': { color: '#22C55E', bg: '#DCFCE7', label: '✅ ปกติ', priority: 3 },
    'PARKED': { color: '#3B82F6', bg: '#DBEAFE', label: '🅿️ จอดรถ', priority: 4 },
};

export default function Dashboard() {
    // Auth State
    const [authStatus, setAuthStatus] = useState('loading'); // loading, authenticated, unauthenticated, setup_required, error
    const [userRole, setUserRole] = useState('');
    const [authError, setAuthError] = useState('');

    // Login Form State
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');

    // Setup Wizard State
    const [setupStep, setSetupStep] = useState(1);
    const [email, setEmail] = useState('pakiyhm@gmail.com');
    const [setupSecret, setSetupSecret] = useState('');
    const [qrUrl, setQrUrl] = useState('');
    const [totp, setTotp] = useState('');

    // Login TOTP State
    const [loginTotp, setLoginTotp] = useState('');
    const [needsTOTP, setNeedsTOTP] = useState(false);

    // Dashboard State
    const [devices, setDevices] = useState([]);
    const [connected, setConnected] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [credentials, setCredentials] = useState({});
    const [generatingCode, setGeneratingCode] = useState(null);
    const [admins, setAdmins] = useState([]);
    const [newAdminPhone, setNewAdminPhone] = useState('');
    const [newAdminPass, setNewAdminPass] = useState('');
    const [showAdminPanel, setShowAdminPanel] = useState(false);

    // Initial Auth Check
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const res = await fetch(`${SERVER_URL}/api/auth/status`);
                const data = await res.json();
                if (data.authenticated) {
                    setAuthStatus('authenticated');
                    setUserRole(data.role || '');
                    if (data.role === 'SUPER_ADMIN') fetchAdmins();
                } else if (data.needsSetup) {
                    setAuthStatus('setup_required');
                    setPhone('0634969565');
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

    // Socket Connection (Only when authenticated)
    const socketRef = useRef(null);
    useEffect(() => {
        if (authStatus !== 'authenticated') return;

        socketRef.current = io(SERVER_URL, { transports: ["websocket"] });
        const socket = socketRef.current;

        socket.on("connect", () => setConnected(true));
        socket.on("disconnect", () => setConnected(false));
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

        // Initial fetch
        fetch(`${SERVER_URL}/api/devices`)
            .then(res => res.json())
            .then(data => setDevices(data || []))
            .catch(console.error);

        // Fetch credentials
        fetch(`${SERVER_URL}/api/admin/credentials`)
            .then(res => res.json())
            .then(data => {
                const map = {};
                (data || []).forEach(c => { map[c.device_id] = c; });
                setCredentials(map);
            })
            .catch(console.error);

        return () => {
            if (socket) socket.disconnect();
        };
    }, [authStatus]);

    // Admin & Dashboard Functions
    const fetchAdmins = () => {
        fetch(`${SERVER_URL}/api/admin/users`)
            .then(res => res.json())
            .then(data => setAdmins(data || []))
            .catch(console.error);
    };

    const handleLogin = async (isSetup = false) => {
        setAuthError('');
        if (!phone || !password) return setAuthError('กรุณากรอกข้อมูลให้ครบถ้วน');
        try {
            const res = await fetch(`${SERVER_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password, is_setup: isSetup })
            });
            const data = await res.json();
            if (data.success) {
                setAuthStatus('authenticated');
                setUserRole(data.role);
                window.location.reload();
            } else {
                setAuthError(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
            }
        } catch (err) { setAuthError('เชื่อมต่อ Server ไม่ได้'); }
    };

    const handleLogout = async () => {
        try {
            await fetch(`${SERVER_URL}/api/auth/logout`, { method: 'POST' });
            window.location.reload();
        } catch (err) { window.location.reload(); }
    };

    // Setup Handlers
    const handleSetupStep1 = async () => {
        if (!email || !password) return setAuthError('กรุณากรอกข้อมูลให้ครบ');
        try {
            const res = await fetch(`${SERVER_URL}/api/admin/setup/token`, { method: 'POST' });
            const data = await res.json();
            if (data.secret) {
                setSetupSecret(data.secret);
                setQrUrl(data.qrUrl);
                setSetupStep(2);
                setAuthError('');
            } else {
                setAuthError('Error generating token');
            }
        } catch (e) { setAuthError('Connection error'); }
    };

    const handleSetupVerify = async () => {
        if (!totp) return setAuthError('กรุณากรอกรหัส 6 หลัก');
        try {
            const res = await fetch(`${SERVER_URL}/api/admin/setup/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, token: totp, secret: setupSecret })
            });
            const data = await res.json();
            if (data.success) {
                window.location.reload();
            } else {
                setAuthError('รหัสไม่ถูกต้อง');
            }
        } catch (e) { setAuthError('Verification failed'); }
    };

    // Other Dashboard Functions
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
        } catch (err) { console.error(err); }
        setGeneratingCode(null);
    };

    const openLogs = (device) => {
        setSelectedDevice(device);
        setLogsLoading(true);
        fetch(`${SERVER_URL}/api/history/${device.device_id}?limit=50`)
            .then(res => res.json())
            .then(data => {
                setLogs(data || []);
                setLogsLoading(false);
            })
            .catch(err => setLogsLoading(false));
    };

    const handleAddAdmin = async () => {
        if (!newAdminPhone || !newAdminPass) return;
        try {
            const res = await fetch(`${SERVER_URL}/api/admin/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: newAdminPhone, password: newAdminPass, role: 'ADMIN' })
            });
            if (res.ok) {
                setNewAdminPhone('');
                setNewAdminPass('');
                fetchAdmins();
                alert('Success');
            } else { alert('Error'); }
        } catch (e) { console.error(e); }
    };

    const handleDeleteAdmin = async (id) => {
        if (!confirm('ยืนยัน?')) return;
        try {
            const res = await fetch(`${SERVER_URL}/api/admin/users/${id}`, { method: 'DELETE' });
            if (res.ok) fetchAdmins();
        } catch (e) { console.error(e); }
    };

    const getStatusConfig = (status) => STATUS_CONFIG[status] || STATUS_CONFIG['PARKED'];

    // Styles
    const inputStyle = { width: '100%', padding: '12px', background: '#222', border: '1px solid #444', color: 'white', borderRadius: '8px', marginBottom: '12px', boxSizing: 'border-box' };
    const btnStyle = { width: '100%', padding: '12px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' };

    // --- RENDER ---

    if (authStatus === 'loading') return <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;

    // 1. Setup Wizard
    if (authStatus === 'setup_required') {
        return (
            <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <div style={{ background: '#111', padding: '40px', borderRadius: '12px', border: '1px solid #333', textAlign: 'center', maxWidth: '400px', width: '90%' }}>
                    <h1 style={{ fontSize: '1.5rem', marginBottom: '10px' }}>👑 ตั้งค่า Super Admin</h1>

                    {setupStep === 1 && (
                        <>
                            <p style={{ color: '#aaa', marginBottom: '20px' }}>ขั้นตอนที่ 1/2: กำหนดบัญชีผู้ดูแลหลัก</p>
                            <input
                                type="email" placeholder="อีเมล (สำหรับกู้คืน)"
                                value={email} onChange={(e) => setEmail(e.target.value)}
                                style={inputStyle}
                            />
                            <input
                                type="text" value={phone} disabled style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }}
                            />
                            <input
                                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                placeholder="ตั้งรหัสผ่านใหม่" style={inputStyle}
                            />
                            {authError && <p style={{ color: '#EF4444', marginBottom: '10px' }}>{authError}</p>}
                            <button onClick={handleSetupStep1} style={btnStyle}>ถัดไป →</button>
                        </>
                    )}

                    {setupStep === 2 && (
                        <>
                            <p style={{ color: '#aaa', marginBottom: '20px' }}>ขั้นตอนที่ 2/2: สแกนเพื่อยืนยันตัวตน</p>
                            <div style={{ background: 'white', padding: '10px', borderRadius: '8px', display: 'inline-block', marginBottom: '20px' }}>
                                <img src={qrUrl} alt="QR Code" style={{ width: '200px', height: '200px' }} />
                            </div>
                            <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '20px' }}>
                                ใช้แอป Google Authenticator สแกน QR Code นี้<br />แล้วกรอกรหัส 6 หลักด้านล่าง
                            </p>
                            <input
                                type="text" placeholder="รหัส 6 หลัก (เช่น 123456)"
                                value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                style={{ ...inputStyle, textAlign: 'center', fontSize: '1.5rem', letterSpacing: '4px' }}
                            />
                            {authError && <p style={{ color: '#EF4444', marginBottom: '10px' }}>{authError}</p>}
                            <button onClick={handleSetupVerify} style={{ ...btnStyle, background: '#10B981' }}>ยืนยันและเริ่มต้นใช้งาน</button>
                            <button onClick={() => setSetupStep(1)} style={{ ...btnStyle, background: 'none', color: '#666', marginTop: '10px', fontSize: '0.9rem' }}>← ย้อนกลับ</button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // 2. Login
    if (authStatus === 'unauthenticated') {
        const handleLoginSubmit = async () => {
            setAuthError('');
            if (!phone || !password) return setAuthError('กรุณากรอกข้อมูลให้ครบถ้วน');
            if (needsTOTP && !loginTotp) return setAuthError('กรุณากรอกรหัส TOTP');

            try {
                const res = await fetch(`${SERVER_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, password, totp: loginTotp || undefined })
                });
                const data = await res.json();

                if (data.needsTOTP) {
                    setNeedsTOTP(true);
                    setAuthError('Super Admin ต้องใส่รหัส TOTP');
                    return;
                }

                if (data.success) {
                    window.location.reload();
                } else {
                    setAuthError(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
                }
            } catch (err) {
                setAuthError('เชื่อมต่อ Server ไม่ได้');
            }
        };

        return (
            <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#111', padding: '40px', borderRadius: '12px', border: '1px solid #333', textAlign: 'center', maxWidth: '350px', width: '90%' }}>
                    <h1 style={{ fontSize: '1.5rem', marginBottom: '20px' }}>🔐 เข้าสู่ระบบ (Admin)</h1>
                    <input
                        type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                        placeholder="เบอร์โทรศัพท์" style={inputStyle}
                    />
                    <input
                        type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                        placeholder="รหัสผ่าน" style={inputStyle}
                    />
                    {needsTOTP && (
                        <>
                            <p style={{ color: '#F59E0B', fontSize: '0.9rem', marginBottom: '10px' }}>🔐 Super Admin: กรุณากรอกรหัส TOTP จาก Authenticator</p>
                            <input
                                type="text" value={loginTotp} onChange={(e) => setLoginTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="รหัส 6 หลัก"
                                style={{ ...inputStyle, textAlign: 'center', fontSize: '1.5rem', letterSpacing: '4px' }}
                            />
                        </>
                    )}
                    {authError && <p style={{ color: '#EF4444', marginBottom: '20px' }}>{authError}</p>}
                    <button onClick={handleLoginSubmit} style={btnStyle}>เข้าสู่ระบบ</button>
                </div>
            </div>
        );
    }

    // 3. Dashboard (Authenticated)
    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
            <header style={{ background: '#111', borderBottom: '1px solid #222', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>🛰️ GPS Admin {userRole === 'SUPER_ADMIN' && <span style={{ fontSize: '0.8rem', background: '#F59E0B', color: 'black', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>SUPER</span>}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontSize: '0.875rem', color: connected ? '#22C55E' : '#EF4444' }}>{connected ? "Online" : "Offline"}</div>
                    {userRole === 'SUPER_ADMIN' && (
                        <button onClick={() => setShowAdminPanel(!showAdminPanel)} style={{ background: '#333', color: 'white', border: '1px solid #444', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer' }}>
                            👥 จัดการแอดมิน
                        </button>
                    )}
                    <button onClick={handleLogout} style={{ background: '#333', border: '1px solid #444', color: '#ff6b6b', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}>
                        <LogOut size={18} />
                    </button>
                </div>
            </header>

            <main style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
                {/* Admin Management Panel */}
                {showAdminPanel && userRole === 'SUPER_ADMIN' && (
                    <div style={{ marginBottom: '24px', padding: '20px', background: '#1a1a1a', borderRadius: '12px', border: '1px solid #333' }}>
                        <h2 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>👥 จัดการผู้ดูแลระบบ</h2>
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                            <input
                                type="tel" placeholder="เบอร์โทรศัพท์" value={newAdminPhone} onChange={e => setNewAdminPhone(e.target.value)}
                                style={{ ...inputStyle, marginBottom: 0, width: '200px' }}
                            />
                            <input
                                type="password" placeholder="รหัสผ่าน" value={newAdminPass} onChange={e => setNewAdminPass(e.target.value)}
                                style={{ ...inputStyle, marginBottom: 0, width: '200px' }}
                            />
                            <button onClick={handleAddAdmin} style={{ ...btnStyle, width: 'auto', padding: '0 20px', background: '#10B981' }}>เพิ่ม</button>
                        </div>
                        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #333', color: '#888' }}>
                                    <th style={{ padding: '8px' }}>เบอร์โทรศัพท์</th>
                                    <th style={{ padding: '8px' }}>Role</th>
                                    <th style={{ padding: '8px' }}>วันที่สร้าง</th>
                                    <th style={{ padding: '8px' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {admins.map(admin => (
                                    <tr key={admin.id} style={{ borderBottom: '1px solid #222' }}>
                                        <td style={{ padding: '12px 8px' }}>{admin.phone_number}</td>
                                        <td style={{ padding: '12px 8px' }}>
                                            <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '12px', background: admin.role === 'SUPER_ADMIN' ? '#F59E0B' : '#3B82F6', color: admin.role === 'SUPER_ADMIN' ? 'black' : 'white' }}>
                                                {admin.role}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 8px', color: '#888', fontSize: '0.9rem' }}>{new Date(admin.created_at).toLocaleDateString('th-TH')}</td>
                                        <td style={{ padding: '12px 8px' }}>
                                            {admin.role !== 'SUPER_ADMIN' && (
                                                <button onClick={() => handleDeleteAdmin(admin.id)} style={{ color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>ลบ</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Devices List */}
                <div style={{ background: '#111', borderRadius: '12px', overflow: 'hidden', border: '1px solid #222' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #222', fontWeight: 'bold', fontSize: '1rem' }}>
                        📋 รายการอุปกรณ์ ({devices.length})
                    </div>
                    {devices.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                            <Car size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                            <p>ยังไม่มีอุปกรณ์</p>
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
                                        <th style={{ padding: '12px 16px', textAlign: 'left' }}>Owner</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left' }}>Plate</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left' }}>ติดต่อฉุกเฉิน</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {devices.map((device) => {
                                        const cfg = getStatusConfig(device.status);
                                        const cred = credentials[device.device_id];
                                        return (
                                            <tr key={device.device_id} style={{ borderBottom: '1px solid #222', cursor: 'pointer' }} onClick={() => openLogs(device)}>
                                                <td style={{ padding: '14px 16px', fontFamily: 'monospace' }}>{device.device_id}</td>
                                                <td style={{ padding: '14px 16px' }}>
                                                    <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                                                </td>
                                                <td style={{ padding: '14px 16px', color: '#aaa' }}>
                                                    {device.lat != null && device.lng != null
                                                        ? `${device.lat.toFixed(5)}, ${device.lng.toFixed(5)}`
                                                        : '-'}
                                                </td>
                                                <td style={{ padding: '14px 16px', color: '#888' }}>{device.last_update ? new Date(device.last_update).toLocaleTimeString() : '-'}</td>
                                                <td style={{ padding: '14px 16px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                                    {cred ? (
                                                        <span style={{ fontFamily: 'monospace', color: cred.is_registered ? '#22C55E' : '#FBBF24' }}>
                                                            {cred.code} {cred.is_registered ? '✅' : '⏳'}
                                                        </span>
                                                    ) : (
                                                        <button onClick={() => generateCredential(device.device_id)} disabled={generatingCode === device.device_id} style={{ background: '#8B5CF6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem' }}>
                                                            {generatingCode === device.device_id ? '...' : '🔑 สร้างรหัส'}
                                                        </button>
                                                    )}
                                                </td>
                                                <td style={{ padding: '14px 16px' }}>{device.owner || '-'}</td>
                                                <td style={{ padding: '14px 16px' }}>{device.plate_number || '-'}</td>
                                                <td style={{ padding: '14px 16px', color: '#aaa' }}>
                                                    {device.emergency_phone || (device.sos_numbers && device.sos_numbers.length > 0 ? device.sos_numbers.join(', ') : '-')}
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
                            <button onClick={() => setSelectedDevice(null)} style={{ background: 'none', border: 'none', color: 'white' }}><X size={24} /></button>
                        </div>
                        <div style={{ maxHeight: '60vh', overflow: 'auto', padding: '12px' }}>
                            {logs.map((log, idx) => (
                                <div key={idx} style={{ padding: '10px', background: '#1a1a1a', marginBottom: '8px', borderRadius: '8px' }}>
                                    <span style={{ color: getStatusConfig(log.status).color, fontWeight: 'bold' }}>{getStatusConfig(log.status).label}</span>
                                    <span style={{ float: 'right', color: '#666' }}>{new Date(log.timestamp).toLocaleString()}</span>
                                    <div style={{ color: '#aaa', marginTop: '4px' }}>📍 {log.lat}, {log.lng}</div>
                                </div>
                            ))}
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
