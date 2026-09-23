const API_URL = "https://script.google.com/macros/s/AKfycbxD_-fXGQmUl-PsO5VgmVwSCkWiWoLkHz08FkfVCfkx3i6CZLrzqS5T2sTpEEpcpDYn/exec"; 
let globalMonthlyData = {}; // 暫存各月份的名單
let globalOpenMonths = [];

window.onload = function() { initTheme(); updateGreeting(); initSystem(); };

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

function initSystem() {
    fetch(`${API_URL}?action=getInitData`)
    .then(r => r.json())
    .then(data => {
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
                opt.innerText = m;

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
        
        switchPage('page-main');
    })
    .catch(err => {
        console.error(err);
        document.querySelector('#page-loading div:last-child').innerText = "目前無法連線，請檢查網路後重新整理。";
    });
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

function verifyPassword() {
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

    fetch(`${API_URL}?action=getSalary&month=${encodeURIComponent(selectedMonth)}&name=${encodeURIComponent(window.currentSelectedEmployee)}&password=${encodeURIComponent(inputPwd)}`)
    .then(r => r.json())
    .then(data => {
        if (data.status === "success") {
            if (document.getElementById('remember-pwd').checked) {
                localStorage.setItem('savedPwd_' + window.currentSelectedEmployee, inputPwd);
            }
            const d = data.data;
            document.getElementById('slip-title').innerText = `${selectedMonth} 薪資明細`;
            document.getElementById('slip-name').innerText = window.currentSelectedEmployee;
            document.getElementById('slip-wage').innerText = Number(d.hourlyWage).toLocaleString() + " 元";
            document.getElementById('slip-hours').innerText = d.hours + " 小時";
            document.getElementById('slip-latemin').innerText = d.lateMin + " 分鐘";
            document.getElementById('slip-advance').innerText = "- " + Number(d.advance).toLocaleString() + " 元";
            document.getElementById('slip-loss').innerText = "- " + Number(d.loss).toLocaleString() + " 元";
            document.getElementById('slip-missing').innerText = d.missing + " 次";
            document.getElementById('slip-latecount').innerText = d.lateCount + " 次";
            document.getElementById('slip-total').innerText = `$ ${Number(d.totalSalary).toLocaleString()}`;
            const lateDeduction = Number(d.lateMin) * 10;
            document.getElementById('salary-calculation').innerText = `${Number(d.hourlyWage).toLocaleString()} × ${d.hours} 小時－遲到 ${lateDeduction.toLocaleString()}－預支 ${Number(d.advance).toLocaleString()}－營損 ${Number(d.loss).toLocaleString()}＝${Number(d.totalSalary).toLocaleString()} 元`;
            
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
    })
    .catch(err => {
        console.error(err);
        showError("網路連線失敗，請稍後再試一次。");
    })
    .finally(() => {
        verifyBtn.innerHTML = "驗證";
        verifyBtn.disabled = false;
        backBtn.disabled = false;
        document.getElementById('password').disabled = false;
    });
}

function downloadSlip() {
    const captureArea = document.getElementById('capture-area');
    const previewBox = document.getElementById('preview-box');
    const generatedImg = document.getElementById('generated-img');
    const actionBtn = document.getElementById('action-btn');

    const currentTheme = document.documentElement.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

    html2canvas(captureArea, { 
        scale: 2,
        useCORS: true,
        backgroundColor: currentTheme === 'dark' ? '#000000' : '#f5f5f7'
    }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        
        // 顯示預覽圖（供手機長按儲存）
        generatedImg.src = imgData;
        previewBox.style.display = 'block';
        actionBtn.style.display = 'none';
        previewBox.scrollIntoView({ behavior: 'smooth' });

        // 自動觸發下載（電腦與支援的瀏覽器）
        const selectedMonth = document.getElementById('month-select').value;
        const empName = window.currentSelectedEmployee || "員工";
        
        const downloadLink = document.createElement('a');
        downloadLink.href = imgData;
        downloadLink.download = `${selectedMonth}_${empName}_薪資明細.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    });
}

function monthKey(value) { const m = String(value).match(/(\d{4})年\s*(\d{1,2})月/); return m ? Number(m[1]) * 100 + Number(m[2]) : 0; }
function showError(text) { const box = document.getElementById('error-txt'); box.innerText = text; box.style.display = 'block'; box.classList.remove('text-shake'); void box.offsetWidth; box.classList.add('text-shake'); }
function switchPage(id) { document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); document.getElementById(id).classList.add('active'); }
function goBack(id) { switchPage(id); }
function logout() { switchPage('page-main'); }
