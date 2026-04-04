/* ──────────────────────────────────────────────
   FINTRACK – App Logic
   All data stored in localStorage.
   No dependencies except Chart.js (CDN via dynamic import).
────────────────────────────────────────────── */

/* ── Data ───────────────────────────────────── */
const STORAGE_KEY = 'fintrack_transactions';

// ── Expense categories ────────────────────────────────────────
const CAT_EXPENSE = [
    'Food',          // groceries, house food
    'Fast Food',     // restaurants, takeaway
    'Transport',     // moto, petrol, taxi
    'Housing',       // rent, repairs, electricity
    'Health',        // pharmacy, doctor
    'Gym',           // gym membership, sport
    'Clothes',       // clothing & shoes
    'Shopping',      // general purchases
    'Tech',          // gadgets, accessories
    'Gaming',        // games, subscriptions
    'Telecom',       // phone bills, internet
    'Family',        // family support
    'Charity',       // sada9a, donations
    'Education',     // books, courses
    'Business',      // stock purchases, business costs
    'Entertainment', // outings, events
    'Wifey',         // partner spending
    'Investment',    // stocks, assets, gold
    'Other',
];

// ── Income categories ─────────────────────────────────────────
const CAT_INCOME = [
    'Salary',         // monthly wage
    'Freelance',      // services, missions, chantier
    'Laptop Sales',   // laptop buy/sell margin
    'License Sales',  // windows/office keys
    'Software',       // logicielle, packs
    'Trading',        // crypto trading profit
    'Investment',     // passive income / dividends
    'Bonus',          // prime, extra
    'Gift',           // received money
    'Side Hustle',    // extra income streams
    'Subscription',   // abonnement client revenue
    'Other',
];

// ── Emojis ────────────────────────────────────────────────────
const CAT_EMOJI = {
    // Expenses
    'Food': '🛒', 'Fast Food': '🍔', 'Transport': '🚗', 'Housing': '🏠',
    'Health': '💊', 'Gym': '🏋️', 'Clothes': '👕', 'Shopping': '🛍️',
    'Tech': '🖥️', 'Gaming': '🎮', 'Telecom': '📱', 'Family': '👨‍👩‍👧',
    'Charity': '🤲', 'Education': '📚', 'Business': '📦', 'Entertainment': '🎬',
    'Wifey': '💍', 'Other': '📌',
    // Income
    'Salary': '💼', 'Freelance': '🔧', 'Laptop Sales': '💻',
    'License Sales': '🔑', 'Software': '💿', 'Trading': '📈',
    'Investment': '💰', 'Bonus': '🏆', 'Gift': '🎁',
    'Side Hustle': '⚡', 'Subscription': '📋',
};
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PALETTE = ['#6366f1', '#10d97e', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#f97316', '#ec4899', '#14b8a6', '#a855f7'];

const GOAL_KEY = 'fintrack_savings_goal';
const BG_KEY = 'fintrack_bg';
let savingsGoal = null;
let savedBg = null;
let transactions = [];
let editId = null;
let activePage = 'dashboard';
let filterType = 'all';
let barChartInstance = null;
let donutChartInstance = null;
let donutChartInstanceIncome = null;

/* ── Boot ───────────────────────────────────── */
function loadData() {
    // Load local settings
    try { savingsGoal = JSON.parse(localStorage.getItem(GOAL_KEY)) || null; }
    catch { savingsGoal = null; }
    try { savedBg = localStorage.getItem(BG_KEY) || null; }
    catch { savedBg = null; }

    // Load custom categories
    try {
        const storedCatStr = localStorage.getItem('fintrack_custom_categories');
        if (storedCatStr) {
            const customCats = JSON.parse(storedCatStr);
            if (customCats.expense) {
                customCats.expense.forEach(c => {
                    if (!CAT_EXPENSE.includes(c.name)) CAT_EXPENSE.push(c.name);
                    CAT_EMOJI[c.name] = c.emoji;
                });
            }
            if (customCats.income) {
                customCats.income.forEach(c => {
                    if (!CAT_INCOME.includes(c.name)) CAT_INCOME.push(c.name);
                    CAT_EMOJI[c.name] = c.emoji;
                });
            }
        }
    } catch { /* ignore error */ }

    // Connect to Firestore
    if (window.db) {
        const txRef = window.fbCollection(window.db, 'transactions');
        window.fbOnSnapshot(txRef, (snapshot) => {
            const data = [];
            snapshot.forEach(doc => {
                data.push({ id: doc.id, ...doc.data() });
            });
            // Sort by date descending
            transactions = data.sort((a, b) => b.date.localeCompare(a.date));
            refreshAll();
        }, (error) => {
            console.error("Firestore Listen Error:", error);
            showToast("Failed to sync with cloud");
        });
    } else {
        showToast("Firebase not initialized");
    }
}

function saveData() {
    // Only local settings are saved synchronously now
    localStorage.setItem(GOAL_KEY, JSON.stringify(savingsGoal));
}

/* ── Google Sheets Sync ─────────────────────── */
const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycbx1vk5fewmzISMm6r7llXoOmgVSl539Rl_Q2ufQIRn6w_GW1lc84AiYlAxtQOK6kIQ5hA/exec";

async function syncToSheet(action, payload) {
    if (!SHEET_WEBHOOK) return;
    try {
        await fetch(SHEET_WEBHOOK, {
            method: 'POST',
            body: JSON.stringify({ action: action, ...payload })
        });
    } catch (e) {
        console.warn("Silent Sheet Sync Failed:", e);
    }
}

/* ── Utils ──────────────────────────────────── */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function fmt(n) {
    return '€' + Math.abs(n).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtSigned(n) { return (n >= 0 ? '+' : '-') + fmt(n); }
function dateLabel(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

function totalIncome(txs) {
    return txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
}
function totalExpense(txs) {
    return txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
}
function balance(txs) { return totalIncome(txs) - totalExpense(txs); }

/* ── Navigation ─────────────────────────────── */
function showPage(id) {
    activePage = id;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + id).classList.add('active');
    const nav = document.getElementById('nav-' + id);
    if (nav) nav.classList.add('active');
    const titles = { dashboard: 'Dashboard', transactions: 'Transactions', stats: 'Statistics' };
    document.getElementById('pageTitle').textContent = titles[id] || id;
    closeSidebar();
    if (id === 'dashboard') renderDashboard();
    if (id === 'transactions') renderTransactions();
    if (id === 'stats') renderStats();
    
    // Antigravity Transition
    initAntigravityAnimations();
}

/* ── Sidebar ─────────────────────────────────── */
function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('overlay').classList.add('show');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').classList.remove('show');
}

/* ── Modal ──────────────────────────────────── */
function openModal(id = null) {
    editId = id;
    const tx = id ? transactions.find(t => t.id === id) : null;
    const type = tx ? tx.type : 'expense';

    // title
    document.getElementById('modalTitle').textContent = id ? 'Edit Transaction' : 'Add Transaction';

    // type tabs
    setModalType(type);

    // fill form
    document.getElementById('txId').value = id || '';
    document.getElementById('txAmount').value = tx ? tx.amount : '';
    buildCategorySelect(type, tx ? tx.category : '');
    document.getElementById('txDate').value = tx ? tx.date : todayISO();
    document.getElementById('txNote').value = tx ? tx.note || '' : '';

    // delete button
    document.getElementById('deleteBtn').style.display = id ? 'flex' : 'none';

    document.getElementById('modalBackdrop').classList.add('show');
    setTimeout(() => document.getElementById('txAmount').focus(), 200);
}

function closeModal() {
    document.getElementById('modalBackdrop').classList.remove('show');
    document.getElementById('txForm').reset();
    editId = null;
}

function setModalType(type) {
    document.querySelectorAll('.type-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.type === type);
    });
    buildCategorySelect(type, '');
}

