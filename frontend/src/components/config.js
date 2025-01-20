const config = {
  SHUFFLE_ENABLED: false,  // Set to true for timer and shuffling, false for immediate anonymous start
  INITIAL_TIMER: 60,       // Only used when SHUFFLE_ENABLED is true
  REAL_TEST_TIMER: 300,     // Duration of the actual test
  CHECK_IP: true,         // Set to true to check IP address, false to skip
  SERVER_URL: 'http://3.93.242.186:5000/',  // URL of the server
};

export default config;