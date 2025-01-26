import React, {useEffect, useRef, useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import io from 'socket.io-client';
import './ChatPage.css';
import config from './config.js';
import axios from 'axios';
import personas from '../data/personas.json';
import {getRandomPersona } from '../utils/chatUtils';
import { sendBotMessage } from '../utils/botService';

const socket = io(config.SERVER_URL); // Adjust the port if needed

function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pairId, role, userId, username } = location.state || {};

  const [currentPersona, setCurrentPersona] = useState(null);
  const [messageQueue, setMessageQueue] = useState([]); // Queue for tester messages

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

  // Track the last message time for the ban mechanism
  const lastActivityTimestampRef = useRef(Date.now());
  const [warningShown, setWarningShown] = useState(false);
  const [inactivityCheckerActive, setInactivityCheckerActive] = useState(false);

  const [lastBotActivityTimestamp, setLastBotActivityTimestamp] = useState(Date.now());
  const [wakeupAttemptsCount, setWakeupAttemptsCount] = useState(0);
  const lastBotActivityTimestampRef = useRef(Date.now());
  const wakeupIntervalRef = useRef(null);
  const wakeupDelayRef = useRef(null);
  const lastWakeupMessageTimeRef = useRef(Date.now());
  const lastWakeupMessageRef = useRef(null);
  const MAX_WAKEUP_ATTEMPTS = 2; // Maximum number of wake-up messages

  // useEffect for handling the start of inactivity checking
useEffect(() => {
    // Start the inactivity checker only when both conditions are met:
    // 1. Test timer is running (> 0)
    // 2. Timer is not paused (notifications dismissed)
    // 3. Checker hasn't been started yet
    if (realTestTimer > 0 && !timerPaused && !inactivityCheckerActive) {
        console.log(`${role} - Starting inactivity monitoring system`);
        lastActivityTimestampRef.current = Date.now(); // Initialize the ref
        setInactivityCheckerActive(true);
    }
}, [realTestTimer, timerPaused, inactivityCheckerActive, role]);