function getModalType() {
    return document.querySelector('.type-tab.active')?.dataset.type || 'expense';
}

function buildCategorySelect(type, selected) {
    const hidden = document.getElementById('txCategory');
    const container = document.getElementById('txCategoryOptions');
    const selectedContent = document.getElementById('txCategorySelectedContent');
    const cats = type === 'income' ? CAT_INCOME : CAT_EXPENSE;

    let defaultSelected = selected;
    if (!defaultSelected || !cats.includes(defaultSelected)) {
        defaultSelected = cats[0];
    }

    hidden.value = defaultSelected;
    selectedContent.innerHTML = `${CAT_EMOJI[defaultSelected] || ''} ${defaultSelected}`;

    let html = cats.map((c, i) =>
        `<div class="custom-dropdown-option" data-value="${c}" style="animation-delay: ${i * 0.03}s">${CAT_EMOJI[c] || ''} ${c}</div>`
    ).join('');

    html += '<div class="custom-dropdown-divider"></div>';
    html += `<div class="custom-dropdown-option add-new" data-value="__add_new__" style="animation-delay: ${cats.length * 0.03}s">➕ Add New Category...</div>`;

    container.innerHTML = html;

    // Attach IntersectionObserver to animate options seamlessly when scrolling inside the dropdown
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                entry.target.style.animation = 'none';
            } else {
                entry.target.style.opacity = '0';
                entry.target.style.transform = 'translateY(15px)';
            }
        });
    }, { root: container, threshold: 0.1 });

    container.querySelectorAll('.custom-dropdown-option').forEach(opt => {
        observer.observe(opt);
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const val = opt.dataset.value;
            document.getElementById('txCategoryDropdown').classList.remove('active');
            if (val === '__add_new__') {
                document.getElementById('newCatName').value = '';
                document.getElementById('newCatEmoji').value = '';
                document.getElementById('customCatBackdrop').classList.add('show');
                document.getElementById('customCatModal').style.display = 'block';
                setTimeout(() => document.getElementById('newCatName').focus(), 100);
            } else {
                hidden.value = val;
                selectedContent.innerHTML = opt.innerHTML;
            }
        });
    });
}

/* ── CRUD ───────────────────────────────────── */
async function saveTransaction(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('txAmount').value);
    if (!amount || amount <= 0) { showToast('Enter a valid amount'); return; }
    const type = getModalType();
    const category = document.getElementById('txCategory').value;
    const date = document.getElementById('txDate').value;
    const note = document.getElementById('txNote').value.trim();

    try {
        if (editId) {
            const docRef = window.fbDoc(window.db, 'transactions', editId);
            await window.fbUpdateDoc(docRef, { type, amount, category, date, note });
            syncToSheet("EDIT", { transaction: { id: editId, type, amount, category, date, note } });
            showToast('Transaction updated ✓');
        } else {
            const txRef = window.fbCollection(window.db, 'transactions');
            const newDoc = await window.fbAddDoc(txRef, { type, amount, category, date, note });
            syncToSheet("ADD", { transaction: { id: newDoc.id, type, amount, category, date, note } });
            showToast('Transaction saved ✓');
        }
        closeModal();
    } catch (err) {
        console.error("Error saving doc:", err);
        showToast('Error saving to cloud');
    }
}

async function deleteTransaction() {
    if (!editId) return;
    try {
        const deletedId = editId;
        const docRef = window.fbDoc(window.db, 'transactions', editId);
        await window.fbDeleteDoc(docRef);
        syncToSheet("DELETE", { transaction: { id: deletedId } });
        closeModal();
        showToast('Deleted');
    } catch (err) {
        console.error("Error deleting doc:", err);
        showToast('Error deleting from cloud');
    }
}

function refreshAll() {
    renderSidebarBalance();
    if (activePage === 'dashboard') renderDashboard();
    if (activePage === 'transactions') renderTransactions();
    if (activePage === 'stats') renderStats();
    
    initAntigravityAnimations();
}

/* ── Antigravity Animations ─────────────────── */
function initAntigravityAnimations() {
    if (typeof gsap === 'undefined') return;

    // Staggered entrance for cards and sections
    gsap.fromTo('.card, .section-block, .tx-item', 
        { 
            opacity: 0, 
            y: 30, 
            rotateX: -10,
            scale: 0.95
        }, 
        { 
            opacity: 1, 
            y: 0, 
            rotateX: 0,
            scale: 1,
            duration: 0.8, 
            stagger: 0.05, 
            ease: "expo.out",
            clearProps: "all"
        }
    );

    // Subtle floating for balance card
    gsap.to('.card--balance', {
        y: -5,
        duration: 3,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut"
    });
}


/* ── Sidebar balance ─────────────────────────── */
function renderSidebarBalance() {
    document.getElementById('sidebarBalance').textContent = fmt(balance(transactions));
}

