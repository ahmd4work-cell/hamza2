// =========================================================================
// opportunities_2.js - إدارة الفرص البيعية سحابياً (نظيف ومنظم)
// الربط: firebase-config.js + navbar_2.js 
// الوظائف والشكل محفوظة 100% - تم إزالة تكرار الوضع الليلي والبحث العام
// الشريط العلوي الموحد (navbar) يتعامل مع البحث والوضع الليلي بشكل مستقل
// =========================================================================

import { db } from './firebase-config.js';
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// 1. المتغيرات العامة
let opportunitiesData = [];
let selectedRowId = null;
let currentUser = localStorage.getItem('crm_userName') || 'مستخدم غير معروف';

const statusClasses = {
    'تأهيل لفرصة': 'status-yellow-fff',
    'مميزة': 'status-green',
    'مهتم': 'status-green',
    'متابعة': 'status-yellow',
    'عرض سعر': 'status-yellow-ffc',
    'زيارة': 'status-gray-a5',
    'اتصال': 'status-gray-a5',
    'غير مهتم': 'status-red',
    'فقدان': 'status-red-c00'
};

// 2. تحميل البيانات الأولية
async function loadData() {
    try {
        const querySnapshot = await getDocs(collection(db, "opportunities"));
        opportunitiesData = [];
        querySnapshot.forEach((doc) => {
            opportunitiesData.push({ id: doc.id, ...doc.data() });
        });
        populateOwnerFilter();
        renderTable();
        updateStats();
    } catch (error) {
        console.error("خطأ في جلب بيانات الفرص: ", error);
        Swal.fire('خطأ', 'تعذر تحميل بيانات الفرص البيعية من الخادم', 'error');
    }
}

// 3. عرض وبناء الجدول الرئيسي
function renderTable() {
    const tbody = document.getElementById('tableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    const searchQuery = document.getElementById('searchInput')?.value.toLowerCase() || '';
    
    // استخراج الفلاتر المحددة (الحالة والمستخدم)
    const selectedStatuses = Array.from(document.querySelectorAll('#statusFilterMenu input:checked')).map(cb => cb.value);
    const selectedOwners = Array.from(document.querySelectorAll('#ownerFilterMenu input:checked')).map(cb => cb.value);

    const filteredData = opportunitiesData.filter(item => {
        const matchesSearch = Object.values(item).some(val => String(val).toLowerCase().includes(searchQuery));
        const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(item.status);
        const matchesOwner = selectedOwners.length === 0 || selectedOwners.includes(item.owner);
        return matchesSearch && matchesStatus && matchesOwner;
    });

    filteredData.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'main-row';
        
        // تصغير الصف عند الفقدان
        if(['فقدان'].includes(item.status)) tr.classList.add('closed-row');
        
        const statusClass = statusClasses[item.status] || '';

        tr.innerHTML = `
            <td><input type="checkbox" class="select-check" value="${item.id}"></td>
            <td><input type="text" class="excel-input" value="${item.company || ''}" onchange="updateRowData('${item.id}', 'company', this.value)"></td>
            <td><input type="text" class="excel-input" value="${item.address || ''}" onchange="updateRowData('${item.id}', 'address', this.value)"></td>
            <td><input type="text" class="excel-input" value="${item.manager || ''}" onchange="updateRowData('${item.id}', 'manager', this.value)"></td>
            <td class="phone-cell-container">
                <input type="text" class="excel-input" value="${item.mobile || ''}" onchange="updateRowData('${item.id}', 'mobile', this.value)" style="width:70%">
                <a href="https://wa.me/${item.mobile}" target="_blank" class="whatsapp-icon-btn" title="تواصل عبر الواتساب"><i class="fab fa-whatsapp"></i></a>
            </td>
            <td><input type="text" class="excel-input" value="${item.email || ''}" onchange="updateRowData('${item.id}', 'email', this.value)"></td>
            <td><input type="text" class="excel-input" value="${item.record || ''}" onchange="updateRowData('${item.id}', 'record', this.value)"></td>
            <td><div class="edit-date-container"><span class="edit-date-d">${item.date || ''}</span></div></td>
            <td><input type="text" class="excel-input" value="${item.service || ''}" onchange="updateRowData('${item.id}', 'service', this.value)"></td>
            <td><input type="number" class="excel-input" value="${item.value || ''}" onchange="updateRowData('${item.id}', 'value', this.value)"></td>
            <td><div class="notes-preview" onclick="openNoteModal('${item.id}')" title="عرض أو إضافة ملاحظات">${item.lastNote || 'إضافة ملاحظة'}</div></td>
            <td>
                <select class="excel-input ${statusClass}" onchange="updateStatus('${item.id}', this.value, this)">
                    ${Object.keys(statusClasses).map(st => `<option value="${st}" ${item.status === st ? 'selected' : ''}>${st}</option>`).join('')}
                </select>
            </td>
            <td onclick="openDatePicker('${item.id}', 'expectedDate')" style="cursor:pointer;">
                <div class="edit-date-container"><span class="edit-date-d ${getDateWarningClass(item.expectedDate)}">${item.expectedDate || 'تحديد التاريخ'}</span></div>
            </td>
            <td><input type="text" class="excel-input readonly-input" value="${item.owner || ''}" readonly></td>
        `;
        tbody.appendChild(tr);
    });
}

