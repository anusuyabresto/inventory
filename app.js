// ================================================================
// ANUSUYA RESTAURANT & BAR — INVENTORY MANAGEMENT SYSTEM v6
// Firebase Realtime DB | Smart Stock | Price Tracking | Live Feed
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
  console.log("Firebase connected");
} catch(e) { console.error("Firebase init:", e); }

let currentUser = null, currentPage = "dashboard";
let purchaseRows = [], pendingOpenSealed = null, _rtListeners = [];

function fbRef(p) { return db.ref(p); }
function fbGet(p) { return fbRef(p).once("value").then(s => s.val()); }
function fbSet(p, d) { return fbRef(p).set(d); }
function fbPush(p, d) { return fbRef(p).push(d); }
function fbRemove(p) { return fbRef(p).remove(); }
function fbUpdate(p, d) { return fbRef(p).update(d); }

async function getCats() { return (await fbGet("categories")) || {}; }
async function getItems() { return (await fbGet("items")) || {}; }
async function getLogs() { return (await fbGet("auditlog")) || {}; }
async function getUsers() { return (await fbGet("users")) || {}; }

function totalBaseQty(i) { return ((i.sealedQty||0)*(i.capacity||1))+(i.looseQty||0); }
function stockValue(i) { return i.avgCostPerBase ? totalBaseQty(i)*i.avgCostPerBase : 0; }
function fmtINR(n) { return "\u20b9"+parseFloat(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,","); }

function decomposeQty(i) {
  const f1=i.bulkToPack||1, f2=i.capacity||1, base=totalBaseQty(i);
  if(f1>1){
    const bulk=Math.floor(base/(f1*f2)), rem=base%(f1*f2);
    const pack=Math.floor(rem/f2), loose=parseFloat((rem%f2).toFixed(3));
    const parts=[];
    if(bulk>0) parts.push(bulk+" "+(i.bulkUnit||"bulk"));
    if(pack>0) parts.push(pack+" "+(i.sealedUnit||"pack"));
    if(loose>0||parts.length===0) parts.push(loose+" "+(i.looseUnit||"base"));
    return parts.join(" + ");
  } else {
    const pack=Math.floor(base/f2), loose=parseFloat((base%f2).toFixed(3));
    const parts=[];
    if(pack>0) parts.push(pack+" "+(i.sealedUnit||"pack"));
    if(loose>0||parts.length===0) parts.push(loose+" "+(i.looseUnit||"base"));
    return parts.join(" + ");
  }
}

function catName(cats,id){ return cats[id]?.name||"—"; }
function catIcon(cats,id){ return cats[id]?.icon||"\ud83d\udce6"; }

function statusBadge(item){
  const base=totalBaseQty(item);
  if(base<=0) return '<span class="badge b-out">Out of Stock</span>';
  if((item.sealedQty||0)<=(item.minSealed||0)||(item.looseQty||0)<(item.minLoose||0))
    return '<span class="badge b-low">Low Stock</span>';
  return '<span class="badge b-ok">In Stock</span>';
}

function fmtDate(ts){
  if(!ts) return "—";
  const d=new Date(ts);
  return d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})+" "+d.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
}
function timeAgo(ts){
  const d=Date.now()-ts;
  if(d<60000) return "just now";
  if(d<3600000) return Math.floor(d/60000)+"m ago";
  if(d<86400000) return Math.floor(d/3600000)+"h ago";
  return Math.floor(d/86400000)+"d ago";
}
function showToast(msg,type="ok"){
  const t=document.getElementById("toast");
  t.textContent=msg; t.className="toast show "+type;
  setTimeout(()=>t.className="toast",3200);
}
function genId(p){ return p+"_"+Date.now()+"_"+Math.random().toString(36).substr(2,6); }
function todayStr(){ return new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}).replace(/ /g,"-"); }

// ---- TICKER ----
function injectTicker(){
  if(document.getElementById("activityTicker")) return;
  const t=document.createElement("div"); t.id="activityTicker";
  t.style.cssText="position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:rgba(26,15,10,0.96);color:#fff;padding:10px 20px;border-radius:30px;font-size:13px;border:1px solid #c9972a;z-index:9999;max-width:90vw;text-align:center;opacity:0;transition:opacity 0.4s;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.5)";
  document.body.appendChild(t);
  const s=document.createElement("style"); s.textContent="#activityTicker.show{opacity:1!important}";
  document.head.appendChild(s);
}
function showTicker(log){
  const t=document.getElementById("activityTicker"); if(!t) return;
  const icon=log.action.includes("purchase")?"\ud83d\udecd":log.action.includes("add")?"\ud83d\udce6":log.action.includes("open")?"\ud83d\udd13":log.action.includes("consume")||log.action.includes("remove")?"\ud83d\udce4":log.action.includes("delete")?"\ud83d\uddd1":"\ud83d\udd04";
  t.innerHTML=icon+" <strong>"+log.userName+"</strong> — "+log.itemName+(log.change?" | "+log.change:"");
  t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),4000);
}

// ---- INIT ----
document.addEventListener("DOMContentLoaded", async()=>{
  const li=document.getElementById("logoImg");
  if(li && document.getElementById("sbLogo")) document.getElementById("sbLogo").src=li.src;
  initLogin(); initNav(); startClock(); injectTicker();

  const su=sessionStorage.getItem("anusuya_user");
  if(su){
    try{ currentUser=JSON.parse(su); await enterApp(); }
    catch(e){ sessionStorage.removeItem("anusuya_user"); currentUser=null; }
  }

  window.addEventListener("beforeinstallprompt",(e)=>{ e.preventDefault(); window._pwaPrompt=e; });
  if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
});

// ---- CLOCK ----
function startClock(){
  const upd=()=>{ const n=new Date(); document.getElementById("clock").textContent=n.toLocaleDateString("en-IN",{weekday:"short",day:"2-digit",month:"short"})+"  "+n.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}); };
  upd(); setInterval(upd,30000);
}

