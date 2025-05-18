import axios from 'axios';
import { calculateReplyDelay } from './chatUtils';
import config from "../components/config";

let server_url = config.SERVER_URL;

export const sendBotMessage = async (
    conversationMessages, // Chat history for the current API turn
    botBasePersonaDetails, // { name, gender, age, occupation?, country?, aiExperience? }
    isWakeupMessage = false,
    enable_prompt_flag_from_config, // This will be controlled by backend config or passed if dynamic

    // Context for system prompt generation (passed to backend)
    injectedHistoryForSystemPrompt = null,
    displayedDemographicsForSystemPrompt = null,

    // Other params that ChatPage might pass, like a dynamic enable_prompt flag
    // For simplicity, let's assume enable_prompt logic is primarily on backend now,
    // but if ChatPage needs to override, it could pass a flag.
    // For now, this parameter is removed from here, backend uses its own config.
    // dynamicEnablePromptFlag // Example if needed
) => {
    try {
        // Construct payload for your backend API
        const payloadToBackend = {
            conversationMessages,
            botBasePersonaDetails,
            isWakeupMessage,
            // If you still need a dynamic per-call prompt enable flag from frontend:
            // enable_prompt_flag_from_config: dynamicEnablePromptFlag,
            injectedHistoryForSystemPrompt,
            displayedDemographicsForSystemPrompt
        };

        // console.log("Sending payload to backend /api/chat_with_bot:", payloadToBackend);

        const backendResponse = await axios.post(server_url + '/api/chat_with_bot', payloadToBackend, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (backendResponse && backendResponse.data && typeof backendResponse.data.reply === 'string') {
            const botReplyContent = backendResponse.data.reply;

            // Frontend UX delay can still be applied here if desired
            await new Promise((resolve) => setTimeout(resolve, calculateReplyDelay(botReplyContent)));

            return botReplyContent;
        } else {
            console.error("Invalid or incomplete response from backend API:", backendResponse ? JSON.stringify(backendResponse.data) : 'No response data');
            // Try to extract a more specific error from backend if available
            const errorMessage = backendResponse?.data?.error || "Bot did not provide a valid reply from backend.";
            throw new Error(errorMessage);
        }

    } catch (error) {
        let errorMessage = "Failed to get a response from the bot via backend.";
        if (error.response) {
            // Error from backend HTTP response
            console.error('Error calling backend bot API (Response Error):', error.response.data || error.response.statusText);
            errorMessage = error.response.data?.error || error.response.statusText || errorMessage;
        } else if (error.request) {
            // Request was made but no response received (e.g., backend down)
            console.error('Error calling backend bot API (No Response / Network Error):', error.request);
            errorMessage = "Could not connect to the backend bot service.";
        } else {
            // Something else happened in setting up the request
            console.error('Error calling backend bot API (Request Setup Error):', error.message);
            errorMessage = error.message || errorMessage;
        }
        throw new Error(errorMessage);
    }
};