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
import {loadCSVData, getRandomConversations} from '../utils/csvUtils';

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
    const [showTestPhaseNotification, setShowTestPhaseNotification] = useState(false); // New state for test phase notification
    const [experimenterReady, setExperimenterReady] = useState(false);
    const [showOverlay, setShowOverlay] = useState(false); // Manage overlay visibility
    const [showNotificationForExperimenter, setShowNotificationForExperimenter] = useState(false);
    const [showNotificationForTester, setShowNotificationForTester] = useState(false);
    const [testerDismissed, setTesterDismissed] = useState(false);
    const [experimenterDismissed, setExperimenterDismissed] = useState(false);
    const [timerPaused, setTimerPaused] = useState(true); // Start with timer paused
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
    const submitButtonRef = useRef(null); // Ref for auto-scroll to submit button
    const popupRef = useRef(null); // Ref for the popup container
    const [chatTimerStarted, setChatTimerStarted] = useState(false);
    const [partnerHasFailed, setPartnerHasFailed] = useState(false);
    
    // Waiting for partner state
    const [waitingForPartner, setWaitingForPartner] = useState(false);
    const [waitingStartTime, setWaitingStartTime] = useState(null);
    const [waitingElapsedTime, setWaitingElapsedTime] = useState(0);
    const waitingTimerRef = useRef(null);
    
    // Conversation review waiting states
    const [waitingForPartnerReview, setWaitingForPartnerReview] = useState(false);
    const [partnerReviewCompleted, setPartnerReviewCompleted] = useState(false);
    const [waitingForReviewStartTime, setWaitingForReviewStartTime] = useState(null);
    const [waitingForReviewElapsed, setWaitingForReviewElapsed] = useState(0);
    const [partnerConversationReviewTimeRemaining, setPartnerConversationReviewTimeRemaining] = useState(300); // Track partner's remaining time
    const waitingForReviewTimerRef = useRef(null);

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
    const realIdentityBRef = useRef('');    // New state for conversation review phase
    const [preShuffleConversations, setPreShuffleConversations] = useState([]);
    const [currentConversationIndex, setCurrentConversationIndex] = useState(0);
    const [conversationGuesses, setConversationGuesses] = useState([]);
    const [showConversationFeedback, setShowConversationFeedback] = useState(false);
    const [conversationPhase, setConversationPhase] = useState('review'); // 'review', 'guess', 'feedback', 'completed'
    const [conversationReviewStarted, setConversationReviewStarted] = useState(false);
    const [currentConversationGuess, setCurrentConversationGuess] = useState({ leftWindow: '', rightWindow: '' });    const [conversationReviewStartTime, setConversationReviewStartTime] = useState(null);
    const [conversationReviewElapsed, setConversationReviewElapsed] = useState(300); // Start at 5 minutes (300 seconds)
    const conversationReviewTimerRef = useRef(null);

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
        }    }, [role, username, partner_username]);    // Load conversations for the conversation review phase (data only, don't start review)
    useEffect(() => {
        const loadConversations = async () => {
            try {
                // console.log('Loading conversations for review...');
                const csvData = await loadCSVData();
                const conversations = getRandomConversations(csvData, 5);
                // console.log('Loaded conversations:', conversations);
                setPreShuffleConversations(conversations);
                setConversationGuesses(new Array(conversations.length).fill(null));
                // Don't start conversation review automatically - wait for quiz completion
                // console.log('Conversations loaded, waiting for quiz completion to start review');
            } catch (error) {
                console.error('Error loading conversations:', error);
                // Set mock data as fallback
                const mockConversations = getRandomConversations(null, 5);
                setPreShuffleConversations(mockConversations);
                setConversationGuesses(new Array(mockConversations.length).fill(null));
                // Don't start conversation review automatically - wait for quiz completion
                // console.log('Fallback conversations loaded, waiting for quiz completion to start review');
            }
        };

        loadConversations();
    }, []);

    // Initialize quiz immediately after pairing
    useEffect(() => {
        if (pairId && role && username) {
            // console.log('🎯 Initializing quiz after pairing:', {pairId, role, username});
            // Show quiz notification immediately after pairing
            if (role === 'tester') {
                setShowNotificationForTester(true);
            } else if (role === 'experimenter') {
                setShowNotificationForExperimenter(true);
            }
        }
    }, [pairId, role, username]);

    // Conversation review timer management
    const startConversationReviewTimer = () => {
        if (conversationReviewTimerRef.current) {
            clearInterval(conversationReviewTimerRef.current);
        }
        
        conversationReviewTimerRef.current = setInterval(() => {
            setConversationReviewElapsed(prev => {
                if (prev <= 1) {
                    stopConversationReviewTimer();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const stopConversationReviewTimer = () => {
        if (conversationReviewTimerRef.current) {
            clearInterval(conversationReviewTimerRef.current);
            conversationReviewTimerRef.current = null;
        }
    };

    // Stop conversation review timer when phase completes
    useEffect(() => {
        if (conversationPhase === 'completed') {
            stopConversationReviewTimer();
        }
    }, [conversationPhase]);

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
        );    // useEffect for handling the start of inactivity checking
    };
    useEffect(() => {
        // Start the inactivity checker when chat timer has started and not paused, OR during conversation review
        // BUT NOT when waiting for partner to complete quiz OR waiting for partner to complete review
        const shouldStartInactivityCheck = ((chatTimerStarted && !timerPaused) || 
                                         (conversationReviewStarted && conversationPhase !== 'completed')) &&
                                         !waitingForPartner && !waitingForPartnerReview;
        
        if (shouldStartInactivityCheck && !inactivityCheckerActive) {
            // console.log(`${role} - Starting inactivity monitoring system`);
            lastActivityTimestampRef.current = Date.now(); // Initialize the ref
            setInactivityCheckerActive(true);
        } else if (!shouldStartInactivityCheck && inactivityCheckerActive) {
            // console.log(`${role} - Stopping inactivity monitoring system`);
            setInactivityCheckerActive(false);
        }
    }, [chatTimerStarted, timerPaused, inactivityCheckerActive, role, conversationReviewStarted, conversationPhase, waitingForPartner, waitingForPartnerReview]);

// useEffect for the actual inactivity checking
    useEffect(() => {
        if (inactivityCheckerActive) {
            // // // console.log(`${role} - Inactivity checker is now running`);

            const inactivityInterval = setInterval(() => {
                const currentTime = Date.now();
                const timeSinceLastActivity = currentTime - lastActivityTimestampRef.current;

                console.log(`${role} - Last activity: ${Math.floor(timeSinceLastActivity / 1000)} seconds ago`);

                if (timeSinceLastActivity >= 120000) { // 120 seconds
                    // // // console.log(`${role} - Inactivity limit reached - disconnecting user`);

                    const banMessage = "You have been disconnected due to inactivity. You will not receive payment for this session.";
                    alert(banMessage);

                    socket.emit('participant_banned', {
                        pair_id: pairId,
                        role: role,
                        username: username
                    });

                    // Clear the interval before navigating
                    clearInterval(inactivityInterval);
                    setInactivityCheckerActive(false);

                    sessionStorage.setItem('wasDisconnected', 'true');
                    navigate('/disconnected', {
                        state: {message: banMessage}, replace: true
                    });
                } else if (timeSinceLastActivity >= 60000 && !warningShown) { // 60 seconds
                    // // // console.log(`${role} - Warning threshold reached - showing warning`);

                    // Check if we're in conversation review phase vs test phase
                    const isConversationReviewPhase = conversationReviewStarted && conversationPhase !== 'completed';
                    
                    let warningMessage;
                    if (isConversationReviewPhase) {
                        // Conversation review phase warnings
                        warningMessage = role === 'tester'
                            ? "⚠️ Warning: You must stay active during the conversation review phase. Make your guesses or you will be disconnected and won't receive payment."
                            : "⚠️ Warning: You must stay active during the conversation review phase. Make your guesses or you will be disconnected and won't receive payment.";
                    } else {
                        // Test phase warnings (original behavior)
                        warningMessage = role === 'tester'
                            ? "⚠️ Warning: If you don't send a message soon, you will be disconnected and won't receive payment."
                            : "⚠️ Warning: If you don't send a message soon, you will be disconnected from the experiment, and won't receive payment.";
                    }

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
    }, [inactivityCheckerActive, role, pairId, warningShown, navigate]);    // Waiting timer management
    useEffect(() => {
        if (waitingForPartner && waitingStartTime) {
            waitingTimerRef.current = setInterval(() => {
                const elapsed = Math.floor((Date.now() - waitingStartTime) / 1000);
                setWaitingElapsedTime(elapsed);
            }, 1000);
        } else if (waitingTimerRef.current) {
            clearInterval(waitingTimerRef.current);
            waitingTimerRef.current = null;
        }

        return () => {
            if (waitingTimerRef.current) {
                clearInterval(waitingTimerRef.current);
                waitingTimerRef.current = null;
            }
        };
    }, [waitingForPartner, waitingStartTime]);

    // Waiting for review timer management
    useEffect(() => {
        if (waitingForPartnerReview && waitingForReviewStartTime) {
            waitingForReviewTimerRef.current = setInterval(() => {
                const elapsed = Math.floor((Date.now() - waitingForReviewStartTime) / 1000);
                setWaitingForReviewElapsed(elapsed);
            }, 1000);
        } else if (waitingForReviewTimerRef.current) {
            clearInterval(waitingForReviewTimerRef.current);
            waitingForReviewTimerRef.current = null;
        }

        return () => {
            if (waitingForReviewTimerRef.current) {
                clearInterval(waitingForReviewTimerRef.current);
                waitingForReviewTimerRef.current = null;
            }
        };
    }, [waitingForPartnerReview, waitingForReviewStartTime]);

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

        // // // console.log('User sending message to bot, resetting timestamps and counters');
        // Reset wake-up attempts and activity timestamps when user sends a message
        setWakeupAttemptsCount(0);
        lastActivityTimestampRef.current = Date.now(); // Use ref instead of state
        lastWakeupMessageTimeRef.current = Date.now();
        setWarningShown(false);
        // // // console.log(`${role} - Activity timestamp reset - message to bot`);

        // If this is a response to a wake-up message, log it
        if (lastWakeupMessageRef.current) {
            // // // console.log('User responding to wake-up message:', lastWakeupMessageRef.current);
        }

        const newMessage = {sender: role, content: messageToBot};
        
        // DEBUG: Track bot message additions
        // // console.log("🤖 Current botMessages length before add:", botMessages.length);
          setBotMessages((prevBotMessages) => {
            const updatedBotMessages = [...prevBotMessages, newMessage];
            // // console.log("🤖 Updated botMessages length after add:", updatedBotMessages.length);
            // // console.log("🤖 Full botMessages array:", updatedBotMessages.map(msg => `${msg.sender}: ${msg.content}`));
            
            // SYNC WITH REF for reliable shuffle capture
            botMessagesRef.current = updatedBotMessages;
            // // console.log("🤖 SYNCED botMessagesRef length:", botMessagesRef.current.length);
            
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
    };    // Get phase display name
    const getPhaseDisplayName = () => {
        switch (currentPhase) {
            case 'known_identity':
                return 'Known Identity Phase';
            case 'shuffle':
                return 'Test Phase';
            case 'conversation_review':
                return 'Conversation Review';
            case 'anonymous_phase':
                return 'Anonymous Testing Phase';
            default:
                return 'Waiting...';
        }
    };// Get timer color based on remaining time
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
        // // console.log("🎯 PERFORM_SHUFFLE_FOR_TESTER FUNCTION CALLED!");
        // // console.log("🎯 Function is executing - this confirms the function was found and called");
        // // console.log("SHUFFLE INITIATED for Tester: Backend triggered shuffle.");
        
        // DEBUG: Check state and ref values
        // // console.log("Current messages state length:", messages.length);
        // // console.log("Current botMessages state length:", botMessages.length);
        // // console.log("Current messages content:", messages.map(msg => `${msg.sender}: ${msg.content}`));
        // // console.log("Current botMessages content:", botMessages.map(msg => `${msg.sender}: ${msg.content}`));
        
        // CRITICAL FIX: Use refs instead of state for reliable capture
        // // console.log("🔍 CHECKING REFS:");
        // // console.log("messagesRef.current length:", messagesRef.current.length);
        // // console.log("botMessagesRef.current length:", botMessagesRef.current.length);
        // // console.log("messagesRef.current content:", messagesRef.current.map(msg => `${msg.sender}: ${msg.content}`));
        // // console.log("botMessagesRef.current content:", botMessagesRef.current.map(msg => `${msg.sender}: ${msg.content}`));
        
        setShuffling(true); // For visual shuffle effect        // --- CAPTURE HISTORIES BEFORE SHUFFLE ---
        // 1. Capture the Tester <-> Human Responder chat history (from messagesRef - real-time data)
        // This is the history the bot will take over.
        const testerResponderChatSnapshot = [...messagesRef.current]; // USE REF instead of state
        setCapturedPreShuffleTesterResponderChat(testerResponderChatSnapshot);
        // // console.log("✅ CAPTURED Tester-Responder chat snapshot length:", testerResponderChatSnapshot.length);
        // // console.log("✅ CAPTURED Tester-Responder chat content:", testerResponderChatSnapshot.map(msg => `${msg.sender}: ${msg.content}`));

        // 2. Capture the original Tester <-> Bot (Alex) chat history (from botMessagesRef - real-time data)
        // This is for the "confusion test" context.
        const originalTesterBotChatSnapshot = [...botMessagesRef.current]; // USE REF instead of state       
        setCapturedPreShuffleTesterBotChat(originalTesterBotChatSnapshot);        
        // // console.log("✅ CAPTURED original Tester-Bot chat snapshot length:", originalTesterBotChatSnapshot.length);
        // // console.log("✅ CAPTURED original Tester-Bot chat content:", originalTesterBotChatSnapshot.map(msg => `${msg.sender}: ${msg.content}`));
        
        // VALIDATE CAPTURED DATA
        if (testerResponderChatSnapshot.length === 0 && originalTesterBotChatSnapshot.length === 0) {
            console.error("❌ CRITICAL: BOTH chat histories are empty! This should not happen if users have been chatting.");
            console.error("❌ This suggests the shuffle is being triggered too early or there's a state management issue.");
        }
        // --- END CAPTURE ---

        setTimeout(() => {
            // // console.log("🔄 SHUFFLE EXECUTION for Tester: Applying post-shuffle states.");
            setupAnonymousRooms();
            saveChatLogs('Before Turing Test: '); // Log before state changes fully apply to UI            
            
            // 3. CRITICAL: Both candidate A and candidate B should display the same pre-shuffle tester-experimenter chat history
            // ONLY use the tester-experimenter chat history, never bot messages
            
            // ALWAYS use the captured history, even if it appears empty (to debug the real issue)
            // // console.log("🔄 Setting both chat windows to captured tester-experimenter history...");
            // // console.log("🔄 Using captured history with length:", testerResponderChatSnapshot.length);
            setMessages([...testerResponderChatSnapshot]); // Experimenter window (Candidate A or B)
            setBotMessages([...testerResponderChatSnapshot]); // Bot window (Candidate A or B) - same history
            
            // SYNC WITH REFS immediately after setting state
            messagesRef.current = [...testerResponderChatSnapshot];
            botMessagesRef.current = [...testerResponderChatSnapshot];
            // // console.log("🔄 SYNCED both refs with tester-experimenter history, length:", testerResponderChatSnapshot.length);
            
            if (testerResponderChatSnapshot.length === 0) {
                console.warn("⚠️ WARNING: Applied empty chat history. This indicates a problem with timing or state capture.");
                console.warn("⚠️ The shuffle may be occurring before participants have had a chance to chat.");
            } else {
                // // console.log("✅ SUCCESS: Both chat windows populated with actual tester-experimenter conversation history.");
                // // console.log("✅ Shared chat history content:", testerResponderChatSnapshot.map(msg => `${msg.sender}: ${msg.content}`));
            }            // 4. Bot "adopts" human's demographics for display and conversational context
            // // console.log("🔄 DEMOGRAPHICS ADOPTION DEBUG:");
            // // console.log("🔄 humanParticipantDemographics:", humanParticipantDemographics);
            // // console.log("🔄 humanParticipantDemographics.error:", humanParticipantDemographics?.error);
            // // console.log("🔄 FIXED_BOT_DEMOGRAPHICS:", FIXED_BOT_DEMOGRAPHICS);
            
            if (humanParticipantDemographics && !humanParticipantDemographics.error) {
                const humanDemographicsForBot = {
                    ...humanParticipantDemographics,
                    source: 'adopted-human-post-shuffle'
                };
                setBotDisplayedDemographicsPostShuffle(humanDemographicsForBot);
                // // console.log("🔄 ✅ Bot displayed demographics set to human participant's:", humanDemographicsForBot);
            } else {
                console.warn("🔄 ❌ Human demographics not available for bot to adopt post-shuffle. Using fallback.");
                console.warn("🔄 ❌ humanParticipantDemographics:", humanParticipantDemographics);
                setBotDisplayedDemographicsPostShuffle(FIXED_BOT_DEMOGRAPHICS);
                // // console.log("🔄 ❌ Using FIXED_BOT_DEMOGRAPHICS as fallback:", FIXED_BOT_DEMOGRAPHICS);
            }            // 5. Switch to anonymous mode
            setIsAnonymousMode(true);
            setShuffling(false); // End visual shuffle effect
            // // console.log("Tester shuffle process complete. Anonymous mode active.");
        }, 3000); // Shuffle animation duration
    };

    // Socket connection setup with duplicate prevention
    useEffect(() => {
        // // console.log('🔗 Socket useEffect triggered with:', {role, pairId, shuffleEnabled});
        // // console.log('🔗 Setting up socket connection for role:', role, 'pairId:', pairId);
        // // console.log('🔗 Socket object:', socket);
        // // console.log('🔗 Socket connected?', socket?.connected);
        // // console.log('🔗 Current socketSetupRef value:', socketSetupRef.current);
        
        // Prevent duplicate socket setup
        if (socketSetupRef.current) {
            // // console.log('🔗 Socket setup already completed, skipping duplicate execution');
            return () => {
                // // console.log('🔗 Skipped setup - no cleanup needed');
            };
        }
        
        // Mark socket setup as completed to prevent duplicates
        socketSetupRef.current = true;
        // // console.log('🔗 Setting socketSetupRef to true to prevent duplicates');
          // Only remove specific listeners that we're about to re-add to prevent conflicts
        // CRITICAL: Do NOT remove shuffle_started listener as it's a one-time event that must persist
        // // console.log('🔗 Removing specific event listeners to prevent duplicates...');
        const eventsToRemove = ['message', 'timer_started', 'chat_ended', 'bonus_code', 'guess_submitted', 'experimenter_ready', 'notification_dismissed', 'participant_banned'];
        eventsToRemove.forEach(event => {
            socket.removeAllListeners(event);
            // // console.log(`🔗 Removed all listeners for event: ${event}`);
        });
        
        // Special handling for shuffle_started: only remove if we haven't set up the ref flag
        if (!socketSetupRef.current) {
            // // console.log('🔗 First time setup - removing any existing shuffle_started listeners');
            socket.removeAllListeners('shuffle_started');
        } else {
            // // console.log('🔗 Preserving existing shuffle_started listener to prevent missing the event');
        }
        
        // Add connection status listeners
        socket.on('connect', () => {
            // // console.log('🔗 Socket CONNECTED successfully');
        });
        
        socket.on('disconnect', () => {
            // // console.log('🔗 Socket DISCONNECTED');
        });
          // Add a generic event listener to catch all events
        socket.onAny((eventName, ...args) => {
            // // console.log('📥 RECEIVED ANY EVENT:', eventName, args);
        });
          socket.emit('join', {pair_id: pairId, role: role});
        // // console.log('🔗 Emitted join event with:', {pair_id: pairId, role: role});

        // Don't set up anonymous rooms immediately - wait for proper phase transitions
        // Phase flow: Quiz → Conversation Review → Chat Phase
        // Anonymous mode will be set when conversation review is completed

        if (role === 'tester') {
            socket.on('experimenter_ready', (data) => {
                // // // console.log('Received experimenter_ready event', data);
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
            // // console.log("≡ƒô¿ RECEIVED MESSAGE via socket:", newMessage);
            // // console.log("≡ƒô¿ Current role:", role);

            // Avoid duplication in messages for experimenter or tester
            if (data.sender !== 'bot') {
                // // console.log("≡ƒô¿ Adding to messages array (experimenter chat)");
                // // console.log("≡ƒô¿ Current messages length before add:", messages.length);
                setMessages((prevMessages) => {
                    if (prevMessages.find((msg) => msg.content === newMessage.content && msg.sender === newMessage.sender)) {
                        // // console.log("≡ƒô¿ DUPLICATE detected, ignoring message");
                        return prevMessages; // Ignore duplicates
                    }
                    const updatedMessages = [...prevMessages, newMessage];
                    // // console.log("≡ƒô¿ Updated messages length after add:", updatedMessages.length);
                    // // console.log("≡ƒô¿ Full messages array:", updatedMessages.map(msg => `${msg.sender}: ${msg.content}`));
                    
                    // SYNC WITH REF for reliable shuffle capture
                    messagesRef.current = updatedMessages;
                    // // console.log("≡ƒô¿ SYNCED messagesRef from socket, length:", messagesRef.current.length);
                    
                    return updatedMessages;
                });
            }

            // Avoid duplication in botMessages for bot-related messages
            if (data.sender === 'bot' && role === 'tester') {
                // // console.log("≡ƒô¿ Adding to botMessages array (bot chat)");
                setBotMessages((prevBotMessages) => {
                    if (prevBotMessages.find((msg) => msg.content === newMessage.content)) {
                        // // console.log("≡ƒô¿ DUPLICATE bot message detected, ignoring");
                        return prevBotMessages; // Ignore duplicates
                    }
                    const updatedBotMessages = [...prevBotMessages, newMessage];
                    // // console.log("≡ƒô¿ Updated botMessages length after add:", updatedBotMessages.length);
                    
                    // SYNC WITH REF for reliable shuffle capture
                    botMessagesRef.current = updatedBotMessages;
                    // // console.log("≡ƒô¿ SYNCED botMessagesRef from socket, length:", botMessagesRef.current.length);
                    
                    return updatedBotMessages;
                });
            }
        });        // Listen for timer events from backend
        socket.on('timer_started', (data) => {
            // // console.log('🕐 Timer started event received:', data);
            // // console.log('🕐 Using PRE_SHUFFLE_TIMER from config:', config.PRE_SHUFFLE_TIMER);
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
            }        });
        
        // CRITICAL: Set up shuffle_started listener
        // // console.log('🚀 REGISTERING shuffle_started event listener');
          socket.on('shuffle_started', (data) => {
            
            // Clear fallback shuffle timeout
            clearTimeout(fallbackShuffleTimeoutRef.current);
            
            // Since we don't want shuffle, we ignore this event entirely
            // The conversation review phase will handle transitions properly
            // console.log('🚀 Ignoring shuffle_started event - conversation review will handle phase transitions');
            return;
        });        // // console.log('🚀 shuffle_started listener registered successfully');
        
        socket.on('chat_ended', (data) => {
            // // console.log('Chat ended event received:', data);
            // Backend says chat is over, show overlay
            setShowOverlay(true);
            setInactivityCheckerActive(false); // Stop inactivity checking
            // Both participants are ready for guessing phase since backend timer manages both simultaneously
            setExperimenterReady(true);
            saveChatLogs('During Turing Test');
        });
        
        socket.on('bonus_code', (data) => {
            // // console.log('Bonus code received:', data);
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
            // // console.log('Guess submission confirmed:', data);
            // Only process if this is for the tester role and we are a tester
            if (data.role === 'tester' && role === 'tester') {
                // Get the bonus code from localStorage or from the data
                const bonusCode = localStorage.getItem('experimenterBonus') || data.bonus_code || experimenterBonus;
                
                // CRITICAL FIX: Use ref values instead of stale closure values
                const currentGuessCandidateA = guessCandidateARef.current;
                const currentGuessCandidateB = guessCandidateBRef.current;
                const currentRealIdentityA = realIdentityARef.current;
                const currentRealIdentityB = realIdentityBRef.current;
                
                // // console.log('🔍 NAVIGATION DEBUG - About to navigate to feedback with:', {
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
                    // // console.log('✅ NAVIGATION DEBUG - Navigation to feedback completed');
                }, 500); // Short delay to ensure alert is dismissed
            }
        });        // Listen for conversation review synchronization events
        socket.on('conversation_review_sync', (data) => {
            // console.log('🔄 Conversation review sync event received:', data);
            if (data.action === 'start_test_phase') {
                // console.log('🚀 Starting synchronized test phase (chat phase)');
                
                // Show beautiful test phase notification first
                setShowTestPhaseNotification(true);
                
                // Auto-dismiss after 10 seconds and proceed with the test phase
                setTimeout(() => {
                    handleDismissTestPhaseNotification();
                }, 10000); // Show notification for 10 seconds before auto-proceeding            
                } else if (data.action === 'partner_completed') {
                setPartnerReviewCompleted(true);
                // Set the partner's remaining time if provided
                if (data.partner_remaining_time !== undefined) {
                    setPartnerConversationReviewTimeRemaining(data.partner_remaining_time);
                }
                // Don't show alert, let the UI handle the waiting state display
            }
        });
        
        // Enhanced partner disconnection handling
        socket.on('partner_conversation_review_disconnect', (data) => {
            // Stop any active timers
            setTimerVisible(false);
            setTimerPaused(true);
            stopCountdown();
            
            // Show disconnect message
            alert(data.message || 'Your partner disconnected during the conversation review. You will be redirected to the completion page.');
            
            // Navigate with bonus code if available
            if (data.bonus_code) {
                navigate('/thank_you', {
                    replace: true,
                    state: { 
                        bonusCode: data.bonus_code,
                        role: role,
                        name: username,
                        user_id: username,
                        message: 'Your partner disconnected, but you completed the conversation review.',
                        canParticipateAgain: false
                    }
                });
            } else {
                navigate('/', { 
                    replace: true,
                    state: { 
                        message: 'Your partner disconnected. You can join the queue again.',
                        canRejoin: true 
                    }
                });
            }
        });
        
        // Handle partner ban notifications
        socket.on('participant_banned', (data) => {
            // The partner_disconnected event will handle the actual disconnection logic
            // This event is just for notification purposes
        });
        
        // All critical listeners have been registered successfully
        // // console.log('🔗 All socket event listeners registered successfully');

        // Only return cleanup function if this was the actual setup execution
        return () => {
            
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
            socket.off('participant_banned');
            socket.off('participant_banned');
              if (role === 'tester') {
                socket.off('experimenter_ready');
            }
            // // console.log('🔗 Socket cleanup completed (shuffle_started listener preserved)');
        };
    }, []);

    // Partner disconnection listener
    useEffect(() => {
        // // console.log('🔥 Setting up partner_disconnected listener');
        
        const handlePartnerDisconnected = (data) => {
            // // console.log('🔥 PARTNER DISCONNECTED EVENT RECEIVED:', data);
            // // console.log('🔥 Event data details:', JSON.stringify(data, null, 2));
            
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
                // // console.log('🔥 Redirecting to ThankYou page with code:', data.bonus_code);
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
                // // console.log('🔥 Redirecting to HomePage - no valid completion data');
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
            // // console.log('🔗 Component unmounting - resetting socketSetupRef');
            socketSetupRef.current = false;
        };
    }, []); // Empty dependency array, only runs on unmount

    // handle dismissal status
    useEffect(() => {
        if (testerDismissed && experimenterDismissed) {
            setTimerPaused(false);
            // // // console.log('Both participants dismissed notifications, timer starting');
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

    const handleDismissTestPhaseNotification = () => {
        setShowTestPhaseNotification(false);
        // Clear waiting states
        setWaitingForPartnerReview(false);
        setPartnerReviewCompleted(false);
        setWaitingForReviewStartTime(null);
        setWaitingForReviewElapsed(0);
        
        setConversationPhase('completed');
        setIsAnonymousMode(true);
        setCurrentPhase('anonymous_phase'); // Go directly to chat phase, not shuffle
        setTimerVisible(true);
        setTimerPaused(false);
        setupAnonymousRooms();
        startTimer(config.REAL_TEST_TIMER, 'anonymous_phase');
    };    useEffect(() => {
        if (quizStep === 'completed' && partnerQuizStatus === 'completed' &&
            testerDismissed && experimenterDismissed) {
            // console.log('[QUIZ_DISMISSAL] Both participants completed quiz and dismissed notifications, starting conversation review');
            
            // Start conversation review phase when both have dismissed their notifications
            setConversationPhase('review');
            setConversationReviewStarted(true);
            
            // Conversations are already loaded by the initial useEffect - start the review timer
            setConversationReviewStartTime(Date.now());
            startConversationReviewTimer();
            
            setTimerPaused(false);
            setChatTimerStarted(true);
        }
    }, [quizStep, partnerQuizStatus, testerDismissed, experimenterDismissed]);
    
    // Auto-scroll to submit button when all quiz questions are answered
    useEffect(() => {
        // Check if all questions are answered and we're in quiz mode
        const allQuestionsAnswered = quizAnswers.every(answer => answer !== null);
        
        if (allQuestionsAnswered && quizStep === 'quiz') {
            // console.log('🔄 Auto-scroll triggered: All questions answered');
            
            // Small delay to ensure DOM has updated and submit button is rendered
            setTimeout(() => {
                const popup = popupRef.current;
                const submitButton = submitButtonRef.current;
                
                if (popup && submitButton) {
                    // console.log('🔄 Found popup and submit button elements');
                    // console.log('🔄 Popup scrollHeight:', popup.scrollHeight);
                    // console.log('🔄 Popup clientHeight:', popup.clientHeight);
                    // console.log('🔄 Submit button offsetTop:', submitButton.offsetTop);
                    
                    // Calculate the position to scroll to show the submit button
                    const submitButtonTop = submitButton.offsetTop;
                    const submitButtonHeight = submitButton.offsetHeight;
                    const popupHeight = popup.clientHeight;
                    
                    // Scroll to position the submit button comfortably in view
                    const targetScrollTop = submitButtonTop - popupHeight + submitButtonHeight + 60; // 60px padding from bottom
                    
                    // console.log('🔄 Scrolling to position:', Math.max(0, targetScrollTop));
                    
                    popup.scrollTo({
                        top: Math.max(0, targetScrollTop),
                        behavior: 'smooth'
                    });
                } else {
                    // console.log('🔄 Missing elements:', {
                    //     popup: !!popup,
                    //     submitButton: !!submitButton,
                    //     popupRef: !!popupRef.current,
                    //     submitButtonRef: !!submitButtonRef.current
                    // });
                }
            }, 500); // Longer delay to ensure submit button is rendered
        }
    }, [quizAnswers, quizStep]);
    
    // Auto-scroll when confirmation dialog appears
    useEffect(() => {
        if (showQuizConfirmation && quizStep === 'quiz') {
            // console.log('🔄 Auto-scroll triggered: Confirmation dialog appeared');
            
            // Small delay to ensure DOM has updated and confirmation dialog is rendered
            setTimeout(() => {
                const popup = popupRef.current;
                
                if (popup) {
                    // console.log('🔄 Scrolling to bottom for confirmation dialog');
                    
                    // Scroll to the bottom of the popup to show the confirmation dialog 
                    popup.scrollTo({
                        top: popup.scrollHeight,
                        behavior: 'smooth'
                    });
                } else {
                    // console.log('🔄 Missing popup element for confirmation scroll');
                }
            }, 200); // Small delay to ensure confirmation dialog is rendered
        }
    }, [showQuizConfirmation, quizStep]);
    
    // Send a message to the experimenter
    const sendMessageToExperimenter = () => {
        if (!messageToExperimenter.trim()) return;

        // Reset activity timestamp and warning state
        lastActivityTimestampRef.current = Date.now(); // Use ref instead of state
        setWarningShown(false);
        // // // console.log(`${role} - Activity timestamp reset - message to experimenter`);

        const newMessage = {sender: role, content: messageToExperimenter};
        
        // DEBUG: Track message additions
        // // console.log("💬 ADDING MESSAGE TO EXPERIMENTER:", newMessage);
        // // console.log("💬 Current messages length before add:", messages.length);
          setMessages((prevMessages) => {
            const updatedMessages = [...prevMessages, newMessage];
            // // console.log("💬 Updated messages length after add:", updatedMessages.length);
            // // console.log("💬 Full messages array:", updatedMessages.map(msg => `${msg.sender}: ${msg.content}`));
            
            // SYNC WITH REF for reliable shuffle capture
            messagesRef.current = updatedMessages;
            // // console.log("💬 SYNCED messagesRef length:", messagesRef.current.length);
            
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
            // // console.log("🔧 DEBUG: POST-SHUFFLE bot message sending");
            // // console.log("🔧 isAnonymousMode:", isAnonymousMode);
            // // console.log("🔧 humanParticipantDemographics:", humanParticipantDemographics);
            // // console.log("🔧 botDisplayedDemographicsPostShuffle:", botDisplayedDemographicsPostShuffle);
            // // console.log("🔧 FIXED_BOT_DEMOGRAPHICS:", FIXED_BOT_DEMOGRAPHICS);
            
            // `botMessages` state IS the pre-shuffle Tester-Responder chat history.
            conversationHistoryForAPITurn = botMessages.map(msg => ({
                role: msg.sender === role ? 'user' : 'assistant',
                content: msg.content
            }));

            // For the system prompt, provide:
            // 1. The Tester-Responder history (as the conversation to continue)
            if (capturedPreShuffleTesterResponderChat && capturedPreShuffleTesterResponderChat.length > 0) {
                conversationToContinueCtx = [...capturedPreShuffleTesterResponderChat].slice(-15); // Slice for brevity
                // // console.log("🔧 Using capturedPreShuffleTesterResponderChat, length:", capturedPreShuffleTesterResponderChat.length);
            } else {
                // Fallback if preShuffleTesterResponderHistory is not yet populated or empty,
                // use the current botMessages (which should be the same in this scenario)
                conversationToContinueCtx = [...conversationHistoryForAPITurn].slice(-15);
                // // console.log("🔧 No captured tester-responder chat, using current botMessages for 'conversationToContinueCtx'");
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
                // // console.log("🔧 ✅ Using HUMAN PARTICIPANT demographics for bot:", displayedDemographicsCtx);
            } else if (botDisplayedDemographicsPostShuffle) {
                displayedDemographicsCtx = botDisplayedDemographicsPostShuffle;
                // // console.log("🔧 ⚠️ Using botDisplayedDemographicsPostShuffle:", displayedDemographicsCtx);
            } else {
                displayedDemographicsCtx = FIXED_BOT_DEMOGRAPHICS;
                // // console.log("🔧 ❌ FALLBACK: Using FIXED_BOT_DEMOGRAPHICS:", displayedDemographicsCtx);
            }

            // 3. The original Tester-Bot (Alex) pre-shuffle history (for the "confusion test")
            // Ensure capturedPreShuffleTesterBotChat state is populated correctly by ChatPage logic
            if (capturedPreShuffleTesterBotChat && capturedPreShuffleTesterBotChat.length > 0) {
                originalTesterBotHistoryCtx = [...capturedPreShuffleTesterBotChat].slice(-10); // Slice for brevity
                // // console.log("🔧 Using capturedPreShuffleTesterBotChat, length:", capturedPreShuffleTesterBotChat.length);
            } else {
                // // console.log("🔧 No captured tester-bot chat available");
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
                // // // console.log('Cleaning up existing wake-up interval');
                clearInterval(wakeupIntervalRef.current);
                wakeupIntervalRef.current = null;
            }
            return;
        }

        // Only create new interval if one doesn't exist
        if (!wakeupIntervalRef.current) {
            // // // console.log('Starting wake-up interval checker');

            // Generate random delay once when starting the checker
            wakeupDelayRef.current = Math.floor(Math.random() * (45000 - 25000) + 25000);
            // // // console.log('Set wake-up delay to:', wakeupDelayRef.current / 1000, 'seconds');


            wakeupIntervalRef.current = setInterval(() => {

                const currentTime = Date.now();
                const timeSinceLastActivity = currentTime - lastActivityTimestampRef.current;
                const timeSinceLastBotActivity = currentTime - lastBotActivityTimestampRef.current;
                const timeSinceLastWakeup = currentTime - lastWakeupMessageTimeRef.current;

                if (timeSinceLastActivity >= wakeupDelayRef.current &&
                    timeSinceLastBotActivity >= 20000 &&
                    timeSinceLastWakeup >= wakeupDelayRef.current &&
                    wakeupAttemptsCount < MAX_WAKEUP_ATTEMPTS) {
                    // // // console.log('Conditions met - Sending bot wakeup message...');
                    sendBotWakeupMessage();
                    lastWakeupMessageTimeRef.current = currentTime;
                    // Generate new delay for next wake-up
                    wakeupDelayRef.current = Math.floor(Math.random() * (45000 - 25000) + 25000);
                    // // // console.log('Set new wake-up delay to:', wakeupDelayRef.current / 1000, 'seconds');
                }
            }, 5000);
        }

        // Cleanup function
        return () => {
            if (wakeupIntervalRef.current) {
                // // // console.log('Cleaning up wake-up interval');
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
                // // console.log("🤖 SYNCED botMessagesRef after wake-up message, length:", botMessagesRef.current.length);
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
        // // console.log('🔍 GUESS DEBUG - Selection made:', {
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
            // // console.log('🔍 GUESS DEBUG - Setting A to:', selectedRole, 'and B to:', selectedRole === 'experimenter' ? 'bot' : 'experimenter');
        } else {
            setGuessCandidateB(selectedRole);
            setGuessCandidateA(selectedRole === 'experimenter' ? 'bot' : 'experimenter');
            // CRITICAL FIX: Update refs immediately
            guessCandidateBRef.current = selectedRole;
            guessCandidateARef.current = selectedRole === 'experimenter' ? 'bot' : 'experimenter';
            // // console.log('🔍 GUESS DEBUG - Setting B to:', selectedRole, 'and A to:', selectedRole === 'experimenter' ? 'bot' : 'experimenter');
        }
    };    const handleSubmitGuesses = async () => {
        // DEBUG: Log current guess values when submit is clicked
        // // console.log('🔍 SUBMIT DEBUG - Current guess values when submit clicked:', {
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
        //   // console.log('🔍 SUBMIT DEBUG - About to emit tester_guessed with:', {
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
        });        // // console.log('✅ SUBMIT DEBUG - tester_guessed event emitted successfully');
        // Optionally, show a waiting message or disable the submit button
    };    // Function to load conversation data for the review phase
    const loadConversationData = async () => {
        try {
            // console.log('[CONVERSATION_REVIEW] Loading conversations for review...');
            const csvData = await loadCSVData();
            const conversations = getRandomConversations(csvData, 5);
            // console.log('[CONVERSATION_REVIEW] Loaded conversations:', conversations);
            // console.log('[CONVERSATION_REVIEW] Number of conversations loaded:', conversations.length);
            setPreShuffleConversations(conversations);
            setConversationGuesses(new Array(conversations.length).fill(null));
            // console.log('[CONVERSATION_REVIEW] State updated with conversations');
        } catch (error) {
            console.error('[CONVERSATION_REVIEW] Error loading conversations:', error);
            // Set mock data as fallback
            // console.log('[CONVERSATION_REVIEW] Using fallback mock data');
            const mockConversations = getRandomConversations(null, 5);
            // console.log('[CONVERSATION_REVIEW] Mock conversations generated:', mockConversations);
            setPreShuffleConversations(mockConversations);
            setConversationGuesses(new Array(mockConversations.length).fill(null));
            // console.log('[CONVERSATION_REVIEW] Fallback mock data loaded successfully');
        }
    };    // Conversation review handlers
    const handleConversationGuess = (leftGuess, rightGuess) => {
        // Reset activity timestamp when user interacts with conversation review
        lastActivityTimestampRef.current = Date.now();
        setWarningShown(false);
        // console.log(`${role} - Activity timestamp reset - conversation guess`);
        
        setCurrentConversationGuess({ leftWindow: leftGuess, rightWindow: rightGuess });
    };

    const submitConversationGuess = () => {
        // Reset activity timestamp when user submits guess
        lastActivityTimestampRef.current = Date.now();
        setWarningShown(false);
        // console.log(`${role} - Activity timestamp reset - conversation guess submission`);
        
        if (!currentConversationGuess.leftWindow || !currentConversationGuess.rightWindow) {
            alert('Please make a guess for both conversations before submitting.');
            return;
        }

        const currentConversation = preShuffleConversations[currentConversationIndex];
        const isCorrect = (
            (currentConversationGuess.leftWindow === 'human' && currentConversation.leftIsHuman) ||
            (currentConversationGuess.leftWindow === 'bot' && !currentConversation.leftIsHuman)
        ) && (
            (currentConversationGuess.rightWindow === 'human' && currentConversation.rightIsHuman) ||
            (currentConversationGuess.rightWindow === 'bot' && !currentConversation.rightIsHuman)
        );

        const newGuesses = [...conversationGuesses];
        newGuesses[currentConversationIndex] = {
            leftGuess: currentConversationGuess.leftWindow,
            rightGuess: currentConversationGuess.rightWindow,
            isCorrect: isCorrect,
            leftActual: currentConversation.leftIsHuman ? 'human' : 'bot',
            rightActual: currentConversation.rightIsHuman ? 'human' : 'bot'
        };
        setConversationGuesses(newGuesses);
        setShowConversationFeedback(true);
    };

    const tryAgain = () => {
        // Reset activity timestamp when user tries again
        lastActivityTimestampRef.current = Date.now();
        setWarningShown(false);
        // console.log(`${role} - Activity timestamp reset - try again`);
        
        // Reset the current conversation state for retry
        setCurrentConversationGuess({ leftWindow: '', rightWindow: '' });
        setShowConversationFeedback(false);
        
        // Clear the incorrect guess from the array so they can try again
        const newGuesses = [...conversationGuesses];
        newGuesses[currentConversationIndex] = null;
        setConversationGuesses(newGuesses);
    };    const nextConversation = () => {
        // Reset activity timestamp when user progresses through conversations
        lastActivityTimestampRef.current = Date.now();
        setWarningShown(false);
        // console.log(`${role} - Activity timestamp reset - next conversation`);
        
        if (currentConversationIndex < preShuffleConversations.length - 1) {
            setCurrentConversationIndex(currentConversationIndex + 1);
            setCurrentConversationGuess({ leftWindow: '', rightWindow: '' });
            setShowConversationFeedback(false);        } else {
            // All conversations reviewed, transition to post-shuffle phase
            // console.log('🔄 All conversations reviewed, transitioning to test phase');
              // Stop conversation review timer and calculate total time
            stopConversationReviewTimer();
            const totalReviewTime = Math.floor((Date.now() - conversationReviewStartTime) / 1000);
            // console.log(`🕐 Conversation review completed in ${totalReviewTime} seconds`);
            
            setConversationPhase('completed');
            
            // Set waiting states for partner synchronization
            setWaitingForPartnerReview(true);
            setWaitingForReviewStartTime(Date.now());
            setWaitingForReviewElapsed(0);
            
            // Don't set anonymous mode or start timers yet - wait for backend sync
            // The backend will coordinate with the other participant via conversation_review_sync
              // Emit synchronization event to backend with review completion data
            socket.emit('conversation_review_completed', {
                pair_id: pairId,
                role: role,
                username: username,                review_time_seconds: totalReviewTime,
                total_conversations: preShuffleConversations.length,
                correct_guesses: conversationGuesses.filter(guess => guess?.isCorrect).length,
                remaining_time_when_completed: conversationReviewElapsed // Add current remaining time
            });
            
            // Show waiting message while backend coordinates with partner
            // console.log('🔄 Waiting for partner to complete conversation review...');
        }
    };

    const startTimer = (duration, phase) => {
        setTimeRemaining(duration);
        setTotalPhaseTime(duration);
        setCurrentPhase(phase);
        
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
        }
        
        timerIntervalRef.current = setInterval(() => {
            setTimeRemaining((prevTime) => {
                if (prevTime <= 1) {
                    clearInterval(timerIntervalRef.current);
                    if (phase === 'anonymous_phase') {
                        setShowOverlay(true);
                    }
                    return 0;
                }
                return prevTime - 1;
            });
        }, 1000);
    };


    const quizConfig = {
        experimenter: {
            questions: [
                {
                    question: "What is the purpose of the conversation review phase?",
                    options: [
                        "To review conversations and guess which was with a human and which was with the bot",
                        "To go to sleep and be inactive",
                        "To trick the other participant into thinking I am a bot"
                    ],
                    correctAnswer: 0
                },
                {
                    question: "What is your main task in the test phase?",
                    options: [
                        "To chat only with a bot",
                        "To convince the tester that I am human",
                        "To pretend to be a bot"
                    ],
                    correctAnswer: 1
                },
                {
                    question: "In the main test phase, is it true that if the tester correctly identifies you as human, both of you will receive a bonus payment?",
                    options: [
                        "Yes, we will both receive a $1 bonus",
                        "No, I won't receive any bonus",
                        "I will receive a bonus regardless of the tester's guess"
                    ],
                    correctAnswer: 0
                }
            ]
        },
        tester: {
            questions: [
                {
                    question: "What is the purpose of the conversation review phase?",
                    options: [
                        "To review conversations and guess which was with a human and which was with the bot",
                        "To go to sleep and be inactive",
                        "To trick the other participant into thinking I am a bot"
                    ],
                    correctAnswer: 0
                },
                {
                    question: "What is your main task in the test phase?",
                    options: [
                        "To not write anything",
                        "To chat with both candidates and identify which candidate is human and which is a bot",
                        "To pretend to be a bot"
                    ],
                    correctAnswer: 1
                },
                                {
                    question: "In the main test phase, what happens if you correctly identify which candidate is human and which is a bot?",
                    options: [
                        "I will get disconnected",
                        "Both I and the human responder will receive a $1 bonus each",
                        "I will lose money"
                    ],
                    correctAnswer: 1
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
    };    useEffect(() => {
        // Log when socket events are registered
        // // console.log('🎯 [SOCKET] Registering quiz events for role:', role);
        
        socket.on('quiz_completed', (data) => {
            if (data.role !== role) {
                // console.log('[QUIZ_COMPLETED] Partner completed quiz, updating partner status');
                // console.log('[QUIZ_COMPLETED] Current state:', {
                //     quizStep,
                //     shuffleEnabled,
                //     conversationPhase,
                //     conversationReviewStarted
                // });
                setPartnerQuizStatus('completed');                // If we've already completed our quiz, mark that we're ready but don't auto-start conversation review
                if (quizStep === 'completed') {
                    // console.log('[QUIZ_COMPLETED] Both quizzes complete, but waiting for both to dismiss notifications');
                    // End waiting state
                    setWaitingForPartner(false);
                    setWaitingStartTime(null);
                    setWaitingElapsedTime(0);
                    
                    // Don't automatically start conversation review or dismiss notifications
                    // Let users manually dismiss their notifications - conversation review will start via useEffect
                } else {
                    // console.log('[QUIZ_COMPLETED] Partner completed but we have not completed yet');
                }
            } else {
                // console.log('[QUIZ_COMPLETED] Received our own completion event, ignoring');
            }
        });

        socket.on('quiz_failed', (data) => {
            if (data.role !== role) {
                // // console.log('🎯 [QUIZ-FAIL] Partner failed quiz');
                setPartnerQuizStatus('failed');
                setPartnerHasFailed(true); // Set the flag when partner fails

                // If we've already completed our quiz, generate bonus code
                if (quizStep === 'completed') {
                    // // console.log('🎯 [QUIZ-FAIL] We completed but partner failed, generating bonus');
                    generateAndNavigateToBonusCode();
                } else {
                    // // console.log('🎯 [QUIZ-FAIL] Partner failed but we have not completed yet');
                }
            } else {
                // // console.log('🎯 [QUIZ-FAIL] Received our own failure event, ignoring');
            }
        });

        return () => {
            // // console.log('🎯 [SOCKET] Cleaning up quiz event listeners');
            socket.off('quiz_completed');
            socket.off('quiz_failed');
        };
    }, [role, quizStep]);
    
    // Modify the quiz submission logic in both notification components
    const handleQuizSubmission = async (isCorrect) => {
        // console.log('[QUIZ_SUBMISSION] Quiz submission started, isCorrect:', isCorrect);
        // console.log('[QUIZ_SUBMISSION] Current state:', {
        //     shuffleEnabled,
        //     conversationPhase,
        //     conversationReviewStarted,
        //     partnerQuizStatus,
        //     partnerHasFailed
        // });
        
        if (isCorrect) {
            // console.log('[QUIZ_SUBMISSION] Quiz passed, setting step to completed');
            setQuizStep('completed');
            
            // console.log('[QUIZ_SUBMISSION] Emitting quiz_completed event to backend');
            socket.emit('quiz_completed', {pair_id: pairId, role});
            // console.log('[QUIZ_SUBMISSION] quiz_completed event emitted with data:', {pair_id: pairId, role});            // Check if partner has already failed when we complete our quiz
            if (partnerHasFailed) {
                // console.log('[QUIZ_SUBMISSION] Partner already failed, generating bonus code');
                await generateAndNavigateToBonusCode();            } else if (partnerQuizStatus === 'completed') {
                // console.log('[QUIZ_SUBMISSION] Partner also completed, but waiting for both to dismiss notifications');
                // Don't automatically start conversation review - wait for both users to dismiss their notifications
                // The conversation review will start when both have dismissed via the existing useEffect logic
            } else {
                // console.log('[QUIZ_SUBMISSION] Waiting for partner to complete quiz');
                // Start waiting state
                setWaitingForPartner(true);
                setWaitingStartTime(Date.now());
                setWaitingElapsedTime(0);
            }
            handleDismissNotification();
        } else {
            // console.log('[QUIZ_SUBMISSION] Quiz failed, emitting quiz_failed event');
            socket.emit('quiz_failed', {pair_id: pairId, role});
            // console.log('[QUIZ_SUBMISSION] Navigating to disconnected page');
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
                    </p>                    <p>
                        <strong>The interaction will be composed of two phases,</strong> the conversation review phase (5
                        minutes)
                        and the test phase (5 minutes).
                    </p>
                    <p>
                        In the conversation review phase, you will review real conversations and guess which is which.
                        Take your time to read both conversations carefully in each of the 5 samples, if you finish early, you will need to 
                        wait for your partner to finish as well.
                    </p>
                    <p>
                        In the test phase, you will chat with a human and a bot in two separate rooms, but you will not know which is which, 
                        and in the end of the test phase, you will have to guess which candidate is human and which is bot.
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
                    <strong>The interaction will be composed of two phases,</strong> the conversation review phase (5
                    minutes)
                    and the test phase (5 minutes).
                </p>
                <p>
                    In the conversation review phase, you will review real conversations and guess which was with a human and which is with the bot.
                    Take your time to read both conversations carefully in each of the 5 samples, if you finish early, you will need to 
                    wait for your partner to finish as well.
                </p>
                <p>
                    In the test phase, you will chat with a human tester, and you must convince them that you are human.
                    If the tester guesses you are human, both of you will receive a $1.00 bonus each.
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
            // // // console.log("Human Demographics for Display (Post-Shuffle):", humanParticipantDemographics); // DEBUG LINE
        } else {
            // PRE-SHUFFLE:
            if (roomTypeArgument === 'experimenter') {
                demDataForDisplay = humanParticipantDemographics;
                isLoadingDemographics = isLoadingHumanDemographics;
                // // // console.log("Human Demographics for Display (Pre-Shuffle, Experimenter Window):", humanParticipantDemographics); // DEBUG LINE
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
    return (        <div className={`chat-container ${shuffling ? 'shuffling' : ''} ${role === 'tester' && showOverlay ? 'with-submission' : ''} ${role === 'tester' ? 'tester-role' : ''}`}>
            
            {showNotificationForTester && role === 'tester' && (
                <div className="popup-overlay">
                    <div className="popup" ref={popupRef}>
                        {quizStep === 'instructions' && (                            <>
                                <h3>Your Mission: Identify the Human.</h3>

                                <p>
                                    You will review real conversations and then chat with a human and a bot (in two separate rooms). You must identify
                                    who is human and who is a bot.
                                    If you guess correctly, you and the human (responder) will receive <strong>$1.00
                                    bonus</strong> each.
                                </p>

                                <h4>The interaction will be composed of two phases:</h4>
                                <ul>
                                    <li>
                                        <strong>Conversation Review Phase (5 minutes):</strong> You will review 5 human-human and human-bot conversations. 
                                        For each conversation, you'll guess which is which and 
                                        the option to try again will be given you if you fail in guessing. 
                                        This will help you learn to distinguish between humans and bots.
                                        In the conversation review phase, you will review real conversations and guess which was with a human and which is with the bot.
                                        Take your time to read both conversations carefully in each of the 5 samples, if you finish early, you will need to 
                                        wait for your partner to finish as well.
                                    </li>
                                    <li>
                                        <strong>Test Phase (5 minutes):</strong> You will chat with both a human and a bot 
                                        in separate rooms. You must identify which room contains the human and which contains the bot.
                                        If you guess correctly, you and the human will receive a <strong>$1.00 bonus</strong> each.
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
                        )}                        {(quizStep === 'completed' && !chatTimerStarted && conversationPhase === 'review') && (
                            <div className="timer-status">
                                {/* Show different message based on partner quiz completion status */}
                                {partnerQuizStatus !== 'completed' ? (
                                    <>
                                        <p>Please wait while your partner completes the quiz...</p>
                                        <p>Your status: Quiz completed</p>
                                        <p>Partner status: Still taking quiz...</p>
                                    </>
                                ) : (
                                    <>
                                        <p>Waiting for both participants to complete the quiz before starting conversation review...</p>
                                        <p>Your status: Quiz completed</p>
                                        <p>Partner status: Quiz completed</p>
                                    </>
                                )}
                                {waitingForPartner && (
                                    <div className="waiting-timer-display">
                                        <p>⏱️ Waiting time: {Math.floor(waitingElapsedTime / 60)}:{(waitingElapsedTime % 60).toString().padStart(2, '0')}</p>
                                        <p style={{ fontSize: '0.9em', color: '#666' }}>Please wait while your partner completes the quiz...</p>
                                    </div>
                                )}
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
                                        ref={submitButtonRef}
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
                    <div className="popup" ref={popupRef}>
                        {quizStep === 'instructions' && (
                            <>
                                <h3>Your Mission: Convince the Tester You're Human.</h3>

                                <h4>The interaction will be composed of two phases:</h4>
                                <ul>
                                    <li>
                                        <strong>Conversation Review Phase (5 minutes):</strong> You will review 5 human-human and human-bot conversations. 
                                        For each conversation, you'll guess which is which and 
                                        the option to try again will be given you if you fail in guessing.
                                        In the conversation review phase, you will review real conversations and guess which was with a human and which is with the bot.
                                        Take your time to read both conversations carefully in each of the 5 samples, if you finish early, you will need to 
                                        wait for your partner to finish as well.
                                    </li>
                                    <li>
                                        <strong>Test Phase (5 minutes):</strong> You will chat with a human Tester, and you must convince them that you are human.
                                        If the Tester guesses you are human, both of you will receive a <strong>$1.00 bonus</strong> each.
                                    </li>
                                </ul>
                                <h4>Important:</h4>
                                <ul>
                                    <li>⚠️ Stay active to avoid disconnection.</li>
                                    <li>You must pass a quiz on these instructions. Failure
                                        means no payment.</li>
                                </ul>

                                <button
                                    onClick={() => setQuizStep('quiz')}
                                    className="popup-continue-button"
                                >
                                    Continue to Quiz
                                </button>
                            </>
                        )}                        {(quizStep === 'completed' && !chatTimerStarted) && (
                            <div className="timer-status">
                                <p>Waiting for both participants to complete the quiz before starting...</p>
                                <p>Your status: Quiz completed</p>
                                <p>Partner
                                    status: {partnerQuizStatus === 'completed' ? 'Quiz completed' : 'Still taking quiz...'}</p>
                                {waitingForPartner && (
                                    <div className="waiting-timer-display">
                                        <p>⏱️ Waiting time: {Math.floor(waitingElapsedTime / 60)}:{(waitingElapsedTime % 60).toString().padStart(2, '0')}</p>
                                        <p style={{ fontSize: '0.9em', color: '#666' }}>Please wait while your partner completes the quiz...</p>
                                    </div>
                                )}
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
                                        ref={submitButtonRef}
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

            {/* Conversation Review Phase */}
            {(() => {
                // console.log('[RENDER_DEBUG] Conversation Review conditional check:', {
                //     conversationReviewStarted,
                //     conversationPhase,
                //     conversationPhaseNotCompleted: conversationPhase !== 'completed',
                //     preShuffleConversationsLength: preShuffleConversations.length,
                //     shouldShow: conversationReviewStarted && conversationPhase !== 'completed' && preShuffleConversations.length > 0
                // });
                return null;
            })()}            {conversationReviewStarted && conversationPhase !== 'completed' && preShuffleConversations.length > 0 && (
                <div className="conversation-review-container">
                    <div className="conversation-review-header">
                        <h2>Conversation Review Phase</h2>
                        <p>Review these real conversations and guess which participant is real human chat and which is the bot chat.</p>
                        <p>Conversation {currentConversationIndex + 1} of {preShuffleConversations.length}</p>
                        
                        {/* Conversation Review Timer Display */}
                        <div className="conversation-review-timer">
                            <div className="timer-label">Review Time:</div>
                            <div className="timer-value">
                                {Math.floor(conversationReviewElapsed / 60)}:{(conversationReviewElapsed % 60).toString().padStart(2, '0')}
                            </div>
                        </div>
                    </div>

                    <div className="conversation-pair">
                        <div className="conversation-window left-conversation">
                            <h3>Conversation A</h3>
                            <div className="conversation-messages">
                                {preShuffleConversations[currentConversationIndex]?.leftConversation?.map((msg, index) => (
                                    <div key={index} className={`conversation-message ${msg.sender === 'participant' ? 'participant-msg' : 'other-msg'}`}>
                                        <strong>{msg.sender === 'participant' ? 'Participant' : 'Other'}:</strong> {msg.text}
                                    </div>
                                ))}
                            </div>                            {!showConversationFeedback && (
                                <div className="conversation-guess">
                                    <label>Your guess for Conversation A:</label>
                                    <select 
                                        value={currentConversationGuess.leftWindow} 
                                        onChange={(e) => {
                                            const selectedValue = e.target.value;
                                            if (selectedValue === "human") {
                                                setCurrentConversationGuess({leftWindow: "human", rightWindow: "bot"});
                                            } else if (selectedValue === "bot") {
                                                setCurrentConversationGuess({leftWindow: "bot", rightWindow: "human"});
                                            } else {
                                                setCurrentConversationGuess({...currentConversationGuess, leftWindow: selectedValue});
                                            }
                                        }}
                                    >
                                        <option value="">Select...</option>
                                        <option value="human">Human</option>
                                        <option value="bot">Bot</option>
                                    </select>
                                </div>
                            )}
                            {showConversationFeedback && conversationGuesses[currentConversationIndex] && (
                                <div className={`conversation-feedback ${conversationGuesses[currentConversationIndex].leftGuess === conversationGuesses[currentConversationIndex].leftActual ? 'correct' : 'incorrect'}`}>
                                    <p><strong>Your guess:</strong> {conversationGuesses[currentConversationIndex].leftGuess}</p>
                                    <p><strong>Actual:</strong> {conversationGuesses[currentConversationIndex].leftActual}</p>
                                    <p>{conversationGuesses[currentConversationIndex].leftGuess === conversationGuesses[currentConversationIndex].leftActual ? '✓ Correct!' : '✗ Incorrect'}</p>
                                </div>
                            )}
                        </div>

                        <div className="conversation-window right-conversation">
                            <h3>Conversation B</h3>
                            <div className="conversation-messages">
                                {preShuffleConversations[currentConversationIndex]?.rightConversation?.map((msg, index) => (
                                    <div key={index} className={`conversation-message ${msg.sender === 'participant' ? 'participant-msg' : 'other-msg'}`}>
                                        <strong>{msg.sender === 'participant' ? 'Participant' : 'Other'}:</strong> {msg.text}
                                    </div>
                                ))}
                            </div>                            {!showConversationFeedback && (
                                <div className="conversation-guess">
                                    <label>Your guess for Conversation B:</label>
                                    <select 
                                        value={currentConversationGuess.rightWindow} 
                                        onChange={(e) => {
                                            const selectedValue = e.target.value;
                                            if (selectedValue === "human") {
                                                setCurrentConversationGuess({leftWindow: "bot", rightWindow: "human"});
                                            } else if (selectedValue === "bot") {
                                                setCurrentConversationGuess({leftWindow: "human", rightWindow: "bot"});
                                            } else {
                                                setCurrentConversationGuess({...currentConversationGuess, rightWindow: selectedValue});
                                            }
                                        }}
                                    >
                                        <option value="">Select...</option>
                                        <option value="human">Human</option>
                                        <option value="bot">Bot</option>
                                    </select>
                                </div>
                            )}
                            {showConversationFeedback && conversationGuesses[currentConversationIndex] && (
                                <div className={`conversation-feedback ${conversationGuesses[currentConversationIndex].rightGuess === conversationGuesses[currentConversationIndex].rightActual ? 'correct' : 'incorrect'}`}>
                                    <p><strong>Your guess:</strong> {conversationGuesses[currentConversationIndex].rightGuess}</p>
                                    <p><strong>Actual:</strong> {conversationGuesses[currentConversationIndex].rightActual}</p>
                                    <p>{conversationGuesses[currentConversationIndex].rightGuess === conversationGuesses[currentConversationIndex].rightActual ? '✓ Correct!' : '✗ Incorrect'}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="conversation-review-controls">
                        {!showConversationFeedback ? (
                            <button 
                                onClick={submitConversationGuess}
                                disabled={!currentConversationGuess.leftWindow || !currentConversationGuess.rightWindow}
                                className="submit-guess-button"
                            >
                                Submit Guess
                            </button>
                        ) : (
                            <>
                                {conversationGuesses[currentConversationIndex]?.isCorrect ? (
                                    <button 
                                        onClick={nextConversation}
                                        className="next-conversation-button"
                                    >
                                        {currentConversationIndex < preShuffleConversations.length - 1 ? 'Next Conversation' : 'Start Test Phase'}
                                    </button>
                                ) : (
                                    <button 
                                        onClick={tryAgain}
                                        className="try-again-button"
                                    >
                                        Try Again
                                    </button>
                                )}
                            </>
                        )}
                    </div>                </div>
            )}

            {/* Waiting for Partner Review UI */}
            {waitingForPartnerReview && conversationPhase === 'completed' && (
                <div className="waiting-for-partner-container">
                    <div className="waiting-header">
                        <h2>🎉 Conversation Review Complete!</h2>
                        <p>You have successfully completed reviewing all conversations.</p>
                    </div>
                    
                    <div className="waiting-status">
                        <div className="waiting-icon">
                            <div className="spinner"></div>
                        </div>
                        <h3>Waiting for Partner</h3>
                        <p>Your partner is still reviewing their conversations. Please wait while they complete their review.</p>                        <div className="waiting-timer">
                            <div className="timer-label">Maximum Remaining Time:</div>
                            <div className="timer-value">
                                {(() => {
                                    // Calculate partner's actual remaining time
                                    const partnerActualRemaining = Math.max(0, partnerConversationReviewTimeRemaining - waitingForReviewElapsed);
                                    const minutes = Math.floor(partnerActualRemaining / 60);
                                    const seconds = partnerActualRemaining % 60;
                                    
                                    // Debug logging                                    
                                    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                                })()}
                            </div>
                        </div>
                        
                        <div className="next-phase-info">
                            <h4>What happens next?</h4>
                            <p>Once both participants complete their conversation reviews, the test phase will begin automatically. You'll then engage in real-time conversations where you'll need to determine if you're chatting with a human or AI.</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="chat-boxes">
                {role === 'tester' && conversationPhase === 'completed' && roomOrder.map((roomType) => renderChatWindow(roomType))}
                {role === 'experimenter' && conversationPhase === 'completed' && (
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
                )}                {role === 'experimenter' && (conversationPhase !== 'completed' || !isAnonymousMode) && (
                    <div className="experimenter-waiting-container">
                        <div className="experimenter-waiting-message">
                            {/* Show different message based on quiz completion status */}
                            {quizStep === 'completed' && partnerQuizStatus !== 'completed' ? (
                                <>
                                    <h2>Please wait while your partner completes the quiz</h2>
                                    <p>Your partner is still working on the instruction quiz. Once they complete it, you'll both proceed to the conversation review phase.</p>
                                </>
                            ) : (
                                <>
                                    <h2>Please wait while the tester reviews sample conversations</h2>
                                    <p>The tester is currently in the conversation review phase, learning to distinguish between human and bot responses.</p>
                                </>
                            )}
                            <p>You will be able to chat once this phase is completed.</p>
                            <div className="waiting-spinner">
                                <div className="spinner"></div>
                            </div>
                        </div>
                    </div>                )}

                {/* Tester waiting container for when they finish quiz first */}
                {role === 'tester' && quizStep === 'completed' && partnerQuizStatus !== 'completed' && (
                    <div className="tester-waiting-container">
                        <div className="tester-waiting-message">
                            <h2>Please wait while your partner completes the quiz</h2>
                            <p>Your partner is still working on the instruction quiz. Once they complete it, you'll both proceed to the conversation review phase.</p>
                            <p>You will be able to proceed once this phase is completed.</p>
                            <div className="waiting-spinner">
                                <div className="spinner"></div>
                            </div>
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

            {/* Test Phase Start Notification */}
            {showTestPhaseNotification && (
                <div className="popup-overlay">
                    <div className="popup test-phase-notification">
                        <div className="notification-icon">
                            🚀
                        </div>
                        <h2>Ready for the Real Test!</h2>
                        <p>
                            Excellent! Both participants have completed the conversation review phase.
                        </p>
                        <p>
                            <strong>The actual Turing Test chat is about to begin!</strong>
                        </p>
                        <div className="test-phase-instructions">
                            {role === 'tester' ? (
                                <p>
                                    You will now chat with two candidates in separate windows. 
                                    Your goal is to identify which one is human and which is the bot.
                                </p>
                            ) : (
                                <p>
                                    You will now chat with the tester. 
                                    Your goal is to convince them that you are the human participant.
                                </p>
                            )}
                        </div>
                        <div className="test-phase-timer-info">
                            <p><strong>Duration:</strong> 5 minutes</p>
                            <p><strong>Reward:</strong> $1.00 bonus if the tester guesses correctly!</p>
                        </div>
                        <div className="auto-start-message">
                            <p>Starting automatically in a few seconds...</p>
                        </div>
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