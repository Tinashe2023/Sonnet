// **Socket Connection**
const socket = io();

// **Get DOM Elements**
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username-input');
const aboutInput = document.getElementById('about-input');
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
const currentUserInfo = document.getElementById('current-user-info');
const chatTitle = document.getElementById('chat-title');
const chatStatus = document.getElementById('chat-status');
const chatAvatar = document.getElementById('chat-avatar');
const chatHeaderClickable = document.getElementById('chat-header-clickable');
const groupChatTab = document.getElementById('group-chat-tab');
const typingIndicator = document.getElementById('typing-indicator');
const userInfoModal = document.getElementById('user-info-modal');
const menuToggle = document.getElementById('menu-toggle');
const sidebar = document.querySelector('.sidebar');
const createRoomBtn = document.getElementById('create-room-btn');
const roomIndicator = document.getElementById('room-indicator');
const copyRoomLinkBtn = document.getElementById('copy-room-link-btn');

// **Global Variables**
let currentUser = null;
let activeChat = 'group'; // 'group' or user ID for private chat
let onlineUsers = [];
let typingTimer = null;
let isTyping = false;
let currentRoomId = null;

// **Room Functionality**
// Get room ID from URL parameter
function getRoomIdFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('room');
}

// Set room ID in URL
function setRoomIdInURL(roomId) {
    const url = new URL(window.location);
    url.searchParams.set('room', roomId);
    window.history.pushState({}, '', url);
}

