import { db } from "./firebase-config.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// التخزين المحلي للفرص
const OPP_LOCAL_KEY = 'asgate_opportunities_cache';

// =========================================
// 1. دالة توسيع وتقليص سجل النشاطات
// =========================================
export function toggleLogExpansion() {
    const logSection = document.getElementById('activityLogSection');
    const toggleBtn = document.getElementById('toggleExpandBtn');
    if (!logSection) return;

    logSection.classList.toggle('expanded');
    
    if (toggleBtn) {
        const icon = toggleBtn.querySelector('i');
        if (icon) {
            if (logSection.classList.contains('expanded')) {
                icon.className = 'fas fa-compress-alt';
            } else {
                icon.className = 'fas fa-expand-alt';
            }
        }
    }
}

// =========================================
// 2. ربط جميع دوال الأحداث بالكائن العام window
// =========================================
window.toggleLogExpansion = toggleLogExpansion;

// ربط المساعدات والاستدعاءات الخاصة بالتفاعل مع الواجهة
window.toggleSubTable = typeof toggleSubTable !== 'undefined' ? toggleSubTable : function(rowId) {
    const subRow = document.getElementById('sub-' + rowId);
    if (!subRow) return;
    const isHidden = subRow.style.display === 'none' || subRow.style.display === '';
    subRow.style.display = isHidden ? 'table-row' : 'none';
    const arrow = document.querySelector(`#${rowId} .toggle-arrow i`);
    if (arrow) arrow.className = isHidden ? 'fas fa-caret-down' : 'fas fa-caret-left';
};

window.openWhatsAppChat = typeof openWhatsAppChat !== 'undefined' ? openWhatsAppChat : function(btnElement) {
    const cell = btnElement.closest('td');
    const input = cell ? cell.querySelector('input') : null;
    if (input && input.value) {
        const cleanNumber = input.value.replace(/[^0-9]/g, '');
        window.open(`https://wa.me/${cleanNumber}`, '_blank');
    }
};

// =========================================
// 3. الاستماع للتغييرات في قاعدة البيانات - مصحح
// =========================================
function listenToOpportunities() {
    // ✅ إصلاح المشكلة الأساسية: التحقق من db قبل الاستخدام
    if (!db) {
        console.error("❌ Firestore db غير مهيأ! تأكد من firebase-config.js يصدر db بشكل صحيح.");
        loadFromLocalCacheOnly();
        return;
    }

    try {
        const oppsRef = collection(db, "opportunities");
        console.log("✅ يتم الاستماع إلى مجموعة opportunities...");

        onSnapshot(oppsRef, (snapshot) => {
            const tbody = document.getElementById('tableBody');
            if (!tbody) return;

            let openSubTables = [];
            document.querySelectorAll('.sub-table-row').forEach(row => {
                if (row.style.display === 'table-row') openSubTables.push(row.id);
            });

            let activeId = null;
            let activeClass = null;
            let activeTag = null;
            let activeIndex = 0;
            let selectionStart = 0;
            
            if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
                const tr = document.activeElement.closest('tr');
                if (tr) {
                    activeId = tr.id;
                    activeClass = document.activeElement.className;
                    activeTag = document.activeElement.tagName;
                    const elements = tr.querySelectorAll(`${activeTag}[class="${activeClass}"]`);
                    elements.forEach((el, index) => {
                        if (el === document.activeElement) activeIndex = index;
                    });
                    try { selectionStart = document.activeElement.selectionStart; } catch(e){}
                }
            }

            tbody.innerHTML = '';
            
            const fragment = document.createDocumentFragment();

            if (!snapshot.empty) {
                snapshot.forEach((docSnapshot) => {
                    const data = docSnapshot.data();
                    data.id = docSnapshot.id;
                    renderRow(data, false, fragment);
                    saveRowLocally(data.id, data); 
                });
            } else {
                console.log("⚠️ لا توجد بيانات في Firestore، يتم التحميل من التخزين المحلي");
                try {
                    const localCache = JSON.parse(localStorage.getItem(OPP_LOCAL_KEY) || '{}');
                    const localIds = Object.keys(localCache);
                    if (localIds.length > 0) {
                        localIds.forEach(id => { renderRow(localCache[id], false, fragment); });
                    }
                } catch(e) { console.error("خطأ في قراءة التخزين المحلي:", e); }
            }
            
            tbody.appendChild(fragment);

            if (typeof reorderRows === 'function') reorderRows();
            if (typeof updateStats === 'function') updateStats();

            openSubTables.forEach(id => {
                const sub = document.getElementById(id);
                if (sub) {
                    sub.style.display = 'table-row';
                    const mainId = id.replace('sub-', '');
                    const arrows = document.querySelectorAll(`#${mainId} .toggle-arrow i`);
                    arrows.forEach(arrow => arrow.className = 'fas fa-caret-down'); 
                }
            });

            if (activeId && activeClass && activeTag) {
                const activeRow = document.getElementById(activeId);
                if (activeRow) {
                    const elements = activeRow.querySelectorAll(`${activeTag}[class="${activeClass}"]`);
                    const elToFocus = elements[activeIndex] || elements[0];
                    if (elToFocus) {
                        elToFocus.focus();
                        try { elToFocus.setSelectionRange(selectionStart, selectionStart); } catch(e){}
                    }
                }
            }
        }, (error) => {
            // ✅ معالجة أخطاء onSnapshot
            console.error("❌ خطأ في onSnapshot:", error);
            loadFromLocalCacheOnly();
        });

    } catch (err) {
        console.error("❌ خطأ في collection(db, 'opportunities'):", err);
        console.error("تأكد أنك تستخدم نفس نسخة Firebase في كل الملفات (10.8.0)");
        loadFromLocalCacheOnly();
    }
}

