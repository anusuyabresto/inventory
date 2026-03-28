// ===== ANSUYA RESTAURANT & BAR — INVENTORY MANAGEMENT SYSTEM =====
// Firebase Realtime Database + Full CRUD + Audit Log + Multi-user

// ============================================================
// FIREBASE CONFIG — Replace with your own Firebase project config
// ============================================================
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ============================================================
// LOCAL STORAGE BASED SYSTEM (works instantly without Firebase setup)
// Firebase will sync if configured above. Local storage is the fallback.
// ============================================================

let db = null;
let useFirebase = false;

// Try to initialize Firebase
try {
  if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    useFirebase = true;
    console.log("✅ Firebase connected");
  } else {
    console.log("ℹ️ Using local storage (configure Firebase for real-time sync)");
  }
} catch(e) {
  console.log("Using local storage mode");
}

// ============================================================
// LOCAL DATA STORE
// ============================================================
let store = {
  users: {},
  categories: {},
  items: {},
  auditlog: {}
};

// Load from localStorage
function loadStore() {
  try {
    const saved = localStorage.getItem('ansuya_store');
    if (saved) store = JSON.parse(saved);
  } catch(e) {}
  initDefaults();
}

function saveStore() {
  try {
    localStorage.setItem('ansuya_store', JSON.stringify(store));
  } catch(e) {}
}

function initDefaults() {
  // Master account always exists
  if (!store.users) store.users = {};
  if (!store.users['master']) {
    store.users['master'] = {
      name: 'Master Admin',
      username: 'master',
      password: 'ansuya@123',
      role: 'master',
      createdAt: Date.now()
    };
  }

  if (!store.categories) store.categories = {};
  if (!store.items) store.items = {};
  if (!store.auditlog) store.auditlog = {};

  // Default categories if empty
  if (Object.keys(store.categories).length === 0) {
    const defaultCats = [
      { name: 'Seafood (Fresh Catch)', icon: '🐟', color: '#0e9b8c' },
      { name: 'Spirits & Liquor', icon: '🥃', color: '#c9972a' },
      { name: 'Beer & Beverages', icon: '🍺', color: '#b84a2a' },
      { name: 'Soft Drinks & Water', icon: '💧', color: '#3b82f6' },
      { name: 'Vegetables', icon: '🥦', color: '#22c55e' },
      { name: 'Rice & Grains', icon: '🌾', color: '#f59e0b' },
      { name: 'Oils & Condiments', icon: '🫙', color: '#8b5cf6' },
      { name: 'Dairy & Eggs', icon: '🥚', color: '#ec4899' },
      { name: 'Frozen Items', icon: '❄️', color: '#06b6d4' },
      { name: 'Puddings & Desserts', icon: '🍮', color: '#f97316' },
    ];
    defaultCats.forEach(cat => {
      const id = 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2,5);
      store.categories[id] = { ...cat, id, createdAt: Date.now() };
    });

    // Sample items
    const catIds = Object.keys(store.categories);
    const sampleItems = [
      { name: 'Kingfisher Beer (650ml)', catIdx: 2, qty: 48, unit: 'bottle', min: 12 },
      { name: 'Aquafina Water (1L)', catIdx: 3, qty: 24, unit: 'bottle', min: 10 },
      { name: 'Pomfret (Fresh)', catIdx: 0, qty: 5, unit: 'kg', min: 2 },
      { name: 'Chonk Fish', catIdx: 0, qty: 4, unit: 'kg', min: 2 },
      { name: 'Squids', catIdx: 0, qty: 2, unit: 'kg', min: 1 },
      { name: 'Prawns', catIdx: 0, qty: 3.5, unit: 'kg', min: 2 },
      { name: 'Mackerel', catIdx: 0, qty: 2, unit: 'kg', min: 1 },
      { name: 'Johnnie Walker Black Label', catIdx: 1, qty: 3, unit: 'bottle', min: 2 },
      { name: 'Bacardi White Rum', catIdx: 1, qty: 2, unit: 'bottle', min: 1 },
      { name: 'Jack Daniel\'s', catIdx: 1, qty: 1, unit: 'bottle', min: 1 },
      { name: 'Basmati Rice', catIdx: 5, qty: 25, unit: 'kg', min: 10 },
      { name: 'Cooking Oil', catIdx: 6, qty: 8, unit: 'ltr', min: 5 },
      { name: 'Eggs', catIdx: 7, qty: 60, unit: 'pcs', min: 24 },
      { name: 'Pepsi (300ml)', catIdx: 3, qty: 24, unit: 'pcs', min: 12 },
    ];

    sampleItems.forEach(item => {
      const id = 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2,5);
      store.items[id] = {
        id,
        name: item.name,
        categoryId: catIds[item.catIdx] || catIds[0],
        qty: item.qty,
        unit: item.unit,
        minStock: item.min,
        description: '',
        lastUpdatedBy: 'master',
        lastUpdatedByName: 'Master Admin',
        lastUpdatedAt: Date.now(),
        createdAt: Date.now()
      };
    });

    saveStore();
  }
}

