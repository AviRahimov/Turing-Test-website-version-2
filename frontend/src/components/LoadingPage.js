import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';

// Create socket with explicit configuration
const socket = io('http://54.208.255.25:5000', {
  transports: ['websocket', 'polling'],
  cors: {
    origin: "http://54.208.255.25:5000",
    credentials: true
  },
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

function LoadingPage() {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const navigate = useNavigate();

  useEffect(() => {
    // Socket connection handling
    const handleConnect = () => {
      console.log('Socket connected');
      setSocketConnected(true);
      setStatus('');  // Clear any error status
      if (name) {
        socket.emit('register_user', { username: name });
      }
    };

    const handleDisconnect = () => {
      console.log('Socket disconnected');
      setSocketConnected(false);
      setStatus('Disconnected from server. Reconnecting...');
    };

    const handleConnectError = (error) => {
      console.error('Connection error:', error);
      setSocketConnected(false);
      setStatus('Connection error. Retrying...');
    };

    // Set initial connection state
    setSocketConnected(socket.connected);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    // Listen for pairing events
    socket.on('paired', (data) => {
      console.log('Paired event received:', data);
      if (data.username === name) {
        navigate(`/chat/${data.pair_id}`, {
          state: {
            pairId: data.pair_id,
            role: data.role,
            name: data.username,
            userId: data.user_id,
          },
        });
      }
    });

    // Ensure connection
    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('paired');
    };
  }, [navigate, name]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setStatus('Please enter your name');
      return;
    }

    setIsSubmitting(true);
    setStatus('Connecting...');

    try {
      socket.emit('register_user', { username: name });

      const response = await axios.post('http://54.208.255.25:5000/api/submit_name', {
        username: name
      });

      console.log('Server response:', response.data);

      if (response.data.status === 'waiting') {
        setStatus('Waiting for another user to connect...');
      } else if (response.data.status === 'error') {
        setStatus(response.data.message);
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('Error:', error);
      setStatus('Error: Unable to connect. Please try again.');
      setIsSubmitting(false);
    }
  };

  // Calculate button state
  const isButtonDisabled = !socketConnected || isSubmitting || !name.trim();

  return (
    <div style={{ textAlign: 'center', marginTop: '20%' }}>
      <h2>Enter Your Name</h2>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter your name"
        style={{
          padding: '10px',
          fontSize: '16px',
          marginBottom: '10px',
          backgroundColor: socketConnected ? 'white' : '#f0f0f0'
        }}
        disabled={isSubmitting}
      />
      <br />
      <button
        onClick={handleSubmit}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: isButtonDisabled ? '#cccccc' : '#2196f3',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
          marginTop: '10px',
        }}
        disabled={isButtonDisabled}
      >
        Join
      </button>
      <p>{status}</p>
      <p style={{color: socketConnected ? 'green' : 'red'}}>
        {socketConnected ? 'Connected to server' : 'Connecting to server...'}
      </p>
      {socketConnected && !name.trim() && (
        <p style={{color: 'orange'}}>Please enter your name to join</p>
      )}
    </div>
  );
}

export default LoadingPage;