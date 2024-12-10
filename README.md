# Turing Test Project (Version 2)

## Overview
This project simulates a Turing Test setup where testers interact with bots and experimenters to evaluate their ability to distinguish between the two. It includes both a **backend** (Flask with Flask-SocketIO) and a **frontend** (React) to manage user interactions, generate unique codes for participants, handle chat functionality, and collect feedback.

---

## Project Structure
The project is organized into two main directories: `backend` and `frontend`.

### 1. **Backend**
The backend is built using **Flask** and provides REST APIs and WebSocket communication for real-time functionality. 

#### Files and Folders:
- **`app.py`**:  
  The core backend file that:
  - Handles routes and API endpoints.
  - Implements WebSocket communication using Flask-SocketIO.
  - Manages user pairing, unique code generation, chat logs, and feedback storage.

- **`static/`** and **`templates/`**:  
  These folders are placeholders for serving static files or HTML templates if needed in the future.

- **`codes.csv`**:  
  A CSV file to store generated unique codes for testers and experimenters, along with timestamps and roles.

- **`feedback.csv`**:  
  A CSV file to store feedback data submitted by testers after completing their tasks.

- **`chats.json`**:  
  A JSON file to persist chat logs, including conversations between testers, experimenters, and bots.

---

### 2. **Frontend**
The frontend is built using **React** and serves as the user interface for testers and experimenters.

#### Folders and Files:
- **`public/`**:  
  Contains static assets like the project’s favicon and public HTML files.

- **`src/`**:  
  The main source folder containing all React components and logic.

  - **Components**:
    - **`ChatPage.js`**: Handles the chat interface where testers interact with experimenters or bots.
    - **`FeedbackPage.js`**: Displays a form for testers to submit feedback after completing the chat.
    - **`HomePage.js`**: The landing page of the application.
    - **`LoadingPage.js`**: Displays a waiting screen while users are being paired.
    - **`NotFoundPage.js`**: A fallback page for invalid routes.
    - **`ThankYouPage.js`**: Displays a thank-you message after users submit feedback.
    - **`utils.js`**: Contains helper functions used across multiple components.

  - **`App.js`**:  
    The root component that defines the main routes of the application and links pages together.

  - **`index.js`**:  
    The entry point of the React application, rendering the `App` component into the DOM.

  - **CSS Files**:  
    - `App.css`, `index.css`, and component-specific CSS files manage the styling for different parts of the application.

- **`package.json`**:  
  Contains metadata about the project and dependencies for the React application.

- **`package-lock.json`**:  
  Ensures consistent dependency resolution for the frontend.

- **`background_image.jpg`**:  
  A background image used in the frontend (e.g., for styling or decorative purposes).

---

## How to Start the Project

### Prerequisites
1. Install **Python** (3.7 or above) for the backend.
2. Install **Node.js** (14 or above) for the frontend.
3. Install **npm** (Node Package Manager).

### Backend Setup
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # For Linux/Mac
   .venv\Scripts\activate     # For Windows
   ```
3. Install the required Python packages:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the Flask-SocketIO server:
   ```bash
   python app.py
   ```
The backend will be accessible at `http://localhost:5000`.

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm start
   ```
The frontend will be accessible at `http://localhost:3000`.

## Backend APIs and Socket.IO Events

### REST APIs
- **GET `/`**:  
  Returns a confirmation message that the backend is running.

- **POST `/api/generate_code`**:  
  Generates a unique 6-digit code for a tester or experimenter.

- **POST `/api/submit_name`**:  
  Submits a username and role, adding the user to a queue and pairing them with another user.

- **POST `/api/save_chat`**:  
  Saves chat logs between testers and experimenters.

- **POST `/api/save_feedback`**:  
  Saves feedback submitted by testers into the `feedback.csv` file.

---

### Socket.IO Events
- **`connect`**:  
  Fired when a user connects to the WebSocket.

- **`register_user`**:  
  Registers the username and maps it to the user's Socket.IO session ID.

- **`join`**:  
  Adds a user to a chat room after being paired.

- **`message`**:  
  Handles real-time messaging between users in a chat room.

---

## Frontend Workflow
1. **Home Page**:  
   Users select their role (tester or experimenter) and enter their name.

2. **Pairing**:  
   Users are added to a queue and paired with someone from the opposite role.

3. **Chat Interface**:  
   Testers chat with either an experimenter or a bot.

4. **Feedback Page**:  
   Testers submit feedback about their experience.

5. **Thank You Page**:  
   A confirmation message is displayed after feedback submission.

---

## Dependencies

### Backend:
- **Flask**: Web framework for the backend.
- **Flask-SocketIO**: Enables WebSocket communication for real-time features.
- **Flask-CORS**: Handles Cross-Origin Resource Sharing.
- **random**: Used to generate unique codes.
- **csv**: For reading/writing CSV files.
- **json**: For reading/writing JSON files.

### Frontend:
- **React**: Frontend library for building the user interface.
- **React Router**: Handles navigation between pages.
- **Socket.IO-Client**: Enables real-time communication with the backend.

---

## Testing the Project

### Backend Testing:
- Use tools like Postman or cURL to test the REST API endpoints.
- Run test scripts (if implemented) to verify the backend functionality.

### Frontend Testing:
- Launch the frontend and test each page workflow (Home → Chat → Feedback → Thank You).
- Verify real-time messaging using multiple users in different browser windows.
- Ensure pairing and role assignment works as expected.

---

## Future Enhancements

### Authentication:
Add user authentication to ensure secure access and roles.

### Advanced Bot Logic:
Implement AI-based responses to enhance the bot's interactivity.

### Error Handling:
Add comprehensive error messages and fallback mechanisms for smoother user experience.

### Dashboard:
Create an admin dashboard for monitoring user activity, chat logs, and feedback in real time.

### Deployment:
Deploy the project on a cloud platform (e.g., AWS, Heroku, or Vercel) for broader accessibility.

---

## Contributing
Contributions are welcome! To contribute:

1. Fork the repository.
2. Create a feature branch:
   ```bash
   git checkout -b feature-name
   ```
3. Commit your changes:
   ```bash
   git commit -m "Add feature-name"
   ```
4. Push the branch:
   ```bash
   git push origin feature-name
   ```
5. Open a Pull Request.

## License
This project is licensed under the MIT License. See the LICENSE file for details.

## Contact
For any questions or suggestions, please reach out to the project maintainer:
- **`Email:`** rahimovavi100@gmail.com
- **`GitHub:`** https://github.com/AviRahimov
