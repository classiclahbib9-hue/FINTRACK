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
    'Ecart': '⚖️',
};
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PALETTE = ['#818cf8', '#10f9a2', '#ff3e6c', '#f59e0b', '#06b6d4', '#8b5cf6', '#f97316', '#ec4899', '#14b8a6', '#a855f7'];


const GOAL_KEY = 'fintrack_savings_goal';
const BG_KEY   = 'fintrack_bg';
const ACCOUNTS_KEY = 'fintrack_account_bases_v3'; // bump version = fresh reset
const BUDGETS_KEY = 'fintrack_monthly_budgets';
const RECURRING_KEY = 'fintrack_recurring_rules';

// The balance is stored directly here and updated on every add/edit/delete.
// Historical transactions never touch these numbers.
const DEFAULT_ACCOUNT_BASES = { cash: 51000, card: 29475.94 };
let accountBases = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || 'null') || { ...DEFAULT_ACCOUNT_BASES };
if (!localStorage.getItem(ACCOUNTS_KEY)) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accountBases));
}

function saveAccountBases() {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accountBases));
}

let activeAccount = 'all';
var transactions = [];

const BASE_BALANCE = 80475.94; // cash (51000) + card (29475.94) 
var savingsGoal = null;
let savedBg = null;
let editId = null;
let activePage = 'dashboard';
let filterType = 'all';
let filterAccount = 'all';
let barChartInstance = null;
let donutChartInstance = null;
let donutChartInstanceIncome = null;
let monthlyBudgets = JSON.parse(localStorage.getItem(BUDGETS_KEY) || '{}');
let recurringRules = JSON.parse(localStorage.getItem(RECURRING_KEY) || '[]');

// ── Debounced render ─────────────────────────
let _refreshTimer = null;
let _animationTimer = null;
function scheduleRefresh() {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(() => { refreshAll(); }, 120);
}

/* ── Boot ───────────────────────────────────── */
function loadData() {
    // Load local settings
    try {
        const _g = localStorage.getItem(GOAL_KEY);
        savingsGoal = _g ? JSON.parse(_g) : null;
    } catch { savingsGoal = null; }
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

    // ── DATA PERSISTENCE FAIL-SAFE ──
    // Immediately load from localStorage so the UI is NEVER empty while Firestore connects.
    try {
        const cache = localStorage.getItem('fintrack_cache_transactions');
        if (cache) {
            transactions = JSON.parse(cache);
            refreshAll(); 
        }
    } catch (e) { console.warn("Cache load failed", e); }

    // NOTE: Real-time Firestore subscription is handled by the module script in index.html.
    // It automatically updates 'transactions' and triggers scheduleRefresh() when sync arrives.
}

function saveData() {
    // Only local settings are saved synchronously now
    localStorage.setItem(GOAL_KEY, JSON.stringify(savingsGoal));
}

function saveBudgets() {
    localStorage.setItem(BUDGETS_KEY, JSON.stringify(monthlyBudgets));
}

function saveRecurringRules() {
    localStorage.setItem(RECURRING_KEY, JSON.stringify(recurringRules));
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
    return txs.filter(t => t.type === 'income' && !isReferenceTx(t)).reduce((s, t) => s + t.amount, 0);
}
function totalExpense(txs) {
    return txs.filter(t => t.type === 'expense' && !isReferenceTx(t)).reduce((s, t) => s + t.amount, 0);
}
function isReferenceTx(t) {
    return !!(t?.isAdjustment || t?.isTransfer || t?.category === 'Ecart' || t?.category === 'Transfer');
}
function balance() {
    const acct = activeAccount || 'all';
    if (acct === 'all') return accountBases.cash + accountBases.card;
    return accountBases[acct] || 0;
}

// Call after every add / edit / delete to keep accountBases in sync
function applyTxEffect(type, amount, account, reverse = false) {
    const acct = account || 'cash';
    const delta = (type === 'income' ? amount : -amount) * (reverse ? -1 : 1);
    accountBases[acct] = (accountBases[acct] || 0) + delta;
    saveAccountBases();
}

// Returns only transactions relevant to the current account view
function visibleTxs() {
    const acct = activeAccount || 'all';
    const txs = transactions || [];
    if (acct === 'all') return txs;
    return txs.filter(t => (t.account || 'cash') === acct);
}

// Switch account view and re-render everything
function setActiveAccount(acct) {
    console.log('Switching to account:', acct);
    activeAccount = acct;
    
    // Update UI tabs
    document.querySelectorAll('.acct-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.account === acct);
    });
    
    // Refresh the current page view
    refreshAll();
}

/* ── Navigation ─────────────────────────────── */
function showPage(id) {
    activePage = id;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + id).classList.add('active');
    const nav = document.getElementById('nav-' + id);
    if (nav) nav.classList.add('active');
    const titles = { dashboard: 'Dashboard', transactions: 'Transactions', loans: 'Loans', investments: 'Investments', stats: 'Statistics', budgets: 'Budgets', recurring: 'Automation', history: 'History' };
    document.getElementById('pageTitle').textContent = titles[id] || id;
    closeSidebar();
    if (id === 'dashboard') renderDashboard();
    if (id === 'transactions') renderTransactions();
    if (id === 'stats') renderStats();
    if (id === 'budgets') renderBudgets();
    if (id === 'recurring') renderRecurring();
    if (id === 'history') renderHistory();
    if (id === 'investments') renderInvestments();
    
    // Antigravity Transition
    initAntigravityAnimations(true);
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
    // Restore account — default to the active dashboard account (or 'card')
    const txAccount = tx ? (tx.account || 'cash') : (activeAccount === 'all' ? 'cash' : activeAccount);
    setModalAccount(txAccount);

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
    document.querySelectorAll('#modal .type-tab[data-type]').forEach(t => {
        t.classList.toggle('active', t.dataset.type === type);
    });
    buildCategorySelect(type, '');
}

function getModalType() {
    return document.querySelector('#modal .type-tab.active[data-type]')?.dataset.type || 'expense';
}

function setModalAccount(acct) {
    document.querySelectorAll('.acct-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.account === acct);
    });
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
    const account = document.querySelector('.acct-btn.active')?.dataset.account || 'cash';

    try {
        if (editId) {
            const docRef = window.fbDoc(window.db, 'transactions', editId);
            await window.fbUpdateDoc(docRef, { type, amount, category, date, note, account });
            // Only touch balance AFTER cloud confirms
            const oldTx = transactions.find(t => t.id === editId);
            if (oldTx) applyTxEffect(oldTx.type, oldTx.amount, oldTx.account || 'cash', true);
            applyTxEffect(type, amount, account);
            syncToSheet("EDIT", { transaction: { id: editId, type, amount, category, date, note, account } });
            showToast('Transaction updated ✓');
        } else {
            const txRef = window.fbCollection(window.db, 'transactions');
            const newDoc = await window.fbAddDoc(txRef, { type, amount, category, date, note, account });
            // Only touch balance AFTER cloud confirms
            applyTxEffect(type, amount, account);
            syncToSheet("ADD", { transaction: { id: newDoc.id, type, amount, category, date, note, account } });
            showToast('Transaction saved ✓');
        }
        closeModal();
    } catch (err) {
        console.error("Error saving doc:", err);
        showToast('Error saving to cloud — check connection');
    }
}

async function deleteTransaction() {
    if (!editId) return;
    try {
        const tx = transactions.find(t => t.id === editId);
        const deletedId = editId;
        const docRef = window.fbDoc(window.db, 'transactions', editId);
        await window.fbDeleteDoc(docRef);
        // Only reverse balance AFTER cloud confirms deletion
        if (tx) applyTxEffect(tx.type, tx.amount, tx.account || 'cash', true);
        syncToSheet("DELETE", { transaction: { id: deletedId } });
        closeModal();
        showToast('Deleted');
    } catch (err) {
        console.error("Error deleting doc:", err);
        showToast('Error deleting from cloud — check connection');
    }
}

function refreshAll() {
    renderSidebarBalance();
    
    // ── Performance: Only render the current view ──
    if (activePage === 'dashboard') renderDashboard();
    else if (activePage === 'transactions') renderTransactions();
    else if (activePage === 'stats') renderStats();
    else if (activePage === 'budgets') renderBudgets();
    else if (activePage === 'recurring') renderRecurring();
    else if (activePage === 'history') renderHistory();
    else if (activePage === 'investments') renderInvestments();

    // Always refresh the dashboard investments widget regardless of active page
    renderDashboardInvestments();
    
    // Only animate if we actually changed something meaningful 
    // and wait a moment for the browser to settle.
    if (_animationTimer) clearTimeout(_animationTimer);
    _animationTimer = setTimeout(() => { initAntigravityAnimations(); }, 300);
}

