import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import './ChatPage.css';
import axios from 'axios';

const socket = io('http://localhost:5000'); // Adjust the port if needed

function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pairId, role, name } = location.state || {};
  const [messages, setMessages] = useState([]); // Chat with experimenter
  const [botMessages, setBotMessages] = useState([]); // Chat with bot
  const [messageToExperimenter, setMessageToExperimenter] = useState('');
  const [messageToBot, setMessageToBot] = useState('');
  const [timer, setTimer] = useState(15); // Debugging: 15 seconds
  const [realTestTimer, setRealTestTimer] = useState(null); // Debugging: 5 minutes
  const [showIdentity, setShowIdentity] = useState(true);
  const [candidateMapping, setCandidateMapping] = useState({ A: '', B: '' });
  const [shuffling, setShuffling] = useState(false);
  const [candidates, setCandidates] = useState({ A: 'Experimenter', B: 'Bot' });
  const [fadeIn, setFadeIn] = useState(false); // For smooth transition
  const [candidateLocations, setCandidateLocations] = useState({});

  // Helper to save chat logs
  const saveChatLogs = async (title) => {
    const chatData = {
      pairId,
      title,
      testerChatWithExperimenter: messages,
      testerChatWithBot: botMessages,
    };
    console.log('Chat data being sent:', chatData); // Debug log

    try {
    const response = await axios.post('/api/save_chat', chatData);
    console.log('Response from server:', response.data); // Debug log
  } catch (error) {
    console.error('Error saving chat logs:', error);
  }
};

  useEffect(() => {
    // Randomly assign candidates
    const roles = ['Experimenter', 'Bot'];
    const shuffled = roles.sort(() => Math.random() - 0.5);

    let locations = {};
    // Add locations for candidates
    if (shuffled[0] === roles[0]) {
        locations = {
        A: { name: shuffled[0], location: 'Right room' },
        B: { name: shuffled[1], location: 'Left room' }
      };
    }
    else {
        locations = {
        A: { name: shuffled[0], location: 'Left room' },
        B: { name: shuffled[1], location: 'Right room' }
      };
    }

    setCandidateLocations(locations);
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
  // if (role === 'tester') {
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
  // }
}, [role]);

// Handle shuffle logic when pre-shuffle timer reaches 0
useEffect(() => {
  console.log('Checking timer:', timer); // Debug log
  if (role === 'tester' && timer === 0) {
    setShuffling(true);

    setTimeout(() => {
      // Ensure unique role assignments for candidates
      const roles = ['bot', 'experimenter'];
      const shuffledRoles = [...roles].sort(() => Math.random() - 0.5);

      let locations = {};
      // Add locations for candidates
      if (shuffledRoles[0] === roles[0]) {
          locations = {
          A: { name: shuffledRoles[0], location: 'Right room' },
          B: { name: shuffledRoles[1], location: 'Left room' }
        };
      }
      else {
          locations = {
          A: { name: shuffledRoles[0], location: 'Left room' },
          B: { name: shuffledRoles[1], location: 'Right room' }
        };
      }

      setCandidateLocations(locations);
      // Assign roles explicitly to Candidate A and Candidate B
      setCandidateMapping({ A: shuffledRoles[0], B: shuffledRoles[1] });
      setShowIdentity(false);
      setShuffling(false);

      saveChatLogs('Before Turing Test'); // Save chat logs before the Turing Test
      setMessages([]); // Clear chat with experimenter
      setBotMessages([]); // Clear chat with bot

      setRealTestTimer(30); // Debugging: Real Turing Test starts (30 seconds)
      console.log('Real test timer started for both roles'); // Debug log
    }, 3000); // 3-second shuffle animation
  }
  else if (role === 'experimenter' && timer === 0) {
    setRealTestTimer(27);
  }
  // else if (timer === 60) {
  //   alert('In one minute, you will start the real Turing Test. Be ready.');
  // }
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

// // Navigate to the feedback page when the test ends
// useEffect(() => {
//   if (realTestTimer === 60) {
//     alert('1 minute remaining for the Turing Test.');
//   } else if (realTestTimer === 0) {
//     saveChatLogs();
//     if (role === 'tester') {
//       navigate('/feedback');
//     } else if (role === 'experimenter') {
//       navigate('/thank_you');
//     }
//   }
// }, [realTestTimer, role, navigate]);

// Navigate to appropriate pages when the Turing Test ends, DEBUG MODE
  useEffect(() => {
    console.log('Checking realTestTimer:', realTestTimer); // Debug log
    if (realTestTimer === 0) {
      saveChatLogs('During Turing Test'); // Save chat logs when the chat ends

      console.log('Role:', role); // Check the role value
      if (role === 'tester') {
        console.log('Tester navigates to feedback page');
        navigate('/feedback', {
          state: {
            realIdentityA: candidateMapping.A,
            realIdentityB: candidateMapping.B,
            locations: candidateLocations,
            name: name
          }
        });
      }
      else if (role === 'experimenter') {
        console.log('Experimenter navigates to thank you page');
        navigate('/thank_you', {"state": {"pairId": pairId, "role": role, "name": name}});
      }
    }
  }, [realTestTimer, role, navigate, candidateMapping, candidateLocations]);

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
                  placeholder="Type your message here..."
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
                  placeholder="Type your message here..."
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
