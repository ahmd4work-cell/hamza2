// =========================================================================
// visits.js - إدارة الزيارات سحابياً (نظيف ومنظم ومصحح الأخطاء)
// الربط: firebase-config.js + navbar.js - جميع الأسماء سمول
// الوظائف والشكل محفوظة 100% مع إضافة نظام معالجة أخطاء الشبكة (QUIC Error Handler)
// =========================================================================

import { db } from './firebase-config.js';
import { collection, onSnapshot, doc, setDoc, deleteDoc, writeBatch, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function markPageReady() {
    const container = document.getElementById('dashboardContainer') || document.querySelector('.dashboard-container');
    if (container) {
        container.classList.add('ready');
        container.style.opacity = '1';
    }
}

let currentActivePreview = null;
const saveTimeouts = {}; 
let searchTimeout = null;
const LOGS_KEY = 'asgate_visits_logs_v1';
let visitsDataArray = [];
let isInitialLoad = true;
let activityLogs = JSON.parse(localStorage.getItem(LOGS_KEY) || '[]');

let currentPickerRowId = null;
let currentPickerInput = null;
let currentPickerMonth = new Date().getMonth();
let currentPickerYear = new Date().getFullYear();

let activeStatusFilters = [];
let activeOwnerFilters = [];
let itemsToDelete = [];

// متغير لحفظ حالة مستمع قاعدة البيانات
let unsubscribeVisits = null;

function escapeHTML(str) {
    if (typeof str !== 'string') return str || '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function getTodayFormatted() { 
    const d = new Date(); 
    return String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear(); 
}

function getTimeFormatted() { 
    const d = new Date(); 
    return String(d.getHours()).padStart(2, '0') + ":" + String(d.getMinutes()).padStart(2, '0'); 
}

function formatAsDDMMYYYY(dateStr) {
    if (!dateStr) return '';
    if (typeof dateStr === 'number') {
        const d = new Date((dateStr - (25567 + 2)) * 86400 * 1000);
        return String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear();
    }
    dateStr = String(dateStr).trim();
    if (dateStr.includes('-')) {
        const p = dateStr.split('-');
        if (p[0].length === 4) return `${p[2]}-${p[1]}-${p[0]}`; 
    } else if (dateStr.includes('/')) {
        const p = dateStr.split('/');
        if (p[0].length === 4) return `${p[2]}-${p[1]}-${p[0]}`;
        if (p.length === 3) return `${String(p[0]).padStart(2,'0')}-${String(p[1]).padStart(2,'0')}-${p[2]}`;
    }
    return dateStr;
}

function parseDate(dateStr) {
    if (!dateStr) return new Date(0);
    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
        if (parts[0].length === 4) return new Date(parts[0], parts[1]-1, parts[2]); 
        return new Date(parts[2], parts[1]-1, parts[0]); 
    }
    return new Date(0);
}

function getDateColorClass(dateStr) {
    if (!dateStr) return '';
    const todayStr = getTodayFormatted();
    if (dateStr === todayStr) return 'date-today';
    const d = parseDate(dateStr);
    const today = parseDate(todayStr);
    if (d < today) return 'date-past';
    return 'date-warning';
}

function parseEditDateHTML(editDateStr) {
    if (!editDateStr) return `<span class="edit-date-d">-</span>`;
    return `<span class="edit-date-d">${escapeHTML(editDateStr)}</span>`;
}

function updateEditDateField(tr) {
    if (!tr) return;
    const today = getTodayFormatted();
    const time = getTimeFormatted();
    const fullStr = `${today} ${time}`;
    const hiddenInput = tr.querySelector('.edit-date-val');
    if (hiddenInput) hiddenInput.value = fullStr;
    const containerMain = tr.querySelector('.edit-date-container-main');
    if (containerMain) containerMain.innerHTML = parseEditDateHTML(fullStr);
}

function cleanPhone(phone) {
    if (!phone) return '';
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('05')) {
        cleaned = '966' + cleaned.substring(1);
    }
    return cleaned;
}

function getLastNoteOnlyFromJSON(jsonStr) { 
    try { 
        const arr = JSON.parse(jsonStr || "[]"); 
        if (Array.isArray(arr) && arr.length > 0) {
            const last = arr[arr.length - 1];
            return last.text || last.note || "";
        }
        return "";
    } catch(e) { 
        if (typeof jsonStr === 'string' && jsonStr.trim() !== '' && jsonStr !== '[]') return jsonStr;
        return ""; 
    } 
}

function parseNoteDateTime(dateStr, timeStr) {
    if (!dateStr) return new Date(NaN);
    let parts = String(dateStr).split('-');
    let year, month, day;
    if (parts.length === 3) {
        if (parts[0].length === 4) { year = parseInt(parts[0], 10); month = parseInt(parts[1], 10) - 1; day = parseInt(parts[2], 10); } 
        else { day = parseInt(parts[0], 10); month = parseInt(parts[1], 10) - 1; year = parseInt(parts[2], 10); }
    } else { return new Date(dateStr); }
    let hours = 0, minutes = 0;
    if (timeStr && timeStr.includes(':')) { let tParts = timeStr.split(':'); hours = parseInt(tParts[0], 10) || 0; minutes = parseInt(tParts[1], 10) || 0; }
    return new Date(year, month, day, hours, minutes);
}