/* ── Antigravity Animations ─────────────────── */
function initAntigravityAnimations(isPageTransition = false) {
    if (typeof gsap === 'undefined') return;

    // Only run entrance animations on page transitions
    if (isPageTransition) {
        gsap.killTweensOf('.card, .section-block');
        gsap.fromTo('.card, .section-block', 
            { opacity: 0, y: 20, scale: 0.98 }, 
            { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.05, ease: "power2.out", clearProps: "all" }
        );

        gsap.killTweensOf('.tx-item');
        gsap.fromTo('.tx-item:nth-child(-n+15)', 
            { opacity: 0, x: -10 }, 
            { opacity: 1, x: 0, duration: 0.4, stagger: 0.02, ease: "power1.out", clearProps: "all" }
        ).delay(0.2);
    }

    // Floating animation (ensure only one is active)
    if (!gsap.isTweening('.card--balance')) {
        gsap.to('.card--balance', {
            y: -5,
            duration: 3,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut"
        });
    }
}


/* ── Sidebar balance ─────────────────────────── */
function renderSidebarBalance() {
    document.getElementById('sidebarBalance').textContent = fmt(balance());
}

/* ── Dashboard ──────────────────────────────── */
function renderDashboard() {
    const txs = visibleTxs();
    const inc = totalIncome(txs);
    const exp = totalExpense(txs);

    document.getElementById('totalBalance').textContent = fmt(balance());
    document.getElementById('totalIncome').textContent = fmt(inc);
    document.getElementById('totalExpense').textContent = fmt(exp);

    // Label under balance card
    const acctLabel = activeAccount === 'all' ? 'Cash + Card' : (activeAccount === 'cash' ? '💵 Cash' : '💳 Card');
    const sub = document.getElementById('balanceChange');
    sub.textContent = acctLabel + (txs.length ? ` · ${txs.length} transaction${txs.length !== 1 ? 's' : ''}` : '');

    // Current Month Total
    const nowISO = new Date().toISOString().slice(0, 7);
    const thisMonthTxs = txs.filter(t => t.date.slice(0, 7) === nowISO);
    const monthInc = totalIncome(thisMonthTxs);
    const monthExp = totalExpense(thisMonthTxs);
    const monthBal = monthInc - monthExp;

    const monthTotalEl = document.getElementById('dashboardMonthTotal');
    if (monthTotalEl) {
        monthTotalEl.textContent = fmtSigned(monthBal);
        monthTotalEl.className = 'month-value ' + (monthBal >= 0 ? 'income' : 'expense');
    }

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

    const target = savingsGoal.amount;
    // Use actual account balance (cash + card), not transaction net
    const saved = accountBases.cash + accountBases.card;
    const remaining = Math.max(0, target - saved);
    const pct = Math.min(100, Math.max(0, (saved / target) * 100));

    document.getElementById('goalName').textContent = savingsGoal.name;
    document.getElementById('goalAmount').textContent = fmt(target);
    document.getElementById('goalRemaining').textContent = remaining > 0 ? fmt(remaining) + ' remaining' : '🎉 Goal reached!';
    document.getElementById('goalProgressBar').style.width = pct + '%';
    document.getElementById('goalPct').textContent = pct.toFixed(1) + '%';
    document.getElementById('goalAvg').textContent = 'Saved: ' + fmt(saved);

    // ETA based on avg monthly net savings from transactions
    let etaText = '--';
    if (transactions.length > 0) {
        const dates = transactions.map(t => new Date(t.date));
        const minDate = new Date(Math.min(...dates));
        let monthsDiff = (new Date().getFullYear() - minDate.getFullYear()) * 12 + (new Date().getMonth() - minDate.getMonth()) + 1;
        if (monthsDiff < 1) monthsDiff = 1;
        const avgMonthlyNet = (totalIncome(transactions) - totalExpense(transactions)) / monthsDiff;

        if (remaining === 0) {
            etaText = '🎉 Reached';
        } else if (avgMonthlyNet > 0) {
            const months = Math.ceil(remaining / avgMonthlyNet);
            const eta = new Date();
            eta.setMonth(eta.getMonth() + months);
            etaText = eta.toLocaleDateString('en-IE', { month: 'short', year: 'numeric' });
        }
    }

    // Deadline-based calculations
    const deadlineEl = document.getElementById('goalDeadlineInfo');
    const needEl = document.getElementById('goalNeedPerMonth');
    if (savingsGoal.deadline) {
        const deadlineDate = new Date(savingsGoal.deadline);
        const today = new Date();
        const daysLeft = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
        const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30));

        if (daysLeft > 0 && remaining > 0) {
            const needPerMonth = remaining / monthsLeft;
            deadlineEl.textContent = `📅 ${daysLeft} days left (${deadlineDate.toLocaleDateString('en-IE', { month: 'short', year: 'numeric' })})`;
            needEl.textContent = `Need to save ${fmt(needPerMonth)}/mo to hit deadline`;
        } else if (daysLeft <= 0) {
            deadlineEl.textContent = remaining > 0 ? '⚠️ Deadline passed' : '🎉 Goal reached before deadline!';
            needEl.textContent = '';
        } else {
            deadlineEl.textContent = `📅 ${deadlineDate.toLocaleDateString('en-IE', { month: 'short', year: 'numeric' })}`;
            needEl.textContent = '';
        }
    } else {
        deadlineEl.textContent = '';
        needEl.textContent = '';
    }

    document.getElementById('goalEta').textContent = 'ETA: ' + etaText;
}

function openGoalModal() {
    document.getElementById('goalInputName').value = savingsGoal ? savingsGoal.name : '';
    document.getElementById('goalInputAmount').value = savingsGoal ? savingsGoal.amount : '';
    document.getElementById('goalInputDeadline').value = savingsGoal?.deadline || '';
    document.getElementById('goalBackdrop').classList.add('show');
}

function closeGoalModal() {
    document.getElementById('goalBackdrop').classList.remove('show');
    document.getElementById('goalForm').reset();
}

async function saveGoal(e) {
    e.preventDefault();
    const name = document.getElementById('goalInputName').value.trim();
    const amount = parseFloat(document.getElementById('goalInputAmount').value);

    if (!name || isNaN(amount) || amount <= 0) {
        showToast('Please enter valid goal details');
        return;
    }

    const deadline = document.getElementById('goalInputDeadline').value || null;
    const goalData = { name, amount, ...(deadline && { deadline }) };
    
    try {
        const goalRef = window.fbDoc(window.db, 'goals', 'active_goal');
        await window.fbSetDoc(goalRef, goalData);
        closeGoalModal();
        showToast('Goal saved ✓');
    } catch (err) {
        console.error('Error saving goal:', err);
        showToast('Error saving goal — check connection');
    }
}

async function clearGoal() {
    try {
        const goalRef = window.fbDoc(window.db, 'goals', 'active_goal');
        await window.fbDeleteDoc(goalRef);
        closeGoalModal();
        showToast('Goal cleared');
    } catch (err) {
        console.error('Error clearing goal:', err);
        showToast('Error clearing goal — check connection');
    }
}

function renderRecent() {
    const list = document.getElementById('recentList');
    const recent = [...visibleTxs()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    list.innerHTML = recent.length ? recent.map(txHTML).join('') : emptyStateHTML('account_balance_wallet', 'No transactions yet.<br>Tap <strong>+</strong> to add one!');
    list.querySelectorAll('.tx-item').forEach(el => el.addEventListener('click', () => {
        if (el.dataset.reference === 'true') {
            showToast('Reference only.');
            return;
        }
        openModal(el.dataset.id);
    }));
}

/* ── Calendar date filter state ─────────────── */
window._calRange = { type: 'all', from: null, to: null };

/* ── Transactions Page ──────────────────────── */
function renderTransactions() {
    populateCategoryFilter();
    initCalendarFilter();
    applyFilters();
}

function applyFilters() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const cat = window._filterCat || '';
    const { type: rType, from: rFrom, to: rTo } = window._calRange;

    let filtered = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
    if (filterType !== 'all') filtered = filtered.filter(t => t.type === filterType && !isReferenceTx(t));
    if (filterAccount !== 'all') filtered = filtered.filter(t => (t.account || 'cash') === filterAccount);
    if (cat) filtered = filtered.filter(t => t.category === cat);

    if (rType === 'today') {
        const today = new Date().toISOString().slice(0, 10);
        filtered = filtered.filter(t => t.date === today);
    } else if (rType === 'week') {
        const now = new Date();
        const dow = now.getDay();
        const mon = new Date(now); mon.setDate(now.getDate() - ((dow + 6) % 7));
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        const f = mon.toISOString().slice(0, 10), t2 = sun.toISOString().slice(0, 10);
        filtered = filtered.filter(t => t.date >= f && t.date <= t2);
    } else if (rType === 'month') {
        const m = new Date().toISOString().slice(0, 7);
        filtered = filtered.filter(t => t.date.slice(0, 7) === m);
    } else if (rType === 'custom' && rFrom && rTo) {
        filtered = filtered.filter(t => t.date >= rFrom && t.date <= rTo);
    } else if (rType === 'custom' && rFrom) {
        filtered = filtered.filter(t => t.date === rFrom);
    }

    if (search) filtered = filtered.filter(t =>
        t.category.toLowerCase().includes(search) ||
        (t.note || '').toLowerCase().includes(search) ||
        String(t.amount).includes(search)
    );

    // ── Pagination logic ──
    const LIMIT = window._txPageLimit || 50;
    const paged = filtered.slice(0, LIMIT);

    const list = document.getElementById('allList');
    let html = paged.length ? paged.map(txHTML).join('') : emptyStateHTML('receipt_long', 'No transactions match your filters.');

    // Add 'Load More' button if more data exists
    if (filtered.length > LIMIT) {
        html += `
        <div class="load-more-wrap">
            <button class="btn btn--ghost load-more-btn" onclick="loadMoreTransactions()">
                Load more (${filtered.length - LIMIT} remaining)
            </button>
        </div>`;
    }
    list.innerHTML = html;
    list.querySelectorAll('.tx-item').forEach(el => el.addEventListener('click', () => {
        if (el.dataset.reference === 'true') {
            showToast('Reference only.');
            return;
        }
        openModal(el.dataset.id);
    }));

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
    const dropdown  = document.getElementById('filterCategoryDropdown');
    const content   = document.getElementById('filterCategoryContent');
    const optsList  = document.getElementById('filterCategoryOptions');
    if (!dropdown) return;

    const current = window._filterCat || '';
    const base = filterAccount === 'all' ? transactions : transactions.filter(t => (t.account || 'cash') === filterAccount);
    const allCats = ['', ...new Set(base.map(t => t.category))].sort();

    const render = (cats) => {
        optsList.innerHTML = cats.map(c =>
            `<div class="custom-dropdown-option${c === current ? ' selected' : ''}" data-value="${c}">
                ${c ? (CAT_EMOJI[c] ? CAT_EMOJI[c] + ' ' : '') + c : 'All Categories'}
            </div>`
        ).join('');
        optsList.querySelectorAll('.custom-dropdown-option').forEach(opt => {
            opt.addEventListener('click', () => {
                window._filterCat = opt.dataset.value;
                content.textContent = opt.textContent.trim();
                dropdown.classList.remove('active');
                applyFilters();
            });
        });
    };

    render(allCats);
    content.textContent = current ? (CAT_EMOJI[current] ? CAT_EMOJI[current] + ' ' : '') + current : 'All Categories';

    if (!dropdown._catListenerAdded) {
        dropdown._catListenerAdded = true;
        dropdown.querySelector('.custom-dropdown-selected').addEventListener('click', e => {
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });
        document.addEventListener('click', () => dropdown.classList.remove('active'));
    }
}

