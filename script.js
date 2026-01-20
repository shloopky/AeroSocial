// script.js - AeroSocial v2.0 (FINAL CLEAN VERSION)
const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = 'global';
let isSignupMode = false;
let messageSubscription = null;
let soundEnabled = true;

// =============================================
//  1. STARTUP & AUTH FLOW
// =============================================
window.onload = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    
    if (session && session.user) {
        currentUser = session.user;
        await loadMyProfile();
        enterApp();
    } else {
        // Show login screen, hide the app
        document.getElementById('gatekeeper').classList.remove('hidden');
        document.getElementById('app-root').classList.add('hidden');
    }
};

async function handleAuth() {
    const email = document.getElementById('email-in').value.trim();
    const pass = document.getElementById('pass-in').value;

    if (!email || !pass) return alert("Please fill in all fields.");

    if (isSignupMode) {
        const username = document.getElementById('username-in').value.trim();
        if (username.length < 3) return alert('Username must be 3+ characters');

        const { data, error } = await _supabase.auth.signUp({ email, password: pass });
        if (error) return alert("Signup Failed: " + error.message);
        
        if (data.user) {
            await _supabase.from('profiles').insert([{
                id: data.user.id,
                username: username,
                display_name: username,
                id_tag: Math.floor(1000 + Math.random() * 9000),
                pfp: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`
            }]);
            alert('Account created! Please check your email for a verification link.');
        }
    } else {
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password: pass });
        if (error) return alert("Login Failed: Invalid email or password.");
        
        if (data.user) {
            currentUser = data.user;
            await loadMyProfile();
            enterApp();
        }
    }
}

function toggleAuthMode() {
    isSignupMode = !isSignupMode;
    document.getElementById('signup-fields').style.display = isSignupMode ? 'block' : 'none';
    document.getElementById('main-auth-btn').querySelector('.btn-text').textContent = isSignupMode ? 'Initialize' : 'Log In';
    document.getElementById('auth-toggle-text').textContent = isSignupMode ? 'Already have an account?' : 'New user?';
}

function enterApp() {
    const gate = document.getElementById('gatekeeper');
    const app = document.getElementById('app-root');

    gate.style.opacity = '0';
    setTimeout(() => {
        gate.classList.add('hidden');
        app.classList.remove('hidden');
        
        setView('dm');
        setupRealtime();
        loadMessages();
        updateChatHeader();
    }, 500);
}

async function logout() {
    await _supabase.auth.signOut();
    localStorage.clear();
    sessionStorage.clear();

    // Immediately flip the visibility
    document.getElementById('app-root').classList.add('hidden');
    document.getElementById('gatekeeper').classList.remove('hidden');
    document.getElementById('gatekeeper').style.opacity = '1';

    // Refresh to clear memory
    setTimeout(() => location.reload(), 100);
}

// =============================================
//  2. PROFILE & PFP
// =============================================
async function loadMyProfile() {
    const { data, error } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();

    if (data) {
        document.getElementById('my-display-name').textContent = data.display_name;
        document.getElementById('my-full-id').textContent = `#${data.id_tag}`;
        document.getElementById('my-pfp').src = data.pfp;
    }
}

async function handlePfpUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const { data, error } = await _supabase.storage.from('pfps').upload(currentUser.id + '/pfp', file, { upsert: true });
    if (error) return alert('Upload failed: ' + error.message);

    const { data: { publicUrl } } = _supabase.storage.from('pfps').getPublicUrl(currentUser.id + '/pfp');
    await _supabase.from('profiles').update({ pfp: publicUrl }).eq('id', currentUser.id);
    document.getElementById('my-pfp').src = publicUrl + '?' + Date.now();
}

// =============================================
//  3. FRIEND SYSTEM
// =============================================
async function promptAddFriend() {
    const name = prompt("Enter Target Username:");
    const tag = prompt("Enter 4-Digit Tag (e.g. 1234):");
    if (!name || !tag) return;

    const { data: targetUser } = await _supabase.from('profiles')
        .select('id').eq('username', name.trim()).eq('id_tag', tag.trim()).maybeSingle();

    if (!targetUser) return alert("User not found!");
    
    const { error } = await _supabase.from('friendships').insert([
        { sender_id: currentUser.id, receiver_id: targetUser.id, status: 'pending' }
    ]);

    if (error) alert("Could not send request.");
    else alert("Request Sent!");
}

async function acceptFriend(requestId) {
    await _supabase.from('friendships').update({ status: 'accepted' }).eq('id', requestId);
    loadFriends();
}

// =============================================
//  4. SIDEBAR & MESSAGING
// =============================================
function setView(type) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(type === 'dm' ? 'tab-friends' : 'tab-groups').classList.add('active');
    if (type === 'dm') loadFriends();
}

async function loadFriends() {
    const container = document.getElementById('sidebar-list');
    container.innerHTML = '<div class="list-label">TRANSMISSIONS</div>';

    // Global Hub
    const hub = createTrayItem('🌐 Global Hub', null, 'global');
    hub.onclick = () => selectChat('global', 'Global Hub', 'Public community space');
    container.appendChild(hub);

    // Friend list fetching...
    const { data: friends } = await _supabase.from('friendships')
        .select('id, sender:sender_id(id, display_name, pfp), receiver:receiver_id(id, display_name, pfp)')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

    friends?.forEach(f => {
        const friendData = f.sender.id === currentUser.id ? f.receiver : f.sender;
        const item = createTrayItem(friendData.display_name, friendData.pfp, f.id);
        item.onclick = () => selectChat(f.id, friendData.display_name, 'Direct Message');
        container.appendChild(item);
    });
}

function createTrayItem(name, pfpUrl, chatId) {
    const div = document.createElement('div');
    div.className = 'tray-item';
    if (chatId === activeChatID) div.classList.add('active');
    div.dataset.chatId = chatId;
    div.innerHTML = pfpUrl ? `<img src="${pfpUrl}" class="mini-pfp"><span>${name}</span>` : `<span>${name}</span>`;
    return div;
}

function selectChat(chatId, title, subtitle) {
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
    data?.forEach(m => {
        const div = document.createElement('div');
        div.className = m.sender_id === currentUser.id ? 'msg own' : 'msg';
        div.innerHTML = `<small>${m.username_static}</small><div>${m.content}</div>`;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

function setupRealtime() {
    if (messageSubscription) _supabase.removeChannel(messageSubscription);
    messageSubscription = _supabase.channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            if (payload.new.chat_id === activeChatID) loadMessages();
        }).subscribe();
}

// =============================================
//  5. UI HELPERS
// =============================================
function updateChatHeader(title, subtitle) {
    document.getElementById('chat-title').textContent = title || 'Global Hub';
    document.getElementById('chat-subtitle').textContent = subtitle || '';
}

function handleMessageInput(e) { if (e.key === 'Enter') sendMessage(); }
function openSettings() { document.getElementById('settings-modal').style.display = 'flex'; }
function closeSettings() { document.getElementById('settings-modal').style.display = 'none'; }
function openPfpManager() { document.getElementById('pfp-upload-input').click(); }
        item.onclick = () => selectChat(f.id, friendData.display_name, 'Direct Message');
        container.appendChild(item);
    });

    // Pending Requests
    const { data: pending } = await _supabase.from('friendships')
        .select('id, sender:sender_id(display_name)')
        .eq('receiver_id', currentUser.id)
        .eq('status', 'pending');

    if (pending?.length > 0) {
        container.innerHTML += '<div class="list-label">PENDING</div>';
        pending.forEach(p => {
            const div = document.createElement('div');
            div.className = 'tray-item pending-req';
            div.innerHTML = `<span>${p.sender.display_name}</span> <button class="mini-accept" onclick="acceptFriend('${p.id}')">✓</button>`;
            container.appendChild(div);
        });
    }
}

async function loadGroups() {
    document.getElementById('sidebar-list').innerHTML = '<div class="list-label">GROUPS</div><p style="padding:15px; opacity:0.6;">Coming soon...</p>';
}

function createTrayItem(name, pfpUrl, chatId) {
    const div = document.createElement('div');
    div.className = 'tray-item';
    if (chatId === activeChatID) div.classList.add('active');
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
    
    await _supabase.from('messages').insert([{
        sender_id: currentUser.id,
        content: text,
        chat_id: activeChatID,
        username_static: document.getElementById('my-display-name').textContent
    }]);
    input.value = '';
    playSound('pop');
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
function openSettings() { document.getElementById('settings-modal').style.display = 'flex'; }
function closeSettings() { document.getElementById('settings-modal').style.display = 'none'; }
function openPfpManager() { document.getElementById('pfp-upload-input').click(); }}

function openSettings() { playSound('pop'); document.getElementById('settings-modal').style.display = 'flex'; }
function closeSettings() { playSound('pop'); document.getElementById('settings-modal').style.display = 'none'; }
function logout() { _supabase.auth.signOut(); location.reload(); }
function openPfpManager() { document.getElementById('pfp-upload-input').click(); }
