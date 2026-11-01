const fs = typeof require !== 'undefined' ? (require('fs') as any) : null;
const path = typeof require !== 'undefined' ? (require('path') as any) : null;

function runVerifications() {
  console.log('=== VERIFYING CUSTOMER DASHBOARD, CARD FIXES, AND DAILY SUPPLY SUMMARY ===\n');

  const rootDir = process.cwd();
  const customersPath = path.join(rootDir, 'src', 'app', '(tabs)', 'customers.tsx');
  const summaryPath = path.join(rootDir, 'src', 'app', 'customer', 'daily-supply-summary.tsx');
  const layoutPath = path.join(rootDir, 'src', 'app', '_layout.tsx');

  let allPassed = true;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✅ [PASS] ${msg}`);
    } else {
      console.error(`❌ [FAIL] ${msg}`);
      allPassed = false;
    }
  }

  // 1. Verify Customers Screen exists
  assert(fs.existsSync(customersPath), 'customers.tsx exists');
  const customersCode = fs.readFileSync(customersPath, 'utf8');

  // 2. Fix 1: Check that customerSpecsBox does NOT display duplicate Morning / Delivery Time
  const hasTimeInSpecs = /Time:\s*<Text[^>]*>\s*\{item\.deliveryTime/.test(customersCode);
  assert(!hasTimeInSpecs, 'Fix 1: Customer specs box has removed duplicate Morning / Delivery Time');

  // Verify first Morning label in header badge is still preserved
  const hasTimeBadgeInHeader = /timeBadgeBox[\s\S]*?item\.deliveryTime === 'evening'[\s\S]*?Morning/.test(customersCode);
  assert(hasTimeBadgeInHeader, 'Fix 1: Header delivery time badge is preserved');

  // 3. Fix 2: Check that quick adjust buttons (-0.5, +0.5, -1, +1) are completely removed
  const hasAdjustButtons = /-0\.5L|\+0\.5L|-1L|\+1L|handleAdjustQuantity\(/.test(customersCode);
  assert(!hasAdjustButtons, 'Fix 2: Quantity adjustment buttons (-0.5L, +0.5L, -1L, +1L) are completely removed');

  // Verify manual quantity edit touchable with pencil icon is preserved
  const hasCustomQtyTouchable = /handleOpenCustomQty\(item\)/.test(customersCode);
  assert(hasCustomQtyTouchable, 'Fix 2: Direct quantity touchable with edit modal is preserved');

  // 4. Box 1: Total Customer Milk calculation and display
  const hasCustomerMilkSummary = /const customerMilkSummary = useMemo\(\(\) =>/.test(customersCode);
  assert(hasCustomerMilkSummary, 'Box 1: customerMilkSummary useMemo calculation exists');

  const hasCowAndBuffaloTotals = /cowLitres/.test(customersCode) && /buffaloLitres/.test(customersCode);
  assert(hasCowAndBuffaloTotals, 'Box 1: Cow and Buffalo milk totals calculated dynamically');

  const hasTotalCustomerMilkUI = /Total Customer Milk/.test(customersCode) && /customerMilkSummary\.total/.test(customersCode);
  assert(hasTotalCustomerMilkUI, 'Box 1: Total Customer Milk UI displayed with total litres');

  // 5. Box 2: Calendar / Date Selector
  const hasBox2DateSelector = /dashboardBox[\s\S]*?Delivery Date[\s\S]*?formatDisplayDate\(selectedDate\)/.test(customersCode);
  assert(hasBox2DateSelector, 'Box 2: Calendar / Date Selector displayed with formatted date');

  const hasBox2TapPicker = /setCalendarTargetField\('main'\)[\s\S]*?setCalendarPickerVisible\(true\)/.test(customersCode);
  assert(hasBox2TapPicker, 'Box 2: Date box is clickable and opens calendar picker');

  // 6. Daily Supply Summary Button
  const hasDailySupplyBtn = /Daily Supply Summary/.test(customersCode) && /\/customer\/daily-supply-summary/.test(customersCode);
  assert(hasDailySupplyBtn, 'Daily Supply Summary button navigates to /customer/daily-supply-summary');

  // 7. Verify daily-supply-summary.tsx exists and contains all 4 sections
  assert(fs.existsSync(summaryPath), 'daily-supply-summary.tsx exists');
  const summaryCode = fs.readFileSync(summaryPath, 'utf8');

  // Section A: Total Daily Supply
  const hasSectionA = /A\.\s*Total Daily Supply/.test(summaryCode);
  const hasSectionASupplyMetrics = /cowLitres[\s\S]*?buffaloLitres[\s\S]*?overallSupplied[\s\S]*?totalPurchaseCost/.test(summaryCode);
  assert(hasSectionA && hasSectionASupplyMetrics, 'Section A: Total Daily Supply (Cow, Buffalo, Overall, Cost) implemented');

  // Section B: Total Daily Customer Sales
  const hasSectionB = /B\.\s*Total Daily Customer Sales/.test(summaryCode);
  const hasSectionBSalesMetrics = /overallSold[\s\S]*?totalCustomerSalesAmount/.test(summaryCode);
  assert(hasSectionB && hasSectionBSalesMetrics, 'Section B: Total Daily Customer Sales (Cow, Buffalo, Overall, Revenue) implemented');

  // Section C: Automatic Stock Difference
  const hasSectionC = /C\.\s*Automatic Stock Difference/.test(summaryCode);
  const hasSectionCStockMetrics = /remainingCow[\s\S]*?remainingBuffalo[\s\S]*?overallRemaining[\s\S]*?statusType/.test(summaryCode);
  assert(hasSectionC && hasSectionCStockMetrics, 'Section C: Automatic Stock Difference (Cow, Buffalo, Overall, Status banner) implemented');

  // Section D: Profit & Loss Calculation
  const hasSectionD = /D\.\s*Profit\s*&amp;\s*Loss Calculation|D\.\s*Profit\s*&\s*Loss Calculation/.test(summaryCode);
  const hasSectionDFinancialMetrics = /purchaseCost[\s\S]*?salesRevenue[\s\S]*?net[\s\S]*?outcome/.test(summaryCode);
  assert(hasSectionD && hasSectionDFinancialMetrics, 'Section D: Profit & Loss Calculation (Purchase Cost, Sales Revenue, Net P/L) implemented');

  // Interactive date selection in summary screen
  const hasSummaryDatePicker = /CalendarDatePickerModal[\s\S]*?Select Summary Date/.test(summaryCode);
  assert(hasSummaryDatePicker, 'Daily Supply Summary has interactive date picker modal');

  // 8. Verify _layout.tsx registers customer/daily-supply-summary
  const layoutCode = fs.readFileSync(layoutPath, 'utf8');
  const hasLayoutRegistration = /name="customer\/daily-supply-summary"/.test(layoutCode);
  assert(hasLayoutRegistration, '_layout.tsx registers customer/daily-supply-summary screen');

  console.log('\n----------------------------------------');
  if (allPassed) {
    console.log('🎉 ALL VERIFICATIONS PASSED SUCCESSFULLY!');
  } else {
    console.error('❌ SOME VERIFICATIONS FAILED.');
    process.exit(1);
  }
}

runVerifications();
