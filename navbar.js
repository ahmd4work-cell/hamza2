// ==========================================
// navbar.js - الشريط العلوي الموحد - نسخة ثابتة بدون رعشة
// الإصلاح الجذري: استخدام removeEventListener بدلاً من استنساخ العناصر
// ==========================================
import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


let globalSearchCache = null;
let isFetchingSearchData = false;
let searchTimeout;

const navbarStyles = `
#navbarPlaceholder {
    height: 60px; min-height: 60px;
    width: 100%; display: block;
    background: var(--crm-card, #fff);
    border-bottom: 1px solid var(--crm-border, #e2e8f0);
    position: sticky; top: 0; z-index: 1000;
}
.top-navbar {
    display: flex; align-items: center; justify-content: space-between;
    height: 100%; padding: 0 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.nav-brand {
    display: flex; align-items: center; gap: 8px;
    font-weight: 800; font-size: 16px; color: var(--crm-text, #0f172a);
}
.nav-brand-badge {
    background: var(--crm-accent, #10b981); color: #fff;
    font-size: 9px; padding: 2px 6px; border-radius: 6px;
}
.nav-links {
    display: flex; align-items: center; gap: 8px;
    list-style: none; margin: 0; padding: 0;
}
.nav-links a {
    text-decoration: none; color: var(--crm-text-muted, #475569);
    font-weight: 600; font-size: 13px;
    padding: 6px 12px; border-radius: 8px;
    transition: all 0.2s; display: flex; align-items: center; gap: 6px;
}
.nav-links a:hover { background: var(--crm-bg, #f8fafc); color: var(--crm-primary, #047857); }
.nav-links a.active { background: var(--crm-primary-gradient, #047857); color: #fff; box-shadow: 0 2px 4px rgba(4, 120, 87, 0.2); }
.nav-search-container {
    position: relative; width: 280px; margin-right: auto; margin-left: 20px;
}
#globalSearchInput {
    width: 100%; padding: 8px 32px 8px 12px; border-radius: 8px;
    border: 1px solid var(--crm-border, #e2e8f0);
    background: var(--crm-bg, #f8fafc); color: var(--crm-text);
    font-family: 'Cairo'; font-size: 12px; font-weight: 600;
    outline: none; transition: all 0.2s;
}
#globalSearchInput:focus { border-color: var(--crm-accent); background: var(--crm-card); box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1); }
.search-icon { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--crm-text-muted); font-size: 13px; }
.search-results-dropdown {
    position: absolute; top: calc(100% + 8px); right: 0; left: 0;
    background: var(--crm-card, #fff); border: 1px solid var(--crm-border);
    border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    max-height: 400px; overflow-y: auto; display: none; z-index: 1050;
}
.search-results-dropdown.show { display: block; }
.nav-actions { display: flex; align-items: center; gap: 12px; }
.nav-btn {
    background: var(--crm-bg); border: 1px solid var(--crm-border); color: var(--crm-text-muted);
    width: 36px; height: 36px; border-radius: 50%; cursor: pointer;
    display: flex; align-items: center; justify-content: center; font-size: 14px;
    transition: all 0.2s;
}
.nav-btn:hover { background: var(--crm-card); border-color: var(--crm-accent); color: var(--crm-primary); }
.avatar-btn {
    width: 36px; height: 36px; background: var(--crm-primary-gradient);
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 800; font-size: 14px;
}
`;

