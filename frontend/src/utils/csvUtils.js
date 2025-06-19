// Utility functions for loading and processing CSV conversation data

// Function to load CSV files and parse them
export const loadCSVData = async () => {
  try {
    console.log('Loading CSV data...');
    
    // Fetch CSV files from public folder 
    const botResponse = await fetch('/data/llama_3.2_bot_guess_correct_conversations_with_self_PE_3plus.csv');
    const humanResponse = await fetch('/data/llama_3.2_human_guess_correct_conversations_with_self_PE_3plus.csv');

    if (!botResponse.ok || !humanResponse.ok) {
      throw new Error(`Failed to fetch CSV files. Bot: ${botResponse.status}, Human: ${humanResponse.status}`);
    }
    
    const botCSVText = await botResponse.text();
    const humanCSVText = await humanResponse.text();
    
    console.log('Bot CSV length:', botCSVText.length);
    console.log('Human CSV length:', humanCSVText.length);
    
    // Parse CSV data
    const botData = await parseCSVText(botCSVText);
    const humanData = await parseCSVText(humanCSVText);
    
    console.log('Parsed bot data rows:', botData.length);
    console.log('Parsed human data rows:', humanData.length);
    
    return { botData, humanData };
  } catch (error) {
    console.error('Error loading CSV data:', error);
    console.log('Falling back to mock data');
    // Return mock data for development
    return getMockCSVData();
  }
};

// Function to parse CSV text content
const parseCSVText = async (csvText) => {
  const lines = csvText.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  console.log('CSV Headers:', headers);
  
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line) {
      const values = parseCSVLine(line);
      if (values.length === headers.length) {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] ? values[index].trim() : '';
        });
        data.push(row);
      }
    }
  }
  
  console.log('Sample row:', data[0]);
  return data;
};

// Function to parse a CSV line handling quotes and commas
const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
};

// Function to get 5 random conversations from the data
export const getRandomConversations = (csvData, count = 5, useCommonPairIds = false) => {
  console.log('getRandomConversations called with:', csvData);
  console.log('useCommonPairIds flag:', useCommonPairIds);
  
  if (!csvData.botData || !csvData.humanData) {
    console.warn('CSV data not properly loaded, using mock data');
    return getMockConversations(count);
  }

  const { botData, humanData } = csvData;
  
  console.log('Bot data length:', botData.length);
  console.log('Human data length:', humanData.length);
  
  // Get unique pair IDs
  const botPairIds = [...new Set(botData.map(row => row.pairId))];
  const humanPairIds = [...new Set(humanData.map(row => row.pairId))];
  
  console.log('Bot pair IDs:', botPairIds.slice(0, 5)); // Show first 5
  console.log('Human pair IDs:', humanPairIds.slice(0, 5)); // Show first 5
  
  let selectedBotPairIds, selectedHumanPairIds;
  
  if (useCommonPairIds) {
    // Find common pair IDs
    const commonPairIds = botPairIds.filter(id => humanPairIds.includes(id));
    
    console.log(`Found ${commonPairIds.length} common pair IDs:`, commonPairIds.slice(0, 5));
    
    if (commonPairIds.length < count) {
      console.warn(`Only ${commonPairIds.length} common conversations found, requested ${count}`);
      if (commonPairIds.length === 0) {
        console.log('No common pair IDs found, falling back to mock data');
        return getMockConversations(count);
      }
    }
    
    // Use common pair IDs for both bot and human
    const selectedCommonPairIds = shuffleArray([...commonPairIds]).slice(0, Math.min(count, commonPairIds.length));
    selectedBotPairIds = selectedCommonPairIds;
    selectedHumanPairIds = selectedCommonPairIds;
  } else {
    // Use separate pair IDs for bot and human conversations
    console.log('Using separate pair IDs for bot and human conversations');
    selectedBotPairIds = shuffleArray([...botPairIds]).slice(0, Math.min(count, botPairIds.length));
    selectedHumanPairIds = shuffleArray([...humanPairIds]).slice(0, Math.min(count, humanPairIds.length));
    
    console.log('Selected bot pair IDs:', selectedBotPairIds);
    console.log('Selected human pair IDs:', selectedHumanPairIds);
  }  
  // Build conversation pairs
  const conversations = [];
  const maxConversations = useCommonPairIds ? 
    Math.min(count, selectedBotPairIds.length) : 
    Math.min(count, Math.min(selectedBotPairIds.length, selectedHumanPairIds.length));
  
  for (let index = 0; index < maxConversations; index++) {
    const botPairId = selectedBotPairIds[index];
    const humanPairId = useCommonPairIds ? selectedHumanPairIds[index] : selectedHumanPairIds[index];
    
    const botConversation = botData.filter(row => row.pairId === botPairId);
    const humanConversation = humanData.filter(row => row.pairId === humanPairId);
    
    console.log(`Conversation ${index + 1} - Bot: ${botPairId}, Human: ${humanPairId}:`, {
      botMessages: botConversation.length,
      humanMessages: humanConversation.length
    });
    
    // Format conversations for UI
    const formattedBotConv = formatConversationData(botConversation);
    const formattedHumanConv = formatConversationData(humanConversation);
    
    // Randomly assign which conversation goes to left/right window
    const randomAssignment = Math.random() < 0.5;
    
    conversations.push({
      id: `conv_${index}`,
      pairId: useCommonPairIds ? botPairId : `${botPairId}_${humanPairId}`,
      leftConversation: randomAssignment ? formattedBotConv : formattedHumanConv,
      rightConversation: randomAssignment ? formattedHumanConv : formattedBotConv,
      leftIsHuman: !randomAssignment,
      rightIsHuman: randomAssignment
    });
  }
  
  console.log('Generated conversations:', conversations.length);
  return conversations;
};

