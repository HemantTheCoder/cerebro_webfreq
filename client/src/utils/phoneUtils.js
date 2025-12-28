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
 * 999.9 MHz -> +1 (800) 999-9000
 */

// Format: +1 (800) XXX-XXXX
export const frequencyToPhoneNumber = (freqStr) => {
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
    // Remove all non-numeric chars
    const cleaned = phoneStr.replace(/\D/g, '');
    // Expecting 1800XXXX000 or similar
    // We care about the last 7 digits mostly? 
    // Or just parse the XXX-X000 part.

    // Regex to extract the specific parts we generated
    // Matches +1 (800) 101-5000 or 18001015000
    // We need the '101' and the '5' from '5000'

    // Simplistic parser: look for the sequence after 800
    // If we assume strict format:
    const match = cleaned.match(/800(\d{3})(\d)000/);
    if (match) {
        const part1 = match[1]; // 101
        const part2 = match[2]; // 5
        return `${parseInt(part1)}.${part2}`; // 101.5
    }

    return null;
};
