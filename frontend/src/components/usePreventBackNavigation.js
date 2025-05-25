import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const usePreventBackNavigation = (options = {}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { allowedPaths = [], refreshOnBack = false } = options;

  useEffect(() => {
    // Push current state to prevent back navigation
    window.history.pushState(null, '', window.location.href);

    const preventBack = (e) => {
      e.preventDefault();
      
      if (refreshOnBack) {
        // Refresh the page instead of navigating
        window.location.reload();
      } else {
        // Navigate to not found page
        navigate('/notfound', { replace: true, state: { from: location.pathname } });
      }
    };

    const handlePopState = (e) => {
      // Push state again to prevent back navigation
      window.history.pushState(null, '', window.location.href);
      preventBack(e);
    };

    // Listen for back button
    window.addEventListener('popstate', handlePopState);

    // Prevent page unload without confirmation
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Monitor URL changes to detect manual URL editing
    const handleHistoryChange = () => {
      const currentPath = window.location.pathname;
      const isAllowedPath = allowedPaths.includes(currentPath) || 
                           currentPath === location.pathname || 
                           currentPath === '/notfound';
      
      if (!isAllowedPath) {
        navigate('/notfound', { replace: true, state: { from: location.pathname } });
      }
    };

    const intervalId = setInterval(handleHistoryChange, 1000);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(intervalId);
    };
  }, [navigate, location.pathname, allowedPaths, refreshOnBack]);
};

export default usePreventBackNavigation;