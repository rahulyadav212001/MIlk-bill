import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function verifyDatabase() {
  console.log('--- Verifying Firestore Data against all Section 7 Criteria ---');
  let allPassed = true;

  // 1. Fetch collections
  const supSnap = await getDocs(collection(db, 'users', USER_ID, 'suppliers'));
  const custSnap = await getDocs(collection(db, 'users', USER_ID, 'customers'));
  const delSnap = await getDocs(collection(db, 'users', USER_ID, 'deliveries'));

  const suppliers = supSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  const customers = custSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  const deliveries = delSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

  // Check 1: Exactly 2 suppliers exist
  const supCountOk = suppliers.length === 2;
  console.log(`[Check 1] Exactly 2 suppliers exist: ${supCountOk ? 'PASS' : 'FAIL'} (${suppliers.length})`);
  if (!supCountOk) allPassed = false;

  // Check 2: Exactly 10 customers exist
  const custCountOk = customers.length === 10;
  console.log(`[Check 2] Exactly 10 customers exist: ${custCountOk ? 'PASS' : 'FAIL'} (${customers.length})`);
  if (!custCountOk) allPassed = false;

  // Check 3: All 10 customer names are unique
  const names = customers.map(c => c.name);
  const uniqueNames = new Set(names);
  const namesOk = uniqueNames.size === 10;
  console.log(`[Check 3] All 10 customer names are unique: ${namesOk ? 'PASS' : 'FAIL'} (${uniqueNames.size}/10)`);
  if (!namesOk) allPassed = false;

  // Check 4: All 10 phone numbers are unique
  const phones = customers.map(c => c.phone);
  const uniquePhones = new Set(phones);
  const phonesOk = uniquePhones.size === 10;
  console.log(`[Check 4] All 10 phone numbers are unique: ${phonesOk ? 'PASS' : 'FAIL'} (${uniquePhones.size}/10)`);
  if (!phonesOk) allPassed = false;

  // Check 5, 6, 7: Registration dates distribution
  const oct6Custs = customers.filter(c => c.deliveryStartDate === '2026-10-06');
  const oct16Custs = customers.filter(c => c.deliveryStartDate === '2026-10-16');
  const oct21Custs = customers.filter(c => c.deliveryStartDate === '2026-10-21');

  const oct6Ok = oct6Custs.length === 8;
  const oct16Ok = oct16Custs.length === 1;
  const oct21Ok = oct21Custs.length === 1;

  console.log(`[Check 5] Eight customers have Oct 6 registration dates: ${oct6Ok ? 'PASS' : 'FAIL'} (${oct6Custs.length})`);
  console.log(`[Check 6] One customer has an Oct 16 registration date: ${oct16Ok ? 'PASS' : 'FAIL'} (${oct16Custs.length})`);
  console.log(`[Check 7] One customer has an Oct 21 registration date: ${oct21Ok ? 'PASS' : 'FAIL'} (${oct21Custs.length})`);
  if (!oct6Ok || !oct16Ok || !oct21Ok) allPassed = false;

  // Check 8: All customers have different milk prices
  const prices = customers.map(c => c.pricePerLiter);
  const uniquePrices = new Set(prices);
  const pricesOk = uniquePrices.size === 10;
  console.log(`[Check 8] All customers have different milk prices: ${pricesOk ? 'PASS' : 'FAIL'} (${uniquePrices.size}/10 unique prices: ${Array.from(uniquePrices).join(', ')})`);
  if (!pricesOk) allPassed = false;

  // Check 9: All customer delivery quantities are valid
  const quantitiesOk = customers.every(c => typeof c.defaultDailyQuantity === 'number' && c.defaultDailyQuantity > 0);
  console.log(`[Check 9] All customer delivery quantities are valid (> 0): ${quantitiesOk ? 'PASS' : 'FAIL'}`);
  if (!quantitiesOk) allPassed = false;

  // Check 10: All daily amounts are mathematically correct
  const customerMap = new Map<string, any>(customers.map(c => [c.id, c]));
  let mathOk = true;
  let invalidMathCount = 0;
  for (const del of deliveries) {
    const cust = customerMap.get(del.customerId);
    if (!cust) {
      mathOk = false;
      invalidMathCount++;
      continue;
    }
    const expectedAmount = Number((del.actualQuantity * del.pricePerLiter).toFixed(2));
    if (Math.abs(del.amount - expectedAmount) > 0.001) {
      mathOk = false;
      invalidMathCount++;
    }
  }
  console.log(`[Check 10] All daily amounts are mathematically correct: ${mathOk ? 'PASS' : 'FAIL'} (${deliveries.length} checked, ${invalidMathCount} invalid)`);
  if (!mathOk) allPassed = false;

  // Check 11: Historical delivery records are associated with the correct customers
  const delCustIds = new Set(deliveries.map(d => d.customerId));
  let associationOk = true;
  for (const cid of delCustIds) {
    if (!customerMap.has(cid)) {
      associationOk = false;
      break;
    }
  }
  // Check exact counts per customer:
  // 8 customers starting Oct 6 => 26 days (Oct 6..31)
  // 1 customer starting Oct 16 => 16 days (Oct 16..31)
  // 1 customer starting Oct 21 => 11 days (Oct 21..31)
  let distributionOk = true;
  for (const cust of customers) {
    const custDeliveries = deliveries.filter(d => d.customerId === cust.id);
    let expectedDays = 26;
    if (cust.deliveryStartDate === '2026-10-16') expectedDays = 16;
    if (cust.deliveryStartDate === '2026-10-21') expectedDays = 11;

    if (custDeliveries.length !== expectedDays) {
      console.log(`Delivery count mismatch for ${cust.name}: expected ${expectedDays}, got ${custDeliveries.length}`);
      distributionOk = false;
    }
  }
  const delCheckOk = associationOk && distributionOk && deliveries.length === 235;
  console.log(`[Check 11] Deliveries associated with correct customers with expected day counts: ${delCheckOk ? 'PASS' : 'FAIL'} (Total ${deliveries.length})`);
  if (!delCheckOk) allPassed = false;

  console.log('\n=======================================');
  console.log(`FINAL RESULT: ${allPassed ? 'ALL SECTION 7 VALIDATION CHECKS PASSED ✅' : 'SOME CHECKS FAILED ❌'}`);
  console.log('=======================================');

  if (!allPassed) {
    process.exit(1);
  }
  process.exit(0);
}

verifyDatabase().catch((e) => {
  console.error('Verification error:', e);
  process.exit(1);
});
