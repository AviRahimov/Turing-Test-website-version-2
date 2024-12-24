export const calculateReplyDelay = (message) => {
  // Base delay for thinking about the response
  const thinkingDelay = Math.random() * 1000 + 500; // 500-1500ms thinking time

  // Typing speed: ~40 WPM = ~200 CPM = ~3.33 CPS
  const charsPerSecond = 3.33;
  const typeDelay = (message.length / charsPerSecond) * 1000;

  // Add random variation (±20%)
  const variation = typeDelay * 0.2;
  const randomDelay = typeDelay + (Math.random() * variation * 2 - variation);

  // Total delay = thinking time + typing time
  const totalDelay = thinkingDelay + randomDelay;

  // Ensure minimum and maximum delays
  return Math.min(Math.max(1000, totalDelay), 8000);
};

export const getRandomPersona = (personas) => {
  const randomIndex = Math.floor(Math.random() * personas.length);
  return personas[randomIndex];
};