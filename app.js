
// ================================================================
// ANUSUYA RESTAURANT & BAR — INVENTORY v8
// 3-Level Stock | Expense Tracker | Roles | Live Feed
// ================================================================

const firebaseConfig = {
  apiKey: "AIzaSyC1biPm621HHU-0nRPlMQS-bZrFmP_i9VE",
  authDomain: "anusuya-inventory-2.firebaseapp.com",
  databaseURL: "https://anusuya-inventory-2-default-rtdb.firebaseio.com",
  projectId: "anusuya-inventory-2",
  storageBucket: "anusuya-inventory-2.firebasestorage.app",
  messagingSenderId: "143200101873",
  appId: "1:143200101873:web:7960b61e5ab7fcf88f9050"
};

let db = null, firebaseReady = false;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  firebaseReady = true;
} catch(e) { console.error("Firebase:", e); }

let currentUser = null, currentPage = "dashboard";
let purchaseRows = [], pendingOpenSealed = null, _rtListeners = [];

// ── Firebase Helpers ──
const fbRef = p => db.ref(p);
const fbGet = p => fbRef(p).once("value").then(s => s.val());
const fbSet = (p,d) => fbRef(p).set(d);
const fbPush = (p,d) => fbRef(p).push(d);
const fbRemove = p => fbRef(p).remove();
const fbUpdate = (p,d) => fbRef(p).update(d);
const getCats = async () => (await fbGet("categories")) || {};
const getItems = async () => (await fbGet("items")) || {};
const getLogs = async () => (await fbGet("auditlog")) || {};
const getUsers = async () => (await fbGet("users")) || {};
const getExpenses = async () => (await fbGet("expenses")) || {};

// ── 3-Level Stock Helpers ──
// Level 1 = Box/Crate (bulkUnit, bulkToPack)
// Level 2 = Bottle/Packet (sealedUnit, capacity)
// Level 3 = ml/g/pcs (looseUnit) ← base unit stored here

function totalBase(item) {
  const f1 = item.bulkToPack || 1;
  const f2 = item.capacity || 1;
  return ((item.boxQty||0)*f1*f2) + ((item.sealedQty||0)*f2) + (item.looseQty||0);
}

function decompose3(item) {
  // Show stock as-is per level, no conversion
  const lc = item.levelCount || "3";
  const parts = [];
  if((lc==="2"||lc==="3") && (item.boxQty||0)>0)
    parts.push((item.boxQty||0) + " " + (item.bulkUnit||"container"));
  if((lc==="2"||lc==="3") && (item.sealedQty||0)>0)
    parts.push((item.sealedQty||0) + " " + (item.sealedUnit||"pack"));
  if((lc==="1"||lc==="3") && (item.looseQty||0)>0)
    parts.push((item.looseQty||0) + " " + (item.looseUnit||"unit"));
  if(lc==="2" && parts.length===0) return "0 " + (item.sealedUnit||"pack");
  return parts.length ? parts.join(" + ") : "0";
}

function stockVal(item) {
  return item.avgCostPerBase ? totalBase(item) * item.avgCostPerBase : 0;
}

function looseOnlyQty(item) {
  const f2 = item.capacity || 1;
  const base = totalBase(item);
  return parseFloat((base % f2).toFixed(3));
}

function fmtINR(n) {
  return "₹" + parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,",");
}
function fmtDate(ts) {
  if(!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})+" "+d.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
}
function fmtDateOnly(ts) {
  if(!ts) return "—";
  return new Date(ts).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});
}
function timeAgo(ts) {
  const d = Date.now()-ts;
  if(d<60000) return "just now";
  if(d<3600000) return Math.floor(d/60000)+"m ago";
  if(d<86400000) return Math.floor(d/3600000)+"h ago";
  return Math.floor(d/86400000)+"d ago";
}
function todayStr() {
  return new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}).replace(/ /g,"-");
}
function showToast(msg,type="ok") {
  const t = document.getElementById("toast");
  t.textContent=msg; t.className="toast show "+type;
  setTimeout(()=>t.className="toast",3200);
}
function catName(cats,id){ return cats[id]?.name||"—"; }
function catIcon(cats,id){ return cats[id]?.icon||"📦"; }

function statusBadge(item) {
  const lc = item.levelCount || "3";
  const base = totalBase(item);
  if(base<=0 && (item.boxQty||0)<=0 && (item.sealedQty||0)<=0 && (item.looseQty||0)<=0)
    return '<span class="badge b-out">Out of Stock</span>';
  const lowL1 = (lc==="2"||lc==="3") && (item.minBox||0)>0 && (item.boxQty||0)<=(item.minBox||0);
  const lowL2 = (lc==="2"||lc==="3") && (item.minSealed||0)>0 && (item.sealedQty||0)<=(item.minSealed||0);
  const lowL3 = (lc==="1"||lc==="3") && (item.minLoose||0)>0 && (item.looseQty||0)<(item.minLoose||0);
  if(lowL1||lowL2||lowL3) return '<span class="badge b-low">Low Stock</span>';
  return '<span class="badge b-ok">In Stock</span>';
}

// ── DOM READY ──
document.addEventListener("DOMContentLoaded", async () => {
  const li = document.getElementById("logoImg");
  if(li && document.getElementById("sbLogo")) document.getElementById("sbLogo").src = li.src;
  initLogin(); initNav(); startClock(); injectTicker();
  const su = sessionStorage.getItem("anusuya_user");
  if(su) { try { currentUser=JSON.parse(su); await enterApp(); } catch(e){ sessionStorage.removeItem("anusuya_user"); } }
  window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); window._pwaPrompt=e; });
  if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
});

// ── CLOCK ──
function startClock() {
  const u = () => { const n=new Date(); document.getElementById("clock").textContent=n.toLocaleDateString("en-IN",{weekday:"short",day:"2-digit",month:"short"})+"  "+n.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}); };
  u(); setInterval(u,30000);
}

// ── TICKER ──
function injectTicker() {
  if(document.getElementById("activityTicker")) return;
  const t = document.createElement("div"); t.id="activityTicker";
  t.style.cssText="position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:rgba(26,15,10,0.96);color:#fff;padding:10px 20px;border-radius:30px;font-size:13px;border:1px solid #c9972a;z-index:9999;max-width:90vw;text-align:center;opacity:0;transition:opacity 0.4s;pointer-events:none;";
  document.body.appendChild(t);
  const s=document.createElement("style"); s.textContent="#activityTicker.show{opacity:1!important}";
  document.head.appendChild(s);
}
function showTicker(log) {
  const t=document.getElementById("activityTicker"); if(!t) return;
  const icon = log.action.includes("purchase")?"🛒":log.action.includes("add")?"📦":log.action.includes("expense")?"💸":log.action.includes("open")?"🔓":log.action.includes("consume")||log.action.includes("remove")?"📤":log.action.includes("delete")?"🗑️":"🔄";
  t.innerHTML=icon+" <strong>"+log.userName+"</strong> — "+log.itemName+(log.change?" | "+log.change:"");
  t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),4000);
}

// ── LOGIN ──
function initLogin() {
  document.getElementById("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const username = document.getElementById("loginUser").value.trim().toLowerCase();
    const password = document.getElementById("loginPass").value;
    if(!firebaseReady||!db){ showLoginError("Firebase connect nahi hua! Refresh karo."); return; }
    showLoginError("⏳ Connecting...");
    const loadEl=document.getElementById("loginLoading");
    if(loadEl) loadEl.style.display="block";
    try {
      const masterExists = await fbGet("users/master");
      if(!masterExists) {
        await fbSet("users/master",{name:"Master Admin",username:"master",password:"ansuya@123",role:"master",createdAt:Date.now()});
      }
      const users = await fbGet("users");
      if(!users){ showLoginError("Database empty! Firebase Rules check karo."); return; }
      const user = Object.values(users).find(u=>u.username===username&&u.password===password);
      if(loadEl) loadEl.style.display="none";
      if(user){ currentUser=user; sessionStorage.setItem("anusuya_user",JSON.stringify(user)); showLoginError(""); await enterApp(); }
      else showLoginError("❌ Invalid username or password.");
    } catch(err){ if(loadEl) loadEl.style.display="none"; showLoginError("Error: "+err.message); }
  });
  document.getElementById("logoutBtn").addEventListener("click",()=>{
    currentUser=null; sessionStorage.removeItem("anusuya_user");
    _rtListeners.forEach(r=>r.off()); _rtListeners=[];
    document.getElementById("appScreen").classList.remove("active");
    document.getElementById("loginScreen").classList.add("active");
    document.getElementById("loginUser").value="";
    document.getElementById("loginPass").value="";
  });
}
function showLoginError(msg){ document.getElementById("loginError").textContent=msg; }

// ── ENTER APP ──
async function enterApp() {
  document.getElementById("loginScreen").classList.remove("active");
  document.getElementById("appScreen").classList.add("active");
  document.getElementById("sbName").textContent=currentUser.name;
  document.getElementById("sbRole").textContent=currentUser.role==="master"?"Master Admin":currentUser.role==="manager"?"Manager":"Staff";
  document.getElementById("sbAv").textContent=currentUser.name.charAt(0).toUpperCase();
  // Hide all pages initially
  document.querySelectorAll(".page").forEach(pg=>{ pg.classList.remove("active"); pg.style.display="none"; });
  applyRoleVisibility();
  navigateTo("dashboard");
  startRealtimeListeners();
}

function applyRoleVisibility() {
  const role = currentUser.role;
  // master-only: user management
  document.querySelectorAll(".master-only").forEach(el=>el.style.display=role==="master"?"":"none");
  // manager+master: categories, purchase
  document.querySelectorAll(".manager-up").forEach(el=>el.style.display=(role==="master"||role==="manager")?"":"none");
}

// ── REALTIME LISTENERS ──
function startRealtimeListeners() {
  _rtListeners.forEach(r=>r.off()); _rtListeners=[];
  const ar = db.ref("auditlog").orderByChild("timestamp").limitToLast(1);
  ar.on("child_added", snap=>{
    const log=snap.val(); if(!log||!log.timestamp) return;
    if(Date.now()-log.timestamp>8000) return;
    showTicker(log);
    if(currentPage==="dashboard") renderDashboard();
    if(currentPage==="audit") renderAudit();
  });
  _rtListeners.push(ar);
  const ir = db.ref("items");
  ir.on("value",()=>{
    if(currentPage==="inventory") renderInventory();
    if(currentPage==="stock") renderStockPage();
    if(currentPage==="lowstock") renderLowStock();
    if(currentPage==="loose") renderLooseStock();
    if(currentPage==="dashboard") renderDashboard();
  });
  _rtListeners.push(ir);
  // Listen for delete requests (manager/master get notified)
  if(currentUser.role==="master"||currentUser.role==="manager") {
    const dr = db.ref("deleteRequests").orderByChild("requestedAt").limitToLast(1);
    dr.on("child_added", snap=>{
      const req=snap.val(); if(!req||!req.requestedAt) return;
      if(Date.now()-req.requestedAt>8000) return;
      if(req.status==="pending") {
        showToast(`🗑️ Delete Request: ${req.requestedByName} chahta hai "${req.targetName}" delete karna — Dashboard check karo!`, "warn");
        if(currentPage==="dashboard") renderDashboard();
      }
    });
    _rtListeners.push(dr);
  }
}

// ── NAV ──
function initNav() {
  document.querySelectorAll(".ni").forEach(link=>{
    link.addEventListener("click",()=>{ navigateTo(link.dataset.p); document.getElementById("sidebar").classList.remove("open"); });
  });
  document.getElementById("hburg").addEventListener("click",()=>document.getElementById("sidebar").classList.toggle("open"));
}
function navigateTo(p) {
  currentPage=p;
  document.querySelectorAll(".ni").forEach(l=>l.classList.remove("active"));
  document.querySelector(`.ni[data-p="${p}"]`)?.classList.add("active");
  document.querySelectorAll(".page").forEach(pg=>{ pg.classList.remove("active"); pg.style.display="none"; });
  const activePg = document.getElementById(`pg-${p}`);
  if(activePg) { activePg.classList.add("active"); activePg.style.display=""; }
  const titles={dashboard:"Dashboard",inventory:"Inventory",stock:"Update Stock",lowstock:"Low Stock",loose:"Loose Stock",audit:"Audit Log",users:"Manage Users",categories:"Categories",purchase:"Purchase Entry",expense:"Daily Expense",complimentary:"🎁 Complimentary"};
  document.getElementById("pgTitle").textContent=titles[p]||p;
  if(p==="dashboard") renderDashboard();
  else if(p==="inventory") renderInventory();
  else if(p==="stock") renderStockPage();
  else if(p==="lowstock") renderLowStock();
  else if(p==="loose") renderLooseStock();
  else if(p==="audit") renderAudit();
  else if(p==="users") renderUsers();
  else if(p==="categories") renderCategories();
  else if(p==="purchase") renderPurchase();
  else if(p==="expense") renderExpense();
  else if(p==="complimentary") renderComplimentary();
}

// ── AUDIT LOG ──
async function logAction(itemId,itemName,action,container,change,note) {
  const ref=db.ref("auditlog").push();
  await ref.set({id:ref.key,timestamp:Date.now(),userId:currentUser.username,userName:currentUser.name,userRole:currentUser.role,action,itemId,itemName,container,change:change||"",note:note||""});
}

