import React, { useState } from 'react';
import { Phone, Delete, X } from 'lucide-react';
import { phoneNumberToFrequency } from '../utils/phoneUtils';

const PhoneDialer = ({ onClose, onCall }) => {
    const [display, setDisplay] = useState('');
    const [error, setError] = useState('');

    const handleDigit = (digit) => {
        if (display.length < 15) {
            setDisplay(prev => formatAsYouType(prev + digit));
        }
    };

    const handleDelete = () => {
        setDisplay(prev => prev.slice(0, -1));
        setError('');
    };

    // Auto-formatting for the specific +1 (800) style
    // But allow free typing too? No, keypad is stricter.
    // Let's just append digits and let the user type the "extension".
    // Actually, to match the system, we should probably force the format.
    // "Enter Frequency Code" might be easier, but User wants "Phone Numbers".
    // Let's assume the user enters the FULL 10-digit number (skipping +1).
    // 800-101-5000

    const formatAsYouType = (raw) => {
        const digits = raw.replace(/\D/g, '');
        // Format: (XXX) XXX-XXXX
        if (digits.length <= 3) return digits;
        if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    };

    const handleCall = () => {
        // Validate
        // We expect (800) XXX-X000 mostly
        // Or we try to parse standard
        const freq = phoneNumberToFrequency("1" + display.replace(/\D/g, ''));
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
                textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '1.5rem',
                color: error ? 'var(--danger-color)' : 'var(--text-main)',
                height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end'
            }}>
                {error || display || <span style={{ opacity: 0.3 }}>...</span>}
            </div>

            {/* Keypad */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, '*', 0, '#'].map((k) => (
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
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                    onClick={handleDelete}
                    className="crm-btn danger"
                    style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                >
                    <Delete size={20} />
                </button>
                <button
                    onClick={handleCall}
                    className="crm-btn"
                    style={{ flex: 2, background: 'var(--success-color)', color: '#000', borderColor: 'var(--success-color)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}
                >
                    <Phone size={20} /> CALL
                </button>
            </div>

            <div style={{ textAlign: 'center', fontSize: '0.7em', color: '#666' }}>
                ENCRYPTED • BROADCAST • TRACEABLE
            </div>
        </div>
    );
};

export default PhoneDialer;
