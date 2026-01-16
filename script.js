// script.js
const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7'; // WARNING: Use env vars in production
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = null;
let currentServerID = null;
let chatType = 'dm';
let isLoginMode = false;
let displayedMessages = new Set();
let messageSubscription = null;
let currentProfileUserId = null; // used in profile modal

// ────────────────────────────────────────────────
// VIEW & UI CONTROLS
// ────────────────────────────────────────────────

function setView(view, id = null) {
    const content = document.getElementById('sidebar-content');
    const header = document.getElementById('sidebar-header');
    content.innerHTML = '';
    activeChatID = null;
    displayedMessages.clear();
   
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    
    if (view === 'dm') {
        currentServerID = null;
        document.getElementById('nav-dm').classList.add('active');
        header.innerHTML = `Direct Messages`;
        loadDMList();
    } else if (view === 'friends') {
        currentServerID = null;
        document.getElementById('nav-friends').classList.add('active');
        header.innerText = "Friends Management";
        renderFriendsUI();
    } else if (view === 'server') {
        currentServerID = id;
        header.innerHTML = `
            <span>Channels</span>
            <span class="settings-gear" onclick="openServerSettings('${id}')">⚙️</span>
        `;
        document.querySelector(`.server-icon[data-server-id="${id}"]`)?.classList.add('active');
        loadChannels(id);
    }
}

// ────────────────────────────────────────────────
// PROFILE MODAL
// ────────────────────────────────────────────────

async function showProfile(userId) {
    currentProfileUserId = userId;
    const isOwnProfile = userId === currentUser.id;

    const { data: profile, error } = await _supabase
        .from('profiles')
        .select('username, pfp')
        .eq('id', userId)
        .single();

    if (error || !profile) {
        alert("Could not load profile");
        return;
    }

    document.getElementById('profile-title').textContent = isOwnProfile ? "Your Profile" : `${profile.username}'s Profile`;
    document.getElementById('profile-pfp-large').src = profile.pfp || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.username}`;
    document.getElementById('profile-username').value = profile.username;
    
    // Show edit section only for own profile
    document.getElementById('edit-profile-section').style.display = isOwnProfile ? 'block' : 'none';
    
    if (isOwnProfile) {
        document.getElementById('edit-username').value = profile.username;
        document.getElementById('edit-pfp-url').value = profile.pfp.includes('dicebear') ? '' : profile.pfp;
    }

    document.getElementById('profile-modal').style.display = 'flex';
}

function closeProfileModal() {
    document.getElementById('profile-modal').style.display = 'none';
    currentProfileUserId = null;
}

async function saveProfileChanges() {
    if (currentProfileUserId !== currentUser.id) return;

    const newName = document.getElementById('edit-username').value.trim();
    let newPfp = document.getElementById('edit-pfp-url').value.trim();

    if (!newName) {
        alert("Username cannot be empty");
        return;
    }

    if (!newPfp) {
        newPfp = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(newName)}`;
    }

    const { error } = await _supabase
        .from('profiles')
        .update({ username: newName, pfp: newPfp })
        .eq('id', currentUser.id);

    if (error) {
        alert("Error saving profile: " + error.message);
    } else {
        // Update UI
        document.getElementById('my-name').textContent = newName;
        document.getElementById('my-pfp').src = newPfp;
        alert("Profile updated!");
        closeProfileModal();
    }
}

// ────────────────────────────────────────────────
// Make avatars clickable
// ────────────────────────────────────────────────

// Helper to create clickable avatar
function createClickableAvatar(pfpUrl, username, userId, size = 32) {
    const img = document.createElement('img');
    img.src = pfpUrl;
    img.className = 'pfp-img';
    img.style.width = `${size}px`;
    img.style.height = `${size}px`;
    img.style.cursor = 'pointer';
    img.title = username;
    img.onclick = () => showProfile(userId);
    return img;
}

// ────────────────────────────────────────────────
// Updated message rendering (clickable avatars)
// ────────────────────────────────────────────────

