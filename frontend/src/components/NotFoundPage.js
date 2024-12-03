import React from 'react';
import { useNavigate } from 'react-router-dom';

function NotFoundPage() {
  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate('/');
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>404: Page Not Found</h1>
      <p>Oops! The page you are looking for doesn't exist.</p>
      <button onClick={handleGoHome}>Go Home</button>
    </div>
  );
}

export default NotFoundPage;
