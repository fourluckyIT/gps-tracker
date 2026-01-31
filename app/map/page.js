"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from 'next/link';
import { GoogleMap, useJsApiLoader, Marker, Circle } from "@react-google-maps/api";
import { io } from "socket.io-client";
import toast, { Toaster } from "react-hot-toast";
import {
    Menu, X, MapPin, Crosshair, Plus, Trash2, Edit3, Check, Clock, Car
} from "lucide-react";

// Config
// Config
const SERVER_URL = typeof window !== 'undefined'
    ? window.location.origin
    : "http://143.14.200.117";
const GOOGLE_MAPS_API_KEY = "AIzaSyACWF7KC20kJzTuxl-AicAuANdZaP7U74Q";

const defaultCenter = { lat: 13.7563, lng: 100.5018 }; // Bangkok

// Geofence colors
const GEOFENCE_COLORS = ["#FF6B6B", "#4ECDC4", "#FFE66D"];
const GEOFENCE_NAMES = ["จุดที่ 1", "จุดที่ 2", "จุดที่ 3"];

// Calculate distance between two points (Haversine formula)
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
    const [carStatus, setCarStatus] = useState(""); // Add Status State
    const [connected, setConnected] = useState(false);

    // Car name & parking time
    const [carName, setCarName] = useState("");
    const [isEditingName, setIsEditingName] = useState(false);
    const [parkingStartTime, setParkingStartTime] = useState(null);
    const [lastPosition, setLastPosition] = useState(null);

    // UI state
    const [menuOpen, setMenuOpen] = useState(false);

    // Geofence state (3 slots, can be null)
    const [geofences, setGeofences] = useState([null, null, null]);
    const [geofencesLoaded, setGeofencesLoaded] = useState(false);

    // Popup for adding/editing geofence
    const [popupOpen, setPopupOpen] = useState(false);
    const [popupIndex, setPopupIndex] = useState(null);
    const [popupPosition, setPopupPosition] = useState(defaultCenter);
    const [popupRadius, setPopupRadius] = useState(100);
    const [popupMap, setPopupMap] = useState(null);





    // SOS State
    const [sosNumbers, setSosNumbers] = useState(["", "", ""]);
    const [sosLoading, setSosLoading] = useState(false);

    // Address state (Moved to top)
    const [address, setAddress] = useState("กำลังค้นหาที่อยู่...");

    // Load Google Maps (Force Thai)
    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
        language: "th", // Force Thai language
    });

    // Reverse Geocoding Effect (Safe to be here)
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

    // Load data from localStorage on mount
    useEffect(() => {
        if (deviceId) {
            const savedGeofences = localStorage.getItem(`geofences_${deviceId}`);
            if (savedGeofences) {
                setGeofences(JSON.parse(savedGeofences));
            }
            const savedCarName = localStorage.getItem(`carName_${deviceId}`);
            if (savedCarName) {
                setCarName(savedCarName);
            } else {
                setCarName(deviceId);
            }
            setGeofencesLoaded(true);
        }
    }, [deviceId]);

    // Save geofences to localStorage
    useEffect(() => {
        if (deviceId && geofencesLoaded) {
            localStorage.setItem(`geofences_${deviceId}`, JSON.stringify(geofences));
        }
    }, [geofences, deviceId, geofencesLoaded]);

    // Save car name to localStorage
    useEffect(() => {
        if (deviceId && carName) {
            localStorage.setItem(`carName_${deviceId}`, carName);
        }
    }, [carName, deviceId]);

    // Connect to WebSocket
    useEffect(() => {
        if (!deviceId) return;

        const socket = io(SERVER_URL, {
            transports: ["websocket"],
            reconnectionAttempts: 5,
        });

        socket.on("connect", () => {
            setConnected(true);
        });

        socket.on("disconnect", () => {
            setConnected(false);
        });

        socket.on("device_update", (data) => {
            if (data.device_id === deviceId) {
                const newPos = { lat: data.lat, lng: data.lng };
                setCarPosition(newPos);
                setCarStatus(data.status); // Update Status

                // Refetch SOS if updated
                if (data.sos_update) {
                    fetchSosNumbers();
                }

                // Check if car moved more than 20 meters
                if (lastPosition) {
                    const distance = getDistance(lastPosition, newPos);
                    if (distance > 20) {
                        // Car moved - reset parking time
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
            .then((res) => res.json())
            .then((data) => {
                if (data.length > 0) {
                    const pos = { lat: data[0].lat, lng: data[0].lng };
                    setCarPosition(pos);
                    setLastPosition(pos);
                    setParkingStartTime(new Date(data[0].timestamp));
                }
            })
            .catch((err) => console.error("Initial fetch failed:", err));

        // Fetch SOS Numbers
        fetchSosNumbers();

        return () => socket.disconnect();
    }, [deviceId]);

    const fetchSosNumbers = useCallback(() => {
        if (!deviceId) return;
        fetch(`${SERVER_URL}/api/device/${deviceId}`)
            .then(res => res.json())
            .then(data => {
                if (data.sos_numbers && Array.isArray(data.sos_numbers)) {
                    // Fill up to 3 slots
                    const filled = [...data.sos_numbers, "", "", ""].slice(0, 3);
                    setSosNumbers(filled);
                }
            })
            .catch(err => console.error("SOS Fetch Error:", err));
    }, [deviceId]);

    const saveSosNumbers = () => {
        setSosLoading(true);
        // Filter out empty strings
        const cleanNumbers = sosNumbers.filter(n => n.trim() !== "");

        fetch(`${SERVER_URL}/api/device/${deviceId}/sos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ numbers: cleanNumbers })
        })
            .then(res => res.json())
            .then(data => {
                setSosLoading(false);
                if (data.success) {
                    toast.success("บันทึกเบอร์ฉุกเฉินแล้ว");
                } else {
                    toast.error("บันทึกไม่สำเร็จ");
                }
            })
            .catch(err => {
                setSosLoading(false);
                toast.error("เกิดข้อผิดพลาด");
            });
    };

    // Auto-center map on car position
    useEffect(() => {
        if (carPosition && map) {
            map.panTo(carPosition);
        }
    }, [carPosition, map]);

    // Check if car is inside any geofence
    useEffect(() => {
        if (!carPosition) {
            setCarInGeofence(null);
            return;
        }

        let foundGeofence = null;
        for (let i = 0; i < geofences.length; i++) {
            const gf = geofences[i];
            if (gf) {
                const distance = getDistance(carPosition, { lat: gf.lat, lng: gf.lng });
                if (distance <= gf.radius) {
                    foundGeofence = { ...gf, index: i };
                    break;
                }
            }
        }
        setCarInGeofence(foundGeofence);
    }, [carPosition, geofences]);

    // Notify when entering/exiting geofence
    useEffect(() => {
        const prevId = prevCarInGeofence?.index;
        const currId = carInGeofence?.index;

        if (prevId !== currId) {
            if (carInGeofence) {
                toast.success(`🚗 รถมาถึง "${carInGeofence.name}" แล้ว`, { duration: 5000 });
            } else if (prevCarInGeofence) {
                toast(`🚗 รถออกจาก "${prevCarInGeofence.name}" แล้ว`, { duration: 5000, icon: "🚀" });
            }
            setPrevCarInGeofence(carInGeofence);
        }
    }, [carInGeofence]);

    // Alert Logic
    const [alertDismissed, setAlertDismissed] = useState(false);

    // Reset dismiss when status changes to something critical (or distinct critical)
    useEffect(() => {
        if (!carStatus) return;
        if (carStatus.includes("STOLEN") || carStatus.includes("CRASH")) {
            // Only show if not already showing for this exact instance? 
            // Better: If status changes type, reset.
            // For now, simple logic: if status string changes, we might want to re-alert.
            // But usually status is persistent. Ideally we track "last alert time" or similar.
            // Here, we'll reset dismiss if the status changes from normal to critical.
            setAlertDismissed(false);
        }
    }, [carStatus]);

    const isStolen = (carStatus || "").includes("STOLEN");
    const isCrash = (carStatus || "").includes("CRASH");
    const showAlert = (isStolen || isCrash) && !alertDismissed;

    // Sound Alert Effect (Stolen/Crash)
    useEffect(() => {
        let audioCtx;
        let oscillator;
        let gainNode;
        let interval;

        if (isStolen || isCrash) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                oscillator = audioCtx.createOscillator();
                gainNode = audioCtx.createGain();

                oscillator.type = 'sawtooth';
                oscillator.frequency.value = isStolen ? 800 : 400; // Higher pitch for stolen
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);

                oscillator.start();

                // Siren effect
                let up = true;
                interval = setInterval(() => {
                    if (up) oscillator.frequency.setValueAtTime(isStolen ? 1200 : 600, audioCtx.currentTime);
                    else oscillator.frequency.setValueAtTime(isStolen ? 800 : 400, audioCtx.currentTime);
                    up = !up;
                }, 600);
            } catch (e) {
                console.error("Audio Playback Error:", e);
            }
        }

        return () => {
            if (interval) clearInterval(interval);
            if (oscillator) {
                try { oscillator.stop(); } catch (e) { }
            }
            if (audioCtx) {
                try { audioCtx.close(); } catch (e) { }
            }
        };
    }, [isStolen, isCrash, carStatus]);



    // Format parking duration
    const formatParkingDuration = () => {
        if (!parkingStartTime) return "กำลังโหลด...";
        const now = new Date();
        const diff = Math.floor((now - new Date(parkingStartTime)) / 1000);

        if (diff < 60) return `${diff} วินาที`;
        if (diff < 3600) return `${Math.floor(diff / 60)} นาที`;
        const hours = Math.floor(diff / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        return `${hours} ชม. ${mins} นาที`;
    };

    // Update parking time display (client-only to avoid hydration mismatch)
    const [parkingDisplay, setParkingDisplay] = useState("--");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        setParkingDisplay(formatParkingDuration());
        const interval = setInterval(() => {
            setParkingDisplay(formatParkingDuration());
        }, 1000);
        return () => clearInterval(interval);
    }, [parkingStartTime, mounted]);

    // Open popup to add/edit geofence
    const openGeofencePopup = (index) => {
        const existing = geofences[index];
        if (existing) {
            setPopupPosition({ lat: existing.lat, lng: existing.lng });
            setPopupRadius(existing.radius);
        } else {
            setPopupPosition(carPosition || defaultCenter);
            setPopupRadius(100);
        }
        setPopupIndex(index);
        setPopupOpen(true);
        setMenuOpen(false);
    };

    // Save geofence from popup
    // Save geofence from popup (with Address Decoding)
    const saveGeofence = () => {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: popupPosition }, (results, status) => {
            let addr = "";
            if (status === "OK" && results[0]) {
                addr = results[0].formatted_address;
            }

            const newGeofences = [...geofences];
            newGeofences[popupIndex] = {
                name: geofences[popupIndex]?.name || GEOFENCE_NAMES[popupIndex],
                lat: popupPosition.lat,
                lng: popupPosition.lng,
                radius: popupRadius,
                address: addr
            };
            setGeofences(newGeofences);
            setPopupOpen(false);
            toast.success(`บันทึก ${GEOFENCE_NAMES[popupIndex]} แล้ว`);
        });
    };

    // Delete geofence
    const deleteGeofence = (index) => {
        const newGeofences = [...geofences];
        newGeofences[index] = null;
        setGeofences(newGeofences);
        toast.success(`ลบ ${GEOFENCE_NAMES[index]} แล้ว`);
    };

    // Update geofence name
    const updateGeofenceName = (index, name) => {
        const newGeofences = [...geofences];
        if (newGeofences[index]) {
            newGeofences[index] = { ...newGeofences[index], name };
            setGeofences(newGeofences);
        }
    };

    const onMainMapLoad = useCallback((map) => {
        setMap(map);
    }, []);

    const onPopupMapLoad = useCallback((map) => {
        setPopupMap(map);
    }, []);

    if (!deviceId) {
        return (
            <div className="error-screen">
                <h2>❌ ไม่พบ Device ID</h2>
                <p>กรุณาระบุ ?id=DEVICE_ID ใน URL</p>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="error-screen">
                <h2>❌ โหลด Google Maps ไม่สำเร็จ</h2>
                <p>กรุณาตรวจสอบ API Key</p>
            </div>
        );
    }

    if (!isLoaded) {
        return <div className="loading-screen">กำลังโหลดแผนที่...</div>;
    }

    return (
        <div className="app-container">
            <Toaster position="top-center" />

            {/* Header */}
            <div className="header">
                <button className="menu-btn" onClick={() => setMenuOpen(true)}>
                    <Menu size={24} />
                </button>
                <div className="header-title">
                    <span className={`status-dot ${connected ? "online" : ""}`} />
                    GPS Tracker
                </div>
            </div>

            {/* Main Map (Expanded to fill more space, pushing info down) */}
            <div className="map-section" style={{ flex: 1, marginBottom: '0' }}>
                <GoogleMap
                    mapContainerStyle={{ width: "100%", height: "100%" }}
                    center={carPosition || defaultCenter}
                    zoom={16}
                    options={{ disableDefaultUI: true, zoomControl: false }}
                    onLoad={onMainMapLoad}
                >
                    {/* Car Marker & Geofences (Same as before) -- Keeping existing children */}
                    {carPosition && (
                        <Marker
                            position={carPosition}
                            icon={{
                                url: "data:image/svg+xml," + encodeURIComponent(`
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
                                        <circle cx="20" cy="20" r="18" fill="${(carStatus || "").includes("STOLEN") ? "#EF4444" :
                                        (carStatus || "").includes("CRASH") ? "#F97316" :
                                            "#3B82F6"
                                    }" stroke="white" stroke-width="3"/>
                                        <text x="20" y="26" text-anchor="middle" fill="white" font-size="16">🚗</text>
                                    </svg>
                                `),
                                scaledSize: { width: 40, height: 40 },
                                anchor: { x: 20, y: 20 },
                            }}
                        />
                    )}
                    {geofences.map((gf, index) =>
                        gf ? (
                            <Circle
                                key={index}
                                center={{ lat: gf.lat, lng: gf.lng }}
                                radius={gf.radius}
                                options={{
                                    fillColor: GEOFENCE_COLORS[index],
                                    fillOpacity: 0.2,
                                    strokeColor: GEOFENCE_COLORS[index],
                                    strokeOpacity: 0.8,
                                    strokeWeight: 2,
                                }}
                            />
                        ) : null
                    )}
                </GoogleMap>

                {/* FAB */}
                <button
                    className="fab-mylocation"
                    onClick={() => {
                        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
                            toast.error("⚠️ ต้องใช้ HTTPS (แม่กุญแจ) ถึงจะระบุตำแหน่งได้ครับ");
                            return;
                        }

                        if (navigator.geolocation) {
                            toast.loading("กำลังระบุตำแหน่ง...", { id: 'geo_load' });
                            navigator.geolocation.getCurrentPosition(
                                (position) => {
                                    toast.dismiss('geo_load');
                                    const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
                                    map?.panTo(pos);
                                    map?.setZoom(17);
                                    toast.success("ไปยังตำแหน่งของคุณแล้ว");
                                },
                                (err) => {
                                    toast.dismiss('geo_load');
                                    console.error(err);
                                    toast.error("ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง หรือ GPS ปิดอยู่");
                                }
                            );
                        } else {
                            toast.error("Browser นี้ไม่รองรับการระบุตำแหน่ง");
                        }
                    }}
                >
                    <Crosshair size={20} />
                </button>
            </div>

            {/* New Info Section (Replacing old layout) */}
            <div className="info-section" style={{ background: '#111', borderTop: '1px solid #333' }}>

                {/* Car Name Row */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <Car size={20} color="#4ECDC4" style={{ marginRight: '8px' }} />
                    {isEditingName ? (
                        <input
                            type="text"
                            value={carName}
                            onChange={(e) => setCarName(e.target.value)}
                            onBlur={() => setIsEditingName(false)}
                            onKeyDown={(e) => e.key === "Enter" && setIsEditingName(false)}
                            autoFocus
                            className="name-input"
                        />
                    ) : (
                        <div className="car-name" onClick={() => setIsEditingName(true)} style={{ fontSize: '1.1rem' }}>
                            {carName || "ตั้งชื่อรถ"}
                            <Edit3 size={14} style={{ marginLeft: '5px', opacity: 0.5 }} />
                        </div>
                    )}
                </div>

                {/* Status Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', background: '#222', padding: '12px', borderRadius: '12px' }}>

                    {/* Time */}
                    <div style={{ display: 'flex', alignItems: 'center', color: '#ccc', fontSize: '0.9rem' }}>
                        <Clock size={16} style={{ marginRight: '8px', color: '#888' }} />
                        <span>ล่าสุด: {parkingStartTime ? new Date(parkingStartTime).toLocaleTimeString() : "-"}</span>
                    </div>

                    {/* Address (Replaces Coords) */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', color: '#ccc', fontSize: '0.9rem' }}>
                        <MapPin size={16} style={{ marginRight: '8px', color: '#888', marginTop: '3px' }} />
                        <span style={{ lineHeight: '1.4' }}>{address}</span>
                    </div>

                    {/* Parking Duration */}
                    <div style={{ display: 'flex', alignItems: 'center', color: '#FFE66D', fontWeight: 'bold', fontSize: '1rem', marginTop: '4px' }}>
                        <Crosshair size={16} style={{ marginRight: '8px' }} />
                        <span>จอดนาน: {parkingDisplay}</span>
                    </div>

                    {/* Focus Button */}
                    <button
                        onClick={() => {
                            if (carPosition && map) {
                                map.panTo(carPosition);
                                map.setZoom(18);
                                toast.success("Focus 🚗");
                            }
                        }}
                        style={{
                            marginTop: '8px',
                            width: '100%',
                            padding: '10px',
                            background: '#4ECDC4',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#000',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px'
                        }}
                    >
                        <Crosshair size={18} /> โฟกัสตำแหน่งรถ
                    </button>
                </div>
            </div>

            {/* Side Menu */}
            <div className={`side-menu ${menuOpen ? "open" : ""}`}>
                <div className="menu-header">
                    <h2>ตั้งค่า</h2>
                    <button onClick={() => setMenuOpen(false)}>
                        <X size={24} />
                    </button>
                </div>

                <div className="menu-section">
                    <h3><Car size={18} /> สถานะปัจจุบัน</h3>
                    <div className="status-card" style={{ background: '#222', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
                        <p style={{ margin: '5px 0', fontSize: '0.9rem', color: '#ccc' }}>
                            <Clock size={14} style={{ display: 'inline', marginRight: '5px' }} />
                            ล่าสุด: {parkingStartTime ? new Date(parkingStartTime).toLocaleTimeString() : "-"}
                        </p>
                        <p style={{ margin: '5px 0', fontSize: '0.9rem', color: '#ccc' }}>
                            <MapPin size={14} style={{ display: 'inline', marginRight: '5px' }} />
                            พิกัด: {carPosition ? `${carPosition.lat.toFixed(5)}, ${carPosition.lng.toFixed(5)}` : "-"}
                        </p>
                        <p style={{ margin: '5px 0', fontSize: '0.9rem', color: '#FFE66D', fontWeight: 'bold' }}>
                            <Crosshair size={14} style={{ display: 'inline', marginRight: '5px' }} />
                            จอดนาน: {parkingDisplay}
                        </p>

                        <button
                            onClick={() => {
                                if (carPosition && map) {
                                    map.panTo(carPosition);
                                    map.setZoom(18);
                                    setMenuOpen(false);
                                    toast.success("Focus ไปที่รถแล้ว 🚗");
                                }
                            }}
                            style={{
                                marginTop: '10px',
                                width: '100%',
                                padding: '8px',
                                background: '#4ECDC4',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#000',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                            }}
                        >
                            <Crosshair size={16} style={{ display: 'inline', marginRight: '5px', verticalAlign: 'text-bottom' }} />
                            โฟกัสตำแหน่งรถ
                        </button>
                    </div>

                    {/* History Link */}
                    <h3><Clock size={18} /> ประวัติย้อนหลัง</h3>
                    <div className="status-card" style={{ background: '#222', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
                        <Link href={`/device?id=${deviceId || 'unknown'}`} style={{ textDecoration: 'none' }}>
                            <button
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#333',
                                    border: '1px solid #444',
                                    borderRadius: '4px',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px'
                                }}
                            >
                                📜 ดูประวัติการแจ้งเตือน
                            </button>
                        </Link>
                    </div>



                    {/* SOS Settings */}
                    <h3><div style={{ display: 'flex', alignItems: 'center' }}>🚨 เบอร์ฉุกเฉิน (SOS)</div></h3>
                    <div className="status-card" style={{ background: '#222', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                        <p className="menu-hint" style={{ marginBottom: '10px' }}>ระบุเบอร์โทรศัพท์สูงสุด 3 เบอร์ สำหรับปุ่มโทรฉุกเฉิน</p>
                        {sosNumbers.map((num, idx) => (
                            <div key={idx} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
                                <span style={{ color: '#666', marginRight: '8px', width: '20px' }}>{idx + 1}.</span>
                                <input
                                    type="tel"
                                    placeholder="ใส่เบอร์โทร..."
                                    value={num}
                                    onChange={(e) => {
                                        const newSos = [...sosNumbers];
                                        newSos[idx] = e.target.value;
                                        setSosNumbers(newSos);
                                    }}
                                    style={{
                                        flex: 1,
                                        padding: '8px',
                                        background: '#333',
                                        border: '1px solid #444',
                                        color: 'white',
                                        borderRadius: '4px'
                                    }}
                                />
                            </div>
                        ))}
                        <button
                            onClick={saveSosNumbers}
                            disabled={sosLoading}
                            style={{
                                width: '100%',
                                marginTop: '10px',
                                padding: '10px',
                                background: sosLoading ? '#555' : '#FF6B6B',
                                border: 'none',
                                borderRadius: '4px',
                                color: 'white',
                                fontWeight: 'bold',
                                cursor: sosLoading ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {sosLoading ? "กำลังบันทึก..." : "💾 บันทึกเบอร์ฉุกเฉิน"}
                        </button>
                    </div>

                    <h3><MapPin size={18} /> ตำแหน่งจอด (3 จุด)</h3>
                    <p className="menu-hint">กดเพื่อเพิ่ม/แก้ไข ปล่อยว่างได้</p>

                    {[0, 1, 2].map((index) => {
                        const gf = geofences[index];
                        return (
                            <div key={index} className="geofence-slot">
                                <div
                                    className="slot-color"
                                    style={{ background: GEOFENCE_COLORS[index] }}
                                />
                                <div className="slot-info">
                                    {gf ? (
                                        <>
                                            <input
                                                type="text"
                                                value={gf.name}
                                                onChange={(e) => updateGeofenceName(index, e.target.value)}
                                                className="slot-name-input"
                                            />
                                            {gf.address && (
                                                <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '2px', lineHeight: '1.2' }}>
                                                    {gf.address}
                                                </div>
                                            )}
                                            <span className="slot-radius">รัศมี {gf.radius}m</span>
                                        </>
                                    ) : (
                                        <span className="slot-empty">{GEOFENCE_NAMES[index]} (ว่าง)</span>
                                    )}
                                </div>
                                <div className="slot-actions">
                                    <button
                                        className="slot-btn edit"
                                        onClick={() => openGeofencePopup(index)}
                                    >
                                        {gf ? <Edit3 size={16} /> : <Plus size={16} />}
                                    </button>
                                    {gf && (
                                        <button
                                            className="slot-btn delete"
                                            onClick={() => deleteGeofence(index)}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div >

            {/* Menu Overlay */}
            {menuOpen && <div className="overlay" onClick={() => setMenuOpen(false)} />}

            {/* CRITICAL ALERT POPUP */}
            {
                showAlert && (
                    <div className="alert-overlay">
                        <div className="alert-box">
                            <div className="alert-icon">
                                {isStolen ? "🚨" : "💥"}
                            </div>
                            <h2>{isStolen ? "รถถูกขโมย!" : "เกิดอุบัติเหตุ!"}</h2>
                            <p>{isStolen ? "มีการพยายามสตาร์ทรถหรือเคลื่อนย้ายโดยไม่ได้รับอนุญาต" : "ตรวจพบการชนหรือการกระแทกรุนแรง"}</p>

                            <div className="alert-actions">
                                <button className="btn-dismiss" onClick={() => setAlertDismissed(true)}>
                                    รับทราบ (ปิดแจ้งเตือน)
                                </button>
                                <button className="btn-dismiss" onClick={() => setAlertDismissed(true)}>
                                    รับทราบ (ปิดแจ้งเตือน)
                                </button>
                                <a href={`tel:${sosNumbers.find(n => n.trim()) || "191"}`} className="btn-call">
                                    📞 โทรฉุกเฉิน ({sosNumbers.find(n => n.trim()) || "191"})
                                </a>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Geofence Popup */}
            {
                popupOpen && (
                    <>
                        <div className="overlay" onClick={() => setPopupOpen(false)} />
                        <div className="popup">
                            <div className="popup-header">
                                <h3 style={{ color: GEOFENCE_COLORS[popupIndex] }}>
                                    {GEOFENCE_NAMES[popupIndex]}
                                </h3>
                                <button onClick={() => setPopupOpen(false)}>
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="popup-map">
                                <GoogleMap
                                    mapContainerStyle={{ width: "100%", height: "100%" }}
                                    center={popupPosition}
                                    zoom={16}
                                    options={{
                                        disableDefaultUI: true,
                                        zoomControl: true,
                                    }}
                                    onLoad={onPopupMapLoad}
                                    onClick={(e) => {
                                        setPopupPosition({
                                            lat: e.latLng.lat(),
                                            lng: e.latLng.lng(),
                                        });
                                    }}
                                >
                                    <Marker
                                        position={popupPosition}
                                        draggable={true}
                                        onDragEnd={(e) => {
                                            setPopupPosition({
                                                lat: e.latLng.lat(),
                                                lng: e.latLng.lng(),
                                            });
                                        }}
                                        icon={{
                                            url: "data:image/svg+xml," + encodeURIComponent(`
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 50" width="40" height="50">
                                                <path d="M20 0 C8.954 0 0 8.954 0 20 C0 35 20 50 20 50 C20 50 40 35 40 20 C40 8.954 31.046 0 20 0 Z" fill="${GEOFENCE_COLORS[popupIndex]}"/>
                                                <circle cx="20" cy="20" r="8" fill="white"/>
                                            </svg>
                                        `),
                                            scaledSize: { width: 40, height: 50 },
                                            anchor: { x: 20, y: 50 },
                                        }}
                                    />
                                    <Circle
                                        center={popupPosition}
                                        radius={popupRadius}
                                        options={{
                                            fillColor: GEOFENCE_COLORS[popupIndex],
                                            fillOpacity: 0.3,
                                            strokeColor: GEOFENCE_COLORS[popupIndex],
                                            strokeOpacity: 1,
                                            strokeWeight: 2,
                                        }}
                                    />
                                </GoogleMap>
                            </div>

                            <div className="popup-controls">
                                <label>รัศมี: {popupRadius} เมตร</label>
                                <input
                                    type="range"
                                    min="30"
                                    max="500"
                                    step="10"
                                    value={popupRadius}
                                    onChange={(e) => setPopupRadius(parseInt(e.target.value))}
                                />
                            </div>

                            <button className="save-btn" onClick={saveGeofence}>
                                <Check size={20} /> บันทึก
                            </button>
                        </div>
                    </>
                )
            }

            <style jsx>{`
                .app-container {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    height: 100dvh;
                    background: #0a0a0a;
                    overflow: hidden;
                    position: relative;
                }

                /* Alert Popup */
                .alert-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.9);
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.3s ease;
                    backdrop-filter: blur(5px);
                }

                .alert-box {
                    background: #1a1a1a;
                    border: 2px solid ${isStolen ? '#ff4444' : '#ffaa00'};
                    padding: 30px;
                    border-radius: 20px;
                    text-align: center;
                    width: 90%;
                    max-width: 400px;
                    box-shadow: 0 0 50px ${isStolen ? 'rgba(255, 68, 68, 0.3)' : 'rgba(255, 170, 0, 0.3)'};
                    animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }

                .alert-icon {
                    font-size: 4rem;
                    margin-bottom: 20px;
                    animation: pulse 1s infinite;
                    display: inline-block;
                }

                .alert-box h2 {
                    color: ${isStolen ? '#ff4444' : '#ffaa00'};
                    margin: 0 0 10px 0;
                    font-size: 2rem;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .alert-box p {
                    color: #ccc;
                    margin: 0 0 25px 0;
                    font-size: 1rem;
                    line-height: 1.5;
                }

                .alert-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .btn-dismiss {
                    background: #333;
                    color: white;
                    border: none;
                    padding: 15px;
                    border-radius: 10px;
                    font-size: 1rem;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-dismiss:active { transform: scale(0.98); }

                .btn-call {
                    background: ${isStolen ? '#ff4444' : '#ffaa00'};
                    color: black;
                    border: none;
                    padding: 15px;
                    border-radius: 10px;
                    font-size: 1rem;
                    font-weight: bold;
                    text-decoration: none;
                    display: block;
                    transition: all 0.2s;
                }
                .btn-call:active { transform: scale(0.98); }

                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                    100% { transform: scale(1); }
                }
                
                @keyframes slideUp {
                    from { transform: translateY(50px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }


                .loading-screen,
                .error-screen {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    background: #0a0a0a;
                    color: white;
                }

                /* Header */
                .header {
                    display: flex;
                    align-items: center;
                    padding: 12px 16px;
                    background: #111;
                    border-bottom: 1px solid #222;
                }

                .menu-btn {
                    background: none;
                    border: none;
                    color: white;
                    padding: 8px;
                    cursor: pointer;
                }

                .header-title {
                    flex: 1;
                    text-align: center;
                    font-weight: bold;
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }

                .status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #ff4444;
                }

                .status-dot.online {
                    background: #00ff9d;
                }

                /* Map Section - 65% with rounded corners */
                .map-section {
                    flex: 0 0 65%;
                    position: relative;
                    margin: 8px;
                    border-radius: 16px;
                    overflow: hidden;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                }

                .fab-mylocation {
                    position: absolute;
                    bottom: 16px;
                    right: 16px;
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    background: #1a1a2e;
                    border: 2px solid #4ECDC4;
                    color: #4ECDC4;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.4);
                }

                /* Info Section - fixed at bottom */
                .info-section {
                    flex: 0 0 auto;
                    padding: 12px 16px;
                    padding-bottom: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    overflow: hidden;
                }

                .info-card {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px;
                    background: #151515;
                    border-radius: 12px;
                    border: 1px solid #222;
                }

                .info-icon {
                    color: #4ECDC4;
                    flex-shrink: 0;
                }

                .info-content {
                    flex: 1;
                    min-width: 0;
                }

                .car-name {
                    font-size: 18px;
                    font-weight: bold;
                    color: white;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                }

                .edit-icon {
                    color: #666;
                }

                .name-input {
                    font-size: 18px;
                    font-weight: bold;
                    color: white;
                    background: #222;
                    border: 1px solid #4ECDC4;
                    border-radius: 4px;
                    padding: 4px 8px;
                    width: 100%;
                }

                .info-label {
                    font-size: 12px;
                    color: #666;
                    margin-top: 2px;
                }

                .parking-time {
                    font-size: 20px;
                    font-weight: bold;
                    color: #FFE66D;
                }

                .geofence-badges {
                    display: flex;
                    gap: 8px;
                }

                .geofence-badge {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 10px;
                    background: #151515;
                    border-radius: 8px;
                    border: 2px solid #333;
                    font-size: 11px;
                    color: #888;
                }

                .geofence-badge.active {
                    color: white;
                }

                .geofence-badge.current {
                    background: rgba(78, 205, 196, 0.1);
                }

                .badge-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }

                /* Side Menu */
                .side-menu {
                    position: fixed;
                    top: 0;
                    left: -300px;
                    width: 300px;
                    height: 100%;
                    background: #111;
                    z-index: 200;
                    transition: left 0.3s ease;
                    overflow-y: auto;
                }

                .side-menu.open {
                    left: 0;
                }

                .menu-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px;
                    border-bottom: 1px solid #222;
                }

                .menu-header h2 {
                    color: white;
                    margin: 0;
                    font-size: 18px;
                }

                .menu-header button {
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                }

                .menu-section {
                    padding: 16px;
                }

                .menu-section h3 {
                    color: #888;
                    font-size: 12px;
                    text-transform: uppercase;
                    margin: 0 0 8px 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .menu-hint {
                    color: #555;
                    font-size: 11px;
                    margin: 0 0 16px 0;
                }

                .geofence-slot {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px;
                    background: #1a1a1a;
                    border-radius: 8px;
                    margin-bottom: 8px;
                }

                .slot-color {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }

                .slot-info {
                    flex: 1;
                    min-width: 0;
                }

                .slot-name-input {
                    display: block;
                    width: 100%;
                    background: transparent;
                    border: none;
                    border-bottom: 1px dashed #666;
                    color: white;
                    font-size: 14px;
                    padding: 2px 0;
                    margin-bottom: 4px;
                }
                .slot-name-input:focus {
                    border-bottom: 1px solid #4ECDC4;
                    outline: none;
                }

                .slot-radius {
                    font-size: 11px;
                    color: #666;
                }

                .slot-empty {
                    color: #555;
                    font-size: 13px;
                }

                .slot-actions {
                    display: flex;
                    gap: 4px;
                }

                .slot-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .slot-btn.edit {
                    background: #222;
                    color: #4ECDC4;
                }

                .slot-btn.delete {
                    background: #222;
                    color: #FF6B6B;
                }

                /* Overlay */
                .overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.7);
                    z-index: 150;
                }

                /* Popup */
                .popup {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 90%;
                    max-width: 400px;
                    background: #111;
                    border-radius: 16px;
                    z-index: 300;
                    overflow: hidden;
                }

                .popup-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px;
                    border-bottom: 1px solid #222;
                }

                .popup-header h3 {
                    margin: 0;
                    font-size: 18px;
                }

                .popup-header button {
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                }

                .popup-map {
                    height: 250px;
                }

                .popup-controls {
                    padding: 16px;
                }

                .popup-controls label {
                    display: block;
                    color: white;
                    font-size: 14px;
                    margin-bottom: 8px;
                }

                .popup-controls input[type="range"] {
                    width: 100%;
                }

                .save-btn {
                    width: 100%;
                    padding: 16px;
                    background: #4ECDC4;
                    border: none;
                    color: #000;
                    font-size: 16px;
                    font-weight: bold;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }

                .save-btn:hover {
                    background: #3dbdb5;
                }
            `}</style>
            {/* Status Alert Overlay (Vibration / Crash) */}
            {
                (carStatus === "2" || carStatus === "3") && (
                    <div className={`status-alert-overlay ${carStatus === "3" ? "crash" : "vibration"}`}>
                        <div className="alert-box">
                            <div className="alert-icon">
                                {carStatus === "3" ? "🆘" : "⚠️"}
                            </div>
                            <h2>{carStatus === "3" ? "แจ้งเตือนอุบัติเหตุ!" : "ตรวจพบการสั่นสะเทือน!"}</h2>
                            <p>{carStatus === "3" ? "รถมีการล้มหรือเอียงผิดปกติ (Code 3)" : "มีการขยับหรือสั่นสะเทือน (Code 2)"}</p>
                            <div className="alert-time">
                                เวลา: {new Date().toLocaleTimeString()}
                            </div>
                        </div>
                    </div>
                )
            }

            <style jsx>{`
                /* ... existing styles ... */
                .status-alert-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(5px);
                    animation: fadeIn 0.3s ease;
                }
                
                .status-alert-overlay.vibration {
                    background: rgba(255, 165, 0, 0.4);
                }

                .status-alert-overlay.crash {
                    background: rgba(255, 0, 0, 0.6);
                }

                .alert-box {
                    background: #111;
                    border: 2px solid white;
                    padding: 30px;
                    border-radius: 20px;
                    text-align: center;
                    color: white;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                    max-width: 80%;
                    animation: pulse 1s infinite alternate;
                }

                .status-alert-overlay.crash .alert-box {
                    border-color: #ff4444;
                    box-shadow: 0 0 50px rgba(255, 0, 0, 0.5);
                }

                .alert-icon {
                    font-size: 60px;
                    margin-bottom: 20px;
                }

                .alert-box h2 {
                    font-size: 24px;
                    margin: 0 0 10px 0;
                    color: #fff;
                }

                @keyframes pulse {
                    from { transform: scale(1); }
                    to { transform: scale(1.05); }
                }

                .alert-time {
                    margin-top: 15px;
                    font-size: 14px;
                    color: #aaa;
                }
            `}</style>
        </div >
    );





}

export default function MapPage() {
    return (
        <Suspense fallback={<div className="loading-screen">กำลังโหลด...</div>}>
            <MapContent />
        </Suspense>
    );
}
