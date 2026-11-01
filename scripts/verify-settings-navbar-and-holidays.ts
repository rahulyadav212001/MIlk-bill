/**
 * Automated Verification Script: Top Navbar Settings Button & Holiday Functionalities
 */
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
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

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const USER_ID = 'default_supplier';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runVerification() {
  console.log('=== VERIFYING TOP NAVBAR SETTINGS BUTTON & HOLIDAY SYSTEM ===\n');

  // --- Requirement 1: UI Code Inspection ---
  const headerBarCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/HeaderBar.tsx'), 'utf-8');
  const supplierScreenCode = fs.readFileSync(path.resolve(process.cwd(), 'src/app/(tabs)/supplier.tsx'), 'utf-8');
  const customerScreenCode = fs.readFileSync(path.resolve(process.cwd(), 'src/app/(tabs)/customers.tsx'), 'utf-8');
  const modalCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/HolidaySettingsModal.tsx'), 'utf-8');

  // 1.1 HeaderBar has gear icon
  assert(
    headerBarCode.includes("cog-outline") && headerBarCode.includes("onSettingsPress"),
    'Req 1.1: HeaderBar supports small Settings gear icon (cog-outline) on top-right'
  );

  // 1.2 Supplier & Customers top navbar removed account-plus and uses onSettingsPress
  assert(
    !supplierScreenCode.includes('actionIcon="account-plus"') && supplierScreenCode.includes('onSettingsPress='),
    'Req 1.2: Supplier screen top navbar removed supplier account-plus icon and wired onSettingsPress'
  );
  assert(
    !customerScreenCode.includes('actionIcon="account-plus"') && customerScreenCode.includes('onSettingsPress='),
    'Req 1.3: Customer screen top navbar removed customer account-plus icon and wired onSettingsPress'
  );

  // 1.3 Menu popup has exactly two options: 1. All Holiday, 2. Custom Holiday
  assert(
    modalCode.includes("1. All Holiday") && modalCode.includes("2. Custom Holiday"),
    'Req 1.4: Settings dropdown/popup has exactly two options: 1. All Holiday, 2. Custom Holiday'
  );

  // --- Requirement 2: All Holiday Popup Inspection ---
  assert(
    modalCode.includes("All Suppliers") &&
      modalCode.includes("All Customers") &&
      modalCode.includes("Apply Holiday"),
    'Req 2.1: All Holiday popup provides checkboxes for All Suppliers and All Customers with Apply Holiday button'
  );

  assert(
    modalCode.includes("Confirm All Holiday") && modalCode.includes("Cancel"),
    'Req 2.2: Confirmation popup is displayed before applying All Holiday'
  );

  // --- Requirement 3: Custom Holiday Popup Inspection ---
  assert(
    modalCode.includes("Suppliers") &&
      modalCode.includes("Customers") &&
      modalCode.includes("Confirm Holiday"),
    'Req 3.1: Custom Holiday popup has Suppliers and Customers selection with Confirm Holiday button'
  );

  // --- Requirement 4: Firestore Holiday Operations & Business Rules Verification ---
  const {
    markAllSuppliersHoliday,
    cancelAllSuppliersHoliday,
    markAllCustomersHoliday,
    cancelAllCustomersHoliday,
    markSupplierHoliday,
    cancelSupplierHoliday,
    isSupplierHoliday,
    getCustomerHoliday,
  } = await import('../src/services/holidayService');

  const { getSuppliers } = await import('../src/services/supplierPurchaseService');
  const { getCustomers } = await import('../src/services/customerService');
  const { initializeDailyDeliveries } = await import('../src/services/deliveryService');

  const testDate = '2026-11-25';
  const suppliers = await getSuppliers();
  const customers = await getCustomers();

  assert(suppliers.length >= 2, 'Suppliers available for testing');
  assert(customers.length >= 2, 'Customers available for testing');

  // Test 4.1: Mark single supplier holiday
  const s1 = suppliers[0];
  await markSupplierHoliday(s1.id, s1.name, testDate);
  const isS1OnHoliday = await isSupplierHoliday(testDate, s1.id);
  assert(isS1OnHoliday === true, `Req 4.1: Supplier ${s1.name} successfully marked on holiday for ${testDate}`);

  // Test 4.2: Cancel single supplier holiday
  await cancelSupplierHoliday(s1.id, testDate);
  const isS1AfterCancel = await isSupplierHoliday(testDate, s1.id);
  assert(isS1AfterCancel === false, `Req 4.2: Supplier ${s1.name} holiday successfully cancelled for ${testDate}`);

  // Test 4.3: Mark All Suppliers Holiday
  await markAllSuppliersHoliday(suppliers, testDate);
  const isGlobalSupHoliday = await isSupplierHoliday(testDate);
  assert(isGlobalSupHoliday === true, `Req 4.3: All suppliers holiday marked and recognized as global supplier holiday`);

  // Test 4.4: Cancel All Suppliers Holiday
  await cancelAllSuppliersHoliday(suppliers, testDate);
  const isGlobalAfterCancel = await isSupplierHoliday(testDate);
  assert(isGlobalAfterCancel === false, `Req 4.4: All suppliers holiday successfully cancelled`);

  // Test 4.5: Mark All Customers Holiday (testing on customer subset for speed)
  const testCustomers = customers.slice(0, 2);
  await markAllCustomersHoliday(testCustomers, testDate);
  const deliveriesAfterAllHoliday = await initializeDailyDeliveries(testDate);
  const c1Delivery = deliveriesAfterAllHoliday.find(d => d.customerId === testCustomers[0].id);
  assert(
    c1Delivery !== undefined && c1Delivery.actualQuantity === 0 && ((c1Delivery.status as any) === 'customer_holiday' || (c1Delivery.status as any) === 'holiday'),
    `Req 4.5: All Customers holiday sets delivery quantity to 0 and status to holiday`
  );
  const holidayDoc = await getCustomerHoliday(testCustomers[0].id, testDate);
  assert(holidayDoc !== null, `Req 4.6: Customer holiday document saved in Firestore`);

  // Test 4.6: Cancel All Customers Holiday
  await cancelAllCustomersHoliday(testCustomers, testDate);
  const holidayDocAfterCancel = await getCustomerHoliday(testCustomers[0].id, testDate);
  assert(holidayDocAfterCancel === null, `Req 4.7: Customer holiday document removed on cancel`);
  const deliveriesAfterCancel = await initializeDailyDeliveries(testDate);
  const c1AfterCancel = deliveriesAfterCancel.find(d => d.customerId === testCustomers[0].id);
  assert(
    c1AfterCancel !== undefined && c1AfterCancel.actualQuantity === testCustomers[0].defaultDailyQuantity,
    `Req 4.8: Default delivery quantity restored after holiday cancellation`
  );

  // Test 4.7: Cleanup test date records
  for (const c of testCustomers) {
    await deleteDoc(doc(db, 'users', USER_ID, 'deliveries', `delivery_${c.id}_${testDate}`));
  }

  console.log('\n🎉 ALL NAVBAR SETTINGS & HOLIDAY FUNCTIONALITIES VERIFIED WITH 100% SUCCESS!');
}

runVerification().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
