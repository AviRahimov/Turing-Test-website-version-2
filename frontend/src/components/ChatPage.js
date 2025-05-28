import React, {useEffect, useRef, useState} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import usePreventBackNavigation from './usePreventBackNavigation';
import io from 'socket.io-client';
import './ChatPage.css';
import config from './config.js';
import axios from 'axios';
import personas from '../data/personas.json';
import {getRandomPersona} from '../utils/chatUtils';
import {sendBotMessage} from '../utils/botService';

let server_url = config.SERVER_URL;
const socket = io(config.SERVER_URL)

// Define fixed bot demographics globally or as a const within ChatPage
const FIXED_BOT_DEMOGRAPHICS = {
    name: 'Alex',
    gender: 'Male',
    age: 19,
    occupation: 'Student',
    country: 'USA',
    aiExperience: 'Low',
    source: 'fixed-bot-profile' // Identifier
};

function ChatPage() {
    usePreventBackNavigation();
    const location = useLocation();
    const navigate = useNavigate();
    const {pairId, role, userId, username} = location.state || {};
    // Always use the string username as userId for backend calls
    const experimenterId = username;

    const [currentPersona, setCurrentPersona] = useState(null);
    const [messageQueue, setMessageQueue] = useState([]); // Queue for tester messages
    const messageQueueEnabled = config.ENABLE_MESSAGE_QUEUE;    const [messages, setMessages] = useState([]); // Chat with experimenter
    const [botMessages, setBotMessages] = useState([]); // Chat with bot
    const [messageToExperimenter, setMessageToExperimenter] = useState('');
    const [messageToBot, setMessageToBot] = useState('');
    const [shuffling, setShuffling] = useState(false);    const [finalRoomConfig, setFinalRoomConfig] = useState({
        leftRoom: {
            candidate: 'A',
            role: 'experimenter' // Default: experimenter is in left room (Candidate A)
        },
        rightRoom: {
            candidate: 'B',
            role: 'bot' // Default: bot is in right room (Candidate B)
        },
    });
    const [roomOrder, setRoomOrder] = useState(['experimenter', 'bot']);
    const [guessCandidateA, setGuessCandidateA] = useState('');
    const [guessCandidateB, setGuessCandidateB] = useState('');
    const [realIdentityA, setRealIdentityA] = useState('');
    const [realIdentityB, setRealIdentityB] = useState('');
    const [experimenterBonus, setExperimenterBonus] = useState(() => {
        // Try to load from localStorage in case of reload
        return localStorage.getItem('experimenterBonus') || '';
    });
    const [showBonusNotification, setShowBonusNotification] = useState(false);
    const [experimenterReady, setExperimenterReady] = useState(false);
    const [showOverlay, setShowOverlay] = useState(false); // Manage overlay visibility
    const [showNotificationForExperimenter, setShowNotificationForExperimenter] = useState(role === 'experimenter');
    const [showNotificationForTester, setShowNotificationForTester] = useState(role === 'tester');
    const [testerDismissed, setTesterDismissed] = useState(false);
    const [experimenterDismissed, setExperimenterDismissed] = useState(false);    const [timerPaused, setTimerPaused] = useState(true); // Start with timer paused
    const [isAnonymousMode, setIsAnonymousMode] = useState(false);
    const [shuffleEnabled] = useState(config.SHUFFLE_ENABLED);

    // Track the last message time for the ban mechanism
    const lastActivityTimestampRef = useRef(Date.now());
    const [warningShown, setWarningShown] = useState(false);
    const [inactivityCheckerActive, setInactivityCheckerActive] = useState(false);

    const [wakeupAttemptsCount, setWakeupAttemptsCount] = useState(0);
    const lastBotActivityTimestampRef = useRef(Date.now());
    const wakeupIntervalRef = useRef(null);
    const wakeupDelayRef = useRef(null);
    const lastWakeupMessageTimeRef = useRef(Date.now());
    const lastWakeupMessageRef = useRef(null);
    const botWakeupEnabled = config.ENABLE_BOT_WAKEUP;
    const MAX_WAKEUP_ATTEMPTS = 2; // Maximum number of wake-up messages

    const [partnerQuizStatus, setPartnerQuizStatus] = useState(null); // 'completed', 'failed', or null
    const [quizStep, setQuizStep] = useState('instructions'); // 'instructions', 'quiz', 'completed'
    const [quizAnswers, setQuizAnswers] = useState(Array(2).fill(null));
    const [showQuizConfirmation, setShowQuizConfirmation] = useState(false);
    const [chatTimerStarted, setChatTimerStarted] = useState(false);
    const [partnerHasFailed, setPartnerHasFailed] = useState(false);

    // Timer-related state
    const [currentPhase, setCurrentPhase] = useState('waiting'); // 'waiting', 'known_identity', 'shuffle'
    const [timeRemaining, setTimeRemaining] = useState(0);
    const [totalPhaseTime, setTotalPhaseTime] = useState(0);
    const [timerVisible, setTimerVisible] = useState(false);
    const timerIntervalRef = useRef(null);

    // state for the instructions modal
    const [showInstructions, setShowInstructions] = useState(false);

    const chatMessagesRef = useRef(null);  // Ref for scrolling to bottom of chat
    const botChatMessagesRef = useRef(null);  // Ref for scrolling to bottom of bot chat

    const {partner_username} = location.state || {}; // Get partner's string username

    const [humanParticipantDemographics, setHumanParticipantDemographics] = useState(null);
    const [isLoadingHumanDemographics, setIsLoadingHumanDemographics] = useState(false);

    // This state will hold what the bot *displays* post-shuffle (which is the human's demographics)
    const [botDisplayedDemographicsPostShuffle, setBotDisplayedDemographicsPostShuffle] = useState(null);    // At the top of ChatPage component
    const [capturedPreShuffleTesterResponderChat, setCapturedPreShuffleTesterResponderChat] = useState([]);
    const [capturedPreShuffleTesterBotChat, setCapturedPreShuffleTesterBotChat] = useState([]);    // Refs to track real-time conversation history for reliable shuffle capture
    const messagesRef = useRef([]);
    const botMessagesRef = useRef([]);
    const socketSetupRef = useRef(false); // Prevent duplicate socket setup
    const fallbackShuffleTimeoutRef = useRef(null);
    
    // CRITICAL FIX: Use refs to capture current guess values for socket event handlers
    const guessCandidateARef = useRef('');
    const guessCandidateBRef = useRef('');
    const realIdentityARef = useRef('');
    const realIdentityBRef = useRef('');

    // Fetch Human Participant's Demographics
    useEffect(() => {
        const fetchHumanDems = async (usernameToFetch) => {
            if (!usernameToFetch) return;
            setIsLoadingHumanDemographics(true);
            try {
                const response = await fetch(`${config.SERVER_URL}/api/get_demographics/${usernameToFetch}`);
                if (!response.ok) throw new Error(`Failed to fetch demographics: ${response.status}`);
                const data = await response.json();
                if (data.error) throw new Error(data.error);
                setHumanParticipantDemographics(data);
            } catch (error) {
                console.error("Error fetching human demographics:", error.message);
                setHumanParticipantDemographics({error: 'Could not load data'});
            } finally {
                setIsLoadingHumanDemographics(false);
            }
        };

        // Determine whose demographics to fetch for the "human" side
        if (role === 'tester' && partner_username) {
            fetchHumanDems(partner_username); // Tester sees experimenter's demographics
        } else if (role === 'experimenter' && username) {
            fetchHumanDems(username); // Experimenter sees their own demographics
        }
    }, [role, username, partner_username]);

    // Helper to render demographics display
    const DemographicsDisplayComponent = ({demData, isLoading, titlePrefix = ""}) => {
        if (isLoading) {
            return <div className="demographics-info"><p>Loading demographics...</p></div>;
        }
        if (!demData || demData.error) {
            return <div className="demographics-info"><p>{titlePrefix} Demographics not available.</p></div>;
        }
        return (
            <div className="demographics-info">
                {titlePrefix && <h4>{titlePrefix}</h4>}
                {demData.gender && <p><span>Gender:</span> {demData.gender}</p>}
                {demData.age && <p><span>Age:</span> {demData.age}</p>}
                {demData.occupation && <p><span>Occupation:</span> {demData.occupation}</p>}
                {demData.country && <p><span>Country:</span> {demData.country}</p>}
                {demData.aiExperience && <p><span>AI Exp:</span> {demData.aiExperience}</p>}
            </div>
        );
    };    // useEffect for handling the start of inactivity checking
    useEffect(() => {
        // Start the inactivity checker when chat timer has started and not paused
        if (chatTimerStarted && !timerPaused && !inactivityCheckerActive) {
            // // console.log(`${role} - Starting inactivity monitoring system`);
            lastActivityTimestampRef.current = Date.now(); // Initialize the ref
            setInactivityCheckerActive(true);
        }
    }, [chatTimerStarted, timerPaused, inactivityCheckerActive, role]);

// useEffect for the actual inactivity checking
    useEffect(() => {
        if (inactivityCheckerActive) {
            // // console.log(`${role} - Inactivity checker is now running`);

            const inactivityInterval = setInterval(() => {
                const currentTime = Date.now();
                const timeSinceLastActivity = currentTime - lastActivityTimestampRef.current;

                // // console.log(`${role} - Last activity: ${Math.floor(timeSinceLastActivity / 1000)} seconds ago`);

                if (timeSinceLastActivity >= 120000) { // 120 seconds
                    // // console.log(`${role} - Inactivity limit reached - disconnecting user`);

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
                        state: {message: banMessage}, replace: true
                    });
                } else if (timeSinceLastActivity >= 60000 && !warningShown) { // 60 seconds
                    // // console.log(`${role} - Warning threshold reached - showing warning`);

                    const warningMessage = role === 'tester'
                        ? "⚠️ Warning: If you don't send a message soon, you will be disconnected and won't receive payment."
                        : "⚠️ Warning: If you don't send a message soon, you will be disconnected from the experiment, and won't receive payment.";

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
    };    const sendMessageToBot = () => {
        if (!messageToBot.trim()) return;

        // // console.log('User sending message to bot, resetting timestamps and counters');
        // Reset wake-up attempts and activity timestamps when user sends a message
        setWakeupAttemptsCount(0);
        lastActivityTimestampRef.current = Date.now(); // Use ref instead of state
        lastWakeupMessageTimeRef.current = Date.now();
        setWarningShown(false);
        // // console.log(`${role} - Activity timestamp reset - message to bot`);

        // If this is a response to a wake-up message, log it
        if (lastWakeupMessageRef.current) {
            // // console.log('User responding to wake-up message:', lastWakeupMessageRef.current);
        }

        const newMessage = {sender: role, content: messageToBot};
        
        // DEBUG: Track bot message additions
        // // console.log("🤖 ADDING MESSAGE TO BOT:", newMessage);
        // console.log("🤖 Current botMessages length before add:", botMessages.length);
          setBotMessages((prevBotMessages) => {
            const updatedBotMessages = [...prevBotMessages, newMessage];
            // console.log("🤖 Updated botMessages length after add:", updatedBotMessages.length);
            // console.log("🤖 Full botMessages array:", updatedBotMessages.map(msg => `${msg.sender}: ${msg.content}`));
            
            // SYNC WITH REF for reliable shuffle capture
            botMessagesRef.current = updatedBotMessages;
            // console.log("🤖 SYNCED botMessagesRef length:", botMessagesRef.current.length);
            
            return updatedBotMessages;
        });

        // If message queue is disabled, send directly to bot. Otherwise, add to queue
        if (!messageQueueEnabled) {
            sendMessageToBotQueue(messageToBot);
        } else {
            addToMessageQueue(messageToBot);
        }

        setMessageToBot('');
    };
    // Helper to save chat logs
    const saveChatLogs = async (title) => {
        const chatData = {
            pairId,
            title,
            testerChatWithExperimenter: messagesRef.current,
            testerChatWithBot: botMessagesRef.current,        };

        try {
            const response = await axios.post(server_url + '/api/save_chat', chatData);
        } catch (error) {
            console.error('Error saving chat logs:', error);
        }
    };    
    // Timer countdown functions
    const startCountdown = () => {
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
        }
        
        timerIntervalRef.current = setInterval(() => {
            setTimeRemaining((prev) => {
                if (prev <= 1) {
                    stopCountdown();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const stopCountdown = () => {
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
    };

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            stopCountdown();
        };
    }, []);

    // Format time display (mm:ss)
    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    // Calculate timer progress percentage
    const getTimerProgress = () => {
        if (totalPhaseTime === 0) return 0;
        return ((totalPhaseTime - timeRemaining) / totalPhaseTime) * 100;
    };

    // Get phase display name
    const getPhaseDisplayName = () => {
        switch (currentPhase) {
            case 'known_identity':
                return 'Known Identity Phase';
            case 'shuffle':
                return 'Shuffle Phase';
            default:
                return 'Waiting...';
        }
    };    // Get timer color based on remaining time
    const getTimerColor = () => {
        const percentage = (timeRemaining / totalPhaseTime) * 100;
        if (percentage > 50) return '#4caf50'; // Green
        if (percentage > 25) return '#ff9800'; // Orange
        return '#f44336'; // Red
    };

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
    };    // Function to handle shuffle logic for tester role (called from socket event)
    const performShuffleForTester = () => {
        // console.log("🎯 PERFORM_SHUFFLE_FOR_TESTER FUNCTION CALLED!");
        // console.log("🎯 Function is executing - this confirms the function was found and called");
        // console.log("SHUFFLE INITIATED for Tester: Backend triggered shuffle.");
        
        // DEBUG: Check state and ref values
        // console.log("Current messages state length:", messages.length);
        // console.log("Current botMessages state length:", botMessages.length);
        // console.log("Current messages content:", messages.map(msg => `${msg.sender}: ${msg.content}`));
        // console.log("Current botMessages content:", botMessages.map(msg => `${msg.sender}: ${msg.content}`));
        
        // CRITICAL FIX: Use refs instead of state for reliable capture
        // console.log("🔍 CHECKING REFS:");
        // console.log("messagesRef.current length:", messagesRef.current.length);
        // console.log("botMessagesRef.current length:", botMessagesRef.current.length);
        // console.log("messagesRef.current content:", messagesRef.current.map(msg => `${msg.sender}: ${msg.content}`));
        // console.log("botMessagesRef.current content:", botMessagesRef.current.map(msg => `${msg.sender}: ${msg.content}`));
        
        setShuffling(true); // For visual shuffle effect        // --- CAPTURE HISTORIES BEFORE SHUFFLE ---
        // 1. Capture the Tester <-> Human Responder chat history (from messagesRef - real-time data)
        // This is the history the bot will take over.
        const testerResponderChatSnapshot = [...messagesRef.current]; // USE REF instead of state
        setCapturedPreShuffleTesterResponderChat(testerResponderChatSnapshot);
        // console.log("✅ CAPTURED Tester-Responder chat snapshot length:", testerResponderChatSnapshot.length);
        // console.log("✅ CAPTURED Tester-Responder chat content:", testerResponderChatSnapshot.map(msg => `${msg.sender}: ${msg.content}`));

        // 2. Capture the original Tester <-> Bot (Alex) chat history (from botMessagesRef - real-time data)
        // This is for the "confusion test" context.
        const originalTesterBotChatSnapshot = [...botMessagesRef.current]; // USE REF instead of state       
        setCapturedPreShuffleTesterBotChat(originalTesterBotChatSnapshot);        
        // console.log("✅ CAPTURED original Tester-Bot chat snapshot length:", originalTesterBotChatSnapshot.length);
        // console.log("✅ CAPTURED original Tester-Bot chat content:", originalTesterBotChatSnapshot.map(msg => `${msg.sender}: ${msg.content}`));
        
        // VALIDATE CAPTURED DATA
        if (testerResponderChatSnapshot.length === 0 && originalTesterBotChatSnapshot.length === 0) {
            console.error("❌ CRITICAL: BOTH chat histories are empty! This should not happen if users have been chatting.");
            console.error("❌ This suggests the shuffle is being triggered too early or there's a state management issue.");
        }
        // --- END CAPTURE ---

        setTimeout(() => {
            // console.log("🔄 SHUFFLE EXECUTION for Tester: Applying post-shuffle states.");
            setupAnonymousRooms();
            saveChatLogs('Before Turing Test: '); // Log before state changes fully apply to UI            
            
            // 3. CRITICAL: Both candidate A and candidate B should display the same pre-shuffle tester-experimenter chat history
            // ONLY use the tester-experimenter chat history, never bot messages
            
            // ALWAYS use the captured history, even if it appears empty (to debug the real issue)
            // console.log("🔄 Setting both chat windows to captured tester-experimenter history...");
            // console.log("🔄 Using captured history with length:", testerResponderChatSnapshot.length);
            setMessages([...testerResponderChatSnapshot]); // Experimenter window (Candidate A or B)
            setBotMessages([...testerResponderChatSnapshot]); // Bot window (Candidate A or B) - same history
            
            // SYNC WITH REFS immediately after setting state
            messagesRef.current = [...testerResponderChatSnapshot];
            botMessagesRef.current = [...testerResponderChatSnapshot];
            // console.log("🔄 SYNCED both refs with tester-experimenter history, length:", testerResponderChatSnapshot.length);
            
            if (testerResponderChatSnapshot.length === 0) {
                console.warn("⚠️ WARNING: Applied empty chat history. This indicates a problem with timing or state capture.");
                console.warn("⚠️ The shuffle may be occurring before participants have had a chance to chat.");
            } else {
                // console.log("✅ SUCCESS: Both chat windows populated with actual tester-experimenter conversation history.");
                // console.log("✅ Shared chat history content:", testerResponderChatSnapshot.map(msg => `${msg.sender}: ${msg.content}`));
            }            // 4. Bot "adopts" human's demographics for display and conversational context
            // console.log("🔄 DEMOGRAPHICS ADOPTION DEBUG:");
            // console.log("🔄 humanParticipantDemographics:", humanParticipantDemographics);
            // console.log("🔄 humanParticipantDemographics.error:", humanParticipantDemographics?.error);
            // console.log("🔄 FIXED_BOT_DEMOGRAPHICS:", FIXED_BOT_DEMOGRAPHICS);
            
            if (humanParticipantDemographics && !humanParticipantDemographics.error) {
                const humanDemographicsForBot = {
                    ...humanParticipantDemographics,
                    source: 'adopted-human-post-shuffle'
                };
                setBotDisplayedDemographicsPostShuffle(humanDemographicsForBot);
                // console.log("🔄 ✅ Bot displayed demographics set to human participant's:", humanDemographicsForBot);
            } else {
                console.warn("🔄 ❌ Human demographics not available for bot to adopt post-shuffle. Using fallback.");
                console.warn("🔄 ❌ humanParticipantDemographics:", humanParticipantDemographics);
                setBotDisplayedDemographicsPostShuffle(FIXED_BOT_DEMOGRAPHICS);
                // console.log("🔄 ❌ Using FIXED_BOT_DEMOGRAPHICS as fallback:", FIXED_BOT_DEMOGRAPHICS);
            }            // 5. Switch to anonymous mode
            setIsAnonymousMode(true);
            setShuffling(false); // End visual shuffle effect
            // console.log("Tester shuffle process complete. Anonymous mode active.");
        }, 3000); // Shuffle animation duration
    };

    // Socket connection setup with duplicate prevention
    useEffect(() => {
        // console.log('🔗 Socket useEffect triggered with:', {role, pairId, shuffleEnabled});
        // console.log('🔗 Setting up socket connection for role:', role, 'pairId:', pairId);
        // console.log('🔗 Socket object:', socket);
        // console.log('🔗 Socket connected?', socket?.connected);
        // console.log('🔗 Current socketSetupRef value:', socketSetupRef.current);
        
        // Prevent duplicate socket setup
        if (socketSetupRef.current) {
            // console.log('🔗 Socket setup already completed, skipping duplicate execution');
            return () => {
                // console.log('🔗 Skipped setup - no cleanup needed');
            };
        }
        
        // Mark socket setup as completed to prevent duplicates
        socketSetupRef.current = true;
        // console.log('🔗 Setting socketSetupRef to true to prevent duplicates');
          // Only remove specific listeners that we're about to re-add to prevent conflicts
        // CRITICAL: Do NOT remove shuffle_started listener as it's a one-time event that must persist
        // console.log('🔗 Removing specific event listeners to prevent duplicates...');
        const eventsToRemove = ['message', 'timer_started', 'chat_ended', 'bonus_code', 'guess_submitted', 'experimenter_ready', 'notification_dismissed'];
        eventsToRemove.forEach(event => {
            socket.removeAllListeners(event);
            // console.log(`🔗 Removed all listeners for event: ${event}`);
        });
        
        // Special handling for shuffle_started: only remove if we haven't set up the ref flag
        if (!socketSetupRef.current) {
            // console.log('🔗 First time setup - removing any existing shuffle_started listeners');
            socket.removeAllListeners('shuffle_started');
        } else {
            // console.log('🔗 Preserving existing shuffle_started listener to prevent missing the event');
        }
        
        // Add connection status listeners
        socket.on('connect', () => {
            // console.log('🔗 Socket CONNECTED successfully');
        });
        
        socket.on('disconnect', () => {
            // console.log('🔗 Socket DISCONNECTED');
        });
          // Add a generic event listener to catch all events
        socket.onAny((eventName, ...args) => {
            // console.log('📥 RECEIVED ANY EVENT:', eventName, args);
        });
        
        socket.emit('join', {pair_id: pairId, role: role});
        // console.log('🔗 Emitted join event with:', {pair_id: pairId, role: role});

        // If shuffle is disabled, set up rooms immediately
        if (!shuffleEnabled) {
            // console.log('🔗 Shuffle disabled, setting up anonymous rooms immediately');
            // Skip timer and go straight to anonymous setup
            setIsAnonymousMode(true);
            setupAnonymousRooms();
        } else {
            // console.log('🔗 Shuffle enabled, waiting for shuffle_started event');
        }

        if (role === 'tester') {
            socket.on('experimenter_ready', (data) => {
                // // console.log('Received experimenter_ready event', data);
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
            const newMessage = {sender: data.sender, content: data.message};
            
            // DEBUG: Track incoming messages
            // console.log("≡ƒô¿ RECEIVED MESSAGE via socket:", newMessage);
            // console.log("≡ƒô¿ Current role:", role);

            // Avoid duplication in messages for experimenter or tester
            if (data.sender !== 'bot') {
                // console.log("≡ƒô¿ Adding to messages array (experimenter chat)");
                // console.log("≡ƒô¿ Current messages length before add:", messages.length);
                setMessages((prevMessages) => {
                    if (prevMessages.find((msg) => msg.content === newMessage.content && msg.sender === newMessage.sender)) {
                        // console.log("≡ƒô¿ DUPLICATE detected, ignoring message");
                        return prevMessages; // Ignore duplicates
                    }
                    const updatedMessages = [...prevMessages, newMessage];
                    // console.log("≡ƒô¿ Updated messages length after add:", updatedMessages.length);
                    // console.log("≡ƒô¿ Full messages array:", updatedMessages.map(msg => `${msg.sender}: ${msg.content}`));
                    
                    // SYNC WITH REF for reliable shuffle capture
                    messagesRef.current = updatedMessages;
                    // console.log("≡ƒô¿ SYNCED messagesRef from socket, length:", messagesRef.current.length);
                    
                    return updatedMessages;
                });
            }

            // Avoid duplication in botMessages for bot-related messages
            if (data.sender === 'bot' && role === 'tester') {
                // console.log("≡ƒô¿ Adding to botMessages array (bot chat)");
                setBotMessages((prevBotMessages) => {
                    if (prevBotMessages.find((msg) => msg.content === newMessage.content)) {
                        // console.log("≡ƒô¿ DUPLICATE bot message detected, ignoring");
                        return prevBotMessages; // Ignore duplicates
                    }
                    const updatedBotMessages = [...prevBotMessages, newMessage];
                    // console.log("≡ƒô¿ Updated botMessages length after add:", updatedBotMessages.length);
                    
                    // SYNC WITH REF for reliable shuffle capture
                    botMessagesRef.current = updatedBotMessages;
                    // console.log("≡ƒô¿ SYNCED botMessagesRef from socket, length:", botMessagesRef.current.length);
                    
                    return updatedBotMessages;
                });
            }
        });        // Listen for timer events from backend
        socket.on('timer_started', (data) => {
            // console.log('🕐 Timer started event received:', data);
            // console.log('🕐 Using PRE_SHUFFLE_TIMER from config:', config.PRE_SHUFFLE_TIMER);
            setTimerPaused(false);
            setChatTimerStarted(true);
            setCurrentPhase('known_identity');
            setTotalPhaseTime(config.PRE_SHUFFLE_TIMER);
            setTimeRemaining(config.PRE_SHUFFLE_TIMER);
            setTimerVisible(true);
            startCountdown();
            // Schedule fallback shuffle in case server event not received
            if (data.shuffle_duration) {
                fallbackShuffleTimeoutRef.current = setTimeout(() => {
                    console.warn('Fallback shuffle triggered after timeout');
                    if (role === 'tester') {
                        performShuffleForTester();
                    } else {
                        setIsAnonymousMode(true);
                    }
                }, data.shuffle_duration * 1000);
            }
        });
          // CRITICAL: Set up shuffle_started listener
        // console.log('🚀 REGISTERING shuffle_started event listener');        
        socket.on('shuffle_started', (data) => {
            // console.log('🚀 SHUFFLE_STARTED EVENT RECEIVED!', data);
            // Clear fallback shuffle timeout
            clearTimeout(fallbackShuffleTimeoutRef.current);
            // console.log('🚀 Current role:', role);
            // console.log('🚀 Event data:', JSON.stringify(data, null, 2));
            // console.log('🚀 performShuffleForTester function available?', typeof performShuffleForTester);
            
            // Dismiss any active notifications when shuffle starts
            setShowNotificationForTester(false);
            setShowNotificationForExperimenter(false);
            
            // Start post-shuffle timer for anonymous phase
            // console.log('🕐 Starting post-shuffle timer with POST_SHUFFLE_TIMER:', config.POST_SHUFFLE_TIMER);
            setCurrentPhase('shuffle');
            setTotalPhaseTime(config.POST_SHUFFLE_TIMER);
            setTimeRemaining(config.POST_SHUFFLE_TIMER);
            setTimerVisible(true);
            startCountdown();
            
            // Trigger shuffle logic for both roles
            if (role === 'tester') {
                // console.log('🚀 ROLE IS TESTER - Calling performShuffleForTester()');
                try {
                    // Trigger shuffle logic directly
                    performShuffleForTester();
                    // console.log('🚀 performShuffleForTester() completed successfully');
                } catch (error) {
                    console.error('🚀 ERROR in performShuffleForTester():', error);
                }
            } else if (role === 'experimenter') {
                // console.log('🚀 ROLE IS EXPERIMENTER - Entering anonymous mode');
                try {                    // For experimenter, just enter anonymous mode
                    // console.log("SHUFFLE SYNC for Experimenter: Shuffle started by backend.");
                    setIsAnonymousMode(true); // Experimenter enters anonymous mode
                    // console.log("Experimenter shuffle process complete. Anonymous mode active.");
                } catch (error) {
                    console.error('🚀 ERROR in experimenter shuffle logic:', error);
                }
            } else {
                // console.log('🚀 UNKNOWN ROLE:', role);
            }
        });
          // console.log('🚀 shuffle_started listener registered successfully');
        
        // BACKUP: Also listen for broadcast version in case room-targeted event fails
        socket.on('shuffle_started_broadcast', (data) => {
            // console.log('🚀 SHUFFLE_STARTED_BROADCAST EVENT RECEIVED!', data);
            if (data.pair_id === pairId) {
                // console.log('🚀 Broadcast event matches our pairId, processing...');
                
                // Dismiss any active notifications when shuffle starts
                setShowNotificationForTester(false);
                setShowNotificationForExperimenter(false);
                
                // Start post-shuffle timer for anonymous phase
                // console.log('🕐 Starting post-shuffle timer with POST_SHUFFLE_TIMER:', config.POST_SHUFFLE_TIMER);
                setCurrentPhase('shuffle');
                setTotalPhaseTime(config.POST_SHUFFLE_TIMER);
                setTimeRemaining(config.POST_SHUFFLE_TIMER);
                setTimerVisible(true);
                startCountdown();
                
                // Trigger same shuffle logic as regular event
                if (role === 'tester') {
                    // console.log('🚀 BROADCAST - ROLE IS TESTER - Calling performShuffleForTester()');
                    try {
                        performShuffleForTester();
                        // console.log('🚀 BROADCAST - performShuffleForTester() completed successfully');
                    } catch (error) {
                        console.error('🚀 BROADCAST - ERROR in performShuffleForTester():', error);
                    }
                } else if (role === 'experimenter') {
                    // console.log('🚀 BROADCAST - ROLE IS EXPERIMENTER - Entering anonymous mode');
                    try {
                        setIsAnonymousMode(true);
                        // console.log("BROADCAST - Experimenter shuffle process complete. Anonymous mode active.");
                    } catch (error) {
                        console.error('🚀 BROADCAST - ERROR in experimenter shuffle logic:', error);
                    }
                }
            } else {
                // console.log('🚀 Broadcast event for different pair, ignoring:', data.pair_id);
            }
        });
        // console.log('🚀 shuffle_started_broadcast listener registered successfully');
        
        socket.on('chat_ended', (data) => {
            // console.log('Chat ended event received:', data);
            // Backend says chat is over, show overlay
            setShowOverlay(true);
            setInactivityCheckerActive(false); // Stop inactivity checking
            // Both participants are ready for guessing phase since backend timer manages both simultaneously
            setExperimenterReady(true);
            saveChatLogs('During Turing Test');
        });
        
        socket.on('bonus_code', (data) => {
            // console.log('Bonus code received:', data);
            // Process bonus code for both roles when role is "both", or for specific role
            if (data.role === 'both' || (data.role === 'experimenter' && role === 'experimenter')) {
                const bonusCode = data.bonus;
                setExperimenterBonus(bonusCode);
                localStorage.setItem('experimenterBonus', bonusCode);
                
                if (role === 'experimenter') {
                    setShowBonusNotification(true);
                    
                    // Navigate to thank you page after a short delay to let the user see the bonus code
                    setTimeout(() => {
                        navigate('/thank_you', {
                            state: {
                                bonusCode: bonusCode,
                                role: role,
                                pairId: pairId
                            }
                        });
                    }, 500); // 500ms delay
                }
                // For tester, just store the code - navigation will happen on guess_submitted
            }
        });        socket.on('guess_submitted', (data) => {
            // console.log('Guess submission confirmed:', data);
            // Only process if this is for the tester role and we are a tester
            if (data.role === 'tester' && role === 'tester') {
                // Get the bonus code from localStorage or from the data
                const bonusCode = localStorage.getItem('experimenterBonus') || data.bonus_code || experimenterBonus;
                
                // CRITICAL FIX: Use ref values instead of stale closure values
                const currentGuessCandidateA = guessCandidateARef.current;
                const currentGuessCandidateB = guessCandidateBRef.current;
                const currentRealIdentityA = realIdentityARef.current;
                const currentRealIdentityB = realIdentityBRef.current;
                
                // console.log('🔍 NAVIGATION DEBUG - About to navigate to feedback with:', {
                //     realIdentityA: currentRealIdentityA,
                //     realIdentityB: currentRealIdentityB,
                //     guessCandidateA: currentGuessCandidateA,
                //     guessCandidateB: currentGuessCandidateB,
                //     code: bonusCode,
                //     role: role,
                //     pairId: pairId,
                //     userId: userId,
                //     username: username,
                //     socketData: data
                // });
                
                // Check for empty values before navigation
                if (!currentGuessCandidateA || !currentGuessCandidateB) {
                    console.error('❌ NAVIGATION ERROR - Empty guess values detected before navigation!', {
                        guessCandidateA: currentGuessCandidateA,
                        guessCandidateB: currentGuessCandidateB,
                        realIdentityA: currentRealIdentityA,
                        realIdentityB: currentRealIdentityB
                    });
                }                // Navigate to feedback page after user acknowledges the alert
                setTimeout(() => {
                    navigate('/feedback', {
                        state: {
                            realIdentityA: currentRealIdentityA,
                            realIdentityB: currentRealIdentityB,
                            guessCandidateA: currentGuessCandidateA,
                            guessCandidateB: currentGuessCandidateB,
                            code: bonusCode,
                            role: role,
                            pairId: pairId,
                            userId: userId,
                            username: username
                        }
                    });
                    // console.log('✅ NAVIGATION DEBUG - Navigation to feedback completed');
                }, 500); // Short delay to ensure alert is dismissed
            }
        });
        
        // All critical listeners have been registered successfully
        // console.log('🔗 All socket event listeners registered successfully');

        // Only return cleanup function if this was the actual setup execution
        return () => {
            // console.log('🔗 Cleanup function called for actual socket setup');
            // console.log('🔗 Cleaning up socket listeners...');
            
            // DO NOT reset the setup flag here to prevent duplicate executions
            // Only reset it when component truly unmounts
            // socketSetupRef.current = false; // REMOVED THIS LINE
            
            socket.off('message');
            socket.off('notification_dismissed');
            socket.off('timer_started');
            // socket.off('shuffle_started'); // PRESERVE SHUFFLE LISTENER - DO NOT REMOVE
            // socket.off('shuffle_started_broadcast'); // PRESERVE BROADCAST LISTENER - DO NOT REMOVE
            socket.off('chat_ended');
            socket.off('bonus_code');
            socket.off('guess_submitted');
            
            if (role === 'tester') {
                socket.off('experimenter_ready');
            }
            // console.log('🔗 Socket cleanup completed (shuffle_started listener preserved)');
        };
    }, []); // CRITICAL FIX: Empty dependencies - socket setup should only run once!


    // Partner disconnection listener
    useEffect(() => {
        // console.log('🔥 Setting up partner_disconnected listener');
        
        const handlePartnerDisconnected = (data) => {
            // console.log('🔥 PARTNER DISCONNECTED EVENT RECEIVED:', data);
            // console.log('🔥 Event data details:', JSON.stringify(data, null, 2));
            
            // Stop any active timers or intervals
            setInactivityCheckerActive(false);
            setChatTimerStarted(false);
            setTimerPaused(true);
            
            // Show disconnect message to user
            alert(data.message || 'Your partner has disconnected. You will be redirected to the completion page.');
            
            // Clear session storage to prevent redirect loop
            sessionStorage.removeItem('wasDisconnected');
            
            // Navigate to thank you page with 6-digit code
            if (data.redirect_to_thank_you && data.bonus_code) {
                // console.log('🔥 Redirecting to ThankYou page with code:', data.bonus_code);
                navigate('/thank_you', {
                    replace: true,
                    state: { 
                        bonusCode: data.bonus_code,
                        role: role,
                        name: username,
                        user_id: username,
                        message: 'Your partner disconnected, but you completed the experiment.',
                        canParticipateAgain: false
                    }
                });
            } else {
                // console.log('🔥 Redirecting to HomePage - no valid completion data');
                navigate('/', { 
                    replace: true,
                    state: { 
                        message: 'Your partner disconnected. You can join the queue again.',
                        canRejoin: true 
                    }
                });
            }
        };

        if (socket) {
            socket.on('partner_disconnected', handlePartnerDisconnected);
        }

        return () => {
            if (socket) {
                socket.off('partner_disconnected', handlePartnerDisconnected);
            }
        };        }, []); // Empty dependency array

    // Component unmount cleanup - reset socket setup ref
    useEffect(() => {
        return () => {
            // console.log('🔗 Component unmounting - resetting socketSetupRef');
            socketSetupRef.current = false;
        };
    }, []); // Empty dependency array, only runs on unmount

    // handle dismissal status
    useEffect(() => {
        if (testerDismissed && experimenterDismissed) {
            setTimerPaused(false);
            // // console.log('Both participants dismissed notifications, timer starting');
        }
    }, [testerDismissed, experimenterDismissed]);

    const handleDismissNotification = () => {
        if (role === 'tester') {
            setShowNotificationForTester(false);
            socket.emit('notification_dismissed', {pair_id: pairId, role: 'tester'});
            setTesterDismissed(true);
        } else if (role === 'experimenter') {
            setShowNotificationForExperimenter(false);
            socket.emit('notification_dismissed', {pair_id: pairId, role: 'experimenter'});
            setExperimenterDismissed(true);
        }
    };

    useEffect(() => {
        if (quizStep === 'completed' && partnerQuizStatus === 'completed' &&
            testerDismissed && experimenterDismissed) {
            setTimerPaused(false);
            setChatTimerStarted(true);
            // // console.log('Both participants completed quiz and dismissed notifications, starting timer');
        }
    }, [quizStep, partnerQuizStatus, testerDismissed, experimenterDismissed]);
    // Send a message to the experimenter
    const sendMessageToExperimenter = () => {
        if (!messageToExperimenter.trim()) return;

        // Reset activity timestamp and warning state
        lastActivityTimestampRef.current = Date.now(); // Use ref instead of state
        setWarningShown(false);
        // // console.log(`${role} - Activity timestamp reset - message to experimenter`);

        const newMessage = {sender: role, content: messageToExperimenter};
        
        // DEBUG: Track message additions
        // console.log("💬 ADDING MESSAGE TO EXPERIMENTER:", newMessage);
        // console.log("💬 Current messages length before add:", messages.length);
          setMessages((prevMessages) => {
            const updatedMessages = [...prevMessages, newMessage];
            // console.log("💬 Updated messages length after add:", updatedMessages.length);
            // console.log("💬 Full messages array:", updatedMessages.map(msg => `${msg.sender}: ${msg.content}`));
            
            // SYNC WITH REF for reliable shuffle capture
            messagesRef.current = updatedMessages;
            // console.log("💬 SYNCED messagesRef length:", messagesRef.current.length);
            
            return updatedMessages;
        });

        socket.emit('message', {
            pair_id: pairId,
            sender: role,
            message: messageToExperimenter,
        });

        setMessageToExperimenter('');
    };

    // Message queue for bot messages
    useEffect(() => {
        // If message queue is disabled, don't set up the interval at all
        if (!messageQueueEnabled) {
            return;
        }

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
    const sendMessageToBotQueue = async (messageContent) => {
        let alexBasePersonaDetails;
        let conversationHistoryForAPITurn; // This is the primary history for the API call (current window's messages)

        // Contexts for system prompt generation
        let conversationToContinueCtx = null;       // Post-shuffle: Tester-Responder history
        let displayedDemographicsCtx = null;      // Post-shuffle: Responder's demographics
        let originalTesterBotHistoryCtx = null;   // Post-shuffle: Original Tester-Alex history

        // alexBasePersonaDetails = currentPersona || {
        //     name: 'Alex',
        //     gender: 'Male',
        //     age: 19,
        //     occupation: 'Student',
        //     country: 'USA',
        //     aiExperience: 'Low',
        // };

        alexBasePersonaDetails = {
            name: 'Alex',
            gender: 'Male',
            age: 19,
            occupation: 'Student',
            country: 'USA',
            aiExperience: 'Low',
        };        if (isAnonymousMode) {
            // POST-SHUFFLE SCENARIO
            // console.log("🔧 DEBUG: POST-SHUFFLE bot message sending");
            // console.log("🔧 isAnonymousMode:", isAnonymousMode);
            // console.log("🔧 humanParticipantDemographics:", humanParticipantDemographics);
            // console.log("🔧 botDisplayedDemographicsPostShuffle:", botDisplayedDemographicsPostShuffle);
            // console.log("🔧 FIXED_BOT_DEMOGRAPHICS:", FIXED_BOT_DEMOGRAPHICS);
            
            // `botMessages` state IS the pre-shuffle Tester-Responder chat history.
            conversationHistoryForAPITurn = botMessages.map(msg => ({
                role: msg.sender === role ? 'user' : 'assistant',
                content: msg.content
            }));

            // For the system prompt, provide:
            // 1. The Tester-Responder history (as the conversation to continue)
            if (capturedPreShuffleTesterResponderChat && capturedPreShuffleTesterResponderChat.length > 0) {
                conversationToContinueCtx = [...capturedPreShuffleTesterResponderChat].slice(-15); // Slice for brevity
                // console.log("🔧 Using capturedPreShuffleTesterResponderChat, length:", capturedPreShuffleTesterResponderChat.length);
            } else {
                // Fallback if preShuffleTesterResponderHistory is not yet populated or empty,
                // use the current botMessages (which should be the same in this scenario)
                conversationToContinueCtx = [...conversationHistoryForAPITurn].slice(-15);
                // console.log("🔧 No captured tester-responder chat, using current botMessages for 'conversationToContinueCtx'");
            }

            // 2. The Responder's demographics (for the bot to display)
            // CRITICAL FIX: Use human participant demographics if available
            if (humanParticipantDemographics && !humanParticipantDemographics.error) {
                displayedDemographicsCtx = {
                    gender: humanParticipantDemographics.gender,
                    age: humanParticipantDemographics.age,
                    occupation: humanParticipantDemographics.occupation,
                    country: humanParticipantDemographics.country,
                    aiExperience: humanParticipantDemographics.ai_experience || humanParticipantDemographics.aiExperience,
                    source: 'human-participant-demographics'
                };
                // console.log("🔧 ✅ Using HUMAN PARTICIPANT demographics for bot:", displayedDemographicsCtx);
            } else if (botDisplayedDemographicsPostShuffle) {
                displayedDemographicsCtx = botDisplayedDemographicsPostShuffle;
                // console.log("🔧 ⚠️ Using botDisplayedDemographicsPostShuffle:", displayedDemographicsCtx);
            } else {
                displayedDemographicsCtx = FIXED_BOT_DEMOGRAPHICS;
                // console.log("🔧 ❌ FALLBACK: Using FIXED_BOT_DEMOGRAPHICS:", displayedDemographicsCtx);
            }

            // 3. The original Tester-Bot (Alex) pre-shuffle history (for the "confusion test")
            // Ensure capturedPreShuffleTesterBotChat state is populated correctly by ChatPage logic
            if (capturedPreShuffleTesterBotChat && capturedPreShuffleTesterBotChat.length > 0) {
                originalTesterBotHistoryCtx = [...capturedPreShuffleTesterBotChat].slice(-10); // Slice for brevity
                // console.log("🔧 Using capturedPreShuffleTesterBotChat, length:", capturedPreShuffleTesterBotChat.length);
            } else {
                // console.log("🔧 No captured tester-bot chat available");
            }

        } else {
            // PRE-SHUFFLE SCENARIO
            // `botMessages` state is the direct Tester-Alex chat history.
            conversationHistoryForAPITurn = botMessages.map(msg => ({
                role: msg.sender === 'bot' ? 'assistant' : 'user',
                content: msg.content
            }));
            // No special context needed beyond Alex's base persona for pre-shuffle.
            // conversationToContinueCtx, displayedDemographicsCtx, originalTesterBotHistoryCtx remain null.
        }

        const fullHistoryForAPITurnWithNewMessage = [
            ...conversationHistoryForAPITurn,
            {role: 'user', content: messageContent}
        ];

        try {
            // Call botService.js function, which now calls the backend
            const botReply = await sendBotMessage(
                fullHistoryForAPITurnWithNewMessage, // Primary conversation history for this API call
                alexBasePersonaDetails,
                false, // isWakeupMessage
                // config.ENABLE_PROMPT, // Backend now primarily controls this via its own config.
                // If frontend needs to override, sendBotMessage signature would need adjustment.

                // Contexts for system prompt generation (passed to backend)
                conversationToContinueCtx,          // Post-shuffle: Tester-Responder history
                displayedDemographicsCtx,           // Post-shuffle: Responder's demographics
                originalTesterBotHistoryCtx         // Post-shuffle: Original Tester-Alex history
            );

            setBotMessages(prevBotMessages => [
                ...prevBotMessages,
                {id: `${Date.now()}-bot-${Math.random()}`, sender: 'bot', content: botReply, timestamp: Date.now()}
            ]);

            lastWakeupMessageRef.current = null;
            lastBotActivityTimestampRef.current = Date.now();
            // setMessageToBot('');

        } catch (error) {
            console.error('ChatPage: Error sending message to bot or processing reply:', error);
            setBotMessages(prevBotMessages => [
                ...prevBotMessages,
                {
                    id: `${Date.now()}-bot-error-${Math.random()}`,
                    sender: 'bot',
                    content: error.message || "Sorry, I encountered an issue. Please try again.",
                    timestamp: Date.now()
                }
            ]);
        }
    };

    useEffect(() => {
        // If wake-up system is disabled, don't proceed
        if (!botWakeupEnabled) {
            return;
        }

        if (!inactivityCheckerActive || role !== 'tester' || !chatTimerStarted) {
            if (wakeupIntervalRef.current) {
                // // console.log('Cleaning up existing wake-up interval');
                clearInterval(wakeupIntervalRef.current);
                wakeupIntervalRef.current = null;
            }
            return;
        }

        // Only create new interval if one doesn't exist
        if (!wakeupIntervalRef.current) {
            // // console.log('Starting wake-up interval checker');

            // Generate random delay once when starting the checker
            wakeupDelayRef.current = Math.floor(Math.random() * (45000 - 25000) + 25000);
            // // console.log('Set wake-up delay to:', wakeupDelayRef.current / 1000, 'seconds');


            wakeupIntervalRef.current = setInterval(() => {

                const currentTime = Date.now();
                const timeSinceLastActivity = currentTime - lastActivityTimestampRef.current;
                const timeSinceLastBotActivity = currentTime - lastBotActivityTimestampRef.current;
                const timeSinceLastWakeup = currentTime - lastWakeupMessageTimeRef.current;

                if (timeSinceLastActivity >= wakeupDelayRef.current &&
                    timeSinceLastBotActivity >= 20000 &&
                    timeSinceLastWakeup >= wakeupDelayRef.current &&
                    wakeupAttemptsCount < MAX_WAKEUP_ATTEMPTS) {
                    // // console.log('Conditions met - Sending bot wakeup message...');
                    sendBotWakeupMessage();
                    lastWakeupMessageTimeRef.current = currentTime;
                    // Generate new delay for next wake-up
                    wakeupDelayRef.current = Math.floor(Math.random() * (45000 - 25000) + 25000);
                    // // console.log('Set new wake-up delay to:', wakeupDelayRef.current / 1000, 'seconds');
                }
            }, 5000);
        }

        // Cleanup function
        return () => {
            if (wakeupIntervalRef.current) {
                // // console.log('Cleaning up wake-up interval');
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
            lastWakeupMessageRef.current = botReply;            setBotMessages((prevBotMessages) => [
                ...prevBotMessages,
                {sender: 'bot', content: botReply}
            ]);
            
            // SYNC WITH REF for reliable shuffle capture
            setBotMessages(currentBotMessages => {
                botMessagesRef.current = currentBotMessages;
                // console.log("🤖 SYNCED botMessagesRef after wake-up message, length:", botMessagesRef.current.length);
                return currentBotMessages;
            });

            setWakeupAttemptsCount(prev => prev + 1);
            lastBotActivityTimestampRef.current = Date.now();
        } catch (error) {
            console.error('Error sending wake-up message:', error);
        }
    };

// Initialize persona when component mounts
    useEffect(() => {
        setCurrentPersona(getRandomPersona(personas.personas));
    }, []);    const handleGuess = (candidateLabel, selectedRole) => {
        // console.log('🔍 GUESS DEBUG - Selection made:', {
        //     candidateLabel,
        //     selectedRole,
        //     currentGuessCandidateA: guessCandidateA,
        //     currentGuessCandidateB: guessCandidateB,
        //     timestamp: new Date().toISOString()
        // });

        if (candidateLabel === 'A') {
            setGuessCandidateA(selectedRole);
            setGuessCandidateB(selectedRole === 'experimenter' ? 'bot' : 'experimenter');
            // CRITICAL FIX: Update refs immediately
            guessCandidateARef.current = selectedRole;
            guessCandidateBRef.current = selectedRole === 'experimenter' ? 'bot' : 'experimenter';
            // console.log('🔍 GUESS DEBUG - Setting A to:', selectedRole, 'and B to:', selectedRole === 'experimenter' ? 'bot' : 'experimenter');
        } else {
            setGuessCandidateB(selectedRole);
            setGuessCandidateA(selectedRole === 'experimenter' ? 'bot' : 'experimenter');
            // CRITICAL FIX: Update refs immediately
            guessCandidateBRef.current = selectedRole;
            guessCandidateARef.current = selectedRole === 'experimenter' ? 'bot' : 'experimenter';
            // console.log('🔍 GUESS DEBUG - Setting B to:', selectedRole, 'and A to:', selectedRole === 'experimenter' ? 'bot' : 'experimenter');
        }
    };    const handleSubmitGuesses = async () => {
        // DEBUG: Log current guess values when submit is clicked
        // console.log('🔍 SUBMIT DEBUG - Current guess values when submit clicked:', {
        //     guessCandidateA,
        //     guessCandidateB,
        //     finalRoomConfig,
        //     timestamp: new Date().toISOString()
        // });
        
        if (!finalRoomConfig) {
            console.error('Final room configuration not found');
            return;
        }
        if (!guessCandidateA || !guessCandidateB) {
            console.error('❌ SUBMIT VALIDATION FAILED - Empty guess values:', {
                guessCandidateA,
                guessCandidateB
            });
            alert('Please select both candidates before submitting.');
            return;
        }
        const realIdentityA = finalRoomConfig.leftRoom.role;
        const realIdentityB = finalRoomConfig.rightRoom.role;

        setRealIdentityA(realIdentityA);
        setRealIdentityB(realIdentityB);
        
        // CRITICAL FIX: Update refs with real identities for socket event handler
        realIdentityARef.current = realIdentityA;
        realIdentityBRef.current = realIdentityB;
        //   console.log('🔍 SUBMIT DEBUG - About to emit tester_guessed with:', {
        //     pairId,
        //     guessCandidateA: guessCandidateARef.current,
        //     guessCandidateB: guessCandidateBRef.current,
        //     realIdentityA: realIdentityARef.current,
        //     realIdentityB: realIdentityBRef.current,
        //     tester: username
        // });
        
        // Emit guesses to backend via socket - use ref values for consistency
        socket.emit('tester_guessed', {
            pairId,
            guessCandidateA: guessCandidateARef.current,
            guessCandidateB: guessCandidateBRef.current,
            realIdentityA: realIdentityARef.current,
            realIdentityB: realIdentityBRef.current,
            tester: username // for logging/debugging
        });
        // console.log('✅ SUBMIT DEBUG - tester_guessed event emitted successfully');
        // Optionally, show a waiting message or disable the submit button
    };


    const quizConfig = {
        experimenter: {
            questions: [
                {
                    question: "Is it true that when the tester correctly identifies you as human, both of you will receive a bonus payment?",
                    options: [
                        "Yes, we will both receive a $1 bonus",
                        "No, I won't receive any bonus",
                        "I will receive a bonus regardless of the tester's guess"
                    ],
                    correctAnswer: 0
                },
                {
                    question: "What is your main task in this experiment?",
                    options: [
                        "To guess who is the bot",
                        "To convince the tester that I am human",
                        "To pretend to be a bot"
                    ],
                    correctAnswer: 1
                }
            ]
        },
        tester: {
            questions: [
                {
                    question: "What happens if you correctly identify which candidate is human and which is a bot?",
                    options: [
                        "I will get disconnected",
                        "Both I and the human responder will receive a $1 bonus each",
                        "I will lose money"
                    ],
                    correctAnswer: 1
                },
                {
                    question: "What is your main task in this experiment?",
                    options: [
                        "To not write anything",
                        "To identify which candidate is human and which is a bot",
                        "To pretend to be a bot"
                    ],
                    correctAnswer: 1
                },
                {
                    question: "Regarding the 'shuffle' phase, which is true?",
                    options: [
                        "Room order is randomized, and I won't know who is who, the conversation histroy of the human will be duplicated.",
                        "Room order is always identical to the known identity phase.",
                        "The identity of both canditates is clearly visible."
                    ],
                    correctAnswer: 0
                }
            ]
        }
    };

    const generateAndNavigateToBonusCode = async () => {
        try {
            const ipResponse = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipResponse.json();
            const userIp = ipData.ip;

            const response = await axios.post(server_url + '/api/generate_code', {
                guessCandidateA,
                guessCandidateB,
                realIdentityA,
                realIdentityB,
                pairId,
                role,
                userId: username, // Use string username as userId
                userIp // Add the user's IP to the request
            });

            if (response.data.status === 'success') {
                try {
                    const unblockResponse = await axios.post(server_url + '/api/unblock_ip', {
                        ip: userIp
                    });
                } catch (unblockError) {
                    console.error('[QUIZ-FAIL] Error unblocking IP:', unblockError);
                }

                navigate('/thank_you', {
                    state: {
                        bonusCode: response.data.code,
                        userId: username, // Use string username as userId
                        role,
                        message: "Your partner failed the quiz, but you passed. Here's your bonus code. You can now participate in the experiment again with a different partner.",
                        canParticipateAgain: true // Add this flag
                    },
                    replace: true
                });
            }
        } catch (error) {
            console.error('Error generating bonus code:', error);
        }
    };
    useEffect(() => {
        // Log when socket events are registered
        // console.log('🎯 [SOCKET] Registering quiz events for role:', role);

        socket.on('quiz_completed', (data) => {
            if (data.role !== role) {
                // console.log('🎯 [QUIZ-COMPLETED] Partner completed quiz, updating partner status');
                setPartnerQuizStatus('completed');

                // If we've already completed our quiz, start the chat timer
                if (quizStep === 'completed') {
                    // console.log('🎯 [QUIZ-COMPLETED] Both quizzes complete, starting chat timer');
                    setChatTimerStarted(true);
                } else {
                    // console.log('🎯 [QUIZ-COMPLETED] Partner completed but we have not completed yet');
                }
            } else {
                // console.log('🎯 [QUIZ-COMPLETED] Received our own completion event, ignoring');
            }
        });

        socket.on('quiz_failed', (data) => {
            if (data.role !== role) {
                // console.log('🎯 [QUIZ-FAIL] Partner failed quiz');
                setPartnerQuizStatus('failed');
                setPartnerHasFailed(true); // Set the flag when partner fails

                // If we've already completed our quiz, generate bonus code
                if (quizStep === 'completed') {
                    // console.log('🎯 [QUIZ-FAIL] We completed but partner failed, generating bonus');
                    generateAndNavigateToBonusCode();
                } else {
                    // console.log('🎯 [QUIZ-FAIL] Partner failed but we have not completed yet');
                }
            } else {
                // console.log('🎯 [QUIZ-FAIL] Received our own failure event, ignoring');
            }
        });

        return () => {
            // console.log('🎯 [SOCKET] Cleaning up quiz event listeners');
            socket.off('quiz_completed');
            socket.off('quiz_failed');
        };
    }, [role, quizStep]);// Modify the quiz submission logic in both notification components
    const handleQuizSubmission = async (isCorrect) => {
        if (isCorrect) {
            // console.log('🎯 [QUIZ-SUBMIT] Quiz passed, setting step to completed');
            setQuizStep('completed');
            
            // console.log('🎯 [QUIZ-SUBMIT] Emitting quiz_completed event to backend');
            socket.emit('quiz_completed', {pair_id: pairId, role});
            // console.log('🎯 [QUIZ-SUBMIT] quiz_completed event emitted with data:', {pair_id: pairId, role});

            // Check if partner has already failed when we complete our quiz
            if (partnerHasFailed) {
                // console.log('🎯 [QUIZ-SUBMIT] Partner already failed, generating bonus code');
                await generateAndNavigateToBonusCode();
            } else if (partnerQuizStatus === 'completed') {
                // console.log('🎯 [QUIZ-SUBMIT] Partner also completed, starting chat timer');
                // Only start chat if partner has completed and not failed
                setChatTimerStarted(true);
            } else {
                // console.log('🎯 [QUIZ-SUBMIT] Waiting for partner to complete quiz');
            }
            handleDismissNotification();
        } else {
            // console.log('🎯 [QUIZ-SUBMIT] Quiz failed, emitting quiz_failed event');
            socket.emit('quiz_failed', {pair_id: pairId, role});
            // console.log('🎯 [QUIZ-SUBMIT] Navigating to disconnected page');
            navigate('/disconnected', {
                state: {
                    message: "You were disconnected because you failed the Quiz. You will not receive payment for this session."
                }
            });
        }
    };

    const getRoleInstructions = (role) => {
        if (role === 'tester') {
            return (
                <>
                    <h3><strong>Your Mission: Identify the Human.</strong></h3>
                    <p>
                        You will chat with both a human and a bot (in two separate rooms). You must identify who is
                        human.
                        If you guess correctly, you and the human will receive $1.00 bonus each.
                        You will see the demographics of both participants.
                    </p>
                    <p>
                        <strong>The interaction will be composed of two phases,</strong> the known identity phase (3
                        minutes)
                        and the shuffle phase (7 minutes).
                    </p>
                    <p>
                        In the known identity phase, you will see who is in which room, <strong>use this phase to
                        familiarize
                        yourself with the participants' behavior.</strong>
                    </p>
                    <p>
                        In the shuffle phase, <strong>the location of both participants might be swapped,</strong> but
                        both will show
                        your previous chat history and demographics of the human participant. However, still one room
                        will be a human
                        and the other a bot.
                    </p>
                    <h4><strong>Important:</strong></h4>
                    <ul>
                        <li>⚠️ Stay active to avoid disconnection.</li>
                        <li>You must pass a quiz on these instructions. Failure means no payment.</li>
                    </ul>
                </>
            );
        }

        // Experimenter instructions
        return (
            <>
                <h3><strong>Your Mission: Convince the Tester You're Human.</strong></h3>
                <p>
                    You will chat with a human tester. You must convince the tester that you are human.
                    If the tester guesses correctly, you and the tester will receive a $1.00 bonus each.
                    The tester will see your demographics, so make sure to answer the questions truthfully.
                </p>
                <p>
                    <strong>The interaction will be composed of two phases,</strong> the known identity phase (3
                    minutes)
                    and the shuffle phase (8 minutes).
                </p>
                <h4><strong>Important:</strong></h4>
                <ul>
                    <li>⚠️ Stay active to avoid disconnection.</li>
                    <li>You must pass a quiz on these instructions. Failure means no payment.</li>
                </ul>
            </>
        );
    };


    useEffect(() => {
        if (chatMessagesRef.current) {
            chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
        }
        if (botChatMessagesRef.current) {
            botChatMessagesRef.current.scrollTop = botChatMessagesRef.current.scrollHeight;
        }
    }, [messages, botMessages]);


    const renderChatWindow = (roomTypeArgument) => { // Renamed argument for clarity
        // Initial guard: In anonymous mode, finalRoomConfig must be ready.
        // Your original code had `if (!finalRoomConfig) return null;`
        // This should ideally be `if (isAnonymousMode && !finalRoomConfig) return null;`
        // because finalRoomConfig is specific to anonymous mode.
        if (isAnonymousMode && !finalRoomConfig) {
            // console.warn("renderChatWindow: finalRoomConfig not ready for anonymous mode.");
            return null;
        }

        let demDataForDisplay;
        let isLoadingDemographics;

        // Determine which demographics to display for THIS specific window
        if (isAnonymousMode) {
            // POST-SHUFFLE: Both windows display the original human participant's demographics
            demDataForDisplay = humanParticipantDemographics;
            isLoadingDemographics = isLoadingHumanDemographics;
            // // console.log("Human Demographics for Display (Post-Shuffle):", humanParticipantDemographics); // DEBUG LINE
        } else {
            // PRE-SHUFFLE:
            if (roomTypeArgument === 'experimenter') {
                demDataForDisplay = humanParticipantDemographics;
                isLoadingDemographics = isLoadingHumanDemographics;
                // // console.log("Human Demographics for Display (Pre-Shuffle, Experimenter Window):", humanParticipantDemographics); // DEBUG LINE
            } else { // roomTypeArgument === 'bot'
                demDataForDisplay = FIXED_BOT_DEMOGRAPHICS;
                isLoadingDemographics = false; // Fixed, so not "loading"
            }
        }

        // This part is from your original code, determining which room's info to use in anonymous mode
        // It's needed for candidate labels and potentially for other logic if you extend it.
        // If not in anonymous mode, roomInfo might be undefined, handle gracefully.
        const roomInfo = isAnonymousMode ?
            (finalRoomConfig[roomTypeArgument === roomOrder[0] ? 'leftRoom' : 'rightRoom'])
            : null;        // GUESSING PHASE (chat ended and role is 'tester')
        if (role === 'tester' && showOverlay) {
            // Ensure roomInfo is available for candidate identification in anonymous mode
            if (isAnonymousMode && !roomInfo) return null; // Should not happen if finalRoomConfig guard is effective

            const candidateForGuess = roomInfo ? roomInfo.candidate : (roomTypeArgument === 'experimenter' ? 'A' : 'B'); // Fallback for safety

            return (
                <div className="chat-window">
                    <div className="chat-header">
                        {/* In anonymous mode, title is always "Candidate X" */}
                        {isAnonymousMode ? `Candidate ${roomInfo.candidate}` : (roomTypeArgument === 'experimenter' ? 'Chat with a Human' : 'Chat with a Bot')}
                    </div>
                    <DemographicsDisplayComponent demData={demDataForDisplay} isLoading={isLoadingDemographics}/>
                    <div className="chat-messages"
                         ref={roomTypeArgument === 'experimenter' ? chatMessagesRef : botChatMessagesRef}>
                        {/*
              In anonymous mode post-shuffle, `messages` and `botMessages` initially hold the same human chat history.
              So, the choice here determines which *state variable* to map, but the content is the same initially.
              This distinction becomes important if their conversations diverge *after* the shuffle.
            */}
                        {(isAnonymousMode ? (roomInfo.role === 'experimenter' ? messages : botMessages) : (roomTypeArgument === 'experimenter' ? messages : botMessages))
                            .map((msg, index) => (
                                <p className={`message ${msg.sender === username || msg.sender === role ? 'message-left' : 'message-right'}`}
                                   key={index}>
                                    {msg.content}
                                </p>
                            ))}
                    </div>
                    <div className="chat-input">
                        <div className="cover">
                            <p>Who was in this chat?</p>
                            <select
                                value={candidateForGuess === 'A' ? guessCandidateA : guessCandidateB}
                                onChange={(e) => handleGuess(candidateForGuess, e.target.value)}
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

        // ACTIVE CHAT PHASE
        // Your original structure had separate blocks for 'experimenter' and 'bot'.
        // We'll inject the demographic display into those.

        if (roomTypeArgument === 'experimenter') { // This usually means the HUMAN's window (pre-shuffle) or the window designated for HUMAN (post-shuffle)
            return (
                <div className="chat-window">
                    <div className="chat-header">
                        {isAnonymousMode
                            ? (roomInfo ? `Candidate ${roomInfo.candidate}` : "Loading...") // Candidate label if anonymous
                            : "Chat with a Human" // Pre-shuffle title
                        }
                    </div>
                    <DemographicsDisplayComponent demData={demDataForDisplay} isLoading={isLoadingDemographics}/>
                    <div className="chat-messages" ref={chatMessagesRef}>
                        {messages.map((msg, index) => (
                            <p className={`message ${msg.sender === username || msg.sender === role ? 'message-left' : 'message-right'}`}
                               key={index}>
                                {msg.content}
                            </p>
                        ))}
                    </div>
                    <div className="chat-input">
                        <input
                            type="text"
                            value={messageToExperimenter}
                            onChange={(e) => setMessageToExperimenter(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey ? (e.preventDefault(), sendMessageToExperimenter()) : null}
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

        if (roomTypeArgument === 'bot') { // This usually means the BOT's window (pre-shuffle) or the window designated for BOT (post-shuffle)
            return (
                <div className="chat-window">
                    <div className="chat-header">
                        {isAnonymousMode
                            ? (roomInfo ? `Candidate ${roomInfo.candidate}` : "Loading...") // Candidate label if anonymous
                            : "Chat with a Bot" // Pre-shuffle title
                        }
                    </div>
                    <DemographicsDisplayComponent demData={demDataForDisplay} isLoading={isLoadingDemographics}/>
                    <div className="chat-messages" ref={botChatMessagesRef}>
                        {botMessages.map((msg, index) => (
                            <p className={`message ${msg.sender === username || msg.sender === role ? 'message-left' : 'message-right'}`}
                               key={index}>
                                {msg.content}
                            </p>
                        ))}
                    </div>
                    <div className="chat-input">
                        <input
                            type="text"
                            value={messageToBot}
                            onChange={(e) => setMessageToBot(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey ? (e.preventDefault(), sendMessageToBot()) : null} // Ensure sendMessageToBot calls your sendMessageToBotQueue
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

        // Fallback if roomTypeArgument is somehow not 'experimenter' or 'bot'
        // Or if role is 'experimenter' (they only see one window, handled outside this mapping)
        return null;
    };
    return (        <div className={`chat-container ${shuffling ? 'shuffling' : ''} ${role === 'tester' && showOverlay ? 'with-submission' : ''}`}>
            
            {showNotificationForTester && role === 'tester' && (
                <div className="popup-overlay">
                    <div className="popup">
                        {quizStep === 'instructions' && (
                            <>
                                <h3>Your Mission: Identify the Human.</h3>

                                <p>
                                    You will chat with both a human and a bot (in two separate rooms). You must identify
                                    who is human.
                                    If you guess correctly, you and the human will receive <strong>$1.00
                                    bonus</strong> each.
                                    You will see the demographics of both participants.
                                </p>

                                <h4>The interaction will be composed of two phases:</h4>
                                <ul>
                                    <li>
                                        <strong>Known identity phase (3 minutes):</strong> You will see who is in each
                                        room.
                                        Use this phase to familiarize yourself with the participants' behaviors.
                                    </li>
                                    <li>
                                        <strong>Shuffle phase (8 minutes):</strong> The locations of both participants
                                        might be swapped,
                                        but both rooms will display your previous chat history and the demographics of the
                                        human participant.
                                        However, still one room will be a human and the other a bot.
                                    </li>
                                </ul>

                                <h4>Important:</h4>
                                <ul>
                                    <li>⚠️ Stay active to avoid disconnection.</li>
                                    <li>You must pass a quiz on these instructions. Failure means no payment.</li>
                                </ul>

                                <button
                                    onClick={() => setQuizStep('quiz')}
                                    className="popup-continue-button"
                                >
                                    Continue to Quiz
                                </button>
                            </>
                        )}


                        {(quizStep === 'completed' && !chatTimerStarted) && (
                            <div className="timer-status">
                                <p>Waiting for both participants to complete the quiz before starting...</p>
                                <p>Your status: Quiz completed</p>
                                <p>Partner
                                    status: {partnerQuizStatus === 'completed' ? 'Quiz completed' : 'Still taking quiz...'}</p>
                            </div>
                        )}

                        {quizStep === 'quiz' && (
                            <>
                                <h3>Instruction Understanding Quiz</h3>

                                <button
                                    onClick={() => setShowInstructions(true)}
                                    className="review-instructions-button"
                                >
                                    Review Instructions
                                </button>

                                <p className="warning-text">⚠️ Incorrect answers will result in disconnection without
                                    payment</p>

                                {showInstructions && (
                                    <div className="instructions-modal">
                                        <div className="instructions-content">
                                            <h4>Instructions</h4>
                                            <p>{getRoleInstructions(role)}</p>
                                            <button
                                                onClick={() => setShowInstructions(false)}
                                                className="close-instructions-button"
                                            >
                                                Close
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {quizConfig.tester.questions.map((q, qIndex) => (
                                    <div key={qIndex} className="quiz-question">
                                        <p className="question-text">{q.question}</p>
                                        <div className="options-container">
                                            {q.options.map((option, oIndex) => (
                                                <label key={oIndex} className="option-label">
                                                    <input
                                                        type="radio"
                                                        name={`question-${qIndex}`}
                                                        checked={quizAnswers[qIndex] === oIndex}
                                                        onChange={() => {
                                                            const newAnswers = [...quizAnswers];
                                                            newAnswers[qIndex] = oIndex;
                                                            setQuizAnswers(newAnswers);
                                                        }}
                                                        disabled={showQuizConfirmation}
                                                    />
                                                    {option}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}

                                {!showQuizConfirmation ? (
                                    <button
                                        onClick={() => {
                                            if (quizAnswers.includes(null)) {
                                                alert("Please answer all questions before submitting.");
                                                return;
                                            }
                                            setShowQuizConfirmation(true);
                                        }}
                                        className="submit-quiz-button"
                                    >
                                        Submit Answers
                                    </button>
                                ) : (
                                    <div className="confirmation-container">
                                        <p>Are you sure you want to submit these answers?</p>
                                        <div className="confirmation-buttons">
                                            <button
                                                onClick={() => {
                                                    const allCorrect = quizAnswers.every(
                                                        (answer, index) => answer === quizConfig[role].questions[index].correctAnswer
                                                    );
                                                    handleQuizSubmission(allCorrect);
                                                }}
                                            >
                                                Yes, Submit
                                            </button>
                                            <button
                                                onClick={() => setShowQuizConfirmation(false)}
                                            >
                                                No, Let me check again
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {showNotificationForExperimenter && role === 'experimenter' && (
                <div className="popup-overlay">
                    <div className="popup">
                        {quizStep === 'instructions' && (
                            <>
                                <h3>Your Mission: Convince the Tester You're Human.</h3>

                                <p>
                                    You will chat with a <strong>human Tester</strong> (who is simultanesly chatting

                                    also with a bot). Your goal is to convince the tester that <strong>you are the
                                    human</strong>.
                                    If the Tester guesses correctly, you and the Tester will each receive a <strong>$1.00
                                    bonus</strong>.
                                </p>

                                <p>
                                    The Tester will be able to see your demographics (such as age and occupation).
                                </p>

                                <p>
                                    Note, that at the first 3 minutes of the conversation (the known identity phase),
                                    the tester knows who is human and who is the bot, but in the later 8 minutes (the
                                    shuffle phase), the tester does not know.
                                </p>

                                <h4>Important:</h4>
                                <ul>
                                    <li><p className="warning-text">⚠️ Stay active to avoid disconnection.</p></li>
                                    <li><p className="warning-text">You must pass a quiz on these instructions. Failure
                                        means no payment.</p></li>
                                </ul>

                                <button
                                    onClick={() => setQuizStep('quiz')}
                                    className="popup-continue-button"
                                >
                                    Continue to Quiz
                                </button>
                            </>
                        )}


                        {(quizStep === 'completed' && !chatTimerStarted) && (
                            <div className="timer-status">
                                <p>Waiting for both participants to complete the quiz before starting...</p>
                                <p>Your status: Quiz completed</p>
                                <p>Partner
                                    status: {partnerQuizStatus === 'completed' ? 'Quiz completed' : 'Still taking quiz...'}</p>
                            </div>
                        )}

                        {quizStep === 'quiz' && (
                            <>
                                <h3>Instruction Understanding Quiz</h3>

                                <button
                                    onClick={() => setShowInstructions(true)}
                                    className="review-instructions-button"
                                >
                                    Review Instructions
                                </button>

                                <p className="warning-text">⚠️ Incorrect answers will result in disconnection without
                                    payment</p>

                                {showInstructions && (
                                    <div className="instructions-modal">
                                        <div className="instructions-content">
                                            <h4>Instructions</h4>
                                            <p>{getRoleInstructions(role)}</p>
                                            <button
                                                onClick={() => setShowInstructions(false)}
                                                className="close-instructions-button"
                                            >
                                                Close
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {quizConfig.experimenter.questions.map((q, qIndex) => (
                                    <div key={qIndex} className="quiz-question">
                                        <p className="question-text">{q.question}</p>
                                        <div className="options-container">
                                            {q.options.map((option, oIndex) => (
                                                <label key={oIndex} className="option-label">
                                                    <input
                                                        type="radio"
                                                        name={`question-${qIndex}`}
                                                        checked={quizAnswers[qIndex] === oIndex}
                                                        onChange={() => {
                                                            const newAnswers = [...quizAnswers];
                                                            newAnswers[qIndex] = oIndex;
                                                            setQuizAnswers(newAnswers);
                                                        }}
                                                        disabled={showQuizConfirmation}
                                                    />
                                                    {option}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}

                                {!showQuizConfirmation ? (
                                    <button
                                        onClick={() => {
                                            if (quizAnswers.includes(null)) {
                                                alert("Please answer all questions before submitting.");
                                                return;
                                            }
                                            setShowQuizConfirmation(true);
                                        }}
                                        className="submit-quiz-button"
                                    >
                                        Submit Answers
                                    </button>
                                ) : (
                                    <div className="confirmation-container">
                                        <p>Are you sure you want to submit these answers?</p>
                                        <div className="confirmation-buttons">
                                            <button
                                                onClick={() => {
                                                    const allCorrect = quizAnswers.every(
                                                        (answer, index) => answer === quizConfig[role].questions[index].correctAnswer
                                                    );
                                                    handleQuizSubmission(allCorrect);
                                                }}
                                            >
                                                Yes, Submit
                                            </button>
                                            <button
                                                onClick={() => setShowQuizConfirmation(false)}
                                            >
                                                No, Let me check again
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
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
                            <h3>Chat with the Tester</h3>
                            <p className="subtitle">Prove that you are a human by chatting with the tester.</p>
                        </div>
                        <div className="chat-messages" ref={chatMessagesRef}>
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

            {role === 'tester' && showOverlay && (
                <div className="submission-area">
                    {!experimenterReady ? (
                        <div className="waiting-message">
                            Please wait for the responder to finish, it will take a few seconds, don't worry...
                        </div>
                    ) : (
                        <button onClick={handleSubmitGuesses} className="submit-button">
                            Submit
                        </button>
                    )}
                </div>
            )}            {/* Timer Component */}
            {timerVisible && (
                <div 
                    className={`timer-component ${timeRemaining <= totalPhaseTime * 0.2 ? 'low-time' : ''}`}
                    data-phase={currentPhase}
                >
                    <div className="timer-header">
                        <div className="timer-phase">{getPhaseDisplayName()}</div>
                        <div className="timer-display" style={{ color: getTimerColor() }}>
                            {formatTime(timeRemaining)}
                        </div>
                    </div>
                    <div className="timer-progress-bar">
                        <div 
                            className="timer-progress-fill" 
                            style={{ 
                                width: `${getTimerProgress()}%`,
                                backgroundColor: getTimerColor()
                            }}
                        ></div>
                    </div>
                    <div className="timer-info">
                        Time remaining in current phase
                    </div>
                </div>
            )}

            {/* Optionally, display a notification if showBonusNotification is true */}
            {showBonusNotification && (
                <div className="bonus-notification">
                    <p>🎉 Bonus code received: <strong>{experimenterBonus}</strong></p>
                                       <button onClick={() => setShowBonusNotification(false)}>Dismiss</button>
                </div>
            )}
        </div>
    );
}

export default ChatPage;