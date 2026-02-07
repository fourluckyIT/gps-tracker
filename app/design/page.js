"use client";
import { useState } from 'react';
import {
    Layout, Smartphone, Palette, List, MousePointer,
    CheckCircle, Play, Save, Code
} from 'lucide-react';

export default function DesignBuilder() {
    const [prefs, setPrefs] = useState({
        theme: 'light',
        cardStyle: 'swipe', // swipe, list, grid
        mapStyle: 'google-standard',
        navStyle: 'bottom-bar', // bottom-bar, hamburger, floating
        features: {
            realtime: false,
            history: true,
            alert: true,
            grouping: false
        }
    });

    const [submitted, setSubmitted] = useState(null);

    const handleSubmit = () => {
        // In a real scenario, this could save to a file
        setSubmitted(JSON.stringify(prefs, null, 2));
        console.log("DESIGN_REQUIREMENTS:", JSON.stringify(prefs));
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8 font-sans text-gray-800">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
                    <Palette size={32} className="text-blue-600" /> UI/UX Builder
                </h1>
                <p className="text-gray-500 mb-8">ตอบคำถามเพื่อสร้าง Mockup ที่ตรงใจที่สุด</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                    {/* 1. Theme Selection */}
                    <Section title="1. ธีมและสี (Theme)" icon={<Palette />}>
                        <RadioGroup
                            label="เลือกโหมดหลัก"
                            options={[
                                { value: 'light', label: 'Light Clean (สว่าง ขาวๆ)', icon: '☀️' },
                                { value: 'dark', label: 'Dark Premium (มืด ดำ/น้ำเงิน)', icon: '🌙' },
                                { value: 'glass', label: 'Glassmorphism (กระจกใสเบลอ)', icon: '🧊' }
                            ]}
                            selected={prefs.theme}
                            onChange={v => setPrefs({ ...prefs, theme: v })}
                        />
                    </Section>

                    {/* 2. Card Style */}
                    <Section title="2. รูปแบบการแสดงผลรถ (Card)" icon={<Layout />}>
                        <RadioGroup
                            label="เมื่อมีรถหลายคัน จะเลือกยังไง?"
                            options={[
                                { value: 'swipe', label: 'Swipe Cards (สไลด์ซ้ายขวาแบบ Grab)', icon: '↔️' },
                                { value: 'list', label: 'List View (รายชื่อยาวลงมา)', icon: '⬇️' },
                                { value: 'modal', label: 'Modal Popup (กดปุ่มแล้วเด้งรายการ)', icon: '💬' }
                            ]}
                            selected={prefs.cardStyle}
                            onChange={v => setPrefs({ ...prefs, cardStyle: v })}
                        />
                    </Section>

                    {/* 3. Interaction */}
                    <Section title="3. การควบคุม (Navigation)" icon={<MousePointer />}>
                        <RadioGroup
                            label="เมนูหลักอยู่ตรงไหน?"
                            options={[
                                { value: 'hamburger', label: 'Hamburger Menu (มุมซ้ายบน)', icon: '🍔' },
                                { value: 'bottom-bar', label: 'Bottom Bar (แถบล่างไอคอน)', icon: '📱' },
                                { value: 'floating', label: 'Floating Island (ลอยๆ สไตล์ iPhone)', icon: '🏝️' }
                            ]}
                            selected={prefs.navStyle}
                            onChange={v => setPrefs({ ...prefs, navStyle: v })}
                        />
                    </Section>

                    {/* 4. Features */}
                    <Section title="4. ฟีเจอร์ที่เน้น (Function)" icon={<List />}>
                        <div className="space-y-3">
                            <Checkbox
                                label="เน้น Realtime (รถวิ่งดุ๊กดิ๊กตลอด)"
                                checked={prefs.features.realtime}
                                onChange={c => setPrefs({ ...prefs, features: { ...prefs.features, realtime: c } })}
                            />
                            <Checkbox
                                label="เน้นดู History/Status (จอดนานแค่ไหน)"
                                checked={prefs.features.history}
                                onChange={c => setPrefs({ ...prefs, features: { ...prefs.features, history: c } })}
                            />
                            <Checkbox
                                label="แจ้งเตือนเด่นๆ (Alert Popups)"
                                checked={prefs.features.alert}
                                onChange={c => setPrefs({ ...prefs, features: { ...prefs.features, alert: c } })}
                            />
                        </div>
                    </Section>

                </div>

                {/* Submit */}
                <div className="mt-10 p-6 bg-white rounded-xl shadow-lg border border-gray-200">
                    <button
                        onClick={handleSubmit}
                        className="w-full bg-black text-white py-4 rounded-xl text-xl font-bold hover:bg-gray-800 transition flex items-center justify-center gap-2"
                    >
                        <Save size={24} /> บันทึกความต้องการ (Analyze)
                    </button>

                    {submitted && (
                        <div className="mt-6 p-4 bg-gray-100 rounded-lg font-mono text-sm overflow-auto animation-fade-in relative">
                            <h3 className="font-bold text-gray-500 mb-2 flex items-center gap-2"><Code size={16} /> Generated JSON Requirement:</h3>
                            <pre>{submitted}</pre>
                            <p className="mt-2 text-green-600 font-bold">✅ บันทึกแล้ว! ผมจะใช้ข้อมูลนี้ปรับจูนแอพต่อครับ</p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}

// --- Components ---

function Section({ title, icon, children }) {
    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-700">
                {icon} {title}
            </h2>
            {children}
        </div>
    );
}

function RadioGroup({ options, selected, onChange }) {
    return (
        <div className="space-y-3">
            {options.map((opt) => (
                <div
                    key={opt.value}
                    onClick={() => onChange(opt.value)}
                    className={`flex items-center p-3 rounded-xl cursor-pointer transition border-2 ${selected === opt.value
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-transparent bg-gray-50 hover:bg-gray-100'
                        }`}
                >
                    <div className="text-2xl mr-3">{opt.icon}</div>
                    <div className="flex-1 font-medium">{opt.label}</div>
                    {selected === opt.value && <CheckCircle size={20} className="text-blue-500" />}
                </div>
            ))}
        </div>
    );
}

function Checkbox({ label, checked, onChange }) {
    return (
        <div
            onClick={() => onChange(!checked)}
            className={`flex items-center p-3 rounded-xl cursor-pointer transition border-2 ${checked
                    ? 'border-green-500 bg-green-50'
                    : 'border-transparent bg-gray-50 hover:bg-gray-100'
                }`}
        >
            <div className={`w-6 h-6 rounded-md border-2 mr-3 flex items-center justify-center ${checked ? 'bg-green-500 border-green-500' : 'border-gray-300 bg-white'
                }`}>
                {checked && <CheckCircle size={16} className="text-white" />}
            </div>
            <div className="font-medium text-gray-700">{label}</div>
        </div>
    );
}
