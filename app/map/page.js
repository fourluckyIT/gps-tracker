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
import styles from "./Map.module.css";

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

    // User position (Phone GPS)
    const [userPosition, setUserPosition] = useState(null);
    const [distanceToCar, setDistanceToCar] = useState(null);

    // UI state
    const [menuOpen, setMenuOpen] = useState(false);

    // Geofence state (3 slots, can be null)
    const [geofences, setGeofences] = useState([null, null, null]);
    const [geofencesLoaded, setGeofencesLoaded] = useState(false);

    // Track which geofence the car is in
    const [carInGeofence, setCarInGeofence] = useState(null);
    const [prevCarInGeofence, setPrevCarInGeofence] = useState(null);

    // Popup for adding/editing geofence
    const [popupOpen, setPopupOpen] = useState(false);
    const [popupIndex, setPopupIndex] = useState(null);
    const [popupPosition, setPopupPosition] = useState(defaultCenter);
    const [popupRadius, setPopupRadius] = useState(100);
    const [popupMap, setPopupMap] = useState(null);





    // SOS State
    const [sosNumbers, setSosNumbers] = useState(["", "", ""]);
    const [sosLoading, setSosLoading] = useState(false);

    // History Log State
    const [historyOpen, setHistoryOpen] = useState(false);
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [showAlertsOnly, setShowAlertsOnly] = useState(false);

    const fetchHistoryLogs = () => {
        if (!deviceId) return;
        setLogsLoading(true);
        setHistoryOpen(true);
        setHistoryOpen(true);
        setMenuOpen(false); // Close menu if open
        setShowAlertsOnly(false); // Reset filter

        fetch(`${SERVER_URL}/api/history/${deviceId}?limit=50`)
            .then(res => res.json())
            .then(data => {
                setLogs(data);
                setLogsLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLogsLoading(false);
                toast.error("โหลดประวัติไม่สำเร็จ");
            });
    };

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

    // Watch User Position (Works in Capacitor WebView without HTTPS)
    useEffect(() => {
        if (!navigator.geolocation) return;

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
                setUserPosition(pos);
            },
            (err) => {
                console.error("Error watching position:", err);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    // Calculate distance to car
    useEffect(() => {
        if (userPosition && carPosition) {
            const dist = getDistance(userPosition, carPosition);
            setDistanceToCar(dist);
        }
    }, [userPosition, carPosition]);

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

    const isStolen = (carStatus === "1" || (carStatus || "").includes("STOLEN"));
    const isCrash = (carStatus === "2" || (carStatus || "").includes("CRASH"));
    const showAlert = (isStolen || isCrash) && !alertDismissed;

    // Notification Effect
    useEffect(() => {
        if ('Notification' in window && Notification.permission !== 'granted') {
            Notification.requestPermission();
        }
    }, []);

    useEffect(() => {
        if (showAlert && 'Notification' in window && Notification.permission === 'granted') {
            // Check if we already notified recently? (Simple version: notify on state change)
            // effective way: notify only if displayed. 
            // Since showAlert depends on !alertDismissed, this will fire when alert appears.

            const title = isStolen ? "🚨 รถถูกขโมย!" : "💥 เกิดอุบัติเหตุ!";
            const body = isStolen ? "มีการพยายามสตาร์ทรถหรือเคลื่อนย้าย" : "ตรวจพบการชนหรือกระแทก";

            // Send notification
            new Notification(title, {
                body: body,
                icon: '/icon.png', // valid if exists, else ignores
                tag: 'alert-critical', // replace existing
                requireInteraction: true
            });
        }
    }, [showAlert, isStolen]);

    // Sound Alert Effect (Stolen/Crash)
    useEffect(() => {
        let audioCtx;
        let oscillator;
        let gainNode;
        let interval;

        // Only play if critical status AND not dismissed
        if ((isStolen || isCrash) && !alertDismissed) {
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
    }, [isStolen, isCrash, carStatus, alertDismissed]);


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

    // Update parking time display (client-only)
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
            <div className={styles.header}>
                <button className={styles.menuBtn} onClick={() => setMenuOpen(true)}>
                    <Menu size={24} />
                </button>
                <div className={styles.headerTitle}>
                    <span className={`${styles.statusDot} ${connected ? styles.online : ""}`} />
                    GPS Tracker
                </div>
            </div>

            {/* Main Map (Expanded to fill more space, pushing info down) */}
            <div className={styles.mapSection} style={{ flex: 1, marginBottom: '0' }}>
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

                    {/* User Marker (Blue Dot) */}
                    {userPosition && (
                        <Marker
                            position={userPosition}
                            icon={{
                                path: window.google?.maps?.SymbolPath?.CIRCLE,
                                scale: 6,
                                fillOpacity: 1,
                                fillColor: "#4285F4",
                                strokeColor: "#ffffff",
                                strokeWeight: 2,
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
                    className={styles.fabMyLocation}
                    onClick={() => {
                        // Capacitor WebView allows geolocation even on HTTP
                        // Check if we are in Capacitor or strict browser
                        const isCapacitor = window.Capacitor !== undefined;

                        if (!isCapacitor && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
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
            <div className={styles.infoSection} style={{ background: '#111', borderTop: '1px solid #333' }}>

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
                            className={styles.nameInput}
                        />
                    ) : (
                        <div className={styles.carName} onClick={() => setIsEditingName(true)} style={{ fontSize: '1.1rem' }}>
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

                    {/* Distance to Car */}
                    <div style={{ display: 'flex', alignItems: 'center', color: '#4ECDC4', fontWeight: 'bold', fontSize: '1rem', marginTop: '4px' }}>
                        <MapPin size={16} style={{ marginRight: '8px' }} />
                        <span>
                            ห่างจากรถ: {distanceToCar
                                ? (distanceToCar < 1000
                                    ? `${Math.round(distanceToCar)} ม.`
                                    : `${(distanceToCar / 1000).toFixed(1)} กม.`)
                                : "กำลังระบุ..."}
                        </span>
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

                    {/* History Button (New) */}
                    <button
                        onClick={fetchHistoryLogs}
                        style={{
                            marginTop: '0px',
                            width: '100%',
                            padding: '10px',
                            background: '#333',
                            border: '1px solid #444',
                            borderRadius: '8px',
                            color: '#fff',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px'
                        }}
                    >
                        <Clock size={18} /> ดูประวัติ / แจ้งเตือน
                    </button>
                </div>
            </div>

            {/* Side Menu */}
            <div className={`${styles.sideMenu} ${menuOpen ? styles.open : ""}`}>
                <div className={styles.menuHeader}>
                    <h2>ตั้งค่า</h2>
                    <button onClick={() => setMenuOpen(false)}>
                        <X size={24} />
                    </button>
                </div>

                <div className={styles.menuSection}>
                    <h3><Car size={18} /> สถานะปัจจุบัน</h3>
                    <div className={styles.infoCard} style={{ background: '#222', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
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

                    <h3><Clock size={18} /> ประวัติการจอด</h3>
                    <div className={styles.infoCard} style={{ background: '#222', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
                        <button
                            onClick={fetchHistoryLogs}
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
                            📜 ดูประวัติการจอด
                        </button>
                    </div>



                    {/* SOS Settings */}
                    <h3><div style={{ display: 'flex', alignItems: 'center' }}>🚨 เบอร์ฉุกเฉิน (SOS)</div></h3>
                    <div className={styles.infoCard} style={{ background: '#222', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                        <p className={styles.menuHint} style={{ marginBottom: '10px' }}>ระบุเบอร์โทรศัพท์สูงสุด 3 เบอร์ สำหรับปุ่มโทรฉุกเฉิน</p>
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
                    <p className={styles.menuHint}>กดเพื่อเพิ่ม/แก้ไข ปล่อยว่างได้</p>

                    {[0, 1, 2].map((index) => {
                        const gf = geofences[index];
                        return (
                            <div key={index} className={styles.geofenceSlot}>
                                <div
                                    className={styles.slotColor}
                                    style={{ background: GEOFENCE_COLORS[index] }}
                                />
                                <div className={styles.slotInfo}>
                                    {gf ? (
                                        <>
                                            <input
                                                type="text"
                                                value={gf.name}
                                                onChange={(e) => updateGeofenceName(index, e.target.value)}
                                                className={styles.slotNameInput}
                                            />
                                            {gf.address && (
                                                <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '2px', lineHeight: '1.2' }}>
                                                    {gf.address}
                                                </div>
                                            )}
                                            <span className={styles.slotRadius}>รัศมี {gf.radius}m</span>
                                        </>
                                    ) : (
                                        <span className={styles.slotEmpty}>{GEOFENCE_NAMES[index]} (ว่าง)</span>
                                    )}
                                </div>
                                <div className={styles.slotActions}>
                                    <button
                                        className={`${styles.slotBtn} ${styles.edit}`}
                                        onClick={() => openGeofencePopup(index)}
                                    >
                                        {gf ? <Edit3 size={16} /> : <Plus size={16} />}
                                    </button>
                                    {gf && (
                                        <button
                                            className={`${styles.slotBtn} ${styles.delete}`}
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
            {menuOpen && <div className={styles.overlay} onClick={() => setMenuOpen(false)} />}

            {/* CRITICAL ALERT POPUP */}
            {
                showAlert && (
                    <div className={styles.alertOverlay}>
                        <div className={`${styles.alertBox} ${isStolen ? styles.stolen : styles.crash}`}>
                            <div className={styles.alertIcon}>
                                {isStolen ? "🚨" : "💥"}
                            </div>
                            <h2>{isStolen ? "รถถูกขโมย!" : "เกิดอุบัติเหตุ!"}</h2>
                            <p>{isStolen ? "มีการพยายามสตาร์ทรถหรือเคลื่อนย้ายโดยไม่ได้รับอนุญาต" : "ตรวจพบการชนหรือการกระแทกรุนแรง"}</p>

                            <div className={styles.alertActions}>
                                <button className={styles.btnDismiss} onClick={() => setAlertDismissed(true)}>
                                    รับทราบ (ปิดแจ้งเตือน)
                                </button>
                                <a href={`tel:${sosNumbers.find(n => n.trim()) || "191"}`} className={styles.btnCall}>
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
                        <div className={styles.overlay} onClick={() => setPopupOpen(false)} />
                        <div className={styles.popup}>
                            <div className={styles.popupHeader}>
                                <h3 style={{ color: GEOFENCE_COLORS[popupIndex] }}>
                                    {GEOFENCE_NAMES[popupIndex]}
                                </h3>
                                <button onClick={() => setPopupOpen(false)}>
                                    <X size={24} />
                                </button>
                            </div>

                            <div className={styles.popupMap}>
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

                            <div className={styles.popupControls}>
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

                            <button className={styles.saveBtn} onClick={saveGeofence}>
                                <Check size={20} /> บันทึก
                            </button>
                        </div>

                    </>
                )
            }

            {/* History Modal */}
            {
                historyOpen && (
                    <>
                        <div className={styles.overlay} onClick={() => setHistoryOpen(false)} />
                        <div className={styles.popup} style={{ maxHeight: '80vh', overflowY: 'auto' }}>
                            <div className={styles.popupHeader}>
                                <h3>📜 ประวัติการแจ้งเตือน</h3>
                                <button onClick={() => setHistoryOpen(false)}>
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Filter Toggle */}
                            <div style={{ padding: '10px 16px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input
                                    type="checkbox"
                                    id="alertFilter"
                                    checked={showAlertsOnly}
                                    onChange={(e) => setShowAlertsOnly(e.target.checked)}
                                    style={{ width: '18px', height: '18px' }}
                                />
                                <label htmlFor="alertFilter" style={{ color: '#ccc', fontSize: '0.9rem', cursor: 'pointer' }}>
                                    แสดงเฉพาะแจ้งเตือน (Alerts Only)
                                </label>
                            </div>

                            <div className={styles.popupControls}>  {/* Reuse popup-controls for padding?? or create class? Using popupControls for padding is fine or define new class */}
                                {logsLoading ? (
                                    <p style={{ textAlign: 'center', padding: '20px' }}>กำลังโหลด...</p>
                                ) : logs.length === 0 ? (
                                    <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>ไม่มีข้อมูลประวัติ</p>
                                ) : (
                                    <ul style={{ listStyle: 'none', padding: 0 }}>
                                        {logs.filter(log => !showAlertsOnly || (log.status !== 'NORMAL' && log.status !== 'UNKNOWN' && log.status != '0')).map((log, i) => {
                                            const statusText = (log.status === '1' || (log.status || '').includes('STOLEN')) ? 'STOLEN' :
                                                (log.status === '2' || (log.status || '').includes('CRASH')) ? 'CRASH' :
                                                    (log.status === '0' || log.status === 'NORMAL') ? 'NORMAL' : log.status;
                                            return (
                                                <li key={i} style={{ borderBottom: '1px solid #333', padding: '10px 0', fontSize: '0.9rem' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                        <span style={{ color: '#aaa' }}>
                                                            {new Date(log.timestamp).toLocaleString('th-TH', {
                                                                timeZone: 'Asia/Bangkok',
                                                                day: '2-digit', month: '2-digit', year: 'numeric',
                                                                hour: '2-digit', minute: '2-digit', second: '2-digit'
                                                            })}
                                                        </span>
                                                        <span style={{
                                                            fontWeight: 'bold',
                                                            color: statusText === 'STOLEN' ? '#ff6b6b' :
                                                                statusText === 'CRASH' ? '#ff9f43' :
                                                                    statusText.includes('GEOFENCE') ? '#ffe66d' : '#4ecdc4'
                                                        }}>
                                                            {statusText}
                                                        </span>
                                                    </div>
                                                    <div style={{ color: '#666', fontSize: '0.8rem' }}>
                                                        พิกัด: {Number(log.lat).toFixed(5)}, {Number(log.lng).toFixed(5)}
                                                    </div>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </>
                )
            }


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
