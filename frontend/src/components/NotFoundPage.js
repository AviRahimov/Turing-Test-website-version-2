import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

function NotFoundPage() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Prevent any navigation from this page
    window.history.pushState(null, '', window.location.href);

    const preventNavigation = (e) => {
      e.preventDefault();
      // Stay on the same page
      window.history.pushState(null, '', window.location.href);
    };

    window.addEventListener('popstate', preventNavigation);
    
    // Prevent page unload
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Monitor URL changes
    const handleHistoryChange = () => {
      const currentPath = window.location.pathname;
      if (currentPath !== '/notfound') {
        // Force back to not found page
        window.history.replaceState(null, '', '/notfound');
      }
    };

    const intervalId = setInterval(handleHistoryChange, 500);

    return () => {
      window.removeEventListener('popstate', preventNavigation);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(intervalId);
    };
  }, []);

  const handleGoHome = () => {
    // Do nothing - user is stuck here
    alert('Navigation is disabled. Please close the browser tab.');
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>404: Page Not Found</h1>
      <p>Oops! The page you are looking for doesn't exist.</p>
      <p style={{ color: 'red', fontWeight: 'bold' }}>
        Navigation has been disabled. Please close this browser tab.
      </p>
      <button onClick={handleGoHome} style={{ opacity: 0.5, cursor: 'not-allowed' }}>
        Go Home (Disabled)
      </button>
    </div>
  );
}

export default NotFoundPage;
