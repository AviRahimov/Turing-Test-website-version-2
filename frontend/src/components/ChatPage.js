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
    gender: 'Female',
    age: 28,
    occupation: 'Student',
    country: 'USA',
    aiExperience: 'Basic',
    source: 'fixed-bot-profile' // Identifier
};

function ChatPage() {
    usePreventBackNavigation();
    const location = useLocation();
    const navigate = useNavigate();
    const {pairId, role, userId, username} = location.state || {};

    const [currentPersona, setCurrentPersona] = useState(null);
    const [messageQueue, setMessageQueue] = useState([]); // Queue for tester messages
    const messageQueueEnabled = config.ENABLE_MESSAGE_QUEUE;

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

    // state for the instructions modal
    const [showInstructions, setShowInstructions] = useState(false);

    const chatMessagesRef = useRef(null);  // Ref for scrolling to bottom of chat
    const botChatMessagesRef = useRef(null);  // Ref for scrolling to bottom of bot chat

    const {partner_username} = location.state || {}; // Get partner's string username

    const [humanParticipantDemographics, setHumanParticipantDemographics] = useState(null);
    const [isLoadingHumanDemographics, setIsLoadingHumanDemographics] = useState(false);

    // This state will hold what the bot *displays* post-shuffle (which is the human's demographics)
    const [botDisplayedDemographicsPostShuffle, setBotDisplayedDemographicsPostShuffle] = useState(null);

    // At the top of ChatPage component
    const [capturedPreShuffleTesterResponderChat, setCapturedPreShuffleTesterResponderChat] = useState([]);
    const [capturedPreShuffleTesterBotChat, setCapturedPreShuffleTesterBotChat] = useState([]);

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
    };

    // useEffect for handling the start of inactivity checking
    useEffect(() => {
        // Start the inactivity checker only when both conditions are met:
        // 1. Test timer is running (> 0)
        // 2. Timer is not paused (notifications dismissed)
        // 3. Checker hasn't been started yet
        if (realTestTimer > 0 && !timerPaused && !inactivityCheckerActive) {
            // console.log(`${role} - Starting inactivity monitoring system`);
            lastActivityTimestampRef.current = Date.now(); // Initialize the ref
            setInactivityCheckerActive(true);
        }
    }, [realTestTimer, timerPaused, inactivityCheckerActive, role]);

