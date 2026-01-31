"use client";

import { useState } from "react";
import { Plus, Play, Copy, Trash2, MapPin, Activity, Clock, Repeat } from "lucide-react";
import toast, { Toaster } from 'react-hot-toast';

// Dynamic API URL for Simulator
const getApiUrl = () => {
    if (typeof window === 'undefined') return "http://143.14.200.117/api/track";
    return `${window.location.origin}/api/track`;
};

// Default Waypoint Template
const DEFAULT_WAYPOINT = {
    lat: 13.7563,
    lng: 100.5018,
    status: "3", // Default to Normal (3)
    delay: 2000 // ms
};

// Default Scenario Group Template
const DEFAULT_SCENARIO = {
    id: 1,
    deviceId: "SIM_CAR_01",
    active: false,
    waypoints: [{ ...DEFAULT_WAYPOINT }]
};

export default function SimulatorPage() {
    const [scenarios, setScenarios] = useState([DEFAULT_SCENARIO]);
    const [isRunningAll, setIsRunningAll] = useState(false);

    // --- Actions ---

    const addScenario = () => {
        const newId = Math.max(...scenarios.map(s => s.id), 0) + 1;
        setScenarios([...scenarios, {
            ...DEFAULT_SCENARIO,
            id: newId,
            deviceId: `SIM_CAR_0${newId}`,
            waypoints: [{ ...DEFAULT_WAYPOINT }]
        }]);
    };

    const duplicateScenario = (scenario) => {
        const newId = Math.max(...scenarios.map(s => s.id), 0) + 1;
        setScenarios([...scenarios, {
            ...scenario,
            id: newId,
            deviceId: `${scenario.deviceId}_COPY`,
            active: false
        }]);
        toast.success("Scenario Duplicated!");
    };

    const removeScenario = (id) => {
        if (scenarios.length === 1) return toast.error("ต้องมีอย่างน้อย 1 Scenario");
        setScenarios(scenarios.filter(s => s.id !== id));
    };

    const updateScenarioObj = (id, field, value) => {
        setScenarios(scenarios.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    // --- Waypoint Actions ---

    const addWaypoint = (scenarioId) => {
        setScenarios(scenarios.map(s => {
            if (s.id !== scenarioId) return s;
            const lastPoint = s.waypoints[s.waypoints.length - 1];
            // Add slight random offset to simulate movement
            const newPoint = {
                ...DEFAULT_WAYPOINT,
                lat: lastPoint.lat + 0.001,
                lng: lastPoint.lng + 0.001,
            };
            return { ...s, waypoints: [...s.waypoints, newPoint] };
        }));
    };

    const updateWaypoint = (scenarioId, index, field, value) => {
        setScenarios(scenarios.map(s => {
            if (s.id !== scenarioId) return s;
            const newWaypoints = [...s.waypoints];
            newWaypoints[index] = { ...newWaypoints[index], [field]: value };
            return { ...s, waypoints: newWaypoints };
        }));
    };

    const removeWaypoint = (scenarioId, index) => {
        setScenarios(scenarios.map(s => {
            if (s.id !== scenarioId) return s;
            if (s.waypoints.length === 1) {
                toast.error("At least 1 waypoint required");
                return s;
            }
            return { ...s, waypoints: s.waypoints.filter((_, i) => i !== index) };
        }));
    };

    // --- Simulation Logic ---

    const sendPoint = async (deviceId, point) => {
        // Format: MAC,TYPE LAT, LNG, TIMESTAMP
        const timestamp = Math.floor(Date.now() / 1000);
        const payload = `${deviceId},${point.status} ${point.lat}, ${point.lng}, ${timestamp}`;
        try {
            await fetch(getApiUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: payload
            });
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    };

    const runScenario = async (scenarioId) => {
        const scenario = scenarios.find(s => s.id === scenarioId);
        if (!scenario) return;

        updateScenarioObj(scenarioId, 'active', true);
        toast.loading(`Running: ${scenario.deviceId}`, { id: `run-${scenarioId}` });

        for (let i = 0; i < scenario.waypoints.length; i++) {
            const point = scenario.waypoints[i];

            // UI Feedback: Highlight current point? (Optional)

            await sendPoint(scenario.deviceId, point);

            // Wait for delay
            if (i < scenario.waypoints.length - 1) {
                await new Promise(r => setTimeout(r, point.delay));
            }
        }

        toast.success(`Completed: ${scenario.deviceId}`, { id: `run-${scenarioId}` });
        updateScenarioObj(scenarioId, 'active', false);
    };

    const runAll = async () => {
        setIsRunningAll(true);
        const promises = scenarios.map(s => runScenario(s.id));
        await Promise.all(promises);
        setIsRunningAll(false);
        toast.success("All Scenarios Completed!");
    };

    return (
        <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto', paddingBottom: '100px' }}>
            <Toaster position="top-right" />

            <header style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1>🧪 Simulator Control</h1>
                    <p style={{ color: '#888' }}>Multi-Device Scenario Testing</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={addScenario}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        <Plus size={18} /> Add Group
                    </button>
                    <button
                        onClick={runAll}
                        disabled={isRunningAll}
                        className="btn-primary"
                        style={{
                            background: isRunningAll ? '#555' : '#00ff9d',
                            color: 'black',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 20px'
                        }}
                    >
                        {isRunningAll ? <Activity className="spin" /> : <Play fill="black" size={20} />}
                        RUN ALL SCENARIOS
                    </button>
                </div>
            </header>

            <div style={{ display: 'grid', gap: '20px' }}>
                {scenarios.map((scenario) => (
                    <div key={scenario.id} className="scenario-card" style={{
                        background: '#151515',
                        border: '1px solid #333',
                        borderRadius: '12px',
                        padding: '20px',
                        opacity: scenario.active ? 1 : 0.8,
                        boxShadow: scenario.active ? '0 0 15px rgba(0, 255, 157, 0.2)' : 'none',
                        transition: 'all 0.3s'
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flex: 1 }}>
                                <div style={{
                                    background: '#333', width: '40px', height: '40px',
                                    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 'bold', color: '#fff'
                                }}>
                                    {scenario.id}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.8rem', color: '#888' }}>DEVICE ID</label>
                                    <input
                                        value={scenario.deviceId}
                                        onChange={(e) => updateScenarioObj(scenario.id, 'deviceId', e.target.value)}
                                        style={{
                                            background: 'transparent', border: 'none',
                                            color: 'white', fontSize: '1.2rem', fontWeight: 'bold', width: '100%',
                                            borderBottom: '1px solid #444'
                                        }}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => runScenario(scenario.id)} disabled={scenario.active} style={{ background: 'transparent', border: '1px solid #00ff9d', color: '#00ff9d', borderRadius: '4px', cursor: 'pointer', padding: '5px' }}>
                                    <Play size={18} />
                                </button>
                                <button onClick={() => duplicateScenario(scenario)} style={{ background: 'transparent', border: '1px solid #4db5ff', color: '#4db5ff', borderRadius: '4px', cursor: 'pointer', padding: '5px' }}>
                                    <Copy size={18} />
                                </button>
                                <button onClick={() => removeScenario(scenario.id)} style={{ background: 'transparent', border: '1px solid #ff4444', color: '#ff4444', borderRadius: '4px', cursor: 'pointer', padding: '5px' }}>
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Timeline */}
                        <div style={{ background: '#111', borderRadius: '8px', padding: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center' }}>
                                <small style={{ color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>Timeline Actions</small>
                                <button onClick={() => addWaypoint(scenario.id)} style={{ background: '#333', border: 'none', color: '#fff', fontSize: '0.8rem', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>+ Add Step</button>
                            </div>

                            {scenario.waypoints.map((point, idx) => (
                                <div key={idx} style={{
                                    display: 'grid', gridTemplateColumns: 'min-content 1fr 1fr 1fr 1fr min-content', gap: '10px',
                                    alignItems: 'center', marginBottom: '8px',
                                    borderLeft: `2px solid ${idx === 0 ? '#00ff9d' : '#444'}`,
                                    paddingLeft: '10px'
                                }}>
                                    <div style={{ color: '#444', fontSize: '0.8rem' }}>{idx + 1}</div>

                                    {/* Inputs */}
                                    <div style={{ display: 'flex', alignItems: 'center', background: '#222', borderRadius: '4px', padding: '4px' }}>
                                        <MapPin size={12} style={{ marginRight: '5px', color: '#888' }} />
                                        <input
                                            type="number" step="0.0001"
                                            value={point.lat}
                                            onChange={(e) => updateWaypoint(scenario.id, idx, 'lat', parseFloat(e.target.value))}
                                            style={{ width: '100%', background: 'transparent', border: 'none', color: 'white', fontSize: '0.9rem' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', background: '#222', borderRadius: '4px', padding: '4px' }}>
                                        <MapPin size={12} style={{ marginRight: '5px', color: '#888' }} />
                                        <input
                                            type="number" step="0.0001"
                                            value={point.lng}
                                            onChange={(e) => updateWaypoint(scenario.id, idx, 'lng', parseFloat(e.target.value))}
                                            style={{ width: '100%', background: 'transparent', border: 'none', color: 'white', fontSize: '0.9rem' }}
                                        />
                                    </div>

                                    <select
                                        value={point.status}
                                        onChange={(e) => updateWaypoint(scenario.id, idx, 'status', e.target.value)}
                                        style={{ background: '#222', border: 'none', color: point.status === '1' ? '#ff4444' : point.status === '2' ? '#ffaa00' : 'white', borderRadius: '4px', padding: '5px' }}
                                    >
                                        <option value="3">🚗 ปกติ (Normal)</option>
                                        <option value="1">🔴 ขโมย (Stolen)</option>
                                        <option value="2">💥 อุบัติเหตุ (Crash)</option>
                                        <option value="0">⚠️ BLE Fail</option>
                                    </select>

                                    <div style={{ display: 'flex', alignItems: 'center', background: '#222', borderRadius: '4px', padding: '4px', opacity: idx === scenario.waypoints.length - 1 ? 0.3 : 1 }}>
                                        <Clock size={12} style={{ marginRight: '5px', color: '#888' }} />
                                        <input
                                            type="number" step="100"
                                            value={point.delay}
                                            onChange={(e) => updateWaypoint(scenario.id, idx, 'delay', parseInt(e.target.value))}
                                            disabled={idx === scenario.waypoints.length - 1}
                                            style={{ width: '100%', background: 'transparent', border: 'none', color: 'white', fontSize: '0.9rem' }}
                                        />
                                        <span style={{ fontSize: '0.7rem', color: '#666' }}>ms</span>
                                    </div>

                                    <button onClick={() => removeWaypoint(scenario.id, idx)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer' }}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <style jsx>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
                .btn-primary { 
                    border: none; border-radius: 6px; font-weight: bold; cursor: pointer; transition: transform 0.1s;
                }
                .btn-primary:active { transform: scale(0.95); }
                .btn-secondary {
                    background: #333; color: white; border: 1px solid #444; padding: 10px 20px;
                    border-radius: 6px; cursor: pointer; font-weight: bold;
                }
                .btn-secondary:hover { background: #444; }
                input:focus, select:focus { outline: none; border-bottom: 1px solid #00ff9d; }

                /* Hide number spinners */
                input::-webkit-outer-spin-button,
                input::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
                }
            `}</style>
        </div>
    );
}