// useEffect for the actual inactivity checking
useEffect(() => {
    if (inactivityCheckerActive) {
        console.log(`${role} - Inactivity checker is now running`);

        const inactivityInterval = setInterval(() => {
            const currentTime = Date.now();
            const timeSinceLastActivity = currentTime - lastActivityTimestampRef.current;

            console.log(`${role} - Last activity: ${Math.floor(timeSinceLastActivity / 1000)} seconds ago`);

            if (timeSinceLastActivity >= 60000) { // 60 seconds
                console.log(`${role} - Inactivity limit reached - disconnecting user`);

                const banMessage = "You have been disconnected due to inactivity. You will not receive payment for this session.";
                alert(banMessage);

                socket.emit('participant_banned', {
                    pair_id: pairId,
                    role: role
                });

                // Clear the interval before navigating
                clearInterval(inactivityInterval);
                setInactivityCheckerActive(false);

                sessionStorage.setItem('wasDisconnected', 'true');
                navigate('/disconnected', {
                    state: { message: banMessage }, replace: true
                });
            } else if (timeSinceLastActivity >= 30000 && !warningShown) { // 30 seconds
                console.log(`${role} - Warning threshold reached - showing warning`);

                const warningMessage = role === 'tester'
                    ? "⚠️ Warning: If you don't send a message in the next 30 seconds, you will be disconnected and won't receive payment."
                    : "⚠️ Warning: If you don't send a message in the next 30 seconds, you will be disconnected from the experiment.";

                alert(warningMessage);
                setWarningShown(true);

                socket.emit('participant_inactivity_warning', {
                    pair_id: pairId,
                    role: role
                });
            }
        }, 5000); // Check every 5 seconds

        return () => {
            if (inactivityCheckerActive) {
                console.log(`${role} - Cleaning up inactivity checker`);
                clearInterval(inactivityInterval);
            }
        };
    }
}, [inactivityCheckerActive, role, pairId, warningShown, navigate]);


  // Handlers to send messages on Enter key press
  const handleKeyPressExperimenter = (e) => {
    if (e.key === 'Enter') {
      sendMessageToExperimenter();
    }
  };

  const handleKeyPressBot = (e) => {
      if (e.key === 'Enter') {
          sendMessageToBot()
      }
  };
  
  const addToMessageQueue = (message) => {
      setMessageQueue((prevQueue) => [...prevQueue, message]);
  };

  const sendMessageToBot = () => {
      if (!messageToBot.trim()) return;

      console.log('User sending message to bot, resetting timestamps and counters');
      // Reset wake-up attempts and activity timestamps when user sends a message
      setWakeupAttemptsCount(0);
      lastActivityTimestampRef.current = Date.now(); // Use ref instead of state
      lastWakeupMessageTimeRef.current = Date.now();
      setWarningShown(false);
      console.log(`${role} - Activity timestamp reset - message to bot`);

      // If this is a response to a wake-up message, log it
      if (lastWakeupMessageRef.current) {
          console.log('User responding to wake-up message:', lastWakeupMessageRef.current);
      }

      const newMessage = { sender: role, content: messageToBot };
      setBotMessages((prevBotMessages) => [...prevBotMessages, newMessage]);
      addToMessageQueue(messageToBot);
      setMessageToBot('');
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
      const response = await axios.post(config.SERVER_URL + '/api/save_chat', chatData);
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

      // Stop inactivity checker when chat ends
      setInactivityCheckerActive(false);
      console.log(`${role} - Inactivity checker stopped - chat ended`);

      // Emit event to notify tester that experimenter is ready for submissions
      socket.emit('experimenter_ready', { pair_id: pairId });

      if (role === 'experimenter') {
        // Immediately emit the ready event when experimenter sees overlay
        console.log('Experimenter ready - emitting event');

        // Set a timeout for 30 seconds
      const timeoutId = setTimeout(async () => {
        try {
          const response = await axios.post(config.SERVER_URL + '/api/generate_code', {
            role: 'experimenter',
            name,
            pairId,
          });
          if (response.data.status === 'success') {
            navigate('/thank_you', {
              state: {
                bonusCode: response.data.code,
                userId,
                role: 'experimenter',
              },
            });
          }
        } catch (error) {
          console.error('Error generating code:', error);
        }
      }, 30000); // 30 seconds

      socket.on('bonus_code', (data) => {
        clearTimeout(timeoutId); // Clear the timeout if the bonus code is received
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
        clearTimeout(timeoutId); // Clear the timeout on cleanup
      };
    }
  }
}, [realTestTimer, role, pairId]);


  // Send a message to the experimenter
  const sendMessageToExperimenter = () => {
      if (!messageToExperimenter.trim()) return;

      // Reset activity timestamp and warning state
      lastActivityTimestampRef.current = Date.now(); // Use ref instead of state
      setWarningShown(false);
      console.log(`${role} - Activity timestamp reset - message to experimenter`);

      const newMessage = { sender: role, content: messageToExperimenter };
      setMessages((prevMessages) => [...prevMessages, newMessage]);

      socket.emit('message', {
        pair_id: pairId,
        sender: role,
        message: messageToExperimenter,
      });

      setMessageToExperimenter('');
  };

  // Message queue for bot messages
  useEffect(() => {
    const processQueue = () => {
        if (messageQueue.length > 0) {
            const combinedMessage = messageQueue.join(' ');
            sendMessageToBotQueue(combinedMessage);
            setMessageQueue([]);
        }
    };

    const interval = setInterval(processQueue, 5000); // Process queue every 5 seconds

    return () => clearInterval(interval);
  }, [messageQueue]);


  // Send a message to the bot
  const sendMessageToBotQueue = async (message) => {
    try {
        console.log('Bot sending message, checking for wake-up context:', {
            hasWakeupContext: !!lastWakeupMessageRef.current
        });

        const botMessages = messages.map((msg) => ({
            role: msg.sender === 'bot' ? 'assistant' : 'user',
            content: msg.content
        }));

        const botReply = await sendBotMessage(
            [...botMessages, { role: 'user', content: message }],
            currentPersona,
            false, // indicates this is not a wakeup message
            lastWakeupMessageRef.current // pass the last wake-up message for context
        );

        setBotMessages((prevBotMessages) => [
            ...prevBotMessages,
            { sender: 'bot', content: botReply }
        ]);

        // Clear the wake-up message reference after bot responds
        lastWakeupMessageRef.current = null;

        lastBotActivityTimestampRef.current = Date.now();
        console.log('Updated bot activity timestamp:', lastBotActivityTimestampRef.current);
    } catch (error) {
        console.error('Error communicating with bot:', error);
    }

    setMessageToBot('');
  };

  useEffect(() => {
    console.log('Wake-up effect triggered with conditions:', {
        inactivityCheckerActive,
        role,
        realTestTimer,
        wakeupAttemptsCount
    });

    if (!inactivityCheckerActive || role !== 'tester' || realTestTimer === 0) {
        if (wakeupIntervalRef.current) {
            console.log('Cleaning up existing wake-up interval');
            clearInterval(wakeupIntervalRef.current);
            wakeupIntervalRef.current = null;
        }
        return;
    }

    // Only create new interval if one doesn't exist
    if (!wakeupIntervalRef.current) {
        console.log('Starting wake-up interval checker');

        // Generate random delay once when starting the checker
        wakeupDelayRef.current = Math.floor(Math.random() * (45000 - 25000) + 25000);
        console.log('Set wake-up delay to:', wakeupDelayRef.current / 1000, 'seconds');


        wakeupIntervalRef.current = setInterval(() => {
            console.log('Checking bot wakeup...', {
                timeSinceLastActivity: Math.floor((Date.now() - lastActivityTimestampRef.current) / 1000),
                timeSinceLastBotActivity: Math.floor((Date.now() - lastBotActivityTimestampRef.current) / 1000),
                timeSinceLastWakeup: Math.floor((Date.now() - lastWakeupMessageTimeRef.current) / 1000),
                wakeupAttemptsCount,
                wakeupDelay: wakeupDelayRef.current / 1000
            });

            const currentTime = Date.now();
            const timeSinceLastActivity = currentTime - lastActivityTimestampRef.current;
            const timeSinceLastBotActivity = currentTime - lastBotActivityTimestampRef.current;
            const timeSinceLastWakeup = currentTime - lastWakeupMessageTimeRef.current;

            console.log('Checking conditions:', {
                isInactiveEnough: timeSinceLastActivity >= wakeupDelayRef.current,
                isBotQuietEnough: timeSinceLastBotActivity >= 20000,
                isWakeupCooldownOver: timeSinceLastWakeup >= wakeupDelayRef.current,
                underMaxAttempts: wakeupAttemptsCount < MAX_WAKEUP_ATTEMPTS
            });

            if (timeSinceLastActivity >= wakeupDelayRef.current &&
                timeSinceLastBotActivity >= 20000 &&
                timeSinceLastWakeup >= wakeupDelayRef.current &&
                wakeupAttemptsCount < MAX_WAKEUP_ATTEMPTS) {
                console.log('Conditions met - Sending bot wakeup message...');
                sendBotWakeupMessage();
                lastWakeupMessageTimeRef.current = currentTime;
                // Generate new delay for next wake-up
                wakeupDelayRef.current = Math.floor(Math.random() * (45000 - 25000) + 25000);
                console.log('Set new wake-up delay to:', wakeupDelayRef.current / 1000, 'seconds');
            }
        }, 5000);
    }

    // Cleanup function
    return () => {
        if (wakeupIntervalRef.current) {
            console.log('Cleaning up wake-up interval');
            clearInterval(wakeupIntervalRef.current);
            wakeupIntervalRef.current = null;
        }
    };
}, [inactivityCheckerActive, role]);


  const sendBotWakeupMessage = async () => {
      if (wakeupAttemptsCount >= MAX_WAKEUP_ATTEMPTS) {
          return;
      }

      try {
          const botReply = await sendBotMessage(
              botMessages.map((msg) => ({
                  role: msg.sender === 'bot' ? 'assistant' : 'user',
                  content: msg.content
              })),
              currentPersona,
              true // indicates this is a wakeup message
          );

           // Store the wake-up message
          lastWakeupMessageRef.current = botReply;

          setBotMessages((prevBotMessages) => [
              ...prevBotMessages,
              { sender: 'bot', content: botReply }
          ]);

          setWakeupAttemptsCount(prev => prev + 1);
          lastBotActivityTimestampRef.current = Date.now();
      } catch (error) {
          console.error('Error sending wake-up message:', error);
      }
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
        const response = await axios.post(config.SERVER_URL + '/api/generate_code', {
            role: 'tester',
            userId,
            pairId,
            guessCandidateA,
            guessCandidateB,
            realIdentityA,
            realIdentityB
        });

        console.log("The user ID in the chat page is: ", userId);
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
                    username
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
            {inactivityCheckerActive && (
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    padding: '5px',
                    backgroundColor: warningShown ? '#ff9800' : '#4CAF50',
                    color: 'white',
                    borderRadius: '3px',
                    fontSize: '12px',
                    zIndex: 1000
                }}>
                    Inactive: {Math.floor((Date.now() - lastActivityTimestampRef.current) / 1000)}s
                </div>
            )}
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
                {inactivityCheckerActive && (
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    padding: '5px',
                    backgroundColor: warningShown ? '#ff9800' : '#4CAF50',
                    color: 'white',
                    borderRadius: '3px',
                    fontSize: '12px',
                    zIndex: 1000
                }}>
                    Inactive: {Math.floor((Date.now() - lastActivityTimestampRef.current) / 1000)}s
                </div>
            )}
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