import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import usePreventBackNavigation from './usePreventBackNavigation';

const ThankYouPage = () => {
  usePreventBackNavigation();
  const location = useLocation();
  const { bonusCode, name, user_id, role, message, canParticipateAgain } = location.state || {};
  const isSevenDigitCode = bonusCode && bonusCode.length === 7;
  console.log("bonus_code", bonusCode);

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
      )}

      {canParticipateAgain && (
        <div style={styles.participateAgain}>
          <p>You can now participate in the experiment again with a different partner.</p>
          <button
            onClick={() => window.location.href = '/'}
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