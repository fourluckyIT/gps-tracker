"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, MapPin, Bell, CheckCircle2, ChevronRight, AlertTriangle } from "lucide-react";

export default function PermissionGate({ children }) {
    const [isChecking, setIsChecking] = useState(true);
    const [hasConsent, setHasConsent] = useState(false);
    const [locationGranted, setLocationGranted] = useState(false);
    const [notificationGranted, setNotificationGranted] = useState(false);

    // Check initial state
    useEffect(() => {
        // 1. Check Terms Consent
        const consent = localStorage.getItem("gps_terms_consent");
        if (consent) {
            setHasConsent(true);
        }

        // 2. Check Permissions
        const checkPermissions = async () => {
            // Notifications
            if ("Notification" in window) {
                if (Notification.permission === "granted") {
                    setNotificationGranted(true);
                }
            } else {
                // If browser doesn't support notifications, let them pass
                setNotificationGranted(true);
            }

            // Geolocation permission API (if supported)
            if (navigator.permissions && navigator.permissions.query) {
                try {
                    const locPerm = await navigator.permissions.query({ name: 'geolocation' });
                    if (locPerm.state === 'granted') {
                        setLocationGranted(true);
                    }
                    // Listen for changes
                    locPerm.onchange = function () {
                        setLocationGranted(this.state === 'granted');
                    };
                } catch (e) {
                    console.log("Permission query API not supported for geolocation");
                }
            } else {
                setIsChecking(false);
            }

            setIsChecking(false);
        };

        checkPermissions();
    }, []);

    const handleAcceptTerms = () => {
        localStorage.setItem("gps_terms_consent", new Date().toISOString());
        localStorage.setItem("gps_consent_version", "1.0");
        setHasConsent(true);
    };

    const requestLocation = () => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                () => setLocationGranted(true),
                (err) => {
                    console.error(err);
                    alert("กรุณาเปิดสิทธิ์เข้าถึงตำแหน่งที่ตั้ง (Location) ในตั้งค่าของเบราว์เซอร์");
                },
                { enableHighAccuracy: true }
            );
        } else {
            alert("อุปกรณ์ของคุณไม่รองรับ GPS");
        }
    };

    const requestNotification = async () => {
        if ("Notification" in window) {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
                setNotificationGranted(true);
            } else {
                alert("กรุณาเปิดสิทธิ์การแจ้งเตือน (Notifications) ในตั้งค่าของอุปกรณ์ เพื่อรับการแจ้งเตือนรถถูกขโมย");
            }
        }
    };

    if (isChecking) {
        return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: 'white' }}>ตรวจสอบสิทธิ์การเข้าถึง...</div>;
    }

    // Step 1: User must accept PDPA/Terms
    if (!hasConsent) {
        return (
            <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                <div style={{ background: '#111', padding: '30px', borderRadius: '16px', maxWidth: '400px', width: '100%', border: '1px solid #333' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                        <div style={{ width: '60px', height: '60px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3B82F6' }}>
                            <ShieldAlert size={32} />
                        </div>
                    </div>
                    <h2 style={{ textAlign: 'center', fontSize: '1.25rem', marginBottom: '16px' }}>ข้อตกลงและเงื่อนไขการใช้งาน</h2>
                    <div style={{ background: '#1a1a1a', padding: '16px', borderRadius: '8px', fontSize: '0.9rem', color: '#aaa', maxHeight: '200px', overflowY: 'auto', marginBottom: '20px', lineHeight: '1.6' }}>
                        <p>แอปพลิเคชันนี้มีการเก็บข้อมูลเพื่อให้บริการติดตามยานพาหนะ:</p>
                        <ul style={{ paddingLeft: '20px', marginTop: '10px' }}>
                            <li style={{ marginBottom: '8px' }}>**ข้อมูลตำแหน่ง (Location)**: เพื่อแสดงตำแหน่งของคุณเทียบกับรถ และแจ้งเตือนเมื่อรถออกนอกพื้นที่</li>
                            <li style={{ marginBottom: '8px' }}>**การแจ้งเตือน (Notification)**: เพื่อส่งสัญญาณเตือนฉุกเฉินเมื่อรถถูกโจรกรรมหรือเกิดอุบัติเหตุ</li>
                            <li>เราจะไม่นำข้อมูลของคุณไปเผยแพร่ต่อบุคคลที่สามโดยไม่ได้รับอนุญาต</li>
                        </ul>
                    </div>
                    <button
                        onClick={handleAcceptTerms}
                        style={{ width: '100%', padding: '14px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        ยอมรับและดำเนินการต่อ
                    </button>
                </div>
            </div>
        );
    }

    // Step 2: User must grant required device permissions
    if (!locationGranted || !notificationGranted) {
        return (
            <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                <div style={{ background: '#111', padding: '30px', borderRadius: '16px', maxWidth: '400px', width: '100%', border: '1px solid #333' }}>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '8px', textAlign: 'center' }}>สิทธิ์การเข้าถึงที่จำเป็น</h2>
                    <p style={{ color: '#888', textAlign: 'center', fontSize: '0.9rem', marginBottom: '30px' }}>
                        กรุณาอนุญาตสิทธิ์เหล่านี้เพื่อใช้งานระบบติดตามรถอย่างสมบูรณ์
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '30px' }}>
                        {/* Location Check */}
                        <div
                            onClick={!locationGranted ? requestLocation : undefined}
                            style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '12px', background: locationGranted ? 'rgba(34, 197, 94, 0.1)' : '#1a1a1a', border: `1px solid ${locationGranted ? '#22C55E' : '#333'}`, cursor: locationGranted ? 'default' : 'pointer' }}
                        >
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: locationGranted ? '#22C55E' : '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: locationGranted ? 'white' : '#aaa' }}>
                                <MapPin size={20} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 'bold', fontSize: '1rem', color: locationGranted ? '#22C55E' : 'white' }}>ตำแหน่งที่ตั้ง (GPS)</div>
                                <div style={{ fontSize: '0.8rem', color: '#888' }}>เพื่อเช็คระยะทางระหว่างคุณกับรถ</div>
                            </div>
                            {locationGranted ? <CheckCircle2 size={20} color="#22C55E" /> : <ChevronRight size={20} color="#666" />}
                        </div>

                        {/* Notification Check */}
                        <div
                            onClick={!notificationGranted ? requestNotification : undefined}
                            style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '12px', background: notificationGranted ? 'rgba(34, 197, 94, 0.1)' : '#1a1a1a', border: `1px solid ${notificationGranted ? '#22C55E' : '#333'}`, cursor: notificationGranted ? 'default' : 'pointer' }}
                        >
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: notificationGranted ? '#22C55E' : '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: notificationGranted ? 'white' : '#aaa' }}>
                                <Bell size={20} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 'bold', fontSize: '1rem', color: notificationGranted ? '#22C55E' : 'white' }}>การแจ้งเตือน</div>
                                <div style={{ fontSize: '0.8rem', color: '#888' }}>เผื่อรับการแจ้งเตือนฉุกเฉิน</div>
                            </div>
                            {notificationGranted ? <CheckCircle2 size={20} color="#22C55E" /> : <ChevronRight size={20} color="#666" />}
                        </div>
                    </div>

                    {(!locationGranted || !notificationGranted) && (
                        <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span>หากคุณเคยกดปฏิเสธไปแล้ว กรุณาไปที่ตึ้งค่าเบราว์เซอร์เพื่อเปิดสิทธิ์ (Site Settings)</span>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // All conditions met, render children
    return <>{children}</>;
}