/* ── Calendar filter widget ──────────────────── */
/* ── Reference History ───────────────────────── */
function renderHistory() {
    const refs = [...transactions]
        .filter(isReferenceTx)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const list = document.getElementById('historyList');
    list.innerHTML = refs.length
        ? refs.map(referenceHTML).join('')
        : emptyStateHTML('history', 'No transfer or Ecart references yet.');
}

/* ── Monthly Budgets ─────────────────────────── */
function populateBudgetCategorySelect() {
    const select = document.getElementById('budgetCategory');
    if (!select) return;
    select.innerHTML = CAT_EXPENSE.map(c => `<option value="${c}">${CAT_EMOJI[c] || ''} ${c}</option>`).join('');
}

function saveBudgetFromForm() {
    const category = document.getElementById('budgetCategory').value;
    const limit = Math.round(parseFloat(document.getElementById('budgetLimit').value) * 100) / 100;
    if (!category || !Number.isFinite(limit) || limit < 0) {
        showToast('Enter a valid budget.');
        return;
    }
    if (limit === 0) delete monthlyBudgets[category];
    else monthlyBudgets[category] = limit;
    saveBudgets();
    document.getElementById('budgetLimit').value = '';
    renderBudgets();
    showToast(limit === 0 ? 'Budget removed.' : 'Budget saved.');
}

function renderBudgets() {
    populateBudgetCategorySelect();
    const month = todayISO().slice(0, 7);
    const spentByCat = {};
    transactions
        .filter(t => t.type === 'expense' && !isReferenceTx(t) && (t.date || '').startsWith(month))
        .forEach(t => { spentByCat[t.category] = (spentByCat[t.category] || 0) + t.amount; });

    const cats = [...new Set([...Object.keys(monthlyBudgets), ...Object.keys(spentByCat)])].sort();
    const list = document.getElementById('budgetList');
    if (!cats.length) {
        list.innerHTML = emptyStateHTML('savings', 'No budgets yet. Set one above.');
        return;
    }

    list.innerHTML = cats.map(cat => {
        const limit = monthlyBudgets[cat] || 0;
        const spent = spentByCat[cat] || 0;
        const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
        const over = limit > 0 && spent > limit;
        return `
        <div class="budget-row">
          <div class="budget-row-head">
            <strong>${CAT_EMOJI[cat] || ''} ${cat}</strong>
            <span class="${over ? 'expense' : ''}">${fmt(spent)}${limit ? ' / ' + fmt(limit) : ''}</span>
          </div>
          <div class="budget-bar"><div class="budget-fill ${over ? 'over' : ''}" style="width:${pct}%"></div></div>
          <div class="budget-row-foot">${limit ? (over ? 'Over by ' + fmt(spent - limit) : fmt(limit - spent) + ' left') : 'No limit set'}</div>
        </div>`;
    }).join('');
}

/* ── Recurring Transactions ──────────────────── */
let _recurringType = 'expense';
let _recurringAccount = 'cash';

function setRecurringType(type) {
    _recurringType = type;
    document.getElementById('recurringExpenseTab').classList.toggle('active', type === 'expense');
    document.getElementById('recurringIncomeTab').classList.toggle('active', type === 'income');
    const select = document.getElementById('recurringCategory');
    const cats = type === 'income' ? CAT_INCOME : CAT_EXPENSE;
    select.innerHTML = cats.map(c => `<option value="${c}">${CAT_EMOJI[c] || ''} ${c}</option>`).join('');
}

function setRecurringAccount(account) {
    _recurringAccount = account;
    document.getElementById('recurringCash').classList.toggle('active', account === 'cash');
    document.getElementById('recurringCard').classList.toggle('active', account === 'card');
}

function saveRecurringFromForm() {
    const amount = Math.round(parseFloat(document.getElementById('recurringAmount').value) * 100) / 100;
    const category = document.getElementById('recurringCategory').value;
    const day = parseInt(document.getElementById('recurringDay').value, 10);
    const note = document.getElementById('recurringNote').value.trim();
    if (!Number.isFinite(amount) || amount <= 0) { showToast('Enter a valid amount.'); return; }
    if (!day || day < 1 || day > 28) { showToast('Use a day from 1 to 28.'); return; }

    recurringRules.push({
        id: uid(),
        type: _recurringType,
        amount,
        category,
        account: _recurringAccount,
        day,
        note,
        active: true,
        lastRunMonth: ''
    });
    saveRecurringRules();
    document.getElementById('recurringAmount').value = '';
    document.getElementById('recurringDay').value = '';
    document.getElementById('recurringNote').value = '';
    renderRecurring();
    showToast('Recurring rule added.');
}

function renderRecurring() {
    setRecurringType(_recurringType);
    setRecurringAccount(_recurringAccount);
    const list = document.getElementById('recurringList');
    const rules = recurringRules.filter(r => r.active !== false);
    list.innerHTML = rules.length ? rules.map(rule => `
      <div class="tx-item" data-type="${rule.type}">
        <div class="tx-icon ${rule.type}">${CAT_EMOJI[rule.category] || '↻'}</div>
        <div class="tx-info">
          <div class="tx-category">${rule.category} <span class="tx-acct-badge tx-acct-${rule.account}">${rule.account === 'cash' ? '💵' : '💳'}</span></div>
          <div class="tx-note">${rule.note || 'Monthly'} · day ${rule.day}</div>
        </div>
        <div style="text-align:right;">
          <div class="tx-amount ${rule.type}">${rule.type === 'income' ? '+' : '-'}${fmt(rule.amount)}</div>
          <button class="link-btn" onclick="deleteRecurringRule('${rule.id}')">Delete</button>
        </div>
      </div>`).join('') : emptyStateHTML('autorenew', 'No recurring rules yet.');
}

function deleteRecurringRule(id) {
    recurringRules = recurringRules.filter(r => r.id !== id);
    saveRecurringRules();
    renderRecurring();
    showToast('Recurring rule deleted.');
}

async function runDueRecurring(manual = false) {
    const today = new Date();
    const month = todayISO().slice(0, 7);
    const day = today.getDate();
    const due = recurringRules.filter(r => r.active !== false && r.lastRunMonth !== month && day >= r.day);
    if (!due.length) {
        if (manual) showToast('No recurring transactions due.');
        return;
    }

    let created = 0;
    for (const rule of due) {
        const date = `${month}-${String(Math.min(rule.day, 28)).padStart(2, '0')}`;
        const tx = {
            type: rule.type,
            amount: rule.amount,
            category: rule.category,
            date,
            note: rule.note || 'Recurring',
            account: rule.account || 'cash',
            recurringId: rule.id
        };

        try {
            const txRef = window.fbCollection(window.db, 'transactions');
            await window.fbAddDoc(txRef, tx);
        } catch (err) {
            const localTx = { id: uid(), ...tx };
            transactions = [localTx, ...transactions];
            localStorage.setItem('fintrack_cache_transactions', JSON.stringify(transactions));
        }
        applyTxEffect(tx.type, tx.amount, tx.account);
        rule.lastRunMonth = month;
        created++;
    }

    saveRecurringRules();
    scheduleRefresh();
    if (activePage === 'recurring') renderRecurring();
    showToast(`Created ${created} recurring transaction${created !== 1 ? 's' : ''}.`);
}

function restoreBackupFromFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const backup = JSON.parse(reader.result);
            if (!backup || typeof backup !== 'object') throw new Error('Invalid backup');

            if (Array.isArray(backup.transactions)) {
                transactions = backup.transactions;
                localStorage.setItem('fintrack_cache_transactions', JSON.stringify(transactions));
            }
            if (backup.accountBases && typeof backup.accountBases === 'object') {
                accountBases = {
                    cash: Number(backup.accountBases.cash || 0),
                    card: Number(backup.accountBases.card || 0)
                };
                saveAccountBases();
            }
            if (Array.isArray(backup.loans)) {
                loans = backup.loans;
                localStorage.setItem(LOANS_KEY, JSON.stringify(loans));
            }
            if ('savingsGoal' in backup) {
                savingsGoal = backup.savingsGoal;
                if (savingsGoal) localStorage.setItem(GOAL_KEY, JSON.stringify(savingsGoal));
                else localStorage.removeItem(GOAL_KEY);
            }
            if (backup.monthlyBudgets && typeof backup.monthlyBudgets === 'object') {
                monthlyBudgets = backup.monthlyBudgets;
                saveBudgets();
            }
            if (Array.isArray(backup.recurringRules)) {
                recurringRules = backup.recurringRules;
                saveRecurringRules();
            }

            refreshAll();
            renderLoans();
            if (activePage === 'budgets') renderBudgets();
            if (activePage === 'recurring') renderRecurring();
            if (activePage === 'history') renderHistory();
            showToast('Backup restored locally.');
        } catch (err) {
            console.error('Restore failed:', err);
            showToast('Could not restore backup file.');
        }
    };
    reader.readAsText(file);
}

let _calInitDone = false;
let _calViewYear, _calViewMonth;

function initCalendarFilter() {
    if (_calInitDone) { renderCalGrid(); return; }
    _calInitDone = true;

    const now = new Date();
    _calViewYear = now.getFullYear();
    _calViewMonth = now.getMonth();

    const toggleBtn = document.getElementById('calToggleBtn');
    const popover   = document.getElementById('calPopover');
    
    // Move to body to escape any stacking context issues (e.g. from backdrop-filter)
    if (popover && popover.parentNode !== document.body) {
        document.body.appendChild(popover);
    }

    toggleBtn.addEventListener('click', e => {
        e.stopPropagation();
        const open = popover.style.display !== 'none';
        if (open) { popover.style.display = 'none'; return; }
        const rect = toggleBtn.getBoundingClientRect();
        const vw = window.innerWidth;
        const popW = Math.min(288, vw - 16);
        popover.style.width = popW + 'px';
        let left = rect.left;
        if (left + popW > vw - 8) left = vw - popW - 8;
        if (left < 8) left = 8;
        popover.style.top  = (rect.bottom + 8) + 'px';
        popover.style.left = left + 'px';
        popover.style.display = 'block';
        renderCalGrid();
    });

    document.addEventListener('click', e => {
        if (!document.getElementById('calPopover')?.contains(e.target) &&
            !document.getElementById('calToggleBtn')?.contains(e.target)) {
            if (popover) popover.style.display = 'none';
        }
    });

    document.getElementById('calPrev').addEventListener('click', () => {
        _calViewMonth--;
        if (_calViewMonth < 0) { _calViewMonth = 11; _calViewYear--; }
        renderCalGrid();
    });
    document.getElementById('calNext').addEventListener('click', () => {
        _calViewMonth++;
        if (_calViewMonth > 11) { _calViewMonth = 0; _calViewYear++; }
        renderCalGrid();
    });

    document.querySelectorAll('.cal-quick').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cal-quick').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const range = btn.dataset.range;
            if (range !== 'custom') {
                window._calRange = { type: range, from: null, to: null };
                updateCalLabel();
                renderCalGrid();
                applyFilters();
            } else {
                window._calRange = { type: 'custom', from: null, to: null };
                renderCalGrid();
            }
        });
    });

    renderCalGrid();
}

function renderCalGrid() {
    const grid  = document.getElementById('calGrid');
    const label = document.getElementById('calMonthLabel');
    const rangeLabels = document.getElementById('calRangeLabels');
    if (!grid) return;

    label.textContent = MONTH_NAMES[_calViewMonth] + ' ' + _calViewYear;

    const firstDay = new Date(_calViewYear, _calViewMonth, 1).getDay();
    const offset = (firstDay + 6) % 7; // Monday start
    const daysInMonth = new Date(_calViewYear, _calViewMonth + 1, 0).getDate();
    const today = new Date().toISOString().slice(0, 10);

    const { type, from, to } = window._calRange;
    const isCustom = type === 'custom';

    let html = '<div class="cal-dow">Mo</div><div class="cal-dow">Tu</div><div class="cal-dow">We</div><div class="cal-dow">Th</div><div class="cal-dow">Fr</div><div class="cal-dow">Sa</div><div class="cal-dow">Su</div>';
    for (let i = 0; i < offset; i++) html += '<div class="cal-cell empty"></div>';

    for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${_calViewYear}-${String(_calViewMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        let cls = 'cal-cell';
        if (iso === today) cls += ' cal-today';
        if (isCustom) {
            if (iso === from) cls += ' cal-sel-start';
            if (iso === to)   cls += ' cal-sel-end';
            if (from && to && iso > from && iso < to) cls += ' cal-in-range';
            if (from && !to && iso === from) cls += ' cal-sel-start';
        }
        html += `<div class="${cls}" data-date="${iso}">${d}</div>`;
    }
    grid.innerHTML = html;

    grid.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
        cell.addEventListener('click', () => {
            const d = cell.dataset.date;
            const { from: f, to: t2 } = window._calRange;
            // First tap on a day (or after a completed range) → start fresh range
            if (!f || (f && t2)) {
                window._calRange = { type: 'custom', from: d, to: null };
                // activate custom chip visually
                document.querySelectorAll('.cal-quick').forEach(b => b.classList.remove('active'));
                document.querySelector('.cal-quick[data-range="custom"]')?.classList.add('active');
            } else {
                // Second tap → complete the range (or set single day if same date)
                const from2 = f <= d ? f : d;
                const to2   = f <= d ? d : f;
                window._calRange = { type: 'custom', from: from2, to: to2 };
                // Close popover after range selected
                document.getElementById('calPopover').style.display = 'none';
            }
            updateCalLabel();
            applyFilters();
            renderCalGrid();
        });
    });

    if (isCustom && from) {
        const fmtD = s => { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
        rangeLabels.textContent = to ? `${fmtD(from)} → ${fmtD(to)}` : `From ${fmtD(from)}`;
    } else {
        rangeLabels.textContent = '';
    }
}

function updateCalLabel() {
    const el = document.getElementById('calLabel');
    if (!el) return;
    const { type, from, to } = window._calRange;
    const fmtD = s => { const [,m,d] = s.split('-'); return `${d}/${m}`; };
    const labels = { all: 'All Time', today: 'Today', week: 'This Week', month: 'This Month' };
    if (type === 'custom' && from && to)  el.textContent = `${fmtD(from)}–${fmtD(to)}`;
    else if (type === 'custom' && from)   el.textContent = fmtD(from);
    else                                  el.textContent = labels[type] || 'All Time';
}

function loadMoreTransactions() {
    window._txPageLimit = (window._txPageLimit || 50) + 50;
    applyFilters();
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
    const months = [...new Set(visibleTxs().map(t => t.date.slice(0, 7)))].sort().reverse();
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
    const base = visibleTxs();
    return month ? base.filter(t => t.date.slice(0, 7) === month) : base;
}

function renderDonutChart(type, canvasId, totalId, legendId, instanceVarName) {
    const txs = getStatsTxs();
    const filtered = txs.filter(t => t.type === type && !isReferenceTx(t));
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
    const years = [...new Set(visibleTxs().map(t => t.date.slice(0, 4)))].sort().reverse();
    if (!years.length) years.push(new Date().getFullYear().toString());
    const current = sel.value || years[0];
    sel.innerHTML = years.map(y => `<option ${y === current ? 'selected' : ''}>${y}</option>`).join('');
    if (!sel.value) sel.value = current;
}