// ============================================================
// FIREBASE SYNC HELPERS
// ============================================================
function fbSet(path, data) {
  if (useFirebase && db) {
    db.ref(path).set(data);
  }
}

function fbPush(path, data) {
  if (useFirebase && db) {
    return db.ref(path).push(data);
  }
  return null;
}

// If Firebase is configured, set up real-time listeners
function setupFirebaseListeners() {
  if (!useFirebase || !db) return;

  db.ref('store').on('value', (snap) => {
    const data = snap.val();
    if (data) {
      store = data;
      initDefaults();
      refreshCurrentPage();
    }
  });
}

// ============================================================
// CURRENT USER
// ============================================================
let currentUser = null;

function login(username, password) {
  const users = store.users || {};
  const user = Object.values(users).find(u =>
    u.username === username && u.password === password
  );
  return user || null;
}

// ============================================================
// APP STATE
// ============================================================
let currentPage = 'dashboard';

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadStore();
  setupFirebaseListeners();
  initLoginForm();
  initNavigation();
  startClock();

  // Check session
  const savedUser = sessionStorage.getItem('ansuya_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    enterApp();
  }
});

function initLoginForm() {
  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    const user = login(username, password);
    if (user) {
      currentUser = user;
      sessionStorage.setItem('ansuya_user', JSON.stringify(user));
      document.getElementById('loginError').textContent = '';
      enterApp();
    } else {
      document.getElementById('loginError').textContent = 'Invalid username or password.';
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    currentUser = null;
    sessionStorage.removeItem('ansuya_user');
    document.getElementById('appScreen').classList.remove('active');
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
  });
}

function enterApp() {
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('appScreen').classList.add('active');

  document.getElementById('sidebarName').textContent = currentUser.name;
  document.getElementById('sidebarRole').textContent = currentUser.role === 'master' ? 'Master Admin' : currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
  document.getElementById('sidebarAvatar').textContent = currentUser.name.charAt(0).toUpperCase();

  if (currentUser.role !== 'master') {
    document.body.classList.add('staff');
  } else {
    document.body.classList.remove('staff');
  }

  navigateTo('dashboard');
}

function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      navigateTo(page);
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  const titles = {
    dashboard: 'Dashboard',
    inventory: 'Inventory',
    addstock: 'Add / Update Stock',
    lowstock: 'Low Stock Alerts',
    auditlog: 'Audit Log',
    users: 'Manage Users',
    categories: 'Categories'
  };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  refreshCurrentPage();
}

function refreshCurrentPage() {
  switch(currentPage) {
    case 'dashboard': renderDashboard(); break;
    case 'inventory': renderInventory(); break;
    case 'addstock': renderAddStock(); break;
    case 'lowstock': renderLowStock(); break;
    case 'auditlog': loadAuditLog(); break;
    case 'users': renderUsers(); break;
    case 'categories': renderCategories(); break;
  }
}

