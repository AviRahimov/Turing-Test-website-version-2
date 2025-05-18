import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import usePreventBackNavigation from './usePreventBackNavigation';
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
  usePreventBackNavigation();
  const navigate = useNavigate();

  // Updated formData state
  const [formData, setFormData] = useState({
    gender: '',
    age: '',
    occupation: '', // Changed from employment, removed education
    education: '',
    country: '',
    aiExperience: ''
  });
  const [agreedToParticipate, setAgreedToParticipate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [status, setStatus] = useState('');
  const [userID, setUserID] = useState(null); // This is the numerical ID
  const [username, setUsername] = useState(''); // This is the "user_X" string
  const [isBlocked, setIsBlocked] = useState(false);


  useEffect(() => {
    // Clear any previous disconnection state when starting fresh
    sessionStorage.removeItem('wasDisconnected');

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

    // setSocketConnected(socket.connected);

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
        // Pass necessary data to ChatPage, including own username for demographics
        navigate(`/chat/${data.pair_id}`, {
          state: {
            pairId: data.pair_id,
            role: data.role,
            userId: userID, // Numerical ID of self
            username: username, // String username of self (user_X)
            // partner_username will be added by backend for fetching partner's demographics
            partner_username: data.partner_username // EXPECTING THIS FROM BACKEND
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
  }, [navigate, isBlocked, userID, username]);

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
    // Validate form data
    const { gender, age, occupation, education, country, aiExperience } = formData;
    if (!gender || !age || !occupation || !education || !country || !aiExperience) {
      alert('Please fill in all demographic fields to start the experiment.');
      return;
    }

    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum <= 0) {
      alert('Please enter a valid age greater than 0.');
      return;
    }

    if (!agreedToParticipate) {
      alert('You must agree to participate in the experiment.');
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

      const payloadToSave = { user_id: username, ...formData, age: ageNum };
      console.log("Saving demographics payload:", payloadToSave); // DEBUG LINE
      await fetch(server_url + '/api/save_demographics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadToSave),
      });

      const response = await fetch(server_url + '/api/submit_name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, user_id: userID, ...formData, age: ageNum }),
      });

      const result = await response.json();
      console.log('Server response:', result);

      if (result.status === 'waiting') {
        setStatus('Waiting for another user to connect...');
      } else if (result.status === 'paired') {
          // Navigation is now handled by the 'paired' socket event listener
          setStatus(`Paired! Joining chat room...`);
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
                  <input
                      type="number" // Changed to number input
                      name="age"
                      value={formData.age}
                      onChange={handleChange}
                      placeholder="Enter your age"
                      min="1" // Basic HTML5 validation
                      required
                  />
                </label>
                <label>
                  Occupation: {/* Changed from Employment Status */}
                  <input
                      type="text"
                      name="occupation" // Changed name
                      value={formData.occupation}
                      onChange={handleChange}
                      placeholder="Enter your occupation"
                      required
                  />
                </label>
                <label>
                  Field of Study:
                  <input
                      type="text"
                      name="education"
                      value={formData.education}
                      onChange={handleChange}
                      placeholder="Enter your education level"
                      required
                  />
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
              <div className="agreement-checkbox" style={{
                backgroundColor: 'rgba(255, 255, 255, 255)', // Slightly transparent red
                padding: '10px', // Increased size
                borderRadius: '5px', // Optional for better aesthetics
                width: '40%', // Full width
                margin: '0 auto', // Centered
                fontSize: '1.1rem', // text size increased
                border: '2px solid rgba(0, 0, 0, 0.2)', // cyclic border without color
              }}>
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
                  disabled={isSubmitting || !agreedToParticipate || !formData.gender || !formData.age || !formData.occupation || !formData.education || !formData.country || !formData.aiExperience}
              >
                Start
              </button>
            </>
        )}
        <p className="status-message">{status}</p>
        <p className={`status-message ${socketConnected ? 'status-connected' : 'status-connecting'}`}>
          {socketConnected ? 'Connected to server' : 'Connecting to server...'}
        </p>
      </div>
  );
}

export default HomePage;