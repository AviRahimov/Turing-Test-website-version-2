const config = {
  SHUFFLE_ENABLED: false,  // Set to true for timer and shuffling, false for immediate anonymous start
  INITIAL_TIMER: 60,       // Only used when SHUFFLE_ENABLED is true
  REAL_TEST_TIMER: 100,     // Duration of the actual test
  CHECK_IP: false,         // Set to true to check IP address, false to skip
  ENABLE_BOT_WAKEUP: false,  // Enable/disable the bot wake-up message system
  ENABLE_MESSAGE_QUEUE: false,  // Enable/disable the message queue system for bot messages
  // SERVER_URL: 'http://3.93.242.186:5000/',  // URL of the server
  SERVER_URL: 'http://localhost:5000/',  // URL of the server for local testing
};

export default config;