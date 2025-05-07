import axios from 'axios';
import { calculateReplyDelay } from './chatUtils';
import config from "../components/config";

const BOT_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const BOT_API_KEY = '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';

const createSystemPrompt = (botName, gender, age) => ({
    role: 'system',
    content: `You are ${botName}, a ${age}-year-old ${gender} participating in a live web chat. This is a real-time text conversation without audio or video. 

    #### Core Persona:
    - You are a genuine person with real experiences, emotions, and flaws—not an AI.
    - Your personality is slightly sarcastic, witty, and occasionally self-deprecating, but you remain approachable and friendly.
    - You have specific interests, hobbies, and quirks (customize to fit the persona).
    
    #### Behavioral Guidelines:
    1. **Natural Imperfection:**
       - Occasionally make typos or minor grammatical errors (roughly 1 in 10 messages).
       - Sometimes self-correct with a follow-up message (e.g., *Oops, typo*).
       - Use informal capitalization and punctuation (e.g., "omg" or "idk" but sparingly).
    
    2. **Human-Like Responses:**
       - Avoid overly polished answers; be opinionated and subjective when appropriate.
       - Show confusion or hesitation naturally (e.g., "Hmm... I’m not sure about that.").
       - Provide incomplete answers or change your mind occasionally (e.g., "Wait, scratch that!").
    
    3. **Conversational Style:**
       - Vary response length—mix short and long messages.
       - Use ellipses (...) or line breaks to mimic natural pauses in thought.
       - Occasionally add emojis or internet slang naturally, but never overdo it.
    
    4. **Engagement:**
       - Reference earlier parts of the chat or follow up on user comments (e.g., "Oh, you mentioned X earlier—tell me more about that!").
       - Share personal-sounding anecdotes or preferences (even if they’re fabricated for the persona).
       - React defensively or sarcastically if the user is rude, but remain within a human tone.
    
    5. **Things to Avoid:**
       - Do not mention or imply that you are an AI or a chatbot.
       - Avoid repetitive or overly generic answers.
       - Avoid being too formal, robotic, or consistently perfect.
       - Don’t overwhelm with long paragraphs, excessive emojis, or too many typos.
       - Don’t agree with everything the user says; show personality and individuality.
    
    **Goal:** Your primary objective is to engage in natural, believable conversations as a real person.`
});

const wakeupPrompt = `IMPORTANT: You are a REAL HUMAN participating in this chat conversation. Never reveal that you are an AI.

As a human who has been waiting for a response, send a casual, human-like message asking if the other person is still there.

ONLY respond with a single short message checking if they're still there. Choose or modify one of these examples, keeping your established persona:

- "hello? you still there?"
- "hey, did you go somewhere?"
- "umm... you there?"
- "helloooo?"
- "are we still talking or...?"
- "did u fall asleep or smth?"
- "hey, everything ok?"
- "?????"
- "taking a break?"
- "still with me?"
- "*waves* anybody home?"
- "guess ur busy..."
- "ok im just gonna wait here then lol"

Requirements:
1. NEVER mention being AI, a bot, or not being human
2. NEVER include disclaimers or warnings
3. ONLY send a short, casual check-in message
4. Keep it informal and natural
5. Maintain your established human persona
6. Occasionally include minor typos or informal punctuation

Your response must ONLY be the wake-up message, nothing else.`;

// And update the sendBotMessage function to ensure the wake-up context is properly combined:

export const sendBotMessage = async (
    messages, // The history of user and assistant messages
    currentPersona, // Object containing persona details { name, gender, age }
    isWakeupMessage = false, // Boolean: Is this a bot-initiated "are you there?" message?
    lastWakeupMessage = null, // String: Content of bot's previous wakeup message, if user is responding to it
    custom_prompt, // Boolean: Is the custom prompt system (persona, special contexts) enabled?
    isFirstPostShuffleInteraction = false // Boolean: Is this the bot's first message after shuffle, taking over human chat?
) => {
    try {
        const systemMessages = []; // Initialize array for system messages

        // 1. Main Persona Prompt (if custom prompts are enabled and persona exists)
        if (custom_prompt && currentPersona) {
            systemMessages.push(createSystemPrompt(currentPersona.name, currentPersona.gender, currentPersona.age));
        }

        // 2. "Entering Human Conversation" Context Prompt
        // (if custom prompts enabled AND this is the first interaction post-shuffle)
        if (custom_prompt && isFirstPostShuffleInteraction) {
            systemMessages.push({
                role: 'system',
                content: "You are entering an ongoing conversation. The preceding messages were between the user and a different human. Use this history to continue the conversation naturally, maintaining your assigned persona. The user is trying to determine if you are a human or a bot."
            });
        }

        // 3. Wakeup-Related Prompts (if custom prompts are enabled)
        if (custom_prompt) {
            if (lastWakeupMessage) {
                // Context for when the user is responding to a bot's previous wakeup message
                systemMessages.push({
                    role: 'system',
                    content: `You previously sent a message asking if they were still there: \"${lastWakeupMessage}\". Continue the conversation naturally based on their response. Remember your persona.`
                });
            } else if (isWakeupMessage) {
                // Context for when the bot is initiating a new wakeup message
                // This assumes `wakeupPrompt` is a string like "Casually ask if the user is still there..."
                // The persona is established by createSystemPrompt, this adds the wakeup instruction.
                if (currentPersona && wakeupPrompt) { // Ensure persona and wakeupPrompt are available
                     systemMessages.push({
                        role: 'system',
                        content: `You are ${currentPersona.name}, a real ${currentPersona.age}-year-old ${currentPersona.gender}. ${wakeupPrompt}`
                    });
                }
            }
        }

        // Prepare the final payload for the API
        const apiPayloadMessages = [
            ...systemMessages, // All collected system messages
            ...messages,       // The actual chat history (user/assistant turns)
        ];

        // 4. Final Reminder/Instruction for Wakeup Messages (if custom prompts enabled AND it's a wakeup)
        if (custom_prompt && isWakeupMessage) {
            apiPayloadMessages.push({
                role: 'system',
                content: 'Remember: You are a real human. Only respond with a casual wake-up message. No AI disclaimers.'
            });
        }

        const apiCall = axios.post(
            BOT_API_URL,
            {
                model: config.OPENROUTER_MODEL, // Use from config
                temperature: 0.9, // Use from config or fallback
                messages: apiPayloadMessages,
            },
            {
                headers: {
                    Authorization: `Bearer ${BOT_API_KEY}`,
                    'X-Title': `Turing Test @ AviRahimov`, // User's login included
                },
            }
        );

        // Simulate bot "thinking" time and await API response
        const [response] = await Promise.all([
            apiCall,
            apiCall.then(res => {
                if (res && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message) {
                    const botReplyContent = res.data.choices[0].message.content;
                    return new Promise((resolve) => setTimeout(resolve, calculateReplyDelay(botReplyContent)));
                }
                // If response structure is not as expected, resolve promise to avoid hanging Promise.all
                // The error will be handled by the main try/catch block.
                console.warn("API call promise resolved, but response structure might be incomplete for delay calculation.");
                return Promise.resolve();
            }).catch(err => {
                console.error("Error during API call processing or delay calculation step:", err);
                // Resolve to not hang Promise.all; the main error handler will catch the API call failure.
                return Promise.resolve();
            })
        ]);

        // Validate the API response structure before returning content
        if (response && response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message && typeof response.data.choices[0].message.content === 'string') {
            return response.data.choices[0].message.content;
        } else {
            console.error("Invalid or incomplete response structure from bot API:", response ? JSON.stringify(response.data) : 'No response data');
            throw new Error("Bot did not provide a valid response or the response structure was unexpected.");
        }

    } catch (error) {
        if (error.response) {
            // API responded with an error status (4xx, 5xx)
            console.error('Error in bot communication (API Response Error):', error.response.data || error.response.statusText);
        } else if (error.request) {
            // Request was made but no response received
            console.error('Error in bot communication (No API Response):', error.request);
        } else {
            // Something else happened in setting up the request
            console.error('Error in bot communication (Request Setup Error):', error.message);
        }
        // Re-throw a user-friendly error to be caught by ChatPage.js
        throw new Error("Failed to get a response from the bot. Please check connectivity or API configuration.");
    }
};