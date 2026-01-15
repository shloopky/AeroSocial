// --- CONFIGURATION ---
const SB_URL = 'YOUR_SUPABASE_URL';
const SB_KEY = 'YOUR_SUPABASE_KEY';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

// --- APP STATE ---
let currentUser = null;
let isLoginMode = false;
let currentView = 'dm'; // 'dm', 'friends', or 'server'
let activeChatID = null; // server_id or friend_id
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
        
        // Create Profile
        await _supabase.from('profiles').insert([{ 
            id: data.user.id, 
            username, 
            bio, 
            pfp: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}` 
        }]);
        alert("Account Created! You can now log in.");
        toggleAuthMode();
    }
}

// --- VIEW CONTROLLER ---
function setView(view, id = null, name = 'Direct Messages') {
    currentView = view;
    activeChatID = id;
    document.getElementById('sidebar-header').innerText = name;
    
    const content = document.getElementById('sidebar-content');
    content.innerHTML = '';

    if (view === 'dm') {
        loadFriends();
    } else if (view === 'friends') {
        renderFriendRequests();
    } else if (view === 'server') {
        renderServerChannels(id);
    }
    loadMessages();
}

// --- SERVER CHANNELS ---
function renderServerChannels(serverId) {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = `
        <div class="channel-item ${activeChannel==='general-1'?'active':''}" onclick="switchChannel('general-1')"># general-1</div>
        <div class="channel-item ${activeChannel==='general-2'?'active':''}" onclick="switchChannel('general-2')"># general-2</div>
    `;
}

function switchChannel(ch) {
    activeChannel = ch;
    renderServerChannels(activeChatID);
    loadMessages();
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
        dm_id: currentView === 'dm' ? activeChatID : null
    };

    await _supabase.from('messages').insert([msgData]);
    input.value = '';
}

async function loadMessages() {
    let query = _supabase.from('messages').select('*, profiles(username, pfp)');
    
    if (currentView === 'server') {
        query = query.eq('server_id', activeChatID).eq('channel_id', activeChannel);
    } else {
        query = query.eq('dm_id', activeChatID);
    }

    const { data } = await query.order('created_at', { ascending: true });
    const box = document.getElementById('chat-messages');
    box.innerHTML = '';
    if (data) data.forEach(msg => appendToUI(msg));
}

function appendToUI(msg) {
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'message-bubble';
    div.innerHTML = `<b>${msg.profiles.username}:</b> ${msg.content}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// --- INITIALIZE ---
window.onload = async () => {
    const { data } = await _supabase.auth.getUser();
    if (data.user) {
        currentUser = data.user;
        document.getElementById('auth-overlay').style.display = 'none';
        setView('dm');
        // Realtime listener
        _supabase.channel('messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            loadMessages();
        }).subscribe();
    }
};
