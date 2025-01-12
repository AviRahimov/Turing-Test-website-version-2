import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const FeedbackPage = () => {
  const location = useLocation();
  const {userId, realIdentityA, realIdentityB, guessCandidateA, guessCandidateB, code, role, pairId } = location.state || {};

  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    experience: '',
    comments: '',
    improvements: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch('http://localhost:5000/api/save_feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          userId,
          pairId,
          realIdentityA,
          realIdentityB,
          guessCandidateA,
          guessCandidateB,
        }),
      });

      const result = await response.json();
      if (result.status === 'success') {
        navigate('/thank_you', { state: { role: 'tester', bonusCode: code } });
      } else {
        alert('Failed to submit feedback. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };
  
  return (
      <div className="feedback-container">
        <h1 className="feedback-header">Feedback Form</h1>
        <form className="feedback-form" onSubmit={handleSubmit}>
          <label className="feedback-label">
            How would you describe your overall experience?
            <textarea
                name="experience"
                value={formData.experience}
                onChange={handleChange}
                className="feedback-textarea"
                required
            />
          </label>
          <label className="feedback-label">
            Do you have any comments about the conversation?
            <textarea
                name="comments"
                value={formData.comments}
                onChange={handleChange}
                className="feedback-textarea"
                required
            />
          </label>
          <label className="feedback-label">
            What could be improved in this experiment?
            <textarea
                name="improvements"
                value={formData.improvements}
                onChange={handleChange}
                className="feedback-textarea"
            />
          </label>
        </form>
      </div>
  );
};

export default FeedbackPage;