// ── ENSURE DEFAULT DATA ──
async function ensureDefaultData() {
  const cats=await fbGet("categories"); if(cats) return;
  const defaultCats=[
    {name:"Seafood — Fresh Catch",icon:"🐟",color:"#0e9b8c"},
    {name:"Spirits & Liquor",icon:"🥃",color:"#c9972a"},
    {name:"Beer",icon:"🍺",color:"#b84a2a"},
    {name:"Soft Drinks & Water",icon:"💧",color:"#2563eb"},
    {name:"Vegetables & Greens",icon:"🥦",color:"#22c55e"},
    {name:"Rice & Grains",icon:"🌾",color:"#f59e0b"},
    {name:"Oils & Condiments",icon:"🫙",color:"#8b5cf6"},
    {name:"Dairy & Eggs",icon:"🥚",color:"#ec4899"},
    {name:"Frozen Items",icon:"❄️",color:"#06b6d4"},
    {name:"Puddings & Desserts",icon:"🍮",color:"#f97316"},
    {name:"Masalas & Spices",icon:"🌶️",color:"#ef4444"},
    {name:"Cleaning & Misc",icon:"🧹",color:"#6b7280"},
  ];
  for(const cat of defaultCats){ const r=db.ref("categories").push(); await r.set({...cat,id:r.key,createdAt:Date.now()}); }
  const catSnap=await fbGet("categories");
  const cids=Object.keys(catSnap);
  const items=[
    {name:"Kingfish (Surmai)",catId:cids[0],boxQty:0,sealedQty:0,looseQty:5000,bulkUnit:"box",bulkToPack:5,sealedUnit:"kg",capacity:1000,looseUnit:"g",minBox:0,minSealed:0,minLoose:2000},
    {name:"Chonak (Snapper)",catId:cids[0],boxQty:0,sealedQty:0,looseQty:4000,bulkUnit:"box",bulkToPack:5,sealedUnit:"kg",capacity:1000,looseUnit:"g",minBox:0,minSealed:0,minLoose:2000},
    {name:"Prawns",catId:cids[0],boxQty:0,sealedQty:0,looseQty:3500,bulkUnit:"box",bulkToPack:5,sealedUnit:"kg",capacity:1000,looseUnit:"g",minBox:0,minSealed:0,minLoose:2000},
    {name:"Squids",catId:cids[0],boxQty:0,sealedQty:0,looseQty:2000,bulkUnit:"box",bulkToPack:5,sealedUnit:"kg",capacity:1000,looseUnit:"g",minBox:0,minSealed:0,minLoose:1000},
    {name:"Lepo Fish",catId:cids[0],boxQty:0,sealedQty:0,looseQty:1500,bulkUnit:"box",bulkToPack:5,sealedUnit:"kg",capacity:1000,looseUnit:"g",minBox:0,minSealed:0,minLoose:1000},
    {name:"Mackerel (Bangda)",catId:cids[0],boxQty:0,sealedQty:0,looseQty:2000,bulkUnit:"box",bulkToPack:5,sealedUnit:"kg",capacity:1000,looseUnit:"g",minBox:0,minSealed:0,minLoose:1000},
    {name:"Kingfisher Beer 650ml",catId:cids[2],boxQty:4,sealedQty:0,looseQty:0,bulkUnit:"crate",bulkToPack:24,sealedUnit:"bottle",capacity:650,looseUnit:"ml",minBox:1,minSealed:0,minLoose:0},
    {name:"Aquafina Water 1L",catId:cids[3],boxQty:2,sealedQty:0,looseQty:0,bulkUnit:"carton",bulkToPack:12,sealedUnit:"bottle",capacity:1000,looseUnit:"ml",minBox:1,minSealed:0,minLoose:0},
    {name:"Johnnie Walker Black 750ml",catId:cids[1],boxQty:0,sealedQty:2,looseQty:450,bulkUnit:"case",bulkToPack:12,sealedUnit:"bottle",capacity:750,looseUnit:"ml",minBox:0,minSealed:1,minLoose:90},
    {name:"Bacardi White Rum 750ml",catId:cids[1],boxQty:0,sealedQty:1,looseQty:300,bulkUnit:"case",bulkToPack:12,sealedUnit:"bottle",capacity:750,looseUnit:"ml",minBox:0,minSealed:1,minLoose:90},
    {name:"Jack Daniel's 750ml",catId:cids[1],boxQty:0,sealedQty:1,looseQty:0,bulkUnit:"case",bulkToPack:12,sealedUnit:"bottle",capacity:750,looseUnit:"ml",minBox:0,minSealed:1,minLoose:0},
    {name:"Basmati Rice",catId:cids[5],boxQty:0,sealedQty:1,looseQty:8000,bulkUnit:"",bulkToPack:1,sealedUnit:"sack",capacity:25000,looseUnit:"g",minBox:0,minSealed:0,minLoose:5000},
  ];
  for(const item of items){ const r=db.ref("items").push(); await r.set({...item,id:r.key,description:"",avgCostPerBase:0,lastUpdatedBy:"master",lastUpdatedByName:"Master Admin",lastUpdatedAt:Date.now(),createdAt:Date.now()}); }
}

// ── DASHBOARD ──
async function renderDashboard() {
  const [items,cats,logs,expenses]=await Promise.all([getItems(),getCats(),getLogs(),getExpenses()]);
  const itemArr=Object.values(items), catArr=Object.values(cats);
  const lowItems=itemArr.filter(i=>totalBase(i)<=0||(i.boxQty||0)<=(i.minBox||0)||(i.sealedQty||0)<=(i.minSealed||0)||(i.looseQty||0)<(i.minLoose||0));
  const today=new Date(); today.setHours(0,0,0,0);
  const todayLogs=Object.values(logs).filter(l=>l.timestamp>=today.getTime());
  const totalVal=itemArr.reduce((s,i)=>s+stockVal(i),0);
  const looseVal=itemArr.reduce((s,i)=>s+((i.looseQty||0)*(i.avgCostPerBase||0)),0);
  const todayExp=Object.values(expenses).filter(e=>e.date===new Date().toISOString().split("T")[0]).reduce((s,e)=>s+(e.amount||0),0);

  document.getElementById("statsRow").innerHTML=`
    <div class="sc g"><div class="sc-icon">📦</div><div><div class="sc-num">${itemArr.length}</div><div class="sc-lbl">Total Items</div></div></div>
    <div class="sc r"><div class="sc-icon">⚠️</div><div><div class="sc-num">${lowItems.length}</div><div class="sc-lbl">Low/Out Stock</div></div></div>
    <div class="sc t"><div class="sc-icon">💰</div><div><div class="sc-num" style="font-size:${totalVal>0?"14px":"12px"}">${totalVal>0?fmtINR(totalVal):"Price set karo"}</div><div class="sc-lbl">Stock Value</div></div></div>
    <div class="sc d"><div class="sc-icon">🔓</div><div><div class="sc-num" style="font-size:${looseVal>0?"14px":"12px"}">${looseVal>0?fmtINR(looseVal):"Price set karo"}</div><div class="sc-lbl">Loose Value</div></div></div>
    <div class="sc r"><div class="sc-icon">💸</div><div><div class="sc-num" style="font-size:14px">${fmtINR(todayExp)}</div><div class="sc-lbl">Today's Expense</div></div></div>
  `;

  const catCounts={};
  itemArr.forEach(i=>{catCounts[i.catId]=(catCounts[i.catId]||0)+1;});
  const maxC=Math.max(...Object.values(catCounts),1);
  document.getElementById("catBars").innerHTML=catArr.slice(0,7).map(c=>{
    const n=catCounts[c.id]||0;
    return `<div class="cat-bi"><div class="cat-bl"><span>${c.icon} ${c.name}</span><span style="font-family:var(--fm)">${n}</span></div><div class="cat-bt"><div class="cat-bf" style="width:${(n/maxC*100).toFixed(0)}%;background:${c.color||"var(--gold)"}"></div></div></div>`;
  }).join("")||'<div class="empty">No categories</div>';

  const recent=Object.values(logs).sort((a,b)=>b.timestamp-a.timestamp).slice(0,8);
  document.getElementById("recentAct").innerHTML=recent.length?recent.map(l=>`
    <div class="act-item"><div class="act-dot"></div>
    <div class="act-t"><strong>${l.userName}</strong> ${l.action} <em>${l.itemName}</em>${l.change?` <span style="color:var(--gold);font-weight:600">${l.change}</span>`:""}</div>
    <div class="act-tm">${timeAgo(l.timestamp)}</div></div>`
  ).join(""):'<div class="empty">No activity yet</div>';

  // Pending Delete Requests (manager/master only)
  if(currentUser.role==="master"||currentUser.role==="manager") {
    const reqsRaw=(await fbGet("deleteRequests"))||{};
    const pendingReqs=Object.values(reqsRaw).filter(r=>r.status==="pending");
    const reqEl=document.getElementById("pendingDelReqs");
    if(reqEl) {
      if(pendingReqs.length===0){
        reqEl.innerHTML='<div class="empty" style="padding:12px">✅ Koi pending delete request nahi</div>';
      } else {
        reqEl.innerHTML=pendingReqs.map(r=>`
          <div class="del-req-row">
            <div class="del-req-info">
              <span class="del-req-type">${r.type==="item"?"📦 Item":"🗂️ Category"}</span>
              <strong>${r.targetName}</strong>
              <span style="color:var(--muted);font-size:11px"> — ${r.requestedByName} • ${timeAgo(r.requestedAt)}</span>
            </div>
            <div class="ab">
              <button class="btn-gold sm" onclick="approveDeleteRequest('${r.id}','${r.type}','${r.targetId}','${r.targetName.replace(/'/g,"\\'")}')" style="padding:5px 10px;font-size:12px">✅ Approve</button>
              <button class="btn-out sm" onclick="rejectDeleteRequest('${r.id}','${r.targetName.replace(/'/g,"\\'")}')">❌ Reject</button>
            </div>
          </div>`).join("");
      }
      document.getElementById("pendingDelWrap").style.display="";
      document.getElementById("pendingDelBadge").textContent=pendingReqs.length>0?` (${pendingReqs.length} pending)`:"";
    }
  }

  document.getElementById("dashLow").innerHTML=lowItems.length?
    '<table class="tbl"><thead><tr><th>Item</th><th>Category</th><th>Level 1 (Box)</th><th>Level 2 (Pack)</th><th>Level 3 (Loose)</th><th>Status</th></tr></thead><tbody>'+
    lowItems.map(i=>`<tr>
      <td><strong>${i.name}</strong></td>
      <td>${catIcon(cats,i.catId)} ${catName(cats,i.catId)}</td>
      <td class="qty-n">${i.boxQty||0} <span style="font-size:11px;color:var(--muted)">${i.bulkUnit||""}</span></td>
      <td class="qty-n qty-s">${i.sealedQty||0} <span style="font-size:11px;color:var(--muted)">${i.sealedUnit||""}</span></td>
      <td class="qty-n qty-l">${i.looseQty||0} <span style="font-size:11px;color:var(--muted)">${i.looseUnit||""}</span></td>
      <td>${statusBadge(i)}</td>
    </tr>`).join("")+"</tbody></table>":
    '<div class="empty" style="padding:20px">✅ All items well stocked!</div>';
}

