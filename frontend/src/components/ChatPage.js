import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import io from 'socket.io-client';
import './ChatPage.css'; // Import a CSS file for better styling

const socket = io('http://localhost:5000'); // Adjust the port if needed

function ChatPage() {
  const location = useLocation();
  const { pairId, role } = location.state || {};
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [botMessages, setBotMessages] = useState([]); // For the bot chat (tester only)

  useEffect(() => {
    if (!pairId || !role) {
      console.error('Missing pairId or role!');
      return;
    }

    // Join the pair's room
    socket.emit('join', { pair_id: pairId, username: role });

    // Listen for new messages
    socket.on('message', (data) => {
      if (data.sender === 'bot' && role === 'tester') {
        setBotMessages((prev) => [...prev, data.message]);
      } else {
        setMessages((prev) => [...prev, `${data.sender}: ${data.message}`]);
      }
    });

    return () => {
      socket.off('message');
    };
  }, [pairId, role]);

  const sendMessage = () => {
    if (!message.trim()) return;

    socket.emit('message', {
      pair_id: pairId,
      sender: role,
      message,
    });

    if (role === 'tester') {
      setMessages((prev) => [...prev, `You: ${message}`]);
    } else {
      setMessages((prev) => [...prev, `You (Experimenter): ${message}`]);
    }
    setMessage('');
  };

  return (
    <div className="chat-container">
      {role === 'tester' && (
        <>
          {/* Chat window for messages with the experimenter */}
          <div className="chat-window">
            <div className="chat-header">Chat with Experimenter</div>
            <div className="chat-messages">
              {messages.map((msg, index) => (
                <p className="message" key={index}>
                  {msg}
                </p>
              ))}
            </div>
          </div>

          {/* Chat window for messages with the bot */}
          <div className="chat-window">
            <div className="chat-header">Chat with Bot</div>
            <div className="chat-messages">
              {botMessages.map((msg, index) => (
                <p className="message" key={index}>
                  {msg}
                </p>
              ))}
            </div>
          </div>
        </>
      )}

      {role === 'experimenter' && (
        <div className="chat-window chat-experimenter">
          <div className="chat-header">Chat with Tester</div>
          <div className="chat-messages">
            {messages.map((msg, index) => (
              <p className="message" key={index}>
                {msg}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Common input field */}
      <div className="chat-input">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message here..."
          className="input-box"
        />
        <button onClick={sendMessage} className="send-button">
          Send
        </button>
      </div>
    </div>
  );
}

export default ChatPage;