/* ── Dashboard ──────────────────────────────── */
function renderDashboard() {
    const inc = totalIncome(transactions);
    const exp = totalExpense(transactions);
    const bal = inc - exp;

    document.getElementById('totalBalance').textContent = fmt(bal);
    document.getElementById('totalIncome').textContent = fmt(inc);
    document.getElementById('totalExpense').textContent = fmt(exp);

    // Current Month Total
    const nowISO = new Date().toISOString().slice(0, 7);
    const thisMonthTxs = transactions.filter(t => t.date.slice(0, 7) === nowISO);
    const monthInc = totalIncome(thisMonthTxs);
    const monthExp = totalExpense(thisMonthTxs);
    const monthBal = monthInc - monthExp;

    const monthTotalEl = document.getElementById('dashboardMonthTotal');
    if (monthTotalEl) {
        monthTotalEl.textContent = fmtSigned(monthBal);
        monthTotalEl.className = 'month-value ' + (monthBal >= 0 ? 'income' : 'expense');
    }

    const sub = document.getElementById('balanceChange');
    sub.textContent = transactions.length ? `${transactions.length} transaction${transactions.length > 1 ? 's' : ''}` : '';

    renderRecent();
    populateYearSelect();
    renderBarChart();
    renderSavingsGoal();
}

/* ── Savings Goal ──────────────────────────────── */
function renderSavingsGoal() {
    const goalWidget = document.getElementById('goalWidget');
    const noGoalWidget = document.getElementById('noGoalWidget');
    if (!goalWidget || !noGoalWidget) return;

    if (!savingsGoal) {
        goalWidget.style.display = 'none';
        noGoalWidget.style.display = 'flex';
        return;
    }

    goalWidget.style.display = 'block';
    noGoalWidget.style.display = 'none';

    document.getElementById('goalName').textContent = savingsGoal.name;
    document.getElementById('goalAmount').textContent = fmt(savingsGoal.amount);

    const inc = totalIncome(transactions);
    const exp = totalExpense(transactions);
    const bal = inc - exp;

    let remaining = savingsGoal.amount - bal;
    if (remaining < 0) remaining = 0;

    document.getElementById('goalRemaining').textContent = fmt(remaining) + ' remaining';

    let pct = (bal / savingsGoal.amount) * 100;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    document.getElementById('goalProgressBar').style.width = pct + '%';

    let avgSavings = 0;
    let monthsToGoal = '--';

    if (transactions.length > 0) {
        const dates = transactions.map(t => new Date(t.date));
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(); // Present time
        let monthsDiff = (maxDate.getFullYear() - minDate.getFullYear()) * 12 + (maxDate.getMonth() - minDate.getMonth()) + 1;
        if (monthsDiff < 1) monthsDiff = 1;

        avgSavings = bal / monthsDiff;

        if (avgSavings > 0 && remaining > 0) {
            monthsToGoal = Math.ceil(remaining / avgSavings).toString();
        } else if (remaining === 0) {
            monthsToGoal = '0';
        }
    }

    document.getElementById('goalAvg').textContent = 'Avg savings: ' + fmt(avgSavings) + '/mo';
    document.getElementById('goalEta').textContent = 'ETA: ' + monthsToGoal + (monthsToGoal === '1' ? ' month' : ' months');
}

function openGoalModal() {
    document.getElementById('goalInputName').value = savingsGoal ? savingsGoal.name : '';
    document.getElementById('goalInputAmount').value = savingsGoal ? savingsGoal.amount : '';
    document.getElementById('goalBackdrop').classList.add('show');
}

function closeGoalModal() {
    document.getElementById('goalBackdrop').classList.remove('show');
    document.getElementById('goalForm').reset();
}

function saveGoal(e) {
    e.preventDefault();
    const name = document.getElementById('goalInputName').value.trim();
    const amount = parseFloat(document.getElementById('goalInputAmount').value);

    if (!name || isNaN(amount) || amount <= 0) {
        showToast('Please enter valid goal details');
        return;
    }

    savingsGoal = { name, amount };
    saveData();
    closeGoalModal();
    renderSavingsGoal();
    showToast('Goal saved ✓');
}

function clearGoal() {
    savingsGoal = null;
    saveData();
    closeGoalModal();
    renderSavingsGoal();
    showToast('Goal cleared');
}

function renderRecent() {
    const list = document.getElementById('recentList');
    const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    list.innerHTML = recent.length ? recent.map(txHTML).join('') : emptyStateHTML('account_balance_wallet', 'No transactions yet.<br>Tap <strong>+</strong> to add one!');
    list.querySelectorAll('.tx-item').forEach(el => el.addEventListener('click', () => openModal(el.dataset.id)));
}

/* ── Transactions Page ──────────────────────── */
function renderTransactions() {
    populateCategoryFilter();
    populateMonthFilter();
    applyFilters();
}

function applyFilters() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const cat = document.getElementById('filterCategory').value;
    const month = document.getElementById('filterMonth').value;

    let filtered = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
    if (filterType !== 'all') filtered = filtered.filter(t => t.type === filterType);
    if (cat) filtered = filtered.filter(t => t.category === cat);
    if (month) filtered = filtered.filter(t => t.date.slice(0, 7) === month);
    if (search) filtered = filtered.filter(t =>
        t.category.toLowerCase().includes(search) ||
        (t.note || '').toLowerCase().includes(search) ||
        String(t.amount).includes(search)
    );

    const list = document.getElementById('allList');
    list.innerHTML = filtered.length
        ? filtered.map(txHTML).join('')
        : emptyStateHTML('receipt_long', 'No transactions match your filters.');
    list.querySelectorAll('.tx-item').forEach(el => el.addEventListener('click', () => openModal(el.dataset.id)));

    const inc = totalIncome(filtered);
    const exp = totalExpense(filtered);
    const bal = inc - exp;

    const totalAmountEl = document.getElementById('transactionTotalAmount');
    if (totalAmountEl) {
        if (filterType === 'income') {
            totalAmountEl.textContent = fmt(inc);
            totalAmountEl.className = 'total-value income';
        } else if (filterType === 'expense') {
            totalAmountEl.textContent = fmt(exp);
            totalAmountEl.className = 'total-value expense';
        } else {
            totalAmountEl.textContent = fmtSigned(bal);
            totalAmountEl.className = 'total-value ' + (bal >= 0 ? 'income' : 'expense');
        }
    }
}

