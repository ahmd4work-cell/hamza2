// =========================================================================
// customers.js - إدارة العملاء سحابياً (نظيف ومنظم)
// الربط: firebase-config.js + navbar.js - جميع الأسماء سمول
// الوظائف والشكل محفوظة 100% - تنظيف فقط
// =========================================================================
import { db } from './firebase-config.js';
import { collection, getDocs, setDoc, doc, deleteDoc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// --- متغيرات الـ DOM (يتم تهيئتها بعد التحميل) ---
let tableBody, logsBody, totalCustomers, monthCustomers, todayCustomers, searchInput;

// --- متغيرات الحالة ---
let searchTimeout;
let customersDataList = [];
let logsDataList = [];

function initDomReferences() {
    tableBody = document.getElementById('tableBody');
    logsBody = document.getElementById('activityList');
    totalCustomers = document.getElementById('stat-total');
    monthCustomers = document.getElementById('stat-month');
    todayCustomers = document.getElementById('stat-today');
    searchInput = document.getElementById('searchInput');
}

function getTodayFormatted() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTimeFormatted() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateDisplay(dateString) {
    if (!dateString) return '-';
    let cleanDate = String(dateString).trim().replace(/\//g, '-');
    const parts = cleanDate.split('-');
    
    if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return cleanDate;
}

// دالة مساعدة لاستخراج الشهر والسنة باللغة العربية
function getMonthYearArabic(dateString) {
    if (!dateString) return 'غير محدد';
    let cleanDate = String(dateString).trim().replace(/\//g, '-');
    const parts = cleanDate.split('-');
    let m, y;
    
    if (parts.length === 3) {
        if (parts[0].length === 4) { y = parts[0]; m = parts[1]; }
        else { y = parts[2]; m = parts[1]; }
    } else {
        const d = new Date(dateString);
        if (!isNaN(d)) {
            y = d.getFullYear();
            m = d.getMonth() + 1;
        } else {
            return 'غير محدد';
        }
    }
    
    const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    let mIndex = parseInt(m, 10) - 1;
    if (mIndex >= 0 && mIndex < 12) {
        return `${monthNames[mIndex]} ${y}`;
    }
    return 'غير محدد';
}

function normalizeText(v) { return String(v || '').toLowerCase().trim(); }
function escapeHTML(str) { 
    return String(str || '').replace(/[&<>'"]/g, tag => ({ 
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' 
    }[tag])); 
}

function safe(value, fallback = '-') { 
    return escapeHTML(value && String(value).trim() ? String(value).trim() : fallback); 
}

// ==========================================
// دوال التصنيف والعرض في الجدول
// ==========================================
function badgeClass(status) {
    const s = normalizeText(status);
    if (['جديد', 'مفتوح', 'نشط', 'مكتمل', 'تم'].some(word => s.includes(word))) return 'status-active';
    if (s.includes('متابعة')) return 'status-med';
    if (['مغلق', 'ملغي'].some(word => s.includes(word))) return 'status-inactive';
    return 'status-small';
}

function classBadgeColor(classification) {
    const c = normalizeText(classification);
    if (c.includes('حكومي')) return 'status-gov';
    if (c.includes('هام')) return 'status-important';
    if (c.includes('متوسط')) return 'status-med';
    return 'status-small';
}

function getDisplayManager(v) { return safe(v.delegatePriority && v.delegateName ? v.delegateName : v.mgr); }
function getDisplayMobile(v) { return safe(v.delegatePriority && v.delegateMob ? v.delegateMob : v.mob); }
function getDisplayEmail(v) { return safe(v.delegatePriority && v.delegateEmail ? v.delegateEmail : v.email); }

// ==========================================
// التخزين المحلي واسترجاع البيانات (Local & Cloud)
// ==========================================
function saveLocalBackup() {
    try {
        localStorage.setItem('crm_customers', JSON.stringify(customersDataList));
        localStorage.setItem('crm_activity_logs', JSON.stringify(logsDataList));
    } catch (e) {
        console.error("Local Storage Error: ", e);
    }
}

async function loadSavedData() {
    const localCust = localStorage.getItem('crm_customers');
    const localLogs = localStorage.getItem('crm_activity_logs');
    
    if (localCust) try { customersDataList = JSON.parse(localCust); } catch(e){}
    if (localLogs) try { logsDataList = JSON.parse(localLogs); } catch(e){}

    updateStats(customersDataList);
    renderCustomers(customersDataList);
    renderLogs(logsDataList);

    try {
        const querySnapshot = await getDocs(collection(db, "customers"));
        const freshCustomers = querySnapshot.docs.map(docSnap => {
            const data = docSnap.data();
            data.code = docSnap.id || data.code;
            return data;
        }).sort((a, b) => (b.code || '').localeCompare(a.code || ''));
        
        customersDataList = freshCustomers;

        const logsSnapshot = await getDocs(collection(db, "activity_logs"));
        const freshLogs = logsSnapshot.docs.map(docSnap => docSnap.data())
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        logsDataList = freshLogs;

        saveLocalBackup();
        updateStats(customersDataList);
        renderCustomers(customersDataList);
        renderLogs(logsDataList);

        if (searchInput) {
            searchInput.addEventListener('input', debouncedFilterTable);
        }
    } catch (error) {
        console.error("Error loading data from Cloud: ", error);
    }
}

// ==========================================
// دوال الريندر للـ UI
// ==========================================
function renderCustomers(list) {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    if (!list.length) {
        tableBody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:28px;color:var(--text-muted);">لا توجد بيانات لعرضها</td></tr>`;
        return;
    }
    
    // ترتيب النسخة المعروضة تنازلياً حسب التاريخ لضمان تجميع الفواصل بشكل صحيح دون تكرار
    const sortedList = [...list].sort((a, b) => {
        let dA = a.creationDate || a.date || '';
        let dB = b.creationDate || b.date || '';
        
        const parseD = (str) => {
            let p = str.replace(/\//g, '-').split('-');
            if(p.length === 3) {
                return p[0].length === 4 ? `${p[0]}-${p[1]}-${p[2]}` : `${p[2]}-${p[1]}-${p[0]}`;
            }
            return str;
        };
        return parseD(dB).localeCompare(parseD(dA));
    });
    
    let currentMonthYear = '';

    sortedList.forEach(v => {
        const rowMonthYear = getMonthYearArabic(v.creationDate || v.date);
        
        // إضافة فاصل الشهر في حال تغيره
        if (rowMonthYear !== currentMonthYear && rowMonthYear !== 'غير محدد') {
            const sepTr = document.createElement('tr');
            sepTr.className = 'month-separator-row';
            sepTr.innerHTML = `<td colspan="13" style="pointer-events: none;"><span class="month-badge">${escapeHTML(rowMonthYear)}</span></td>`;
            tableBody.appendChild(sepTr);
            currentMonthYear = rowMonthYear;
        }

        const classification = safe(v.classification || v.source || 'غير محدد');
        let lastNotePreview = (v.notesHistory && v.notesHistory.length) 
            ? v.notesHistory[v.notesHistory.length - 1].text 
            : (v.notesText || 'اضغط لإضافة ملاحظة');

        const tr = document.createElement('tr');
        tr.className = 'main-row';
        tr.id = `row-${v.code}`;
        tr.innerHTML = `
            <td><input type="checkbox" class="select-check" data-code="${v.code}"></td>
            <td><a href="#" onclick="event.preventDefault(); window.location.href='customer-details.html?code=${v.code}'" class="code-link">${safe(v.code, '00001')}</a></td>
            <td class="custom-tooltip" data-fulltext="${safe(v.comp)}">
                <span class="text-truncate"><strong>${safe(v.comp)}</strong></span>
            </td>
            <td><span class="text-truncate" title="${safe(v.city)}">${safe(v.city)}</span></td>
            <td><span class="text-truncate" title="${getDisplayManager(v)}">${getDisplayManager(v)}</span></td>
            <td>
                <div class="phone-cell-container">
                    ${getDisplayMobile(v)}
                    <a href="https://wa.me/${getDisplayMobile(v).replace(/\D/g,'')}" target="_blank" class="whatsapp-icon-btn" title="مراسلة واتساب" onclick="event.stopPropagation()"><i class="fab fa-whatsapp"></i></a>
                </div>
            </td>
            <td><span class="text-truncate" title="${getDisplayEmail(v)}">${getDisplayEmail(v)}</span></td>
            <td>${safe(v.cr1 || v.cr, '-')}</td>
            <td dir="ltr" style="text-align: center;"><strong>${formatDateDisplay(v.creationDate || v.date)}</strong></td>
            <td><span class="${classBadgeColor(classification)}" style="padding: 2px 8px; border-radius: 4px;">${classification}</span></td>
            <td><div class="notes-preview" onclick="window.openNote('${v.code}'); event.stopPropagation()">${safe(lastNotePreview)}</div></td>
            <td><span class="${badgeClass(v.status)}" style="padding: 2px 8px; border-radius: 4px;">${safe(v.status, 'جديد')}</span></td>
            <td><span class="text-truncate" title="${safe(v.owner)}"><input type="hidden" value="${safe(v.owner)}"> ${safe(v.owner)}</span></td>
        `;
        tableBody.appendChild(tr);
    });
}

function renderLogs(list) {
    if (!logsBody) return;
    logsBody.innerHTML = '';
    if (!list.length) {
        logsBody.innerHTML = `<div style="text-align:center;padding:28px;color:var(--text-muted);">لا يوجد سجل نشاط بعد</div>`;
        return;
    }
    
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']; 
    
    list.slice(0, 100).forEach(log => {
        const d = new Date(log.timestamp || Date.now());
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear(); 
        const dayName = days[d.getDay()];
        const timeStr = String(d.getHours()).padStart(2, '0') + ":" + String(d.getMinutes()).padStart(2, '0');

        logsBody.innerHTML += `
            <div class="log-entry">
                <span class="log-header-info">
                    <span>${safe(log.user || 'المستخدم')}</span>
                    <span>${dayName}</span>
                    <span dir="ltr">${dd}-${mm}-${yyyy}</span>
                    <span dir="ltr">${timeStr}</span>
                </span>
                <span class="log-sep">|</span>
                <span class="log-action">${safe(log.action)}</span>
            </div>
        `;
    });
}

async function addToActivityLog(fieldName, oldVal, newVal, targetName, user = 'المستخدم') { 
    if (oldVal === newVal && fieldName !== 'إجراء') return; 
    
    const cleanTarget = targetName || 'عنصر غير مسمى'; 
    let actionText = '';
    
    if (fieldName === 'الحالة') {
        actionText = `تم تغير الحالة من ${escapeHTML(oldVal) || 'فارغ'} الى ${escapeHTML(newVal) || 'فارغ'} لـ ( ${escapeHTML(cleanTarget)} )`;
    } else if (fieldName === 'إجراء') {
        actionText = `${escapeHTML(oldVal)} لـ ( ${escapeHTML(cleanTarget)} )`;
    } else {
        actionText = `تعديل ${escapeHTML(fieldName)} من [${escapeHTML(oldVal) || 'فارغ'}] إلى [${escapeHTML(newVal) || 'فارغ'}] لـ ( ${escapeHTML(cleanTarget)} )`;
    }

    const logEntry = { user, action: actionText, timestamp: Date.now() };

    logsDataList.unshift(logEntry);
    saveLocalBackup();
    renderLogs(logsDataList);

    try {
        await setDoc(doc(db, "activity_logs", logEntry.timestamp.toString()), logEntry);
    } catch (error) {
        console.error("Error adding log to Cloud: ", error);
    }
}

function updateStats(list) {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const today = now.toISOString().slice(0, 10);

    if (totalCustomers) totalCustomers.textContent = list.length;
    if (monthCustomers) monthCustomers.textContent = list.filter(v => {
        const dStr = v.creationDate || v.date || '';
        const parts = dStr.includes('/') ? dStr.split('/') : dStr.split('-');
        
        if (parts.length === 3) {
            const m = parseInt(parts[1]) - 1;
            const y = parseInt(parts[0].length === 4 ? parts[0] : parts[2]);
            return m === thisMonth && y === thisYear;
        }
        const d = new Date(dStr);
        return !isNaN(d) && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;
    
    if (todayCustomers) todayCustomers.textContent = list.filter(v => {
        const d = String(v.creationDate || v.date || '');
        return d.includes(today) || d.includes(`${now.getDate()}`) || d.includes(`${now.getMonth() + 1}`);
    }).length;
}

// ==========================================
// البحث والإجراءات داخل الجدول
// ==========================================
function debouncedFilterTable() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const q = normalizeText(searchInput.value);
        const filtered = customersDataList.filter(v => {
            const haystack = [
                v.code, v.comp, v.address, v.city, v.mgr, v.delegateName,
                v.mob, v.delegateMob, v.email, v.delegateEmail, v.cr1, v.cr, v.status,
                v.owner, v.classification, v.notesText, v.lastNote
            ].map(normalizeText).join(' ');
            return haystack.includes(q);
        });
        renderCustomers(filtered);
    }, 300);
}

// ==========================================
// وظائف إضافة عميل جديد
// ==========================================
function openAddCustomerModal() {
    const modal = document.getElementById('addCustomerModal');
    if (modal) modal.style.display = 'flex';
    
    let nextNum = 1;
    if (customersDataList.length > 0) {
        const codes = customersDataList.map(c => {
            const match = (c.code || '').match(/\d+/);
            return match ? parseInt(match[0], 10) : 0;
        });
        nextNum = Math.max(...codes) + 1;
    }
    
    const addCodeInput = document.getElementById('addCode');
    if (addCodeInput) addCodeInput.value = 'CUST-' + String(nextNum).padStart(5, '0');
    
    const d = new Date();
    const todayStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    const addDateInput = document.getElementById('addDate');
    if (addDateInput) addDateInput.value = todayStr;
    
    ['addComp', 'addCity', 'addAddress', 'addMainCR', 'addSubCR', 'addManager', 'addMob', 'addEmail', 'addCreator'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

function closeAddCustomerModal() {
    const modal = document.getElementById('addCustomerModal');
    if (modal) modal.style.display = 'none';
}

async function saveNewCustomer() {
    const compEl = document.getElementById('addComp');
    const comp = compEl ? compEl.value : '';
    
    if (!comp.trim()) {
        if (typeof Swal !== 'undefined') Swal.fire('تنبيه', 'يرجى إدخال اسم الشركة', 'warning');
        return;
    }

    const codeVal = document.getElementById('addCode').value;
    const dateVal = document.getElementById('addDate').value;
    const mgrVal = document.getElementById('addManager').value;
    const mobVal = document.getElementById('addMob').value;
    const emailVal = document.getElementById('addEmail').value;
    const creator = document.getElementById('addCreator').value || 'المستخدم';

    const newCust = {
        code: codeVal, date: dateVal, creationDate: dateVal,
        comp: comp, city: document.getElementById('addCity').value,
        address: document.getElementById('addAddress').value,
        cr1: document.getElementById('addMainCR').value, cr2: document.getElementById('addSubCR').value,
        mgr: mgrVal, mob: mobVal, email: emailVal, owner: creator,
        status: 'جديد', classification: 'صغير', notesText: '',
        managers: (mgrVal || mobVal || emailVal) ? [{
            id: Date.now(), name: mgrVal, phone: mobVal, altPhone: "",
            email: emailVal, jobTitle: "المدير / المسؤول", date: dateVal, isPrimary: true
        }] : [], 
        orders: [], visits: [], opportunities: [], sales: [], attachments: [], notesHistory: []
    };

    try {
        customersDataList.unshift(newCust);
        saveLocalBackup();

        await setDoc(doc(db, "customers", newCust.code), newCust);
        await addToActivityLog('إجراء', 'إنشاء عميل جديد', '', newCust.comp, creator);

        closeAddCustomerModal();
        updateStats(customersDataList);
        renderCustomers(customersDataList);

        if (typeof Swal !== 'undefined') Swal.fire('نجاح', 'تم إضافة العميل بنجاح', 'success');
    } catch (error) {
        console.error("Error adding document: ", error);
        if (typeof Swal !== 'undefined') Swal.fire('خطأ', 'حدث خطأ أثناء حفظ البيانات بالسحابة', 'error');
    }
}

// ==========================================
// نظام الملاحظات المنبثق
// ==========================================
let currentNoteCode = null;

function openNote(code) {
    currentNoteCode = code;
    const modal = document.getElementById('noteModal');
    if (modal) modal.style.display = 'flex';
    
    const txtArea = document.getElementById('modalTextArea');
    if (txtArea) { txtArea.value = ''; txtArea.focus(); }
    
    const customer = customersDataList.find(c => c.code === code);
    const historyLog = document.getElementById('historyLog');
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    if (historyLog) {
        if (customer && customer.notesHistory && customer.notesHistory.length) {
            historyLog.innerHTML = customer.notesHistory.map((msg, index) => {
                let msgDateObj = new Date(msg.date);
                let dayStr = isNaN(msgDateObj) ? '' : days[msgDateObj.getDay()] + ' ';
                let userName = msg.user && msg.user !== "المستخدم" ? msg.user : "المستخدم";

                let showDelete = true;
                if (msg.date && msg.time) {
                    let noteDateTime = new Date(`${msg.date}T${msg.time}:00`);
                    if (!isNaN(noteDateTime)) {
                        let diffInHours = (new Date() - noteDateTime) / (1000 * 60 * 60);
                        if (diffInHours > 24) showDelete = false;
                    }
                }
                
                let deleteBtnHtml = showDelete ? `<i class="fas fa-trash-alt delete-note-btn" onclick="window.deleteNote(${index})" title="حذف الملاحظة"></i>` : '';

                return `
                <div class="note-item">
                    <div class="note-header">
                        <div class="note-meta">
                            <span class="note-user"><i class="fas fa-user-circle"></i> ${escapeHTML(userName)}</span>
                            <span dir="ltr"><i class="far fa-calendar-alt"></i> ${escapeHTML(dayStr)} ${escapeHTML(msg.date)}</span>
                            <span dir="ltr"><i class="far fa-clock"></i> ${escapeHTML(msg.time || '')}</span>
                        </div>
                        ${deleteBtnHtml}
                    </div>
                    <div class="note-body">${escapeHTML(msg.text)}</div>
                </div>`;
            }).join('');
            historyLog.scrollTop = historyLog.scrollHeight;
        } else {
            historyLog.innerHTML = '<div style="color:var(--text-muted); text-align:center; font-size:11px; padding:20px; font-weight:700;">لا توجد ملاحظات سابقة</div>';
        }
    }
}

function closeNote() {
    const modal = document.getElementById('noteModal');
    if (modal) modal.style.display = 'none';
    currentNoteCode = null;
}

async function saveNote() {
    if (!currentNoteCode) return;
    const txtArea = document.getElementById('modalTextArea');
    const text = txtArea ? txtArea.value.trim() : '';
    if (!text) { closeNote(); return; }

    const customer = customersDataList.find(c => c.code === currentNoteCode);
    if (!customer) return;
    
    let username = customer.owner || "المستخدم";
    if (!customer.notesHistory) customer.notesHistory = [];
    
    customer.notesHistory.push({ user: username, date: getTodayFormatted(), time: getTimeFormatted(), text: text });
    customer.notesText = text;
    
    try {
        saveLocalBackup();
        await updateDoc(doc(db, "customers", currentNoteCode), { notesHistory: customer.notesHistory, notesText: customer.notesText });
        await addToActivityLog('إجراء', 'إضافة ملاحظة جديدة', '', customer.comp, username);
        
        closeNote();
        renderCustomers(customersDataList);
        
        if (typeof Swal !== 'undefined') {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'تم حفظ الملاحظة بنجاح', showConfirmButton: false, timer: 1500 });
        }
    } catch (error) {
        console.error("Error updating note: ", error);
        if (typeof Swal !== 'undefined') Swal.fire('خطأ', 'حدث خطأ أثناء حفظ الملاحظة', 'error');
    }
}

async function deleteNote(index) {
    if (!currentNoteCode) return;
    const result = await Swal.fire({
        title: 'تأكيد الحذف؟', text: "هل أنت متأكد من حذف هذه الملاحظة؟",
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8', confirmButtonText: 'نعم، احذف', cancelButtonText: 'إلغاء'
    });

    if (result.isConfirmed) {
        const customer = customersDataList.find(c => c.code === currentNoteCode);
        if (!customer || !customer.notesHistory) return;
        
        customer.notesHistory.splice(index, 1);
        customer.notesText = customer.notesHistory.length > 0 ? customer.notesHistory[customer.notesHistory.length - 1].text : '';

        try {
            saveLocalBackup();
            await updateDoc(doc(db, "customers", currentNoteCode), { notesHistory: customer.notesHistory, notesText: customer.notesText });
            await addToActivityLog('إجراء', 'تم حذف ملاحظة', '', customer.comp, customer.owner || "المستخدم");
            
            openNote(currentNoteCode);
            renderCustomers(customersDataList);
            Swal.fire('تم الحذف!', 'تم حذف الملاحظة بنجاح.', 'success');
        } catch (error) {
            console.error("Error deleting note: ", error);
            Swal.fire('خطأ', 'حدث خطأ أثناء الحذف', 'error');
        }
    }
}

// ==========================================
// الإجراءات الجماعية والاستيراد والتصدير
// ==========================================
function toggleLogExpansion() {
    const section = document.getElementById('activityLogSection');
    const btn = document.getElementById('toggleExpandBtn');
    if (section) {
        section.classList.toggle('expanded');
        if (btn) {
            const icon = btn.querySelector('i');
            if (icon) {
                icon.className = section.classList.contains('expanded') ? 'fas fa-compress-alt' : 'fas fa-expand-alt';
            }
        }
    }
}

function toggleDropdown(event, btn) {
    event.stopPropagation();
    const menu = btn.nextElementSibling;
    if (menu) menu.classList.toggle('show');
}

function toggleAllCheckboxes(masterCheckbox) {
    document.querySelectorAll('.select-check').forEach(cb => cb.checked = masterCheckbox.checked);
}

// -- التصدير باستخدام SheetJS --
function exportSelectedToExcel(selectedCodes) {
    let dataToExport = customersDataList;
    if (selectedCodes && selectedCodes.length > 0) {
        dataToExport = customersDataList.filter(c => selectedCodes.includes(c.code));
    }

    if (dataToExport.length === 0) {
        Swal.fire('تنبيه', 'لا توجد بيانات لتصديرها', 'warning');
        return;
    }

    const exportData = dataToExport.map(c => ({
        "كود العميل": c.code,
        "اسم الشركة": c.comp || '',
        "المدينة": c.city || '',
        "اسم المسؤول": getDisplayManager(c) || '',
        "رقم التواصل": getDisplayMobile(c) || '',
        "البريد الإلكتروني": getDisplayEmail(c) || '',
        "السجل الرئيسي": c.cr1 || c.cr || '',
        "تاريخ الانشاء": c.creationDate || c.date || '',
        "تصنيف العميل": c.classification || c.source || '',
        "الملاحظات": c.notesText || '',
        "حالة العميل": c.status || 'جديد',
        "المستخدم": c.owner || 'المستخدم' // تعديل الاسم في التصدير
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "العملاء");
    XLSX.writeFile(workbook, `Customers_Export_${getTodayFormatted()}.xlsx`);
}

// -- تغيير المستخدم للعملاء المحددين عبر دفعات الباتش --
async function changeBulkUser(selectedCodes) {
    const { value: newUser } = await Swal.fire({
        title: 'تغيير المستخدم',
        input: 'text',
        inputLabel: 'أدخل اسم المستخدم الجديد',
        inputPlaceholder: 'الاسم...',
        showCancelButton: true,
        confirmButtonText: 'حفظ',
        cancelButtonText: 'إلغاء'
    });

    if (newUser && newUser.trim() !== '') {
        try {
            const chunks = [];
            for (let i = 0; i < selectedCodes.length; i += 490) {
                chunks.push(selectedCodes.slice(i, i + 490));
            }

            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(code => {
                    const docRef = doc(db, "customers", code);
                    batch.update(docRef, { owner: newUser });
                });
                await batch.commit();
            }

            selectedCodes.forEach(code => {
                const cust = customersDataList.find(c => c.code === code);
                if (cust) {
                    const oldUser = cust.owner;
                    cust.owner = newUser;
                    addToActivityLog('المستخدم', oldUser, newUser, cust.comp, "تغيير جماعي");
                }
            });

            saveLocalBackup();
            renderCustomers(customersDataList);
            Swal.fire('نجاح', 'تم تغيير المستخدم بنجاح', 'success');
        } catch (e) {
            console.error("Error updating users: ", e);
            Swal.fire('خطأ', 'حدث خطأ أثناء تحديث المستخدم', 'error');
        }
    }
}

async function handleBulkAction(action) {
    const selectedCheckboxes = document.querySelectorAll('.select-check:checked');
    const selectedCodes = Array.from(selectedCheckboxes).map(cb => cb.getAttribute('data-code'));

    if (action === 'استيراد') {
        document.getElementById('excelUpload').click();
        return;
    }

    if (selectedCodes.length === 0 && (action === 'حذف' || action === 'تغيير المستخدم')) {
        if (typeof Swal !== 'undefined') Swal.fire('تنبيه', 'يرجى تحديد عميل واحد على الأقل لتنفيذ الإجراء', 'warning');
        return;
    }

    if (action === 'تصدير') {
        exportSelectedToExcel(selectedCodes);
    } else if (action === 'تغيير المستخدم') {
        changeBulkUser(selectedCodes);
    } else if (action === 'طباعة') {
        window.print();
    } else if (action === 'حذف') {
        const result = await Swal.fire({
            title: 'تأكيد الحذف الجماعي؟', 
            text: `هل أنت متأكد من حذف ${selectedCodes.length} عميل محدد؟`,
            icon: 'warning', 
            showCancelButton: true, 
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#94a3b8', 
            confirmButtonText: 'نعم، احذف', 
            cancelButtonText: 'إلغاء'
        });

        if (result.isConfirmed) {
            try {
                // تقسيم الحذف لدفعات (Chunks) لتفادي حدود الفايربيز
                const chunks = [];
                for(let i = 0; i < selectedCodes.length; i += 490) {
                    chunks.push(selectedCodes.slice(i, i + 490));
                }

                for (const chunk of chunks) {
                    const batch = writeBatch(db);
                    chunk.forEach(code => {
                        const docRef = doc(db, "customers", code);
                        batch.delete(docRef);
                    });
                    await batch.commit();
                }

                for (const code of selectedCodes) {
                    const cust = customersDataList.find(c => c.code === code);
                    if (cust) {
                        await addToActivityLog('إجراء', 'حذف عميل جماعي', '', cust.comp, cust.owner || "المستخدم");
                    }
                }

                customersDataList = customersDataList.filter(c => !selectedCodes.includes(c.code));
                saveLocalBackup();
                updateStats(customersDataList);
                renderCustomers(customersDataList);
                
                Swal.fire('تم الحذف!', 'تم حذف العملاء المحددين بنجاح.', 'success');
            } catch (e) {
                console.error("Error in bulk delete: ", e);
                Swal.fire('خطأ', 'حدث خطأ أثناء الحذف الجماعي بالسحابة', 'error');
            }
        }
    }
}

// -- معالجة استيراد الإكسيل --
async function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

            if (rows.length === 0) {
                Swal.fire('تنبيه', 'الملف فارغ!', 'warning');
                return;
            }

            Swal.fire({ title: 'جاري الاستيراد...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});

            let nextNum = 1;
            if (customersDataList.length > 0) {
                const codes = customersDataList.map(c => {
                    const match = (c.code || '').match(/\d+/);
                    return match ? parseInt(match[0], 10) : 0;
                });
                nextNum = Math.max(...codes) + 1;
            }

            const newImportedData = [];
            const currentDate = getTodayFormatted();
            const currentTime = getTimeFormatted();

            rows.forEach(row => {
                let currentCode = row['كود العميل'] || ('CUST-' + String(nextNum++).padStart(5, '0'));
                let noteText = String(row['الملاحظات'] || "").trim();
                let notesHistoryArr = [];
                
                // دمج كود معالجة الملاحظات 
                if (noteText) {
                    notesHistoryArr.push({
                        user: "استيراد إكسيل",
                        date: currentDate,
                        time: currentTime,
                        text: noteText
                    });
                }

                let newCust = {
                    code: currentCode,
                    comp: row['اسم الشركة'] || '',
                    city: row['المدينة'] || '',
                    address: row['العنوان'] || '',
                    mgr: row['اسم المسؤول'] || '',
                    mob: row['رقم التواصل'] || '',
                    email: row['البريد الإلكتروني'] || '',
                    cr1: row['السجل الرئيسي'] || '',
                    cr2: row['السجل الفرعي'] || '',
                    date: row['تاريخ الانشاء'] || currentDate,
                    creationDate: row['تاريخ الانشاء'] || currentDate,
                    classification: row['تصنيف العميل'] || 'صغير',
                    status: row['حالة العميل'] || 'جديد',
                    owner: row['المستخدم'] || row['المالك'] || 'مستخدم النظام', // قراءة كلا العمودين للمرونة
                    notesText: noteText,
                    notesHistory: notesHistoryArr,
                    orders: [], visits: [], opportunities: [], sales: [], attachments: [], managers: []
                };

                newImportedData.push(newCust);
            });

            // تقسيم الرفع لسحابة الفايربيز إلى دفعات Batches
            const chunks = [];
            for (let i = 0; i < newImportedData.length; i += 490) {
                chunks.push(newImportedData.slice(i, i + 490));
            }

            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(cust => {
                    const docRef = doc(db, "customers", cust.code);
                    batch.set(docRef, cust);
                });
                await batch.commit();
            }

            customersDataList = [...newImportedData, ...customersDataList];
            saveLocalBackup();
            updateStats(customersDataList);
            renderCustomers(customersDataList);
            
            await addToActivityLog('إجراء', `استيراد ${newImportedData.length} عميل`, '', 'العملاء', 'استيراد إكسيل');

            Swal.fire('نجاح', `تم استيراد ${newImportedData.length} عميل بنجاح`, 'success');
            event.target.value = ''; // تصفير الحقل لاختيار ملف آخر لاحقاً
        } catch (error) {
            console.error("Import Error: ", error);
            Swal.fire('خطأ', 'حدث مشكلة أثناء قراءة الملف أو الرفع', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.bulk-action-wrapper')) {
        document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
    }
});

// ==========================================
// تصدير الدوال للنافذة العامة (window) للاستدعاء من HTML
// ==========================================
window.deleteNote = deleteNote;
window.openAddCustomerModal = openAddCustomerModal;
window.closeAddCustomerModal = closeAddCustomerModal;
window.saveNewCustomer = saveNewCustomer;
window.openNote = openNote;
window.closeNote = closeNote;
window.saveNote = saveNote;
window.debouncedFilterTable = debouncedFilterTable;
window.toggleLogExpansion = toggleLogExpansion;
window.toggleDropdown = toggleDropdown;
window.toggleAllCheckboxes = toggleAllCheckboxes;
window.handleBulkAction = handleBulkAction;
window.handleExcelUpload = handleExcelUpload;

// ==========================================
// تهيئة التطبيق عند التحميل
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initDomReferences();
    loadSavedData();
});