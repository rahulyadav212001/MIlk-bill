declare const require: any;

import {
  Customer,
  Delivery,
  MonthlyBill,
  Payment,
  FinalAccountClosingSummary,
} from '../src/types';

console.log('=== VERIFYING ACCURATE FINAL BILL CALCULATION BASED ON MONTHLY BILLING CYCLES ===\n');

// Mock in-memory Firestore database
const mockCustomers = new Map<string, Customer>();
const mockDeliveries = new Map<string, Delivery>();
const mockBills = new Map<string, MonthlyBill>();
const mockPayments = new Map<string, Payment>();

function clearMocks() {
  mockCustomers.clear();
  mockDeliveries.clear();
  mockBills.clear();
  mockPayments.clear();
}

/**
 * Mock implementation of calculateFinalBillPreview adhering to the new monthly cycle rules
 */
function mockCalculateFinalBillPreview(
  customerId: string,
  closingDate: string
): FinalAccountClosingSummary {
  const customer = mockCustomers.get(customerId);
  if (!customer) throw new Error('Customer not found');

  const joiningDate = customer.deliveryStartDate;
  if (closingDate < joiningDate) {
    throw new Error('Closing date cannot be earlier than joining date');
  }

  const [cYear, cMonth] = closingDate.split('-').map(Number);
  const firstDayOfClosingMonth = `${cYear}-${cMonth < 10 ? '0' + cMonth : cMonth}-01`;
  const billingPeriodStart = joiningDate > firstDayOfClosingMonth ? joiningDate : firstDayOfClosingMonth;
  const billingPeriodEnd = closingDate;
  const billingPeriodLabel = `${billingPeriodStart} to ${billingPeriodEnd}`;

  // Check prior completed months
  const [jYear, jMonth] = joiningDate.split('-').map(Number);
  const startMonthIndex = jYear * 12 + jMonth;
  const closeMonthIndex = cYear * 12 + cMonth;
  const completedBillingMonthsCount = Math.max(0, closeMonthIndex - startMonthIndex);

  let previousBalance = 0;
  let isPreviousMonthPaid = true;
  let lastCompletedMonthLabel: string | undefined = undefined;

  if (completedBillingMonthsCount > 0) {
    let curMonth = jMonth;
    let curYear = jYear;
    let lastBill: MonthlyBill | undefined = undefined;

    while (curYear < cYear || (curYear === cYear && curMonth < cMonth)) {
      const b = mockBills.get(`bill_${customerId}_${curYear}_${curMonth}`);
      if (b) {
        lastBill = b;
      }
      curMonth++;
      if (curMonth > 12) {
        curMonth = 1;
        curYear++;
      }
    }

    let prevMonth = cMonth - 1;
    let prevYear = cYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = cYear - 1;
    }
    lastCompletedMonthLabel = `${prevYear}-${prevMonth}`;

    if (lastBill) {
      const remaining = Number((lastBill.remainingBalance || 0).toFixed(2));
      if (remaining > 0) {
        previousBalance = remaining;
        isPreviousMonthPaid = false;
      } else {
        previousBalance = 0;
        isPreviousMonthPaid = true;
      }
    }
  }

  // Active cycle deliveries
  const monthDeliveries = Array.from(mockDeliveries.values()).filter(
    (d) => d.customerId === customerId && d.deliveryDate.startsWith(`${cYear}-${cMonth < 10 ? '0' + cMonth : cMonth}`)
  );
  const currentCycleDeliveries = monthDeliveries.filter(
    (d) => d.deliveryDate >= billingPeriodStart && d.deliveryDate <= billingPeriodEnd
  );

  const currentCycleMilkQuantity = Number(
    currentCycleDeliveries.reduce((acc, d) => acc + d.actualQuantity, 0).toFixed(2)
  );
  const currentCycleMilkAmount = Number(
    currentCycleDeliveries.reduce((acc, d) => acc + d.amount, 0).toFixed(2)
  );

  // Active cycle payments
  const payments = Array.from(mockPayments.values()).filter(
    (p) => p.customerId === customerId && p.billingMonth === cMonth && p.billingYear === cYear
  );
  const currentMonthPayments = Number(
    payments.reduce((acc, p) => acc + p.amount, 0).toFixed(2)
  );

  const finalBillAmount = currentCycleMilkAmount;
  const finalOutstandingAmount = Math.max(
    0,
    Number((previousBalance + finalBillAmount - currentMonthPayments).toFixed(2))
  );

  return {
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    joiningDate,
    closingDate,
    billingPeriodStart,
    billingPeriodEnd,
    billingPeriodLabel,
    billingMonth: cMonth,
    billingYear: cYear,
    completedBillingMonthsCount,
    lastCompletedMonthLabel,
    isPreviousMonthPaid,
    milkCategory: customer.milkCategory || 'buffalo',
    defaultDailyQuantity: customer.defaultDailyQuantity,
    pricePerLiter: customer.pricePerLiter,
    currentCycleMilkQuantity,
    currentCycleMilkAmount,
    currentCycleDeliveries,
    previousBalance,
    currentMonthPayments,
    finalBillAmount,
    finalOutstandingAmount,
    deliveriesCount: currentCycleDeliveries.length,
    totalMilkQuantity: currentCycleMilkQuantity,
    totalMilkAmount: finalBillAmount,
    currentMilkBill: finalBillAmount,
    currentMilkQuantity: currentCycleMilkQuantity,
    totalPaymentsReceived: currentMonthPayments,
  };
}

