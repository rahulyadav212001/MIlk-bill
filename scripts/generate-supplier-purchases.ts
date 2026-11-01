/**
 * Generates realistic one-month purchase history for the two existing suppliers:
 * - Prashant Sharma (sup_prashant_sharma)
 * - Mahesh Kumar (sup_mahesh_kumar)
 * Date Range: October 1, 2026 to October 31, 2026 (31 days)
 * Sessions: Morning and Evening
 * Total records: 31 * 2 * 2 = 124 purchase records
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  writeBatch,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBJGRAY93E3PGIA8KTTVMi2f2UCCWLZlwM',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'milk-bill-a31be.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'milk-bill-a31be',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'milk-bill-a31be.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '792806488061',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:792806488061:web:0ed40b77f5349d9b758b94',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const USER_ID = 'default_supplier';

// Supplier 1 profile
const SUP1 = {
  id: 'sup_prashant_sharma',
  name: 'Prashant Sharma',
  phone: '9876543211',
};

// Supplier 2 profile
const SUP2 = {
  id: 'sup_mahesh_kumar',
  name: 'Mahesh Kumar',
  phone: '9876543212',
};

// 31 days data for Supplier 1 (Prashant Sharma)
const SUP1_DATA = [
  // Day 1 to 15: Rates between ₹10 and ₹20
  { day: 1, mQty: 80, mRate: 15, eQty: 45, eRate: 18 },
  { day: 2, mQty: 75, mRate: 16, eQty: 50, eRate: 20 },
  { day: 3, mQty: 82, mRate: 14, eQty: 48, eRate: 16 },
  { day: 4, mQty: 85, mRate: 18, eQty: 42, eRate: 19 },
  { day: 5, mQty: 78, mRate: 15, eQty: 46, eRate: 17 },
  { day: 6, mQty: 84, mRate: 17, eQty: 52, eRate: 18 },
  { day: 7, mQty: 88, mRate: 16, eQty: 47, eRate: 17 },
  { day: 8, mQty: 76, mRate: 15, eQty: 44, eRate: 16 },
  { day: 9, mQty: 80, mRate: 18, eQty: 49, eRate: 19 },
  { day: 10, mQty: 85, mRate: 19, eQty: 51, eRate: 20 },
  { day: 11, mQty: 79, mRate: 16, eQty: 46, eRate: 17 },
  { day: 12, mQty: 82, mRate: 15, eQty: 43, eRate: 16 },
  { day: 13, mQty: 86, mRate: 17, eQty: 50, eRate: 18 },
  { day: 14, mQty: 90, mRate: 18, eQty: 53, eRate: 19 },
  { day: 15, mQty: 83, mRate: 16, eQty: 48, eRate: 17 },
  // Day 16 to 31: Realistic rates between ₹24 and ₹32
  { day: 16, mQty: 77, mRate: 24, eQty: 45, eRate: 26 },
  { day: 17, mQty: 85, mRate: 25, eQty: 52, eRate: 27 },
  { day: 18, mQty: 88, mRate: 26, eQty: 49, eRate: 28 },
  { day: 19, mQty: 82, mRate: 25, eQty: 44, eRate: 26 },
  { day: 20, mQty: 79, mRate: 28, eQty: 47, eRate: 30 },
  { day: 21, mQty: 84, mRate: 26, eQty: 51, eRate: 28 },
  { day: 22, mQty: 86, mRate: 27, eQty: 48, eRate: 29 },
  { day: 23, mQty: 81, mRate: 25, eQty: 43, eRate: 27 },
  { day: 24, mQty: 78, mRate: 28, eQty: 46, eRate: 30 },
  { day: 25, mQty: 85, mRate: 30, eQty: 50, eRate: 32 },
  { day: 26, mQty: 89, mRate: 28, eQty: 54, eRate: 30 },
  { day: 27, mQty: 83, mRate: 26, eQty: 47, eRate: 28 },
  { day: 28, mQty: 80, mRate: 27, eQty: 45, eRate: 29 },
  { day: 29, mQty: 84, mRate: 28, eQty: 49, eRate: 30 },
  { day: 30, mQty: 87, mRate: 29, eQty: 52, eRate: 31 },
  { day: 31, mQty: 85, mRate: 28, eQty: 48, eRate: 30 },
];

// 31 days data for Supplier 2 (Mahesh Kumar) - distinct rates & quantities
const SUP2_DATA = [
  // Day 1 to 12: Rates between ₹10 and ₹20
  { day: 1, mQty: 65, mRate: 13, eQty: 40, eRate: 15 },
  { day: 2, mQty: 70, mRate: 14, eQty: 38, eRate: 16 },
  { day: 3, mQty: 68, mRate: 16, eQty: 42, eRate: 18 },
  { day: 4, mQty: 72, mRate: 15, eQty: 45, eRate: 17 },
  { day: 5, mQty: 64, mRate: 17, eQty: 39, eRate: 19 },
  { day: 6, mQty: 75, mRate: 14, eQty: 44, eRate: 16 },
  { day: 7, mQty: 71, mRate: 15, eQty: 41, eRate: 17 },
  { day: 8, mQty: 69, mRate: 16, eQty: 43, eRate: 18 },
  { day: 9, mQty: 73, mRate: 18, eQty: 46, eRate: 20 },
  { day: 10, mQty: 67, mRate: 15, eQty: 40, eRate: 17 },
  { day: 11, mQty: 74, mRate: 14, eQty: 42, eRate: 16 },
  { day: 12, mQty: 70, mRate: 16, eQty: 45, eRate: 18 },
  // Day 13 to 31: Realistic rates between ₹22 and ₹32
  { day: 13, mQty: 76, mRate: 22, eQty: 41, eRate: 24 },
  { day: 14, mQty: 72, mRate: 23, eQty: 44, eRate: 25 },
  { day: 15, mQty: 68, mRate: 25, eQty: 47, eRate: 27 },
  { day: 16, mQty: 75, mRate: 24, eQty: 42, eRate: 26 },
  { day: 17, mQty: 73, mRate: 26, eQty: 45, eRate: 28 },
  { day: 18, mQty: 69, mRate: 25, eQty: 40, eRate: 27 },
  { day: 19, mQty: 77, mRate: 27, eQty: 43, eRate: 29 },
  { day: 20, mQty: 72, mRate: 26, eQty: 46, eRate: 28 },
  { day: 21, mQty: 68, mRate: 28, eQty: 41, eRate: 30 },
  { day: 22, mQty: 75, mRate: 27, eQty: 44, eRate: 29 },
  { day: 23, mQty: 71, mRate: 25, eQty: 48, eRate: 27 },
  { day: 24, mQty: 69, mRate: 28, eQty: 42, eRate: 30 },
  { day: 25, mQty: 74, mRate: 29, eQty: 45, eRate: 31 },
  { day: 26, mQty: 78, mRate: 28, eQty: 43, eRate: 30 },
  { day: 27, mQty: 72, mRate: 27, eQty: 46, eRate: 29 },
  { day: 28, mQty: 70, mRate: 28, eQty: 40, eRate: 30 },
  { day: 29, mQty: 75, mRate: 30, eQty: 44, eRate: 32 },
  { day: 30, mQty: 73, mRate: 29, eQty: 47, eRate: 31 },
  { day: 31, mQty: 76, mRate: 28, eQty: 45, eRate: 30 },
];

export async function generateSupplierPurchases() {
  console.log('--- Generating One Month Supplier Purchase History ---');
  const allRecords: any[] = [];

  const suppliers = [
    { info: SUP1, days: SUP1_DATA },
    { info: SUP2, days: SUP2_DATA },
  ];

  for (const s of suppliers) {
    for (const d of s.days) {
      const dateStr = `2026-10-${String(d.day).padStart(2, '0')}`;

      // 1. Morning record
      const morningDocId = `purchase_${s.info.id}_${dateStr}_morning`;
      const morningAmount = Number((d.mQty * d.mRate).toFixed(2));
      const morningTimestamp = new Date(`${dateStr}T07:00:00+05:30`).getTime();
      allRecords.push({
        id: morningDocId,
        supplierId: s.info.id,
        supplierName: s.info.name,
        supplierPhone: s.info.phone,
        purchaseDate: dateStr,
        session: 'morning',
        quantityLiters: d.mQty,
        pricePerLiter: d.mRate,
        totalAmount: morningAmount,
        createdAt: morningTimestamp,
        updatedAt: morningTimestamp,
      });

      // 2. Evening record
      const eveningDocId = `purchase_${s.info.id}_${dateStr}_evening`;
      const eveningAmount = Number((d.eQty * d.eRate).toFixed(2));
      const eveningTimestamp = new Date(`${dateStr}T18:00:00+05:30`).getTime();
      allRecords.push({
        id: eveningDocId,
        supplierId: s.info.id,
        supplierName: s.info.name,
        supplierPhone: s.info.phone,
        purchaseDate: dateStr,
        session: 'evening',
        quantityLiters: d.eQty,
        pricePerLiter: d.eRate,
        totalAmount: eveningAmount,
        createdAt: eveningTimestamp,
        updatedAt: eveningTimestamp,
      });
    }
  }

  console.log(`Total supplier purchase records prepared: ${allRecords.length}`);

  // Commit in safe batches
  for (let i = 0; i < allRecords.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = allRecords.slice(i, i + 400);
    chunk.forEach((rec) => {
      const ref = doc(db, 'users', USER_ID, 'supplierPurchases', rec.id);
      batch.set(ref, rec, { merge: true });
    });
    await batch.commit();
  }
  console.log(`Committed ${allRecords.length} supplier purchase records to Firestore.`);

  // Validation
  const q1 = query(
    collection(db, 'users', USER_ID, 'supplierPurchases'),
    where('supplierId', '==', SUP1.id)
  );
  const q2 = query(
    collection(db, 'users', USER_ID, 'supplierPurchases'),
    where('supplierId', '==', SUP2.id)
  );

  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

  let sup1TotalMilk = 0;
  let sup1TotalAmount = 0;
  snap1.forEach((d) => {
    const data = d.data();
    sup1TotalMilk += data.quantityLiters;
    sup1TotalAmount += data.totalAmount;
  });

  let sup2TotalMilk = 0;
  let sup2TotalAmount = 0;
  snap2.forEach((d) => {
    const data = d.data();
    sup2TotalMilk += data.quantityLiters;
    sup2TotalAmount += data.totalAmount;
  });

  console.log(`\nVerification:`);
  console.log(`Supplier 1 (${SUP1.name}):`);
  console.log(` - Records: ${snap1.size} (Expected 62)`);
  console.log(` - Monthly Milk Total: ${sup1TotalMilk.toFixed(2)} L`);
  console.log(` - Monthly Amount Total: ₹${sup1TotalAmount.toFixed(2)}`);

  console.log(`Supplier 2 (${SUP2.name}):`);
  console.log(` - Records: ${snap2.size} (Expected 62)`);
  console.log(` - Monthly Milk Total: ${sup2TotalMilk.toFixed(2)} L`);
  console.log(` - Monthly Amount Total: ₹${sup2TotalAmount.toFixed(2)}`);

  return {
    sup1Records: snap1.size,
    sup1TotalMilk,
    sup1TotalAmount,
    sup2Records: snap2.size,
    sup2TotalMilk,
    sup2TotalAmount,
  };
}

if (typeof require !== 'undefined' && (require as any).main === module) {
  generateSupplierPurchases()
    .then((res) => {
      console.log('Supplier purchases generated successfully:', JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error generating supplier purchases:', err);
      process.exit(1);
    });
}

