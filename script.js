const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = 'global'; 
let isSignupMode = false;
let messageSubscription = null;

// --- Sound Engine ---
function playSound(type) {
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
    } catch (e) { console.log("Audio blocked"); }
}

// --- Startup Logic ---
window.onload = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        const { data: profile } = await _supabase.from('profiles').select('*').eq('id', session.user.id).single();
        if (profile) {
            currentUser = session.user;
            await loadMyProfile();
            enterApp();
        } else {
            await _supabase.auth.signOut();
            showAuth();
        }
    } else { showAuth(); }
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
        setView('dm'); // Start by loading Friends
        setupRealtime();
    }, 500);
}

// --- Messaging & Realtime ---
function setupRealtime() {
    if (messageSubscription) _supabase.removeChannel(messageSubscription);
    messageSubscription = _supabase.channel('messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, 
        payload => { 
            if (payload.new.chat_id === activeChatID) appendMsgUI(payload.new); 
        }).subscribe();
}

async function loadMessages() {
    const { data } = await _supabase.from('messages').select('*').eq('chat_id', activeChatID).order('created_at', {ascending: true});
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    data?.forEach(m => appendMsgUI(m));
}

async function sendMessage() {
    const input = document.getElementById('chat-in');
    const txt = input.value.trim();
    if (!txt) return;

    await _supabase.from('messages').insert([{
        sender_id: currentUser.id,
        content: txt,
        chat_id: activeChatID,
        username_static: document.getElementById('my-display-name').textContent
    }]);
    input.value = '';
}

function appendMsgUI(msg) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = (msg.sender_id === currentUser.id) ? 'msg-bubble own' : 'msg-bubble';
    div.innerHTML = `<small>${msg.username_static || 'User'}</small><div>${msg.content}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// --- Sidebar Systems (Friends & Groups) ---
function setView(type) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (type === 'dm') loadFriends();
    // if (type === 'group') loadGroups(); // Future Group implementation
}

async function loadFriends() {
    const { data } = await _supabase.from('friendships').select('*, profiles:receiver_id(*)').eq('status', 'accepted');
    const container = document.getElementById('sidebar-content');
    container.innerHTML = '<div style="padding:10px; font-size:12px; opacity:0.6;">TRANSMISSIONS</div>';
    
    // Add "Global Hub" as first option
    const globalDiv = document.createElement('div');
    globalDiv.className = 'user-tray';
    globalDiv.innerHTML = `<span>🌐 Global Hub</span>`;
    globalDiv.onclick = () => { activeChatID = 'global'; loadMessages(); setupRealtime(); };
    container.appendChild(globalDiv);

    data?.forEach(f => {
        const div = document.createElement('div');
        div.className = 'user-tray';
        div.innerHTML = `<img src="${f.profiles.pfp}" style="width:30px;height:30px;border-radius:50%;"> <span>${f.profiles.display_name}</span>`;
        div.onclick = () => {
            activeChatID = f.id;
            loadMessages();
            setupRealtime();
        };
        container.appendChild(div);
    });
}

// --- Profile & Auth UI ---
async function loadMyProfile() {
    const { data } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (data) {
        document.getElementById('my-display-name').textContent = data.display_name;
        document.getElementById('my-full-id').textContent = `#${data.id_tag}`;
        document.getElementById('my-pfp').src = data.pfp;
    }
}

function toggleAuthMode() {
    isSignupMode = !isSignupMode;
    document.getElementById('auth-title').textContent = isSignupMode ? "New Registration" : "System Access";
    document.getElementById('main-auth-btn').textContent = isSignupMode ? "Initialize Account" : "Log In";
    document.getElementById('signup-fields').style.display = isSignupMode ? "block" : "none";
}

async function handleAuth() {
    const email = document.getElementById('email-in').value;
    const pass = document.getElementById('pass-in').value;
    if (isSignupMode) {
        const user = document.getElementById('username-in').value;
        const { data } = await _supabase.auth.signUp({ email, password: pass });
        if (data.user) {
            await _supabase.from('profiles').insert([{ 
                id: data.user.id, username: user, display_name: user, 
                id_tag: Math.floor(1000 + Math.random() * 9000),
                pfp: `https://api.dicebear.com/7.x/bottts/svg?seed=${user}` 
            }]);
            alert("Success! Verify email and log in.");
        }
    } else {
        const { error } = await _supabase.auth.signInWithPassword({ email, password: pass });
        if (error) alert(error.message); else location.reload();
    }
}

function logout() { _supabase.auth.signOut(); location.reload(); }
function openPfpManager() { document.getElementById('pfp-upload-input').click(); }