// ── INVENTORY ──
async function renderInventory() {
  const [items,cats]=await Promise.all([getItems(),getCats()]);
  const fltEl=document.getElementById("fltCat");
  fltEl.innerHTML='<option value="">All Categories</option>'+Object.values(cats).map(c=>`<option value="${c.id}">${c.icon} ${c.name}</option>`).join("");
  document.getElementById("srch").oninput=()=>filterInventory(items,cats);
  document.getElementById("fltCat").onchange=()=>filterInventory(items,cats);
  document.getElementById("fltStatus").onchange=()=>filterInventory(items,cats);
  filterInventory(items,cats);
}
function filterInventory(items,cats) {
  const srch=(document.getElementById("srch")?.value||"").toLowerCase();
  const fltCat=document.getElementById("fltCat")?.value||"";
  const fltSt=document.getElementById("fltStatus")?.value||"";
  let arr=Object.values(items);
  if(srch) arr=arr.filter(i=>i.name.toLowerCase().includes(srch));
  if(fltCat) arr=arr.filter(i=>i.catId===fltCat);
  if(fltSt==="ok") arr=arr.filter(i=>statusBadge(i).includes("b-ok"));
  if(fltSt==="low") arr=arr.filter(i=>statusBadge(i).includes("b-low"));
  if(fltSt==="out") arr=arr.filter(i=>statusBadge(i).includes("b-out"));
  arr.sort((a,b)=>a.name.localeCompare(b.name));
  document.getElementById("invBody").innerHTML=arr.length?arr.map(item=>{
    const lc=item.levelCount||"3";
    let stockDisplay="";
    if(lc==="3") {
      stockDisplay=`<td class="qty-n" style="color:#888">${item.boxQty||0} <span style="font-size:10px">${item.bulkUnit||""}</span></td>
      <td class="qty-n qty-s">${item.sealedQty||0} <span style="font-size:10px">${item.sealedUnit||""}</span></td>
      <td class="qty-n qty-l">${item.looseQty||0} <span style="font-size:10px">${item.looseUnit||""}</span></td>`;
    } else if(lc==="2") {
      stockDisplay=`<td class="qty-n" style="color:#888">${item.boxQty||0} <span style="font-size:10px">${item.bulkUnit||""}</span></td>
      <td class="qty-n qty-s">${item.sealedQty||0} <span style="font-size:10px">${item.sealedUnit||""}</span></td>
      <td class="qty-n qty-l">—</td>`;
    } else {
      stockDisplay=`<td class="qty-n" style="color:#888">—</td>
      <td class="qty-n qty-s">—</td>
      <td class="qty-n qty-l">${item.looseQty||0} <span style="font-size:10px">${item.looseUnit||""}</span></td>`;
    }
    return `
    <tr>
      <td><strong>${item.name}</strong>${item.description?`<div style="font-size:11px;color:var(--muted)">${item.description}</div>`:""}</td>
      <td>${catIcon(cats,item.catId)} ${catName(cats,item.catId)}</td>
      ${stockDisplay}
      <td style="font-size:11px;color:var(--teal);font-weight:600">${decompose3(item)}</td>
      <td style="font-size:11px;color:var(--gold)">${item.avgCostPerBase?fmtINR(item.avgCostPerBase)+"/"+(item.looseUnit||item.sealedUnit||"unit"):"—"}</td>
      <td style="font-size:11px;font-weight:600;color:${stockVal(item)>0?"var(--teal)":"var(--muted)"}">${item.avgCostPerBase?fmtINR(stockVal(item)):"— (price set karo)"}</td>
      <td style="font-size:12px">
        ${(lc==="2"||lc==="3")?`<span style="color:var(--teal)">${item.minBox||0} ${item.bulkUnit||""}</span> / `:""}
        ${(lc==="2"||lc==="3")?`<span style="color:var(--gold)">${item.minSealed||0} ${item.sealedUnit||""}</span>`:""}
        ${(lc==="1"||lc==="3")?` / <span style="color:var(--rust)">${item.minLoose||0} ${item.looseUnit||""}</span>`:""}
      </td>
      <td>${statusBadge(item)}</td>
      <td><div style="font-size:11px"><div style="font-weight:600">${item.lastUpdatedByName||"—"}</div><div style="color:var(--muted)">${fmtDate(item.lastUpdatedAt)}</div></div></td>
      <td><div class="ab">
        <button class="bi e" onclick="openEditItem('${item.id}')">✏️</button>
        ${currentUser?.role==="staff"
          ? `<button class="bi d" style="font-size:11px" onclick="requestDeleteItem('${item.id}','${item.name.replace(/'/g,"\\'")}')" title="Delete Request bhejo">🗑️ Req</button>`
          : `<button class="bi d" onclick="deleteItemWithPass('${item.id}','${item.name.replace(/'/g,"\\'")}','item')">🗑️</button>`
        }
      </div></td>
    </tr>`}).join(""):'<tr><td colspan="12" class="empty"><span class="emp-i">📦</span>No items found</td></tr>';
}

// ── LOOSE STOCK TAB ──
async function renderLooseStock() {
  const [items,cats]=await Promise.all([getItems(),getCats()]);
  const arr=Object.values(items).filter(i=>(i.looseQty||0)>0).sort((a,b)=>a.name.localeCompare(b.name));
  document.getElementById("looseBody").innerHTML=arr.length?arr.map(i=>`
    <tr>
      <td><strong>${i.name}</strong></td>
      <td>${catIcon(cats,i.catId)} ${catName(cats,i.catId)}</td>
      <td class="qty-n qty-l" style="font-size:16px;font-weight:700">${i.looseQty||0} <span style="font-size:12px;color:var(--muted)">${i.looseUnit||""}</span></td>
      <td style="font-size:11px;color:var(--gold)">${i.avgCostPerBase?fmtINR(i.avgCostPerBase)+"/"+(i.looseUnit||"unit"):"<span style='color:var(--rust);font-size:10px'>Price set karo</span>"}</td>
      <td style="font-size:12px;font-weight:600">${i.avgCostPerBase?fmtINR((i.looseQty||0)*(i.avgCostPerBase||0)):"<span style='color:var(--muted);font-size:11px'>Purchase mein price daalo</span>"}</td>
      <td style="font-size:12px;color:var(--muted)">Min: ${i.minLoose||0} ${i.looseUnit||""}</td>
      <td>${statusBadge(i)}</td>
      <td style="font-size:11px;color:var(--muted)">${fmtDate(i.lastUpdatedAt)}</td>
    </tr>`).join(""):'<tr><td colspan="8" class="empty"><span class="emp-i">🔓</span>No loose stock items</td></tr>';
}

// ── STOCK UPDATE ──
async function renderStockPage() {
  const items=await getItems();
  const arr=Object.values(items).sort((a,b)=>a.name.localeCompare(b.name));
  const sel=document.getElementById("stItem");
  sel.innerHTML='<option value="">-- Choose Item --</option>'+arr.map(i=>`<option value="${i.id}">${i.name} | ${decompose3(i)}</option>`).join("");
  sel.onchange=()=>showItemInfo(items);
  document.getElementById("stAction").onchange=()=>showItemInfo(items);
  document.getElementById("stLevel").onchange=()=>showItemInfo(items);
  renderQuickView(items);
}
function showItemInfo(items) {
  const id=document.getElementById("stItem").value;
  const action=document.getElementById("stAction").value;
  const level=document.getElementById("stLevel").value;
  const box=document.getElementById("stItemInfo");
  if(!id){box.className="item-info-box";return;}
  const item=items[id]; if(!item) return;
  let html=`<strong>${item.name}</strong><br>
    📦 Box/Crate: <strong>${item.boxQty||0} ${item.bulkUnit||""}</strong>
    &nbsp;|&nbsp; 🍾 Sealed: <strong>${item.sealedQty||0} ${item.sealedUnit||""}</strong>
    &nbsp;|&nbsp; 🔓 Loose: <strong>${item.looseQty||0} ${item.looseUnit||""}</strong><br>
    <span style="color:var(--teal)">Smart Total: <strong>${decompose3(item)}</strong></span>
    &nbsp;|&nbsp; <span style="color:var(--gold)">Avg Cost: <strong>${item.avgCostPerBase?fmtINR(item.avgCostPerBase)+"/"+(item.looseUnit||"unit"):"Not set"}</strong></span>`;
  if(action==="open") html+=`<br><span style="color:var(--gold)">⚠️ Open: 1 ${item.sealedUnit} = ${item.capacity||"?"} ${item.looseUnit} | 1 ${item.bulkUnit} = ${item.bulkToPack||"?"} ${item.sealedUnit}</span>`;
  box.innerHTML=html; box.className="item-info-box show";
}
async function renderQuickView(itemsData) {
  const items=itemsData||await getItems();
  document.getElementById("quickView").innerHTML=Object.values(items).sort((a,b)=>a.name.localeCompare(b.name)).map(i=>{
    const isOut=totalBase(i)<=0;
    const isLow=(i.boxQty||0)<=(i.minBox||0)||(i.sealedQty||0)<=(i.minSealed||0)||(i.looseQty||0)<(i.minLoose||0);
    const bc=isOut?"var(--rust)":isLow?"var(--gold)":"var(--teal)";
    return `<div class="qi" style="border-color:${bc}">
      <div class="qi-n">${i.name}</div>
      <div style="font-size:10px;color:#888">${i.boxQty||0} ${i.bulkUnit||""}</div>
      <div class="qi-sealed">${i.sealedQty||0}<span style="font-size:10px;color:var(--muted)"> ${i.sealedUnit||""}</span></div>
      <div class="qi-loose">${i.looseQty||0}<span style="font-size:10px;color:var(--muted)"> ${i.looseUnit||""}</span></div>
    </div>`;
  }).join("");
}
async function doUpdateStock() {
  const id=document.getElementById("stItem").value;
  const action=document.getElementById("stAction").value;
  const qty=parseFloat(document.getElementById("stQty").value);
  const level=document.getElementById("stLevel").value;
  const note=document.getElementById("stNote").value.trim();
  if(!id){showToast("Please select an item","warn");return;}
  if(isNaN(qty)||qty<0){showToast("Enter valid quantity","warn");return;}
  const item=await fbGet("items/"+id);
  if(!item){showToast("Item not found","err");return;}

  if(action==="open") {
    pendingOpenSealed={id,item,note,openLevel:level};
    const capBox=`1 ${item.bulkUnit||"box"} = ${item.bulkToPack||"?"} ${item.sealedUnit||"bottle"} = ${(item.bulkToPack||1)*(item.capacity||0)} ${item.looseUnit||"ml"}`;
    const capPack=`1 ${item.sealedUnit||"bottle"} = ${item.capacity||"?"} ${item.looseUnit||"ml"}`;
    document.getElementById("openSealedMsg").innerHTML=`
      <strong>${item.name}</strong><br>
      📦 Box capacity: ${capBox}<br>
      🍾 Pack capacity: ${capPack}<br><br>
      <strong>Kitne open karni hain?</strong>`;
    document.getElementById("openSealedCount").value=1;
    document.getElementById("openLevelSel").value=level;
    openModal("openSealedModal");
    return;
  }

  let updates={}, actionText="", changeText="";
  if(level==="box") {
    const old=item.boxQty||0; let nw;
    if(action==="add"){nw=old+qty;actionText="added box";changeText=`+${qty} ${item.bulkUnit||"box"} (${old}→${nw})`;}
    else if(action==="remove"){nw=Math.max(0,old-qty);actionText="removed box";changeText=`-${qty} ${item.bulkUnit||"box"} (${old}→${nw})`;}
    else{nw=qty;actionText="set box";changeText=`Set ${qty} ${item.bulkUnit||"box"} (was ${old})`;}
    updates.boxQty=nw;
  } else if(level==="sealed") {
    const old=item.sealedQty||0; let nw;
    if(action==="add"){nw=old+qty;actionText="added sealed";changeText=`+${qty} ${item.sealedUnit||"bottle"} (${old}→${nw})`;}
    else if(action==="remove"){nw=Math.max(0,old-qty);actionText="removed sealed";changeText=`-${qty} ${item.sealedUnit||"bottle"} (${old}→${nw})`;}
    else{nw=qty;actionText="set sealed";changeText=`Set ${qty} ${item.sealedUnit||"bottle"} (was ${old})`;}
    updates.sealedQty=nw;
  } else {
    const old=item.looseQty||0; let nw;
    if(action==="add"){nw=old+qty;actionText="added loose";changeText=`+${qty} ${item.looseUnit||""} (${old}→${nw})`;}
    else if(action==="remove"){nw=Math.max(0,old-qty);actionText="consumed loose";changeText=`-${qty} ${item.looseUnit||""} (${old}→${nw})`;}
    else{nw=qty;actionText="set loose";changeText=`Set ${qty} ${item.looseUnit||""} (was ${old})`;}
    updates.looseQty=nw;
  }
  updates.lastUpdatedBy=currentUser.username;
  updates.lastUpdatedByName=currentUser.name;
  updates.lastUpdatedAt=Date.now();
  await fbUpdate("items/"+id,updates);
  await logAction(id,item.name,actionText,level,changeText,note);
  document.getElementById("stQty").value="";
  document.getElementById("stNote").value="";
  document.getElementById("stItemInfo").className="item-info-box";
  showToast("✅ "+changeText,"ok");
  renderStockPage();
}
async function confirmOpenSealed() {
  if(!pendingOpenSealed) return;
  const count=parseInt(document.getElementById("openSealedCount").value)||1;
  const openLevel=document.getElementById("openLevelSel").value;
  const {id,item,note}=pendingOpenSealed;
  let updates={lastUpdatedBy:currentUser.username,lastUpdatedByName:currentUser.name,lastUpdatedAt:Date.now()};
  let changeText="";
  if(openLevel==="box") {
    // Box → Sealed + Loose
    const bottlesAdded=count*(item.bulkToPack||1);
    updates.boxQty=Math.max(0,(item.boxQty||0)-count);
    updates.sealedQty=(item.sealedQty||0)+bottlesAdded;
    changeText=`Opened ${count} ${item.bulkUnit||"box"} → +${bottlesAdded} ${item.sealedUnit||"bottle"}`;
  } else {
    // Sealed → Loose
    const looseAdded=count*(item.capacity||0);
    updates.sealedQty=Math.max(0,(item.sealedQty||0)-count);
    updates.looseQty=(item.looseQty||0)+looseAdded;
    changeText=`Opened ${count} ${item.sealedUnit||"bottle"} → +${looseAdded} ${item.looseUnit||"ml"}`;
  }
  await fbUpdate("items/"+id,updates);
  await logAction(id,item.name,"opened "+openLevel,"open",changeText,note);
  closeModal("openSealedModal");
  showToast("✅ "+changeText,"ok");
  pendingOpenSealed=null;
  renderStockPage();
}

// ── LOW STOCK ──
async function renderLowStock() {
  const [items,cats]=await Promise.all([getItems(),getCats()]);
  const low=Object.values(items).filter(i=>totalBase(i)<=0||(i.boxQty||0)<=(i.minBox||0)||(i.sealedQty||0)<=(i.minSealed||0)||(i.looseQty||0)<(i.minLoose||0));
  low.sort((a,b)=>a.name.localeCompare(b.name));
  document.getElementById("lowBody").innerHTML=low.length?low.map(i=>`
    <tr>
      <td><strong>${i.name}</strong></td>
      <td>${catIcon(cats,i.catId)} ${catName(cats,i.catId)}</td>
      <td class="qty-n">${i.boxQty||0} <span style="font-size:11px">${i.bulkUnit||""}</span></td>
      <td class="qty-n qty-s">${i.sealedQty||0} <span style="font-size:11px">${i.sealedUnit||""}</span></td>
      <td class="qty-n qty-l">${i.looseQty||0} <span style="font-size:11px">${i.looseUnit||""}</span></td>
      <td style="font-size:12px"><span style="color:#888">${i.minBox||0} ${i.bulkUnit||""}</span> / <span style="color:var(--teal)">${i.minSealed||0} ${i.sealedUnit||""}</span> / <span style="color:var(--gold)">${i.minLoose||0} ${i.looseUnit||""}</span></td>
      <td style="color:var(--rust);font-weight:700;font-size:12px">
        ${(i.boxQty||0)<(i.minBox||0)?`Box: -${(i.minBox||0)-(i.boxQty||0)}`:""}
        ${(i.sealedQty||0)<=(i.minSealed||0)?`Pack: -${Math.max(0,(i.minSealed||0)-(i.sealedQty||0))}`:""}
        ${(i.looseQty||0)<(i.minLoose||0)?`Loose: -${Math.max(0,(i.minLoose||0)-(i.looseQty||0))} ${i.looseUnit||""}`:""}
      </td>
    </tr>`).join(""):'<tr><td colspan="7" class="empty"><span class="emp-i">✅</span>All items well stocked!</td></tr>';
}

// ── AUDIT LOG ──
async function renderAudit() {
  const [logs,users]=await Promise.all([getLogs(),getUsers()]);
  const uSel=document.getElementById("auUser");
  uSel.innerHTML='<option value="">All Users</option>'+Object.values(users).map(u=>`<option value="${u.username}">${u.name}</option>`).join("");
  const dateF=document.getElementById("auDate")?.value;
  const userF=document.getElementById("auUser")?.value;
  let arr=Object.values(logs).sort((a,b)=>b.timestamp-a.timestamp);
  if(dateF){const d=new Date(dateF);d.setHours(0,0,0,0);const e=new Date(d);e.setDate(e.getDate()+1);arr=arr.filter(l=>l.timestamp>=d.getTime()&&l.timestamp<e.getTime());}
  if(userF) arr=arr.filter(l=>l.userId===userF||l.userName===userF);
  const catF=document.getElementById("auCat")?.value||"";
  // auCat filter not applicable to logs directly, skip
  document.getElementById("auBody").innerHTML=arr.length?arr.map(l=>`
    <tr>
      <td style="font-family:var(--fm);font-size:11px;white-space:nowrap">${fmtDate(l.timestamp)}</td>
      <td><span class="rb ${l.userId==="master"?"master":l.userRole||"staff"}">${l.userName}</span></td>
      <td style="text-transform:capitalize">${l.action}</td>
      <td><strong>${l.itemName}</strong></td>
      <td><span class="badge">${l.container||"—"}</span></td>
      <td style="font-family:var(--fm);font-size:11px;color:var(--teal)">${l.change||"—"}</td>
      <td style="color:var(--muted);font-size:12px">${l.note||"—"}</td>
    </tr>`).join(""):'<tr><td colspan="7" class="empty">No records</td></tr>';
}
function resetAuditFilter(){ document.getElementById("auDate").value=""; document.getElementById("auUser").value=""; renderAudit(); }

// ── DAILY EXPENSE TRACKER ──
async function renderExpense() {
  await renderExpenseHistory();
}
async function saveExpense() {
  const date=document.getElementById("expDate").value;
  const desc=document.getElementById("expDesc").value.trim();
  const amount=parseFloat(document.getElementById("expAmount").value)||0;
  const cat=document.getElementById("expCat").value;
  const note=document.getElementById("expNote").value.trim();
  if(!date){showToast("Date required","warn");return;}
  if(!desc){showToast("Description required","warn");return;}
  if(amount<=0){showToast("Enter valid amount","warn");return;}
  const ref=db.ref("expenses").push();
  await ref.set({id:ref.key,date,description:desc,amount,category:cat,note,addedBy:currentUser.username,addedByName:currentUser.name,createdAt:Date.now()});
  await logAction(ref.key,desc,"expense entry","expense",fmtINR(amount),note);
  document.getElementById("expDesc").value="";
  document.getElementById("expAmount").value="";
  document.getElementById("expNote").value="";
  showToast("✅ Expense saved","ok");
  renderExpenseHistory();
}
async function renderExpenseHistory() {
  const expenses=await getExpenses();
  const fromDate=document.getElementById("expFromDate")?.value;
  const toDate=document.getElementById("expToDate")?.value;
  const catFilter=document.getElementById("expCatFilter")?.value||"";
  let arr=Object.values(expenses).sort((a,b)=>b.createdAt-a.createdAt);
  if(fromDate) arr=arr.filter(e=>e.date>=fromDate);
  if(toDate) arr=arr.filter(e=>e.date<=toDate);
  if(catFilter) arr=arr.filter(e=>e.category===catFilter);
  const total=arr.reduce((s,e)=>s+(e.amount||0),0);
  document.getElementById("expTotal").textContent=fmtINR(total);
  document.getElementById("expBody").innerHTML=arr.length?arr.map(e=>`
    <tr>
      <td style="font-family:var(--fm);font-size:12px">${e.date}</td>
      <td><strong>${e.description}</strong></td>
      <td><span class="badge" style="background:var(--surface)">${e.category||"General"}</span></td>
      <td class="qty-n" style="color:var(--rust);font-size:14px">${fmtINR(e.amount)}</td>
      <td style="color:var(--muted);font-size:12px">${e.note||"—"}</td>
      <td style="font-size:11px;color:var(--muted)">${e.addedByName||"—"}</td>
      <td>${(currentUser?.role==="master"||currentUser?.role==="manager")?`<button class="bi d" onclick="deleteExpense('${e.id}')">🗑️</button>`:""}</td>
    </tr>`).join(""):'<tr><td colspan="7" class="empty"><span class="emp-i">💸</span>No expenses found</td></tr>';
}
async function deleteExpense(id){ if(!confirm("Delete this expense?")) return; await fbRemove("expenses/"+id); renderExpenseHistory(); showToast("🗑️ Expense deleted","warn"); }
function filterExpenses(){ renderExpenseHistory(); }

// ── USERS ──
async function renderUsers() {
  const users=await getUsers();
  document.getElementById("usersBody").innerHTML=Object.values(users).sort((a,b)=>a.name.localeCompare(b.name)).map(u=>`
    <tr>
      <td><strong>${u.name}</strong></td>
      <td style="font-family:var(--fm)">${u.username}</td>
      <td><span class="rb ${u.role}">${u.role}</span></td>
      <td style="font-size:11px;color:var(--muted)">${fmtDate(u.createdAt)}</td>
      <td>${u.username!=="master"?`<div class="ab"><button class="bi e" onclick="editUser('${u.username}')">✏️</button><button class="bi d" onclick="deleteUser('${u.username}')">🗑️</button></div>`:"<span style='font-size:11px;color:var(--muted)'>Protected</span>"}</td>
    </tr>`).join("");
}
function openUserModal(){ document.getElementById("uName").value=""; document.getElementById("uUser").value=""; document.getElementById("uPass").value=""; document.getElementById("uRole").value="staff"; document.getElementById("editUserId").value=""; document.getElementById("userMoTitle").textContent="Add Employee"; openModal("userModal"); }
async function editUser(username){ const u=await fbGet("users/"+username); if(!u) return; document.getElementById("uName").value=u.name; document.getElementById("uUser").value=u.username; document.getElementById("uPass").value=""; document.getElementById("uRole").value=u.role; document.getElementById("editUserId").value=username; document.getElementById("userMoTitle").textContent="Edit Employee"; openModal("userModal"); }
async function saveUser() {
  const name=document.getElementById("uName").value.trim();
  const username=document.getElementById("uUser").value.trim().toLowerCase();
  const pass=document.getElementById("uPass").value;
  const role=document.getElementById("uRole").value;
  const editId=document.getElementById("editUserId").value;
  if(!name||!username){showToast("Name and username required","warn");return;}
  if(!editId){const ex=await fbGet("users/"+username);if(ex){showToast("Username exists","err");return;}if(!pass){showToast("Password required","warn");return;}}
  const existing=editId?await fbGet("users/"+editId):null;
  if(editId&&editId!==username) await fbRemove("users/"+editId);
  await fbSet("users/"+username,{name,username,role,password:pass||existing?.password||"",createdAt:existing?.createdAt||Date.now()});
  closeModal("userModal"); renderUsers(); showToast("✅ User saved","ok");
}
async function deleteUser(username){ if(username==="master") return; if(!confirm("Delete this user?")) return; await fbRemove("users/"+username); renderUsers(); showToast("🗑️ Deleted","warn"); }

// ── CATEGORIES ──
async function renderCategories() {
  const [cats,items]=await Promise.all([getCats(),getItems()]);
  const counts={}; Object.values(items).forEach(i=>{counts[i.catId]=(counts[i.catId]||0)+1;});
  document.getElementById("catsGrid").innerHTML=Object.values(cats).map(c=>`
    <div class="ccat" style="border-top-color:${c.color||"var(--gold)"}">
      <div class="ccat-ic">${c.icon||"📦"}</div><div class="ccat-nm">${c.name}</div>
      <div class="ccat-ct">${counts[c.id]||0} items</div>
      <div class="ccat-ac">
        <button class="bi e" onclick="editCat('${c.id}')">✏️</button>
        ${(counts[c.id]||0)===0
          ? (currentUser?.role==="staff"
              ? `<button class="bi d" style="font-size:11px" onclick="requestDeleteCat('${c.id}','${c.name.replace(/'/g,"\\'")}')" title="Delete Request">🗑️ Req</button>`
              : `<button class="bi d" onclick="deleteCatWithPass('${c.id}','${c.name.replace(/'/g,"\\'")}')" title="Delete Category">🗑️</button>`)
          : `<span style="font-size:10px;color:var(--muted)">${counts[c.id]} items</span>`
        }
      </div>
    </div>`).join("")||'<div class="empty">No categories</div>';
}
function openCatModal(){ document.getElementById("cName").value=""; document.getElementById("cIcon").value=""; document.getElementById("cColor").value="#0e9b8c"; document.getElementById("editCatId").value=""; openModal("catModal"); }
async function editCat(id){ const c=await fbGet("categories/"+id); if(!c) return; document.getElementById("cName").value=c.name; document.getElementById("cIcon").value=c.icon||""; document.getElementById("cColor").value=c.color||"#0e9b8c"; document.getElementById("editCatId").value=id; openModal("catModal"); }
async function saveCat() {
  const name=document.getElementById("cName").value.trim(); if(!name){showToast("Name required","warn");return;}
  const icon=document.getElementById("cIcon").value.trim()||"📦";
  const color=document.getElementById("cColor").value;
  const editId=document.getElementById("editCatId").value;
  const id=editId||db.ref("categories").push().key;
  const existing=editId?await fbGet("categories/"+editId):null;
  await fbSet("categories/"+id,{id,name,icon,color,createdAt:existing?.createdAt||Date.now()});
  closeModal("catModal"); renderCategories(); showToast("✅ Saved","ok");
}
async function deleteCat(id){ if(!confirm("Delete?")) return; const items=await getItems(); if(Object.values(items).some(i=>i.catId===id)){showToast("Category has items","err");return;} await fbRemove("categories/"+id); renderCategories(); showToast("🗑️ Deleted","warn"); }

// ── ITEM MODAL — SIMPLIFIED CORRECT LOGIC ──

// Unit options per level
const L1_UNITS = [
  {v:"pallet",    l:"Pallet"},
  {v:"crate",     l:"Crate"},
  {v:"drum",      l:"Drum / Barrel"},
  {v:"jerrycan",  l:"Jerry Can"},
  {v:"carton",    l:"Carton"},
  {v:"case",      l:"Case"},
  {v:"masterbox", l:"Master Box"},
  {v:"box",       l:"Box"},
  {v:"sack",      l:"Sack"},
  {v:"bag",       l:"Bag"},
  {v:"bale",      l:"Bale"},
  {v:"bundle",    l:"Bundle"},
  {v:"other",     l:"Other (type karo)"},
];
const L2_UNITS = [
  {v:"bottle",    l:"Bottle"},
  {v:"can",       l:"Can"},
  {v:"tin",       l:"Tin"},
  {v:"tetrapack", l:"Tetra Pack"},
  {v:"pouch",     l:"Pouch"},
  {v:"packet",    l:"Packet"},
  {v:"bag",       l:"Bag (small)"},
  {v:"sachet",    l:"Sachet"},
  {v:"jar",       l:"Jar"},
  {v:"box",       l:"Box (small)"},
  {v:"piece",     l:"Piece (pcs)"},
  {v:"dozen",     l:"Dozen"},
  {v:"tray",      l:"Tray"},
  {v:"bunch",     l:"Bunch"},
  {v:"strip",     l:"Strip"},
  {v:"kg",        l:"Kg (kilo bag)"},
  {v:"other",     l:"Other (type karo)"},
];
const L3_UNITS = [
  {v:"ml",        l:"ml (millilitre)"},
  {v:"cl",        l:"cl (centilitre)"},
  {v:"ltr",       l:"Litre (L)"},
  {v:"mg",        l:"mg (milligram)"},
  {v:"g",         l:"g (gram)"},
  {v:"kg",        l:"kg (kilogram)"},
  {v:"pcs",       l:"pcs (pieces)"},
  {v:"dozen",     l:"Dozen"},
  {v:"portion",   l:"Portion"},
  {v:"serve",     l:"Serve"},
  {v:"plate",     l:"Plate"},
];

function buildSelect(id, units) {
  const el = document.getElementById(id);
  if(!el) return;
  el.innerHTML = units.map(u=>`<option value="${u.v}">${u.l}</option>`).join("");
}

function onLevelCountChange() {
  const lc = document.getElementById("iLevelCount").value;
  // Hide all first
  ["grp-L1","grp-L2","grp-L3","grp-price","grp-startqty"].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display="none";
  });

  // Build dropdowns with full unit lists
  buildSelect("iL1Unit", L1_UNITS);
  buildSelect("iL2Unit", L2_UNITS);
  buildSelect("iL3Unit", L3_UNITS);

  // Attach change handlers
  document.getElementById("iL1Unit").onchange = () => {
    document.getElementById("grp-L1-custom").style.display = document.getElementById("iL1Unit").value==="other" ? "" : "none";
    updatePriceLabel();
  };
  document.getElementById("iL2Unit").onchange = () => {
    document.getElementById("grp-L2-custom").style.display = document.getElementById("iL2Unit").value==="other" ? "" : "none";
    updatePriceLabel();
  };
  document.getElementById("iL3Unit").onchange = () => updatePriceLabel();

  if(!lc) return;

  if(lc==="1") {
    document.getElementById("grp-L3").style.display="";
    document.getElementById("grp-L3-title").textContent="📦 Stock Unit";
    document.getElementById("grp-price").style.display="";
    document.getElementById("grp-startqty").style.display="";
    document.getElementById("iStartLevel").innerHTML=`<option value="L3">Is unit mein</option>`;
  } else if(lc==="2") {
    document.getElementById("grp-L1").style.display="";
    document.getElementById("grp-L2").style.display="";
    document.getElementById("grp-L2-title").textContent="🍾 Pack / Inner Unit";
    document.getElementById("grp-L1-to-L2").style.display="";
    document.getElementById("grp-price").style.display="";
    document.getElementById("grp-startqty").style.display="";
    document.getElementById("iStartLevel").innerHTML=`
      <option value="L1">Container mein (e.g. 2 Crate)</option>
      <option value="L2">Pack mein (e.g. 6 Bottle)</option>`;
  } else if(lc==="3") {
    document.getElementById("grp-L1").style.display="";
    document.getElementById("grp-L2").style.display="";
    document.getElementById("grp-L2-title").textContent="🍾 Pack (Inner Unit)";
    document.getElementById("grp-L3").style.display="";
    document.getElementById("grp-L3-title").textContent="🔓 Base Unit (ml / g / pcs)";
    document.getElementById("grp-L1-to-L2").style.display="";
    document.getElementById("grp-L2-to-L3").style.display="";
    document.getElementById("grp-price").style.display="";
    document.getElementById("grp-startqty").style.display="";
    document.getElementById("iStartLevel").innerHTML=`
      <option value="L1">Container mein (e.g. 2 Crate)</option>
      <option value="L2">Pack mein (e.g. 6 Bottle)</option>
      <option value="L3">Base unit mein (e.g. 500 ml)</option>`;
  }
  updatePriceLabel();
  onStartLevelChange();
}

function onStartLevelChange() {
  const sl = document.getElementById("iStartLevel").value;
  const lc = document.getElementById("iLevelCount").value;
  // Update qty placeholder based on where stock is
  const qtyEl = document.getElementById("iStartQty");
  const qtyLbl = document.getElementById("iStartQtyLabel");
  if(!sl||!lc) return;
  if(sl==="L1") {
    const u = getUnitLabel("iL1Unit","iL1UnitCustom");
    qtyLbl.textContent = `Starting Qty (${u} mein)`;
    if(qtyEl) qtyEl.placeholder = `e.g. 2 ${u}`;
  } else if(sl==="L2") {
    const u = getUnitLabel("iL2Unit","iL2UnitCustom");
    qtyLbl.textContent = `Starting Qty (${u} mein)`;
    if(qtyEl) qtyEl.placeholder = `e.g. 6 ${u}`;
  } else if(sl==="L3") {
    const u = document.getElementById("iL3Unit")?.value||"unit";
    qtyLbl.textContent = `Starting Qty (${u} mein)`;
    if(qtyEl) qtyEl.placeholder = `e.g. 500 ${u}`;
  }
}

function getUnitLabel(selId, customId) {
  const sel = document.getElementById(selId);
  if(!sel) return "unit";
  if(sel.value==="other") return document.getElementById(customId)?.value||"unit";
  return sel.value;
}

function updatePriceLabel() {
  const lc = document.getElementById("iLevelCount").value;
  const lbl = document.getElementById("price-label");
  const hint = document.getElementById("price-hint");
  if(!lc||!lbl) return;
  if(lc==="1") {
    const u = document.getElementById("iL3Unit")?.value||"unit";
    lbl.textContent = `Purchase Price per ${u} (₹)`;
    hint.textContent = `Ek ${u} ka price — e.g. 1 kg = ₹200`;
  } else if(lc==="2") {
    const u = getUnitLabel("iL2Unit","iL2UnitCustom");
    lbl.textContent = `Purchase Price per ${u} (₹)`;
    hint.textContent = `Ek ${u} ka price — e.g. 1 Bottle = ₹85`;
  } else if(lc==="3") {
    const u2 = getUnitLabel("iL2Unit","iL2UnitCustom");
    lbl.textContent = `Purchase Price per ${u2} (₹)`;
    hint.textContent = `Ek ${u2} ka total price daalo — baaki system calculate karega`;
  }
}

async function openItemModal() {
  document.getElementById("itemMoTitle").textContent="Add New Item";
  document.getElementById("editItemId").value="";
  ["iName","iL1ToL2","iL2ToL3","iMinL1","iMinL2","iMinL3","iDesc","iPurchasePrice","iL1UnitCustom","iL2UnitCustom","iStartQty"].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value="";
  });
  document.getElementById("iLevelCount").value="";
  ["grp-L1","grp-L2","grp-L3","grp-price","grp-startqty"].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display="none";
  });
  await populateItemCatDropdown();
  openModal("itemModal");
}

async function openEditItem(id) {
  const item=await fbGet("items/"+id); if(!item) return;
  document.getElementById("itemMoTitle").textContent="Edit Item";
  document.getElementById("editItemId").value=id;
  document.getElementById("iName").value=item.name||"";
  document.getElementById("iDesc").value=item.description||"";

  const lc = item.levelCount || (item.bulkUnit&&item.capacity>1?"3":item.bulkUnit?"2":"1");
  document.getElementById("iLevelCount").value=lc;
  onLevelCountChange();

  // Set L1
  if(lc==="2"||lc==="3") {
    const l1u=item.bulkUnit||"crate";
    const l1sel=document.getElementById("iL1Unit");
    const l1has=Array.from(l1sel.options).find(o=>o.value===l1u);
    if(l1has){l1sel.value=l1u;document.getElementById("grp-L1-custom").style.display="none";}
    else{l1sel.value="other";document.getElementById("grp-L1-custom").style.display="";document.getElementById("iL1UnitCustom").value=l1u;}
    document.getElementById("iL1ToL2").value=item.bulkToPack||"";
    document.getElementById("iMinL1").value=item.minBox||0;
  }
  // Set L2
  if(lc==="2"||lc==="3") {
    const l2u=item.sealedUnit||"bottle";
    const l2sel=document.getElementById("iL2Unit");
    const l2has=Array.from(l2sel.options).find(o=>o.value===l2u);
    if(l2has){l2sel.value=l2u;document.getElementById("grp-L2-custom").style.display="none";}
    else{l2sel.value="other";document.getElementById("grp-L2-custom").style.display="";document.getElementById("iL2UnitCustom").value=l2u;}
    document.getElementById("iMinL2").value=item.minSealed||0;
    if(lc==="3") document.getElementById("iL2ToL3").value=item.capacity||"";
  }
  // Set L3
  if(lc==="1"||lc==="3") {
    document.getElementById("iL3Unit").value=item.looseUnit||"ml";
    document.getElementById("iMinL3").value=item.minLoose||0;
  }

  // Starting qty — show current actual stock at highest level
  document.getElementById("iStartQty").value = item.boxQty||item.sealedQty||item.looseQty||0;
  if(item.boxQty>0) document.getElementById("iStartLevel").value="L1";
  else if(item.sealedQty>0) document.getElementById("iStartLevel").value="L2";
  else document.getElementById("iStartLevel").value="L3";

  // Price reconstruct (show price per sealed unit for L2/L3, price per unit for L1)
  if(item.avgCostPerBase) {
    let p=item.avgCostPerBase;
    if(lc==="2"||lc==="3") p=item.avgCostPerBase*(item.capacity||1);
    document.getElementById("iPurchasePrice").value=parseFloat(p.toFixed(4));
  }
  updatePriceLabel();
  await populateItemCatDropdown(item.catId);
  openModal("itemModal");
}

async function populateItemCatDropdown(selectedId) {
  const cats=await getCats();
  document.getElementById("iCat").innerHTML=Object.values(cats).map(c=>`<option value="${c.id}" ${c.id===selectedId?"selected":""}>${c.icon} ${c.name}</option>`).join("");
}

async function saveItem() {
  const editId=document.getElementById("editItemId").value;
  const name=document.getElementById("iName").value.trim();
  const catId=document.getElementById("iCat").value;
  const lc=document.getElementById("iLevelCount").value;
  if(!name){showToast("Item name required","warn");return;}
  if(!catId){showToast("Category required","warn");return;}
  if(!lc){showToast("Level structure select karo","warn");return;}
  const description=document.getElementById("iDesc").value.trim();

  // Conversions
  let bulkUnit="", bulkToPack=1, sealedUnit="", capacity=1, looseUnit="";
  let minBox=0, minSealed=0, minLoose=0;

  if(lc==="2"||lc==="3") {
    const l1r=document.getElementById("iL1Unit").value;
    bulkUnit=l1r==="other"?document.getElementById("iL1UnitCustom").value.trim()||"box":l1r;
    bulkToPack=parseFloat(document.getElementById("iL1ToL2").value)||1;
    minBox=parseFloat(document.getElementById("iMinL1").value)||0;
  }
  if(lc==="2"||lc==="3") {
    const l2r=document.getElementById("iL2Unit").value;
    sealedUnit=l2r==="other"?document.getElementById("iL2UnitCustom").value.trim()||"pack":l2r;
    minSealed=parseFloat(document.getElementById("iMinL2").value)||0;
    if(lc==="3") capacity=parseFloat(document.getElementById("iL2ToL3").value)||1;
  }
  if(lc==="1"||lc==="3") {
    looseUnit=document.getElementById("iL3Unit").value;
    minLoose=parseFloat(document.getElementById("iMinL3").value)||0;
  }
  if(lc==="2") looseUnit=sealedUnit; // L2 is base for 2-level

  // Starting stock — user puts qty at ONE level, system distributes
  const startLevel=document.getElementById("iStartLevel").value;
  const startQty=parseFloat(document.getElementById("iStartQty").value)||0;
  let boxQty=0, sealedQty=0, looseQty=0;

  if(lc==="1") {
    looseQty=startQty;
  } else if(lc==="2") {
    if(startLevel==="L1") { boxQty=startQty; }
    else { sealedQty=startQty; }
  } else if(lc==="3") {
    if(startLevel==="L1") { boxQty=startQty; }
    else if(startLevel==="L2") { sealedQty=startQty; }
    else { looseQty=startQty; }
  }

  // Price per smallest unit
  const priceInput=parseFloat(document.getElementById("iPurchasePrice").value)||0;
  let avgCostPerBase=0;
  if(priceInput>0) {
    if(lc==="1") avgCostPerBase=priceInput;
    else if(lc==="2") avgCostPerBase=capacity>0?priceInput/capacity:priceInput;
    else avgCostPerBase=capacity>0?priceInput/capacity:0;
  }
  // If editing and no new price entered, KEEP existing avgCostPerBase
  const existingForPrice=editId?await fbGet("items/"+editId):null;
  if(priceInput<=0 && existingForPrice && existingForPrice.avgCostPerBase){
    avgCostPerBase=existingForPrice.avgCostPerBase;
  }

  const isNew=!editId;
  const itemId=editId||db.ref("items").push().key;
  const existing=editId?await fbGet("items/"+editId):null;
  // When EDITING: preserve actual stock quantities, don't reset them from form
  // iStartQty is only used for NEW items
  const finalBoxQty   = isNew ? boxQty   : (existing?.boxQty||0);
  const finalSealedQty= isNew ? sealedQty: (existing?.sealedQty||0);
  const finalLooseQty = isNew ? looseQty : (existing?.looseQty||0);
  const data={
    id:itemId,name,catId,levelCount:lc,
    boxQty:finalBoxQty,sealedQty:finalSealedQty,looseQty:finalLooseQty,
    bulkUnit,sealedUnit,looseUnit,
    bulkToPack,capacity,
    minBox,minSealed,minLoose,
    description,avgCostPerBase,
    lastUpdatedBy:currentUser.username,
    lastUpdatedByName:currentUser.name,
    lastUpdatedAt:Date.now(),
    createdAt:existing?.createdAt||Date.now()
  };
  await fbSet("items/"+itemId,data);
  await logAction(itemId,name,isNew?"added item":"edited item","—",isNew?"Created":"Updated","");
  closeModal("itemModal"); renderInventory(); showToast(isNew?"✅ Item added":"✅ Updated","ok");
}


// ── DELETE SYSTEM ──

// ── Password Confirm Modal helper ──
let _pendingDeleteAction = null;

function openDeleteConfirm(title, itemName, onConfirm) {
  document.getElementById("delConfirmTitle").textContent = title;
  document.getElementById("delConfirmItemName").textContent = itemName;
  document.getElementById("delConfirmPass").value = "";
  document.getElementById("delConfirmErr").textContent = "";
  _pendingDeleteAction = onConfirm;
  openModal("deleteConfirmModal");
}

async function confirmDeleteWithPass() {
  const pass = document.getElementById("delConfirmPass").value;
  if(!pass) { document.getElementById("delConfirmErr").textContent = "Password daalo!"; return; }
  // Verify current user password
  const user = await fbGet("users/" + currentUser.username);
  if(!user || user.password !== pass) {
    document.getElementById("delConfirmErr").textContent = "❌ Galat password!";
    return;
  }
  closeModal("deleteConfirmModal");
  if(_pendingDeleteAction) await _pendingDeleteAction();
  _pendingDeleteAction = null;
}

// ── Manager/Master: Delete Item with password ──
async function deleteItemWithPass(id, name, type) {
  openDeleteConfirm("🗑️ Item Delete Confirm", name, async () => {
    await fbRemove("items/" + id);
    await logAction(id, name, "deleted item", "—", "Permanently deleted by " + currentUser.name, "");
    renderInventory();
    showToast("🗑️ Item deleted: " + name, "warn");
  });
}

// ── Staff: Request delete approval ──
async function requestDeleteItem(id, name) {
  if(!confirm(`"${name}" delete karne ka request bhejein?`)) return;
  const reqRef = db.ref("deleteRequests").push();
  await reqRef.set({
    id: reqRef.key,
    type: "item",
    targetId: id,
    targetName: name,
    requestedBy: currentUser.username,
    requestedByName: currentUser.name,
    requestedAt: Date.now(),
    status: "pending"
  });
  // Also log it
  await logAction(id, name, "delete requested", "—", "Staff ne delete request bheja", "Awaiting approval");
  showToast("✅ Delete request bhej diya — Manager/Master approve karenge", "ok");
  // Trigger realtime notification for managers/master
  await fbSet("notifications/deleteRequest", {
    message: `${currentUser.name} ne "${name}" delete karne ki request bheji hai`,
    timestamp: Date.now(),
    reqId: reqRef.key
  });
}

// ── Manager/Master: Delete Category with password ──
async function deleteCatWithPass(id, name) {
  openDeleteConfirm("🗑️ Category Delete Confirm", name, async () => {
    const items = await getItems();
    if(Object.values(items).some(i => i.catId === id)) {
      showToast("❌ Category mein items hain — pehle items delete karo", "err");
      return;
    }
    await fbRemove("categories/" + id);
    renderCategories();
    showToast("🗑️ Category deleted: " + name, "warn");
  });
}

// ── Staff: Request category delete ──
async function requestDeleteCat(id, name) {
  if(!confirm(`"${name}" category delete karne ka request bhejein?`)) return;
  const reqRef = db.ref("deleteRequests").push();
  await reqRef.set({
    id: reqRef.key,
    type: "category",
    targetId: id,
    targetName: name,
    requestedBy: currentUser.username,
    requestedByName: currentUser.name,
    requestedAt: Date.now(),
    status: "pending"
  });
  await fbSet("notifications/deleteRequest", {
    message: `${currentUser.name} ne "${name}" category delete karne ki request bheji hai`,
    timestamp: Date.now(),
    reqId: reqRef.key
  });
  showToast("✅ Delete request bhej diya — Manager/Master approve karenge", "ok");
}

// ── Approve Requests Page (Dashboard mein dikhao) ──
async function renderPendingDeleteRequests() {
  const reqs = (await fbGet("deleteRequests")) || {};
  const pending = Object.values(reqs).filter(r => r.status === "pending");
  const el = document.getElementById("pendingDelReqs");
  if(!el) return;
  if(pending.length === 0) {
    el.innerHTML = '<div class="empty" style="padding:12px">✅ Koi pending request nahi</div>';
    return;
  }
  el.innerHTML = pending.map(r => `
    <div class="del-req-row">
      <div class="del-req-info">
        <span class="del-req-type">${r.type === "item" ? "📦 Item" : "🗂️ Category"}</span>
        <strong>${r.targetName}</strong>
        <span style="color:var(--muted);font-size:11px">— by ${r.requestedByName} • ${timeAgo(r.requestedAt)}</span>
      </div>
      <div class="ab">
        <button class="btn-gold sm" onclick="approveDeleteRequest('${r.id}','${r.type}','${r.targetId}','${r.targetName.replace(/'/g,"\'")}')">✅ Approve</button>
        <button class="btn-out sm" onclick="rejectDeleteRequest('${r.id}','${r.targetName.replace(/'/g,"\'")}')">❌ Reject</button>
      </div>
    </div>`).join("");
}

async function approveDeleteRequest(reqId, type, targetId, targetName) {
  openDeleteConfirm("✅ Approve Delete — " + (type==="item"?"Item":"Category"), targetName, async () => {
    await fbUpdate("deleteRequests/" + reqId, { status: "approved", approvedBy: currentUser.name, approvedAt: Date.now() });
    if(type === "item") {
      await fbRemove("items/" + targetId);
      await logAction(targetId, targetName, "deleted item", "—", "Approved by " + currentUser.name, "Staff request approved");
    } else {
      await fbRemove("categories/" + targetId);
    }
    showToast("✅ Delete approved: " + targetName, "ok");
    renderPendingDeleteRequests();
    if(type === "item") renderInventory();
    else renderCategories();
  });
}

async function rejectDeleteRequest(reqId, targetName) {
  if(!confirm(`"${targetName}" ki delete request reject karen?`)) return;
  await fbUpdate("deleteRequests/" + reqId, { status: "rejected", rejectedBy: currentUser.name, rejectedAt: Date.now() });
  showToast("❌ Delete request rejected: " + targetName, "warn");
  renderPendingDeleteRequests();
}

async function deleteItem(id, name) { await deleteItemWithPass(id, name, "item"); }


// ── PURCHASE ──
async function renderPurchase() {
  if(purchaseRows.length===0) await addPurchaseRow();
  renderPurchaseRows();
  await renderPurchaseHistory();
}
async function renderPurchaseHistory() {
  const logs=await getLogs();
  const purchases=Object.values(logs).filter(l=>l.action==="purchase/restock").sort((a,b)=>b.timestamp-a.timestamp).slice(0,20);
  document.getElementById("purchaseHistory").innerHTML=purchases.length?purchases.map(l=>`
    <tr>
      <td style="font-size:11px;font-family:var(--fm)">${fmtDate(l.timestamp)}</td>
      <td><strong>${l.itemName}</strong></td>
      <td class="qty-n" style="color:var(--teal)">${l.change||"—"}</td>
      <td>${l.userName}</td>
      <td style="font-size:12px;color:var(--muted)">${l.note||"—"}</td>
    </tr>`).join(""):'<tr><td colspan="5" class="empty">No purchases yet</td></tr>';
}
async function addPurchaseRow() {
  const items=await getItems();
  purchaseRows.push({itemId:"",qty:"",price:"",level:"box",note:"",items});
  renderPurchaseRows();
}
function renderPurchaseRows() {
  const container=document.getElementById("purchaseRows");
  if(purchaseRows.length===0){container.innerHTML='<div class="empty" style="padding:20px">Click "+ Add Row" to start</div>';return;}
  container.innerHTML=purchaseRows.map((row,idx)=>{
    const item=row.items&&row.itemId?Object.values(row.items).find(i=>i.id===row.itemId):null;
    const itemsOpts=row.items?Object.values(row.items).sort((a,b)=>a.name.localeCompare(b.name)).map(i=>`<option value="${i.id}" ${i.id===row.itemId?"selected":""}>${i.name}</option>`).join(""):"";
    const hint=item?`<div style="font-size:11px;color:var(--gold);margin-top:4px">📦 1 ${item.bulkUnit||"box"} = ${item.bulkToPack||"?"} ${item.sealedUnit||"bottle"} | 🍾 1 ${item.sealedUnit||"bottle"} = ${item.capacity||"?"} ${item.looseUnit||"ml"}</div>`:"";
    return `<div class="pur-row">
      <div style="flex:2">
        <select class="sel" style="width:100%" onchange="updatePurchaseRow(${idx},'itemId',this.value);renderPurchaseRows()"><option value="">-- Select Item --</option>${itemsOpts}</select>
        ${hint}
      </div>
      <select class="sel" onchange="updatePurchaseRow(${idx},'level',this.value)">
        <option value="box" ${row.level==="box"?"selected":""}>📦 Box/Crate (Level 1)</option>
        <option value="sealed" ${row.level==="sealed"?"selected":""}>🍾 Bottle/Packet (Level 2)</option>
        <option value="loose" ${row.level==="loose"?"selected":""}>🔓 Loose/Base (Level 3)</option>
      </select>
      <input type="number" class="inp" placeholder="Qty" value="${row.qty}" min="0" step="0.001" oninput="updatePurchaseRow(${idx},'qty',this.value)" onchange="updatePurchaseRow(${idx},'qty',this.value)">
      <input type="number" class="inp" placeholder="Total Price (₹)" value="${row.price||""}" min="0" step="0.01" oninput="updatePurchaseRow(${idx},'price',this.value)" onchange="updatePurchaseRow(${idx},'price',this.value)">
      <input type="text" class="inp" placeholder="Note" value="${row.note}" oninput="updatePurchaseRow(${idx},'note',this.value)" onchange="updatePurchaseRow(${idx},'note',this.value)">
      <button class="pur-del" onclick="removePurchaseRow(${idx})">✕</button>
    </div>`;
  }).join("");
}
function updatePurchaseRow(idx,key,val){ purchaseRows[idx][key]=val; }
function removePurchaseRow(idx){ purchaseRows.splice(idx,1); renderPurchaseRows(); }
async function savePurchaseToStock() {
  const valid=purchaseRows.filter(r=>r.itemId&&r.qty&&parseFloat(r.qty)>0);
  if(valid.length===0){showToast("Add at least one item","warn");return;}
  let priceWarning=false;
  for(const row of valid) {
    const item=await fbGet("items/"+row.itemId); if(!item) continue;
    const qty=parseFloat(row.qty)||0;
    const priceRaw=String(row.price||"").trim();
    const price=(priceRaw===""||priceRaw==="0")?0:(parseFloat(priceRaw)||0);
    const f1=item.bulkToPack||1, f2=item.capacity||1;
    const lc=item.levelCount||"3";
    let updates={lastUpdatedBy:currentUser.username,lastUpdatedByName:currentUser.name,lastUpdatedAt:Date.now()};
    let change="", newBaseQty=0;
    if(row.level==="box"){
      newBaseQty=qty*f1*f2;
      updates.boxQty=parseFloat(((item.boxQty||0)+qty).toFixed(4));
      change=`+${qty} ${item.bulkUnit||"box"} = ${qty*f1} ${item.sealedUnit||"pack"} = ${newBaseQty} ${item.looseUnit||"unit"}`;
    } else if(row.level==="sealed"){
      newBaseQty=(lc==="2")?qty:(qty*f2);
      updates.sealedQty=parseFloat(((item.sealedQty||0)+qty).toFixed(4));
      change=`+${qty} ${item.sealedUnit||"pack"} = ${newBaseQty} ${item.looseUnit||item.sealedUnit||"unit"}`;
    } else {
      newBaseQty=qty;
      updates.looseQty=parseFloat(((item.looseQty||0)+qty).toFixed(4));
      change=`+${qty} ${item.looseUnit||"unit"} loose`;
    }
    if(price>0 && newBaseQty>0){
      const oldBase=totalBase(item);
      const oldCost=parseFloat(item.avgCostPerBase)||0;
      const newCPB=price/newBaseQty;
      let wAvg;
      if(oldBase>0 && oldCost>0){
        wAvg=((oldBase*oldCost)+(newBaseQty*newCPB))/(oldBase+newBaseQty);
      } else {
        wAvg=newCPB;
      }
      updates.avgCostPerBase=parseFloat(wAvg.toFixed(6));
      change+=` | ₹${price} total → Avg: ${fmtINR(wAvg)}/${item.looseUnit||item.sealedUnit||"unit"}`;
    } else if(price===0){
      priceWarning=true;
    }
    await fbUpdate("items/"+row.itemId,updates);
    await logAction(row.itemId,item.name,"purchase/restock",row.level,change,row.note||"Purchase");
  }
  purchaseRows=[];
  const msg=`✅ ${valid.length} item(s) restocked!${priceWarning?" ⚠️ Kuch items mein price nahi dala — stock value update nahi hogi":""}`;
  document.getElementById("purchaseMsg").textContent=msg;
  setTimeout(()=>{document.getElementById("purchaseMsg").textContent="";},5000);
  renderPurchase();
  showToast(priceWarning?`✅ ${valid.length} restocked — price daalna mat bhoolo`:'✅ '+valid.length+' restocked + price updated',"ok");
}

// ── COMPLIMENTARY / NON-CHARGE ──
async function renderComplimentary() {
  // Populate item dropdown
  const items = await getItems();
  const arr = Object.values(items).sort((a,b)=>a.name.localeCompare(b.name));
  const sel = document.getElementById("compItem");
  sel.innerHTML = '<option value="">-- Choose Item --</option>' + arr.map(i=>`<option value="${i.id}">${i.name} | ${decompose3(i)}</option>`).join("");

  // auth other toggle
  document.getElementById("compAuth").onchange = () => {
    const v = document.getElementById("compAuth").value;
    document.getElementById("compAuthOtherWrap").style.display = v==="other" ? "" : "none";
  };

  await renderComplimentaryHistory();
}

function onCompItemChange() {
  const id = document.getElementById("compItem").value;
  const infoBox = document.getElementById("compItemInfo");
  if(!id) { infoBox.className="item-info-box"; return; }
  getItems().then(items => {
    const item = items[id];
    if(!item) return;
    infoBox.innerHTML = `<strong>${item.name}</strong><br>
      📦 Box/Crate: <strong>${item.boxQty||0} ${item.bulkUnit||""}</strong>
      &nbsp;|&nbsp; 🍾 Sealed: <strong>${item.sealedQty||0} ${item.sealedUnit||""}</strong>
      &nbsp;|&nbsp; 🔓 Loose: <strong>${item.looseQty||0} ${item.looseUnit||""}</strong><br>
      <span style="color:var(--teal)">Smart Total: <strong>${decompose3(item)}</strong></span>`;
    infoBox.className = "item-info-box show";
  });
}

async function saveComplimentary() {
  const guest = document.getElementById("compGuest").value.trim();
  const itemId = document.getElementById("compItem").value;
  const level = document.getElementById("compLevel").value;
  const qty = parseFloat(document.getElementById("compQty").value);
  const authBy = document.getElementById("compAuth").value;
  const authOther = document.getElementById("compAuthOther")?.value.trim() || "";
  const note = document.getElementById("compNote").value.trim();

  if(!guest) { showToast("Guest/Table naam required", "warn"); return; }
  if(!itemId) { showToast("Item select karo", "warn"); return; }
  if(isNaN(qty) || qty <= 0) { showToast("Valid quantity daalo", "warn"); return; }

  const item = await fbGet("items/" + itemId);
  if(!item) { showToast("Item not found", "err"); return; }

  // Deduct from inventory
  let updates = { lastUpdatedBy: currentUser.username, lastUpdatedByName: currentUser.name, lastUpdatedAt: Date.now() };
  let changeText = "", unitLabel = "";

  if(level === "box") {
    const old = item.boxQty || 0;
    const nw = Math.max(0, old - qty);
    updates.boxQty = nw;
    unitLabel = item.bulkUnit || "box";
    changeText = `-${qty} ${unitLabel} (Complimentary: ${old}→${nw})`;
  } else if(level === "sealed") {
    const old = item.sealedQty || 0;
    const nw = Math.max(0, old - qty);
    updates.sealedQty = nw;
    unitLabel = item.sealedUnit || "bottle";
    changeText = `-${qty} ${unitLabel} (Complimentary: ${old}→${nw})`;
  } else {
    const old = item.looseQty || 0;
    const nw = Math.max(0, old - qty);
    updates.looseQty = nw;
    unitLabel = item.looseUnit || "unit";
    changeText = `-${qty} ${unitLabel} (Complimentary: ${old}→${nw})`;
  }

  // Determine instruction by label
  const authLabels = { self: currentUser.name, manager: "Manager", master: "Owner/Master", other: authOther || "Other" };
  const authorizedBy = authLabels[authBy] || authBy;

  // Save complimentary record
  const ref = db.ref("complimentary").push();
  await ref.set({
    id: ref.key,
    timestamp: Date.now(),
    guest,
    itemId,
    itemName: item.name,
    level,
    qty,
    unitLabel,
    authorizedBy,
    note,
    enteredBy: currentUser.username,
    enteredByName: currentUser.name,
    enteredByRole: currentUser.role
  });

  // Deduct from inventory
  await fbUpdate("items/" + itemId, updates);

  // Audit log
  await logAction(itemId, item.name, "complimentary given", level, changeText, `Guest: ${guest} | Auth: ${authorizedBy}${note ? " | "+note : ""}`);

  // Reset form
  document.getElementById("compGuest").value = "";
  document.getElementById("compItem").value = "";
  document.getElementById("compQty").value = "";
  document.getElementById("compNote").value = "";
  document.getElementById("compItemInfo").className = "item-info-box";

  showToast(`✅ Complimentary saved — ${qty} ${unitLabel} deducted from ${item.name}`, "ok");
  document.getElementById("compMsg").textContent = `✅ ${qty} ${unitLabel} of "${item.name}" given to ${guest} — Authorized by: ${authorizedBy}`;
  setTimeout(()=>{ document.getElementById("compMsg").textContent = ""; }, 5000);

  renderComplimentary();
}

async function renderComplimentaryHistory() {
  const records = (await fbGet("complimentary")) || {};
  const fromDate = document.getElementById("compFromDate")?.value;
  const toDate = document.getElementById("compToDate")?.value;
  const lvlFilter = document.getElementById("compLevelFilter")?.value || "";

  let arr = Object.values(records).sort((a,b) => b.timestamp - a.timestamp);

  if(fromDate) {
    const fd = new Date(fromDate); fd.setHours(0,0,0,0);
    arr = arr.filter(r => r.timestamp >= fd.getTime());
  }
  if(toDate) {
    const td = new Date(toDate); td.setHours(23,59,59,999);
    arr = arr.filter(r => r.timestamp <= td.getTime());
  }
  if(lvlFilter) arr = arr.filter(r => r.level === lvlFilter);

  document.getElementById("compTotal").textContent = arr.length;

  document.getElementById("compBody").innerHTML = arr.length ? arr.map(r => `
    <tr>
      <td style="font-family:var(--fm);font-size:11px;white-space:nowrap">${fmtDate(r.timestamp)}</td>
      <td><strong>${r.guest||"—"}</strong></td>
      <td><strong>${r.itemName||"—"}</strong></td>
      <td>
        ${r.level==="box"?'<span class="badge" style="background:rgba(201,151,42,0.15);color:var(--gold)">📦 L1 Box</span>':
          r.level==="sealed"?'<span class="badge" style="background:rgba(14,155,140,0.15);color:var(--teal)">🍾 L2 Bottle</span>':
          '<span class="badge" style="background:rgba(184,74,42,0.15);color:var(--rust)">🔓 L3 Loose</span>'}
      </td>
      <td class="qty-n" style="color:var(--rust);font-weight:700">${r.qty} <span style="font-size:11px;color:var(--muted)">${r.unitLabel||""}</span></td>
      <td><span class="rb" style="background:rgba(14,155,140,0.15);color:var(--teal)">${r.authorizedBy||"—"}</span></td>
      <td style="color:var(--muted);font-size:12px">${r.note||"—"}</td>
      <td style="font-size:11px;color:var(--muted)">${r.enteredByName||"—"}</td>
      <td>
        ${(currentUser?.role==="master"||currentUser?.role==="manager")?
          `<button class="bi d" onclick="deleteComplimentary('${r.id}','${(r.itemName||"").replace(/'/g,"\\'")}')">🗑️</button>`:
          ""}
      </td>
    </tr>`).join("") :
    '<tr><td colspan="9" class="empty"><span class="emp-i">🎁</span>Koi complimentary record nahi</td></tr>';
}

function filterComplimentary() { renderComplimentaryHistory(); }

async function deleteComplimentary(id, itemName) {
  if(!confirm(`"${itemName}" ka complimentary record delete karen?\n\n⚠️ Note: Stock wapas nahi aayega — sirf record delete hoga.`)) return;
  await fbRemove("complimentary/" + id);
  showToast("🗑️ Complimentary record deleted", "warn");
  renderComplimentaryHistory();
}

async function downloadCompExcel() {
  const records = (await fbGet("complimentary")) || {};
  const fromDate = document.getElementById("compFromDate")?.value;
  const toDate = document.getElementById("compToDate")?.value;
  let arr = Object.values(records).sort((a,b) => a.timestamp - b.timestamp);
  if(fromDate) { const fd=new Date(fromDate); fd.setHours(0,0,0,0); arr=arr.filter(r=>r.timestamp>=fd.getTime()); }
  if(toDate) { const td=new Date(toDate); td.setHours(23,59,59,999); arr=arr.filter(r=>r.timestamp<=td.getTime()); }
  const rows = [["Date & Time","Guest / Table","Item","Level","Qty Given","Unit","Authorized By","Note","Entry By"]];
  arr.forEach(r=>rows.push([fmtDate(r.timestamp),r.guest||"",r.itemName||"",r.level,r.qty,r.unitLabel||"",r.authorizedBy||"",r.note||"",r.enteredByName||""]));
  downloadXLSX(rows, "Anusuya_Complimentary_"+todayStr());
}

async function downloadCompPDF() {
  const records = (await fbGet("complimentary")) || {};
  const fromDate = document.getElementById("compFromDate")?.value;
  const toDate = document.getElementById("compToDate")?.value;
  let arr = Object.values(records).sort((a,b) => a.timestamp - b.timestamp);
  if(fromDate) { const fd=new Date(fromDate); fd.setHours(0,0,0,0); arr=arr.filter(r=>r.timestamp>=fd.getTime()); }
  if(toDate) { const td=new Date(toDate); td.setHours(23,59,59,999); arr=arr.filter(r=>r.timestamp<=td.getTime()); }
  const rows = arr.map(r=>`<tr><td>${fmtDate(r.timestamp)}</td><td>${r.guest||""}</td><td>${r.itemName||""}</td><td>${r.level}</td><td>${r.qty} ${r.unitLabel||""}</td><td>${r.authorizedBy||""}</td><td>${r.note||"—"}</td><td>${r.enteredByName||""}</td></tr>`).join("");
  const html=`<html><head><style>body{font-family:Arial;padding:20px}h2{color:#1a0f0a}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#1a0f0a;color:#c9972a;padding:8px;text-align:left}td{padding:6px 8px;border-bottom:1px solid #eee}tr:nth-child(even) td{background:#fafafa}.head{color:#c9972a;font-size:12px;margin-bottom:16px}</style></head><body>
  <h2>🐟 Anusuya Restaurant & Bar</h2>
  <div class="head">🎁 Complimentary Report${fromDate?" | From: "+fromDate:""}${toDate?" To: "+toDate:""}</div>
  <table><thead><tr><th>Date & Time</th><th>Guest / Table</th><th>Item</th><th>Level</th><th>Qty Given</th><th>Authorized By</th><th>Note</th><th>Entry By</th></tr></thead><tbody>${rows}</tbody></table>
  <div style="margin-top:20px;font-size:10px;color:#aaa">Anusuya Inventory v8 | Total Records: ${arr.length}</div></body></html>`;
  const w=window.open("","_blank"); w.document.write(html); w.document.close(); setTimeout(()=>w.print(),600);
}

// ── DOWNLOADS ──
async function downloadInventoryExcel() {
  const [items,cats]=await Promise.all([getItems(),getCats()]);
  const rows=[["Item","Category","Box Qty","Box Unit","Sealed Qty","Sealed Unit","Loose Qty","Loose Unit","Smart Total","Avg Cost/Base","Stock Value (₹)","Min Box","Min Sealed","Min Loose","Status","Last Updated"]];
  Object.values(items).sort((a,b)=>a.name.localeCompare(b.name)).forEach(i=>{
    const s=statusBadge(i).includes("b-ok")?"In Stock":statusBadge(i).includes("b-low")?"Low Stock":"Out of Stock";
    rows.push([i.name,catName(cats,i.catId),i.boxQty||0,i.bulkUnit||"",i.sealedQty||0,i.sealedUnit||"",i.looseQty||0,i.looseUnit||"",decompose3(i),(i.avgCostPerBase||0).toFixed(4),stockVal(i).toFixed(2),i.minBox||0,i.minSealed||0,i.minLoose||0,s,fmtDate(i.lastUpdatedAt)]);
  });
  downloadXLSX(rows,"Anusuya_Inventory_"+todayStr());
}
async function downloadLowStockExcel() {
  const [items,cats]=await Promise.all([getItems(),getCats()]);
  const low=Object.values(items).filter(i=>totalBase(i)<=0||(i.boxQty||0)<=(i.minBox||0)||(i.sealedQty||0)<=(i.minSealed||0)||(i.looseQty||0)<(i.minLoose||0));
  const rows=[["Item","Category","Box","Sealed","Loose","Min Box","Min Sealed","Min Loose","Shortage"]];
  low.forEach(i=>rows.push([i.name,catName(cats,i.catId),i.boxQty||0,i.sealedQty||0,i.looseQty||0,i.minBox||0,i.minSealed||0,i.minLoose||0,"Check"]));
  downloadXLSX(rows,"Anusuya_LowStock_"+todayStr());
}
async function downloadExpenseExcel() {
  const expenses=await getExpenses();
  const fromDate=document.getElementById("expFromDate")?.value;
  const toDate=document.getElementById("expToDate")?.value;
  let arr=Object.values(expenses).sort((a,b)=>a.date>b.date?1:-1);
  if(fromDate) arr=arr.filter(e=>e.date>=fromDate);
  if(toDate) arr=arr.filter(e=>e.date<=toDate);
  const rows=[["Date","Description","Category","Amount (₹)","Note","Added By"]];
  arr.forEach(e=>rows.push([e.date,e.description,e.category||"General",e.amount||0,e.note||"",e.addedByName||""]));
  const total=arr.reduce((s,e)=>s+(e.amount||0),0);
  rows.push(["","","TOTAL",total.toFixed(2),"",""]);
  downloadXLSX(rows,"Anusuya_Expenses_"+todayStr());
}
async function downloadAuditExcel() {
  const logs=await getLogs();
  const rows=[["Date & Time","User","Action","Item","Level","Change","Note"]];
  Object.values(logs).sort((a,b)=>b.timestamp-a.timestamp).forEach(l=>rows.push([fmtDate(l.timestamp),l.userName,l.action,l.itemName,l.container||"",l.change||"",l.note||""]));
  downloadXLSX(rows,"Anusuya_AuditLog_"+todayStr());
}
async function downloadExpensePDF() {
  const expenses=await getExpenses();
  const fromDate=document.getElementById("expFromDate")?.value;
  const toDate=document.getElementById("expToDate")?.value;
  let arr=Object.values(expenses).sort((a,b)=>a.date>b.date?1:-1);
  if(fromDate) arr=arr.filter(e=>e.date>=fromDate);
  if(toDate) arr=arr.filter(e=>e.date<=toDate);
  const total=arr.reduce((s,e)=>s+(e.amount||0),0);
  const html=`<html><head><style>body{font-family:Arial;padding:20px}h2{color:#1a0f0a}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#1a0f0a;color:#c9972a;padding:8px;text-align:left}td{padding:7px 8px;border-bottom:1px solid #eee}tr:nth-child(even) td{background:#fafafa}.total{font-weight:bold;font-size:14px;color:#b84a2a}</style></head><body>
    <h2>🐟 Anusuya Restaurant & Bar</h2>
    <div style="color:#c9972a;font-size:12px;margin-bottom:16px">Daily Expense Report${fromDate?" | From: "+fromDate:""}${toDate?" To: "+toDate:""}</div>
    <table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount (₹)</th><th>Note</th></tr></thead><tbody>
    ${arr.map(e=>`<tr><td>${e.date}</td><td>${e.description}</td><td>${e.category||"General"}</td><td>₹${(e.amount||0).toFixed(2)}</td><td>${e.note||"—"}</td></tr>`).join("")}
    <tr><td colspan="3" class="total">TOTAL</td><td class="total">₹${total.toFixed(2)}</td><td></td></tr>
    </tbody></table>
    <div style="margin-top:20px;font-size:10px;color:#aaa">Anusuya Inventory v8</div>
    </body></html>`;
  const w=window.open("","_blank"); w.document.write(html); w.document.close(); setTimeout(()=>w.print(),600);
}
async function downloadInventoryPDF() {
  const [items,cats]=await Promise.all([getItems(),getCats()]);
  const rows=Object.values(items).sort((a,b)=>a.name.localeCompare(b.name)).map(i=>`<tr><td>${i.name}</td><td>${catName(cats,i.catId)}</td><td>${i.boxQty||0} ${i.bulkUnit||""}</td><td>${i.sealedQty||0} ${i.sealedUnit||""}</td><td>${i.looseQty||0} ${i.looseUnit||""}</td><td>${decompose3(i)}</td><td>${i.lastUpdatedByName||"—"}</td></tr>`).join("");
  const html=`<html><head><style>body{font-family:Arial;padding:20px}h2{color:#1a0f0a}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#1a0f0a;color:#c9972a;padding:7px;text-align:left}td{padding:6px 7px;border-bottom:1px solid #eee}tr:nth-child(even) td{background:#fafafa}</style></head><body>
    <h2>🐟 Anusuya Restaurant & Bar</h2><div style="color:#c9972a;font-size:12px;margin-bottom:16px">Full Inventory — ${todayStr()}</div>
    <table><thead><tr><th>Item</th><th>Category</th><th>Box</th><th>Sealed</th><th>Loose</th><th>Smart Total</th><th>Updated By</th></tr></thead><tbody>${rows}</tbody></table>
    <div style="margin-top:20px;font-size:10px;color:#aaa">Anusuya Inventory v8</div></body></html>`;
  const w=window.open("","_blank"); w.document.write(html); w.document.close(); setTimeout(()=>w.print(),600);
}
async function downloadLowStockPDF() {
  const [items,cats]=await Promise.all([getItems(),getCats()]);
  const low=Object.values(items).filter(i=>totalBase(i)<=0||(i.boxQty||0)<=(i.minBox||0)||(i.sealedQty||0)<=(i.minSealed||0)||(i.looseQty||0)<(i.minLoose||0));
  const rows=low.map(i=>`<tr><td>${i.name}</td><td>${catName(cats,i.catId)}</td><td>${i.boxQty||0} ${i.bulkUnit||""}</td><td>${i.sealedQty||0} ${i.sealedUnit||""}</td><td>${i.looseQty||0} ${i.looseUnit||""}</td></tr>`).join("");
  const html=`<html><head><style>body{font-family:Arial;padding:20px}h2{color:#1a0f0a}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#1a0f0a;color:#c9972a;padding:8px;text-align:left}td{padding:7px 8px;border-bottom:1px solid #eee}tr:nth-child(even) td{background:#fafafa}</style></head><body>
    <h2>🐟 Anusuya Restaurant & Bar</h2><div style="color:#c9972a;font-size:12px;margin-bottom:16px">Low Stock Report — ${todayStr()}</div>
    <table><thead><tr><th>Item</th><th>Category</th><th>Box</th><th>Sealed</th><th>Loose</th></tr></thead><tbody>${rows}</tbody></table>
    <div style="margin-top:20px;font-size:10px;color:#aaa">Anusuya Inventory v8</div></body></html>`;
  const w=window.open("","_blank"); w.document.write(html); w.document.close(); setTimeout(()=>w.print(),600);
}

// ── LOOSE STOCK DOWNLOADS ──
async function downloadLooseStockExcel() {
  const [items,cats]=await Promise.all([getItems(),getCats()]);
  const arr=Object.values(items).filter(i=>(i.looseQty||0)>0).sort((a,b)=>a.name.localeCompare(b.name));
  const rows=[["Item","Category","Loose Qty","Unit","Cost/Unit (₹)","Loose Value (₹)","Min Loose","Status","Last Updated"]];
  arr.forEach(i=>{
    const s=statusBadge(i).includes("b-ok")?"In Stock":statusBadge(i).includes("b-low")?"Low Stock":"Out of Stock";
    rows.push([i.name,catName(cats,i.catId),i.looseQty||0,i.looseUnit||"",
      (i.avgCostPerBase||0).toFixed(4),
      ((i.looseQty||0)*(i.avgCostPerBase||0)).toFixed(2),
      i.minLoose||0,s,fmtDate(i.lastUpdatedAt)]);
  });
  downloadXLSX(rows,"Anusuya_LooseStock_"+todayStr());
}
async function downloadLooseStockPDF() {
  const [items,cats]=await Promise.all([getItems(),getCats()]);
  const arr=Object.values(items).filter(i=>(i.looseQty||0)>0).sort((a,b)=>a.name.localeCompare(b.name));
  const rows=arr.map(i=>`<tr><td>${i.name}</td><td>${catName(cats,i.catId)}</td><td>${i.looseQty||0} ${i.looseUnit||""}</td><td>${i.avgCostPerBase?fmtINR(i.avgCostPerBase)+"/"+(i.looseUnit||"unit"):"—"}</td><td>${i.avgCostPerBase?fmtINR((i.looseQty||0)*(i.avgCostPerBase||0)):"—"}</td><td>${i.minLoose||0} ${i.looseUnit||""}</td></tr>`).join("");
  const html=`<html><head><style>body{font-family:Arial;padding:20px}h2{color:#1a0f0a}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#1a0f0a;color:#c9972a;padding:8px;text-align:left}td{padding:7px 8px;border-bottom:1px solid #eee}tr:nth-child(even) td{background:#fafafa}</style></head><body>
    <h2>🐟 Anusuya Restaurant & Bar</h2><div style="color:#c9972a;font-size:12px;margin-bottom:16px">Loose Stock Report — ${todayStr()}</div>
    <table><thead><tr><th>Item</th><th>Category</th><th>Loose Qty</th><th>Cost/Unit</th><th>Loose Value</th><th>Min Loose</th></tr></thead><tbody>${rows}</tbody></table>
    <div style="margin-top:20px;font-size:10px;color:#aaa">Anusuya Inventory v8</div></body></html>`;
  const w=window.open("","_blank"); w.document.write(html); w.document.close(); setTimeout(()=>w.print(),600);
}

// ── PURCHASE DOWNLOAD ──
async function downloadPurchaseExcel() {
  const items = await getItems();
  const rows = [["Item Name","Category","Box Unit","Pack Unit","Base Unit","Box→Pack","Pack→Base","Min Box","Min Pack","Min Base","Avg Cost/Base","Current Stock"]];
  const cats = await getCats();
  Object.values(items).sort((a,b)=>a.name.localeCompare(b.name)).forEach(i=>{
    rows.push([i.name, catName(cats,i.catId), i.bulkUnit||"", i.sealedUnit||"", i.looseUnit||"",
      i.bulkToPack||"", i.capacity||"", i.minBox||0, i.minSealed||0, i.minLoose||0,
      (i.avgCostPerBase||0).toFixed(4), decompose3(i)]);
  });
  downloadXLSX(rows, "Anusuya_Purchase_Form_"+todayStr());
}
async function downloadPurchasePDF() {
  const [items,cats] = await Promise.all([getItems(),getCats()]);
  const rows = Object.values(items).sort((a,b)=>a.name.localeCompare(b.name)).map(i=>`<tr><td>${i.name}</td><td>${catName(cats,i.catId)}</td><td>${decompose3(i)}</td><td>${i.avgCostPerBase?fmtINR(i.avgCostPerBase*(i.capacity||1)):"—"}</td><td></td><td></td></tr>`).join("");
  const html=`<html><head><style>body{font-family:Arial;padding:20px}h2{color:#1a0f0a}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#1a0f0a;color:#c9972a;padding:8px;text-align:left}td{padding:7px 8px;border-bottom:1px solid #eee}tr:nth-child(even) td{background:#fafafa}</style></head><body>
  <h2>🐟 Anusuya Restaurant & Bar — Purchase Entry Form</h2>
  <div style="color:#c9972a;font-size:12px;margin-bottom:16px">Date: ${todayStr()}</div>
  <table><thead><tr><th>Item</th><th>Category</th><th>Current Stock</th><th>Unit Price</th><th>Qty Ordered</th><th>Total (₹)</th></tr></thead><tbody>${rows}</tbody></table>
  <div style="margin-top:20px;font-size:10px;color:#aaa">Anusuya Inventory v8</div></body></html>`;
  const w=window.open("","_blank"); w.document.write(html); w.document.close(); setTimeout(()=>w.print(),600);
}
function downloadXLSX(rows,filename){ if(typeof XLSX==="undefined"){showToast("Excel not loaded","err");return;} const wb=XLSX.utils.book_new(); const ws=XLSX.utils.aoa_to_sheet(rows); XLSX.utils.book_append_sheet(wb,ws,"Data"); XLSX.writeFile(wb,filename+".xlsx"); }

// ── MODALS ──
function openModal(id){ document.getElementById(id)?.classList.add("active"); }
function closeModal(id){ document.getElementById(id)?.classList.remove("active"); }
document.addEventListener("click",e=>{ if(e.target.classList.contains("mo-overlay")) e.target.classList.remove("active"); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape") document.querySelectorAll(".mo-overlay.active").forEach(m=>m.classList.remove("active")); });
