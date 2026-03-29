# 🐟 Anusuya Restaurant & Bar — Inventory Management System

## ⚡ SETUP GUIDE — Step by Step

---

## STEP 1 — Firebase Project Banao

1. **https://console.firebase.google.com** pe jao
2. **"Create a new Firebase project"** click karo
3. Project name: `anusuya-inventory` (jo chahо)
4. Google Analytics: **Disable** karo
5. **"Create project"** click karo

---

## STEP 2 — Realtime Database Setup Karo

1. Left sidebar → **"Realtime Database"** click karo
2. **"Create Database"** click karo
3. Location: **United States (us-central1)** select karo
4. Rules: **"Start in test mode"** ✅ select karo
5. **"Enable"** click karo

---

## STEP 3 — Rules Permanent Karo

1. **Rules** tab click karo
2. Sab delete karo aur yeh paste karo:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

3. **"Publish"** click karo ✅

---

## STEP 4 — Web App Register Karo

1. **Project Overview** pe jao
2. Upar **`</>`** (web icon) click karo
3. App nickname: `anusuya-web`
4. **"Register app"** click karo
5. `firebaseConfig` code copy karo — yeh dikhega:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project-id",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

---

## STEP 5 — Config app.js Mein Daalo

1. `app.js` file open karo
2. Top pe `firebaseConfig` dhundho
3. **`YOUR_API_KEY`** wali jagah apna config paste karo
4. Save karo

---

## STEP 6 — GitHub Pe Upload Karo

1. GitHub pe naya repository banao: `inventory`
2. Saari files upload karo:
   - `index.html`
   - `app.js`
   - `style.css`
   - `sw.js`
   - `manifest.json`
   - `icon-192.png`
   - `icon-512.png`
3. **Settings** → **Pages** → Branch: `main` → **Save**
4. GitHub Pages URL milega: `https://yourusername.github.io/inventory/`

---

## STEP 7 — Login Karo ✅

- **Username:** `master`
- **Password:** `ansuya@123`

> ⚠️ Pehli baar login pe app automatically master account aur default data create kar dega!

---

## 🔑 Default Login

| Field | Value |
|-------|-------|
| Username | `master` |
| Password | `ansuya@123` |
| Role | Master Admin |

---

## ❓ Agar Login Na Ho

1. Firebase Console → Realtime Database → **Rules** check karo
2. `.read: true` aur `.write: true` hona chahiye
3. **Publish** kiya hua ho
4. Browser mein page **hard refresh** karo (Ctrl + Shift + R)

---

## 📱 PWA Install

Mobile pe browser mein open karo → **"Add to Home Screen"** option aayega → Install karo

---

*Developed by Aarav (Ravi) | Anusuya Inventory System v2.0*
