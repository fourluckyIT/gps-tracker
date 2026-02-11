"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Toaster, toast } from "react-hot-toast";
import { Smartphone, Key, Car, ArrowRight, Loader2 } from "lucide-react";

// --- CONFIG ---
const SERVER_URL = typeof window !== 'undefined' ? window.location.origin : "http://143.14.200.117";

export default function MobileLogin() {
    const router = useRouter();

    // State
    const [step, setStep] = useState(0); // 0=Loading, 1=Login, 2=Register
    const [loading, setLoading] = useState(true);
    const [phone, setPhone] = useState("");
    const [regForm, setRegForm] = useState({ code: "", plate: "", driver: "" });

    // 1. AUTO-LOGIN CHECK
    useEffect(() => {
        const checkSession = async () => {
            const savedPhone = localStorage.getItem("user_phone");
            if (savedPhone) {
                try {
                    const res = await fetch(`${SERVER_URL}/api/user/vehicles?token=${savedPhone}`);
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        router.replace(`/map?id=${data[0].device_id}`);
                        return;
                    }
                } catch (e) {
                    console.error("Auto-login failed", e);
                }
            }
            // If no session or invalid
            setLoading(false);
            setStep(1); // Go to Login
        };

        checkSession();
    }, [router]);

    // 2. HANDLERS
    const handleLogin = async () => {
        if (!phone || phone.length < 9) return toast.error("กรุณากรอกเบอร์โทรศัพท์");

        setLoading(true);
        try {
            // Check if user exists
            const res = await fetch(`${SERVER_URL}/api/user/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone_number: phone })
            });
            const data = await res.json();

            if (data.exists) {
                // Success -> Save & Redirect
                localStorage.setItem("user_phone", phone);
                // Fetch first vehicle to redirect
                const vRes = await fetch(`${SERVER_URL}/api/user/vehicles?token=${phone}`);
                const vData = await vRes.json();
                if (vData.length > 0) {
                    toast.success("ยินดีต้อนรับกลับ!");
                    router.replace(`/map?id=${vData[0].device_id}`);
                } else {
                    toast.error("ไม่พบรถในระบบ");
                    setLoading(false);
                }
            } else {
                // Not found -> Go to Register
                toast("ไม่พบเบอร์นี้ในระบบ กรุณาลงทะเบียน", { icon: "📝" });
                setStep(2);
                setLoading(false);
            }
        } catch (err) {
            console.error(err);
            toast.error("เชื่อมต่อ Server ไม่ได้");
            setLoading(false);
        }
    };

    const handleRegister = async () => {
        if (!regForm.code || !regForm.plate || !regForm.driver) return toast.error("กรุณากรอกข้อมูลให้ครบ");

        setLoading(true);
        try {
            const res = await fetch(`${SERVER_URL}/api/user/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: regForm.code.toUpperCase(),
                    plate_number: regForm.plate,
                    driver_name: regForm.driver,
                    phone_number: phone
                })
            });
            const data = await res.json();

            if (data.success) {
                toast.success("ลงทะเบียนสำเร็จ!");
                localStorage.setItem("user_phone", phone);
                // Redirect
                const deviceId = data.device_id;
                if (deviceId) {
                    router.replace(`/map?id=${deviceId}`);
                } else {
                    // Fallback fetch if API doesn't return ID directly
                    const vRes = await fetch(`${SERVER_URL}/api/user/vehicles?token=${phone}`);
                    const vData = await vRes.json();
                    if (vData.length > 0) router.replace(`/map?id=${vData[0].device_id}`);
                }
            } else {
                toast.error(data.error || "ลงทะเบียนไม่สำเร็จ");
                setLoading(false);
            }
        } catch (err) {
            toast.error("เกิดข้อผิดพลาด");
            setLoading(false);
        }
    };

    // --- RENDER ---
    if (loading && step === 0) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-white text-blue-600">
                <Loader2 size={48} className="animate-spin mb-4" />
                <p className="font-bold text-lg animate-pulse">กำลังเข้าสู่ระบบ...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            <Toaster position="top-center" />

            {/* Background Decoration */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[30%] bg-blue-100 rounded-full blur-3xl opacity-50" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[30%] bg-purple-100 rounded-full blur-3xl opacity-50" />

            {/*  STEP 1: LOGIN (PHONE) */}
            {step === 1 && (
                <div className="w-full max-w-sm z-10 animate-slide-up">
                    <div className="text-center mb-10">
                        <div className="bg-white p-4 rounded-3xl shadow-xl inline-block mb-4">
                            <img src="/logo.png" alt="Logo" className="w-20 h-20 object-contain mx-auto" />
                        </div>
                        <h1 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">GPS Tracker</h1>
                        <p className="text-gray-500">เข้าสู่ระบบเพื่อติดตามรถของคุณ</p>
                    </div>

                    <div className="bg-white p-2 rounded-2xl shadow-lg border border-gray-100 mb-6">
                        <input
                            type="tel"
                            placeholder="เบอร์โทรศัพท์ (เช่น 0812345678)"
                            className="w-full p-4 text-xl font-bold text-center outline-none bg-transparent placeholder:font-normal placeholder:text-gray-300"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            autoFocus
                        />
                    </div>

                    <button
                        onClick={handleLogin}
                        disabled={phone.length < 9 || (loading && step === 1)}
                        className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg shadow-blue-200 shadow-xl active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <>เข้าสู่ระบบ <ArrowRight /></>}
                    </button>
                </div>
            )}

            {/* STEP 2: REGISTER (CREDENTIAL) */}
            {step === 2 && (
                <div className="w-full max-w-sm z-10 animate-slide-up">
                    <button onClick={() => setStep(1)} className="text-sm text-gray-400 mb-6 flex items-center gap-1">
                        ← กลับ
                    </button>

                    <h2 className="text-2xl font-bold text-gray-900 mb-2">ลงทะเบียนใหม่ ✨</h2>
                    <p className="text-gray-500 mb-8">กรอกรหัสจากข้างกล่องอุปกรณ์ GPS</p>

                    <div className="space-y-4">
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
                            <Key className="text-orange-500" />
                            <input
                                className="flex-1 outline-none font-mono font-bold uppercase text-lg placeholder:normal-case placeholder:font-sans placeholder:text-sm"
                                placeholder="Credential Code (Ex. A1B2C3)"
                                value={regForm.code}
                                onChange={(e) => setRegForm({ ...regForm, code: e.target.value })}
                            />
                        </div>

                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
                            <Car className="text-blue-500" />
                            <input
                                className="flex-1 outline-none font-bold text-lg placeholder:font-normal placeholder:text-sm"
                                placeholder="เลขทะเบียนรถ (เช่น กก-1234)"
                                value={regForm.plate}
                                onChange={(e) => setRegForm({ ...regForm, plate: e.target.value })}
                            />
                        </div>

                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
                            <Smartphone className="text-gray-400" />
                            <input
                                className="flex-1 outline-none font-medium placeholder:text-sm"
                                placeholder="ชื่อผู้ขับขี่"
                                value={regForm.driver}
                                onChange={(e) => setRegForm({ ...regForm, driver: e.target.value })}
                            />
                        </div>

                        <button
                            onClick={handleRegister}
                            disabled={loading && step === 2}
                            className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg shadow-xl mt-4 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : "ลงทะเบียนและเริ่มใช้งาน"}
                        </button>
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="absolute bottom-6 text-center w-full">
                <p className="text-xs text-gray-300">GPS Tracker System v1.0</p>
            </div>
        </div>
    );
}
