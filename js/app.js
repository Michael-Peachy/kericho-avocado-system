// js/app.js
// Main client-side logic for the Produce Management System.
// Uses Firebase Auth + Firestore + Chart.js (loaded via CDN).

import { firebaseConfig } from "./firebaseConfig.js";
import { seedDemoData } from "./seedDemoData.js";

// Firebase v10 modular imports via CDN
import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ===== DOM ELEMENTS =====
const authSection = document.getElementById("auth-section");
const appSection = document.getElementById("app-section");
const loginForm = document.getElementById("login-form");
const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");
const userInfoEl = document.getElementById("user-info");
const userEmailEl = document.getElementById("user-email");
const userRoleEl = document.getElementById("user-role");
const logoutBtn = document.getElementById("logout-btn");

const tabButtons = document.querySelectorAll(".tab-btn");
const inventoryView = document.getElementById("inventory-view");
const analyticsView = document.getElementById("analytics-view");
const adminView = document.getElementById("admin-view");

const inventoryForm = document.getElementById("inventory-form");
const inventoryFormTitle = document.getElementById("inventory-form-title");
const cancelEditBtn = document.getElementById("cancel-edit");
const inventoryTbody = document.getElementById("inventory-tbody");
const exportInventoryCsvBtn = document.getElementById("export-inventory-csv");
const printInventoryBtn = document.getElementById("print-inventory");

const analysisFilterForm = document.getElementById("analysis-filter-form");
const fromMonthInput = document.getElementById("from-month");
const toMonthInput = document.getElementById("to-month");
const clearFiltersBtn = document.getElementById("clear-filters");
const yieldLineCanvas = document.getElementById("yield-line-chart");
const topFarmersTableBody = document.querySelector("#top-farmers-table tbody");
const topVarietiesTableBody = document.querySelector("#top-varieties-table tbody");
const exportYieldCsvBtn = document.getElementById("export-yield-csv");

const adminCreateUserForm = document.getElementById("admin-create-user-form");
const newUserEmailInput = document.getElementById("new-user-email");
const newUserPasswordInput = document.getElementById("new-user-password");
const newUserRoleSelect = document.getElementById("new-user-role");
const usersTableBody = document.querySelector("#users-table tbody");
const seedDemoDataBtn = document.getElementById("seed-demo-data");

const toastEl = document.getElementById("toast");

// ===== GLOBAL STATE =====
let currentUser = null;
let currentUserRole = null;
let inventoryUnsubscribe = null;
let usersUnsubscribe = null;
let inventoryData = []; // Raw inventory docs
let yieldChart = null;

// ===== UTILITIES =====
function showToast(message, type = "info") {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  toastEl.classList.add("show");

  if (type === "error") {
    toastEl.style.backgroundColor = "#b91c1c";
  } else if (type === "success") {
    toastEl.style.backgroundColor = "#065f46";
  } else {
    toastEl.style.backgroundColor = "#111827";
  }

  setTimeout(() => {
    toastEl.classList.remove("show");
    toastEl.classList.add("hidden");
  }, 3500);
}

function showSection(isLoggedIn) {
  if (isLoggedIn) {
    authSection.classList.add("hidden");
    appSection.classList.remove("hidden");
    userInfoEl.classList.remove("hidden");
  } else {
    authSection.classList.remove("hidden");
    appSection.classList.add("hidden");
    userInfoEl.classList.add("hidden");
  }
}

function setUserInfo(user, role) {
  if (!user) {
    userEmailEl.textContent = "";
    userRoleEl.textContent = "";
    return;
  }
  userEmailEl.textContent = user.email || "";
  userRoleEl.textContent = `(${role || "no-role"})`;
}

// Activate/deactivate tabs
function setActiveTab(targetId) {
  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.target === targetId;
    btn.classList.toggle("active", isActive);
  });

  [inventoryView, analyticsView, adminView].forEach((view) => {
    view.classList.add("hidden");
  });

  const targetEl = document.getElementById(targetId);
  if (targetEl) targetEl.classList.remove("hidden");
}

// Role-based UI toggling (front-end only, rules still enforce on backend)
function applyRoleUI(role) {
  // Admin-only tab button
  document
    .querySelectorAll(".admin-only")
    .forEach((btn) => btn.classList.toggle("hidden", role !== "admin"));

  // Actions column visibility (simple UX - rules still protect data)
  document
    .querySelectorAll(".admin-col")
    .forEach((th) => th.classList.toggle("hidden", role === "officer"));

  // Admin view itself: we still keep it in the DOM but rely on RBAC
  // to block operations if someone inspects page.
}

