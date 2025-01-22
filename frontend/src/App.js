import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import HomePage from './components/HomePage';
import NotFoundPage from "./components/NotFoundPage";
import ChatPage from "./components/ChatPage";
import ThankYouPage from "./components/ThankYouPage";
import FeedbackPage from "./components/FeedbackPage";
import Disconnect from "./components/Disconnect";

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    // Check if user was disconnected
    const wasDisconnected = sessionStorage.getItem('wasDisconnected');

    // If user was disconnected and tries to access chat
    if (wasDisconnected === 'true' && location.pathname.includes('/chat')) {
      navigate('/disconnected', {
        replace: true,
        state: {
          message: "Sorry, you've been disconnected due to inactivity. You will not receive a payment."
        }
      });
    }
  }, [navigate, location]);

  return children;
};

// Protected Disconnect Component
const ProtectedDisconnect = ({ children }) => {
  const navigate = useNavigate();

  React.useEffect(() => {
    // Only allow access to disconnect page if user was actually disconnected
    const wasDisconnected = sessionStorage.getItem('wasDisconnected');
    if (wasDisconnected !== 'true') {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  return children;
};

function App() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/chat/:pair_id"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/thank_you" element={<ThankYouPage />} />
        <Route
          path="/disconnected"
          element={
            <ProtectedDisconnect>
              <Disconnect />
            </ProtectedDisconnect>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

export default App;