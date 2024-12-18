import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const FeedbackPage = () => {
  const location = useLocation();
  const { name, userId, realIdentityA, realIdentityB, guessCandidateA, guessCandidateB, code, role } = location.state || {};

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
          name,
          userId,
          realIdentityA,
          realIdentityB,
          guessCandidateA,
          guessCandidateB,
        }),
      });

      const result = await response.json();
      if (result.status === 'success') {
        navigate('/thank_you', { state: { role: 'tester', name: name, bonusCode:code } });
      } else {
        alert('Failed to submit feedback. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Feedback Form</h1>
      <form style={styles.form} onSubmit={handleSubmit}>
        <label style={styles.label}>
          How would you describe your overall experience?
          <textarea
            name="experience"
            value={formData.experience}
            onChange={handleChange}
            style={styles.textarea}
            required
          />
        </label>
        <label style={styles.label}>
          Do you have any comments about the conversation?
          <textarea
            name="comments"
            value={formData.comments}
            onChange={handleChange}
            style={styles.textarea}
            required
          />
        </label>
        <label style={styles.label}>
          What could be improved in this experiment?
          <textarea
            name="improvements"
            value={formData.improvements}
            onChange={handleChange}
            style={styles.textarea}
          />
        </label>
        <button type="submit" style={styles.button}>
          Submit Feedback
        </button>
      </form>
    </div>
  );
};

const styles = {
  container: {
    margin: '0 auto',
    maxWidth: '800px',
    padding: '20px',
    fontFamily: "'Arial', sans-serif",
    backgroundColor: '#f9f9f9',
    borderRadius: '10px',
    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)',
  },
  header: {
    textAlign: 'center',
    color: '#333',
    fontSize: '28px',
    marginBottom: '20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  label: {
    fontWeight: 'bold',
    fontSize: '16px',
    color: '#555',
    marginBottom: '5px',
  },
  textarea: {
    width: '100%',
    padding: '10px',
    fontSize: '14px',
    borderRadius: '5px',
    border: '1px solid #ccc',
    resize: 'vertical',
  },
  button: {
    marginTop: '20px',
    backgroundColor: '#007bff',
    color: '#fff',
    fontSize: '16px',
    padding: '10px',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    textAlign: 'center',
  },
  buttonHover: {
    backgroundColor: '#0056b3',
  },
};

export default FeedbackPage;