"use client";
import { useState } from "react";
import { Settings, Check, Layout, Map, Car, MousePointer, Smartphone } from "lucide-react";

export default function DesignSurvey() {
    const [formData, setFormData] = useState({
        theme: "light",         // light, dark, glass
        cardStyle: "carousel",  // floating, bottom-sheet, carousel
        iconStyle: "3d-car",    // pin, 2d-top, 3d-car, arrow
        zoomLevel: "16",        // 14(City), 16(Street), 18(House)
        interaction: "click",   // auto-follow, click-focus, manual
        buttons: {
            navigate: true,
            call: true,
            history: false,
            share: false
        }
    });

    const [submitted, setSubmitted] = useState(false);

    const handleToggle = (key) => {
        setFormData(prev => ({
            ...prev,
            buttons: { ...prev.buttons, [key]: !prev.buttons[key] }
        }));
    };

    const Option = ({ label, value, current, onChange, icon: Icon }) => (
        <div
            onClick={() => onChange(value)}
            style={{
                padding: 15,
                border: current === value ? '2px solid #2563EB' : '1px solid #E5E7EB',
                borderRadius: 12,
                cursor: 'pointer',
                background: current === value ? '#EFF6FF' : 'white',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                flex: 1, minWidth: 100
            }}
        >
            {Icon && <Icon size={24} color={current === value ? '#2563EB' : '#6B7280'} />}
            <span style={{ fontWeight: current === value ? 'bold' : 'normal', color: '#1F2937' }}>{label}</span>
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: 20, fontFamily: 'sans-serif' }}>
            <div style={{ maxWidth: 600, margin: '0 auto', background: 'white', padding: 30, borderRadius: 24, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}>

                <div style={{ textAlign: 'center', marginBottom: 30 }}>
                    <Settings size={40} color="#2563EB" style={{ marginBottom: 10 }} />
                    <h1 style={{ fontSize: 24, fontWeight: 'bold' }}>ออกแบบ UI แอพของคุณ</h1>
                    <p style={{ color: '#6B7280' }}>เลือกสไตล์ที่ชอบ แล้วกด Submit ด้านล่าง</p>
                </div>

                <div style={styles.section}>
                    <h3 style={styles.head}><Layout size={18} /> รูปแบบการ์ด (Card Style)</h3>
                    <div style={styles.grid}>
                        <Option label="Floating (ลอย)" value="floating" current={formData.cardStyle} onChange={v => setFormData({ ...formData, cardStyle: v })} icon={Layout} />
                        <Option label="Info Sheet (ล่าง)" value="bottom-sheet" current={formData.cardStyle} onChange={v => setFormData({ ...formData, cardStyle: v })} icon={Layout} />
                        <Option label="Carousel (สไลด์)" value="carousel" current={formData.cardStyle} onChange={v => setFormData({ ...formData, cardStyle: v })} icon={Layout} />
                    </div>
                </div>

                <div style={styles.section}>
                    <h3 style={styles.head}><Car size={18} /> ไอคอนรถ (Marker Icon)</h3>
                    <div style={styles.grid}>
                        <Option label="Pin (หมุด)" value="pin" current={formData.iconStyle} onChange={v => setFormData({ ...formData, iconStyle: v })} icon={Map} />
                        <Option label="2D (มุมบน)" value="2d-top" current={formData.iconStyle} onChange={v => setFormData({ ...formData, iconStyle: v })} icon={Car} />
                        <Option label="3D (สมจริง)" value="3d-car" current={formData.iconStyle} onChange={v => setFormData({ ...formData, iconStyle: v })} icon={Car} />
                        <Option label="Arrow (ลูกศร)" value="arrow" current={formData.iconStyle} onChange={v => setFormData({ ...formData, iconStyle: v })} icon={MousePointer} />
                    </div>
                </div>

                <div style={styles.section}>
                    <h3 style={styles.head}><Map size={18} /> ระยะซูมเริ่มต้น (Default Zoom)</h3>
                    <div style={styles.grid}>
                        <Option label="ไกล (เมือง)" value="12" current={formData.zoomLevel} onChange={v => setFormData({ ...formData, zoomLevel: v })} icon={Map} />
                        <Option label="กลาง (ถนน)" value="15" current={formData.zoomLevel} onChange={v => setFormData({ ...formData, zoomLevel: v })} icon={Map} />
                        <Option label="ใกล้ (หลังคาบ้าน)" value="18" current={formData.zoomLevel} onChange={v => setFormData({ ...formData, zoomLevel: v })} icon={Map} />
                    </div>
                </div>

                <div style={styles.section}>
                    <h3 style={styles.head}><Smartphone size={18} /> ปุ่มฟังก์ชั่น (Function Buttons)</h3>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {Object.entries(formData.buttons).map(([key, val]) => (
                            <div key={key} onClick={() => handleToggle(key)}
                                style={{
                                    padding: '10px 20px', borderRadius: 20, cursor: 'pointer',
                                    border: val ? '2px solid #2563EB' : '1px solid #E5E7EB',
                                    background: val ? '#EFF6FF' : 'white',
                                    fontWeight: val ? 'bold' : 'normal',
                                    color: val ? '#2563EB' : '#6B7280'
                                }}
                            >
                                {key === 'navigate' ? 'นำทาง Google' :
                                    key === 'call' ? 'โทรออก' :
                                        key === 'history' ? 'ดูย้อนหลัง' : 'แชร์ตำแหน่ง'}
                                {val && <Check size={14} style={{ marginLeft: 5, display: 'inline' }} />}
                            </div>
                        ))}
                    </div>
                </div>

                <button
                    onClick={() => setSubmitted(true)}
                    style={{
                        width: '100%', padding: 15, background: '#2563EB', color: 'white',
                        border: 'none', borderRadius: 12, fontSize: 18, fontWeight: 'bold', cursor: 'pointer',
                        marginTop: 20
                    }}
                >
                    วิเคราะห์ & สร้าง UI 🚀
                </button>

                {submitted && (
                    <div style={{ marginTop: 30, padding: 20, background: '#1F2937', borderRadius: 12, color: '#A3E635', fontFamily: 'monospace' }}>
                        <h3 style={{ color: 'white', marginBottom: 10 }}>Result (Copy This):</h3>
                        <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(formData, null, 2)}</pre>
                    </div>
                )}

            </div>
        </div>
    );
}

const styles = {
    section: { marginBottom: 25 },
    head: { fontSize: 16, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, color: '#374151' },
    grid: { display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 5 }
};