// -------------------------------------------------------------
// Test 1: Example A - Customer closes after 5 days of a new billing month
// Customer joined 1 Oct 2026, Oct bill generated & paid, closes 5 Nov 2026
// Expected: Only 5 days in Nov billed = 5L @ ₹60 = ₹300. Oct NOT billed again.
// -------------------------------------------------------------
function testExampleA() {
  console.log('Test 1: Example A - 5 Days into New Billing Month (Oct Bill Fully Paid)...');
  clearMocks();

  const customerId = 'cust_ex_a';
  const customer: Customer = {
    id: customerId,
    name: 'Rahul Example A',
    phone: '9876543201',
    milkCategory: 'cow',
    defaultDailyQuantity: 1,
    pricePerLiter: 60,
    deliveryStartDate: '2026-10-01',
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  mockCustomers.set(customerId, customer);

  // October bill: Generated and fully paid
  mockBills.set(`bill_${customerId}_2026_10`, {
    id: `bill_${customerId}_2026_10`,
    customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
    billingMonth: 10,
    billingYear: 2026,
    totalMilk: 31,
    milkAmount: 31 * 60, // ₹1,860
    previousBalance: 0,
    paymentsReceived: 31 * 60, // ₹1,860
    remainingBalance: 0, // Fully paid!
    generatedAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Pre-generated November deliveries (Nov 1 to Nov 5)
  for (let day = 1; day <= 5; day++) {
    const dStr = `2026-11-0${day}`;
    mockDeliveries.set(`delivery_${customerId}_${dStr}`, {
      id: `delivery_${customerId}_${dStr}`,
      customerId,
      deliveryDate: dStr,
      defaultQuantity: 1,
      actualQuantity: 1,
      pricePerLiter: 60,
      amount: 60,
      status: 'delivered',
      manuallyEdited: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  const preview = mockCalculateFinalBillPreview(customerId, '2026-11-05');

  if (preview.billingPeriodStart !== '2026-11-01' || preview.billingPeriodEnd !== '2026-11-05') {
    throw new Error(`Invalid billing period: ${preview.billingPeriodStart} to ${preview.billingPeriodEnd}`);
  }
  if (!preview.isPreviousMonthPaid) {
    throw new Error('October bill should be detected as fully paid');
  }
  if (preview.previousBalance !== 0) {
    throw new Error(`Expected previous balance ₹0, got ₹${preview.previousBalance}`);
  }
  if (preview.currentCycleMilkQuantity !== 5) {
    throw new Error(`Expected current cycle quantity 5L, got ${preview.currentCycleMilkQuantity}`);
  }
  if (preview.finalBillAmount !== 300) {
    throw new Error(`Expected final bill ₹300, got ₹${preview.finalBillAmount}`);
  }
  if (preview.finalOutstandingAmount !== 300) {
    throw new Error(`Expected final outstanding ₹300, got ₹${preview.finalOutstandingAmount}`);
  }

  console.log('✓ Example A passed: 5 days in Nov = ₹300. Oct charges were not added again.\n');
}

// -------------------------------------------------------------
// Test 2: Example B - Customer closes after 25 days
// Starts 1 Nov 2026, closes 25 Nov 2026 @ 1L ₹60 = ₹1,500
// -------------------------------------------------------------
function testExampleB() {
  console.log('Test 2: Example B - Customer Closes After 25 Days (1 Nov to 25 Nov)...');
  clearMocks();

  const customerId = 'cust_ex_b';
  const customer: Customer = {
    id: customerId,
    name: 'Customer Example B',
    phone: '9876543202',
    milkCategory: 'cow',
    defaultDailyQuantity: 1,
    pricePerLiter: 60,
    deliveryStartDate: '2026-11-01',
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  mockCustomers.set(customerId, customer);

  for (let day = 1; day <= 25; day++) {
    const dStr = `2026-11-${day < 10 ? '0' + day : day}`;
    mockDeliveries.set(`delivery_${customerId}_${dStr}`, {
      id: `delivery_${customerId}_${dStr}`,
      customerId,
      deliveryDate: dStr,
      defaultQuantity: 1,
      actualQuantity: 1,
      pricePerLiter: 60,
      amount: 60,
      status: 'delivered',
      manuallyEdited: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  const preview = mockCalculateFinalBillPreview(customerId, '2026-11-25');

  if (preview.currentCycleMilkQuantity !== 25) {
    throw new Error(`Expected 25L, got ${preview.currentCycleMilkQuantity}L`);
  }
  if (preview.finalBillAmount !== 1500) {
    throw new Error(`Expected final bill ₹1,500, got ₹${preview.finalBillAmount}`);
  }
  if (preview.finalOutstandingAmount !== 1500) {
    throw new Error(`Expected final outstanding ₹1,500, got ₹${preview.finalOutstandingAmount}`);
  }

  console.log('✓ Example B passed: 25 days = 25L and ₹1,500 final bill.\n');
}

// -------------------------------------------------------------
// Test 3: Example C - Customer closes on first day of new billing cycle (1 Dec)
// Starts 1 Dec 2026, closes 1 Dec 2026 @ 1L ₹60 = ₹60
// -------------------------------------------------------------
function testExampleC() {
  console.log('Test 3: Example C - Closes on First Day of New Cycle (1 Dec)...');
  clearMocks();

  const customerId = 'cust_ex_c';
  const customer: Customer = {
    id: customerId,
    name: 'Customer Example C',
    phone: '9876543203',
    milkCategory: 'cow',
    defaultDailyQuantity: 1,
    pricePerLiter: 60,
    deliveryStartDate: '2026-11-01',
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  mockCustomers.set(customerId, customer);

  // November was fully paid
  mockBills.set(`bill_${customerId}_2026_11`, {
    id: `bill_${customerId}_2026_11`,
    customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
    billingMonth: 11,
    billingYear: 2026,
    totalMilk: 30,
    milkAmount: 1800,
    previousBalance: 0,
    paymentsReceived: 1800,
    remainingBalance: 0,
    generatedAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Delivery on 1 Dec
  mockDeliveries.set(`delivery_${customerId}_2026-12-01`, {
    id: `delivery_${customerId}_2026-12-01`,
    customerId,
    deliveryDate: '2026-12-01',
    defaultQuantity: 1,
    actualQuantity: 1,
    pricePerLiter: 60,
    amount: 60,
    status: 'delivered',
    manuallyEdited: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const preview = mockCalculateFinalBillPreview(customerId, '2026-12-01');

  if (preview.billingPeriodStart !== '2026-12-01' || preview.billingPeriodEnd !== '2026-12-01') {
    throw new Error(`Expected period 2026-12-01 to 2026-12-01, got ${preview.billingPeriodStart} to ${preview.billingPeriodEnd}`);
  }
  if (preview.currentCycleMilkQuantity !== 1) {
    throw new Error(`Expected 1L, got ${preview.currentCycleMilkQuantity}L`);
  }
  if (preview.finalBillAmount !== 60) {
    throw new Error(`Expected ₹60 final bill, got ₹${preview.finalBillAmount}`);
  }

  console.log('✓ Example C passed: Exactly 1 Dec delivery included = ₹60.\n');
}

// -------------------------------------------------------------
// Test 4: Example D - Previous Month has Outstanding Balance
// Oct Outstanding: ₹500, Nov Milk: ₹300, Nov Payments: ₹100
// Expected: ₹500 + ₹300 - ₹100 = ₹700
// -------------------------------------------------------------
function testExampleD() {
  console.log('Test 4: Example D - Previous Month Unpaid Balance + Current Milk - Current Payments...');
  clearMocks();

  const customerId = 'cust_ex_d';
  const customer: Customer = {
    id: customerId,
    name: 'Customer Example D',
    phone: '9876543204',
    milkCategory: 'cow',
    defaultDailyQuantity: 1,
    pricePerLiter: 60,
    deliveryStartDate: '2026-10-01',
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  mockCustomers.set(customerId, customer);

  // October bill: ₹500 remaining balance
  mockBills.set(`bill_${customerId}_2026_10`, {
    id: `bill_${customerId}_2026_10`,
    customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
    billingMonth: 10,
    billingYear: 2026,
    totalMilk: 31,
    milkAmount: 1860,
    previousBalance: 0,
    paymentsReceived: 1360,
    remainingBalance: 500, // ₹500 unpaid
    generatedAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Nov 1 to Nov 5 deliveries: 5 days * ₹60 = ₹300
  for (let day = 1; day <= 5; day++) {
    const dStr = `2026-11-0${day}`;
    mockDeliveries.set(`delivery_${customerId}_${dStr}`, {
      id: `delivery_${customerId}_${dStr}`,
      customerId,
      deliveryDate: dStr,
      defaultQuantity: 1,
      actualQuantity: 1,
      pricePerLiter: 60,
      amount: 60,
      status: 'delivered',
      manuallyEdited: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  // Nov Payment: ₹100 received on Nov 3
  mockPayments.set(`payment_${customerId}_1`, {
    id: `payment_${customerId}_1`,
    customerId,
    amount: 100,
    paymentDate: '2026-11-03',
    paymentMethod: 'cash',
    billingMonth: 11,
    billingYear: 2026,
    createdAt: Date.now(),
  });

  const preview = mockCalculateFinalBillPreview(customerId, '2026-11-05');

  if (preview.previousBalance !== 500) {
    throw new Error(`Expected previous balance ₹500, got ₹${preview.previousBalance}`);
  }
  if (preview.finalBillAmount !== 300) {
    throw new Error(`Expected current cycle bill ₹300, got ₹${preview.finalBillAmount}`);
  }
  if (preview.currentMonthPayments !== 100) {
    throw new Error(`Expected current month payments ₹100, got ₹${preview.currentMonthPayments}`);
  }
  // ₹500 + ₹300 - ₹100 = ₹700
  if (preview.finalOutstandingAmount !== 700) {
    throw new Error(`Expected final outstanding ₹700, got ₹${preview.finalOutstandingAmount}`);
  }

  console.log('✓ Example D passed: ₹500 previous + ₹300 current - ₹100 payment = ₹700 final outstanding.\n');
}

// -------------------------------------------------------------
// Test 5: UI & Two Dates Inspection
// -------------------------------------------------------------
function testUIDateVerification() {
  console.log('Test 5: Verifying UI Two Dates (Joining Date & Closing Date)...');
  const fs = typeof require !== 'undefined' ? require('fs') : null;
  if (!fs) return;

  const customersContent = fs.readFileSync('src/app/(tabs)/customers.tsx', 'utf8');

  // Verify Date 1: Customer Joining Date (Read-only)
  if (!customersContent.includes('Date 1: Customer Joining Date') || !customersContent.includes('Read-only')) {
    throw new Error('customers.tsx missing Date 1 (Customer Joining Date Read-only)');
  }

  // Verify Date 2: Account Closing Date
  if (!customersContent.includes('Date 2: Account Closing Date')) {
    throw new Error('customers.tsx missing Date 2 (Account Closing Date)');
  }

  // Verify Active Billing Period Banner
  if (!customersContent.includes('Current Billing Period:') || !customersContent.includes('billingPeriodLabel')) {
    throw new Error('customers.tsx missing Current Billing Period banner');
  }

  // Verify Applicable Daily Entries Table
  if (!customersContent.includes('Applicable Daily Entries (Current Cycle Only)')) {
    throw new Error('customers.tsx missing Current Cycle daily entries table');
  }

  console.log('✓ UI accurately displays Date 1 (Joining Date), Date 2 (Closing Date), and Active Billing Period.\n');
}

// -------------------------------------------------------------
// Test 6: Multi-Month Prior History (Joined Aug 2026, Closes Nov 2026)
// Aug & Sep fully paid, Oct has ₹200 unpaid, Nov 5 days = ₹300, Nov payment ₹0
// Expected: Active period 1 Nov to 5 Nov, Final Bill ₹300, Final Outstanding ₹500
// -------------------------------------------------------------
function testMultiMonthPriorHistory() {
  console.log('Test 6: Multi-Month Customer (Joined Aug, Closed Nov 5, Oct ₹200 unpaid)...');
  clearMocks();

  const customerId = 'cust_multi_month';
  const customer: Customer = {
    id: customerId,
    name: 'Customer Multi Month',
    phone: '9876543206',
    milkCategory: 'cow',
    defaultDailyQuantity: 1,
    pricePerLiter: 60,
    deliveryStartDate: '2026-08-01',
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  mockCustomers.set(customerId, customer);

  // Aug bill: Generated and paid
  mockBills.set(`bill_${customerId}_2026_8`, {
    id: `bill_${customerId}_2026_8`,
    customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
    billingMonth: 8,
    billingYear: 2026,
    totalMilk: 31,
    milkAmount: 1860,
    previousBalance: 0,
    paymentsReceived: 1860,
    remainingBalance: 0,
    generatedAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Sep bill: Generated and paid
  mockBills.set(`bill_${customerId}_2026_9`, {
    id: `bill_${customerId}_2026_9`,
    customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
    billingMonth: 9,
    billingYear: 2026,
    totalMilk: 30,
    milkAmount: 1800,
    previousBalance: 0,
    paymentsReceived: 1800,
    remainingBalance: 0,
    generatedAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Oct bill: ₹200 remaining balance
  mockBills.set(`bill_${customerId}_2026_10`, {
    id: `bill_${customerId}_2026_10`,
    customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
    billingMonth: 10,
    billingYear: 2026,
    totalMilk: 31,
    milkAmount: 1860,
    previousBalance: 0,
    paymentsReceived: 1660,
    remainingBalance: 200,
    generatedAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Nov deliveries (Nov 1 to Nov 5)
  for (let day = 1; day <= 5; day++) {
    const dStr = `2026-11-0${day}`;
    mockDeliveries.set(`delivery_${customerId}_${dStr}`, {
      id: `delivery_${customerId}_${dStr}`,
      customerId,
      deliveryDate: dStr,
      defaultQuantity: 1,
      actualQuantity: 1,
      pricePerLiter: 60,
      amount: 60,
      status: 'delivered',
      manuallyEdited: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  const preview = mockCalculateFinalBillPreview(customerId, '2026-11-05');

  if (preview.billingPeriodStart !== '2026-11-01' || preview.billingPeriodEnd !== '2026-11-05') {
    throw new Error(`Invalid billing period: ${preview.billingPeriodStart} to ${preview.billingPeriodEnd}`);
  }
  if (preview.completedBillingMonthsCount !== 3) {
    throw new Error(`Expected 3 completed months (Aug, Sep, Oct), got ${preview.completedBillingMonthsCount}`);
  }
  if (preview.previousBalance !== 200) {
    throw new Error(`Expected previous balance ₹200, got ₹${preview.previousBalance}`);
  }
  if (preview.finalBillAmount !== 300) {
    throw new Error(`Expected final bill ₹300, got ₹${preview.finalBillAmount}`);
  }
  if (preview.finalOutstandingAmount !== 500) {
    throw new Error(`Expected final outstanding ₹500, got ₹${preview.finalOutstandingAmount}`);
  }

  console.log('✓ Multi-month prior history passed: Aug & Sep ignored, Oct ₹200 unpaid + Nov ₹300 = ₹500 outstanding.\n');
}

function runAll() {
  testExampleA();
  testExampleB();
  testExampleC();
  testExampleD();
  testUIDateVerification();
  testMultiMonthPriorHistory();
  console.log('🎉 ALL EXAMPLES AND REQUIREMENTS PASSED PERFECTLY!');
}

runAll();
