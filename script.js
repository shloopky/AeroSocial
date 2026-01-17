const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = null;

// 1. INITIALIZATION & AUTH
window.onload = async () => {
    const { data: { user } } = await _supabase.auth.getUser();
    if (user) {
        currentUser = user;
        document.getElementById('auth-overlay').style.display = 'none';
        loadUserProfile();
        setupRealtime();
        setView('dm');
    }
};

async function handleAuth() {
    const email = document.getElementById('email-in').value;
    const password = document.getElementById('pass-in').value;
    const username = document.getElementById('username-in').value;

    // Check if sign-in or sign-up
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });

    if (error && username) {
        const { data: su, error: se } = await _supabase.auth.signUp({ email, password });
        if (se) return alert(se.message);
        
        // Create Profile with Display Name and ID System
        const idTag = Math.floor(1000 + Math.random() * 9000);
        await _supabase.from('profiles').insert([{ 
            id: su.user.id, 
            username: username,
            display_name: username,
            id_tag: idTag,
            pfp: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`
        }]);
        alert("Success! Check email for verification.");
    } else if (error) {
        alert(error.message);
    } else {
        location.reload();
    }
}

// 2. PROFILE & DISPLAY SYSTEM
async function loadUserProfile() {
    const { data: prof } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (prof) {
        document.getElementById('my-name').textContent = prof.username;
        document.getElementById('my-display-name').textContent = prof.display_name;
        document.getElementById('my-id-tag').textContent = `#${prof.id_tag}`;
        document.getElementById('my-pfp').src = prof.pfp;
        
        // Fill profile editor inputs
        document.getElementById('edit-display-name').value = prof.display_name;
        document.getElementById('edit-pfp-url').value = prof.pfp;
    }
}

async function saveProfile() {
    const dn = document.getElementById('edit-display-name').value;
    const pfp = document.getElementById('edit-pfp-url').value;
    await _supabase.from('profiles').update({ display_name: dn, pfp: pfp }).eq('id', currentUser.id);
    loadUserProfile();
    toggleModal('profile-modal');
}

// 3. CHAT & GROUPS
async function setView(view) {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = '';
    
    if (view === 'dm') {
        loadFriends();
    } else if (view === 'groups') {
        loadGroups();
    }
}

async function loadFriends() {
    const { data } = await _supabase.from('friends').select('*, profiles!receiver_id(*)').eq('sender_id', currentUser.id);
    const container = document.getElementById('sidebar-content');
    data?.forEach(f => {
        const div = document.createElement('div');
        div.className = 'sidebar-item user-card';
        div.innerHTML = `<span>${f.profiles.display_name}</span>`;
        div.onclick = () => {
            activeChatID = f.id;
            document.getElementById('active-chat-name').textContent = f.profiles.display_name;
            loadMessages();
        };
        container.appendChild(div);
    });
}

async function sendMessage() {
    const input = document.getElementById('chat-in');
    if (!input.value || !activeChatID) return;

    await _supabase.from('messages').insert([{
        sender_id: currentUser.id,
        content: input.value,
        chat_id: activeChatID,
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
        div.className = `message-bubble ${m.sender_id === currentUser.id ? 'own' : ''}`;
        div.innerHTML = `<strong>${m.username_static}</strong><br>${m.content}`;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

// 4. UTILITIES
function toggleModal(id) {
    const el = document.getElementById(id);
    el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}

function setupRealtime() {
    _supabase.channel('room1').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        loadMessages();
    }).subscribe();
}

async function logout() {
    await _supabase.auth.signOut();
    location.reload();
}
