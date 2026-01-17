const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = 'global'; // Default to global chat
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
    document.getElementById('gatekeeper').style.display = 'none';
    document.getElementById('app-root').style.display = 'grid';
    setupRealtime();
    loadFriends(); // Load the sidebar friends list
}

// --- Messaging Logic ---
function setupRealtime() {
    if (messageSubscription) _supabase.removeChannel(messageSubscription);
    messageSubscription = _supabase.channel('messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, 
        payload => { 
            // Only show message if it's in the chat we are currently looking at
            if (payload.new.chat_id === activeChatID) appendMsgUI(payload.new); 
        }).subscribe();
}

function appendMsgUI(msg) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = msg.sender_id === currentUser.id ? 'msg-bubble own' : 'msg-bubble';
    div.innerHTML = `<b>${msg.username_static || 'User'}:</b><br>${msg.content}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('chat-in');
    const val = input.value.trim();
    if (!val) return;
    
    await _supabase.from('messages').insert([{ 
        sender_id: currentUser.id, 
        content: val, 
        chat_id: activeChatID,
        username_static: document.getElementById('my-display-name').textContent
    }]);
    input.value = '';
}

// --- Profile & Friends Logic ---
async function loadMyProfile() {
    const { data } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (data) {
        document.getElementById('my-display-name').textContent = data.username;
        document.getElementById('my-full-id').textContent = `#${data.id_tag}`;
        document.getElementById('my-pfp').src = data.pfp || `https://api.dicebear.com/7.x/bottts/svg?seed=${data.username}`;
    }
}

async function loadFriends() {
    const { data } = await _supabase.from('friendships').select('*, profiles:receiver_id(*)').eq('status', 'accepted');
    const container = document.getElementById('sidebar-content');
    if (container) {
        container.innerHTML = '<div style="padding:10px; opacity:0.5;">DIRECT MESSAGES</div>';
        data?.forEach(f => {
            const div = document.createElement('div');
            div.className = 'user-tray'; 
            div.style.cssText = 'padding:10px; cursor:pointer; display:flex; align-items:center; gap:10px; border-bottom:1px solid rgba(255,255,255,0.1);';
            div.innerHTML = `<img src="${f.profiles.pfp}" style="width:30px;height:30px;border-radius:50%;"> <span>${f.profiles.display_name}</span>`;
            div.onclick = () => {
                activeChatID = f.id; // Switch chat to this specific friend ID
                document.getElementById('chat-messages').innerHTML = ''; // Clear chat
                loadMessages(); // Load old messages for this chat
            };
            container.appendChild(div);
        });
    }
}

async function loadMessages() {
    const { data } = await _supabase.from('messages').select('*').eq('chat_id', activeChatID).order('created_at', {ascending: true});
    data?.forEach(m => appendMsgUI(m));
}

// --- Auth UI Logic ---
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
        const { data, error } = await _supabase.auth.signUp({ email, password: pass });
        if (error) return alert(error.message);
        if (data.user) {
            await _supabase.from('profiles').insert([{ 
                id: data.user.id, 
                username: user, 
                display_name: user,
                id_tag: Math.floor(1000 + Math.random() * 9000),
                pfp: `https://api.dicebear.com/7.x/bottts/svg?seed=${user}`
            }]);
            alert("Success! Check your email.");
            toggleAuthMode();
        }
    } else {
        const { error } = await _supabase.auth.signInWithPassword({ email, password: pass });
        if (error) alert(error.message); else location.reload();
    }
}

function openPfpManager() { document.getElementById('pfp-upload-input').click(); }

async function uploadNewPfp(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const fileName = `pfps/${currentUser.id}-${Date.now()}`;
    const { error: upErr } = await _supabase.storage.from('avatars').upload(fileName, file);
    if (upErr) return alert("Upload failed");
    const { data } = _supabase.storage.from('avatars').getPublicUrl(fileName);
    await _supabase.from('profiles').update({ pfp: data.publicUrl }).eq('id', currentUser.id);
    document.getElementById('my-pfp').src = data.publicUrl;
}

function logout() { _supabase.auth.signOut(); location.reload(); }
