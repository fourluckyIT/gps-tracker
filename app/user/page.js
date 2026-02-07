"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { Toaster, toast } from "react-hot-toast";
import { io } from "socket.io-client";
import { Menu, X, Plus, LogOut, Car, Navigation, ChevronDown, ChevronUp } from "lucide-react";

// Server URL
const SERVER_URL = typeof window !== 'undefined' ? window.location.origin : '';
const GOOGLE_MAPS_API_KEY = "AIzaSyACWF7KC20kJzTuxl-AicAuANdZaP7U74Q";

const defaultCenter = { lat: 13.7563, lng: 100.5018 };

const STATUS_CONFIG = {
    'NORMAL': { color: '#000', label: 'รถสถานะปกติ', icon: '✅' },
    'STOLEN': { color: '#EF4444', label: 'รถถูกขโมย!', icon: '🚨' },
    'CRASH': { color: '#F59E0B', label: 'เกิดอุบัติเหตุ!', icon: '⚠️' },
    'UNKNOWN': { color: '#6B7280', label: 'ไม่ทราบสถานะ', icon: '❓' },
};

export default function UserApp() {
    const [step, setStep] = useState('loading');
    const [userToken, setUserToken] = useState(null);
    const [vehicles, setVehicles] = useState([]);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [addingVehicle, setAddingVehicle] = useState(false);

    // Google Maps
    const [map, setMap] = useState(null);
    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
        language: "th",
    });

    // Forms
    const [credCode, setCredCode] = useState('');
    const [plateNumber, setPlateNumber] = useState('');
    const [driverName, setDriverName] = useState('');
    const [emergencyPhone, setEmergencyPhone] = useState('');
    const [error, setError] = useState('');

    // Timer for duration update
    const [now, setNow] = useState(new Date());

    // Socket
    const socketRef = useRef(null);

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000); // Update every minute
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const token = localStorage.getItem('gps_user_token');
        if (token) {
            setUserToken(token);
            loadVehicles(token);
        } else {
            setStep('login');
        }
    }, []);

    useEffect(() => {
        if (!userToken || step !== 'app') return;

        socketRef.current = io(SERVER_URL, {
            transports: ["websocket"],
            query: { token: userToken }
        });

        socketRef.current.on("device_update", (data) => {
            setVehicles(prev => {
                const index = prev.findIndex(v => v.device_id === data.device_id);
                if (index !== -1) {
                    const newVehicles = [...prev];
                    newVehicles[index] = {
                        ...newVehicles[index],
                        lat: data.lat,
                        lng: data.lng,
                        status: data.status,
                        last_update: data.last_update
                    };
                    if (selectedVehicle?.device_id === data.device_id) {
                        setSelectedVehicle(curr => ({ ...curr, ...newVehicles[index] }));
                    }
                    return newVehicles;
                }
                return prev;
            });
        });

        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, [userToken, step]);


    const loadVehicles = async (token) => {
        try {
            const res = await fetch(`${SERVER_URL}/api/user/vehicles?token=${token}`);
            const data = await res.json();
            if (data.length > 0) {
                setVehicles(data);
                if (!selectedVehicle) setSelectedVehicle(data[0]);
                setStep('app');
            } else {
                setStep('login');
            }
        } catch (err) {
            console.error(err);
            setStep('login');
        }
    };

    const handleVerify = async () => {
        setError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/user/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: credCode }),
            });
            const data = await res.json();
            if (!data.valid) { setError('❌ รหัสไม่ถูกต้อง'); return; }

            if (data.is_registered && data.vehicle) {
                localStorage.setItem('gps_user_token', data.vehicle.user_token);
                setUserToken(data.vehicle.user_token);
                loadVehicles(data.vehicle.user_token);
            } else {
                setStep('register');
            }
        } catch (err) { setError('เกิดข้อผิดพลาด'); }
    };

    const handleRegister = async () => {
        if (!plateNumber || !driverName) { setError('❌ กรุณากรอกข้อมูลให้ครบ'); return; }
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
            } else { setError(data.error); }
        } catch (err) { setError('เกิดข้อผิดพลาด'); }
    };

    const openAddVehicle = () => {
        setMenuOpen(false);
        setAddingVehicle(true);
        setCredCode('');
        setPlateNumber('');
        if (vehicles.length > 0) {
            setDriverName(vehicles[0].driver_name || '');
            setEmergencyPhone(vehicles[0].emergency_phone || '');
        }
    };

    const handleAddVehicle = async () => {
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
                loadVehicles(userToken);
                toast.success('🎉 เพิ่มรถเรียบร้อย!');
            } else { setError(data.error); }
        } catch (err) { setError('เกิดข้อผิดพลาด'); }
    };

    const onLoad = useCallback((map) => { setMap(map); }, []);
    const onUnmount = useCallback(() => { setMap(null); }, []);

    // Format Helper
    const getUpdateInfo = (lastUpdate) => {
        if (!lastUpdate) return { time: '-', duration: '-' };
        const date = new Date(lastUpdate);
        const timeStr = date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';

        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);

        let durationStr = "";
        if (diffMins < 60) durationStr = `${diffMins} นาที`;
        else durationStr = `${diffHours} ชม. ${diffMins % 60} นาที`;

        return { time: timeStr, duration: durationStr };
    };

    if (step === 'loading') {
        return <div className="loading-screen">กำลังโหลด...</div>;
    }

    // --- RENDERING ---

    // Auth Screens (Clean Light Theme for Auth)
    if (step === 'login' || step === 'register') {
        return (
            <div style={styles.authContainer}>
                <div style={styles.authBox}>
                    <div style={styles.logo}>🛰️</div>
                    <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 10 }}>GPS Tracker</h1>
                    {step === 'login' ? (
                        <>
                            <p style={{ color: '#666', marginBottom: 20 }}>กรอกรหัสอุปกรณ์เพื่อติดตาม</p>
                            <input type="text" placeholder="รหัสอุปกรณ์ (เช่น ABC1234)" value={credCode} onChange={e => setCredCode(e.target.value.toUpperCase())} style={styles.input} maxLength={6} />
                            {error && <p style={styles.error}>{error}</p>}
                            <button onClick={handleVerify} style={styles.primaryBtn}>เข้าสู่ระบบ</button>
                        </>
                    ) : (
                        <>
                            <p style={{ color: '#666', marginBottom: 20 }}>ลงทะเบียนรถใหม่</p>
                            <input type="text" placeholder="ทะเบียนรถ" value={plateNumber} onChange={e => setPlateNumber(e.target.value)} style={styles.input} />
                            <input type="text" placeholder="ชื่อผู้ขับ" value={driverName} onChange={e => setDriverName(e.target.value)} style={styles.input} />
                            <input type="tel" placeholder="เบอร์ฉุกเฉิน" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} style={styles.input} />
                            {error && <p style={styles.error}>{error}</p>}
                            <button onClick={handleRegister} style={styles.primaryBtn}>ยืนยัน</button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // Main App
    const updateInfo = selectedVehicle ? getUpdateInfo(selectedVehicle.last_update) : { time: '-', duration: '-' };

    return (
        <div style={styles.appContainer}>
            <Toaster position="top-center" />

            {/* Map */}
            <div style={styles.mapContainer}>
                {isLoaded ? (
                    <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={selectedVehicle?.lat ? { lat: selectedVehicle.lat, lng: selectedVehicle.lng } : defaultCenter}
                        zoom={16}
                        onLoad={onLoad}
                        onUnmount={onUnmount}
                        options={{
                            disableDefaultUI: true,
                            zoomControl: false,
                            fullscreenControl: false,
                        }}
                    >
                        {vehicles.map((v) => v.lat && (
                            <Marker
                                key={v.id}
                                position={{ lat: v.lat, lng: v.lng }}
                                onClick={() => setSelectedVehicle(v)}
                                icon={{
                                    url: "data:image/svg+xml," + encodeURIComponent(`
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
                                    <circle cx="20" cy="20" r="14" fill="${(v.status || "").includes("STOLEN") ? "#EF4444" : "#EA4335"
                                        }" stroke="white" stroke-width="2"/>
                                    <text x="20" y="25" text-anchor="middle" fill="white" font-size="20">📍</text>
                                </svg>
                            `),
                                    scaledSize: { width: 40, height: 40 },
                                    anchor: { x: 20, y: 20 },
                                }}
                            />
                        ))}
                    </GoogleMap>
                ) : <div style={{ padding: 20 }}>Loading Maps...</div>}
            </div>

            {/* Hamburger Button */}
            <button style={styles.menuBtn} onClick={() => setMenuOpen(true)}>
                <Menu size={24} color="#333" />
            </button>

            {/* Bottom Floating Card (The ONE from the image) */}
            {selectedVehicle && (
                <div style={styles.floatCard}>
                    {/* Top Part: Grey */}
                    <div style={styles.cardHeader}>
                        <div>
                            <div style={styles.statusLabel}>รถจอด ณ จุดนี้ตั้งแต่</div>
                            <div style={styles.timeLabel}>{updateInfo.time}</div>
                        </div>
                        <div style={styles.durationLabel}>{updateInfo.duration}</div>
                    </div>

                    {/* Bottom Part: White */}
                    <div style={styles.cardBody}>
                        <div style={{ flex: 1 }}>
                            <div style={styles.plateNumber}>{selectedVehicle.plate_number}</div>
                            <div style={{ ...styles.statusText, color: STATUS_CONFIG[selectedVehicle.status]?.color }}>
                                {STATUS_CONFIG[selectedVehicle.status]?.label || 'สถานะปกติ'}
                            </div>
                        </div>
                        {/* Optional: Add small navigation icon if needed, but keeping it minimal as per ref image */}
                        <button style={styles.navBtn} onClick={() => window.open(`https://maps.google.com/?q=${selectedVehicle.lat},${selectedVehicle.lng}`)}>
                            <Navigation size={20} color="#fff" />
                        </button>
                    </div>
                </div>
            )}

            {/* Side Menu */}
            {menuOpen && (
                <div style={styles.menuOverlay} onClick={() => setMenuOpen(false)}>
                    <div style={styles.menu} onClick={e => e.stopPropagation()}>
                        <div style={styles.menuHeader}>
                            <h2>รายการรถ</h2>
                            <button onClick={() => setMenuOpen(false)}><X size={24} /></button>
                        </div>
                        {vehicles.map(v => (
                            <div key={v.id} style={{
                                ...styles.menuItem,
                                background: selectedVehicle?.id === v.id ? '#F3F4F6' : 'transparent'
                            }} onClick={() => { setSelectedVehicle(v); setMenuOpen(false); }}>
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>{v.plate_number}</div>
                                    <div style={{ fontSize: 12, color: '#666' }}>{v.driver_name}</div>
                                </div>
                                {selectedVehicle?.id === v.id && <div style={styles.activeDot}></div>}
                            </div>
                        ))}

                        <div style={{ marginTop: 'auto', borderTop: '1px solid #eee', paddingTop: 10 }}>
                            <button style={styles.menuActionBtn} onClick={openAddVehicle}>
                                <Plus size={18} /> เพิ่มรถใหม่
                            </button>
                            <button style={{ ...styles.menuActionBtn, color: '#EF4444' }} onClick={() => {
                                localStorage.removeItem('gps_user_token');
                                setStep('login');
                            }}>
                                <LogOut size={18} /> ออกจากระบบ
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Vehicle Modal */}
            {addingVehicle && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modal}>
                        <h3>เพิ่มรถใหม่</h3>
                        <input type="text" placeholder="รหัส Credential ใหม่" value={credCode} onChange={e => setCredCode(e.target.value.toUpperCase())} style={styles.input} />
                        <input type="text" placeholder="ทะเบียนรถ" value={plateNumber} onChange={e => setPlateNumber(e.target.value)} style={styles.input} />
                        <input type="text" placeholder="ชื่อผู้ขับ" value={driverName} onChange={e => setDriverName(e.target.value)} style={styles.input} />
                        <input type="tel" placeholder="เบอร์ฉุกเฉิน" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} style={styles.input} />
                        <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
                            <button onClick={() => setAddingVehicle(false)} style={styles.cancelBtn}>ยกเลิก</button>
                            <button onClick={handleAddVehicle} style={styles.confirmBtn}>บันทึก</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const styles = {
    appContainer: { height: '100vh', width: '100%', position: 'relative', background: '#fff' },
    mapContainer: { width: '100%', height: '100%' },

    // Auth
    authContainer: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F1F5F9' },
    authBox: { background: 'white', padding: 30, borderRadius: 20, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', width: '90%', maxWidth: 350, textAlign: 'center' },
    logo: { fontSize: 40, marginBottom: 15 },
    input: { width: '100%', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', marginBottom: 10, fontSize: 16, outline: 'none' },
    primaryBtn: { width: '100%', padding: 12, borderRadius: 8, border: 'none', background: '#000', color: 'white', fontWeight: 'bold', cursor: 'pointer', marginTop: 10 },
    error: { color: 'red', fontSize: 13, marginBottom: 10 },

    // UI Elements
    menuBtn: { position: 'absolute', top: 'max(15px, env(safe-area-inset-top))', left: 20, background: 'white', border: 'none', borderRadius: 8, padding: 8, boxShadow: '0 2px 5px rgba(0,0,0,0.1)', cursor: 'pointer', zIndex: 50 },

    // Floating Card (Reference Image Style)
    floatCard: {
        position: 'absolute',
        bottom: 'max(20px, env(safe-area-inset-bottom))',
        left: 20,
        right: 20,
        background: 'white',
        borderRadius: 20,
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        zIndex: 50,
    },
    cardHeader: {
        background: '#E2E8F0', // Light Grey
        padding: '15px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    statusLabel: { fontSize: 12, color: '#64748B', fontWeight: 'bold' },
    timeLabel: { fontSize: 16, color: '#1E293B', fontWeight: 'bold', marginTop: 2 },
    durationLabel: { fontSize: 14, color: '#1E293B', fontWeight: 'bold' },

    cardBody: {
        background: 'white',
        padding: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    plateNumber: { fontSize: 28, fontWeight: 'bold', color: '#000' },
    statusText: { fontSize: 14, fontWeight: 'bold', marginTop: 5 },
    navBtn: {
        width: 45, height: 45, borderRadius: '50%', background: '#3B82F6', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.5)'
    },

    // Menu
    menuOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 },
    menu: { width: '80%', maxWidth: 300, height: '100%', background: 'white', padding: 20, paddingTop: 'max(20px, env(safe-area-inset-top))', display: 'flex', flexDirection: 'column' },
    menuHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    menuItem: { padding: 12, borderRadius: 8, marginBottom: 5, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    activeDot: { width: 8, height: 8, background: '#000', borderRadius: '50%' },
    menuActionBtn: { width: '100%', padding: 12, background: 'transparent', border: 'none', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' },

    // Modal
    modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    modal: { background: 'white', width: '85%', maxWidth: 320, padding: 20, borderRadius: 16 },
    cancelBtn: { flex: 1, padding: 10, background: '#F1F5F9', border: 'none', borderRadius: 8 },
    confirmBtn: { flex: 1, padding: 10, background: '#000', color: 'white', border: 'none', borderRadius: 8 }
};