// --- إدارة سجل النشاط ---
function addActivityLog(actionText) {
    const newLog = {
        date: getTodayFormatted(),
        time: getTimeFormatted(),
        user: 'المستخدم',
        action: actionText
    };
    activityLogs.unshift(newLog);
    if (activityLogs.length > 50) activityLogs.pop();
    localStorage.setItem(LOGS_KEY, JSON.stringify(activityLogs));
    renderActivityLogs();
}

function renderActivityLogs() {
    const listEl = document.getElementById('activityList');
    if (!listEl) return;
    if (!activityLogs || activityLogs.length === 0) {
        listEl.innerHTML = '<div style="color:#94a3b8; font-size:10px; text-align:center; padding:10px;">لا توجد أنشطة مسجلة بعد</div>';
        return;
    }
    listEl.innerHTML = activityLogs.map(log => `
        <div class="log-entry">
            <div class="log-header-info">
                <span><i class="far fa-user"></i> ${escapeHTML(log.user || 'المستخدم')}</span>
                <span dir="ltr"><i class="far fa-calendar-alt"></i> ${escapeHTML(log.date)} ${escapeHTML(log.time)}</span>
            </div>
            <span class="log-sep">|</span>
            <div class="log-action">${escapeHTML(log.action)}</div>
        </div>
    `).join('');
}

function toggleLogExpansion() {
    const sec = document.getElementById('activityLogSection');
    const btn = document.getElementById('toggleExpandBtn');
    if (!sec) return;
    sec.classList.toggle('expanded');
    if (btn) {
        const icon = btn.querySelector('i');
        if (icon) {
            icon.className = sec.classList.contains('expanded') ? 'fas fa-compress-alt' : 'fas fa-expand-alt';
        }
    }
}

// --- الملاحظات ---
function openNote(el) {
    currentActivePreview = el;
    let arr = []; 
    try { arr = JSON.parse(el.getAttribute('data-full-notes') || "[]"); } catch(e) {}
    
    const historyLog = document.getElementById('historyLog');
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    if (historyLog) {
        historyLog.innerHTML = arr.map((msg, index) => {
            let msgDateObj = parseNoteDateTime(msg.date, msg.time);
            let dayStr = isNaN(msgDateObj.getTime()) ? '' : days[msgDateObj.getDay()] + ' ';
            let userName = msg.user && msg.user !== "المستخدم" ? msg.user : "المستخدم";

            let showDelete = true;
            if (msg.date && msg.time) {
                let noteDateTime = parseNoteDateTime(msg.date, msg.time);
                if (!isNaN(noteDateTime.getTime())) {
                    let diffInHours = (new Date() - noteDateTime) / (1000 * 60 * 60);
                    if (diffInHours > 24) showDelete = false;
                }
            }
            
            let deleteBtnHtml = showDelete ? `<i class="fas fa-trash-alt delete-note-btn" onclick="deleteNote(${index})" title="حذف الملاحظة"></i>` : '';

            return `
            <div class="note-item">
                <div class="note-header">
                    <span class="note-meta">
                        <span class="note-user"><i class="fas fa-user-circle"></i> ${escapeHTML(userName)}</span>
                        <span dir="ltr"><i class="far fa-calendar-alt"></i> ${escapeHTML(dayStr)} ${escapeHTML(msg.date || '')}</span>
                        <span dir="ltr"><i class="far fa-clock"></i> ${escapeHTML(msg.time || '')}</span>
                    </span>
                    ${deleteBtnHtml}
                </div>
                <div class="note-body">${escapeHTML(msg.text || '')}</div>
            </div>
            `;
        }).join('') || '<div style="color:#64748b; text-align:center; font-size:11px; padding:20px; font-weight:700;">لا توجد ملاحظات سابقة</div>';
    }
    
    const noteModal = document.getElementById('noteModal');
    if (noteModal) { noteModal.style.display = "flex"; if (historyLog) historyLog.scrollTop = historyLog.scrollHeight; }
    
    const modalTextArea = document.getElementById('modalTextArea');
    if (modalTextArea) { modalTextArea.value = ""; modalTextArea.focus(); }
}

function saveNote() {
    const txt = document.getElementById('modalTextArea').value.trim();
    if (txt && currentActivePreview) {
        let arr = []; 
        try { arr = JSON.parse(currentActivePreview.getAttribute('data-full-notes') || "[]"); } catch(e) {}
        
        let username = "المستخدم"; 
        const mainRow = currentActivePreview.closest('.main-row');
        
        if (mainRow) { 
            const ownerInput = mainRow.querySelector('.owner-input'); 
            if (ownerInput && ownerInput.value.trim()) username = ownerInput.value.trim(); 
        }
        
        arr.push({ user: username, date: getTodayFormatted(), time: getTimeFormatted(), text: txt });
        const jsonStr = JSON.stringify(arr);
        currentActivePreview.setAttribute('data-full-notes', jsonStr); 
        currentActivePreview.innerText = txt;
        
        if (mainRow) { 
            updateEditDateField(mainRow); 
            saveSingleRow(mainRow.id); 
            addActivityLog(`إضافة ملاحظة جديدة على زيارة (${mainRow.querySelector('td:nth-child(2) input')?.value || mainRow.id})`);
        }
    }
    closeNote();
}