// ============================================================
// CLOCK
// ============================================================
function startClock() {
  function update() {
    const now = new Date();
    document.getElementById('datetimeDisplay').textContent = now.toLocaleDateString('en-IN', {
      weekday: 'short', day: '2-digit', month: 'short'
    }) + '  ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  update();
  setInterval(update, 30000);
}

// ============================================================
// HELPERS
// ============================================================
function genId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function getCategoryName(catId) {
  return store.categories[catId]?.name || '—';
}

function getCategoryIcon(catId) {
  return store.categories[catId]?.icon || '📦';
}

function getStatusBadge(qty, min) {
  if (qty <= 0) return '<span class="status-badge status-out">Out of Stock</span>';
  if (qty <= min) return '<span class="status-badge status-low">Low Stock</span>';
  return '<span class="status-badge status-ok">In Stock</span>';
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.className = 'toast', 3000);
}

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard() {
  const items = Object.values(store.items || {});
  const categories = Object.values(store.categories || {});

  document.getElementById('statTotal').textContent = items.length;

  const lowCount = items.filter(i => i.qty <= i.minStock && i.qty > 0).length +
                   items.filter(i => i.qty <= 0).length;
  document.getElementById('statLow').textContent = lowCount;
  document.getElementById('statCategories').textContent = categories.length;

  // Today's updates
  const today = new Date(); today.setHours(0,0,0,0);
  const todayUpdates = Object.values(store.auditlog || {}).filter(l => l.timestamp >= today.getTime()).length;
  document.getElementById('statUpdates').textContent = todayUpdates;

  // Category bars
  const catEl = document.getElementById('categoryChart');
  if (categories.length === 0) {
    catEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🗂️</div>No categories yet</div>';
  } else {
    const catCounts = {};
    items.forEach(item => {
      if (!catCounts[item.categoryId]) catCounts[item.categoryId] = 0;
      catCounts[item.categoryId]++;
    });
    const maxCount = Math.max(...Object.values(catCounts), 1);
    catEl.innerHTML = categories.slice(0, 6).map(cat => {
      const count = catCounts[cat.id] || 0;
      const pct = (count / maxCount * 100).toFixed(0);
      return `<div class="cat-bar-item">
        <div class="cat-bar-label">
          <span>${cat.icon} ${cat.name}</span>
          <span style="font-family:var(--font-mono)">${count} items</span>
        </div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width:${pct}%;background:${cat.color || 'var(--teal)'}"></div>
        </div>
      </div>`;
    }).join('');
  }

  // Recent activity
  const logs = Object.values(store.auditlog || {}).sort((a,b) => b.timestamp - a.timestamp).slice(0, 8);
  const actEl = document.getElementById('recentActivity');
  if (logs.length === 0) {
    actEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>No activity yet</div>';
  } else {
    actEl.innerHTML = logs.map(log => {
      const ago = timeAgo(log.timestamp);
      return `<div class="activity-item">
        <div class="activity-dot"></div>
        <div class="activity-text"><strong>${log.userName}</strong> ${log.action} <em>${log.itemName}</em>
          ${log.change ? `<span style="color:var(--teal);font-weight:600"> ${log.change}</span>` : ''}</div>
        <div class="activity-time">${ago}</div>
      </div>`;
    }).join('');
  }
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return Math.floor(diff/86400000) + 'd ago';
}

// ============================================================
// INVENTORY
// ============================================================
function renderInventory() {
  populateCategoryFilter();
  renderInventoryTable();

  document.getElementById('searchInput').oninput = renderInventoryTable;
  document.getElementById('filterCategory').onchange = renderInventoryTable;
}

function populateCategoryFilter() {
  const cats = Object.values(store.categories || {});
  const sel = document.getElementById('filterCategory');
  sel.innerHTML = '<option value="">All Categories</option>' +
    cats.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
}