function populateCategoryFilter() {
    const sel = document.getElementById('filterCategory');
    const current = sel.value;
    const allCats = [...new Set(transactions.map(t => t.category))].sort();
    sel.innerHTML = '<option value="">All Categories</option>' +
        allCats.map(c => `<option value="${c}" ${c === current ? 'selected' : ''}>${CAT_EMOJI[c] || ''} ${c}</option>`).join('');
}

function populateMonthFilter() {
    const sel = document.getElementById('filterMonth');
    const current = sel.value;
    const months = [...new Set(transactions.map(t => t.date.slice(0, 7)))].sort().reverse();
    sel.innerHTML = '<option value="">All Months</option>' +
        months.map(m => {
            const [y, mo] = m.split('-');
            const label = MONTH_NAMES[parseInt(mo) - 1] + ' ' + y;
            return `<option value="${m}" ${m === current ? 'selected' : ''}>${label}</option>`;
        }).join('');
}

/* ── Stats Page ──────────────────────────────── */
function renderStats() {
    populateStatsMonthSelect();
    renderDonutChart('expense', 'donutChart', 'donutTotal', 'categoryLegend', 'donutChartInstance');
    renderDonutChart('income', 'donutChartIncome', 'donutTotalIncome', 'categoryLegendIncome', 'donutChartInstanceIncome');
    renderStatsGrid();
}

function populateStatsMonthSelect() {
    const sel = document.getElementById('statsMonth');
    const months = [...new Set(transactions.map(t => t.date.slice(0, 7)))].sort().reverse();
    const current = sel.value || months[0] || '';
    sel.innerHTML = '<option value="">All Time</option>' +
        months.map(m => {
            const [y, mo] = m.split('-');
            return `<option value="${m}" ${m === current ? 'selected' : ''}>${MONTH_NAMES[parseInt(mo) - 1]} ${y}</option>`;
        }).join('');
    if (!sel.value && months[0]) sel.value = months[0];
}

function getStatsTxs() {
    const month = document.getElementById('statsMonth')?.value || '';
    return month ? transactions.filter(t => t.date.slice(0, 7) === month) : transactions;
}

function renderDonutChart(type, canvasId, totalId, legendId, instanceVarName) {
    const txs = getStatsTxs();
    const filtered = txs.filter(t => t.type === type);
    const byCategory = {};
    filtered.forEach(t => { byCategory[t.category] = (byCategory[t.category] || 0) + t.amount; });
    
    // Sort categories by amount descending
    const sortedCats = Object.keys(byCategory).sort((a, b) => byCategory[b] - byCategory[a]);
    const amounts = sortedCats.map(c => byCategory[c]);
    const total = amounts.reduce((s, v) => s + v, 0);

    const totalEl = document.getElementById(totalId);
    if (totalEl) totalEl.textContent = fmt(total);

    const legend = document.getElementById(legendId);
    if (!sortedCats.length) {
        legend.innerHTML = `<div class="empty-state" style="padding:20px"><p>No ${type} data.</p></div>`;
    } else {
        legend.innerHTML = sortedCats.map((c, i) => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${PALETTE[i % PALETTE.length]}"></span>
        <span class="legend-label">${CAT_EMOJI[c] || ''} ${c}</span>
        <span class="legend-amount">${fmt(byCategory[c])}</span>
        <span class="legend-pct">${total ? Math.round(byCategory[c] / total * 100) + '%' : ''}</span>
      </div>`).join('');
    }

    loadChartJS(() => {
        const canvas = document.getElementById(canvasId);
        if (instanceVarName === 'donutChartInstance') {
            if (donutChartInstance) donutChartInstance.destroy();
        } else {
            if (donutChartInstanceIncome) donutChartInstanceIncome.destroy();
        }

        if (!sortedCats.length) { canvas.style.display = 'none'; return; }
        canvas.style.display = '';

        const newInstance = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: sortedCats,
                datasets: [{ 
                    data: amounts, 
                    backgroundColor: sortedCats.map((_, i) => PALETTE[i % PALETTE.length]),
                    borderWidth: 0,
                    hoverOffset: 25,
                    borderRadius: 8,
                    spacing: 5
                }]
            },
            options: {
                cutout: '72%',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 18, 26, 0.95)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        padding: 12,
                        cornerRadius: 10,
                        displayColors: true,
                        callbacks: {
                            label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}`
                        }
                    }
                },
                animation: {
                    animateRotate: true,
                    animateScale: true,
                    duration: 2000,
                    easing: 'easeOutElastic'
                },
                layout: {
                    padding: 10
                }
            }
        });

        if (instanceVarName === 'donutChartInstance') {
            donutChartInstance = newInstance;
        } else {
            donutChartInstanceIncome = newInstance;
        }
    });
}

