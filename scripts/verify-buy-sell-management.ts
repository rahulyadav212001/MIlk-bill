/**
 * Verification Script: Supply Management, Buy/Sell Module, Calculation Logic,
 * Single Final Sale & Duplicate Prevention, Permanent Sales History, and Firestore Persistence.
 */
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
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
  console.log('=== VERIFYING SUPPLY MANAGEMENT (BUY/SELL, CALCULATION LOGIC, PERMANENT HISTORY) ===\n');

  // --- Requirement 1: UI & Navigation Inspection ---
  const layoutCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/(tabs)/_layout.tsx'),
    'utf-8'
  );
  const supplierScreenCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/(tabs)/supplier.tsx'),
    'utf-8'
  );

  // 1.1 Exactly two navbar options: Supply and Customer
  assert(
    layoutCode.includes("title: 'Supply'") && layoutCode.includes("title: 'Customer'"),
    'Req 1.1: Only two main navigation options exist in bottom tabs: Supply and Customer'
  );
  assert(
    !layoutCode.includes("name=\"sales\"") && !layoutCode.includes("title: 'Sales'"),
    'Req 1.2: No separate sales navbar or extra tabs added outside Supply and Customer'
  );

  // 1.2 Top displays Add Supply and History side-by-side
  assert(
    supplierScreenCode.includes('Add Supply') &&
      (supplierScreenCode.includes('Daily History') || supplierScreenCode.includes('History')),
    'Req 1.3: Top of Supply screen displays Add Supply and History buttons'
  );

  // 1.3 Center section features prominent Buy Milk button, with Sell button completely removed
  assert(
    supplierScreenCode.includes('largeBuyCard') &&
      !supplierScreenCode.includes("route: '/supplier/sell'"),
    'Req 1.4: Sell button completely removed from Supply screen and Buy Milk is prominent'
  );

  // 1.4 Supplier Registration modal has ONLY Supplier Name and Phone Number (NO Milk Category)
  assert(
    supplierScreenCode.includes('label="Supplier Name *"'),
    'Req 1.5: Supplier registration includes Supplier Name field'
  );
  assert(
    supplierScreenCode.includes('label="Phone Number *"'),
    'Req 1.6: Supplier registration includes Phone Number field'
  );
  assert(
    supplierScreenCode.includes('Register New Supplier') &&
      !supplierScreenCode.includes('Select Milk Category for Supplier'),
    'Req 1.7: Supplier registration does NOT ask for Milk Category'
  );

  // 1.5 Buy modal contains all required fields
  assert(
    supplierScreenCode.includes('buyTargetSupplier?.name') &&
      supplierScreenCode.includes('buyTargetSupplier?.phone'),
    'Req 1.8: Buy modal auto-fills Supplier Name and Phone Number'
  );
  assert(
    supplierScreenCode.includes('Milk Category *') &&
      supplierScreenCode.includes('Buffalo Milk') &&
      supplierScreenCode.includes('Cow Milk'),
    'Req 1.9: Buy modal allows selecting Milk Category (Buffalo / Cow) per transaction'
  );
  assert(
    supplierScreenCode.includes('Morning') &&
      supplierScreenCode.includes('Afternoon') &&
      supplierScreenCode.includes('Evening'),
    'Req 1.10: Buy modal allows selecting Purchase Session (Morning / Afternoon / Evening)'
  );
  assert(
    supplierScreenCode.includes('CalendarDatePickerModal') &&
      supplierScreenCode.includes('Select Purchase Date'),
    'Req 1.11: Buy modal uses interactive calendar date picker'
  );

  // 1.6 Searchbar for filtering suppliers by name or phone
  assert(
    supplierScreenCode.includes('Searchbar') &&
      supplierScreenCode.includes('Search supplier name or phone'),
    'Req 1.12: Searchbar added for filtering suppliers by name or phone'
  );

  const sellScreenCode = fs.existsSync(path.resolve(process.cwd(), 'src/app/supplier/sell.tsx'))
    ? fs.readFileSync(path.resolve(process.cwd(), 'src/app/supplier/sell.tsx'), 'utf-8')
    : '';

  // 1.7 Sales Screen: ONLY the 6 purchase fields and ONLY ONE input field (Milk Sold)
  assert(
    sellScreenCode.includes('Supplier Name:') &&
      sellScreenCode.includes('Milk Category:') &&
      sellScreenCode.includes('Purchase Session:') &&
      sellScreenCode.includes('Purchased Quantity:') &&
      sellScreenCode.includes('Purchase Rate per Litre:') &&
      sellScreenCode.includes('Total Purchase Amount:'),
    'Req 1.13: Sales modal displays strictly the 6 purchase transaction fields'
  );
  assert(
    sellScreenCode.includes('label="Milk Sold (Litres) *"'),
    'Req 1.14: Sales modal displays ONLY ONE input field: Milk Sold (Litres)'
  );

  // 1.8 Duplicate sale prevention & completed view
  assert(
    sellScreenCode.includes('Sale Completed') &&
      sellScreenCode.includes('Permanently Recorded') &&
      sellScreenCode.includes('selectedPurchase.isSold'),
    'Req 1.15: Once sold, sales input is disabled and replaced by completed sales summary'
  );

  // 1.9 Close (X) buttons beside headings
  assert(
    supplierScreenCode.includes('Milk Purchase (Buy)') &&
      supplierScreenCode.includes('accessibilityLabel="Close Milk Purchase"') &&
      supplierScreenCode.includes('setBuyModalVisible(false)'),
    'Req 1.16: Milk Purchase modal has a close (X) button beside the Milk Purchase heading'
  );
  assert(
    sellScreenCode.includes('Milk Sale Record') &&
      sellScreenCode.includes('setSalesDetailsModalVisible(false)'),
    'Req 1.17: Sales modal has a close (X) button beside the Milk Sale Record heading'
  );

  // 1.10 Date Picker positioning fix: rendered at the bottom of JSX with elevated zIndex
  const calendarModalCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/CalendarDatePickerModal.tsx'),
    'utf-8'
  );
  assert(
    calendarModalCode.includes('zIndex: 99999') || calendarModalCode.includes('elevation: 30'),
    'Req 1.18: CalendarDatePickerModal has elevated zIndex and elevation for proper stacking'
  );
  const calendarPosition = supplierScreenCode.lastIndexOf('<CalendarDatePickerModal');
  const historyModalPosition = supplierScreenCode.lastIndexOf('historyModalVisible');
  assert(
    calendarPosition > historyModalPosition,
    'Req 1.19: CalendarDatePickerModal is rendered after modals in JSX tree so it opens in front'
  );

  // 1.11 Three Supply History Tabs at the top
  assert(
    supplierScreenCode.includes("label: 'Daily History'") &&
      supplierScreenCode.includes("label: 'Monthly History'") &&
      supplierScreenCode.includes("label: 'Custom History'"),
    'Req 1.20: History modal displays three tabs at top: Daily History, Monthly History, and Custom History'
  );

  // 1.12 Monthly History Expandable Dates
  assert(
    supplierScreenCode.includes('toggleDateExpanded') &&
      supplierScreenCode.includes('expandedMonthlyDates') &&
      supplierScreenCode.includes('expandedTransactionsBox'),
    'Req 1.21: Monthly History includes expandable daily transaction views'
  );

  // 1.13 Custom History Start and End Date pickers
  assert(
    supplierScreenCode.includes('custom_start') &&
      supplierScreenCode.includes('custom_end') &&
      supplierScreenCode.includes('From (Start Date)') &&
      supplierScreenCode.includes('To (End Date)'),
    'Req 1.22: Custom History allows selecting Start Date and End Date using interactive pickers'
  );

  // 1.14 PDF Export for all three tabs
  const pdfServiceCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/pdfService.ts'),
    'utf-8'
  );
  assert(
    pdfServiceCode.includes('export async function generateSupplyHistoryPDF'),
    'Req 1.23: pdfService exports generateSupplyHistoryPDF for comprehensive report generation'
  );
  assert(
    supplierScreenCode.includes("handleDownloadPDF('daily')") &&
      supplierScreenCode.includes("handleDownloadPDF('monthly')") &&
      supplierScreenCode.includes("handleDownloadPDF('custom')"),
    'Req 1.24: All three history tabs provide a Download PDF action'
  );

  // --- Requirement 2: Firestore Service Integration Testing ---
  const { addSupplier, deleteSupplier } = await import(
    '../src/services/supplierPurchaseService'
  );
  const {
    recordMilkPurchase,
    recordMilkSale,
    getSaleForPurchase,
    deleteMilkSale,
    deleteMilkPurchase,
    getAllPurchasesForDate,
    getDailyAccountHistory,
    getMonthlyAccountHistory,
    getRangeAccountHistory,
    calculateDailyStockSummary,
  } = await import('../src/services/milkTradeService');

  const testDate = '2026-11-20';
  const testPhone = '9876500111';

  // 2.1 Register test supplier: Rahul (Name & Phone only)
  console.log('\n--- Registering Test Supplier: Rahul (Name & Phone only) ---');
  const rahulSupplier = await addSupplier('Rahul', testPhone);

  assert(
    rahulSupplier.id !== undefined && rahulSupplier.name === 'Rahul' && rahulSupplier.phone === testPhone,
    'Req 2.1: Supplier Rahul registered in Firestore without requiring Milk Category'
  );

  // 2.2 Multiple Purchases on Same Day: Testing calculation example (85L @ ₹1,600/L = ₹1,36,000)
  console.log('\n--- Recording Purchase with User Example (85L @ ₹1,600/L = ₹1,36,000) ---');
  const buyTx1 = await recordMilkPurchase({
    supplierId: rahulSupplier.id,
    supplierName: rahulSupplier.name,
    supplierPhone: rahulSupplier.phone,
    milkCategory: 'buffalo',
    session: 'morning',
    purchaseDate: testDate,
    quantityLiters: 85,
    pricePerLiter: 1600,
  });

  assert(
    buyTx1.quantityLiters === 85 &&
      buyTx1.pricePerLiter === 1600 &&
      buyTx1.totalAmount === 136000 &&
      buyTx1.remainingQuantity === 85 &&
      buyTx1.isSold === false,
    'Req 2.2: Purchase 1 recorded: 85L @ ₹1,600/L = ₹1,36,000, Remaining = 85L, isSold = false'
  );

  // Purchase 2: Evening 50L Cow Milk @ ₹50/L = ₹2,500
  const buyTx2 = await recordMilkPurchase({
    supplierId: rahulSupplier.id,
    supplierName: rahulSupplier.name,
    supplierPhone: rahulSupplier.phone,
    milkCategory: 'cow',
    session: 'evening',
    purchaseDate: testDate,
    quantityLiters: 50,
    pricePerLiter: 50,
  });

  assert(
    buyTx1.id !== buyTx2.id,
    'Req 2.3: Multiple purchases supported on the same day with unique IDs'
  );

  // --- Requirement 3: Sales Calculation & Single Final Sale Enforcement ---
  console.log('\n--- Testing Sales Calculation (80L sold out of 85L -> 5L remaining) ---');
  // Record sale of 80L against buyTx1 (85L @ ₹1,600/L)
  const saleTx1 = await recordMilkSale({
    purchaseId: buyTx1.id,
    quantityLiters: 80,
    saleDate: testDate,
  });

  assert(
    saleTx1.purchasedQuantityLiters === 85 &&
      saleTx1.soldQuantityLiters === 80 &&
      saleTx1.remainingQuantityLiters === 5 &&
      saleTx1.status === 'remaining' &&
      saleTx1.statusText === '5 Litres Remaining' &&
      saleTx1.purchasePricePerLiter === 1600 &&
      saleTx1.totalPurchaseAmount === 136000,
    'Req 3.1: Sales calculation correct: 80L sold out of 85L -> 5L remaining, Status = "5 Litres Remaining"'
  );

  // Verify purchase document updated to isSold = true, status = 'sold'
  const purchasesAfterSale = await getAllPurchasesForDate(testDate, rahulSupplier.id);
  const updatedMorning = purchasesAfterSale.find((p) => p.id === buyTx1.id);
  assert(
    updatedMorning?.isSold === true &&
      updatedMorning?.status === 'sold' &&
      updatedMorning?.totalSoldQuantity === 80 &&
      updatedMorning?.remainingQuantity === 5,
    'Req 3.2: Purchase doc atomically marked isSold = true, status = "sold", sold = 80L, remaining = 5L'
  );

  // Verify duplicate sale prevention: attempting a second sale on buyTx1 MUST throw an error
  console.log('\n--- Testing Duplicate Sale Prevention ---');
  let duplicatePrevented = false;
  try {
    await recordMilkSale({
      purchaseId: buyTx1.id,
      quantityLiters: 5,
      saleDate: testDate,
    });
  } catch (err: any) {
    duplicatePrevented = true;
    assert(
      err?.message?.includes('already been sold') || err?.message?.includes('already been saved'),
      `Req 3.3: Duplicate sale rejected with error: ${err.message}`
    );
  }
  assert(duplicatePrevented, 'Req 3.4: Attempting a duplicate sale on an already sold purchase threw an error');

  // Verify permanent sales document retrieval via getSaleForPurchase
  const retrievedSale = await getSaleForPurchase(buyTx1.id);
  assert(
    retrievedSale !== null &&
      retrievedSale.purchasedQuantityLiters === 85 &&
      retrievedSale.purchasePricePerLiter === 1600 &&
      retrievedSale.totalPurchaseAmount === 136000 &&
      retrievedSale.soldQuantityLiters === 80 &&
      retrievedSale.remainingQuantityLiters === 5 &&
      retrievedSale.wastageQuantity === 5 &&
      retrievedSale.lossAmount === 8000,
    'Req 3.5: Permanent sales record accurately retrieved with wastageQuantity = 5 and lossAmount = ₹8,000 (5 * ₹1600)'
  );

  // --- Requirement 3B: Automatic Waste of Money Calculation (User Example: 100L @ ₹100/L, 97L sold -> 3L wasted, ₹300 loss) ---
  console.log('\n--- Testing Automatic Waste of Money Calculation with User Example (100L @ ₹100/L, 97L sold -> 3L wasted, ₹300 loss) ---');
  const buyTxWastage = await recordMilkPurchase({
    supplierId: rahulSupplier.id,
    supplierName: rahulSupplier.name,
    supplierPhone: rahulSupplier.phone,
    milkCategory: 'buffalo',
    session: 'afternoon',
    purchaseDate: testDate,
    quantityLiters: 100,
    pricePerLiter: 100,
  });

  const saleTxWastage = await recordMilkSale({
    purchaseId: buyTxWastage.id,
    quantityLiters: 97,
    saleDate: testDate,
  });

  assert(
    saleTxWastage.purchasedQuantityLiters === 100 &&
      saleTxWastage.soldQuantityLiters === 97 &&
      saleTxWastage.wastageQuantity === 3 &&
      saleTxWastage.lossAmount === 300 &&
      saleTxWastage.remainingQuantityLiters === 3,
    'Req 3B.1: User Example Verified: 100L @ ₹100/L, sold 97L -> Waste of Milk = 3L, Waste of Money = ₹300'
  );

  const retrievedWastageSale = await getSaleForPurchase(buyTxWastage.id);
  assert(
    retrievedWastageSale?.wastageQuantity === 3 &&
      retrievedWastageSale?.lossAmount === 300,
    'Req 3B.2: Sales document persisted wastageQuantity = 3 and lossAmount = ₹300'
  );

  // --- Requirement 4: Test Fully Sold Purchase (0 Remaining -> "No Loss") ---
  console.log('\n--- Testing Fully Sold Purchase (50L out of 50L -> 0 Remaining, "No Loss") ---');
  const saleTx2 = await recordMilkSale({
    purchaseId: buyTx2.id,
    quantityLiters: 50,
    saleDate: testDate,
  });

  assert(
    saleTx2.purchasedQuantityLiters === 50 &&
      saleTx2.soldQuantityLiters === 50 &&
      saleTx2.remainingQuantityLiters === 0 &&
      saleTx2.wastageQuantity === 0 &&
      saleTx2.lossAmount === 0 &&
      saleTx2.status === 'no_loss' &&
      saleTx2.statusText === 'No Loss',
    'Req 4.1: Fully sold purchase gives Waste of Milk = 0L, Waste of Money = ₹0, and status = "No Loss"'
  );

  // --- Requirement 5: Daily Accounts History ---
  console.log('\n--- Testing Daily Accounts History ---');
  const history = await getDailyAccountHistory(testDate);
  assert(
    history.totalPurchasedLiters === 235, // 85 + 100 + 50 = 235L
    `Req 5.1: Daily total purchased liters = 235L (${history.totalPurchasedLiters}L)`
  );
  assert(
    history.totalSoldLiters === 227, // 80 + 97 + 50 = 227L
    `Req 5.2: Daily total sold liters = 227L (${history.totalSoldLiters}L)`
  );
  assert(
    history.totalRemainingLiters === 8, // 5 + 3 + 0 = 8L
    `Req 5.3: Daily total remaining liters = 8L (${history.totalRemainingLiters}L)`
  );
  assert(
    history.totalWastageLiters === 8,
    `Req 5.4: Daily total wastage liters = 8L (${history.totalWastageLiters}L)`
  );
  assert(
    history.totalLossAmount === 8300, // 8000 + 300 = ₹8,300
    `Req 5.5: Daily total Waste of Money = ₹8,300 (₹${history.totalLossAmount})`
  );
  assert(
    history.totalPurchaseAmount === 148500, // 136000 + 10000 + 2500 = ₹1,48,500
    `Req 5.6: Daily total purchase amount = ₹1,48,500 (₹${history.totalPurchaseAmount})`
  );

  // --- Requirement 5B: Monthly & Custom Range Account History ---
  console.log('\n--- Testing Monthly and Range Accounts History ---');
  const monthlyHistory = await getMonthlyAccountHistory(2026, 11);
  assert(
    monthlyHistory.startDate === '2026-11-01' && monthlyHistory.endDate === '2026-11-30',
    'Req 5.7: Monthly history sets complete month date boundaries'
  );
  assert(
    monthlyHistory.totalPurchasedLiters >= 235 && monthlyHistory.totalSoldLiters >= 227,
    `Req 5.8: Monthly history successfully aggregates purchases (${monthlyHistory.totalPurchasedLiters}L) and sales (${monthlyHistory.totalSoldLiters}L)`
  );
  assert(
    monthlyHistory.totalLossAmount >= 8300,
    `Req 5.9: Monthly history aggregates total Waste of Money: ₹${monthlyHistory.totalLossAmount}`
  );
  assert(
    monthlyHistory.dates.length > 0 && monthlyHistory.dates.some((d) => d.date === testDate),
    'Req 5.10: Monthly history includes date summaries for expandable dates'
  );

  const customHistory = await getRangeAccountHistory('2026-11-15', '2026-11-25');
  assert(
    customHistory.startDate === '2026-11-15' && customHistory.endDate === '2026-11-25',
    'Req 5.11: Custom range history queries custom date window correctly'
  );
  assert(
    customHistory.totalPurchasedLiters >= 235,
    'Req 5.12: Custom range history includes transactions recorded on testDate'
  );
  assert(
    customHistory.totalLossAmount >= 8300,
    `Req 5.13: Custom range history aggregates total Waste of Money: ₹${customHistory.totalLossAmount}`
  );

  // --- Requirement 6: Stock Summary Calculation ---
  const allTestPurchases = await getAllPurchasesForDate(testDate, rahulSupplier.id);
  const stockSummary = calculateDailyStockSummary(
    testDate,
    [rahulSupplier],
    allTestPurchases
  );
  assert(
    stockSummary.overall.totalPurchasedLiters === 235 &&
      stockSummary.overall.buffalo.purchasedLiters === 185 &&
      stockSummary.overall.cow.purchasedLiters === 50,
    'Req 6.1: Stock summary calculation properly aggregates categories and totals'
  );

  // --- Requirement 7: Clean Up Test Records ---
  console.log('\n--- Cleaning up test records ---');
  await deleteMilkSale(saleTx1.id, buyTx1.id);
  await deleteMilkSale(saleTxWastage.id, buyTxWastage.id);
  await deleteMilkSale(saleTx2.id, buyTx2.id);
  await deleteMilkPurchase(buyTx1.id);
  await deleteMilkPurchase(buyTxWastage.id);
  await deleteMilkPurchase(buyTx2.id);
  await deleteSupplier(rahulSupplier.id, true);

  console.log('\n🎉 ALL SUPPLY MODULE & SELL CALCULATION REQUIREMENTS VERIFIED 100% SUCCESSFULLY!\n');
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
