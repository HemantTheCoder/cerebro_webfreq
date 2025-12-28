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

        const missingKeys = [];
        if (!accountSid) missingKeys.push('TWILIO_ACCOUNT_SID');
        if (!apiKey) missingKeys.push('TWILIO_API_KEY_SID');
        if (!apiSecret) missingKeys.push('TWILIO_API_KEY_SECRET');
        if (!outgoingApplicationSid) missingKeys.push('TWILIO_TWIML_APP_SID');

        if (missingKeys.length > 0) {
            console.error("Missing Twilio Credentials:", missingKeys.join(', '));
            throw new Error(`Server Configuration Error: Missing Credentials [${missingKeys.join(', ')}]`);
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
        // Twilio sends 'To' (or 'Called') and 'From' (or 'Caller')
        // We check all potential variations to be robust.
        console.log(`Voice Webhook Body (Full):`, JSON.stringify(req.body));

        const destination = req.body.TargetNumber || req.body.To || req.body.Called || req.body.to || req.body.called;

        const response = new VoiceResponse();

        if (!destination) {
            const receivedKeys = Object.keys(req.body).join(', ');
            console.error("Missing Destination. Keys received:", receivedKeys);
            response.say(`Connection failed. No destination found. Received keys: ${receivedKeys}`);
        } else if (destination.includes('+')) {
            console.log(`Dialing PSTN Number: ${destination}`);

            // Use verified Caller ID from Env
            const dialOptions = {
                callerId: process.env.TWILIO_CALLER_ID || process.env.TWILIO_PHONE_NUMBER
            };

            const dial = response.dial(dialOptions);
            dial.number(destination);
        } else {
            console.log("Internal/Invalid Destination:", destination);
            response.say('Dialing internal client not supported via PSTN.');
        }

        return response.toString();
    }
};

module.exports = voiceService;
