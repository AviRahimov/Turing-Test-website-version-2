import React, { useState, useEffect, useRef } from 'react';
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
  const startButtonRef = useRef(null); // Ref for auto-scroll to start button

  // Updated formData state
  const [formData, setFormData] = useState({
    gender: '',
    age: '',
    education: '',
    country: '',
    aiExperience: ''
  });  const [agreedToParticipate, setAgreedToParticipate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [status, setStatus] = useState('');
  const [userID, setUserID] = useState(null); // This is the numerical ID
  const [username, setUsername] = useState(''); // This is the "user_X" string
  const [isBlocked, setIsBlocked] = useState(false);
  const [waitingTimeoutId, setWaitingTimeoutId] = useState(null); // Track timeout ID for cleanup
  const [waitingStartTime, setWaitingStartTime] = useState(null); // Track when waiting started
  const [waitingElapsedTime, setWaitingElapsedTime] = useState(0); // Elapsed waiting time in seconds
  const [showWaitingTimer, setShowWaitingTimer] = useState(false); // Show timer only after 2 minutes

  useEffect(() => {
    // Clear any previous disconnection state when starting fresh
    sessionStorage.removeItem('wasDisconnected');    const handleConnect = () => {
      setSocketConnected(true);
      setStatus('');
      socket.emit('register_user', {});
    };    const handleDisconnect = () => {
      setSocketConnected(false);
      setStatus('Disconnected from server. Reconnecting...');
    };

    const handleConnectError = (error) => {
      setSocketConnected(false);
      setStatus('Connection error. Retrying...');
    };

    // setSocketConnected(socket.connected);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    socket.on('user_registered', (data) => {      setUserID(data.user_id);
      setUsername(data.username);
    });socket.on('paired', (data) => {
      if (!isBlocked) {        // Clear the waiting timeout since user is now paired
        if (waitingTimeoutId) {
          clearTimeout(waitingTimeoutId);
          setWaitingTimeoutId(null);
          setWaitingStartTime(null);
          setWaitingElapsedTime(0);
          setShowWaitingTimer(false);
        }
        
        // Pass necessary data to ChatPage, including own username for demographics
        navigate(`/chat/${data.pair_id}`, {
          state: {
            pairId: data.pair_id,
            role: data.role,
            userId: username, // Use string username (user_X) as userId everywhere
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
    });    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('user_registered');
      socket.off('paired');      socket.off('ip_blocked');
        // Clear waiting timeout if component unmounts
      if (waitingTimeoutId) {
        clearTimeout(waitingTimeoutId);
        setWaitingTimeoutId(null);
        setWaitingStartTime(null);
        setWaitingElapsedTime(0);
      }
    };
  }, [navigate, isBlocked, userID, username, waitingTimeoutId]);
  // useEffect to update elapsed waiting time every second
  useEffect(() => {
    let interval;
    
    if (waitingStartTime && isSubmitting) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - waitingStartTime) / 1000);
        setWaitingElapsedTime(elapsed);
        
        // Show waiting timer display after 2 minutes (120 seconds)
        if (elapsed >= 120 && !showWaitingTimer) {
          setShowWaitingTimer(true);
        }
      }, 1000);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };  }, [waitingStartTime, isSubmitting, showWaitingTimer]);

  // IP check useEffect - runs only once on component mount
  useEffect(() => {
    const checkIP = async () => {
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        const userIp = ipData.ip;
        socket.emit('check_ip', { ip: userIp });
      } catch (error) {
        setStatus('Error checking IP. Please try again.');
      }
    };

    if (config.CHECK_IP) {
      checkIP();
    }
  }, []); // Empty dependency array ensures this runs only once

  // Auto-scroll to start button when all demographics are filled
  useEffect(() => {
    const { gender, age, education, country, aiExperience } = formData;
    const allFieldsFilled = gender && age && education && country && aiExperience;
    
    if (allFieldsFilled && startButtonRef.current) {
      // Small delay to ensure DOM has updated
      setTimeout(() => {
        startButtonRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 200);
    }
  }, [formData]);

  const handleCheckboxChange = (e) => {
      if (!agreedToParticipate) {
          setAgreedToParticipate(e.target.checked);
      }
  };
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  // Function to format elapsed time for display
  const formatElapsedTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Function to generate a 6-digit code for timeout scenario
  const generateTimeoutCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };  // Function to handle timeout and navigate to thank you page
  const handleWaitingTimeout = () => {
    // Clear any existing timeout
    if (waitingTimeoutId) {
      clearTimeout(waitingTimeoutId);
      setWaitingTimeoutId(null);
      setWaitingStartTime(null);
      setWaitingElapsedTime(0);
      setShowWaitingTimer(false);
    }
    
    // Generate a 6-digit code for the user
    const timeoutCode = generateTimeoutCode();
    
    // Navigate to thank you page with the code
    navigate('/thank_you', {
      state: {
        bonusCode: timeoutCode,
        role: 'timeout',
        name: username || 'User',
        user_id: username || 'Unknown',
        message: 'Thank you for your patience! Unfortunately, we could not find another participant within the time limit. Here is your participation code.',
        canParticipateAgain: true
      }
    });
  };

  const handleStart = async () => {
    // Validate form data
    const { gender, age, education, country, aiExperience } = formData;
    if (!gender || !age || !education || !country || !aiExperience) {
      alert('Please fill in all demographic fields to start the experiment.');
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
      }      const payloadToSave = { user_id: username, ...formData };
      await fetch(server_url + '/api/save_demographics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadToSave),
      });

      const response = await fetch(server_url + '/api/submit_name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, user_id: userID, ...formData }),
      });      const result = await response.json();
      if (result.status === 'waiting') {
        setStatus('Waiting for another user to connect...');
        
        // Record when waiting started
        const startTime = Date.now();
        setWaitingStartTime(startTime);
        setWaitingElapsedTime(0);
        setShowWaitingTimer(false); // Reset timer display state
          // Start 30-minute timeout (30 * 60 * 1000 = 1800000 milliseconds)
        const timeoutId = setTimeout(handleWaitingTimeout, 30 * 60 * 1000);
        setWaitingTimeoutId(timeoutId);
        
      } else if (result.status === 'paired') {
          // Navigation is now handled by the 'paired' socket event listener
          setStatus(`Paired! Joining chat room...`);      } else if (result.status === 'error') {
        setStatus(result.message);
        setIsSubmitting(false);
        
        // Clear waiting timeout if there's an error
        if (waitingTimeoutId) {
          clearTimeout(waitingTimeoutId);
          setWaitingTimeoutId(null);
          setWaitingStartTime(null);
          setWaitingElapsedTime(0);
          setShowWaitingTimer(false);
        }      }
    } catch (error) {
      setStatus('Error: Unable to connect. Please try again.');
      setIsSubmitting(false);
      
      // Clear waiting timeout if there's an error
      if (waitingTimeoutId) {
        clearTimeout(waitingTimeoutId);
        setWaitingTimeoutId(null);
        setWaitingStartTime(null);
        setWaitingElapsedTime(0);
        setShowWaitingTimer(false);
      }
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
                  Education:
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
              </form>              <div className="agreement-checkbox">
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
                  ref={startButtonRef}
                  className="start-button"
                  onClick={handleStart}
                  disabled={isSubmitting || !agreedToParticipate || !formData.gender || !formData.age || !formData.education || !formData.country || !formData.aiExperience}
              >
                Start
              </button>
            </>        )}        <div className={`status-message-container ${socketConnected ? 'container-connected' : 'container-connecting'}`}>
          <p className={`status-message ${socketConnected ? 'status-connected' : 'status-connecting'}`}>
            <span className="connection-status">
              {socketConnected ? 'Connected to server' : 'Connecting to server...'}
            </span>            {status && (
              <span className="status-text"> - {status}</span>
            )}
            {waitingStartTime && isSubmitting && showWaitingTimer && (
              <span className="waiting-time-display">
                <br />Maximum waiting time: {formatElapsedTime(waitingElapsedTime)} / 30:00
              </span>
            )}
          </p>
        </div>
      </div>
  );
}

export default HomePage;