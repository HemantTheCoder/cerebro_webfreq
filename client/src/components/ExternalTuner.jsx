import React, { useState, useEffect } from 'react';
import { Radio, Search, Play, Globe, WifiOff, X } from 'lucide-react';
import { RadioBrowserApi } from 'radio-browser-api';

const ExternalTuner = ({ onTune, onClose }) => {
    const [mode, setMode] = useState('search'); // 'search' | 'manual'
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [manualUrl, setManualUrl] = useState('');
    const api = new RadioBrowserApi('Cerebro-WebFreq');

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        try {
            const stations = await api.searchStations({
                name: query,
                limit: 10,
                order: 'clickcount',
                reverse: true
            });
            setResults(stations);
        } catch (error) {
            console.error("Radio Search Failed:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleManualTune = (e) => {
        e.preventDefault();
        // Simple validation or just assume it's a "dead" frequency if irrelevant
        // For realism: If it looks like a URL, stream it. If it looks like a number, maybe play static?
        if (manualUrl.match(/^https?:\/\//)) {
            onTune({ type: 'stream', url: manualUrl, name: 'MANUAL STREAM' });
        } else {
            // Assume it's a frequency number -> Play Static
            onTune({ type: 'static', freq: manualUrl, name: `${manualUrl} MHz - STATIC` });
        }
    };

    return (
        <div className="crm-panel box-shadow-glow" style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '400px', maxHeight: '600px', zIndex: 1000, display: 'flex', flexDirection: 'column',
            border: '2px solid var(--primary-color)', background: 'rgba(0,0,0,0.95)'
        }}>
            <div style={{ padding: '10px', background: 'var(--primary-color)', color: '#000', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Globe size={18} /> GLOBAL TUNER
                </h3>
                <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#000' }}>
                    <X size={20} />
                </button>
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
                <button
                    onClick={() => setMode('search')}
                    style={{ flex: 1, padding: '10px', background: mode === 'search' ? '#222' : 'transparent', color: mode === 'search' ? 'var(--primary-color)' : '#666', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
                >
                    SEARCH DB
                </button>
                <button
                    onClick={() => setMode('manual')}
                    style={{ flex: 1, padding: '10px', background: mode === 'manual' ? '#222' : 'transparent', color: mode === 'manual' ? 'var(--primary-color)' : '#666', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
                >
                    MANUAL FREQ
                </button>
            </div>

            <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                {mode === 'search' ? (
                    <>
                        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '5px', marginBottom: '20px' }}>
                            <input
                                type="text"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Station Name / Tag..."
                                style={{ flex: 1, padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', fontFamily: 'var(--font-mono)' }}
                            />
                            <button type="submit" className="crm-btn" style={{ padding: '8px' }} disabled={loading}>
                                <Search size={16} />
                            </button>
                        </form>

                        {loading && <div style={{ textAlign: 'center', color: '#888' }}>SCANNING ETHER...</div>}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {results.map(station => (
                                <div key={station.id} style={{
                                    padding: '10px', border: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    background: 'linear-gradient(90deg, transparent 90%, rgba(0,255,204,0.05))'
                                }}>
                                    <div style={{ overflow: 'hidden' }}>
                                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{station.name}</div>
                                        <div style={{ fontSize: '0.8em', color: '#666' }}>{station.countryCode} | {station.bitrate}kbps</div>
                                    </div>
                                    <button
                                        className="crm-btn"
                                        onClick={() => onTune({ type: 'stream', url: station.urlResolved, name: station.name })}
                                        style={{ padding: '5px 10px' }}
                                    >
                                        <Play size={14} /> TUNE
                                    </button>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div style={{ textAlign: 'center' }}>
                        <WifiOff size={48} style={{ color: '#444', marginBottom: '10px' }} />
                        <p style={{ color: '#888', marginBottom: '20px', fontSize: '0.9em' }}>
                            Enter a direct stream URL or a random frequency numbers.
                            <br />
                            Invalid signals will produce <span style={{ color: '#fff' }}>white noise</span>.
                        </p>
                        <form onSubmit={handleManualTune} style={{ display: 'flex', gap: '5px' }}>
                            <input
                                type="text"
                                value={manualUrl}
                                onChange={e => setManualUrl(e.target.value)}
                                placeholder="URL or Frequency (e.g., 99.5)"
                                style={{ flex: 1, padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', fontFamily: 'var(--font-mono)' }}
                            />
                            <button type="submit" className="crm-btn" style={{ padding: '8px' }}>
                                <Radio size={16} /> TUNE
                            </button>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExternalTuner;
