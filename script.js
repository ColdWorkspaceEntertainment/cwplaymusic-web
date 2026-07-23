// ==========================================
// CONFIGURATION & GLOBAL STATE
// ==========================================
const API_URL = "https://api.coldworksproduction.com/api.php";

let users = JSON.parse(localStorage.getItem('cw_users_db')) || [];
let currentUser = JSON.parse(localStorage.getItem('cw_current_session')) || null;
let tracks = []; // LocalStorage yerine API'den beslenecek

// ==========================================
// UI HELPERS (Toast & Custom Confirm)
// ==========================================
function showToast(message) {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    toast.innerText = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

function customConfirm(message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const msgElem = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

    if (!modal || !msgElem || !okBtn || !cancelBtn) {
        if (confirm(message)) onConfirm();
        return;
    }

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

// ==========================================
// API INTEGRATION & TRACK MANAGEMENT
// ==========================================

// 1. Sunucudan Şarkıları Çekme
async function fetchTracksFromAPI() {
    try {
        const response = await fetch(`${API_URL}?action=get_tracks`);
        if (!response.ok) throw new Error("Sunucu yanıt vermedi");
        
        const data = await response.json();
        tracks = Array.isArray(data) ? data : [];
        renderTracks();
    } catch (error) {
        console.error("Müzikler çekilirken hata oluştu:", error);
        const container = document.getElementById('trackContainer');
        if (container) {
            container.innerHTML = '<p style="color:#ff5c7c; text-align:center; padding: 20px 0;">Müzik kütüphanesi yüklenirken sunucuyla bağlantı kurulamadı.</p>';
        }
    }
}

// 2. Şarkıları Arayüze Basma
function renderTracks() {
    const container = document.getElementById('trackContainer');
    if (!container) return;

    if (tracks.length === 0) {
        container.innerHTML = '<p style="color:#8a7a8e; font-size:0.95rem; text-align:center; padding: 20px 0;">Henüz kütüphaneye yüklenmiş müzik bulunmuyor. Formu kullanarak yeni parçanızı yükleyebilirsiniz.</p>';
        return;
    }
    
    container.innerHTML = tracks.map((track) => {
        const isOwner = currentUser && (currentUser.username === track.uploader);
        const audioSrc = track.audio_url || track.audioSrc; // API ve fallback desteği
        
        return `
            <div class="track-item">
                <div class="track-header">
                    <div class="track-info">
                        <h4>${escapeHtml(track.name)}</h4>
                        <p>${escapeHtml(track.genre || 'Belirtilmedi')} &bull; <span class="track-uploader">Uploaded by @${escapeHtml(track.uploader || 'Anonim')}</span></p>
                    </div>
                    ${
                        isOwner 
                        ? `<button class="btn btn-outline" onclick="deleteTrack(${track.id})" style="padding:4px 10px; font-size:0.8rem; border-color:#ff5c7c; color:#ff5c7c;">Delete</button>`
                        : `<button class="btn btn-disabled" title="Yalnızca kendi yüklediğiniz parçaları silebilirsiniz" disabled style="padding:4px 10px; font-size:0.8rem;">Protected</button>`
                    }
                </div>
                <div class="audio-player-container">
                    <audio controls preload="metadata">
                        <source src="${escapeHtml(audioSrc)}" type="audio/wav">
                        <source src="${escapeHtml(audioSrc)}" type="audio/mpeg">
                        Tarayıcınız ses oynatıcısını desteklemiyor.
                    </audio>
                </div>
            </div>
        `;
    }).join('');
}

// 3. Sunucuya Müzik Yükleme (Handle Add Music)
async function handleAddMusic(e) {
    e.preventDefault();

    const nameInput = document.getElementById('trackName');
    const genreInput = document.getElementById('trackGenre');
    const fileInput = document.getElementById('trackFile');

    const name = nameInput ? nameInput.value.trim() : "";
    const genre = genreInput ? genreInput.value : "Diğer";
    const file = fileInput && fileInput.files ? fileInput.files[0] : null;

    if (!file) {
        showToast("Lütfen bir ses dosyası seçin.");
        return;
    }

    const fileNameLower = file.name.toLowerCase();
    if (!fileNameLower.endsWith('.wav') && !fileNameLower.endsWith('.mp3')) {
        showToast("Lütfen geçerli bir .wav veya .mp3 ses dosyası yükleyin!");
        return;
    }

    // Form Verilerini Hazırla
    const formData = new FormData();
    formData.append("name", name || "İsimsiz Parça");
    formData.append("genre", genre);
    formData.append("uploader", currentUser ? currentUser.username : "Misafir");
    formData.append("audio_file", file);

    showToast("Müzik sunucuya yükleniyor, lütfen bekleyin... ⏳");

    try {
        const response = await fetch(`${API_URL}?action=upload_track`, {
            method: "POST",
            body: formData
        });

        const result = await response.json();

        if (result.status === "success") {
            showToast("Müzik parçası başarıyla sunucuya yüklendi ve yayına alındı! 🎵");
            
            // Formu Temizle
            const addForm = document.getElementById('addMusicForm');
            if (addForm) addForm.reset();

            // Listeyi Sunucudan Tekrar Çek
            fetchTracksFromAPI();
        } else {
            showToast("Yükleme başarısız: " + (result.message || "Bilinmeyen hata"));
        }
    } catch (error) {
        console.error("Yükleme sırasında hata oluştu:", error);
        showToast("Sunucuya bağlanırken bir hata oluştu.");
    }
}

// 4. Şarkı Silme Mantığı
function deleteTrack(trackId) {
    if (!currentUser) {
        showToast("Bu işlemi yapmak için giriş yapmalısınız.");
        return;
    }

    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    if (track.uploader !== currentUser.username) {
        showToast("Erişim engellendi! Yalnızca kendi yüklediğiniz parçaları silebilirsiniz.");
        return;
    }

    customConfirm(`"${track.name}" adlı parçayı silmek istediğinize emin misiniz?`, () => {
        // Not: API tarafında silme endpoint'i eklendiğinde buraya fetch eklenebilir.
        tracks = tracks.filter(t => t.id !== trackId);
        renderTracks();
        showToast("Parça arayüzden kaldırıldı.");
    });
}

// ==========================================
// AUTHENTICATION & UI STATE
// ==========================================
function updateUI() {
    const authSection = document.getElementById('authSection');
    if (authSection) {
        if (currentUser) {
            authSection.innerHTML = `
                <span style="font-weight:700; color:var(--primary-pink, #ff5c7c); align-self:center;">🌸 ${escapeHtml(currentUser.username)}</span>
                <button class="btn btn-outline" onclick="logout()">Sign Out</button>
            `;
        } else {
            authSection.innerHTML = `
                <button class="btn btn-outline" onclick="openModal('loginModal')">Sign In</button>
                <button class="btn btn-pink" onclick="openModal('registerModal')">Sign Up</button>
            `;
        }
    }

    // Şarkıları sunucudan tazele
    fetchTracksFromAPI();
}

function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('regUser').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPass').value;
    const errorElem = document.getElementById('regError');

    if (errorElem) errorElem.innerText = "";

    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        if (errorElem) errorElem.innerText = "Bu kullanıcı adı zaten alınmış.";
        return;
    }

    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
        if (errorElem) errorElem.innerText = "Bu e-posta adresiyle kayıtlı bir hesap zaten var.";
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

function handleLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('loginUser').value.trim();
    const passwordInput = document.getElementById('loginPass').value;
    const errorElem = document.getElementById('loginError');

    if (errorElem) errorElem.innerText = "";

    const user = users.find(u => 
        (u.username.toLowerCase() === usernameInput.toLowerCase() || u.email.toLowerCase() === usernameInput.toLowerCase()) && 
        u.password === passwordInput
    );

    if (!user) {
        if (errorElem) errorElem.innerText = "Geçersiz kullanıcı adı veya şifre.";
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

function logout() {
    localStorage.removeItem('cw_current_session');
    currentUser = null;
    updateUI();
    showToast("Oturum kapatıldı.");
}

// Modal Helpers
function openModal(id) {
    const elem = document.getElementById(id);
    if (elem) elem.style.display = 'flex';
}

function closeModal(id) {
    const elem = document.getElementById(id);
    if (elem) elem.style.display = 'none';
}

function escapeHtml(text) {
    return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ==========================================
// INITIALIZATION & EVENT LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    updateUI();

    // Müzik Yükleme Formuna Event Listener Bağla
    const addMusicForm = document.getElementById('addMusicForm');
    if (addMusicForm) {
        addMusicForm.addEventListener('submit', handleAddMusic);
    }
});