function renderStatsGrid() {
    const txs = getStatsTxs();
    const inc = totalIncome(txs), exp = totalExpense(txs), bal = inc - exp;
    const savingsRate = inc > 0 ? Math.round((bal / inc) * 100) : 0;
    document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Income</div><div class="stat-card-value income">${fmt(inc)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Expenses</div><div class="stat-card-value expense">${fmt(exp)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Net Balance</div><div class="stat-card-value" style="color:${bal >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtSigned(bal)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Savings Rate</div><div class="stat-card-value" style="color:${savingsRate >= 0 ? 'var(--green)' : 'var(--red)'}">${savingsRate}%</div></div>
  `;
}

/* ── Bar Chart ──────────────────────────────── */
function populateYearSelect() {
    const sel = document.getElementById('chartYear');
    const years = [...new Set(transactions.map(t => t.date.slice(0, 4)))].sort().reverse();
    if (!years.length) years.push(new Date().getFullYear().toString());
    const current = sel.value || years[0];
    sel.innerHTML = years.map(y => `<option ${y === current ? 'selected' : ''}>${y}</option>`).join('');
    if (!sel.value) sel.value = current;
}

function renderBarChart() {
    const year = document.getElementById('chartYear').value || new Date().getFullYear().toString();
    const incomes = Array(12).fill(0);
    const expenses = Array(12).fill(0);
    transactions
        .filter(t => t.date.startsWith(year))
        .forEach(t => {
            const mo = parseInt(t.date.slice(5, 7)) - 1;
            if (t.type === 'income') incomes[mo] += t.amount;
            else expenses[mo] += t.amount;
        });

    loadChartJS(() => {
        const canvas = document.getElementById('barChart');
        if (barChartInstance) barChartInstance.destroy();
        barChartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: MONTH_NAMES,
                datasets: [
                    { 
                        label: 'Income', 
                        data: incomes, 
                        backgroundColor: 'rgba(16, 217, 126, 0.8)', 
                        borderRadius: 12, 
                        borderSkipped: false,
                        hoverBackgroundColor: 'rgba(16, 217, 126, 1)',
                        categoryPercentage: 0.6,
                        barPercentage: 1
                    },
                    { 
                        label: 'Expenses', 
                        data: expenses, 
                        backgroundColor: 'rgba(255, 77, 109, 0.8)', 
                        borderRadius: 12, 
                        borderSkipped: false,
                        hoverBackgroundColor: 'rgba(255, 77, 109, 1)',
                        categoryPercentage: 0.6,
                        barPercentage: 1
                    }
                ]
            },
            options: {
                responsive: true, 
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        position: 'top',
                        align: 'end',
                        labels: { 
                            boxWidth: 8,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            color: '#9ca3af', 
                            font: { family: 'Inter', weight: '600', size: 12 } 
                        } 
                    },
                    tooltip: { 
                        backgroundColor: 'rgba(15, 18, 26, 0.95)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        padding: 12,
                        cornerRadius: 10,
                        callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } 
                    }
                },
                scales: {
                    x: { 
                        ticks: { color: '#6b7280', font: { family: 'Inter', size: 10 } }, 
                        grid: { display: false } 
                    },
                    y: { 
                        ticks: { color: '#6b7280', font: { family: 'Inter', size: 10 }, callback: v => (v >= 1000 ? (v/1000)+'k' : '€'+v) }, 
                        grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false } 
                    }
                },
                animation: { 
                    duration: 2000,
                    easing: 'easeOutElastic',
                    delay: (context) => context.dataIndex * 100
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    });
}

/* ── Chart.js lazy loader ──────────────────── */
let chartJSLoaded = false;
let chartJSCallbacks = [];
function loadChartJS(cb) {
    if (chartJSLoaded) { cb(); return; }
    chartJSCallbacks.push(cb);
    if (document.getElementById('chartjs-script')) return;
    const s = document.createElement('script');
    s.id = 'chartjs-script';
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js';
    s.onload = () => { chartJSLoaded = true; chartJSCallbacks.forEach(f => f()); chartJSCallbacks = []; };
    document.head.appendChild(s);
}

/* ── Helpers ─────────────────────────────────── */
function txHTML(t) {
    const emoji = CAT_EMOJI[t.category] || '💳';
    return `
    <div class="tx-item" data-id="${t.id}">
      <div class="tx-icon ${t.type}">${emoji}</div>
      <div class="tx-info">
        <div class="tx-category">${t.category}</div>
        <div class="tx-note">${t.note || dateLabel(t.date)}</div>
      </div>
      <div>
        <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}</div>
        <div class="tx-date">${dateLabel(t.date)}</div>
      </div>
    </div>`;
}

function emptyStateHTML(icon, msg) {
    return `<div class="empty-state"><span class="material-symbols-rounded">${icon}</span><p>${msg}</p></div>`;
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

/* ── Event Wiring ────────────────────────────── */
function init() {
    loadData();
    renderSidebarBalance();
    renderDashboard();

    // Navigation
    document.querySelectorAll('.nav-item').forEach(el => {
        el.addEventListener('click', e => { e.preventDefault(); showPage(el.dataset.page); });
    });
    document.querySelectorAll('[data-page]').forEach(el => {
        if (!el.classList.contains('nav-item')) {
            el.addEventListener('click', e => { e.preventDefault(); showPage(el.dataset.page); });
        }
    });

    // Sidebar mobile
    document.getElementById('menuBtn').addEventListener('click', openSidebar);
    document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
    document.getElementById('overlay').addEventListener('click', closeSidebar);

    // FAB / add button
    document.getElementById('fab').addEventListener('click', () => openModal());
    document.getElementById('addBtnTop').addEventListener('click', () => openModal());

    // Modal
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalBackdrop').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeModal();
    });
    document.getElementById('txForm').addEventListener('submit', saveTransaction);
    document.getElementById('deleteBtn').addEventListener('click', deleteTransaction);

    // Type tabs
    document.querySelectorAll('.type-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            buildCategorySelect(tab.dataset.type, '');
        });
    });

    // Filters
    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('filterCategory').addEventListener('change', applyFilters);
    document.getElementById('filterMonth').addEventListener('change', applyFilters);
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filterType = chip.dataset.filter;
            applyFilters();
        });
    });

    // Year change for bar chart
    document.getElementById('chartYear').addEventListener('change', renderBarChart);

    // Stats month change
    document.getElementById('statsMonth').addEventListener('change', () => {
        renderDonutChart();
        renderStatsGrid();
    });
}

document.addEventListener('DOMContentLoaded', init);


/* ═══════════════════════════════════════════════
   EXCEL / CSV IMPORT FEATURE
   Uses SheetJS (xlsx) loaded lazily from CDN.
═══════════════════════════════════════════════ */

// Field names we want to extract from the spreadsheet
const IMPORT_FIELDS = ['date', 'amount', 'type', 'category', 'note'];

// Keywords used to auto-detect columns in the file header
const FIELD_HINTS = {
    date: ['date', 'datum', 'fecha', 'data', 'day', 'time', 'when'],
    amount: ['amount', 'sum', 'value', 'bedrag', 'price', 'cost', 'euro', 'eur', '€', 'total', 'money'],
    type: ['type', 'kind', 'direction', 'flow', 'income', 'expense', 'in/out', 'debit/credit', 'category type'],
    category: ['category', 'cat', 'categorie', 'tag', 'group', 'label', 'subcategory'],
    note: ['note', 'notes', 'description', 'desc', 'memo', 'remark', 'details', 'comment']
};

// Raw parsed rows from SheetJS
let importRawRows = [];
// Detected column headers
let importHeaders = [];
// User mapping: field -> header index (-1 = skip)
let importMapping = {};
// Preview parsed transactions
let importPreview = [];

/* ── SheetJS lazy loader ───────────────────── */
let sheetJSLoaded = false;
let sheetJSCallbacks = [];
function loadSheetJS(cb) {
    if (sheetJSLoaded) { cb(); return; }
    sheetJSCallbacks.push(cb);
    if (document.getElementById('sheetjs-script')) return;
    const s = document.createElement('script');
    s.id = 'sheetjs-script';
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => { sheetJSLoaded = true; sheetJSCallbacks.forEach(f => f()); sheetJSCallbacks = []; };
    document.head.appendChild(s);
}

/* ── Open / Close import modal ─────────────── */
function openImportModal() {
    resetImportModal();
    document.getElementById('importBackdrop').classList.add('show');
    closeSidebar();
    loadSheetJS(() => { }); // pre-load in background
}
function closeImportModal() {
    document.getElementById('importBackdrop').classList.remove('show');
}
function resetImportModal() {
    showImportStep(1);
    importRawRows = [];
    importHeaders = [];
    importMapping = {};
    importPreview = [];
    document.getElementById('fileInput').value = '';
    const dz = document.getElementById('dropZone');
    dz.classList.remove('drag-over');
}

function showImportStep(n) {
    [1, 2, 3].forEach(i => {
        document.getElementById('importStep' + i).style.display = i === n ? '' : 'none';
    });
}

/* ── File handling ──────────────────────────── */
function handleImportFile(file) {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
        showToast('Unsupported file type. Use .xlsx, .xls or .csv');
        return;
    }
    loadSheetJS(() => parseFile(file));
}

function parseFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array', cellDates: true });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

            if (!rows.length) { showToast('The file appears to be empty'); return; }

            // First non-empty row = headers
            importHeaders = rows[0].map(h => String(h).trim());
            importRawRows = rows.slice(1).filter(r => r.some(c => c !== ''));

            if (!importHeaders.length) { showToast('Could not read column headers'); return; }

            autoDetectMapping();
            buildMapGrid();
            showImportStep(2);
        } catch (err) {
            showToast('Could not read file: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

/* ── Auto-detect column mapping ─────────────── */
function autoDetectMapping() {
    importMapping = {};
    const used = new Set();
    IMPORT_FIELDS.forEach(field => {
        const hints = FIELD_HINTS[field];
        let best = -1;
        importHeaders.forEach((h, i) => {
            if (used.has(i)) return;
            const hl = h.toLowerCase();
            if (hints.some(hint => hl.includes(hint))) { best = i; }
        });
        importMapping[field] = best;
        if (best !== -1) used.add(best);
    });
}

/* ── Build column mapper UI ─────────────────── */
function buildMapGrid() {
    const grid = document.getElementById('mapGrid');
    const fieldLabels = { date: 'Date', amount: 'Amount', type: 'Type (income/expense)', category: 'Category', note: 'Note' };
    const required = ['date', 'amount', 'type'];

    grid.innerHTML = IMPORT_FIELDS.map(field => {
        const opts = ['<option value="-1">— skip —</option>',
            ...importHeaders.map((h, i) => `<option value="${i}" ${importMapping[field] === i ? 'selected' : ''}>${h}</option>`)
        ].join('');
        const req = required.includes(field) ? ' <span style="color:var(--red)">*</span>' : '';
        return `
      <div class="map-row">
        <div class="map-col-name">${fieldLabels[field]}${req}</div>
        <span class="material-symbols-rounded map-arrow">arrow_forward</span>
        <select class="map-select" data-field="${field}">${opts}</select>
      </div>`;
    }).join('');

    // Listen for changes
    grid.querySelectorAll('.map-select').forEach(sel => {
        sel.addEventListener('change', () => {
            importMapping[sel.dataset.field] = parseInt(sel.value);
        });
    });
}

/* ── Parse & preview transactions ───────────── */
function buildPreview() {
    const { date: di, amount: ai, type: ti, category: ci, note: ni } = importMapping;

    if (di === -1 || ai === -1 || ti === -1) {
        showToast('Please map at least: Date, Amount, and Type');
        return false;
    }

    const ALL_CATS = [...CAT_EXPENSE, ...CAT_INCOME];
    importPreview = [];

    importRawRows.forEach((row, idx) => {
        const rawDate = row[di];
        const rawAmount = row[ai];
        const rawType = row[ti];
        const rawCat = ci !== -1 ? String(row[ci] || '').trim() : '';
        const rawNote = ni !== -1 ? String(row[ni] || '').trim() : '';

        // Parse date
        let dateISO = '';
        if (rawDate instanceof Date) {
            dateISO = rawDate.toISOString().slice(0, 10);
        } else {
            const d = new Date(rawDate);
            if (!isNaN(d)) dateISO = d.toISOString().slice(0, 10);
            else {
                // try DD/MM/YYYY or DD-MM-YYYY
                const m = String(rawDate).match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
                if (m) {
                    const y = m[3].length === 2 ? '20' + m[3] : m[3];
                    dateISO = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
                }
            }
        }

        // Parse amount
        let amount = parseFloat(String(rawAmount).replace(/[^0-9.\-]/g, ''));
        if (isNaN(amount)) { importPreview.push({ error: `Row ${idx + 2}: invalid amount "${rawAmount}"` }); return; }
        amount = Math.abs(amount);

        // Parse type
        const typeRaw = String(rawType).toLowerCase().trim();
        let type = '';
        if (['income', 'in', 'credit', '+', 'revenue', 'salary'].some(k => typeRaw.includes(k))) type = 'income';
        else if (['expense', 'out', 'debit', '-', 'cost', 'spending', 'expenditure'].some(k => typeRaw.includes(k))) type = 'expense';
        else { importPreview.push({ error: `Row ${idx + 2}: unknown type "${rawType}"` }); return; }

        if (!dateISO) { importPreview.push({ error: `Row ${idx + 2}: unrecognised date "${rawDate}"` }); return; }

        // Category: match to known or keep as-is
        const catMatch = ALL_CATS.find(c => c.toLowerCase() === rawCat.toLowerCase());
        const category = catMatch || (rawCat || (type === 'income' ? 'Other' : 'Other'));

        importPreview.push({ id: uid(), type, amount, category, date: dateISO, note: rawNote });
    });

    return true;
}

function renderPreview() {
    const ok = importPreview.filter(r => !r.error);
    const errs = importPreview.filter(r => r.error);

    document.getElementById('previewInfo').innerHTML = `
    <span class="preview-badge ok">✓ ${ok.length} ready to import</span>
    ${errs.length ? `<span class="preview-badge err">✗ ${errs.length} skipped (errors)</span>` : ''}
  `;

    const tbody = document.getElementById('previewBody');
    tbody.innerHTML = importPreview.map(r => {
        if (r.error) return `<tr><td colspan="5" style="color:var(--text-muted);font-style:italic">${r.error}</td><td><span class="tx-err">✗</span></td></tr>`;
        return `<tr>
      <td>${r.date}</td>
      <td style="color:${r.type === 'income' ? 'var(--green)' : 'var(--red)'}">${r.type}</td>
      <td>${fmt(r.amount)}</td>
      <td>${CAT_EMOJI[r.category] || ''} ${r.category}</td>
      <td style="color:var(--text-muted)">${r.note || '—'}</td>
      <td><span class="tx-ok">✓</span></td>
    </tr>`;
    }).join('');
}

/* ── Confirm import ─────────────────────────── */
async function confirmImport() {
    const mode = document.querySelector('input[name="mergeMode"]:checked').value;
    const valid = importPreview.filter(r => !r.error);

    if (!valid.length) { showToast('No valid transactions to import'); return; }

    const txRef = window.fbCollection(window.db, 'transactions');
    showToast('Importing to cloud... please wait.');

    try {
        if (mode === 'replace') {
            // Bulk delete existing
            const snapshot = await window.fbGetDocs(txRef);
            let batch = window.fbWriteBatch(window.db);
            let count = 0;

            for (const doc of snapshot.docs) {
                batch.delete(doc.ref);
                count++;
                if (count === 500) {
                    await batch.commit();
                    batch = window.fbWriteBatch(window.db);
                    count = 0;
                }
            }
            if (count > 0) await batch.commit();

            // Upload new
            batch = window.fbWriteBatch(window.db);
            count = 0;
            for (const v of valid) {
                const newDocRef = window.fbDoc(txRef);
                const { id, error, ...cleanData } = v;
                batch.set(newDocRef, cleanData);
                count++;
                if (count === 500) {
                    await batch.commit();
                    batch = window.fbWriteBatch(window.db);
                    count = 0;
                }
            }
            if (count > 0) await batch.commit();

        } else {
            // Merge mode implementation
            const snapshot = await window.fbGetDocs(txRef);
            const existing = new Set();
            snapshot.forEach(doc => {
                const d = doc.data();
                existing.add(`${d.date}|${d.amount}|${d.type}`);
            });

            const newOnes = valid.filter(t => !existing.has(`${t.date}|${t.amount}|${t.type}`));

            if (!newOnes.length) {
                showToast('All transactions already exist');
                closeImportModal();
                return;
            }

            let batch = window.fbWriteBatch(window.db);
            let count = 0;
            for (const v of newOnes) {
                const newDocRef = window.fbDoc(txRef);
                const { id, error, ...cleanData } = v;
                batch.set(newDocRef, cleanData);
                count++;
                if (count === 500) {
                    await batch.commit();
                    batch = window.fbWriteBatch(window.db);
                    count = 0;
                }
            }
            if (count > 0) await batch.commit();
        }

        closeImportModal();
        showToast(`✓ Uploaded ${valid.length} transactions to cloud!`);
        syncToSheet("BULK_IMPORT", { transactions: valid });
        showPage('dashboard');
    } catch (err) {
        console.error("Import Error", err);
        showToast('Error importing to cloud: ' + err.message);
    }
}

function initSavingsGoal() {
    const setGoalBtn = document.getElementById('setGoalBtn');
    if (setGoalBtn) setGoalBtn.addEventListener('click', openGoalModal);

    const goalClose = document.getElementById('goalClose');
    if (goalClose) goalClose.addEventListener('click', closeGoalModal);

    const goalBackdrop = document.getElementById('goalBackdrop');
    if (goalBackdrop) {
        goalBackdrop.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeGoalModal();
        });
    }

    const goalForm = document.getElementById('goalForm');
    if (goalForm) goalForm.addEventListener('submit', saveGoal);

    const clearGoalBtn = document.getElementById('clearGoalBtn');
    if (clearGoalBtn) clearGoalBtn.addEventListener('click', clearGoal);
}

/* ── Wire up import events ──────────────────── */
function initImport() {
    // Open button in sidebar
    document.getElementById('importNavBtn').addEventListener('click', openImportModal);

    // Close buttons
    ['importClose', 'importClose2', 'importClose3'].forEach(id => {
        document.getElementById(id).addEventListener('click', closeImportModal);
    });
    document.getElementById('importBackdrop').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeImportModal();
    });

    // File input
    document.getElementById('fileInput').addEventListener('change', e => {
        handleImportFile(e.target.files[0]);
    });

    // Drag & drop
    const dz = document.getElementById('dropZone');
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('drag-over');
        handleImportFile(e.dataTransfer.files[0]);
    });
    dz.addEventListener('click', e => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL') {
            document.getElementById('fileInput').click();
        }
    });

    // Step 2 → 3: preview
    document.getElementById('importPreviewBtn').addEventListener('click', () => {
        if (buildPreview()) {
            renderPreview();
            showImportStep(3);
        }
    });

    // Back buttons
    document.getElementById('importBack').addEventListener('click', () => showImportStep(1));
    document.getElementById('importBack2').addEventListener('click', () => showImportStep(2));

    // Confirm import
    document.getElementById('importConfirmBtn').addEventListener('click', confirmImport);
}

/* ── Custom Background ───────────────────── */
function applyBackground(base64) {
    if (base64) {
        document.body.style.backgroundImage = `url(${base64})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundAttachment = 'fixed';
        const remBtn = document.getElementById('bgRemoveBtn');
        if (remBtn) remBtn.style.display = 'flex';
    } else {
        document.body.style.backgroundImage = '';
        const remBtn = document.getElementById('bgRemoveBtn');
        if (remBtn) remBtn.style.display = 'none';
    }
}

function handleBgUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            const MAX_W = 1920, MAX_H = 1080;
            let w = img.width, h = img.height;
            if (w > h && w > MAX_W) { h *= MAX_W / w; w = MAX_W; }
            else if (h > MAX_H) { w *= MAX_H / h; h = MAX_H; }
            canvas.width = Math.round(w);
            canvas.height = Math.round(h);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            try {
                localStorage.setItem(BG_KEY, dataUrl);
                savedBg = dataUrl;
                applyBackground(dataUrl);
                showToast('Background updated ✓');
            } catch (err) {
                showToast('Image too large. Try a smaller one.');
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function initBackground() {
    const bgBtn = document.getElementById('bgNavBtn');
    const bgInput = document.getElementById('bgInput');
    const bgRemoveBtn = document.getElementById('bgRemoveBtn');

    if (bgBtn && bgInput) {
        bgBtn.addEventListener('click', () => { bgInput.click(); closeSidebar(); });
        bgInput.addEventListener('change', e => {
            handleBgUpload(e.target.files[0]);
            e.target.value = '';
        });
    }
    if (bgRemoveBtn) {
        bgRemoveBtn.addEventListener('click', () => {
            localStorage.removeItem(BG_KEY);
            savedBg = null;
            applyBackground(null);
            showToast('Background removed');
        });
    }

    if (savedBg) applyBackground(savedBg);
}

/* ── Auth ───────────────────────────────────── */
function initAuth() {
    const loginOverlay = document.getElementById('loginOverlay');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');

    if (!loginOverlay || !loginForm) return;

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('fintrack_auth');
            location.reload();
        });
    }

    if (sessionStorage.getItem('fintrack_auth') === 'true') {
        loginOverlay.classList.add('hidden');
        return;
    }

    // Secure Credentials (can be overridden by localStorage)
    const SECURE_USER = 'admin';
    const SECURE_PASS = localStorage.getItem('fintrack_password') || '12345';

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = document.getElementById('loginUser').value.trim();
        const pass = document.getElementById('loginPass').value.trim();

        if (user === SECURE_USER && pass === SECURE_PASS) {
            sessionStorage.setItem('fintrack_auth', 'true');
            loginOverlay.classList.add('hidden');
            loginError.style.display = 'none';
        } else {
            loginError.style.display = 'block';
            document.getElementById('loginPass').value = '';
        }
    });
}