async function deleteNote(index) {
    if (!currentActivePreview) return;
    const result = await Swal.fire({
        title: 'تأكيد الحذف؟', text: "هل أنت متأكد من حذف هذه الملاحظة؟", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#ef4444', cancelButtonColor: '#94a3b8',
        confirmButtonText: 'نعم، احذف', cancelButtonText: 'إلغاء'
    });

    if (result.isConfirmed) {
        let arr = [];
        try { arr = JSON.parse(currentActivePreview.getAttribute('data-full-notes') || "[]"); } catch(e) {}
        arr.splice(index, 1);
        const jsonStr = JSON.stringify(arr);
        currentActivePreview.setAttribute('data-full-notes', jsonStr);
        currentActivePreview.innerText = getLastNoteOnlyFromJSON(jsonStr);

        const mainRow = currentActivePreview.closest('.main-row');
        if (mainRow) { updateEditDateField(mainRow); saveSingleRow(mainRow.id); }
        openNote(currentActivePreview);
    }
}

function closeNote() { 
    const noteModal = document.getElementById('noteModal');
    if (noteModal) noteModal.style.display = "none"; 
}

// --- إضافة وقراءة البيانات ---
async function insertNewRow() {
    const newId = 'visit_' + Date.now();
    const today = getTodayFormatted();
    const timeStr = getTimeFormatted();
    
    const newVisit = {
        comp: '', address: '', mgr: '', mob: '', email: '', record: '',
        visitDate: today, curServ: '', oppValue: '0', notes: '[]',
        status: '', editDate: `${today} ${timeStr}`, owner: '', products: []
    };

    try {
        await setDoc(doc(db, "visits", newId), newVisit);
        addActivityLog('إضافة زيارة جديدة');
    } catch (error) {
        console.error("خطأ في إضافة زيارة جديدة سحابياً:", error);
        Swal.fire('خطأ', 'تعذر إضافة الزيارة في السحابة', 'error');
    }
}

function listenToVisits() {
    renderActivityLogs();
    const visitsRef = collection(db, "visits");
    
    // إيقاف المستمع القديم إن وجد لمنع التكرار
    if (unsubscribeVisits) {
        unsubscribeVisits();
    }

    // تشغيل المستمع مع التقاط أي خطأ في الشبكة
    unsubscribeVisits = onSnapshot(visitsRef, (snapshot) => {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;

        let needsFullRender = false;
        snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            data.id = change.doc.id;
            if (change.type === "added") { visitsDataArray.push(data); needsFullRender = true; }
            if (change.type === "modified") {
                const index = visitsDataArray.findIndex(v => v.id === data.id);
                if (index !== -1) { visitsDataArray[index] = data; updateRowDOM(data); }
            }
            if (change.type === "removed") {
                visitsDataArray = visitsDataArray.filter(v => v.id !== data.id);
                needsFullRender = true;
            }
        });

        if (needsFullRender || isInitialLoad) { 
            updateDynamicOwnerFilter();
            fullTableRender(); 
            isInitialLoad = false;
            markPageReady(); 
        }
        updateStats(); 
    }, (error) => { 
        console.error("مشكلة في مزامنة الزيارات من السحابة (جاري محاولة إعادة الاتصال):", error);
        
        // إعادة المحاولة التلقائية بعد 5 ثوانٍ لتجاوز مشكلة QUIC أو انقطاع الشبكة
        setTimeout(() => {
            console.log("محاولة إعادة الاتصال بقاعدة البيانات...");
            listenToVisits();
        }, 5000);
    });
}

// --- تنسيق ألوان الحالات ---
function applyStatusColor(selectEl) {
    if (!selectEl) return;
    selectEl.className = 'excel-input status-select';
    const val = selectEl.value.trim();
    if (val === 'تأهيل لفرصة') selectEl.classList.add('status-green');
    else if (val === 'مميزة') selectEl.classList.add('status-purple');
    else if (val === 'متابعة') selectEl.classList.add('status-yellow-fff');
    else if (val === 'عرض سعر') selectEl.classList.add('status-yellow-ffc');
    else if (val === 'غير مهتم') selectEl.classList.add('status-gray-a5');
    else if (val === 'فقدان') selectEl.classList.add('status-red-c00');
    
    const tr = selectEl.closest('tr');
    if (tr) {
        tr.classList.remove('row-lost', 'row-uninterested');
        if (val === 'فقدان') tr.classList.add('row-lost');
        else if (val === 'غير مهتم') tr.classList.add('row-uninterested');
    }
}

function onStatusChange(selectEl, id) {
    applyStatusColor(selectEl);
    debouncedSaveRow(id);
}

