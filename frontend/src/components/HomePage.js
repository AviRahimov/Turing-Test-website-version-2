import React from 'react';
import { useNavigate } from 'react-router-dom';

function HomePage() {
  const navigate = useNavigate();

  const handleStart = () => {
    navigate('/loading');
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '20%' }}>
      <h1>Welcome to the Turing Test Experiment</h1>
      <p>Can a computer (bot) fool you and your human teammate?</p>
      <button
        onClick={handleStart}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: '#4caf50',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
        }}
      >
        Start
      </button>
    </div>
  );
}

export default HomePage;
