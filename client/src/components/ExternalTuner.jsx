import React, { useState } from 'react';
import { Radio, Search, Play, Globe, WifiOff, X, AlertTriangle, Activity } from 'lucide-react';
import { RadioBrowserApi } from 'radio-browser-api';

const ExternalTuner = ({ onTune, onClose }) => {
    const [mode, setMode] = useState('search'); // 'search' | 'manual' | 'freq'
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [manualUrl, setManualUrl] = useState('');
    const [freqInput, setFreqInput] = useState('101.5');
    const [band, setBand] = useState('FM'); // FM, AM, SW
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

    // V2: Abstract Frequency Lookup
    const handleFreqTune = async (e) => {
        e.preventDefault();
        setLoading(true);

        // Simulate "Scanning" delay
        setTimeout(async () => {
            try {
                // Heuristic: Search for stations containing the frequency in their name
                // This is a "best effort" to simulate tuning to 101.5
                const stations = await api.searchStations({
                    name: freqInput,
                    limit: 5,
                    order: 'clickcount',
                    reverse: true
                });

                if (stations.length > 0) {
                    // Pick the best one (highest bitrate/votes)
                    const match = stations[0];
                    onTune({
                        type: 'stream',
                        url: match.urlResolved,
                        name: `${freqInput} ${band} - ${match.name.substr(0, 20)}`,
                        metadata: { freq: freqInput, band, signal: 'STRONG' }
                    });
                } else {
                    // Dead Air -> Static
                    onTune({
                        type: 'static',
                        freq: freqInput,
                        name: `${freqInput} ${band} - NO SIGNAL`,
                        metadata: { freq: freqInput, band, signal: 'NONE' }
                    });
                }
            } catch (err) {
                // Fallback to static
                onTune({ type: 'static', freq: freqInput, name: `${freqInput} ${band} - STATIC` });
            } finally {
                setLoading(false);
            }
        }, 1500); // Realistic scan delay
    };

    const handleManualTune = (e) => {
        e.preventDefault();
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
            width: '450px', maxHeight: '650px', zIndex: 1000, display: 'flex', flexDirection: 'column',
            border: '2px solid var(--primary-color)', background: 'rgba(0,0,0,0.95)'
        }}>
            <div style={{ padding: '10px', background: 'var(--primary-color)', color: '#000', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Globe size={18} /> GLOBAL MONITORING
                </h3>
                <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => onTune({ type: 'scan' })} className="crm-btn" style={{ padding: '2px 8px', fontSize: '0.7rem', border: '1px solid #000', color: '#000', background: 'var(--accent-color)' }} title="Find Random Frequency">
                        SCAN
                    </button>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#000' }}>
                        <X size={20} />
                    </button>
                </div>
            </div>

            <div style={{ padding: '10px', background: '#000', borderBottom: '1px solid #333', fontSize: '0.8rem', color: '#888', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <AlertTriangle size={32} style={{ color: 'var(--accent-color)' }} />
                <div>
                    <strong style={{ color: 'var(--accent-color)' }}>RECEIVE-ONLY MODE ACTIVE</strong><br />
                    System is connected to public internet receivers. Transmission is strictly disabled on external bands.
                    Audio provided by public database (Radio-Browser).
                </div>
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
                {['search', 'freq', 'manual'].map(m => (
                    <button
                        key={m}
                        onClick={() => setMode(m)}
                        style={{
                            flex: 1, padding: '10px',
                            background: mode === m ? '#222' : 'transparent',
                            color: mode === m ? 'var(--primary-color)' : '#666',
                            borderBottom: mode === m ? '2px solid var(--primary-color)' : 'none',
                            cursor: 'pointer', fontFamily: 'var(--font-mono)', textTransform: 'uppercase'
                        }}
                    >
                        {m === 'freq' ? 'RF TUNER' : m}
                    </button>
                ))}
            </div>

            <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                {mode === 'search' && (
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

                        {loading && <div style={{ textAlign: 'center', color: '#888' }}><Activity className="crm-blink" /> SCANNING...</div>}

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
                )}

                {mode === 'freq' && (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ marginBottom: '20px', padding: '20px', border: '1px solid #333', background: '#111' }}>
                            <div style={{ fontSize: '2em', fontFamily: 'var(--font-display)', color: 'var(--primary-color)', textShadow: '0 0 10px var(--primary-color)' }}>
                                {freqInput} <span style={{ fontSize: '0.5em' }}>{band}</span>
                            </div>
                            <div style={{ color: '#666', fontSize: '0.8em', marginTop: '5px' }}>RAW FREQUENCY INPUT</div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', justifyContent: 'center' }}>
                            {['FM', 'AM', 'SW'].map(b => (
                                <button
                                    key={b}
                                    onClick={() => setBand(b)}
                                    className={`crm-btn ${band === b ? '' : 'disabled'}`}
                                    style={{ opacity: band === b ? 1 : 0.5 }}
                                >
                                    {b}
                                </button>
                            ))}
                        </div>

                        <form onSubmit={handleFreqTune} style={{ display: 'flex', gap: '5px' }}>
                            <input
                                type="number"
                                value={freqInput}
                                onChange={e => setFreqInput(e.target.value)}
                                placeholder="000.00"
                                step="0.1"
                                style={{ flex: 1, padding: '15px', fontSize: '1.2em', background: '#000', border: '1px solid var(--primary-color)', color: '#fff', fontFamily: 'var(--font-mono)', textAlign: 'center' }}
                            />
                            <button type="submit" className="crm-btn" style={{ padding: '0 20px' }} disabled={loading}>
                                {loading ? 'TUNING...' : 'TUNE RF'}
                            </button>
                        </form>
                        <div style={{ marginTop: '15px' }}>
                            <button className="crm-btn" onClick={handleScan} disabled={loading} style={{ width: '100%', borderColor: 'var(--accent-color)', color: 'var(--accent-color)' }}>
                                {loading ? 'SCANNING...' : 'AUTO SCAN'}
                            </button>
                        </div>
                        <p style={{ marginTop: '10px', fontSize: '0.8em', color: '#666' }}>
                            System will auto-lock to nearest public stream matching this frequency tag.
                        </p>
                    </div>
                )}

                {mode === 'manual' && (
                    <div style={{ textAlign: 'center' }}>
                        <WifiOff size={48} style={{ color: '#444', marginBottom: '10px' }} />
                        <p style={{ color: '#888', marginBottom: '20px', fontSize: '0.9em' }}>
                            Direct Stream URL Injection
                        </p>
                        <form onSubmit={handleManualTune} style={{ display: 'flex', gap: '5px' }}>
                            <input
                                type="text"
                                value={manualUrl}
                                onChange={e => setManualUrl(e.target.value)}
                                placeholder="http://stream-url..."
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
