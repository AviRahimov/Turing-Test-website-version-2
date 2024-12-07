import React from 'react';

const ThankYouPage = () => {
  const generateCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const uniqueCode = generateCode();

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Thank You for Participating!</h1>
      <p style={styles.text}>Your unique code is:</p>
      <p style={styles.code}>{uniqueCode}</p>
    </div>
  );
};

const styles = {
  container: {
    fontFamily: 'Arial, sans-serif',
    backgroundColor: '#f0f0f0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '20px',
  },
  header: {
    fontSize: '2em',
    color: '#333',
    marginBottom: '0.5em',
  },
  text: {
    fontSize: '1em',
    color: '#555',
    marginBottom: '0.5em',
  },
  code: {
    fontSize: '1.5em',
    fontWeight: 'bold',
    color: '#007bff',
  },
};

export default ThankYouPage;
