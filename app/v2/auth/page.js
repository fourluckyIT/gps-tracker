"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toaster, toast } from "react-hot-toast";
import { Mail, Phone, Lock, User, ArrowRight, Loader2, CheckSquare, X } from "lucide-react";

// --- CONFIG ---
const SERVER_URL = typeof window !== 'undefined' ? window.location.origin : "http://143.14.200.117";

export default function V2Auth() {
    const router = useRouter();

    // State
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);

    // Login State
    const [loginId, setLoginId] = useState(""); // Can be phone or email
    const [loginPassword, setLoginPassword] = useState("");

    // Register State
    const [regForm, setRegForm] = useState({
        email: "",
        phone: "",
        name: "",
        password: "",
        acceptedTerms: false
    });

    // Policy Modal State
    const [policyModalOpen, setPolicyModalOpen] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!loginId) return toast.error("กรุณากรอกเบอร์โทรศัพท์หรืออีเมล");
        if (!loginPassword) return toast.error("กรุณากรอกรหัสผ่าน");

        setLoading(true);
        try {
            // Check if user exists (Current backend mechanism relies on phone)
            // Mocking Password check since backend doesn't support it yet
            const isPhone = /^\d+$/.test(loginId);
            const userPhone = isPhone ? loginId : loginId; // Mock mapping email to phone if needed

            const res = await fetch(`${SERVER_URL}/api/user/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone_number: userPhone })
            });
            const data = await res.json();

            if (data.exists) {
                // Success -> Save & Redirect (Current mechanism)
                localStorage.setItem("user_phone", userPhone);
                toast.success("เข้าสู่ระบบสำเร็จ!");
                router.replace(`/v2/gate`);
            } else {
                toast("ไม่พบผู้ใช้งานในระบบ กรุณาลงทะเบียน", { icon: "📝" });
                setIsLogin(false);
                setLoading(false);
            }
        } catch (err) {
            console.error(err);
            toast.error("เชื่อมต่อ Server ไม่ได้");
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (!regForm.email || !regForm.phone || !regForm.name || !regForm.password) {
            return toast.error("กรุณากรอกข้อมูลให้ครบถ้วน");
        }
        if (!regForm.acceptedTerms) {
            return toast.error("กรุณายอมรับเงื่อนไขและนโยบายความเป็นส่วนตัว");
        }

        setLoading(true);
        try {
            // Note: In a real scenario, you'd send all this to the backend.
            // But we keep the current registration mock compatible with old backend 
            // by skipping credential pairing here and just registering the phone.
            localStorage.setItem("user_phone", regForm.phone);
            toast.success("ลงทะเบียนสำเร็จ!");
            router.replace(`/v2/gate`);
        } catch (err) {
            toast.error("เกิดข้อผิดพลาด");
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            <Toaster position="top-center" />

            {/* Background Decoration */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[30%] bg-blue-100 rounded-full blur-3xl opacity-50" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[30%] bg-purple-100 rounded-full blur-3xl opacity-50" />

            {/* Auth Container */}
            <div className="w-full max-w-md z-10 bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">

                {/* Header Toggle */}
                <div className="flex border-b border-gray-100">
                    <button
                        className={`flex-1 py-4 font-bold text-center transition-colors ${isLogin ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 bg-gray-50 hover:text-gray-600'}`}
                        onClick={() => setIsLogin(true)}
                    >
                        เข้าสู่ระบบ
                    </button>
                    <button
                        className={`flex-1 py-4 font-bold text-center transition-colors ${!isLogin ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 bg-gray-50 hover:text-gray-600'}`}
                        onClick={() => setIsLogin(false)}
                    >
                        ลงทะเบียนใหม่
                    </button>
                </div>

                <div className="p-8">
                    {/* Header Details */}
                    <div className="text-center mb-8">
                        <div className="bg-gray-50 p-3 rounded-2xl inline-block mb-4 shadow-inner">
                            <img src="/logo.png" alt="Logo" className="w-16 h-16 object-contain mx-auto mix-blend-multiply rounded-xl" onError={(e) => e.target.style.display = 'none'} />
                        </div>
                        <h1 className="text-2xl font-black text-gray-900 mb-1 tracking-tight">GPS Tracker V2</h1>
                        <p className="text-sm text-gray-500">{isLogin ? "เข้าสู่ระบบเพื่อติดตามรถของคุณ" : "สร้างบัญชีใหม่เพื่อเริ่มต้นใช้งาน"}</p>
                    </div>

                    {/* LOGIN FORM */}
                    {isLogin && (
                        <form onSubmit={handleLogin} className="space-y-4 animate-slide-up">
                            <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center gap-3">
                                <User className="text-gray-400" size={20} />
                                <input
                                    type="text"
                                    placeholder="เบอร์โทรศัพท์ หรือ อีเมล"
                                    className="flex-1 outline-none bg-transparent placeholder:text-gray-400 font-medium"
                                    value={loginId}
                                    onChange={(e) => setLoginId(e.target.value)}
                                />
                            </div>

                            <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center gap-3">
                                <Lock className="text-gray-400" size={20} />
                                <input
                                    type="password"
                                    placeholder="รหัสผ่าน"
                                    className="flex-1 outline-none bg-transparent placeholder:text-gray-400 font-medium"
                                    value={loginPassword}
                                    onChange={(e) => setLoginPassword(e.target.value)}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold mt-4 shadow-blue-200 shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : <>เข้าสู่ระบบ <ArrowRight size={20} /></>}
                            </button>
                        </form>
                    )}

                    {/* REGISTER FORM */}
                    {!isLogin && (
                        <form onSubmit={handleRegister} className="space-y-4 animate-slide-up">
                            <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center gap-3">
                                <User className="text-blue-500" size={20} />
                                <input
                                    type="text"
                                    placeholder="ชื่อ-นามสกุล"
                                    className="flex-1 outline-none bg-transparent placeholder:text-gray-400 text-sm"
                                    value={regForm.name}
                                    onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                                />
                            </div>

                            <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center gap-3">
                                <Phone className="text-green-500" size={20} />
                                <input
                                    type="tel"
                                    placeholder="เบอร์โทรศัพท์ (ใช้เป็นไอดีหลัก)"
                                    className="flex-1 outline-none bg-transparent placeholder:text-gray-400 text-sm"
                                    value={regForm.phone}
                                    onChange={(e) => setRegForm({ ...regForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                                />
                            </div>

                            <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center gap-3">
                                <Mail className="text-orange-500" size={20} />
                                <input
                                    type="email"
                                    placeholder="อีเมล"
                                    className="flex-1 outline-none bg-transparent placeholder:text-gray-400 text-sm"
                                    value={regForm.email}
                                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                                />
                            </div>

                            <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center gap-3">
                                <Lock className="text-gray-500" size={20} />
                                <input
                                    type="password"
                                    placeholder="รหัสผ่าน"
                                    className="flex-1 outline-none bg-transparent placeholder:text-gray-400 text-sm"
                                    value={regForm.password}
                                    onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                                />
                            </div>

                            <div className="flex items-start gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setRegForm({ ...regForm, acceptedTerms: !regForm.acceptedTerms })}
                                    className="mt-1"
                                >
                                    <CheckSquare size={20} className={regForm.acceptedTerms ? "text-blue-600" : "text-gray-300"} />
                                </button>
                                <label className="text-xs text-gray-500 cursor-pointer">
                                    <span onClick={() => setRegForm({ ...regForm, acceptedTerms: !regForm.acceptedTerms })}>ฉันได้อ่านและยอมรับ </span>
                                    <span className="text-blue-600 font-medium hover:underline" onClick={(e) => { e.preventDefault(); setPolicyModalOpen(true); }}>เงื่อนไขการให้บริการ (Terms of Service)</span>
                                    <span onClick={() => setRegForm({ ...regForm, acceptedTerms: !regForm.acceptedTerms })}> และ </span>
                                    <span className="text-blue-600 font-medium hover:underline" onClick={(e) => { e.preventDefault(); setPolicyModalOpen(true); }}>นโยบายความเป็นส่วนตัว (Privacy Policy / PDPA)</span>
                                </label>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-black text-white py-4 rounded-2xl font-bold mt-2 shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : "ลงทะเบียนและเริ่มใช้งาน"}
                            </button>
                        </form>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="mt-8 text-center text-xs text-gray-400">
                <p>ระบบความปลอดภัยได้รับการปกป้องโดย GPS Tracker V2</p>
            </div>

            {/* POLICY MODAL */}
            {policyModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative flex flex-col max-h-[70vh]">
                        <div className="flex justify-between items-center p-4 border-b border-gray-100">
                            <h3 className="font-bold text-gray-900">เงื่อนไขและนโยบาย</h3>
                            <button onClick={() => setPolicyModalOpen(false)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:text-gray-900 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto text-sm text-gray-600 space-y-4">
                            <p>
                                <strong>1. การเก็บและใช้ข้อมูล:</strong> ทางเราจะจัดเก็บข้อมูลส่วนบุคคลและตำแหน่งที่ตั้งของรถเพื่อนำไปใช้ในการให้บริการติดตาม GPS แก่ผู้ใช้งานเท่านั้น และจะไม่ส่งต่อข้อมูลให้บุคคลที่สามเพื่อการโฆษณา
                            </p>
                            <p>
                                <strong>2. ความปลอดภัยของข้อมูล:</strong> ทางเราใช้มาตรการรักษาความปลอดภัยตามมาตรฐาน เพื่อป้องกันการเข้าถึงและนำข้อมูลไปใช้โดยไม่ได้รับอนุญาต
                            </p>
                            <p>
                                <strong>3. สิทธิของผู้ใช้:</strong> ท่านสามารถร้องขอให้ลบข้อมูลส่วนบุคคลและระงับการให้บริการได้ตลอดเวลา ผ่านช่องทางการติดต่อกับผู้ดูแลระบบ
                            </p>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50 text-center">
                            <button onClick={() => setPolicyModalOpen(false)} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors">
                                ปิดหน้าต่าง
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
