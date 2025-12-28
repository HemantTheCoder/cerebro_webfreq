import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import { Mic, MicOff, Video, VideoOff, MessageSquare, Signal, Users, LogOut, Send, Activity, Radio as RadioIcon, XCircle, Phone } from 'lucide-react';
import { Device } from '@twilio/voice-sdk';
import ExternalTuner from './ExternalTuner';
import PhoneDialer from './PhoneDialer';
import { frequencyToPhoneNumber } from '../utils/phoneUtils';

const RadioConsole = ({ frequency, onDisconnect, onSwitchFrequency }) => {
    const socket = useSocket();
    const [activeUsers, setActiveUsers] = useState(0);
    const [messages, setMessages] = useState([]);
    const [isTransmitting, setIsTransmitting] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [remoteStreams, setRemoteStreams] = useState({}); // socketId -> Stream
    const [transmittingUsers, setTransmittingUsers] = useState(new Set()); // socketIds talking
    const [signalStrengths, setSignalStrengths] = useState({}); // socketId -> int (0-5)
    // eslint-disable-next-line
    const [debugInfo, setDebugInfo] = useState([]); // On-screen debug logs
    const [isMediaReady, setIsMediaReady] = useState(false); // New: Block signaling until ready
    const [micVolume, setMicVolume] = useState(0); // For local visualization

    // Shared Radio State
    const [showTuner, setShowTuner] = useState(false);
    const [showDialer, setShowDialer] = useState(false);
    const [activeRadio, setActiveRadio] = useState(null); // { type: 'stream'|'static', url: string, name: string }
    const radioAudioRef = useRef(null);
    const staticNodeRef = useRef(null); // AudioNode for white noise

    // WebRTC Refs
    const localStreamRef = useRef(null);
    const peersRef = useRef({}); // socketId -> RTCPeerConnection
    const pendingCandidates = useRef({}); // socketId -> RTCIceCandidate[] (Queue for early candidates)
    const localVideoRef = useRef(null);
    const audioContextRef = useRef(null); // Just in case we need to unlock audio context

    // Chat Refs
    const [chatInput, setChatInput] = useState('');
    const chatEndRef = useRef(null);
    const twilioDeviceRef = useRef(null);

    // --- 1. Channel & Socket Setup ---
    useEffect(() => {
        if (!socket || !isMediaReady) return; // Wait for media before announcing presence

        // Check if this uses Twilio (Real Phone)
        if (frequency.toString().startsWith('+')) {
            console.log("Initializing Twilio Call to:", frequency);
            const initTwilio = async () => {
                try {
                    // Fetch Token
                    console.log("Fetching Twilio Token for identity:", socket.id);
                    const response = await fetch('/api/voice/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ identity: socket.id })
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error("Twilio Token Fetch Failed:", response.status, errorText);
                        throw new Error(`Server Error (${response.status}): ${errorText}`);
                    }

                    const data = await response.json();
                    console.log("Twilio Token Received:", data);

                    if (data.token) {
                        if (twilioDeviceRef.current) {
                            console.warn("Twilio Device already exists, destroying old instance...");
                            twilioDeviceRef.current.destroy();
                        }

                        const device = new Device(data.token, {
                            logoLevel: 'debug',
                            codecPreferences: ['opus', 'pcmu'],
                        });
                        twilioDeviceRef.current = device;

                        // MAIN DIALING LOGIC
                        const attemptDial = async () => {
                            console.log("Attempting to Dial... Device State:", device.state);
                            if (device.isBusy) { console.warn("Device busy, skipping."); return; }
                            const cleanNumber = frequency.toString().replace(/[^0-9+]/g, '');

                            try {
                                console.log("Dialing...");
                                const call = await device.connect({ TargetNumber: cleanNumber });

                                call.on('accept', () => setMessages(prev => [...prev, { system: true, text: 'SECURE LINE ESTABLISHED via PSTN' }]));
                                call.on('disconnect', () => onDisconnect());
                                call.on('error', (err) => {
                                    console.error("Call Error:", err);
                                    setMessages(prev => [...prev, { system: true, text: `Call Error: ${err.message}` }]);
                                });
                            } catch (e) {
                                console.error("Dial Exception:", e);
                                setMessages(prev => [...prev, { system: true, text: `Dial Exception: ${e.message}` }]);
                            }
                        };

                        device.on('ready', () => {
                            console.log("Twilio Device Ready Event Fired!");
                            attemptDial();
                        });

                        device.on('error', (err) => {
                            console.error("Twilio Device Error:", err);
                            if (err.code === 31005) {
                                setMessages(prev => [...prev, { system: true, text: "VOIP NETWORK ERROR: Switch Network." }]);
                            } else {
                                setMessages(prev => [...prev, { system: true, text: `VoIP Error (${err.code}): ${err.message}` }]);
                            }
                        });

                        device.on('registered', () => {
                            console.log("Twilio Registered Successfully");
                            setTimeout(() => {
                                if (device.state === 'registered' || device.state === 'ready') {
                                    console.log("Force Dialing fallback...");
                                    attemptDial();
                                }
                            }, 1000);
                        });
                        device.on('unregistered', () => console.log("Twilio Unregistered"));

                        await device.register();
                    } else {
                        console.error("No token in response:", data);
                        throw new Error("Invalid Token Response from Server");
                    }
                } catch (err) {
                    console.error("Twilio Init Failed:", err);
                    setMessages(prev => [...prev, { system: true, text: `VOIP FAILURE: ${err.message}` }]);
                }
            };
            initTwilio();
        }

        // Join Socket Room (Always, for Presence/Chat even during Call)
        console.log("Media ready, joining frequency:", frequency);
        socket.emit('join-frequency', frequency);

        // Listeners
        socket.on('message', (msg) => {
            setMessages(prev => [...prev, msg]);
        });

        socket.on('user-joined', ({ socketId }) => {
            setMessages(prev => [...prev, { system: true, text: `Signal detected: ${socketId.substr(0, 4)}...` }]);
            initiateCall(socketId);
        });

        socket.on('user-left', ({ socketId }) => {
            setMessages(prev => [...prev, { system: true, text: `Signal lost: ${socketId.substr(0, 4)}...` }]);
            if (peersRef.current[socketId]) {
                peersRef.current[socketId].close();
                delete peersRef.current[socketId];
            }
            setRemoteStreams(prev => {
                const newStreams = { ...prev };
                delete newStreams[socketId];
                return newStreams;
            });
            setTransmittingUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(socketId);
                return newSet;
            });
        });

        socket.on('channel-update', ({ userCount }) => {
            setActiveUsers(userCount);
        });

        socket.on('voice-status', ({ socketId, transmitting }) => {
            setTransmittingUsers(prev => {
                const newSet = new Set(prev);
                if (transmitting) newSet.add(socketId);
                else newSet.delete(socketId);
                return newSet;
            });
        });

        socket.on('radio-tune', (radioData) => {
            console.log(`[RTC] Radio Tuned: ${radioData.name}`);
            setActiveRadio(radioData);
        });

        socket.on('radio-stop', () => {
            console.log("[RTC] Radio Stopped");
            setActiveRadio(null);
        });

        socket.on('disconnect', (reason) => {
            console.log(`[RTC] Socket Disconnected: ${reason}`);
            setMessages(prev => [...prev, { system: true, text: `Connection Lost: ${reason}` }]);
        });

        socket.on('connect_error', (err) => {
            console.log(`[RTC] Connect Error: ${err.message}`);
        });

        const handleGlobalError = (msg, url, line, col, error) => {
            console.error("Global Error:", msg, error);
            setMessages(prev => [...prev, { system: true, text: `FATAL ERROR: ${msg}` }]);
            return false;
        };
        window.addEventListener('error', handleGlobalError);
        window.addEventListener('unhandledrejection', (e) => handleGlobalError(e.reason, '', '', '', e.reason));

        socket.on('signal', async (data) => {
            try {
                await handleSignal(data);
            } catch (err) {
                console.error("Signal Handling Error:", err);
            }
        });

        return () => {
            socket.emit('leave-frequency');
            window.removeEventListener('error', handleGlobalError);
            socket.off('message');
            socket.off('user-joined');
            socket.off('user-left');
            socket.off('channel-update');
            socket.off('voice-status');
            socket.off('signal');
            socket.off('radio-tune');
            socket.off('radio-stop');

            if (twilioDeviceRef.current) {
                twilioDeviceRef.current.destroy();
            }

            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
            if (activeRadio) handleStopRadio(true);
            Object.values(peersRef.current).forEach(p => p.close());
        };
    }, [socket, frequency, isMediaReady]);

    // --- 2. WebRTC Logic (Unchanged) ---
    const logDebug = useCallback((msg) => {
        console.log(`[RTC] ${msg}`);
    }, []);

    useEffect(() => {
        const initMedia = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideoEnabled });
                const oldStream = localStreamRef.current;
                localStreamRef.current = stream;

                stream.getAudioTracks().forEach(track => {
                    track.enabled = isTransmitting;
                });

                if (isVideoEnabled) {
                    stream.getVideoTracks().forEach(track => track.enabled = true);
                }

                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                    localVideoRef.current.muted = true;
                }

                if (audioContextRef.current) audioContextRef.current.close();
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
                const source = audioContextRef.current.createMediaStreamSource(stream);
                const analyser = audioContextRef.current.createAnalyser();
                analyser.fftSize = 256;
                source.connect(analyser);

                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                const updateVolume = () => {
                    analyser.getByteFrequencyData(dataArray);
                    let values = 0;
                    for (let i = 0; i < dataArray.length; i++) values += dataArray[i];
                    const average = values / dataArray.length;
                    setMicVolume(average);
                    requestAnimationFrame(updateVolume);
                };
                updateVolume();

                Object.entries(peersRef.current).forEach(([socketId, peer]) => {
                    const senders = peer.getSenders();
                    const audioTrack = stream.getAudioTracks()[0];
                    if (audioTrack) {
                        const audioSender = senders.find(s => s.track?.kind === 'audio');
                        if (audioSender) audioSender.replaceTrack(audioTrack).catch(console.error);
                        else if (peer.signalingState !== 'closed') peer.addTrack(audioTrack, stream);
                    }
                    const videoTrack = stream.getVideoTracks()[0];
                    if (videoTrack) {
                        const videoSender = senders.find(s => s.track?.kind === 'video');
                        if (videoSender) videoSender.replaceTrack(videoTrack).catch(console.error);
                        else if (peer.signalingState !== 'closed') {
                            peer.addTrack(videoTrack, stream);
                            initiateCall(socketId);
                        }
                    }
                });

                if (oldStream && oldStream !== stream) {
                    oldStream.getTracks().forEach(t => t.stop());
                }

                setIsMediaReady(true);
            } catch (err) {
                console.error("Media Error:", err);
                alert("Microphone/Camera access failed! Check permissions.");
                setIsMediaReady(true);
            }
        };
        initMedia();
    }, [isVideoEnabled]);

    const createPeer = (targetSocketId, initiator = false) => {
        const peer = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        });

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => peer.addTrack(track, localStreamRef.current));
        }

        peer.onicecandidate = (e) => {
            if (e.candidate) {
                socket.emit('signal', { target: targetSocketId, signal: { type: 'candidate', candidate: e.candidate } });
            }
        };

        peer.oniceconnectionstatechange = () => {
            if (peer.iceConnectionState === 'connected') {
                setMessages(prev => [...prev, { system: true, text: `Secure link established: ${targetSocketId.substr(0, 4)}` }]);
            }
        };

        peer.ontrack = (e) => {
            setRemoteStreams(prev => ({ ...prev, [targetSocketId]: e.streams[0] }));
        };

        peersRef.current[targetSocketId] = peer;
        return peer;
    };

    const initiateCall = async (targetSocketId) => {
        try {
            const peer = createPeer(targetSocketId, true);
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            socket.emit('signal', { target: targetSocketId, signal: { type: 'offer', sdp: offer } });
        } catch (err) {
            console.error("Initiate Call Error:", err);
        }
    };

    const handleSignal = async ({ sender, signal }) => {
        try {
            let peer = peersRef.current[sender];
            if (!peer && (signal.type === 'offer')) {
                peer = createPeer(sender, false);
            }

            if (signal.type === 'offer') {
                if (!peer) return;
                await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                const queue = pendingCandidates.current[sender] || [];
                if (queue.length > 0) {
                    for (const candidate of queue) await peer.addIceCandidate(candidate).catch(console.error);
                    delete pendingCandidates.current[sender];
                }
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                socket.emit('signal', { target: sender, signal: { type: 'answer', sdp: answer } });

            } else if (signal.type === 'answer') {
                if (peer) await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            } else if (signal.type === 'candidate') {
                if (peer && peer.remoteDescription) {
                    await peer.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(console.error);
                } else {
                    if (!pendingCandidates.current[sender]) pendingCandidates.current[sender] = [];
                    pendingCandidates.current[sender].push(new RTCIceCandidate(signal.candidate));
                }
            }
        } catch (err) {
            console.error("Handle Signal Error:", err);
        }
    };

    const startTx = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(t => t.enabled = true);
            setIsTransmitting(true);
            socket.emit('voice-status', { transmitting: true });
        }
    };

    const stopTx = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(t => t.enabled = false);
            setIsTransmitting(false);
            socket.emit('voice-status', { transmitting: false });
        }
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Space' && !e.repeat && document.activeElement.tagName !== 'INPUT') startTx();
        };
        const handleKeyUp = (e) => {
            if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') stopTx();
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            const newStrengths = {};
            Object.keys(remoteStreams).forEach(id => {
                newStrengths[id] = Math.floor(Math.random() * 5) + 1;
            });
            setSignalStrengths(newStrengths);
        }, 2000);
        return () => clearInterval(interval);
    }, [remoteStreams]);

    useEffect(() => {
        if (staticNodeRef.current) {
            staticNodeRef.current.stop();
            staticNodeRef.current.disconnect();
            staticNodeRef.current = null;
        }

        if (!activeRadio) {
            if (radioAudioRef.current) {
                radioAudioRef.current.pause();
                radioAudioRef.current.src = "";
            }
            return;
        }

        if (activeRadio.type === 'stream') {
            if (radioAudioRef.current) {
                radioAudioRef.current.volume = 1.0;
                radioAudioRef.current.play().catch(console.error);
            }
        } else if (activeRadio.type === 'static') {
            if (!audioContextRef.current) return;
            const ctx = audioContextRef.current;
            const bufferSize = ctx.sampleRate * 2;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

            const noise = ctx.createBufferSource();
            noise.buffer = buffer;
            noise.loop = true;
            const gainNode = ctx.createGain();
            gainNode.gain.value = 0.1;

            noise.connect(gainNode);
            gainNode.connect(ctx.destination);
            noise.start();
            staticNodeRef.current = noise;
        }
    }, [activeRadio]);

    useEffect(() => {
        const duckVolume = transmittingUsers.size > 0 || isTransmitting ? 0.2 : 1.0;
        if (radioAudioRef.current) radioAudioRef.current.volume = duckVolume;
    }, [transmittingUsers.size, isTransmitting]);

    const handleBroadcast = (radioData) => {
        setActiveRadio(radioData);
        socket.emit('radio-tune', radioData);
        setShowTuner(false);
    };

    const handleStopRadio = (localOnly = false) => {
        if (!localOnly) socket.emit('radio-stop');
        else setActiveRadio(null);
    };

    const sendMessage = (e) => {
        e.preventDefault();
        if (chatInput.trim()) {
            socket.emit('message', { text: chatInput });
            setChatInput('');
        }
    };

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="console-container" style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', padding: '10px', gap: '10px' }}>
            <div className="crm-panel" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div>
                        <h2 className="crm-text-glow" style={{ fontFamily: 'var(--font-display)', color: 'var(--primary-color)', margin: 0, lineHeight: 1 }}>
                            {frequency}
                            {!frequency.toString().includes('+') && <span style={{ fontSize: '0.6em', color: 'var(--text-muted)' }}>MHz</span>}
                        </h2>
                        <div style={{ fontSize: '0.8rem', color: 'var(--accent-color)', fontFamily: 'var(--font-mono)', opacity: 0.8 }}>
                            {frequencyToPhoneNumber(frequency)}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--success-color)' }}>
                        <Users size={16} /> <span>{activeUsers}</span>
                    </div>
                </div>

                {activeRadio && (
                    <div style={{ position: 'absolute', top: '70px', left: '50%', transform: 'translateX(-50%)', background: '#002211', padding: '5px 15px', border: '1px solid var(--primary-color)', borderRadius: '5px', display: 'flex', gap: '10px', alignItems: 'center', zIndex: 2000 }}>
                        <RadioIcon size={16} className="crm-blink" style={{ color: 'var(--primary-color)' }} />
                        <span style={{ color: '#fff', fontSize: '0.9rem', fontFamily: 'var(--font-mono)' }}>{activeRadio.name.substr(0, 25)}</span>

                        {activeRadio.type === 'stream' && (
                            <audio
                                ref={radioAudioRef}
                                src={activeRadio.url}
                                controls
                                autoPlay
                                style={{ height: '30px', width: '250px' }}
                                onError={(e) => alert("Stream Error: " + e.currentTarget.error.message)}
                            />
                        )}

                        <button onClick={() => handleStopRadio()} style={{ background: 'transparent', border: 'none', color: '#ff5555', cursor: 'pointer' }}>
                            <XCircle size={18} />
                        </button>
                    </div>
                )}

                <button className="crm-btn danger" onClick={onDisconnect} style={{ padding: '5px 15px', fontSize: '0.8rem' }}>
                    <LogOut size={14} style={{ marginRight: '5px' }} /> DISCONNECT
                </button>
            </div>

            <div style={{ display: 'flex', flex: 1, gap: '10px', overflow: 'hidden' }}>
                <div className="crm-panel" style={{ flex: 3, display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '10px', overflowY: 'auto', alignContent: 'flex-start' }}>
                    {isVideoEnabled && (
                        <div style={{ width: '200px', height: '150px', background: '#000', border: '1px solid var(--primary-color)', position: 'relative' }}>
                            <video ref={localVideoRef} autoPlay muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <span style={{ position: 'absolute', bottom: '5px', left: '5px', fontSize: '0.7rem', background: 'rgba(0,0,0,0.7)', padding: '2px' }}>LOCAL FEED</span>
                        </div>
                    )}

                    {Object.entries(remoteStreams).map(([id, stream]) => (
                        <div key={id} style={{
                            width: '300px', height: '200px', background: '#000',
                            border: `2px solid ${transmittingUsers.has(id) ? 'var(--success-color)' : 'var(--panel-border)'}`,
                            position: 'relative', display: 'flex', flexDirection: 'column'
                        }}>
                            {isVideoEnabled ? (
                                <RemoteVideo stream={stream} />
                            ) : (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                                    <Activity size={48} style={{ color: transmittingUsers.has(id) ? 'var(--success-color)' : '#333' }} />
                                    {transmittingUsers.has(id) && <span className="crm-text-glow" style={{ color: 'var(--success-color)', fontSize: '0.8rem', marginTop: '10px' }}>RECEIVING AUDIO...</span>}
                                </div>
                            )}
                            <RemoteAudio stream={stream} />
                            <div style={{ position: 'absolute', bottom: 0, width: '100%', background: 'rgba(0,0,0,0.8)', padding: '5px', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                <span>ID: {id.substr(0, 4)}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                    <Signal size={12} />
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} style={{
                                            width: '3px', height: '8px',
                                            background: i < (signalStrengths[id] || 3) ? (i < 2 ? 'var(--danger-color)' : 'var(--success-color)') : '#333'
                                        }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}

                    {Object.keys(remoteStreams).length === 0 && (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column' }}>
                            <Signal size={64} style={{ opacity: 0.2 }} />
                            <p>AWAITING SIGNALS...</p>
                        </div>
                    )}
                </div>

                <div className="crm-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '350px' }}>
                    <div style={{ padding: '10px', borderBottom: '1px solid var(--panel-border)', background: 'var(--panel-bg)', zIndex: 10 }}>
                        <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MessageSquare size={16} /> CHANNEL LOG
                        </h3>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'var(--font-mono)' }}>
                        {messages.map((msg, idx) => (
                            <div key={idx} style={{
                                fontSize: '0.9rem',
                                color: msg.system ? 'var(--accent-color)' : 'var(--text-main)',
                                opacity: msg.system ? 0.7 : 1
                            }}>
                                {msg.system ? (
                                    <span>{'>'} {msg.text}</span>
                                ) : (
                                    <div>
                                        <span style={{ color: 'var(--primary-color)', fontSize: '0.8rem' }}>[{new Date(msg.timestamp).toLocaleTimeString()}] {msg.sender.substr(0, 4)}:</span>
                                        <div style={{ marginLeft: '10px' }}>{msg.text}</div>
                                    </div>
                                )}
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    <form onSubmit={sendMessage} style={{ padding: '10px', borderTop: '1px solid var(--panel-border)', display: 'flex', gap: '5px' }}>
                        <input
                            type="text"
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            placeholder="TRANSMIT MESSAGE..."
                            style={{
                                flex: 1, background: '#000', border: '1px solid var(--panel-border)',
                                color: 'var(--text-main)', padding: '8px', fontFamily: 'var(--font-mono)', outline: 'none'
                            }}
                        />
                        <button type="submit" className="crm-btn" style={{ padding: '8px' }}><Send size={16} /></button>
                    </form>
                </div>
            </div>

            <div className="crm-panel" style={{ padding: '20px', display: 'flex', justifyContent: 'center', gap: '20px', alignItems: 'center' }}>
                <button
                    className={`crm-btn centered ${isVideoEnabled ? '' : 'danger'}`}
                    onClick={() => setIsVideoEnabled(!isVideoEnabled)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', minWidth: '80px', fontSize: '0.7rem' }}
                >
                    {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
                    VIDEO {isVideoEnabled ? 'ON' : 'OFF'}
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <button
                        onMouseDown={startTx}
                        onMouseUp={stopTx}
                        onMouseLeave={stopTx}
                        onTouchStart={startTx}
                        onTouchEnd={stopTx}
                        style={{
                            width: '120px', height: '120px', borderRadius: '50%',
                            background: isTransmitting ? 'var(--danger-color)' : '#222',
                            border: `4px solid ${isTransmitting ? 'var(--accent-color)' : '#444'}`,
                            color: isTransmitting ? '#000' : '#888',
                            boxShadow: isTransmitting ? '0 0 30px var(--danger-color)' : 'inset 0 0 20px #000',
                            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.1s'
                        }}
                    >
                        {isTransmitting ? <Mic size={40} /> : <MicOff size={40} />}
                        <span style={{ fontWeight: 'bold', marginTop: '5px' }}>{isTransmitting ? 'ON AIR' : 'PTT'}</span>
                    </button>
                    <LocalAudioVisualizer volume={micVolume} isTransmitting={isTransmitting} />
                </div>

                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', maxWidth: '150px', textAlign: 'center' }}>
                    HOLD [SPACE] TO TALK
                </div>
            </div>

            <button
                className="crm-btn"
                onClick={() => setShowTuner(true)}
                style={{ position: 'fixed', right: '30px', bottom: '30px', zIndex: 1000 }}
            >
                <RadioIcon size={20} /> TUNER
            </button>

            {showTuner && <ExternalTuner onTune={handleBroadcast} onClose={() => setShowTuner(false)} />}

            <button
                className="crm-btn"
                onClick={() => setShowDialer(true)}
                style={{ position: 'fixed', left: '30px', bottom: '30px', zIndex: 1000, display: 'flex', gap: '10px', alignItems: 'center' }}
            >
                <Phone size={20} /> DIAL
            </button>

            {showDialer && (
                <PhoneDialer
                    onClose={() => setShowDialer(false)}
                    onCall={(newFreq) => {
                        setShowDialer(false);
                        onSwitchFrequency(newFreq);
                    }}
                />
            )}
        </div>
    );
};

const RemoteVideo = ({ stream }) => {
    const ref = useRef();
    useEffect(() => {
        if (ref.current && stream) ref.current.srcObject = stream;
    }, [stream]);
    return <video ref={ref} autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
};

const RemoteAudio = ({ stream }) => {
    const ref = useRef();
    useEffect(() => {
        if (ref.current && stream) {
            ref.current.srcObject = stream;
            ref.current.play().catch(e => console.error("Remote Audio Play Fail:", e));
        }
    }, [stream]);
    return <audio ref={ref} autoPlay controls={false} />;
};

const LocalAudioVisualizer = ({ volume, isTransmitting }) => {
    const bars = 5;
    return (
        <div style={{ display: 'flex', gap: '2px', height: '15px', alignItems: 'flex-end', marginTop: '10px' }}>
            {[...Array(bars)].map((_, i) => (
                <div key={i} style={{
                    width: '8px',
                    height: `${Math.min(100, (volume / 255) * 100 * (i + 1) * 0.5)}%`,
                    background: isTransmitting ? 'var(--success-color)' : '#444',
                    transition: 'height 0.1s'
                }} />
            ))}
        </div>
    );
};

export default RadioConsole;