// useEffect for the actual inactivity checking
    useEffect(() => {
        if (inactivityCheckerActive) {
            // console.log(`${role} - Inactivity checker is now running`);

            const inactivityInterval = setInterval(() => {
                const currentTime = Date.now();
                const timeSinceLastActivity = currentTime - lastActivityTimestampRef.current;

                // console.log(`${role} - Last activity: ${Math.floor(timeSinceLastActivity / 1000)} seconds ago`);

                if (timeSinceLastActivity >= 120000) { // 120 seconds
                    // console.log(`${role} - Inactivity limit reached - disconnecting user`);

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
                    // console.log(`${role} - Warning threshold reached - showing warning`);

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
    };

    const sendMessageToBot = () => {
        if (!messageToBot.trim()) return;

        // console.log('User sending message to bot, resetting timestamps and counters');
        // Reset wake-up attempts and activity timestamps when user sends a message
        setWakeupAttemptsCount(0);
        lastActivityTimestampRef.current = Date.now(); // Use ref instead of state
        lastWakeupMessageTimeRef.current = Date.now();
        setWarningShown(false);
        // console.log(`${role} - Activity timestamp reset - message to bot`);

        // If this is a response to a wake-up message, log it
        if (lastWakeupMessageRef.current) {
            // console.log('User responding to wake-up message:', lastWakeupMessageRef.current);
        }

        const newMessage = {sender: role, content: messageToBot};
        setBotMessages((prevBotMessages) => [...prevBotMessages, newMessage]);

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
            testerChatWithExperimenter: messages,
            testerChatWithBot: botMessages,
        };
        // console.log('Chat data being sent:', chatData); // Debug log

        try {
            const response = await axios.post(server_url + '/api/save_chat', chatData);
            // console.log('Response from server:', response.data); // Debug log
        } catch (error) {
            console.error('Error saving chat logs:', error);
        }
    };

    // Initial setup: Socket connection and listeners
    useEffect(() => {
        socket.emit('join', {pair_id: pairId, role: role});

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
                // console.log('Received experimenter_ready event', data);
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
            // console.log('Both participants dismissed notifications, timer starting');
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
        if (!chatTimerStarted || timerPaused || !shuffleEnabled) {
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
    }, [chatTimerStarted, timerPaused, shuffleEnabled]);

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
            // console.log('Both participants completed quiz and dismissed notifications, starting timer');
        }
    }, [quizStep, partnerQuizStatus, testerDismissed, experimenterDismissed]);

    // Handle shuffle logic when pre-shuffle timer reaches 0
    useEffect(() => {
        if (!shuffleEnabled) return;

        if (role === 'tester' && timer === 0 && !isAnonymousMode) {
            console.log("SHUFFLE INITIATED for Tester: Pre-shuffle timer reached 0.");
            setShuffling(true); // For visual shuffle effect

            // --- CAPTURE HISTORIES BEFORE SHUFFLE ---
            // 1. Capture the Tester <-> Human Responder chat history (from 'messages' state)
            // This is the history the bot will take over.
            const testerResponderChatSnapshot = [...messages];
            setCapturedPreShuffleTesterResponderChat(testerResponderChatSnapshot);
            console.log("Captured Tester-Responder chat snapshot length:", testerResponderChatSnapshot.length);

            // 2. Capture the original Tester <-> Bot (Alex) chat history (from 'botMessages' state)
            // This is for the "confusion test" context.
            const originalTesterBotChatSnapshot = [...botMessages];
            setCapturedPreShuffleTesterBotChat(originalTesterBotChatSnapshot);
            console.log("Captured original Tester-Bot chat snapshot length:", originalTesterBotChatSnapshot.length);
            // --- END CAPTURE ---

            setTimeout(() => {
                console.log("SHUFFLE EXECUTION for Tester: Applying post-shuffle states.");
                setupAnonymousRooms();
                saveChatLogs('Before Turing Test: '); // Log before state changes fully apply to UI

                // 3. Overwrite the bot's chat window (`botMessages`) with the Tester-Responder history.
                // The bot will now see and continue this conversation.
                setBotMessages([...testerResponderChatSnapshot]);
                console.log("`botMessages` (bot's window) overwritten with Tester-Responder chat history.");

                // Note: `setMessages([...preShuffleHumanChatHistory]);` from your original code is removed here.
                // `messages` (the human responder's window) should typically continue live and not be reset
                // to its pre-shuffle state, otherwise messages during the shuffle animation in that window would be lost.
                // If you intended to clear it or reset it for some reason, that would be a different requirement.

                // 4. Bot "adopts" human's demographics for display and conversational context
                if (humanParticipantDemographics && !humanParticipantDemographics.error) {
                    setBotDisplayedDemographicsPostShuffle({
                        ...humanParticipantDemographics,
                        source: 'adopted-human-post-shuffle'
                    });
                    console.log("Bot displayed demographics set to human participant's.");
                } else {
                    console.warn("Human demographics not available for bot to adopt post-shuffle. Using fallback.");
                    setBotDisplayedDemographicsPostShuffle(FIXED_BOT_DEMOGRAPHICS);
                }

                // 5. Switch to anonymous mode and set the real test timer
                setIsAnonymousMode(true);
                setRealTestTimer(config.REAL_TEST_TIMER);

                setShuffling(false); // End visual shuffle effect
                console.log("Tester shuffle process complete. Anonymous mode active.");

            }, 3000); // Shuffle animation duration

        } else if (role === 'experimenter' && timer === 0 && !isAnonymousMode) {
            // For experimenter (Human Responder), sync anonymous mode and timer.
            // Their chat history (`messages`) continues naturally.
            console.log("SHUFFLE SYNC for Experimenter: Pre-shuffle timer reached 0.");
            setRealTestTimer(config.REAL_TEST_TIMER);
            setIsAnonymousMode(true); // Experimenter also enters anonymous mode contextually
            console.log("Experimenter shuffle process complete. Anonymous mode active.");
        }
    }, [
        timer,
        role,
        shuffleEnabled,
        isAnonymousMode,
        messages,
        botMessages, // Added as we are now reading from it for snapshot
        humanParticipantDemographics,
        // Include the setters for the new snapshot states if ESLint complains, though typically not needed for setters.
        // However, it's crucial that `messages` and `botMessages` are in the dependency array
        // so their latest versions are captured.
        setCapturedPreShuffleTesterResponderChat, // Added for completeness, though setters usually don't cause re-runs
        setCapturedPreShuffleTesterBotChat       // Added for completeness
        // config.REAL_TEST_TIMER, FIXED_BOT_DEMOGRAPHICS, setupAnonymousRooms, saveChatLogs are typically stable
        // setShuffling, setBotMessages, setBotDisplayedDemographicsPostShuffle, setIsAnonymousMode, setRealTestTimer
    ]);

    // Countdown for the real Turing Test
    useEffect(() => {

        // Don't start if timer is null
        if (realTestTimer === null) return;

        // Don't start if quiz isn't completed by both participants
        if (!chatTimerStarted) {
            // console.log('Timer not started - waiting for quiz completion');
            return;
        }

        // Don't start if either participant hasn't completed the quiz
        if (quizStep !== 'completed' || partnerQuizStatus !== 'completed') {
            // console.log('Timer not started - quiz not completed by both participants');
            return;
        }

        const realTestInterval = setInterval(() => {
            // console.log("Real test timer: ", realTestTimer);
            setRealTestTimer((prev) => {
                if (prev > 0) {
                    return prev - 1;
                } else {
                    clearInterval(realTestInterval);
                    return 0;
                }
            });
        }, 1000);

        return () => {
            // console.log('Cleaning up real test timer');
            clearInterval(realTestInterval);
        };
    }, [
        realTestTimer,
        chatTimerStarted,
        quizStep,
        partnerQuizStatus,
    ]);

    // Navigate to appropriate pages when the Turing Test ends
    useEffect(() => {
        if (realTestTimer === 0) {
            saveChatLogs('During Turing Test');
            setShowOverlay(true);

            // Stop inactivity checker when chat ends
            setInactivityCheckerActive(false);

            if (role === 'experimenter') {
                console.log(`Experimenter (Pair: ${pairId}) - Overlay should be active. Emitting 'experimenter_is_waiting_for_submission'.`);
                // EXPERIMENTER ONLY: Emit an event to notify the tester they are now waiting.
                socket.emit('experimenter_ready', {pair_id: pairId});

                // Set a timeout for 30 seconds
                const timeoutId = setTimeout(async () => {
                    console.log(`Experimenter (Pair: ${pairId}) - 30s timeout reached. Generating code.`);
                    try {
                        const response = await axios.post(server_url + '/api/generate_code', {
                            role: 'experimenter',
                            pairId,
                        });
                        if (response.data.status === 'success') {
                            navigate('/thank_you', {
                                state: {bonusCode: response.data.code, userId, role: 'experimenter', pairId},
                            });
                        }
                    } catch (error) {
                        console.error('Error generating code for responder after timeout:', error);
                        // Potentially navigate to an error page or show a message
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
        // console.log(`${role} - Activity timestamp reset - message to experimenter`);

        const newMessage = {sender: role, content: messageToExperimenter};
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
        };

        if (isAnonymousMode) {
            // POST-SHUFFLE SCENARIO
            // `botMessages` state IS the pre-shuffle Tester-Responder chat history.
            conversationHistoryForAPITurn = botMessages.map(msg => ({
                role: msg.sender === role ? 'user' : 'assistant',
                content: msg.content
            }));

            // For the system prompt, provide:
            // 1. The Tester-Responder history (as the conversation to continue)
            if (capturedPreShuffleTesterResponderChat && capturedPreShuffleTesterResponderChat.length > 0) {
                conversationToContinueCtx = [...capturedPreShuffleTesterResponderChat].slice(-15); // Slice for brevity
            } else {
                // Fallback if preShuffleTesterResponderHistory is not yet populated or empty,
                // use the current botMessages (which should be the same in this scenario)
                conversationToContinueCtx = [...conversationHistoryForAPITurn].slice(-15);
                console.warn("sendMessageToBotQueue (Post-Shuffle): preShuffleTesterResponderHistory was empty/null, using current botMessages for 'conversationToContinueCtx'. Ensure it's correctly populated.");
            }

            // 2. The Responder's demographics (for the bot to display)
            displayedDemographicsCtx = botDisplayedDemographicsPostShuffle || FIXED_BOT_DEMOGRAPHICS;

            // 3. The original Tester-Bot (Alex) pre-shuffle history (for the "confusion test")
            // Ensure capturedPreShuffleTesterBotChat state is populated correctly by ChatPage logic
            if (capturedPreShuffleTesterBotChat && capturedPreShuffleTesterBotChat.length > 0) {
                originalTesterBotHistoryCtx = [...capturedPreShuffleTesterBotChat].slice(-10); // Slice for brevity
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

        if (!inactivityCheckerActive || role !== 'tester' || realTestTimer === 0) {
            if (wakeupIntervalRef.current) {
                // console.log('Cleaning up existing wake-up interval');
                clearInterval(wakeupIntervalRef.current);
                wakeupIntervalRef.current = null;
            }
            return;
        }

        // Only create new interval if one doesn't exist
        if (!wakeupIntervalRef.current) {
            // console.log('Starting wake-up interval checker');

            // Generate random delay once when starting the checker
            wakeupDelayRef.current = Math.floor(Math.random() * (45000 - 25000) + 25000);
            // console.log('Set wake-up delay to:', wakeupDelayRef.current / 1000, 'seconds');


            wakeupIntervalRef.current = setInterval(() => {

                const currentTime = Date.now();
                const timeSinceLastActivity = currentTime - lastActivityTimestampRef.current;
                const timeSinceLastBotActivity = currentTime - lastBotActivityTimestampRef.current;
                const timeSinceLastWakeup = currentTime - lastWakeupMessageTimeRef.current;

                if (timeSinceLastActivity >= wakeupDelayRef.current &&
                    timeSinceLastBotActivity >= 20000 &&
                    timeSinceLastWakeup >= wakeupDelayRef.current &&
                    wakeupAttemptsCount < MAX_WAKEUP_ATTEMPTS) {
                    // console.log('Conditions met - Sending bot wakeup message...');
                    sendBotWakeupMessage();
                    lastWakeupMessageTimeRef.current = currentTime;
                    // Generate new delay for next wake-up
                    wakeupDelayRef.current = Math.floor(Math.random() * (45000 - 25000) + 25000);
                    // console.log('Set new wake-up delay to:', wakeupDelayRef.current / 1000, 'seconds');
                }
            }, 5000);
        }

        // Cleanup function
        return () => {
            if (wakeupIntervalRef.current) {
                // console.log('Cleaning up wake-up interval');
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
                {sender: 'bot', content: botReply}
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
            const response = await axios.post(server_url + '/api/generate_code', {
                role: 'tester',
                userId,
                pairId,
                guessCandidateA,
                guessCandidateB,
                realIdentityA,
                realIdentityB
            });

            // console.log("The user ID in the chat page is: ", userId);
            if (response.data.status === 'success') {
                socket.emit('tester_guessed', {pairId});

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
            // console.log('[QUIZ-FAIL] Attempting to generate bonus code for passing user');
            // Get the user's IP first
            const ipResponse = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipResponse.json();
            const userIp = ipData.ip;
            // console.log('[QUIZ-FAIL] Got user IP:', userIp);

            const response = await axios.post(server_url + '/api/generate_code', {
                pairId,
                role,
                userId,
                userIp // Add the user's IP to the request
            });
            // console.log('[QUIZ-FAIL] Generate code response:', response.data);

            if (response.data.status === 'success') {
                // Call the unblock endpoint
                try {
                    const unblockResponse = await axios.post(server_url + '/api/unblock_ip', {
                        ip: userIp
                    });
                    // console.log('[QUIZ-FAIL] Unblock IP response:', unblockResponse.data);
                } catch (unblockError) {
                    console.error('[QUIZ-FAIL] Error unblocking IP:', unblockError);
                }

                // console.log('[QUIZ-FAIL] Navigating to thank you page');
                navigate('/thank_you', {
                    state: {
                        bonusCode: response.data.code,
                        userId,
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
        // console.log('[SOCKET] Registering quiz events');

        socket.on('quiz_completed', (data) => {
            // console.log('[QUIZ-COMPLETED] Event received with data:', data);

            if (data.role !== role) {
                // console.log('[QUIZ-COMPLETED] Both quizzes complete, starting chat timer');
                setPartnerQuizStatus('completed');

                // If we've already completed our quiz, start the chat timer
                if (quizStep === 'completed') {
                    setChatTimerStarted(true);
                }
            }
        });

        socket.on('quiz_failed', (data) => {
            // console.log('[QUIZ-FAIL] Received quiz_failed event:', {
            //     data,
            //     currentRole: role,
            //     currentQuizStep: quizStep,
            //     partnerQuizStatus: partnerQuizStatus
            // });

            if (data.role !== role) {
                setPartnerQuizStatus('failed');
                // console.log('[QUIZ-FAIL] Partner failed quiz, current user status:', {
                //     role,
                //     quizStep,
                //     willGenerateBonus: quizStep === 'completed'
                // });

                setPartnerHasFailed(true); // Set the flag when partner fails

                // If we've already completed our quiz, generate bonus code
                if (quizStep === 'completed') {
                    generateAndNavigateToBonusCode();
                }
            }
        });

        return () => {
            socket.off('quiz_completed');
            socket.off('quiz_failed');
        };
    }, [role, quizStep]);

    // Modify the quiz submission logic in both notification components
    const handleQuizSubmission = async (isCorrect) => {
        // console.log('[QUIZ-SUBMIT] Quiz submission:', {
        //     isCorrect,
        //     role,
        //     currentQuizStep: quizStep,
        //     partnerStatus: partnerQuizStatus
        // });

        if (isCorrect) {
            setQuizStep('completed');
            socket.emit('quiz_completed', {pair_id: pairId, role});
            // console.log('[QUIZ-SUBMIT] Emitted quiz_completed event');

            // Check if partner has already failed when we complete our quiz
            if (partnerHasFailed) {
                // console.log('[QUIZ-SUBMIT] Partner already failed, generating bonus code');
                await generateAndNavigateToBonusCode();
            } else if (partnerQuizStatus === 'completed') {
                // Only start chat if partner has completed and not failed
                setChatTimerStarted(true);
            }
            handleDismissNotification();
        } else {
            // console.log('[QUIZ-SUBMIT] Quiz failed, emitting quiz_failed event');
            socket.emit('quiz_failed', {pair_id: pairId, role});
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
                    and the shuffle phase (7 minutes).
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
            // console.log("Human Demographics for Display (Post-Shuffle):", humanParticipantDemographics); // DEBUG LINE
        } else {
            // PRE-SHUFFLE:
            if (roomTypeArgument === 'experimenter') {
                demDataForDisplay = humanParticipantDemographics;
                isLoadingDemographics = isLoadingHumanDemographics;
                // console.log("Human Demographics for Display (Pre-Shuffle, Experimenter Window):", humanParticipantDemographics); // DEBUG LINE
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
            : null;

        // GUESSING PHASE (realTestTimer === 0 and role is 'tester')
        if (role === 'tester' && realTestTimer === 0 && showOverlay) {
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


    return (
        <div className={`chat-container ${shuffling ? 'shuffling' : ''}`}>
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
                                        <strong>Known identity phase (3 minutes):</strong> You will see who is in which
                                        room.
                                        Use this phase to familiarize yourself with the participants' behavior.
                                    </li>
                                    <li>
                                        <strong>Shuffle phase (7 minutes):</strong> The location of both participants
                                        might be swapped,
                                        but both rooms will show your previous chat history and the demographics of the
                                        human participant.
                                        However, still one room will be a human and the other a bot.
                                    </li>
                                </ul>

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

            {role === 'tester' && realTestTimer === 0 && (
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
            )}
        </div>
    );
}

export default ChatPage;