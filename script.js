const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = null;
let chatType = 'dm';

window.onload = async () => {
    const { data: { user } } = await _supabase.auth.getUser();
    if (user) {
        currentUser = user;
        document.getElementById('auth-overlay').classList.add('fade-out');
        setTimeout(() => document.getElementById('auth-overlay').style.display = 'none', 500);
        await initApp();
    }
};

async function initApp() {
    await loadMyProfile();
    setupRealtime();
    setView('dm');
}

async function handleAuth() {
    const email = document.getElementById('email-in').value;
    const password = document.getElementById('pass-in').value;
    const username = document.getElementById('username-in').value;

    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    
    if (error && username) {
        const { data: su, error: se } = await _supabase.auth.signUp({ email, password });
        if (se) return alert(se.message);
        
        const idTag = Math.floor(1000 + Math.random() * 9000);
        await _supabase.from('profiles').insert([{ 
            id: su.user.id, 
            username, 
            display_name: username, 
            id_tag: idTag,
            pfp: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
        }]);
        alert("Verification required. Please check your email inbox!");
    } else if (error) {
        alert("System Error: " + error.message);
    } else {
        location.reload();
    }
}

async function loadMyProfile() {
    const { data: prof } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (prof) {
        document.getElementById('my-display-name').textContent = prof.display_name;
        document.getElementById('my-full-id').textContent = `#${prof.id_tag}`;
        document.getElementById('my-pfp').src = prof.pfp;
    }
}

function setView(type) {
    chatType = type;
    const content = document.getElementById('sidebar-content');
    content.innerHTML = '<div class="loader-aero"></div>';
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    // Set tab active logic...

    if (type === 'dm') {
        loadFriends();
    }
}

async function loadFriends() {
    const { data } = await _supabase.from('friendships').select('*, profiles:receiver_id(*)').eq('status', 'accepted');
    const container = document.getElementById('sidebar-content');
    container.innerHTML = '';
    
    data?.forEach(f => {
        const div = document.createElement('div');
        div.className = 'user-tray';
        div.innerHTML = `<img src="${f.profiles.pfp}" class="gel-pfp"> <b>${f.profiles.display_name}</b>`;
        div.onclick = () => {
            activeChatID = f.id;
            document.getElementById('active-chat-title').textContent = f.profiles.display_name;
            loadMessages();
        };
        container.appendChild(div);
    });
}

async function sendMessage() {
    const input = document.getElementById('chat-in');
    if (!input.value.trim() || !activeChatID) return;

    await _supabase.from('messages').insert([{
        sender_id: currentUser.id,
        content: input.value,
        chat_id: activeChatID,
        chat_type: chatType,
        username_static: document.getElementById('my-display-name').textContent,
        pfp_static: document.getElementById('my-pfp').src
    }]);
    input.value = '';
}

async function loadMessages() {
    const { data } = await _supabase.from('messages').select('*').eq('chat_id', activeChatID).order('created_at', {ascending: true});
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    
    data?.forEach(m => {
        const div = document.createElement('div');
        const isOwn = m.sender_id === currentUser.id;
        div.className = isOwn ? 'msg-bubble own' : 'msg-bubble';
        div.innerHTML = `<b>${m.username_static}</b><p>${m.content}</p>`;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

function setupRealtime() {
    _supabase.channel('messages').on('postgres_changes', { 
        event: 'INSERT', schema: 'public', table: 'messages' 
    }, () => loadMessages()).subscribe();
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
