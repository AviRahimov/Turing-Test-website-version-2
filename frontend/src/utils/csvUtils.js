// Utility functions for loading and processing CSV conversation data

// Function to load CSV files and parse them
export const loadCSVData = async () => {
  try {
    console.log('Loading CSV data...');
    
    // Fetch CSV files from public folder
    const botResponse = await fetch('/data/df_bot_qa_merged_before_shuffle_llama_model_filtered.csv');
    const humanResponse = await fetch('/data/df_human_qa_merged_before_shuffle_llama_model_filtered.csv');
    
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
export const getRandomConversations = (csvData, count = 5) => {
  console.log('getRandomConversations called with:', csvData);
  
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
  
  // Randomly select pair IDs
  const selectedPairIds = shuffleArray([...commonPairIds]).slice(0, Math.min(count, commonPairIds.length));
  
  // Build conversation pairs
  const conversations = selectedPairIds.map((pairId, index) => {
    const botConversation = botData.filter(row => row.pairId === pairId);
    const humanConversation = humanData.filter(row => row.pairId === pairId);
    
    console.log(`Conversation ${index + 1} (${pairId}):`, {
      botMessages: botConversation.length,
      humanMessages: humanConversation.length
    });
    
    // Format conversations for UI
    const formattedBotConv = formatConversationData(botConversation);
    const formattedHumanConv = formatConversationData(humanConversation);
    
    // Randomly assign which conversation goes to left/right window
    const randomAssignment = Math.random() < 0.5;
    
    return {
      id: `conv_${index}`,
      pairId,
      leftConversation: randomAssignment ? formattedBotConv : formattedHumanConv,
      rightConversation: randomAssignment ? formattedHumanConv : formattedBotConv,
      leftIsHuman: !randomAssignment,
      rightIsHuman: randomAssignment
    };
  });
  
  console.log('Generated conversations:', conversations.length);
  return conversations;
};

// Helper function to format conversation data for UI
const formatConversationData = (conversationData) => {
  const messages = [];
  
  conversationData.forEach((row, index) => {
    if (row.Questions && row.Questions.trim()) {
      messages.push({
        sender: 'participant',
        text: row.Questions.trim()
      });
    }
    if (row.Answer && row.Answer.trim()) {
      messages.push({
        sender: 'other',
        text: row.Answer.trim()
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
      { sender: 'other', text: 'I enjoy processing information and helping users with their queries.' }
    ];
    
    const humanConversation = [
      { sender: 'participant', text: 'Hi there!' },
      { sender: 'other', text: 'Hello! Nice to meet you.' },
      { sender: 'participant', text: 'Where are you from?' },
      { sender: 'other', text: 'I\'m from California. How about you?' }
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
