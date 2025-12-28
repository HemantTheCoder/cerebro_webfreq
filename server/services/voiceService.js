const twilio = require('twilio');
const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;
const VoiceResponse = twilio.twiml.VoiceResponse;
require('dotenv').config();

const voiceService = {
    generateToken: (userIdentity) => {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const apiKey = process.env.TWILIO_API_KEY_SID;
        const apiSecret = process.env.TWILIO_API_KEY_SECRET;
        const outgoingApplicationSid = process.env.TWILIO_TWIML_APP_SID;

        if (!accountSid || !apiKey || !apiSecret || !outgoingApplicationSid) {
            console.error("Missing Twilio Credentials in .env");
            throw new Error("Server Configuration Error: Missing Credentials");
        }

        const token = new AccessToken(accountSid, apiKey, apiSecret, {
            identity: userIdentity,
            ttl: 3600 // 1 hour
        });

        const voiceGrant = new VoiceGrant({
            outgoingApplicationSid: outgoingApplicationSid,
            incomingAllow: true, // Allow incoming calls (if we set up routing later)
        });

        token.addGrant(voiceGrant);
        return { token: token.toJwt() };
    },

    handleVoiceWebhook: (req, res) => {
        // This runs when the Client calls via the TwiML App.
        // The request contains 'To' (the number dialed).
        const { To, From } = req.body;

        console.log(`Voice Webhook: Call from ${From} to ${To}`);

        const response = new VoiceResponse();

        if (!To) {
            response.say('Invalid destination number.');
        } else if (To.includes('+')) {
            // Dial the real number (PSTN)
            // We must ensure the 'callerId' is our Twilio Number or verified User Number.
            // Since we don't have a verified number config for the user yet, 
            // we might fail if we don't set callerId. 
            // Twilio requires callerId for <Dial>. 
            // IMPORTANT: User must have purchased a number OR verified their personal number.
            // We will try to dial without callerId (uses default app setting if configured) or fallback.

            const dial = response.dial({
                callerId: process.env.TWILIO_CALLER_ID || process.env.TWILIO_PHONE_NUMBER
            });
            dial.number(To);
        } else {
            // Internal Client-to-Client (if we supported it via Twilio)
            // For now, treat as invalid or echo
            response.say('Dialing internal client not supported in this mode.');
        }

        return response.toString();
    }
};

module.exports = voiceService;
