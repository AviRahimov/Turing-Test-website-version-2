import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import './ChatPage.css';
import axios from 'axios';

const socket = io('http://localhost:5000'); // Adjust the port if needed

function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pairId, role } = location.state || {};
  const [messages, setMessages] = useState([]);
  const [botMessages, setBotMessages] = useState([]);
  const [messageToExperimenter, setMessageToExperimenter] = useState('');
  const [messageToBot, setMessageToBot] = useState('');
  const [timer, setTimer] = useState(180); // Pre-shuffle: 3 minutes
  const [realTestTimer, setRealTestTimer] = useState(null); // Turing Test: 5 minutes
  const [showIdentity, setShowIdentity] = useState(true);
  const [candidateMapping, setCandidateMapping] = useState({ A: '', B: '' });
  const [shuffling, setShuffling] = useState(false);
  const [candidates, setCandidates] = useState({ A: 'Experimenter', B: 'Bot' });
  const [fadeIn, setFadeIn] = useState(false); // For smooth transition

  useEffect(() => {
    // Randomly assign candidates
    const roles = ['Experimenter', 'Bot'];
    const shuffled = roles.sort(() => Math.random() - 0.5);

    // Assign roles and trigger fade effect
    setCandidates({ A: shuffled[0], B: shuffled[1] });

    // Start fade-in
    setFadeIn(true);
  }, []);

  // Initial setup: Socket connection and listeners
useEffect(() => {
  // Ensure socket emits and listens properly for this role
  socket.emit('join', { pair_id: pairId, username: role });

  socket.on('message', (data) => {
    const newMessage = { sender: data.sender, content: data.message };

    // Avoid duplication in `messages` for experimenter or tester
    if (data.sender !== 'bot') {
      setMessages((prevMessages) => {
        if (prevMessages.find((msg) => msg.content === newMessage.content && msg.sender === newMessage.sender)) {
          return prevMessages; // Ignore duplicates
        }
        return [...prevMessages, newMessage];
      });
    }

    // Avoid duplication in `botMessages` for bot-related messages
    if (data.sender === 'bot' && role === 'tester') {
      setBotMessages((prevBotMessages) => {
        if (prevBotMessages.find((msg) => msg.content === newMessage.content)) {
          return prevBotMessages; // Ignore duplicates
        }
        return [...prevBotMessages, newMessage];
      });
    }
  });

  return () => {
    socket.off('message');
  };
}, [pairId, role]);


  // Handle shuffle logic when pre-shuffle timer reaches 0
  // Countdown for pre-shuffle timer
useEffect(() => {
  if (role === 'tester') {
    const countdownInterval = setInterval(() => {
      setTimer((prev) => {
        if (prev > 0) {
          return prev - 1; // Decrement timer by 1 second
        } else {
          clearInterval(countdownInterval); // Stop the interval when timer reaches 0
          return 0; // Ensure timer doesn't go negative
        }
      });
    }, 1000); // Run every second

    return () => clearInterval(countdownInterval); // Cleanup on unmount
  }
}, [role]);

// Handle shuffle logic when pre-shuffle timer reaches 0
useEffect(() => {
  if (role === 'tester' && timer === 0) {
    setShuffling(true);

    setTimeout(() => {
      // Ensure unique role assignments for candidates
      const roles = ['bot', 'experimenter'];
      const shuffledRoles = [...roles].sort(() => Math.random() - 0.5);

      // Assign roles explicitly to Candidate A and Candidate B
      setCandidateMapping({ A: shuffledRoles[0], B: shuffledRoles[1] });
      setShowIdentity(false);
      setShuffling(false);

      setRealTestTimer(300); // Start the real test timer (5 minutes)
    }, 3000); // 3-second shuffle animation
  } else if (timer === 60) {
    alert('In one minute, you will start the real Turing Test. Be ready.');
  }
}, [timer, role]);

// Countdown for the real Turing Test
useEffect(() => {
  if (realTestTimer === null) return; // Don't start if realTestTimer isn't initialized

  const realTestInterval = setInterval(() => {
    setRealTestTimer((prev) => {
      if (prev > 0) {
        return prev - 1; // Decrement realTestTimer by 1 second
      } else {
        clearInterval(realTestInterval); // Stop the interval when timer reaches 0
        return 0; // Ensure timer doesn't go negative
      }
    });
  }, 1000); // Run every second

  return () => clearInterval(realTestInterval); // Cleanup on unmount
}, [realTestTimer]);

