import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBJGRAY93E3PGIA8KTTVMi2f2UCCWLZlwM',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'milk-bill-a31be.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'milk-bill-a31be',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'milk-bill-a31be.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '792806488061',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:792806488061:web:0ed40b77f5349d9b758b94',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const USER_ID = 'default_supplier';

async function removeSalesData() {
  console.log('=== REMOVING ALL SUPPLY SALES DATA FROM FIRESTORE ===\n');

  // 1. Audit pre-cleanup collection sizes to guarantee unrelated data stays intact
  const supsSnap = await getDocs(collection(db, 'users', USER_ID, 'suppliers'));
  const custsSnap = await getDocs(collection(db, 'users', USER_ID, 'customers'));
  const octPurchasesSnap = await getDocs(collection(db, 'users', USER_ID, 'supplierPurchases'));
  const octDeliveriesSnap = await getDocs(collection(db, 'users', USER_ID, 'deliveries'));
  const monthlyBillsSnap = await getDocs(collection(db, 'users', USER_ID, 'monthlyBills'));
  const paymentsSnap = await getDocs(collection(db, 'users', USER_ID, 'payments'));

  console.log('Pre-cleanup counts:');
  console.log(`  - suppliers: ${supsSnap.size}`);
  console.log(`  - customers: ${custsSnap.size}`);
  console.log(`  - supplierPurchases: ${octPurchasesSnap.size}`);
  console.log(`  - deliveries: ${octDeliveriesSnap.size}`);
  console.log(`  - monthlyBills: ${monthlyBillsSnap.size}`);
  console.log(`  - payments: ${paymentsSnap.size}`);

  // 2. Delete all records from "milkSales"
  const milkSalesColl = collection(db, 'users', USER_ID, 'milkSales');
  const milkSalesSnap = await getDocs(milkSalesColl);
  console.log(`\nFound ${milkSalesSnap.size} sales records in "milkSales". Deleting...`);
  for (const sDoc of milkSalesSnap.docs) {
    console.log(`  - Deleting milkSales doc: ${sDoc.id}`);
    await deleteDoc(sDoc.ref);
  }

  // 3. Delete all records from legacy "sales" collection if any
  const legacySalesColl = collection(db, 'users', USER_ID, 'sales');
  const legacySalesSnap = await getDocs(legacySalesColl);
  console.log(`Found ${legacySalesSnap.size} records in legacy "sales". Deleting...`);
  for (const sDoc of legacySalesSnap.docs) {
    console.log(`  - Deleting sales doc: ${sDoc.id}`);
    await deleteDoc(sDoc.ref);
  }

  // 4. Reset purchase sold fields on "milkPurchases" (unsold state)
  const milkPurchasesColl = collection(db, 'users', USER_ID, 'milkPurchases');
  const milkPurchasesSnap = await getDocs(milkPurchasesColl);
  console.log(`\nChecking ${milkPurchasesSnap.size} records in "milkPurchases" for sold flags...`);
  for (const pDoc of milkPurchasesSnap.docs) {
    const data = pDoc.data();
    if (data.isSold || data.totalSoldQuantity > 0 || data.saleRecordId) {
      const qty = Number(data.quantityLiters || 0);
      console.log(`  - Resetting purchase doc ${pDoc.id} to unsold (quantity: ${qty}L)...`);
      await updateDoc(pDoc.ref, {
        isSold: false,
        totalSoldQuantity: 0,
        remainingQuantity: qty,
        status: 'pending',
        saleRecordId: null,
        wastageQuantity: 0,
        lossAmount: 0,
        updatedAt: Date.now(),
      });
    }
  }

  // 5. Verify all sales collections are now completely empty
  const verifyMilkSales = await getDocs(milkSalesColl);
  const verifyLegacySales = await getDocs(legacySalesColl);
  if (verifyMilkSales.size !== 0 || verifyLegacySales.size !== 0) {
    throw new Error(`Failed to remove all sales records! Remaining: milkSales=${verifyMilkSales.size}, sales=${verifyLegacySales.size}`);
  }
  console.log('\n[PASS] Verified: All Supply Sales collections are 100% empty (0 records).');

  // 6. Verify unrelated collections are 100% intact
  const supsPost = await getDocs(collection(db, 'users', USER_ID, 'suppliers'));
  const custsPost = await getDocs(collection(db, 'users', USER_ID, 'customers'));
  const octPurchasesPost = await getDocs(collection(db, 'users', USER_ID, 'supplierPurchases'));
  const octDeliveriesPost = await getDocs(collection(db, 'users', USER_ID, 'deliveries'));
  const monthlyBillsPost = await getDocs(collection(db, 'users', USER_ID, 'monthlyBills'));
  const paymentsPost = await getDocs(collection(db, 'users', USER_ID, 'payments'));

  console.log('\nPost-cleanup verification:');
  console.log(`  - suppliers: ${supsPost.size} (expected ${supsSnap.size})`);
  console.log(`  - customers: ${custsPost.size} (expected ${custsSnap.size})`);
  console.log(`  - supplierPurchases: ${octPurchasesPost.size} (expected ${octPurchasesSnap.size})`);
  console.log(`  - deliveries: ${octDeliveriesPost.size} (expected ${octDeliveriesSnap.size})`);
  console.log(`  - monthlyBills: ${monthlyBillsPost.size} (expected ${monthlyBillsSnap.size})`);
  console.log(`  - payments: ${paymentsPost.size} (expected ${paymentsSnap.size})`);

  if (
    supsPost.size !== supsSnap.size ||
    custsPost.size !== custsSnap.size ||
    octPurchasesPost.size !== octPurchasesSnap.size ||
    octDeliveriesPost.size !== octDeliveriesSnap.size ||
    monthlyBillsPost.size !== monthlyBillsSnap.size ||
    paymentsPost.size !== paymentsSnap.size
  ) {
    throw new Error('Integrity check failed: Unrelated collection counts changed!');
  }

  console.log('\n=== ALL UNRELATED DATA IS 100% INTACT AND VERIFIED! ===\n');
  process.exit(0);
}

removeSalesData().catch((err) => {
  console.error('Failed to remove sales data:', err);
  process.exit(1);
});