function renderBarChart() {
    const year = document.getElementById('chartYear').value || new Date().getFullYear().toString();
    const incomes = Array(12).fill(0);
    const expenses = Array(12).fill(0);
    visibleTxs()
        .filter(t => t.date.startsWith(year) && !isReferenceTx(t))
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
    const isAdjustment = !!t.isAdjustment || t.category === 'Ecart';
    const isTransfer = !!t.isTransfer || t.category === 'Transfer';
    const isReference = isAdjustment || isTransfer;
    const emoji = isAdjustment ? '⚖️' : (isTransfer ? '⇄' : (CAT_EMOJI[t.category] || '💳'));
    const acct = t.account || 'card';
    const acctBadge = activeAccount === 'all'
        ? `<span class="tx-acct-badge tx-acct-${acct}">${acct === 'cash' ? '💵' : '💳'}</span>`
        : '';
    const adjustmentDelta = typeof t.adjustmentDelta === 'number'
        ? t.adjustmentDelta
        : (t.type === 'expense' ? -t.amount : t.amount);
    const signedAmount = isAdjustment
        ? (adjustmentDelta >= 0 ? '+' : '-') + fmt(Math.abs(adjustmentDelta))
        : (isTransfer ? fmt(t.amount) : `${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}`);
    const amountClass = isAdjustment
        ? (adjustmentDelta >= 0 ? 'income' : 'expense')
        : (isTransfer ? 'transfer' : t.type);
    const categoryLabel = isAdjustment ? 'Ecart' : (isTransfer ? 'Transfer' : t.category);
    return `
    <div class="tx-item" data-id="${t.id}" data-type="${amountClass}" data-reference="${isReference ? 'true' : 'false'}">
      <div class="tx-icon ${amountClass}">${emoji}</div>
      <div class="tx-info">
        <div class="tx-category">${categoryLabel} ${acctBadge}</div>
        <div class="tx-note">${t.note || dateLabel(t.date)}</div>
      </div>
      <div style="text-align: right;">
        <div class="tx-amount ${amountClass}">${signedAmount}</div>
        <div class="tx-date">${dateLabel(t.date)}</div>
      </div>
    </div>`;
}

function referenceHTML(t) {
    return txHTML(t);
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
    document.querySelectorAll('#modal .type-tab[data-type]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#modal .type-tab[data-type]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            buildCategorySelect(tab.dataset.type, '');
        });
    });

    // Filters
    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('filterCategory')?.addEventListener('change', applyFilters);
    document.getElementById('filterMonth')?.addEventListener('change', applyFilters);
    // Type filter chips (All / Income / Expense)
    document.querySelectorAll('.chip:not(.acct-chip)').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.chip:not(.acct-chip)').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filterType = chip.dataset.filter;
            applyFilters();
        });
    });

    // Account filter chips (All Accounts / Cash / Card)
    document.querySelectorAll('.acct-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.acct-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filterAccount = chip.dataset.accountFilter;
            applyFilters();
        });
    });

    // Year change for bar chart
    document.getElementById('chartYear').addEventListener('change', renderBarChart);

    // Stats month change
    document.getElementById('statsMonth').addEventListener('change', () => {
        renderStats();
    });

    // Loan modal
    document.getElementById('addLoanBtn').addEventListener('click', openLoanModal);
    document.getElementById('addLoanSidebarBtn').addEventListener('click', openLoanModal);
    document.getElementById('addLoanPageBtn').addEventListener('click', openLoanModal);
    document.getElementById('closeLoanBtn').addEventListener('click', closeLoanModal);
    document.getElementById('loanBackdrop').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeLoanModal();
    });
    document.getElementById('loanFromCash').addEventListener('click', () => {
        _loanFromAcct = 'cash';
        document.getElementById('loanFromCash').classList.add('active');
        document.getElementById('loanFromCard').classList.remove('active');
    });
    document.getElementById('loanFromCard').addEventListener('click', () => {
        _loanFromAcct = 'card';
        document.getElementById('loanFromCard').classList.add('active');
        document.getElementById('loanFromCash').classList.remove('active');
    });
    document.getElementById('confirmLoanBtn').addEventListener('click', confirmLoan);
    renderLoans();

    // Transfer modal
    document.getElementById('transferBtnTop').addEventListener('click', openTransferModal);
    document.getElementById('transferDashboardBtn').addEventListener('click', openTransferModal);
    document.getElementById('transferNavBtn').addEventListener('click', openTransferModal);
    document.getElementById('closeTransferBtn').addEventListener('click', closeTransferModal);
    document.getElementById('transferBackdrop').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeTransferModal();
    });
    document.getElementById('transferFromCash').addEventListener('click', () => setTransferFrom('cash'));
    document.getElementById('transferFromCard').addEventListener('click', () => setTransferFrom('card'));
    document.getElementById('confirmTransferBtn').addEventListener('click', doTransfer);

    // Balance adjustment / ecart modal
    document.getElementById('adjustDashboardBtn').addEventListener('click', () => openBalanceAdjustModal());
    document.getElementById('closeAdjustBtn').addEventListener('click', closeBalanceAdjustModal);
    document.getElementById('adjustBackdrop').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeBalanceAdjustModal();
    });
    document.getElementById('adjustCash').addEventListener('click', () => setAdjustAccount('cash'));
    document.getElementById('adjustCard').addEventListener('click', () => setAdjustAccount('card'));
    document.getElementById('adjustNewBalance').addEventListener('input', updateAdjustPreview);
    document.getElementById('confirmAdjustBtn').addEventListener('click', doBalanceAdjust);

    // Budgets, recurring rules, and backup restore
    document.getElementById('saveBudgetBtn').addEventListener('click', saveBudgetFromForm);
    document.getElementById('saveRecurringBtn').addEventListener('click', saveRecurringFromForm);
    document.getElementById('runRecurringBtn').addEventListener('click', () => runDueRecurring(true));
    document.getElementById('recurringExpenseTab').addEventListener('click', () => setRecurringType('expense'));
    document.getElementById('recurringIncomeTab').addEventListener('click', () => setRecurringType('income'));
    document.getElementById('recurringCash').addEventListener('click', () => setRecurringAccount('cash'));
    document.getElementById('recurringCard').addEventListener('click', () => setRecurringAccount('card'));
    document.getElementById('restoreBackupBtn').addEventListener('click', () => document.getElementById('restoreBackupInput').click());
    document.getElementById('restoreBackupInput').addEventListener('change', restoreBackupFromFile);
    populateBudgetCategorySelect();
    setRecurringType('expense');
    setRecurringAccount('cash');
    setTimeout(() => runDueRecurring(false), 1200);
}

document.addEventListener('DOMContentLoaded', init);

/* ═══════════════════════════════════════════════
   TRANSFER BETWEEN ACCOUNTS
═══════════════════════════════════════════════ */
let _transferFrom = 'cash';

function openTransferModal() {
    const startAccount = activeAccount === 'card' ? 'card' : 'cash';
    setTransferFrom(startAccount);
    document.getElementById('transferAmount').value = '';
    document.getElementById('transferBackdrop').classList.add('show');
    setTimeout(() => document.getElementById('transferAmount').focus(), 150);
    closeSidebar();
}

function closeTransferModal() {
    document.getElementById('transferBackdrop').classList.remove('show');
}

function setTransferFrom(from) {
    _transferFrom = from;
    document.getElementById('transferFromCash').classList.toggle('active', from === 'cash');
    document.getElementById('transferFromCard').classList.toggle('active', from === 'card');
    document.getElementById('transferToLabel').textContent = from === 'cash' ? 'Card' : 'Cash';
}

function doTransfer() {
    const amount = Math.round(parseFloat(document.getElementById('transferAmount').value) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) { showToast('Enter a valid amount.'); return; }
    const from = _transferFrom;
    const to = from === 'cash' ? 'card' : 'cash';
    if ((accountBases[from] || 0) < amount) { showToast('Insufficient balance.'); return; }
    accountBases[from] = Math.round(((accountBases[from] || 0) - amount) * 100) / 100;
    accountBases[to] = Math.round(((accountBases[to] || 0) + amount) * 100) / 100;
    saveAccountBases();
    const transferTx = {
        type: 'expense',
        amount,
        category: 'Transfer',
        date: todayISO(),
        note: `${from === 'cash' ? 'Cash' : 'Card'} to ${to === 'cash' ? 'Cash' : 'Card'}`,
        account: from,
        transferTo: to,
        isTransfer: true
    };
    try {
        const txRef = window.fbCollection(window.db, 'transactions');
        window.fbAddDoc(txRef, transferTx).catch(err => {
            console.error('Error saving transfer reference:', err);
            const localTransfer = { id: uid(), ...transferTx };
            transactions = [localTransfer, ...transactions];
            localStorage.setItem('fintrack_cache_transactions', JSON.stringify(transactions));
            scheduleRefresh();
        });
    } catch (err) {
        const localTransfer = { id: uid(), ...transferTx };
        transactions = [localTransfer, ...transactions];
        localStorage.setItem('fintrack_cache_transactions', JSON.stringify(transactions));
    }
    closeTransferModal();
    scheduleRefresh();
    syncToSheet("TRANSFER", { transfer: { from, to, amount, date: todayISO() } });
    showToast(`Transferred ${fmt(amount)} from ${from === 'cash' ? 'Cash' : 'Card'} to ${to === 'cash' ? 'Cash' : 'Card'}.`);
}

/* ═══════════════════════════════════════════════
   BALANCE ADJUSTMENT / ECART
═══════════════════════════════════════════════ */
let _adjustAccount = 'cash';

