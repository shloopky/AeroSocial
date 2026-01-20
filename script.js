const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = 'global';
let isSignupMode = false;
let messageSubscription = null;

// Simple Sound (No external files needed)
function playSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
}

window.onload = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session && session.user) {
        currentUser = session.user;
        await loadMyProfile();
        enterApp();
    } else {
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
        const { data, error } = await _supabase.auth.signUp({ email, password: pass });
        if (error) return alert(error.message);
        if (data.user) {
            await _supabase.from('profiles').insert([{
                id: data.user.id, username, display_name: username,
                id_tag: Math.floor(1000 + Math.random() * 9000),
                pfp: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`
            }]);
            alert('Check your email for a verification link!');
        }
    } else {
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password: pass });
        if (error) return alert("Login Failed: Invalid credentials.");
        currentUser = data.user;
        await loadMyProfile();
        enterApp();
    }
}

function enterApp() {
    document.getElementById('gatekeeper').classList.add('hidden');
    document.getElementById('app-root').classList.remove('hidden');
    setView('dm');
    setupRealtime();
    loadMessages();
}

async function logout() {
    await _supabase.auth.signOut();
    localStorage.clear();
    location.reload();
}

function toggleAuthMode() {
    isSignupMode = !isSignupMode;
    document.getElementById('signup-fields').style.display = isSignupMode ? 'block' : 'none';
    document.getElementById('main-auth-btn').innerText = isSignupMode ? 'Initialize' : 'Log In';
}

async function loadMyProfile() {
    const { data } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    if (data) {
        document.getElementById('my-display-name').textContent = data.display_name;
        document.getElementById('my-full-id').textContent = `#${data.id_tag}`;
        document.getElementById('my-pfp').src = data.pfp;
    }
}

function setView(type) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(type === 'dm' ? 'tab-friends' : 'tab-groups').classList.add('active');
    loadFriends();
}

async function loadFriends() {
    const container = document.getElementById('sidebar-list');
    container.innerHTML = '<div class="list-label">TRANSMISSIONS</div>';
    
    const hub = createTrayItem('🌐 Global Hub', null, 'global');
    hub.onclick = () => selectChat('global', 'Global Hub');
    container.appendChild(hub);

    const { data: friends } = await _supabase.from('friendships')
        .select('id, sender:sender_id(id, display_name, pfp), receiver:receiver_id(id, display_name, pfp)')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

    friends?.forEach(f => {
        const friendData = f.sender.id === currentUser.id ? f.receiver : f.sender;
        const item = createTrayItem(friendData.display_name, friendData.pfp, f.id);
        item.onclick = () => selectChat(f.id, friendData.display_name);
        container.appendChild(item);
    });
}

function createTrayItem(name, pfp, id) {
    const div = document.createElement('div');
    div.className = `tray-item ${id === activeChatID ? 'active' : ''}`;
    div.innerHTML = pfp ? `<img src="${pfp}" class="mini-pfp"><span>${name}</span>` : `<span>${name}</span>`;
    return div;
}

function selectChat(id, title) {
    activeChatID = id;
    document.getElementById('chat-title').textContent = title;
    loadMessages();
    loadFriends(); // Refresh active state
}

async function sendMessage() {
    const input = document.getElementById('chat-in');
    const text = input.value.trim();
    if (!text) return;
    await _supabase.from('messages').insert([{
        sender_id: currentUser.id, content: text, chat_id: activeChatID,
        username_static: document.getElementById('my-display-name').textContent
    }]);
    input.value = '';
    playSound();
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

function handleMessageInput(e) { if (e.key === 'Enter') sendMessage(); }
function openSettings() { document.getElementById('settings-modal').style.display = 'flex'; }
function closeSettings() { document.getElementById('settings-modal').style.display = 'none'; }

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
