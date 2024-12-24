import React, {useEffect, useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import io from 'socket.io-client';
import './ChatPage.css';
import config from './config.js';
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
  const [timer, setTimer] = useState(config.INITIAL_TIMER);
  const [realTestTimer, setRealTestTimer] = useState(config.REAL_TEST_TIMER);
  const [shuffling, setShuffling] = useState(false);
  const [finalRoomConfig, setFinalRoomConfig] = useState({
        leftRoom: {
            candidate: 'A',
            role: null
        },
        rightRoom: {
            candidate: 'B',
            role: null
        },
        roomOrder: []
    });
  const [roomOrder, setRoomOrder] = useState(['experimenter', 'bot']); // Default room order
  const [guessCandidateA, setGuessCandidateA] = useState('');
  const [guessCandidateB, setGuessCandidateB] = useState('');
  const [experimenterBonus, setExperimenterBonus] = useState(null);
  const [experimenterReady, setExperimenterReady] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false); // Manage overlay visibility
  const [showNotificationForExperimenter, setShowNotificationForExperimenter] = useState(role === 'experimenter');
  const [showNotificationForTester, setShowNotificationForTester] = useState(role === 'tester');
  const [testerDismissed, setTesterDismissed] = useState(false);
  const [experimenterDismissed, setExperimenterDismissed] = useState(false);
  const [timerPaused, setTimerPaused] = useState(true); // Start with timer paused
  const [shuffleEnabled] = useState(config.SHUFFLE_ENABLED);



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

    // If shuffle is disabled, set up rooms immediately
    if (!shuffleEnabled) {
      // Skip timer and go straight to anonymous setup
      setTimer(0);
      setupAnonymousRooms();
      setRealTestTimer(realTestTimer);
    }

    if (role === 'tester') {
      socket.on('experimenter_ready', (data) => {
        console.log('Received experimenter_ready event', data);
        setExperimenterReady(true);
      });
    }

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
      if (role === 'tester') {
        socket.off('experimenter_ready');
      }
    };
  }, [pairId, role, shuffleEnabled]);

  // handle dismissal status
  useEffect(() => {
    if (testerDismissed && experimenterDismissed) {
      setTimerPaused(false);
      console.log('Both participants dismissed notifications, timer starting');
    }
  }, [testerDismissed, experimenterDismissed]);

  // handle immediate room setup
const setupAnonymousRooms = () => {

    // 1. Simple room assignment - just decide left/right for experimenter
    const experimenterInLeftRoom = Math.random() > 0.5;

    // 2. Create a simple, direct mapping structure
    const newConfig = {
            leftRoom: {
                candidate: 'A',  // Always A in left room
                role: experimenterInLeftRoom ? 'experimenter' : 'bot'
            },
            rightRoom: {
                candidate: 'B',  // Always B in right room
                role: experimenterInLeftRoom ? 'bot' : 'experimenter'
            },
            roomOrder: experimenterInLeftRoom
                ? ['experimenter', 'bot']
                : ['bot', 'experimenter']
        };

    console.log('Room Configuration:', newConfig);
    setFinalRoomConfig(newConfig);
    setRoomOrder(newConfig.roomOrder);
};

// Modify the timer effect
useEffect(() => {
    if (timerPaused || !shuffleEnabled) {
      return; // Don't run timer if paused or shuffling disabled
    }

    const countdownInterval = setInterval(() => {
      setTimer((prev) => {
        if (prev > 0) {
          return prev - 1;
        } else {
          clearInterval(countdownInterval);
          return 0;
        }
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
}, [timerPaused, shuffleEnabled]);

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
    if (!shuffleEnabled) return; // Skip this effect if shuffling is disabled

    if (role === 'tester' && timer === 0) {
      setShuffling(true);
      setTimeout(() => {
        setupAnonymousRooms();
        saveChatLogs('Before Turing Test');
        setMessages([]);
        setBotMessages([]);
        setRealTestTimer(realTestTimer);
      }, 3000);
    } else if (role === 'experimenter' && timer === 0) {
      setRealTestTimer(realTestTimer);
    }
}, [timer, role, shuffleEnabled]);

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

      if (role === 'experimenter') {
        setShowOverlay(true);
        // Immediately emit the ready event when experimenter sees overlay
        console.log('Experimenter ready - emitting event');
        // Emit event to notify tester that experimenter is ready for submissions
        socket.emit('experimenter_ready', { pair_id: pairId });

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
  }, [realTestTimer, role, pairId]);


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

  const handleGuess = (candidateLabel, selectedRole) => {
    console.log('Handling guess:', { candidateLabel, selectedRole });

    if (candidateLabel === 'A') {
        setGuessCandidateA(selectedRole);
        setGuessCandidateB(selectedRole === 'experimenter' ? 'bot' : 'experimenter');
    } else {
        setGuessCandidateB(selectedRole);
        setGuessCandidateA(selectedRole === 'experimenter' ? 'bot' : 'experimenter');
    }
};

  const handleSubmitGuesses = async () => {
    if (!finalRoomConfig) {
        console.error('Final room configuration not found');
        return;
    }

    if (!guessCandidateA || !guessCandidateB) {
        alert('Please select both candidates before submitting.');
        return;
    }

    const realIdentityA = finalRoomConfig.leftRoom.role;
    const realIdentityB = finalRoomConfig.rightRoom.role;

    try {
        const response = await axios.post('http://localhost:5000/api/generate_code', {
            role: 'tester',
            name,
            pairId,
            guessCandidateA,
            guessCandidateB,
            realIdentityA,
            realIdentityB
        });

        if (response.data.status === 'success') {
            console.log('Guesses submitted successfully:', response.data);
            socket.emit('tester_guessed', { pairId });

            navigate('/feedback', {
                state: {
                    realIdentityA,
                    realIdentityB,
                    guessCandidateA,
                    guessCandidateB,
                    name,
                    userId,
                    code: response.data.code,
                    role: 'tester',
                }
            });
        } else {
            console.error('Error submitting guesses:', response.data.message);
        }
    } catch (error) {
        console.error('Error submitting guesses:', error);
    }
};

  const renderChatWindow = (roomType) => {
    if (!finalRoomConfig) return null;

    const isLeftRoom = roomType === 'experimenter';
    const roomInfo = isLeftRoom ? finalRoomConfig.leftRoom : finalRoomConfig.rightRoom;

    if (realTestTimer === 0) {
      return (
        <div className="chat-window">
          <div className="chat-header">
            {`Candidate ${roomInfo.candidate}`}
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
                value={roomInfo.candidate === 'A' ? guessCandidateA : guessCandidateB}
                            onChange={(e) => handleGuess(roomInfo.candidate, e.target.value)}
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
            {/*{showIdentity ? 'Chat with Human' : candidateMapping.A === 'experimenter' ? 'Candidate A' : 'Candidate B'}*/}
          {`Candidate ${roomInfo.candidate}`}
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
            {/*{showIdentity ? 'Chat with Bot' : candidateMapping.B === 'bot' ? 'Candidate B' : 'Candidate A'}*/}
              {`Candidate ${roomInfo.candidate}`}
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
            <p>You will chat with both a human and a bot. Identify who is human. If you guess correctly, you and the human will receive $0.50
              bonus each.</p>
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
              <p>A human tester will chat with you and a bot. Help them understand that you are human too. If they pick you as human, you and the human tester will receive $0.50 bonus each.</p>
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
        <div className="submission-area">
          {!experimenterReady ? (
            <div className="waiting-message">
              Please wait for the experimenter to finish...
            </div>
          ) : (
            <button onClick={handleSubmitGuesses} className="submit-button">
              Submit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ChatPage;