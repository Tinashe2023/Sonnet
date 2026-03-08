const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
require('dotenv').config();
const { query } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Configure multer for file uploads (both files and profile pictures)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === 'profilePic') {
            cb(null, 'uploads/profiles/');
        } else {
            cb(null, 'uploads/files/');
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Create directories if they don't exist
const fs = require('fs');
if (!fs.existsSync('uploads/profiles/')) {
    fs.mkdirSync('uploads/profiles/', { recursive: true });
}
if (!fs.existsSync('uploads/files/')) {
    fs.mkdirSync('uploads/files/', { recursive: true });
}

// Global CORS middleware - must run BEFORE static files or any routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Expose-Headers', 'Content-Disposition');

    // Intercept OPTIONS method
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Serve static files
app.use(express.static(__dirname));

// Expose stickers list
app.get('/stickers', (req, res) => {
    try {
        const stickersDir = path.join(__dirname, 'public', 'stickers');
        if (!fs.existsSync(stickersDir)) return res.json({ stickers: [] });
        const files = fs.readdirSync(stickersDir);
        const stickers = files.filter(f => f.endsWith('.svg') || f.endsWith('.png') || f.endsWith('.jpg')).map(f => `/public/stickers/${f}`);
        res.json({ stickers });
    } catch (error) {
        console.error('Error fetching stickers:', error);
        res.status(500).json({ error: 'Failed to fetch stickers' });
    }
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());

// Store rooms with their users and data
// Structure: { roomId: { users: {}, createdAt: timestamp } }
const rooms = {};

// Store connected users with their details (global reference)
const users = {};

// Generate unique user ID
function generateUserId() {
    return crypto.randomBytes(8).toString('hex');
}

// Generate unique room ID
function generateRoomId() {
    return crypto.randomBytes(6).toString('hex');
}

// Get or create room
function getOrCreateRoom(roomId) {
    if (!rooms[roomId]) {
        rooms[roomId] = {
            users: {},
            createdAt: new Date().toISOString()
        };
    }
    return rooms[roomId];
}

io.on('connection', (socket) => {
    console.log(`Socket connected with ID: ${socket.id}`);

    // Handle user registration/login
    socket.on('user-register', async (userData) => {
        try {
            const roomId = userData.roomId || 'public';

            // Check if user with this username already exists in DB
            const existingUser = await query(
                'SELECT id, profile_pic, about FROM users WHERE username = $1 LIMIT 1',
                [userData.username]
            );

            const isReturning = existingUser.rows.length > 0;
            const userId = isReturning
                ? existingUser.rows[0].id
                : generateUserId();

            const defaultPic = '/uploads/profiles/default-profile.jpg';

            // For returning users: keep their saved profile pic and about
            // unless they explicitly provided new ones
            let profilePic;
            let about;

            if (isReturning) {
                const savedPic = existingUser.rows[0].profile_pic;
                const savedAbout = existingUser.rows[0].about;

                // Only update profile pic if user uploaded a new one (not the default)
                const userProvidedNewPic = userData.profilePic && userData.profilePic !== defaultPic;
                profilePic = userProvidedNewPic ? userData.profilePic : savedPic;

                // If user uploaded a new pic, delete the old one from disk (if it's not the default)
                if (userProvidedNewPic && savedPic && savedPic !== defaultPic) {
                    const oldPath = path.join(__dirname, savedPic);
                    if (fs.existsSync(oldPath)) {
                        fs.unlinkSync(oldPath);
                        console.log(`Deleted old profile pic: ${savedPic}`);
                    }
                }

                // Only update about if user provided a non-default one
                const userProvidedNewAbout = userData.about && userData.about !== 'Hey there! I am using ClassChat';
                about = userProvidedNewAbout ? userData.about : savedAbout;
            } else {
                profilePic = userData.profilePic || defaultPic;
                about = userData.about || 'Hey there! I am using ClassChat';
            }

            const user = {
                id: userId,
                username: userData.username,
                socketId: socket.id,
                profilePic: profilePic,
                about: about,
                status: 'online',
                joinedAt: new Date().toISOString(),
                roomId: roomId,
                pushToken: userData.pushToken || null
            };

            // Persist user to DB (upsert by id)
            await query(
                `INSERT INTO users (id, username, profile_pic, about, push_token)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (id) DO UPDATE SET username = $2, profile_pic = $3, about = $4, push_token = $5`,
                [userId, user.username, user.profilePic, user.about, user.pushToken]
            );

            // Ensure room exists in DB
            await query(
                `INSERT INTO rooms (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
                [roomId]
            );

            // Add room membership
            await query(
                `INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [roomId, userId]
            );

            // Keep in-memory for real-time
            users[userId] = user;
            socket.userId = userId;
            socket.roomId = roomId;

            socket.join(roomId);

            const room = getOrCreateRoom(roomId);
            room.users[userId] = user;

            console.log(`User ${userData.username} registered with ID: ${userId} in room: ${roomId}`);

            socket.emit('user-registered', { ...user, roomId: roomId });
            io.to(roomId).emit('users-online', Object.values(room.users));
        } catch (err) {
            console.error('Error registering user:', err);
            socket.emit('error', { message: 'Registration failed' });
        }
    });

    // Handle private messages
    socket.on('private-message', async ({ recipientId, message }) => {
        const sender = users[socket.userId];
        const recipient = users[recipientId];

        if (recipient && sender && recipient.roomId === sender.roomId) {
            const messageData = {
                ...message,
                messageId: crypto.randomUUID(),
                type: 'private',
                status: 'sent',
                senderId: sender.id,
                recipientId: recipientId,
                senderName: sender.username,
                senderProfile: sender.profilePic
            };

            // Persist to DB
            try {
                await query(
                    `INSERT INTO messages (id, room_id, sender_id, recipient_id, type, kind, text, status, timestamp, reply_to_id)
                     VALUES ($1, $2, $3, $4, $5, 'text', $6, $7, $8, $9)`,
                    [messageData.messageId, sender.roomId, sender.id, recipientId, 'private', messageData.text, messageData.status, messageData.timestamp, message.replyToId || null]
                );
            } catch (err) {
                console.error('Error saving private message:', err);
            }

            // Send to recipient
            io.to(recipient.socketId).emit('chat', messageData);
            // Send back to sender (for confirmation)
            socket.emit('chat', messageData);

            console.log(`Private message from ${sender.username} to ${recipient.username}`);
        } else if (recipient && recipient.pushToken) {
            // Recipient is not currently viewing the chat or is offline/backgrounded
            const messageData = {
                ...message,
                messageId: crypto.randomUUID(),
                type: 'private',
                status: 'sent',
                senderId: sender.id,
                recipientId: recipientId,
                senderName: sender.username,
                senderProfile: sender.profilePic
            };

            // Send back to sender indicating only sent, not delivered
            socket.emit('chat', messageData);

            // Dispatch Push Notification using Expo REST API
            fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: recipient.pushToken,
                    title: `Message from ${sender.username}`,
                    body: message.text,
                    data: { route: 'Chat', senderId: sender.id }
                })
            }).catch(err => console.error('Push notification error:', err));

            console.log(`Push notification sent to ${recipient.username}`);
        } else {
            socket.emit('error', { message: 'Recipient not found or offline' });
        }
    });

    // Handle group messages (room-specific)
    socket.on('group-message', async (message) => {
        const sender = users[socket.userId];
        if (sender) {
            const messageData = {
                ...message,
                messageId: crypto.randomUUID(),
                type: 'group',
                status: 'sent',
                senderId: sender.id,
                senderName: sender.username,
                senderProfile: sender.profilePic
            };

            // Persist to DB
            try {
                await query(
                    `INSERT INTO messages (id, room_id, sender_id, recipient_id, type, kind, text, status, timestamp, reply_to_id)
                     VALUES ($1, $2, $3, NULL, 'group', 'text', $4, $5, $6, $7)`,
                    [messageData.messageId, socket.roomId, sender.id, messageData.text, messageData.status, messageData.timestamp, message.replyToId || null]
                );
            } catch (err) {
                console.error('Error saving group message:', err);
            }

            // Broadcast to all users in the same room
            io.to(socket.roomId).emit('chat', messageData);
            console.log(`Group message from ${sender.username} in room ${socket.roomId}: ${message.text}`);
        }
    });

    // Handle file upload broadcast
    socket.on('file-upload', async (file) => {
        const sender = users[socket.userId];
        if (sender) {
            const fileData = {
                ...file,
                messageId: crypto.randomUUID(),
                status: 'sent',
                senderId: sender.id,
                senderName: sender.username,
                senderProfile: sender.profilePic
            };

            if (file.recipientId) {
                // Private file
                const recipient = users[file.recipientId];
                if (recipient && recipient.roomId === sender.roomId) {
                    fileData.type = 'private';
                    io.to(recipient.socketId).emit('file-received', fileData);
                    socket.emit('file-received', fileData);
                }
            } else {
                // Group file (room-specific)
                fileData.type = 'group';
                io.to(socket.roomId).emit('file-received', fileData);
            }

            // Persist message + file metadata to DB
            try {
                const msgKind = file.kind === 'sticker' ? 'sticker' : 'file';
                const msgText = file.kind === 'sticker' ? (file.text || file.path || '') : (file.filename || '');
                await query(
                    `INSERT INTO messages (id, room_id, sender_id, recipient_id, type, kind, text, status, timestamp, reply_to_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [fileData.messageId, socket.roomId, sender.id, file.recipientId || null, fileData.type, msgKind, msgText, fileData.status, file.timestamp || Date.now(), file.replyToId || null]
                );
                // Only insert file_metadata for actual files (not stickers)
                if (file.kind !== 'sticker') {
                    await query(
                        `INSERT INTO file_metadata (message_id, filename, path, mimetype, size)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [fileData.messageId, file.filename, file.path, file.mimetype, file.size]
                    );
                }
            } catch (err) {
                console.error('Error saving file metadata:', err);
            }
        }
    });

    // Handle delete message
    socket.on('delete-message', async ({ messageId, type, recipientId }) => {
        const sender = users[socket.userId];
        if (!sender) return;

        try {
            // Check if sender actually sent the message
            const msgRow = await query('SELECT sender_id, kind FROM messages WHERE id = $1', [messageId]);
            if (msgRow.rows.length === 0 || msgRow.rows[0].sender_id !== sender.id) {
                socket.emit('error', { message: 'Unauthorized or message not found' });
                return;
            }

            const isFile = msgRow.rows[0].kind === 'file';

            if (isFile) {
                // Remove physical file and metadata
                const metaRow = await query('SELECT path FROM file_metadata WHERE message_id = $1', [messageId]);
                if (metaRow.rows.length > 0) {
                    const filePath = path.join(__dirname, metaRow.rows[0].path);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`Deleted file: ${metaRow.rows[0].path}`);
                    }
                    await query('DELETE FROM file_metadata WHERE message_id = $1', [messageId]);
                }
            }

            // Mark as deleted in message table
            await query(
                `UPDATE messages SET status='deleted', text='🚫 This message was deleted', kind='text' WHERE id=$1`,
                [messageId]
            );

            // Broadcast deletion
            if (type === 'private' && recipientId) {
                const recipient = users[recipientId];
                if (recipient) {
                    io.to(recipient.socketId).emit('message-deleted', { messageId });
                }
                socket.emit('message-deleted', { messageId }); // send back to sender
            } else {
                io.to(sender.roomId).emit('message-deleted', { messageId, type: 'group' });
            }

            console.log(`Message ${messageId} deleted by ${sender.username}`);
        } catch (err) {
            console.error('Error deleting message:', err);
            socket.emit('error', { message: 'Failed to delete message' });
        }
    });

    // Handle edit message
    socket.on('edit-message', async ({ messageId, type, recipientId, newText }) => {
        const sender = users[socket.userId];
        if (!sender) return;

        try {
            const msgRow = await query('SELECT sender_id, timestamp, kind FROM messages WHERE id = $1', [messageId]);
            if (msgRow.rows.length === 0 || msgRow.rows[0].sender_id !== sender.id) {
                socket.emit('error', { message: 'Unauthorized or message not found' });
                return;
            }

            if (msgRow.rows[0].kind !== 'text') {
                socket.emit('error', { message: 'Only text messages can be edited' });
                return;
            }

            const msgTimestamp = parseInt(msgRow.rows[0].timestamp);
            const now = Date.now();
            const fifteenMins = 15 * 60 * 1000;
            if (now - msgTimestamp > fifteenMins) {
                socket.emit('error', { message: 'Message can only be edited within 15 minutes' });
                return;
            }

            await query(
                `UPDATE messages SET text=$1, is_edited=true WHERE id=$2`,
                [newText, messageId]
            );

            if (type === 'private' && recipientId) {
                const recipient = users[recipientId];
                if (recipient) {
                    io.to(recipient.socketId).emit('message-edited', { messageId, newText });
                }
                socket.emit('message-edited', { messageId, newText }); // send back to sender
            } else {
                io.to(sender.roomId).emit('message-edited', { messageId, newText, type: 'group' });
            }

            console.log(`Message ${messageId} edited by ${sender.username}`);
        } catch (err) {
            console.error('Error editing message:', err);
            socket.emit('error', { message: 'Failed to edit message' });
        }
    });

    // Handle message reaction
    socket.on('react-message', async ({ messageId, type, recipientId, emoji }) => {
        const sender = users[socket.userId];
        if (!sender) return;

        try {
            if (!emoji) {
                await query(`UPDATE messages SET reactions = reactions - $2::text WHERE id=$1`, [messageId, sender.id]);
            } else {
                await query(
                    `UPDATE messages SET reactions = jsonb_set(COALESCE(reactions, '{}'::jsonb), ARRAY[$2::text], $3::jsonb) WHERE id=$1`,
                    [messageId, sender.id, JSON.stringify(emoji)]
                );
            }

            // For private chats, we must determine the *other* user in the conversation.
            // If the reactor (sender.id) is the one who originally sent the message, the other person is `recipientId`.
            // If the reactor is NOT the original sender (they are reacting to a received message), the other person is the original message's sender.
            if (type === 'private') {
                const msgRow = await query('SELECT sender_id, recipient_id FROM messages WHERE id = $1', [messageId]);
                if (msgRow.rows.length > 0) {
                    const originalSender = msgRow.rows[0].sender_id;
                    const originalRecipient = msgRow.rows[0].recipient_id;

                    const otherUserId = (sender.id === originalSender) ? originalRecipient : originalSender;
                    const otherUser = users[otherUserId];

                    if (otherUser) {
                        io.to(otherUser.socketId).emit('message-reaction', { messageId, userId: sender.id, emoji });
                    }
                }
                socket.emit('message-reaction', { messageId, userId: sender.id, emoji }); // confirm to reactor
            } else {
                io.to(sender.roomId).emit('message-reaction', { messageId, userId: sender.id, emoji, type: 'group' });
            }
        } catch (err) {
            console.error('Error reacting to message:', err);
            socket.emit('error', { message: 'Failed to add reaction' });
        }
    });

    // Handle typing indicators
    socket.on('typing', ({ recipientId, isTyping }) => {
        const sender = users[socket.userId];
        if (sender) {
            if (recipientId) {
                // Private chat typing
                const recipient = users[recipientId];
                if (recipient && recipient.roomId === sender.roomId) {
                    io.to(recipient.socketId).emit('user-typing', {
                        userId: sender.id,
                        username: sender.username,
                        isTyping: isTyping,
                        recipientId: recipientId
                    });
                }
            } else {
                // Group chat typing (room-specific)
                socket.to(socket.roomId).emit('user-typing', {
                    userId: sender.id,
                    username: sender.username,
                    isTyping: isTyping,
                    recipientId: null
                });
            }
        }
    });

    // Handle message delivery confirmation
    socket.on('message-delivered', async ({ messageId, senderId, recipientId, isGroup }) => {
        try {
            await query("UPDATE messages SET status='delivered' WHERE id=$1 AND status='sent'", [messageId]);
        } catch (err) {
            console.error('Error updating delivered status:', err);
        }

        if (isGroup) {
            // Emitting to the entire room, though usually read receipts in groups are more complex
            io.to(socket.roomId).emit('message-status-update', { messageId, status: 'delivered', readBy: socket.userId });
        } else if (senderId && users[senderId]) {
            io.to(users[senderId].socketId).emit('message-status-update', {
                messageId,
                status: 'delivered',
                recipientId
            });
        }
    });

    // Handle message read confirmation
    socket.on('message-read', async ({ messageId, senderId, recipientId, isGroup }) => {
        try {
            await query("UPDATE messages SET status='read' WHERE id=$1 AND status!='read'", [messageId]);
        } catch (err) {
            console.error('Error updating read status:', err);
        }

        if (isGroup) {
            io.to(socket.roomId).emit('message-status-update', { messageId, status: 'read', readBy: socket.userId });
        } else if (senderId && users[senderId]) {
            io.to(users[senderId].socketId).emit('message-status-update', {
                messageId,
                status: 'read',
                recipientId
            });
        }
    });

    // Mark an entire private chat as read
    socket.on('mark-chat-read', async ({ senderId }) => {
        const currentUser = users[socket.userId];
        if (!currentUser) return;

        try {
            await query("UPDATE messages SET status='read' WHERE type='private' AND sender_id=$1 AND recipient_id=$2 AND status!='read'", [senderId, currentUser.id]);
            // Notify the sender that their messages were read
            if (users[senderId]) {
                const updatedMsgResult = await query("SELECT id FROM messages WHERE type='private' AND sender_id=$1 AND recipient_id=$2", [senderId, currentUser.id]);
                // Instead of emitting for each message, we could rely on a bulk update, but we'll let the next refresh handle it for simplicity
            }
        } catch (err) {
            console.error('Error marking chat as read:', err);
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        if (socket.userId && users[socket.userId]) {
            const user = users[socket.userId];
            const roomId = user.roomId;

            console.log(`User ${user.username} disconnected from room ${roomId}.`);

            // Remove user from room
            if (rooms[roomId]) {
                delete rooms[roomId].users[socket.userId];

                // Broadcast updated user list to room
                io.to(roomId).emit('users-online', Object.values(rooms[roomId].users));

                // Clean up empty rooms (except public)
                if (Object.keys(rooms[roomId].users).length === 0 && roomId !== 'public') {
                    delete rooms[roomId];
                    console.log(`Room ${roomId} deleted (empty)`);
                }
            }

            delete users[socket.userId];
        }
        console.log(`Socket disconnected with ID: ${socket.id}`);
    });
});