// 4. تعبئة قائمة فلتر المالك (المستخدمين) بشكل ديناميكي
function populateOwnerFilter() {
    const container = document.getElementById('ownerFilterItemsContainer');
    if(!container) return;
    const owners = [...new Set(opportunitiesData.map(item => item.owner).filter(Boolean))];
    container.innerHTML = '';
    owners.forEach(owner => {
        container.innerHTML += `
            <label class="multi-select-item">
                <input type="checkbox" value="${owner}" onchange="updateFilters()"> 
                <span class="custom-cb"><i class="fas fa-check"></i></span> ${owner}
            </label>
        `;
    });
}

// 5. دوال الفلاتر والقوائم المنسدلة المرتبطة بواجهة المستخدم
window.toggleCustomFilter = function(e, menuId) {
    e.stopPropagation();
    const menu = document.getElementById(menuId);
    document.querySelectorAll('.multi-select-menu').forEach(m => { if(m.id !== menuId) m.classList.remove('show'); });
    menu.classList.toggle('show');
    e.currentTarget.parentElement.classList.toggle('active');
};

window.selectAllFilter = function(menuId) {
    document.querySelectorAll(`#${menuId} input[type="checkbox"]`).forEach(cb => cb.checked = true);
    updateFilters();
};

window.clearAllFilter = function(menuId) {
    document.querySelectorAll(`#${menuId} input[type="checkbox"]`).forEach(cb => cb.checked = false);
    updateFilters();
};

window.updateFilters = function() {
    renderTable();
    
    // إظهار وإخفاء النقاط الحمراء للفلاتر النشطة
    const statusChecked = document.querySelectorAll('#statusFilterMenu input:checked').length;
    const ownerChecked = document.querySelectorAll('#ownerFilterMenu input:checked').length;
    
    const statusDot = document.getElementById('statusFilterDot');
    const ownerDot = document.getElementById('ownerFilterDot');
    
    if(statusDot) statusDot.style.display = statusChecked > 0 ? 'block' : 'none';
    if(ownerDot) ownerDot.style.display = ownerChecked > 0 ? 'block' : 'none';
};

window.debouncedFilterTable = function() {
    // يمكن إضافة setTimeout للتأخير إذا لزم الأمر
    renderTable();
};

// إغلاق القوائم المنسدلة عند النقر خارجها
document.addEventListener('click', () => {
    document.querySelectorAll('.multi-select-menu').forEach(m => m.classList.remove('show'));
    document.querySelectorAll('.custom-filter-wrapper').forEach(w => w.classList.remove('active'));
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
});