// ---- LOGIN ----
function initLogin(){
  document.getElementById("loginForm").addEventListener("submit",async(e)=>{
    e.preventDefault();
    const username=document.getElementById("loginUser").value.trim().toLowerCase();
    const password=document.getElementById("loginPass").value;
    if(!firebaseReady||!db){ showLoginError("Firebase connect nahi hua! Page refresh karo."); return; }
    showLoginError("\u23f3 Connecting...");
    try{
      const masterExists=await fbGet("users/master");
      if(!masterExists){
        await fbSet("users/master",{name:"Master Admin",username:"master",password:"ansuya@123",role:"master",createdAt:Date.now()});
      }
      const users=await fbGet("users");
      if(!users){ showLoginError("Database empty! Firebase Rules check karo."); return; }
      const user=Object.values(users).find(u=>u.username===username&&u.password===password);
      if(user){ currentUser=user; sessionStorage.setItem("anusuya_user",JSON.stringify(user)); showLoginError(""); await enterApp(); }
      else showLoginError("\u274c Invalid username or password.");
    }catch(err){ console.error("Login error:",err); showLoginError("Error: "+err.message); }
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

// ---- ENTER APP ----
async function enterApp(){
  document.getElementById("loginScreen").classList.remove("active");
  document.getElementById("appScreen").classList.add("active");
  document.getElementById("sbName").textContent=currentUser.name;
  document.getElementById("sbRole").textContent=currentUser.role==="master"?"Master Admin":currentUser.role.charAt(0).toUpperCase()+currentUser.role.slice(1);
  document.getElementById("sbAv").textContent=currentUser.name.charAt(0).toUpperCase();
  document.querySelectorAll(".mo").forEach(el=>{ el.style.display=currentUser.role!=="master"?"none":""; });
  navigateTo("dashboard");
  startRealtimeListeners();
}

// ---- REALTIME ----
function startRealtimeListeners(){
  _rtListeners.forEach(r=>r.off()); _rtListeners=[];
  const ar=db.ref("auditlog").orderByChild("timestamp").limitToLast(1);
  ar.on("child_added",snap=>{
    const log=snap.val(); if(!log||!log.timestamp) return;
    if(Date.now()-log.timestamp>8000) return;
    showTicker(log);
    if(currentPage==="dashboard") renderDashboard();
    if(currentPage==="audit") renderAudit();
  });
  _rtListeners.push(ar);
  const ir=db.ref("items");
  ir.on("value",()=>{
    if(currentPage==="inventory") renderInventory();
    if(currentPage==="stock") renderStockPage();
    if(currentPage==="lowstock") renderLowStock();
  });
  _rtListeners.push(ir);
}

// ---- NAV ----
function initNav(){
  document.querySelectorAll(".ni").forEach(link=>{
    link.addEventListener("click",()=>{ navigateTo(link.dataset.p); document.getElementById("sidebar").classList.remove("open"); });
  });
  document.getElementById("hburg").addEventListener("click",()=>document.getElementById("sidebar").classList.toggle("open"));
}
function navigateTo(p){
  currentPage=p;
  document.querySelectorAll(".ni").forEach(l=>l.classList.remove("active"));
  document.querySelector(`.ni[data-p="${p}"]`)?.classList.add("active");
  document.querySelectorAll(".page").forEach(pg=>pg.classList.remove("active"));
  document.getElementById(`pg-${p}`)?.classList.add("active");
  const titles={dashboard:"Dashboard",inventory:"Inventory",stock:"Update Stock",lowstock:"Low Stock Alerts",audit:"Audit Log",users:"Manage Users",categories:"Categories",purchase:"Purchase Entry"};
  document.getElementById("pgTitle").textContent=titles[p]||p;
  if(p==="dashboard") renderDashboard();
  else if(p==="inventory") renderInventory();
  else if(p==="stock") renderStockPage();
  else if(p==="lowstock") renderLowStock();
  else if(p==="audit") renderAudit();
  else if(p==="users") renderUsers();
  else if(p==="categories") renderCategories();
  else if(p==="purchase") renderPurchase();
}

// ---- ENSURE MASTER + DEFAULT DATA ----
async function ensureMasterAccount(){
  if(!db||!firebaseReady) return;
  const exists=await fbGet("users/master");
  if(!exists){
    await fbSet("users/master",{name:"Master Admin",username:"master",password:"ansuya@123",role:"master",createdAt:Date.now()});
  }
  await ensureDefaultData();
}
async function ensureDefaultData(){
  const cats=await fbGet("categories"); if(cats) return;
  const defaultCats=[
    {name:"Seafood — Fresh Catch",icon:"\ud83d\udc1f",color:"#0e9b8c"},
    {name:"Spirits & Liquor",icon:"\ud83e\udd43",color:"#c9972a"},
    {name:"Beer",icon:"\ud83c\udf7a",color:"#b84a2a"},
    {name:"Soft Drinks & Water",icon:"\ud83d\udca7",color:"#2563eb"},
    {name:"Vegetables & Greens",icon:"\ud83e\udd66",color:"#22c55e"},
    {name:"Rice & Grains",icon:"\ud83c\udf3e",color:"#f59e0b"},
    {name:"Oils & Condiments",icon:"\ud83e\udeb4",color:"#8b5cf6"},
    {name:"Dairy & Eggs",icon:"\ud83e\udd5a",color:"#ec4899"},
    {name:"Frozen Items",icon:"\u2744\ufe0f",color:"#06b6d4"},
    {name:"Puddings & Desserts",icon:"\ud83c\udf6e",color:"#f97316"},
    {name:"Masalas & Spices",icon:"\ud83c\udf36\ufe0f",color:"#ef4444"},
    {name:"Cleaning & Misc",icon:"\ud83e\uddf9",color:"#6b7280"},
  ];
  for(const cat of defaultCats){
    const ref=db.ref("categories").push();
    await ref.set({...cat,id:ref.key,createdAt:Date.now()});
  }
  const catSnap=await fbGet("categories");
  const catIds=Object.keys(catSnap);
  const fishCatId=catIds[0], spiritsCatId=catIds[1], beerCatId=catIds[2], waterCatId=catIds[3], riceCatId=catIds[5];
  const defaultItems=[
    {name:"Kingfish (Surmai)",catId:fishCatId,sealedQty:0,looseQty:5,sealedUnit:"bag",looseUnit:"kg",capacity:5,minSealed:0,minLoose:2,bulkToPack:1,bulkUnit:"",avgCostPerBase:0},
    {name:"Chonak (Snapper)",catId:fishCatId,sealedQty:0,looseQty:4,sealedUnit:"bag",looseUnit:"kg",capacity:5,minSealed:0,minLoose:2,bulkToPack:1,bulkUnit:"",avgCostPerBase:0},
    {name:"Squids",catId:fishCatId,sealedQty:0,looseQty:2,sealedUnit:"bag",looseUnit:"kg",capacity:5,minSealed:0,minLoose:1,bulkToPack:1,bulkUnit:"",avgCostPerBase:0},
    {name:"Lepo Fish",catId:fishCatId,sealedQty:0,looseQty:1.5,sealedUnit:"bag",looseUnit:"kg",capacity:5,minSealed:0,minLoose:1,bulkToPack:1,bulkUnit:"",avgCostPerBase:0},
    {name:"Prawns",catId:fishCatId,sealedQty:0,looseQty:3.5,sealedUnit:"bag",looseUnit:"kg",capacity:5,minSealed:0,minLoose:2,bulkToPack:1,bulkUnit:"",avgCostPerBase:0},
    {name:"Mackerel (Bangda)",catId:fishCatId,sealedQty:0,looseQty:2,sealedUnit:"bag",looseUnit:"kg",capacity:5,minSealed:0,minLoose:1,bulkToPack:1,bulkUnit:"",avgCostPerBase:0},
    {name:"Kingfisher Beer 650ml",catId:beerCatId,sealedQty:4,looseQty:0,sealedUnit:"crate",looseUnit:"bottle",capacity:24,minSealed:1,minLoose:0,bulkToPack:1,bulkUnit:"",avgCostPerBase:0},
    {name:"Aquafina Water 1L",catId:waterCatId,sealedQty:2,looseQty:0,sealedUnit:"packet",looseUnit:"bottle",capacity:12,minSealed:1,minLoose:0,bulkToPack:1,bulkUnit:"",avgCostPerBase:0},
    {name:"Johnnie Walker Black Label 750ml",catId:spiritsCatId,sealedQty:2,looseQty:450,sealedUnit:"bottle",looseUnit:"ml",capacity:750,minSealed:1,minLoose:90,bulkToPack:1,bulkUnit:"",avgCostPerBase:0},
    {name:"Bacardi White Rum 750ml",catId:spiritsCatId,sealedQty:1,looseQty:300,sealedUnit:"bottle",looseUnit:"ml",capacity:750,minSealed:1,minLoose:90,bulkToPack:1,bulkUnit:"",avgCostPerBase:0},
    {name:"Jack Daniel\'s 750ml",catId:spiritsCatId,sealedQty:1,looseQty:0,sealedUnit:"bottle",looseUnit:"ml",capacity:750,minSealed:1,minLoose:0,bulkToPack:1,bulkUnit:"",avgCostPerBase:0},
    {name:"Basmati Rice",catId:riceCatId,sealedQty:1,looseQty:8,sealedUnit:"sack",looseUnit:"kg",capacity:25,minSealed:0,minLoose:5,bulkToPack:1,bulkUnit:"",avgCostPerBase:0},
  ];
  for(const item of defaultItems){
    const ref=db.ref("items").push();
    await ref.set({...item,id:ref.key,description:"",lastUpdatedBy:"master",lastUpdatedByName:"Master Admin",lastUpdatedAt:Date.now(),createdAt:Date.now()});
  }
}

// ---- DASHBOARD ----
async function renderDashboard(){
  const [items,cats,logs]=await Promise.all([getItems(),getCats(),getLogs()]);
  const itemArr=Object.values(items), catArr=Object.values(cats);
  const lowItems=itemArr.filter(i=>(i.sealedQty||0)<=(i.minSealed||0)||(i.looseQty||0)<(i.minLoose||0));
  const today=new Date(); today.setHours(0,0,0,0);
  const todayLogs=Object.values(logs).filter(l=>l.timestamp>=today.getTime());
  const totalVal=itemArr.reduce((s,i)=>s+stockValue(i),0);

  document.getElementById("statsRow").innerHTML=`
    <div class="sc g"><div class="sc-icon">\ud83d\udce6</div><div><div class="sc-num">${itemArr.length}</div><div class="sc-lbl">Total Items</div></div></div>
    <div class="sc r"><div class="sc-icon">\u26a0\ufe0f</div><div><div class="sc-num">${lowItems.length}</div><div class="sc-lbl">Low / Out Stock</div></div></div>
    <div class="sc t"><div class="sc-icon">\ud83d\uddc2\ufe0f</div><div><div class="sc-num">${catArr.length}</div><div class="sc-lbl">Categories</div></div></div>
    <div class="sc d"><div class="sc-icon">\ud83d\udd04</div><div><div class="sc-num">${todayLogs.length}</div><div class="sc-lbl">Today Updates</div></div></div>
    <div class="sc g"><div class="sc-icon">\ud83d\udcb0</div><div><div class="sc-num" style="font-size:15px">${fmtINR(totalVal)}</div><div class="sc-lbl">Stock Value</div></div></div>
  `;

  const catCounts={};
  itemArr.forEach(i=>{catCounts[i.catId]=(catCounts[i.catId]||0)+1;});
  const maxC=Math.max(...Object.values(catCounts),1);
  document.getElementById("catBars").innerHTML=catArr.slice(0,7).map(c=>{
    const n=catCounts[c.id]||0;
    return `<div class="cat-bi"><div class="cat-bl"><span>${c.icon} ${c.name}</span><span style="font-family:var(--fm)">${n}</span></div><div class="cat-bt"><div class="cat-bf" style="width:${(n/maxC*100).toFixed(0)}%;background:${c.color||"var(--gold)"}"></div></div></div>`;
  }).join("")||'<div class="empty"><span class="emp-i">\ud83d\uddc2\ufe0f</span>No categories</div>';

  const recent=Object.values(logs).sort((a,b)=>b.timestamp-a.timestamp).slice(0,8);
  document.getElementById("recentAct").innerHTML=recent.length?recent.map(l=>`
    <div class="act-item"><div class="act-dot"></div>
    <div class="act-t"><strong>${l.userName}</strong> ${l.action} <em>${l.itemName}</em>${l.change?`<span style="color:var(--gold);font-weight:600"> ${l.change}</span>`:""}</div>
    <div class="act-tm">${timeAgo(l.timestamp)}</div></div>`
  ).join(""):'<div class="empty"><span class="emp-i">\ud83d\udccb</span>No activity yet</div>';

  document.getElementById("dashLow").innerHTML=lowItems.length?
    '<table class="tbl"><thead><tr><th>Item</th><th>Category</th><th>Sealed</th><th>Loose</th><th>Status</th></tr></thead><tbody>'+
    lowItems.map(i=>`<tr><td><strong>${i.name}</strong></td><td>${catIcon(cats,i.catId)} ${catName(cats,i.catId)}</td><td class="qty-n qty-s">${i.sealedQty||0} <span style="font-size:11px">${i.sealedUnit||""}</span></td><td class="qty-n qty-l">${i.looseQty||0} <span style="font-size:11px">${i.looseUnit||""}</span></td><td>${statusBadge(i)}</td></tr>`).join("")+"</tbody></table>":
    '<div class="empty" style="padding:20px"><span>\u2705</span> All items well stocked!</div>';
}

// ---- INVENTORY ----
async function renderInventory(){
  const [items,cats]=await Promise.all([getItems(),getCats()]);
  const fltEl=document.getElementById("fltCat");
  fltEl.innerHTML='<option value="">All Categories</option>'+Object.values(cats).map(c=>`<option value="${c.id}">${c.icon} ${c.name}</option>`).join("");
  document.getElementById("srch").oninput=()=>filterInventory(items,cats);
  document.getElementById("fltCat").onchange=()=>filterInventory(items,cats);
  document.getElementById("fltStatus").onchange=()=>filterInventory(items,cats);
  filterInventory(items,cats);
}
function filterInventory(items,cats){
  const srch=(document.getElementById("srch")?.value||"").toLowerCase();
  const fltCat=document.getElementById("fltCat")?.value||"";
  const fltSt=document.getElementById("fltStatus")?.value||"";
  let arr=Object.values(items);
  if(srch) arr=arr.filter(i=>i.name.toLowerCase().includes(srch)||(cats[i.catId]?.name||"").toLowerCase().includes(srch));
  if(fltCat) arr=arr.filter(i=>i.catId===fltCat);
  if(fltSt==="ok") arr=arr.filter(i=>(i.sealedQty||0)>(i.minSealed||0)&&(i.looseQty||0)>=(i.minLoose||0));
  if(fltSt==="low") arr=arr.filter(i=>((i.sealedQty||0)<=(i.minSealed||0)||(i.looseQty||0)<(i.minLoose||0))&&totalBaseQty(i)>0);
  if(fltSt==="out") arr=arr.filter(i=>totalBaseQty(i)<=0);
  arr.sort((a,b)=>a.name.localeCompare(b.name));
  document.getElementById("invBody").innerHTML=arr.length?arr.map(item=>`
    <tr>
      <td><strong>${item.name}</strong>${item.description?`<div style="font-size:11px;color:var(--muted)">${item.description}</div>`:""}</td>
      <td>${catIcon(cats,item.catId)} ${catName(cats,item.catId)}</td>
      <td><span class="qty-n qty-s">${item.sealedQty||0}</span> <span class="badge" style="font-size:10px">${item.sealedUnit||"—"}</span></td>
      <td><span class="qty-n qty-l">${item.looseQty||0}</span> <span class="badge" style="font-size:10px">${item.looseUnit||"—"}</span></td>
      <td style="font-size:11px;color:var(--teal)">${decomposeQty(item)}</td>
      <td style="font-size:11px;color:var(--gold)">${item.avgCostPerBase?fmtINR(item.avgCostPerBase)+"/"+(item.looseUnit||"unit"):"—"}</td>
      <td style="font-size:11px;font-weight:600">${item.avgCostPerBase?fmtINR(stockValue(item)):"—"}</td>
      <td style="font-size:12px"><span style="color:var(--teal)">${item.minSealed||0} ${item.sealedUnit||""}</span> / <span style="color:var(--gold)">${item.minLoose||0} ${item.looseUnit||""}</span></td>
      <td>${statusBadge(item)}</td>
      <td><div style="font-size:11px"><div style="font-weight:600">${item.lastUpdatedByName||"—"}</div><div style="color:var(--muted)">${fmtDate(item.lastUpdatedAt)}</div></div></td>
      <td><div class="ab"><button class="bi e" onclick="openEditItem(\'${item.id}\')">\u270f\ufe0f</button>${currentUser?.role==="master"?`<button class="bi d" onclick="deleteItem(\'${item.id}\',\'${item.name}\')">\ud83d\uddd1\ufe0f</button>`:""}</div></td>
    </tr>`).join(""):'<tr><td colspan="11" class="empty"><span class="emp-i">\ud83d\udce6</span>No items found</td></tr>';
}

// ---- STOCK UPDATE ----
async function renderStockPage(){
  const items=await getItems();
  const arr=Object.values(items).sort((a,b)=>a.name.localeCompare(b.name));
  const sel=document.getElementById("stItem");
  sel.innerHTML='<option value="">-- Choose Item --</option>'+arr.map(i=>`<option value="${i.id}">${i.name} | ${decomposeQty(i)}</option>`).join("");
  sel.onchange=()=>showItemInfo(items);
  document.getElementById("stAction").onchange=()=>showItemInfo(items);
  renderQuickView(items);
}
function showItemInfo(items){
  const id=document.getElementById("stItem").value;
  const action=document.getElementById("stAction").value;
  const box=document.getElementById("stItemInfo");
  if(!id){box.className="item-info-box";return;}
  const item=items[id]; if(!item) return;
  let html=`<strong>${item.name}</strong><br>
    \ud83d\udd12 Sealed: <strong>${item.sealedQty||0} ${item.sealedUnit||""}</strong>
    &nbsp;|&nbsp; \ud83d\udd13 Loose: <strong>${item.looseQty||0} ${item.looseUnit||""}</strong>
    &nbsp;|&nbsp; Smart Total: <strong style="color:var(--teal)">${decomposeQty(item)}</strong>
    &nbsp;|&nbsp; Avg Cost: <strong style="color:var(--gold)">${item.avgCostPerBase?fmtINR(item.avgCostPerBase)+"/"+(item.looseUnit||"unit"):"Not set"}</strong>`;
  if(action==="open") html+=`<br><span style="color:var(--gold)">\u26a0\ufe0f Opening: 1 ${item.sealedUnit||"unit"} = ${item.capacity||"?"} ${item.looseUnit||""}</span>`;
  box.innerHTML=html; box.className="item-info-box show";
}
async function renderQuickView(itemsData){
  const items=itemsData||await getItems();
  const arr=Object.values(items).sort((a,b)=>a.name.localeCompare(b.name));
  document.getElementById("quickView").innerHTML=arr.map(i=>{
    const isLow=(i.sealedQty||0)<=(i.minSealed||0)||(i.looseQty||0)<(i.minLoose||0);
    const isOut=totalBaseQty(i)<=0;
    const bc=isOut?"var(--rust)":isLow?"var(--gold)":"var(--teal)";
    return `<div class="qi" style="border-color:${bc}"><div class="qi-n">${i.name}</div><div class="qi-sealed">${i.sealedQty||0}<span style="font-size:10px;color:var(--muted)"> ${i.sealedUnit||""}</span></div><div class="qi-loose">${i.looseQty||0}<span style="font-size:10px;color:var(--muted)"> ${i.looseUnit||""}</span></div></div>`;
  }).join("");
}
async function doUpdateStock(){
  const id=document.getElementById("stItem").value;
  const action=document.getElementById("stAction").value;
  const qty=parseFloat(document.getElementById("stQty").value);
  const container=document.getElementById("stContainer").value;
  const note=document.getElementById("stNote").value.trim();
  if(!id){showToast("Please select an item","warn");return;}
  if(isNaN(qty)||qty<0){showToast("Enter valid quantity","warn");return;}
  const item=await fbGet("items/"+id);
  if(!item){showToast("Item not found","err");return;}
  let updates={},actionText="",changeText="";
  if(action==="open"){
    pendingOpenSealed={id,item,qty:1,note};
    document.getElementById("openSealedMsg").innerHTML=`Opening 1 <strong>${item.sealedUnit}</strong> of <strong>${item.name}</strong><br>Will add <strong>${item.capacity||0} ${item.looseUnit}</strong> to loose.`;
    document.getElementById("openSealedCount").value=1;
    document.getElementById("openSealedCount").max=item.sealedQty||1;
    openModal("openSealedModal"); return;
  }
  if(container==="sealed"){
    const old=item.sealedQty||0; let nw;
    if(action==="add"){nw=old+qty;actionText="added sealed";changeText=`+${qty} ${item.sealedUnit} (${old}\u2192${nw})`;}
    else if(action==="remove"){nw=Math.max(0,old-qty);actionText="removed sealed";changeText=`-${qty} ${item.sealedUnit} (${old}\u2192${nw})`;}
    else{nw=qty;actionText="set sealed";changeText=`Set ${qty} ${item.sealedUnit} (was ${old})`;}
    updates.sealedQty=nw;
  } else {
    const old=item.looseQty||0; let nw;
    if(action==="add"){nw=old+qty;actionText="added loose";changeText=`+${qty} ${item.looseUnit} (${old}\u2192${nw})`;}
    else if(action==="remove"){nw=Math.max(0,old-qty);actionText="consumed loose";changeText=`-${qty} ${item.looseUnit} (${old}\u2192${nw})`;}
    else{nw=qty;actionText="set loose";changeText=`Set ${qty} ${item.looseUnit} (was ${old})`;}
    updates.looseQty=nw;
  }
  updates.lastUpdatedBy=currentUser.username;
  updates.lastUpdatedByName=currentUser.name;
  updates.lastUpdatedAt=Date.now();
  await fbUpdate("items/"+id,updates);
  await logAction(id,item.name,actionText,container,changeText,note);
  document.getElementById("stQty").value="";
  document.getElementById("stNote").value="";
  document.getElementById("stItemInfo").className="item-info-box";
  showToast("\u2705 "+changeText,"ok");
  renderStockPage();
}
async function confirmOpenSealed(){
  if(!pendingOpenSealed) return;
  const count=parseInt(document.getElementById("openSealedCount").value)||1;
  const {id,item,note}=pendingOpenSealed;
  const newSealed=Math.max(0,(item.sealedQty||0)-count);
  const addedLoose=count*(item.capacity||0);
  const newLoose=(item.looseQty||0)+addedLoose;
  const changeText=`Opened ${count} ${item.sealedUnit} \u2192 +${addedLoose} ${item.looseUnit}`;
  await fbUpdate("items/"+id,{sealedQty:newSealed,looseQty:newLoose,lastUpdatedBy:currentUser.username,lastUpdatedByName:currentUser.name,lastUpdatedAt:Date.now()});
  await logAction(id,item.name,"opened sealed","sealed\u2192loose",changeText,note);
  closeModal("openSealedModal");
  showToast("\u2705 "+changeText,"ok");
  pendingOpenSealed=null; renderStockPage();
}
async function logAction(itemId,itemName,action,container,change,note){
  const ref=db.ref("auditlog").push();
  await ref.set({id:ref.key,timestamp:Date.now(),userId:currentUser.username,userName:currentUser.name,userRole:currentUser.role,action,itemId,itemName,container,change:change||"",note:note||""});
}

// ---- LOW STOCK ----
async function renderLowStock(){
  const [items,cats]=await Promise.all([getItems(),getCats()]);
  const low=Object.values(items).filter(i=>(i.sealedQty||0)<=(i.minSealed||0)||(i.looseQty||0)<(i.minLoose||0));
  low.sort((a,b)=>a.name.localeCompare(b.name));
  document.getElementById("lowBody").innerHTML=low.length?low.map(i=>{
    const sShort=Math.max(0,(i.minSealed||0)-(i.sealedQty||0));
    const lShort=Math.max(0,(i.minLoose||0)-(i.looseQty||0));
    return `<tr><td><strong>${i.name}</strong></td><td>${catIcon(cats,i.catId)} ${catName(cats,i.catId)}</td><td class="qty-n qty-s">${i.sealedQty||0} <span style="font-size:11px">${i.sealedUnit||""}</span></td><td class="qty-n qty-l">${i.looseQty||0} <span style="font-size:11px">${i.looseUnit||""}</span></td><td class="qty-n" style="color:var(--muted)">${totalBaseQty(i).toFixed(2)}</td><td style="font-size:12px"><span style="color:var(--teal)">${i.minSealed||0} ${i.sealedUnit||""}</span> / <span style="color:var(--gold)">${i.minLoose||0} ${i.looseUnit||""}</span></td><td><span class="badge" style="background:var(--surface)">${i.looseUnit||i.sealedUnit||"—"}</span></td><td style="color:var(--rust);font-weight:700;font-size:12px">${sShort>0?`-${sShort} ${i.sealedUnit}`:""} ${lShort>0?`-${lShort} ${i.looseUnit}`:""}</td></tr>`;
  }).join(""):'<tr><td colspan="8" class="empty"><span class="emp-i">\u2705</span>All items well stocked!</td></tr>';
}

// ---- AUDIT LOG ----
async function renderAudit(){
  const [logs,users]=await Promise.all([getLogs(),getUsers()]);
  const uSel=document.getElementById("auUser");
  uSel.innerHTML='<option value="">All Users</option>'+Object.values(users).map(u=>`<option value="${u.username}">${u.name}</option>`).join("");
  const dateF=document.getElementById("auDate")?.value;
  const userF=document.getElementById("auUser")?.value;
  let arr=Object.values(logs).sort((a,b)=>b.timestamp-a.timestamp);
  if(dateF){const d=new Date(dateF);d.setHours(0,0,0,0);const e=new Date(d);e.setDate(e.getDate()+1);arr=arr.filter(l=>l.timestamp>=d.getTime()&&l.timestamp<e.getTime());}
  if(userF) arr=arr.filter(l=>l.userId===userF);
  document.getElementById("auBody").innerHTML=arr.length?arr.map(l=>`
    <tr><td style="font-family:var(--fm);font-size:11px;white-space:nowrap">${fmtDate(l.timestamp)}</td><td><span class="rb ${l.userId==="master"?"master":l.userRole||"staff"}">${l.userName}</span></td><td><span class="rb ${l.userRole||"staff"}">${l.userRole||"—"}</span></td><td style="text-transform:capitalize">${l.action}</td><td><strong>${l.itemName}</strong></td><td><span class="badge">${l.container||"—"}</span></td><td style="font-family:var(--fm);font-size:11px;color:var(--teal)">${l.change||"—"}</td><td style="color:var(--muted);font-size:12px">${l.note||"—"}</td></tr>`
  ).join(""):'<tr><td colspan="8" class="empty"><span class="emp-i">\ud83d\udccb</span>No records</td></tr>';
}
function resetAuditFilter(){ document.getElementById("auDate").value=""; document.getElementById("auUser").value=""; renderAudit(); }

// ---- USERS ----
async function renderUsers(){
  const users=await getUsers();
  document.getElementById("usersBody").innerHTML=Object.values(users).sort((a,b)=>a.name.localeCompare(b.name)).map(u=>`
    <tr><td><strong>${u.name}</strong></td><td style="font-family:var(--fm)">${u.username}</td><td><span class="rb ${u.role}">${u.role}</span></td><td style="font-size:11px;color:var(--muted)">${fmtDate(u.createdAt)}</td>
    <td>${u.username!=="master"?`<div class="ab"><button class="bi e" onclick="editUser(\'${u.username}\')">\u270f\ufe0f</button><button class="bi d" onclick="deleteUser(\'${u.username}\')">\ud83d\uddd1\ufe0f</button></div>`:"<span style=\'font-size:11px;color:var(--muted)\'>Protected</span>"}</td></tr>`
  ).join("");
}
function openUserModal(){ document.getElementById("uName").value=""; document.getElementById("uUser").value=""; document.getElementById("uPass").value=""; document.getElementById("uRole").value="staff"; document.getElementById("editUserId").value=""; document.getElementById("userMoTitle").textContent="Add Employee"; openModal("userModal"); }
async function editUser(username){ const u=await fbGet("users/"+username); if(!u) return; document.getElementById("uName").value=u.name; document.getElementById("uUser").value=u.username; document.getElementById("uPass").value=""; document.getElementById("uRole").value=u.role; document.getElementById("editUserId").value=username; document.getElementById("userMoTitle").textContent="Edit Employee"; openModal("userModal"); }
async function saveUser(){
  const name=document.getElementById("uName").value.trim();
  const username=document.getElementById("uUser").value.trim().toLowerCase();
  const pass=document.getElementById("uPass").value;
  const role=document.getElementById("uRole").value;
  const editId=document.getElementById("editUserId").value;
  if(!name||!username){showToast("Name and username required","warn");return;}
  if(!editId){ const ex=await fbGet("users/"+username); if(ex){showToast("Username exists","err");return;} if(!pass){showToast("Password required","warn");return;} }
  const existing=editId?await fbGet("users/"+editId):null;
  const userData={name,username,role,password:pass||existing?.password||"",createdAt:existing?.createdAt||Date.now()};
  if(editId&&editId!==username) await fbRemove("users/"+editId);
  await fbSet("users/"+username,userData);
  closeModal("userModal"); renderUsers(); showToast("\u2705 User saved","ok");
}
async function deleteUser(username){ if(username==="master") return; if(!confirm("Delete this user?")) return; await fbRemove("users/"+username); renderUsers(); showToast("\ud83d\uddd1\ufe0f User deleted","warn"); }

// ---- CATEGORIES ----
async function renderCategories(){
  const [cats,items]=await Promise.all([getCats(),getItems()]);
  const counts={}; Object.values(items).forEach(i=>{counts[i.catId]=(counts[i.catId]||0)+1;});
  document.getElementById("catsGrid").innerHTML=Object.values(cats).map(c=>`
    <div class="ccat" style="border-top-color:${c.color||"var(--gold)"}">
      <div class="ccat-ic">${c.icon||"\ud83d\udce6"}</div>
      <div class="ccat-nm">${c.name}</div>
      <div class="ccat-ct">${counts[c.id]||0} items</div>
      <div class="ccat-ac"><button class="bi e" onclick="editCat(\'${c.id}\')">\u270f\ufe0f</button>${(counts[c.id]||0)===0?`<button class="bi d" onclick="deleteCat(\'${c.id}\')">\ud83d\uddd1\ufe0f</button>`:""}</div>
    </div>`).join("")||'<div class="empty"><span class="emp-i">\ud83d\uddc2\ufe0f</span>No categories</div>';
}
function openCatModal(){ document.getElementById("cName").value=""; document.getElementById("cIcon").value=""; document.getElementById("cColor").value="#0e9b8c"; document.getElementById("editCatId").value=""; openModal("catModal"); }
async function editCat(id){ const c=await fbGet("categories/"+id); if(!c) return; document.getElementById("cName").value=c.name; document.getElementById("cIcon").value=c.icon||""; document.getElementById("cColor").value=c.color||"#0e9b8c"; document.getElementById("editCatId").value=id; openModal("catModal"); }
async function saveCat(){
  const name=document.getElementById("cName").value.trim();
  const icon=document.getElementById("cIcon").value.trim()||"\ud83d\udce6";
  const color=document.getElementById("cColor").value;
  const editId=document.getElementById("editCatId").value;
  if(!name){showToast("Category name required","warn");return;}
  const id=editId||db.ref("categories").push().key;
  const existing=editId?await fbGet("categories/"+editId):null;
  await fbSet("categories/"+id,{id,name,icon,color,createdAt:existing?.createdAt||Date.now()});
  closeModal("catModal"); renderCategories(); showToast("\u2705 Category saved","ok");
}
async function deleteCat(id){ if(!confirm("Delete this category?")) return; const items=await getItems(); if(Object.values(items).some(i=>i.catId===id)){showToast("Category has items — cannot delete","err");return;} await fbRemove("categories/"+id); renderCategories(); showToast("\ud83d\uddd1\ufe0f Category deleted","warn"); }

// ---- ITEM MODAL ----
async function openItemModal(){
  document.getElementById("itemMoTitle").textContent="Add New Item";
  document.getElementById("editItemId").value="";
  ["iName","iSealedQty","iLooseQty","iCapacity","iMinSealed","iMinLoose","iDesc","iBulkUnit","iBulkToPack","iAvgCost"].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value="";
  });
  document.getElementById("iSealedUnit").value="bottle";
  document.getElementById("iLooseUnit").value="ml";
  await populateItemCatDropdown();
  openModal("itemModal");
}
async function openEditItem(id){
  const item=await fbGet("items/"+id); if(!item) return;
  document.getElementById("itemMoTitle").textContent="Edit Item";
  document.getElementById("editItemId").value=id;
  document.getElementById("iName").value=item.name||"";
  document.getElementById("iSealedQty").value=item.sealedQty||0;
  document.getElementById("iLooseQty").value=item.looseQty||0;
  document.getElementById("iCapacity").value=item.capacity||"";
  document.getElementById("iMinSealed").value=item.minSealed||0;
  document.getElementById("iMinLoose").value=item.minLoose||0;
  document.getElementById("iDesc").value=item.description||"";
  document.getElementById("iSealedUnit").value=item.sealedUnit||"bottle";
  document.getElementById("iLooseUnit").value=item.looseUnit||"ml";
  const bu=document.getElementById("iBulkUnit"); if(bu) bu.value=item.bulkUnit||"";
  const bp=document.getElementById("iBulkToPack"); if(bp) bp.value=item.bulkToPack||0;
  const ac=document.getElementById("iAvgCost"); if(ac) ac.value=item.avgCostPerBase||"";
  await populateItemCatDropdown(item.catId);
  openModal("itemModal");
}
async function populateItemCatDropdown(selectedId){
  const cats=await getCats();
  document.getElementById("iCat").innerHTML=Object.values(cats).map(c=>`<option value="${c.id}" ${c.id===selectedId?"selected":""}>${c.icon} ${c.name}</option>`).join("");
}
async function saveItem(){
  const editId=document.getElementById("editItemId").value;
  const name=document.getElementById("iName").value.trim();
  const catId=document.getElementById("iCat").value;
  if(!name){showToast("Item name required","warn");return;}
  if(!catId){showToast("Category required","warn");return;}
  const sealedQty=parseFloat(document.getElementById("iSealedQty").value)||0;
  const looseQty=parseFloat(document.getElementById("iLooseQty").value)||0;
  const sealedUnit=document.getElementById("iSealedUnit").value;
  const looseUnit=document.getElementById("iLooseUnit").value;
  const capacity=parseFloat(document.getElementById("iCapacity").value)||0;
  const minSealed=parseFloat(document.getElementById("iMinSealed").value)||0;
  const minLoose=parseFloat(document.getElementById("iMinLoose").value)||0;
  const description=document.getElementById("iDesc").value.trim();
  const bulkUnit=(document.getElementById("iBulkUnit")?.value||"").trim();
  const bulkToPack=parseFloat(document.getElementById("iBulkToPack")?.value)||0;
  const avgCostPerBase=parseFloat(document.getElementById("iAvgCost")?.value)||0;
  const isNew=!editId;
  const itemId=editId||db.ref("items").push().key;
  const existing=editId?await fbGet("items/"+editId):null;
  const itemData={id:itemId,name,catId,sealedQty,looseQty,sealedUnit,looseUnit,capacity,minSealed,minLoose,description,bulkUnit,bulkToPack,avgCostPerBase,lastUpdatedBy:currentUser.username,lastUpdatedByName:currentUser.name,lastUpdatedAt:Date.now(),createdAt:existing?.createdAt||Date.now()};
  await fbSet("items/"+itemId,itemData);
  await logAction(itemId,name,isNew?"added new item":"edited item","—",isNew?`Created: ${sealedQty} ${sealedUnit} sealed, ${looseQty} ${looseUnit} loose`:"Item updated","");
  closeModal("itemModal"); renderInventory(); showToast(isNew?"\u2705 Item added":"\u2705 Item updated","ok");
}
async function deleteItem(id,name){ if(!confirm(`Delete "${name}"?`)) return; await fbRemove("items/"+id); await logAction(id,name,"deleted item","—","Removed",""); renderInventory(); showToast("\ud83d\uddd1\ufe0f Item deleted","warn"); }

// ---- PURCHASE ----
async function renderPurchase(){
  if(purchaseRows.length===0) await addPurchaseRow();
  renderPurchaseRows();
  await renderPurchaseHistory();
}
async function renderPurchaseHistory(){
  const logs=await getLogs();
  const purchases=Object.values(logs).filter(l=>l.action==="purchase/restock"||l.action==="added sealed"||l.action==="added loose").sort((a,b)=>b.timestamp-a.timestamp).slice(0,20);
  document.getElementById("purchaseHistory").innerHTML=purchases.length?purchases.map(l=>`
    <tr><td style="font-size:11px;font-family:var(--fm)">${fmtDate(l.timestamp)}</td><td><strong>${l.itemName}</strong></td><td class="qty-n" style="color:var(--teal)">${l.change||"—"}</td><td style="font-size:11px;color:var(--muted)">—</td><td>${l.userName}</td><td style="font-size:12px;color:var(--muted)">${l.note||"—"}</td></tr>`
  ).join(""):'<tr><td colspan="6" class="empty"><span class="emp-i">\ud83d\udecd</span>No purchases yet</td></tr>';
}
async function addPurchaseRow(){ const items=await getItems(); purchaseRows.push({itemId:"",qty:"",price:"",container:"sealed",note:"",items}); renderPurchaseRows(); }
function renderPurchaseRows(){
  const container=document.getElementById("purchaseRows");
  if(purchaseRows.length===0){container.innerHTML='<div class="empty" style="padding:20px"><span>\u2795</span> Click "Add Row" to start</div>';return;}
  container.innerHTML=purchaseRows.map((row,idx)=>{
    const itemsOpts=row.items?Object.values(row.items).sort((a,b)=>a.name.localeCompare(b.name)).map(i=>`<option value="${i.id}" ${i.id===row.itemId?"selected":""}>${i.name}</option>`).join(""):"";
    return `<div class="pur-row">
      <select class="sel" onchange="updatePurchaseRow(${idx},'itemId',this.value)"><option value="">-- Select Item --</option>${itemsOpts}</select>
      <select class="sel" onchange="updatePurchaseRow(${idx},'container',this.value)">
        <option value="sealed" ${row.container==="sealed"?"selected":""}>Sealed (Pack)</option>
        <option value="bulk" ${row.container==="bulk"?"selected":""}>Bulk (Crate/Carton)</option>
        <option value="loose" ${row.container==="loose"?"selected":""}>Loose (Base Unit)</option>
      </select>
      <input type="number" class="inp" placeholder="Qty" value="${row.qty}" min="0" step="0.001" onchange="updatePurchaseRow(${idx},'qty',this.value)">
      <input type="number" class="inp" placeholder="Total Price (\u20b9)" value="${row.price||""}" min="0" step="0.01" onchange="updatePurchaseRow(${idx},'price',this.value)">
      <input type="text" class="inp" placeholder="Note (optional)" value="${row.note}" onchange="updatePurchaseRow(${idx},'note',this.value)">
      <button class="pur-del" onclick="removePurchaseRow(${idx})">\u2715</button>
    </div>`;
  }).join("");
}
function updatePurchaseRow(idx,key,val){ purchaseRows[idx][key]=val; }
function removePurchaseRow(idx){ purchaseRows.splice(idx,1); renderPurchaseRows(); }
async function savePurchaseToStock(){
  const valid=purchaseRows.filter(r=>r.itemId&&r.qty&&parseFloat(r.qty)>0);
  if(valid.length===0){showToast("Add at least one item with quantity","warn");return;}
  for(const row of valid){
    const item=await fbGet("items/"+row.itemId); if(!item) continue;
    const qty=parseFloat(row.qty), price=parseFloat(row.price)||0;
    const f1=item.bulkToPack||1, f2=item.capacity||1;
    let updates={lastUpdatedBy:currentUser.username,lastUpdatedByName:currentUser.name,lastUpdatedAt:Date.now()};
    let change="", newBaseQty=0;
    if(row.container==="bulk"){
      newBaseQty=qty*f1*f2;
      updates.sealedQty=(item.sealedQty||0)+(qty*f1);
      change=`+${qty} ${item.bulkUnit||"bulk"} (+${qty*f1} ${item.sealedUnit} / +${newBaseQty} ${item.looseUnit})`;
    } else if(row.container==="sealed"){
      newBaseQty=qty*f2;
      updates.sealedQty=(item.sealedQty||0)+qty;
      change=`+${qty} ${item.sealedUnit} (+${newBaseQty} ${item.looseUnit})`;
    } else {
      newBaseQty=qty;
      updates.looseQty=(item.looseQty||0)+qty;
      change=`+${qty} ${item.looseUnit} loose`;
    }
    if(price>0&&newBaseQty>0){
      const oldBase=totalBaseQty(item), oldCost=item.avgCostPerBase||0;
      const newCostPerBase=price/newBaseQty;
      const wAvg=oldBase>0?((oldBase*oldCost)+(newBaseQty*newCostPerBase))/(oldBase+newBaseQty):newCostPerBase;
      updates.avgCostPerBase=parseFloat(wAvg.toFixed(4));
      change+=` | \u20b9${price} (Avg: ${fmtINR(wAvg)}/${item.looseUnit||"unit"})`;
    }
    await fbUpdate("items/"+row.itemId,updates);
    await logAction(row.itemId,item.name,"purchase/restock",row.container,change,row.note||"Purchase entry");
  }
  purchaseRows=[];
  document.getElementById("purchaseMsg").textContent=`\u2705 ${valid.length} item(s) restocked!`;
  setTimeout(()=>{document.getElementById("purchaseMsg").textContent="";},3000);
  renderPurchase(); showToast(`\u2705 ${valid.length} items restocked`,"ok");
}

// ---- DOWNLOADS ----
async function downloadInventoryExcel(){
  const [items,cats]=await Promise.all([getItems(),getCats()]);
  const rows=[["Item Name","Category","Sealed Qty","Sealed Unit","Loose Qty","Loose Unit","Smart Total","Avg Cost/Base","Stock Value (\u20b9)","Min Sealed","Min Loose","Status","Last Updated By","Last Updated"]];
  Object.values(items).sort((a,b)=>a.name.localeCompare(b.name)).forEach(i=>{
    const status=totalBaseQty(i)<=0?"Out of Stock":((i.sealedQty||0)<=(i.minSealed||0)||(i.looseQty||0)<(i.minLoose||0))?"Low Stock":"In Stock";
    rows.push([i.name,catName(cats,i.catId),i.sealedQty||0,i.sealedUnit||"",i.looseQty||0,i.looseUnit||"",decomposeQty(i),(i.avgCostPerBase||0).toFixed(4),stockValue(i).toFixed(2),i.minSealed||0,i.minLoose||0,status,i.lastUpdatedByName||"",fmtDate(i.lastUpdatedAt)]);
  });
  downloadXLSX(rows,"Anusuya_Inventory_"+todayStr());
}
async function downloadLowStockExcel(){
  const [items,cats]=await Promise.all([getItems(),getCats()]);
  const low=Object.values(items).filter(i=>(i.sealedQty||0)<=(i.minSealed||0)||(i.looseQty||0)<(i.minLoose||0));
  const rows=[["Item","Category","Sealed Qty","Sealed Unit","Loose Qty","Loose Unit","Min Sealed","Min Loose","Sealed Shortage","Loose Shortage"]];
  low.forEach(i=>rows.push([i.name,catName(cats,i.catId),i.sealedQty||0,i.sealedUnit||"",i.looseQty||0,i.looseUnit||"",i.minSealed||0,i.minLoose||0,Math.max(0,(i.minSealed||0)-(i.sealedQty||0)),Math.max(0,(i.minLoose||0)-(i.looseQty||0))]));
  downloadXLSX(rows,"Anusuya_LowStock_"+todayStr());
}
async function downloadAuditExcel(){
  const logs=await getLogs();
  const rows=[["Date & Time","User","Role","Action","Item","Container","Change","Note"]];
  Object.values(logs).sort((a,b)=>b.timestamp-a.timestamp).forEach(l=>rows.push([fmtDate(l.timestamp),l.userName,l.userRole||"",l.action,l.itemName,l.container||"",l.change||"",l.note||""]));
  downloadXLSX(rows,"Anusuya_AuditLog_"+todayStr());
}
async function downloadPurchaseExcel(){
  const items=await getItems();
  const rows=[["Item Name","Current Sealed","Current Loose","Sealed Unit","Loose Unit","New Purchase Qty (Sealed)","New Purchase Qty (Loose)","Price (\u20b9)","Note"]];
  Object.values(items).sort((a,b)=>a.name.localeCompare(b.name)).forEach(i=>rows.push([i.name,i.sealedQty||0,i.looseQty||0,i.sealedUnit||"",i.looseUnit||"","","","",""]));
  for(let i=0;i<10;i++) rows.push(["","","","","","","","",""]);
  downloadXLSX(rows,"Anusuya_PurchaseForm_"+todayStr());
}

function buildPDFHtml(title,rows,headers){
  return `<html><head><style>body{font-family:Arial,sans-serif;padding:20px}h2{color:#1a0f0a}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#1a0f0a;color:#c9972a;padding:8px;text-align:left}td{padding:7px 8px;border-bottom:1px solid #eee}tr:nth-child(even) td{background:#fafafa}.footer{margin-top:20px;font-size:10px;color:#aaa;text-align:center}</style></head><body><h2>\ud83d\udc1f Anusuya Restaurant & Bar</h2><div style="color:#c9972a;font-size:12px;margin-bottom:16px">${title}</div><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table><div class="footer">Anusuya Inventory System v6 | Developed by Aarav (Ravi)</div></body></html>`;
}
function printHTML(html){ const w=window.open("","_blank"); w.document.write(html); w.document.close(); setTimeout(()=>w.print(),600); }
function downloadXLSX(rows,filename){ if(typeof XLSX==="undefined"){showToast("Excel library not loaded","err");return;} const wb=XLSX.utils.book_new(); const ws=XLSX.utils.aoa_to_sheet(rows); XLSX.utils.book_append_sheet(wb,ws,"Data"); XLSX.writeFile(wb,filename+".xlsx"); }

async function downloadInventoryPDF(){
  showToast("\ud83d\udcc4 Preparing PDF...","warn");
  const [items,cats]=await Promise.all([getItems(),getCats()]);
  const html=buildPDFHtml("Full Inventory — "+todayStr(),Object.values(items).sort((a,b)=>a.name.localeCompare(b.name)).map(i=>`<tr><td>${i.name}</td><td>${catName(cats,i.catId)}</td><td>${i.sealedQty||0} ${i.sealedUnit||""}</td><td>${i.looseQty||0} ${i.looseUnit||""}</td><td>${decomposeQty(i)}</td><td>${i.lastUpdatedByName||"—"}</td></tr>`).join(""),["Item","Category","Sealed","Loose","Smart Total","Updated By"]);
  printHTML(html);
}
async function downloadLowStockPDF(){
  showToast("\ud83d\udcc4 Preparing PDF...","warn");
  const [items,cats]=await Promise.all([getItems(),getCats()]);
  const low=Object.values(items).filter(i=>(i.sealedQty||0)<=(i.minSealed||0)||(i.looseQty||0)<(i.minLoose||0));
  const html=buildPDFHtml("Low Stock Report — "+todayStr(),low.map(i=>`<tr><td>${i.name}</td><td>${catName(cats,i.catId)}</td><td>${i.sealedQty||0} ${i.sealedUnit||""}</td><td>${i.looseQty||0} ${i.looseUnit||""}</td><td style="color:red">-${Math.max(0,(i.minSealed||0)-(i.sealedQty||0))} sealed / -${Math.max(0,(i.minLoose||0)-(i.looseQty||0))} loose</td></tr>`).join(""),["Item","Category","Sealed","Loose","Shortage"]);
  printHTML(html);
}
async function downloadPurchasePDF(){
  showToast("\ud83d\udcc4 Preparing PDF...","warn");
  const items=await getItems();
  const html=buildPDFHtml("Purchase/Restock Form — "+todayStr(),Object.values(items).sort((a,b)=>a.name.localeCompare(b.name)).map(i=>`<tr><td>${i.name}</td><td>${i.sealedQty||0} ${i.sealedUnit||""}</td><td>${i.looseQty||0} ${i.looseUnit||""}</td><td style="min-width:80px"> </td><td style="min-width:80px"> </td><td> </td></tr>`).join("")+Array(10).fill("<tr><td> </td><td> </td><td> </td><td> </td><td> </td><td> </td></tr>").join(""),["Item","Current Sealed","Current Loose","New Sealed Qty","New Loose Qty","Note"]);
  printHTML(html);
}

// ---- MODALS ----
function openModal(id){ document.getElementById(id).classList.add("active"); }
function closeModal(id){ document.getElementById(id).classList.remove("active"); }
document.addEventListener("click",(e)=>{ if(e.target.classList.contains("mo-overlay")) e.target.classList.remove("active"); });
document.addEventListener("keydown",(e)=>{ if(e.key==="Escape") document.querySelectorAll(".mo-overlay.active").forEach(m=>m.classList.remove("active")); });
