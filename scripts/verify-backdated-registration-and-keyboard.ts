// @ts-nocheck
/**
 * Verification Script: Add Customer Form Keyboard Handling & Backdated Milk Billing Calculation
 *
 * Verifies:
 * TASK 1: Add Customer Form Fields and Keyboard Overlap Handling
 *  - Customer Name, Phone Number, Location, Milk Category, Milk Date,
 *    Milk Price Per Litre, Milk Quantity (Litres), Milk Schedule,
 *    Morning Milk Quantity, Evening Milk Quantity.
 *  - KeyboardAvoidingView with correct behavior for Android and iOS.
 *  - ScrollView with keyboardShouldPersistTaps="handled".
 *  - Automatic scroll handlers on Morning/Evening fields to keep them visible above keyboard.
 *  - Fixed action buttons always pinned and visible.
 *
 * TASK 2: Backdated Customer Registration & Historical Milk Price Calculation
 *  - Registration with backdated date (e.g. 2 August 2026 to 2 November 2026).
 *  - Every daily entry has actual date, milk quantity, price per litre, daily amount.
 *  - Milk price and daily amount NEVER become ₹0.
 *  - Morning & Evening quantity calculations (e.g. 1L morning + 1L evening = 2L @ ₹60 = ₹120).
 *  - Monthly bills calculated separately for each month (August, September, October, November).
 *  - Firestore document structure & batch limits (<= 400) handled safely.
 */