// Parse inputsUsed textarea into array
function parseInputsUsed(text) {
  if (!text || !text.trim()) return [];
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((segment) => {
      const [name, qtyStr, costStr] = segment.split(":").map((x) => x.trim());
      return {
        name: name || "",
        qty: qtyStr ? Number(qtyStr) : null,
        cost: costStr ? Number(costStr) : null
      };
    });
}

function formatInputsUsed(inputs) {
  if (!inputs || !Array.isArray(inputs) || inputs.length === 0) return "";
  return inputs
    .map((i) => `${i.name || ""}:${i.qty ?? ""}:${i.cost ?? ""}`)
    .join(", ");
}

// CSV helper
function downloadCsv(filename, rows) {
  const processValue = (v) => {
    if (v === null || v === undefined) return "";
    const str = String(v);
    // Escape quotes
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const lines = rows.map((row) => row.map(processValue).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

// Convert date string -> month key "YYYY-MM"
function toMonthKey(dateStr) {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Unknown";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// Filter by month range
function isWithinMonthRange(dateStr, fromMonth, toMonth) {
  if (!fromMonth && !toMonth) return true;
  const key = toMonthKey(dateStr);
  if (key === "Unknown") return false;
  if (fromMonth && key < fromMonth) return false;
  if (toMonth && key > toMonth) return false;
  return true;
}

// ===== FIREBASE HELPERS =====

// Make sure user doc exists and return role
async function ensureUserDocAndGetRole(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    // Create default "officer" role on first login.
    await setDoc(userRef, {
      email: user.email || "",
      role: "officer",
      createdAt: serverTimestamp()
    });
    return "officer";
  }
  const data = snap.data();
  return data.role || "officer";
}

// Subscribe to inventory collection (realtime)
function subscribeInventory() {
  if (inventoryUnsubscribe) inventoryUnsubscribe();

  const inventoryRef = collection(db, "inventory");
  const q = query(inventoryRef, orderBy("harvestDate", "desc"));
  inventoryUnsubscribe = onSnapshot(
    q,
    (snapshot) => {
      inventoryData = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        inventoryData.push({
          id: docSnap.id,
          ...data
        });
      });

      renderInventoryTable();
      renderAnalytics(); // Recalculate charts/tables
    },
    (error) => {
      console.error("Inventory snapshot error:", error);
      showToast("Error loading inventory. Check console.", "error");
    }
  );
}

// Subscribe to users (admin view)
function subscribeUsers() {
  if (usersUnsubscribe) usersUnsubscribe();

  const usersRef = collection(db, "users");
  usersUnsubscribe = onSnapshot(
    usersRef,
    (snapshot) => {
      const users = [];
      snapshot.forEach((docSnap) => {
        users.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      renderUsersTable(users);
    },
    (error) => {
      console.error("Users snapshot error:", error);
      showToast("Error loading users. Check console.", "error");
    }
  );
}

// ===== INVENTORY UI & LOGIC =====

function renderInventoryTable() {
  inventoryTbody.innerHTML = "";
  if (!inventoryData.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.textContent = "No inventory records found.";
    td.style.textAlign = "center";
    tr.appendChild(td);
    inventoryTbody.appendChild(tr);
    return;
  }

  inventoryData.forEach((item) => {
    const tr = document.createElement("tr");

    const farmerCell = document.createElement("td");
    farmerCell.textContent = `${item.farmerName || ""} (${item.farmerId || ""})`;
    tr.appendChild(farmerCell);

    const varietyCell = document.createElement("td");
    varietyCell.textContent = item.variety || "";
    tr.appendChild(varietyCell);

    const dateCell = document.createElement("td");
    dateCell.textContent = item.harvestDate || "";
    tr.appendChild(dateCell);

    const weightCell = document.createElement("td");
    weightCell.textContent = item.weightKg != null ? item.weightKg : "";
    tr.appendChild(weightCell);

    const gradeCell = document.createElement("td");
    gradeCell.textContent = item.grade || "";
    tr.appendChild(gradeCell);

    const statusCell = document.createElement("td");
    statusCell.textContent = item.status || "";
    tr.appendChild(statusCell);

    const storageCell = document.createElement("td");
    storageCell.textContent = item.storageLocation || "";
    tr.appendChild(storageCell);

    const actionsCell = document.createElement("td");
    actionsCell.className = "admin-col";

    // Officer can also edit/delete in this MVP (backend rules still check role)
    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.className = "btn btn-link";
    editBtn.addEventListener("click", () => startEditInventory(item));

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.className = "btn btn-link";
    delBtn.addEventListener("click", () => deleteInventoryItem(item.id));

    actionsCell.appendChild(editBtn);
    actionsCell.appendChild(delBtn);
    tr.appendChild(actionsCell);

    inventoryTbody.appendChild(tr);
  });
}

function startEditInventory(item) {
  document.getElementById("produce-id").value = item.id;
  document.getElementById("farmer-id").value = item.farmerId || "";
  document.getElementById("farmer-name").value = item.farmerName || "";
  document.getElementById("variety").value = item.variety || "";
  document.getElementById("harvest-date").value = item.harvestDate || "";
  document.getElementById("weight-kg").value = item.weightKg || "";
  document.getElementById("grade").value = item.grade || "A";
  document.getElementById("inputs-used").value = formatInputsUsed(item.inputUsed);
  document.getElementById("storage-location").value = item.storageLocation || "";
  document.getElementById("status").value = item.status || "in_stock";

  inventoryFormTitle.textContent = "Edit Harvest Entry";
  cancelEditBtn.classList.remove("hidden");
}

function resetInventoryForm() {
  inventoryForm.reset();
  document.getElementById("produce-id").value = "";
  inventoryFormTitle.textContent = "Add Harvest Entry";
  cancelEditBtn.classList.add("hidden");
}

async function deleteInventoryItem(id) {
  if (!confirm("Are you sure you want to delete this record?")) return;
  try {
    const ref = doc(db, "inventory", id);
    await deleteDoc(ref);
    showToast("Record deleted", "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to delete record (check permissions).", "error");
  }
}

// ===== ANALYTICS =====

function renderAnalytics() {
  const fromMonth = fromMonthInput.value || null;
  const toMonth = toMonthInput.value || null;

  // Aggregate by month
  const monthTotals = {};
  const farmerTotals = {};
  const varietyTotals = {};

  inventoryData.forEach((row) => {
    if (!isWithinMonthRange(row.harvestDate, fromMonth, toMonth)) return;
    const weight = Number(row.weightKg) || 0;
    const monthKey = toMonthKey(row.harvestDate);

    monthTotals[monthKey] = (monthTotals[monthKey] || 0) + weight;
    const farmerKey = row.farmerName || row.farmerId || "Unknown";
    farmerTotals[farmerKey] = (farmerTotals[farmerKey] || 0) + weight;

    const varietyKey = row.variety || "Unknown";
    varietyTotals[varietyKey] = (varietyTotals[varietyKey] || 0) + weight;
  });

  // Line chart
  const sortedMonthKeys = Object.keys(monthTotals).filter((k) => k !== "Unknown").sort();
  const monthValues = sortedMonthKeys.map((k) => monthTotals[k]);

  if (yieldChart) yieldChart.destroy();
  yieldChart = new Chart(yieldLineCanvas.getContext("2d"), {
    type: "line",
    data: {
      labels: sortedMonthKeys,
      datasets: [
        {
          label: "Total Yield (kg)",
          data: monthValues,
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });

  // Top farmers
  topFarmersTableBody.innerHTML = "";
  Object.entries(farmerTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([farmer, total]) => {
      const tr = document.createElement("tr");
      const tdName = document.createElement("td");
      const tdTotal = document.createElement("td");
      tdName.textContent = farmer;
      tdTotal.textContent = total.toFixed(1);
      tr.appendChild(tdName);
      tr.appendChild(tdTotal);
      topFarmersTableBody.appendChild(tr);
    });

  // Top varieties
  topVarietiesTableBody.innerHTML = "";
  Object.entries(varietyTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([variety, total]) => {
      const tr = document.createElement("tr");
      const tdVar = document.createElement("td");
      const tdTotal = document.createElement("td");
      tdVar.textContent = variety;
      tdTotal.textContent = total.toFixed(1);
      tr.appendChild(tdVar);
      tr.appendChild(tdTotal);
      topVarietiesTableBody.appendChild(tr);
    });
}

// ===== CSV EXPORTS =====

function exportInventoryCsv() {
  const headers = [
    "produceId",
    "farmerId",
    "farmerName",
    "variety",
    "harvestDate",
    "weightKg",
    "grade",
    "status",
    "storageLocation",
    "inputsUsed"
  ];

  const rows = [headers];
  inventoryData.forEach((item) => {
    rows.push([
      item.id,
      item.farmerId || "",
      item.farmerName || "",
      item.variety || "",
      item.harvestDate || "",
      item.weightKg != null ? item.weightKg : "",
      item.grade || "",
      item.status || "",
      item.storageLocation || "",
      formatInputsUsed(item.inputUsed)
    ]);
  });

  downloadCsv("inventory_snapshot.csv", rows);
}

function exportYieldCsv() {
  const fromMonth = fromMonthInput.value || null;
  const toMonth = toMonthInput.value || null;

  const monthTotals = {};
  const farmerTotals = {};
  const varietyTotals = {};

  inventoryData.forEach((row) => {
    if (!isWithinMonthRange(row.harvestDate, fromMonth, toMonth)) return;
    const weight = Number(row.weightKg) || 0;
    const monthKey = toMonthKey(row.harvestDate);

    monthTotals[monthKey] = (monthTotals[monthKey] || 0) + weight;
    const farmerKey = row.farmerName || row.farmerId || "Unknown";
    farmerTotals[farmerKey] = (farmerTotals[farmerKey] || 0) + weight;
    const varietyKey = row.variety || "Unknown";
    varietyTotals[varietyKey] = (varietyTotals[varietyKey] || 0) + weight;
  });

  const rows = [];
  rows.push(["Yield summary by month"]);
  rows.push(["Month", "TotalWeightKg"]);
  Object.entries(monthTotals)
    .filter(([k]) => k !== "Unknown")
    .sort((a, b) => (a[0] > b[0] ? 1 : -1))
    .forEach(([month, total]) => {
      rows.push([month, total.toFixed(1)]);
    });

  rows.push([]);
  rows.push(["Farmer contributions"]);
  rows.push(["Farmer", "TotalWeightKg"]);
  Object.entries(farmerTotals)
    .sort((a, b) => b[1] - a[1])
    .forEach(([farmer, total]) => rows.push([farmer, total.toFixed(1)]));

  rows.push([]);
  rows.push(["Variety contributions"]);
  rows.push(["Variety", "TotalWeightKg"]);
  Object.entries(varietyTotals)
    .sort((a, b) => b[1] - a[1])
    .forEach(([variety, total]) => rows.push([variety, total.toFixed(1)]));

  downloadCsv("yield_summary.csv", rows);
}

// ===== ADMIN: USERS & ROLES =====

function renderUsersTable(users) {
  usersTableBody.innerHTML = "";

  if (!users.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.textContent = "No users found.";
    td.style.textAlign = "center";
    tr.appendChild(td);
    usersTableBody.appendChild(tr);
    return;
  }

  users.forEach((u) => {
    const tr = document.createElement("tr");
    const emailTd = document.createElement("td");
    emailTd.textContent = u.email || "";
    tr.appendChild(emailTd);

    const roleTd = document.createElement("td");
    const select = document.createElement("select");
    ["officer", "manager", "admin"].forEach((role) => {
      const opt = document.createElement("option");
      opt.value = role;
      opt.textContent = role;
      if (u.role === role) opt.selected = true;
      select.appendChild(opt);
    });
    roleTd.appendChild(select);
    tr.appendChild(roleTd);

    const actionTd = document.createElement("td");
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.className = "btn btn-link";
    saveBtn.addEventListener("click", async () => {
      try {
        const newRole = select.value;
        await updateDoc(doc(db, "users", u.id), { role: newRole });
        showToast(`Updated role for ${u.email} to ${newRole}`, "success");
      } catch (err) {
        console.error(err);
        showToast("Failed to update role (check rules).", "error");
      }
    });
    actionTd.appendChild(saveBtn);
    tr.appendChild(actionTd);

    usersTableBody.appendChild(tr);
  });
}

// ===== EVENT LISTENERS =====

// Login
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    showToast("Logged in successfully", "success");
  } catch (err) {
    console.error(err);
    showToast("Login failed. Check credentials.", "error");
  }
});

// Logout
logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    showToast("Logged out", "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to logout.", "error");
  }
});

