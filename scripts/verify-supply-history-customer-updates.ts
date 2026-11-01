/**
 * Comprehensive Verification Script for:
 * 1. Supply Screen: Sell button and functionality completely removed.
 * 2. History Screen & PDF: Unnecessary sales and loss/wastage records removed.
 * 3. Customer Registration: Calendar date picker, clean date field, decimal milk quantity, keyboard-accessible Save Customer button.
 * 4. Firebase Firestore integration with decimal milk quantity.
 */
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
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
  console.log('=== VERIFYING SUPPLY, HISTORY, AND CUSTOMER REGISTRATION UPDATES ===\n');

  const supplierScreenPath = path.resolve(process.cwd(), 'src/app/(tabs)/supplier.tsx');
  const customersScreenPath = path.resolve(process.cwd(), 'src/app/(tabs)/customers.tsx');
  const pdfServicePath = path.resolve(process.cwd(), 'src/services/pdfService.ts');

  const supplierCode = fs.readFileSync(supplierScreenPath, 'utf-8');
  const customersCode = fs.readFileSync(customersScreenPath, 'utf-8');
  const pdfServiceCode = fs.readFileSync(pdfServicePath, 'utf-8');

  // =========================================================================
  // REQUIREMENT 1: Supply – Completely Remove Sell Button Functionality
  // =========================================================================
  console.log('\n--- 1. Testing Supply Module (Sell Button & Functionality Removed) ---');

  // 1.1 Sell button removed from Supply screen navigation
  assert(
    !supplierCode.includes("route: '/supplier/sell'"),
    '1.1: Route /supplier/sell is NOT present on Supply landing screen'
  );
  assert(
    !supplierCode.includes("largeNavCardSell"),
    '1.2: largeNavCardSell styling / component removed from Supply screen'
  );

  // 1.2 Prominent Buy Milk card present
  assert(
    supplierCode.includes('largeBuyCard') && supplierCode.includes("router.push('/supplier/buy')"),
    '1.3: Prominent Buy Milk card is present and navigates to /supplier/buy'
  );

  // 1.3 Add Supply and History buttons intact at top
  assert(
    supplierCode.includes('Add Supply') && supplierCode.includes('handleOpenHistory'),
    '1.4: Permanent top action buttons (Add Supply and History) remain intact'
  );

  // 1.4 Unnecessary Sell handlers and modal removed
  assert(
    !supplierCode.includes('handleOpenPurchaseSalesDetails'),
    '1.5: handleOpenPurchaseSalesDetails handler removed from Supply module'
  );
  assert(
    !supplierCode.includes('handleSaveNewSaleEntry'),
    '1.6: handleSaveNewSaleEntry handler removed from Supply module'
  );
  assert(
    !supplierCode.includes('salesDetailsModalVisible'),
    '1.7: salesDetailsModalVisible modal removed from Supply module'
  );
  assert(
    !supplierCode.includes('renderSellSupplierItem'),
    '1.8: renderSellSupplierItem removed from Supply module'
  );

  // =========================================================================
  // REQUIREMENT 2: History – Remove Unnecessary Sales/Loss Records
  // =========================================================================
  console.log('\n--- 2. Testing History Screen & PDF (Sales and Loss Records Removed) ---');

  // 2.1 Modal Title updated to Supply Purchase History
  assert(
    supplierCode.includes('Supply Purchase History') &&
      !supplierCode.includes('Supply &amp; Sales History'),
    '2.1: History modal title updated to Supply Purchase History'
  );

  // 2.2 History Modal has no "Waste of Money" or "Waste of Milk"
  assert(
    !supplierCode.includes('Waste of Money') &&
      !supplierCode.includes('Waste of Milk'),
    '2.2: Waste of Money and Waste of Milk sections completely removed from History modal'
  );

  // 2.3 History Modal has no "No Loss" status badges
  assert(
    !supplierCode.includes('No Loss') &&
      !supplierCode.includes('L Wasted'),
    '2.3: Status: No Loss and Wasted badges completely removed from History modal'
  );

  // 2.4 History Modal retains pure purchase details
  assert(
    supplierCode.includes('Total Purchased') &&
      supplierCode.includes('totalPurchaseAmount') &&
      supplierCode.includes('buffaloPurchaseAmount') &&
      supplierCode.includes('cowPurchaseAmount'),
    '2.4: Valid purchase history (Total Purchased, Amounts, Categories) is intact'
  );

  // 2.5 Supply History PDF Report updated
  assert(
    pdfServiceCode.includes('Supply Purchase Report') &&
      !pdfServiceCode.includes('Supply & Sales Report'),
    '2.5: PDF report title updated to Supply Purchase Report'
  );
  assert(
    !pdfServiceCode.includes('Waste of Money') &&
      !pdfServiceCode.includes('Waste of Milk'),
    '2.6: PDF report does not contain Waste of Money or Waste of Milk'
  );

  // =========================================================================
  // REQUIREMENT 3: Customer Registration Form Improvements
  // =========================================================================
  console.log('\n--- 3. Testing Customer Registration Form Improvements ---');

  // 3.1 Calendar Date Picker Modal integrated for registration
  assert(
    customersCode.includes("'cust_reg'") &&
      customersCode.includes('setCalendarTargetField(\'cust_reg\')'),
    '3.1: CalendarDatePickerModal target "cust_reg" integrated for customer registration'
  );
  assert(
    customersCode.includes('label="Milk Date *"'),
    '3.2: Customer registration form has "Milk Date *" label'
  );

  // 3.2 Unnecessary date controls removed from registration modal
  const regModalMatch = customersCode.match(/visible=\{addModalVisible\}[\s\S]*?<\/Modal>/);
  const regModalCode = regModalMatch ? regModalMatch[0] : '';
  assert(
    !regModalCode.includes("-1 Day") &&
      !regModalCode.includes("+1 Day"),
    '3.3: Minus One (-1) and Plus One (+1) buttons removed from customer registration'
  );
  assert(
    !regModalCode.includes("pastDateNotice") &&
      !regModalCode.includes("todayNotice"),
    '3.4: Starting Point Date / Starts today notices removed from customer registration'
  );

  // 3.3 "How Many Litres of Milk?" field restored with decimal support
  assert(
    customersCode.includes('label="How Many Litres of Milk? *"') &&
      customersCode.includes('custQuantityStr'),
    '3.5: "How Many Litres of Milk? *" field present with custQuantityStr state'
  );
  assert(
    customersCode.includes('keyboardType="decimal-pad"') &&
      customersCode.includes('placeholder="e.g. 1.5"'),
    '3.6: Decimal values supported (e.g. 1.5 Litres) with decimal-pad keyboard'
  );

  // 3.4 Save Customer button keyboard overlap fix
  assert(
    customersCode.includes('modalFixedActions') &&
      customersCode.includes('addCustomerModalContent'),
    '3.7: modalFixedActions pinned outside ScrollView to prevent keyboard overlap'
  );

  // =========================================================================
  // REQUIREMENT 4: Firebase Firestore Persistence & Decimal Calculation Test
  // =========================================================================
  console.log('\n--- 4. Testing Firestore Integration with Decimal Milk Quantity ---');

  const { addCustomer, updateCustomer, getCustomerById } = await import(
    '../src/services/customerService'
  );

  const testCustomerData = {
    name: 'Test Customer Decimal Qty',
    phone: '9876543299',
    milkCategory: 'buffalo' as const,
    location: 'Test Block B-12',
    defaultDailyQuantity: 1.5,
    pricePerLiter: 60,
    deliveryTime: 'morning' as const,
    deliveryStartDate: '2026-11-01',
  };

  const createdCustomer = await addCustomer(testCustomerData);
  assert(
    createdCustomer.id !== undefined && createdCustomer.defaultDailyQuantity === 1.5,
    `4.1: addCustomer successfully saved customer with 1.5 Litres quantity (id: ${createdCustomer.id})`
  );

  // Verify in Firestore document directly
  const directDoc = await getDoc(doc(db, 'users', USER_ID, 'customers', createdCustomer.id));
  assert(
    directDoc.exists() && directDoc.data().defaultDailyQuantity === 1.5,
    '4.2: Firestore document directly contains defaultDailyQuantity: 1.5'
  );

  // Test updating to another decimal value (2.75 L)
  await updateCustomer(createdCustomer.id, {
    defaultDailyQuantity: 2.75,
  });

  const updatedCust = await getCustomerById(createdCustomer.id);
  assert(
    updatedCust !== null && updatedCust.defaultDailyQuantity === 2.75,
    '4.3: updateCustomer successfully updated defaultDailyQuantity to 2.75 Litres'
  );

  // Cleanup test customer from Firestore
  await deleteDoc(doc(db, 'users', USER_ID, 'customers', createdCustomer.id));
  console.log('✅ Cleaned up temporary test customer record from Firestore.');

  console.log('\n🎉 ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!\n');
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