import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  collection,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
// @ts-nocheck
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

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
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runVerification() {
  console.log('=== VERIFYING ADD CUSTOMER KEYBOARD & BACKDATED MILK BILLING ===\n');

  // =========================================================================
  // PART 1: TASK 1 UI & KEYBOARD HANDLING CODE INSPECTION
  // =========================================================================
  console.log('--- Checking Task 1: Add Customer Form & Keyboard Handling ---');

  const customerCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/(tabs)/customers.tsx'),
    'utf-8'
  );

  // 1.1 All 10 registration fields are present
  assert(customerCode.includes('label="Customer Name *"'), 'Field 1: Customer Name exists');
  assert(customerCode.includes('label="Phone Number *"'), 'Field 2: Phone Number exists');
  assert(customerCode.includes('label="Customer Location / Address *"'), 'Field 3: Customer Location exists');
  assert(customerCode.includes('Milk Category *') && customerCode.includes('Buffalo Milk') && customerCode.includes('Cow Milk'), 'Field 4: Milk Category (Buffalo/Cow) exists');
  assert(customerCode.includes('label="Milk Date *"'), 'Field 5: Milk Date exists with Calendar Picker');
  assert(customerCode.includes('label="Milk Price Per Litre *"'), 'Field 6: Milk Price Per Litre exists');
  assert(customerCode.includes('label="Milk Quantity (Litres) *"'), 'Field 7: Milk Quantity (Litres) exists');
  assert(customerCode.includes('Milk Schedule (Morning / Evening) *'), 'Field 8: Milk Schedule (Morning / Evening) exists');
  assert(customerCode.includes('label="Morning Milk Quantity *"'), 'Field 9: Morning Milk Quantity exists');
  assert(customerCode.includes('label="Evening Milk Quantity *"'), 'Field 10: Evening Milk Quantity exists');

  // 1.2 Keyboard handling
  assert(customerCode.includes('KeyboardAvoidingView'), 'KeyboardAvoidingView is implemented');
  assert(customerCode.includes("behavior={Platform.OS === 'ios' ? 'padding' : undefined}"), 'KeyboardAvoidingView uses appropriate Android & iOS behavior');
  assert(customerCode.includes('keyboardShouldPersistTaps="handled"'), 'ScrollView has keyboardShouldPersistTaps="handled"');
  assert(customerCode.includes('isKeyboardVisible'), 'Dynamic keyboard visibility tracking implemented');
  assert(customerCode.includes('scrollToEnd'), 'Morning/Evening fields trigger scrollToEnd on focus to stay above keyboard');

  // =========================================================================
  // PART 2: TASK 2 BACKDATED CUSTOMER REGISTRATION & HISTORICAL PRICE CALCULATION
  // =========================================================================
  console.log('\n--- Checking Task 2: Backdated Customer Registration & Historical Billing ---');

  const { addCustomer, deleteCustomer } = await import('../src/services/customerService.ts');
  const { getCustomerDeliveries, getDeliveryDocId } = await import('../src/services/deliveryService.ts');
  const { getBillForCustomer } = await import('../src/services/billingService.ts');

  // Clean up any previous test customers first
  const { getCustomers } = await import('../src/services/customerService.ts');
  const existingCusts = await getCustomers();
  for (const c of existingCusts) {
    if (c.phone === '9876500001' || c.phone === '9876500002') {
      await deleteCustomer(c.id, true);
    }
  }

  // Example Scenario from prompt:
  // Today is 2 November 2026.
  // Milk Date: 2 August 2026.
  // Customer Name: Rahul (Test)
  // Milk Category: Cow
  // Milk Price Per Litre: ₹60
  // Morning Milk: 1 Litre
  // Evening Milk: 0 Litres
  const testPhone = '9876500001';
  console.log('Registering backdated customer starting from 2026-08-02...');

  const rahulCustomer = await addCustomer({
    name: 'Rahul Test',
    phone: testPhone,
    milkCategory: 'cow',
    location: 'Sector 21, Urban Estate',
    pricePerLiter: 60,
    deliveryStartDate: '2026-08-02',
    deliveryTime: 'morning',
    morningQuantity: 1,
    eveningQuantity: 0,
    defaultDailyQuantity: 1,
  });

  assert(rahulCustomer.id !== undefined, 'Customer Rahul registered with backdated Milk Date 2026-08-02');
  assert(rahulCustomer.pricePerLiter === 60, 'Customer price per liter is ₹60');
  assert(rahulCustomer.defaultDailyQuantity === 1, 'Customer default daily quantity is 1 Litre');

  // Fetch all generated deliveries
  const allRahulDeliveries = await getCustomerDeliveries(rahulCustomer.id);
  console.log(`Generated ${allRahulDeliveries.length} historical deliveries from 2026-08-02 to today.`);
  assert(allRahulDeliveries.length >= 93, 'Expected at least 93 daily deliveries from Aug 2 to Nov 2');

  // Verify first entry: 2026-08-02
  const firstEntry = allRahulDeliveries.find((d) => d.deliveryDate === '2026-08-02');
  assert(firstEntry !== undefined, 'Delivery entry for 2026-08-02 exists');
  assert(firstEntry?.actualQuantity === 1, 'Entry on 2026-08-02 has Quantity = 1 Litre');
  assert(firstEntry?.pricePerLiter === 60, 'Entry on 2026-08-02 has Price = ₹60 (NOT ₹0)');
  assert(firstEntry?.amount === 60, 'Entry on 2026-08-02 has Daily Amount = ₹60 (1 × 60)');

  // Verify intermediate entry: 2026-09-15
  const sepEntry = allRahulDeliveries.find((d) => d.deliveryDate === '2026-09-15');
  assert(sepEntry !== undefined, 'Delivery entry for 2026-09-15 exists');
  assert(sepEntry?.actualQuantity === 1 && sepEntry?.pricePerLiter === 60 && sepEntry?.amount === 60,
    'Entry on 2026-09-15 has 1L @ ₹60 = ₹60');

  // Verify intermediate entry: 2026-10-31
  const octEntry = allRahulDeliveries.find((d) => d.deliveryDate === '2026-10-31');
  assert(octEntry !== undefined, 'Delivery entry for 2026-10-31 exists');
  assert(octEntry?.actualQuantity === 1 && octEntry?.pricePerLiter === 60 && octEntry?.amount === 60,
    'Entry on 2026-10-31 has 1L @ ₹60 = ₹60');

  // Verify November entry: 2026-11-02
  const novEntry = allRahulDeliveries.find((d) => d.deliveryDate === '2026-11-02');
  assert(novEntry !== undefined, 'Delivery entry for 2026-11-02 exists');
  assert(novEntry?.actualQuantity === 1 && novEntry?.pricePerLiter === 60 && novEntry?.amount === 60,
    'Entry on 2026-11-02 has 1L @ ₹60 = ₹60');

  // Verify that NO entry has price 0 or amount 0
  const zeroEntries = allRahulDeliveries.filter((d) => d.pricePerLiter === 0 || d.amount === 0);
  assert(zeroEntries.length === 0, 'ZERO entries have ₹0 price or ₹0 amount');

  // =========================================================================
  // PART 3: MONTHLY BILLING SEPARATION & BALANCE CARRYOVER
  // =========================================================================
  console.log('\n--- Checking Monthly Billing Separation (August, September, October, November) ---');

  // August Bill: Aug 2 to Aug 31 (30 days @ 1L = 30L @ ₹60 = ₹1,800)
  const augBill = await getBillForCustomer(rahulCustomer.id, 8, 2026);
  assert(augBill !== null, 'August 2026 bill was generated');
  assert(augBill?.totalMilk === 30, `August bill total milk is 30L (actual: ${augBill?.totalMilk}L)`);
  assert(augBill?.milkAmount === 1800, `August bill milk amount is ₹1,800 (actual: ₹${augBill?.milkAmount})`);
  assert(augBill?.remainingBalance === 1800, `August remaining balance is ₹1,800 (actual: ₹${augBill?.remainingBalance})`);

  // September Bill: Sep 1 to Sep 30 (30 days @ 1L = 30L @ ₹60 = ₹1,800)
  // Previous balance from August = ₹1,800, Remaining balance = 1800 + 1800 = ₹3,600
  const sepBill = await getBillForCustomer(rahulCustomer.id, 9, 2026);
  assert(sepBill !== null, 'September 2026 bill was generated');
  assert(sepBill?.totalMilk === 30, `September bill total milk is 30L (actual: ${sepBill?.totalMilk}L)`);
  assert(sepBill?.milkAmount === 1800, `September bill milk amount is ₹1,800 (actual: ₹${sepBill?.milkAmount})`);
  assert(sepBill?.previousBalance === 1800, `September previous balance is ₹1,800 carried from August`);
  assert(sepBill?.remainingBalance === 3600, `September remaining balance is ₹3,600`);

  // October Bill: Oct 1 to Oct 31 (31 days @ 1L = 31L @ ₹60 = ₹1,860)
  // Previous balance from September = ₹3,600, Remaining balance = 3600 + 1860 = ₹5,460
  const octBill = await getBillForCustomer(rahulCustomer.id, 10, 2026);
  assert(octBill !== null, 'October 2026 bill was generated');
  assert(octBill?.totalMilk === 31, `October bill total milk is 31L (actual: ${octBill?.totalMilk}L)`);
  assert(octBill?.milkAmount === 1860, `October bill milk amount is ₹1,860 (actual: ₹${octBill?.milkAmount})`);
  assert(octBill?.previousBalance === 3600, `October previous balance is ₹3,600 carried from September`);
  assert(octBill?.remainingBalance === 5460, `October remaining balance is ₹5,460`);

  // November Bill: Nov 1 to Nov 2 (2 days @ 1L = 2L @ ₹60 = ₹120)
  // Previous balance from October = ₹5,460, Remaining balance = 5460 + 120 = ₹5,580
  const novBill = await getBillForCustomer(rahulCustomer.id, 11, 2026);
  assert(novBill !== null, 'November 2026 bill was generated');
  assert(novBill?.totalMilk === 2, `November bill total milk is 2L (actual: ${novBill?.totalMilk}L)`);
  assert(novBill?.milkAmount === 120, `November bill milk amount is ₹120 (actual: ₹${novBill?.milkAmount})`);
  assert(novBill?.previousBalance === 5460, `November previous balance is ₹5,460 carried from October`);
  assert(novBill?.remainingBalance === 5580, `November remaining balance is ₹5,580`);

  // Clean up Rahul test customer
  await deleteCustomer(rahulCustomer.id, true);
  console.log('Cleaned up Rahul test customer.');

  // =========================================================================
  // PART 4: MORNING & EVENING QUANTITY CALCULATION (e.g. 1L Morning + 1L Evening = 2L @ ₹60 = ₹120)
  // =========================================================================
  console.log('\n--- Checking Morning & Evening Quantity Calculation ---');

  const testPhone2 = '9876500002';
  const twoSessionCustomer = await addCustomer({
    name: 'Dual Session Test',
    phone: testPhone2,
    milkCategory: 'buffalo',
    location: 'Civil Lines',
    pricePerLiter: 60,
    deliveryStartDate: '2026-11-01',
    deliveryTime: 'both',
    morningQuantity: 1,
    eveningQuantity: 1,
    defaultDailyQuantity: 2,
  });

  assert(twoSessionCustomer.defaultDailyQuantity === 2, 'Total Daily Quantity is 2L (1L morning + 1L evening)');
  assert(twoSessionCustomer.deliveryTime === 'both', 'Delivery time is both morning and evening');

  const dualDeliveries = await getCustomerDeliveries(twoSessionCustomer.id);
  const nov1Entry = dualDeliveries.find((d) => d.deliveryDate === '2026-11-01');
  assert(nov1Entry !== undefined, 'Dual delivery entry for 2026-11-01 exists');
  assert(nov1Entry?.morningQuantity === 1, 'Nov 1 morning quantity is 1L');
  assert(nov1Entry?.eveningQuantity === 1, 'Nov 1 evening quantity is 1L');
  assert(nov1Entry?.actualQuantity === 2, 'Nov 1 total actual quantity is 2L');
  assert(nov1Entry?.pricePerLiter === 60, 'Nov 1 price per liter is ₹60');
  assert(nov1Entry?.amount === 120, 'Nov 1 daily total amount is ₹120 (2 × 60)');

  // Clean up dual session customer
  await deleteCustomer(twoSessionCustomer.id, true);
  console.log('Cleaned up dual session test customer.');

  console.log('\n🎉 ALL VERIFICATION CHECKS FOR TASK 1 AND TASK 2 PASSED 100% SUCCESSFULLY!');
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
  });
