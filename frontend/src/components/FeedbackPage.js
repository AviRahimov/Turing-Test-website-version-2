import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './FeedbackPage.css';

const FeedbackPage = () => {
  const location = useLocation();
  const { name, userId, realIdentityA, realIdentityB, guessCandidateA, guessCandidateB, code, role, pairId } = location.state || {};

  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    experience: '',
    comments: '',
    improvements: '',
    gender: '',
    age: '',
    education: '',
    employment: '',
    country: '',
    aiExperience: '',
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
          name,
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
        navigate('/thank_you', { state: { role: 'tester', name: name, bonusCode: code } });
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

        <h2>Demographic Information</h2>
        <label className="feedback-label">
          Gender:
          <select name="gender" value={formData.gender} onChange={handleChange} required>
            <option value="">Select</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Non-binary">Non-binary</option>
            <option value="Prefer not to say">Prefer not to say</option>
          </select>
        </label>
        <label className="feedback-label">
          Age:
          <input type="number" name="age" value={formData.age} onChange={handleChange} required />
        </label>
        <label className="feedback-label">
          Educational Degree:
          <select name="education" value={formData.education} onChange={handleChange} required>
            <option value="">Select</option>
            <option value="High School">High School</option>
            <option value="Bachelor's Degree">Bachelor's Degree</option>
            <option value="Master's Degree">Master's Degree</option>
            <option value="Doctorate">Doctorate</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label className="feedback-label">
          Employment Status:
          <select name="employment" value={formData.employment} onChange={handleChange} required>
            <option value="">Select</option>
            <option value="Employed">Employed</option>
            <option value="Unemployed">Unemployed</option>
            <option value="Student">Student</option>
            <option value="Retired">Retired</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label className="feedback-label">
          Country of Residence:
          <select name="country" value={formData.country} onChange={handleChange} required>
            <option value="">Select</option>
            <option value="USA">USA</option>
            <option value="Canada">Canada</option>
            <option value="UK">UK</option>
            {/* Add more countries as needed */}
          </select>
        </label>
        <label className="feedback-label">
          Experience with AI:
          <select name="aiExperience" value={formData.aiExperience} onChange={handleChange} required>
            <option value="">Select</option>
            <option value="None">None</option>
            <option value="Basic">Basic</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
          </select>
        </label>

        <button type="submit" className="feedback-button">
          Submit Feedback
        </button>
      </form>
    </div>
  );
};

export default FeedbackPage;