// Supabase 設定
const SUPABASE_URL = 'https://qybnjjwklbagqfqvlrnq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8hCI8pxHulHXge25IvEQXw_bSYFyLo6';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMIN_PASSWORD = 's19980422';
let currentCustomerId = null;
let allRecords = [];
let canvases = { left: null, right: null };
let ctxs = { left: null, right: null };
let activeFsSide = null;
let fsCanvas, fsCtx;
let fsIsDrawing = false;
let fsHistory = [];

// 登入檢查
function checkLogin() {
    const pwd = document.getElementById('admin-password').value;
    if (pwd === ADMIN_PASSWORD) {
        document.getElementById('login-overlay').style.display = 'none';
        initMarkingCanvases();
        fetchAllRecords();
    } else {
        alert('密碼錯誤！');
    }
}

// 初始化標記畫布（僅設定尺寸，小畫板只作預覽）
function initMarkingCanvases() {
    ['left', 'right'].forEach(side => {
        const c = document.getElementById(`canvas-${side}`);
        canvases[side] = c;
        ctxs[side] = c.getContext('2d');
        const parent = c.parentElement;
        c.width = parent.offsetWidth;
        c.height = parent.offsetHeight;
    });
}

function clearMarking(side) {
    if (ctxs[side]) ctxs[side].clearRect(0, 0, canvases[side].width, canvases[side].height);
}

// 全螢幕畫板
function openFullscreenCanvas(side) {
    activeFsSide = side;
    fsHistory = [];

    const overlay = document.getElementById('fs-overlay');
    overlay.style.display = 'flex';

    fsCanvas = document.getElementById('canvas-fs');
    const container = fsCanvas.parentElement;
    fsCanvas.width = container.offsetWidth;
    fsCanvas.height = container.offsetHeight;

    fsCtx = fsCanvas.getContext('2d');
    fsCtx.strokeStyle = '#ff0000';
    fsCtx.lineWidth = 2.5;
    fsCtx.lineJoin = 'round';
    fsCtx.lineCap = 'round';

    // 把小畫板現有內容複製過來
    fsCtx.drawImage(canvases[side], 0, 0, fsCanvas.width, fsCanvas.height);
    saveFsHistory();

    document.getElementById('fs-title').textContent = side === 'left' ? '左眼標記' : '右眼標記';

    fsCanvas.onpointerdown = (e) => {
        fsIsDrawing = true;
        fsCtx.beginPath();
        const rect = fsCanvas.getBoundingClientRect();
        fsCtx.moveTo((e.clientX - rect.left) * (fsCanvas.width / rect.width),
                     (e.clientY - rect.top)  * (fsCanvas.height / rect.height));
        fsCanvas.setPointerCapture(e.pointerId);
    };
    fsCanvas.onpointermove = (e) => {
        if (!fsIsDrawing) return;
        const rect = fsCanvas.getBoundingClientRect();
        fsCtx.lineTo((e.clientX - rect.left) * (fsCanvas.width / rect.width),
                     (e.clientY - rect.top)  * (fsCanvas.height / rect.height));
        fsCtx.stroke();
    };
    fsCanvas.onpointerup = () => {
        if (!fsIsDrawing) return;
        fsIsDrawing = false;
        saveFsHistory();
    };
    fsCanvas.style.touchAction = 'none';
}

function saveFsHistory() {
    fsHistory.push(fsCtx.getImageData(0, 0, fsCanvas.width, fsCanvas.height));
}

function clearFsCanvas() {
    fsCtx.clearRect(0, 0, fsCanvas.width, fsCanvas.height);
    saveFsHistory();
}

function undoFsCanvas() {
    if (fsHistory.length <= 1) return;
    fsHistory.pop();
    fsCtx.putImageData(fsHistory[fsHistory.length - 1], 0, 0);
}

function confirmFsCanvas() {
    // 寫回小畫板
    ctxs[activeFsSide].clearRect(0, 0, canvases[activeFsSide].width, canvases[activeFsSide].height);
    ctxs[activeFsSide].drawImage(fsCanvas, 0, 0, canvases[activeFsSide].width, canvases[activeFsSide].height);
    document.getElementById('fs-overlay').style.display = 'none';
}

// 抓取所有紀錄 (初始載入)
async function fetchAllRecords() {
    const { data, error } = await _supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('Error fetching records:', error);
        return;
    }
    allRecords = data;
    renderList(allRecords);
}

// 渲染列表
function renderList(records) {
    const listArea = document.getElementById('admin-results');
    listArea.innerHTML = records.length ? '' : '<div class="admin-loading"><p style="color:#ccc;">查無符合條件的客戶。</p></div>';

    records.forEach(r => {
        const card = document.createElement('div');
        card.className = 'customer-card';
        card.onclick = () => openEditor(r);
        card.innerHTML = `
            <div class="name">${r.name}</div>
            <div class="phone">${r.phone || '無電話'}</div>
            <div style="font-size:0.8rem; color:#aaa; margin-top:5px;">生日：${r.birthday}</div>
        `;
        listArea.appendChild(card);
    });
}

