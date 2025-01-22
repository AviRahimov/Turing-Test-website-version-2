import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import funnyLogo from './funny-logo.jpg';
import './Disconnect.css';

const Disconnect = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const message = location.state?.message || "Sorry, you've been disconnected due to inactivity. You will not receive a payment.";

  useEffect(() => {
    // Set disconnected flag
    sessionStorage.setItem('wasDisconnected', 'true');

    // Replace the current history entry with disconnect page
    // This removes the chat page from history
    window.history.replaceState(null, '', '/disconnected');

    // Prevent going back in history
    const preventBack = (e) => {
      // Navigate to home page if user tries to go back
      navigate('/', { replace: true });
      // Some browsers might need this
      e.preventDefault();
    };

    // Handle both popstate and beforeunload
    window.addEventListener('popstate', preventBack);
    window.addEventListener('beforeunload', () => {
    window.history.replaceState(null, '', '/');
    });

    // Handle direct manipulation of history
    const handleHistoryChange = () => {
      const currentPath = window.location.pathname;
      if (currentPath !== '/disconnected' && currentPath !== '/') {
        navigate('/', { replace: true });
      }
    };

    // Create an interval to check the current path
    const intervalId = setInterval(handleHistoryChange, 100);

    // Cleanup function
    return () => {
      window.removeEventListener('popstate', preventBack);
      clearInterval(intervalId);
    };
  }, [navigate]);

  // Prevent right-click context menu
  const handleContextMenu = (e) => {
    e.preventDefault();
  };

  return (
    <div
      className="disconnect-container"
      onContextMenu={handleContextMenu}
    >
      <div className="disconnect-message">
        <img
          src={funnyLogo}
          alt="Disconnected"
          className="disconnect-logo"
          style={{ maxWidth: '200px', marginBottom: '20px' }}
          draggable="false"
        />
        <h1>You've been disconnected!</h1>
        <p>{message}</p>
        <button
          onClick={() => {
            // Navigate to home and replace history
            navigate('/', { replace: true });
            // Clear any remaining history
            window.history.pushState(null, '', '/');
          }}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            marginTop: '20px'
          }}
        >
          Go to Home
        </button>
      </div>
    </div>
  );
};

export default Disconnect;