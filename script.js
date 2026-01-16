const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co'; 
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = null; // Can be a User ID (for DM) or Channel ID (for Server)
let chatType = 'dm'; // 'dm' or 'server'

// --- VIEW CONTROLLER ---
function setView(view, id = null) {
    const content = document.getElementById('sidebar-content');
    const header = document.getElementById('sidebar-header');
    content.innerHTML = '';
    
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));

    if (view === 'dm') {
        document.getElementById('nav-dm').classList.add('active');
        header.innerText = "Direct Messages";
        loadDMList();
    } else if (view === 'friends') {
        document.getElementById('nav-friends').classList.add('active');
        header.innerText = "Add Friends";
        renderFriendsUI();
    } else if (view === 'server') {
        header.innerText = "Channels";
        loadChannels(id);
    }
}

// --- DM SYSTEM ---
async function loadDMList() {
    const { data } = await _supabase.from('friends').select('*, profiles!friends_sender_id_fkey(id, username, pfp), receiver:profiles!friends_receiver_id_fkey(id, username, pfp)').eq('status', 'accepted');
    const content = document.getElementById('sidebar-content');
    
    data?.forEach(rel => {
        const friend = rel.sender_id === currentUser.id ? rel.receiver : rel.profiles;
        const div = document.createElement('div');
        div.className = `friend-item ${activeChatID === friend.id ? 'active-chat' : ''}`;
        div.onclick = () => { activeChatID = friend.id; chatType = 'dm'; loadMessages(); };
        div.innerHTML = `<img src="${friend.pfp}" class="pfp-img" style="width:24px"> <span>${friend.username}</span>`;
        content.appendChild(div);
    });
}

// --- FRIEND REQUESTS (SEND/ACCEPT/DENY) ---
function renderFriendsUI() {
    const content = document.getElementById('sidebar-content');
    content.innerHTML = `
        <div style="padding: 15px;">
            <input type="text" id="friend-search" placeholder="Username..." class="input-box" style="background:white;">
            <button class="aero-btn" onclick="sendFriendRequest()">Send Request</button>
        </div>
        <div class="section-label">Pending Requests</div>
        <div id="pending-list"></div>
    `;
    loadPendingRequests();
}

async function sendFriendRequest() {
    const name = document.getElementById('friend-search').value;
    const { data: target } = await _supabase.from('profiles').eq('username', name).single();
    if (!target) return alert("User not found");
    await _supabase.from('friends').insert([{ sender_id: currentUser.id, receiver_id: target.id, status: 'pending' }]);
    alert("Sent!");
}

async function loadPendingRequests() {
    const { data } = await _supabase.from('friends').select('id, profiles!friends_sender_id_fkey(username)').eq('receiver_id', currentUser.id).eq('status', 'pending');
    const list = document.getElementById('pending-list');
    data?.forEach(req => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `
            <span>${req.profiles.username}</span>
            <div style="display:flex; gap:5px;">
                <button onclick="respondFriend(${req.id}, 'accepted')" class="mini-btn">✔</button>
                <button onclick="respondFriend(${req.id}, 'denied')" class="mini-btn" style="color:red">✖</button>
            </div>
        `;
        list.appendChild(div);
    });
}

async function respondFriend(id, status) {
    if (status === 'denied') {
        await _supabase.from('friends').delete().eq('id', id);
    } else {
        await _supabase.from('friends').update({ status }).eq('id', id);
    }
    setView('friends');
}

// --- SERVER SYSTEM ---
async function createEmptyServer() {
    const name = document.getElementById('server-name-in').value;
    const icon = document.getElementById('server-icon-in').value || '📁';
    const { data: server } = await _supabase.from('servers').insert([{ name, icon, owner_id: currentUser.id }]).select().single();
    
    // Auto-create General and Media channels
    await _supabase.from('channels').insert([
        { server_id: server.id, name: 'general' },
        { server_id: server.id, name: 'media' }
    ]);
    location.reload();
}

async function loadServers() {
    const { data } = await _supabase.from('servers').select('*');
    const list = document.getElementById('server-list');
    data?.forEach(s => {
        const div = document.createElement('div');
        div.className = 'server-icon';
        div.innerText = s.icon.length < 3 ? s.icon : '';
        if(s.icon.length > 3) div.style.backgroundImage = `url(${s.icon})`;
        div.onclick = () => setView('server', s.id);
        list.appendChild(div);
    });
}

async function loadChannels(serverId) {
    const { data } = await _supabase.from('channels').eq('server_id', serverId);
    const content = document.getElementById('sidebar-content');
    data?.forEach(ch => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerText = `# ${ch.name}`;
        div.onclick = () => { activeChatID = ch.id; chatType = 'server'; loadMessages(); };
        content.appendChild(div);
    });
}

// --- MESSAGING ---
async function sendMessage() {
    const input = document.getElementById('chat-in');
    if (!input.value.trim() || !activeChatID) return;

    const msgObj = {
        sender_id: currentUser.id,
        content: input.value,
        username_static: document.getElementById('my-name').innerText,
        pfp_static: document.getElementById('my-pfp').src
    };

    if (chatType === 'server') msgObj.channel_id = activeChatID;
    else msgObj.chat_id = [currentUser.id, activeChatID].sort().join('_');

    await _supabase.from('messages').insert([msgObj]);
    input.value = '';
}

async function loadMessages() {
    let query = _supabase.from('messages').select('*').order('created_at', { ascending: true });
    
    if (chatType === 'server') query = query.eq('channel_id', activeChatID);
    else query = query.eq('chat_id', [currentUser.id, activeChatID].sort().join('_'));

    const { data } = await query;
    const box = document.getElementById('chat-messages');
    box.innerHTML = data?.map(msg => `
        <div class="message-bubble">
            <img src="${msg.pfp_static}" class="pfp-img">
            <div>
                <div style="font-weight:bold; font-size:12px; color:#0078d7;">${msg.username_static}</div>
                <div>${msg.content}</div>
            </div>
        </div>
    `).join('') || '';
    box.scrollTop = box.scrollHeight;
}

// --- INIT ---
window.onload = async () => {
    const { data: { user } } = await _supabase.auth.getUser();
    if (user) {
        currentUser = user;
        document.getElementById('auth-overlay').style.display = 'none';
        const { data: prof } = await _supabase.from('profiles').select('*').eq('id', user.id).single();
        if (prof) {
            document.getElementById('my-name').innerText = prof.username;
            document.getElementById('my-pfp').src = prof.pfp;
        }
        loadServers();
        _supabase.channel('messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, loadMessages).subscribe();
        setView('dm');
    }
};
