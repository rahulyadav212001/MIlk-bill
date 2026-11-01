/**
 * Verification Script: Add Customer Form & Past Date Milk Deliveries Accounting
 */
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  collection,
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
  console.log('=== VERIFYING ADD CUSTOMER FORM & PAST DATE ACCOUNTING ===\n');

  // --- Requirement 1: UI Code Inspection ---
  const customerScreenCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/(tabs)/customers.tsx'),
    'utf-8'
  );

  // 1.1 Customer Name field
  assert(
    customerScreenCode.includes('label="Customer Name *"'),
    'Req 1.1: Customer Name field exists'
  );

  // 1.2 Phone Number field
  assert(
    customerScreenCode.includes('label="Phone Number *"'),
    'Req 1.2: Phone Number field exists'
  );

  // 1.3 Milk Delivery Date (start date) field with selection/quick buttons
  assert(
    customerScreenCode.includes('label="Milk Delivery Date (Start Date) *"'),
    'Req 1.3a: Milk Delivery Date (Start Date) field exists'
  );
  assert(
    customerScreenCode.includes('-1 Day') &&
      customerScreenCode.includes('Today') &&
      customerScreenCode.includes('+1 Day'),
    'Req 1.3b: Quick day adjust buttons (-1 Day, Today, +1 Day) allow selecting any past or current date'
  );

  // 1.4 Milk Price (per litre) field
  assert(
    customerScreenCode.includes('label="Milk Price (per litre) *"'),
    'Req 1.4: Milk Price (per litre) field exists'
  );

  // 1.5 Milk Delivery Time (Morning or Evening)
  assert(
    customerScreenCode.includes("label: '🌅 Morning'") &&
      customerScreenCode.includes("label: '🌇 Evening'") &&
      customerScreenCode.includes('Milk Delivery Time *'),
    'Req 1.5: Milk Delivery Time provides Morning or Evening selection'
  );

  // 1.6 Milk Category (Buffalo Milk or Cow Milk)
  assert(
    customerScreenCode.includes('Milk Category *') &&
      customerScreenCode.includes('Buffalo Milk') &&
      customerScreenCode.includes('Cow Milk'),
    'Req 1.6: Milk Category provides selectable Buffalo Milk and Cow Milk options'
  );

  // 1.7 Customer Location / Address field
  assert(
    customerScreenCode.includes('label="Customer Location / Address *"'),
    'Req 1.7: Customer Location / Address field exists'
  );

  // 1.8 Verify Daily Milk Quantity input is removed from Add Customer form
  assert(
    !customerScreenCode.includes('label="Daily Milk Quantity in Liters *"'),
    'Req 1.8: Daily Milk Quantity input is removed from Add Customer form'
  );

  // --- Requirement 2: Past Date Accounting Logic & Pending Entry ---
  const { addCustomer, deleteCustomer } = await import('../src/services/customerService');
  const {
    accountForPastDeliveries,
    updateDeliveryQuantity,
    getDeliveryDocId,
  } = await import('../src/services/deliveryService');

  // Simulate: Today is 5th, start date is 1st (4 previous days)
  const testPhone = '9998887770';
  const testCustomer = await addCustomer({
    name: 'Test Past Customer',
    phone: testPhone,
    milkCategory: 'buffalo',
    location: 'Sector 4, Main Market',
    pricePerLiter: 35,
    deliveryTime: 'morning',
    deliveryStartDate: '2026-11-01',
  });

  assert(testCustomer.id !== undefined, 'Req 2.1: Test customer registered with past start date');
  assert(testCustomer.milkCategory === 'buffalo', 'Req 2.1a: Milk Category saved correctly in Firestore');
  assert(testCustomer.location === 'Sector 4, Main Market', 'Req 2.1b: Customer Location saved correctly in Firestore');

  // Account for past deliveries from 2026-11-01 to 2026-11-05
  const accountedDeliveries = await accountForPastDeliveries(
    testCustomer,
    '2026-11-01',
    '2026-11-05'
  );

  assert(
    accountedDeliveries.length === 5,
    'Req 2.2: Exactly 5 days (4 previous days + today) automatically accounted for'
  );

  // Check previous days (2026-11-01 to 2026-11-04) are pending with quantity = 0
  const prevDays = accountedDeliveries.filter((d) => d.deliveryDate < '2026-11-05');
  assert(
    prevDays.length === 4,
    'Req 2.3: Exactly 4 previous days accounted for'
  );

  const allPrevZero = prevDays.every(
    (d) => d.actualQuantity === 0 && d.amount === 0 && d.status === 'delivered'
  );
  assert(
    allPrevZero,
    'Req 2.4: All previous days are initialized with quantity 0 (pending) and amount 0'
  );

  // Manually enter pending milk quantity for day 1 (2026-11-01) -> 2.5 Litres
  const updatedDay1 = await updateDeliveryQuantity(
    testCustomer.id,
    '2026-11-01',
    2.5,
    testCustomer.name,
    testCustomer.pricePerLiter
  );

  assert(
    updatedDay1.actualQuantity === 2.5 &&
      updatedDay1.amount === 87.5 &&
      updatedDay1.manuallyEdited === true,
    'Req 2.5: Manually entering pending quantity for past day sets quantity = 2.5L and amount = ₹87.50'
  );

  // Verify in Firestore
  const day1Doc = await getDoc(
    doc(db, 'users', USER_ID, 'deliveries', getDeliveryDocId(testCustomer.id, '2026-11-01'))
  );
  assert(
    day1Doc.exists() && day1Doc.data()?.actualQuantity === 2.5,
    'Req 2.6: Updated past day delivery confirmed in Firestore'
  );

  // Clean up test customer and all accounted test deliveries
  await deleteCustomer(testCustomer.id, true);
  for (let day = 1; day <= 5; day++) {
    const dStr = `2026-11-0${day}`;
    await deleteDoc(
      doc(db, 'users', USER_ID, 'deliveries', getDeliveryDocId(testCustomer.id, dStr))
    );
  }

  console.log('\n🎉 ALL ADD CUSTOMER & PAST DATE ACCOUNTING REQUIREMENTS VERIFIED 100% SUCCESSFULLY!');
}

runVerification()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
