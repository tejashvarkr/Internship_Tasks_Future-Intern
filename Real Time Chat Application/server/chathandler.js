const express = require('express');
const jwt = require('jsonwebtoken');
const { dbRun, dbGet, dbAll } = require('./db');
const router = express.Router();

// --- HTTP Routes for Rooms and Messages ---

// Middleware to protect routes
const authMiddleware = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (e) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};

// Create a public room
router.post('/rooms', authMiddleware, async (req, res) => {
    const { name } = req.body;
    const creatorId = req.user.id;
    try {
        const existingRoom = await dbGet('SELECT * FROM rooms WHERE name = ? AND is_private = 0', [name]);
        if (existingRoom) return res.status(400).json({ msg: 'Public room already exists' });

        const result = await dbRun('INSERT INTO rooms (name, creator_id, is_private) VALUES (?, ?, 0)', [name, creatorId]);
        const newRoom = { id: result.lastID, name, creator_id: creatorId, is_private: 0 };
        await dbRun('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)', [newRoom.id, creatorId]);
        res.json(newRoom);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error: ' + err.message });
    }
});

// Get all public rooms
router.get('/rooms', authMiddleware, async (req, res) => {
    try {
        const rooms = await dbAll('SELECT r.id, r.name, u.username as creator_username FROM rooms r LEFT JOIN users u ON r.creator_id = u.id WHERE r.is_private = 0');
        res.json(rooms);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error: ' + err.message });
    }
});

// Initiate or get a private chat room
router.post('/rooms/private', authMiddleware, async (req, res) => {
    const { otherUsername } = req.body; // Expecting username of the other person
    const currentUserId = req.user.id;

    try {
        const otherUser = await dbGet('SELECT id FROM users WHERE username = ?', [otherUsername]);
        if (!otherUser) return res.status(404).json({ msg: 'Other user not found.' });
        if (currentUserId === otherUser.id) return res.status(400).json({ msg: 'Cannot create private chat with yourself.' });

        const ids = [currentUserId, otherUser.id].sort((a, b) => a - b);
        const roomName = `private_${ids[0]}_${ids[1]}`;

        let room = await dbGet('SELECT * FROM rooms WHERE name = ? AND is_private = 1', [roomName]);
        if (!room) {
            const result = await dbRun('INSERT INTO rooms (name, is_private, creator_id) VALUES (?, 1, ?)', [roomName, currentUserId]);
            room = { id: result.lastID, name: roomName, is_private: 1, creator_id: currentUserId };
            // Add both members
            await dbRun('INSERT INTO room_members (room_id, user_id) VALUES (?, ?), (?, ?)', [room.id, currentUserId, room.id, otherUser.id]);
        }
        res.json(room);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error: ' + err.message });
    }
});

// Get user's private chat list
router.get('/rooms/private/my', authMiddleware, async (req, res) => {
    try {
        // Get rooms where user is a member and room is private
        const rooms = await dbAll(`
            SELECT r.id, r.name, r.is_private
            FROM rooms r
            JOIN room_members rm ON r.id = rm.room_id
            WHERE rm.user_id = ? AND r.is_private = 1
        `, [req.user.id]);

        // For each private room, find the other member's username
        const roomsWithUsernames = await Promise.all(rooms.map(async (room) => {
            const members = await dbAll(`
                SELECT u.id, u.username 
                FROM users u
                JOIN room_members rm ON u.id = rm.user_id
                WHERE rm.room_id = ?
            `, [room.id]);
            const otherMember = members.find(m => m.id !== req.user.id);
            return { ...room, other_member_username: otherMember ? otherMember.username : 'Unknown User' };
        }));
        res.json(roomsWithUsernames);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error: ' + err.message });
    }
});