function renderInventoryTable() {
  const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const catFilter = document.getElementById('filterCategory')?.value || '';

  let items = Object.values(store.items || {});
  if (search) items = items.filter(i => i.name.toLowerCase().includes(search));
  if (catFilter) items = items.filter(i => i.categoryId === catFilter);
  items.sort((a,b) => a.name.localeCompare(b.name));

  const tbody = document.getElementById('inventoryTableBody');
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-icon">📦</div>No items found</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(item => `
    <tr>
      <td><strong>${item.name}</strong></td>
      <td>${getCategoryIcon(item.categoryId)} ${getCategoryName(item.categoryId)}</td>
      <td><span class="qty-display">${item.qty}</span></td>
      <td><span class="tag">${item.unit}</span></td>
      <td><span style="font-family:var(--font-mono);color:var(--text-muted)">${item.minStock || 0} ${item.unit}</span></td>
      <td>${getStatusBadge(item.qty, item.minStock || 0)}</td>
      <td>
        <div style="font-size:12px">
          <div style="font-weight:600">${item.lastUpdatedByName || item.lastUpdatedBy || '—'}</div>
          <div style="color:var(--text-muted)">${formatDate(item.lastUpdatedAt)}</div>
        </div>
      </td>
      <td>
        <div class="action-btns">
          <button class="btn-icon edit" onclick="editItem('${item.id}')">✏️ Edit</button>
          ${currentUser?.role === 'master' ? `<button class="btn-icon del" onclick="deleteItem('${item.id}')">🗑️</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

// ============================================================
// ADD/UPDATE STOCK PAGE
// ============================================================
function renderAddStock() {
  const items = Object.values(store.items || {}).sort((a,b) => a.name.localeCompare(b.name));
  const sel = document.getElementById('stockItemSelect');
  sel.innerHTML = '<option value="">-- Choose Item --</option>' +
    items.map(i => `<option value="${i.id}">${getCategoryIcon(i.categoryId)} ${i.name} (${i.qty} ${i.unit})</option>`).join('');

  renderQuickOverview();
}

function renderQuickOverview() {
  const items = Object.values(store.items || {}).sort((a,b) => a.name.localeCompare(b.name));
  document.getElementById('quickOverview').innerHTML = items.map(i => {
    const isLow = i.qty <= (i.minStock || 0) && i.qty > 0;
    const isOut = i.qty <= 0;
    const color = isOut ? 'var(--rust)' : isLow ? 'var(--gold)' : 'var(--teal)';
    return `<div class="quick-item" style="border-color:${color}">
      <div class="quick-item-name">${getCategoryIcon(i.categoryId)} ${i.name}</div>
      <div class="quick-item-qty" style="color:${color}">${i.qty}</div>
      <div class="quick-item-unit">${i.unit}</div>
    </div>`;
  }).join('');
}

function updateStock() {
  const itemId = document.getElementById('stockItemSelect').value;
  const action = document.getElementById('stockAction').value;
  const qty = parseFloat(document.getElementById('stockQty').value);
  const note = document.getElementById('stockNote').value.trim();

  if (!itemId) { showToast('Please select an item', 'warning'); return; }
  if (isNaN(qty) || qty < 0) { showToast('Enter a valid quantity', 'warning'); return; }

  const item = store.items[itemId];
  if (!item) return;

  const oldQty = item.qty;
  let newQty;
  let actionText;
  let changeText;

  if (action === 'add') {
    newQty = oldQty + qty;
    actionText = 'added stock to';
    changeText = `+${qty} ${item.unit} (${oldQty} → ${newQty})`;
  } else if (action === 'remove') {
    newQty = Math.max(0, oldQty - qty);
    actionText = 'consumed/removed from';
    changeText = `-${qty} ${item.unit} (${oldQty} → ${newQty})`;
  } else {
    newQty = qty;
    actionText = 'set stock for';
    changeText = `Set to ${qty} ${item.unit} (was ${oldQty})`;
  }

  store.items[itemId] = {
    ...item,
    qty: newQty,
    lastUpdatedBy: currentUser.username,
    lastUpdatedByName: currentUser.name,
    lastUpdatedAt: Date.now()
  };

  // Audit log
  const logId = genId('log');
  store.auditlog[logId] = {
    id: logId,
    timestamp: Date.now(),
    userId: currentUser.username,
    userName: currentUser.name,
    action: actionText,
    itemId: itemId,
    itemName: item.name,
    change: changeText,
    note: note || ''
  };

  saveStore();

  if (useFirebase && db) {
    db.ref('store/items/' + itemId).set(store.items[itemId]);
    db.ref('store/auditlog/' + logId).set(store.auditlog[logId]);
  }

  document.getElementById('stockItemSelect').value = '';
  document.getElementById('stockQty').value = '';
  document.getElementById('stockNote').value = '';

  renderAddStock();
  showToast(`✅ Stock updated: ${changeText}`, 'success');
}

// ============================================================
// LOW STOCK
// ============================================================
function renderLowStock() {
  const items = Object.values(store.items || {}).filter(i => i.qty <= (i.minStock || 0));
  const tbody = document.getElementById('lowStockBody');

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-icon">✅</div>All items are well stocked!</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(i => {
    const shortage = Math.max(0, (i.minStock || 0) - i.qty);
    return `<tr>
      <td><strong>${i.name}</strong></td>
      <td>${getCategoryIcon(i.categoryId)} ${getCategoryName(i.categoryId)}</td>
      <td><span class="qty-display" style="color:${i.qty<=0?'var(--rust)':'var(--gold)'}">${i.qty}</span></td>
      <td style="font-family:var(--font-mono)">${i.minStock || 0}</td>
      <td><span class="tag">${i.unit}</span></td>
      <td><span style="color:var(--rust);font-weight:700;font-family:var(--font-mono)">-${shortage} ${i.unit}</span></td>
    </tr>`;
  }).join('');
}

// ============================================================
// AUDIT LOG
// ============================================================
function loadAuditLog() {
  document.getElementById('logDate').value = '';
  document.getElementById('logUser').value = '';

  const users = Object.values(store.users || {});
  const userSel = document.getElementById('logUser');
  userSel.innerHTML = '<option value="">All Users</option>' +
    users.map(u => `<option value="${u.username}">${u.name}</option>`).join('');

  renderAuditLog();
}

function filterAuditLog() {
  renderAuditLog();
}

function renderAuditLog() {
  let logs = Object.values(store.auditlog || {}).sort((a,b) => b.timestamp - a.timestamp);

  const dateFilter = document.getElementById('logDate')?.value;
  const userFilter = document.getElementById('logUser')?.value;

  if (dateFilter) {
    const d = new Date(dateFilter);
    d.setHours(0,0,0,0);
    const end = new Date(d); end.setDate(end.getDate()+1);
    logs = logs.filter(l => l.timestamp >= d.getTime() && l.timestamp < end.getTime());
  }

  if (userFilter) {
    logs = logs.filter(l => l.userId === userFilter);
  }

  const tbody = document.getElementById('auditBody');
  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-icon">📋</div>No audit records found</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(log => `
    <tr>
      <td style="font-family:var(--font-mono);font-size:12px;white-space:nowrap">${formatDate(log.timestamp)}</td>
      <td>
        <span class="user-badge ${log.userId === 'master' ? 'master' : ''}">
          👤 ${log.userName}
        </span>
      </td>
      <td style="text-transform:capitalize">${log.action}</td>
      <td><strong>${log.itemName}</strong></td>
      <td style="font-family:var(--font-mono);font-size:12px;color:var(--teal)">${log.change || '—'}</td>
      <td style="color:var(--text-muted);font-size:12px">${log.note || '—'}</td>
    </tr>
  `).join('');
}

// ============================================================
// ITEM MODAL — Add / Edit
// ============================================================
function openAddModal() {
  document.getElementById('itemModalTitle').textContent = 'Add New Item';
  document.getElementById('editItemId').value = '';
  document.getElementById('itemName').value = '';
  document.getElementById('itemQty').value = '';
  document.getElementById('itemMin').value = '';
  document.getElementById('itemDesc').value = '';

  populateItemCategoryDropdown();
  openModal('itemModal');
}

function editItem(id) {
  const item = store.items[id];
  if (!item) return;
  document.getElementById('itemModalTitle').textContent = 'Edit Item';
  document.getElementById('editItemId').value = id;
  document.getElementById('itemName').value = item.name;
  document.getElementById('itemQty').value = item.qty;
  document.getElementById('itemMin').value = item.minStock || 0;
  document.getElementById('itemDesc').value = item.description || '';
  document.getElementById('itemUnit').value = item.unit || 'pcs';

  populateItemCategoryDropdown(item.categoryId);
  openModal('itemModal');
}

function populateItemCategoryDropdown(selectedId) {
  const cats = Object.values(store.categories || {});
  const sel = document.getElementById('itemCategory');
  sel.innerHTML = cats.map(c =>
    `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${c.icon} ${c.name}</option>`
  ).join('');
}

function saveItem() {
  const id = document.getElementById('editItemId').value;
  const name = document.getElementById('itemName').value.trim();
  const catId = document.getElementById('itemCategory').value;
  const qty = parseFloat(document.getElementById('itemQty').value);
  const unit = document.getElementById('itemUnit').value;
  const min = parseFloat(document.getElementById('itemMin').value) || 0;
  const desc = document.getElementById('itemDesc').value.trim();

  if (!name) { showToast('Item name is required', 'warning'); return; }
  if (!catId) { showToast('Please select a category', 'warning'); return; }
  if (isNaN(qty)) { showToast('Enter a valid quantity', 'warning'); return; }

  const isNew = !id;
  const itemId = id || genId('item');

  const item = {
    id: itemId,
    name,
    categoryId: catId,
    qty,
    unit,
    minStock: min,
    description: desc,
    lastUpdatedBy: currentUser.username,
    lastUpdatedByName: currentUser.name,
    lastUpdatedAt: Date.now(),
    createdAt: store.items[itemId]?.createdAt || Date.now()
  };

  store.items[itemId] = item;

  // Audit
  const logId = genId('log');
  store.auditlog[logId] = {
    id: logId,
    timestamp: Date.now(),
    userId: currentUser.username,
    userName: currentUser.name,
    action: isNew ? 'added new item' : 'edited item',
    itemId: itemId,
    itemName: name,
    change: isNew ? `Created with ${qty} ${unit}` : `Qty: ${qty} ${unit}`,
    note: ''
  };

  saveStore();

  if (useFirebase && db) {
    db.ref('store/items/' + itemId).set(item);
    db.ref('store/auditlog/' + logId).set(store.auditlog[logId]);
  }

  closeModal('itemModal');
  renderInventory();
  showToast(isNew ? '✅ Item added successfully' : '✅ Item updated', 'success');
}

function deleteItem(id) {
  if (!confirm('Delete this item? This cannot be undone.')) return;
  const name = store.items[id]?.name || 'Unknown';
  delete store.items[id];

  const logId = genId('log');
  store.auditlog[logId] = {
    id: logId,
    timestamp: Date.now(),
    userId: currentUser.username,
    userName: currentUser.name,
    action: 'deleted item',
    itemId: id,
    itemName: name,
    change: 'Removed from inventory',
    note: ''
  };

  saveStore();

  if (useFirebase && db) {
    db.ref('store/items/' + id).remove();
    db.ref('store/auditlog/' + logId).set(store.auditlog[logId]);
  }

  renderInventory();
  showToast('🗑️ Item deleted', 'warning');
}

// ============================================================
// USERS
// ============================================================
function renderUsers() {
  const users = Object.values(store.users || {}).sort((a,b) => a.name.localeCompare(b.name));
  const tbody = document.getElementById('usersBody');

  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>${u.name}</strong></td>
      <td style="font-family:var(--font-mono)">${u.username}</td>
      <td><span class="user-badge ${u.role === 'master' ? 'master' : ''}">${u.role}</span></td>
      <td style="font-size:12px;color:var(--text-muted)">${formatDate(u.createdAt)}</td>
      <td>
        ${u.username !== 'master' ? `
          <div class="action-btns">
            <button class="btn-icon edit" onclick="editUser('${u.username}')">✏️ Edit</button>
            <button class="btn-icon del" onclick="deleteUser('${u.username}')">🗑️</button>
          </div>` : '<span style="color:var(--text-muted);font-size:12px">Protected</span>'}
      </td>
    </tr>
  `).join('');
}

