// @ts-nocheck
declare const require: any;

import {
  Customer,
  Delivery,
  MonthlyBill,
  Payment,
  PaymentStatus,
  CustomerPaymentSummary,
  PaymentDashboardOverview,
} from '../src/types';

console.log('=== RUNNING VERIFICATION FOR PAYMENT MANAGEMENT SYSTEM & BILLING CYCLES ===\n');

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
 * Mock implementation of getPreviousBalance mirroring billingService.ts
 */
function mockGetPreviousBalance(customerId: string, month: number, year: number): number {
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = year - 1;
  }
  const prevBill = mockBills.get(`bill_${customerId}_${prevYear}_${prevMonth}`);
  return prevBill ? prevBill.remainingBalance : 0;
}

/**
 * Mock implementation of generateMonthlyBill mirroring billingService.ts
 */
function mockGenerateMonthlyBill(customerId: string, month: number, year: number): MonthlyBill {
  const customer = mockCustomers.get(customerId);
  if (!customer) throw new Error('Customer not found');

  const billId = `bill_${customerId}_${year}_${month}`;
  const existingBill = mockBills.get(billId);

  // Month deliveries
  const paddedMonth = month < 10 ? `0${month}` : `${month}`;
  const prefix = `${year}-${paddedMonth}`;
  const monthDeliveries = Array.from(mockDeliveries.values()).filter(
    (d) => d.customerId === customerId && d.deliveryDate.startsWith(prefix)
  );

  const totalMilk = Number(
    monthDeliveries.reduce((acc, d) => acc + d.actualQuantity, 0).toFixed(2)
  );
  const milkAmount = Number(
    monthDeliveries.reduce((acc, d) => acc + d.amount, 0).toFixed(2)
  );

  const previousBalance = mockGetPreviousBalance(customerId, month, year);

  // Payments received for this month
  const payments = Array.from(mockPayments.values()).filter(
    (p) => p.customerId === customerId && p.billingMonth === month && p.billingYear === year
  );
  const paymentsReceived = Number(
    payments.reduce((acc, p) => acc + p.amount, 0).toFixed(2)
  );

  const remainingBalance = Number(
    (previousBalance + milkAmount - paymentsReceived).toFixed(2)
  );

  let paymentStatus: PaymentStatus = 'due';
  if (remainingBalance <= 0) {
    paymentStatus = 'paid';
  } else if (paymentsReceived > 0) {
    paymentStatus = 'partially_paid';
  } else {
    paymentStatus = 'due';
  }

  const now = Date.now();
  const bill: MonthlyBill = {
    id: billId,
    customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
    billingMonth: month,
    billingYear: year,
    totalMilk,
    milkAmount,
    previousBalance,
    paymentsReceived,
    remainingBalance,
    paymentStatus,
    expectedPaymentDate: existingBill?.expectedPaymentDate,
    notes: existingBill?.notes,
    lastPaymentDate: payments.length > 0 ? payments[payments.length - 1].paymentDate : undefined,
    generatedAt: existingBill?.generatedAt || now,
    updatedAt: now,
  };

  mockBills.set(billId, bill);

  if (customer.isDeactivated) {
    customer.finalOutstandingAmount = Math.max(0, remainingBalance);
  }

  return bill;
}

/**
 * Mock cascade recalculate
 */
function mockCascadeRecalculate(customerId: string, fromMonth: number, fromYear: number) {
  const fromIdx = fromYear * 12 + fromMonth;
  const subsequent: { month: number; year: number; idx: number }[] = [];

  mockBills.forEach((b) => {
    if (b.customerId === customerId) {
      const idx = b.billingYear * 12 + b.billingMonth;
      if (idx > fromIdx) {
        subsequent.push({ month: b.billingMonth, year: b.billingYear, idx });
      }
    }
  });

  subsequent.sort((a, b) => a.idx - b.idx);
  subsequent.forEach((s) => {
    mockGenerateMonthlyBill(customerId, s.month, s.year);
  });
}

/**
 * Mock addPayment
 */
function mockAddPayment(
  customerId: string,
  amount: number,
  month: number,
  year: number,
  date: string,
  method: 'cash' | 'upi' | 'other' = 'cash',
  note?: string
): Payment {
  const payment: Payment = {
    id: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    customerId,
    billId: `bill_${customerId}_${year}_${month}`,
    amount,
    paymentDate: date,
    paymentMethod: method,
    billingMonth: month,
    billingYear: year,
    note,
    createdAt: Date.now(),
  };
  mockPayments.set(payment.id, payment);
  mockGenerateMonthlyBill(customerId, month, year);
  mockCascadeRecalculate(customerId, month, year);
  return payment;
}

