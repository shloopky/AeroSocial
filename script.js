const SB_URL = 'https://nrpiojdaltgfgswvhrys.supabase.co'; 
const SB_KEY = 'sb_publishable_nu-if7EcpRJkKD9bXM97Rg__X3ELLW7';
const _supabase = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let isLoginMode = false;
let selectedFile = null;

// --- PROFILE CUSTOMIZATION LOGIC ---
function openProfile() {
    document.getElementById('profile-modal').style.display = 'flex';
    document.getElementById('edit-username').value = document.getElementById('my-name').innerText;
}

function closeProfile() {
    document.getElementById('profile-modal').style.display = 'none';
    selectedFile = null;
}

// Drag and Drop Event Listeners
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.onclick = () => fileInput.click();

dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
dropZone.ondragleave = () => dropZone.classList.remove('dragover');
dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files[0]);
};

fileInput.onchange = (e) => handleFiles(e.target.files[0]);

function handleFiles(file) {
    if (!file || !file.type.startsWith('image/')) return;
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('preview-img').src = e.target.result;
        document.getElementById('preview-img').style.display = 'block';
    };
    reader.readAsDataURL(file);
}

async function saveProfile() {
    let pfpUrl = document.getElementById('my-pfp').src;
    const newUsername = document.getElementById('edit-username').value;

    if (selectedFile) {
        const fileName = `${currentUser.id}_${Date.now()}.png`;
        const { data, error } = await _supabase.storage.from('avatars').upload(fileName, selectedFile);
        if (error) return alert("Upload failed: " + error.message);
        const { data: publicUrl } = _supabase.storage.from('avatars').getPublicUrl(fileName);
        pfpUrl = publicUrl.publicUrl;
    }

    await _supabase.from('profiles').upsert({ id: currentUser.id, username: newUsername, pfp: pfpUrl });
    location.reload();
}

// --- AUTH & MESSAGING (Previous Code) ---
async function handleAuth() {
    const email = document.getElementById('email-in').value;
    const password = document.getElementById('pass-in').value;
    if (isLoginMode) {
        const { error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) return alert(error.message);
        location.reload();
    } else {
        const username = document.getElementById('username-in').value;
        const { data, error } = await _supabase.auth.signUp({ email, password });
        if (error) return alert(error.message);
        await _supabase.from('profiles').upsert([{ id: data.user.id, username, pfp: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}` }]);
        toggleAuthMode();
    }
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('signup-fields').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('auth-main-btn').innerText = isLoginMode ? 'Login' : 'Sign Up';
}

async function sendMessage() {
    const input = document.getElementById('chat-in');
    if (!input.value.trim()) return;
    await _supabase.from('messages').insert([{
        sender_id: currentUser.id,
        content: input.value,
        username_static: document.getElementById('my-name').innerText,
        pfp_static: document.getElementById('my-pfp').src
    }]);
    input.value = '';
}

async function loadMessages() {
    const { data } = await _supabase.from('messages').select('*').order('created_at', { ascending: true });
    document.getElementById('chat-messages').innerHTML = data?.map(msg => `
        <div class="message-bubble">
            <img src="${msg.pfp_static}" class="pfp-img">
            <div>
                <div style="font-weight:bold; font-size:12px; color:#0078d7;">${msg.username_static}</div>
                <div>${msg.content}</div>
            </div>
        </div>
    `).join('') || '';
    document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
}

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
        loadMessages();
        _supabase.channel('messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, loadMessages).subscribe();
    }
};
