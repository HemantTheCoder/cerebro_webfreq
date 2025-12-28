import React, { useState } from 'react';
import { Phone, Delete, X, Plus } from 'lucide-react';
import { phoneNumberToFrequency } from '../utils/phoneUtils';

const PhoneDialer = ({ onClose, onCall }) => {
    const [display, setDisplay] = useState('');
    const [error, setError] = useState('');

    const handleDigit = (digit) => {
        if (display.length < 20) {
            // Note: We don't want to double format if user is typing fast
            // Just append and re-format
            const clean = display.replace(/[^\d+]/g, ''); // Keep digits and +
            let newVal = clean + digit;

            setDisplay(formatAsYouType(newVal));
        }
    };

    const handleDelete = () => {
        // Remove last char from CLEAN version
        const clean = display.replace(/[^\d+]/g, '');
        const newVal = clean.slice(0, -1);
        setDisplay(formatAsYouType(newVal));
        setError('');
    };

    const formatAsYouType = (raw) => {
        // If it starts with +, treat as Intl
        const isIntl = raw.startsWith('+');
        const digits = raw.replace(/[^\d]/g, '');

        if (isIntl) {
            // Simple space formatting for Intl: +XX XXX XXX XXXX
            // Very basic heuristic
            let fmt = '+' + digits;
            // You could use libphonenumber-js here if you wanted perfection
            // For now, just space every 3-4 chars?
            return fmt;
        }

        // Standard US (Fake) format
        if (digits.length <= 3) return digits;
        if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    };

    const handleCall = () => {
        // Send raw input with specific handling
        // If user typed +, we definitely want to keep it.
        // phoneNumberToFrequency now handles pass-through
        let raw = display.replace(/[^\d+]/g, '');

        // If user didn't type +, but it looks like a long number (India etc), maybe prepend +?
        // User asked "number with country code, as I am in India".
        // They might type "919876..." or "+91..."
        // Safe bet: if it doesn't match the 800-FAKE pattern, treat as direct.

        const freq = phoneNumberToFrequency(raw);
        if (freq) {
            onCall(freq);
        } else {
            setError("INVALID NUMBER");
        }
    };

    return (
        <div className="crm-panel box-shadow-glow" style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'rgba(10, 20, 15, 0.95)', border: '2px solid var(--primary-color)',
            padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px',
            zIndex: 1500, width: '300px'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--primary-color)' }}>SECURE LINE</h3>
                <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {/* Display Screen */}
            <div style={{
                background: '#000', border: '1px solid #333', padding: '15px',
                textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '1.2rem',
                color: error ? 'var(--danger-color)' : 'var(--text-main)',
                height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                overflow: 'hidden', whiteSpace: 'nowrap'
            }}>
                {error || display || <span style={{ opacity: 0.3 }}>ENTER NUMBER...</span>}
            </div>

            {/* Keypad */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => (
                    <button
                        key={k}
                        onClick={() => handleDigit(k)}
                        className="crm-btn"
                        style={{
                            fontSize: '1.2rem', padding: '15px',
                            background: '#111', borderColor: '#333'
                        }}
                    >
                        {k}
                    </button>
                ))}

                {/* Special Keys Row */}
                <button
                    onClick={() => handleDigit('+')}
                    className="crm-btn"
                    style={{ fontSize: '1.2rem', padding: '15px', background: '#111', borderColor: '#333' }}
                >
                    +
                </button>

                <button
                    onClick={() => handleDigit('0')}
                    className="crm-btn"
                    style={{ fontSize: '1.2rem', padding: '15px', background: '#111', borderColor: '#333' }}
                >
                    0
                </button>

                <button
                    // Backspace
                    onClick={handleDelete}
                    className="crm-btn danger"
                    style={{ fontSize: '1.2rem', padding: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                >
                    <Delete size={20} />
                </button>

            </div>

            {/* Call Action */}
            <div style={{ marginTop: '10px' }}>
                <button
                    onClick={handleCall}
                    className="crm-btn"
                    style={{ width: '100%', padding: '15px', background: 'var(--success-color)', color: '#000', borderColor: 'var(--success-color)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}
                >
                    <Phone size={24} /> CONNECT
                </button>
            </div>

            <div style={{ textAlign: 'center', fontSize: '0.7em', color: '#666' }}>
                ENCRYPTED • BROADCAST • TRACEABLE
            </div>
        </div>
    );
};

export default PhoneDialer;