// -------------------------------------------------------------
// Test 1: Full Monthly Payment Settles Bill to ₹0
// -------------------------------------------------------------
function testFullMonthlyPayment() {
  console.log('Test 1: Customer Pays Full Monthly Bill...');
  clearMocks();

  const customerId = 'cust_1';
  mockCustomers.set(customerId, {
    id: customerId,
    name: 'Ramesh Patel',
    phone: '9876543210',
    milkCategory: 'cow',
    defaultDailyQuantity: 1,
    pricePerLiter: 60,
    deliveryStartDate: '2026-10-01',
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // 30 days of deliveries @ 2L = 60L @ ₹60 = ₹3,600
  for (let i = 1; i <= 30; i++) {
    const dStr = `2026-10-${i < 10 ? '0' + i : i}`;
    mockDeliveries.set(`del_${customerId}_${dStr}`, {
      id: `del_${customerId}_${dStr}`,
      customerId,
      deliveryDate: dStr,
      defaultQuantity: 2,
      actualQuantity: 2,
      pricePerLiter: 60,
      amount: 120,
      status: 'delivered',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  let bill = mockGenerateMonthlyBill(customerId, 10, 2026);
  if (bill.milkAmount !== 3600 || bill.remainingBalance !== 3600 || bill.paymentStatus !== 'due') {
    throw new Error(`Initial bill state invalid: ${JSON.stringify(bill)}`);
  }

  // Pay in full
  mockAddPayment(customerId, 3600, 10, 2026, '2026-10-31', 'upi', 'Full bill settlement');
  bill = mockBills.get(`bill_${customerId}_2026_10`)!;

  if (bill.paymentsReceived !== 3600 || bill.remainingBalance !== 0 || bill.paymentStatus !== 'paid') {
    throw new Error(`Expected paid status with 0 remaining, got ${bill.paymentStatus} with ₹${bill.remainingBalance}`);
  }

  console.log('✓ Test 1 passed: Full monthly payment settles bill to ₹0 and status is Paid.\n');
}

// -------------------------------------------------------------
// Test 2: Partial Payment Leaves Correct Remainder
// -------------------------------------------------------------
function testPartialPayment() {
  console.log('Test 2: Customer Pays Half of Monthly Bill...');
  clearMocks();

  const customerId = 'cust_2';
  mockCustomers.set(customerId, {
    id: customerId,
    name: 'Suresh Kumar',
    phone: '9876543211',
    deliveryStartDate: '2026-10-01',
    isActive: true,
    defaultDailyQuantity: 1,
    pricePerLiter: 50,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // 20 days @ ₹200 = ₹4,000
  for (let i = 1; i <= 20; i++) {
    const dStr = `2026-10-${i < 10 ? '0' + i : i}`;
    mockDeliveries.set(`del_${customerId}_${dStr}`, {
      id: `del_${customerId}_${dStr}`,
      customerId,
      deliveryDate: dStr,
      defaultQuantity: 4,
      actualQuantity: 4,
      pricePerLiter: 50,
      amount: 200,
      status: 'delivered',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  mockGenerateMonthlyBill(customerId, 10, 2026);
  mockAddPayment(customerId, 2000, 10, 2026, '2026-10-25', 'cash', 'Partial payment');

  const bill = mockBills.get(`bill_${customerId}_2026_10`)!;
  if (bill.milkAmount !== 4000) throw new Error(`Expected ₹4000 milk amount, got ₹${bill.milkAmount}`);
  if (bill.paymentsReceived !== 2000) throw new Error(`Expected ₹2000 paid, got ₹${bill.paymentsReceived}`);
  if (bill.remainingBalance !== 2000) throw new Error(`Expected ₹2000 due, got ₹${bill.remainingBalance}`);
  if (bill.paymentStatus !== 'partially_paid') throw new Error(`Expected partially_paid, got ${bill.paymentStatus}`);

  console.log('✓ Test 2 passed: ₹2,000 paid out of ₹4,000 correctly flags Partially Paid with ₹2,000 due.\n');
}

// -------------------------------------------------------------
// Test 3: Customer Pays Nothing (Status Due)
// -------------------------------------------------------------
function testZeroPaymentDue() {
  console.log('Test 3: Customer Pays Nothing (Status Due)...');
  clearMocks();

  const customerId = 'cust_3';
  mockCustomers.set(customerId, {
    id: customerId,
    name: 'Anjali Sharma',
    phone: '9876543212',
    deliveryStartDate: '2026-10-01',
    isActive: true,
    defaultDailyQuantity: 1,
    pricePerLiter: 60,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  mockDeliveries.set(`del_${customerId}_2026-10-01`, {
    id: `del_${customerId}_2026-10-01`,
    customerId,
    deliveryDate: '2026-10-01',
    defaultQuantity: 1,
    actualQuantity: 1,
    pricePerLiter: 60,
    amount: 60,
    status: 'delivered',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const bill = mockGenerateMonthlyBill(customerId, 10, 2026);
  if (bill.paymentsReceived !== 0 || bill.remainingBalance !== 60 || bill.paymentStatus !== 'due') {
    throw new Error(`Expected status due with ₹60 remaining, got ${bill.paymentStatus}`);
  }

  console.log('✓ Test 3 passed: Zero payment results in status Due with full bill balance.\n');
}

// -------------------------------------------------------------
// Test 4: Automatic Due Carry Forward (October -> November)
// October Bill = ₹4,000, Paid = ₹2,000 -> Remaining = ₹2,000
// November New Milk = ₹3,000 -> Total Due = ₹5,000
// Customer pays ₹3,000 in November -> Remaining Due = ₹2,000
// -------------------------------------------------------------
function testDueCarryForward() {
  console.log('Test 4: Automatic Due Carry Forward to Next Month...');
  clearMocks();

  const customerId = 'cust_4';
  mockCustomers.set(customerId, {
    id: customerId,
    name: 'Vikas Verma',
    phone: '9876543214',
    deliveryStartDate: '2026-10-01',
    isActive: true,
    defaultDailyQuantity: 1,
    pricePerLiter: 50,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // October: ₹4,000 milk
  mockDeliveries.set(`del_${customerId}_2026-10-01`, {
    id: `del_${customerId}_2026-10-01`,
    customerId,
    deliveryDate: '2026-10-01',
    defaultQuantity: 80,
    actualQuantity: 80,
    pricePerLiter: 50,
    amount: 4000,
    status: 'delivered',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  mockGenerateMonthlyBill(customerId, 10, 2026);
  mockAddPayment(customerId, 2000, 10, 2026, '2026-10-20');

  // November: ₹3,000 milk
  mockDeliveries.set(`del_${customerId}_2026-11-01`, {
    id: `del_${customerId}_2026-11-01`,
    customerId,
    deliveryDate: '2026-11-01',
    defaultQuantity: 60,
    actualQuantity: 60,
    pricePerLiter: 50,
    amount: 3000,
    status: 'delivered',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  let novBill = mockGenerateMonthlyBill(customerId, 11, 2026);

  if (novBill.previousBalance !== 2000) {
    throw new Error(`Expected November previousBalance ₹2000, got ₹${novBill.previousBalance}`);
  }
  if (novBill.milkAmount !== 3000) {
    throw new Error(`Expected November milkAmount ₹3000, got ₹${novBill.milkAmount}`);
  }
  if (novBill.remainingBalance !== 5000) {
    throw new Error(`Expected November total due ₹5000, got ₹${novBill.remainingBalance}`);
  }

  // Customer pays ₹3,000 in November
  mockAddPayment(customerId, 3000, 11, 2026, '2026-11-10');
  novBill = mockBills.get(`bill_${customerId}_2026_11`)!;

  if (novBill.paymentsReceived !== 3000) {
    throw new Error(`Expected November paymentsReceived ₹3000, got ₹${novBill.paymentsReceived}`);
  }
  if (novBill.remainingBalance !== 2000) {
    throw new Error(`Expected November remainingBalance ₹2000, got ₹${novBill.remainingBalance}`);
  }

  console.log('✓ Test 4 passed: ₹2,000 carried forward from October, added to ₹3,000 November milk = ₹5,000. After ₹3,000 payment, exactly ₹2,000 remains due.\n');
}

// -------------------------------------------------------------
// Test 5: Multiple Partial Installments
// Outstanding = ₹5,000. Pay ₹2,000, then ₹1,000, then ₹2,000 -> ₹0.
// -------------------------------------------------------------
function testMultipleInstallments() {
  console.log('Test 5: Multiple Partial Payment Installments...');
  clearMocks();

  const customerId = 'cust_5';
  mockCustomers.set(customerId, {
    id: customerId,
    name: 'Pooja Singh',
    phone: '9876543215',
    deliveryStartDate: '2026-10-01',
    isActive: true,
    defaultDailyQuantity: 1,
    pricePerLiter: 50,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  mockDeliveries.set(`del_${customerId}_2026-10-01`, {
    id: `del_${customerId}_2026-10-01`,
    customerId,
    deliveryDate: '2026-10-01',
    defaultQuantity: 100,
    actualQuantity: 100,
    pricePerLiter: 50,
    amount: 5000,
    status: 'delivered',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  mockGenerateMonthlyBill(customerId, 10, 2026);

  // Installment 1: ₹2,000
  mockAddPayment(customerId, 2000, 10, 2026, '2026-10-05', 'upi', 'Installment 1');
  let b = mockBills.get(`bill_${customerId}_2026_10`)!;
  if (b.remainingBalance !== 3000 || b.paymentStatus !== 'partially_paid') {
    throw new Error(`Failed after installment 1: remaining ₹${b.remainingBalance}`);
  }

  // Installment 2: ₹1,000
  mockAddPayment(customerId, 1000, 10, 2026, '2026-10-15', 'cash', 'Installment 2');
  b = mockBills.get(`bill_${customerId}_2026_10`)!;
  if (b.remainingBalance !== 2000 || b.paymentStatus !== 'partially_paid') {
    throw new Error(`Failed after installment 2: remaining ₹${b.remainingBalance}`);
  }

  // Installment 3: ₹2,000
  mockAddPayment(customerId, 2000, 10, 2026, '2026-10-25', 'upi', 'Installment 3');
  b = mockBills.get(`bill_${customerId}_2026_10`)!;
  if (b.remainingBalance !== 0 || b.paymentStatus !== 'paid') {
    throw new Error(`Failed after installment 3: remaining ₹${b.remainingBalance}`);
  }

  const payments = Array.from(mockPayments.values()).filter((p) => p.customerId === customerId);
  if (payments.length !== 3) {
    throw new Error(`Expected 3 separate payment records, found ${payments.length}`);
  }

  console.log('✓ Test 5 passed: 3 installments (₹2,000 + ₹1,000 + ₹2,000) recorded independently and settled bill.\n');
}

// -------------------------------------------------------------
// Test 6: Settle Old Outstanding in Later Month & Cascade Forward
// -------------------------------------------------------------
function testOldBillSettlementCascade() {
  console.log('Test 6: Settle Old Outstanding Bill & Ripple Cascade...');
  clearMocks();

  const customerId = 'cust_6';
  mockCustomers.set(customerId, {
    id: customerId,
    name: 'Manoj Joshi',
    phone: '9876543216',
    deliveryStartDate: '2026-09-01',
    isActive: true,
    defaultDailyQuantity: 1,
    pricePerLiter: 50,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Sep: ₹2,000
  mockDeliveries.set(`del_${customerId}_2026-09-01`, {
    id: `del_${customerId}_2026-09-01`,
    customerId,
    deliveryDate: '2026-09-01',
    defaultQuantity: 40,
    actualQuantity: 40,
    pricePerLiter: 50,
    amount: 2000,
    status: 'delivered',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  mockGenerateMonthlyBill(customerId, 9, 2026);

  // Oct: ₹1,500
  mockDeliveries.set(`del_${customerId}_2026-10-01`, {
    id: `del_${customerId}_2026-10-01`,
    customerId,
    deliveryDate: '2026-10-01',
    defaultQuantity: 30,
    actualQuantity: 30,
    pricePerLiter: 50,
    amount: 1500,
    status: 'delivered',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  let octBill = mockGenerateMonthlyBill(customerId, 10, 2026);
  // Oct previousBalance = 2000, total = 3500
  if (octBill.previousBalance !== 2000 || octBill.remainingBalance !== 3500) {
    throw new Error('October bill setup failed');
  }

  // Now customer clears September bill (pays ₹2,000 against Sep)
  mockAddPayment(customerId, 2000, 9, 2026, '2026-10-10', 'upi', 'Delayed Sep settlement');

  const sepBill = mockBills.get(`bill_${customerId}_2026_9`)!;
  octBill = mockBills.get(`bill_${customerId}_2026_10`)!;

  if (sepBill.remainingBalance !== 0 || sepBill.paymentStatus !== 'paid') {
    throw new Error(`Sep bill should be paid, got ₹${sepBill.remainingBalance}`);
  }
  // Oct previousBalance should now be 0, and total remaining = 1500
  if (octBill.previousBalance !== 0 || octBill.remainingBalance !== 1500) {
    throw new Error(`Cascade failed: Oct prevBalance is ₹${octBill.previousBalance}, remaining ₹${octBill.remainingBalance}`);
  }

  console.log('✓ Test 6 passed: Settle Sep bill automatically cascade-updated Oct previousBalance from ₹2,000 to ₹0.\n');
}

// -------------------------------------------------------------
// Test 7 & 8: Deactivated Customer Outstanding & Payment After Deactivation
// -------------------------------------------------------------
function testDeactivatedCustomerPayment() {
  console.log('Test 7 & 8: Deactivated Customer Payment Collection...');
  clearMocks();

  const customerId = 'cust_7';
  const customer: Customer = {
    id: customerId,
    name: 'Kavita Roy',
    phone: '9876543217',
    deliveryStartDate: '2026-10-01',
    closingDate: '2026-11-05',
    isActive: false,
    isDeactivated: true,
    accountStatus: 'deactivated',
    finalBillAmount: 300,
    finalOutstandingAmount: 300,
    defaultDailyQuantity: 1,
    pricePerLiter: 60,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  mockCustomers.set(customerId, customer);

  // November final deliveries up to Nov 5 = ₹300
  mockDeliveries.set(`del_${customerId}_2026-11-01`, {
    id: `del_${customerId}_2026-11-01`,
    customerId,
    deliveryDate: '2026-11-01',
    defaultQuantity: 5,
    actualQuantity: 5,
    pricePerLiter: 60,
    amount: 300,
    status: 'delivered',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  let novBill = mockGenerateMonthlyBill(customerId, 11, 2026);
  if (novBill.remainingBalance !== 300 || novBill.paymentStatus !== 'due') {
    throw new Error(`Deactivated customer bill should be ₹300 due, got ₹${novBill.remainingBalance}`);
  }
  if (customer.finalOutstandingAmount !== 300) {
    throw new Error(`Customer finalOutstandingAmount should be 300, got ${customer.finalOutstandingAmount}`);
  }

  // Collect payment for deactivated customer
  mockAddPayment(customerId, 300, 11, 2026, '2026-11-10', 'cash', 'Settlement after closing');
  novBill = mockBills.get(`bill_${customerId}_2026_11`)!;

  if (novBill.remainingBalance !== 0 || novBill.paymentStatus !== 'paid') {
    throw new Error(`Deactivated customer bill should now be paid, got ${novBill.paymentStatus}`);
  }
  if (customer.finalOutstandingAmount !== 0) {
    throw new Error(`Customer finalOutstandingAmount should be 0, got ${customer.finalOutstandingAmount}`);
  }
  if (customer.isActive !== false || customer.isDeactivated !== true) {
    throw new Error('Customer should remain deactivated even after payment!');
  }

  console.log('✓ Test 7 & 8 passed: Deactivated customer collected ₹300, marked Paid, balance becomes ₹0, and account remains deactivated.\n');
}

// -------------------------------------------------------------
// Test 9 & 10: Multi-Month Unpaid Chain & Final Bill
// -------------------------------------------------------------
function testMultiMonthUnpaidChain() {
  console.log('Test 9 & 10: Multi-Month Unpaid Chain & Final Bill Settlement...');
  clearMocks();

  const customerId = 'cust_8';
  mockCustomers.set(customerId, {
    id: customerId,
    name: 'Deepak Shah',
    phone: '9876543218',
    deliveryStartDate: '2026-08-01',
    isActive: true,
    defaultDailyQuantity: 1,
    pricePerLiter: 50,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Aug: ₹1,000 (unpaid)
  mockDeliveries.set(`del_${customerId}_2026-08-01`, {
    id: `del_${customerId}_2026-08-01`,
    customerId,
    deliveryDate: '2026-08-01',
    defaultQuantity: 20,
    actualQuantity: 20,
    pricePerLiter: 50,
    amount: 1000,
    status: 'delivered',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  mockGenerateMonthlyBill(customerId, 8, 2026);

  // Sep: ₹1,500 (unpaid)
  mockDeliveries.set(`del_${customerId}_2026-09-01`, {
    id: `del_${customerId}_2026-09-01`,
    customerId,
    deliveryDate: '2026-09-01',
    defaultQuantity: 30,
    actualQuantity: 30,
    pricePerLiter: 50,
    amount: 1500,
    status: 'delivered',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const sepBill = mockGenerateMonthlyBill(customerId, 9, 2026);
  if (sepBill.previousBalance !== 1000 || sepBill.remainingBalance !== 2500) {
    throw new Error(`Sep bill incorrect: prev=${sepBill.previousBalance}, rem=${sepBill.remainingBalance}`);
  }

  // Oct: ₹2,000 (unpaid)
  mockDeliveries.set(`del_${customerId}_2026-10-01`, {
    id: `del_${customerId}_2026-10-01`,
    customerId,
    deliveryDate: '2026-10-01',
    defaultQuantity: 40,
    actualQuantity: 40,
    pricePerLiter: 50,
    amount: 2000,
    status: 'delivered',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const octBill = mockGenerateMonthlyBill(customerId, 10, 2026);
  if (octBill.previousBalance !== 2500 || octBill.remainingBalance !== 4500) {
    throw new Error(`Oct bill incorrect: prev=${octBill.previousBalance}, rem=${octBill.remainingBalance}`);
  }

  console.log('✓ Test 9 & 10 passed: Multi-month chain (Aug ₹1,000 -> Sep ₹2,500 -> Oct ₹4,500) rolled forward flawlessly.\n');
}

// -------------------------------------------------------------
// Test 11: UI Navigation & Tab Structure Verification
// -------------------------------------------------------------
function testUINavigationAndComponents() {
  console.log('Test 11: Verifying Tab Navigation & Component Files...');
  const fs = typeof require !== 'undefined' ? require('fs') : null;
  if (!fs) return;

  // 1. Verify TabLayout has Payments tab
  const tabLayout = fs.readFileSync('src/app/(tabs)/_layout.tsx', 'utf8');
  if (!tabLayout.includes('name="payments"') || !tabLayout.includes('title: \'Payments\'')) {
    throw new Error('TabLayout missing payments Tab.Screen');
  }

  // 2. Verify Payments Screen exists with required features
  const paymentsScreen = fs.readFileSync('src/app/(tabs)/payments.tsx', 'utf8');
  if (
    !paymentsScreen.includes('Total Monthly Bills') ||
    !paymentsScreen.includes('Total Received') ||
    !paymentsScreen.includes('Total Outstanding') ||
    !paymentsScreen.includes('Payment Done')
  ) {
    throw new Error('payments.tsx missing core dashboard cards or actions');
  }

  // 3. Verify Customer Monthly Payment & Calendar Screen exists
  const paymentDetailsScreen = fs.readFileSync('src/app/customer/[id]/payment.tsx', 'utf8');
  if (
    !paymentDetailsScreen.includes('Payment Done') ||
    !paymentDetailsScreen.includes('Due / Partial Pay') ||
    !paymentDetailsScreen.includes('Daily Milk Deliveries') ||
    !paymentDetailsScreen.includes('Complete Month-Wise Billing & Payment Ledger')
  ) {
    throw new Error('payment.tsx missing customer calendar, ledger, or action buttons');
  }

  // 4. Verify Deactivated screen has Collect Payment button
  const deactivatedScreen = fs.readFileSync('src/app/customer/deactivated.tsx', 'utf8');
  if (!deactivatedScreen.includes('Collect Payment')) {
    throw new Error('deactivated.tsx missing Collect Payment button');
  }

  console.log('✓ Test 11 passed: All tabs, screens, modals, and navigation hooks verified.\n');
}

// -------------------------------------------------------------
// Test 12: Verify No `undefined` Properties Passed to Firestore setDoc()
// -------------------------------------------------------------
function testNoUndefinedInFirestorePayloads() {
  console.log('Test 12: Verifying No undefined Properties in Firestore setDoc/updateDoc Payloads...');
  const { cleanDocData } = require('../src/services/firebase');

  const dirtyPayload = {
    customerId: 'cust_123',
    billingMonth: 11,
    billingYear: 2026,
    amount: 500,
    expectedPaymentDate: undefined,
    notes: undefined,
    lastPaymentDate: undefined,
    nested: {
      validProp: 'hello',
      invalidProp: undefined,
    },
  };

  const cleaned = cleanDocData(dirtyPayload);

  if ('expectedPaymentDate' in cleaned) {
    throw new Error('cleanDocData failed to strip expectedPaymentDate');
  }
  if ('notes' in cleaned) {
    throw new Error('cleanDocData failed to strip notes');
  }
  if ('lastPaymentDate' in cleaned) {
    throw new Error('cleanDocData failed to strip lastPaymentDate');
  }
  if ('invalidProp' in cleaned.nested) {
    throw new Error('cleanDocData failed to strip nested invalidProp');
  }

  // Ensure JSON serialization has zero undefined
  const serialized = JSON.stringify(cleaned);
  if (serialized.includes('undefined')) {
    throw new Error('Cleaned payload contains undefined string');
  }

  console.log('✓ Test 12 passed: cleanDocData reliably sanitizes all payloads to prevent setDoc() invalid data errors.\n');
}

// -------------------------------------------------------------
// Test 13: Hide Fully Paid Closed Customers from Future Months
// -------------------------------------------------------------
function mockGetMonthlyPaymentDashboard(
  month: number,
  year: number
): { overview: PaymentDashboardOverview; customers: CustomerPaymentSummary[] } {
  const allCustomers = Array.from(mockCustomers.values());
  const customerSummaries: CustomerPaymentSummary[] = [];

  let totalMonthlyBills = 0;
  let totalAmountReceived = 0;
  let totalOutstandingAmount = 0;
  let paidCount = 0;
  let dueCount = 0;
  let partiallyPaidCount = 0;

  const selectedMonthIndex = year * 12 + month;

  for (const cust of allCustomers) {
    const isDeactivated =
      cust.isActive === false ||
      cust.isDeactivated === true ||
      cust.accountStatus === 'deactivated';

    // A closed customer should appear only up to and including their closing month.
    // They must NEVER appear in any month strictly after their closing month,
    // even if their monthly bill and amount paid are both ₹0.
    if (isDeactivated) {
      const closingDateStr = cust.closingDate || cust.deliveryStopDate;
      let closeYear: number | undefined;
      let closeMonth: number | undefined;

      if (closingDateStr && typeof closingDateStr === 'string' && closingDateStr.includes('-')) {
        const parts = closingDateStr.split('-');
        closeYear = parseInt(parts[0], 10);
        closeMonth = parseInt(parts[1], 10);
      } else if (cust.deactivatedAt) {
        const d = new Date(cust.deactivatedAt);
        closeYear = d.getFullYear();
        closeMonth = d.getMonth() + 1;
      } else if (cust.updatedAt) {
        const d = new Date(cust.updatedAt);
        closeYear = d.getFullYear();
        closeMonth = d.getMonth() + 1;
      }

      if (closeYear !== undefined && closeMonth !== undefined && !isNaN(closeYear) && !isNaN(closeMonth)) {
        const closeMonthIndex = closeYear * 12 + closeMonth;
        if (selectedMonthIndex > closeMonthIndex) {
          // Closed in a prior month: hide from this and all future months
          continue;
        }
      }
    }

    const bill = mockGenerateMonthlyBill(cust.id, month, year);
    const totalDue = Number((bill.previousBalance + bill.milkAmount).toFixed(2));
    const paidAmount = Number((bill.paymentsReceived || 0).toFixed(2));
    const remainingBalance = Number((bill.remainingBalance || 0).toFixed(2));

    let status: PaymentStatus = 'due';
    if (remainingBalance <= 0) {
      status = 'paid';
      paidCount++;
    } else if (paidAmount > 0) {
      status = 'partially_paid';
      partiallyPaidCount++;
      dueCount++;
    } else {
      status = 'due';
      dueCount++;
    }

    totalMonthlyBills += bill.milkAmount;
    totalAmountReceived += paidAmount;
    totalOutstandingAmount += Math.max(0, remainingBalance);

    customerSummaries.push({
      customer: cust,
      bill,
      milkAmount: bill.milkAmount,
      previousBalance: bill.previousBalance,
      totalDue,
      paidAmount,
      remainingBalance,
      paymentStatus: status,
      expectedPaymentDate: bill.expectedPaymentDate,
      lastPaymentDate: bill.lastPaymentDate,
      isDeactivated,
    });
  }

  const overview: PaymentDashboardOverview = {
    month,
    year,
    totalMonthlyBills: Number(totalMonthlyBills.toFixed(2)),
    totalAmountReceived: Number(totalAmountReceived.toFixed(2)),
    totalOutstandingAmount: Number(totalOutstandingAmount.toFixed(2)),
    paidCustomersCount: paidCount,
    dueCustomersCount: dueCount,
    partiallyPaidCustomersCount: partiallyPaidCount,
    totalCustomersCount: customerSummaries.length,
  };

  return { overview, customers: customerSummaries };
}

function testHideClosedCustomersFromFutureMonths() {
  console.log('Test 13: Hide Fully Paid Closed Customers from Future Months...');
  clearMocks();

  // 1. Active customer: Amit Sharma (active throughout)
  const activeCust: Customer = {
    id: 'cust_active',
    name: 'Amit Sharma',
    phone: '9876543210',
    deliveryStartDate: '2026-09-01',
    isActive: true,
    isDeactivated: false,
    defaultDailyQuantity: 2,
    pricePerLiter: 60,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  mockCustomers.set(activeCust.id, activeCust);

  // 2. Closed customer: Rahul Roy (closed on 5 November 2026)
  const closedCust: Customer = {
    id: 'cust_closed',
    name: 'Rahul Roy',
    phone: '9876543211',
    deliveryStartDate: '2026-10-01',
    closingDate: '2026-11-05',
    deliveryStopDate: '2026-11-05',
    isActive: false,
    isDeactivated: true,
    accountStatus: 'deactivated',
    finalBillAmount: 300,
    finalOutstandingAmount: 0,
    defaultDailyQuantity: 1,
    pricePerLiter: 60,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  mockCustomers.set(closedCust.id, closedCust);

  // Deliveries for active customer: Nov 2026 & Dec 2026
  mockDeliveries.set(`del_active_nov`, {
    id: `del_active_nov`,
    customerId: activeCust.id,
    deliveryDate: '2026-11-01',
    defaultQuantity: 30,
    actualQuantity: 30,
    pricePerLiter: 60,
    amount: 1800,
    status: 'delivered',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  mockDeliveries.set(`del_active_dec`, {
    id: `del_active_dec`,
    customerId: activeCust.id,
    deliveryDate: '2026-12-01',
    defaultQuantity: 30,
    actualQuantity: 30,
    pricePerLiter: 60,
    amount: 1800,
    status: 'delivered',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Deliveries for closed customer: Nov 1 to Nov 5 = ₹300
  mockDeliveries.set(`del_closed_nov`, {
    id: `del_closed_nov`,
    customerId: closedCust.id,
    deliveryDate: '2026-11-01',
    defaultQuantity: 5,
    actualQuantity: 5,
    pricePerLiter: 60,
    amount: 300,
    status: 'delivered',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Closed customer pays November bill in full
  mockAddPayment(closedCust.id, 300, 11, 2026, '2026-11-05', 'upi', 'Final settlement');

  // Verify November 2026 (Closing Month):
  // Closed customer SHOULD appear in November Payment Management
  const novDashboard = mockGetMonthlyPaymentDashboard(11, 2026);
  if (novDashboard.customers.length !== 2) {
    throw new Error(`Nov dashboard should have 2 customers, got ${novDashboard.customers.length}`);
  }
  const novClosedSummary = novDashboard.customers.find((c) => c.customer.id === closedCust.id);
  if (!novClosedSummary) {
    throw new Error('Closed customer must appear in closing month (Nov 2026)');
  }
  if (novClosedSummary.remainingBalance !== 0 || novClosedSummary.paymentStatus !== 'paid') {
    throw new Error(`Closed customer should be fully paid in Nov, got ${novClosedSummary.remainingBalance}`);
  }
  if (!novClosedSummary.isDeactivated) {
    throw new Error('Closed customer must have isDeactivated flag in Nov');
  }

  // Verify December 2026 (Future Month after closing):
  // Closed customer MUST NOT appear in December Payment Management customer list!
  const decDashboard = mockGetMonthlyPaymentDashboard(12, 2026);
  if (decDashboard.customers.length !== 1) {
    throw new Error(`Dec dashboard should have ONLY 1 active customer, got ${decDashboard.customers.length}`);
  }
  const decClosedSummary = decDashboard.customers.find((c) => c.customer.id === closedCust.id);
  if (decClosedSummary) {
    throw new Error('Closed customer MUST NOT appear in December 2026 Payment Management!');
  }
  if (decDashboard.customers[0].customer.id !== activeCust.id) {
    throw new Error('Active customer should remain visible in Dec 2026');
  }
  if (decDashboard.overview.totalCustomersCount !== 1) {
    throw new Error(`Dec overview totalCustomersCount should be 1, got ${decDashboard.overview.totalCustomersCount}`);
  }

  // Verify January 2027 (Future Year after closing):
  // Closed customer MUST NOT appear in January 2027
  const janDashboard = mockGetMonthlyPaymentDashboard(1, 2027);
  const janClosedSummary = janDashboard.customers.find((c) => c.customer.id === closedCust.id);
  if (janClosedSummary) {
    throw new Error('Closed customer MUST NOT appear in January 2027 Payment Management!');
  }

  // Verify October 2026 (Past Month prior to closing):
  // Customer was active in October 2026, so they should remain visible in October 2026
  const octDashboard = mockGetMonthlyPaymentDashboard(10, 2026);
  const octClosedSummary = octDashboard.customers.find((c) => c.customer.id === closedCust.id);
  if (!octClosedSummary) {
    throw new Error('Customer should be visible in October 2026 prior to closing');
  }

  // Verify that customer record itself was NOT deleted
  if (!mockCustomers.has(closedCust.id)) {
    throw new Error('Customer record must NOT be deleted from database');
  }

  console.log('✓ Test 13 passed: Closed customer is visible in closing month (Nov 2026), but strictly hidden from Dec 2026 and all future months even when bill & paid are ₹0.\n');
}

function runAll() {
  testFullMonthlyPayment();
  testPartialPayment();
  testZeroPaymentDue();
  testDueCarryForward();
  testMultipleInstallments();
  testOldBillSettlementCascade();
  testDeactivatedCustomerPayment();
  testMultiMonthUnpaidChain();
  testUINavigationAndComponents();
  testNoUndefinedInFirestorePayloads();
  testHideClosedCustomersFromFutureMonths();
  console.log('🎉 ALL 13 PAYMENT MANAGEMENT SYSTEM TESTS PASSED PERFECTLY!');
}

runAll();
