"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { GoogleMap, useJsApiLoader, Marker, Circle } from "@react-google-maps/api";
import { io } from "socket.io-client";
import toast, { Toaster } from "react-hot-toast";
import {
    Menu, X, MapPin, Crosshair, Plus, Trash2, Edit3, Check, Clock, Car
} from "lucide-react";

// Config
const SERVER_URL = "http://143.14.200.117";
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

    // Track which geofence the car is in
    const [carInGeofence, setCarInGeofence] = useState(null);
    const [prevCarInGeofence, setPrevCarInGeofence] = useState(null);

    // Load Google Maps
    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    });

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

        return () => socket.disconnect();
    }, [deviceId]);

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
    const saveGeofence = () => {
        const newGeofences = [...geofences];
        newGeofences[popupIndex] = {
            name: geofences[popupIndex]?.name || GEOFENCE_NAMES[popupIndex],
            lat: popupPosition.lat,
            lng: popupPosition.lng,
            radius: popupRadius,
        };
        setGeofences(newGeofences);
        setPopupOpen(false);
        toast.success(`บันทึก ${GEOFENCE_NAMES[popupIndex]} แล้ว`);
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

            {/* Main Map (3.6/5 = 72% height) */}
            <div className="map-section">
                <GoogleMap
                    mapContainerStyle={{ width: "100%", height: "100%" }}
                    center={carPosition || defaultCenter}
                    zoom={16}
                    options={{
                        disableDefaultUI: true,
                        zoomControl: false,
                    }}
                    onLoad={onMainMapLoad}
                >
                    {/* Car Marker */}
                    {carPosition && (
                        <Marker
                            position={carPosition}
                            icon={{
                                url: "data:image/svg+xml," + encodeURIComponent(`
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
                                        <circle cx="20" cy="20" r="18" fill="#3B82F6" stroke="white" stroke-width="3"/>
                                        <text x="20" y="26" text-anchor="middle" fill="white" font-size="16">🚗</text>
                                    </svg>
                                `),
                                scaledSize: { width: 40, height: 40 },
                                anchor: { x: 20, y: 20 },
                            }}
                        />
                    )}

                    {/* Geofence Circles */}
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

                {/* Floating button - go to MY location */}
                <button
                    className="fab-mylocation"
                    onClick={() => {
                        if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(
                                (position) => {
                                    const pos = {
                                        lat: position.coords.latitude,
                                        lng: position.coords.longitude,
                                    };
                                    map?.panTo(pos);
                                    map?.setZoom(17);
                                    toast.success("ไปยังตำแหน่งของคุณแล้ว");
                                },
                                () => {
                                    toast.error("ไม่สามารถระบุตำแหน่งได้");
                                }
                            );
                        }
                    }}
                >
                    <Crosshair size={20} />
                </button>
            </div>

            {/* Info Section */}
            <div className="info-section">
                {/* Car Name */}
                <div className="info-card car-name-card">
                    <Car size={24} className="info-icon" />
                    <div className="info-content">
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
                            <div className="car-name" onClick={() => setIsEditingName(true)}>
                                {carName || "กดเพื่อตั้งชื่อ"}
                                <Edit3 size={14} className="edit-icon" />
                            </div>
                        )}
                        <div className="info-label">ชื่อรถ (กดเพื่อแก้ไข)</div>
                    </div>
                </div>

                {/* Parking Status */}
                <div className="info-card parking-card">
                    <Clock size={24} className="info-icon" />
                    <div className="info-content">
                        <div className="parking-time">{parkingDisplay || "กำลังโหลด..."}</div>
                        <div className="info-label">
                            {carInGeofence ? `จอดอยู่ที่: ${carInGeofence.name}` : "จอดอยู่ (ไม่ขยับเกิน 20m)"}
                        </div>
                    </div>
                </div>

                {/* Geofence Status */}
                <div className="geofence-badges">
                    {geofences.map((gf, index) => (
                        <div
                            key={index}
                            className={`geofence-badge ${gf ? "active" : "empty"} ${carInGeofence?.index === index ? "current" : ""}`}
                            style={{ borderColor: GEOFENCE_COLORS[index] }}
                        >
                            <span
                                className="badge-dot"
                                style={{ background: gf ? GEOFENCE_COLORS[index] : "#444" }}
                            />
                            {gf ? gf.name : `ว่าง`}
                        </div>
                    ))}
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
            </div>

            {/* Menu Overlay */}
            {menuOpen && <div className="overlay" onClick={() => setMenuOpen(false)} />}

            {/* Geofence Popup */}
            {popupOpen && (
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
            )}

            <style jsx>{`
                .app-container {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    height: 100dvh;
                    background: #0a0a0a;
                    overflow: hidden;
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
                    color: white;
                    font-size: 14px;
                    padding: 0;
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
        </div>
    );
}

export default function MapPage() {
    return (
        <Suspense fallback={<div className="loading-screen">กำลังโหลด...</div>}>
            <MapContent />
        </Suspense>
    );
}