function openUserModal() {
  document.getElementById('userName').value = '';
  document.getElementById('userUsername').value = '';
  document.getElementById('userPass').value = '';
  document.getElementById('userRole').value = 'staff';
  openModal('userModal');
}

function editUser(username) {
  const u = store.users[username];
  if (!u) return;
  document.getElementById('userName').value = u.name;
  document.getElementById('userUsername').value = u.username;
  document.getElementById('userPass').value = '';
  document.getElementById('userRole').value = u.role;
  document.getElementById('userModal').querySelector('h3').textContent = 'Edit Employee';
  document.getElementById('userModal').dataset.editId = username;
  openModal('userModal');
}

function saveUser() {
  const name = document.getElementById('userName').value.trim();
  const username = document.getElementById('userUsername').value.trim().toLowerCase();
  const pass = document.getElementById('userPass').value;
  const role = document.getElementById('userRole').value;
  const editId = document.getElementById('userModal').dataset.editId;

  if (!name || !username) { showToast('Name and username required', 'warning'); return; }

  if (!editId) {
    if (store.users[username]) { showToast('Username already exists', 'error'); return; }
    if (!pass) { showToast('Password required for new user', 'warning'); return; }
  }

  const user = {
    name, username, role,
    password: pass || store.users[editId]?.password || '',
    createdAt: store.users[editId]?.createdAt || Date.now()
  };

  if (editId && editId !== username) delete store.users[editId];
  store.users[username] = user;

  saveStore();

  if (useFirebase && db) {
    db.ref('store/users/' + username).set(user);
    if (editId && editId !== username) db.ref('store/users/' + editId).remove();
  }

  delete document.getElementById('userModal').dataset.editId;
  document.getElementById('userModal').querySelector('h3').textContent = 'Add Employee Account';
  closeModal('userModal');
  renderUsers();
  showToast('✅ User saved successfully', 'success');
}