// Inventory form submit
inventoryForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("produce-id").value || null;
  const farmerId = document.getElementById("farmer-id").value.trim();
  const farmerName = document.getElementById("farmer-name").value.trim();
  const variety = document.getElementById("variety").value.trim();
  const harvestDate = document.getElementById("harvest-date").value;
  const weightKg = Number(document.getElementById("weight-kg").value);
  const grade = document.getElementById("grade").value;
  const inputsText = document.getElementById("inputs-used").value;
  const storageLocation = document.getElementById("storage-location").value.trim();
  const status = document.getElementById("status").value;

  const data = {
    farmerId,
    farmerName,
    variety,
    harvestDate,
    weightKg,
    grade,
    inputUsed: parseInputsUsed(inputsText),
    storageLocation,
    status,
    updatedAt: serverTimestamp()
  };

  try {
    if (id) {
      const ref = doc(db, "inventory", id);
      await updateDoc(ref, data);
      showToast("Entry updated", "success");
    } else {
      const ref = collection(db, "inventory");
      await addDoc(ref, {
        ...data,
        createdAt: serverTimestamp()
      });
      showToast("Entry created", "success");
    }
    resetInventoryForm();
  } catch (err) {
    console.error(err);
    showToast("Failed to save entry (check rules).", "error");
  }
});

