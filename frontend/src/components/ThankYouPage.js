import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import usePreventBackNavigation from './usePreventBackNavigation';

const ThankYouPage = () => {
  // Prevent back navigation with refresh option enabled to maintain state
  usePreventBackNavigation({ allowedPaths: ['/thank_you'], refreshOnBack: true });
  
  const location = useLocation();
  const [pageData, setPageData] = useState({
    bonusCode: '',
    role: '',
    name: '',
    user_id: '',
    message: '',
    canParticipateAgain: false
  });

  useEffect(() => {
    // Try to get data from location.state first (fresh navigation)
    const stateData = location.state || {};
    
    // If we have fresh data from navigation, store it and use it
    if (stateData.bonusCode) {
      const dataToStore = {
        bonusCode: stateData.bonusCode,
        role: stateData.role,
        name: stateData.name,
        user_id: stateData.user_id,
        message: stateData.message,
        canParticipateAgain: stateData.canParticipateAgain
      };
      
      // Store in localStorage for persistence across refreshes
      localStorage.setItem('thankYouPageData', JSON.stringify(dataToStore));
      setPageData(dataToStore);
    } else {
      // Try to retrieve from localStorage (after refresh)
      const storedData = localStorage.getItem('thankYouPageData');
      if (storedData) {        try {
          const parsedData = JSON.parse(storedData);
          setPageData(parsedData);
        } catch (error) {
          // Error parsing stored thank you page data
          // Fallback to experimenterBonus if available
          const fallbackCode = localStorage.getItem('experimenterBonus');
          if (fallbackCode) {
            setPageData(prev => ({ ...prev, bonusCode: fallbackCode }));
          }
        }
      } else {
        // Last resort: try experimenterBonus from localStorage
        const fallbackCode = localStorage.getItem('experimenterBonus');
        if (fallbackCode) {
          setPageData(prev => ({ ...prev, bonusCode: fallbackCode }));
        }
      }
    }  }, [location.state]);

  // Cleanup stored data when component unmounts (if user somehow leaves the page)
  useEffect(() => {
    return () => {
      // Only cleanup if user is participating again
      const cleanup = () => {
        localStorage.removeItem('thankYouPageData');
        localStorage.removeItem('experimenterBonus');
      };
      
      // Delay cleanup to allow for page refreshes
      setTimeout(cleanup, 1000);
    };
  }, []);

  const { bonusCode, role, name, user_id, message, canParticipateAgain } = pageData;
  const isSevenDigitCode = bonusCode && bonusCode.length === 7;

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Thank You for Participating!</h1>
      <p style={styles.text}>Your unique code is:</p>
      <p style={styles.code}>{bonusCode || 'Loading...'}</p>

      {isSevenDigitCode && (
        <p style={styles.bonusMessage}>
          {role === 'experimenter'
            ? 'Hooray, the tester guessed true, thus both of you will get a bonus code!'
            : 'Hooray, you guessed true, thus you and the responder will get a bonus code!'}
        </p>
      )}

      {message && (
        <p style={styles.message}>{message}</p>
      )}      {canParticipateAgain && (
        <div style={styles.participateAgain}>
          <p>You can now participate in the experiment again with a different partner.</p>
          <button
            onClick={() => {
              // Clean up stored data before participating again
              localStorage.removeItem('thankYouPageData');
              localStorage.removeItem('experimenterBonus');
              window.location.href = '/';
            }}
            style={styles.participateButton}
          >
            Participate Again
          </button>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#f0f0f0',
  },
  header: {
    fontSize: '2.5rem',
    color: '#333',
    marginBottom: '20px',
  },
  text: {
    fontSize: '1.2rem',
    color: '#555',
    marginBottom: '10px',
  },
  code: {
    fontSize: '1.8rem',
    color: '#007BFF',
    fontWeight: 'bold',
  },
  bonusMessage: {
    fontSize: '1.2rem',
    color: '#28a745',
    marginTop: '10px',
  },
  message: {
    fontSize: '1.2rem',
    color: '#555',
    marginTop: '20px',
    textAlign: 'center',
    maxWidth: '80%',
  },
  participateAgain: {
    marginTop: '30px',
    textAlign: 'center',
    padding: '20px',
    backgroundColor: '#e8f5e9',
    borderRadius: '8px',
    border: '1px solid #4caf50',
  },
  participateButton: {
    marginTop: '15px',
    padding: '10px 20px',
    backgroundColor: '#4caf50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'background-color 0.3s',
    ':hover': {
      backgroundColor: '#388e3c',
    }
  }
};

export default ThankYouPage;