// --- معالجة جدول المنتجات ---
function renderSubTableHTML(v) {
    const products = Array.isArray(v.products) ? v.products : [];
    let rowsHtml = products.map(p => `
        <tr>
            <td><input type="text" class="inner-input p-name" value="${escapeHTML(p.name || '')}" oninput="debouncedSaveRow('${v.id}')"></td>
            <td><input type="number" class="inner-input p-qty" value="${p.qty || 1}" oninput="updateProductTotal(this, '${v.id}')"></td>
            <td><input type="number" class="inner-input p-price" value="${p.price || 0}" oninput="updateProductTotal(this, '${v.id}')"></td>
            <td><input type="number" class="inner-input p-total readonly-input" value="${(p.qty || 1) * (p.price || 0)}" readonly></td>
            <td style="text-align: center;"><button class="sub-action-btn" onclick="removeProductRow(this, '${v.id}')"><i class="fas fa-trash-alt"></i></button></td>
        </tr>
    `).join('');

    return `
    <tr id="sub_${v.id}" class="sub-table-row">
        <td colspan="14" class="sub-table-container">
            <table class="inner-table">
                <thead>
                    <tr>
                        <th style="width: 40%">الخدمة / المنتج</th>
                        <th style="width: 20%">الكمية</th>
                        <th style="width: 20%">السعر</th>
                        <th style="width: 15%">الإجمالي</th>
                        <th style="width: 5%; text-align:center;"><button class="header-plus-btn" onclick="addProductRow('${v.id}')"><i class="fas fa-plus"></i></button></th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </td>
    </tr>`;
}

function toggleSubTable(id) {
    const tr = document.getElementById('sub_' + id);
    const arrow = document.querySelector(`#${id} .toggle-arrow`);
    if(tr) {
        if(tr.style.display === 'table-row') {
            tr.style.display = 'none';
            arrow.classList.remove('arrow-open');
        } else {
            tr.style.display = 'table-row';
            arrow.classList.add('arrow-open');
        }
    }
}

function addProductRow(id) {
    const tbody = document.querySelector(`#sub_${id} tbody`);
    if (tbody) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="inner-input p-name" oninput="debouncedSaveRow('${id}')"></td>
            <td><input type="number" class="inner-input p-qty" value="1" oninput="updateProductTotal(this, '${id}')"></td>
            <td><input type="number" class="inner-input p-price" value="0" oninput="updateProductTotal(this, '${id}')"></td>
            <td><input type="number" class="inner-input p-total readonly-input" value="0" readonly></td>
            <td style="text-align: center;"><button class="sub-action-btn" onclick="removeProductRow(this, '${id}')"><i class="fas fa-trash-alt"></i></button></td>
        `;
        tbody.appendChild(tr);
        debouncedSaveRow(id);
    }
}

function removeProductRow(btn, id) {
    const tr = btn.closest('tr');
    if (tr) tr.remove();
    debouncedSaveRow(id);
}

function updateProductTotal(input, id) {
    const tr = input.closest('tr');
    const qty = parseFloat(tr.querySelector('.p-qty').value) || 0;
    const price = parseFloat(tr.querySelector('.p-price').value) || 0;
    tr.querySelector('.p-total').value = qty * price;
    
    // تحديث الإجمالي الكلي للزيارة
    const tbody = document.querySelector(`#sub_${id} tbody`);
    let totalOpp = 0;
    if(tbody) {
        tbody.querySelectorAll('tr').forEach(row => {
            const rowTotal = parseFloat(row.querySelector('.p-total').value) || 0;
            totalOpp += rowTotal;
        });
    }
    const mainRow = document.getElementById(id);
    if(mainRow) {
        const oppValInput = mainRow.querySelector('.opp-value-input');
        if (oppValInput) oppValInput.value = totalOpp;
    }
    
    debouncedSaveRow(id);
}

