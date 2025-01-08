export const calculateReplyDelay = (message) => {
  // Base delay for thinking about the response
  const thinkingDelay = Math.random() * 2000 + 1000; // 1000-3000ms thinking time

  // Typing speed: ~20 WPM = ~100 CPM = ~1.67 CPS
  const charsPerSecond = 1.67;
  const typeDelay = (message.length / charsPerSecond) * 1000;

  // Add random variation (±20%)
  const variation = typeDelay * 0.2;
  const randomDelay = typeDelay + (Math.random() * variation * 2 - variation);

  // Total delay = thinking time + typing time
  const totalDelay = thinkingDelay + randomDelay;

  // Ensure minimum and maximum delays
  return Math.min(Math.max(2000, totalDelay), 10000);
};

export const getRandomPersona = (personas) => {
  const randomIndex = Math.floor(Math.random() * personas.length);
  return personas[randomIndex];
};