// 6. تحديث إحصائيات الشريط العلوي
function updateStats() {
    const total = opportunitiesData.length;
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const todayStr = new Date().toISOString().split('T')[0];

    let monthCount = 0, todayCount = 0;
    let totalValue = 0, monthValue = 0;

    opportunitiesData.forEach(item => {
        // حساب الإحصائيات للفرص الإيجابية فقط كما موضح (مهتم/مميزة/تأهيل)
        if(['مهتم', 'مميزة', 'تأهيل لفرصة'].includes(item.status)) {
            const itemVal = parseFloat(item.value) || 0;
            totalValue += itemVal;

            if (item.date) {
                const itemDate = new Date(item.date);
                if (itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear) {
                    monthCount++;
                    monthValue += itemVal;
                }
                if (item.date.startsWith(todayStr)) todayCount++;
            }
        }
    });

    if(document.getElementById('stat-total')) document.getElementById('stat-total').innerText = total;
    if(document.getElementById('stat-month')) document.getElementById('stat-month').innerText = monthCount;
    if(document.getElementById('stat-today')) document.getElementById('stat-today').innerText = todayCount;
    if(document.getElementById('stat-value-total')) document.getElementById('stat-value-total').innerText = totalValue.toLocaleString();
    if(document.getElementById('stat-value-month')) document.getElementById('stat-value-month').innerText = monthValue.toLocaleString();
}

// 7. تحديث البيانات السحابية (Firebase)
window.updateRowData = async function(id, field, value) {
    try {
        const docRef = doc(db, "opportunities", id);
        await updateDoc(docRef, { [field]: value });
        
        const item = opportunitiesData.find(i => i.id === id);
        if(item) {
            const oldValue = item[field];
            item[field] = value;
            if(field === 'value' || field === 'status') updateStats();
            addLogEntry(`قام بتعديل ${getArabicFieldName(field)} من "${oldValue || '-'}" إلى "${value}"`, item.company);
        }
    } catch (error) {
        console.error("خطأ في التحديث: ", error);
    }
};

window.updateStatus = async function(id, status, selectElem) {
    try {
        const docRef = doc(db, "opportunities", id);
        await updateDoc(docRef, { status: status });
        
        const item = opportunitiesData.find(i => i.id === id);
        if(item) {
            addLogEntry(`قام بتغيير حالة الفرصة إلى "${status}"`, item.company);
            item.status = status;
        }
        
        // تحديث تنسيق الـ select الخلوي
        selectElem.className = 'excel-input';
        if(statusClasses[status]) {
            selectElem.classList.add(statusClasses[status]);
        }
        updateStats();
    } catch(error) {
        console.error("خطأ أثناء تحديث الحالة: ", error);
    }
};

function getArabicFieldName(field) {
    const names = { company: "الشركة", address: "العنوان", manager: "المسؤول", mobile: "الجوال", email: "الإيميل", record: "السجل", service: "الخدمة", value: "القيمة" };
    return names[field] || field;
}

// 8. نظام الملاحظات (Modal)
window.openNoteModal = function(id) {
    selectedRowId = id;
    const modal = document.getElementById('noteModal');
    modal.classList.add('active');
    document.getElementById('modalTextArea').value = '';
    loadNotes(id);
};

window.closeNote = function() {
    document.getElementById('noteModal').classList.remove('active');
    selectedRowId = null;
};

async function loadNotes(opportunityId) {
    const historyLog = document.getElementById('historyLog');
    historyLog.innerHTML = '<div style="text-align:center; padding:10px;"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
    try {
        const notesRef = collection(db, "opportunities", opportunityId, "notes");
        const q = query(notesRef, orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);
        historyLog.innerHTML = '';
        
        if(snapshot.empty) {
            historyLog.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:11px;">لا توجد ملاحظات سابقة.</div>';
            return;
        }
        snapshot.forEach(docSnap => {
            const note = docSnap.data();
            const date = note.timestamp ? new Date(note.timestamp.toDate()).toLocaleString('ar-EG') : 'غير محدد';
            historyLog.innerHTML += `
                <div class="note-item">
                    <div class="note-header">
                        <span class="note-user"><i class="fas fa-user-circle"></i> ${note.user}</span>
                        <span class="note-meta">${date}</span>
                    </div>
                    <div class="note-body">${note.text}</div>
                </div>
            `;
        });
    } catch(e) {
        historyLog.innerHTML = '<div style="color:red; font-size:11px;">حدث خطأ في تحميل الملاحظات.</div>';
    }
}