async function loadMessages(scrollToBottom = true) {
    if (!activeChatID) return;
    let query = _supabase.from('messages').select('*').order('created_at', { ascending: true });
    if (chatType === 'server') query = query.eq('channel_id', activeChatID);
    else query = query.eq('chat_id', [currentUser.id, activeChatID].sort().join('_'));
    
    const { data } = await query;
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';

    data?.forEach(msg => {
        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${msg.sender_id === currentUser.id ? 'own' : ''}`;
        
        const avatar = createClickableAvatar(
            msg.pfp_static,
            msg.username_static,
            msg.sender_id,
            40
        );

        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = `
            <div class="msg-header">
                <span class="username">${msg.username_static}</span>
                <span class="timestamp">${new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="msg-content">${msg.content}</div>
        `;

        bubble.appendChild(avatar);
        bubble.appendChild(contentDiv);
        container.appendChild(bubble);
    });

    displayedMessages = new Set(data.map(m => m.id));
    if (scrollToBottom) container.scrollTop = container.scrollHeight;
}

function appendMessage(msg) {
    if (displayedMessages.has(msg.id)) return;
    displayedMessages.add(msg.id);

    const container = document.getElementById('chat-messages');
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${msg.sender_id === currentUser.id ? 'own' : ''}`;
    
    const avatar = createClickableAvatar(
        msg.pfp_static,
        msg.username_static,
        msg.sender_id,
        40
    );

    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = `
        <div class="msg-header">
            <span class="username">${msg.username_static}</span>
            <span class="timestamp">${new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="msg-content">${msg.content}</div>
    `;

    bubble.appendChild(avatar);
    bubble.appendChild(contentDiv);
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
}

// ────────────────────────────────────────────────
// Update friend list & pending requests to use clickable avatars
// ────────────────────────────────────────────────

async function loadPendingRequests() {
    const { data } = await _supabase.from('friends')
        .select('id, sender:profiles!friends_sender_id_fkey(id, username, pfp)')
        .eq('receiver_id', currentUser.id)
        .eq('status', 'pending');
   
    const list = document.getElementById('pending-list');
    list.innerHTML = '';
    
    data?.forEach(req => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.style.justifyContent = 'space-between';
        
        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.alignItems = 'center';
        left.style.gap = '10px';
        
        const avatar = createClickableAvatar(req.sender.pfp, req.sender.username, req.sender.id, 32);
        left.appendChild(avatar);
        left.innerHTML += `<span>${req.sender.username}</span>`;

        const right = document.createElement('div');
        right.style.display = 'flex';
        right.style.gap = '5px';
        right.innerHTML = `
            <button onclick="respondFriend(${req.id}, 'accepted')" class="mini-btn">✔</button>
            <button onclick="respondFriend(${req.id}, 'denied')" class="mini-btn" style="color:red">✖</button>
        `;

        div.appendChild(left);
        div.appendChild(right);
        list.appendChild(div);
    });
}

async function loadDMList() {
    const { data } = await _supabase.from('friends')
        .select('*, sender:profiles!friends_sender_id_fkey(id, username, pfp), receiver:profiles!friends_receiver_id_fkey(id, username, pfp)')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
    
    const content = document.getElementById('sidebar-content');
    content.innerHTML = '';

    data?.forEach(rel => {
        const friend = rel.sender_id === currentUser.id ? rel.receiver : rel.sender;
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.onclick = () => { 
            activeChatID = friend.id; 
            chatType = 'dm'; 
            loadMessages(); 
            document.querySelectorAll('.friend-item').forEach(i => i.classList.remove('active-chat'));
            div.classList.add('active-chat');
        };

        const avatar = createClickableAvatar(friend.pfp, friend.username, friend.id, 24);
        div.appendChild(avatar);
        div.innerHTML += `<span>${friend.username}</span>`;
        
        content.appendChild(div);
    });
}

// ────────────────────────────────────────────────
// Your existing functions (only showing changed parts)
// ────────────────────────────────────────────────

window.onload = async () => {
    const { data: { user } } = await _supabase.auth.getUser();
    if (user) {
        currentUser = user;
        document.getElementById('auth-overlay').style.display = 'none';
        
        const { data: prof } = await _supabase.from('profiles').select('*').eq('id', user.id).single();
        if (prof) {
            document.getElementById('my-name').textContent = prof.username;
            document.getElementById('my-pfp').src = prof.pfp;
            // Make your own avatar clickable → settings
            document.getElementById('my-pfp').onclick = () => showProfile(currentUser.id);
            document.querySelector('.user-bar .user-info').onclick = () => showProfile(currentUser.id);
        }

        loadServers();
        subscribeToMessages();
        setView('dm');
    }
};

// ... keep all your other functions (handleAuth, sendMessage, loadChannels, etc.) the same ...
