"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CopyCheck, ArrowRight, FileText, ChevronRight, ChevronLeft, X } from "lucide-react";

export default function PolicyPage() {
    const router = useRouter();
    const [policyModalOpen, setPolicyModalOpen] = useState(false);

    // Auto-slide state
    const [slideIndex, setSlideIndex] = useState(0);
    const totalSlides = 3; // For demo purpose, we have 3 screens of policies

    useEffect(() => {
        let interval;
        if (policyModalOpen) {
            interval = setInterval(() => {
                setSlideIndex((prev) => (prev + 1) % totalSlides);
            }, 3000); // Auto slide every 3 seconds
        }
        return () => clearInterval(interval);
    }, [policyModalOpen, totalSlides]);

    const acceptPolicy = () => {
        localStorage.setItem("v2_policy_ok", "1");
        localStorage.setItem("v2_policy_version", "1.0");
        localStorage.setItem("v2_policy_accepted_at", new Date().toISOString());
        router.replace("/v2/gate");
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 relative">

            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 z-10 animate-slide-up">

                {/* Header Graphic */}
                <div className="bg-gradient-to-br from-blue-600 to-indigo-800 p-8 text-center relative overflow-hidden">
                    <div className="absolute top-[-20%] right-[-20%] w-32 h-32 bg-white/10 rounded-full blur-xl" />
                    <div className="absolute bottom-[-20%] left-[-20%] w-32 h-32 bg-white/10 rounded-full blur-xl" />

                    <div className="bg-white/20 p-4 rounded-2xl w-20 h-20 flex items-center justify-center mx-auto mb-4 backdrop-blur-md">
                        <FileText className="text-white" size={32} />
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tight">นโยบายความเป็นส่วนตัว</h1>
                    <p className="text-blue-100 text-sm mt-1">Version 1.0 (2025)</p>
                </div>

                <div className="p-8">
                    <div className="prose prose-sm text-gray-600 mb-6">
                        <p className="font-bold text-gray-900 mb-2">สรุปเงื่อนไขสำคัญ</p>
                        <ul className="list-disc pl-5 space-y-2 text-xs">
                            <li>เราจะจัดเก็บตำแหน่งที่ตั้งของรถคุณเพื่อให้บริการติดตาม GPS </li>
                            <li>ข้อมูลทั้งหมดจะถูกเข้ารหัสและไม่ถูกส่งต่อให้บุคคลที่สามเพื่อการโฆษณา</li>
                            <li>ผู้ใช้งานสามารถขอลบข้อมูลบัญชีของตนเองได้ตลอดเวลาตามพ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA)</li>
                        </ul>
                    </div>

                    <button
                        onClick={() => {
                            setSlideIndex(0);
                            setPolicyModalOpen(true);
                        }}
                        className="text-blue-600 text-sm font-bold flex items-center justify-center w-full py-3 mb-6 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
                    >
                        ดูนโยบายฉบับเต็มแบบละเอียด
                    </button>

                    <button
                        onClick={acceptPolicy}
                        className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <CopyCheck size={20} /> ฉันได้อ่านและยอมรับ
                    </button>
                </div>
            </div>

            {/* --- POLICY MODAL WITH AUTO SLIDE --- */}
            {policyModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative flex flex-col h-[60vh]">

                        {/* Modal Header */}
                        <div className="flex justify-between items-center p-4 border-b border-gray-100">
                            <h3 className="font-bold text-gray-900">เอกสาร PDPA ฉบับเต็ม</h3>
                            <button onClick={() => setPolicyModalOpen(false)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:text-gray-900">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Content / Carousel View */}
                        <div className="flex-1 relative overflow-hidden bg-gray-50">

                            {/* Slides Container */}
                            <div
                                className="flex h-full transition-transform duration-500 ease-in-out"
                                style={{ transform: `translateX(-${slideIndex * 100}%)` }}
                            >
                                {/* Slide 1 */}
                                <div className="min-w-full h-full p-6 overflow-y-auto">
                                    <div className="w-16 h-1 bg-blue-600 rounded-full mb-4"></div>
                                    <h2 className="text-xl font-black mb-3 text-gray-900">ส่วนที่ 1: การเก็บข้อมูล</h2>
                                    <p className="text-sm text-gray-600 leading-relaxed mb-4">
                                        เรามีการรวบรวมข้อมูลส่วนบุคคล เช่น ชื่อ เบอร์โทรศัพท์ อีเมล และตำแหน่งของอุปกรณ์ GPS ข้อมูลนี้จะถูกเก็บรวบรวมผ่านการลงทะเบียนและการใช้งานปกติ...
                                        (ข้อความจำลอง)
                                    </p>
                                    <p className="text-sm text-gray-600 leading-relaxed indent-4">
                                        รวมไปถึงการจับพฤติกรรมการเคลื่อนที่ของรถยนต์เพื่อจัดทำเป็นประวัติการขับขี่ (History Logs) แก่บัญชีของท่านเท่านั้น
                                    </p>
                                </div>

                                {/* Slide 2 */}
                                <div className="min-w-full h-full p-6 overflow-y-auto">
                                    <div className="w-16 h-1 bg-green-500 rounded-full mb-4"></div>
                                    <h2 className="text-xl font-black mb-3 text-gray-900">ส่วนที่ 2: การใช้ข้อมูล</h2>
                                    <p className="text-sm text-gray-600 leading-relaxed mb-4">
                                        เราจะนำข้อมูลของท่านไปใช้วิเคราะห์การทำงานของระบบ การติดตามรถในแบบเรียลไทม์ และการแจ้งเตือนภัยต่างๆ เช่น รถออกนอกพื้นที่ หรือถูกขโมย...
                                    </p>
                                    <p className="text-sm text-gray-600 leading-relaxed indent-4">
                                        ไม่ขายข้อมูลให้บุคคลภายนอก ไม่แชร์ให้เอเจนซี่โฆษณา ข้อมูลที่เก็บทั้งหมดถูกจำกัดการเข้าถึงเฉพาะเจ้าหน้าที่ Support ระดับสูง เมื่อท่านร้องขอให้ช่วยเหลือเท่านั้น
                                    </p>
                                </div>

                                {/* Slide 3 */}
                                <div className="min-w-full h-full p-6 overflow-y-auto">
                                    <div className="w-16 h-1 bg-orange-500 rounded-full mb-4"></div>
                                    <h2 className="text-xl font-black mb-3 text-gray-900">ส่วนที่ 3: สิทธิของเจ้าของข้อมูล</h2>
                                    <p className="text-sm text-gray-600 leading-relaxed mb-4">
                                        ท่านมีสิทธิเรียกร้องตาม พรบ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) รวมถึงสิทธิในการขอเข้าถึง แก้ไข ลบ (Right to be Forgotten) หรือโอนย้ายข้อมูลของท่าน...
                                    </p>
                                    <p className="text-sm text-gray-600 leading-relaxed indent-4">
                                        สามารถลบบัญชีของท่านได้ผ่านแอป หรือติดต่อผู้ดูแลระบบได้ตลอดเวลา ข้อมูลจะถูกทำลายทิ้งภายใน 30 วันหลังจากการร้องขอ!
                                    </p>
                                </div>
                            </div>

                            {/* Manual Controls */}
                            <button
                                onClick={() => setSlideIndex(prev => prev === 0 ? totalSlides - 1 : prev - 1)}
                                className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 p-2 rounded-full shadow-md text-gray-700 hover:text-blue-600 backdrop-blur-sm"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <button
                                onClick={() => setSlideIndex(prev => (prev + 1) % totalSlides)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 p-2 rounded-full shadow-md text-gray-700 hover:text-blue-600 backdrop-blur-sm"
                            >
                                <ChevronRight size={20} />
                            </button>

                            {/* Dots */}
                            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                                {[0, 1, 2].map(dot => (
                                    <div
                                        key={dot}
                                        className={`h-2 rounded-full transition-all ${slideIndex === dot ? 'w-6 bg-blue-600' : 'w-2 bg-gray-300'}`}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-gray-100 bg-white">
                            <button
                                onClick={() => setPolicyModalOpen(false)}
                                className="w-full bg-gray-100 text-gray-900 py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                            >
                                เข้าใจแล้ว ปิดหน้าต่างนี้
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
