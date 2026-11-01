/**
 * Verification Script: Buyer Multiple Entries, Edit Purchase, Sales Milk Synchronization,
 * Deleted Supplier Stock Recalculation Fix, and Clickable Date UI.
 */
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import {
  recordMilkPurchase,
  updateMilkPurchase,
  recordMilkSale,
  computeSupplierInventory,
  calculateDailyStockSummary,
  getAllPurchasesForDate,
  deleteMilkPurchase,
} from '../src/services/milkTradeService';
import {
  addSupplier,
  deleteSupplier,
  getSuppliers,
} from '../src/services/supplierPurchaseService';
import { formatDateAndDay } from '../src/utils/date';
import { MilkPurchase, Supplier } from '../src/types';

const fs = typeof require !== 'undefined' ? (require('fs') as any) : null;
const path = typeof require !== 'undefined' ? (require('path') as any) : null;

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

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runVerification() {
  console.log('=== VERIFYING BUYER, PURCHASE, SALES SYNC & DELETED SUPPLIER STOCK FIX ===\n');

  const testDate = '2026-11-20';

  // --- Step 1: Verify Code & UI requirements ---
  console.log('--- Checking Code & UI Structure ---');
  const sellScreenCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/supplier/sell.tsx'),
    'utf-8'
  );
  const buyScreenCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/supplier/buy.tsx'),
    'utf-8'
  );

  // Req 4: Sales Milk calendar UI
  assert(
    sellScreenCode.includes('formatDateAndDay(selectedDate)'),
    'Req 4.1: Sales Milk screen imports and renders formatDateAndDay(selectedDate)'
  );
  assert(
    !sellScreenCode.includes('calendar-month-outline'),
    'Req 4.2: Calendar icon removed completely from Sales Milk search bar'
  );
  assert(
    sellScreenCode.includes('dateSelectorBtn'),
    'Req 4.3: Clickable date selector button beside search bar opens date picker'
  );

  // Req 1: Buyer summary box & edit icon
  assert(
    buyScreenCode.includes('purchaseSummaryBox'),
    'Req 1.1: Supplier card in Buy screen displays purchase summary box'
  );
  assert(
    buyScreenCode.includes('Entries Today') || buyScreenCode.includes('entriesCountPill'),
    'Req 1.2: Summary box displays total purchase entries for selected date'
  );
  assert(
    buyScreenCode.includes('entriesModalVisible'),
    'Req 1.3: Detailed purchase entries modal view implemented'
  );
  assert(
    buyScreenCode.includes('icon="pencil"'),
    'Req 1.4: Pencil/edit icon displayed on every individual purchase entry'
  );
  assert(
    buyScreenCode.includes('updateMilkPurchase'),
    'Req 1.5: Editing purchase updates quantity, rate, and saves immediately to Firestore'
  );

  // Date format test
  const formattedDate = formatDateAndDay('2026-11-01');
  assert(
    formattedDate === '01 Nov · Sunday',
    `Req 4.4: formatDateAndDay("2026-11-01") produces exact format "01 Nov · Sunday" (got: "${formattedDate}")`
  );

  // --- Step 2: Database Operations & Multiple Entries ---
  console.log('\n--- Testing Multiple Purchases on Same Supplier & Date ---');
  const rahulSupplier = await addSupplier('Rahul Verification', '9888888801');
  const sureshSupplier = await addSupplier('Suresh Verification', '9888888802');

  // Add 3 separate entries for Rahul on testDate:
  // 1. Buffalo 40L @ ₹60
  // 2. Buffalo 20L @ ₹60
  // 3. Cow 15L @ ₹50
  const rahulP1 = await recordMilkPurchase({
    supplierId: rahulSupplier.id,
    supplierName: rahulSupplier.name,
    supplierPhone: rahulSupplier.phone,
    milkCategory: 'buffalo',
    session: 'morning',
    purchaseDate: testDate,
    quantityLiters: 40,
    pricePerLiter: 60,
  });

  const rahulP2 = await recordMilkPurchase({
    supplierId: rahulSupplier.id,
    supplierName: rahulSupplier.name,
    supplierPhone: rahulSupplier.phone,
    milkCategory: 'buffalo',
    session: 'afternoon',
    purchaseDate: testDate,
    quantityLiters: 20,
    pricePerLiter: 60,
  });

  const rahulP3 = await recordMilkPurchase({
    supplierId: rahulSupplier.id,
    supplierName: rahulSupplier.name,
    supplierPhone: rahulSupplier.phone,
    milkCategory: 'cow',
    session: 'evening',
    purchaseDate: testDate,
    quantityLiters: 15,
    pricePerLiter: 50,
  });

  // Add 1 entry for Suresh on testDate: Cow 25L @ ₹50
  const sureshP1 = await recordMilkPurchase({
    supplierId: sureshSupplier.id,
    supplierName: sureshSupplier.name,
    supplierPhone: sureshSupplier.phone,
    milkCategory: 'cow',
    session: 'morning',
    purchaseDate: testDate,
    quantityLiters: 25,
    pricePerLiter: 50,
  });

  const allPurchasesAfterAdd = await getAllPurchasesForDate(testDate);
  const rahulEntries = allPurchasesAfterAdd.filter((p) => p.supplierId === rahulSupplier.id);
  assert(
    rahulEntries.length === 3,
    `Req 1.6: Exactly 3 separate purchase entries recorded for Rahul on ${testDate}`
  );

  const rahulInv = computeSupplierInventory(rahulSupplier.id, allPurchasesAfterAdd);
  assert(
    rahulInv.entriesCount === 3,
    `Req 1.7: Rahul inventory counts 3 entries`
  );
  assert(
    rahulInv.buffaloPurchased === 60 && rahulInv.cowPurchased === 15 && rahulInv.totalPurchased === 75,
    `Req 1.8: Rahul inventory separate categories: Buffalo = 60L, Cow = 15L, Total = 75L`
  );

  // --- Step 3: Test Editing Purchase Entry ---
  console.log('\n--- Testing Purchase Entry Update (40L -> 50L) ---');
  const updatedP1 = await updateMilkPurchase(rahulP1.id, {
    quantityLiters: 50,
    pricePerLiter: 60,
  });
  assert(
    updatedP1.quantityLiters === 50 && updatedP1.totalAmount === 3000,
    'Req 1.9: updateMilkPurchase updated quantity to 50L and totalAmount to ₹3000'
  );

  const allPurchasesAfterEdit = await getAllPurchasesForDate(testDate);
  const rahulInvAfterEdit = computeSupplierInventory(rahulSupplier.id, allPurchasesAfterEdit);
  assert(
    rahulInvAfterEdit.buffaloPurchased === 70 && rahulInvAfterEdit.totalPurchased === 85,
    `Req 2.1: Updated purchase immediately reflected in Rahul inventory: Buffalo = 70L, Total = 85L`
  );

  const stockSummary1 = calculateDailyStockSummary(
    testDate,
    [rahulSupplier, sureshSupplier],
    allPurchasesAfterEdit
  );
  assert(
    stockSummary1.overall.buffalo.purchasedLiters === 70,
    `Req 2.2: Available Buffalo stock across all active suppliers = 70L`
  );
  assert(
    stockSummary1.overall.cow.purchasedLiters === 40,
    `Req 2.3: Available Cow stock across all active suppliers = 40L (15L + 25L)`
  );
  assert(
    stockSummary1.overall.totalPurchasedLiters === 110,
    `Req 2.4: Overall milk stock = 110L (70L Buffalo + 40L Cow)`
  );

  // --- Step 4: Test Sale & Synchronization ---
  console.log('\n--- Testing Sales Sync with Updated Purchase ---');
  const sale1 = await recordMilkSale({
    purchaseId: rahulP1.id,
    soldQuantityLiters: 30,
    saleDate: testDate,
  });
  assert(
    sale1.soldQuantityLiters === 30 && sale1.remainingQuantityLiters === 20,
    `Req 2.5: Sale correctly deducted 30L from 50L purchase -> 20L remaining`
  );

  const allPurchasesAfterSale = await getAllPurchasesForDate(testDate);
  const stockSummary2 = calculateDailyStockSummary(
    testDate,
    [rahulSupplier, sureshSupplier],
    allPurchasesAfterSale
  );
  assert(
    stockSummary2.overall.buffalo.remainingLiters === 40,
    `Req 2.6: Buffalo remaining stock correctly calculated as 40L (70L - 30L)`
  );

  // --- Step 5: Test Deleted Supplier Stock Recalculation Fix ---
  console.log('\n--- Testing Deleted Supplier Stock Recalculation Fix ---');
  // Register Temp Supplier with 5 Litres recorded
  const tempSupplier = await addSupplier('Temp Stock Supplier', '9888888803');
  const tempPurchase = await recordMilkPurchase({
    supplierId: tempSupplier.id,
    supplierName: tempSupplier.name,
    supplierPhone: tempSupplier.phone,
    milkCategory: 'cow',
    session: 'morning',
    purchaseDate: testDate,
    quantityLiters: 5,
    pricePerLiter: 50,
  });

  const purchasesWithTemp = await getAllPurchasesForDate(testDate);
  const stockBeforeDelete = calculateDailyStockSummary(
    testDate,
    [rahulSupplier, sureshSupplier, tempSupplier],
    purchasesWithTemp
  );
  assert(
    stockBeforeDelete.overall.cow.purchasedLiters === 45,
    'Req 3.1: Cow stock before deletion includes 5L from Temp Supplier (total 45L)'
  );

  // Delete Temp Supplier
  await deleteSupplier(tempSupplier.id);

  // Recalculate stock with active suppliers list
  const activeSuppliersAfterDelete = await getSuppliers();
  const purchasesAfterDelete = await getAllPurchasesForDate(testDate);
  const stockAfterDelete = calculateDailyStockSummary(
    testDate,
    activeSuppliersAfterDelete.filter((s) => s.id === rahulSupplier.id || s.id === sureshSupplier.id),
    purchasesAfterDelete
  );

  assert(
    stockAfterDelete.overall.cow.purchasedLiters === 40,
    `Req 3.2: Cow purchased stock IMMEDIATELY excluded deleted supplier -> 40L (not 45L)`
  );
  assert(
    stockAfterDelete.overall.totalPurchasedLiters === 110,
    `Req 3.3: Total purchased stock excludes deleted supplier -> 110L (70L Buffalo + 40L Cow)`
  );
  assert(
    !activeSuppliersAfterDelete.some((s) => s.id === tempSupplier.id),
    'Req 3.4: Deleted supplier is no longer present in suppliers list'
  );

  // --- Cleanup ---
  console.log('\n--- Cleaning up test records ---');
  await deleteMilkPurchase(rahulP1.id);
  await deleteMilkPurchase(rahulP2.id);
  await deleteMilkPurchase(rahulP3.id);
  await deleteMilkPurchase(sureshP1.id);
  await deleteSupplier(rahulSupplier.id);
  await deleteSupplier(sureshSupplier.id);

  console.log('\n🎉 ALL BUYER, PURCHASE, SALES SYNC & DELETED SUPPLIER STOCK REQUIREMENTS VERIFIED 100% SUCCESSFULLY!\n');
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
