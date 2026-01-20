// script.js - AeroSocial v2.0 (Enhanced with Friend System)
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
    // Get the current session
    const { data: { session }, error } = await _supabase.auth.getSession();
    
    if (session && session.user) {
        currentUser = session.user;
        await loadMyProfile();
        enterApp();
    } else {
        // No session found, stay at the gatekeeper
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

async function logout() {
    playSound('pop');
    
    // 1. Sign out from Supabase (this clears the server-side session)
    const { error } = await _supabase.auth.signOut();
    
    if (error) {
        console.error("Logout error:", error.message);
    }

    // 2. Force clear local storage just in case
    localStorage.clear(); 
    sessionStorage.clear();

    // 3. Redirect to the gatekeeper (login screen) manually
    // Instead of reload(), we hide the app and show the login
    document.getElementById('app-root').style.display = 'none';
    document.getElementById('gatekeeper').style.display = 'flex';
    document.getElementById('gatekeeper').style.opacity = '1';
    
    // 4. Reset variables
    currentUser = null;
    activeChatID = 'global';
    
    // Optional: Full reload after a tiny delay to ensure a clean state
    setTimeout(() => {
        location.reload();
    }, 100);
}
// =============================================
//  PROFILE & PFP
// =============================================
async function loadMyProfile() {
    const { data, error } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();

    if (error) return console.error('Profile fetch error:', error);

    if (data) {
        document.getElementById('my-display-name').textContent = data.display_name || 'User';
        document.getElementById('my-full-id').textContent = `#${data.id_tag || '0000'}`;
        document.getElementById('my-pfp').src = data.pfp || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.id}`;
    } else {
        const defaultProfile = {
            id: currentUser.id,
            username: currentUser.email?.split('@')[0] || 'user' + Math.floor(Math.random() * 1000),
            display_name: currentUser.email?.split('@')[0] || 'User',
            id_tag: Math.floor(1000 + Math.random() * 9000),
            pfp: `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.id}`
        };
        const { error: insErr } = await _supabase.from('profiles').insert([defaultProfile]);
        if (!insErr) await loadMyProfile();
    }
}

async function handlePfpUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const { data, error } = await _supabase.storage.from('pfps').upload(currentUser.id + '/pfp', file, { upsert: true });
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
//  FRIEND SYSTEM LOGIC
// =============================================
async function promptAddFriend() {
    const name = prompt("Enter Target Username:");
    if (!name) return;
    const tag = prompt("Enter 4-Digit Tag (e.g. 1234):");
    if (!tag) return;

    // Find User
    const { data: targetUser, error } = await _supabase.from('profiles')
        .select('id').eq('username', name.trim()).eq('id_tag', tag.trim()).maybeSingle();

    if (error || !targetUser) return alert("User not found!");
    if (targetUser.id === currentUser.id) return alert("You can't add yourself!");

    // Send Request
    const { error: reqErr } = await _supabase.from('friendships').insert([
        { sender_id: currentUser.id, receiver_id: targetUser.id, status: 'pending' }
    ]);

    if (reqErr) alert("Request already exists or error occurred.");
    else alert("Request Sent!");
}

async function acceptFriend(requestId) {
    playSound('pop');
    await _supabase.from('friendships').update({ status: 'accepted' }).eq('id', requestId);
    loadFriends();
}

// =============================================
//  SIDEBAR & TABS
// =============================================
function setView(type) {
    playSound('pop');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(type === 'dm' ? 'tab-friends' : 'tab-groups').classList.add('active');
    if (type === 'dm') loadFriends();
    else loadGroups();
}

async function loadFriends() {
    const container = document.getElementById('sidebar-list');
    container.innerHTML = '<div class="list-label">TRANSMISSIONS</div>';

    // Global Hub
    const hub = createTrayItem('🌐 Global Hub', null, 'global');
    hub.onclick = () => selectChat('global', 'Global Hub', 'Public community space');
    container.appendChild(hub);

    // Load Accepted Friends
    const { data: friends } = await _supabase.from('friendships')
        .select('id, status, sender:sender_id(id, display_name, pfp), receiver:receiver_id(id, display_name, pfp)')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

    friends?.forEach(f => {
        const isSender = f.sender.id === currentUser.id;
        const friendData = isSender ? f.receiver : f.sender;
        const item = createTrayItem(friendData.display_name, friendData.pfp, f.id);
        item.onclick = () => selectChat(f.id, friendData.display_name, 'Direct Message');
        container.appendChild(item);
    });

    // Load Pending Requests
    const { data: pending } = await _supabase.from('friendships')
        .select('id, sender:sender_id(display_name)')
        .eq('receiver_id', currentUser.id)
        .eq('status', 'pending');

    if (pending?.length > 0) {
        container.innerHTML += '<div class="list-label">PENDING REQUESTS</div>';
        pending.forEach(p => {
            const div = document.createElement('div');
            div.className = 'tray-item pending-req';
            div.innerHTML = `<span>${p.sender.display_name}</span> <button class="mini-accept" onclick="acceptFriend('${p.id}')">✓</button>`;
            container.appendChild(div);
        });
    }
}

async function loadGroups() {
    const container = document.getElementById('sidebar-list');
    container.innerHTML = '<div class="list-label">GROUP FREQUENCIES</div><p style="padding:15px; opacity:0.7; font-size:13px;">No groups joined yet.</p>';
}

function createTrayItem(name, pfpUrl, chatId) {
    const div = document.createElement('div');
    div.className = 'tray-item';
    div.dataset.chatId = chatId;
    div.innerHTML = pfpUrl ? `<img src="${pfpUrl}" class="mini-pfp"><span>${name}</span>` : `<span>${name}</span>`;
    return div;
}

// =============================================
//  MESSAGING
// =============================================
function selectChat(chatId, title, subtitle) {
    playSound('pop');
    activeChatID = chatId;
    updateChatHeader(title, subtitle);
    loadMessages();
    document.querySelectorAll('.tray-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`.tray-item[data-chat-id="${chatId}"]`)?.classList.add('active');
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
    const { data } = await _supabase.from('messages').select('*').eq('chat_id', activeChatID).order('created_at', { ascending: true });
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
    div.innerHTML = `<small>${msg.username_static}</small><div>${msg.content}</div><span class="msg-time">${time}</span>`;
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
        }).subscribe();
}

// =============================================
//  UI HELPERS
// =============================================
function updateChatHeader(title = 'Global Hub', subtitle = 'Public community space') {
    document.getElementById('chat-title').textContent = title;
    document.getElementById('chat-subtitle').textContent = subtitle;
}

function handleMessageInput(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }

function openSettings() { playSound('pop'); document.getElementById('settings-modal').style.display = 'flex'; }
function closeSettings() { playSound('pop'); document.getElementById('settings-modal').style.display = 'none'; }
function logout() { _supabase.auth.signOut(); location.reload(); }
function openPfpManager() { document.getElementById('pfp-upload-input').click(); }
