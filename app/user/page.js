"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { Toaster, toast } from "react-hot-toast";
import { io } from "socket.io-client";
import {
    Menu, X, MapPin, Navigation, Plus, LogOut,
    Car, User, Phone, Settings, ChevronUp, ChevronDown
} from "lucide-react";

// Server URL
const SERVER_URL = typeof window !== 'undefined' ? window.location.origin : '';
const GOOGLE_MAPS_API_KEY = "AIzaSyACWF7KC20kJzTuxl-AicAuANdZaP7U74Q";

// Map Style (Dark Mode for Premium Look)
const mapStyles = [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    {
        featureType: "administrative.locality",
        elementType: "labels.text.fill",
        stylers: [{ color: "#d59563" }],
    },
    {
        featureType: "poi",
        elementType: "labels.text.fill",
        stylers: [{ color: "#d59563" }],
    },
    {
        featureType: "poi.park",
        elementType: "geometry",
        stylers: [{ color: "#263c3f" }],
    },
    {
        featureType: "poi.park",
        elementType: "labels.text.fill",
        stylers: [{ color: "#6b9a76" }],
    },
    {
        featureType: "road",
        elementType: "geometry",
        stylers: [{ color: "#38414e" }],
    },
    {
        featureType: "road",
        elementType: "geometry.stroke",
        stylers: [{ color: "#212a37" }],
    },
    {
        featureType: "road",
        elementType: "labels.text.fill",
        stylers: [{ color: "#9ca5b3" }],
    },
    {
        featureType: "road.highway",
        elementType: "geometry",
        stylers: [{ color: "#746855" }],
    },
    {
        featureType: "road.highway",
        elementType: "geometry.stroke",
        stylers: [{ color: "#1f2835" }],
    },
    {
        featureType: "road.highway",
        elementType: "labels.text.fill",
        stylers: [{ color: "#f3d19c" }],
    },
    {
        featureType: "water",
        elementType: "geometry",
        stylers: [{ color: "#17263c" }],
    },
    {
        featureType: "water",
        elementType: "labels.text.fill",
        stylers: [{ color: "#515c6d" }],
    },
    {
        featureType: "water",
        elementType: "labels.text.stroke",
        stylers: [{ color: "#17263c" }],
    },
];

const defaultCenter = { lat: 13.7563, lng: 100.5018 };

const STATUS_CONFIG = {
    'NORMAL': { color: '#10B981', label: 'ปกติ', bg: 'rgba(16, 185, 129, 0.2)' },
    'STOLEN': { color: '#EF4444', label: 'ถูกขโมย!', bg: 'rgba(239, 68, 68, 0.2)' },
    'CRASH': { color: '#F59E0B', label: 'อุบัติเหตุ', bg: 'rgba(245, 158, 11, 0.2)' },
    'UNKNOWN': { color: '#6B7280', label: 'ไม่ทราบ', bg: 'rgba(107, 114, 128, 0.2)' },
};

