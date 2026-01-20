/* ==========================================
   AeroSocial - Core Logic v2.5
   ========================================== */
console.log("AeroSocial: System Initializing...");

const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co';
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let activeChatID = 'global';
let isSignupMode = false;
let messageSubscription = null;

// --- 1. STARTUP ---
window.onload = async () => {
    console.log("AeroSocial: Checking Session...");
    try {
        const { data: { session } } = await _supabase.auth.getSession();
        
        if (session && session.user) {
            currentUser = session.user;
            await loadMyProfile();
            enterApp();
        } else {
            // Show the login screen
            document.getElementById('gatekeeper').classList.remove('hidden');
            document.getElementById('app-root').classList.add('hidden');
        }
    } catch (err) {
        console.error("Connection Error:", err);
    }
};

// --- 2. AUTHENTICATION ---
async function handleAuth() {
    const email = document.getElementById('email-in').value.trim();
    const pass = document.getElementById('pass-in').value;

    if (!email || !pass) return alert("Please fill in all fields.");

    if (isSignupMode) {
        const username = document.getElementById('username-in').value.trim();
        const { data, error } = await _supabase.auth.signUp({ email, password: pass });
        
        if (error) return alert("Signup Error: " + error.message);
        
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
        if (error) return alert("Login Failed: check your credentials.");
        
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
    const btnText = document.getElementById('main-auth-btn');
    btnText.innerText = isSignupMode ? 'Initialize Account' : 'Log In';
    document.getElementById('auth-toggle-text').innerText = isSignupMode ? 'Already have an account?' : 'New user?';
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

// --- 3. PROFILE ---
async function loadMyProfile() {
    const { data } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    if (data) {
        document.getElementById('my-display-name').textContent = data.display_name;
        document.getElementById('my-full-id').textContent = `#${data.id_tag}`;
        document.getElementById('my-pfp').src = data.pfp;
    }
}

// --- 4. MESSAGING & SIDEBAR ---
function setView(type) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (type === 'dm') {
        document.getElementById('tab-friends').classList.add('active');
        loadFriends();
    } else {
        document.getElementById('tab-groups').classList.add('active');
        document.getElementById('sidebar-list').innerHTML = '<div class="list-label">Groups coming soon...</div>';
    }
}

async function loadFriends() {
    const container = document.getElementById('sidebar-list');
    container.innerHTML = '<div class="list-label">TRANSMISSIONS</div>';

    // Global Hub Item
    const hub = document.createElement('div');
    hub.className = `tray-item ${activeChatID === 'global' ? 'active' : ''}`;
    hub.innerHTML = `<span>🌐 Global Hub</span>`;
    hub.onclick = () => selectChat('global', 'Global Hub');
    container.appendChild(hub);

    // Fetch Friendships
    const { data: friends } = await _supabase.from('friendships')
        .select('id, sender:sender_id(id, display_name, pfp), receiver:receiver_id(id, display_name, pfp)')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

    friends?.forEach(f => {
        const friendData = f.sender.id === currentUser.id ? f.receiver : f.sender;
        const item = document.createElement('div');
        item.className = `tray-item ${activeChatID === f.id ? 'active' : ''}`;
        item.innerHTML = `<img src="${friendData.pfp}" class="mini-pfp"><span>${friendData.display_name}</span>`;
        item.onclick = () => selectChat(f.id, friendData.display_name);
        container.appendChild(item);
    });
}

function selectChat(chatId, title) {
    activeChatID = chatId;
    document.getElementById('chat-title').textContent = title;
    loadMessages();
    loadFriends(); 
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

async function sendMessage() {
    const input = document.getElementById('chat-in');
    const text = input.value.trim();
    if (!text) return;
    
    const myName = document.getElementById('my-display-name').textContent;

    await _supabase.from('messages').insert([{
        sender_id: currentUser.id,
        content: text,
        chat_id: activeChatID,
        username_static: myName
    }]);
    
    input.value = '';
}

function setupRealtime() {
    if (messageSubscription) _supabase.removeChannel(messageSubscription);
    messageSubscription = _supabase.channel('any')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            if (payload.new.chat_id === activeChatID) loadMessages();
        }).subscribe();
}

// --- 5. UI HELPERS ---
function handleMessageInput(e) { 
    if (e.key === 'Enter') sendMessage(); 
}

function openSettings() { 
    document.getElementById('settings-modal').style.display = 'flex'; 
}

function closeSettings() { 
    document.getElementById('settings-modal').style.display = 'none'; 
}

async function promptAddFriend() {
    const name = prompt("Target Username:");
    const tag = prompt("4-Digit Tag:");
    if (!name || !tag) return;

    const { data: target } = await _supabase.from('profiles')
        .select('id').eq('username', name.trim()).eq('id_tag', tag.trim()).maybeSingle();

    if (!target) return alert("User not found!");
    
    await _supabase.from('friendships').insert([{ sender_id: currentUser.id, receiver_id: target.id, status: 'pending' }]);
    alert("Request Sent!");
}

function openSettings() { playSound('pop'); document.getElementById('settings-modal').style.display = 'flex'; }
function closeSettings() { playSound('pop'); document.getElementById('settings-modal').style.display = 'none'; }
function logout() { _supabase.auth.signOut(); location.reload(); }
function openPfpManager() { document.getElementById('pfp-upload-input').click(); }