// Helper function to format conversation data for UI
const formatConversationData = (conversationData) => {
  const messages = [];
  
  conversationData.forEach((row, index) => {
    if (row.Questions && row.Questions.trim()) {
      // Split on tilde separator and create separate messages
      const questionTexts = row.Questions.split('~').map(text => text.trim()).filter(text => text.length > 0);
      questionTexts.forEach(text => {
        messages.push({
          sender: 'participant',
          text: text
        });
      });
    }
    if (row.Answer && row.Answer.trim()) {
      // Split on tilde separator and create separate messages
      const answerTexts = row.Answer.split('~').map(text => text.trim()).filter(text => text.length > 0);
      answerTexts.forEach(text => {
        messages.push({
          sender: 'other',
          text: text
        });
      });
    }
  });
  
  console.log('Formatted conversation messages:', messages.length);
  return messages;
};

// Utility function to shuffle an array
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Mock data for development/testing
const getMockCSVData = () => {
  const mockPairIds = ['room_1001', 'room_1002', 'room_1003', 'room_1004', 'room_1005'];
  
  const botData = [];
  const humanData = [];
  
  mockPairIds.forEach(pairId => {
    // Bot conversation
    botData.push(
      { pairId, Questions: 'Hello, how are you?', Answer: '', correctGuess: 'True' },
      { pairId, Questions: '', Answer: 'Hi! I\'m doing well, thanks for asking.', correctGuess: 'True' },
      { pairId, Questions: 'What do you like to do for fun?', Answer: '', correctGuess: 'True' },
      { pairId, Questions: '', Answer: 'I enjoy reading books and playing video games.', correctGuess: 'True' }
    );
    
    // Human conversation
    humanData.push(
      { pairId, Questions: 'Hi there!', Answer: '', correctGuess: 'True' },
      { pairId, Questions: '', Answer: 'Hello! Nice to meet you.', correctGuess: 'True' },
      { pairId, Questions: 'Where are you from?', Answer: '', correctGuess: 'True' },
      { pairId, Questions: '', Answer: 'I\'m from California. How about you?', correctGuess: 'True' }
    );
  });
  
  return { botData, humanData };
};

// Function to generate mock conversations for testing
const getMockConversations = (count = 5) => {
  const conversations = [];
  
  for (let i = 0; i < count; i++) {
    const botConversation = [
      { sender: 'participant', text: 'Hello, how are you?' },
      { sender: 'other', text: 'Hi! I am functioning well, thank you for asking.' },
      { sender: 'participant', text: 'What do you like to do for fun?' },
      { sender: 'other', text: 'I enjoy processing information' },
      { sender: 'other', text: 'helping users with their queries.' }
    ];
    
    const humanConversation = [
      { sender: 'participant', text: 'Hi there!' },
      { sender: 'other', text: 'Hello! Nice to meet you.' },
      { sender: 'participant', text: 'Where are you from?' },
      { sender: 'other', text: 'I\'m from California.' },
      { sender: 'other', text: 'How about you?' }
    ];
    
    const randomAssignment = Math.random() < 0.5;
    
    conversations.push({
      id: `mock_conv_${i}`,
      pairId: `mock_room_${1000 + i}`,
      leftConversation: randomAssignment ? botConversation : humanConversation,
      rightConversation: randomAssignment ? humanConversation : botConversation,
      leftIsHuman: !randomAssignment,
      rightIsHuman: randomAssignment
    });
  }
  
  return conversations;
};
