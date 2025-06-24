const config = {
  SHUFFLE_ENABLED: false,  // Set to true for timer and shuffling, false for immediate anonymous start
  INITIAL_TIMER: 300,       // Only used when SHUFFLE_ENABLED is true
  REAL_TEST_TIMER: 300,     // Duration of the actual test
  PRE_SHUFFLE_TIMER: 300,   // Duration of pre-shuffle known identity phase (seconds)
  POST_SHUFFLE_TIMER: 300,  // Duration of post-shuffle anonymous phase (seconds)
  CHECK_IP: true,         // Set to true to check IP address, false to skip
  ENABLE_BOT_WAKEUP: false,  // Enable/disable the bot wake-up message system
  ENABLE_PROMPT: false,      // Enable/disable the prompt system
  ENABLE_MESSAGE_QUEUE: false,  // Enable/disable the message queue system for bot messages
  // SERVER_URL: 'http://localhost:5000',  // URL of the server for local testing
  SERVER_URL: 'http://54.89.200.237:5000',  // URL of the server
};

export default config;