export default function UserApp() {
    const [step, setStep] = useState('loading');
    const [userToken, setUserToken] = useState(null);
    const [vehicles, setVehicles] = useState([]);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [addingVehicle, setAddingVehicle] = useState(false);
    const [bottomSheetOpen, setBottomSheetOpen] = useState(true);

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

    // Socket
    const socketRef = useRef(null);

    // Initial Load
    useEffect(() => {
        const token = localStorage.getItem('gps_user_token');
        if (token) {
            setUserToken(token);
            loadVehicles(token);
        } else {
            setStep('login');
        }
    }, []);

    // Socket Connection for Real-time Updates
    useEffect(() => {
        if (!userToken || step !== 'app') return;

        // Connect Socket
        socketRef.current = io(SERVER_URL, {
            transports: ["websocket"],
            query: { token: userToken } // Optional: send token if needed currently not used but good practice
        });

        socketRef.current.on("connect", () => {
            console.log("🟢 Socket Connected");
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

                    // Update selected vehicle if it's the one moving
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

            if (!data.valid) {
                setError('❌ รหัสไม่ถูกต้อง');
                return;
            }

            if (data.is_registered && data.vehicle) {
                localStorage.setItem('gps_user_token', data.vehicle.user_token);
                setUserToken(data.vehicle.user_token);
                loadVehicles(data.vehicle.user_token);
            } else {
                setStep('register');
            }
        } catch (err) {
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
        }
    };

    const handleRegister = async () => {
        if (!plateNumber || !driverName) {
            setError('❌ กรุณากรอกข้อมูลให้ครบ');
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
                setError(data.error);
            }
        } catch (err) {
            setError('เกิดข้อผิดพลาด');
        }
    };

    // Logic: Open Add Vehicle Modal (Auto-fill Name/Phone)
    const openAddVehicle = () => {
        setMenuOpen(false);
        setAddingVehicle(true);
        setCredCode('');      // Clear Code
        setPlateNumber('');   // Clear Plate

        // Auto-fill Name & Phone from current/first vehicle
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
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('เกิดข้อผิดพลาด');
        }
    };

    const onLoad = useCallback((map) => {
        setMap(map);
    }, []);

    const onUnmount = useCallback(() => {
        setMap(null);
    }, []);

    // --- RENDER ---

    if (step === 'loading') {
        return (
            <div className="flex items-center justify-center h-screen bg-[#0f172a] text-white">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    // Login / Register Style Wrapper
    const AuthWrapper = ({ title, sub, children }) => (
        <div style={styles.authContainer}>
            <div style={styles.authBox}>
                <div style={styles.logo}>🛰️</div>
                <h1 style={styles.authTitle}>{title}</h1>
                <p style={styles.authSub}>{sub}</p>
                {children}
            </div>
        </div>
    );

    if (step === 'login') {
        return (
            <AuthWrapper title="GPS Tracker" sub="กรอกรหัสจากกล่องอุปกรณ์">
                <div style={styles.inputGroup}>
                    <input
                        type="text"
                        placeholder="ABC1234"
                        value={credCode}
                        onChange={(e) => setCredCode(e.target.value.toUpperCase())}
                        style={styles.input}
                        maxLength={6}
                    />
                </div>
                {error && <p style={styles.error}>{error}</p>}
                <button onClick={handleVerify} style={styles.primaryBtn}>
                    เข้าสู่ระบบ
                </button>
            </AuthWrapper>
        );
    }

    if (step === 'register') {
        return (
            <AuthWrapper title="ลงทะเบียนรถ" sub="กรอกข้อมูลเพื่อเริ่มต้นใช้งาน">
                <input type="text" placeholder="ทะเบียนรถ (เช่น กข 1234)" value={plateNumber} onChange={e => setPlateNumber(e.target.value)} style={styles.input} />
                <input type="text" placeholder="ชื่อผู้ขับ / เจ้าของ" value={driverName} onChange={e => setDriverName(e.target.value)} style={styles.input} />
                <input type="tel" placeholder="เบอร์ฉุกเฉิน (ไม่บังคับ)" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} style={styles.input} />
                {error && <p style={styles.error}>{error}</p>}
                <button onClick={handleRegister} style={styles.primaryBtn}>ยืนยันการลงทะเบียน</button>
            </AuthWrapper>
        );
    }

    return (
        <div style={styles.appContainer}>
            <Toaster position="top-center" toastOptions={{ style: { background: '#333', color: '#fff' } }} />

            {/* HEADER */}
            <div style={styles.header}>
                <button onClick={() => setMenuOpen(true)} style={styles.iconBtn}>
                    <Menu size={24} color="white" />
                </button>
                <div style={styles.headerTitle}>
                    {selectedVehicle ? selectedVehicle.plate_number : "GPS Tracker"}
                    <span style={{ fontSize: '10px', color: '#aaa', display: 'block' }}>
                        {selectedVehicle?.driver_name}
                    </span>
                </div>
                <div style={styles.iconBtn}>
                    <div style={{ ...styles.statusDot, background: selectedVehicle?.status === 'NORMAL' ? '#10B981' : '#EF4444' }}></div>
                </div>
            </div>

            {/* MAP */}
            <div style={styles.mapContainer}>
                {isLoaded ? (
                    <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={selectedVehicle?.lat ? { lat: selectedVehicle.lat, lng: selectedVehicle.lng } : defaultCenter}
                        zoom={16}
                        onLoad={onLoad}
                        onUnmount={onUnmount}
                        options={{
                            styles: mapStyles,
                            disableDefaultUI: true,
                            zoomControl: false,
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
                                    <circle cx="20" cy="20" r="12" fill="${(v.status || "").includes("STOLEN") ? "#EF4444" : "#3B82F6"
                                        }" stroke="white" stroke-width="2"/>
                                    <path d="M10,20 L20,5 L30,20 L20,15 Z" fill="white" transform="translate(10, 10) scale(0.5)"/>
                                </svg>
                            `),
                                    scaledSize: { width: 40, height: 40 },
                                    anchor: { x: 20, y: 20 },
                                }}
                            />
                        ))}
                    </GoogleMap>
                ) : <div style={{ color: 'white', padding: 20 }}>Loading Maps...</div>}
            </div>

            {/* BOTTOM SHEET */}
            {selectedVehicle && (
                <div style={{
                    ...styles.bottomSheet,
                    transform: bottomSheetOpen ? 'translateY(0)' : 'translateY(180px)' // Translate logic
                }}>
                    <div style={styles.dragHandle} onClick={() => setBottomSheetOpen(!bottomSheetOpen)}>
                        {bottomSheetOpen ? <ChevronDown size={20} color="#666" /> : <ChevronUp size={20} color="#666" />}
                    </div>

                    <div style={styles.sheetContent}>
                        <div style={styles.sheetHeader}>
                            <div>
                                <h2 style={styles.plateNumber}>{selectedVehicle.plate_number}</h2>
                                <p style={styles.driverName}>{selectedVehicle.driver_name}</p>
                            </div>
                            <div style={{
                                ...styles.statusBadge,
                                background: STATUS_CONFIG[selectedVehicle.status]?.bg,
                                color: STATUS_CONFIG[selectedVehicle.status]?.color
                            }}>
                                {STATUS_CONFIG[selectedVehicle.status]?.label}
                            </div>
                        </div>

                        <div style={styles.infoGrid}>
                            <div style={styles.infoItem}>
                                <MapPin size={18} color="#94A3B8" />
                                <span>พิกัดล่าสุด</span>
                                <strong>{selectedVehicle.lat?.toFixed(5)}, {selectedVehicle.lng?.toFixed(5)}</strong>
                            </div>
                            <div style={styles.infoItem}>
                                <Navigation size={18} color="#94A3B8" />
                                <span>ความเร็ว</span>
                                <strong>0 km/h</strong>
                            </div>
                            <div style={styles.infoItem}>
                                <User size={18} color="#94A3B8" />
                                <span>คนขับ</span>
                                <strong>{selectedVehicle.driver_name}</strong>
                            </div>
                        </div>

                        <div style={styles.actionButtons}>
                            <button style={styles.actionBtn} onClick={() => map?.panTo({ lat: selectedVehicle.lat, lng: selectedVehicle.lng })}>
                                <Navigation size={20} /> โฟกัส
                            </button>
                            <button style={styles.actionBtnOutline} onClick={() => window.open(`https://maps.google.com/?q=${selectedVehicle.lat},${selectedVehicle.lng}`)}>
                                นำทาง (Google)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SIDE MENU */}
            {menuOpen && (
                <div style={styles.menuOverlay} onClick={() => setMenuOpen(false)}>
                    <div style={styles.menu} onClick={e => e.stopPropagation()}>
                        <div style={styles.menuHeader}>
                            <h2>รถของฉัน ({vehicles.length})</h2>
                            <button onClick={() => setMenuOpen(false)}><X size={24} color="#fff" /></button>
                        </div>

                        <div style={styles.vehicleList}>
                            {vehicles.map(v => (
                                <div key={v.id} style={{
                                    ...styles.vehicleCard,
                                    border: selectedVehicle?.id === v.id ? '1px solid #3B82F6' : '1px solid #333'
                                }} onClick={() => { setSelectedVehicle(v); setMenuOpen(false); }}>
                                    <Car size={20} color="#fff" />
                                    <div style={{ marginLeft: 10, flex: 1 }}>
                                        <h3>{v.plate_number}</h3>
                                        <p>{v.driver_name}</p>
                                    </div>
                                    {selectedVehicle?.id === v.id && <div style={styles.activeDot}></div>}
                                </div>
                            ))}
                        </div>

                        <div style={styles.menuFooter}>
                            <button style={styles.addBtn} onClick={openAddVehicle}>
                                <Plus size={20} /> เพิ่มรถใหม่
                            </button>
                            <button style={styles.logoutBtn} onClick={() => {
                                localStorage.removeItem('gps_user_token');
                                setStep('login');
                            }}>
                                <LogOut size={20} /> ออกจากระบบ
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ADD VEHICLE MODAL */}
            {addingVehicle && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modal}>
                        <h3>เพิ่มรถใหม่</h3>
                        <input type="text" placeholder="รหัส Credential ใหม่" value={credCode} onChange={e => setCredCode(e.target.value.toUpperCase())} style={styles.input} />
                        <input type="text" placeholder="ทะเบียนรถ" value={plateNumber} onChange={e => setPlateNumber(e.target.value)} style={styles.input} />
                        <input type="text" placeholder="ชื่อผู้ขับ (Auto)" value={driverName} onChange={e => setDriverName(e.target.value)} style={styles.input} />
                        <input type="tel" placeholder="เบอร์ฉุกเฉิน (Auto)" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} style={styles.input} />

                        {error && <p style={styles.error}>{error}</p>}

                        <div style={styles.modalActions}>
                            <button style={styles.cancelBtn} onClick={() => setAddingVehicle(false)}>ยกเลิก</button>
                            <button style={styles.confirmBtn} onClick={handleAddVehicle}>เพิ่มรถ</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// MODERN STYLES (Glassmorphism + Dark Mode)
const styles = {
    appContainer: { height: '100vh', display: 'flex', flexDirection: 'column', background: '#000', overflow: 'hidden' },
    authContainer: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', padding: 20 },
    authBox: { background: 'rgba(30, 41, 59, 0.7)', backdropFilter: 'blur(10px)', padding: 30, borderRadius: 24, width: '100%', maxWidth: 360, border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' },
    logo: { fontSize: 40, marginBottom: 10 },
    authTitle: { color: 'white', fontSize: 24, fontWeight: 'bold' },
    authSub: { color: '#94A3B8', marginBottom: 30, fontSize: 14 },
    inputGroup: { marginBottom: 15 },
    input: { width: '100%', padding: 14, background: '#334155', border: '1px solid #475569', borderRadius: 12, color: 'white', outline: 'none', marginBottom: 10, fontSize: 16 },
    primaryBtn: { width: '100%', padding: 14, background: '#3B82F6', color: 'white', borderRadius: 12, border: 'none', fontWeight: 'bold', fontSize: 16, cursor: 'pointer', marginTop: 10 },
    error: { color: '#EF4444', fontSize: 13, marginBottom: 10 },

    header: { position: 'absolute', top: 0, left: 0, right: 0, padding: '15px 20px', paddingTop: 'max(15px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 50, background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)', pointerEvents: 'none' },
    iconBtn: { background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(5px)', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', pointerEvents: 'auto' },
    headerTitle: { color: 'white', fontWeight: 'bold', textAlign: 'center' },
    statusDot: { width: 10, height: 10, borderRadius: '50%', boxShadow: '0 0 10px currentColor' },

    mapContainer: { flex: 1, background: '#222' },

    bottomSheet: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(20px)',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: '20px 20px max(20px, env(safe-area-inset-bottom)) 20px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 40
    },
    dragHandle: { width: '100%', display: 'flex', justifyContent: 'center', paddingBottom: 10, cursor: 'pointer' },
    sheetHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    plateNumber: { fontSize: 24, fontWeight: 'bold', color: 'white', margin: 0 },
    driverName: { color: '#94A3B8', fontSize: 14, margin: 0 },
    statusBadge: { padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 'bold' },

    infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginBottom: 20 },
    infoItem: { background: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 4, color: '#94A3B8', fontSize: 12 },

    actionButtons: { display: 'flex', gap: 10 },
    actionBtn: { flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#3B82F6', color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
    actionBtnOutline: { flex: 1, padding: 12, borderRadius: 12, border: '1px solid #475569', background: 'transparent', color: 'white', fontWeight: 'bold' },

    menuOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, backdropFilter: 'blur(2px)' },
    menu: { width: '80%', maxWidth: 300, height: '100%', background: '#0F172A', padding: 20, paddingTop: 'max(20px, env(safe-area-inset-top))', display: 'flex', flexDirection: 'column' },
    menuHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, color: 'white' },
    vehicleList: { flex: 1, overflowY: 'auto' },
    vehicleCard: { display: 'flex', alignItems: 'center', padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.05)', marginBottom: 10, color: 'white' },
    activeDot: { width: 8, height: 8, background: '#3B82F6', borderRadius: '50%' },
    menuFooter: { marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 },
    addBtn: { width: '100%', padding: 12, background: '#3B82F6', color: 'white', border: 'none', borderRadius: 12, fontWeight: 'bold', display: 'flex', justifyContent: 'center', gap: 8 },
    logoutBtn: { width: '100%', padding: 12, background: 'transparent', color: '#EF4444', border: '1px solid #EF4444', borderRadius: 12, fontWeight: 'bold', display: 'flex', justifyContent: 'center', gap: 8 },

    modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    modal: { background: '#1E293B', width: '100%', maxWidth: 340, padding: 20, borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)' },
    modalActions: { display: 'flex', gap: 10, marginTop: 20 },
    cancelBtn: { flex: 1, padding: 10, borderRadius: 8, border: '1px solid #475569', background: 'transparent', color: 'white' },
    confirmBtn: { flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#3B82F6', color: 'white', fontWeight: 'bold' },
};
