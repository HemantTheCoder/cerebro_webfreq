import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import { Mic, MicOff, Video, VideoOff, MessageSquare, Signal, Users, LogOut, Send, Activity } from 'lucide-react';

const RadioConsole = ({ frequency, onDisconnect }) => {
    const socket = useSocket();
    const [activeUsers, setActiveUsers] = useState(0);
    const [messages, setMessages] = useState([]);
    const [isTransmitting, setIsTransmitting] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [remoteStreams, setRemoteStreams] = useState({}); // socketId -> Stream
    const [transmittingUsers, setTransmittingUsers] = useState(new Set()); // socketIds talking
    const [signalStrengths, setSignalStrengths] = useState({}); // socketId -> int (0-5)
    const [debugInfo, setDebugInfo] = useState([]); // On-screen debug logs
    const [isMediaReady, setIsMediaReady] = useState(false); // New: Block signaling until ready

    // WebRTC Refs
    const localStreamRef = useRef(null);
    const peersRef = useRef({}); // socketId -> RTCPeerConnection
    const pendingCandidates = useRef({}); // socketId -> RTCIceCandidate[] (Queue for early candidates)
    const localVideoRef = useRef(null);
    const audioContextRef = useRef(null); // Just in case we need to unlock audio context

    // Chat Refs
    const [chatInput, setChatInput] = useState('');
    const chatEndRef = useRef(null);

    // --- 1. Channel & Socket Setup ---
    useEffect(() => {
        if (!socket || !isMediaReady) return; // Wait for media before announcing presence

        // Join
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
            // Cleanup peer
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

        socket.on('disconnect', (reason) => {
            logDebug(`Socket Disconnected: ${reason}`);
            setMessages(prev => [...prev, { system: true, text: `Connection Lost: ${reason}` }]);
        });

        socket.on('connect_error', (err) => {
            logDebug(`Connect Error: ${err.message}`);
        });

        // Global Async Error Handler (Last resort to see why it crashes)
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
                logDebug(`Signal Error: ${err.message}`);
            }
        });

        return () => {
            socket.emit('leave-frequency');
            window.removeEventListener('error', handleGlobalError);
            // ... remove other listeners
            socket.off('message');
            socket.off('user-joined');
            socket.off('user-left');
            socket.off('channel-update');
            socket.off('voice-status');
            socket.off('signal');

            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
            Object.values(peersRef.current).forEach(p => p.close());
        };
    }, [socket, frequency, isMediaReady]); // Depend on isMediaReady

    // --- 2. WebRTC Logic ---
    // Helper to log to chat/screen
    const logDebug = useCallback((msg) => {
        console.log(`[RTC] ${msg}`);
        // Optional: Uncomment to see connection logs in chat visual
        // setMessages(prev => [...prev, { system: true, text: `DEBUG: ${msg}` }]); 
    }, []);

    useEffect(() => {
        const initMedia = async () => {
            try {
                // Always request Audio. Video depends on toggle.
                // Note: We get a NEW stream every time video is toggled to ensure clean device release.
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideoEnabled });

                const oldStream = localStreamRef.current;
                localStreamRef.current = stream;

                // Audio: Disabled by default (PTT), but if talking, keep it enabled
                stream.getAudioTracks().forEach(track => {
                    track.enabled = isTransmitting;
                });

                // Video: If we requested video, ensure it's enabled
                if (isVideoEnabled) {
                    stream.getVideoTracks().forEach(track => track.enabled = true);
                }

                // Local Preview
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                    localVideoRef.current.muted = true; // Always mute local
                }

                // Update existing peers
                Object.entries(peersRef.current).forEach(([socketId, peer]) => {
                    const senders = peer.getSenders();

                    // Audio
                    const audioTrack = stream.getAudioTracks()[0];
                    if (audioTrack) {
                        const audioSender = senders.find(s => s.track?.kind === 'audio');
                        if (audioSender) {
                            audioSender.replaceTrack(audioTrack).catch(err => logDebug(`Replace Audio Fail: ${err}`));
                        } else {
                            // No sender yet? Add it.
                            if (peer.signalingState !== 'closed') {
                                peer.addTrack(audioTrack, stream);
                                // In a perfect world, we renegotiate here.
                                // simpler: just init call again?
                            }
                        }
                    }

                    // Video
                    const videoTrack = stream.getVideoTracks()[0];
                    if (videoTrack) {
                        const videoSender = senders.find(s => s.track?.kind === 'video');
                        if (videoSender) {
                            videoSender.replaceTrack(videoTrack).catch(err => logDebug(`Replace Video Fail: ${err}`));
                        } else {
                            if (peer.signalingState !== 'closed') {
                                peer.addTrack(videoTrack, stream);
                                // renegotiate needed for new track
                                initiateCall(socketId);
                            }
                        }
                    }
                });

                // Stop old tracks to release HW
                if (oldStream && oldStream !== stream) {
                    oldStream.getTracks().forEach(t => t.stop());
                }

                setIsMediaReady(true); // Signal that we are ready to join/negotiate

            } catch (err) {
                console.error("Media Error:", err);
                logDebug(`Media Error: ${err.message}`);
                alert("Microphone/Camera access failed! Check permissions.");
                // Even if failed, we might want to join as listener? 
                // For now, let's allow join but it might be audio-only or broken.
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
                // In production, you would add TURN servers here (e.g., OpenRelay)
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
            logDebug(`${targetSocketId} ICE State: ${peer.iceConnectionState}`);
            if (peer.iceConnectionState === 'connected') {
                setMessages(prev => [...prev, { system: true, text: `Secure link established: ${targetSocketId.substr(0, 4)}` }]);
            }
            if (peer.iceConnectionState === 'failed' || peer.iceConnectionState === 'disconnected') {
                setMessages(prev => [...prev, { system: true, text: `Link unstable: ${targetSocketId.substr(0, 4)}` }]);
                // Optional: Restart ICE?
            }
        };

        peer.ontrack = (e) => {
            logDebug(`Received Track from ${targetSocketId}: ${e.track.kind}`);
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
            logDebug(`Init Call Failed: ${err.message}`);
        }
    };

    const handleSignal = async ({ sender, signal }) => {
        try {
            let peer = peersRef.current[sender];

            // Create peer if it's an offer and we don't have one
            if (!peer && (signal.type === 'offer')) {
                peer = createPeer(sender, false);
            }

            // If still no peer (e.g. Early Candidate), we can't add it to a null peer.
            // But we MUST buffer it if we expect an offer soon?
            // Actually, 'createPeer' is only called on Offer or Initiate.
            // If Candidate arrives first, we need to store it somewhere even without a peer?
            // Simpler: If no peer, we can't buffer efficiently per peer instance.
            // But wait, if Candidate arrives, we don't know the peer yet. 
            // We buffer globally by sender ID.

            if (signal.type === 'offer') {
                if (!peer) return; // Should have been created above
                await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));

                // Process Pending Candidates if any
                const queue = pendingCandidates.current[sender] || [];
                if (queue.length > 0) {
                    logDebug(`Flushing ${queue.length} buffered candidates for ${sender}`);
                    for (const candidate of queue) {
                        await peer.addIceCandidate(candidate).catch(e => console.error(" ICE Add Error", e));
                    }
                    delete pendingCandidates.current[sender];
                }

                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                socket.emit('signal', { target: sender, signal: { type: 'answer', sdp: answer } });

            } else if (signal.type === 'answer') {
                if (peer) {
                    await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                    // Usually answer comes after offer, candidates might be waiting too?
                    // Depending on role. 
                }
            } else if (signal.type === 'candidate') {
                if (peer && peer.remoteDescription) {
                    // Safe to add
                    await peer.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(e => console.error("ICE Add Error", e));
                } else {
                    // Buffer it!
                    logDebug(`Buffering ICE candidate from ${sender} (No RemoteDesc yet)`);
                    if (!pendingCandidates.current[sender]) {
                        pendingCandidates.current[sender] = [];
                    }
                    pendingCandidates.current[sender].push(new RTCIceCandidate(signal.candidate));
                }
            }
        };

        // --- 3. PTT Logic ---
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
                if (e.code === 'Space' && !e.repeat && document.activeElement.tagName !== 'INPUT') {
                    startTx();
                }
            };
            const handleKeyUp = (e) => {
                if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
                    stopTx();
                }
            };
            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('keyup', handleKeyUp);
            return () => {
                window.removeEventListener('keydown', handleKeyDown);
                window.removeEventListener('keyup', handleKeyUp);
            };
        }, []);

        // --- 4. Signal Simulation ---
        useEffect(() => {
            const interval = setInterval(() => {
                const newStrengths = {};
                Object.keys(remoteStreams).forEach(id => {
                    // Simulate fluctuation
                    newStrengths[id] = Math.floor(Math.random() * 5) + 1;
                });
                setSignalStrengths(newStrengths);
            }, 2000);
            return () => clearInterval(interval);
        }, [remoteStreams]);

        // --- 5. Chat ---
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


        // --- Render ---
        return (
            <div className="console-container" style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', padding: '10px', gap: '10px' }}>

                {/* Header Panel */}
                <div className="crm-panel" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <h2 className="crm-text-glow" style={{ fontFamily: 'var(--font-display)', color: 'var(--primary-color)', margin: 0 }}>
                            {frequency} <span style={{ fontSize: '0.6em', color: 'var(--text-muted)' }}>MHz</span>
                        </h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--success-color)' }}>
                            <Users size={16} /> <span>{activeUsers}</span>
                        </div>
                        {isTransmitting && <span style={{ color: 'var(--danger-color)', fontWeight: 'bold' }}>TX :: TRANSMITTING</span>}
                        {transmittingUsers.size > 0 && <span style={{ color: 'var(--success-color)', fontWeight: 'bold' }}>RX :: RECEIVING</span>}
                    </div>
                    <button className="crm-btn danger" onClick={onDisconnect} style={{ padding: '5px 15px', fontSize: '0.8rem' }}>
                        <LogOut size={14} style={{ marginRight: '5px' }} /> DISCONNECT
                    </button>
                </div>

                {/* Main Body: Grid of Remote Feeds + Chat */}
                <div style={{ display: 'flex', flex: 1, gap: '10px', overflow: 'hidden' }}>

                    {/* Remote Feeds / Visuals */}
                    <div className="crm-panel" style={{ flex: 3, display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '10px', overflowY: 'auto', alignContent: 'flex-start' }}>
                        {/* Self Video Preview (Small) */}
                        {isVideoEnabled && (
                            <div style={{ width: '200px', height: '150px', background: '#000', border: '1px solid var(--primary-color)', position: 'relative' }}>
                                <video ref={localVideoRef} autoPlay muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <span style={{ position: 'absolute', bottom: '5px', left: '5px', fontSize: '0.7rem', background: 'rgba(0,0,0,0.7)', padding: '2px' }}>LOCAL FEED</span>
                            </div>
                        )}

                        {/* Remote Users */}
                        {Object.entries(remoteStreams).map(([id, stream]) => (
                            <div key={id} style={{
                                width: '300px', height: '200px', background: '#000',
                                border: `2px solid ${transmittingUsers.has(id) ? 'var(--success-color)' : 'var(--panel-border)'}`,
                                position: 'relative', display: 'flex', flexDirection: 'column'
                            }}>
                                {isVideoEnabled ? (
                                    <RemoteVideo stream={stream} />
                                ) : (
                                    // Audio Visualization Placeholder
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                                        <Activity size={48} style={{ color: transmittingUsers.has(id) ? 'var(--success-color)' : '#333' }} />
                                        {transmittingUsers.has(id) && <span className="crm-text-glow" style={{ color: 'var(--success-color)', fontSize: '0.8rem', marginTop: '10px' }}>RECEIVING AUDIO...</span>}
                                    </div>
                                )}

                                {/* Audio Element (Hidden but active) */}
                                <RemoteAudio stream={stream} />

                                {/* Metadata Overlay */}
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

                    {/* Chat Panel */}
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

                {/* Control Footer */}
                <div className="crm-panel" style={{ padding: '20px', display: 'flex', justifyContent: 'center', gap: '20px', alignItems: 'center' }}>
                    <button
                        className={`crm-btn centered ${isVideoEnabled ? '' : 'danger'}`}
                        onClick={() => setIsVideoEnabled(!isVideoEnabled)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', minWidth: '80px', fontSize: '0.7rem' }}
                    >
                        {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
                        VIDEO {isVideoEnabled ? 'ON' : 'OFF'}
                    </button>

                    {/* PTT Main Button */}
                    <button
                        onMouseDown={startTx}
                        onMouseUp={stopTx}
                        onMouseLeave={stopTx} // Safety
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

                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', maxWidth: '150px', textAlign: 'center' }}>
                        HOLD [SPACE] TO TALK
                    </div>
                </div>
            </div>
        );
    };

    // Helper Components for Media to handle refs cleanly
    const RemoteVideo = ({ stream }) => {
        const videoRef = useRef(null);
        useEffect(() => {
            if (videoRef.current && stream && stream.active) {
                videoRef.current.srcObject = stream;
            }
        }, [stream]);

        // Safety check
        if (!stream) return <div style={{ width: '100%', height: '100%', background: '#111' }}></div>;

        return <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
    };

    const RemoteAudio = ({ stream }) => {
        const audioRef = useRef(null);
        useEffect(() => {
            if (audioRef.current && stream) audioRef.current.srcObject = stream;
        }, [stream]);
        return <audio ref={audioRef} autoPlay />;
    };

    export default RadioConsole;