cancelEditBtn.addEventListener("click", () => {
  resetInventoryForm();
});

// Inventory exports/print
exportInventoryCsvBtn.addEventListener("click", () => {
  exportInventoryCsv();
});

printInventoryBtn.addEventListener("click", () => {
  window.print();
});

// Analysis filters
analysisFilterForm.addEventListener("submit", (e) => {
  e.preventDefault();
  renderAnalytics();
});

clearFiltersBtn.addEventListener("click", () => {
  fromMonthInput.value = "";
  toMonthInput.value = "";
  renderAnalytics();
});

exportYieldCsvBtn.addEventListener("click", () => {
  exportYieldCsv();
});

// Tabs
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;
    setActiveTab(target);
  });
});

// Admin create user
adminCreateUserForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (currentUserRole !== "admin") {
    showToast("Only admins can create users.", "error");
    return;
  }

  const email = newUserEmailInput.value.trim();
  const password = newUserPasswordInput.value;
  const role = newUserRoleSelect.value;

  try {
    // IMPORTANT:
    // In a real production setup, user creation with specific roles
    // should be done via a secure backend / Cloud Function.
    // For this MVP, we temporarily sign out the admin, create the new user,
    // then sign back in as admin. This is hacky but works for demos.
    const adminEmail = currentUser.email;
    const adminPassword = prompt(
      "For demo only: enter your admin password again to continue user creation"
    );
    if (!adminPassword) {
      showToast("User creation cancelled.", "info");
      return;
    }

    await signOut(auth);
    const tempUserCred = await createUserWithEmailAndPassword(auth, email, password);
    const newUid = tempUserCred.user.uid;

    // Create Firestore user doc for new user
    await setDoc(doc(db, "users", newUid), {
      email,
      role,
      createdAt: serverTimestamp()
    });

    // Sign out new user and sign back in as admin
    await signOut(auth);
    await signInWithEmailAndPassword(auth, adminEmail, adminPassword);

    newUserEmailInput.value = "";
    newUserPasswordInput.value = "";
    newUserRoleSelect.value = "officer";
    showToast("User created and role assigned.", "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to create user. See console.", "error");
  }
});

// Seed demo data (admin only)
seedDemoDataBtn.addEventListener("click", async () => {
  if (currentUserRole !== "admin") {
    showToast("Only admins can seed demo data.", "error");
    return;
  }
  try {
    await seedDemoData(db);
    showToast("Demo data seeded.", "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to seed demo data. See console.", "error");
  }
});

// ===== AUTH STATE HANDLING =====
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    currentUserRole = null;
    setUserInfo(null, null);
    showSection(false);
    if (inventoryUnsubscribe) inventoryUnsubscribe();
    if (usersUnsubscribe) usersUnsubscribe();
    return;
  }

  currentUser = user;

  try {
    const role = await ensureUserDocAndGetRole(user);
    currentUserRole = role;
    setUserInfo(user, role);
    applyRoleUI(role);
    showSection(true);
    setActiveTab("inventory-view");

    subscribeInventory();

    if (role === "admin") {
      subscribeUsers();
    } else if (usersUnsubscribe) {
      usersUnsubscribe();
      usersUnsubscribe = null;
    }
  } catch (err) {
    console.error(err);
    showToast("Failed to load user role. Check Firestore rules.", "error");
  }
});
