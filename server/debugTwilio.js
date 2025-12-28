const twilio = require('twilio');
require('dotenv').config();

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

console.log("Attempting to fetch Account details...");
client.api.v2010.accounts(process.env.TWILIO_ACCOUNT_SID).fetch()
    .then(account => console.log(`Success! Account Name: ${account.friendlyName} (Status: ${account.status})`))
    .catch(err => {
        console.error("Auth Failed:", err.message);
        console.error("Code:", err.code);
    });
