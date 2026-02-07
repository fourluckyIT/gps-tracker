"use client";
import { useState, useEffect, useRef } from "react";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { motion, AnimatePresence } from "framer-motion";
import {
    Menu, X, Car, Navigation, MapPin,
    Bell, History, ChevronRight, AlertTriangle, CheckCircle, Clock
} from "lucide-react";
import { Toaster, toast } from 'react-hot-toast';

// Config
const GOOGLE_MAPS_API_KEY = "AIzaSyACWF7KC20kJzTuxl-AicAuANdZaP7U74Q";

// Mock Data Structure
const MOCK_VEHICLES = [
    {
        id: 1,
        plate: "กข 8888",
        driver: "สมชาย ใจดี",
        status: "NORMAL",
        lat: 13.7469,
        lng: 100.5349,
        last_update: new Date(),
        history: [
            { time: "12:00", status: "NORMAL", lat: 13.7469, lng: 100.5349 },
            { time: "11:55", status: "NORMAL", lat: 13.7460, lng: 100.5340 },
        ]
    },
    {
        id: 2,
        plate: "ฮฮ 9999",
        driver: "โจร กลับใจ",
        status: "STOLEN",
        lat: 13.7200,
        lng: 100.5000,
        last_update: new Date(),
        history: [
            { time: "12:05", status: "STOLEN", lat: 13.7200, lng: 100.5000 },
            { time: "12:00", status: "NORMAL", lat: 13.7210, lng: 100.5100 },
            { time: "11:50", status: "NORMAL", lat: 13.7220, lng: 100.5200 },
        ]
    }
];

const STATUS_CONFIG = {
    'NORMAL': { label: 'ปกติ', color: 'text-emerald-700', bg: 'bg-emerald-100', icon: <CheckCircle size={14} /> },
    'STOLEN': { label: 'ถูกขโมย!', color: 'text-red-700', bg: 'bg-red-100', icon: <AlertTriangle size={14} /> },
    'CRASH': { label: 'อุบัติเหตุ', color: 'text-orange-700', bg: 'bg-orange-100', icon: <AlertTriangle size={14} /> },
};

