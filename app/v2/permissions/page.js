"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Bell, Shield, ArrowRight, XCircle } from "lucide-react";

export default function PermissionsPage() {
    const router = useRouter();
    const [status, setStatus] = useState("idle"); // idle, loading, denied, granted

    const requestPermissions = async () => {
        setStatus("loading");

        try {
            // 1. Request Location Permission
            const locationGranted = await new Promise((resolve) => {
                if (!navigator.geolocation) {
                    resolve(false);
                    return;
                }
                navigator.geolocation.getCurrentPosition(
                    () => resolve(true),
                    () => resolve(false),
                    { enableHighAccuracy: true, timeout: 5000 }
                );
            });

            // 2. Request Notification Permission (if supported)
            let notifGranted = true;
            if ("Notification" in window) {
                const permission = await Notification.requestPermission();
                if (permission === "denied") notifGranted = false;
            }

            if (locationGranted && notifGranted) {
                setStatus("granted");
                localStorage.setItem("v2_permissions_ok", "1");
                setTimeout(() => {
                    router.replace("/v2/policy");
                }, 1000);
            } else {
                setStatus("denied");
            }
        } catch (error) {
            console.error(error);
            setStatus("denied");
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 relative">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 z-10 text-center animate-slide-up border border-gray-100">
                <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Shield className="text-blue-600" size={32} />
                </div>

                <h1 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">ขออนุญาตเข้าถึงข้อมูล</h1>
                <p className="text-gray-500 mb-8 text-sm">
                    เพื่อให้แอปพลิเคชันทำงานได้อย่างสมบูรณ์ <br />กรุณาเปิดการเข้าถึงสิทธิ์ต่อไปนี้
                </p>

                <div className="space-y-4 mb-8 text-left">
                    <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <MapPin className="text-blue-500 mt-1" size={24} />
                        <div>
                            <h3 className="font-bold text-gray-900">ตำแหน่งที่ตั้ง (Location)</h3>
                            <p className="text-xs text-gray-500">จำเป็นอย่างยิ่งสำหรับการคำนวณระยะทางจากรถ และการใช้ฟีเจอร์นำทาง</p>
                        </div>
                    </div>

                    <div className="flex gap-4 items-start p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <Bell className="text-orange-500 mt-1" size={24} />
                        <div>
                            <h3 className="font-bold text-gray-900">การแจ้งเตือน (Notifications)</h3>
                            <p className="text-xs text-gray-500">เพื่อรับการแจ้งเตือนเมื่อรถเคลื่อนที่หรือเกิดเหตุการณ์ฉุกเฉิน</p>
                        </div>
                    </div>
                </div>

                {status === "denied" && (
                    <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm mb-6 flex gap-3 text-left">
                        <XCircle size={32} className="text-red-500 shrink-0" />
                        <div>
                            <p className="font-bold mb-1">ไม่สามารถขอสิทธิ์ได้</p>
                            <p className="text-xs">กรุณาไปที่ <span className="font-bold">การตั้งค่าเครื่อง (Settings)</span> เพื่ออนุญาตให้แอปพลิเคชันหรือเบราว์เซอร์เข้าถึงตำแหน่งและการแจ้งเตือนด้วยตนเอง แล้วลองอีกครั้ง</p>
                        </div>
                    </div>
                )}

                {status === "granted" ? (
                    <button className="w-full bg-green-500 text-white py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2">
                        สำเร็จแล้ว! กำลังไปต่อ... <ArrowRight size={20} />
                    </button>
                ) : (
                    <button
                        onClick={requestPermissions}
                        disabled={status === "loading"}
                        className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg shadow-blue-200 shadow-xl active:scale-95 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                        {status === "loading" ? "กำลังตรวจสอบ..." : "เข้าใจแล้วและอนุญาต"}
                    </button>
                )}
            </div>

            {/* Background Blob */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[30%] bg-blue-100 rounded-full blur-3xl opacity-50 -z-0" />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-100 to-transparent opacity-50 pointer-events-none" />
        </div>
    );
}
