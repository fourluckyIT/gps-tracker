"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from 'next/link';
import { GoogleMap, useJsApiLoader, Marker, Circle } from "@react-google-maps/api";
import { io } from "socket.io-client";
import toast, { Toaster } from "react-hot-toast";
import {
    Menu, X, MapPin, Crosshair, Plus, Trash2, Edit3, Check, Clock, Car, Navigation, History as HistoryIcon, Shield, ShieldAlert, AlertTriangle
} from "lucide-react";
import styles from "./Map.module.css";

// Config
const SERVER_URL = typeof window !== 'undefined'
    ? window.location.origin
    : "http://143.14.200.117";
const GOOGLE_MAPS_API_KEY = "AIzaSyACWF7KC20kJzTuxl-AicAuANdZaP7U74Q";

const defaultCenter = { lat: 13.7563, lng: 100.5018 }; // Bangkok

// Geofence colors
const GEOFENCE_COLORS = ["#FF6B6B", "#4ECDC4", "#FFE66D"];
const GEOFENCE_NAMES = ["จุดที่ 1", "จุดที่ 2", "จุดที่ 3"];

// Calculate distance
const getDistance = (pos1, pos2) => {
    if (!pos1 || !pos2) return Infinity;
    const R = 6371000;
    const dLat = ((pos2.lat - pos1.lat) * Math.PI) / 180;
    const dLng = ((pos2.lng - pos1.lng) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((pos1.lat * Math.PI) / 180) *
        Math.cos((pos2.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

function MapContent() {
    const searchParams = useSearchParams();
    const deviceId = searchParams.get("id");

    // Map state
    const [map, setMap] = useState(null);
    const [carPosition, setCarPosition] = useState(null);
    const [carStatus, setCarStatus] = useState("");
    const [connected, setConnected] = useState(false);

    // Car name & parking time
    const [carName, setCarName] = useState("");
    const [isEditingName, setIsEditingName] = useState(false);
    const [parkingStartTime, setParkingStartTime] = useState(null);
    const [lastPosition, setLastPosition] = useState(null);

    // User position (Phone GPS)
    const [userPosition, setUserPosition] = useState(null);
    const [distanceToCar, setDistanceToCar] = useState(null);

    // UI state
    const [menuOpen, setMenuOpen] = useState(false);

    // Geofence state
    const [geofences, setGeofences] = useState([null, null, null]);
    const [geofencesLoaded, setGeofencesLoaded] = useState(false);
    const [carInGeofence, setCarInGeofence] = useState(null);
    const [prevCarInGeofence, setPrevCarInGeofence] = useState(null);

    // Popup
    const [popupOpen, setPopupOpen] = useState(false);
    const [popupIndex, setPopupIndex] = useState(null);
    const [popupPosition, setPopupPosition] = useState(defaultCenter);
    const [popupRadius, setPopupRadius] = useState(100);
    const [popupMap, setPopupMap] = useState(null);

    // SOS & History
    const [sosNumbers, setSosNumbers] = useState(["", "", ""]);
    const [sosLoading, setSosLoading] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [showAlertsOnly, setShowAlertsOnly] = useState(false);

    // Address
    const [address, setAddress] = useState("กำลังค้นหาที่อยู่...");

    // Google Maps Loader
    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
        language: "th",
    });

    // --- LOGIC EFFECTS (Same as before) ---
    // Reverse Geocoding
    useEffect(() => {
        if (!carPosition || !isLoaded || !window.google) return;
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: carPosition }, (results, status) => {
            if (status === "OK" && results[0]) {
                setAddress(results[0].formatted_address);
            } else {
                setAddress("ไม่พบข้อมูลที่อยู่");
            }
        });
    }, [carPosition, isLoaded]);

    // LocalStorage Load
    useEffect(() => {
        if (deviceId) {
            const savedGeofences = localStorage.getItem(`geofences_${deviceId}`);
            if (savedGeofences) setGeofences(JSON.parse(savedGeofences));
            const savedCarName = localStorage.getItem(`carName_${deviceId}`);
            if (savedCarName) setCarName(savedCarName);
            else setCarName(deviceId); // Default to ID
            setGeofencesLoaded(true);
        }
    }, [deviceId]);

    // LocalStorage Save
    useEffect(() => {
        if (deviceId && geofencesLoaded) {
            localStorage.setItem(`geofences_${deviceId}`, JSON.stringify(geofences));
        }
        if (deviceId && carName) {
            localStorage.setItem(`carName_${deviceId}`, carName);
        }
    }, [geofences, carName, deviceId, geofencesLoaded]);

    // WebSocket
    useEffect(() => {
        if (!deviceId) return;
        const socket = io(SERVER_URL, { transports: ["websocket"], reconnectionAttempts: 5 });

        socket.on("connect", () => setConnected(true));
        socket.on("disconnect", () => setConnected(false));
        socket.on("device_update", (data) => {
            if (data.device_id === deviceId) {
                const newPos = { lat: data.lat, lng: data.lng };
                setCarPosition(newPos);
                setCarStatus(data.status);
                if (data.sos_update) fetchSosNumbers();

                if (lastPosition) {
                    if (getDistance(lastPosition, newPos) > 20) {
                        setParkingStartTime(new Date());
                        setLastPosition(newPos);
                    }
                } else {
                    setLastPosition(newPos);
                    setParkingStartTime(new Date());
                }
            }
        });

        // Initial fetch
        fetch(`${SERVER_URL}/api/history/${deviceId}?limit=1`)
            .then(res => res.json())
            .then(data => {
                if (data.length > 0) {
                    const pos = { lat: data[0].lat, lng: data[0].lng };
                    setCarPosition(pos);
                    setLastPosition(pos);
                    setParkingStartTime(new Date(data[0].timestamp));
                }
            })
            .catch(err => console.error(err));

        fetchSosNumbers();
        return () => socket.disconnect();
    }, [deviceId]);

    const fetchSosNumbers = useCallback(() => {
        if (!deviceId) return;
        fetch(`${SERVER_URL}/api/device/${deviceId}`)
            .then(res => res.json())
            .then(data => {
                if (data.sos_numbers && Array.isArray(data.sos_numbers)) {
                    setSosNumbers([...data.sos_numbers, "", "", ""].slice(0, 3));
                }
            })
            .catch(err => console.error(err));
    }, [deviceId]);

    const saveSosNumbers = () => {
        setSosLoading(true);
        fetch(`${SERVER_URL}/api/device/${deviceId}/sos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ numbers: sosNumbers.filter(n => n.trim() !== "") })
        })
            .then(res => res.json())
            .then(data => {
                setSosLoading(false);
                if (data.success) toast.success("บันทึกเบอร์ฉุกเฉินแล้ว");
                else toast.error("บันทึกไม่สำเร็จ");
            })
            .catch(() => {
                setSosLoading(false);
                toast.error("เกิดข้อผิดพลาด");
            });
    };

    // Geolocation
    useEffect(() => {
        if (!navigator.geolocation) return;
        const watchId = navigator.geolocation.watchPosition(
            (position) => setUserPosition({ lat: position.coords.latitude, lng: position.coords.longitude }),
            (err) => console.error(err),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    useEffect(() => {
        if (userPosition && carPosition) {
            setDistanceToCar(getDistance(userPosition, carPosition));
        }
    }, [userPosition, carPosition]);

    // Initial Pan
    useEffect(() => {
        if (carPosition && map && !isEditingName) {
            // map.panTo(carPosition); // Don't auto-pan aggressively in new UI
        }
    }, [carPosition, map]);

    // Geofence Check
    useEffect(() => {
        if (!carPosition) { setCarInGeofence(null); return; }
        let found = null;
        for (let i = 0; i < geofences.length; i++) {
            const gf = geofences[i];
            if (gf && getDistance(carPosition, { lat: gf.lat, lng: gf.lng }) <= gf.radius) {
                found = { ...gf, index: i };
                break;
            }
        }
        setCarInGeofence(found);
    }, [carPosition, geofences]);

    useEffect(() => {
        const prevId = prevCarInGeofence?.index;
        const currId = carInGeofence?.index;
        if (prevId !== currId) {
            if (carInGeofence) toast.success(`🚗 ถึง "${carInGeofence.name}" แล้ว`);
            else if (prevCarInGeofence) toast(`🚗 ออกจาก "${prevCarInGeofence.name}" แล้ว`);
            setPrevCarInGeofence(carInGeofence);
        }
    }, [carInGeofence]);


    // Helper Functions
    const formatParkingDuration = () => {
        if (!parkingStartTime) return "ไม่ทราบ";
        const diff = Math.floor((new Date() - new Date(parkingStartTime)) / 1000);
        if (diff < 60) return `${diff} วิ`;
        if (diff < 3600) return `${Math.floor(diff / 60)} นาที`;
        const hours = Math.floor(diff / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        return `${hours} ชม. ${mins} น.`;
    };

    const [parkingDisplay, setParkingDisplay] = useState("--");
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
        const interval = setInterval(() => setParkingDisplay(formatParkingDuration()), 1000);
        return () => clearInterval(interval);
    }, [parkingStartTime]);

    // Handlers
    const fetchHistoryLogs = () => {
        if (!deviceId) return;
        setLogsLoading(true);
        setHistoryOpen(true);
        setMenuOpen(false);
        fetch(`${SERVER_URL}/api/history/${deviceId}?limit=50`)
            .then(res => res.json())
            .then(data => { setLogs(data); setLogsLoading(false); })
            .catch(() => { setLogsLoading(false); toast.error("โหลดประวัติไม่สำเร็จ"); });
    };

    const navigateToCar = () => {
        if (!carPosition) return;
        const url = `https://www.google.com/maps/dir/?api=1&destination=${carPosition.lat},${carPosition.lng}`;
        window.open(url, '_blank');
    };

    const focusCar = () => {
        if (map && carPosition) {
            map.panTo(carPosition);
            map.setZoom(18);
            toast.success("Focus 🚗");
        }
    };

    // Geofence Handlers
    const openGeofencePopup = (idx) => {
        const gf = geofences[idx];
        setPopupPosition(gf ? { lat: gf.lat, lng: gf.lng } : (carPosition || defaultCenter));
        setPopupRadius(gf ? gf.radius : 100);
        setPopupIndex(idx);
        setPopupOpen(true);
        setMenuOpen(false);
    };

    const saveGeofence = () => {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: popupPosition }, (results, status) => {
            const addr = (status === "OK" && results[0]) ? results[0].formatted_address : "";
            const newGf = [...geofences];
            newGf[popupIndex] = {
                name: geofences[popupIndex]?.name || GEOFENCE_NAMES[popupIndex],
                lat: popupPosition.lat, lng: popupPosition.lng, radius: popupRadius, address: addr
            };
            setGeofences(newGf);
            setPopupOpen(false);
            toast.success("บันทึกแล้ว");
        });
    };

    // Status logic
    const isStolen = (carStatus === "1" || (carStatus || "").includes("STOLEN"));
    const isCrash = (carStatus === "2" || (carStatus || "").includes("CRASH"));
    const statusLabel = isStolen ? "รถถูกขโมย!" : isCrash ? "เกิดอุบัติเหตุ!" : "ปกติ";
    const statusColor = isStolen ? "#FF4444" : isCrash ? "#FF9F43" : "#4ECDC4";


    if (loadError) return <div className={styles.errorScreen}>Error Loading Maps</div>;
    if (!isLoaded) return <div className={styles.loadingScreen}>กำลังโหลด...</div>;

    const shortAddress = address.split(' ').slice(0, 3).join(' ') + '...';

    return (
        <div className={styles.appContainer}>
            <Toaster position="top-center" containerStyle={{ top: 80 }} />

            {/* --- MAP SECTION --- */}
            <div className={styles.mapSection}>
                <GoogleMap
                    mapContainerStyle={{ width: "100%", height: "100%" }}
                    center={carPosition || defaultCenter}
                    zoom={16}
                    options={{
                        disableDefaultUI: true,
                        zoomControl: false,
                        fullscreenControl: false,
                        mapTypeControl: false,
                        streetViewControl: false,
                        styles: [
                            {
                                "featureType": "poi",
                                "elementType": "labels",
                                "stylers": [{ "visibility": "off" }]
                            }
                        ] // Clean map style
                    }}
                    onLoad={setMap}
                >
                    {/* Car Marker */}
                    {carPosition && (
                        <Marker
                            position={carPosition}
                            icon={{
                                url: "data:image/svg+xml," + encodeURIComponent(`
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
                                        <circle cx="20" cy="20" r="18" fill="${isStolen ? "#EF4444" : isCrash ? "#F97316" : "#4285F4"}" stroke="white" stroke-width="3"/>
                                        <text x="20" y="26" text-anchor="middle" fill="white" font-size="16">🚗</text>
                                    </svg>
                                `),
                                scaledSize: { width: 44, height: 44 },
                                anchor: { x: 22, y: 22 },
                            }}
                            onClick={() => setIsEditingName(true)}
                        />
                    )}

                    {/* User Blue Dot */}
                    {userPosition && (
                        <Marker
                            position={userPosition}
                            icon={{
                                path: window.google?.maps?.SymbolPath?.CIRCLE,
                                scale: 6, fillOpacity: 1, fillColor: "#4285F4", strokeColor: "white", strokeWeight: 2
                            }}
                        />
                    )}

                    {/* Geofences */}
                    {geofences.map((gf, i) => gf && (
                        <Circle
                            key={i} center={{ lat: gf.lat, lng: gf.lng }} radius={gf.radius}
                            options={{ fillColor: GEOFENCE_COLORS[i], fillOpacity: 0.15, strokeColor: GEOFENCE_COLORS[i], strokeWeight: 1 }}
                        />
                    ))}
                </GoogleMap>
            </div>

            {/* --- FLOATING HEADER --- */}
            {/* Menu Pill */}
            <div className={styles.menuPill} onClick={() => setMenuOpen(true)}>
                <Menu size={20} color="#333" />
                <span className={styles.menuLabel}>1 คัน</span>
            </div>

            {/* Focus/Current Location Button */}
            <div className={styles.focusBtn} onClick={focusCar}>
                <Crosshair size={24} color="#333" />
            </div>

            {/* --- BOTTOM CAROUSEL --- */}
            <div className={styles.bottomContainer}>
                <div className={styles.carousel}>

                    {/* CARD 1: CAR DETAILS */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div className={styles.statusTag} style={{
                                background: isStolen ? '#fee2e2' : isCrash ? '#ffedd5' : '#e0f2f1',
                                color: isStolen ? '#ef4444' : isCrash ? '#f97316' : '#0d9488'
                            }}>
                                {isStolen ? <ShieldAlert size={14} /> : isCrash ? <AlertTriangle size={14} /> : <Shield size={14} />}
                                {statusLabel}
                            </div>
                            <div className={styles.lastUpdate}>
                                <Clock size={12} />
                                {parkingStartTime ? new Date(parkingStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--"}
                            </div>
                        </div>

                        <div>
                            {isEditingName ? (
                                <input
                                    autoFocus
                                    className={styles.plateNumber}
                                    style={{ border: 'none', borderBottom: '2px solid #4285F4', outline: 'none', width: '100%' }}
                                    value={carName}
                                    onChange={e => setCarName(e.target.value)}
                                    onBlur={() => setIsEditingName(false)}
                                    onKeyDown={e => e.key === 'Enter' && setIsEditingName(false)}
                                />
                            ) : (
                                <div className={styles.plateNumber} onClick={() => setIsEditingName(true)}>
                                    {carName || "ตั้งชื่อรถ"} <Edit3 size={16} color="#ccc" style={{ verticalAlign: 'middle' }} />
                                </div>
                            )}

                            <div className={styles.carModel}>
                                {address ? (address.length > 50 ? address.substring(0, 50) + "..." : address) : "กำลังระบุที่อยู่..."}
                            </div>
                        </div>

                        {/* Parking & Distance Badge */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <div className={styles.distanceBadge} style={{ background: '#f5f5f5', color: '#666' }}>
                                <Clock size={14} /> จอด: {parkingDisplay}
                            </div>
                            <div className={styles.distanceBadge}>
                                <Navigation size={14} fill="currentColor" />
                                {distanceToCar ? (distanceToCar < 1000 ? `${Math.round(distanceToCar)} ม.` : `${(distanceToCar / 1000).toFixed(1)} กม.`) : "กำลังระบุ..."}
                            </div>
                        </div>

                        <div className={styles.cardActions}>
                            <button className={styles.btnSecondary} onClick={fetchHistoryLogs}>
                                <HistoryIcon size={20} /> ประวัติ
                            </button>
                            <button className={styles.btnPrimary} onClick={navigateToCar}>
                                <Navigation size={20} fill="white" /> นำทาง
                            </button>
                        </div>
                    </div>

                    {/* CARD 2: ADD CAR (Placeholder) */}
                    <div className={styles.addCard} onClick={() => toast("ฟีเจอร์นี้เตรียมเปิดใช้งานเร็วๆนี้")}>
                        <div className={styles.addIconCircle}>
                            <Plus size={32} />
                        </div>
                        <div style={{ fontWeight: 600, color: '#666' }}>เพิ่มรถใหม่</div>
                    </div>

                </div>

                {/* Dots */}
                <div className={styles.pagination}>
                    <div className={`${styles.dot} ${styles.active}`} />
                    <div className={styles.dot} />
                </div>
            </div>

            {/* --- SIDE MENU --- */}
            <div className={`${styles.sideMenu} ${menuOpen ? styles.open : ""}`}>
                <div className={styles.menuHeader}>
                    <h2>เมนู</h2>
                    <button onClick={() => setMenuOpen(false)}><X size={24} /></button>
                </div>
                <div className={styles.menuSection}>
                    <div className={styles.menuHint}>เข้าสู่ระบบด้วยเบอร์ {deviceId}</div>

                    <h3>การตั้งค่า</h3>
                    <div className={styles.menuItem} onClick={() => toast("ระบบแจ้งเตือนเปิดอยู่")}>
                        <Check size={18} color="#4ECDC4" /> จุดจอดปลอดภัย (Active)
                    </div>

                    {/* Geofences in Menu */}
                    <div style={{ marginTop: '20px' }}>
                        <h3>จุดจอดปลอดภัย (3 จุด)</h3>
                        {geofences.map((gf, i) => (
                            <div key={i} className={styles.geofenceItem}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: GEOFENCE_COLORS[i] }} />
                                <div style={{ flex: 1, fontSize: 13 }}>
                                    {gf ? gf.name : "ว่าง"}
                                </div>
                                <button
                                    onClick={() => openGeofencePopup(i)}
                                    style={{ background: 'none', border: 'none', color: '#4285F4', cursor: 'pointer' }}
                                >
                                    <Edit3 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
                        <div className={`${styles.menuItem} ${styles.logout}`} onClick={() => window.location.href = '/'}>
                            ออกจากระบบ
                        </div>
                    </div>
                </div>
            </div>
            {menuOpen && <div className={styles.overlay} onClick={() => setMenuOpen(false)} />}

            {/* --- POPUPS (History, Geofence, SOS) are simplified or hidden for now to match clean UI ---
                For a complete refactor, we should reimplement them as Modals using the new style.
                I will keep Geofence Popup logic but style it simply or reuse overlay.
                For now, I'll rely on the simplified structure.
            */}
            {/* Geofence Popup (Reused logic) */}
            {popupOpen && (
                <div className={styles.overlay} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className={styles.card} style={{ width: '90%', maxHeight: '80vh', padding: 0, overflow: 'hidden' }}>
                        <div className={styles.menuHeader}>
                            <h3>แก้ไข {GEOFENCE_NAMES[popupIndex]}</h3>
                            <button onClick={() => setPopupOpen(false)}><X size={24} /></button>
                        </div>
                        <div className={styles.popupMap}>
                            <GoogleMap
                                mapContainerStyle={{ width: "100%", height: "100%" }}
                                center={popupPosition} zoom={16}
                                options={{ disableDefaultUI: true, zoomControl: true }}
                                onClick={e => setPopupPosition({ lat: e.latLng.lat(), lng: e.latLng.lng() })}
                            >
                                <Marker position={popupPosition} draggable onDragEnd={e => setPopupPosition({ lat: e.latLng.lat(), lng: e.latLng.lng() })} />
                                <Circle center={popupPosition} radius={popupRadius} options={{ fillColor: GEOFENCE_COLORS[popupIndex], fillOpacity: 0.2, strokeColor: GEOFENCE_COLORS[popupIndex], strokeWeight: 1 }} />
                            </GoogleMap>
                        </div>
                        <div className={styles.popupControls}>
                            <label>รัศมี: {popupRadius}m</label>
                            <input type="range" min="30" max="500" value={popupRadius} onChange={e => setPopupRadius(parseInt(e.target.value))} />
                            <button className={styles.btnPrimary} onClick={saveGeofence} style={{ marginTop: 10, width: '100%' }}>บันทึก</button>
                        </div>
                    </div>
                </div>
            )}

            {/* History Popup (Reused) */}
            {historyOpen && (
                <div className={styles.overlay} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className={styles.card} style={{ width: '90%', maxHeight: '70vh', overflowY: 'auto' }}>
                        <div className={styles.menuHeader}>
                            <h3>ประวัติ</h3>
                            <button onClick={() => setHistoryOpen(false)}><X size={24} /></button>
                        </div>
                        <ul style={{ listStyle: 'none', padding: 0 }}>
                            {logs.map((log, i) => (
                                <li key={i} style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: 13 }}>
                                    <div style={{ fontWeight: 'bold', color: '#333' }}>
                                        {new Date(log.timestamp).toLocaleString('th-TH')}
                                    </div>
                                    <div style={{ color: '#666' }}>
                                        {log.status === '1' ? 'ขโมย' : log.status === '2' ? 'ชน' : log.status}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

        </div>
    );
}

export default function MapPage() {
    return (
        <Suspense fallback={<div className={styles.loadingScreen}>กำลังโหลด...</div>}>
            <MapContent />
        </Suspense>
    );
}