export default function DemoPage() {
    const [vehicles, setVehicles] = useState(MOCK_VEHICLES);
    const [selectedId, setSelectedId] = useState(1);
    const [showHistory, setShowHistory] = useState(false);
    const [notificationPermission, setNotificationPermission] = useState('default');

    const { isLoaded } = useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_API_KEY });
    const [map, setMap] = useState(null);

    const selectedVehicle = vehicles.find(v => v.id === selectedId);

    // 1. Request Notification Permission
    useEffect(() => {
        if ('Notification' in window) {
            setNotificationPermission(Notification.permission);
        }
    }, []);

    const requestPermission = async () => {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            setNotificationPermission(permission);
            if (permission === 'granted') {
                new Notification("GPS Tracker", { body: "ระบบแจ้งเตือนพร้อมใช้งาน ✅" });
            }
        }
    };

    // 2. Simulate Incoming Alert (Notification Logic)
    useEffect(() => {
        const timer = setTimeout(() => {
            // Simulate Status Change for Vehicle 2
            toast((t) => (
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🚨</span>
                    <div>
                        <b className="text-red-600">ALERT: รถ ฮฮ 9999</b>
                        <p className="text-xs text-gray-600">มีการเคลื่อนที่ (STOLEN)</p>
                    </div>
                    <button onClick={() => { setSelectedId(2); toast.dismiss(t.id); }} className="bg-red-600 text-white px-3 py-1 rounded text-xs">ดู</button>
                </div>
            ), { duration: 5000 });

            // Trigger Native Notification
            if (Notification.permission === 'granted') {
                new Notification("🚨 แจ้งเตือนด่วน!", {
                    body: "รถทะเบียน ฮฮ 9999 สถานะ: STOLEN (ถูกขโมย)",
                    icon: "/icon-192.png" // needs existing icon
                });
            }
        }, 5000); // 5 seconds after load
        return () => clearTimeout(timer);
    }, []);

    // 3. Map Pan Logic
    useEffect(() => {
        if (map && selectedVehicle) {
            map.panTo({ lat: selectedVehicle.lat, lng: selectedVehicle.lng });
        }
    }, [selectedId, map]);

    return (
        <div className="h-screen w-full bg-gray-50 relative overflow-hidden font-sans text-gray-900">
            <Toaster position="top-center" />

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-10 flex justify-between items-center p-4 bg-gradient-to-b from-white/80 to-transparent pointer-events-none">
                <div className="pointer-events-auto bg-white shadow-md rounded-full px-4 py-2 flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-bold text-gray-700">Online</span>
                </div>

                {notificationPermission !== 'granted' && (
                    <button onClick={requestPermission} className="pointer-events-auto bg-blue-600 text-white shadow-md rounded-full px-4 py-2 flex items-center gap-2 text-xs font-bold">
                        <Bell size={14} /> เปิดแจ้งเตือน
                    </button>
                )}
            </div>

            {/* Map */}
            <div className="w-full h-full">
                {isLoaded ? (
                    <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={{ lat: 13.7469, lng: 100.5349 }}
                        zoom={14}
                        onLoad={setMap}
                        options={{ disableDefaultUI: true, zoomControl: false }}
                    >
                        {vehicles.map(v => (
                            <Marker
                                key={v.id}
                                position={{ lat: v.lat, lng: v.lng }}
                                onClick={() => setSelectedId(v.id)}
                                icon={{
                                    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
                                <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
                                    <circle cx="30" cy="30" r="22" fill="${v.status === 'STOLEN' ? 'rgba(239, 68, 68, 0.3)' :
                                            v.status === 'CRASH' ? 'rgba(249, 115, 22, 0.3)' :
                                                'rgba(16, 185, 129, 0.3)'
                                        }" />
                                    <circle cx="30" cy="30" r="10" fill="${v.status === 'STOLEN' ? '#EF4444' :
                                            v.status === 'CRASH' ? '#F97316' :
                                                '#10B981'
                                        }" stroke="white" stroke-width="2"/>
                                </svg>
                            `),
                                    scaledSize: new window.google.maps.Size(60, 60),
                                    anchor: new window.google.maps.Point(30, 30)
                                }}
                            />
                        ))}
                    </GoogleMap>
                ) : <div className="h-full flex items-center justify-center">Loading Map...</div>}
            </div>

            {/* Swipeable Cards */}
            <div className="absolute bottom-6 left-0 w-full z-20 overflow-x-auto no-scrollbar px-6 flex gap-4 snap-x snap-mandatory pb-safe">
                {vehicles.map((v) => {
                    const isSelected = selectedId === v.id;
                    const statusStyle = STATUS_CONFIG[v.status] || STATUS_CONFIG['NORMAL'];

                    return (
                        <div
                            key={v.id}
                            onClick={() => setSelectedId(v.id)}
                            className={`
                        snap-center min-w-[90%] max-w-[400px] bg-white rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100
                        transition-all duration-300
                        ${isSelected ? 'ring-2 ring-blue-500 scale-100' : 'scale-95 opacity-90'}
                    `}
                        >
                            {/* Header: Status Badge + Time */}
                            <div className="flex justify-between items-start mb-3">
                                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${statusStyle.bg} ${statusStyle.color}`}>
                                    {statusStyle.icon} {statusStyle.label}
                                </div>
                                <div className="text-gray-400 text-xs font-medium flex items-center gap-1">
                                    <Clock size={12} /> อัพเดทเมื่อสักครู่
                                </div>
                            </div>

                            {/* Body: Plate Number & Info */}
                            <div className="mb-6 pl-1">
                                <h2 className="text-3xl font-black text-gray-900 tracking-tight">{v.plate}</h2>
                                <p className="text-sm text-gray-500 font-medium">{v.driver} • GPS Tracker</p>
                            </div>

                            {/* Footer: Actions Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowHistory(true); }}
                                    className="flex items-center justify-center gap-2 bg-gray-50 active:bg-gray-100 text-gray-700 py-3 rounded-xl font-bold text-sm transition border border-gray-200"
                                >
                                    <History size={18} /> ประวัติแจ้งเตือน
                                </button>
                                <button
                                    className="flex items-center justify-center gap-2 bg-blue-600 active:bg-blue-700 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-blue-200 transition"
                                >
                                    <Navigation size={18} /> นำทาง
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* History List Popup (Bottom Modal) */}
            <AnimatePresence>
                {showHistory && selectedVehicle && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
                            onClick={() => setShowHistory(false)}
                        />
                        <motion.div
                            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed bottom-0 left-0 right-0 bg-white z-50 rounded-t-3xl p-6 pb-safe max-h-[70vh] overflow-hidden flex flex-col shadow-2xl"
                        >
                            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6" />

                            <div className="flex justify-between items-end mb-4 border-b pb-4">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">ประวัติการแจ้งเตือน</h3>
                                    <p className="text-sm text-gray-500">ทะเบียน {selectedVehicle.plate}</p>
                                </div>
                                <button onClick={() => setShowHistory(false)} className="bg-gray-100 p-2 rounded-full"><X size={20} /></button>
                            </div>

                            <div className="overflow-y-auto flex-1 space-y-4 pr-2">
                                {selectedVehicle.history.map((h, i) => {
                                    const st = STATUS_CONFIG[h.status];
                                    return (
                                        <div key={i} className="flex gap-4 items-start group cursor-pointer" onClick={() => map?.panTo({ lat: h.lat, lng: h.lng })}>
                                            <div className="flex flex-col items-center">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${st.bg} ${st.color}`}>
                                                    {st.icon}
                                                </div>
                                                {i !== selectedVehicle.history.length - 1 && <div className="w-0.5 h-full bg-gray-100 my-1" />}
                                            </div>
                                            <div className="flex-1 pb-4">
                                                <div className="flex justify-between items-start">
                                                    <span className={`text-sm font-bold ${st.color}`}>{st.label} ({h.status})</span>
                                                    <span className="text-xs text-gray-400 font-mono">{h.time} น.</span>
                                                </div>
                                                <div className="text-sm text-gray-600 mt-1 flex items-center gap-1">
                                                    <MapPin size={12} /> พิกัด {h.lat.toFixed(4)}, {h.lng.toFixed(4)}
                                                </div>
                                            </div>
                                            <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 mt-2" />
                                        </div>
                                    )
                                })}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

        </div>
    );
}
