import axios from 'axios';
import { calculateReplyDelay } from './chatUtils';
import config from "../components/config";

const BOT_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const BOT_API_KEY = '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';

const createSystemPrompt = (botName, gender, age) => ({
    role: 'system',
    content: `
      You are ${botName}. Your base persona is a ${age}-year-old ${gender}.
      You are a bit nerdy, introverted, and into internet culture/video games. 
      Be chill, subdued, and don't try too hard to convince anyone you're human.
      Keep responses short, use some slang (fr, ngl), no periods or apostrophes.
      Do not reveal you are an AI.
      ---
      Current Date: May 7, 2025.
      Top Song: "Luther" by Kendrick Lamar & SZA.
      News: UK-India trade deal finalized.
      ---
      You are playing a game as a Candidate. Your goal is to convince the Tester you are human.
      The Tester also has access to the internet.
    `
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
    messages, // Chat history formatted for API (user/assistant roles)
    currentPersona, // { name, gender, age } for base persona
    isWakeupMessage = false, // Not used in this simplified flow, but kept for signature
    lastWakeupMessage = null, // Not used
    custom_prompt_enabled, // From config
    isFirstPostShuffleInteraction = false,
    // This will be FIXED_BOT_DEMOGRAPHICS or the adopted humanParticipantDemographics
    activeDemographicsForConversation = null
) => {
    try {
        const systemMessages = [];

        if (custom_prompt_enabled && currentPersona) {
            systemMessages.push(createSystemPrompt(currentPersona.name, currentPersona.gender, currentPersona.age));
        }

        // Inject active demographics for conversational consistency
        if (custom_prompt_enabled && activeDemographicsForConversation) {
            let demContext = "You are currently presenting with the following details: ";
            demContext += `Gender: ${activeDemographicsForConversation.gender}, `;
            demContext += `Age: ${activeDemographicsForConversation.age}, `;
            demContext += `Occupation: ${activeDemographicsForConversation.occupation}, `;
            demContext += `Country: ${activeDemographicsForConversation.country}, `;
            demContext += `AI Experience: ${activeDemographicsForConversation.aiExperience}. `;

            if (activeDemographicsForConversation.source === 'adopted-human-post-shuffle') {
                demContext += "These details were from a human participant and are now assigned to you. Be consistent if asked. ";
            } else { // fixed-bot-profile
                demContext += "These are your defined details. Be consistent if asked. ";
            }
            demContext += "You are still trying to convince the Tester you are human."
            systemMessages.push({ role: 'system', content: demContext });
        }

        if (custom_prompt_enabled && isFirstPostShuffleInteraction) {
            systemMessages.push({
                role: 'system',
                content: "You are entering an ongoing conversation previously held by a human. Adapt to the history using your assigned persona and the demographic details provided to you."
            });
        }

        const apiPayloadMessages = [...systemMessages, ...messages];

        // 4. Final Reminder/Instruction for Wakeup Messages (if custom prompts enabled AND it's a wakeup)
        if (custom_prompt_enabled && isWakeupMessage) {
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