window.saveNote = async function() {
    const text = document.getElementById('modalTextArea').value.trim();
    if(!text || !selectedRowId) return;
    
    try {
        const notesRef = collection(db, "opportunities", selectedRowId, "notes");
        await addDoc(notesRef, {
            text: text,
            user: currentUser,
            timestamp: serverTimestamp()
        });
        
        // تحديث الملاحظة الأخيرة في الجدول الرئيسي
        const docRef = doc(db, "opportunities", selectedRowId);
        await updateDoc(docRef, { lastNote: text });
        
        const item = opportunitiesData.find(i => i.id === selectedRowId);
        if(item) {
            item.lastNote = text;
            addLogEntry(`أضاف ملاحظة جديدة`, item.company);
        }
        
        renderTable();
        closeNote();
        Swal.fire({ icon: 'success', title: 'تم', text: 'تم حفظ الملاحظة بنجاح', timer: 1500, showConfirmButton: false });
    } catch(e) {
        Swal.fire('خطأ', 'لم يتم حفظ الملاحظة بسبب خطأ في الخادم', 'error');
    }
};

// 9. سجل نشاط الفرص البيعية (Activity Log)
window.toggleLogExpansion = function() {
    const section = document.getElementById('activityLogSection');
    const icon = document.querySelector('#toggleExpandBtn i');
    section.classList.toggle('expanded');
    if(section.classList.contains('expanded')) {
        icon.classList.replace('fa-expand-alt', 'fa-compress-alt');
    } else {
        icon.classList.replace('fa-compress-alt', 'fa-expand-alt');
    }
};

