const API_URL = "https://script.google.com/macros/s/AKfycbxD_-fXGQmUl-PsO5VgmVwSCkWiWoLkHz08FkfVCfkx3i6CZLrzqS5T2sTpEEpcpDYn/exec"; 
let globalMonthlyData = {}; // 暫存各月份的名單
let globalOpenMonths = [];
let previewUrl = "";

window.onload = function() {
    initTheme();
    updateGreeting();
    document.getElementById('password').addEventListener('focus', keepAuthControlsVisible);
    initSystem();
};
window.addEventListener('beforeunload', () => { if (previewUrl) URL.revokeObjectURL(previewUrl); });

async function fetchJsonWithTimeout(url, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

function setLoadingState(isLoading) {
    document.getElementById('loading-title').innerText = isLoading ? '薪資查詢系統' : '目前無法連線';
    document.getElementById('loading-active').hidden = !isLoading;
    document.getElementById('loading-error').hidden = isLoading;
    document.getElementById('retry-btn').disabled = isLoading;
}

function retryConnection() { initSystem(); }

function keepAuthControlsVisible() {
    setTimeout(() => document.getElementById('verify-btn').scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
}

function updateGreeting() {
    const hour = new Date().getHours();
    let greeting = (hour >= 5 && hour < 12) ? "早安。" : (hour >= 12 && hour < 18) ? "午安。" : "晚安。";
    document.getElementById('greeting-txt').innerText = greeting;
}

function initTheme() {
    const savedTheme = localStorage.getItem('userTheme');
    const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    let currentTheme = savedTheme || (isSystemDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', currentTheme);
    document.getElementById('theme-btn').innerText = currentTheme === 'dark' ? '淺色模式' : '深色模式';
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('userTheme', newTheme);
    document.getElementById('theme-btn').innerText = newTheme === 'dark' ? '淺色模式' : '深色模式';
}

async function initSystem() {
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn.disabled) return;
    switchPage('page-loading');
    setLoadingState(true);
    try {
        const data = await fetchJsonWithTimeout(`${API_URL}?action=getInitData`);
        const monthSelect = document.getElementById('month-select');
        globalMonthlyData = data.monthlyData || {};
        globalOpenMonths = data.openMonths || data.months || [];
        
        // 1. 計算預設目標：上一個月的年份與月份數字
        const today = new Date();
        today.setDate(1); // 先定位到本月 1 日，避免月底減月時日期溢位
        today.setMonth(today.getMonth() - 1);
        const targetYear = today.getFullYear(); 
        const targetMonth = today.getMonth() + 1; 

        monthSelect.innerHTML = "";
        let selectedTargetMonth = "";

        if (data.months && data.months.length > 0) {
            data.months.forEach((m) => {
                let opt = document.createElement('option');
                opt.value = m; 
                const isOpen = globalOpenMonths.includes(m);
                opt.innerText = isOpen ? m : `${m} 🔒`;
                opt.disabled = !isOpen;

                // 2. 從分頁名稱（如 "2026年8月" 或 "2026年08月"）解析數字
                const matches = m.match(/(\d{4})年\s*(\d{1,2})月/);
                
                if (matches) {
                    const optYear = parseInt(matches[1], 10);
                    const optMonth = parseInt(matches[2], 10);

                    // 3. 比對年份與月份
                    if (optYear === targetYear && optMonth === targetMonth && globalOpenMonths.includes(m) && !selectedTargetMonth) {
                        opt.selected = true;
                        selectedTargetMonth = m;
                    }
                } else {
                    // 備用方案：若為不帶年份之舊名稱（如 "8月"），進行彈性比對
                    const mNum = parseInt(m.replace(/[^0-9]/g, ''), 10);
                    if (mNum === targetMonth && !selectedTargetMonth) {
                        opt.selected = true;
                        selectedTargetMonth = m;
                    }
                }
                
                monthSelect.appendChild(opt);
            });

            // 上個月尚未開放時，選擇最近一個已開放的月份
            if (!selectedTargetMonth) {
                const openOptions = data.months.filter(month => globalOpenMonths.includes(month));
                selectedTargetMonth = openOptions.sort((a, b) => monthKey(b) - monthKey(a))[0] || data.months[0];
                monthSelect.value = selectedTargetMonth;
            }
        }

        // 監聽月份選單切換，動態改變員工按鈕名單
        monthSelect.onchange = () => renderEmployeeButtons(monthSelect.value);
        
        // 初始化繪製員工按鈕
        renderEmployeeButtons(selectedTargetMonth || monthSelect.value);
        
        retryBtn.disabled = false;
        switchPage('page-main');
    } catch (err) {
        setLoadingState(false);
    }
}

// 根據選擇的月份動態顯示該月員工按鈕
function renderEmployeeButtons(targetMonth) {
    const employeeBox = document.getElementById('employee-box');
    employeeBox.innerHTML = "";

    const month = targetMonth || document.getElementById('month-select').value;
    const names = globalMonthlyData[month] || [];

    if (names.length === 0) {
        employeeBox.innerHTML = `<div style="grid-column: span 2; text-align: center; color: var(--apple-text-gray); font-size: 14px; padding: 20px 0;">該月份尚無員工資料</div>`;
        return;
    }

    names.forEach(name => {
        let btn = document.createElement('button');
        btn.className = 'emp-btn';
        btn.innerText = name;
        btn.dataset.initial = name.trim().charAt(0);
        btn.onclick = () => selectEmployee(name);
        employeeBox.appendChild(btn);
    });
}

function selectEmployee(name) {
    window.currentSelectedEmployee = name;
    document.getElementById('auth-title').innerText = name;
    
    const savedPassword = localStorage.getItem('savedPwd_' + name) || "";
    document.getElementById('password').value = savedPassword;
    
    const errorMsg = document.getElementById('error-txt');
    errorMsg.classList.remove('text-shake');
    errorMsg.style.display = 'none';
    
    const verifyBtn = document.getElementById('verify-btn');
    verifyBtn.innerHTML = "驗證";
    verifyBtn.disabled = false;
    document.getElementById('back-btn').disabled = false;

    switchPage('page-auth');
}

function togglePasswordVisibility() {
    const pwd = document.getElementById('password');
    const eye = document.getElementById('eye-icon');
    pwd.type = pwd.type === "password" ? "text" : "password";
    eye.innerText = pwd.type === "password" ? "顯示" : "隱藏";
}

async function verifyPassword() {
    const inputPwd = document.getElementById('password').value;
    if (!inputPwd) { showError("請輸入身分證後 4 碼。"); return; }
    if (inputPwd.length !== 4) { showError("請輸入完整的 4 位數字。"); return; } 
    
    const verifyBtn = document.getElementById('verify-btn');
    const backBtn = document.getElementById('back-btn');
    const errorMsg = document.getElementById('error-txt');
    
    if (verifyBtn.disabled) return;

    verifyBtn.innerHTML = '正在查詢薪資<span class="dot-ani">.</span><span class="dot-ani">.</span><span class="dot-ani">.</span>';
    verifyBtn.disabled = true;
    backBtn.disabled = true;
    document.getElementById('password').disabled = true;

    const selectedMonth = document.getElementById('month-select').value;
    errorMsg.classList.remove('text-shake'); 
    errorMsg.style.display = 'none';

    try {
        const data = await fetchJsonWithTimeout(`${API_URL}?action=getSalary&month=${encodeURIComponent(selectedMonth)}&name=${encodeURIComponent(window.currentSelectedEmployee)}&password=${encodeURIComponent(inputPwd)}`);
        if (data.status === "success") {
            if (document.getElementById('remember-pwd').checked) {
                localStorage.setItem('savedPwd_' + window.currentSelectedEmployee, inputPwd);
            }
            const d = data.data;
            document.getElementById('slip-title').innerText = `${selectedMonth} 薪資明細`;
            document.getElementById('slip-name').innerText = window.currentSelectedEmployee;
            document.getElementById('slip-wage').innerText = `${formatCurrency(d.hourlyWage)}／小時`;
            document.getElementById('slip-hours').innerText = d.hours + " 小時";
            document.getElementById('slip-latemin').innerText = d.lateMin + " 分鐘";
            setDeduction('slip-advance', d.advance);
            setDeduction('slip-loss', d.loss);
            document.getElementById('slip-missing').innerText = d.missing + " 次";
            document.getElementById('slip-latecount').innerText = d.lateCount + " 次";
            document.getElementById('slip-total').innerText = formatCurrency(d.totalSalary);
            const lateDeduction = Number(d.lateMin) * 10;
            document.getElementById('salary-calculation').innerText = `${formatCurrency(d.hourlyWage)} × ${d.hours} 小時－遲到 ${formatCurrency(lateDeduction)}－預支 ${formatCurrency(d.advance)}－營損 ${formatCurrency(d.loss)}＝${formatCurrency(d.totalSalary)}`;
            
            document.getElementById('preview-box').style.display = 'none';
            document.getElementById('action-btn').style.display = 'block'; 
            
            switchPage('page-slip');
        } else if (data.status === "not_open") {
            // 尚未開放查詢提示
            showError("這個月份尚未開放查詢，請改選其他月份。");
        } else {
            // 密碼錯誤提示
            showError("驗證碼不正確，請確認身分證後 4 碼。");
        }
    } catch (err) {
        showError(err.name === 'AbortError' ? "查詢逾時，請稍後再試一次。" : "網路連線失敗，請稍後再試一次。");
    } finally {
        verifyBtn.innerHTML = "驗證";
        verifyBtn.disabled = false;
        backBtn.disabled = false;
        document.getElementById('password').disabled = false;
    }
}

function formatCurrency(value) {
    return `NT$ ${Number(value || 0).toLocaleString('zh-TW', { maximumFractionDigits: 2 })}`;
}

function setDeduction(id, value) {
    const element = document.getElementById(id);
    const amount = Number(value || 0);
    element.innerText = amount > 0 ? `−${formatCurrency(amount)}` : formatCurrency(0);
    element.classList.toggle('deduct-style', amount > 0);
}

async function downloadSlip() {
    const captureArea = document.getElementById('capture-area');
    const previewBox = document.getElementById('preview-box');
    const generatedImg = document.getElementById('generated-img');
    const actionBtn = document.getElementById('action-btn');
    const shareError = document.getElementById('share-error');

    const currentTheme = document.documentElement.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    actionBtn.disabled = true;
    actionBtn.innerText = '正在產生薪資單…';
    shareError.style.display = 'none';

    try {
        const canvas = await html2canvas(captureArea, {
            scale: 2,
            useCORS: true,
            backgroundColor: currentTheme === 'dark' ? '#000000' : '#f5f5f7'
        });
        const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('圖片產生失敗')), 'image/png'));
        const selectedMonth = document.getElementById('month-select').value;
        const empName = window.currentSelectedEmployee || "員工";
        const fileName = `${selectedMonth}_${empName}_薪資明細.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: fileName });
        } else if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.matchMedia('(pointer: coarse)').matches) {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            previewUrl = URL.createObjectURL(blob);
            generatedImg.src = previewUrl;
            previewBox.style.display = 'block';
            previewBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            const downloadUrl = URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            downloadLink.href = downloadUrl;
            downloadLink.download = fileName;
            downloadLink.click();
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            shareError.innerText = '薪資單產生失敗，請稍後再試一次。';
            shareError.style.display = 'block';
        }
    } finally {
        actionBtn.disabled = false;
        actionBtn.innerText = '儲存／分享薪資單';
    }
}

function monthKey(value) { const m = String(value).match(/(\d{4})年\s*(\d{1,2})月/); return m ? Number(m[1]) * 100 + Number(m[2]) : 0; }
function showError(text) { const box = document.getElementById('error-txt'); box.innerText = text; box.style.display = 'block'; box.classList.remove('text-shake'); void box.offsetWidth; box.classList.add('text-shake'); }
function switchPage(id) { document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); document.getElementById(id).classList.add('active'); }
function goBack(id) { switchPage(id); }
function logout() { switchPage('page-main'); }
