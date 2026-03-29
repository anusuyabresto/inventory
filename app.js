// ================================================================
// ANUSUYA RESTAURANT & BAR — INVENTORY MANAGEMENT SYSTEM v2.0
// Firebase Realtime DB | Sealed + Loose Stock | Audit Log | PWA
// Developed by Aarav (Ravi)
// ================================================================

// ----------------------------------------------------------------
// FIREBASE CONFIG — Paste your config here
// ----------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyD2JVvyLhXLpz3Ccp5Xj_Dv6K4G3O9t3ms",
  authDomain: "anusuya-inventory.firebaseapp.com",
  databaseURL: "https://anusuya-inventory-default-rtdb.firebaseio.com",
  projectId: "anusuya-inventory",
  storageBucket: "anusuya-inventory.firebasestorage.app",
  messagingSenderId: "408509187920",
  appId: "1:408509187920:web:81ea96c402601197dfce55",
  measurementId: "G-YCYLDWBDE5"
};

// ----------------------------------------------------------------
// INIT FIREBASE
// ----------------------------------------------------------------
let db = null;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  console.log("✅ Firebase connected — Anusuya Inventory");
} catch(e) {
  console.error("Firebase init error:", e);
}

// ----------------------------------------------------------------
// GLOBAL STATE
// ----------------------------------------------------------------
let currentUser = null;
let currentPage = 'dashboard';
let purchaseRows = [];
let pendingOpenSealed = null; // for the open-sealed modal

// ----------------------------------------------------------------
// FIREBASE HELPERS — All data lives in Firebase
// ----------------------------------------------------------------
function fbRef(path) { return db.ref(path); }

function fbGet(path) {
  return fbRef(path).once('value').then(s => s.val());
}

function fbSet(path, data) {
  return fbRef(path).set(data);
}

function fbPush(path, data) {
  return fbRef(path).push(data);
}

function fbRemove(path) {
  return fbRef(path).remove();
}

function fbUpdate(path, data) {
  return fbRef(path).update(data);
}

// ----------------------------------------------------------------
// INIT APP
// ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Sidebar logo same as login logo
  const logoImg = document.getElementById('logoImg');
  if (logoImg) {
    document.getElementById('sbLogo').src = logoImg.src;
  }

  // Fix: Master account pehle ensure karo, login se pehle
  try {
    await ensureMasterAccount();
  } catch(e) {
    console.warn('ensureMasterAccount on init failed:', e);
  }

  initLogin();
  initNav();
  startClock();

  // Check session
  const su = sessionStorage.getItem('anusuya_user');
  if (su) {
    currentUser = JSON.parse(su);
    await enterApp();
  }

  // PWA install
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window._pwaPrompt = e;
  });

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});

// ----------------------------------------------------------------
// LOGIN
// ----------------------------------------------------------------
function initLogin() {
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUser').value.trim().toLowerCase();
    const password = document.getElementById('loginPass').value;
    document.getElementById('loginError').textContent = '';

    try {
      const users = await fbGet('users');
      if (!users) { showLoginError('No users found. Contact admin.'); return; }

      const user = Object.values(users).find(u =>
        u.username === username && u.password === password
      );

      if (user) {
        currentUser = user;
        sessionStorage.setItem('anusuya_user', JSON.stringify(user));
        await enterApp();
      } else {
        showLoginError('Invalid username or password.');
      }
    } catch(err) {
      showLoginError('Connection error. Check internet.');
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    currentUser = null;
    sessionStorage.removeItem('anusuya_user');
    document.getElementById('appScreen').classList.remove('active');
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    // Remove Firebase listeners
    db.ref('/').off();
  });
}

function showLoginError(msg) {
  document.getElementById('loginError').textContent = msg;
}

async function enterApp() {
  // ensureMasterAccount already called on init, skip here

  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('appScreen').classList.add('active');

  document.getElementById('sbName').textContent = currentUser.name;
  document.getElementById('sbRole').textContent =
    currentUser.role === 'master' ? 'Master Admin' :
    currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
  document.getElementById('sbAv').textContent = currentUser.name.charAt(0).toUpperCase();

  // Hide master-only nav for non-master
  document.querySelectorAll('.mo').forEach(el => {
    el.style.display = (currentUser.role !== 'master') ? 'none' : '';
  });

  navigateTo('dashboard');
}

async function ensureMasterAccount() {
  const exists = await fbGet('users/master');
  if (!exists) {
    await fbSet('users/master', {
      name: 'Master Admin',
      username: 'master',
      password: 'ansuya@123',
      role: 'master',
      createdAt: Date.now()
    });
  }
  await ensureDefaultData();
}

