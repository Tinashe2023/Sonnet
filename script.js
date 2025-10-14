// **Socket Connection**
const socket = io();

// **Get DOM Elements**
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn');
const profilePicInput = document.getElementById('profile-pic-input');
const profilePreview = document.getElementById('profile-preview');
const messagesWindow = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const onlineCount = document.getElementById('online-count');
const usersList = document.getElementById('users-list');
const currentUserPic = document.getElementById('current-user-pic');
const currentUsername = document.getElementById('current-username');
const currentUserId = document.getElementById('current-user-id');
const chatTitle = document.getElementById('chat-title');
const chatStatus = document.getElementById('chat-status');
const chatAvatar = document.getElementById('chat-avatar');
const groupChatTab = document.getElementById('group-chat-tab');
const typingIndicator = document.getElementById('typing-indicator');
const userInfoModal = document.getElementById('user-info-modal');

// **Global Variables**
let currentUser = null;
let activeChat = 'group'; // 'group' or user ID for private chat
let onlineUsers = [];
let typingTimer = null;
let isTyping = false;

// **Login Functionality**
profilePicInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        // Preview the image
        const reader = new FileReader();
        reader.onload = (e) => {
            profilePreview.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
});

loginBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    if (!username) {
        alert('Please enter a username');
        return;
    }

    let profilePicPath = '/uploads/profiles/default-profile.jpg';
    
    // Upload profile picture if selected
    if (profilePicInput.files[0]) {
        const formData = new FormData();
        formData.append('profilePic', profilePicInput.files[0]);
        
        try {
            const response = await fetch('/upload-profile', {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();
            if (response.ok) {
                profilePicPath = result.profilePic.path;
            }
        } catch (error) {
            console.error('Error uploading profile picture:', error);
        }
    }
    
    // Register user
    socket.emit('user-register', {
        username: username,
        profilePic: profilePicPath
    });
});

// **Utility Functions**
function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function switchToGroupChat() {
    activeChat = 'group';
    chatTitle.textContent = 'Class Chat Room';
    chatStatus.textContent = `${onlineUsers.length} members`;
    chatAvatar.src = 'profile.png';
    groupChatTab.classList.add('active');
    
    // Remove active state from user items
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
    });
}

function switchToPrivateChat(user) {
    activeChat = user.id;
    chatTitle.textContent = user.username;
    chatStatus.textContent = 'Online';
    chatAvatar.src = user.profilePic;
    groupChatTab.classList.remove('active');
    
    // Update active user item
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.userId === user.id) {
            item.classList.add('active');
        }
    });
    
    // Clear messages and load private chat history (if any)
    messagesWindow.innerHTML = '';
}

function createMessageElement(messageData) {
    const isSender = messageData.senderId === currentUser.id;
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', isSender ? 'sent' : 'received');
    messageElement.dataset.messageId = messageData.messageId;

    if (!isSender) {
        const avatar = document.createElement('img');
        avatar.src = messageData.senderProfile || '/uploads/profiles/default-profile.jpg';
        avatar.classList.add('message-avatar');
        messageElement.appendChild(avatar);
    }

    const messageBody = document.createElement('div');
    messageBody.classList.add('message-body');

    if (!isSender && messageData.type === 'group') {
        const senderName = document.createElement('div');
        senderName.classList.add('sender-name');
        senderName.textContent = messageData.senderName;
        messageBody.appendChild(senderName);
    }

    const messageText = document.createElement('div');
    messageText.classList.add('message-text');
    messageText.textContent = messageData.text;
    messageBody.appendChild(messageText);

    const messageTime = document.createElement('div');
    messageTime.classList.add('message-time');
    messageTime.textContent = formatTime(messageData.timestamp || Date.now());
    messageBody.appendChild(messageTime);

    messageElement.appendChild(messageBody);
    return messageElement;
}

function createFileElement(fileData) {
    const isSender = fileData.senderId === currentUser.id;
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'file-message', isSender ? 'sent' : 'received');

    if (!isSender) {
        const avatar = document.createElement('img');
        avatar.src = fileData.senderProfile || '/uploads/profiles/default-avatar.png';
        avatar.classList.add('message-avatar');
        messageElement.appendChild(avatar);
    }

    const messageBody = document.createElement('div');
    messageBody.classList.add('message-body');

    if (!isSender && fileData.type === 'group') {
        const senderName = document.createElement('div');
        senderName.classList.add('sender-name');
        senderName.textContent = fileData.senderName;
        messageBody.appendChild(senderName);
    }

    const fileLink = document.createElement('a');
    fileLink.href = fileData.path;
    fileLink.classList.add('file-link');
    fileLink.download = fileData.filename;
    
    const fileIcon = fileData.mimetype.startsWith('image/') ? '🖼️' : '📄';
    fileLink.innerHTML = `${fileIcon} ${fileData.filename}`;
    messageBody.appendChild(fileLink);

    const messageTime = document.createElement('div');
    messageTime.classList.add('message-time');
    messageTime.textContent = formatTime(fileData.timestamp || Date.now());
    messageBody.appendChild(messageTime);

    messageElement.appendChild(messageBody);
    return messageElement;
}

