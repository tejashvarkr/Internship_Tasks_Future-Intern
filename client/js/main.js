const token = localStorage.getItem('chatToken');
const currentUserId = localStorage.getItem('chatUserId'); // Store as string, convert to number if needed for comparison
const currentUsername = localStorage.getItem('chatUsername');

if (!token) window.location.href = 'login.html';

document.getElementById('userInfo').textContent = `Logged in as: ${currentUsername}`;

const socket = io('http://localhost:3000', { // Ensure this matches your server
    auth: { token }
});

const API_CHAT_URL = 'http://localhost:3000/api/chat';
let activeRoomId = null;
let activeRoomName = '';

// DOM Elements
const roomListUl = document.getElementById('roomList');
const privateChatListUl = document.getElementById('privateChatList');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const currentRoomNameH2 = document.getElementById('currentRoomName');
const newRoomNameInput = document.getElementById('newRoomName');
const privateChatUserInput = document.getElementById('privateChatUser');

// --- UI Helper Functions ---
function displayMessage(msg) {
    const div = document.createElement('div');
    div.classList.add('message');
    // msg.sender_id will be a number, currentUserId from localStorage is a string
    div.classList.add(msg.sender_id == currentUserId ? 'my-message' : 'other-message'); // Use == for type coercion
    
    const senderName = msg.sender_username || (msg.sender_id == currentUserId ? currentUsername : 'Unknown');

    div.innerHTML = `<p class="meta">${senderName} <span>${new Date(msg.timestamp).toLocaleTimeString()}</span></p>
                     <p class="text">${escapeHtml(msg.content)}</p>`; // Basic XSS protection
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function displayUserEvent(event) {
    if (event.roomId != activeRoomId) return; // Only show for active room
    const div = document.createElement('div');
    div.classList.add('system-message');
    div.textContent = event.message;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addRoomToUi(room, isPrivateList = false) {
    const li = document.createElement('li');
    // For private chats, display the other user's name
    const displayName = isPrivateList ? (room.other_member_username || room.name) : room.name;
    li.textContent = displayName;
    li.dataset.roomId = room.id;
    li.dataset.roomName = displayName; // Store display name
    li.addEventListener('click', () => switchRoom(room.id, displayName));
    
    if (isPrivateList) {
        privateChatListUl.appendChild(li);
    } else {
        roomListUl.appendChild(li);
    }
}

function clearMessages() {
    messagesDiv.innerHTML = '';
}

function setActiveRoomDisplay(roomId, roomName) {
    currentRoomNameH2.textContent = roomName || 'Select a room';
    document.querySelectorAll('#roomList li, #privateChatList li').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.roomId == roomId) {
            item.classList.add('active');
        }
    });
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') {
        return unsafe;
    }
    return unsafe
         .replace(/&/g, "&")
         .replace(/</g, "<")
         .replace(/>/g, ">")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "'");
}


// --- Socket Event Handlers ---
socket.on('connect', () => {
    console.log('Connected to server via WebSocket.');
    loadPublicRooms();
    loadPrivateChats();
});

socket.on('disconnect', (reason) => console.log('Disconnected:', reason));
socket.on('error_message', (msg) => alert(`Server Error: ${msg}`));

socket.on('room_joined', ({ roomId, roomName }) => {
    console.log(`Successfully joined: ${roomName} (ID: ${roomId})`);
    activeRoomId = roomId;
    activeRoomName = roomName;
    clearMessages();
    setActiveRoomDisplay(roomId, roomName);
    // History is loaded by 'load_history' event
});

socket.on('load_history', (historyMessages) => {
    clearMessages(); // Clear again just in case
    historyMessages.forEach(displayMessage);
});

socket.on('new_message', (msg) => {
    if (msg.room_id == activeRoomId) {
        displayMessage(msg);
    } else {
        // Add a visual indicator for new messages in other rooms (optional)
        const roomListItem = document.querySelector(`li[data-room-id='${msg.room_id}']`);
        if (roomListItem && !roomListItem.classList.contains('active')) {
            roomListItem.classList.add('unread'); // You'd need CSS for .unread
        }
    }
});

