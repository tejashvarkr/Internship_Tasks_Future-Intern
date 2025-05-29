require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

require('./db'); // Initialize DB connection and tables

const authRoutes = require('./auth');
const { router: chatHttpRoutes, initializeSocketIO } = require('./chathandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for simplicity, restrict in production
        methods: ["GET", "POST"]
    }
});

// Middlewares
app.use(cors());
app.use(express.json());

// HTTP Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatHttpRoutes); // Mount chat HTTP routes (rooms, messages)

// Initialize Socket.IO
initializeSocketIO(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));