// Route to create a new room
app.get('/create-room', async (req, res) => {
    const roomId = generateRoomId();
    try {
        await query('INSERT INTO rooms (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [roomId]);
    } catch (err) {
        console.error('Error creating room in DB:', err);
    }
    res.json({ roomId: roomId });
});

// Route to search messages
app.get('/messages/search', async (req, res) => {
    try {
        const { q, type, roomId, recipientId, senderId } = req.query;
        console.log("== SEARCH REQUEST ==", { q, type, roomId, recipientId, senderId });
        if (!q) return res.json({ messages: [], debug: { q, type, roomId, recipientId, senderId } });

        let result;
        if (type === 'group' && roomId) {
            result = await query(
                `SELECT m.id AS "messageId", m.room_id AS "roomId", m.sender_id AS "senderId",
                        m.recipient_id AS "recipientId", m.type, m.kind, m.text, m.status, m.timestamp, m.reactions, m.is_edited AS "isEdited",
                        u.username AS "senderName", u.profile_pic AS "senderProfile",
                        fm.filename, fm.path, fm.mimetype, fm.size AS "fileSize",
                        rm.id AS "replyToId", rm.text AS "replyToText", ru.username AS "replyToSenderName", rm.kind AS "replyToKind"
                 FROM messages m
                 LEFT JOIN users u ON m.sender_id = u.id
                 LEFT JOIN file_metadata fm ON fm.message_id = m.id
                 LEFT JOIN messages rm ON m.reply_to_id = rm.id
                 LEFT JOIN users ru ON rm.sender_id = ru.id
                 WHERE m.room_id = $1 AND m.type = 'group' AND m.text ILIKE $2
                 ORDER BY m.timestamp DESC
                 LIMIT 50`,
                [roomId, `%${q}%`]
            );
            console.log("Group query rows:", result ? result.rows.length : 0);
        } else if (type === 'private' && senderId && recipientId) {
            result = await query(
                `SELECT m.id AS "messageId", m.room_id AS "roomId", m.sender_id AS "senderId",
                        m.recipient_id AS "recipientId", m.type, m.kind, m.text, m.status, m.timestamp, m.reactions, m.is_edited AS "isEdited",
                        u.username AS "senderName", u.profile_pic AS "senderProfile",
                        fm.filename, fm.path, fm.mimetype, fm.size AS "fileSize",
                        rm.id AS "replyToId", rm.text AS "replyToText", ru.username AS "replyToSenderName", rm.kind AS "replyToKind"
                 FROM messages m
                 LEFT JOIN users u ON m.sender_id = u.id
                 LEFT JOIN file_metadata fm ON fm.message_id = m.id
                 LEFT JOIN messages rm ON m.reply_to_id = rm.id
                 LEFT JOIN users ru ON rm.sender_id = ru.id
                 WHERE m.type = 'private' 
                   AND ((m.sender_id = $1 AND m.recipient_id = $2) OR (m.sender_id = $2 AND m.recipient_id = $1))
                   AND m.text ILIKE $3
                 ORDER BY m.timestamp DESC
                 LIMIT 50`,
                [senderId, recipientId, `%${q}%`]
            );
        } else {
            return res.status(400).json({ error: 'Invalid search parameters' });
        }

        const messages = result.rows.map(row => ({
            messageId: row.messageId,
            roomId: row.roomId,
            senderId: row.senderId,
            recipientId: row.recipientId,
            type: row.type,
            kind: row.kind,
            text: row.text,
            status: row.status,
            timestamp: parseInt(row.timestamp),
            senderName: row.senderName,
            senderProfile: row.senderProfile,
            replyToId: row.replyToId,
            replyToText: row.replyToText,
            replyToSenderName: row.replyToSenderName,
            replyToKind: row.replyToKind,
            reactions: row.reactions || {},
            isEdited: row.isEdited || false,
            ...(row.kind === 'file' ? { filename: row.filename, path: row.path, mimetype: row.mimetype, size: parseInt(row.fileSize) } : {})
        })).reverse(); // Reverse because we ordered by DESC to get latest matches first, but chat displays chronological

        res.json({ messages });
    } catch (err) {
        console.error('Error searching messages:', err);
        res.status(500).json({ error: 'Failed to search messages' });
    }
});

// Route to get message history for a room (group messages)
app.get('/messages/:roomId', async (req, res) => {
    try {
        const { roomId } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const result = await query(
            `SELECT m.id AS "messageId", m.room_id AS "roomId", m.sender_id AS "senderId",
                    m.recipient_id AS "recipientId", m.type, m.kind, m.text, m.status, m.timestamp, m.reactions, m.is_edited AS "isEdited",
                    u.username AS "senderName", u.profile_pic AS "senderProfile",
                    fm.filename, fm.path, fm.mimetype, fm.size AS "fileSize",
                    rm.id AS "replyToId", rm.text AS "replyToText", ru.username AS "replyToSenderName", rm.kind AS "replyToKind"
             FROM messages m
             LEFT JOIN users u ON m.sender_id = u.id
             LEFT JOIN file_metadata fm ON fm.message_id = m.id
             LEFT JOIN messages rm ON m.reply_to_id = rm.id
             LEFT JOIN users ru ON rm.sender_id = ru.id
             WHERE m.room_id = $1 AND m.type = 'group'
             ORDER BY m.timestamp ASC
             LIMIT $2`,
            [roomId, limit]
        );

        const messages = result.rows.map(row => ({
            messageId: row.messageId,
            roomId: row.roomId,
            senderId: row.senderId,
            recipientId: row.recipientId,
            type: row.type,
            kind: row.kind,
            text: row.text,
            status: row.status,
            timestamp: parseInt(row.timestamp),
            senderName: row.senderName,
            senderProfile: row.senderProfile,
            replyToId: row.replyToId,
            replyToText: row.replyToText,
            replyToSenderName: row.replyToSenderName,
            replyToKind: row.replyToKind,
            reactions: row.reactions || {},
            isEdited: row.isEdited || false,
            // file fields (only present for file messages)
            ...(row.kind === 'file' ? { filename: row.filename, path: row.path, mimetype: row.mimetype, size: parseInt(row.fileSize) } : {})
        }));

        res.json({ messages });
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Route to get private message history between two users
app.get('/messages/private/:recipientId', async (req, res) => {
    try {
        const { recipientId } = req.params;
        const senderId = req.query.senderId;
        const limit = parseInt(req.query.limit) || 50;

        if (!senderId) {
            return res.status(400).json({ error: 'senderId query param required' });
        }

        const result = await query(
            `SELECT m.id AS "messageId", m.room_id AS "roomId", m.sender_id AS "senderId",
                    m.recipient_id AS "recipientId", m.type, m.kind, m.text, m.status, m.timestamp, m.reactions, m.is_edited AS "isEdited",
                    u.username AS "senderName", u.profile_pic AS "senderProfile",
                    fm.filename, fm.path, fm.mimetype, fm.size AS "fileSize",
                    rm.id AS "replyToId", rm.text AS "replyToText", ru.username AS "replyToSenderName", rm.kind AS "replyToKind"
             FROM messages m
             LEFT JOIN users u ON m.sender_id = u.id
             LEFT JOIN file_metadata fm ON fm.message_id = m.id
             LEFT JOIN messages rm ON m.reply_to_id = rm.id
             LEFT JOIN users ru ON rm.sender_id = ru.id
             WHERE m.type = 'private'
               AND ((m.sender_id = $1 AND m.recipient_id = $2) OR (m.sender_id = $2 AND m.recipient_id = $1))
             ORDER BY m.timestamp ASC
             LIMIT $3`,
            [senderId, recipientId, limit]
        );

        const messages = result.rows.map(row => ({
            messageId: row.messageId,
            roomId: row.roomId,
            senderId: row.senderId,
            recipientId: row.recipientId,
            type: row.type,
            kind: row.kind,
            text: row.text,
            status: row.status,
            timestamp: parseInt(row.timestamp),
            senderName: row.senderName,
            senderProfile: row.senderProfile,
            replyToId: row.replyToId,
            replyToText: row.replyToText,
            replyToSenderName: row.replyToSenderName,
            replyToKind: row.replyToKind,
            reactions: row.reactions || {},
            isEdited: row.isEdited || false,
            ...(row.kind === 'file' ? { filename: row.filename, path: row.path, mimetype: row.mimetype, size: parseInt(row.fileSize) } : {})
        }));

        res.json({ messages });
    } catch (err) {
        console.error('Error fetching private messages:', err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Route to get unread message counts for a user
app.get('/messages/unread/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await query(
            `SELECT sender_id, COUNT(*) as count 
             FROM messages 
             WHERE type = 'private' AND recipient_id = $1 AND status != 'read'
             GROUP BY sender_id`,
            [userId]
        );
        const unreadCounts = {};
        result.rows.forEach(r => unreadCounts[r.sender_id] = parseInt(r.count));
        res.json({ unreadCounts });
    } catch (err) {
        console.error('Error fetching unread counts:', err);
        res.status(500).json({ error: 'Failed to fetch unread counts' });
    }
});

// Route to handle file uploads
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const file = {
        filename: req.file.originalname,
        path: `/uploads/files/${req.file.filename}`,
        mimetype: req.file.mimetype,
        size: req.file.size,
        user: req.body.user,
        timestamp: parseInt(req.body.timestamp) || Date.now(),
        recipientId: req.body.recipientId || null
    };

    res.status(200).json({
        message: 'File uploaded successfully.',
        file: file
    });
});

// Route to handle profile picture uploads
app.post('/upload-profile', upload.single('profilePic'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No profile picture uploaded.' });
    }

    const profilePic = {
        filename: req.file.originalname,
        path: `/uploads/profiles/${req.file.filename}`,
        mimetype: req.file.mimetype,
        size: req.file.size
    };

    res.status(200).json({
        message: 'Profile picture uploaded successfully.',
        profilePic: profilePic
    });
});

// Route to get user by ID
app.get('/user/:userId', (req, res) => {
    const user = users[req.params.userId];
    if (user) {
        res.json(user);
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

// ── Pinned Chats Endpoints ──────────────────────────────────────

// GET /chats/pins/:userId  —  fetch all pins for a user
app.get('/chats/pins/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await query(
            'SELECT chat_id AS "chatId", chat_type AS "chatType" FROM user_pins WHERE user_id = $1 ORDER BY pinned_at ASC',
            [userId]
        );
        res.json({ pins: result.rows });
    } catch (err) {
        console.error('Error fetching pins:', err);
        res.status(500).json({ error: 'Failed to fetch pins' });
    }
});

// POST /chats/pins  —  pin a chat
app.post('/chats/pins', async (req, res) => {
    try {
        const { userId, chatId, chatType = 'private' } = req.body;
        if (!userId || !chatId) return res.status(400).json({ error: 'userId and chatId required' });
        await query(
            `INSERT INTO user_pins (user_id, chat_id, chat_type)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, chat_id) DO NOTHING`,
            [userId, chatId, chatType]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error pinning chat:', err);
        res.status(500).json({ error: 'Failed to pin chat' });
    }
});

// DELETE /chats/pins/:userId/:chatId  —  unpin a chat
app.delete('/chats/pins/:userId/:chatId', async (req, res) => {
    try {
        const { userId, chatId } = req.params;
        await query(
            'DELETE FROM user_pins WHERE user_id = $1 AND chat_id = $2',
            [userId, chatId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error unpinning chat:', err);
        res.status(500).json({ error: 'Failed to unpin chat' });
    }
});

const PORT = process.env.PORT || 3004;

// Wait for database initialization to complete BEFORE listening on the port.
// This prevents "relation 'users' does not exist" errors on fresh Render deployments.
(async () => {
    try {
        console.log('Initializing database schema (schema.sql)...');
        const fs = require('fs');
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await query(schemaSql);
        console.log('✅ Base schema created.');

        await query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;');
        console.log('✅ Additional columns added.');
    } catch (err) {
        console.error('❌ Error initializing database schema:', err);
    }

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Sonnet chat server is running on port ${PORT}`);
    });
})();