// Call initImport after DOM is ready (already inside DOMContentLoaded via init)
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initImport();
    initSavingsGoal();
    initBackground();
    initPasswordChange();
    initCustomCategories();
});

function initCustomCategories() {
    const dropdown = document.getElementById('txCategoryDropdown');
    const hidden = document.getElementById('txCategory');
    const backdrop = document.getElementById('customCatBackdrop');
    const modal = document.getElementById('customCatModal');
    const closeBtn = document.getElementById('closeCustomCatBtn');
    const saveBtn = document.getElementById('saveCustomCatBtn');
    const nameInput = document.getElementById('newCatName');
    const emojiInput = document.getElementById('newCatEmoji');

    if (!dropdown || !backdrop) return;

    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
    });

    document.addEventListener('click', () => {
        dropdown.classList.remove('active');
    });

    const closeCatModal = () => {
        backdrop.classList.remove('show');
        modal.style.display = 'none';
    };

    closeBtn.addEventListener('click', closeCatModal);
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeCatModal();
    });

    saveBtn.addEventListener('click', () => {
        const cName = nameInput.value.trim();
        if (!cName) {
            showToast('Category name is required');
            return;
        }

        const cEmoji = emojiInput.value.trim() || '📌';
        const type = getModalType();
        const customCatStore = JSON.parse(localStorage.getItem('fintrack_custom_categories') || '{"expense":[], "income":[]}');

        if (type === 'income') {
            if (!CAT_INCOME.includes(cName)) CAT_INCOME.push(cName);
            if (!customCatStore.income) customCatStore.income = [];
            customCatStore.income.push({ name: cName, emoji: cEmoji });
        } else {
            if (!CAT_EXPENSE.includes(cName)) CAT_EXPENSE.push(cName);
            if (!customCatStore.expense) customCatStore.expense = [];
            customCatStore.expense.push({ name: cName, emoji: cEmoji });
        }

        CAT_EMOJI[cName] = cEmoji;
        localStorage.setItem('fintrack_custom_categories', JSON.stringify(customCatStore));

        backdrop.classList.remove('show');
        modal.style.display = 'none';

        showToast('Custom category added ✓');
        buildCategorySelect(type, cName);
    });
}

