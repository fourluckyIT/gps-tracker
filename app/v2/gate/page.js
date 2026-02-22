"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const SERVER_URL = typeof window !== 'undefined' ? window.location.origin : "http://143.14.200.117";

export default function V2GatePage() {
    const router = useRouter();
    const [status, setStatus] = useState("ตรวจสอบสถานะเริ่มต้น...");

    useEffect(() => {
        const checkFlow = async () => {
            try {
                // 1. Check Session (using existing mechanism)
                const sessionPhone = localStorage.getItem("user_phone");
                if (!sessionPhone) {
                    setStatus("กำลังไปยังหน้าเข้าสู่ระบบ");
                    router.replace("/v2/auth");
                    return;
                }

                // 2. Check Permissions
                const permissionsOk = localStorage.getItem("v2_permissions_ok");
                if (!permissionsOk) {
                    setStatus("กำลังตรวจสอบสิทธิ์การเข้าถึง");
                    router.replace("/v2/permissions");
                    return;
                }

                // 3. Check Policy
                const policyOk = localStorage.getItem("v2_policy_ok");
                if (!policyOk) {
                    setStatus("กำลังอัปเดตนโยบายการใช้งาน");
                    router.replace("/v2/policy");
                    return;
                }

                // 4. Fetch Vehicles
                setStatus("กำลังโหลดข้อมูลรถ...");
                const res = await fetch(`${SERVER_URL}/api/user/vehicles?token=${sessionPhone}`);

                if (!res.ok) {
                    throw new Error("API response error");
                }

                const data = await res.json();

                if (Array.isArray(data) && data.length > 0) {
                    setStatus("เข้าสู่ระบบเรียบร้อย!");
                    router.replace(`/v2/map?id=${data[0].device_id}`);
                } else {
                    setStatus("ไม่พบรถ กรุณาเพิ่มรถใหม่");
                    router.replace(`/v2/map?addVehicle=1`);
                }

            } catch (error) {
                console.error("Gate Flow Error:", error);
                // Fallback -> Usually clear session and auth if API error or 500, but here let's try auth
                // Or maybe just show an error.
                setStatus("เกิดข้อผิดพลาดในการโหลดข้อมูลรถ");
                setTimeout(() => {
                    router.replace("/v2/auth");
                }, 2000);
            }
        };

        checkFlow();
    }, [router]);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
            <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
            <h1 className="text-xl font-bold text-gray-900 mb-2">GPS Tracker V2</h1>
            <p className="text-gray-500 animate-pulse">{status}</p>
        </div>
    );
}
