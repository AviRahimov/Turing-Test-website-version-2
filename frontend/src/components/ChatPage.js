import React, {useEffect, useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import io from 'socket.io-client';
import './ChatPage.css';
import axios from 'axios';

const socket = io('http://localhost:5000'); // Adjust the port if needed

function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pairId, role, name, userId } = location.state || {};

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
  const [candidateLocations, setCandidateLocations] = useState({
    A: { name: 'Experimenter', location: 'Left room' },
    B: { name: 'Bot', location: 'Right room' },
  });
  const [roomOrder, setRoomOrder] = useState(['experimenter', 'bot']); // Default room order
  const [guessCandidateA, setGuessCandidateA] = useState('');
  const [guessCandidateB, setGuessCandidateB] = useState('');
  const [experimenterBonus, setExperimenterBonus] = useState(null);
  const [showOverlay, setShowOverlay] = useState(false); // Manage overlay visibility
  const [showNotificationForExperimenter, setShowNotificationForExperimenter] = useState(role === 'experimenter');
  const [showNotificationForTester, setShowNotificationForTester] = useState(role === 'tester');
  const [testerDismissed, setTesterDismissed] = useState(false);
  const [experimenterDismissed, setExperimenterDismissed] = useState(false);
  const [timerPaused, setTimerPaused] = useState(true); // Start with timer paused

  // Handlers to send messages on Enter key press
  const handleKeyPressExperimenter = (e) => {
    if (e.key === 'Enter') {
      sendMessageToExperimenter();
    }
  };

  const handleKeyPressBot = (e) => {
    if (e.key === 'Enter') {
      sendMessageToBot().then(() => console.log('Message sent to bot'));
    }
  };

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
      const response = await axios.post('http://localhost:5000/api/save_chat', chatData);
      console.log('Response from server:', response.data); // Debug log
    } catch (error) {
      console.error('Error saving chat logs:', error);
    }
  };

  // Initial setup: Socket connection and listeners
  useEffect(() => {
    socket.emit('join', { pair_id: pairId, username: role });

    socket.on('notification_dismissed', (data) => {
      if (data.role === 'tester') {
        setTesterDismissed(true);
      } else if (data.role === 'experimenter') {
        setExperimenterDismissed(true);
      }
    });

    socket.on('message', (data) => {
      const newMessage = { sender: data.sender, content: data.message };

      // Avoid duplication in messages for experimenter or tester
      if (data.sender !== 'bot') {
        setMessages((prevMessages) => {
          if (prevMessages.find((msg) => msg.content === newMessage.content && msg.sender === newMessage.sender)) {
            return prevMessages; // Ignore duplicates
          }
          return [...prevMessages, newMessage];
        });
      }

      // Avoid duplication in botMessages for bot-related messages
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
      socket.off('notification_dismissed');
    };
  }, [pairId, role]);

  // handle dismissal status
  useEffect(() => {
    if (testerDismissed && experimenterDismissed) {
      setTimerPaused(false);
      console.log('Both participants dismissed notifications, timer starting');
    }
  }, [testerDismissed, experimenterDismissed]);

  // Countdown for pre-shuffle timer
  useEffect(() => {
    if (timerPaused) {
      return; // Don't start countdown if timer is paused
    }
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
  }, [timerPaused]);

  const handleDismissNotification = () => {
    if (role === 'tester') {
      setShowNotificationForTester(false);
      socket.emit('notification_dismissed', { pair_id: pairId, role: 'tester' });
      setTesterDismissed(true);
    } else if (role === 'experimenter') {
      setShowNotificationForExperimenter(false);
      socket.emit('notification_dismissed', { pair_id: pairId, role: 'experimenter' });
      setExperimenterDismissed(true);
    }
  };

  // Handle shuffle logic when pre-shuffle timer reaches 0
  useEffect(() => {
    if (role === 'tester' && timer === 0) {
      setShuffling(true);

      setTimeout(() => {
        // 1. Randomly decide if we should swap rooms (Left/Right)
        const shouldSwapRooms = Math.random() > 0.5;

        // 2. Randomly decide if we should swap candidates (A/B)
        const shouldSwapCandidates = Math.random() > 0.5;

        // 3. Define the roles
        const roles = ['experimenter', 'bot'];
        const shuffledRoles = [...roles].sort(() => Math.random() - 0.5);

        // 4. Create candidate mapping with possible candidate swap
        const candidateSetup = shouldSwapCandidates ? {
          B: shouldSwapRooms ? shuffledRoles[1] : shuffledRoles[0],
          A: shouldSwapRooms ? shuffledRoles[0] : shuffledRoles[1]
        } : {
          A: shouldSwapRooms ? shuffledRoles[1] : shuffledRoles[0],
          B: shouldSwapRooms ? shuffledRoles[0] : shuffledRoles[1]
        };

        // 5. Set up locations with possible room and candidate swaps
        const locationSetup = shouldSwapCandidates ? {
          B: {
            name: candidateSetup.B,
            location: shouldSwapRooms ? 'Right room' : 'Left room'
          },
          A: {
            name: candidateSetup.A,
            location: shouldSwapRooms ? 'Left room' : 'Right room'
          }
        } : {
          A: {
            name: candidateSetup.A,
            location: shouldSwapRooms ? 'Right room' : 'Left room'
          },
          B: {
            name: candidateSetup.B,
            location: shouldSwapRooms ? 'Left room' : 'Right room'
          }
        };

        // 6. Update room order based on role positions
        const newRoomOrder = shouldSwapRooms
          ? ['bot', 'experimenter']
          : ['experimenter', 'bot'];

        // 7. Log the setup for debugging
        console.log('Shuffle Setup:', {
          shouldSwapRooms,
          shouldSwapCandidates,
          candidateSetup,
          locationSetup,
          newRoomOrder
        });

        // 8. Update all states
        setCandidateMapping(candidateSetup);
        setCandidateLocations(locationSetup);
        setRoomOrder(newRoomOrder);

        setShowIdentity(false);
        setShuffling(false);

        saveChatLogs('Before Turing Test');
        setMessages([]);
        setBotMessages([]);
        setRealTestTimer(30);
      }, 3000);
    } else if (role === 'experimenter' && timer === 0) {
      setRealTestTimer(31);
    }
}, [timer, role]);

  // Countdown for the real Turing Test
  useEffect(() => {
    if (realTestTimer === null) return;

    const realTestInterval = setInterval(() => {
      setRealTestTimer((prev) => {
        if (prev > 0) {
          return prev - 1;
        } else {
          clearInterval(realTestInterval);
          return 0;
        }
      });
    }, 1000);

    return () => clearInterval(realTestInterval);
  }, [realTestTimer]);

  // Navigate to appropriate pages when the Turing Test ends
  useEffect(() => {
    if (realTestTimer === 0) {
      saveChatLogs('During Turing Test');
      setShowOverlay(true);

      if (role === 'experimenter') {
          socket.on('bonus_code', (data) => {
          console.log('Bonus code received:', data.bonus);
          setExperimenterBonus(data.bonus);
          navigate('/thank_you', {
            state: {
              bonusCode: data.bonus,
              name,
              userId,
              role: 'experimenter',
            },
          });
        });

        return () => {
          socket.off('bonus_code');
        };
      }
    }
  }, [realTestTimer, role]);


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

  // Updated handleCandidateSelection to work with shuffled candidates
  const handleCandidateSelection = (roomType, selectedValue) => {
    // Determine which room we're dealing with
    const isLeftRoom = roomType === 'experimenter';
    const currentRoom = isLeftRoom ? 'Left room' : 'Right room';

    // Find which candidate (A or B) is in this room
    const candidateInRoom = Object.entries(candidateLocations).find(
      ([_, info]) => info.location === currentRoom
    )?.[0]; // Will be 'A' or 'B'

    console.log(`Selection for ${roomType} in ${currentRoom}:`, {
      candidateInRoom,
      selectedValue,
      currentLocations: candidateLocations
    });

    // Update the appropriate guess based on which candidate is in this room
    if (candidateInRoom === 'A') {
      setGuessCandidateA(selectedValue);
      setGuessCandidateB(selectedValue === 'bot' ? 'experimenter' : 'bot');
    } else {
      setGuessCandidateB(selectedValue);
      setGuessCandidateA(selectedValue === 'bot' ? 'experimenter' : 'bot');
    }
  };


  const handleSubmitGuesses = async () => {
    if (!guessCandidateA || !guessCandidateB) {
      alert('Please select both candidates before submitting.');
      return;
    }

    // Validate that guesses match the actual room setup
    console.log('Final Validation:', {
      'GuessCandidateA': guessCandidateA,
      'GuessCandidateB': guessCandidateB,
      'Real Identity A': candidateMapping.A,
      'Real Identity B': candidateMapping.B,
      'Locations': candidateLocations
    });

    try {
      const response = await axios.post('http://localhost:5000/api/generate_code', {
        role: 'tester',
        name,
        pairId,
        guessCandidateA,
        guessCandidateB,
        realIdentityA: candidateMapping.A,
        realIdentityB: candidateMapping.B,
      });

      if (response.data.status === 'success') {
        console.log('Guesses submitted successfully:', response.data);
        console.log('role in handleSubmitGuesses', role);
        // Notify the experimenter
        socket.emit('tester_guessed', { pairId });

        navigate('/feedback', {
          state: {
            realIdentityA: candidateMapping.A,
            realIdentityB: candidateMapping.B,
            guessCandidateA,
            guessCandidateB,
            name,
            userId,
            code: response.data.code,
            role: 'tester',
          },
        });
      } else {
        console.error('Error submitting guesses:', response.data.message);
      }
    } catch (error) {
      console.error('Error submitting guesses:', error);
    }
  };

  useEffect(() => {
    console.log('showNotificationForTester state changed:', showNotificationForTester);
  }, [showNotificationForTester]);

  useEffect(() => {
    console.log('showNotificationForExperimenter state changed:', showNotificationForExperimenter);
  }, [showNotificationForExperimenter]);

  const renderChatWindow = (roomType) => {
    if (realTestTimer === 0) {
      const currentRoom = roomType === 'experimenter' ? 'Left room' : 'Right room';
      const currentCandidate = Object.entries(candidateLocations).find(
        ([_, info]) => info.location === currentRoom
      )?.[0];

      return (
        <div className="chat-window">
          <div className="chat-header">
            {showIdentity
              ? (roomType === 'experimenter' ? 'Chat with Human' : 'Chat with Bot')
              : `Candidate ${currentCandidate}`
            }
          </div>
        <div className="chat-messages">
          {roomType === 'experimenter' ? messages.map((msg, index) => (
            <p className={`message ${msg.sender === role ? 'message-left' : 'message-right'}`} key={index}>
              {msg.content}
            </p>
          )) : botMessages.map((msg, index) => (
            <p className={`message ${msg.sender === role ? 'message-left' : 'message-right'}`} key={index}>
              {msg.content}
            </p>
          ))}
        </div>
        <div className="chat-input">
            <div className="cover">
              <p>Who was in this chat?</p>
              <select
                value={currentCandidate === 'A' ? guessCandidateA : guessCandidateB}
                onChange={(e) => {
                  console.log(`Select changed to: ${e.target.value}`);
                  console.log('Locations:', candidateLocations);
                  handleCandidateSelection(roomType, e.target.value);
                }}
              >
                <option value="">Select</option>
                <option value="bot">Bot</option>
                <option value="experimenter">Human</option>
              </select>
            </div>
          </div>
        </div>
      );
    }

    if (roomType === 'experimenter') {
      return (
        <div className="chat-window">
          <div className="chat-header">
            {showIdentity ? 'Chat with Human' : candidateMapping.A === 'experimenter' ? 'Candidate A' : 'Candidate B'}
          </div>
          <div className="chat-messages">
            {messages.map((msg, index) => (
              <p
                className={`message ${msg.sender === role ? 'message-left' : 'message-right'}`}
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
              onKeyDown={handleKeyPressExperimenter}
              placeholder="Type your message here..."
              className="input-box"
            />
            <button onClick={sendMessageToExperimenter} className="send-button">
              Send
            </button>
          </div>
        </div>
      );
    }

    if (roomType === 'bot') {
      return (
        <div className="chat-window">
          <div className="chat-header">
            {showIdentity ? 'Chat with Bot' : candidateMapping.B === 'bot' ? 'Candidate B' : 'Candidate A'}
          </div>
          <div className="chat-messages">
            {botMessages.map((msg, index) => (
              <p
                className={`message ${msg.sender === role ? 'message-left' : 'message-right'}`}
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
              onKeyDown={handleKeyPressBot}
              placeholder="Type your message here..."
              className="input-box"
            />
            <button onClick={sendMessageToBot} className="send-button">
              Send
            </button>
          </div>
        </div>
      );
    }
  };


  return (
    // console.log('role in return: ' + role + 'showOverlay: ' + showOverlay),
    <div className={`chat-container ${shuffling ? 'shuffling' : ''}`}>
      { showNotificationForTester && role === 'tester' && (
        <div className="popup-overlay">
          <div className="popup">
            <h3>Important Information</h3>
            <p>You will chat with both a human and a bot. Identify who is who. If you guess correctly, you will get a
              bonus payment.</p>
            <p className="waiting-text">
              {!experimenterDismissed && "Waiting for experimenter to acknowledge..."}
            </p>
            <button
                onClick={handleDismissNotification}
                className="popup-dismiss-button"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showNotificationForExperimenter && role === 'experimenter' && (
          <div className="popup-overlay">
            <div className="popup">
              <h3>Important Information</h3>
              <p>You will chat with the tester. Help them identify who is who. If they guess correctly, you will get a
                bonus payment.</p>
              <p className="waiting-text">
                {!testerDismissed && "Waiting for tester to acknowledge..."}
              </p>
              <button
                  onClick={handleDismissNotification}
                  className="popup-dismiss-button"
              >
                Dismiss
              </button>
            </div>
          </div>
      )}

      <div className="chat-boxes">
        {role === 'tester' && roomOrder.map((roomType) => renderChatWindow(roomType))}
        {role === 'experimenter' && (
            <div className="chat-window chat-experimenter">
              {showOverlay && role === 'experimenter' && (
                <div className="overlay">
                  <h2>Waiting for the tester to submit their guesses...</h2>
                </div>
              )}
              <div className="chat-header">
                <h3>Chat with Tester</h3>
                <p className="subtitle">Prove that you are a human by chatting with the tester.</p>
              </div>
              <div className="chat-messages">
                {messages.map((msg, index) => (
                    <p
                        className={`message ${msg.sender === role ? 'message-left' : 'message-right'}`}
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
                    onKeyDown={handleKeyPressExperimenter}
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
      {role === 'tester' && realTestTimer === 0 && (
      <button onClick={handleSubmitGuesses} className="submit-button">
        Submit
      </button>
    )}
    </div>
  );
}

export default ChatPage;