function initPasswordChange() {
    const pwBtn = document.getElementById('changePasswordBtn');
    const pwModal = document.getElementById('passwordModal');
    const closeBtn = document.getElementById('closePasswordBtn');
    const step1 = document.getElementById('passwordStep1');
    const step2 = document.getElementById('passwordStep2');
    const checkBtn = document.getElementById('securityCheckBtn');
    const saveBtn = document.getElementById('savePasswordBtn');
    const secInput = document.getElementById('securityAnswer');
    const secError = document.getElementById('securityError');
    const newPassStr = document.getElementById('newAppPassword');

    if (!pwBtn || !pwModal) return;

    pwBtn.addEventListener('click', () => {
        closeSidebar();
        document.getElementById('passwordBackdrop').classList.add('show');
        pwModal.style.display = 'block';

        // Reset state
        step1.style.display = 'block';
        step2.style.display = 'none';
        secInput.value = '';
        newPassStr.value = '';
        secError.style.display = 'none';
    });

    closeBtn.addEventListener('click', () => {
        pwModal.style.display = 'none';
        document.getElementById('passwordBackdrop').classList.remove('show');
    });

    // Make sure we hide it if the user clicks the backdrop itself
    document.getElementById('passwordBackdrop').addEventListener('click', (e) => {
        if (e.target === document.getElementById('passwordBackdrop')) {
            pwModal.style.display = 'none';
            document.getElementById('passwordBackdrop').classList.remove('show');
        }
    });

    checkBtn.addEventListener('click', () => {
        const ans = secInput.value.trim().toLowerCase();
        if (ans === 'adibani') {
            secError.style.display = 'none';
            step1.style.display = 'none';
            step2.style.display = 'block';
        } else {
            secError.style.display = 'block';
        }
    });

    saveBtn.addEventListener('click', () => {
        const np = newPassStr.value.trim();
        if (np.length > 0) {
            localStorage.setItem('fintrack_password', np);
            showToast('Password updated successfully! ✓');
            pwModal.style.display = 'none';
            document.getElementById('passwordBackdrop').classList.remove('show');
            // Force re-login
            sessionStorage.removeItem('fintrack_auth');
            location.reload();
        } else {
            showToast('Password cannot be empty');
        }
    });
}