function renderRowHTML(v) {
    const hasProducts = Array.isArray(v.products) && v.products.length > 0;
    const visitDateFormatted = formatAsDDMMYYYY(v.visitDate || getTodayFormatted());
    const phoneClean = cleanPhone(v.mob);
    const calculatedOppVal = calculateProductsTotalSum(v.products);

    let rowClass = 'main-row';
    if (v.status === 'فقدان') rowClass += ' row-lost';
    if (v.status === 'غير مهتم') rowClass += ' row-uninterested';

    return `
    <tr id="${v.id}" class="${rowClass}">
        <td class="col-select">
            <input type="checkbox" class="select-check">
            <span class="toggle-arrow" onclick="toggleSubTable('${v.id}')"><i class="fas fa-caret-left"></i></span>
        </td>
        <td class="col-company"><input type="text" class="excel-input" value="${escapeHTML(v.comp || '')}" oninput="debouncedSaveRow('${v.id}')"></td>
        <td class="col-address"><input type="text" class="excel-input" value="${escapeHTML(v.address || '')}" oninput="debouncedSaveRow('${v.id}')"></td>
        <td class="col-manager"><input type="text" class="excel-input" value="${escapeHTML(v.mgr || '')}" oninput="debouncedSaveRow('${v.id}')"></td>
        <td class="col-mobile">
            <div class="phone-cell-container">
                <input type="text" class="excel-input" value="${escapeHTML(v.mob || '')}" oninput="debouncedSaveRow('${v.id}')">
                ${v.mob ? `<a href="https://wa.me/${phoneClean}" target="_blank" class="whatsapp-icon-btn" title="واتساب"><i class="fab fa-whatsapp"></i></a>` : ''}
            </div>
        </td>
        <td class="col-email"><input type="email" class="excel-input" value="${escapeHTML(v.email || '')}" oninput="debouncedSaveRow('${v.id}')"></td>
        <td class="col-record"><input type="text" class="excel-input" value="${escapeHTML(v.record || '')}" oninput="debouncedSaveRow('${v.id}')"></td>
        <td class="col-date">
            <input type="text" class="excel-input readonly-input visit-date-val ${getDateColorClass(visitDateFormatted)}" value="${escapeHTML(visitDateFormatted)}" onclick="openDatePicker(this, '${v.id}')" readonly>
        </td>
        <td class="col-service"><input type="text" class="excel-input cur-serv-val" value="${escapeHTML(v.curServ || '')}" oninput="debouncedSaveRow('${v.id}')"></td>
        <td class="col-val"><input type="number" class="excel-input opp-value-input readonly-input" value="${calculatedOppVal}" readonly></td>
        <td class="col-notes">
            <span class="notes-preview" data-full-notes="${escapeHTML(v.notes || '[]')}" onclick="openNote(this)">
                ${escapeHTML(getLastNoteOnlyFromJSON(v.notes))}
            </span>
        </td>
        <td class="col-status">
            <select class="excel-input status-select" onchange="onStatusChange(this, '${v.id}')">
                <option value="">-- اختر --</option>
                <option value="تأهيل لفرصة" ${v.status === 'تأهيل لفرصة' ? 'selected' : ''}>تأهيل لفرصة</option>
                <option value="مميزة" ${v.status === 'مميزة' ? 'selected' : ''}>مميزة</option>
                <option value="متابعة" ${v.status === 'متابعة' ? 'selected' : ''}>متابعة</option>
                <option value="عرض سعر" ${v.status === 'عرض سعر' ? 'selected' : ''}>عرض سعر</option>
                <option value="زيارة" ${v.status === 'زيارة' ? 'selected' : ''}>زيارة</option>
                <option value="اتصال" ${v.status === 'اتصال' ? 'selected' : ''}>اتصال</option>
                <option value="غير مهتم" ${v.status === 'غير مهتم' ? 'selected' : ''}>غير مهتم</option>
                <option value="فقدان" ${v.status === 'فقدان' ? 'selected' : ''}>فقدان</option>
            </select>
        </td>
        <td class="col-edit">
            <input type="hidden" class="edit-date-val" value="${escapeHTML(v.editDate || '')}">
            <div class="edit-date-container-main">${parseEditDateHTML(v.editDate || '')}</div>
        </td>
        <td class="col-owner"><input type="text" class="excel-input owner-input" value="${escapeHTML(v.owner || '')}" oninput="debouncedSaveRow('${v.id}')"></td>
    </tr>
    ${renderSubTableHTML(v)}`;
}

function updateRowDOM(v) {
    const mainRow = document.getElementById(v.id);
    if (!mainRow) return;

    const safeUpdate = (selector, newVal) => {
        const el = mainRow.querySelector(selector);
        if (el && document.activeElement !== el) {
            if (el.tagName === 'INPUT' || el.tagName === 'SELECT') { el.value = newVal; } 
            else { el.innerHTML = newVal; }
        }
    };

    safeUpdate('td:nth-child(2) input', v.comp || '');
    safeUpdate('td:nth-child(3) input', v.address || '');
    safeUpdate('td:nth-child(4) input', v.mgr || '');
    safeUpdate('td:nth-child(5) input', v.mob || '');
    safeUpdate('td:nth-child(6) input', v.email || '');
    safeUpdate('td:nth-child(7) input', v.record || '');
    safeUpdate('.visit-date-val', formatAsDDMMYYYY(v.visitDate || getTodayFormatted()));
    safeUpdate('.cur-serv-val', v.curServ || '');
    
    const calculatedOppVal = calculateProductsTotalSum(v.products);
    safeUpdate('.opp-value-input', calculatedOppVal);
    
    const statusSelect = mainRow.querySelector('.status-select');
    if (statusSelect && document.activeElement !== statusSelect) {
        statusSelect.value = v.status || ''; 
        applyStatusColor(statusSelect);
    }
    safeUpdate('.owner-input', v.owner || '');
    
    const hiddenEditDate = mainRow.querySelector('.edit-date-val');
    if (hiddenEditDate) hiddenEditDate.value = v.editDate || '';
    const editMains = mainRow.querySelector('.edit-date-container-main');
    if (editMains) editMains.innerHTML = parseEditDateHTML(v.editDate || '');

    let notesJson = v.notes || "[]";
    const noteEl = mainRow.querySelector('.notes-preview');
    if (noteEl) { noteEl.setAttribute('data-full-notes', notesJson); noteEl.innerText = getLastNoteOnlyFromJSON(notesJson); }
}

function calculateProductsTotalSum(products) {
    if (!Array.isArray(products) || products.length === 0) return 0;
    return products.reduce((sum, p) => sum + (Number(p.qty || 1) * Number(p.price || 0)), 0);
}

