import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';

const socket = io('http://localhost:5000');

function LoadingPage() {
  const [name, setName] = useState('');
  const [role, setRole] = useState('tester'); // Default role
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); // Prevent multiple submissions
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for pairing events
    socket.on('paired', (data) => {
      console.log('Paired:', data);
      // Navigate to chat page with the pair ID, role, user ID, and name
      navigate(`/chat/${data.pair_id}`, {
        state: {
          pairId: data.pair_id,
          role: data.role,
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

    // Register the user's name and socket ID
    socket.emit('register_user', { username: name });

    try {
      const response = await axios.post('/api/submit_name', { username: name, role });
      console.log('Response:', response.data);

      if (response.data.status === 'waiting') {
        setStatus(response.data.message);
      } else if (response.data.status === 'paired') {
        const pairedUser = response.data.users.find((user) => user.role === role);
        const pairId = response.data.pair_id;
        const userId = pairedUser.user_id;
        navigate(`/chat/${pairId}`, {
          state: {
            pairId,
            role,
            name,
            userId,
          },
        });
      } else {
        setStatus('Error: Unable to pair. Try again.');
        setIsSubmitting(false); // Re-enable submission if pairing fails
      }
    } catch (error) {
      console.error('Error:', error);
      setStatus('Error: Unable to pair. Try again.');
      setIsSubmitting(false); // Re-enable submission if an error occurs
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
      <label>
        Select your role:
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{ padding: '10px', fontSize: '16px', marginLeft: '10px' }}
          disabled={isSubmitting} // Disable dropdown when submitting
        >
          <option value="tester">Tester</option>
          <option value="experimenter">Experimenter</option>
        </select>
      </label>
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