function injectNavbarStyles() {
    if (document.getElementById('unified-navbar-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'unified-navbar-styles';
    styleEl.textContent = navbarStyles;
    document.head.appendChild(styleEl);
}

function injectNavbarHTML() {
    const placeholder = document.getElementById('navbarPlaceholder');
    if (!placeholder || placeholder.querySelector('.top-navbar')) return;
    
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    placeholder.innerHTML = `
    <nav class="top-navbar">
        <div style="display:flex; align-items:center; gap:24px;">
            <div class="nav-brand">
                <i class="fas fa-layer-group text-primary"></i> ASGate <span class="nav-brand-badge">PRO</span>
            </div>
            <ul class="nav-links">
                <li><a href="./index.html" class="${currentPage==='index.html'||currentPage===''?'active':''}"><i class="fas fa-chart-pie"></i> الرئيسية</a></li>
                <li><a href="./visits.html" class="${currentPage==='visits.html'?'active':''}"><i class="fas fa-route"></i> الزيارات</a></li>
                <li><a href="./opportunities.html" class="${currentPage==='opportunities.html'?'active':''}"><i class="fas fa-bullseye"></i> الفرص</a></li>
                <li><a href="./customers.html" class="${currentPage==='customers.html'?'active':''}"><i class="fas fa-building"></i> العملاء</a></li>
                <li><a href="./sales.html" class="${currentPage==='sales.html'?'active':''}"><i class="fas fa-bag-shopping"></i> المبيعات</a></li>
                <li><a href="./reminders.html" id="nav-reminders"><i class="fas fa-bell"></i> التذكيرات</a></li>

            </ul>
        </div>
        <div style="display:flex; align-items:center;">
            <div class="nav-search-container">
                <i class="fas fa-search search-icon"></i>
                <input type="text" id="globalSearchInput" placeholder="ابحث عن عميل، فرصة، رقم... (Ctrl+K)">
                <div id="searchResults" class="search-results-dropdown"></div>
            </div>
            <div class="nav-actions">
                <button class="nav-btn" id="darkModeToggle" title="الوضع الليلي"><i class="fas fa-moon"></i></button>
                <div class="avatar-btn">H</div>
            </div>
        </div>
    </nav>`;
}

function initDarkMode() {
    const toggleBtn = document.getElementById('darkModeToggle');
    if (!toggleBtn) return;
    
    const isDark = localStorage.getItem('crm_dark_mode') === 'true';
    if (isDark) {
        document.body.classList.add('dark-mode');
        toggleBtn.querySelector('i').className = 'fas fa-sun';
    }
    
    toggleBtn.addEventListener('click', () => {
        const dark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('crm_dark_mode', dark ? 'true' : 'false');
        toggleBtn.querySelector('i').className = dark ? 'fas fa-sun' : 'fas fa-moon';
        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { isDark: dark } }));
    });
}

async function preloadGlobalSearchData() {
    if (isFetchingSearchData || globalSearchCache) return;
    isFetchingSearchData = true;
    let allData = [];
    const cols = [
        { name: 'customers', type: 'عميل', url: 'customer-details.html?code=' },
        { name: 'visits', type: 'زيارة', url: 'visits.html?id=' },
        { name: 'opportunities', type: 'فرصة', url: 'opportunities.html?id=' },
        { name: 'sales', type: 'مبيعات', url: 'sales.html?id=' }
    ];
    for (const coll of cols) {
        try {
            const snap = await getDocs(collection(db, coll.name));
            snap.forEach(docSnap => {
                const data = docSnap.data();
                data._searchType = coll.type;
                data._searchUrlBase = coll.url.toLowerCase();
                data._docId = docSnap.id;
                allData.push(data);
            });
        } catch(e) {}
    }
    globalSearchCache = allData;
    isFetchingSearchData = false;
}

function initGlobalSearch() {
    const inp = document.getElementById('globalSearchInput');
    const rc = document.getElementById('searchResults');
    if (!inp || !rc) return;

    inp.addEventListener('focus', () => {
        if (!globalSearchCache && !isFetchingSearchData) preloadGlobalSearchData();
    });

    inp.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        if (query.length < 2) { rc.classList.remove('show'); return; }
        
        searchTimeout = setTimeout(async () => {
            const low = query.toLowerCase();
            if (!globalSearchCache) {
                rc.innerHTML = `<div style="padding:16px; text-align:center; color:var(--crm-text-muted);">جاري البحث...</div>`;
                rc.classList.add('show');
                await preloadGlobalSearchData();
            }
            
            const matched = (globalSearchCache || []).filter(item => {
                const s = [item.comp, item.companyName, item.mgr, item.mob, item.email, item.code].map(v => String(v||'').toLowerCase()).join(' ');
                return s.includes(low);
            }).slice(0, 8);
            
            rc.innerHTML = '';
            if (matched.length === 0) {
                rc.innerHTML = `<div style="padding:16px; text-align:center; color:var(--crm-text-muted);">لا توجد نتائج لـ "${query}"</div>`;
            } else {
                matched.forEach(res => {
                    const title = res.comp || res.companyName || res.title || 'بدون اسم';
                    const code = res.code || res._docId;
                    const item = document.createElement('a');
                    item.href = (res._searchUrlBase + code).toLowerCase();
                    item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid var(--crm-border-light); text-decoration:none; color:var(--crm-text);';
                    item.innerHTML = `<span style="font-weight:700; font-size:12px;">${title}</span><span style="font-size:10px; background:var(--crm-bg); padding:2px 8px; border-radius:12px; color:var(--crm-primary); border:1px solid var(--crm-border);">${res._searchType}</span>`;
                    item.onmouseover = () => item.style.background = 'var(--crm-bg)';
                    item.onmouseout = () => item.style.background = 'transparent';
                    rc.appendChild(item);
                });
            }
            rc.classList.add('show');
        }, 300);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.nav-search-container')) rc.classList.remove('show');
    });
}

function initNavbarComponent() {
    injectNavbarStyles();
    injectNavbarHTML();
    initDarkMode();
    initGlobalSearch();
}

export function initNavbar() { initNavbarComponent(); }
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initNavbarComponent); } 
else { initNavbarComponent(); }

