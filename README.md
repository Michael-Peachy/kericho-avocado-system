# Produce Management System – Kericho Avocado Farmers

A single-page web app (plain HTML/CSS/JS) with Firebase backend and Vercel hosting.

Main goal: track inventory, analyze yield, and generate CSV reports for avocado farmers in Kericho.

---

## 1. Features (MVP)

- **Authentication (Firebase Auth)**
  - Email/password login
  - Role-based access: `admin`, `manager`, `officer`
- **Inventory module (Firestore)**
  - Create / Read / Update / Delete harvest entries
  - Fields:
    - `farmerId`, `farmerName`
    - `variety`
    - `harvestDate` (string `"YYYY-MM-DD"`)
    - `weightKg` (number)
    - `grade` (`A | B | C`)
    - `inputUsed` (array of `{ name, qty, cost }`)
    - `storageLocation`
    - `status` (`in_stock | sold | wasted`)
  - Realtime updates using `onSnapshot`
- **Yield analysis**
  - Aggregation on client by month, farmer, variety
  - Line chart of yield over time (Chart.js)
  - Top farmers + top varieties tables
- **Reporting / exports**
  - Inventory snapshot CSV
  - Yield summary CSV (by month, farmer, variety)
  - Print-friendly inventory view (browser print)
- **Admin**
  - Manage user roles (`officer`, `manager`, `admin`)
  - Create new users (demo approach)
  - Seed demo data for testing

---

## 2. Project Structure

```text
produce-management-system/
├─ index.html           # Single-page UI
├─ styles.css           # Styling (responsive)
├─ js/
│  ├─ firebaseConfig.js # Firebase project config
│  ├─ app.js            # Main SPA logic
│  └─ seedDemoData.js   # Demo seeding helper
├─ firestore.rules      # Firestore security rules
├─ README.md
└─ optional-cloud-functions/
   └─ index.js          # OPTIONAL: scheduled email reports (outline)