function addLogEntry(action, company) {
    const list = document.getElementById('activityList');
    if(!list) return;
    const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute:'2-digit' });
    const date = new Date().toLocaleDateString('ar-EG');
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
        <div class="log-header-info">
            <span><i class="far fa-clock"></i> ${time}</span>
            <span class="log-sep">|</span>
            <span>${date}</span>
        </div>
        <div class="log-action">
            <span class="user-highlight">${currentUser}</span> 
            ${action} 
            للشركة <span class="company-highlight">${company || 'غير محدد'}</span>
        </div>
    `;
    list.prepend(entry);
}

// 10. تقويم التواريخ (Custom DatePicker)
let currentDatePickerTarget = null;
let currentDateField = null;
let calCurrentDate = new Date();

window.openDatePicker = function(id, field) {
    currentDatePickerTarget = id;
    currentDateField = field;
    const overlay = document.getElementById('calendarOverlay');
    overlay.classList.add('active');
    renderCalendar(new Date());
};

document.getElementById('calCancelBtn')?.addEventListener('click', () => {
    document.getElementById('calendarOverlay').classList.remove('active');
});

document.getElementById('calClearBtn')?.addEventListener('click', async () => {
    if(currentDatePickerTarget && currentDateField) {
        await updateRowData(currentDatePickerTarget, currentDateField, '');
        renderTable();
    }
    document.getElementById('calendarOverlay').classList.remove('active');
});

document.getElementById('calNextBtn')?.addEventListener('click', () => {
    document.getElementById('calendarOverlay').classList.remove('active');
});

function renderCalendar(date) {
    calCurrentDate = date;
    const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
    
    if(document.getElementById('calMonthDisplay')) document.getElementById('calMonthDisplay').innerText = monthNames[date.getMonth()];
    if(document.getElementById('calYearDisplay')) document.getElementById('calYearDisplay').innerText = date.getFullYear();
    
    const grid = document.getElementById('calDaysGrid');
    if(!grid) return;
    grid.innerHTML = '';
    
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    
    for(let i=0; i<firstDay; i++) {
        grid.innerHTML += `<span class="empty-day"></span>`;
    }
    for(let i=1; i<=daysInMonth; i++) {
        const isToday = new Date().getDate() === i && new Date().getMonth() === new Date().getMonth() && new Date().getFullYear() === new Date().getFullYear();
        grid.innerHTML += `<span class="day-number ${isToday ? 'today-day' : ''}" onclick="selectDate(${date.getFullYear()}, ${date.getMonth()}, ${i})">${i}</span>`;
    }
}

window.selectDate = async function(year, month, day) {
    const selectedDate = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    if(currentDatePickerTarget && currentDateField) {
        await updateRowData(currentDatePickerTarget, currentDateField, selectedDate);
        renderTable();
    }
    document.getElementById('calendarOverlay').classList.remove('active');
};

document.getElementById('prevMonthBtn')?.addEventListener('click', () => { calCurrentDate.setMonth(calCurrentDate.getMonth()-1); renderCalendar(calCurrentDate); });
document.getElementById('nextMonthBtn')?.addEventListener('click', () => { calCurrentDate.setMonth(calCurrentDate.getMonth()+1); renderCalendar(calCurrentDate); });
document.getElementById('prevYearBtn')?.addEventListener('click', () => { calCurrentDate.setFullYear(calCurrentDate.getFullYear()-1); renderCalendar(calCurrentDate); });
document.getElementById('nextYearBtn')?.addEventListener('click', () => { calCurrentDate.setFullYear(calCurrentDate.getFullYear()+1); renderCalendar(calCurrentDate); });

function getDateWarningClass(dateStr) {
    if(!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    
    if(date < today) return 'date-past';
    if(date.getTime() === today.getTime()) return 'date-today';
    
    const diff = (date - today) / (1000 * 60 * 60 * 24);
    if(diff <= 3) return 'date-warning';
    
    return '';
}

// 11. الإجراءات الجماعية والتحديد المتعدد (Bulk Actions)
window.toggleAllCheckboxes = function(source) {
    document.querySelectorAll('.select-check').forEach(cb => cb.checked = source.checked);
};

window.toggleDropdown = function(e, btn) {
    e.stopPropagation();
    const menu = btn.nextElementSibling;
    document.querySelectorAll('.dropdown-menu').forEach(m => { if(m !== menu) m.classList.remove('show'); });
    menu.classList.toggle('show');
};

window.handleBulkAction = async function(action) {
    const selected = Array.from(document.querySelectorAll('.select-check:checked')).map(cb => cb.value);
    if(selected.length === 0) {
        Swal.fire('تنبيه', 'الرجاء تحديد فرصة واحدة على الأقل', 'warning');
        return;
    }

    if(action === 'حذف') {
        const res = await Swal.fire({
            title: 'هل أنت متأكد؟',
            text: `سيتم حذف ${selected.length} فرصة نهائياً.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#cbd5e1',
            confirmButtonText: 'نعم، احذف',
            cancelButtonText: 'إلغاء'
        });
        
        if(res.isConfirmed) {
            Swal.fire({ title: 'جاري الحذف...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
            try {
                for(let id of selected) {
                    await deleteDoc(doc(db, "opportunities", id));
                }
                Swal.fire('تم', 'تم الحذف بنجاح', 'success');
                loadData();
            } catch(e) {
                Swal.fire('خطأ', 'حدث خطأ أثناء الحذف', 'error');
            }
        }
    } else {
        Swal.fire('معلومة', `إجراء "${action}" قيد التطوير في هذه النسخة`, 'info');
    }
};

// 12. تهيئة الأحداث عند التحميل
document.addEventListener('DOMContentLoaded', () => {
    loadData();
});