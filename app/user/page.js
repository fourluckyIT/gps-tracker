"use client";
import { useState, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
import { io } from 'socket.io-client';
import { Toaster, toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Car, MapPin, Navigation, History, LogOut, Plus,
    Menu, X, CheckCircle, AlertTriangle, Clock, RefreshCw, User, ShieldCheck, LocateFixed
} from 'lucide-react';

const GOOGLE_MAPS_API_KEY = "AIzaSyACWF7KC20kJzTuxl-AicAuANdZaP7U74Q";
let socket;

// --- UTILS ---
const STATUS_CONFIG = {
    '3': { label: 'ปกติ', color: 'text-emerald-700', bg: 'bg-emerald-100', icon: <CheckCircle size={14} /> },
    '1': { label: 'ถูกขโมย!', color: 'text-red-700', bg: 'bg-red-100', icon: <AlertTriangle size={14} /> },
    '2': { label: 'อุบัติเหตุ', color: 'text-orange-700', bg: 'bg-orange-100', icon: <AlertTriangle size={14} /> },
    '0': { label: 'ไม่ทราบ', color: 'text-gray-600', bg: 'bg-gray-100', icon: <Clock size={14} /> }
};

export default function UserApp() {
    const [authState, setAuthState] = useState('loading'); // loading, login, register, app
    const [userPhone, setUserPhone] = useState('');
    const [vehicles, setVehicles] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [showAddVehicle, setShowAddVehicle] = useState(false);

    // Map State
    const { isLoaded } = useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_API_KEY });
    const [map, setMap] = useState(null);
    const [viewState, setViewState] = useState('live'); // 'live' | 'history_focus'
    const [historyFocus, setHistoryFocus] = useState(null); // { lat, lng, time }

    // Forms
    const [loginPhone, setLoginPhone] = useState('');
    const [regForm, setRegForm] = useState({ code: '', plate: '', driver: '', phone: '' });

    // History Data
    const [historyLogs, setHistoryLogs] = useState([]);

    // --- 1. INITIALIZE ---
    useEffect(() => {
        const savedPhone = localStorage.getItem('user_phone');
        if (savedPhone) {
            setUserPhone(savedPhone);
            fetchVehicles(savedPhone);
        } else {
            setAuthState('login');
            setHistoryLogs([]); // Clear logs on logout
        }
    }, []);

    // --- 2. SOCKET & REALTIME ---
    useEffect(() => {
        if (authState !== 'app') return;

        // Connect Socket with Dynamic URL selection
        const socketUrl = window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin;
        socket = io(socketUrl, { path: '/socket.io' });

        socket.on('connect', () => console.log('🟢 Socket Connected'));

        socket.on('device_update', (data) => {
            setVehicles(prev => prev.map(v => {
                if (v.device_id === data.device_id) {
                    // Check Alert (Only trigger if status CHANGED to alert, to avoid spam)
                    if ((data.status === '1' || data.status === '2') && v.status !== data.status) {
                        triggerNotification(v.plate_number, data.status);
                    }
                    return { ...v, ...data, last_update: new Date().toISOString() };
                }
                return v;
            }));
        });

        return () => socket.disconnect();
    }, [authState]);

    // Request Permission on Load/Login
    useEffect(() => {
        if (authState === 'app' && 'Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, [authState]);

    const triggerNotification = (plate, status) => {
        const label = status === '1' ? 'ถูกขโมย!' : 'เกิดอุบัติเหตุ!';
        // In-App Toast
        toast((t) => (
            <div className="flex items-center gap-3" onClick={() => toast.dismiss(t.id)}>
                <div className="bg-red-100 p-2 rounded-full text-red-600"><AlertTriangle /></div>
                <div>
                    <div className="font-bold text-red-600">{label}</div>
                    <div className="text-xs">รถทะเบียน {plate}</div>
                </div>
            </div>
        ), { duration: 5000, position: 'top-center' });

        // Browser Notification
        if (Notification.permission === 'granted') {
            new Notification(`🚨 แจ้งเตือน: ${plate}`, {
                body: `สถานะ: ${label}`,
                icon: '/icon-192.png' // Ensure icon exists or remove
            });
        }
    };

    // --- 3. API CALLS ---

    const handleLogin = async () => {
        if (!loginPhone || loginPhone.length < 9) return toast.error("กรุณากรอกเบอร์โทรที่ถูกต้อง");

        try {
            const res = await fetch('/api/user/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone_number: loginPhone })
            });
            const data = await res.json();

            if (data.exists) {
                localStorage.setItem('user_phone', loginPhone);
                setUserPhone(loginPhone);
                fetchVehicles(loginPhone);
            } else {
                // Go to Register
                setRegForm({ ...regForm, phone: loginPhone });
                setAuthState('register');
            }
        } catch (err) {
            console.error(err);
            toast.error("เข้าสู่ระบบไม่สำเร็จ");
        }
    };

    const handleRegister = async () => {
        try {
            const payload = authState === 'register'
                ? { code: regForm.code, plate_number: regForm.plate, driver_name: regForm.driver, phone_number: regForm.phone } // First Car
                : { code: regForm.code, plate_number: regForm.plate, driver_name: regForm.driver, user_token: userPhone }; // Add Vehicle

            const endpoint = authState === 'register' ? '/api/user/register' : '/api/user/add-vehicle';

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (data.success) {
                if (authState === 'register') {
                    localStorage.setItem('user_phone', regForm.phone);
                    setUserPhone(regForm.phone);
                }
                toast.success("เพิ่มรถเรียบร้อย!");
                fetchVehicles(userPhone || regForm.phone);
                setShowAddVehicle(false);
                setRegForm({ code: '', plate: '', driver: '', phone: '' });
            } else {
                toast.error(data.error || "เกิดข้อผิดพลาด");
            }
        } catch (err) {
            toast.error("เชื่อมต่อ Server ไม่ได้");
        }
    };

    const fetchVehicles = async (phone) => {
        try {
            const res = await fetch(`/api/user/vehicles?token=${phone}`);
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                setVehicles(data);
                setAuthState('app');
                // Select first one if none selected
                if (!selectedId) setSelectedId(data[0].device_id);
            } else {
                setAuthState('register');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchHistory = async (deviceId) => {
        if (!deviceId) return;
        try {
            const res = await fetch(`/api/history/${deviceId}?limit=20`);
            const data = await res.json();
            setHistoryLogs(data);
        } catch (e) { console.error(e); }
    };

    const handleMyLocation = () => {
        if (navigator.geolocation && map) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    map.panTo({ lat: latitude, lng: longitude });
                    map.setZoom(15);
                    // Add a temporary marker or circle for user location could be good here
                },
                (error) => toast.error("ไม่สามารถระบุตำแหน่งของคุณได้")
            );
        } else {
            toast.error("Geolocation ไม่รองรับในเบราว์เซอร์นี้");
        }
    };

    const handleHistoryJump = (h) => {
        setViewState('history_focus');
        setHistoryFocus(h);
        if (map) {
            map.panTo({ lat: h.lat, lng: h.lng });
            map.setZoom(18);
        }
        setShowHistory(false); // Close list to see map
        toast((t) => (
            <div className="flex items-center justify-between w-full">
                <span className="text-sm">📍 ดูประวัติ: {new Date(h.timestamp).toLocaleTimeString()}</span>
                <button onClick={() => { setViewState('live'); setHistoryFocus(null); toast.dismiss(t.id); }} className="bg-blue-600 text-white px-2 py-1 rounded text-xs ml-2">
                    กลับสู่ปัจจุบัน
                </button>
            </div>
        ), { duration: 10000, position: 'bottom-center' });
    };

    const resetToLive = () => {
        setViewState('live');
        setHistoryFocus(null);
        if (selectedVehicle && map) {
            map.panTo({ lat: selectedVehicle.lat, lng: selectedVehicle.lng });
            map.setZoom(15);
        }
    };


    // --- 4. RENDER ---

    if (authState === 'loading') return <div className="h-screen flex items-center justify-center bg-gray-50">Loading...</div>;

    // LOGIN SCREEN
    if (authState === 'login') {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-white p-6 relative">
                <Car size={64} className="text-blue-600 mb-6" />
                <h1 className="text-2xl font-bold mb-2">GPS Tracker Login</h1>
                <p className="text-gray-500 mb-8 text-center">กรุณากรอกเบอร์โทรศัพท์เพื่อเข้าใช้งาน</p>

                <input
                    type="tel"
                    placeholder="เบอร์โทรศัพท์ (0xx-xxx-xxxx)"
                    className="w-full max-w-sm border border-gray-300 rounded-xl p-4 text-lg mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={loginPhone}
                    onChange={e => setLoginPhone(e.target.value)}
                />

                <button
                    onClick={handleLogin}
                    className="w-full max-w-sm bg-blue-600 text-white py-4 rounded-xl text-lg font-bold hover:bg-blue-700 transition"
                >
                    เข้าสู่ระบบ
                </button>

                <div className="absolute bottom-6 text-xs text-gray-300 cursor-pointer" onClick={() => localStorage.clear()}>
                    Emergency Reset Data
                </div>
            </div>
        );
    }

    // REGISTER SCREEN (First Time)
    if (authState === 'register') {
        return (
            <div className="h-screen flex flex-col bg-white p-6 font-sans">
                <h1 className="text-2xl font-bold mt-10 mb-2">ลงทะเบียนใช้งานครั้งแรก</h1>
                <p className="text-gray-500 mb-8">เชื่อมต่ออุปกรณ์ GPS กับเบอร์ {regForm.phone}</p>

                <div className="space-y-4">
                    <input
                        placeholder="รหัสอุปกรณ์ (Credential Code)"
                        className="w-full border border-gray-300 rounded-xl p-4 bg-gray-50 outline-none font-mono tracking-wider"
                        value={regForm.code}
                        onChange={e => setRegForm({ ...regForm, code: e.target.value.toUpperCase() })}
                    />
                    <input
                        placeholder="เลขทะเบียนรถ (เช่น กข 1234)"
                        className="w-full border border-gray-300 rounded-xl p-4 px-4 outline-none"
                        value={regForm.plate}
                        onChange={e => setRegForm({ ...regForm, plate: e.target.value })}
                    />
                    <input
                        placeholder="ชื่อผู้ขับขี่"
                        className="w-full border border-gray-300 rounded-xl p-4 px-4 outline-none"
                        value={regForm.driver}
                        onChange={e => setRegForm({ ...regForm, driver: e.target.value })}
                    />

                    <button
                        onClick={handleRegister}
                        className="w-full bg-black text-white py-4 rounded-xl text-lg font-bold mt-4"
                    >
                        เริ่มใช้งาน
                    </button>

                    <button
                        onClick={() => setAuthState('login')}
                        className="w-full text-gray-400 py-2 text-sm"
                    >
                        กลับไปหน้า Login
                    </button>
                </div>
            </div>
        );
    }

    // --- APP SCREEN (Main) ---
    const selectedVehicle = vehicles.find(v => v.device_id === selectedId) || vehicles[0];

    return (
        <div className="h-screen w-full bg-gray-50 relative overflow-hidden font-sans text-gray-900">
            <Toaster position="top-center" />

            {/* Header Bar */}
            <div className="absolute top-0 left-0 right-0 z-10 flex justify-between items-center p-4 bg-gradient-to-b from-white/90 to-transparent pointer-events-none pb-12">
                <div className="pointer-events-auto bg-white shadow rounded-full px-4 py-2 flex items-center gap-2 cursor-pointer active:scale-95 transition" onClick={() => setMenuOpen(true)}>
                    <Menu size={20} className="text-gray-700" />
                    <span className="text-xs font-bold text-gray-700">{vehicles.length} คัน</span>
                </div>

                <div className="flex gap-2 pointer-events-auto">
                    {/* My Location Button */}
                    <button onClick={handleMyLocation} className="bg-white p-2 rounded-full shadow text-gray-700 active:bg-blue-50">
                        <LocateFixed size={20} />
                    </button>
                    {/* Add Vehicle Button MOVED to Card Slide, but keeping specific add flow logic for now here hidden or just rely on slide */}
                </div>
            </div>

            {/* Map */}
            <div className="w-full h-full">
                {isLoaded ? (
                    <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={
                            viewState === 'history_focus' && historyFocus
                                ? { lat: historyFocus.lat, lng: historyFocus.lng }
                                : { lat: selectedVehicle?.lat || 13.75, lng: selectedVehicle?.lng || 100.50 }
                        }
                        zoom={15}
                        onLoad={setMap}
                        options={{ disableDefaultUI: true, zoomControl: false }}
                    >
                        {/* Live Vehicles */}
                        {viewState === 'live' && vehicles.map(v => (
                            <Marker
                                key={v.device_id}
                                position={{ lat: v.lat || 0, lng: v.lng || 0 }}
                                onClick={() => setSelectedId(v.device_id)}
                                icon={{
                                    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
                                <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
                                    <circle cx="30" cy="30" r="22" fill="${v.status === '1' ? 'rgba(239, 68, 68, 0.3)' :
                                            v.status === '2' ? 'rgba(249, 115, 22, 0.3)' :
                                                'rgba(16, 185, 129, 0.3)'
                                        }" />
                                    <circle cx="30" cy="30" r="10" fill="${v.status === '1' ? '#EF4444' :
                                            v.status === '2' ? '#F97316' :
                                                '#10B981'
                                        }" stroke="white" stroke-width="2"/>
                                </svg>
                            `),
                                    scaledSize: new window.google.maps.Size(60, 60),
                                    anchor: new window.google.maps.Point(30, 30)
                                }}
                            />
                        ))}

                        {/* History Focus Marker */}
                        {viewState === 'history_focus' && historyFocus && (
                            <Marker
                                position={{ lat: historyFocus.lat, lng: historyFocus.lng }}
                                icon={{
                                    path: window.google?.maps?.SymbolPath?.CIRCLE,
                                    scale: 8,
                                    fillColor: "#2563EB",
                                    fillOpacity: 1,
                                    strokeWeight: 2,
                                    strokeColor: "#FFFFFF",
                                }}
                            />
                        )}
                    </GoogleMap>
                ) : <div className="h-full flex items-center justify-center">Loading Map...</div>}
            </div>

            {/* Swipeable Cards */}
            <div
                className="absolute bottom-14 left-0 w-full z-20 overflow-x-auto no-scrollbar px-[3%] flex gap-3 snap-x snap-mandatory pb-safe"
                onClick={() => { if (viewState === 'history_focus') resetToLive(); }}
            >
                {vehicles.map((v) => {
                    const isSelected = selectedId === v.device_id;
                    const st = STATUS_CONFIG[v.status] || STATUS_CONFIG['0'];

                    return (
                        <div
                            key={v.device_id}
                            onClick={() => { setSelectedId(v.device_id); resetToLive(); }}
                            className={`
                        snap-center min-w-[94%] bg-white rounded-2xl p-5 shadow-xl border border-gray-100 flex-shrink-0
                        transition-all duration-300
                        ${isSelected ? 'ring-2 ring-blue-500 scale-100' : 'scale-95 opacity-90'}
                    `}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase ${st.bg} ${st.color}`}>
                                    {st.icon} {st.label}
                                </div>
                                <div className="text-gray-400 text-xs font-medium flex items-center gap-1">
                                    <Clock size={12} /> {new Date(v.last_update).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>

                            <div className="mb-6 pl-1">
                                <h2 className="text-3xl font-black text-gray-900 tracking-tight">{v.license_plate || v.plate_number || 'ไม่ระบุทะเบียน'}</h2>
                                <p className="text-sm text-gray-500 font-medium">{v.owner_name || v.driver_name || 'Driver'}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedId(v.device_id); fetchHistory(v.device_id); setShowHistory(true); }}
                                    className="flex items-center justify-center gap-2 bg-gray-50 active:bg-gray-100 text-gray-700 py-3 rounded-xl font-bold text-sm transition border border-gray-200"
                                >
                                    <History size={18} /> ประวัติแจ้งเตือน
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); window.open(`https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`, '_blank'); }}
                                    className="flex items-center justify-center gap-2 bg-blue-600 active:bg-blue-700 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-blue-200 transition"
                                >
                                    <Navigation size={18} /> นำทาง
                                </button>
                            </div>
                        </div>
                    );
                })}

                {/* Add Vehicle Card (Last Item) */}
                <div
                    onClick={() => setShowAddVehicle(true)}
                    className="snap-center min-w-[94%] bg-gray-50 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center p-6 text-gray-400 flex-shrink-0 cursor-pointer hover:bg-gray-100 transition"
                >
                    <div className="bg-white p-4 rounded-full shadow-sm mb-2 text-blue-500"><Plus size={32} /></div>
                    <span className="font-bold text-lg text-gray-600">เพิ่มรถใหม่</span>
                    <span className="text-sm text-gray-400">Add New Vehicle</span>
                </div>
            </div>

            {/* Pagination Dots */}
            <div className="absolute bottom-6 left-0 w-full z-20 flex justify-center gap-2 pb-safe pointer-events-none">
                {vehicles.map((v) => (
                    <div
                        key={v.device_id}
                        className={`h-2 rounded-full transition-all duration-300 shadow-sm ${selectedId === v.device_id ? 'w-6 bg-blue-600' : 'w-2 bg-gray-300'}`}
                    />
                ))}
                {/* Dot for Add Card */}
                <div className="h-2 w-2 rounded-full bg-gray-300 shadow-sm" />
            </div>

            {/* History List Popup */}
            <AnimatePresence>
                {showHistory && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={() => setShowHistory(false)}
                        />
                        <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed bottom-0 left-0 right-0 bg-white z-50 rounded-t-3xl p-6 pb-20 max-h-[70vh] flex flex-col shadow-2xl"
                        >
                            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6" />
                            <div className="flex justify-between items-end mb-4 border-b pb-4">
                                <h3 className="text-xl font-bold text-gray-900">ประวัติการแจ้งเตือน</h3>
                                <button onClick={() => setShowHistory(false)} className="bg-gray-100 p-2 rounded-full"><X size={20} /></button>
                            </div>
                            <div className="overflow-y-auto flex-1 space-y-4 pr-2">
                                {historyLogs.length === 0 && <p className="text-gray-400 text-center py-10">ยังไม่มีประวัติ</p>}
                                {historyLogs.map((h, i) => {
                                    const st = STATUS_CONFIG[h.status] || STATUS_CONFIG['0'];
                                    return (
                                        <div key={i} className="flex gap-4 items-start group cursor-pointer active:bg-gray-50 p-2 rounded-lg transition"
                                            onClick={() => handleHistoryJump(h)}
                                        >
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${st.bg} ${st.color}`}>{st.icon}</div>
                                            <div className="flex-1 pb-4 border-b border-gray-50">
                                                <div className="flex justify-between">
                                                    <span className={`text-sm font-bold ${st.color}`}>{st.label}</span>
                                                    <span className="text-xs text-gray-400">{new Date(h.timestamp || Date.now()).toLocaleTimeString()}</span>
                                                </div>
                                                <div className="text-sm text-gray-600 mt-1 flex items-center gap-1"><MapPin size={12} /> {h.lat.toFixed(4)}, {h.lng.toFixed(4)}</div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Add Vehicle Modal */}
            <AnimatePresence>
                {showAddVehicle && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6">
                        <div className="bg-white rounded-2xl p-6 w-full max-w-sm relative">
                            <button onClick={() => setShowAddVehicle(false)} className="absolute top-4 right-4 text-gray-400"><X /></button>
                            <h2 className="text-xl font-bold mb-4">เพิ่มรถคันใหม่</h2>
                            <div className="space-y-3">
                                <input className="w-full border p-3 rounded-lg" placeholder="Credential Code" value={regForm.code} onChange={e => setRegForm({ ...regForm, code: e.target.value.toUpperCase() })} />
                                <input className="w-full border p-3 rounded-lg" placeholder="ทะเบียนรถ" value={regForm.plate} onChange={e => setRegForm({ ...regForm, plate: e.target.value })} />
                                <input className="w-full border p-3 rounded-lg" placeholder="ชื่อคนขับ" value={regForm.driver} onChange={e => setRegForm({ ...regForm, driver: e.target.value })} />
                                <button onClick={handleRegister} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">ยืนยัน</button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Menu Overlay */}
            <AnimatePresence>
                {menuOpen && (
                    <motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} className="fixed top-0 left-0 bottom-0 w-3/4 max-w-sm bg-white z-50 p-6 shadow-2xl overflow-y-auto">
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-2xl font-bold">เมนู</h2>
                            <button onClick={() => setMenuOpen(false)}><X /></button>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl mb-6">
                            <div className="text-xs text-gray-400">เข้าสู่ระบบด้วยเบอร์</div>
                            <div className="text-xl font-bold text-gray-800">{userPhone}</div>
                        </div>

                        <div className="space-y-2 mb-6">
                            <div className="text-sm font-bold text-gray-400 px-2 mb-2">การตั้งค่า</div>

                            <button className="flex items-center gap-3 p-3 w-full hover:bg-gray-50 rounded-xl text-left" onClick={() => toast("ฟีเจอร์นี้จะมาเร็วๆนี้")}>
                                <ShieldCheck className="text-blue-600" size={20} />
                                <div className="flex-1">
                                    <div className="font-bold text-gray-700">โหมดจอดรถ (Anti-Theft)</div>
                                    <div className="text-xs text-gray-400">ตั้งค่าจุดจอดและแจ้งเตือนเมื่อหลุด</div>
                                </div>
                            </button>
                        </div>

                        <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="flex items-center gap-2 text-red-500 font-bold p-3 hover:bg-red-50 rounded-xl w-full">
                            <LogOut size={20} /> ออกจากระบบ
                        </button>
                        <div className="mt-10 text-xs text-gray-300 text-center w-full">Version 1.3.0 (Beta)</div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}
