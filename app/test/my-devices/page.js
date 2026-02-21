"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Search, Loader2, MapPin, Clock, ChevronRight, Car, User, ArrowLeft } from "lucide-react";

const SERVER_URL = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? window.location.origin
    : "http://143.14.200.117";

const DEFAULT_TEST_PHONE = "0900000000";

function formatTime(ts) {
    if (!ts) return "-";
    let d = ts;
    if (typeof d === 'string' && !d.includes('Z') && !d.includes('+')) d += 'Z';
    return new Date(d).toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

function MyDevicesContent() {
    const searchParams = useSearchParams();
    const phoneParam = searchParams.get('phone') || DEFAULT_TEST_PHONE;

    const [phone, setPhone] = useState(phoneParam);
    const [inputPhone, setInputPhone] = useState(phoneParam);
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchVehicles = async (phoneNum) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${SERVER_URL}/api/test/user-devices?phone=${encodeURIComponent(phoneNum)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setVehicles(data || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVehicles(phone);
    }, [phone]);

    const handleSearch = () => {
        if (inputPhone.trim()) {
            setPhone(inputPhone.trim());
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
            {/* Header */}
            <header style={{ background: '#111', borderBottom: '1px solid #222', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Link href="/test/dashboard" style={{ color: '#888', display: 'flex' }}><ArrowLeft size={20} /></Link>
                    <Car size={24} color="#818cf8" />
                    <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>
                        My Devices
                        <span style={{ fontSize: '0.7rem', background: '#F59E0B', color: 'black', padding: '2px 8px', borderRadius: '4px', marginLeft: '8px', verticalAlign: 'middle' }}>TEST</span>
                    </h1>
                </div>
            </header>

            <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
                {/* Phone Input */}
                <div style={{ marginBottom: '24px', background: '#111', borderRadius: '12px', padding: '20px', border: '1px solid #222' }}>
                    <label style={{ fontSize: '0.85rem', color: '#888', marginBottom: '8px', display: 'block' }}>
                        <User size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                        เบอร์โทรศัพท์ (User Token)
                    </label>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <input
                            type="tel"
                            value={inputPhone}
                            onChange={(e) => setInputPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            placeholder="เช่น 0812345678"
                            style={{
                                flex: 1, padding: '12px', background: '#1a1a1a',
                                border: '1px solid #333', borderRadius: '8px', color: 'white',
                                fontSize: '1rem', fontFamily: 'monospace', outline: 'none'
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                        <button
                            onClick={handleSearch}
                            style={{ background: '#3B82F6', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}
                        >
                            <Search size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> ค้นหา
                        </button>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#555', marginTop: '8px' }}>
                        💡 กรอกเบอร์โทรที่ลงทะเบียนไว้ หรือใช้ ?phone=xxx ใน URL
                    </p>
                </div>

                {/* Loading */}
                {loading && (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#888' }}>
                        <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                        <p>กำลังค้นหาอุปกรณ์...</p>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#EF4444' }}>
                        <p>❌ เกิดข้อผิดพลาด: {error}</p>
                        <button onClick={() => fetchVehicles(phone)} style={{ marginTop: '12px', background: '#333', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '8px', cursor: 'pointer' }}>ลองใหม่</button>
                    </div>
                )}

                {/* Empty State */}
                {!loading && !error && vehicles.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#666' }}>
                        <Car size={48} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
                        <p>ไม่พบอุปกรณ์สำหรับเบอร์ <span style={{ fontFamily: 'monospace', color: '#aaa' }}>{phone}</span></p>
                    </div>
                )}

                {/* Vehicle Cards */}
                {!loading && !error && vehicles.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <p style={{ fontSize: '0.85rem', color: '#888' }}>
                            พบ {vehicles.length} อุปกรณ์ สำหรับ <span style={{ fontFamily: 'monospace', color: '#aaa' }}>{phone}</span>
                        </p>
                        {vehicles.map((v) => (
                            <Link
                                key={v.device_id || v.id}
                                href={`/test/device/${encodeURIComponent(v.device_id)}`}
                                style={{ textDecoration: 'none', color: 'white' }}
                            >
                                <div style={{
                                    background: '#111', borderRadius: '12px', padding: '20px',
                                    border: '1px solid #222', cursor: 'pointer',
                                    transition: 'border-color 0.2s'
                                }}
                                    onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3B82F6'}
                                    onMouseLeave={(e) => e.currentTarget.style.borderColor = '#222'}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '6px' }}>
                                                🚗 {v.plate_number || 'ไม่ระบุทะเบียน'}
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: '#888', fontFamily: 'monospace', marginBottom: '8px' }}>
                                                {v.device_id}
                                            </div>
                                            {v.driver_name && (
                                                <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '4px' }}>
                                                    <User size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                                    {v.driver_name}
                                                </div>
                                            )}
                                        </div>
                                        <ChevronRight size={20} color="#555" />
                                    </div>
                                    {(v.lat || v.lng) && (
                                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #1a1a1a', display: 'flex', gap: '20px', fontSize: '0.8rem', color: '#888' }}>
                                            <span><MapPin size={12} style={{ verticalAlign: 'middle' }} /> {Number(v.lat).toFixed(5)}, {Number(v.lng).toFixed(5)}</span>
                                            <span><Clock size={12} style={{ verticalAlign: 'middle' }} /> {formatTime(v.last_update)}</span>
                                        </div>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </main>

            {/* Footer */}
            <div style={{ textAlign: 'center', padding: '20px', color: '#444', fontSize: '0.75rem' }}>
                🧪 Test Mode — No Authentication Required
            </div>
        </div>
    );
}

export default function TestMyDevices() {
    return (
        <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
            <MyDevicesContent />
        </Suspense>
    );
}