async function ensureDefaultData() {
  const cats = await fbGet('categories');
  if (cats) return; // already initialized

  // Default categories
  const defaultCats = [
    { name: 'Seafood — Fresh Catch', icon: '🐟', color: '#0e9b8c' },
    { name: 'Spirits & Liquor', icon: '🥃', color: '#c9972a' },
    { name: 'Beer', icon: '🍺', color: '#b84a2a' },
    { name: 'Soft Drinks & Water', icon: '💧', color: '#2563eb' },
    { name: 'Vegetables & Greens', icon: '🥦', color: '#22c55e' },
    { name: 'Rice & Grains', icon: '🌾', color: '#f59e0b' },
    { name: 'Oils & Condiments', icon: '🫙', color: '#8b5cf6' },
    { name: 'Dairy & Eggs', icon: '🥚', color: '#ec4899' },
    { name: 'Frozen Items', icon: '❄️', color: '#06b6d4' },
    { name: 'Puddings & Desserts', icon: '🍮', color: '#f97316' },
    { name: 'Masalas & Spices', icon: '🌶️', color: '#ef4444' },
    { name: 'Cleaning & Misc', icon: '🧹', color: '#6b7280' },
  ];

  for (const cat of defaultCats) {
    const ref = db.ref('categories').push();
    await ref.set({ ...cat, id: ref.key, createdAt: Date.now() });
  }

  // Default items (based on the Fresh Catch board in photos)
  const catSnap = await fbGet('categories');
  const catIds = Object.keys(catSnap);
  const fishCatId = catIds[0];
  const spiritsCatId = catIds[1];
  const beerCatId = catIds[2];
  const waterCatId = catIds[3];
  const riceCatId = catIds[5];

  const defaultItems = [
    { name: 'Kingfish (Surmai)', catId: fishCatId, sealedQty: 0, looseQty: 5, sealedUnit: 'bag', looseUnit: 'kg', capacity: 5, minSealed: 0, minLoose: 2 },
    { name: 'Chonak (Snapper)', catId: fishCatId, sealedQty: 0, looseQty: 4, sealedUnit: 'bag', looseUnit: 'kg', capacity: 5, minSealed: 0, minLoose: 2 },
    { name: 'Squids', catId: fishCatId, sealedQty: 0, looseQty: 2, sealedUnit: 'bag', looseUnit: 'kg', capacity: 5, minSealed: 0, minLoose: 1 },
    { name: 'Lepo Fish', catId: fishCatId, sealedQty: 0, looseQty: 1.5, sealedUnit: 'bag', looseUnit: 'kg', capacity: 5, minSealed: 0, minLoose: 1 },
    { name: 'Prawns', catId: fishCatId, sealedQty: 0, looseQty: 3.5, sealedUnit: 'bag', looseUnit: 'kg', capacity: 5, minSealed: 0, minLoose: 2 },
    { name: 'Mackerel (Bangda)', catId: fishCatId, sealedQty: 0, looseQty: 2, sealedUnit: 'bag', looseUnit: 'kg', capacity: 5, minSealed: 0, minLoose: 1 },
    { name: 'Kingfisher Beer 650ml', catId: beerCatId, sealedQty: 4, looseQty: 0, sealedUnit: 'crate', looseUnit: 'bottle', capacity: 12, minSealed: 1, minLoose: 0 },
    { name: 'Aquafina Water 1L', catId: waterCatId, sealedQty: 2, looseQty: 0, sealedUnit: 'packet', looseUnit: 'bottle', capacity: 12, minSealed: 1, minLoose: 0 },
    { name: 'Johnnie Walker Black Label 750ml', catId: spiritsCatId, sealedQty: 2, looseQty: 450, sealedUnit: 'bottle', looseUnit: 'ml', capacity: 750, minSealed: 1, minLoose: 90 },
    { name: 'Bacardi White Rum 750ml', catId: spiritsCatId, sealedQty: 1, looseQty: 300, sealedUnit: 'bottle', looseUnit: 'ml', capacity: 750, minSealed: 1, minLoose: 90 },
    { name: 'Jack Daniel\'s 750ml', catId: spiritsCatId, sealedQty: 1, looseQty: 0, sealedUnit: 'bottle', looseUnit: 'ml', capacity: 750, minSealed: 1, minLoose: 0 },
    { name: 'Basmati Rice', catId: riceCatId, sealedQty: 1, looseQty: 8, sealedUnit: 'sack', looseUnit: 'kg', capacity: 25, minSealed: 0, minLoose: 5 },
  ];

  for (const item of defaultItems) {
    const ref = db.ref('items').push();
    await ref.set({
      ...item, id: ref.key,
      description: '',
      lastUpdatedBy: 'master',
      lastUpdatedByName: 'Master Admin',
      lastUpdatedAt: Date.now(),
      createdAt: Date.now()
    });
  }
}

