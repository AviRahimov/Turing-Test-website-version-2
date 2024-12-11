import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const FeedbackPage = () => {
  const location = useLocation();
  const { realIdentityA, realIdentityB, locations, name, userId } = location.state || {};

  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    experience: '',
    comments: '',
    improvements: '',
    guessCandidateA: '',
    guessCandidateB: '',
    ratingCandidateA: '',
    ratingCandidateB: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prevData) => {
      if (name === 'guessCandidateA') {
        return {
          ...prevData,
          [name]: value,
          guessCandidateB: value === 'Bot' ? 'human' : 'Bot', // Automatically set Candidate B
        };
      }
      return { ...prevData, [name]: value };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      console.log("name", location.state.name);
      const response = await fetch('/api/save_feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          realIdentityA,
          realIdentityB,
          name,
          userId,
        }),
      });

      const result = await response.json();
      if (result.status === 'success') {
        navigate('/thank_you', { state: { role: 'tester', name: name} });
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
        <div style={styles.splitContainer}>
          <div style={styles.column}>
            <h2 style={styles.subHeader}>Candidate A</h2>
            <p>Location at the chat room: {locations?.A?.location || 'Unknown'}</p>
            <label style={styles.label}>
              Who do you think Candidate A was?
              <select
                name="guessCandidateA"
                value={formData.guessCandidateA}
                onChange={handleChange}
                style={styles.select}
                required
              >
                <option value="" disabled>
                  Select an option
                </option>
                <option value="human">Human</option>
                <option value="Bot">Bot</option>
              </select>
            </label>
            <label style={styles.label}>
              How would you rate Candidate A? (1-5)
              <select
                name="ratingCandidateA"
                value={formData.ratingCandidateA}
                onChange={handleChange}
                style={styles.select}
                required
              >
                <option value="" disabled>
                  Select a rating
                </option>
                {[1, 2, 3, 4, 5].map((rating) => (
                  <option key={rating} value={rating}>
                    {rating}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={styles.column}>
            <h2 style={styles.subHeader}>Candidate B</h2>
            <p>Location at the chat room: {locations?.B?.location || 'Unknown'}</p>
            <label style={styles.label}>
              Who do you think Candidate B was?
              <select
                name="guessCandidateB"
                value={formData.guessCandidateB}
                onChange={handleChange}
                style={styles.select}
                disabled
              >
                <option value="human">Human</option>
                <option value="Bot">Bot</option>
              </select>
            </label>
            <label style={styles.label}>
              How would you rate Candidate B? (1-5)
              <select
                name="ratingCandidateB"
                value={formData.ratingCandidateB}
                onChange={handleChange}
                style={styles.select}
                required
              >
                <option value="" disabled>
                  Select a rating
                </option>
                {[1, 2, 3, 4, 5].map((rating) => (
                  <option key={rating} value={rating}>
                    {rating}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
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
  select: {
    width: '100%',
    padding: '10px',
    fontSize: '14px',
    borderRadius: '5px',
    border: '1px solid #ccc',
  },
  splitContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '20px',
  },
  column: {
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '15px',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.05)',
  },
  subHeader: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '10px',
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
