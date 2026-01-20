// script.js - AeroSocial v2.0
// Fully updated to match your new index.html and style.css
// Includes all new features you added + fixes for everything to work perfectly

const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = 'global';
let isSignupMode = false;
let messageSubscription = null;
let soundEnabled = true;

// =============================================
//  SOUND ENGINE
// =============================================
function playSound(type) {
    if (!soundEnabled) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(type === 'pop' ? 600 : 440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(type === 'pop' ? 300 : 880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.2);
    } catch (e) {}
}

// =============================================
//  STARTUP & AUTH
// =============================================
window.onload = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        await loadMyProfile();
        enterApp();
    } else {
        showAuth();
    }
};

function showAuth() {
    document.getElementById('gatekeeper').style.display = 'flex';
    document.getElementById('app-root').style.display = 'none';
}

function enterApp() {
    playSound('login');
    const gate = document.getElementById('gatekeeper');
    gate.style.opacity = '0';
    setTimeout(() => {
        gate.style.display = 'none';
        document.getElementById('app-root').style.display = 'flex';
        setView('dm');
        setupRealtime();
        loadMessages();
        updateChatHeader();
    }, 500);
}

// =============================================
//  AUTH FUNCTIONS
// =============================================
async function handleAuth() {
    const btn = document.getElementById('main-auth-btn');
    const loader = btn.querySelector('.btn-loader');
    const text = btn.querySelector('.btn-text');
    text.style.display = 'none';
    loader.style.display = 'inline';

    const email = document.getElementById('email-in').value.trim();
    const pass = document.getElementById('pass-in').value;

    if (isSignupMode) {
        const username = document.getElementById('username-in').value.trim();
        if (username.length < 3) {
            alert('Username must be at least 3 characters');
            resetBtn(); return;
        }
        const { data, error } = await _supabase.auth.signUp({ email, password: pass });
        if (error) {
            alert(error.message);
        } else {
            await _supabase.from('profiles').insert([{
                id: data.user.id,
                username: username,
                display_name: username,
                id_tag: Math.floor(1000 + Math.random() * 9000),
                pfp: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`
            }]);
            alert('Account created! Check your email to verify.');
        }
    } else {
        const { error } = await _supabase.auth.signInWithPassword({ email, password: pass });
        if (error) alert(error.message);
        else location.reload();
    }
    function resetBtn() {
        text.style.display = 'inline';
        loader.style.display = 'none';
    }
    resetBtn();
}

function toggleAuthMode() {
    playSound('pop');
    isSignupMode = !isSignupMode;
    document.getElementById('signup-fields').style.display = isSignupMode ? 'block' : 'none';
    document.getElementById('main-auth-btn').querySelector('.btn-text').textContent = isSignupMode ? 'Initialize' : 'Log In';
    document.getElementById('auth-toggle-text').textContent = isSignupMode ? 'Already have an account?' : 'New user?';
}

function logout() {
    playSound('pop');
    _supabase.auth.signOut();
    location.reload();
}

// =============================================
//  PROFILE & PFP
// =============================================
async function loadMyProfile() {
    const { data, error } = await _supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();  // ← Change this line!

    if (error) {
        console.error('Profile fetch error:', error);
        // Optional: show a nice message or fallback UI
        document.getElementById('my-display-name').textContent = 'User';
        document.getElementById('my-full-id').textContent = '#0000';
        document.getElementById('my-pfp').src = 'https://api.dicebear.com/7.x/bottts/svg?seed=fallback';
        return;
    }

    if (data) {
        document.getElementById('my-display-name').textContent = data.display_name || 'User';
        document.getElementById('my-full-id').textContent = `#${data.id_tag || '0000'}`;
        document.getElementById('my-pfp').src = data.pfp || `https://api.dicebear.com/7.x/bottts/svg?seed=${data.display_name || currentUser.id}`;
    } else {
        // No profile row exists yet → create one automatically (common pattern)
        console.warn('No profile found – creating default');
        const defaultProfile = {
            id: currentUser.id,
            username: currentUser.email?.split('@')[0] || 'user',
            display_name: currentUser.email?.split('@')[0] || 'User',
            id_tag: Math.floor(1000 + Math.random() * 9000),
            pfp: `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.id}`
        };
        await _supabase.from('profiles').insert([defaultProfile]);
        // Reload profile after insert
        await loadMyProfile();  // recursive call (or just set UI directly)
    }
}

function openPfpManager() {
    playSound('pop');
    document.getElementById('pfp-upload-input').click();
}

async function handlePfpUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const { data, error } = await _supabase.storage
        .from('pfps')
        .upload(currentUser.id + '/pfp', file, { upsert: true });
    if (error) {
        alert('Upload failed: ' + error.message);
    } else {
        const { data: { publicUrl } } = _supabase.storage.from('pfps').getPublicUrl(currentUser.id + '/pfp');
        await _supabase.from('profiles').update({ pfp: publicUrl }).eq('id', currentUser.id);
        document.getElementById('my-pfp').src = publicUrl + '?' + Date.now();
        playSound('pop');
    }
}

// =============================================
//  SIDEBAR: TABS, SEARCH, LIST
// =============================================
function setView(type) {
    playSound('pop');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(type === 'dm' ? 'tab-friends' : 'tab-groups').classList.add('active');
    document.getElementById('contact-search').value = '';
    if (type === 'dm') loadFriends();
    else loadGroups();
}

async function loadFriends() {
    const { data } = await _supabase.from('friendships')
        .select('*, profiles:receiver_id(display_name, pfp)')
        .eq('status', 'accepted');
    
    const container = document.getElementById('sidebar-list');
    container.innerHTML = '<div class="list-label">TRANSMISSIONS</div>';

    // Global Hub
    const hub = createTrayItem('🌐 Global Hub', null, 'global');
    hub.onclick = () => selectChat('global', 'Global Hub', 'Public community space');
    container.appendChild(hub);

    // Friends
    data?.forEach(f => {
        const item = createTrayItem(f.profiles.display_name, f.profiles.pfp, f.id);
        item.onclick = () => selectChat(f.id, f.profiles.display_name, 'Direct message');
        container.appendChild(item);
    });
}

async function loadGroups() {
    const container = document.getElementById('sidebar-list');
    container.innerHTML = '<div class="list-label">GROUP FREQUENCIES</div><p style="padding:15px; opacity:0.7; font-size:13px;">No groups joined yet.</p>';
}

function createTrayItem(name, pfpUrl, chatId) {
    const div = document.createElement('div');
    div.className = 'tray-item';
    div.dataset.chatId = chatId;
    if (pfpUrl) {
        div.innerHTML = `<img src="${pfpUrl}" class="mini-pfp"><span>${name}</span>`;
    } else {
        div.innerHTML = `<span>${name}</span>`;
    }
    return div;
}

function selectChat(chatId, title, subtitle) {
    playSound('pop');
    activeChatID = chatId;
    updateChatHeader(title, subtitle);
    loadMessages();
    document.querySelectorAll('.tray-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`.tray-item[data-chat-id="${chatId}"]`)?.classList.add('active');
}

function updateChatHeader(title = 'Global Hub', subtitle = 'Public community space') {
    document.getElementById('chat-title').textContent = title;
    document.getElementById('chat-subtitle').textContent = subtitle;
}

function filterContacts(query) {
    const items = document.querySelectorAll('.tray-item');
    items.forEach(item => {
        const text = item.querySelector('span').textContent.toLowerCase();
        item.style.display = text.includes(query.toLowerCase()) ? 'flex' : 'none';
    });
}

// =============================================
//  MESSAGING
// =============================================
function handleMessageInput(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function handleTyping() {
    // Placeholder for future realtime typing indicator
}

async function sendMessage() {
    const input = document.getElementById('chat-in');
    const text = input.value.trim();
    if (!text) return;
    playSound('pop');
    await _supabase.from('messages').insert([{
        sender_id: currentUser.id,
        content: text,
        chat_id: activeChatID,
        username_static: document.getElementById('my-display-name').textContent
    }]);
    input.value = '';
}

async function loadMessages() {
    const { data } = await _supabase
        .from('messages')
        .select('*')
        .eq('chat_id', activeChatID)
        .order('created_at', { ascending: true });

    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    data?.forEach(m => appendMsgUI(m));
    container.scrollTop = container.scrollHeight;
}

function appendMsgUI(msg) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = msg.sender_id === currentUser.id ? 'msg own' : 'msg';
    const time = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    div.innerHTML = `
        <small>${msg.username_static}</small>
        <div>${msg.content}</div>
        <span class="msg-time">${time}</span>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function setupRealtime() {
    if (messageSubscription) _supabase.removeChannel(messageSubscription);
    messageSubscription = _supabase.channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            if (payload.new.chat_id === activeChatID) {
                appendMsgUI(payload.new);
                if (payload.new.sender_id !== currentUser.id) playSound('pop');
            }
        })
        .subscribe();
}

// =============================================
//  UI FEATURES
// =============================================
function attachFile() {
    playSound('pop');
    alert('File attachment coming soon!');
}

function toggleChatInfo() {
    playSound('pop');
    const panel = document.getElementById('chat-info-panel');
    panel.style.display = panel.style.display === 'none' || panel.style.display === '' ? 'block' : 'none';
}

function toggleSearch() {
    playSound('pop');
    alert('Message search coming soon!');
}

function openSettings() {
    playSound('pop');
    document.getElementById('settings-modal').style.display = 'flex';
}

function closeSettings() {
    playSound('pop');
    document.getElementById('settings-modal').style.display = 'none';
}

function toggleDarkMode() {
    playSound('pop');
    document.body.classList.toggle('dark-mode');
    // You can expand this later with full dark CSS variables
}

function toggleSounds() {
    playSound('pop');
    soundEnabled = !soundEnabled;
    document.getElementById('sound-toggle').checked = soundEnabled;
}
