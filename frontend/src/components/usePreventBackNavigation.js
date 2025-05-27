import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const usePreventBackNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const preventBack = (e) => {
      navigate('/notfound', { replace: true, state: { from: location.pathname } });
      e.preventDefault();
    };

    window.addEventListener('popstate', preventBack);
    window.addEventListener('beforeunload', () => {
      window.history.replaceState(null, '', '/');
    });

    const handleHistoryChange = () => {
      const currentPath = window.location.pathname;
      if (currentPath !== location.pathname && currentPath !== '/notfound') {
        navigate('/notfound', { replace: true, state: { from: location.pathname } });
      }
    };

    const intervalId = setInterval(handleHistoryChange, 1500);

    return () => {
      window.removeEventListener('popstate', preventBack);
      clearInterval(intervalId);
    };
  }, [navigate, location.pathname]);
};

export default usePreventBackNavigation;