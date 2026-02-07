"use client";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

// Dynamic import for Leaflet (no SSR)
const MapContainer = dynamic(
    () => import("react-leaflet").then((mod) => mod.MapContainer),
    { ssr: false }
);
const TileLayer = dynamic(
    () => import("react-leaflet").then((mod) => mod.TileLayer),
    { ssr: false }
);
const Marker = dynamic(
    () => import("react-leaflet").then((mod) => mod.Marker),
    { ssr: false }
);
const Popup = dynamic(
    () => import("react-leaflet").then((mod) => mod.Popup),
    { ssr: false }
);

const SERVER_URL = typeof window !== 'undefined' ? window.location.origin : '';

// Status config
const STATUS_CONFIG = {
    'NORMAL': { color: '#22c55e', icon: '✅', label: 'ปกติ' },
    'STOLEN': { color: '#ef4444', icon: '🚨', label: 'ถูกขโมย!' },
    'CRASH': { color: '#f97316', icon: '⚠️', label: 'อุบัติเหตุ!' },
    'UNKNOWN': { color: '#6b7280', icon: '❓', label: 'ไม่ทราบ' },
};

export default function UserApp() {
    const [step, setStep] = useState('loading'); // loading, login, register, app
    const [userToken, setUserToken] = useState(null);
    const [vehicles, setVehicles] = useState([]);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [addingVehicle, setAddingVehicle] = useState(false);

    // Form states
    const [credCode, setCredCode] = useState('');
    const [plateNumber, setPlateNumber] = useState('');
    const [driverName, setDriverName] = useState('');
    const [emergencyPhone, setEmergencyPhone] = useState('');
    const [pendingDevice, setPendingDevice] = useState(null);
    const [error, setError] = useState('');

    // Check local storage for existing token
    useEffect(() => {
        // Load Leaflet CSS
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        // Fix Leaflet marker icons
        if (typeof window !== 'undefined') {
            import('leaflet').then((L) => {
                delete L.Icon.Default.prototype._getIconUrl;
                L.Icon.Default.mergeOptions({
                    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                });
            });
        }

        const token = localStorage.getItem('gps_user_token');
        if (token) {
            setUserToken(token);
            loadVehicles(token);
        } else {
            setStep('login');
        }
    }, []);

    // Load user's vehicles
    const loadVehicles = async (token) => {
        try {
            const res = await fetch(`${SERVER_URL}/api/user/vehicles?token=${token}`);
            const data = await res.json();
            if (data.length > 0) {
                setVehicles(data);
                setSelectedVehicle(data[0]);
                setStep('app');
            } else {
                setStep('login');
            }
        } catch (err) {
            console.error(err);
            setStep('login');
        }
    };

    // Verify credential code
    const handleVerify = async () => {
        setError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/user/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: credCode }),
            });
            const data = await res.json();

            if (!data.valid) {
                setError('รหัสไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
                return;
            }

            if (data.is_registered && data.vehicle) {
                // Already registered, just login
                localStorage.setItem('gps_user_token', data.vehicle.user_token);
                setUserToken(data.vehicle.user_token);
                loadVehicles(data.vehicle.user_token);
            } else {
                // Need to register
                setPendingDevice(data.device_id);
                setStep('register');
            }
        } catch (err) {
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
        }
    };

    // Register vehicle
    const handleRegister = async () => {
        setError('');
        if (!plateNumber || !driverName) {
            setError('กรุณากรอกข้อมูลให้ครบ');
            return;
        }

        try {
            const res = await fetch(`${SERVER_URL}/api/user/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: credCode,
                    plate_number: plateNumber,
                    driver_name: driverName,
                    emergency_phone: emergencyPhone,
                    user_token: userToken,
                }),
            });
            const data = await res.json();

            if (data.success) {
                localStorage.setItem('gps_user_token', data.user_token);
                setUserToken(data.user_token);
                loadVehicles(data.user_token);
            } else {
                setError(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch (err) {
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
        }
    };

    // Add new vehicle
    const handleAddVehicle = async () => {
        setError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/user/add-vehicle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: credCode,
                    plate_number: plateNumber,
                    driver_name: driverName,
                    emergency_phone: emergencyPhone,
                    user_token: userToken,
                }),
            });
            const data = await res.json();

            if (data.success) {
                setAddingVehicle(false);
                setCredCode('');
                setPlateNumber('');
                setDriverName('');
                setEmergencyPhone('');
                loadVehicles(userToken);
            } else {
                setError(data.error || 'เกิดข้อผิดพลาด');
            }
        } catch (err) {
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
        }
    };

    // Loading state
    if (step === 'loading') {
        return (
            <div style={styles.container}>
                <div style={styles.loading}>
                    <div style={styles.spinner}></div>
                    <p>กำลังโหลด...</p>
                </div>
            </div>
        );
    }

    // Login screen
    if (step === 'login') {
        return (
            <div style={styles.container}>
                <div style={styles.loginBox}>
                    <div style={styles.logo}>🚗</div>
                    <h1 style={styles.title}>GPS Tracker</h1>
                    <p style={styles.subtitle}>กรอกรหัสที่มากับกล่องอุปกรณ์</p>

                    <input
                        type="text"
                        placeholder="รหัส 6 ตัว เช่น ABC123"
                        value={credCode}
                        onChange={(e) => setCredCode(e.target.value.toUpperCase())}
                        style={styles.input}
                        maxLength={6}
                    />

                    {error && <p style={styles.error}>{error}</p>}

                    <button onClick={handleVerify} style={styles.button}>
                        เข้าสู่ระบบ
                    </button>
                </div>
            </div>
        );
    }

    // Register screen
    if (step === 'register') {
        return (
            <div style={styles.container}>
                <div style={styles.loginBox}>
                    <h1 style={styles.title}>ลงทะเบียนรถ</h1>
                    <p style={styles.subtitle}>กรอกข้อมูลรถของคุณ</p>

                    <input
                        type="text"
                        placeholder="ทะเบียนรถ เช่น กข-1234"
                        value={plateNumber}
                        onChange={(e) => setPlateNumber(e.target.value)}
                        style={styles.input}
                    />

                    <input
                        type="text"
                        placeholder="ชื่อผู้ขับ / เจ้าของ"
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        style={styles.input}
                    />

                    <input
                        type="tel"
                        placeholder="เบอร์ฉุกเฉิน (ไม่บังคับ)"
                        value={emergencyPhone}
                        onChange={(e) => setEmergencyPhone(e.target.value)}
                        style={styles.input}
                    />

                    {error && <p style={styles.error}>{error}</p>}

                    <button onClick={handleRegister} style={styles.button}>
                        ยืนยัน
                    </button>
                </div>
            </div>
        );
    }

    // Main App
    return (
        <div style={styles.appContainer}>
            {/* Header */}
            <div style={styles.header}>
                <button onClick={() => setMenuOpen(true)} style={styles.menuBtn}>☰</button>
                <h1 style={styles.headerTitle}>GPS Tracker</h1>
                <button style={styles.menuBtn}>🔔</button>
            </div>

            {/* Map */}
            <div style={styles.mapContainer}>
                <MapContainer
                    center={selectedVehicle ? [selectedVehicle.lat || 13.7563, selectedVehicle.lng || 100.5018] : [13.7563, 100.5018]}
                    zoom={14}
                    style={{ height: '100%', width: '100%' }}
                >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    {vehicles.map((v) => v.lat && v.lng && (
                        <Marker key={v.id} position={[v.lat, v.lng]}>
                            <Popup>
                                <strong>{v.plate_number}</strong><br />
                                {v.driver_name}<br />
                                สถานะ: {STATUS_CONFIG[v.status]?.label || v.status}
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>

            {/* Bottom Sheet - Vehicle Info */}
            {selectedVehicle && (
                <div style={styles.bottomSheet}>
                    <div style={styles.statusBar}>
                        <span style={{ color: STATUS_CONFIG[selectedVehicle.status]?.color || '#fff' }}>
                            {STATUS_CONFIG[selectedVehicle.status]?.icon} {STATUS_CONFIG[selectedVehicle.status]?.label}
                        </span>
                        <span style={styles.updateTime}>
                            อัพเดท: {selectedVehicle.last_update ? new Date(selectedVehicle.last_update).toLocaleTimeString('th-TH') : '-'}
                        </span>
                    </div>

                    <div style={styles.vehicleInfo}>
                        <div style={styles.vehicleIcon}>🚗</div>
                        <div style={styles.vehicleDetails}>
                            <h3 style={styles.vehicleName}>{selectedVehicle.plate_number}</h3>
                            <p style={styles.vehicleDriver}>{selectedVehicle.driver_name}</p>
                        </div>
                    </div>

                    <div style={styles.statsRow}>
                        <div style={styles.statCard}>
                            <span style={styles.statIcon}>✅</span>
                            <span style={styles.statLabel}>สถานะ</span>
                            <span style={styles.statValue}>{STATUS_CONFIG[selectedVehicle.status]?.label || '-'}</span>
                        </div>
                        <div style={styles.statCard}>
                            <span style={styles.statIcon}>📍</span>
                            <span style={styles.statLabel}>GPS</span>
                            <span style={styles.statValue}>{selectedVehicle.lat ? 'OK' : '-'}</span>
                        </div>
                        <div style={styles.statCard}>
                            <span style={styles.statIcon}>🚨</span>
                            <span style={styles.statLabel}>SOS</span>
                            <span style={styles.statValue}>-</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Vehicle Selector (swipe) */}
            {vehicles.length > 1 && (
                <div style={styles.vehicleSelector}>
                    {vehicles.map((v, i) => (
                        <button
                            key={v.id}
                            onClick={() => setSelectedVehicle(v)}
                            style={{
                                ...styles.vehicleTab,
                                backgroundColor: selectedVehicle?.id === v.id ? '#3b82f6' : '#1f2937',
                            }}
                        >
                            {v.plate_number}
                        </button>
                    ))}
                </div>
            )}

            {/* Hamburger Menu */}
            {menuOpen && (
                <div style={styles.menuOverlay} onClick={() => setMenuOpen(false)}>
                    <div style={styles.menu} onClick={(e) => e.stopPropagation()}>
                        <div style={styles.menuHeader}>
                            <h2>🚗 รถของฉัน</h2>
                            <button onClick={() => setMenuOpen(false)} style={styles.closeBtn}>✕</button>
                        </div>

                        {vehicles.map((v) => (
                            <div
                                key={v.id}
                                onClick={() => { setSelectedVehicle(v); setMenuOpen(false); }}
                                style={{
                                    ...styles.menuItem,
                                    backgroundColor: selectedVehicle?.id === v.id ? '#1f2937' : 'transparent',
                                }}
                            >
                                <span>🚗 {v.plate_number}</span>
                                <span style={{ color: STATUS_CONFIG[v.status]?.color }}>
                                    {STATUS_CONFIG[v.status]?.icon}
                                </span>
                            </div>
                        ))}

                        <div style={styles.menuDivider}></div>

                        <div onClick={() => { setAddingVehicle(true); setMenuOpen(false); }} style={styles.menuItem}>
                            <span>➕ เพิ่มรถใหม่</span>
                        </div>

                        <div style={styles.menuItem}>
                            <span>⚙️ ตั้งค่า</span>
                        </div>

                        <div onClick={() => { localStorage.removeItem('gps_user_token'); setStep('login'); }} style={styles.menuItem}>
                            <span>🚪 ออกจากระบบ</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Vehicle Modal */}
            {addingVehicle && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modal}>
                        <h2 style={styles.modalTitle}>➕ เพิ่มรถใหม่</h2>

                        <input
                            type="text"
                            placeholder="รหัส Credential"
                            value={credCode}
                            onChange={(e) => setCredCode(e.target.value.toUpperCase())}
                            style={styles.input}
                            maxLength={6}
                        />

                        <input
                            type="text"
                            placeholder="ทะเบียนรถ"
                            value={plateNumber}
                            onChange={(e) => setPlateNumber(e.target.value)}
                            style={styles.input}
                        />

                        <input
                            type="text"
                            placeholder="ชื่อผู้ขับ"
                            value={driverName}
                            onChange={(e) => setDriverName(e.target.value)}
                            style={styles.input}
                        />

                        <input
                            type="tel"
                            placeholder="เบอร์ฉุกเฉิน"
                            value={emergencyPhone}
                            onChange={(e) => setEmergencyPhone(e.target.value)}
                            style={styles.input}
                        />

                        {error && <p style={styles.error}>{error}</p>}

                        <div style={styles.modalButtons}>
                            <button onClick={() => setAddingVehicle(false)} style={styles.cancelBtn}>ยกเลิก</button>
                            <button onClick={handleAddVehicle} style={styles.button}>เพิ่มรถ</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
    },
    loading: {
        textAlign: 'center',
        color: '#fff',
    },
    spinner: {
        width: '40px',
        height: '40px',
        border: '4px solid #333',
        borderTop: '4px solid #3b82f6',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        margin: '0 auto 20px',
    },
    loginBox: {
        background: 'rgba(30, 41, 59, 0.9)',
        backdropFilter: 'blur(10px)',
        borderRadius: '20px',
        padding: '40px',
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.1)',
    },
    logo: {
        fontSize: '60px',
        marginBottom: '20px',
    },
    title: {
        color: '#fff',
        fontSize: '24px',
        marginBottom: '10px',
    },
    subtitle: {
        color: '#94a3b8',
        marginBottom: '30px',
    },
    input: {
        width: '100%',
        padding: '15px',
        borderRadius: '10px',
        border: '1px solid #334155',
        background: '#1e293b',
        color: '#fff',
        fontSize: '16px',
        marginBottom: '15px',
        outline: 'none',
    },
    button: {
        width: '100%',
        padding: '15px',
        borderRadius: '10px',
        border: 'none',
        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        color: '#fff',
        fontSize: '16px',
        fontWeight: 'bold',
        cursor: 'pointer',
    },
    error: {
        color: '#ef4444',
        marginBottom: '15px',
    },
    appContainer: {
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#0f172a',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '15px 20px',
        paddingTop: 'calc(15px + env(safe-area-inset-top))',
        background: 'rgba(15, 23, 42, 0.95)',
        borderBottom: '1px solid #1e293b',
        zIndex: 100,
    },
    menuBtn: {
        background: 'none',
        border: 'none',
        color: '#fff',
        fontSize: '24px',
        cursor: 'pointer',
        padding: '5px',
    },
    headerTitle: {
        color: '#fff',
        fontSize: '18px',
        margin: 0,
    },
    mapContainer: {
        flex: 1,
        position: 'relative',
    },
    bottomSheet: {
        background: '#1e293b',
        borderRadius: '20px 20px 0 0',
        padding: '20px',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
    },
    statusBar: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '15px',
        fontSize: '14px',
    },
    updateTime: {
        color: '#64748b',
    },
    vehicleInfo: {
        display: 'flex',
        alignItems: 'center',
        marginBottom: '20px',
    },
    vehicleIcon: {
        fontSize: '40px',
        marginRight: '15px',
    },
    vehicleDetails: {
        flex: 1,
    },
    vehicleName: {
        color: '#fff',
        margin: 0,
        fontSize: '20px',
    },
    vehicleDriver: {
        color: '#64748b',
        margin: 0,
    },
    statsRow: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '10px',
    },
    statCard: {
        background: '#0f172a',
        borderRadius: '12px',
        padding: '15px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
    },
    statIcon: {
        fontSize: '20px',
    },
    statLabel: {
        color: '#64748b',
        fontSize: '12px',
    },
    statValue: {
        color: '#fff',
        fontSize: '14px',
        fontWeight: 'bold',
    },
    vehicleSelector: {
        display: 'flex',
        gap: '10px',
        padding: '10px 20px',
        background: '#0f172a',
        overflowX: 'auto',
    },
    vehicleTab: {
        padding: '10px 20px',
        borderRadius: '20px',
        border: 'none',
        color: '#fff',
        fontSize: '14px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
    },
    menuOverlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 200,
    },
    menu: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '280px',
        background: '#0f172a',
        paddingTop: 'env(safe-area-inset-top)',
    },
    menuHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px',
        borderBottom: '1px solid #1e293b',
        color: '#fff',
    },
    closeBtn: {
        background: 'none',
        border: 'none',
        color: '#fff',
        fontSize: '24px',
        cursor: 'pointer',
    },
    menuItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '15px 20px',
        color: '#fff',
        cursor: 'pointer',
    },
    menuDivider: {
        height: '1px',
        background: '#1e293b',
        margin: '10px 0',
    },
    modalOverlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300,
        padding: '20px',
    },
    modal: {
        background: '#1e293b',
        borderRadius: '20px',
        padding: '30px',
        width: '100%',
        maxWidth: '400px',
    },
    modalTitle: {
        color: '#fff',
        marginBottom: '20px',
        textAlign: 'center',
    },
    modalButtons: {
        display: 'flex',
        gap: '10px',
        marginTop: '20px',
    },
    cancelBtn: {
        flex: 1,
        padding: '15px',
        borderRadius: '10px',
        border: '1px solid #334155',
        background: 'transparent',
        color: '#fff',
        fontSize: '16px',
        cursor: 'pointer',
    },
};
