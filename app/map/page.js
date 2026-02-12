"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from 'next/link';
import { GoogleMap, useJsApiLoader, Marker, Circle } from "@react-google-maps/api";
import { io } from "socket.io-client";
import toast, { Toaster } from "react-hot-toast";
import {
    Menu, X, MapPin, Crosshair, Plus, Trash2, Edit3, Check, Clock, Car, Navigation, History as HistoryIcon, Shield, ShieldAlert, AlertTriangle, Key
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

// --- HELPER FUNCTIONS ---
const getStatusLabel = (s) => {
    if (!s) return { text: 'ไม่ทราบ', color: '#9CA3AF' };
    const status = String(s).toLowerCase();

    if (status === '1' || status === 'stolen') return { text: 'ถูกโจรกรรม!', color: '#EF4444' };
    if (status === '2' || status === 'crash') return { text: 'เกิดอุบัติเหตุ!', color: '#F97316' };
    if (status === '3' || status === 'normal' || status === 'active') return { text: 'ปกติ', color: '#10B981' };
    if (status === 'offline') return { text: 'ออฟไลน์', color: '#6B7280' };

    return { text: status, color: '#6B7280' }; // Default
};

const formatThaiTime = (timestamp) => {
    if (!timestamp) return "-";
    // If timestamp comes from SQLite CURRENT_TIMESTAMP (UTC without Z), append Z
    let ts = timestamp;
    if (typeof ts === 'string' && !ts.includes('Z') && !ts.includes('+')) {
        ts += 'Z';
    }
    return new Date(ts).toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
};

const playAlertSound = () => {
    try {
        const audio = new Audio('/alert.mp3'); // Need to ensure file exists or use Base64
        audio.play().catch(e => console.error("Audio play failed", e));
    } catch (e) { console.error(e); }
};
function MapContent() {
    const router = useRouter();

    // User & Vehicles state
    const [userPhone, setUserPhone] = useState(null);
    const [allVehicles, setAllVehicles] = useState([]);
    const [selectedVehicleIndex, setSelectedVehicleIndex] = useState(0);
    const [deviceId, setDeviceId] = useState(null);

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

    // Explicit Pan Trigger
    const [shouldPan, setShouldPan] = useState(false);

    // Force Pan when shouldPan is true and carPosition is available
    useEffect(() => {
        if (shouldPan && carPosition && map) {
            map.panTo(carPosition);
            map.setZoom(16);
            setShouldPan(false);
        }
    }, [shouldPan, carPosition, map]);

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

    // Add Car Modal
    const [addCarModalOpen, setAddCarModalOpen] = useState(false);
    const [addCarForm, setAddCarForm] = useState({ code: "", plate: "" });
    const [addCarLoading, setAddCarLoading] = useState(false);

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

    // Initial Load: Fetch All User Vehicles
    useEffect(() => {
        const phone = localStorage.getItem("user_phone");
        if (!phone) {
            router.replace("/");
            return;
        }
        setUserPhone(phone);

        // Fetch all vehicles for this user
        fetch(`${SERVER_URL}/api/user/vehicles?token=${phone}`)
            .then(res => res.json())
            .then(vehicles => {
                if (vehicles && vehicles.length > 0) {
                    setAllVehicles(vehicles);
                    setDeviceId(vehicles[0].device_id);

                    // Load saved data for first vehicle
                    const firstDeviceId = vehicles[0].device_id;
                    const savedGeofences = localStorage.getItem(`geofences_${firstDeviceId}`);
                    if (savedGeofences) setGeofences(JSON.parse(savedGeofences));
                    const savedCarName = localStorage.getItem(`carName_${firstDeviceId}`);
                    if (savedCarName) setCarName(savedCarName);
                    else setCarName(vehicles[0].plate_number || firstDeviceId);
                    setGeofencesLoaded(true);
                } else {
                    // No vehicles, redirect to registration
                    router.replace("/?mode=register");
                }
            })
            .catch(err => {
                console.error("Error fetching vehicles:", err);
                toast.error("ไม่สามารถโหลดข้อมูลรถได้");
            });
    }, []);

    // Load data when selected vehicle changes
    useEffect(() => {
        if (!deviceId || !allVehicles.length) return;

        const selectedVehicle = allVehicles[selectedVehicleIndex];
        if (selectedVehicle && selectedVehicle.device_id === deviceId) {
            const savedGeofences = localStorage.getItem(`geofences_${deviceId}`);
            if (savedGeofences) setGeofences(JSON.parse(savedGeofences));
            const savedCarName = localStorage.getItem(`carName_${deviceId}`);
            if (savedCarName) setCarName(savedCarName);
            else setCarName(selectedVehicle.plate_number || deviceId);
        }
    }, [deviceId, selectedVehicleIndex, allVehicles]);


    // LocalStorage Save
    useEffect(() => {
        if (deviceId && geofencesLoaded) {
            localStorage.setItem(`geofences_${deviceId}`, JSON.stringify(geofences));
        }
        if (deviceId && carName) {
            localStorage.setItem(`carName_${deviceId}`, carName);
        }
    }, [geofences, carName, deviceId, geofencesLoaded]);

    // Track selected device for socket
    const selectedDeviceIdRef = useRef(deviceId);
    useEffect(() => { selectedDeviceIdRef.current = deviceId; }, [deviceId]);

    // WebSocket - Persistent Query for All Vehicles
    useEffect(() => {
        if (!allVehicles.length) return;

        const socket = io(SERVER_URL, { transports: ["websocket"], reconnectionAttempts: 5 });

        socket.on("connect", () => {
            setConnected(true);
            // Join room for ALL vehicles
            allVehicles.forEach(v => socket.emit("join_device", v.device_id));
        });

        socket.on("disconnect", () => setConnected(false));

        socket.on("device_update", (data) => {
            // Update map ONLY if it's the selected device
            if (data.device_id === selectedDeviceIdRef.current) {
                const newPos = { lat: data.lat, lng: data.lng };
                setCarPosition(newPos);
                setCarStatus(data.status);

                if (data.sos_update) {
                    fetch(`${SERVER_URL}/api/device/${data.device_id}`)
                        .then(res => res.json())
                        .then(d => {
                            if (d.sos_numbers) setSosNumbers([...d.sos_numbers, "", "", ""].slice(0, 3));
                        });
                }

                // Sound Alert for Danger Status
                if (s === '1' || s === 'stolen' || s === '2' || s === 'crash') {
                    playAlertSound();
                    toast(getStatusLabel(s).text, { icon: s === 'crash' ? '💥' : '🚨', duration: 5000 });
                }

                // Update History Real-time (Prepend to top)
                const newLog = {
                    id: Date.now(), // Temp ID until refresh
                    timestamp: new Date().toISOString(),
                    status: data.status,
                    lat: data.lat,
                    lng: data.lng
                };
                setLogs(prev => [newLog, ...prev]);

                setLastPosition(prev => {
                    if (prev && getDistance(prev, newPos) > 20) {
                        setParkingStartTime(new Date());
                        return newPos;
                    } else if (!prev) {
                        setParkingStartTime(new Date());
                        return newPos;
                    }
                    return prev;
                });
            }
        });

        return () => socket.disconnect();
    }, [allVehicles]); // Re-connect only if vehicle list changes

    // Fetch Initial Data on Selection Change
    useEffect(() => {
        if (!deviceId) return;

        // Fetch History/Position
        fetch(`${SERVER_URL}/api/history/${deviceId}?limit=1`)
            .then(res => res.json())
            .then(data => {
                if (data.length > 0) {
                    const pos = { lat: data[0].lat, lng: data[0].lng };
                    setCarPosition(pos);
                    setLastPosition(pos);
                    // Use last update time from DB, fallback to now if missing
                    const lastUpdate = data[0].timestamp || data[0].last_update;
                    setParkingStartTime(lastUpdate ? new Date(lastUpdate) : new Date());

                    // Trigger Pan via Effect
                    setShouldPan(true);
                } else {
                    toast("ไม่พบพิกัดล่าสุดของรถคันนี้", { icon: "can't find" });
                }
            })
            .catch(err => console.error(err));

        fetchSosNumbers();
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

    // Status flags (must be declared before useEffect that uses them)
    const isStolen = (String(carStatus).toLowerCase() === "1" || String(carStatus).toLowerCase().includes("stolen"));
    const isCrash = (String(carStatus).toLowerCase() === "2" || String(carStatus).toLowerCase().includes("crash"));

    // Auto-Safe: If Stolen & No Data for 15s -> Normal
    // Auto-Safe: If Stolen & No Data for 15s -> Normal
    useEffect(() => {
        if (!isStolen) return;

        const timer = setTimeout(() => {
            setCarStatus('NORMAL');
            toast.success("🚗 รถปลอดภัยแล้ว (ไม่พบการเคลื่อนไหว)", { icon: '✅', duration: 4000 });

            fetch(`${SERVER_URL}/api/device/${deviceId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'NORMAL' })
            }).catch(console.error);
        }, 15000);

        return () => clearTimeout(timer);
    }, [carStatus, carPosition, deviceId, isStolen]); // carPosition updates on every packet




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

    // Add Car Handler
    const handleAddCar = async () => {
        if (!addCarForm.code || !addCarForm.plate) {
            return toast.error("กรุณากรอกข้อมูลให้ครบ");
        }

        const savedPhone = localStorage.getItem("user_phone");
        if (!savedPhone) {
            toast.error("กรุณาเข้าสู่ระบบก่อน");
            return;
        }

        setAddCarLoading(true);
        try {
            const res = await fetch(`${SERVER_URL}/api/user/add-car`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone_number: savedPhone,
                    code: addCarForm.code.toUpperCase(),
                    plate_number: addCarForm.plate
                })
            });
            const data = await res.json();

            if (data.success) {
                toast.success("เพิ่มรถสำเร็จ!");
                setAddCarModalOpen(false);
                setAddCarForm({ code: "", plate: "" });
                // Reload page to refresh carousel
                setTimeout(() => window.location.reload(), 800);
            } else {
                toast.error(data.error || "เพิ่มรถไม่สำเร็จ");
            }
        } catch (err) {
            toast.error("เกิดข้อผิดพลาด");
        } finally {
            setAddCarLoading(false);
        }
    };

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

    const focusUser = () => {
        if (map && userPosition) {
            map.panTo(userPosition);
            map.setZoom(17);
            toast.success("ระบุตำแหน่งของคุณ 📍");
        } else if (!userPosition) {
            toast.error("กำลังค้นหาตำแหน่ง GPS...");
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

    const statusInfo = getStatusLabel(carStatus);
    const statusLabel = statusInfo.text;
    const statusColor = statusInfo.color;


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
            <div className={styles.focusBtn} onClick={focusUser}>
                <Crosshair size={24} color="#333" />
            </div>

            {/* --- BOTTOM CAROUSEL --- */}
            <div className={styles.bottomContainer}>
                <div className={styles.carousel} ref={el => {
                    if (el && allVehicles.length > 0 && !el.hasScrolled) {
                        el.scrollLeft = 0;
                        el.hasScrolled = true;
                    }
                }}>

                    {/* VEHICLE CARDS - All User Vehicles */}
                    {Array.isArray(allVehicles) && allVehicles.map((vehicle, index) => {
                        if (!vehicle) return null;
                        const isSelected = index === selectedVehicleIndex;

                        return (
                            <div
                                key={vehicle.device_id}
                                className={styles.card}
                                onClick={() => {
                                    if (isSelected && map && carPosition) {
                                        // Pan to current vehicle if already selected
                                        map.panTo(carPosition);
                                        map.setZoom(16);
                                    } else {
                                        setSelectedVehicleIndex(index);
                                        setDeviceId(vehicle.device_id);
                                    }
                                }}
                                style={{
                                    border: isSelected ? '2px solid #4285F4' : '1px solid #e0e0e0',
                                    opacity: isSelected ? 1 : 0.7,
                                    cursor: 'pointer',
                                    minWidth: '300px',
                                    flexShrink: 0
                                }}
                            >
                                <div className={styles.cardHeader}>
                                    <div className={styles.statusTag} style={{
                                        background: isSelected ? (isStolen ? '#fee2e2' : isCrash ? '#ffedd5' : '#e0f2f1') : '#f5f5f5',
                                        color: isSelected ? (isStolen ? '#ef4444' : isCrash ? '#f97316' : '#0d9488') : '#666'
                                    }}>
                                        {isSelected ? (
                                            isStolen ? <ShieldAlert size={14} color={statusColor} /> :
                                                isCrash ? <AlertTriangle size={14} color={statusColor} /> :
                                                    <Shield size={14} color={statusColor} />
                                        ) : <Car size={14} />}
                                        {isSelected ? statusLabel : (vehicle.plate_number || vehicle.device_id)}
                                    </div>
                                    {isSelected && (
                                        <div className={styles.lastUpdate}>
                                            <Clock size={12} />
                                            {parkingStartTime ? new Date(parkingStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--"}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    {isSelected && isEditingName ? (
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
                                        <div className={styles.plateNumber} onClick={(e) => {
                                            if (isSelected) {
                                                e.stopPropagation();
                                                setIsEditingName(true);
                                            }
                                        }}>
                                            {isSelected ? (carName || "ตั้งชื่อรถ") : (vehicle.plate_number || vehicle.device_id)}
                                            {isSelected && <Edit3 size={16} color="#ccc" style={{ verticalAlign: 'middle', marginLeft: '5px' }} />}
                                        </div>
                                    )}
                                    {isSelected && (
                                        <div className={styles.carModel}>
                                            {address ? (address.length > 50 ? address.substring(0, 50) + "..." : address) : "กำลังระบุที่อยู่..."}
                                        </div>
                                    )}
                                </div>

                                {isSelected && (
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                                        <div className={styles.distanceBadge} style={{ background: '#f5f5f5', color: '#666' }}>
                                            <Clock size={14} /> จอด: {parkingDisplay}
                                        </div>
                                        <div className={styles.distanceBadge}>
                                            <Navigation size={14} fill="currentColor" />
                                            {distanceToCar ? (distanceToCar < 1000 ? `${Math.round(distanceToCar)} ม.` : `${(distanceToCar / 1000).toFixed(1)} กม.`) : "กำลังระบุ..."}
                                        </div>
                                    </div>
                                )}

                                {isSelected && (
                                    <div className={styles.cardActions}>
                                        <button className={styles.btnSecondary} onClick={(e) => { e.stopPropagation(); fetchHistoryLogs(); }}>
                                            <HistoryIcon size={20} /> ประวัติ
                                        </button>
                                        <button className={styles.btnPrimary} onClick={(e) => { e.stopPropagation(); navigateToCar(); }}>
                                            <Navigation size={20} fill="white" /> นำทาง
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* ADD NEW CAR CARD */}
                    <div className={styles.addCard} onClick={() => setAddCarModalOpen(true)} style={{ cursor: 'pointer', minWidth: '120px', flexShrink: 0 }}>
                        <div className={styles.addIconCircle}>
                            <Plus size={32} />
                        </div>
                        <div style={{ fontWeight: 600, color: '#666', marginTop: '8px' }}>เพิ่มรถ</div>
                    </div>

                </div>

                {/* Dots - Dynamic based on number of vehicles */}
                <div className={styles.pagination}>
                    {allVehicles.map((_, index) => (
                        <div
                            key={index}
                            className={`${styles.dot} ${index === selectedVehicleIndex ? styles.active : ""}`}
                            onClick={() => {
                                setSelectedVehicleIndex(index);
                                setDeviceId(allVehicles[index].device_id);
                            }}
                            style={{ cursor: 'pointer' }}
                        />
                    ))}
                    {/* Dot for Add New Car card */}
                    <div className={styles.dot} style={{ opacity: 0.3 }} />
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
                        <div className={`${styles.menuItem} ${styles.logout}`} onClick={() => {
                            localStorage.removeItem('user_phone');
                            window.location.href = '/';
                        }}>
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
                            {[...logs].sort((a, b) => {
                                const tA = (a.timestamp || a.last_update || '').replace(' ', 'T');
                                const tB = (b.timestamp || b.last_update || '').replace(' ', 'T');
                                return new Date(tB) - new Date(tA);
                            }).map((log, i) => (
                                <li key={i} style={{ padding: '12px', borderBottom: '1px solid #eee', fontSize: 13 }}>
                                    <div style={{ fontWeight: 'bold', color: '#333' }}>
                                        {formatThaiTime(log.timestamp || log.last_update)}
                                    </div>
                                    <div style={{ color: getStatusLabel(log.status).color }}>
                                        {getStatusLabel(log.status).text}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* ADD CAR MODAL */}
            {addCarModalOpen && (
                <>
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0, 0, 0, 0.5)',
                            zIndex: 150
                        }}
                        onClick={() => setAddCarModalOpen(false)}
                    />
                    <div
                        style={{
                            position: 'fixed',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 151,
                            width: '90%',
                            maxWidth: '450px',
                            background: 'white',
                            borderRadius: '24px',
                            padding: '32px',
                            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>เพิ่มรถใหม่ 🚗</h2>
                            <button onClick={() => setAddCarModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <p style={{ color: '#666', marginBottom: '24px' }}>กรอกรหัสจากอุปกรณ์ใหม่ของคุณ</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ background: 'white', padding: '16px', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ color: '#F97316' }}><Key size={20} /></div>
                                <input
                                    style={{ flex: 1, outline: 'none', border: 'none', fontFamily: 'monospace', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '18px' }}
                                    placeholder="Credential Code"
                                    value={addCarForm.code}
                                    onChange={(e) => setAddCarForm({ ...addCarForm, code: e.target.value })}
                                />
                            </div>

                            <div style={{ background: 'white', padding: '16px', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ color: '#10B981' }}><Car size={20} /></div>
                                <input
                                    style={{ flex: 1, outline: 'none', border: 'none' }}
                                    placeholder="ทะเบียนรถ (Ex. กข-1234)"
                                    value={addCarForm.plate}
                                    onChange={(e) => setAddCarForm({ ...addCarForm, plate: e.target.value })}
                                />
                            </div>

                            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '12px', padding: '12px', fontSize: '14px', color: '#1E40AF' }}>
                                💡 ชื่อผู้ขับขี่จะใช้ข้อมูลเดิมจากบัญชีของคุณ
                            </div>
                        </div>

                        <button
                            onClick={handleAddCar}
                            disabled={addCarLoading}
                            style={{
                                width: '100%',
                                background: addCarLoading ? '#9CA3AF' : '#3B82F6',
                                color: 'white',
                                padding: '16px',
                                borderRadius: '16px',
                                fontWeight: 'bold',
                                fontSize: '18px',
                                border: 'none',
                                cursor: addCarLoading ? 'not-allowed' : 'pointer',
                                marginTop: '24px'
                            }}
                        >
                            {addCarLoading ? "กำลังเพิ่ม..." : "เพิ่มรถ"}
                        </button>
                    </div>
                </>
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