// Navigate to the feedback page when the test ends
useEffect(() => {
  if (realTestTimer === 60) {
    alert('1 minute remaining for the Turing Test.');
  } else if (realTestTimer === 0) {
    if (role === 'tester') {
      navigate('/feedback');
    } else if (role === 'experimenter') {
      navigate('/thank_you');
    }
  }
}, [realTestTimer, role, navigate]);


  // Send a message to the experimenter
const sendMessageToExperimenter = () => {
  if (!messageToExperimenter.trim()) return;

  const newMessage = { sender: role, content: messageToExperimenter };

  // Add locally first (to avoid UI lag)
  setMessages((prevMessages) => [...prevMessages, newMessage]);

  // Emit to the server
  socket.emit('message', {
    pair_id: pairId,
    sender: role,
    message: messageToExperimenter,
  });

  setMessageToExperimenter('');
};


  // Send a message to the bot
const sendMessageToBot = async () => {
  if (!messageToBot.trim()) return;

  const newMessage = { sender: role, content: messageToBot };

  // Add locally first (to avoid UI lag)
  setBotMessages((prevBotMessages) => [...prevBotMessages, newMessage]);

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        temperature: 0.7,
        messages: [{ role: 'user', content: messageToBot }],
      },
      {
        headers: {
          Authorization: `Bearer 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`,
          'X-Title': 'Turing Test',
        },
      }
    );

    const botReply = response.data.choices[0].message.content;

    setBotMessages((prevBotMessages) => [...prevBotMessages, { sender: 'bot', content: botReply }]);
  } catch (error) {
    console.error('Error communicating with bot:', error);
  }

  setMessageToBot('');
};


  return (
    <div className={`chat-container ${shuffling ? 'shuffling' : ''}`}>
      <div className="chat-boxes">
        {role === 'tester' && (
          <>
            {/* Chat with Experimenter */}
            <div className="chat-window">
              <div className="chat-header">
                {showIdentity
                  ? 'Chat with Experimenter'
                  : candidateMapping.A === 'experimenter'
                  ? 'Candidate A'
                  : 'Candidate B'}
              </div>
              <div className="chat-messages">
                {messages.map((msg, index) => (
                  <p
                    className={`message ${
                      msg.sender === role ? 'message-left' : 'message-right'
                    }`}
                    key={index}
                  >
                    {msg.content}
                  </p>
                ))}
              </div>
              <div className="chat-input">
                <input
                  type="text"
                  value={messageToExperimenter}
                  onChange={(e) => setMessageToExperimenter(e.target.value)}
                  placeholder="Message Experimenter..."
                  className="input-box"
                />
                <button onClick={sendMessageToExperimenter} className="send-button">
                  Send
                </button>
              </div>
            </div>

            {/* Chat with Bot */}
            <div className="chat-window">
              <div className="chat-header">
                {showIdentity
                  ? 'Chat with Bot'
                  : candidateMapping.B === 'bot'
                  ? 'Candidate B'
                  : 'Candidate A'}
              </div>
              <div className="chat-messages">
                {botMessages.map((msg, index) => (
                  <p
                    className={`message ${
                      msg.sender === role ? 'message-left' : 'message-right'
                    }`}
                    key={index}
                  >
                    {msg.content}
                  </p>
                ))}
              </div>
              <div className="chat-input">
                <input
                  type="text"
                  value={messageToBot}
                  onChange={(e) => setMessageToBot(e.target.value)}
                  placeholder="Message Bot..."
                  className="input-box"
                />
                <button onClick={sendMessageToBot} className="send-button">
                  Send
                </button>
              </div>
            </div>
          </>
        )}

        {role === 'experimenter' && (
          <div className="chat-window chat-experimenter">
            <div className="chat-header">Chat with Tester</div>
            <div className="chat-messages">
              {messages.map((msg, index) => (
                <p
                  className={`message ${
                    msg.sender === role ? 'message-left' : 'message-right'
                  }`}
                  key={index}
                >
                  {msg.content}
                </p>
              ))}
            </div>
            <div className="chat-input">
              <input
                type="text"
                value={messageToExperimenter}
                onChange={(e) => setMessageToExperimenter(e.target.value)}
                placeholder="Type your message here..."
                className="input-box"
              />
              <button onClick={sendMessageToExperimenter} className="send-button">
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatPage;
