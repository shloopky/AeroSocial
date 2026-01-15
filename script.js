// --- CONFIGURATION ---
const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co'; // Updated to full URL
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// --- APP STATE ---
let currentUser = null;
let isLoginMode = false;
let currentView = 'dm'; 
let activeChatID = null; 
let activeChannel = 'general-1';

// --- AUTH LOGIC ---
function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('signup-fields').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('auth-main-btn').innerText = isLoginMode ? 'Login' : 'Sign Up';
    document.getElementById('auth-toggle').innerText = isLoginMode ? "Need an account? Sign Up" : "Already have an account? Login";
}

async function handleAuth() {
    const email = document.getElementById('email-in').value;
    const password = document.getElementById('pass-in').value;

    if (isLoginMode) {
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) return alert(error.message);
        location.reload();
    } else {
        const username = document.getElementById('username-in').value;
        const bio = document.getElementById('bio-in').value;
        const { data, error } = await _supabase.auth.signUp({ email, password });
        if (error) return alert(error.message);
        
        // Save profile data
        await _supabase.from('profiles').insert([{ 
            id: data.user.id, 
            username, 
            bio, 
            pfp: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}` 
        }]);
        alert("Success! You can now log in.");
        toggleAuthMode();
    }
}

// --- NAVIGATION & VIEWS ---
function setView(view, id = null, name = 'Direct Messages') {
    currentView = view;
    activeChatID = id;
    document.getElementById('sidebar-header').innerText = name;
    
    // Update active icons
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    if(view === 'dm') document.getElementById('nav-dm').classList.add('active');
    if(view === 'friends') document.getElementById('nav-friends').classList.add('active');

    const content = document.getElementById('sidebar-content');
    content.innerHTML = '';

    if (view === 'dm') {
        content.innerHTML = '<div class="section-label">Friends</div>';
        loadFriendsList();
    } else if (view === 'friends') {
        renderFriendRequestUI();
    } else if (view === 'server') {
        renderServerChannels();
    }
    loadMessages();
}

// --- SERVER CHANNELS SYSTEM ---
function renderServerChannels() {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = `
        <div class="section-label">Channels</div>
        <div class="channel-item ${activeChannel === 'general-1' ? 'active' : ''}" onclick="switchChannel('general-1')"># general-1</div>
        <div class="channel-item ${activeChannel === 'general-2' ? 'active' : ''}" onclick="switchChannel('general-2')"># general-2</div>
    `;
}

function switchChannel(ch) {
    activeChannel = ch;
    renderServerChannels();
    loadMessages();
}

// --- FRIEND REQUESTS ---
function renderFriendRequestUI() {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = `
        <div class="section-label">Add Friend</div>
        <div style="padding: 10px;">
            <input type="text" id="friend-search" placeholder="Enter Username#1234" style="width: 100%; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
            <button class="aero-btn" onclick="sendFriendRequest()" style="width: 100%; margin-top: 8px; font-size: 12px;">Send Request</button>
        </div>
        <div class="section-label">Pending Requests</div>
        <div id="pending-requests" style="padding: 10px;"></div>
    `;
}

// --- MESSAGING ---
async function sendMessage() {
    const input = document.getElementById('chat-in');
    const content = input.value.trim();
    if (!content || !currentUser) return;

    const msgData = {
        sender_id: currentUser.id,
        content: content,
        server_id: currentView === 'server' ? activeChatID : null,
        channel_id: currentView === 'server' ? activeChannel : null,
        dm_id: currentView === 'dm' ? activeChatID : null,
        username_static: document.getElementById('my-name').innerText,
        pfp_static: document.getElementById('my-pfp').src
    };

    await _supabase.from('messages').insert([msgData]);
    input.value = '';
}

async function loadMessages() {
    const box = document.getElementById('chat-messages');
    let query = _supabase.from('messages').select('*');
    
    if (currentView === 'server') {
        query = query.eq('server_id', activeChatID).eq('channel_id', activeChannel);
    } else if (currentView === 'dm') {
        query = query.eq('dm_id', activeChatID);
    }

    const { data } = await query.order('created_at', { ascending: true });
    box.innerHTML = '';
    if (data) data.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'message-bubble';
        div.innerHTML = `
            <img src="${msg.pfp_static}" style="width: 30px; height:30px; border-radius: 8px;">
            <div style="display: flex; flex-direction: column;">
                <span style="font-size: 11px; font-weight: bold; color: #0078d7;">${msg.username_static}</span>
                <span style="font-size: 14px;">${msg.content}</span>
            </div>
        `;
        box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
}

// --- INITIALIZE ---
window.onload = async () => {
    const { data } = await _supabase.auth.getUser();
    if (data.user) {
        currentUser = data.user;
        document.getElementById('auth-overlay').style.display = 'none';
        
        // Fetch profile
        const { data: prof } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        if(prof) {
            document.getElementById('my-name').innerText = prof.username;
            document.getElementById('my-pfp').src = prof.pfp;
        }

        setView('dm');

        // Realtime Subscription
        _supabase.channel('room1').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            loadMessages();
        }).subscribe();
    }
};
