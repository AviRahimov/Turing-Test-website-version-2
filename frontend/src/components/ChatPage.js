import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000');

function ChatPage() {
  const location = useLocation();
  const { role, pairId } = location.state;

  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    socket.emit('join', { username: role, pair_id: pairId });

    socket.on('message', (data) => {
      setMessages((prevMessages) => [...prevMessages, data]);
    });

    return () => {
      socket.disconnect();
    };
  }, [pairId, role]);

  const sendMessage = async () => {
    if (!message.trim()) return;
    socket.emit('message', { sender: role, message, pair_id: pairId });
    setMessages((prevMessages) => [...prevMessages, { sender: role, message }]);
    setMessage('');
  };

  return (
    <div style={{ margin: '20px auto', maxWidth: '600px' }}>
      <h1 style={{ textAlign: 'center' }}>{role === 'tester' ? 'Tester Chat' : 'Experimenter Chat'}</h1>
      <div
        style={{
          border: '1px solid #ccc',
          borderRadius: '8px',
          height: '400px',
          overflowY: 'scroll',
          padding: '10px',
          backgroundColor: '#f9f9f9',
        }}
      >
        {messages.map((msg, index) => (
          <p key={index} style={{ margin: '5px 0', fontWeight: msg.sender === role ? 'bold' : 'normal' }}>
            <span style={{ color: msg.sender === role ? '#007BFF' : '#555' }}>{msg.sender}:</span> {msg.message}
          </p>
        ))}
      </div>
      <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message"
          style={{
            flex: 1,
            padding: '10px',
            fontSize: '16px',
            borderRadius: '5px',
            border: '1px solid #ccc',
            marginRight: '10px',
          }}
        />
        <button
          onClick={sendMessage}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default ChatPage;