// ----------------------------------------------------------------
// NAV
// ----------------------------------------------------------------
function initNav() {
  document.querySelectorAll('.ni').forEach(link => {
    link.addEventListener('click', () => {
      const p = link.dataset.p;
      navigateTo(p);
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  document.getElementById('hburg').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

function navigateTo(p) {
  currentPage = p;
  document.querySelectorAll('.ni').forEach(l => l.classList.remove('active'));
  document.querySelector(`.ni[data-p="${p}"]`)?.classList.add('active');
  document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
  document.getElementById(`pg-${p}`)?.classList.add('active');

  const titles = {
    dashboard:'Dashboard', inventory:'Inventory',
    stock:'Update Stock', lowstock:'Low Stock Alerts',
    audit:'Audit Log', users:'Manage Users',
    categories:'Categories', purchase:'Purchase Entry'
  };
  document.getElementById('pgTitle').textContent = titles[p] || p;

  switch(p) {
    case 'dashboard': renderDashboard(); break;
    case 'inventory': renderInventory(); break;
    case 'stock': renderStockPage(); break;
    case 'lowstock': renderLowStock(); break;
    case 'audit': renderAudit(); break;
    case 'users': renderUsers(); break;
    case 'categories': renderCategories(); break;
    case 'purchase': renderPurchase(); break;
  }
}

// ----------------------------------------------------------------
// CLOCK
// ----------------------------------------------------------------
function startClock() {
  const update = () => {
    const n = new Date();
    document.getElementById('clock').textContent =
      n.toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short' }) +
      '  ' + n.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
  };
  update(); setInterval(update, 30000);
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
function genId(p) { return p + '_' + Date.now() + '_' + Math.random().toString(36).substr(2,6); }

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}

function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d/60000) + 'm ago';
  if (d < 86400000) return Math.floor(d/3600000) + 'h ago';
  return Math.floor(d/86400000) + 'd ago';
}

function showToast(msg, type='ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.className = 'toast', 3200);
}

async function getCats() { return (await fbGet('categories')) || {}; }
async function getItems() { return (await fbGet('items')) || {}; }
async function getLogs() { return (await fbGet('auditlog')) || {}; }
async function getUsers() { return (await fbGet('users')) || {}; }

function catName(cats, id) { return cats[id]?.name || '—'; }
function catIcon(cats, id) { return cats[id]?.icon || '📦'; }

function statusBadge(item) {
  const total = (item.sealedQty || 0) + (item.looseQty || 0);
  if (total <= 0) return '<span class="badge b-out">Out of Stock</span>';
  const minT = (item.minSealed || 0) + (item.minLoose || 0);
  if ((item.sealedQty || 0) <= (item.minSealed || 0) || (item.looseQty || 0) < (item.minLoose || 0))
    return '<span class="badge b-low">Low Stock</span>';
  return '<span class="badge b-ok">In Stock</span>';
}

// ----------------------------------------------------------------
// DASHBOARD
// ----------------------------------------------------------------
async function renderDashboard() {
  const [items, cats, logs] = await Promise.all([getItems(), getCats(), getLogs()]);
  const itemArr = Object.values(items);
  const catArr = Object.values(cats);

  const lowItems = itemArr.filter(i =>
    (i.sealedQty || 0) <= (i.minSealed || 0) ||
    (i.looseQty || 0) < (i.minLoose || 0)
  );
  const today = new Date(); today.setHours(0,0,0,0);
  const todayLogs = Object.values(logs).filter(l => l.timestamp >= today.getTime());

  document.getElementById('statsRow').innerHTML = `
    <div class="sc g"><div class="sc-icon">📦</div><div><div class="sc-num">${itemArr.length}</div><div class="sc-lbl">Total Items</div></div></div>
    <div class="sc r"><div class="sc-icon">⚠️</div><div><div class="sc-num">${lowItems.length}</div><div class="sc-lbl">Low / Out Stock</div></div></div>
    <div class="sc t"><div class="sc-icon">🗂️</div><div><div class="sc-num">${catArr.length}</div><div class="sc-lbl">Categories</div></div></div>
    <div class="sc d"><div class="sc-icon">🔄</div><div><div class="sc-num">${todayLogs.length}</div><div class="sc-lbl">Today's Updates</div></div></div>
  `;

  // Category bars
  const catCounts = {};
  itemArr.forEach(i => { catCounts[i.catId] = (catCounts[i.catId] || 0) + 1; });
  const maxC = Math.max(...Object.values(catCounts), 1);
  document.getElementById('catBars').innerHTML = catArr.slice(0, 7).map(c => {
    const n = catCounts[c.id] || 0;
    return `<div class="cat-bi">
      <div class="cat-bl"><span>${c.icon} ${c.name}</span><span style="font-family:var(--fm)">${n}</span></div>
      <div class="cat-bt"><div class="cat-bf" style="width:${(n/maxC*100).toFixed(0)}%;background:${c.color||'var(--gold)'}"></div></div>
    </div>`;
  }).join('') || '<div class="empty"><span class="emp-i">🗂️</span>No categories</div>';

  // Recent activity
  const recent = Object.values(logs).sort((a,b) => b.timestamp - a.timestamp).slice(0, 7);
  document.getElementById('recentAct').innerHTML = recent.length ? recent.map(l =>
    `<div class="act-item"><div class="act-dot"></div>
    <div class="act-t"><strong>${l.userName}</strong> ${l.action} <em>${l.itemName}</em>
    ${l.change ? `<span style="color:var(--gold);font-weight:600"> ${l.change}</span>` : ''}</div>
    <div class="act-tm">${timeAgo(l.timestamp)}</div></div>`
  ).join('') : '<div class="empty"><span class="emp-i">📋</span>No activity yet</div>';

  // Low stock quick list
  document.getElementById('dashLow').innerHTML = lowItems.length ?
    `<table class="tbl"><thead><tr><th>Item</th><th>Category</th><th>Sealed</th><th>Loose</th><th>Status</th></tr></thead><tbody>` +
    lowItems.map(i => `<tr>
      <td><strong>${i.name}</strong></td>
      <td>${catIcon(cats, i.catId)} ${catName(cats, i.catId)}</td>
      <td class="qty-n qty-s">${i.sealedQty || 0} <span style="font-size:11px;color:var(--muted)">${i.sealedUnit || ''}</span></td>
      <td class="qty-n qty-l">${i.looseQty || 0} <span style="font-size:11px;color:var(--muted)">${i.looseUnit || ''}</span></td>
      <td>${statusBadge(i)}</td>
    </tr>`).join('') + '</tbody></table>' :
    '<div class="empty" style="padding:20px"><span>✅</span> All items well stocked!</div>';
}

// ----------------------------------------------------------------
// INVENTORY
// ----------------------------------------------------------------
async function renderInventory() {
  const [items, cats] = await Promise.all([getItems(), getCats()]);

  // Populate category filter
  const fltEl = document.getElementById('fltCat');
  fltEl.innerHTML = '<option value="">All Categories</option>' +
    Object.values(cats).map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');

  document.getElementById('srch').oninput = () => filterInventory(items, cats);
  document.getElementById('fltCat').onchange = () => filterInventory(items, cats);
  document.getElementById('fltStatus').onchange = () => filterInventory(items, cats);

  filterInventory(items, cats);
}

function filterInventory(items, cats) {
  const srch = (document.getElementById('srch')?.value || '').toLowerCase();
  const fltCat = document.getElementById('fltCat')?.value || '';
  const fltSt = document.getElementById('fltStatus')?.value || '';

  let arr = Object.values(items);
  if (srch) arr = arr.filter(i => i.name.toLowerCase().includes(srch) || (cats[i.catId]?.name || '').toLowerCase().includes(srch));
  if (fltCat) arr = arr.filter(i => i.catId === fltCat);
  if (fltSt === 'ok') arr = arr.filter(i => (i.sealedQty||0) > (i.minSealed||0) && (i.looseQty||0) >= (i.minLoose||0));
  if (fltSt === 'low') arr = arr.filter(i => ((i.sealedQty||0) <= (i.minSealed||0) || (i.looseQty||0) < (i.minLoose||0)) && ((i.sealedQty||0)+(i.looseQty||0)) > 0);
  if (fltSt === 'out') arr = arr.filter(i => ((i.sealedQty||0) + (i.looseQty||0)) <= 0);

  arr.sort((a,b) => a.name.localeCompare(b.name));

  document.getElementById('invBody').innerHTML = arr.length ? arr.map(item => `
    <tr>
      <td><strong>${item.name}</strong>${item.description ? `<div style="font-size:11px;color:var(--muted)">${item.description}</div>` : ''}</td>
      <td>${catIcon(cats, item.catId)} ${catName(cats, item.catId)}</td>
      <td><span class="qty-n qty-s">${item.sealedQty || 0}</span> <span class="badge" style="font-size:10px">${item.sealedUnit || '—'}</span></td>
      <td><span class="qty-n qty-l">${item.looseQty || 0}</span> <span class="badge" style="font-size:10px">${item.looseUnit || '—'}</span></td>
      <td class="qty-n" style="color:var(--muted)">${((item.sealedQty||0) * (item.capacity||1) + (item.looseQty||0)).toFixed(2)} ${item.looseUnit||''}</td>
      <td><span class="badge" style="background:var(--surface);color:var(--muted)">${item.looseUnit || '—'}</span></td>
      <td style="font-size:12px;font-family:var(--fm)"><span style="color:var(--teal)">${item.minSealed||0} ${item.sealedUnit||''}</span> / <span style="color:var(--gold)">${item.minLoose||0} ${item.looseUnit||''}</span></td>
      <td>${statusBadge(item)}</td>
      <td><div style="font-size:11px"><div style="font-weight:600">${item.lastUpdatedByName||'—'}</div><div style="color:var(--muted)">${fmtDate(item.lastUpdatedAt)}</div></div></td>
      <td>
        <div class="ab">
          <button class="bi e" onclick="openEditItem('${item.id}')">✏️</button>
          ${currentUser?.role === 'master' ? `<button class="bi d" onclick="deleteItem('${item.id}','${item.name}')">🗑️</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('') :
    `<tr><td colspan="10" class="empty"><span class="emp-i">📦</span>No items found</td></tr>`;
}

// ----------------------------------------------------------------
// STOCK UPDATE PAGE
// ----------------------------------------------------------------
async function renderStockPage() {
  const items = await getItems();
  const arr = Object.values(items).sort((a,b) => a.name.localeCompare(b.name));
  const sel = document.getElementById('stItem');
  sel.innerHTML = '<option value="">-- Choose Item --</option>' +
    arr.map(i => `<option value="${i.id}">${i.name} | Sealed: ${i.sealedQty||0} ${i.sealedUnit||''} | Loose: ${i.looseQty||0} ${i.looseUnit||''}</option>`).join('');

  sel.onchange = () => showItemInfo(items);
  document.getElementById('stAction').onchange = () => showItemInfo(items);

  renderQuickView(items);
}

function showItemInfo(items) {
  const id = document.getElementById('stItem').value;
  const action = document.getElementById('stAction').value;
  const box = document.getElementById('stItemInfo');
  if (!id) { box.className = 'item-info-box'; return; }
  const item = items[id];
  if (!item) return;

  let html = `<strong>${item.name}</strong><br>
    🔒 Sealed: <strong>${item.sealedQty||0} ${item.sealedUnit||''}</strong>
    &nbsp;|&nbsp; 🔓 Loose: <strong>${item.looseQty||0} ${item.looseUnit||''}</strong>
    &nbsp;|&nbsp; Capacity: <strong>${item.capacity||'—'} ${item.looseUnit||''}</strong> per sealed unit`;

  if (action === 'open') {
    html += `<br><span style="color:var(--gold)">⚠️ Opening will move sealed → loose. 1 ${item.sealedUnit||'unit'} = ${item.capacity||'?'} ${item.looseUnit||''}</span>`;
  }
  box.innerHTML = html;
  box.className = 'item-info-box show';
}

async function renderQuickView(itemsData) {
  const items = itemsData || await getItems();
  const arr = Object.values(items).sort((a,b) => a.name.localeCompare(b.name));
  const total = (i) => (i.sealedQty||0) > 0 || (i.looseQty||0) > 0;
  document.getElementById('quickView').innerHTML = arr.map(i => {
    const isLow = (i.sealedQty||0) <= (i.minSealed||0) || (i.looseQty||0) < (i.minLoose||0);
    const isOut = (i.sealedQty||0) + (i.looseQty||0) <= 0;
    const bc = isOut ? 'var(--rust)' : isLow ? 'var(--gold)' : 'var(--teal)';
    return `<div class="qi" style="border-color:${bc}">
      <div class="qi-n">${i.name}</div>
      <div class="qi-sealed">${i.sealedQty||0}<span style="font-size:10px;color:var(--muted)"> ${i.sealedUnit||''}</span></div>
      <div class="qi-loose">${i.looseQty||0}<span style="font-size:10px;color:var(--muted)"> ${i.looseUnit||''}</span></div>
    </div>`;
  }).join('');
}

async function doUpdateStock() {
  const id = document.getElementById('stItem').value;
  const action = document.getElementById('stAction').value;
  const qty = parseFloat(document.getElementById('stQty').value);
  const container = document.getElementById('stContainer').value;
  const note = document.getElementById('stNote').value.trim();

  if (!id) { showToast('Please select an item', 'warn'); return; }
  if (isNaN(qty) || qty < 0) { showToast('Enter valid quantity', 'warn'); return; }

  const item = await fbGet('items/' + id);
  if (!item) { showToast('Item not found', 'err'); return; }

  let updates = {};
  let actionText = '';
  let changeText = '';

  if (action === 'open') {
    // Open sealed — show confirm modal
    pendingOpenSealed = { id, item, qty: 1, note };
    document.getElementById('openSealedMsg').innerHTML =
      `Opening 1 <strong>${item.sealedUnit}</strong> of <strong>${item.name}</strong><br>
      Will add <strong>${item.capacity||0} ${item.looseUnit}</strong> to loose stock.`;
    document.getElementById('openSealedCount').value = 1;
    document.getElementById('openSealedCount').max = item.sealedQty || 1;
    openModal('openSealedModal');
    return;
  }

  if (container === 'sealed') {
    const oldQty = item.sealedQty || 0;
    let newQty;
    if (action === 'add') { newQty = oldQty + qty; actionText = 'added sealed stock'; changeText = `+${qty} ${item.sealedUnit} (${oldQty}→${newQty})`; }
    else if (action === 'remove') { newQty = Math.max(0, oldQty - qty); actionText = 'removed sealed stock'; changeText = `-${qty} ${item.sealedUnit} (${oldQty}→${newQty})`; }
    else { newQty = qty; actionText = 'set sealed stock'; changeText = `Set ${qty} ${item.sealedUnit} (was ${oldQty})`; }
    updates.sealedQty = newQty;
  } else {
    const oldQty = item.looseQty || 0;
    let newQty;
    if (action === 'add') { newQty = oldQty + qty; actionText = 'added loose stock'; changeText = `+${qty} ${item.looseUnit} (${oldQty}→${newQty})`; }
    else if (action === 'remove') { newQty = Math.max(0, oldQty - qty); actionText = 'consumed loose'; changeText = `-${qty} ${item.looseUnit} (${oldQty}→${newQty})`; }
    else { newQty = qty; actionText = 'set loose stock'; changeText = `Set ${qty} ${item.looseUnit} (was ${oldQty})`; }
    updates.looseQty = newQty;
  }

  updates.lastUpdatedBy = currentUser.username;
  updates.lastUpdatedByName = currentUser.name;
  updates.lastUpdatedAt = Date.now();

  await fbUpdate('items/' + id, updates);
  await logAction(id, item.name, actionText, container, changeText, note);

  document.getElementById('stQty').value = '';
  document.getElementById('stNote').value = '';
  document.getElementById('stItemInfo').className = 'item-info-box';

  showToast(`✅ ${changeText}`, 'ok');
  renderStockPage();
}

async function confirmOpenSealed() {
  if (!pendingOpenSealed) return;
  const count = parseInt(document.getElementById('openSealedCount').value) || 1;
  const { id, item, note } = pendingOpenSealed;

  const newSealed = Math.max(0, (item.sealedQty || 0) - count);
  const addedLoose = count * (item.capacity || 0);
  const newLoose = (item.looseQty || 0) + addedLoose;
  const changeText = `Opened ${count} ${item.sealedUnit} → +${addedLoose} ${item.looseUnit} loose`;

  await fbUpdate('items/' + id, {
    sealedQty: newSealed,
    looseQty: newLoose,
    lastUpdatedBy: currentUser.username,
    lastUpdatedByName: currentUser.name,
    lastUpdatedAt: Date.now()
  });
  await logAction(id, item.name, 'opened sealed unit', 'sealed→loose', changeText, note);

  closeModal('openSealedModal');
  showToast(`✅ ${changeText}`, 'ok');
  pendingOpenSealed = null;
  renderStockPage();
}

async function logAction(itemId, itemName, action, container, change, note) {
  const logRef = db.ref('auditlog').push();
  await logRef.set({
    id: logRef.key,
    timestamp: Date.now(),
    userId: currentUser.username,
    userName: currentUser.name,
    userRole: currentUser.role,
    action, itemId, itemName, container,
    change: change || '',
    note: note || ''
  });
}

// ----------------------------------------------------------------
// LOW STOCK
// ----------------------------------------------------------------
async function renderLowStock() {
  const [items, cats] = await Promise.all([getItems(), getCats()]);
  const low = Object.values(items).filter(i =>
    (i.sealedQty||0) <= (i.minSealed||0) || (i.looseQty||0) < (i.minLoose||0)
  );
  low.sort((a,b) => a.name.localeCompare(b.name));

  document.getElementById('lowBody').innerHTML = low.length ? low.map(i => {
    const sShort = Math.max(0, (i.minSealed||0) - (i.sealedQty||0));
    const lShort = Math.max(0, (i.minLoose||0) - (i.looseQty||0));
    return `<tr>
      <td><strong>${i.name}</strong></td>
      <td>${catIcon(cats, i.catId)} ${catName(cats, i.catId)}</td>
      <td class="qty-n qty-s">${i.sealedQty||0} <span style="font-size:11px">${i.sealedUnit||''}</span></td>
      <td class="qty-n qty-l">${i.looseQty||0} <span style="font-size:11px">${i.looseUnit||''}</span></td>
      <td class="qty-n" style="color:var(--muted)">${((i.sealedQty||0)+(i.looseQty||0)).toFixed(2)}</td>
      <td style="font-size:12px"><span style="color:var(--teal)">${i.minSealed||0} ${i.sealedUnit||''}</span> / <span style="color:var(--gold)">${i.minLoose||0} ${i.looseUnit||''}</span></td>
      <td><span class="badge" style="background:var(--surface)">${i.looseUnit||i.sealedUnit||'—'}</span></td>
      <td style="color:var(--rust);font-weight:700;font-size:12px">
        ${sShort > 0 ? `-${sShort} ${i.sealedUnit}` : ''}
        ${lShort > 0 ? ` -${lShort} ${i.looseUnit}` : ''}
      </td>
    </tr>`;
  }).join('') :
    `<tr><td colspan="8" class="empty"><span class="emp-i">✅</span>All items well stocked!</td></tr>`;
}

// ----------------------------------------------------------------
// AUDIT LOG
// ----------------------------------------------------------------
async function renderAudit() {
  const [logs, users, cats] = await Promise.all([getLogs(), getUsers(), getCats()]);

  // Populate user filter
  const uSel = document.getElementById('auUser');
  uSel.innerHTML = '<option value="">All Users</option>' +
    Object.values(users).map(u => `<option value="${u.username}">${u.name}</option>`).join('');

  // Populate cat filter
  const cSel = document.getElementById('auCat');
  cSel.innerHTML = '<option value="">All Categories</option>' +
    Object.values(cats).map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');

  const dateF = document.getElementById('auDate')?.value;
  const userF = document.getElementById('auUser')?.value;

  let arr = Object.values(logs).sort((a,b) => b.timestamp - a.timestamp);
  if (dateF) {
    const d = new Date(dateF); d.setHours(0,0,0,0);
    const e = new Date(d); e.setDate(e.getDate()+1);
    arr = arr.filter(l => l.timestamp >= d.getTime() && l.timestamp < e.getTime());
  }
  if (userF) arr = arr.filter(l => l.userId === userF);

  document.getElementById('auBody').innerHTML = arr.length ? arr.map(l => `
    <tr>
      <td style="font-family:var(--fm);font-size:11px;white-space:nowrap">${fmtDate(l.timestamp)}</td>
      <td><span class="rb ${l.userId==='master'?'master':l.userRole||'staff'}">${l.userName}</span></td>
      <td><span class="rb ${l.userRole||'staff'}">${l.userRole||'—'}</span></td>
      <td style="text-transform:capitalize">${l.action}</td>
      <td><strong>${l.itemName}</strong></td>
      <td><span class="badge">${l.container||'—'}</span></td>
      <td style="font-family:var(--fm);font-size:11px;color:var(--teal)">${l.change||'—'}</td>
      <td style="color:var(--muted);font-size:12px">${l.note||'—'}</td>
    </tr>
  `).join('') :
    `<tr><td colspan="8" class="empty"><span class="emp-i">📋</span>No records found</td></tr>`;
}

function resetAuditFilter() {
  document.getElementById('auDate').value = '';
  document.getElementById('auUser').value = '';
  renderAudit();
}

// ----------------------------------------------------------------
// USERS
// ----------------------------------------------------------------
async function renderUsers() {
  const users = await getUsers();
  const arr = Object.values(users).sort((a,b) => a.name.localeCompare(b.name));
  document.getElementById('usersBody').innerHTML = arr.map(u => `
    <tr>
      <td><strong>${u.name}</strong></td>
      <td style="font-family:var(--fm)">${u.username}</td>
      <td><span class="rb ${u.role}">${u.role}</span></td>
      <td style="font-size:11px;color:var(--muted)">${fmtDate(u.createdAt)}</td>
      <td>
        ${u.username !== 'master' ? `
          <div class="ab">
            <button class="bi e" onclick="editUser('${u.username}')">✏️</button>
            <button class="bi d" onclick="deleteUser('${u.username}')">🗑️</button>
          </div>` : '<span style="font-size:11px;color:var(--muted)">Protected</span>'}
      </td>
    </tr>
  `).join('');
}

function openUserModal() {
  document.getElementById('uName').value = '';
  document.getElementById('uUser').value = '';
  document.getElementById('uPass').value = '';
  document.getElementById('uRole').value = 'staff';
  document.getElementById('editUserId').value = '';
  document.getElementById('userMoTitle').textContent = 'Add Employee';
  openModal('userModal');
}

async function editUser(username) {
  const u = await fbGet('users/' + username);
  if (!u) return;
  document.getElementById('uName').value = u.name;
  document.getElementById('uUser').value = u.username;
  document.getElementById('uPass').value = '';
  document.getElementById('uRole').value = u.role;
  document.getElementById('editUserId').value = username;
  document.getElementById('userMoTitle').textContent = 'Edit Employee';
  openModal('userModal');
}

async function saveUser() {
  const name = document.getElementById('uName').value.trim();
  const username = document.getElementById('uUser').value.trim().toLowerCase();
  const pass = document.getElementById('uPass').value;
  const role = document.getElementById('uRole').value;
  const editId = document.getElementById('editUserId').value;

  if (!name || !username) { showToast('Name and username required', 'warn'); return; }

  if (!editId) {
    const exists = await fbGet('users/' + username);
    if (exists) { showToast('Username already exists', 'err'); return; }
    if (!pass) { showToast('Password required for new user', 'warn'); return; }
  }

  const existing = editId ? await fbGet('users/' + editId) : null;
  const userData = {
    name, username, role,
    password: pass || existing?.password || '',
    createdAt: existing?.createdAt || Date.now()
  };

  if (editId && editId !== username) await fbRemove('users/' + editId);
  await fbSet('users/' + username, userData);

  closeModal('userModal');
  renderUsers();
  showToast('✅ User saved', 'ok');
}

async function deleteUser(username) {
  if (username === 'master') return;
  if (!confirm('Delete this user account?')) return;
  await fbRemove('users/' + username);
  renderUsers();
  showToast('🗑️ User deleted', 'warn');
}

// ----------------------------------------------------------------
// CATEGORIES
// ----------------------------------------------------------------
async function renderCategories() {
  const [cats, items] = await Promise.all([getCats(), getItems()]);
  const catArr = Object.values(cats);
  const itemCounts = {};
  Object.values(items).forEach(i => { itemCounts[i.catId] = (itemCounts[i.catId]||0) + 1; });

  document.getElementById('catsGrid').innerHTML = catArr.length ? catArr.map(c => `
    <div class="ccat" style="border-top-color:${c.color||'var(--gold)'}">
      <div class="ccat-ic">${c.icon||'📦'}</div>
      <div class="ccat-nm">${c.name}</div>
      <div class="ccat-ct">${itemCounts[c.id]||0} items</div>
      <div class="ccat-ac">
        <button class="bi e" onclick="editCat('${c.id}')">✏️</button>
        ${(itemCounts[c.id]||0)===0 ? `<button class="bi d" onclick="deleteCat('${c.id}')">🗑️</button>` : ''}
      </div>
    </div>
  `).join('') :
    '<div class="empty"><span class="emp-i">🗂️</span>No categories</div>';
}

function openCatModal() {
  document.getElementById('cName').value = '';
  document.getElementById('cIcon').value = '';
  document.getElementById('cColor').value = '#0e9b8c';
  document.getElementById('editCatId').value = '';
  openModal('catModal');
}

async function editCat(id) {
  const c = await fbGet('categories/' + id);
  if (!c) return;
  document.getElementById('cName').value = c.name;
  document.getElementById('cIcon').value = c.icon||'';
  document.getElementById('cColor').value = c.color||'#0e9b8c';
  document.getElementById('editCatId').value = id;
  openModal('catModal');
}

async function saveCat() {
  const name = document.getElementById('cName').value.trim();
  const icon = document.getElementById('cIcon').value.trim()||'📦';
  const color = document.getElementById('cColor').value;
  const editId = document.getElementById('editCatId').value;
  if (!name) { showToast('Category name required', 'warn'); return; }

  const id = editId || db.ref('categories').push().key;
  const existing = editId ? await fbGet('categories/' + editId) : null;
  await fbSet('categories/' + id, { id, name, icon, color, createdAt: existing?.createdAt || Date.now() });

  closeModal('catModal');
  renderCategories();
  showToast('✅ Category saved', 'ok');
}

async function deleteCat(id) {
  if (!confirm('Delete this category?')) return;
  const items = await getItems();
  const hasItems = Object.values(items).some(i => i.catId === id);
  if (hasItems) { showToast('Category has items — cannot delete', 'err'); return; }
  await fbRemove('categories/' + id);
  renderCategories();
  showToast('🗑️ Category deleted', 'warn');
}

// ----------------------------------------------------------------
// ITEM MODAL
// ----------------------------------------------------------------
async function openItemModal() {
  document.getElementById('itemMoTitle').textContent = 'Add New Item';
  document.getElementById('editItemId').value = '';
  ['iName','iSealedQty','iLooseQty','iCapacity','iMinSealed','iMinLoose','iDesc'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('iSealedUnit').value = 'bottle';
  document.getElementById('iLooseUnit').value = 'ml';
  await populateItemCatDropdown();
  openModal('itemModal');
}

async function openEditItem(id) {
  const item = await fbGet('items/' + id);
  if (!item) return;
  document.getElementById('itemMoTitle').textContent = 'Edit Item';
  document.getElementById('editItemId').value = id;
  document.getElementById('iName').value = item.name||'';
  document.getElementById('iSealedQty').value = item.sealedQty||0;
  document.getElementById('iLooseQty').value = item.looseQty||0;
  document.getElementById('iCapacity').value = item.capacity||'';
  document.getElementById('iMinSealed').value = item.minSealed||0;
  document.getElementById('iMinLoose').value = item.minLoose||0;
  document.getElementById('iDesc').value = item.description||'';
  document.getElementById('iSealedUnit').value = item.sealedUnit||'bottle';
  document.getElementById('iLooseUnit').value = item.looseUnit||'ml';
  await populateItemCatDropdown(item.catId);
  openModal('itemModal');
}

async function populateItemCatDropdown(selectedId) {
  const cats = await getCats();
  document.getElementById('iCat').innerHTML = Object.values(cats).map(c =>
    `<option value="${c.id}" ${c.id===selectedId?'selected':''}>${c.icon} ${c.name}</option>`
  ).join('');
}

async function saveItem() {
  const editId = document.getElementById('editItemId').value;
  const name = document.getElementById('iName').value.trim();
  const catId = document.getElementById('iCat').value;
  const sealedQty = parseFloat(document.getElementById('iSealedQty').value)||0;
  const looseQty = parseFloat(document.getElementById('iLooseQty').value)||0;
  const sealedUnit = document.getElementById('iSealedUnit').value;
  const looseUnit = document.getElementById('iLooseUnit').value;
  const capacity = parseFloat(document.getElementById('iCapacity').value)||0;
  const minSealed = parseFloat(document.getElementById('iMinSealed').value)||0;
  const minLoose = parseFloat(document.getElementById('iMinLoose').value)||0;
  const description = document.getElementById('iDesc').value.trim();

  if (!name) { showToast('Item name required', 'warn'); return; }
  if (!catId) { showToast('Category required', 'warn'); return; }

  const isNew = !editId;
  const itemId = editId || db.ref('items').push().key;
  const existing = editId ? await fbGet('items/' + editId) : null;

  const itemData = {
    id: itemId, name, catId, sealedQty, looseQty,
    sealedUnit, looseUnit, capacity, minSealed, minLoose,
    description,
    lastUpdatedBy: currentUser.username,
    lastUpdatedByName: currentUser.name,
    lastUpdatedAt: Date.now(),
    createdAt: existing?.createdAt || Date.now()
  };

  await fbSet('items/' + itemId, itemData);
  await logAction(itemId, name, isNew ? 'added new item' : 'edited item', '—',
    isNew ? `Created: ${sealedQty} ${sealedUnit} sealed, ${looseQty} ${looseUnit} loose` : 'Item details updated', '');

  closeModal('itemModal');
  renderInventory();
  showToast(isNew ? '✅ Item added' : '✅ Item updated', 'ok');
}

async function deleteItem(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  await fbRemove('items/' + id);
  await logAction(id, name, 'deleted item', '—', 'Removed from inventory', '');
  renderInventory();
  showToast('🗑️ Item deleted', 'warn');
}

// ----------------------------------------------------------------
// PURCHASE ENTRY
// ----------------------------------------------------------------
async function renderPurchase() {
  if (purchaseRows.length === 0) addPurchaseRow();
  renderPurchaseRows();
  await renderPurchaseHistory();
}

async function renderPurchaseHistory() {
  const logs = await getLogs();
  const purchases = Object.values(logs)
    .filter(l => l.action === 'purchase/restock' || l.action === 'added sealed stock' || l.action === 'added loose stock')
    .sort((a,b) => b.timestamp - a.timestamp).slice(0,20);

  document.getElementById('purchaseHistory').innerHTML = purchases.length ? purchases.map(l => `
    <tr>
      <td style="font-size:11px;font-family:var(--fm)">${fmtDate(l.timestamp)}</td>
      <td><strong>${l.itemName}</strong></td>
      <td class="qty-n" style="color:var(--teal)">${l.change||'—'}</td>
      <td style="font-size:11px;color:var(--muted)">—</td>
      <td>${l.userName}</td>
      <td style="font-size:12px;color:var(--muted)">${l.note||'—'}</td>
    </tr>
  `).join('') :
    `<tr><td colspan="6" class="empty"><span class="emp-i">🛒</span>No purchases yet</td></tr>`;
}

async function addPurchaseRow() {
  const items = await getItems();
  purchaseRows.push({ itemId: '', qty: '', container: 'sealed', note: '', items });
  renderPurchaseRows();
}

function renderPurchaseRows() {
  const container = document.getElementById('purchaseRows');
  if (purchaseRows.length === 0) {
    container.innerHTML = '<div class="empty" style="padding:20px"><span>➕</span> Click "Add Row" to start entering purchase</div>';
    return;
  }

  container.innerHTML = purchaseRows.map((row, idx) => {
    const itemsOpts = row.items ? Object.values(row.items).sort((a,b)=>a.name.localeCompare(b.name)).map(i =>
      `<option value="${i.id}" ${i.id===row.itemId?'selected':''}>${i.name}</option>`
    ).join('') : '';
    return `<div class="pur-row">
      <select class="sel" onchange="updatePurchaseRow(${idx},'itemId',this.value)">
        <option value="">-- Select Item --</option>${itemsOpts}
      </select>
      <select class="sel" onchange="updatePurchaseRow(${idx},'container',this.value)">
        <option value="sealed" ${row.container==='sealed'?'selected':''}>Sealed</option>
        <option value="loose" ${row.container==='loose'?'selected':''}>Loose</option>
      </select>
      <input type="number" class="inp" placeholder="Qty" value="${row.qty}" min="0" step="0.001"
        onchange="updatePurchaseRow(${idx},'qty',this.value)">
      <input type="text" class="inp" placeholder="Note (optional)" value="${row.note}"
        onchange="updatePurchaseRow(${idx},'note',this.value)">
      <button class="pur-del" onclick="removePurchaseRow(${idx})">✕</button>
    </div>`;
  }).join('');
}

function updatePurchaseRow(idx, key, val) {
  purchaseRows[idx][key] = val;
}

function removePurchaseRow(idx) {
  purchaseRows.splice(idx, 1);
  renderPurchaseRows();
}

async function savePurchaseToStock() {
  const valid = purchaseRows.filter(r => r.itemId && r.qty && parseFloat(r.qty) > 0);
  if (valid.length === 0) { showToast('Add at least one item with quantity', 'warn'); return; }

  for (const row of valid) {
    const item = await fbGet('items/' + row.itemId);
    if (!item) continue;
    const qty = parseFloat(row.qty);
    let updates = { lastUpdatedBy: currentUser.username, lastUpdatedByName: currentUser.name, lastUpdatedAt: Date.now() };
    let change = '';
    if (row.container === 'sealed') {
      updates.sealedQty = (item.sealedQty||0) + qty;
      change = `+${qty} ${item.sealedUnit} sealed`;
    } else {
      updates.looseQty = (item.looseQty||0) + qty;
      change = `+${qty} ${item.looseUnit} loose`;
    }
    await fbUpdate('items/' + row.itemId, updates);
    await logAction(row.itemId, item.name, 'purchase/restock', row.container, change, row.note||'Purchase entry');
  }

  purchaseRows = [];
  document.getElementById('purchaseMsg').textContent = `✅ ${valid.length} item(s) restocked successfully!`;
  setTimeout(() => { document.getElementById('purchaseMsg').textContent = ''; }, 3000);
  renderPurchase();
  showToast(`✅ ${valid.length} items restocked`, 'ok');
}

// ----------------------------------------------------------------
// DOWNLOAD FUNCTIONS
// ----------------------------------------------------------------

// Excel download using SheetJS
async function downloadInventoryExcel() {
  const [items, cats] = await Promise.all([getItems(), getCats()]);
  const rows = [['Item Name','Category','Sealed Qty','Sealed Unit','Loose Qty','Loose Unit','Total (in loose unit)','Min Sealed','Min Loose','Status','Last Updated By','Last Updated']];
  Object.values(items).sort((a,b)=>a.name.localeCompare(b.name)).forEach(i => {
    const total = (i.sealedQty||0)*(i.capacity||1)+(i.looseQty||0);
    const status = (i.sealedQty||0)+(i.looseQty||0) <= 0 ? 'Out of Stock' :
      ((i.sealedQty||0)<=(i.minSealed||0)||(i.looseQty||0)<(i.minLoose||0)) ? 'Low Stock' : 'In Stock';
    rows.push([i.name, catName(cats,i.catId), i.sealedQty||0, i.sealedUnit||'', i.looseQty||0, i.looseUnit||'', total.toFixed(2), i.minSealed||0, i.minLoose||0, status, i.lastUpdatedByName||'', fmtDate(i.lastUpdatedAt)]);
  });
  downloadXLSX(rows, 'Anusuya_Inventory_' + todayStr());
}

async function downloadLowStockExcel() {
  const [items, cats] = await Promise.all([getItems(), getCats()]);
  const low = Object.values(items).filter(i => (i.sealedQty||0)<=(i.minSealed||0)||(i.looseQty||0)<(i.minLoose||0));
  const rows = [['Item','Category','Sealed Qty','Sealed Unit','Loose Qty','Loose Unit','Min Sealed','Min Loose','Sealed Shortage','Loose Shortage']];
  low.forEach(i => {
    rows.push([i.name, catName(cats,i.catId), i.sealedQty||0, i.sealedUnit||'', i.looseQty||0, i.looseUnit||'',
      i.minSealed||0, i.minLoose||0,
      Math.max(0,(i.minSealed||0)-(i.sealedQty||0)),
      Math.max(0,(i.minLoose||0)-(i.looseQty||0))]);
  });
  downloadXLSX(rows, 'Anusuya_LowStock_' + todayStr());
}

async function downloadAuditExcel() {
  const logs = await getLogs();
  const rows = [['Date & Time','User','Role','Action','Item','Container','Change','Note']];
  Object.values(logs).sort((a,b)=>b.timestamp-a.timestamp).forEach(l => {
    rows.push([fmtDate(l.timestamp),l.userName,l.userRole||'',l.action,l.itemName,l.container||'',l.change||'',l.note||'']);
  });
  downloadXLSX(rows, 'Anusuya_AuditLog_' + todayStr());
}

async function downloadPurchaseExcel() {
  // Blank refill form for manual filling
  const items = await getItems();
  const rows = [['Item Name','Category','Current Sealed Qty','Current Loose Qty','Sealed Unit','Loose Unit','New Purchase Qty (Sealed)','New Purchase Qty (Loose)','Note']];
  // Also add blank rows for new items
  Object.values(items).sort((a,b)=>a.name.localeCompare(b.name)).forEach(i => {
    rows.push([i.name,'',i.sealedQty||0,i.looseQty||0,i.sealedUnit||'',i.looseUnit||'','','','']);
  });
  // 10 blank rows for new purchases
  for (let i=0;i<10;i++) rows.push(['','','','','','','','','']);
  downloadXLSX(rows, 'Anusuya_PurchaseForm_' + todayStr());
}

async function downloadLowStockPDF() {
  showToast('📄 Preparing PDF…', 'warn');
  const [items, cats] = await Promise.all([getItems(), getCats()]);
  const low = Object.values(items).filter(i => (i.sealedQty||0)<=(i.minSealed||0)||(i.looseQty||0)<(i.minLoose||0));
  const html = buildPDFHtml('Low Stock Report — ' + todayStr(), low.map(i =>
    `<tr><td>${i.name}</td><td>${catName(cats,i.catId)}</td>
    <td>${i.sealedQty||0} ${i.sealedUnit||''}</td>
    <td>${i.looseQty||0} ${i.looseUnit||''}</td>
    <td style="color:red">-${Math.max(0,(i.minSealed||0)-(i.sealedQty||0))} sealed / -${Math.max(0,(i.minLoose||0)-(i.looseQty||0))} loose</td></tr>`
  ).join(''), ['Item','Category','Sealed','Loose','Shortage']);
  printHTML(html);
}

async function downloadInventoryPDF() {
  showToast('📄 Preparing PDF…', 'warn');
  const [items, cats] = await Promise.all([getItems(), getCats()]);
  const arr = Object.values(items).sort((a,b)=>a.name.localeCompare(b.name));
  const html = buildPDFHtml('Full Inventory Report — ' + todayStr(), arr.map(i =>
    `<tr><td>${i.name}</td><td>${catName(cats,i.catId)}</td>
    <td>${i.sealedQty||0} ${i.sealedUnit||''}</td>
    <td>${i.looseQty||0} ${i.looseUnit||''}</td>
    <td>${i.lastUpdatedByName||'—'}</td></tr>`
  ).join(''), ['Item','Category','Sealed','Loose','Updated By']);
  printHTML(html);
}

async function downloadPurchasePDF() {
  showToast('📄 Preparing PDF…', 'warn');
  const items = await getItems();
  const arr = Object.values(items).sort((a,b)=>a.name.localeCompare(b.name));
  const html = buildPDFHtml('Purchase / Restock Form — ' + todayStr(), arr.map(i =>
    `<tr><td>${i.name}</td><td>${i.sealedQty||0} ${i.sealedUnit||''}</td>
    <td>${i.looseQty||0} ${i.looseUnit||''}</td>
    <td style="min-width:80px"> </td><td style="min-width:80px"> </td><td> </td></tr>`
  ).join('') + Array(10).fill('<tr><td> </td><td> </td><td> </td><td> </td><td> </td><td> </td></tr>').join(''),
  ['Item','Current Sealed','Current Loose','New Sealed Qty','New Loose Qty','Note']);
  printHTML(html);
}

function buildPDFHtml(title, rows, headers) {
  return `<html><head><style>
    body{font-family:Arial,sans-serif;padding:20px}
    h2{color:#0a0a0a;margin-bottom:4px}
    .sub{color:#888;font-size:12px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#0a0a0a;color:#fff;padding:8px;text-align:left}
    td{padding:7px 8px;border-bottom:1px solid #eee}
    tr:nth-child(even) td{background:#fafafa}
    .footer{margin-top:20px;font-size:10px;color:#aaa;text-align:center}
  </style></head><body>
    <h2>🐟 Anusuya Restaurant &amp; Bar</h2>
    <div class="sub">${title}</div>
    <table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="footer">Developed by Aarav (Ravi) | Anusuya Inventory System v2.0</div>
  </body></html>`;
}

function printHTML(html) {
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 600);
}

function downloadXLSX(rows, filename) {
  if (typeof XLSX === 'undefined') { showToast('Excel library not loaded', 'err'); return; }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename + '.xlsx');
}

function todayStr() {
  return new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }).replace(/ /g,'-');
}

// ----------------------------------------------------------------
// MODALS
// ----------------------------------------------------------------
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('mo-overlay')) e.target.classList.remove('active');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.mo-overlay.active').forEach(m => m.classList.remove('active'));
});
