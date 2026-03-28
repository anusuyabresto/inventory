# Ansuya Restaurant & Bar — Inventory Management System
## Setup Guide

---

### ✅ Default Login
- **Username:** `master`
- **Password:** `ansuya@123`

---

### 🚀 How to Use (Without Firebase — Works Instantly)
1. Open `index.html` in any browser
2. Login with master credentials above
3. All data saves to browser localStorage
4. You can add employees, categories, inventory items right away

---

### 🔥 Firebase Setup (For Real-Time Sync Across Devices)

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project (e.g., `ansuya-inventory`)
3. Go to **Realtime Database** → Create Database → Start in **test mode**
4. Click the **gear icon** → Project Settings → Web App → Register app
5. Copy the `firebaseConfig` values
6. Open `app.js` and replace the `firebaseConfig` block at the top:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_REAL_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

7. Save the file — now all data syncs live across all devices!

---

### 👤 User Roles
| Role | Permissions |
|------|-------------|
| **Master** | Full access: add/delete users, manage categories, delete items, view all |
| **Manager** | Add/edit items, update stock, view audit log |
| **Staff** | Update stock only, view inventory |

---

### 📦 Features
- Live inventory tracking with custom units (pcs, kg, g, ltr, ml, bottle, crate, box, dozen, plate, packet)
- Category-wise organization with custom icons and colors
- Stock update audit log with username, date, time
- Low stock alerts
- Master can create/delete employee accounts with passwords
- Firebase Realtime Database support for multi-device sync
- Works offline with localStorage fallback

---

### 📱 Units Supported
`pcs` `kg` `g` `ltr` `ml` `bottle` `crate` `box` `dozen` `plate` `packet`

---

### 🐟 Fresh Catch Board
The whiteboard in your photos shows: Kingfish, Chonak, Squids, Lepo, Prawns, Mackerel — all pre-loaded as sample items!