function openBalanceAdjustModal(account = null) {
    const startAccount = account || (activeAccount === 'card' ? 'card' : 'cash');
    setAdjustAccount(startAccount);
    document.getElementById('adjustNewBalance').value = '';
    updateAdjustPreview();
    document.getElementById('adjustBackdrop').classList.add('show');
    setTimeout(() => document.getElementById('adjustNewBalance').focus(), 150);
    closeSidebar();
}

function closeBalanceAdjustModal() {
    document.getElementById('adjustBackdrop').classList.remove('show');
}

function setAdjustAccount(account) {
    _adjustAccount = account;
    document.getElementById('adjustCash').classList.toggle('active', account === 'cash');
    document.getElementById('adjustCard').classList.toggle('active', account === 'card');
    document.getElementById('adjustCurrentBalance').textContent = fmt(accountBases[account] || 0);
    updateAdjustPreview();
}

function updateAdjustPreview() {
    const input = document.getElementById('adjustNewBalance');
    const preview = document.getElementById('adjustDifference');
    const newBalance = Math.round(parseFloat(input.value) * 100) / 100;
    const current = accountBases[_adjustAccount] || 0;

    if (!Number.isFinite(newBalance)) {
        preview.textContent = 'Ecart: ' + fmt(0);
        preview.style.color = 'var(--text-dim)';
        return;
    }

    const difference = Math.round((newBalance - current) * 100) / 100;
    preview.textContent = 'Ecart: ' + fmtSigned(difference);
    preview.style.color = difference > 0 ? 'var(--green)' : (difference < 0 ? 'var(--red)' : 'var(--text-dim)');
}

async function doBalanceAdjust() {
    const newBalance = Math.round(parseFloat(document.getElementById('adjustNewBalance').value) * 100) / 100;
    if (!Number.isFinite(newBalance) || newBalance < 0) {
        showToast('Enter a valid new solde.');
        return;
    }

    const account = _adjustAccount;
    const oldBalance = Math.round((accountBases[account] || 0) * 100) / 100;
    const difference = Math.round((newBalance - oldBalance) * 100) / 100;

    accountBases[account] = newBalance;
    saveAccountBases();

    if (difference !== 0) {
        const adjustmentTx = {
            type: difference > 0 ? 'income' : 'expense',
            amount: Math.abs(difference),
            category: 'Ecart',
            date: todayISO(),
            note: `${account === 'cash' ? 'Cash' : 'Card'} solde adjusted from ${fmt(oldBalance)} to ${fmt(newBalance)}`,
            account,
            isAdjustment: true,
            adjustmentDelta: difference,
            oldBalance,
            newBalance
        };

        try {
            const txRef = window.fbCollection(window.db, 'transactions');
            const docRef = await window.fbAddDoc(txRef, adjustmentTx);
            syncToSheet("ECART", { adjustment: { id: docRef.id, account, oldBalance, newBalance, difference, date: todayISO() } });
        } catch (err) {
            console.error('Error saving ecart reference:', err);
            const localAdjustment = { id: uid(), ...adjustmentTx };
            transactions = [localAdjustment, ...transactions];
            localStorage.setItem('fintrack_cache_transactions', JSON.stringify(transactions));
            showToast('Solde updated. Ecart saved locally.');
        }
    } else {
        syncToSheet("ECART", { adjustment: { account, oldBalance, newBalance, difference, date: todayISO() } });
    }

    closeBalanceAdjustModal();
    scheduleRefresh();
    showToast(`${account === 'cash' ? 'Cash' : 'Card'} solde set to ${fmt(newBalance)}.`);
}


/* ═══════════════════════════════════════════════
   LOANS — MONEY LENT
═══════════════════════════════════════════════ */
const LOANS_KEY = 'fintrack_loans';
var loans = JSON.parse(localStorage.getItem(LOANS_KEY) || '[]'); // Firestore is primary; this is the cache

let _loanFromAcct = 'cash';