function deleteUser(username) {
  if (username === 'master') return;
  if (!confirm('Delete this user account?')) return;
  delete store.users[username];
  saveStore();
  if (useFirebase && db) db.ref('store/users/' + username).remove();
  renderUsers();
  showToast('🗑️ User deleted', 'warning');
}

// ============================================================
// CATEGORIES
// ============================================================
function renderCategories() {
  const cats = Object.values(store.categories || {});
  const grid = document.getElementById('categoriesGrid');

  if (cats.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🗂️</div>No categories yet</div>';
    return;
  }

  grid.innerHTML = cats.map(cat => {
    const itemCount = Object.values(store.items || {}).filter(i => i.categoryId === cat.id).length;
    return `<div class="cat-card" style="border-color:${cat.color || 'var(--teal)'}">
      <div class="cat-card-icon">${cat.icon || '📦'}</div>
      <div class="cat-card-name">${cat.name}</div>
      <div class="cat-card-count">${itemCount} item${itemCount !== 1 ? 's' : ''}</div>
      <div class="cat-card-actions">
        <button class="btn-icon edit" onclick="editCategory('${cat.id}')">✏️</button>
        ${itemCount === 0 ? `<button class="btn-icon del" onclick="deleteCategory('${cat.id}')">🗑️</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function openCatModal() {
  document.getElementById('catName').value = '';
  document.getElementById('catIcon').value = '';
  document.getElementById('catColor').value = '#0e9b8c';
  document.getElementById('editCatId').value = '';
  openModal('catModal');
}

function editCategory(id) {
  const cat = store.categories[id];
  if (!cat) return;
  document.getElementById('catName').value = cat.name;
  document.getElementById('catIcon').value = cat.icon || '';
  document.getElementById('catColor').value = cat.color || '#0e9b8c';
  document.getElementById('editCatId').value = id;
  openModal('catModal');
}

function saveCategory() {
  const name = document.getElementById('catName').value.trim();
  const icon = document.getElementById('catIcon').value.trim() || '📦';
  const color = document.getElementById('catColor').value;
  const editId = document.getElementById('editCatId').value;

  if (!name) { showToast('Category name required', 'warning'); return; }

  const id = editId || genId('cat');
  const cat = {
    id, name, icon, color,
    createdAt: store.categories[id]?.createdAt || Date.now()
  };

  store.categories[id] = cat;
  saveStore();

  if (useFirebase && db) {
    db.ref('store/categories/' + id).set(cat);
  }

  closeModal('catModal');
  renderCategories();
  showToast('✅ Category saved', 'success');
}

function deleteCategory(id) {
  const itemsInCat = Object.values(store.items || {}).filter(i => i.categoryId === id).length;
  if (itemsInCat > 0) { showToast('Cannot delete: category has items', 'error'); return; }
  if (!confirm('Delete this category?')) return;
  delete store.categories[id];
  saveStore();
  if (useFirebase && db) db.ref('store/categories/' + id).remove();
  renderCategories();
  showToast('🗑️ Category deleted', 'warning');
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

// Keyboard ESC to close modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  }
});
