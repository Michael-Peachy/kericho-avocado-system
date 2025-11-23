// js/seedDemoData.js
// Seeds demo data into Firestore for testing.
// Call via "Seed Demo Data" button in Admin tab (admin-only).

import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function seedDemoData(db) {
  const inventoryRef = collection(db, "inventory");

  const demoItems = [
    {
      farmerId: "F001",
      farmerName: "John Kiprono",
      variety: "Hass",
      harvestDate: "2025-05-10",
      weightKg: 120.5,
      grade: "A",
      inputUsed: [
        { name: "Fertilizer", qty: 10, cost: 500 },
        { name: "Pesticide", qty: 2, cost: 300 }
      ],
      storageLocation: "Warehouse 1",
      status: "sold"
    },
    {
      farmerId: "F002",
      farmerName: "Mary Chebet",
      variety: "Fuerte",
      harvestDate: "2025-05-20",
      weightKg: 95.3,
      grade: "B",
      inputUsed: [{ name: "Fertilizer", qty: 8, cost: 400 }],
      storageLocation: "Warehouse 2",
      status: "in_stock"
    },
    {
      farmerId: "F001",
      farmerName: "John Kiprono",
      variety: "Hass",
      harvestDate: "2025-06-05",
      weightKg: 140.0,
      grade: "A",
      inputUsed: [{ name: "Fertilizer", qty: 11, cost: 550 }],
      storageLocation: "Warehouse 1",
      status: "in_stock"
    },
    {
      farmerId: "F003",
      farmerName: "Peter Langat",
      variety: "Hass",
      harvestDate: "2025-06-15",
      weightKg: 60.0,
      grade: "C",
      inputUsed: [{ name: "Pesticide", qty: 1, cost: 150 }],
      storageLocation: "Warehouse 1",
      status: "wasted"
    },
    {
      farmerId: "F002",
      farmerName: "Mary Chebet",
      variety: "Fuerte",
      harvestDate: "2025-07-01",
      weightKg: 110.2,
      grade: "A",
      inputUsed: [
        { name: "Fertilizer", qty: 9, cost: 480 },
        { name: "Mulch", qty: 3, cost: 200 }
      ],
      storageLocation: "Warehouse 2",
      status: "sold"
    }
  ];

  const promises = demoItems.map((item) =>
    addDoc(inventoryRef, {
      ...item,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  );

  await Promise.all(promises);

  // For safety, we do NOT auto-create users here.
  // Admins should manage roles manually via the Admin tab.
}
