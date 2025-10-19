const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());

// Store connected users with their details
const users = {};

// Generate unique user ID
function generateUserId() {
    return crypto.randomBytes(8).toString('hex');
}

io.on('connection', (socket) => {
    console.log(`Socket connected with ID: ${socket.id}`);

    // Handle user registration/login
    socket.on('user-register', (userData) => {
        const userId = generateUserId();
        const user = {
            id: userId,
            username: userData.username,
            socketId: socket.id,
            profilePic: userData.profilePic || '/uploads/profiles/default-profile.jpg',
            about: userData.about || 'Hey there! I am using ClassChat',
            status: 'online',
            joinedAt: new Date().toISOString()
        };
        
        users[userId] = user;
        socket.userId = userId; // Store userId in socket for easy access
        
        console.log(`User ${userData.username} registered with ID: ${userId}`);
        
        // Send user their own data
        socket.emit('user-registered', user);
        
        // Broadcast updated user list to all clients
        io.emit('users-online', Object.values(users));
    });

    // Handle private messages
    socket.on('private-message', ({ recipientId, message }) => {
        const sender = users[socket.userId];
        const recipient = users[recipientId];
        
        if (recipient && sender) {
            const messageData = {
                ...message,
                messageId: crypto.randomUUID(),
                type: 'private',
                senderId: sender.id,
                recipientId: recipientId,
                senderName: sender.username,
                senderProfile: sender.profilePic
            };
            
            // Send to recipient
            io.to(recipient.socketId).emit('chat', messageData);
            // Send back to sender (for confirmation)
            socket.emit('chat', messageData);
            
            console.log(`Private message from ${sender.username} to ${recipient.username}`);
        } else {
            socket.emit('error', { message: 'Recipient not found or offline' });
        }
    });

    // Handle group messages
    socket.on('group-message', (message) => {
        const sender = users[socket.userId];
        if (sender) {
            const messageData = {
                ...message,
                messageId: crypto.randomUUID(),
                type: 'group',
                senderId: sender.id,
                senderName: sender.username,
                senderProfile: sender.profilePic
            };
            
            io.emit('chat', messageData);
            console.log(`Group message from ${sender.username}: ${message.text}`);
        }
    });

    // Handle file upload broadcast
    socket.on('file-upload', (file) => {
        const sender = users[socket.userId];
        if (sender) {
            const fileData = {
                ...file,
                messageId: crypto.randomUUID(),
                senderId: sender.id,
                senderName: sender.username,
                senderProfile: sender.profilePic
            };
            
            if (file.recipientId) {
                // Private file
                const recipient = users[file.recipientId];
                if (recipient) {
                    fileData.type = 'private';
                    io.to(recipient.socketId).emit('file-received', fileData);
                    socket.emit('file-received', fileData);
                }
            } else {
                // Group file
                fileData.type = 'group';
                io.emit('file-received', fileData);
            }
        }
    });

    // Handle typing indicators
    socket.on('typing', ({ recipientId, isTyping }) => {
        const sender = users[socket.userId];
        if (sender) {
            if (recipientId) {
                // Private chat typing
                const recipient = users[recipientId];
                if (recipient) {
                    io.to(recipient.socketId).emit('user-typing', {
                        userId: sender.id,
                        username: sender.username,
                        isTyping: isTyping
                    });
                }
            } else {
                // Group chat typing
                socket.broadcast.emit('user-typing', {
                    userId: sender.id,
                    username: sender.username,
                    isTyping: isTyping
                });
            }
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        if (socket.userId && users[socket.userId]) {
            const user = users[socket.userId];
            console.log(`User ${user.username} disconnected.`);
            delete users[socket.userId];
            
            // Broadcast updated user list
            io.emit('users-online', Object.values(users));
        }
        console.log(`Socket disconnected with ID: ${socket.id}`);
    });
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
        timestamp: parseInt(req.body.timestamp) || Date.now(),  // <-- Parse to number
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

const PORT = process.env.PORT || 3004;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Sonnet chat server is running on port ${PORT}`);
});