socket.on('user_event', displayUserEvent);


// --- API Call Functions ---
async function fetchData(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'x-auth-token': token
        }
    };
    const response = await fetch(url, { ...defaultOptions, ...options });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ msg: response.statusText }));
        throw new Error(errorData.msg || 'API request failed');
    }
    return response.json();
}

async function loadPublicRooms() {
    try {
        const rooms = await fetchData(`${API_CHAT_URL}/rooms`);
        roomListUl.innerHTML = '';
        rooms.forEach(room => addRoomToUi(room, false));
    } catch (err) {
        console.error('Error loading public rooms:', err);
    }
}

async function loadPrivateChats() {
    try {
        const privateRooms = await fetchData(`${API_CHAT_URL}/rooms/private/my`);
        privateChatListUl.innerHTML = '';
        privateRooms.forEach(room => addRoomToUi(room, true));
    } catch (err) {
        console.error('Error loading private chats:', err);
    }
}

async function createPublicRoom() {
    const name = newRoomNameInput.value.trim();
    if (!name) return alert('Room name is required.');
    try {
        const newRoom = await fetchData(`${API_CHAT_URL}/rooms`, {
            method: 'POST',
            body: JSON.stringify({ name })
        });
        addRoomToUi(newRoom, false);
        newRoomNameInput.value = '';
        switchRoom(newRoom.id, newRoom.name); // Auto-join
    } catch (err) {
        alert(`Error creating room: ${err.message}`);
    }
}

async function startOrOpenPrivateChat() {
    const otherUsername = privateChatUserInput.value.trim();
    if (!otherUsername) return alert('Other user\'s username is required.');
    if (otherUsername === currentUsername) return alert("Cannot start chat with yourself.");
    try {
        const privateRoom = await fetchData(`${API_CHAT_URL}/rooms/private`, {
            method: 'POST',
            body: JSON.stringify({ otherUsername })
        });
        privateChatUserInput.value = '';
        // Check if already in list, otherwise add and switch
        let existingLi = privateChatListUl.querySelector(`li[data-room-id='${privateRoom.id}']`);
        if (!existingLi) {
            // Fetch updated list of private chats to get other_member_username correctly
            await loadPrivateChats(); 
            // Try to find it again after reload
            existingLi = privateChatListUl.querySelector(`li[data-room-id='${privateRoom.id}']`);
        }
        const roomDisplayName = existingLi ? existingLi.dataset.roomName : otherUsername; // Fallback if not found
        switchRoom(privateRoom.id, roomDisplayName);

    } catch (err) {
        alert(`Error starting private chat: ${err.message}`);
    }
}

// --- Action Functions ---
function switchRoom(roomId, roomName) {
    if (activeRoomId === roomId) return;

    if (activeRoomId !== null) {
        socket.emit('leave_room', { roomId: activeRoomId });
    }
    activeRoomId = null; // Clear active room until join confirmed by server
    currentRoomNameH2.textContent = `Joining ${roomName}...`;
    clearMessages();
    
    socket.emit('join_room', { roomId });
    // 'room_joined' event will update UI and activeRoomId
    
    // Remove 'unread' class if switching to this room
    const roomListItem = document.querySelector(`li[data-room-id='${roomId}']`);
    if (roomListItem) roomListItem.classList.remove('unread');
}

function sendMessage() {
    const content = messageInput.value.trim();
    if (content && activeRoomId) {
        socket.emit('send_message', { roomId: activeRoomId, content });
        messageInput.value = '';
    }
}

function logout() {
    localStorage.removeItem('chatToken');
    localStorage.removeItem('chatUserId');
    localStorage.removeItem('chatUsername');
    socket.disconnect();
    window.location.href = 'login.html';
}

// --- Event Listeners ---
document.getElementById('createRoomBtn').addEventListener('click', createPublicRoom);
document.getElementById('startPrivateChatBtn').addEventListener('click', startOrOpenPrivateChat);
document.getElementById('sendBtn').addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});
document.getElementById('logoutBtn').addEventListener('click', logout);

// Initial load is triggered by socket 'connect' event