// --- الحفظ للـ Firebase ---
function debouncedSaveRow(id) {
    if (saveTimeouts[id]) clearTimeout(saveTimeouts[id]);
    const mainRow = document.getElementById(id);
    if (mainRow) updateEditDateField(mainRow);
    saveTimeouts[id] = setTimeout(() => { saveSingleRow(id); }, 1500);
}

async function saveSingleRow(id) {
    const mainRow = document.getElementById(id);
    if (!mainRow) return;

    let products = [];
    const subTable = document.getElementById('sub_' + id);
    if(subTable) {
        subTable.querySelectorAll('tbody tr').forEach(row => {
            products.push({
                name: row.querySelector('.p-name').value.trim(),
                qty: parseFloat(row.querySelector('.p-qty').value) || 1,
                price: parseFloat(row.querySelector('.p-price').value) || 0
            });
        });
    }

    const notesAttr = mainRow.querySelector('.notes-preview')?.getAttribute('data-full-notes') || "[]";

    const dataToSave = {
        comp: mainRow.querySelector('td:nth-child(2) input').value.trim(),
        address: mainRow.querySelector('td:nth-child(3) input').value.trim(),
        mgr: mainRow.querySelector('td:nth-child(4) input').value.trim(),
        mob: mainRow.querySelector('td:nth-child(5) input').value.trim(),
        email: mainRow.querySelector('td:nth-child(6) input').value.trim(),
        record: mainRow.querySelector('td:nth-child(7) input').value.trim(),
        visitDate: mainRow.querySelector('.visit-date-val').value.trim(),
        curServ: mainRow.querySelector('.cur-serv-val').value.trim(),
        oppValue: String(mainRow.querySelector('.opp-value-input').value),
        notes: notesAttr,
        status: mainRow.querySelector('.status-select').value.trim(),
        editDate: mainRow.querySelector('.edit-date-val').value,
        owner: mainRow.querySelector('.owner-input').value.trim(),
        products: products
    };

    try {
        await updateDoc(doc(db, "visits", id), dataToSave);
    } catch (e) {
        console.error("Error updating document: ", e);
    }
}

// --- بناء الجدول والبحث والفلترة ---
function fullTableRender() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    
    let filteredData = visitsDataArray;
    
    // فلترة البحث
    const searchVal = (document.getElementById('searchInput')?.value || '').toLowerCase();
    if (searchVal) {
        filteredData = filteredData.filter(v => 
            (v.comp || '').toLowerCase().includes(searchVal) ||
            (v.mgr || '').toLowerCase().includes(searchVal) ||
            (v.mob || '').toLowerCase().includes(searchVal) ||
            (v.record || '').toLowerCase().includes(searchVal) ||
            (v.owner || '').toLowerCase().includes(searchVal)
        );
    }

    // فلترة الحالة
    if (activeStatusFilters.length > 0) {
        filteredData = filteredData.filter(v => activeStatusFilters.includes(v.status));
    }

    // فلترة المستخدم
    if (activeOwnerFilters.length > 0) {
        filteredData = filteredData.filter(v => activeOwnerFilters.includes(v.owner));
    }

    tbody.innerHTML = filteredData.map(v => renderRowHTML(v)).join('');
    
    // تطبيق الألوان على الحالات
    tbody.querySelectorAll('.status-select').forEach(sel => applyStatusColor(sel));
}

function debouncedFilterTable() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { fullTableRender(); }, 400);
}

// الفلاتر المخصصة 
function toggleCustomFilter(event, menuId) {
    event.stopPropagation();
    const menu = document.getElementById(menuId);
    if (!menu) return;
    const isShowing = menu.classList.contains('show');
    document.querySelectorAll('.multi-select-menu').forEach(m => m.classList.remove('show'));
    if (!isShowing) menu.classList.add('show');
}

function updateFilters() {
    activeStatusFilters = Array.from(document.querySelectorAll('#statusFilterMenu input[type="checkbox"]:checked')).map(cb => cb.value);
    activeOwnerFilters = Array.from(document.querySelectorAll('#ownerFilterMenu input[type="checkbox"]:checked')).map(cb => cb.value);

    document.getElementById('statusFilterDot').style.display = activeStatusFilters.length > 0 ? 'block' : 'none';
    document.getElementById('ownerFilterDot').style.display = activeOwnerFilters.length > 0 ? 'block' : 'none';

    fullTableRender();
}

function selectAllFilter(menuId) {
    document.querySelectorAll(`#${menuId} input[type="checkbox"]`).forEach(cb => cb.checked = true);
    updateFilters();
}

function clearAllFilter(menuId) {
    document.querySelectorAll(`#${menuId} input[type="checkbox"]`).forEach(cb => cb.checked = false);
    updateFilters();
}