function loadFromLocalCacheOnly() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    try {
        const fragment = document.createDocumentFragment();
        const localCache = JSON.parse(localStorage.getItem(OPP_LOCAL_KEY) || '{}');
        const localIds = Object.keys(localCache);
        if (localIds.length > 0) {
            localIds.forEach(id => { renderRow(localCache[id], false, fragment); });
            tbody.innerHTML = '';
            tbody.appendChild(fragment);
            if (typeof reorderRows === 'function') reorderRows();
            if (typeof updateStats === 'function') updateStats();
        }
    } catch(e) { console.error("خطأ في قراءة التخزين المحلي:", e); }
}

function saveRowLocally(id, data) {
    try {
        const cache = JSON.parse(localStorage.getItem(OPP_LOCAL_KEY) || '{}');
        cache[id] = data;
        localStorage.setItem(OPP_LOCAL_KEY, JSON.stringify(cache));
    } catch(e) {}
}

function getTodayFormatted() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function formatDateToDisplay(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
}

// =========================================
// 4. رسم الصفوف في الجدول - محفوظ بالكامل
// =========================================
function renderRow(v = {}, prepend = false, container = null) {
    const targetContainer = container || document.getElementById('tableBody');
    if (!targetContainer) return;
    
    const rowId = v.id || ('row-' + Date.now() + Math.random().toString(36).substr(2, 5));
    const mainRow = document.createElement('tr');
    mainRow.className = 'main-row';
    mainRow.id = rowId;
    
    const subRow = document.createElement('tr');
    subRow.className = 'sub-table-row';
    subRow.id = 'sub-' + rowId;
    subRow.style.display = 'none';
    const today = getTodayFormatted();
    
    const oppDate = v.oppDate || v.visitDate || today; 
    const notesJson = v.notes || "[]";
    const lastNoteText = typeof getLastNoteOnlyFromJSON === 'function' ? getLastNoteOnlyFromJSON(notesJson) : '';

    mainRow.innerHTML = `
        <td class="col-select">
            <input type="checkbox" class="select-check">
            <span class="toggle-arrow" onclick="toggleSubTable('${rowId}')"><i class="fas fa-caret-left"></i></span>
        </td>
        <td><input type="text" class="excel-input" value="${v.comp || ''}" data-old="${v.comp || ''}" onfocus="this.dataset.old=this.value" onkeyup="if(typeof updateEditDateField==='function')updateEditDateField(this.closest('tr')); if(typeof debouncedSaveSingleRow==='function')debouncedSaveSingleRow('${rowId}');" onblur="if(typeof addToActivityLog==='function')addToActivityLog('الشركة', this.dataset.old, this.value, this.value, this.closest('tr').cells[13].querySelector('input').value); this.dataset.old=this.value;" onmouseenter="if(typeof showStatusTooltip==='function')showStatusTooltip(this)" onmouseleave="if(typeof hideStatusTooltip==='function')hideStatusTooltip()"></td>
        <td><input type="text" class="excel-input" value="${v.address || ''}" data-old="${v.address || ''}" onfocus="this.dataset.old=this.value" onkeyup="if(typeof updateEditDateField==='function')updateEditDateField(this.closest('tr')); if(typeof debouncedSaveSingleRow==='function')debouncedSaveSingleRow('${rowId}');" onblur="if(typeof addToActivityLog==='function')addToActivityLog('العنوان', this.dataset.old, this.value, this.closest('tr').cells[1].querySelector('input').value, this.closest('tr').cells[13].querySelector('input').value); this.dataset.old=this.value;"></td>
        <td><input type="text" class="excel-input" value="${v.mgr || ''}" data-old="${v.mgr || ''}" onfocus="this.dataset.old=this.value" onkeyup="if(typeof updateEditDateField==='function')updateEditDateField(this.closest('tr')); if(typeof debouncedSaveSingleRow==='function')debouncedSaveSingleRow('${rowId}');" onblur="if(typeof addToActivityLog==='function')addToActivityLog('المسؤول', this.dataset.old, this.value, this.closest('tr').cells[1].querySelector('input').value, this.closest('tr').cells[13].querySelector('input').value); this.dataset.old=this.value;"></td>
        <td>
            <div class="phone-cell-container">
                <a class="whatsapp-icon-btn" onclick="openWhatsAppChat(this)" title="مراسلة عبر واتساب"><i class="fa-brands fa-whatsapp"></i></a>
                <input type="text" class="excel-input" value="${v.mob || ''}" data-old="${v.mob || ''}" oninput="this.value = this.value.replace(/[^0-9]/g, ''); if(typeof debouncedSaveSingleRow==='function')debouncedSaveSingleRow('${rowId}');" onfocus="this.dataset.old=this.value" onkeyup="if(typeof updateEditDateField==='function')updateEditDateField(this.closest('tr'));" onblur="if(typeof addToActivityLog==='function')addToActivityLog('رقم التواصل', this.dataset.old, this.value, this.closest('tr').cells[1].querySelector('input').value, this.closest('tr').cells[13].querySelector('input').value); this.dataset.old=this.value;">
            </div>
        </td>
        <td><input type="text" class="excel-input" value="${v.email || ''}" data-old="${v.email || ''}" onfocus="this.dataset.old=this.value" onkeyup="if(typeof updateEditDateField==='function')updateEditDateField(this.closest('tr')); if(typeof debouncedSaveSingleRow==='function')debouncedSaveSingleRow('${rowId}');" onblur="if(typeof addToActivityLog==='function')addToActivityLog('البريد الإلكتروني', this.dataset.old, this.value, this.closest('tr').cells[1].querySelector('input').value, this.closest('tr').cells[13].querySelector('input').value); this.dataset.old=this.value;"></td>
        <td><input type="text" class="excel-input" value="${v.record || ''}" data-old="${v.record || ''}" oninput="this.value = this.value.replace(/[^0-9]/g, ''); if(typeof debouncedSaveSingleRow==='function')debouncedSaveSingleRow('${rowId}');" onfocus="this.dataset.old=this.value" onkeyup="if(typeof updateEditDateField==='function')updateEditDateField(this.closest('tr'));" onblur="if(typeof addToActivityLog==='function')addToActivityLog('السجل الرئيسي', this.dataset.old, this.value, this.closest('tr').cells[1].querySelector('input').value, this.closest('tr').cells[13].querySelector('input').value); this.dataset.old=this.value;"></td>
        <td>
            <input type="text" class="excel-input readonly-input" value="${formatDateToDisplay(oppDate)}" style="color:var(--text-muted); font-weight:700;" readonly>
            <input type="hidden" class="opp-date-val" value="${oppDate}">
        </td>
        <td><input type="text" class="excel-input cur-serv-val" value="${v.curServ || ''}" data-old="${v.curServ || ''}" onfocus="this.dataset.old=this.value" onkeyup="if(typeof updateEditDateField==='function')updateEditDateField(this.closest('tr')); if(typeof debouncedSaveSingleRow==='function')debouncedSaveSingleRow('${rowId}');" onblur="if(typeof addToActivityLog==='function')addToActivityLog('الخدمة', this.dataset.old, this.value, this.closest('tr').cells[1].querySelector('input').value, this.closest('tr').cells[13].querySelector('input').value); this.dataset.old=this.value;" onmouseenter="if(typeof showStatusTooltip==='function')showStatusTooltip(this)" onmouseleave="if(typeof hideStatusTooltip==='function')hideStatusTooltip()"></td>
        <td><input type="number" class="excel-input opp-value-input readonly-input" value="${v.oppValue || ''}" readonly style="color:var(--accent-blue); font-weight:800; cursor:not-allowed; background: transparent;"></td>
        <td><div class="notes-preview" onclick="if(typeof openNote==='function')openNote(this)" data-full-notes='${notesJson.replace(/'/g, "&apos;")}' id="preview-${Date.now()}">${lastNoteText}</div></td>
        <td>
            <select class="excel-input status-select" data-old="${v.status || ''}" onfocus="this.dataset.old=this.value" onchange="if(typeof handleStatusChange==='function')handleStatusChange(this, '${rowId}')">
                <option value="" disabled ${!v.status ? 'selected' : ''}>اختر...</option>
                <option value="مهتم" ${v.status === 'مهتم' ? 'selected' : ''}>مهتم</option>
                <option value="رابح" ${v.status === 'رابح' ? 'selected' : ''}>رابح</option>
                <option value="فقدان" ${v.status === 'فقدان' ? 'selected' : ''}>فقدان</option>
            </select>
        </td>
        <td>
            <input type="text" class="excel-input exp-date-input-display readonly-input" value="${formatDateToDisplay(v.expDate || '')}" readonly style="cursor:pointer;" onclick="if(typeof openCustomDatePicker==='function')openCustomDatePicker(event, this, '${rowId}')" placeholder="اختر التاريخ">
            <input type="hidden" class="exp-date-input" value="${v.expDate || ''}" data-old="${v.expDate || ''}">
            <input type="hidden" class="edit-date-val" value="${v.editDate || ''}">
        </td>
        <td><input type="text" class="excel-input" value="${v.owner || ''}" data-old="${v.owner || ''}" onfocus="this.dataset.old=this.value" onkeyup="if(typeof updateEditDateField==='function')updateEditDateField(this.closest('tr')); if(typeof debouncedSaveSingleRow==='function')debouncedSaveSingleRow('${rowId}');" onblur="if(typeof addToActivityLog==='function')addToActivityLog('المالك', this.dataset.old, this.value, this.closest('tr').cells[1].querySelector('input').value, this.value); this.dataset.old=this.value;"></td>
    `;

    subRow.innerHTML = `
        <td colspan="14" style="padding:15px 10px; background:#f8fafc; box-shadow: inset 0 2px 4px rgba(0,0,0,.02);">
            <div style="display: flex; gap: 15px; align-items: stretch;">
                <div class="sub-table-container" style="flex: 0 0 50%; padding: 0;">
                    <table class="inner-table" style="width: 100%;">
                        <thead>
                            <tr>
                                <th>المنتج</th><th>التفاصيل</th><th>العدد</th><th>الاشتراك</th><th>الإجمالي</th>
                                <th style="width:75px"><button class="header-plus-btn" onclick="if(typeof addProductRow==='function')addProductRow('${rowId}')" title="إضافة منتج"><i class="fas fa-plus"></i></button></th>
                            </tr>
                        </thead>
                        <tbody class="product-body"></tbody>
                    </table>
                </div>
                <div style="width: 250px; background: white; border: 1px solid var(--border-soft); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; justify-content: center; align-items: center; box-shadow: 0 4px 6px rgba(0,0,0,.05);">
                    <div style="font-weight:bold; color:#2e1065; margin-bottom:10px; font-size:12px;">تفاصيل التعديل والوقت:</div>
                    <div class="edit-date-container-sub" style="display:flex; flex-direction:column; align-items:center;">${typeof parseEditDateHTML === 'function' ? parseEditDateHTML(v.editDate || '') : ''}</div>
                </div>
            </div>
        </td>
    `;

    if (prepend && targetContainer.tagName === 'TBODY') {
        targetContainer.insertBefore(subRow, targetContainer.firstChild);
        targetContainer.insertBefore(mainRow, subRow);
    } else {
        targetContainer.appendChild(mainRow); 
        targetContainer.appendChild(subRow); 
    }
    
    if (typeof applyStatusColor === 'function') applyStatusColor(mainRow.querySelector('.status-select'));
    if (v.products && v.products.length > 0) {
        v.products.forEach(p => { if (typeof addProductRow === 'function') addProductRow(rowId, p); });
    } else {
        if (typeof addProductRow === 'function') addProductRow(rowId);
    }
    if (typeof calculateMainVisitValue === 'function') calculateMainVisitValue(rowId, false);
}

// بدء التشغيل
document.addEventListener('DOMContentLoaded', () => {
    listenToOpportunities();
});
