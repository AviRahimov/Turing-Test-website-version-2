import React from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './components/HomePage';
import LoadingPage from './components/LoadingPage';
import NotFoundPage from "./components/NotFoundPage";
import ChatPage from "./components/ChatPage";
import ThankYouPage from "./components/ThankYouPage";
import FeedbackPage from "./components/FeedbackPage";

function App() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/loading" element={<LoadingPage />} />
        <Route path="/chat/:pair_id" element={<ChatPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/thank_you" element={<ThankYouPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

export default App;