function updateUsersList(users) {
    onlineUsers = users.filter(user => user.id !== currentUser.id);
    onlineCount.textContent = users.length;
    
    usersList.innerHTML = '';
    
    onlineUsers.forEach(user => {
        const userItem = document.createElement('div');
        userItem.classList.add('user-item');
        userItem.dataset.userId = user.id;
        
        if (activeChat === user.id) {
            userItem.classList.add('active');
        }
        
        userItem.innerHTML = `
            <img src="${user.profilePic}" alt="${user.username}" class="user-avatar">
            <div class="user-details">
                <div class="user-name">${user.username}</div>
                <div class="user-id">ID: ${user.id}</div>
            </div>
            <div class="user-status online"></div>
        `;
        
        userItem.addEventListener('click', () => {
            switchToPrivateChat(user);
        });
        
        usersList.appendChild(userItem);
    });
}

function handleTyping() {
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing', { 
            recipientId: activeChat === 'group' ? null : activeChat, 
            isTyping: true 
        });
    }
    
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        isTyping = false;
        socket.emit('typing', { 
            recipientId: activeChat === 'group' ? null : activeChat, 
            isTyping: false 
        });
    }, 1000);
}

// **Event Listeners**
groupChatTab.addEventListener('click', switchToGroupChat);

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;

    const messageData = {
        text: text,
        timestamp: Date.now()
    };

    if (activeChat === 'group') {
        socket.emit('group-message', messageData);
    } else {
        socket.emit('private-message', { 
            recipientId: activeChat, 
            message: messageData 
        });
    }

    messageInput.value = '';
});

messageInput.addEventListener('input', handleTyping);

fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('user', currentUser.username);
    formData.append('timestamp', Date.now());
    
    if (activeChat !== 'group') {
        formData.append('recipientId', activeChat);
    }

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();
        
        if (response.ok) {
            socket.emit('file-upload', {
                ...result.file,
                recipientId: activeChat !== 'group' ? activeChat : null
            });
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        alert('Failed to upload file');
    }
    
    fileInput.value = '';
});

// Close modal functionality
document.querySelector('.close-btn').addEventListener('click', () => {
    userInfoModal.classList.add('hidden');
});

window.addEventListener('click', (e) => {
    if (e.target === userInfoModal) {
        userInfoModal.classList.add('hidden');
    }
});

// **Socket Event Handlers**
socket.on('user-registered', (user) => {
    currentUser = user;
    currentUsername.textContent = user.username;
    currentUserId.textContent = `ID: ${user.id}`;
    currentUserPic.src = user.profilePic;
    
    loginScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    
    console.log('User registered:', user);
});

socket.on('users-online', (users) => {
    updateUsersList(users);
    chatStatus.textContent = activeChat === 'group' ? 
        `${users.length} members` : 'Online';
});

socket.on('chat', (messageData) => {
    // Only show messages relevant to current chat
    if (messageData.type === 'group' && activeChat === 'group') {
        const messageElement = createMessageElement(messageData);
        messagesWindow.appendChild(messageElement);
        messagesWindow.scrollTop = messagesWindow.scrollHeight;
    } else if (messageData.type === 'private' && 
               (activeChat === messageData.senderId || activeChat === messageData.recipientId)) {
        const messageElement = createMessageElement(messageData);
        messagesWindow.appendChild(messageElement);
        messagesWindow.scrollTop = messagesWindow.scrollHeight;
    }
});

socket.on('file-received', (fileData) => {
    // Only show files relevant to current chat
    if (fileData.type === 'group' && activeChat === 'group') {
        const fileElement = createFileElement(fileData);
        messagesWindow.appendChild(fileElement);
        messagesWindow.scrollTop = messagesWindow.scrollHeight;
    } else if (fileData.type === 'private' && 
               (activeChat === fileData.senderId || activeChat === fileData.recipientId)) {
        const fileElement = createFileElement(fileData);
        messagesWindow.appendChild(fileElement);
        messagesWindow.scrollTop = messagesWindow.scrollHeight;
    }
});

socket.on('user-typing', (data) => {
    if (data.userId !== currentUser.id) {
        if (data.isTyping) {
            typingIndicator.textContent = `${data.username} is typing...`;
            typingIndicator.classList.remove('hidden');
        } else {
            typingIndicator.classList.add('hidden');
        }
    }
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
    alert(error.message);
});

// Initialize
console.log('Sonnet chat app initialized');