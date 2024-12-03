import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000'); // Adjust the port if needed

function LoadingPage() {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [pairId, setPairId] = useState(null);
  const [role, setRole] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!name.trim()) {
      setStatus('Please enter your name');
      return;
    }

    try {
      const response = await axios.post('/api/submit_name', { username: name });
      if (response.data.status === 'waiting') {
        console.log('waiting');
        setStatus(response.data.message);
        socket.on('paired', (data) => {
          // logging message
          console.log('paired', data);
          setPairId(data.pair_id);
          setRole(data.role);
          navigate(`/chat/${data.pair_id}`, { state: { role: data.role } });
        });
      } else if (response.data.status === 'paired') {
        setPairId(response.data.pair_id);
        setRole(response.data.role);
        navigate(`/chat/${response.data.pair_id}`, { state: { role: response.data.role } });
      } else {
        setStatus('Error: Unable to pair. Try again.');
      }
    } catch (error) {
      console.error('Error:', error);
      setStatus('Error connecting to server. Please try again.');
    }
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '20%' }}>
      <h2>Enter Your Name</h2>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter your name"
        style={{ padding: '10px', fontSize: '16px', marginBottom: '10px' }}
      />
      <br />
      <button
        onClick={handleSubmit}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: '#2196f3',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
        }}
      >
        Join
      </button>
      <p>{status}</p>
    </div>
  );
}

export default LoadingPage;