// 搜尋功能
function adminSearch() {
    const keyword = document.getElementById('admin-search-input').value.toLowerCase();
    const filtered = allRecords.filter(r => 
        r.name.toLowerCase().includes(keyword) || 
        (r.phone && r.phone.includes(keyword))
    );
    renderList(filtered);
}

// 打開編輯窗 (全頁面模式)
async function openEditor(customer) {
    currentCustomerId = customer.id;
    document.getElementById('edit-name').innerText = customer.name;
    document.getElementById('edit-phone').innerText = customer.phone || '無電話';
    
    // 切換視圖：隱藏列表，顯示編輯頁
    document.getElementById('admin-list-view').style.display = 'none';
    const editView = document.getElementById('admin-edit-view');
    editView.style.display = 'block';
    
    // 確保回到最上方
    window.scrollTo(0, 0);

    // 重點：在視窗顯示後（延遲 100 毫秒），再初始化畫布寬高
    setTimeout(() => {
        initMarkingCanvases();
        
        // 載入舊標記 (確保畫布已經準備好)
        clearMarking('left');
        clearMarking('right');
        if (customer.marking_left) loadMarkingImage('left', customer.marking_left);
        if (customer.marking_right) loadMarkingImage('right', customer.marking_right);
    }, 100);

    // 填充編輯欄位 (管理者專用)
    document.getElementById('edit-upper').value = customer.upper_lash_count || '';
    document.getElementById('edit-lower').value = customer.lower_lash_count || '';
    document.getElementById('edit-removal').value = customer.removal_lash_count || '';
    const addonValues = customer.addon_service || [];
    document.querySelectorAll('input[name="addon"]').forEach(cb => {
        cb.checked = addonValues.includes(cb.value);
    });
    const discountValues = customer.discount || [];
    document.querySelectorAll('input[name="discount"]').forEach(cb => {
        cb.checked = discountValues.includes(cb.value);
    });
    document.getElementById('edit-notes').value = customer.admin_notes || '';

    // 填充唯讀基本資料
    document.getElementById('detail-birthday').value = customer.birthday;
    document.getElementById('detail-occupation').value = customer.occupation || '';
    document.getElementById('detail-address').value = customer.address || '';
    document.getElementById('detail-referral').value = (customer.referral || []).join(', ');
    
    // 填充諮詢資料
    document.getElementById('detail-allergy').value = customer.allergy || '';
    document.getElementById('detail-skin').value = customer.skin_status || '';
    document.getElementById('detail-lens').value = customer.contact_lens || '';
    document.getElementById('detail-purpose').value = customer.purpose || '';
    document.getElementById('detail-style').value = customer.style || '';
    document.getElementById('detail-consent').value = customer.photo_consent || '';
    
    // 簽名
    document.getElementById('detail-signature').src = customer.signature || '';

    document.getElementById('editor-overlay').style.display = 'block';
    document.getElementById('editor-modal').style.display = 'block';
    document.body.style.overflow = 'hidden'; // 防止底層捲動
}

function loadMarkingImage(side, dataUrl) {
    const img = new Image();
    img.onload = () => ctxs[side].drawImage(img, 0, 0, canvases[side].width, canvases[side].height);
    img.src = dataUrl;
}

function closeEditor() {
    document.getElementById('admin-edit-view').style.display = 'none';
    document.getElementById('admin-list-view').style.display = 'block';
    window.scrollTo(0, 0);
}

// 儲存變更
async function saveAdminChanges() {
    if (!currentCustomerId) return;

    const saveBtn = document.querySelector('.btn-save');
    saveBtn.innerText = '儲存中...';
    saveBtn.disabled = true;

    try {
        const { error } = await _supabase
            .from('customers')
            .update({
                upper_lash_count: document.getElementById('edit-upper').value,
                lower_lash_count: document.getElementById('edit-lower').value,
                removal_lash_count: document.getElementById('edit-removal').value,
                addon_service: [...document.querySelectorAll('input[name="addon"]:checked')].map(cb => cb.value),
                discount: [...document.querySelectorAll('input[name="discount"]:checked')].map(cb => cb.value),
                admin_notes: document.getElementById('edit-notes').value,
                marking_left: canvases.left.toDataURL(),
                marking_right: canvases.right.toDataURL()
            })
            .eq('id', currentCustomerId);

        if (error) throw error;

        alert('資料與標記已成功更新！');
        fetchAllRecords(); 
        closeEditor();
    } catch (err) {
        console.error('Update error:', err);
        alert('更新失敗，請檢查網路連線。');
    } finally {
        saveBtn.innerText = '儲存所有變更';
        saveBtn.disabled = false;
    }
}
