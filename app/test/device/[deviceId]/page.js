"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, MapPin, Clock, ArrowLeft, History, Car, User, Shield, Phone } from "lucide-react";

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

export default function TestDeviceDetail() {
    const { deviceId } = useParams();
    const decodedId = decodeURIComponent(deviceId);

    const [device, setDevice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsVisible, setLogsVisible] = useState(false);

    useEffect(() => {
        fetchDevice();
    }, [decodedId]);

    const fetchDevice = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${SERVER_URL}/api/test/device/${encodeURIComponent(decodedId)}`);
            if (!res.ok) {
                if (res.status === 404) throw new Error('ไม่พบอุปกรณ์นี้');
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            setDevice(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchLogs = async () => {
        setLogsLoading(true);
        try {
            const res = await fetch(`${SERVER_URL}/api/test/history/${encodeURIComponent(decodedId)}?limit=50`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setLogs(data || []);
        } catch (err) {
            setLogs([]);
        } finally {
            setLogsLoading(false);
            setLogsVisible(true);
        }
    };

    const cfg = device ? getStatusConfig(device.status) : STATUS_CONFIG['UNKNOWN'];

    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
            {/* Header */}
            <header style={{ background: '#111', borderBottom: '1px solid #222', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Link href="/test/dashboard" style={{ color: '#888', display: 'flex' }}><ArrowLeft size={20} /></Link>
                <Shield size={24} color="#22C55E" />
                <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', flex: 1 }}>
                    Device Detail
                    <span style={{ fontSize: '0.7rem', background: '#F59E0B', color: 'black', padding: '2px 8px', borderRadius: '4px', marginLeft: '8px', verticalAlign: 'middle' }}>TEST</span>
                </h1>
            </header>

            <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
                {/* Loading */}
                {loading && (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#888' }}>
                        <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                        <p>กำลังโหลดข้อมูล...</p>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#EF4444' }}>
                        <p>❌ {error}</p>
                        <Link href="/test/dashboard" style={{ color: '#3B82F6', textDecoration: 'none', marginTop: '12px', display: 'inline-block' }}>← กลับไปหน้า Dashboard</Link>
                    </div>
                )}

                {/* Device Info */}
                {!loading && !error && device && (
                    <>
                        {/* Status Banner */}
                        <div style={{
                            background: cfg.bg, color: cfg.color, padding: '16px 20px',
                            borderRadius: '12px', marginBottom: '16px', fontSize: '1.1rem',
                            fontWeight: 'bold', textAlign: 'center'
                        }}>
                            {cfg.label}
                        </div>

                        {/* Info Card */}
                        <div style={{ background: '#111', borderRadius: '12px', border: '1px solid #222', padding: '20px', marginBottom: '16px' }}>
                            <h2 style={{ fontSize: '1rem', marginTop: 0, marginBottom: '16px', color: '#aaa' }}>📋 ข้อมูลอุปกรณ์</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <InfoRow label="Device ID" value={device.device_id} mono />
                                <InfoRow label="Credential" value={device.credential_code || '-'} mono color="#FBBF24" />
                                <InfoRow label="ทะเบียนรถ" value={device.license_plate || device.plate_number || '-'} />
                                <InfoRow label="เจ้าของ" value={device.owner_name || device.driver_name || '-'} />
                                <InfoRow label="เบอร์ฉุกเฉิน" value={device.emergency_phone || (device.sos_numbers?.length > 0 ? device.sos_numbers.join(', ') : '-')} />
                                <InfoRow label="สถานะ" value={cfg.label} color={cfg.color} />
                            </div>
                        </div>

                        {/* Location Card */}
                        <div style={{ background: '#111', borderRadius: '12px', border: '1px solid #222', padding: '20px', marginBottom: '16px' }}>
                            <h2 style={{ fontSize: '1rem', marginTop: 0, marginBottom: '16px', color: '#aaa' }}>📍 ตำแหน่งล่าสุด</h2>
                            {device.lat != null && device.lng != null ? (
                                <div>
                                    <div style={{ display: 'flex', gap: '20px', marginBottom: '12px', fontSize: '0.9rem' }}>
                                        <span><MapPin size={14} style={{ verticalAlign: 'middle' }} /> <span style={{ fontFamily: 'monospace' }}>{Number(device.lat).toFixed(6)}, {Number(device.lng).toFixed(6)}</span></span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#888' }}>
                                        <Clock size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                        อัพเดทเมื่อ: {formatTime(device.last_update)}
                                    </div>
                                    <a
                                        href={`https://www.google.com/maps?q=${device.lat},${device.lng}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            display: 'inline-block', marginTop: '12px', background: '#1a1a2e',
                                            color: '#818cf8', padding: '8px 16px', borderRadius: '8px',
                                            textDecoration: 'none', fontSize: '0.85rem'
                                        }}
                                    >
                                        🗺️ เปิดใน Google Maps
                                    </a>
                                </div>
                            ) : (
                                <p style={{ color: '#666' }}>ยังไม่มีข้อมูลตำแหน่ง</p>
                            )}
                        </div>

                        {/* Logs Section */}
                        <div style={{ background: '#111', borderRadius: '12px', border: '1px solid #222', padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h2 style={{ fontSize: '1rem', margin: 0, color: '#aaa' }}>
                                    <History size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                                    ประวัติการทำงาน
                                </h2>
                                <button
                                    onClick={fetchLogs}
                                    disabled={logsLoading}
                                    style={{
                                        background: '#3B82F6', color: 'white', border: 'none',
                                        padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                                        fontSize: '0.85rem', fontWeight: 'bold'
                                    }}
                                >
                                    {logsLoading ? 'กำลังโหลด...' : logsVisible ? '🔄 รีเฟรช' : '📜 ดู Logs ล่าสุด'}
                                </button>
                            </div>

                            {logsLoading && (
                                <div style={{ textAlign: 'center', padding: '30px 0', color: '#888' }}>
                                    <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto' }} />
                                </div>
                            )}

                            {logsVisible && !logsLoading && logs.length === 0 && (
                                <p style={{ color: '#666', textAlign: 'center', padding: '20px 0' }}>ไม่มีประวัติ</p>
                            )}

                            {logsVisible && !logsLoading && logs.length > 0 && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                                        <thead>
                                            <tr style={{ background: '#1a1a1a', fontSize: '0.7rem', textTransform: 'uppercase', color: '#888' }}>
                                                <th style={{ padding: '10px 12px', textAlign: 'left' }}>เวลา</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center' }}>สถานะ</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'left' }}>ละติจูด</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'left' }}>ลองจิจูด</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {logs.map((log, idx) => {
                                                const logCfg = getStatusConfig(log.status);
                                                return (
                                                    <tr key={log.id || idx} style={{ borderBottom: '1px solid #1a1a1a' }}>
                                                        <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: '#ccc' }}>{formatTime(log.timestamp)}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                            <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', background: logCfg.bg, color: logCfg.color }}>{logCfg.label}</span>
                                                        </td>
                                                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.8rem', color: '#aaa' }}>{log.lat != null ? Number(log.lat).toFixed(6) : '-'}</td>
                                                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.8rem', color: '#aaa' }}>{log.lng != null ? Number(log.lng).toFixed(6) : '-'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    <p style={{ textAlign: 'center', padding: '12px', color: '#555', fontSize: '0.75rem' }}>
                                        แสดง {logs.length} รายการล่าสุด
                                    </p>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </main>

            {/* Footer */}
            <div style={{ textAlign: 'center', padding: '20px', color: '#444', fontSize: '0.75rem' }}>
                🧪 Test Mode — No Authentication Required
            </div>
        </div>
    );
}

function InfoRow({ label, value, mono, color }) {
    return (
        <div>
            <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '4px' }}>{label}</div>
            <div style={{
                fontSize: '0.9rem',
                fontFamily: mono ? 'monospace' : 'inherit',
                color: color || 'white',
                wordBreak: 'break-all'
            }}>{value}</div>
        </div>
    );
}
