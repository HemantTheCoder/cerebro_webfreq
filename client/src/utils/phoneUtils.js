/**
 * Phone Utils
 * Handles conversion between Radio Frequencies and Simulated Phone Numbers.
 * 
 * Logic:
 * Frequency is usually 3-4 digits (e.g. 101.5).
 * We will map this to a toll-free style number: +1 (800) FRE-Q000
 *
 * Examples:
 * 88.5 MHz -> +1 (800) 088-5000
 * 101.5 MHz -> +1 (800) 101-5000
 *
 * NEW: International Support
 * If the input is ALREADY a phone number (contains +), we treat it as a direct ID.
 */

export const isPhoneNumber = (id) => {
    // Determine if the ID is a Phone Number or a Frequency
    // Frequencies are usually floats < 200 (FM/AM)
    // Phone numbers contain + or are long strings
    if (typeof id === 'string' && id.includes('+')) return true;
    if (typeof id === 'string' && id.length > 7 && !id.includes('.')) return true;
    return false;
};

// Format: +1 (800) XXX-XXXX
export const frequencyToPhoneNumber = (freqStr) => {
    // If it's already a phone number, return as is
    if (isPhoneNumber(freqStr)) return freqStr;

    // Ensure float
    const freq = parseFloat(freqStr);
    if (isNaN(freq)) return "UNKNOWN";

    // Pad to standard format XXX.X -> XXXX (e.g. 101.5 -> 1015)
    // We multiply by 10 to get the base digits
    const baseVal = Math.round(freq * 10);

    // We want the format: XXX (prefix) - X000 (line)
    // Actually, let's just make it look cool.
    // If freq is 101.5
    // Digits: 1015
    // Format: +1 (800) 101-5000

    const digits = baseVal.toString().padStart(4, '0'); // 1015

    const prefix = digits.substring(0, 3); // 101
    const line = digits.substring(3) + "000"; // 5000

    return `+1 (800) ${prefix}-${line}`;
};

export const phoneNumberToFrequency = (phoneStr) => {
    // Check if it matches our "Fake" 800 format
    // +1 (800) 101-5000
    const cleaned = phoneStr.replace(/\D/g, '');

    // Logic: If user entered a specific fake-style number, try to map back to freq
    const match = cleaned.match(/1?800(\d{3})(\d)000/);
    if (match) {
        const part1 = match[1]; // 101
        const part2 = match[2]; // 5
        return `${parseInt(part1)}.${part2}`; // 101.5
    }

    // Otherwise, return the phone number itself as the ID (Direct Dial)
    // We retain the + sign if original had it, but regex stripped it.
    // Let's assume we want standard E.164 format roughly
    if (phoneStr.includes('+')) return phoneStr;
    return `+${cleaned}`; // Assume intl if raw digits? Or just return raw.
};
