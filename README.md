# 🐟 Anusuya Restaurant & Bar — Inventory System v7

---

## ⚡ QUICK SETUP (5 Steps)

### Step 1 — Firebase Project
1. https://console.firebase.google.com → **Create project**
2. Google Analytics disable karo → **Create**

### Step 2 — Realtime Database
1. Left sidebar → **Realtime Database** → **Create Database**
2. Location: **United States (us-central1)**
3. **Start in test mode** → **Enable**

### Step 3 — Rules Fix (Permanent)
Rules tab mein yeh paste karo:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
**Publish** click karo ✅

### Step 4 — Web App Register
1. Project Overview → **</>** (web icon)
2. Nickname: `anusuya-web` → **Register**
3. `firebaseConfig` copy karo

### Step 5 — Config Paste
`app.js` file mein top pe `firebaseConfig` object mein apna config paste karo.

---

## 🚀 GitHub Pages Deploy (Recommended)

1. GitHub pe naya repo banao: `inventory`
2. Saari files upload karo (index.html, app.js, style.css, sw.js, manifest.json, icon-192.png, icon-512.png)
3. **Settings → Pages → Branch: main → Save**
4. URL milega: `https://yourusername.github.io/inventory/`
5. Uss URL se mobile pe open karo → **"Add to Home Screen"** → PWA install ho jaayega ✅

---

## 🔑 Default Login
| Field | Value |
|---|---|
| Username | `master` |
| Password | `ansuya@123` |

> Pehli baar login pe app automatically master account + default sample data create karega

---

## ✨ Features (v7 — Complete)

### 📊 Dashboard
- Total Items count
- Low / Out of Stock count
- Total Stock Value (₹) — price set karne pe auto-calculate
- Loose Stock Value (₹)
- Today's Expense
- Category-wise bar chart
- Recent Activity feed (real-time)
- Low Stock alert table

### 📦 Inventory
- 3-Level stock: Box/Crate → Bottle/Packet → Loose (ml/g/pcs)
- 2-Level support: Container → Pack
- 1-Level support: Simple unit (kg, pcs, plate)
- Smart Total display
- Avg Cost per unit
- Stock Value per item
- Low Stock badges
- Search + Filter (Category, Status)
- Add / Edit / Delete items
- Excel + PDF export

### 🔄 Update Stock
- Add / Remove / Set / Open actions
- Box → Sealed → Loose level transfers
- Quick Stock View (all items at a glance)

### 🛒 Purchase Entry ✅ FIXED v7
- Multi-row purchase form
- Price enter karne pe **Weighted Average Cost auto-update** hoga
- oninput fix — type karte hi value capture hoti hai
- Dashboard Stock Value turant update hogi
- Excel + PDF blank refill form download

### 🔓 Loose Stock
- Sirf loose/open items dikhata hai
- Loose value per item

### ⚠️ Low Stock
- Items jinki qty minimum se kam hai
- Shortage amount dikhata hai
- Excel + PDF download

### 💸 Daily Expense
- Date, Description, Category, Amount
- Filter by date range + category
- Total calculation
- Excel + PDF report download

### 📋 Audit Log
- Har action ka complete record
- Filter by date + user
- Excel download

### 👥 User Management (Master only)
- Add / Edit / Delete staff
- Roles: Master Admin, Manager, Staff
- Password management

### 🗂️ Categories (Manager+)
- Add categories with icon + color
- Item count per category

### 📱 PWA — Mobile App
- Home screen pe install hota hai
- Offline support (cache)
- Full-screen standalone mode

---

## 🔒 Role Permissions

| Feature | Staff | Manager | Master |
|---|---|---|---|
| View Dashboard | ✅ | ✅ | ✅ |
| Update Stock | ✅ | ✅ | ✅ |
| Purchase Entry | ❌ | ✅ | ✅ |
| Categories | ❌ | ✅ | ✅ |
| Expenses | ✅ | ✅ | ✅ |
| Audit Log | ✅ | ✅ | ✅ |
| Delete Items | ❌ | ❌ | ✅ |
| User Management | ❌ | ❌ | ✅ |

---

## ✅ v7 Bug Fixes

1. **Purchase Price update nahi ho raha tha** — `oninput` fix kiya, ab type karte hi value capture hoti hai
2. **Edit Item pe stock qty reset ho jaati thi** — Fixed! Edit pe purani qty preserve hoti hai
3. **L2 (2-level) items ki Stock Value galat thi** — avgCostPerBase calculation fix
4. **Edit Item pe price clear ho jaata tha** — Ab existing price preserve hoti hai
5. **Dashboard mein ₹0.00 dikhta tha** — Ab "Price set karo" hint dikhta hai
6. **downloadPurchaseExcel/PDF missing tha** — Added
7. **Manifest start_url** — ./ se fix kiya for local + GitHub Pages
8. **Service Worker v7** — Cache version update

---

## ❓ Troubleshooting

**Login nahi ho raha?**
1. Firebase Console → Rules → `true/true` → **Publish**
2. Browser mein **Ctrl+Shift+R** (hard refresh)
3. Phone pe browser cache clear karo

**Stock Value ₹0.00 dikh raha hai?**
- Purchase Entry mein jaao
- Item select karo, qty + **Total Price (₹)** dono bharo
- Save karo → Dashboard pe value auto-update hogi

**PWA install nahi ho raha?**
- HTTPS chahiye (GitHub Pages use karo)
- Chrome/Safari mein open karo
- "Add to Home Screen" option aayega

---

*Anusuya Restaurant & Bar | Inventory System v7 | Developed by Aarav (Ravi)*
