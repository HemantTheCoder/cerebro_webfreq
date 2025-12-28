const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const channelManager = require('./channelManager');
const voiceService = require('./services/voiceService');
require('dotenv').config();

const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // For Twilio Webhooks

// Twilio Routes
app.post('/api/voice/token', (req, res) => {
    const identity = req.body.identity || 'user_' + Math.floor(Math.random() * 1000);
    try {
        const data = voiceService.generateToken(identity);
        res.json(data);
    } catch (err) {
        console.error("Token Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Debug Endpoint: Check Credentials via API
app.get('/api/voice/config-check', (req, res) => {
    const config = {
        timestamp: new Date().toISOString(),
        accountSid: process.env.TWILIO_ACCOUNT_SID ? `${process.env.TWILIO_ACCOUNT_SID.substr(0, 6)}...` : 'MISSING',
        apiKey: process.env.TWILIO_API_KEY_SID ? `${process.env.TWILIO_API_KEY_SID.substr(0, 6)}...` : 'MISSING',
        apiSecret: process.env.TWILIO_API_KEY_SECRET ? 'SET' : 'MISSING',
        appSid: process.env.TWILIO_TWIML_APP_SID ? `${process.env.TWILIO_TWIML_APP_SID.substr(0, 6)}...` : 'MISSING',
        callerId: process.env.TWILIO_CALLER_ID || 'NOT SET'
    };
    res.json(config);
});

app.post('/api/voice/incoming', (req, res) => {
    try {
        const xml = voiceService.handleVoiceWebhook(req, res);
        res.type('text/xml');
        res.send(xml);
    } catch (err) {
        console.error("Webhook Error:", err);
        res.status(500).send("Error");
    }
});

// Serve static files from React app in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client/dist')));
}

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for dev simplicity
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000, // Wait 60s before ignoring client (default 20s)
    pingInterval: 25000 // Ping every 25s
});

const PORT = process.env.PORT || 3001;

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join a frequency
    socket.on('join-frequency', (frequency) => {
        const channelInfo = channelManager.joinChannel(socket.id, frequency);
        socket.join(frequency);

        console.log(`Socket ${socket.id} joined ${frequency}`);

        // Notify user of success
        socket.emit('joined', channelInfo);

        // Notify others in channel
        socket.to(frequency).emit('user-joined', { socketId: socket.id });

        // Send current user list/count to everyone? 
        // Or just the new user count
        io.to(frequency).emit('channel-update', {
            userCount: channelInfo.userCount
        });
    });

    // Leave current frequency
    socket.on('leave-frequency', () => {
        const freq = channelManager.leaveChannel(socket.id);
        if (freq) {
            socket.leave(freq);
            console.log(`Socket ${socket.id} left ${freq}`);
            socket.to(freq).emit('user-left', { socketId: socket.id });

            // Update remaining users
            const users = channelManager.getChannelUsers(freq);
            if (users.length > 0) {
                io.to(freq).emit('channel-update', {
                    userCount: users.length
                });
            }
        }
    });

    // Channel Scan (Discovery)
    socket.on('scan-channels', (callback) => {
        const channels = channelManager.getScanList();
        if (typeof callback === 'function') {
            callback(channels);
        } else {
            socket.emit('scan-results', channels);
        }
    });

    // WebRTC Signaling
    socket.on('signal', ({ target, signal }) => {
        io.to(target).emit('signal', {
            sender: socket.id,
            signal
        });
    });

    // Voice/PTT Status (for visual indicators)
    socket.on('voice-status', ({ transmitting }) => {
        const freq = channelManager.users.get(socket.id);
        if (freq) {
            channelManager.updateActivity(freq);
            socket.to(freq).emit('voice-status', {
                socketId: socket.id,
                transmitting
            });
        }
    });

    // Text Chat
    socket.on('message', ({ text }) => {
        const freq = channelManager.users.get(socket.id);
        if (freq) {
            const msg = {
                id: Date.now() + Math.random().toString(),
                sender: socket.id, // In real app, would be user alias
                text,
                timestamp: Date.now()
            };
            io.to(freq).emit('message', msg);
        }
    });

    // --- SHARED RADIO SYNC ---
    socket.on('radio-tune', (radioData) => {
        const freq = channelManager.users.get(socket.id);
        if (freq) {
            // Broadcast the new station to everyone else in the channel
            socket.to(freq).emit('radio-tune', radioData);
        }
    });

    socket.on('radio-stop', () => {
        const freq = channelManager.users.get(socket.id);
        if (freq) {
            socket.to(freq).emit('radio-stop');
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const freq = channelManager.leaveChannel(socket.id);
        if (freq) {
            socket.to(freq).emit('user-left', { socketId: socket.id });
            const users = channelManager.getChannelUsers(freq);
            if (users.length > 0) {
                io.to(freq).emit('channel-update', {
                    userCount: users.length
                });
            }
        }
    });
});

// Handle React routing, return all requests to React app
if (process.env.NODE_ENV === 'production') {
    app.get(/(.*)/, (req, res) => {
        res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
    });
}

server.listen(PORT, () => {
    console.log(`CEREBRO Signal Server running on port ${PORT}`);
});
