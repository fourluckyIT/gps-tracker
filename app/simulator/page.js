"use client";
import { useState, useEffect, useRef } from 'react';
import {
    Play, Pause, FastForward, Plus, Trash, Copy, Send, Save,
    MapPin, Clock, Smartphone, Settings, Activity
} from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';

// Config
const THAI_LOCATIONS = [
    { name: 'Siam Paragon', lat: 13.7469, lng: 100.5349 },
    { name: 'Central World', lat: 13.7466, lng: 100.5393 },
    { name: 'MBK Center', lat: 13.7445, lng: 100.5299 },
    { name: 'Chulalongkorn U.', lat: 13.7386, lng: 100.5309 },
    { name: 'Victory Monument', lat: 13.7649, lng: 100.5383 },
];

const STATUS_OPTIONS = [
    { value: '3', label: 'NORMAL (ปกติ)', color: 'text-green-500' },
    { value: '2', label: 'CRASH (อุบัติเหตุ)', color: 'text-orange-500' },
    { value: '1', label: 'STOLEN (ถูกขโมย)', color: 'text-red-500' },
    { value: '0', label: 'UNKNOWN (ไม่ทราบ)', color: 'text-gray-500' },
];

export default function AdvancedSimulator() {
    const [mode, setMode] = useState('manual'); // 'manual' | 'sequence'

    // --- Manual Mode State ---
    const [device, setDevice] = useState({
        mac: 'MOCK-001',
        lat: 13.7469,
        lng: 100.5349,
        status: '3',
    });
    const [history, setHistory] = useState([]);

    // --- Sequence Mode State ---
    const [sequence, setSequence] = useState([]);
    const [playing, setPlaying] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [delay, setDelay] = useState(2000); // ms

    const timerRef = useRef(null);

    // --- Functions ---

    const sendPayload = async (payload) => {
        // Format: MAC,STATUS LAT, LNG, TIMESTAMP
        const body = `${payload.mac},${payload.status} ${payload.lat.toFixed(6)}, ${payload.lng.toFixed(6)}, ${Date.now()}`;

        try {
            const res = await fetch('/api/track', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: body,
            });

            const log = {
                time: new Date().toLocaleTimeString(),
                mac: payload.mac,
                status: STATUS_OPTIONS.find(s => s.value === payload.status)?.label,
                loc: `${payload.lat.toFixed(4)}, ${payload.lng.toFixed(4)}`,
                success: res.ok
            };

            setHistory(prev => [log, ...prev.slice(0, 19)]); // Keep last 20
            return res.ok;
        } catch (err) {
            console.error(err);
            return false;
        }
    };

    const cleanHistory = () => setHistory([]);

    // --- Sequence Logic ---

    const addStep = () => {
        setSequence([...sequence, { ...device, id: Date.now() }]);
    };

    const removeStep = (id) => {
        setSequence(sequence.filter(s => s.id !== id));
    };

    const cloneStep = (step) => {
        setSequence([...sequence, { ...step, id: Date.now() }]);
    };

    const updateStep = (id, field, value) => {
        setSequence(sequence.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    const playSequence = () => {
        if (sequence.length === 0) return;
        setPlaying(true);
        setCurrentIndex(0);
    };

    const stopSequence = () => {
        setPlaying(false);
        if (timerRef.current) clearInterval(timerRef.current);
    };

    useEffect(() => {
        if (playing) {
            timerRef.current = setInterval(async () => {
                setCurrentIndex(prev => {
                    const next = prev + 1;
                    if (next >= sequence.length) {
                        // Loop or Stop? Let's Loop for now as requested ("Play loop")
                        sendPayload(sequence[0]);
                        return 0;
                    }
                    sendPayload(sequence[next]);
                    return next;
                });

                // Use current index payload (actually need to be careful with closure here)
                // Better logic: send data inside interval based on tracked index
            }, delay);

            // Send first immediately
            sendPayload(sequence[currentIndex]);

            return () => clearInterval(timerRef.current);
        }
    }, [playing, sequence, delay]); // Re-run if delay/sequence changes


    return (
        <div className="min-h-screen bg-gray-900 text-white p-6 font-sans">
            <Toaster position="top-right" />

            <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LEFT COLUMN: Controls */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                        <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
                            <Activity className="text-blue-400" /> Simulator Pro
                        </h1>

                        <div className="flex bg-gray-700 p-1 rounded-lg mb-6">
                            <button
                                onClick={() => setMode('manual')}
                                className={`flex-1 py-2 rounded-md text-sm font-bold ${mode === 'manual' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
                            >Manual</button>
                            <button
                                onClick={() => setMode('sequence')}
                                className={`flex-1 py-2 rounded-md text-sm font-bold ${mode === 'sequence' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
                            >Sequence (Playlist)</button>
                        </div>

                        {/* Device Config Form */}
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-gray-400 uppercase font-bold">Device MAC ID</label>
                                <input
                                    type="text"
                                    value={device.mac}
                                    onChange={e => setDevice({ ...device, mac: e.target.value.toUpperCase() })}
                                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white font-mono"
                                />
                            </div>

                            <div>
                                <label className="text-xs text-gray-400 uppercase font-bold">Status</label>
                                <select
                                    value={device.status}
                                    onChange={e => setDevice({ ...device, status: e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                                >
                                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs text-gray-400 uppercase font-bold">Latitude</label>
                                    <input type="number" step="0.0001" value={device.lat} onChange={e => setDevice({ ...device, lat: parseFloat(e.target.value) })} className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white font-mono" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 uppercase font-bold">Longitude</label>
                                    <input type="number" step="0.0001" value={device.lng} onChange={e => setDevice({ ...device, lng: parseFloat(e.target.value) })} className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white font-mono" />
                                </div>
                            </div>

                            {/* Quick Locations */}
                            <div className="flex flex-wrap gap-2 mt-2">
                                {THAI_LOCATIONS.map(loc => (
                                    <button
                                        key={loc.name}
                                        onClick={() => setDevice({ ...device, lat: loc.lat, lng: loc.lng })}
                                        className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-300"
                                    >
                                        {loc.name}
                                    </button>
                                ))}
                            </div>

                            {mode === 'manual' && (
                                <button
                                    onClick={() => sendPayload(device)}
                                    className="w-full bg-green-600 hover:bg-green-500 py-3 rounded-xl font-bold mt-4 flex items-center justify-center gap-2"
                                >
                                    <Send size={18} /> Send Now
                                </button>
                            )}

                            {mode === 'sequence' && (
                                <button
                                    onClick={addStep}
                                    className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-bold mt-4 flex items-center justify-center gap-2"
                                >
                                    <Plus size={18} /> Add to Playlist
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Sequence / History */}
                <div className="lg:col-span-2 space-y-6">

                    {/* SEQUENCE EDITOR */}
                    {mode === 'sequence' && (
                        <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 min-h-[400px]">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold flex items-center gap-2"><ListIcon /> Test Sequence ({sequence.length})</h2>
                                <div className="flex gap-2">
                                    <div className="flex items-center gap-2 bg-gray-900 px-3 py-1 rounded">
                                        <Clock size={14} className="text-gray-400" />
                                        <span className="text-xs text-gray-400">Delay (ms):</span>
                                        <input
                                            type="number"
                                            value={delay}
                                            onChange={e => setDelay(parseInt(e.target.value))}
                                            className="w-16 bg-transparent text-right outline-none text-sm"
                                        />
                                    </div>
                                    {!playing ? (
                                        <button onClick={playSequence} className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded flex items-center gap-2 font-bold text-sm">
                                            <Play size={16} /> Play Loop
                                        </button>
                                    ) : (
                                        <button onClick={stopSequence} className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded flex items-center gap-2 font-bold text-sm">
                                            <Pause size={16} /> Stop
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                                {sequence.length === 0 && (
                                    <div className="text-center text-gray-500 py-10 border-2 border-dashed border-gray-700 rounded-xl">
                                        No actions yet. Add one from the left panel.
                                    </div>
                                )}
                                {sequence.map((step, idx) => (
                                    <div key={step.id} className={`p-3 rounded-lg flex items-center gap-3 border ${currentIndex === idx && playing ? 'bg-blue-900/30 border-blue-500' : 'bg-gray-700 border-gray-600'}`}>
                                        <div className="bg-gray-900 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-gray-400">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1 grid grid-cols-4 gap-2 text-sm">
                                            <input
                                                value={step.mac}
                                                onChange={e => updateStep(step.id, 'mac', e.target.value)}
                                                className="bg-gray-900 px-2 py-1 rounded text-green-400 font-mono"
                                            />
                                            <select
                                                value={step.status}
                                                onChange={e => updateStep(step.id, 'status', e.target.value)}
                                                className="bg-gray-900 px-2 py-1 rounded text-white"
                                            >
                                                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                            </select>
                                            <div className="col-span-2 flex gap-1">
                                                <input
                                                    type="number" step="0.0001"
                                                    value={step.lat}
                                                    onChange={e => updateStep(step.id, 'lat', parseFloat(e.target.value))}
                                                    className="bg-gray-900 w-1/2 px-2 py-1 rounded font-mono text-yellow-400"
                                                />
                                                <input
                                                    type="number" step="0.0001"
                                                    value={step.lng}
                                                    onChange={e => updateStep(step.id, 'lng', parseFloat(e.target.value))}
                                                    className="bg-gray-900 w-1/2 px-2 py-1 rounded font-mono text-yellow-400"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={() => cloneStep(step)} className="p-2 hover:bg-gray-600 rounded text-blue-400" title="Clone"><Copy size={14} /></button>
                                            <button onClick={() => removeStep(step.id)} className="p-2 hover:bg-gray-600 rounded text-red-400" title="Remove"><Trash size={14} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* HISTORY LOGS */}
                    <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-gray-300">Sent History</h2>
                            <button onClick={cleanHistory} className="text-xs text-gray-500 hover:text-white">Clear</button>
                        </div>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto font-mono text-sm">
                            {history.map((h, i) => (
                                <div key={i} className={`flex justify-between p-2 rounded ${h.success ? 'bg-gray-700/50' : 'bg-red-900/20'}`}>
                                    <span className="text-gray-400">{h.time}</span>
                                    <span className="text-blue-400">{h.mac}</span>
                                    <span className="text-yellow-400">{h.status}</span>
                                    <span className="text-green-400">{h.loc}</span>
                                </div>
                            ))}
                            {history.length === 0 && <div className="text-gray-600 text-center py-4">No data sent yet</div>}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

function ListIcon() { return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>; }