// Generate room link
function generateRoomLink(roomId) {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?room=${roomId}`;
}

// Initialize room on page load
currentRoomId = getRoomIdFromURL();
if (currentRoomId) {
    roomIndicator.textContent = `🔒 Private Room: ${currentRoomId}`;
    roomIndicator.classList.remove('hidden');
}

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

    const about = (aboutInput && aboutInput.value ? aboutInput.value.trim() : '') || 'Hey there! I am using ClassChat';

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

    // Register user with room ID
    socket.emit('user-register', {
        username: username,
        profilePic: profilePicPath,
        about: about,
        roomId: currentRoomId
    });
});

// Create room button handler
createRoomBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('/create-room');
        const data = await response.json();
        const roomId = data.roomId;

        // Update URL and UI
        setRoomIdInURL(roomId);
        currentRoomId = roomId;
        roomIndicator.textContent = `🔒 Private Room: ${roomId}`;
        roomIndicator.classList.remove('hidden');

        // Show success message
        alert(`Private room created! Share this link with others:\n${generateRoomLink(roomId)}`);
    } catch (error) {
        console.error('Error creating room:', error);
        alert('Failed to create room');
    }
});

// **Utility Functions**
function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString([], {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function loadMessages(type, targetId) {
    messagesWindow.innerHTML = '';
    try {
        let url = '';
        if (type === 'group') {
            url = `/messages/${targetId || 'public'}`;
        } else {
            url = `/messages/private/${targetId}?senderId=${currentUser.id}`;
        }
        const response = await fetch(url);
        const data = await response.json();
        if (data.messages) {
            data.messages.forEach(msg => {
                // Determine if it's a file/sticker or regular text
                const isFile = msg.kind === 'file' || msg.kind === 'sticker';
                const el = isFile ? createFileElement(msg) : createMessageElement(msg);
                messagesWindow.appendChild(el);
            });
            messagesWindow.scrollTop = messagesWindow.scrollHeight;
        }
    } catch (err) {
        console.error('Error loading messages:', err);
    }
}

function switchToGroupChat() {
    activeChat = 'group';
    const roomName = currentRoomId ? `Private Room (${currentRoomId})` : 'Class Chat Room';
    chatTitle.textContent = roomName;
    chatStatus.textContent = `${onlineUsers.length + 1} members`;
    chatStatus.style.color = '';
    chatAvatar.src = 'profile.png';
    groupChatTab.classList.add('active');

    // Show copy room link button if in private room
    if (currentRoomId) {
        copyRoomLinkBtn.classList.remove('hidden');
    } else {
        copyRoomLinkBtn.classList.add('hidden');
    }

    // Clear messages and load group chat history
    loadMessages('group', currentRoomId || 'public');

    // Remove active state from user items
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
    });

    // Close sidebar on mobile after switching to group chat
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('active');
    }
}

function switchToPrivateChat(user) {
    activeChat = user.id;
    chatTitle.textContent = user.username;
    chatStatus.textContent = 'Online';
    chatStatus.style.color = '';
    chatAvatar.src = user.profilePic;
    groupChatTab.classList.remove('active');

    // Update active user item
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.userId === user.id) {
            item.classList.add('active');
        }
    });

    // Clear messages and load private chat history
    loadMessages('private', user.id);
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
        avatar.dataset.userId = messageData.senderId;
        avatar.addEventListener('click', () => showUserProfile(messageData.senderId));
        messageElement.appendChild(avatar);
    }

    const messageBody = document.createElement('div');
    messageBody.classList.add('message-body');

    if (!isSender && messageData.type === 'group') {
        const senderName = document.createElement('div');
        senderName.classList.add('sender-name');
        senderName.textContent = messageData.senderName;
        senderName.addEventListener('click', () => showUserProfile(messageData.senderId));
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
        avatar.dataset.userId = fileData.senderId;
        avatar.addEventListener('click', () => showUserProfile(fileData.senderId));
        messageElement.appendChild(avatar);
    }

    const messageBody = document.createElement('div');
    messageBody.classList.add('message-body');

    if (!isSender && fileData.type === 'group') {
        const senderName = document.createElement('div');
        senderName.classList.add('sender-name');
        senderName.textContent = fileData.senderName;
        senderName.addEventListener('click', () => showUserProfile(fileData.senderId));
        messageBody.appendChild(senderName);
    }

    // Check if it's a voice message
    if (fileData.isVoiceMessage || fileData.filename.includes('voice-')) {
        const audioPlayer = document.createElement('audio');
        audioPlayer.controls = true;
        audioPlayer.src = fileData.path;
        audioPlayer.style.width = '250px'; // Fixed width prevents flex collapse
        messageBody.appendChild(audioPlayer);
    } else {
        const fileLink = document.createElement('a');
        fileLink.href = fileData.path;
        fileLink.classList.add('file-link');
        fileLink.download = fileData.filename;

        const fileIcon = fileData.mimetype.startsWith('image/') ? '🖼️' : '📄';
        fileLink.innerHTML = `${fileIcon} ${fileData.filename}`;
        messageBody.appendChild(fileLink);
    }

    const messageTime = document.createElement('div');
    messageTime.classList.add('message-time');
    const timestamp = fileData.timestamp ? (typeof fileData.timestamp === 'string' ? parseInt(fileData.timestamp) : fileData.timestamp) : Date.now();
    messageTime.textContent = formatTime(timestamp);
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
            // Close sidebar on mobile after selecting a user
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
            }
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
// Voice recording functionality
let mediaRecorder;
let audioChunks = [];
let recordingInterval;
let recordingStartTime;

const voiceBtn = document.getElementById('voice-btn');
const voiceRecordingPanel = document.getElementById('voice-recording-panel');
const recordingTime = document.getElementById('recording-time');
const cancelRecordingBtn = document.getElementById('cancel-recording');
const sendRecordingBtn = document.getElementById('send-recording');

voiceBtn.addEventListener('click', async () => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        // Start recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });

                // If it was cancelled, audioChunks might be emptied by the cancel button before reaching here
                if (audioChunks.length === 0) return;

                // Create FormData and upload
                const formData = new FormData();
                const extension = (mediaRecorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
                formData.append('file', audioBlob, `voice-${Date.now()}.${extension}`);
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
                            recipientId: activeChat !== 'group' ? activeChat : null,
                            isVoiceMessage: true
                        });
                    }
                } catch (error) {
                    console.error('Error uploading voice message:', error);
                    alert('Failed to send voice message');
                }

                // Stop all tracks to release microphone
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            voiceBtn.classList.add('recording');
            voiceRecordingPanel.classList.add('active');

            // Start timer
            recordingStartTime = Date.now();
            recordingInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                recordingTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }, 1000);

        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Could not access microphone. Please grant permission.');
        }
    } else if (mediaRecorder && mediaRecorder.state === 'recording') {
        // Cancel recording if mic button is pressed again
        audioChunks = [];
        mediaRecorder.stop();
        clearInterval(recordingInterval);
        voiceBtn.classList.remove('recording');
        voiceRecordingPanel.classList.remove('active');
        recordingTime.textContent = '0:00';
    }
});

cancelRecordingBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        audioChunks = []; // Clear chunks so onstop ignores it
        mediaRecorder.stop();
        clearInterval(recordingInterval);
        voiceBtn.classList.remove('recording');
        voiceRecordingPanel.classList.remove('active');
        recordingTime.textContent = '0:00';
    }
});

sendRecordingBtn.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        // Just calling stop() will trigger the onstop event handler we defined above
        mediaRecorder.stop();
        clearInterval(recordingInterval);
        voiceBtn.classList.remove('recording');
        voiceRecordingPanel.classList.remove('active');
        recordingTime.textContent = '0:00';
    }
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

// Show profile modal for a given userId
async function showUserProfile(userId) {
    if (!userId) return;
    try {
        const resp = await fetch(`/user/${userId}`);
        if (!resp.ok) throw new Error('User not found');
        const user = await resp.json();
        const modalContent = userInfoModal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.innerHTML = `
                <span class="close-btn">&times;</span>
                <div class="profile-modal-header">
                    <img src="${user.profilePic}" alt="${user.username}" class="profile-modal-pic" />
                    <div class="profile-modal-name">${user.username}</div>
                    <div class="profile-modal-id">ID: ${user.id}</div>
                </div>
                <div class="profile-modal-body">
                    <div class="profile-info-section">
                        <div class="profile-info-label">About</div>
                        <div class="profile-info-value">${user.about || ''}</div>
                    </div>
                    <div class="profile-info-section">
                        <div class="profile-info-label">Status</div>
                        <div class="profile-status-online">Online</div>
                    </div>
                    <div class="profile-info-section">
                        <div class="profile-info-label">Joined</div>
                        <div class="profile-info-value">${formatDate(user.joinedAt)}</div>
                    </div>
                </div>
            `;
            modalContent.querySelector('.close-btn').addEventListener('click', () => {
                userInfoModal.classList.add('hidden');
            });
        }
        userInfoModal.classList.remove('hidden');
    } catch (e) {
        console.error('Failed to load user profile', e);
    }
}

// Optional: Show current user info when clicking chat header (if element exists)
if (typeof chatHeaderClickable !== 'undefined' && chatHeaderClickable) {
    chatHeaderClickable.addEventListener('click', () => {
        if (!currentUser) return;
        const modalContent = userInfoModal.querySelector('.modal-content');
        if (modalContent) {
            const infoHtml = `
                <div class="user-info">
                    <img src="${currentUser.profilePic}" alt="${currentUser.username}" class="user-avatar large">
                    <div class="user-name">${currentUser.username}</div>
                    <div class="user-about">${currentUser.about || ''}</div>
                    <div class="user-meta">Joined: ${formatDate(currentUser.joinedAt || new Date().toISOString())}</div>
                    <div class="user-id">ID: ${currentUser.id}</div>
                </div>
            `;
            modalContent.querySelector('.user-info-body')
                ? modalContent.querySelector('.user-info-body').innerHTML = infoHtml
                : (modalContent.innerHTML = `<div class="user-info-body">${infoHtml}</div>`);
        }
        userInfoModal.classList.remove('hidden');
    });
}

// **Socket Event Handlers**
socket.on('user-registered', (user) => {
    currentUser = user;
    currentRoomId = user.roomId;
    currentUsername.textContent = user.username;
    currentUserId.textContent = `ID: ${user.id}`;
    currentUserPic.src = user.profilePic;
    if (currentUserInfo) {
        currentUserInfo.textContent = user.about || '';
    }

    // Update chat title based on room
    if (currentRoomId && currentRoomId !== 'public') {
        chatTitle.textContent = `Private Room (${currentRoomId})`;
        copyRoomLinkBtn.classList.remove('hidden');
    } else {
        chatTitle.textContent = 'Class Chat Room';
        copyRoomLinkBtn.classList.add('hidden');
    }

    loginScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');

    console.log('User registered:', user, 'Room:', currentRoomId);

    // Load initial group messages
    loadMessages('group', currentRoomId || 'public');
});

socket.on('users-online', (users) => {
    updateUsersList(users);
    if (activeChat === 'group') {
        chatStatus.textContent = `${users.length} members`;
    } else {
        chatStatus.textContent = 'Online';
    }
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
        // Check if typing is relevant to current chat
        const isRelevantToCurrentChat = (
            (activeChat === 'group' && !data.recipientId) ||
            (activeChat === data.userId)
        );

        if (isRelevantToCurrentChat) {
            if (data.isTyping) {
                // Show typing in chat header
                chatStatus.textContent = 'typing...';
                chatStatus.style.color = '#25D366';
            } else {
                // Restore original status
                if (activeChat === 'group') {
                    chatStatus.textContent = `${onlineUsers.length + 1} members`;
                } else {
                    chatStatus.textContent = 'Online';
                }
                chatStatus.style.color = '';
            }
        }
    }
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
    alert(error.message);
});
// Show menu button only on mobile
function updateMenuButtonVisibility() {
    if (window.innerWidth <= 768) {
        menuToggle.style.display = 'flex';
    } else {
        menuToggle.style.display = 'none';
        sidebar.classList.remove('active');
    }
}

menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('active');
});

// Note: User item click handlers are now added dynamically in updateUsersList()
// This ensures they work with dynamically created elements

updateMenuButtonVisibility();
window.addEventListener('resize', updateMenuButtonVisibility);

// Copy room link button handler
copyRoomLinkBtn.addEventListener('click', () => {
    if (currentRoomId) {
        const roomLink = generateRoomLink(currentRoomId);
        navigator.clipboard.writeText(roomLink).then(() => {
            // Show temporary success message
            const originalText = copyRoomLinkBtn.textContent;
            copyRoomLinkBtn.textContent = '✓';
            setTimeout(() => {
                copyRoomLinkBtn.textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy link:', err);
            alert(`Copy this link:\n${roomLink}`);
        });
    }
});

// Initialize
console.log('Sonnet chat app initialized', currentRoomId ? `in room: ${currentRoomId}` : 'in public room');