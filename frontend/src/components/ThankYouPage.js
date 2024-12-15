import React, { useEffect, useState } from 'react';
import {useLocation} from "react-router-dom";

const ThankYouPage = () => {
  const location = useLocation();
  const [uniqueCode, setUniqueCode] = useState(null);
  const {pairId, role, name} = location.state || {};

  useEffect(() => {
    const fetchCode = async () => {
      try {
        const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:5000';
        const response = await fetch(`${BACKEND_URL}/api/generate_code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: role, name: name }),
        });

        const result = await response.json();
        if (result.status === 'success') {
          setUniqueCode(result.code);
        } else {
          console.error('Error generating code:', result.message);
        }
      } catch (error) {
        console.error('Error fetching code:', error);
      }
    };

    fetchCode();
  }, []);

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Thank You for Participating!</h1>
      <p style={styles.text}>Your unique code is:</p>
      <p style={styles.code}>{uniqueCode || 'Loading...'}</p>
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
};

export default ThankYouPage;