function updateDynamicOwnerFilter() {
    const owners = [...new Set(visitsDataArray.map(v => v.owner || '').filter(o => o !== ''))].sort();
    const container = document.getElementById('ownerFilterItemsContainer');
    if (!container) return;
    container.innerHTML = owners.map(owner => `
        <label class="multi-select-item">
            <input type="checkbox" value="${escapeHTML(owner)}" onchange="updateFilters()"> 
            <span class="custom-cb"><i class="fas fa-check"></i></span> ${escapeHTML(owner)}
        </label>
    `).join('');
    
    // إعادة تحديد القيم السابقة
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    cbs.forEach(cb => {
        if (activeOwnerFilters.includes(cb.value)) cb.checked = true;
    });
}

// إغلاق القوائم المنبثقة عند النقر في الخارج
document.addEventListener('click', () => {
    document.querySelectorAll('.multi-select-menu').forEach(m => m.classList.remove('show'));
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
});

// --- تحديث الإحصائيات ---
function updateStats() {
    const today = getTodayFormatted();
    const [d, m, y] = today.split('-');
    const currentMonthPrefix = `-${m}-${y}`;

    let total = visitsDataArray.length;
    let monthTotal = 0;
    let todayTotal = 0;
    let valueTotal = 0;
    let valueMonth = 0;

    visitsDataArray.forEach(v => {
        const dStr = v.visitDate || '';
        const vVal = calculateProductsTotalSum(v.products);
        
        valueTotal += vVal;
        
        if (dStr.endsWith(currentMonthPrefix)) {
            monthTotal++;
            valueMonth += vVal;
        }
        if (dStr === today) {
            todayTotal++;
        }
    });

    if (document.getElementById('stat-total')) document.getElementById('stat-total').innerText = total;
    if (document.getElementById('stat-month')) document.getElementById('stat-month').innerText = monthTotal;
    if (document.getElementById('stat-today')) document.getElementById('stat-today').innerText = todayTotal;
    if (document.getElementById('stat-value-total')) document.getElementById('stat-value-total').innerText = valueTotal.toLocaleString();
    if (document.getElementById('stat-value-month')) document.getElementById('stat-value-month').innerText = valueMonth.toLocaleString();
}

// --- الإجراءات الجماعية ---
function toggleAllCheckboxes(source) {
    document.querySelectorAll('.select-check').forEach(cb => cb.checked = source.checked);
}

function toggleDropdown(event, btn) {
    event.stopPropagation();
    const menu = btn.nextElementSibling;
    const isShowing = menu.classList.contains('show');
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
    if (!isShowing) menu.classList.add('show');
}

async function handleBulkAction(action) {
    const checkedBoxes = document.querySelectorAll('.select-check:checked');
    const selectedIds = Array.from(checkedBoxes).map(cb => cb.closest('.main-row').id);

    if (action === 'استيراد') {
        document.getElementById('excelFileInput').click();
        return;
    }

    if (selectedIds.length === 0) {
        Swal.fire('تنبيه', 'يرجى تحديد عنصر واحد على الأقل', 'warning');
        return;
    }

    if (action === 'تغيير المستخدم') {
        const { value: newUser } = await Swal.fire({
            title: 'تغيير المستخدم', input: 'text', inputPlaceholder: 'اسم المستخدم الجديد',
            showCancelButton: true, confirmButtonText: 'تغيير', cancelButtonText: 'إلغاء'
        });
        if (newUser) {
            const batch = writeBatch(db);
            selectedIds.forEach(id => {
                batch.update(doc(db, "visits", id), { owner: newUser });
                const r = document.getElementById(id);
                if (r) { r.querySelector('.owner-input').value = newUser; updateEditDateField(r); }
            });
            await batch.commit();
            addActivityLog(`تغيير المستخدم لـ ${selectedIds.length} زيارات`);
            Swal.fire('نجاح', 'تم تغيير المستخدم بنجاح', 'success');
        }
    } 
    else if (action === 'حذف') {
        itemsToDelete = selectedIds;
        document.getElementById('deleteModal').style.display = 'flex';
    }
}

async function confirmDelete() {
    closeDeleteModal();
    const batch = writeBatch(db);
    itemsToDelete.forEach(id => batch.delete(doc(db, "visits", id)));
    await batch.commit();
    addActivityLog(`حذف ${itemsToDelete.length} زيارات`);
    Swal.fire('نجاح', 'تم الحذف بنجاح', 'success');
    itemsToDelete = [];
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
}

// --- التقويم المخصص ---
function openDatePicker(input, rowId) {
    currentPickerInput = input;
    currentPickerRowId = rowId;
    
    let d = new Date();
    if (input.value) {
        const parsed = parseDate(input.value);
        if (!isNaN(parsed)) d = parsed;
    }
    currentPickerMonth = d.getMonth();
    currentPickerYear = d.getFullYear();
    
    renderCalendar();
    document.getElementById('customDatePicker').classList.add('active');
}

function closeDatePicker() {
    document.getElementById('customDatePicker').classList.remove('active');
}

function setTodayDate() {
    const today = getTodayFormatted();
    if (currentPickerInput) {
        currentPickerInput.value = today;
        currentPickerInput.className = `excel-input readonly-input visit-date-val ${getDateColorClass(today)}`;
        debouncedSaveRow(currentPickerRowId);
    }
    closeDatePicker();
}

