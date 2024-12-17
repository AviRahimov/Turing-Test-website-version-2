import React, { useEffect, useState } from 'react';
import {useLocation} from "react-router-dom";

const ThankYouPage = () => {
  const location = useLocation();
  const {bonusCode, name, user_id} = location.state || {};
  const isSevenDigitCode = bonusCode && bonusCode.length === 7;
  console.log("bonus_code", bonusCode);

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Thank You for Participating!</h1>
      <p style={styles.text}>Your unique code is:</p>
      <p style={styles.code}>{bonusCode || 'Loading...'}</p>
      {isSevenDigitCode && (
        <p style={styles.bonusMessage}>
          Hooray, the tester guessed true, thus you and him will get a bonus code!
        </p>
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
};

export default ThankYouPage;
