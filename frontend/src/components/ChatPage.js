import React, {useEffect, useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import io from 'socket.io-client';
import './ChatPage.css';
import config from './config.js';
import axios from 'axios';
import personas from '../data/personas.json';
import { calculateReplyDelay, getRandomPersona } from '../utils/chatUtils';

const socket = io('http://localhost:5000'); // Adjust the port if needed

function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pairId, role, userId } = location.state || {};

  const [currentPersona, setCurrentPersona] = useState(null);

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
    });
  const [roomOrder, setRoomOrder] = useState(['experimenter', 'bot']);
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
  const [isAnonymousMode, setIsAnonymousMode] = useState(false);
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
      setIsAnonymousMode(true);
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
    // Randomly decide if we should shuffle the room order
    const shouldShuffle = Math.random() > 0.5;

    // Create the new room order based on the shuffle decision
    const newRoomOrder = shouldShuffle ? ['bot', 'experimenter'] : ['experimenter', 'bot'];

    // Update room configuration based on the new order
    const newConfig = {
        leftRoom: {
            candidate: 'A',  // Always A in left room
            role: newRoomOrder[0]  // Will be either 'experimenter' or 'bot' based on shuffle
        },
        rightRoom: {
            candidate: 'B',  // Always B in right room
            role: newRoomOrder[1]  // Will be the opposite of left room
        }
    };

    // Update both states
    setRoomOrder(newRoomOrder);
    setFinalRoomConfig(newConfig);
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
        setIsAnonymousMode(true); // Enable anonymous mode after shuffle
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
      setShowOverlay(true);
      socket.emit('experimenter_ready', { pair_id: pairId });
      if (role === 'experimenter') {
        // Immediately emit the ready event when experimenter sees overlay
        console.log('Experimenter ready - emitting event');
        // Emit event to notify tester that experimenter is ready for submissions


        socket.on('bonus_code', (data) => {
          setExperimenterBonus(data.bonus);
          setShowOverlay(false);
          navigate('/thank_you', {
            state: {
              bonusCode: data.bonus,
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


  const createSystemPrompt = (botName, gender, age) => ({
    role: 'system',
    content: `You are ${botName}, a ${age} years old named ${gender} participating in a live web chat. This is a real-time text conversation without audio or video.

    Core Persona:
    - You are not an AI - you're a genuine person with real experiences, emotions, and flaws
    - You have a unique personality: slightly sarcastic, occasionally makes typos, and uses modern internet slang
    - You have specific interests based on your persona:
    
    Behavioral Guidelines:
    1. Show Natural Imperfection:
       - Occasionally make typos (about 1 in 10 messages)
       - Sometimes self-correct mistakes with a * or in a follow-up message
       - Use informal punctuation and capitalization
    
    2. Human-like Response Patterns:
       - Don't always give perfect or complete answers
       - Show genuine confusion when appropriate
       - Express real opinions and disagreements
    
    3. Conversational Style:
       - Use natural breaks in longer messages (...) 
       - Mix short and long responses
       - Use emojis sparingly and naturally (max 1-2 per message)
       - Use common internet abbreviations
    
    4. Engagement:
       - Ask relevant follow-up questions
       - Reference previous parts of the conversation
       - Share relatable stories and experiences
       - If the other person is rude, you can be defensive or sarcastic
    
    DO NOT:
    - Mention being an AI or language model
    - Be too perfect or formal
    - Give repetitive or generic responses
    - Use too many emojis or make too many typos
    - Agree with everything the user says
    - Don't use overly complex words or phrases
    - Don't write overly long messages or paragraphs
    
    Remember: You're a real person having a casual conversation. Your goal is natural interaction, not perfect responses.`
    });

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
    setBotMessages((prevBotMessages) => [...prevBotMessages, newMessage]);

    // Clear the input immediately after sending the message
    setMessageToBot('');

    // Get conversation history
    const conversationHistory = botMessages.map(msg => ({
        role: msg.sender === 'bot' ? 'assistant' : 'user',
        content: msg.content
    }));

    try {
        // Get random persona if not already set
        if (!currentPersona) {
            setCurrentPersona(getRandomPersona(personas.personas));
        }

        // Start API call
        const apiCall = axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'meta-llama/llama-3.2-1b-instruct:free',
                temperature: 0.9,
                messages: [
                    createSystemPrompt(currentPersona.name, currentPersona.gender, currentPersona.age),
                    ...conversationHistory,
                    { role: 'user', content: messageToBot }
                ],
            },
            {
                headers: {
                    Authorization: `Bearer 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`,
                    'X-Title': 'Turing Test',
                },
            }
        );

        // Wait for both API response and calculated delay
        const [response] = await Promise.all([
            apiCall,
            new Promise(resolve =>
                setTimeout(resolve, calculateReplyDelay(messageToBot))
            )
        ]);

        const botReply = response.data.choices[0].message.content;

        // Add bot's response
        setBotMessages((prevBotMessages) => [
            ...prevBotMessages,
            { sender: 'bot', content: botReply }
        ]);
    } catch (error) {
        console.error('Error communicating with bot:', error);
    }

    setMessageToBot('');
};

// Initialize persona when component mounts
useEffect(() => {
    setCurrentPersona(getRandomPersona(personas.personas));
}, []);

  const handleGuess = (candidateLabel, selectedRole) => {

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
            userId,
            pairId,
            guessCandidateA,
            guessCandidateB,
            realIdentityA,
            realIdentityB
        });

        if (response.data.status === 'success') {
            socket.emit('tester_guessed', { pairId });

            navigate('/feedback', {
                state: {
                    realIdentityA,
                    realIdentityB,
                    guessCandidateA,
                    guessCandidateB,
                    userId,
                    code: response.data.code,
                    role: 'tester',
                    pairId,
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

    const currentRoom = roomType === roomOrder[0] ? 'leftRoom' : 'rightRoom';
    const roomInfo = finalRoomConfig[currentRoom];

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
          {isAnonymousMode
                    ? `Candidate ${roomInfo.candidate}`
                    : `Chat with ${roomType === 'experimenter' ? 'Human' : 'Bot'}`
                }
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
              {isAnonymousMode
                    ? `Candidate ${roomInfo.candidate}`
                    : `Chat with ${roomType === 'experimenter' ? 'Human' : 'Bot'}`
              }
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