function renderCalendar() {
    const monthSelect = document.getElementById('dpMonth');
    const yearSelect = document.getElementById('dpYear');
    
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    monthSelect.innerHTML = months.map((m, i) => `<option value="${i}" ${i === currentPickerMonth ? 'selected' : ''}>${m}</option>`).join('');
    
    let yearsHtml = '';
    const currentY = new Date().getFullYear();
    for (let i = currentY - 5; i <= currentY + 5; i++) {
        yearsHtml += `<option value="${i}" ${i === currentPickerYear ? 'selected' : ''}>${i}</option>`;
    }
    yearSelect.innerHTML = yearsHtml;

    monthSelect.onchange = (e) => { currentPickerMonth = parseInt(e.target.value); renderDays(); };
    yearSelect.onchange = (e) => { currentPickerYear = parseInt(e.target.value); renderDays(); };

    renderDays();
}

function renderDays() {
    const daysGrid = document.getElementById('dpDays');
    daysGrid.innerHTML = '';
    
    const firstDay = new Date(currentPickerYear, currentPickerMonth, 1).getDay();
    const daysInMonth = new Date(currentPickerYear, currentPickerMonth + 1, 0).getDate();
    
    const today = new Date();
    const isCurrentMonth = today.getMonth() === currentPickerMonth && today.getFullYear() === currentPickerYear;

    let selectedDateStr = currentPickerInput ? currentPickerInput.value : '';

    for (let i = 0; i < firstDay; i++) {
        daysGrid.innerHTML += `<div></div>`;
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${String(i).padStart(2, '0')}-${String(currentPickerMonth + 1).padStart(2, '0')}-${currentPickerYear}`;
        let classes = 'day-number';
        if (isCurrentMonth && i === today.getDate()) classes += ' today-day';
        if (dateStr === selectedDateStr) classes += ' selected-day';

        const div = document.createElement('div');
        div.className = classes;
        div.innerText = i;
        div.onclick = () => {
            if (currentPickerInput) {
                currentPickerInput.value = dateStr;
                currentPickerInput.className = `excel-input readonly-input visit-date-val ${getDateColorClass(dateStr)}`;
                debouncedSaveRow(currentPickerRowId);
            }
            closeDatePicker();
        };
        daysGrid.appendChild(div);
    }
}

// --- استيراد الإكسل ---
async function handleImportExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, {header: 1});

        if (json.length > 1) {
            const batch = writeBatch(db);
            let importedCount = 0;
            const headers = json[0];

            for (let i = 1; i < json.length; i++) {
                const row = json[i];
                if (row.length === 0 || !row[0]) continue;

                const newId = 'visit_' + Date.now() + '_' + i;
                const newVisit = {
                    comp: String(row[0] || ''),
                    address: String(row[1] || ''),
                    mgr: String(row[2] || ''),
                    mob: String(row[3] || ''),
                    email: String(row[4] || ''),
                    record: String(row[5] || ''),
                    visitDate: formatAsDDMMYYYY(row[6]) || getTodayFormatted(),
                    curServ: String(row[7] || ''),
                    oppValue: String(row[8] || '0'),
                    notes: "[]",
                    status: String(row[9] || ''),
                    editDate: `${getTodayFormatted()} ${getTimeFormatted()}`,
                    owner: String(row[10] || ''),
                    products: []
                };
                
                batch.set(doc(db, "visits", newId), newVisit);
                importedCount++;
            }
            
            await batch.commit();
            addActivityLog(`استيراد ${importedCount} زيارة من ملف الإكسل`);
            Swal.fire('نجاح', `تم استيراد ${importedCount} زيارة بنجاح`, 'success');
        }
        document.getElementById('excelFileInput').value = '';
    };
    reader.readAsArrayBuffer(file);
}

// الاستماع للبيانات عند التحميل
document.addEventListener('DOMContentLoaded', () => {
    listenToVisits();
});

// =========================================================================
// ربط الدوال بالكائن window لحل مشكلة ES6 Modules (Scope Issue)
// =========================================================================
window.insertNewRow = insertNewRow;
window.debouncedSaveRow = debouncedSaveRow;
window.onStatusChange = onStatusChange;
window.toggleSubTable = toggleSubTable;
window.addProductRow = addProductRow;
window.removeProductRow = removeProductRow;
window.updateProductTotal = updateProductTotal;
window.debouncedFilterTable = debouncedFilterTable;
window.toggleCustomFilter = toggleCustomFilter;
window.updateFilters = updateFilters;
window.selectAllFilter = selectAllFilter;
window.clearAllFilter = clearAllFilter;
window.toggleAllCheckboxes = toggleAllCheckboxes;
window.toggleDropdown = toggleDropdown;
window.handleBulkAction = handleBulkAction;
window.confirmDelete = confirmDelete;
window.closeDeleteModal = closeDeleteModal;
window.openDatePicker = openDatePicker;
window.closeDatePicker = closeDatePicker;
window.setTodayDate = setTodayDate;
window.openNote = openNote;
window.saveNote = saveNote;
window.closeNote = closeNote;
window.deleteNote = deleteNote;
window.toggleLogExpansion = toggleLogExpansion;
window.handleImportExcel = handleImportExcel;