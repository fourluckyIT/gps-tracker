"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Loader2, Wifi, WifiOff, MapPin, Clock, ChevronRight, LayoutDashboard, Car } from "lucide-react";

const SERVER_URL = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? window.location.origin
    : "http://143.14.200.117";

const STATUS_CONFIG = {
    'STOLEN': { color: '#EF4444', bg: '#FEE2E2', label: '🚨 ถูกขโมย' },
    'CRASH': { color: '#F97316', bg: '#FFEDD5', label: '💥 อุบัติเหตุ' },
    'NORMAL': { color: '#22C55E', bg: '#DCFCE7', label: '✅ ปกติ' },
    'PARKED': { color: '#3B82F6', bg: '#DBEAFE', label: '🅿️ จอดรถ' },
    'UNKNOWN': { color: '#6B7280', bg: '#F3F4F6', label: '❓ ไม่ทราบ' },
};

function getStatusConfig(status) {
    if (!status) return STATUS_CONFIG['UNKNOWN'];
    const s = String(status).toUpperCase();
    return STATUS_CONFIG[s] || STATUS_CONFIG['UNKNOWN'];
}

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

export default function TestDashboard() {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");

    useEffect(() => {
        fetchDevices();
    }, []);

    const fetchDevices = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${SERVER_URL}/api/test/devices`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setDevices(data || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const filtered = devices.filter(d => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            (d.device_id && d.device_id.toLowerCase().includes(q)) ||
            (d.owner_name && d.owner_name.toLowerCase().includes(q)) ||
            (d.license_plate && d.license_plate.toLowerCase().includes(q)) ||
            (d.credential_code && d.credential_code.toLowerCase().includes(q))
        );
    });

    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
            {/* Header */}
            <header style={{ background: '#111', borderBottom: '1px solid #222', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <LayoutDashboard size={24} color="#3B82F6" />
                    <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>
                        Test Dashboard
                        <span style={{ fontSize: '0.7rem', background: '#F59E0B', color: 'black', padding: '2px 8px', borderRadius: '4px', marginLeft: '8px', verticalAlign: 'middle' }}>NO AUTH</span>
                    </h1>
                </div>
            </header>

            <main style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
                {/* Search Bar */}
                <div style={{ marginBottom: '20px', position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
                    <input
                        type="text"
                        placeholder="ค้นหาด้วย Device ID, ชื่อเจ้าของ, ทะเบียน หรือ Credential..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            width: '100%', padding: '12px 12px 12px 42px', background: '#1a1a1a',
                            border: '1px solid #333', borderRadius: '12px', color: 'white',
                            fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none'
                        }}
                    />
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                    <StatCard label="ทั้งหมด" value={devices.length} color="#3B82F6" />
                    <StatCard label="ปกติ" value={devices.filter(d => d.status === 'NORMAL').length} color="#22C55E" />
                    <StatCard label="จอดรถ" value={devices.filter(d => d.status === 'PARKED' || !d.status).length} color="#6B7280" />
                    <StatCard label="แจ้งเตือน" value={devices.filter(d => d.status === 'STOLEN' || d.status === 'CRASH').length} color="#EF4444" />
                </div>

                {/* Loading / Error */}
                {loading && (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#888' }}>
                        <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                        <p>กำลังโหลดข้อมูล...</p>
                    </div>
                )}

                {error && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#EF4444' }}>
                        <p>❌ เกิดข้อผิดพลาด: {error}</p>
                        <button onClick={fetchDevices} style={{ marginTop: '12px', background: '#333', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '8px', cursor: 'pointer' }}>ลองใหม่</button>
                    </div>
                )}

                {/* Empty State */}
                {!loading && !error && filtered.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#666' }}>
                        <Car size={48} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
                        <p>{search ? 'ไม่พบอุปกรณ์ที่ค้นหา' : 'ยังไม่มีอุปกรณ์'}</p>
                    </div>
                )}

                {/* Device Table */}
                {!loading && !error && filtered.length > 0 && (
                    <div style={{ background: '#111', borderRadius: '12px', overflow: 'hidden', border: '1px solid #222' }}>
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid #222', fontWeight: 'bold', fontSize: '0.9rem', color: '#aaa' }}>
                            📋 อุปกรณ์ ({filtered.length}{search ? ` / ${devices.length}` : ''})
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                                <thead>
                                    <tr style={{ background: '#1a1a1a', fontSize: '0.75rem', textTransform: 'uppercase', color: '#888' }}>
                                        <th style={{ padding: '12px 16px', textAlign: 'left' }}>Device ID</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left' }}>Owner</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'center' }}>Credential</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'center' }}>สถานะ</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left' }}>พิกัด</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left' }}>อัพเดทล่าสุด</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'center' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((device) => {
                                        const cfg = getStatusConfig(device.status);
                                        return (
                                            <tr key={device.device_id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                                                <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: '0.85rem' }}>{device.device_id}</td>
                                                <td style={{ padding: '14px 16px' }}>{device.owner_name || <span style={{ color: '#555' }}>-</span>}</td>
                                                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                    {device.credential_code
                                                        ? <span style={{ fontFamily: 'monospace', color: '#FBBF24', background: '#1a1a2e', padding: '2px 8px', borderRadius: '4px' }}>{device.credential_code}</span>
                                                        : <span style={{ color: '#555' }}>-</span>}
                                                </td>
                                                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                    <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                                                </td>
                                                <td style={{ padding: '14px 16px', color: '#aaa', fontSize: '0.85rem' }}>
                                                    {device.lat != null && device.lng != null
                                                        ? `${Number(device.lat).toFixed(5)}, ${Number(device.lng).toFixed(5)}`
                                                        : <span style={{ color: '#555' }}>-</span>}
                                                </td>
                                                <td style={{ padding: '14px 16px', color: '#888', fontSize: '0.85rem' }}>{formatTime(device.last_update)}</td>
                                                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                    <Link
                                                        href={`/v2/map?id=${encodeURIComponent(device.device_id)}`}
                                                        style={{ color: '#3B82F6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center', fontSize: '0.85rem' }}
                                                    >
                                                        ดูโหมดติดตามรถ <ChevronRight size={16} />
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
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

function StatCard({ label, value, color }) {
    return (
        <div style={{ background: '#111', border: '1px solid #222', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color }}>{value}</div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '4px' }}>{label}</div>
        </div>
    );
}
