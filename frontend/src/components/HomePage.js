import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import config from './config';
import './HomePage.css';

let server_url = config.SERVER_URL;

const socket = io(server_url, {
  transports: ['websocket', 'polling'],
  cors: {
    origin: "http://localhost:3000",
    credentials: true
  },
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

function HomePage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    gender: '',
    age: '',
    education: '',
    employment: '',
    country: '',
    aiExperience: ''
  });
  const [agreedToParticipate, setAgreedToParticipate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [status, setStatus] = useState('');
  const [userID, setUserID] = useState(null);
  const [username, setUsername] = useState('');
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    const handleConnect = () => {
      console.log('Socket connected');
      setSocketConnected(true);
      setStatus('');
      socket.emit('register_user', {});
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

    setSocketConnected(socket.connected);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    socket.on('user_registered', (data) => {
      setUserID(data.user_id);
      setUsername(data.username);
      console.log('User registered:', data);
    });

    socket.on('paired', (data) => {
      if (!isBlocked) {
        console.log('Paired event received:', data);
        navigate(`/chat/${data.pair_id}`, {
          state: {
            pairId: data.pair_id,
            role: data.role,
            userId: data.user_id,
          },
        });
      }
    });

    socket.on('ip_blocked', (message) => {
      setIsBlocked(true);
      setIsSubmitting(false);
      setStatus(message);
    });

    if (!socket.connected) {
      socket.connect();
    }

    // Perform IP check on page load
    const checkIP = async () => {
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        const userIp = ipData.ip;

        // Emit the check_ip event to the server
        socket.emit('check_ip', { ip: userIp });
      } catch (error) {
        console.error('Error checking IP:', error);
        setStatus('Error checking IP. Please try again.');
      }
    };

    if (config.CHECK_IP){
        checkIP();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('user_registered');
      socket.off('paired');
      socket.off('ip_blocked');
    };
  }, [navigate, isBlocked]);

  const handleCheckboxChange = (e) => {
      if (!agreedToParticipate) {
          setAgreedToParticipate(e.target.checked);
      }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  const handleStart = async () => {
    if (Object.values(formData).some(value => value === '')) {
      alert('Please fill in all demographic fields to start the experiment.');
      return;
    }

    setIsSubmitting(true);
    setStatus('Connecting...');

    try {
      if (isBlocked) {
        setStatus('You have already participated.');
        setIsSubmitting(false);
        return;
      }

      await fetch(server_url + '/api/save_demographics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userID, ...formData }),
      });

      const response = await fetch(server_url + '/api/submit_name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, username, user_id: userID }),
      });

      const result = await response.json();
      console.log('Server response:', result);

      if (result.status === 'waiting') {
        setStatus('Waiting for another user to connect...');
      } else if (result.status === 'error') {
        setStatus(result.message);
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('Error:', error);
      setStatus('Error: Unable to connect. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
      <div className="container">
        {isBlocked && (
            <div className="blocked-overlay">
              <p>You have already participated.</p>
            </div>
        )}
        <h1 className="header">Welcome to the Turing Test Experiment</h1>
        <h2 className="subtitle">Can a computer (bot) fool you and your human teammate?</h2>
        <h3 className="subtitle2">It's two humans against one bot. Who will win?</h3>
        <p className="instructions">Please fill in the following fields to start the experiment:</p>

        {!isBlocked && (
            <>
              <form className="demographic-form">
                <label>
                  Gender:
                  <select name="gender" value={formData.gender} onChange={handleChange} required>
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Non-binary">Non-binary</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </label>
                <label>
                  Age:
                  <select name="age" value={formData.age} onChange={handleChange} required>
                    <option value="">Select</option>
                    <option value="10-20">10-20</option>
                    <option value="20-30">20-30</option>
                    <option value="30-40">30-40</option>
                    <option value="40-50">40-50</option>
                    <option value="50-60">50-60</option>
                    <option value="60-70">60-70</option>
                    <option value="70+">70+</option>
                  </select>
                </label>
                <label>
                  Educational Degree:
                  <select name="education" value={formData.education} onChange={handleChange} required>
                    <option value="">Select</option>
                    <option value="High School">High School</option>
                    <option value="Bachelor's Degree">Bachelor's Degree</option>
                    <option value="Master's Degree">Master's Degree</option>
                    <option value="Doctorate">Doctorate</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label>
                  Employment Status:
                  <select name="employment" value={formData.employment} onChange={handleChange} required>
                    <option value="">Select</option>
                    <option value="Employed">Employed</option>
                    <option value="Unemployed">Unemployed</option>
                    <option value="Student">Student</option>
                    <option value="Retired">Retired</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label>
                  Country of Residence:
                  <select name="country" value={formData.country} onChange={handleChange} required>
                    <option value="">Select</option>
                    <option value="USA">USA</option>
                    <option value="Canada">Canada</option>
                    <option value="UK">UK</option>
                    <option value={"Other"}>Other</option>
                  </select>
                </label>
                <label>
                  Experience with AI:
                  <select name="aiExperience" value={formData.aiExperience} onChange={handleChange} required>
                    <option value="">Select</option>
                    <option value="None">None</option>
                    <option value="Basic">Basic</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </label>
              </form>
              <div className="agreement-checkbox">
                <label>
                  <input
                      type="checkbox"
                      checked={agreedToParticipate}
                      onChange={handleCheckboxChange}
                  />
                  I agree to participate in the experiment, and agree for the data to be used in research.
                </label>
              </div>
              <button
                  className="start-button"
                  onClick={handleStart}
                  disabled={isSubmitting || !agreedToParticipate}
              >
                Start
              </button>
            </>
        )}
        <p className="status-message">{status}</p>
        <p className={`status-message ${socketConnected ? 'status-connected' : 'status-connecting'}`}>
          {socketConnected ? 'Connected to server' : 'Connecting to server...'}
        </p>
        {socketConnected && Object.values(formData).some(value => value === '') && (
            <p className="status-warning"></p>
        )}
      </div>
  );
}

export default HomePage;