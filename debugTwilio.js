const twilio = require('twilio');
require('dotenv').config({ path: 'server/.env' });

// Debug Script
console.log("--- Connectivity Test ---");
console.log("Account SID:", process.env.TWILIO_ACCOUNT_SID ? "SET" : "MISSING");
console.log("Auth Token:", process.env.TWILIO_AUTH_TOKEN ? "SET" : "MISSING");
console.log("Caller ID:", process.env.TWILIO_CALLER_ID || "NOT SET");

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.error("CRITICAL: Missing Credentials");
    process.exit(1);
}

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

console.log("Attempting to list recent calls to verify auth...");
client.calls.list({ limit: 1 })
    .then(calls => console.log(`Success! Found ${calls.length} calls (Auth works).`))
    .catch(err => {
        console.error("Auth Failed:", err.message);
        if (err.code === 20003) console.log("Hint: Account SID/Auth Token mismatch.");
        if (err.code === 20404) console.log("Hint: Resource not found.");
    });
