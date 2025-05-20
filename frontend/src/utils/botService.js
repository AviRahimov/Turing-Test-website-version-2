import axios from 'axios';
import { calculateReplyDelay } from './chatUtils';
import config from "../components/config";

let server_url = config.SERVER_URL;

export const sendBotMessage = async (
    // This is the primary chat history for the API turn.
    // Post-shuffle, this is the Tester-Responder chat (now in bot's window) + new user message.
    conversationMessagesForAPITurn,
    botBasePersonaDetails,
    isWakeupMessage = false,
    // Removed enable_prompt_flag_from_config; backend uses its own BOT_ENABLE_PROMPT config.

    // Contextual information for the backend to construct the system prompt:
    conversationToContinueHistory = null, // Post-shuffle: The Tester-Responder pre-shuffle history.
    displayedDemographicsForSystemPrompt = null, // Post-shuffle: The Responder's demographics.
    originalTesterBotHistory = null // Post-shuffle: The original Tester-Alex pre-shuffle history.
) => {
    try {
        const payloadToBackend = {
            conversationMessages: conversationMessagesForAPITurn, // Corrected: This is the main history for the API call
            botBasePersonaDetails,
            isWakeupMessage,

            // Pass through the contextual histories for system prompt generation
            conversationToContinueHistory,
            displayedDemographicsForSystemPrompt,
            originalTesterBotHistory
        };

        const apiUrl = server_url + '/api/chat_with_bot';

        // Send the payload to the backend
        const backendResponse = await axios.post(apiUrl, payloadToBackend, {
            headers: { 'Content-Type': 'application/json' }
        });

        if (backendResponse && backendResponse.data && typeof backendResponse.data.reply === 'string') {
            const botReplyContent = backendResponse.data.reply;
            await new Promise((resolve) => setTimeout(resolve, calculateReplyDelay(botReplyContent)));
            return botReplyContent;
        } else {
            const errorMessage = backendResponse?.data?.error || "Bot did not provide a valid reply from backend.";
            throw new Error(errorMessage);
        }

    } catch (error) {
        let errorMessage = "Failed to get a response from the bot via backend.";
        if (error.response) {
            errorMessage = error.response.data?.error || error.response.statusText || errorMessage;
        } else if (error.request) {
            errorMessage = "Could not connect to the backend bot service.";
        } else {
            errorMessage = error.message || errorMessage;
        }
        console.error('Error in sendBotMessage (botService.js):', errorMessage, error);
        throw new Error(errorMessage);
    }
};