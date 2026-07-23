// Authentication and Track Management System
let users = JSON.parse(localStorage.getItem('cw_users_db')) || [];
let currentUser = JSON.parse(localStorage.getItem('cw_current_session')) || null;

// Clean Initial State: No pre-filled or synthetic mock tracks
let tracks = JSON.parse(localStorage.getItem('cw_tracks_db')) || [];

// In-Page Notification Toast System
function showToast(message) {
    const toast = document.getElementById('toastNotification');
    toast.innerText = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

// In-Page Custom Confirmation Modal
function customConfirm(message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const msgElem = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

    msgElem.innerText = message;
    modal.style.display = 'flex';

    const handleOk = () => {
        modal.style.display = 'none';
        cleanup();
        onConfirm();
    };

    const handleCancel = () => {
        modal.style.display = 'none';
        cleanup();
    };

    function cleanup() {
        okBtn.removeEventListener('click', handleOk);
        cancelBtn.removeEventListener('click', handleCancel);
    }

    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
}

function updateUI() {
    const authSection = document.getElementById('authSection');
    if (currentUser) {
        authSection.innerHTML = `
            <span style="font-weight:700; color:var(--primary-pink); align-self:center;">🌸 ${escapeHtml(currentUser.username)}</span>
            <button class="btn btn-outline" onclick="logout()">Sign Out</button>
        `;
    } else {
        authSection.innerHTML = `
            <button class="btn btn-outline" onclick="openModal('loginModal')">Sign In</button>
            <button class="btn btn-pink" onclick="openModal('registerModal')">Sign Up</button>
        `;
    }
    renderTracks();
}

function renderTracks() {
    const container = document.getElementById('trackContainer');
    if (tracks.length === 0) {
        container.innerHTML = '<p style="color:#8a7a8e; font-size:0.95rem; text-align:center; padding: 20px 0;">Henüz kütüphaneye yüklenmiş müzik bulunmuyor. Formu kullanarak orijinal .wav dosyanızı yükleyebilirsiniz.</p>';
        return;
    }
    
    container.innerHTML = tracks.map((track) => {
        const isOwner = currentUser && (currentUser.username === track.uploader);
        
        return `
            <div class="track-item">
                <div class="track-header">
                    <div class="track-info">
                        <h4>${escapeHtml(track.name)}</h4>
                        <p>${escapeHtml(track.genre)} &bull; <span class="track-uploader">Uploaded by @${escapeHtml(track.uploader)}</span></p>
                    </div>
                    ${
                        isOwner 
                        ? `<button class="btn btn-outline" onclick="deleteTrack(${track.id})" style="padding:4px 10px; font-size:0.8rem; border-color:#ff5c7c; color:#ff5c7c;">Delete</button>`
                        : `<button class="btn btn-disabled" title="Yalnızca kendi yüklediğiniz parçaları silebilirsiniz" disabled style="padding:4px 10px; font-size:0.8rem;">Protected</button>`
                    }
                </div>
                <div class="audio-player-container">
                    <audio controls preload="metadata">
                        <source src="${track.audioSrc}" type="audio/wav">
                        <source src="${track.audioSrc}" type="audio/mpeg">
                        Tarayıcınız ses oynatıcısını desteklemiyor.
                    </audio>
                </div>
            </div>
        `;
    }).join('');
}

// User Registration Handler
function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('regUser').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPass').value;
    const errorElem = document.getElementById('regError');

    errorElem.innerText = "";

    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        errorElem.innerText = "Bu kullanıcı adı zaten alınmış.";
        return;
    }

    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
        errorElem.innerText = "Bu e-posta adresiyle kayıtlı bir hesap zaten var.";
        return;
    }

    const newUser = { username, email, password };
    users.push(newUser);
    localStorage.setItem('cw_users_db', JSON.stringify(users));

    currentUser = { username: newUser.username, email: newUser.email };
    localStorage.setItem('cw_current_session', JSON.stringify(currentUser));

    closeModal('registerModal');
    document.getElementById('regUser').value = "";
    document.getElementById('regEmail').value = "";
    document.getElementById('regPass').value = "";
    
    updateUI();
    showToast(`Hesap oluşturuldu! Hoş geldin, ${newUser.username}! ✨`);
}

// User Login Handler
function handleLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('loginUser').value.trim();
    const passwordInput = document.getElementById('loginPass').value;
    const errorElem = document.getElementById('loginError');

    errorElem.innerText = "";

    const user = users.find(u => 
        (u.username.toLowerCase() === usernameInput.toLowerCase() || u.email.toLowerCase() === usernameInput.toLowerCase()) && 
        u.password === passwordInput
    );

    if (!user) {
        errorElem.innerText = "Geçersiz kullanıcı adı veya şifre.";
        return;
    }

    currentUser = { username: user.username, email: user.email };
    localStorage.setItem('cw_current_session', JSON.stringify(currentUser));

    closeModal('loginModal');
    document.getElementById('loginUser').value = "";
    document.getElementById('loginPass').value = "";

    updateUI();
    showToast(`Tekrar hoş geldin, ${user.username}! ✨`);
}

// Track Upload Handler (Proper File URL/Data Reader integration)
function handleAddMusic(e) {
    e.preventDefault();
    if (!currentUser) {
        showToast("Ses dosyası yüklemek için lütfen giriş yapın.");
        openModal('loginModal');
        return;
    }

    const name = document.getElementById('trackName').value.trim();
    const genre = document.getElementById('trackGenre').value;
    const fileInput = document.getElementById('trackFile');
    const file = fileInput.files[0];

    if (!file) {
        showToast("Lütfen bir ses dosyası seçin.");
        return;
    }

    const fileNameLower = file.name.toLowerCase();
    if (!fileNameLower.endsWith('.wav') && !fileNameLower.endsWith('.mp3')) {
        showToast("Lütfen geçerli bir .wav veya .mp3 ses dosyası yükleyin!");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        const audioDataUrl = event.target.result;

        const newTrack = {
            id: Date.now(),
            name: name,
            genre: genre,
            fileName: file.name,
            audioSrc: audioDataUrl,
            uploader: currentUser.username
        };

        tracks.push(newTrack);
        try {
            localStorage.setItem('cw_tracks_db', JSON.stringify(tracks));
        } catch(err) {
            console.warn("Dosya boyutu yüksek olduğu için tarayıcı belleğinde oturum boyunca saklanacak.");
        }
        
        renderTracks();
        document.getElementById('addMusicForm').reset();
        showToast("Müzik parçası başarıyla yüklendi ve oynatıcıya eklendi! 🎵");
    };

    reader.readAsDataURL(file);
}

// Delete Track
function deleteTrack(trackId) {
    if (!currentUser) {
        showToast("Bu işlemi yapmak için giriş yapmalısınız.");
        return;
    }

    const trackIndex = tracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) return;

    const track = tracks[trackIndex];

    if (track.uploader !== currentUser.username) {
        showToast("Erişim engellendi! Yalnızca kendi yüklediğiniz parçaları silebilirsiniz.");
        return;
    }

    customConfirm(`"${track.name}" adlı parçayı silmek istediğinize emin misiniz?`, () => {
        tracks.splice(trackIndex, 1);
        try {
            localStorage.setItem('cw_tracks_db', JSON.stringify(tracks));
        } catch(e) {}
        renderTracks();
        showToast("Parça kütüphaneden silindi.");
    });
}

function logout() {
    localStorage.removeItem('cw_current_session');
    currentUser = null;
    updateUI();
    showToast("Oturum kapatıldı.");
}

function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

document.addEventListener('DOMContentLoaded', () => {
    updateUI();
});
