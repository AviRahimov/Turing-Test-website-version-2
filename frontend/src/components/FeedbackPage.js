import React, { useState } from 'react';

const FeedbackPage = () => {
  const [experience, setExperience] = useState('');
  const [comments, setComments] = useState('');
  const [improvements, setImprovements] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();

    const feedbackData = {
      experience,
      comments,
      improvements,
    };

    console.log('Feedback Submitted:', feedbackData);

    // Example API call for feedback submission
    // fetch('/api/submit_feedback', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(feedbackData),
    // }).then(() => {
    //   setSubmitted(true);
    // });

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div style={styles.container}>
        <h1 style={styles.thankYouText}>Thank you for your feedback!</h1>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Feedback Form</h1>
      <form style={styles.form} onSubmit={handleSubmit}>
        <label style={styles.label} htmlFor="experience">
          1. How would you rate your experience?
        </label>
        <select
          id="experience"
          style={styles.input}
          value={experience}
          onChange={(e) => setExperience(e.target.value)}
          required
        >
          <option value="" disabled>Select your answer</option>
          <option value="excellent">Excellent</option>
          <option value="good">Good</option>
          <option value="average">Average</option>
          <option value="poor">Poor</option>
        </select>

        <label style={styles.label} htmlFor="comments">
          2. What did you think about the interaction?
        </label>
        <textarea
          id="comments"
          style={styles.textarea}
          rows="4"
          placeholder="Write your feedback here..."
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          required
        />

        <label style={styles.label} htmlFor="improvements">
          3. How can we improve?
        </label>
        <textarea
          id="improvements"
          style={styles.textarea}
          rows="4"
          placeholder="Share your suggestions..."
          value={improvements}
          onChange={(e) => setImprovements(e.target.value)}
          required
        />

        <button style={styles.button} type="submit">
          Submit Feedback
        </button>
      </form>
    </div>
  );
};

const styles = {
  container: {
    fontFamily: 'Arial, sans-serif',
    backgroundColor: '#f8f9fa',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '20px',
  },
  header: {
    fontSize: '2em',
    color: '#333',
    marginBottom: '1em',
  },
  form: {
    width: '100%',
    maxWidth: '500px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1em',
  },
  label: {
    fontSize: '1em',
    color: '#555',
  },
  input: {
    padding: '0.8em',
    fontSize: '1em',
    borderRadius: '4px',
    border: '1px solid #ccc',
  },
  textarea: {
    padding: '0.8em',
    fontSize: '1em',
    borderRadius: '4px',
    border: '1px solid #ccc',
  },
  button: {
    padding: '0.8em',
    fontSize: '1em',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.3s',
  },
  thankYouText: {
    fontSize: '2em',
    color: '#333',
    textAlign: 'center',
  },
};

export default FeedbackPage;
