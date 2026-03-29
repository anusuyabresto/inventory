# 🐟 Anusuya Restaurant & Bar — Inventory System v6

## ⚡ QUICK SETUP (5 Steps)

### Step 1 — Firebase Project
1. https://console.firebase.google.com → **Create project**
2. Disable Google Analytics → **Create**

### Step 2 — Realtime Database
1. Left sidebar → **Realtime Database** → **Create Database**
2. Location: **United States (us-central1)**
3. Rules: **Start in test mode** → **Enable**

### Step 3 — Fix Rules (Permanent)
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
`app.js` file mein upar `firebaseConfig` object mein apna config paste karo.

---

## 🚀 GitHub Pages Deploy

1. GitHub pe naya repo banao: `inventory`
2. Saari files upload karo
3. **Settings → Pages → Branch: main → Save**
4. URL milega: `https://yourusername.github.io/inventory/`

---

## 🔑 Default Login
| | |
|---|---|
| Username | `master` |
| Password | `ansuya@123` |

> Pehli baar login pe app automatically master account + default data create karega

---

## ✨ Features
- 📦 Smart Inventory — Sealed + Loose + Bulk tracking
- 💰 Price tracking — Weighted Average Cost
- 📊 Stock Value — Total inventory value in ₹
- 🔄 Real-time updates — Live activity feed
- ⚠️ Low Stock alerts
- 📋 Audit Log — Har action ka record
- 👥 Multi-user — Staff/Manager/Master roles
- 📥 Export — Excel + PDF download
- 📱 PWA — Mobile pe install karo

---

## ❓ Login Nahi Ho Raha?
1. Firebase Console → Rules → `true/true` → **Publish**
2. Browser mein **Ctrl+Shift+R** (hard refresh)
3. Phone pe browser cache clear karo

---
*Anusuya Restaurant & Bar | Inventory System v6 | Developed by Aarav (Ravi)*
