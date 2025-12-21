import React, { useState, useEffect } from 'react';
import { SocketProvider } from './context/SocketContext';
import Tuner from './components/Tuner';
import RadioConsole from './components/RadioConsole';
import './index.css';

function App() {
  // State to track if user is tuned in
  // null = not tuned (show Tuner)
  // string/number = tuned frequency (show RadioConsole)
  const [currentFrequency, setCurrentFrequency] = useState(null);

  const handleTune = (freq) => {
    setCurrentFrequency(freq);
  };

  const handleDisconnect = () => {
    setCurrentFrequency(null);
  };

  return (
    <SocketProvider>
      <div className="app-container">
        <div className="crt-overlay"></div>
        {currentFrequency ? (
          <RadioConsole
            frequency={currentFrequency}
            onDisconnect={handleDisconnect}
          />
        ) : (
          <Tuner onTune={handleTune} />
        )}
      </div>
    </SocketProvider>
  );
}

export default App;
