// Supabase 設定
const SUPABASE_URL = 'https://qybnjjwklbagqfqvlrnq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8hCI8pxHulHXge25IvEQXw_bSYFyLo6';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMIN_PASSWORD = 's19980422';
let currentCustomerId = null;
let allRecords = [];
let canvases = { left: null, right: null };
let ctxs = { left: null, right: null };
let isDrawingMarking = false;

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

// 初始化標記畫布
function initMarkingCanvases() {
    ['left', 'right'].forEach(side => {
        const c = document.getElementById(`canvas-${side}`);
        canvases[side] = c;
        ctxs[side] = c.getContext('2d');
        
        // 設定畫布大小 (需與底圖比例一致)
        const parent = c.parentElement;
        c.width = parent.offsetWidth;
        c.height = parent.offsetHeight;

        // 畫筆設定 (紅色)
        ctxs[side].strokeStyle = '#ff0000';
        ctxs[side].lineWidth = 2;
        ctxs[side].lineJoin = 'round';
        ctxs[side].lineCap = 'round';

        c.onpointerdown = (e) => {
            isDrawingMarking = true;
            ctxs[side].beginPath();
            const rect = c.getBoundingClientRect();
            ctxs[side].moveTo(e.clientX - rect.left, e.clientY - rect.top);
            c.setPointerCapture(e.pointerId);
        };
        c.onpointermove = (e) => {
            if (!isDrawingMarking) return;
            const rect = c.getBoundingClientRect();
            ctxs[side].lineTo(e.clientX - rect.left, e.clientY - rect.top);
            ctxs[side].stroke();
        };
        c.onpointerup = () => { isDrawingMarking = false; };
        c.style.touchAction = 'none';
    });
}

function clearMarking(side) {
    if (ctxs[side]) ctxs[side].clearRect(0, 0, canvases[side].width, canvases[side].height);
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
    listArea.innerHTML = records.length ? '' : '<p style="text-align:center; color:#ccc; grid-column: 1/-1;">請輸入關鍵字開始搜尋...</p>';

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

// 打開編輯窗
async function openEditor(customer) {
    currentCustomerId = customer.id;
    document.getElementById('edit-name').innerText = customer.name;
    document.getElementById('edit-phone').innerText = customer.phone || '無電話';
    
    // 顯示視窗
    document.getElementById('editor-overlay').style.display = 'block';
    document.getElementById('editor-modal').style.display = 'block';
    document.body.style.overflow = 'hidden'; 

    // 重點：在視窗顯示後，重新初始化畫布寬高
    initMarkingCanvases();

    // 清除並載入舊標記
    clearMarking('left');
    clearMarking('right');
    if (customer.marking_left) loadMarkingImage('left', customer.marking_left);
    if (customer.marking_right) loadMarkingImage('right', customer.marking_right);

    // 填充編輯欄位 (管理者專用)
    document.getElementById('edit-upper').value = customer.upper_lash_count || '';
    document.getElementById('edit-lower').value = customer.lower_lash_count || '';
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
    document.getElementById('editor-overlay').style.display = 'none';
    document.getElementById('editor-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
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
