const config = {
  SHUFFLE_ENABLED: true,  // Set to true for timer and shuffling, false for immediate anonymous start
  INITIAL_TIMER: 30,       // Only used when SHUFFLE_ENABLED is true
  REAL_TEST_TIMER: 300,     // Duration of the actual test
  CHECK_IP: false,         // Set to true to check IP address, false to skip
  ENABLE_BOT_WAKEUP: false,  // Enable/disable the bot wake-up message system
  ENABLE_PROMPT: true,      // Enable/disable the prompt system
  ENABLE_MESSAGE_QUEUE: false,  // Enable/disable the message queue system for bot messages
  // SERVER_URL: 'http://3.93.242.186:5000/',  // URL of the server
  SERVER_URL: 'http://localhost:5000/',  // URL of the server for local testing
  OPENROUTER_MODEL:  'meta-llama/llama-3.1-405b-instruct',  // Model to use for OpenRouter
};

export default config;