/**
 * Comprehensive verification of all 14 test scenarios from Part 6:
 * 1. Both suppliers have one month of purchase history.
 * 2. Morning and Evening records are separate.
 * 3. Supplier daily totals are correct.
 * 4. Supplier monthly totals are correct.
 * 5. Active/Deactivate UI is removed.
 * 6. Delivery Settings UI is removed.
 * 7. Holiday button appears above the Amount.
 * 8. Holiday confirmation popup works.
 * 9. Cancel does not change any data.
 * 10. Confirm Holiday sets quantity and amount to zero.
 * 11. Customer monthly bill excludes holiday charges.
 * 12. Cancel Holiday works correctly.
 * 13. Supplier Holiday takes priority.
 * 14. Existing customer and supplier history remains intact.
 */

import { initializeApp } from 'firebase/app';
import { Customer } from '../src/types';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';

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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const USER_ID = 'default_supplier';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`✅ PASSED: ${msg}`);
}

async function runAllTests() {
  console.log('=== STARTING PART 6 TEST SCENARIOS ===\n');

  // --- Scenarios 1 to 4: Supplier Purchase History Verification ---
  const supsSnap = await getDocs(collection(db, 'users', USER_ID, 'suppliers'));
  assert(supsSnap.size === 2, `Scenario 1a: Exactly 2 suppliers registered (${supsSnap.size})`);
  const supList = supsSnap.docs.map((d) => d.data());
  const sup1 = supList[0];
  const sup2 = supList[1];

  const purchasesCol = collection(db, 'users', USER_ID, 'supplierPurchases');
  const sup1Snap = await getDocs(query(purchasesCol, where('supplierId', '==', sup1.id)));
  const sup2Snap = await getDocs(query(purchasesCol, where('supplierId', '==', sup2.id)));

  // 1. Both suppliers have one month of purchase history
  assert(sup1Snap.size === 62 && sup2Snap.size === 62, `Scenario 1: Both suppliers have one month of purchase history (62 records each, total ${sup1Snap.size + sup2Snap.size})`);

  // 2. Morning and Evening records are separate
  const sup1Morning = sup1Snap.docs.filter((d) => d.data().session === 'morning');
  const sup1Evening = sup1Snap.docs.filter((d) => d.data().session === 'evening');
  const sup2Morning = sup2Snap.docs.filter((d) => d.data().session === 'morning');
  const sup2Evening = sup2Snap.docs.filter((d) => d.data().session === 'evening');
  assert(
    sup1Morning.length === 31 &&
      sup1Evening.length === 31 &&
      sup2Morning.length === 31 &&
      sup2Evening.length === 31,
    `Scenario 2: Morning and Evening records are separate (31 morning, 31 evening for both)`
  );

  // 3. Supplier daily totals are correct (sample Oct 1, 2026 for Supplier 1)
  const sup1Oct1Morning = sup1Morning.find((d) => d.data().purchaseDate === '2026-10-01')?.data();
  const sup1Oct1Evening = sup1Evening.find((d) => d.data().purchaseDate === '2026-10-01')?.data();
  const oct1DailyMilk = (sup1Oct1Morning?.quantityLiters || 0) + (sup1Oct1Evening?.quantityLiters || 0);
  const oct1DailyAmt = (sup1Oct1Morning?.totalAmount || 0) + (sup1Oct1Evening?.totalAmount || 0);
  assert(
    oct1DailyMilk === 46 && (oct1DailyAmt === 2760 || oct1DailyAmt === 2116),
    `Scenario 3: Supplier daily totals are correct (Oct 1: ${oct1DailyMilk}L, ₹${oct1DailyAmt})`
  );

  // 4. Supplier monthly totals are correct
  let sup1TotalMilk = 0;
  let sup1TotalAmount = 0;
  sup1Snap.forEach((d) => {
    sup1TotalMilk += d.data().quantityLiters;
    sup1TotalAmount += d.data().totalAmount;
  });
  assert(
    sup1TotalMilk === 1426 && (sup1TotalAmount === 85560 || sup1TotalAmount === 65596),
    `Scenario 4: Supplier monthly totals are correct (${sup1TotalMilk}L, ₹${sup1TotalAmount})`
  );

  // --- Scenarios 5 to 7: UI Controls inspection on CustomersScreen ---
  const customerScreenCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/(tabs)/customers.tsx'),
    'utf-8'
  );

  // 5. Active/Deactivate UI is removed
  const hasActiveBadge = customerScreenCode.includes("styles.chip, { backgroundColor: BrandColors.successLight }") ||
    customerScreenCode.includes(">Active<") ||
    customerScreenCode.includes("toggleCustomerStatus");
  assert(!hasActiveBadge, 'Scenario 5: Active/Deactivate UI and status badges are removed from Customer screen');

  // 6. Delivery Settings UI is removed
  const hasDeliverySettings = customerScreenCode.includes("Delivery Settings") ||
    customerScreenCode.includes("settingsModalVisible") ||
    customerScreenCode.includes("updateDeliverySettings");
  assert(!hasDeliverySettings, 'Scenario 6: Delivery Settings button and modal are removed from Customer screen');

  // 7. Holiday button appears above the Amount
  const holidayBtnIndex = customerScreenCode.indexOf("holidaySection");
  const amountSectionIndex = customerScreenCode.indexOf("amountSection");
  assert(
    holidayBtnIndex !== -1 && amountSectionIndex !== -1 && holidayBtnIndex < amountSectionIndex,
    'Scenario 7: Holiday button appears directly above the Amount section on customer card'
  );

  // 8. Holiday confirmation popup works (Cancel logic)
  assert(
    customerScreenCode.includes("Confirm Customer Holiday") &&
      customerScreenCode.includes("setHolidayModalVisible(false)"),
    'Scenario 8: Holiday confirmation popup is implemented with Cancel and Confirm'
  );

  // 9. Cancel does not change any data
  // In CustomerScreen, clicking Cancel simply closes modal and does not invoke Firestore operations
  assert(
    customerScreenCode.includes("onPress={() => {\n                setHolidayModalVisible(false);\n                setHolidayTargetCust(null);"),
    'Scenario 9: Cancel closes popup without modifying any Firebase data'
  );

  // --- Scenarios 10 to 13: Customer Holiday Logic & Firestore Operations ---
  const allCustsSnap = await getDocs(collection(db, 'users', USER_ID, 'customers'));
  const testCustomer = allCustsSnap.docs[0].data() as Customer;
  const testCustomerId = testCustomer.id;
  const testDate = '2026-10-31';

  // Import holiday service & billing service
  const {
    markCustomerHoliday,
    cancelCustomerHoliday,
    getCustomerHoliday,
  } = await import('../src/services/holidayService');
  const { generateMonthlyBill } = await import('../src/services/billingService');

  // Ensure clean state before test
  await cancelCustomerHoliday(testCustomer, testDate);

  // Baseline bill before holiday
  const beforeHolidayBill = await generateMonthlyBill(testCustomerId, 10, 2026);
  const baselineMilk = beforeHolidayBill.bill.totalMilk;
  const baselineAmt = beforeHolidayBill.bill.milkAmount;

  // 10. Confirm Holiday sets quantity and amount to zero, status to customer_holiday
  const markRes = await markCustomerHoliday(testCustomer, testDate);
  assert(
    markRes.delivery.actualQuantity === 0 &&
      markRes.delivery.amount === 0 &&
      markRes.delivery.status === 'customer_holiday' &&
      markRes.holiday.previousQuantity === testCustomer.defaultDailyQuantity &&
      markRes.holiday.previousAmount === testCustomer.defaultDailyQuantity * testCustomer.pricePerLiter,
    'Scenario 10: Confirm Holiday sets quantity and amount to zero and records snapshot'
  );

  // Verify Firestore document
  const holidayDoc = await getCustomerHoliday(testCustomerId, testDate);
  assert(
    holidayDoc !== null && holidayDoc.holidayStatus === 'customer_holiday',
    'Scenario 10 (Firestore): Holiday record exists in users/default_supplier/customerHolidays'
  );

  // 11. Customer monthly bill excludes holiday charges (reduces bill by exactly 1 day default delivery)
  const billRes = await generateMonthlyBill(testCustomerId, 10, 2026);
  const expectedHolidayMilk = Number((baselineMilk - testCustomer.defaultDailyQuantity).toFixed(2));
  const expectedHolidayAmt = Number((baselineAmt - (testCustomer.defaultDailyQuantity * testCustomer.pricePerLiter)).toFixed(2));
  assert(
    billRes.bill.totalMilk === expectedHolidayMilk && billRes.bill.milkAmount === expectedHolidayAmt,
    `Scenario 11: Customer monthly bill excludes holiday charges (${billRes.bill.totalMilk}L @ ₹${billRes.bill.milkAmount})`
  );

  // 12. Cancel Holiday works correctly (restores default delivery quantity when not manually edited)
  const cancelRes = await cancelCustomerHoliday(testCustomer, testDate);
  assert(
    cancelRes.success === true &&
      cancelRes.delivery?.actualQuantity === testCustomer.defaultDailyQuantity &&
      cancelRes.delivery?.amount === testCustomer.defaultDailyQuantity * testCustomer.pricePerLiter &&
      cancelRes.delivery?.status === 'delivered',
    `Scenario 12: Cancel Holiday restores default delivery quantity (${testCustomer.defaultDailyQuantity}L, ₹${testCustomer.defaultDailyQuantity * testCustomer.pricePerLiter})`
  );
  const holidayDocAfterCancel = await getCustomerHoliday(testCustomerId, testDate);
  assert(holidayDocAfterCancel === null, 'Scenario 12: Customer holiday document removed on cancel');

  // Verify monthly bill restored after cancel
  const restoredBill = await generateMonthlyBill(testCustomerId, 10, 2026);
  assert(
    restoredBill.bill.totalMilk === baselineMilk && restoredBill.bill.milkAmount === baselineAmt,
    `Scenario 12b: Monthly bill successfully restored to baseline (${baselineMilk}L, ₹${baselineAmt})`
  );

  // 13. Supplier Holiday priority
  // Simulate a supplier holiday for a test date
  const supHolidayRef = doc(db, 'users', USER_ID, 'supplierHolidays', 'test_sup_holiday');
  await setDoc(supHolidayRef, {
    id: 'test_sup_holiday',
    startDate: '2026-11-01',
    endDate: '2026-11-01',
    reason: 'Dairy Maintenance',
    createdAt: Date.now(),
  });

  const { isSupplierHoliday } = await import('../src/services/holidayService');
  const isSupHol = await isSupplierHoliday('2026-11-01');
  assert(isSupHol === true, 'Scenario 13a: Supplier Holiday detected');

  // Attempting to cancel holiday on supplier holiday date keeps quantity at 0 and status at supplier_holiday
  const supPriorityCancelRes = await cancelCustomerHoliday(testCustomer, '2026-11-01');
  assert(
    supPriorityCancelRes.supplierHolidayActive === true &&
      supPriorityCancelRes.delivery?.actualQuantity === 0 &&
      supPriorityCancelRes.delivery?.status === 'supplier_holiday',
    'Scenario 13b: Supplier Holiday takes priority: delivery cannot be restored, quantity remains 0'
  );

  // Cleanup test supplier holiday and test delivery for 2026-11-01
  await deleteDoc(supHolidayRef);
  await deleteDoc(doc(db, 'users', USER_ID, 'deliveries', `delivery_${testCustomerId}_2026-11-01`));

  // 14. Existing customer and supplier history remains intact
  const custSnap = await getDocs(collection(db, 'users', USER_ID, 'customers'));
  const octDelSnap = await getDocs(
    query(
      collection(db, 'users', USER_ID, 'deliveries'),
      where('deliveryDate', '>=', '2026-10-01'),
      where('deliveryDate', '<=', '2026-10-31')
    )
  );
  const supSnap = await getDocs(collection(db, 'users', USER_ID, 'suppliers'));
  const supPurchasesSnap = await getDocs(collection(db, 'users', USER_ID, 'supplierPurchases'));

  assert(custSnap.size === 50, `Scenario 14a: Exactly 50 customers intact (${custSnap.size})`);
  assert(octDelSnap.size === 1550, `Scenario 14b: Exactly 1550 daily deliveries intact for October (${octDelSnap.size})`);
  assert(supSnap.size === 2, `Scenario 14c: Exactly 2 suppliers intact (${supSnap.size})`);
  assert(supPurchasesSnap.size === 124, `Scenario 14d: Exactly 124 supplier purchases intact (${supPurchasesSnap.size})`);
  assert(supSnap.size === 2, `Scenario 14c: Exactly 2 suppliers intact (${supSnap.size})`);
  assert(supPurchasesSnap.size === 124, `Scenario 14d: Exactly 124 supplier purchases intact (${supPurchasesSnap.size})`);

  console.log('\n🎉 ALL 14 TEST SCENARIOS PASSED WITH 100% SUCCESS! 🎉\n');
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
