import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { Radio, Search, Users, Activity } from 'lucide-react';

const Tuner = ({ onTune }) => {
    const [frequency, setFrequency] = useState('145.500');
    const [isScanning, setIsScanning] = useState(false);
    const [activeChannels, setActiveChannels] = useState([]);
    const socket = useSocket();

    const handleJoin = (e) => {
        e.preventDefault();
        if (frequency) onTune(frequency);
    };

    const toggleScan = () => {
        if (!socket) return;

        if (!isScanning) {
            socket.emit('scan-channels', (channels) => {
                setActiveChannels(channels);
            });
        }
        setIsScanning(!isScanning);
    };

    return (
        <div className="tuner-container" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem',
            maxWidth: '500px', width: '100%', zIndex: 10
        }}>
            <div className="crm-panel" style={{ padding: '2rem', width: '100%', textAlign: 'center' }}>
                <h1 className="crm-text-glow" style={{ fontFamily: 'var(--font-display)', marginBottom: '1rem', color: 'var(--primary-color)' }}>
                    CEREBRO <span style={{ fontSize: '0.5em', verticalAlign: 'middle' }}>V.1</span>
                </h1>

                <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ position: 'relative' }}>
                        <label style={{
                            display: 'block', textAlign: 'left', marginBottom: '0.5rem',
                            color: 'var(--text-muted)', fontSize: '0.8rem'
                        }}>
                            FREQUENCY INPUT (MHZ)
                        </label>
                        <input
                            type="text"
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value)}
                            style={{
                                background: '#000',
                                border: '1px solid var(--panel-border)',
                                color: 'var(--accent-color)',
                                fontFamily: 'var(--font-display)',
                                fontSize: '2.5rem',
                                width: '100%',
                                padding: '1rem',
                                textAlign: 'center',
                                outline: 'none',
                                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)'
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" onClick={toggleScan} className="crm-btn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            <Search size={18} /> SCAN
                        </button>
                        <button type="submit" className="crm-btn" style={{ flex: 2, fontWeight: 'bold', fontSize: '1.2rem' }}>
                            TUNE IN
                        </button>
                    </div>
                </form>
            </div>

            {isScanning && (
                <div className="crm-panel" style={{ width: '100%', padding: '1rem', maxHeight: '300px', overflowY: 'auto' }}>
                    <h3 style={{ borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem', marginBottom: '0.5rem', color: 'var(--primary-color)' }}>
                        DETECTED SIGNALS
                    </h3>
                    {activeChannels.length === 0 ? (
                        <div style={{ padding: '1rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            No active frequencies detected...
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {activeChannels.map((chan) => (
                                <div key={chan.frequency}
                                    onClick={() => onTune(chan.frequency)}
                                    style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '0.5rem', background: 'rgba(255,255,255,0.05)', cursor: 'pointer',
                                        border: '1px solid transparent'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--primary-color)'}
                                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
                                >
                                    <span style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-color)' }}>{chan.frequency}</span>
                                    <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Users size={14} /> {chan.users}</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Activity size={14} /> -{(Math.random() * 40 + 60).toFixed(0)}dBm</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Tuner;
