// Supabase 設定
const SUPABASE_URL = 'https://qybnjjwklbagqfqvlrnq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8hCI8pxHulHXge25IvEQXw_bSYFyLo6';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 全域變數
let canvas, ctx, drawing = false;

// 頁面切換邏輯
function showSection(sectionId) {
    document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId + '-section').classList.add('active');
    
    const navBtn = document.getElementById('nav-' + sectionId);
    if (navBtn) {
        document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
        navBtn.classList.add('active');
    }

    if (sectionId === 'form') {
        setTimeout(() => {
            initSignaturePad();
            initValidationListeners();
        }, 500); // 增加延遲，確保手機端載入完全
    }
}

function initValidationListeners() {
    document.querySelectorAll('[required]').forEach(input => {
        input.addEventListener('blur', function() { validateField(this); });
        input.addEventListener('input', function() { if (this.classList.contains('error')) validateField(this); });
    });
}

function validateField(input) {
    let isValid = true;
    const value = input.value.trim();
    if (input.name === 'phone') {
        // 如果有填寫才驗證格式，沒填寫則過 (因為非必填)
        if (value.length > 0) {
            isValid = /^09\d{8}$/.test(value.replace(/-/g, ''));
        }
    } else {
        isValid = value.length > 0;
    }
    input.classList.toggle('error', !isValid);
    return isValid;
}

// ==========================================
// 簽名板核心 - 極限優化版
// ==========================================
function initSignaturePad() {
    canvas = document.getElementById('signature-pad');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    
    // 強制設定寬度 (處理手機寬度問題)
    const parent = canvas.parentElement;
    canvas.width = parent.offsetWidth - 30; // 減去 padding
    canvas.height = 200;

    // 初始化畫筆
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // 使用 Pointer Events (支援滑鼠與觸控)
    canvas.onpointerdown = (e) => {
        drawing = true;
        ctx.beginPath();
        const rect = canvas.getBoundingClientRect();
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
        canvas.setPointerCapture(e.pointerId);
    };

    canvas.onpointermove = (e) => {
        if (!drawing) return;
        const rect = canvas.getBoundingClientRect();
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.stroke();
    };

    canvas.onpointerup = (e) => {
        drawing = false;
        if (canvas) canvas.releasePointerCapture(e.pointerId);
    };

    // 強制禁止手機捲動
    canvas.style.touchAction = 'none';
}

function clearSignature() {
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// 導航與表單邏輯
function nextStep(targetStep) {
    if (targetStep === 3) {
        let allValid = true;
        document.getElementById('step-2').querySelectorAll('[required]').forEach(input => {
            if (!validateField(input)) allValid = false;
        });
        if (!allValid) {
            alert('請檢查紅框標示處，姓名與生日必須填寫！');
            return;
        }
    }
    document.querySelectorAll('.step-content').forEach(c => c.classList.remove('active'));
    document.getElementById('step-' + targetStep).classList.add('active');
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById('step-' + targetStep + '-indicator').classList.add('active');
    window.scrollTo(0, 0);
}

function prevStep(step) {
    nextStep(step);
}

async function submitForm() {
    const basicForm = document.getElementById('basic-info-form');
    const consultForm = document.getElementById('consultation-form');
    
    let allValid = true;
    [...basicForm.querySelectorAll('[required]'), ...consultForm.querySelectorAll('[required]')].forEach(input => {
        if (!validateField(input)) allValid = false;
    });

    if (!allValid) {
        alert('請確認必填欄位（姓名、生日）已填寫！');
        return;
    }
    
    const signatureImage = canvas.toDataURL();
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    
    if (signatureImage === blank.toDataURL()) {
        alert('請完成客戶確認簽名！');
        return;
    }

    // 顯示讀取中狀態
    const submitBtn = document.querySelector('.btn-success');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = '儲存中...';
    submitBtn.disabled = true;

    try {
        const basicData = Object.fromEntries(new FormData(basicForm).entries());
        const consultData = Object.fromEntries(new FormData(consultForm).entries());
        const referrals = new FormData(basicForm).getAll('referral');

        const { data, error } = await _supabase
            .from('customers')
            .insert([{
                ...basicData,
                ...consultData,
                referral: referrals,
                signature: signatureImage
            }]);

        if (error) throw error;

        alert('資料已成功儲存至雲端！');
        showSection('home');
        basicForm.reset();
        consultForm.reset();
        clearSignature();
        nextStep(1);
    } catch (err) {
        console.error('Error saving data:', err);
        alert('儲存失敗，請檢查網路連線或稍後再試。');
    } finally {
        submitBtn.innerText = originalText;
        submitBtn.disabled = false;
    }
}

function toggleSearchMethod() {
    const method = document.querySelector('input[name="search-method"]:checked').value;
    if (method === 'phone') {
        document.getElementById('search-phone-box').style.display = 'flex';
        document.getElementById('search-name-box').style.display = 'none';
    } else {
        document.getElementById('search-phone-box').style.display = 'none';
        document.getElementById('search-name-box').style.display = 'flex';
    }
}

async function searchHistory() {
    const method = document.querySelector('input[name="search-method"]:checked').value;
    const searchBtn = document.querySelector('.search-box .btn-primary');
    const originalText = searchBtn.innerText;
    
    let query = _supabase.from('customers').select('*');

    if (method === 'phone') {
        const phone = document.getElementById('search-phone').value.trim().replace(/-/g, '');
        if (!phone) { alert('請輸入電話號碼'); return; }
        query = query.eq('phone', phone);
    } else {
        const name = document.getElementById('search-name').value.trim();
        const birthday = document.getElementById('search-birthday').value;
        if (!name || !birthday) { alert('請輸入姓名與生日'); return; }
        query = query.eq('name', name).eq('birthday', birthday);
    }

    searchBtn.innerText = '查詢中...';
    searchBtn.disabled = true;

    try {
        const { data: results, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        const resultArea = document.getElementById('search-result');
        resultArea.innerHTML = results.length ? '' : '<p style="text-align:center; color:#999;">查無紀錄。</p>';

        results.forEach(record => {
            const date = new Date(record.created_at).toLocaleString();
            const item = document.createElement('div');
            item.className = 'record-item';
            item.innerHTML = `
                <div class="record-header"><span>日期：${date}</span><span style="color:#c5a059;">${record.name}</span></div>
                <div class="record-details"><div>風格：${record.style}</div><div>目的：${getPurposeLabel(record.purpose)}</div><div>眼周：${record.skin_status}</div></div>
                ${record.signature ? `<div style="margin-top:10px; border-top:1px solid #eee;"><p style="font-size:0.7rem; color:#888;">簽名：</p><img src="${record.signature}" style="height:60px;"></div>` : ''}
            `;
            resultArea.appendChild(item);
        });
    } catch (err) {
        console.error('Error searching data:', err);
        alert('查詢失敗，請稍後再試。');
    } finally {
        searchBtn.innerText = originalText;
        searchBtn.disabled = false;
    }
}

function getPurposeLabel(v) { return {habit:'日常', makeup:'眼妝', event:'活動', wedding:'結婚'}[v] || v; }
window.onload = () => showSection('home');
