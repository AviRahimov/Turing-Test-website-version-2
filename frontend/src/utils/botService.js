import { calculateReplyDelay } from './chatUtils';
import config from "../components/config";

let server_url = config.SERVER_URL;


export const sendBotMessage = async (
    userAndBotMessages, // Full conversation history [{sender: 'user'/'bot', content: '...'}, ...]
    currentPersona,     // { name, gender, age }
    isWakeupMessage = false,
    lastWakeupMessageContent = null, // Just the content string of the last wakeup message
    enableSystemPrompt // Boolean, from config.ENABLE_PROMPT
) => {
    try {
        const payload = {
            conversationHistory: userAndBotMessages,
            persona: currentPersona,
            isWakeup: isWakeupMessage,
            lastWakeupContent: lastWakeupMessageContent,
            useSystemPrompt: enableSystemPrompt,
        };

        // Make a POST request to your backend endpoint
        const response = await fetch(server_url + '/api/chat-bot', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to parse error from backend' }));
            console.error('Error from backend chat-bot endpoint:', response.status, errorData);
            throw new Error(errorData.error || `Backend request failed with status ${response.status}`);
        }

        const data = await response.json();
        const botReply = data.botReply;

        // Apply UX delay
        await new Promise((resolve) => setTimeout(resolve, calculateReplyDelay(botReply)));

        return botReply;

    } catch (error) {
        console.error('Error in sendBotMessage (calling backend):', error);
        throw error; // Re-throw to be caught by the calling function in ChatPage.js
    }
};