// Get messages for a specific room
router.get('/messages/:roomId', authMiddleware, async (req, res) => {
    const { roomId } = req.params;
    try {
        // Optional: Check if user is a member of the room
        const memberCheck = await dbGet('SELECT * FROM room_members WHERE room_id = ? AND user_id = ?', [roomId, req.user.id]);
        if (!memberCheck) {
            // return res.status(403).json({ msg: "Not authorized for this room." });
        }

        const messages = await dbAll(`
            SELECT m.id, m.content, m.timestamp, m.sender_id, u.username as sender_username
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.room_id = ?
            ORDER BY m.timestamp ASC
        `, [roomId]);
        res.json(messages);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error: ' + err.message });
    }
});

// --- Socket.IO Logic ---
function initializeSocketIO(io) {
    // Socket.IO Authentication Middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('Authentication error: No token'));
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded.user; // { id, username }
            next();
        } catch (err) {
            next(new Error('Authentication error: Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.user.username} (Socket ID: ${socket.id})`);

        socket.on('join_room', async ({ roomId }) => {
            try {
                const room = await dbGet('SELECT id, name, is_private FROM rooms WHERE id = ?', [roomId]);
                if (!room) return socket.emit('error_message', 'Room not found.');

                // Add user to room_members if not already there (especially for public rooms)
                // For private rooms, they should already be members from creation.
                if (!room.is_private) {
                    await dbRun('INSERT OR IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)', [roomId, socket.user.id]);
                } else {
                    // Ensure user is part of the private room
                    const isMember = await dbGet('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?', [roomId, socket.user.id]);
                    if (!isMember) {
                        return socket.emit('error_message', 'Not authorized for this private room.');
                    }
                }
                
                socket.join(roomId.toString()); // Socket.IO rooms are strings
                console.log(`${socket.user.username} joined room: ${room.name} (ID: ${roomId})`);
                socket.emit('room_joined', { roomId, roomName: room.name });

                // Load and send recent messages
                const messages = await dbAll(`
                    SELECT m.id, m.content, m.timestamp, m.sender_id, u.username as sender_username
                    FROM messages m
                    JOIN users u ON m.sender_id = u.id
                    WHERE m.room_id = ? ORDER BY m.timestamp DESC LIMIT 20
                `, [roomId]);
                socket.emit('load_history', messages.reverse()); // Send oldest first

                // Notify others in the room
                socket.to(roomId.toString()).emit('user_event', { 
                    roomId, 
                    username: socket.user.username, 
                    message: `${socket.user.username} joined the room.` 
                });

            } catch (err) {
                console.error("Error joining room:", err);
                socket.emit('error_message', 'Error joining room.');
            }
        });

        socket.on('send_message', async ({ roomId, content }) => {
            if (!content.trim()) return;
            try {
                const result = await dbRun(
                    'INSERT INTO messages (content, sender_id, room_id) VALUES (?, ?, ?)',
                    [content, socket.user.id, roomId]
                );
                const message = {
                    id: result.lastID,
                    content,
                    sender_id: socket.user.id,
                    sender_username: socket.user.username, // Add username directly
                    room_id: roomId,
                    timestamp: new Date().toISOString()
                };
                io.to(roomId.toString()).emit('new_message', message);
            } catch (err) {
                console.error("Error sending message:", err);
                socket.emit('error_message', 'Error sending message.');
            }
        });

        socket.on('leave_room', ({ roomId }) => {
            socket.leave(roomId.toString());
            console.log(`${socket.user.username} left room: ${roomId}`);
            socket.to(roomId.toString()).emit('user_event', { 
                roomId, 
                username: socket.user.username, 
                message: `${socket.user.username} left the room.` 
            });
        });

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.user.username}`);
            // Optionally notify rooms the user was in
            socket.rooms.forEach(roomId => {
                if (roomId !== socket.id) { // socket.id is the default room for the socket itself
                    io.to(roomId).emit('user_event', { 
                        roomId, 
                        username: socket.user.username, 
                        message: `${socket.user.username} disconnected.` 
                    });
                }
            });
        });
    });
}

module.exports = { router, initializeSocketIO, authMiddleware }; // Export router and socket initializer