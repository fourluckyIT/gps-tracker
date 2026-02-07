"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { Toaster, toast } from "react-hot-toast";
import { io } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import {
    Menu, X, Plus, LogOut, Car, Navigation, Phone,
    User, ChevronRight, MapPin, Clock
} from "lucide-react";

// Server URL
const SERVER_URL = typeof window !== 'undefined' ? window.location.origin : '';
const GOOGLE_MAPS_API_KEY = "AIzaSyACWF7KC20kJzTuxl-AicAuANdZaP7U74Q";

const defaultCenter = { lat: 13.7563, lng: 100.5018 };

const STATUS_CONFIG = {
    'NORMAL': { color: '#10B981', label: 'ปกติ', bg: '#DCFCE7' },
    'STOLEN': { color: '#EF4444', label: 'ถูกขโมย!', bg: '#FEE2E2' },
    'CRASH': { color: '#F59E0B', label: 'อุบัติเหตุ', bg: '#FEF3C7' },
    'UNKNOWN': { color: '#6B7280', label: 'ไม่ทราบ', bg: '#F3F4F6' },
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
    const { isLoaded } = useJsApiLoader({
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

    // Time update
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(t);
    }, []);

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

    // Socket & Logic
    useEffect(() => {
        if (!userToken || step !== 'app') return;
        socketRef.current = io(SERVER_URL, { transports: ["websocket"], query: { token: userToken } });
        socketRef.current.on("device_update", (data) => {
            setVehicles(prev => {
                const index = prev.findIndex(v => v.device_id === data.device_id);
                if (index !== -1) {
                    const newVehicles = [...prev];
                    newVehicles[index] = { ...newVehicles[index], lat: data.lat, lng: data.lng, status: data.status, last_update: data.last_update };
                    if (selectedVehicle?.device_id === data.device_id) {
                        setSelectedVehicle(curr => ({ ...curr, ...newVehicles[index] }));
                    }
                    return newVehicles;
                }
                return prev;
            });
        });
        return () => { if (socketRef.current) socketRef.current.disconnect(); };
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
        } catch (err) { setStep('login'); }
    };

    const handleVerify = async () => { /* ...Auth Logic... */
        setError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/user/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: credCode }) });
            const data = await res.json();
            if (!data.valid) { setError('❌ รหัสไม่ถูกต้อง'); return; }
            if (data.is_registered && data.vehicle) {
                localStorage.setItem('gps_user_token', data.vehicle.user_token);
                setUserToken(data.vehicle.user_token);
                loadVehicles(data.vehicle.user_token);
            } else { setStep('register'); }
        } catch (err) { setError('Error'); }
    };

    const handleRegister = async () => { /* ...Register Logic... */
        if (!plateNumber || !driverName) { setError('❌ กรอกให้ครบ'); return; }
        try {
            const res = await fetch(`${SERVER_URL}/api/user/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: credCode, plate_number: plateNumber, driver_name: driverName, emergency_phone: emergencyPhone, user_token: userToken }) });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem('gps_user_token', data.user_token);
                setUserToken(data.user_token);
                loadVehicles(data.user_token);
            } else { setError(data.error); }
        } catch (err) { setError('Error'); }
    };

    const openAddVehicle = () => {
        setMenuOpen(false); setAddingVehicle(true); setCredCode(''); setPlateNumber('');
        if (vehicles.length > 0) { setDriverName(vehicles[0].driver_name || ''); setEmergencyPhone(vehicles[0].emergency_phone || ''); }
    };

    const handleAddVehicle = async () => { /* ...Add Vehicle Logic... */
        try {
            const res = await fetch(`${SERVER_URL}/api/user/add-vehicle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: credCode, plate_number: plateNumber, driver_name: driverName, emergency_phone: emergencyPhone, user_token: userToken }) });
            const data = await res.json();
            if (data.success) { setAddingVehicle(false); loadVehicles(userToken); toast.success('Success'); } else { setError(data.error); }
        } catch (err) { setError('Error'); }
    };

    const onLoad = useCallback((map) => { setMap(map); }, []);
    const onUnmount = useCallback(() => { setMap(null); }, []);

    // --- Helper: Calculate Time ---
    const getDuration = (lastUpdate) => {
        if (!lastUpdate) return "- นาที";
        const diff = Math.floor((now - new Date(lastUpdate)) / 60000);
        if (diff < 60) return `${diff} นาที`;
        return `${Math.floor(diff / 60)} ชม.`;
    };

    // --- Helper: Select Vehicle ---
    const selectVehicleByIndex = (index) => {
        if (index < 0 || index >= vehicles.length) return;
        const v = vehicles[index];
        setSelectedVehicle(v);
        map?.panTo({ lat: v.lat, lng: v.lng });
    };

    if (step === 'loading') return <div className="loading">Loading...</div>;

    // Login/Register UI (Clean)
    if (step === 'login' || step === 'register') {
        return (
            <div style={styles.authContainer}>
                <div style={styles.authBox}>
                    <div style={styles.logo}>🛰️</div>
                    <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>GPS Tracker</h1>
                    {step === 'login' ? (
                        <>
                            <input type="text" placeholder="รหัสอุปกรณ์ (ABC1234)" value={credCode} onChange={e => setCredCode(e.target.value.toUpperCase())} style={styles.input} maxLength={6} />
                            {error && <p style={styles.error}>{error}</p>}
                            <button onClick={handleVerify} style={styles.primaryBtn}>เข้าสู่ระบบ</button>
                        </>
                    ) : (
                        <>
                            <input type="text" placeholder="ทะเบียนรถ" value={plateNumber} onChange={e => setPlateNumber(e.target.value)} style={styles.input} />
                            <input type="text" placeholder="ชื่อผู้ขับ" value={driverName} onChange={e => setDriverName(e.target.value)} style={styles.input} />
                            <input type="tel" placeholder="เบอร์ฉุกเฉิน" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} style={styles.input} />
                            {error && <p style={styles.error}>{error}</p>}
                            <button onClick={handleRegister} style={styles.primaryBtn}>ลงทะเบียน</button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div style={styles.appContainer}>
            <Toaster position="top-center" />

            {/* HEADER Floating */}
            <div style={styles.headerFloating}>
                <button onClick={() => setMenuOpen(true)} style={styles.menuIconBtn}>
                    <Menu size={24} color="#1F2937" />
                </button>
                <div style={styles.headerTitleBadge}>
                    <span style={{ fontWeight: 'bold', color: '#1F2937' }}>My Vehicles</span>
                    <span style={{ background: '#E5E7EB', padding: '2px 8px', borderRadius: 10, fontSize: 12, marginLeft: 8, color: '#4B5563' }}>{vehicles.length}</span>
                </div>
            </div>

            {/* MAP */}
            <div style={{ width: '100%', height: '100%' }}>
                {isLoaded && (
                    <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={selectedVehicle?.lat ? { lat: selectedVehicle.lat, lng: selectedVehicle.lng } : defaultCenter}
                        zoom={16}
                        onLoad={onLoad}
                        onUnmount={onUnmount}
                        options={{ disableDefaultUI: true, zoomControl: false, }}
                    >
                        {vehicles.map((v) => v.lat && (
                            <Marker
                                key={v.id}
                                position={{ lat: v.lat, lng: v.lng }}
                                onClick={() => { setSelectedVehicle(v); map?.panTo({ lat: v.lat, lng: v.lng }); }}
                                icon={{
                                    url: "data:image/svg+xml," + encodeURIComponent(`
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="60" height="60">
                                    <circle cx="30" cy="30" r="28" fill="rgba(59, 130, 246, 0.2)" />
                                    <circle cx="30" cy="30" r="12" fill="${v.id === selectedVehicle?.id ? '#2563EB' : '#94A3B8'}" stroke="white" stroke-width="3"/>
                                </svg>
                            `),
                                    scaledSize: { width: 60, height: 60 },
                                    anchor: { x: 30, y: 30 },
                                }}
                            />
                        ))}
                    </GoogleMap>
                )}
            </div>

            {/* SWIPEABLE CARD CAROUSEL */}
            <div style={styles.carouselContainer}>
                <div style={styles.carouselScroll}>
                    {vehicles.map((v, i) => {
                        const isSelected = selectedVehicle?.id === v.id;
                        const status = STATUS_CONFIG[v.status] || STATUS_CONFIG['NORMAL'];

                        return (
                            <motion.div
                                key={v.id}
                                style={{
                                    ...styles.vehicleCard,
                                    border: isSelected ? '2px solid #2563EB' : '1px solid #fff',
                                    opacity: isSelected ? 1 : 0.8,
                                    transform: isSelected ? 'scale(1)' : 'scale(0.95)'
                                }}
                                onClick={() => selectVehicleByIndex(i)}
                                initial={{ y: 50, opacity: 0 }}
                                animate={{ y: 0, opacity: isSelected ? 1 : 0.7 }}
                                transition={{ duration: 0.3 }}
                            >
                                {/* Upper Status Line */}
                                <div style={styles.cardHeader}>
                                    <span style={{ fontSize: 14, fontWeight: '600', color: '#1F2937' }}>
                                        {v.status === 'NORMAL' ? 'จอดอยู่' : status.label}
                                    </span>
                                    <span style={{ fontSize: 14, fontWeight: '600', color: '#1F2937' }}>
                                        {getDuration(v.last_update)}
                                    </span>
                                </div>

                                <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 15 }}>
                                    พิกัดล่าสุด • {v.lat?.toFixed(4)}, {v.lng?.toFixed(4)}
                                </div>

                                {/* Driver & Plate Info */}
                                <div style={styles.cardInfo}>
                                    <div style={styles.avatar}>
                                        <User size={24} color="#6B7280" />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={styles.plateNumber}>{v.plate_number}</div>
                                        <div style={styles.driverName}>{v.driver_name} • Toyota Camry</div> {/* Mock model */}
                                    </div>
                                    <button style={styles.callBtn}>
                                        <Phone size={20} color="#1F2937" />
                                    </button>
                                </div>

                                {/* Action Button (Navigation) */}
                                {isSelected && (
                                    <button style={styles.navBtn} onClick={(e) => { e.stopPropagation(); window.open(`https://maps.google.com/?q=${v.lat},${v.lng}`); }}>
                                        <Navigation size={18} color="white" style={{ marginRight: 8 }} /> นำทาง (Google Maps)
                                    </button>
                                )}
                            </motion.div>
                        );
                    })}

                    {/* Add New Card (End of list) */}
                    <div style={{ ...styles.vehicleCard, justifyContent: 'center', alignItems: 'center', minWidth: '85%' }} onClick={openAddVehicle}>
                        <div style={{ background: '#F3F4F6', borderRadius: '50%', width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                            <Plus size={24} color="#4B5563" />
                        </div>
                        <div style={{ fontWeight: 'bold', color: '#4B5563' }}>เพิ่มรถใหม่</div>
                    </div>
                </div>
            </div>

            {/* MENU FULLSCREEN OVERLAY */}
            <AnimatePresence>
                {menuOpen && (
                    <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        style={styles.menuContainer}
                    >
                        <div style={styles.menuHeader}>
                            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#111' }}>Menu</div>
                            <button onClick={() => setMenuOpen(false)} style={styles.closeBtn}><X size={24} /></button>
                        </div>

                        <div style={styles.menuList}>
                            <div style={styles.menuItem} onClick={openAddVehicle}>
                                <Plus size={20} /> <span>เพิ่มรถใหม่</span> <ChevronRight size={16} style={{ marginLeft: 'auto' }} />
                            </div>
                            <div style={styles.menuItem}>
                                <User size={20} /> <span>ข้อมูลส่วนตัว</span> <ChevronRight size={16} style={{ marginLeft: 'auto' }} />
                            </div>
                            <div style={{ ...styles.menuItem, color: 'red', marginTop: 20 }} onClick={() => { localStorage.removeItem('gps_user_token'); setStep('login'); }}>
                                <LogOut size={20} /> <span>ออกจากระบบ</span>
                            </div>
                        </div>

                        <div style={{ marginTop: 'auto', color: '#9CA3AF', fontSize: 12, textAlign: 'center', padding: 20 }}>
                            GPS Tracker App v1.2.0
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modal Add Vehicle */}
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
    appContainer: { height: '100vh', width: '100%', position: 'relative', background: '#fff', overflow: 'hidden' },

    // Auth
    authContainer: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' },
    authBox: { background: 'white', padding: 30, borderRadius: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', width: '90%', maxWidth: 350, textAlign: 'center' },
    logo: { fontSize: 48, marginBottom: 10 },
    input: { width: '100%', padding: 14, borderRadius: 12, border: '1px solid #E2E8F0', marginBottom: 12, fontSize: 16, outline: 'none', background: '#F8FAFC' },
    primaryBtn: { width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#111827', color: 'white', fontWeight: 'bold', cursor: 'pointer', marginTop: 10, fontSize: 16 },
    error: { color: '#EF4444', fontSize: 13, marginBottom: 10 },

    // Header Element
    headerFloating: { position: 'absolute', top: 'max(20px, env(safe-area-inset-top))', left: 20, right: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10, pointerEvents: 'none' },
    menuIconBtn: { background: 'white', border: 'none', borderRadius: '50%', width: 45, height: 45, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', cursor: 'pointer', pointerEvents: 'auto' },
    headerTitleBadge: { background: 'white', padding: '8px 16px', borderRadius: 20, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center' },

    // Carousel Slider
    carouselContainer: {
        position: 'absolute',
        bottom: 'max(20px, env(safe-area-inset-bottom))',
        left: 0,
        width: '100%',
        zIndex: 20,
        overflowX: 'auto',
        scrollbarWidth: 'none', // Hide scrollbar
    },
    carouselScroll: {
        display: 'flex',
        padding: '0 20px',
        gap: 15,
        width: 'max-content', // Allow content to overflow horizontally
    },
    vehicleCard: {
        background: 'white',
        borderRadius: 20,
        padding: 20,
        minWidth: '85vw', // Take most of screen width
        maxWidth: 350,
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
    },
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
    cardInfo: { display: 'flex', alignItems: 'center', gap: 15, marginBottom: 15 },
    avatar: { width: 50, height: 50, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    plateNumber: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
    driverName: { fontSize: 13, color: '#6B7280' },
    callBtn: { width: 45, height: 45, borderRadius: 12, border: '1px solid #E5E7EB', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
    navBtn: { width: '100%', padding: 12, borderRadius: 12, border: 'none', background: '#111827', color: 'white', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },

    // Menu Overlay
    menuContainer: { position: 'fixed', inset: 0, background: 'white', zIndex: 100, padding: 20, paddingTop: 'max(20px, env(safe-area-inset-top))', display: 'flex', flexDirection: 'column' },
    menuHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 },
    closeBtn: { background: '#F3F4F6', border: 'none', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    menuList: { display: 'flex', flexDirection: 'column', gap: 10 },
    menuItem: { display: 'flex', alignItems: 'center', gap: 15, padding: 16, borderRadius: 12, background: '#F8FAFC', cursor: 'pointer', fontSize: 16, fontWeight: '500', color: '#374151' },

    // Modal
    modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' },
    modal: { background: 'white', width: '85%', maxWidth: 340, padding: 24, borderRadius: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' },
    cancelBtn: { flex: 1, padding: 12, background: '#F1F5F9', border: 'none', borderRadius: 12, color: '#4B5563', fontWeight: '600' },
    confirmBtn: { flex: 1, padding: 12, background: '#2563EB', color: 'white', border: 'none', borderRadius: 12, fontWeight: '600' }
};