function openLoanModal() {
    _loanFromAcct = 'cash';
    document.getElementById('loanFromCash').classList.add('active');
    document.getElementById('loanFromCard').classList.remove('active');
    document.getElementById('loanPerson').value = '';
    document.getElementById('loanAmount').value = '';
    document.getElementById('loanDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('loanNote').value = '';
    document.getElementById('loanBackdrop').classList.add('show');
}

function closeLoanModal() {
    document.getElementById('loanBackdrop').classList.remove('show');
}

async function confirmLoan() {
    const person = document.getElementById('loanPerson').value.trim();
    const amount = parseFloat(document.getElementById('loanAmount').value);
    const date   = document.getElementById('loanDate').value || new Date().toISOString().slice(0, 10);
    const note   = document.getElementById('loanNote').value.trim();

    if (!person) { showToast('Enter a person name.'); return; }
    if (!amount || amount <= 0) { showToast('Enter a valid amount.'); return; }
    if (accountBases[_loanFromAcct] < amount) { showToast('Insufficient balance.'); return; }

    try {
        const loansRef = window.fbCollection(window.db, 'loans');
        await window.fbAddDoc(loansRef, { person, amount, account: _loanFromAcct, date, note, repaid: false });
        // Deduct balance only after Firestore confirms
        accountBases[_loanFromAcct] -= amount;
        saveAccountBases();
        closeLoanModal();
        scheduleRefresh();
        showToast(`Lent ${fmt(amount)} to ${person}.`);
    } catch (err) {
        console.error('Error saving loan:', err);
        showToast('Error saving loan — check connection');
    }
}

async function repayLoan(id) {
    const loan = loans.find(l => l.id === id);
    if (!loan) return;
    try {
        const docRef = window.fbDoc(window.db, 'loans', id);
        await window.fbDeleteDoc(docRef);
        // Add back balance only after Firestore confirms
        accountBases[loan.account] += loan.amount;
        saveAccountBases();
        scheduleRefresh();
        showToast(`${loan.person} repaid ${fmt(loan.amount)} — added back to ${loan.account}.`);
    } catch (err) {
        console.error('Error repaying loan:', err);
        showToast('Error updating loan — check connection');
    }
}

function loanRowHTML(l) {
    return `
        <div class="tx-item" style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="font-size:1.5rem;">🤝</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;">${l.person}</div>
            <div style="font-size:.8rem;opacity:.6;">${l.date}${l.note ? ' · ' + l.note : ''} · ${l.account}</div>
          </div>
          <div style="font-weight:700;color:var(--accent);white-space:nowrap;">${fmt(l.amount)}</div>
          <button onclick="repayLoan('${l.id}')" class="link-btn" style="white-space:nowrap;color:var(--green);">✓ Repaid</button>
        </div>`;
}

function renderLoans() {
    const active = loans.filter(l => !l.repaid);

    // Dashboard widget
    const list = document.getElementById('loansList');
    const empty = document.getElementById('noLoansState');
    if (list) {
        if (!active.length) {
            list.innerHTML = '';
            list.appendChild(empty);
            empty.style.display = '';
        } else {
            empty.style.display = 'none';
            list.innerHTML = active.map(loanRowHTML).join('');
        }
    }

    // Full loans page
    const pageList = document.getElementById('loansPageList');
    if (pageList) {
        if (!active.length) {
            pageList.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">handshake</span><p>No active loans.</p></div>`;
        } else {
            const total = active.reduce((s, l) => s + l.amount, 0);
            pageList.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;margin-bottom:4px;border-bottom:2px solid var(--border);">
                  <span style="opacity:.6;font-size:.9rem;">${active.length} active loan${active.length > 1 ? 's' : ''}</span>
                  <span style="font-weight:700;font-size:1.1rem;color:var(--accent);">Total: ${fmt(total)}</span>
                </div>
                ${active.map(loanRowHTML).join('')}`;
        }
    }
}

/* ═══════════════════════════════════════════════
   INVESTMENTS — CAPITAL TRACKING
═══════════════════════════════════════════════ */
const INVESTMENTS_KEY = 'fintrack_investments';
var investments = JSON.parse(localStorage.getItem(INVESTMENTS_KEY) || '[]');

const INVEST_TYPE_EMOJI = {
    crypto: '₿',
    stock: '📊',
    gold: '🥇',
    real_estate: '🏠',
    business: '📦',
    other: '💰',
};

let _investFromAcct = 'cash';
let _sellToAcct = 'cash';

/* ── Open / Close modals ─────────────────────── */
function openInvestmentModal() {
    _investFromAcct = 'cash';
    document.getElementById('investFromCash').classList.add('active');
    document.getElementById('investFromCard').classList.remove('active');
    document.getElementById('investName').value = '';
    document.getElementById('investType').value = 'crypto';
    document.getElementById('investAmount').value = '';
    document.getElementById('investDate').value = todayISO();
    document.getElementById('investNote').value = '';
    document.getElementById('investmentBackdrop').classList.add('show');
    setTimeout(() => document.getElementById('investName').focus(), 200);
}

function closeInvestmentModal() {
    document.getElementById('investmentBackdrop').classList.remove('show');
}

/* ── Save new investment ────────────────────── */
async function saveInvestment() {
    const name = document.getElementById('investName').value.trim();
    const type = document.getElementById('investType').value;
    const amount = parseFloat(document.getElementById('investAmount').value);
    const date = document.getElementById('investDate').value;
    const note = document.getElementById('investNote').value.trim();

    if (!name) { showToast('Enter an asset name'); return; }
    if (!amount || amount <= 0) { showToast('Enter a valid amount'); return; }
    if (!date) { showToast('Pick a date'); return; }

    const data = {
        name, type, amount,
        currentValue: amount, // starts at cost basis
        account: _investFromAcct,
        date, note,
        status: 'active',
        createdAt: new Date().toISOString(),
    };

    try {
        const ref = window.fbCollection(window.db, 'investments');
        await window.fbAddDoc(ref, data);
        // Deduct from account balance (money is now invested, not available)
        accountBases[_investFromAcct] -= amount;
        saveAccountBases();
        closeInvestmentModal();
        scheduleRefresh();
        showToast(`Invested ${fmt(amount)} in ${name} ✓`);
    } catch (err) {
        console.error('Error saving investment:', err);
        showToast('Error saving investment — check connection');
    }
}

/* ── Update valuation modal ─────────────────── */
function openUpdateValModal(id) {
    const inv = investments.find(i => i.id === id);
    if (!inv) return;
    document.getElementById('updateValId').value = id;
    document.getElementById('updateValTitle').textContent = `📊 ${inv.name}`;
    document.getElementById('updateValOriginal').textContent = fmt(inv.amount);
    document.getElementById('updateValAmount').value = inv.currentValue || inv.amount;
    document.getElementById('updateValPreview').textContent = '';
    document.getElementById('updateValBackdrop').classList.add('show');
    setTimeout(() => document.getElementById('updateValAmount').focus(), 200);

    // Live preview on input
    const input = document.getElementById('updateValAmount');
    const preview = document.getElementById('updateValPreview');
    const handler = () => {
        const val = parseFloat(input.value) || 0;
        const profit = val - inv.amount;
        const pct = inv.amount > 0 ? ((profit / inv.amount) * 100).toFixed(1) : 0;
        const color = profit >= 0 ? 'var(--green)' : 'var(--red)';
        preview.innerHTML = profit !== 0
            ? `<span style="color:${color}">${profit >= 0 ? '+' : ''}${fmt(profit)} (${profit >= 0 ? '+' : ''}${pct}%)</span>`
            : '';
    };
    input.oninput = handler;
    handler();
}

function closeUpdateValModal() {
    document.getElementById('updateValBackdrop').classList.remove('show');
    document.getElementById('updateValAmount').oninput = null;
}

async function saveValuation() {
    const id = document.getElementById('updateValId').value;
    const newVal = parseFloat(document.getElementById('updateValAmount').value);
    if (isNaN(newVal) || newVal < 0) { showToast('Enter a valid valuation'); return; }
    try {
        const ref = window.fbDoc(window.db, 'investments', id);
        await window.fbUpdateDoc(ref, { currentValue: newVal });
        closeUpdateValModal();
        showToast('Valuation updated ✓');
    } catch (err) {
        console.error('Error updating valuation:', err);
        showToast('Error updating valuation — check connection');
    }
}

/* ── Sell / Liquidate modal ──────────────────── */
function openSellInvestModal(id) {
    const inv = investments.find(i => i.id === id);
    if (!inv) return;
    _sellToAcct = inv.account || 'cash';

    document.getElementById('sellInvestId').value = id;
    document.getElementById('sellInvestTitle').textContent = `💸 Sell ${inv.name}`;
    document.getElementById('sellOriginal').textContent = fmt(inv.amount);
    document.getElementById('sellCurrentVal').textContent = fmt(inv.currentValue || inv.amount);
    document.getElementById('sellAmount').value = inv.currentValue || inv.amount;
    document.getElementById('sellToCash').classList.toggle('active', _sellToAcct === 'cash');
    document.getElementById('sellToCard').classList.toggle('active', _sellToAcct === 'card');

    // Live preview
    const input = document.getElementById('sellAmount');
    const preview = document.getElementById('sellPreview');
    const handler = () => {
        const val = parseFloat(input.value) || 0;
        const profit = val - inv.amount;
        const pct = inv.amount > 0 ? ((profit / inv.amount) * 100).toFixed(1) : 0;
        const color = profit >= 0 ? 'var(--green)' : 'var(--red)';
        preview.innerHTML = profit !== 0
            ? `<span style="color:${color}">Return: ${profit >= 0 ? '+' : ''}${fmt(profit)} (${profit >= 0 ? '+' : ''}${pct}%)</span>`
            : `<span style="opacity:0.5">Break even</span>`;
    };
    input.oninput = handler;
    handler();

    document.getElementById('sellInvestBackdrop').classList.add('show');
    setTimeout(() => input.focus(), 200);
}

function closeSellInvestModal() {
    document.getElementById('sellInvestBackdrop').classList.remove('show');
    document.getElementById('sellAmount').oninput = null;
}

async function confirmSellInvestment() {
    const id = document.getElementById('sellInvestId').value;
    const sellPrice = parseFloat(document.getElementById('sellAmount').value);
    const inv = investments.find(i => i.id === id);
    if (!inv) return;
    if (isNaN(sellPrice) || sellPrice < 0) { showToast('Enter a valid sale price'); return; }

    const profit = sellPrice - inv.amount;
    const pct = inv.amount > 0 ? ((profit / inv.amount) * 100).toFixed(1) : 0;

    try {
        const ref = window.fbDoc(window.db, 'investments', id);
        await window.fbUpdateDoc(ref, {
            status: 'sold',
            soldAt: new Date().toISOString(),
            salePrice: sellPrice,
            finalProfit: profit,
            finalRoiPct: parseFloat(pct),
            returnToAccount: _sellToAcct,
            currentValue: sellPrice,
        });
        // Credit sale proceeds back to selected account
        accountBases[_sellToAcct] = (accountBases[_sellToAcct] || 0) + sellPrice;
        saveAccountBases();
        closeSellInvestModal();
        scheduleRefresh();
        const roiLabel = profit >= 0 ? `+${fmt(profit)} (+${pct}%)` : `${fmt(profit)} (${pct}%)`;
        showToast(`${inv.name} sold for ${fmt(sellPrice)} · ROI: ${roiLabel}`);
    } catch (err) {
        console.error('Error selling investment:', err);
        showToast('Error selling investment — check connection');
    }
}

/* ── Delete / remove investment ──────────────── */
async function deleteInvestment(id) {
    const inv = investments.find(i => i.id === id);
    if (!inv) return;

    const restoreBalance = inv.status !== 'sold' &&
        confirm(`Restore ${fmt(inv.amount)} back to ${inv.account}?\n\nCancel = remove record only (no balance change).`);

    try {
        const ref = window.fbDoc(window.db, 'investments', id);
        await window.fbDeleteDoc(ref);
        if (restoreBalance) {
            accountBases[inv.account] = (accountBases[inv.account] || 0) + inv.amount;
            saveAccountBases();
        }
        scheduleRefresh();
        showToast(`Investment ${inv.name} removed.`);
    } catch (err) {
        console.error('Error deleting investment:', err);
        showToast('Error removing investment — check connection');
    }
}

/* ── Render helpers ──────────────────────────── */
function investmentRowHTML(inv) {
    const emoji = INVEST_TYPE_EMOJI[inv.type] || '💰';
    const currentVal = inv.currentValue ?? inv.amount;
    const profit = currentVal - inv.amount;
    const pct = inv.amount > 0 ? ((profit / inv.amount) * 100).toFixed(1) : 0;
    const profitColor = profit >= 0 ? 'var(--green)' : 'var(--red)';
    const profitLabel = (profit >= 0 ? '+' : '') + fmt(profit) + ` (${profit >= 0 ? '+' : ''}${pct}%)`;
    const acctBadge = inv.account === 'cash'
        ? '<span style="font-size:0.7rem;opacity:0.6;">💵</span>'
        : '<span style="font-size:0.7rem;opacity:0.6;">💳</span>';

    return `
    <div class="tx-item" style="align-items:flex-start; gap:12px;">
      <div class="tx-icon" style="font-size:1.4rem; background: rgba(99,102,241,0.15); color: #818cf8;">${emoji}</div>
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700; display:flex; align-items:center; gap:6px;">
          ${inv.name} ${acctBadge}
        </div>
        <div style="font-size:0.78rem; opacity:0.55; margin-top:2px;">${inv.date}${inv.note ? ' · ' + inv.note : ''}</div>
        <div style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap;">
          <button class="link-btn" onclick="openUpdateValModal('${inv.id}')" style="font-size:0.8rem; padding:3px 8px; background:rgba(129,140,248,0.15); border-radius:6px; color:#818cf8;">
            📊 Valuation
          </button>
          <button class="link-btn" onclick="openSellInvestModal('${inv.id}')" style="font-size:0.8rem; padding:3px 8px; background:rgba(16,249,162,0.12); border-radius:6px; color:var(--green);">
            💸 Sell
          </button>
          <button class="link-btn" onclick="deleteInvestment('${inv.id}')" style="font-size:0.8rem; padding:3px 8px; background:rgba(255,62,108,0.1); border-radius:6px; color:var(--red);">
            🗑
          </button>
        </div>
      </div>
      <div style="text-align:right; flex-shrink:0;">
        <div style="font-weight:700; font-size:1rem;">${fmt(currentVal)}</div>
        <div style="font-size:0.8rem; color:${profitColor}; font-weight:600; margin-top:2px;">${profitLabel}</div>
        <div style="font-size:0.72rem; opacity:0.5; margin-top:1px;">cost ${fmt(inv.amount)}</div>
      </div>
    </div>`;
}

function closedInvestmentRowHTML(inv) {
    const emoji = INVEST_TYPE_EMOJI[inv.type] || '💰';
    const profit = inv.finalProfit ?? (inv.salePrice - inv.amount);
    const pct = inv.finalRoiPct ?? (inv.amount > 0 ? ((profit / inv.amount) * 100).toFixed(1) : 0);
    const profitColor = profit >= 0 ? 'var(--green)' : 'var(--red)';

    return `
    <div class="tx-item" style="align-items:center; gap:12px; opacity:0.75;">
      <div class="tx-icon" style="font-size:1.3rem; background:rgba(255,255,255,0.05);">${emoji}</div>
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600; text-decoration:line-through; opacity:0.7;">${inv.name}</div>
        <div style="font-size:0.75rem; opacity:0.5;">${inv.date} → sold ${(inv.soldAt || '').slice(0, 10)}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:700;">${fmt(inv.salePrice || 0)}</div>
        <div style="font-size:0.8rem; color:${profitColor}; font-weight:600;">${profit >= 0 ? '+' : ''}${fmt(profit)} (${profit >= 0 ? '+' : ''}${pct}%)</div>
      </div>
      <button class="link-btn" onclick="deleteInvestment('${inv.id}')" style="color:var(--red); font-size:0.8rem; flex-shrink:0;">🗑</button>
    </div>`;
}

/* ── Render Investments Page ─────────────────── */
function renderInvestments() {
    const active = investments.filter(i => i.status !== 'sold');
    const closed = investments.filter(i => i.status === 'sold');

    // Summary metrics
    const totalInvested = active.reduce((s, i) => s + (i.amount || 0), 0);
    const totalCurrent = active.reduce((s, i) => s + (i.currentValue ?? i.amount ?? 0), 0);
    const totalProfit = totalCurrent - totalInvested;
    const totalPct = totalInvested > 0 ? ((totalProfit / totalInvested) * 100).toFixed(2) : 0;
    const profitColor = totalProfit >= 0 ? 'var(--green)' : 'var(--red)';

    const elInvested = document.getElementById('totalInvested');
    const elValue = document.getElementById('currentValue');
    const elRoi = document.getElementById('totalRoi');
    const elRoiPct = document.getElementById('totalRoiPct');
    const roiCard = document.getElementById('totalRoiCard');

    if (elInvested) elInvested.textContent = fmt(totalInvested);
    if (elValue) elValue.textContent = fmt(totalCurrent);
    if (elRoi) {
        elRoi.textContent = (totalProfit >= 0 ? '+' : '') + fmt(totalProfit);
        elRoi.style.color = profitColor;
    }
    if (elRoiPct) {
        elRoiPct.textContent = `${totalProfit >= 0 ? '+' : ''}${totalPct}% ROI`;
        elRoiPct.style.color = profitColor;
    }
    if (roiCard) {
        roiCard.style.borderColor = totalProfit >= 0 ? 'rgba(16,249,162,0.25)' : 'rgba(255,62,108,0.18)';
    }

    // Active list
    const activeList = document.getElementById('investmentsPageList');
    if (activeList) {
        activeList.innerHTML = active.length
            ? active.map(investmentRowHTML).join('')
            : emptyStateHTML('insights', 'No active investments.<br>Click <strong>+ Invest</strong> to start tracking!');
    }

    // Closed list
    const closedList = document.getElementById('closedInvestmentsList');
    if (closedList) {
        closedList.innerHTML = closed.length
            ? closed.map(closedInvestmentRowHTML).join('')
            : emptyStateHTML('folder_zip', 'No sold investments yet.');
    }
}

/* ── Dashboard investments widget ────────────── */
function renderDashboardInvestments() {
    const active = investments.filter(i => i.status !== 'sold');
    const totalInvested = active.reduce((s, i) => s + (i.amount || 0), 0);
    const totalCurrent = active.reduce((s, i) => s + (i.currentValue ?? i.amount ?? 0), 0);
    const totalProfit = totalCurrent - totalInvested;

    const profitColor = totalProfit >= 0 ? 'var(--green)' : 'var(--red)';
    const el1 = document.getElementById('dashInvested');
    const el2 = document.getElementById('dashInvestVal');
    const el3 = document.getElementById('dashInvestRoi');

    if (el1) el1.textContent = fmt(totalInvested);
    if (el2) el2.textContent = fmt(totalCurrent);
    if (el3) {
        el3.textContent = (totalProfit >= 0 ? '+' : '') + fmt(totalProfit);
        el3.style.color = profitColor;
    }
}


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
    const remBtn = document.getElementById('bgRemoveBtn');
    if (base64) {
        // Use a pseudo-element approach via CSS custom property for crisp rendering
        document.documentElement.style.setProperty('--custom-bg', `url(${base64})`);
        document.body.classList.add('has-custom-bg');
        if (remBtn) remBtn.style.display = 'flex';
    } else {
        document.documentElement.style.removeProperty('--custom-bg');
        document.body.classList.remove('has-custom-bg');
        if (remBtn) remBtn.style.display = 'none';
    }
}

function handleBgUpload(file) {
    if (!file) return;

    // Target dimensions = actual screen pixels for pixel-perfect fit
    const screenW = window.screen.width  * (window.devicePixelRatio || 1);
    const screenH = window.screen.height * (window.devicePixelRatio || 1);
    // Cap at 3840×2160 (4K) to stay within localStorage limits
    const MAX_W = Math.min(screenW, 3840);
    const MAX_H = Math.min(screenH, 2160);

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const srcW = img.naturalWidth;
            const srcH = img.naturalHeight;

            // Scale DOWN only — never upscale a small image
            const scale = Math.min(1, MAX_W / srcW, MAX_H / srcH);
            const outW  = Math.round(srcW * scale);
            const outH  = Math.round(srcH * scale);

            const canvas = document.createElement('canvas');
            canvas.width  = outW;
            canvas.height = outH;

            const ctx = canvas.getContext('2d');
            // Enable smooth high-quality interpolation
            ctx.imageSmoothingEnabled  = true;
            ctx.imageSmoothingQuality  = 'high';
            ctx.drawImage(img, 0, 0, outW, outH);

            // Use WebP when supported (smaller + sharper), fallback to JPEG at high quality
            const supportsWebP = canvas.toDataURL('image/webp').startsWith('data:image/webp');
            const dataUrl = supportsWebP
                ? canvas.toDataURL('image/webp', 0.90)
                : canvas.toDataURL('image/jpeg', 0.88);

            try {
                localStorage.setItem(BG_KEY, dataUrl);
                savedBg = dataUrl;
                applyBackground(dataUrl);
                showToast('Background updated ✓');
            } catch (err) {
                // If storage is full try a lower quality pass before giving up
                try {
                    const fallback = canvas.toDataURL('image/jpeg', 0.72);
                    localStorage.setItem(BG_KEY, fallback);
                    savedBg = fallback;
                    applyBackground(fallback);
                    showToast('Background updated ✓');
                } catch (_) {
                    showToast('Image too large for storage. Try a smaller file.');
                }
            }
        };
        img.onerror = () => showToast('Could not read image file.');
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

/* ── Theme (Light / Dark) ────────────────────── */
function initTheme() {
    const btn   = document.getElementById('themeToggleBtn');
    const icon  = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');
    const isLight = () => document.body.classList.contains('light');

    function applyTheme(light) {
        document.body.classList.toggle('light', light);
        icon.textContent  = light ? 'dark_mode'  : 'light_mode';
        label.textContent = light ? 'Dark Mode'  : 'Light Mode';
        localStorage.setItem('fintrack_theme', light ? 'light' : 'dark');
    }

    // Restore saved preference
    applyTheme(localStorage.getItem('fintrack_theme') === 'light');

    btn.addEventListener('click', () => { applyTheme(!isLight()); closeSidebar(); });
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

// Call init functions after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    loadData(); // <── LOAD CACHE & SETTINGS INSTANTLY
    initAuth();
    initImport();
    initSavingsGoal();
    initBackground();
    initTheme();
    initPasswordChange();
    initCustomCategories();

    // Export button listener
    const expBtn = document.getElementById('exportBackupBtn');
    if (expBtn) expBtn.addEventListener('click', () => { 
        window.exportDataToJSON(); 
        closeSidebar();
    });
});

function initCustomCategories() {
    const dropdown = document.getElementById('txCategoryDropdown');
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
