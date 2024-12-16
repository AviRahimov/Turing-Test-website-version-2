import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';

// Establish socket connection
const socket = io(process.env.REACT_APP_BACKEND_SOCKET_URL || 'http://127.0.0.1:5000');

function LoadingPage() {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); // Prevent multiple submissions
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for pairing events from the backend
    socket.on('paired', (data) => {
      console.log('Paired:', data);
      // Navigate to chat page with the pair ID, role, user ID, and name
      navigate(`/chat/${data.pair_id}`, {
        state: {
          pairId: data.pair_id,
          role: data.role, // Backend assigns the role
          name: data.username,
          userId: data.user_id,
        },
      });
    });

    // Cleanup the listener on component unmount
    return () => {
      socket.off('paired');
    };
  }, [navigate]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setStatus('Please enter your name');
      return;
    }

    // Prevent multiple submissions
    setIsSubmitting(true);
    setStatus('Connecting...');

    // Emit the user's name to the backend via WebSocket
    socket.emit('register_user', { username: name });

    try {
      const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:5000';
      const response = await axios.post(`${BACKEND_URL}/api/submit_name`, { username: name });

      console.log('Response:', response.data);

      if (response.data.status === 'waiting') {
        // First user must wait for the second
        setStatus('Waiting for another user to connect...');
      } else if (response.data.status === 'paired') {
        // Both users paired successfully
        const pairId = response.data.pair_id;
        const user = response.data.users.find((user) => user.username === name);
        navigate(`/chat/${pairId}`, {
          state: {
            pairId,
            role: user.role, // Role assigned by backend
            name,
            userId: user.user_id,
          },
        });
      } else {
        // General pairing error
        setStatus('Error: Unable to pair. Try again.');
        setIsSubmitting(false); // Re-enable submission if pairing fails
      }
    } catch (error) {
      console.error('Error:', error);
      setStatus('Error: Unable to connect. Please try again.');
      setIsSubmitting(false); // Re-enable submission on error
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
        disabled={isSubmitting} // Disable input when submitting
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
          cursor: isSubmitting ? 'not-allowed' : 'pointer', // Change cursor when submitting
          marginTop: '10px',
        }}
        disabled={isSubmitting} // Disable button when submitting
      >
        Join
      </button>
      <p>{status}</p>
    </div>
  );
}

export default LoadingPage;
