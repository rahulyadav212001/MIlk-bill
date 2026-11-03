import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db, ensureAuthenticatedUserId, cleanDocData } from './firebase';
import {
  Payment,
  MonthlyBill,
  Customer,
  PaymentStatus,
  CustomerPaymentSummary,
  PaymentDashboardOverview,
} from '../types';
import {
  generateMonthlyBill,
  getBillForCustomer,
  getBillDocId,
  cascadeRecalculateCustomerBills,
} from './billingService';
import { getCustomers, getCustomerById } from './customerService';
import { getTodayKolkata } from '../utils/date';

function getPaymentsCollection(userId: string) {
  return collection(db, 'users', userId, 'payments');
}

export async function getPayments(
  customerId?: string,
  month?: number,
  year?: number
): Promise<Payment[]> {
  const userId = await ensureAuthenticatedUserId();
  const colRef = getPaymentsCollection(userId);

  let q = query(colRef, orderBy('paymentDate', 'desc'));

  if (customerId && month && year) {
    q = query(
      colRef,
      where('customerId', '==', customerId),
      where('billingMonth', '==', month),
      where('billingYear', '==', year)
    );
  } else if (customerId) {
    q = query(colRef, where('customerId', '==', customerId));
  } else if (month && year) {
    q = query(
      colRef,
      where('billingMonth', '==', month),
      where('billingYear', '==', year)
    );
  }

  const snap = await getDocs(q);
  const payments: Payment[] = [];
  snap.forEach((d) => payments.push({ id: d.id, ...d.data() } as Payment));
  return payments.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
}

export async function addPayment(data: {
  customerId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: 'cash' | 'upi' | 'other';
  billingMonth: number;
  billingYear: number;
  expectedPaymentDate?: string;
  note?: string;
  notes?: string;
}): Promise<Payment> {
  const userId = await ensureAuthenticatedUserId();
  const amount = Number(data.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Please enter a valid payment amount greater than ₹0.');
  }
  if (!data.customerId) {
    throw new Error('Please select a customer.');
  }
  if (!data.paymentDate) {
    throw new Error('Please specify a payment date.');
  }

  const billId = getBillDocId(data.customerId, data.billingYear, data.billingMonth);
  const colRef = getPaymentsCollection(userId);
  const newDoc = doc(colRef);
  const now = Date.now();

  const paymentData: Record<string, any> = {
    id: newDoc.id,
    customerId: data.customerId,
    billId,
    amount: Number(amount.toFixed(2)),
    paymentDate: data.paymentDate,
    paymentMethod: data.paymentMethod || 'cash',
    billingMonth: data.billingMonth,
    billingYear: data.billingYear,
    note: (data.note || data.notes || '').trim(),
    notes: (data.note || data.notes || '').trim(),
    createdAt: now,
    updatedAt: now,
  };

  if (data.expectedPaymentDate && data.expectedPaymentDate.trim() !== '') {
    paymentData.expectedPaymentDate = data.expectedPaymentDate.trim();
  }

  const payment = paymentData as Payment;
  await setDoc(newDoc, cleanDocData(paymentData));

  // Recalculate bill for that month so balances update immediately
  try {
    await generateMonthlyBill(data.customerId, data.billingMonth, data.billingYear);
    await cascadeRecalculateCustomerBills(data.customerId, data.billingMonth, data.billingYear);
  } catch (err) {
    console.warn('Could not auto-update bill balance:', err);
  }

  return payment;
}

export async function deletePayment(payment: Payment): Promise<void> {
  const userId = await ensureAuthenticatedUserId();
  const docRef = doc(db, 'users', userId, 'payments', payment.id);
  await deleteDoc(docRef);

  // Recalculate bill for that month and cascade
  try {
    await generateMonthlyBill(payment.customerId, payment.billingMonth, payment.billingYear);
    await cascadeRecalculateCustomerBills(payment.customerId, payment.billingMonth, payment.billingYear);
  } catch (err) {
    console.warn('Could not auto-update bill balance:', err);
  }
}

/**
 * Action 1: Payment Done
 * Marks the selected monthly bill as fully paid by settling the exact outstanding amount.
 */
export async function recordPaymentDone(params: {
  customerId: string;
  month: number;
  year: number;
  amount?: number;
  paymentDate?: string;
  paymentMethod?: 'cash' | 'upi' | 'other';
  note?: string;
}): Promise<{ payment: Payment; bill: MonthlyBill }> {
  const { customerId, month, year } = params;

  // 1. Get or generate monthly bill
  let bill = await getBillForCustomer(customerId, month, year);
  if (!bill) {
    const res = await generateMonthlyBill(customerId, month, year);
    bill = res.bill;
  }

  const remaining = Number(bill.remainingBalance.toFixed(2));
  const amountToPay = params.amount !== undefined ? Number(params.amount) : remaining;

  if (amountToPay <= 0) {
    throw new Error('This bill is already fully settled or has ₹0 balance.');
  }

  const pDate = params.paymentDate || getTodayKolkata();
  const payment = await addPayment({
    customerId,
    amount: amountToPay,
    paymentDate: pDate,
    paymentMethod: params.paymentMethod || 'cash',
    billingMonth: month,
    billingYear: year,
    note: params.note || 'Full payment settled via Payment Done',
  });

  // Re-fetch updated bill
  const updatedBill = await getBillForCustomer(customerId, month, year);
  if (!updatedBill) {
    throw new Error('Failed to retrieve updated bill after recording payment.');
  }

  return { payment, bill: updatedBill };
}

/**
 * Action 2: Due / Record Partial Payment or Promise Date
 * Allows recording a partial payment amount and/or scheduling an expected payment date with notes.
 */
export async function recordPaymentDue(params: {
  customerId: string;
  month: number;
  year: number;
  partialPaymentAmount?: number;
  expectedPaymentDate?: string;
  paymentMethod?: 'cash' | 'upi' | 'other';
  notes?: string;
}): Promise<{ payment?: Payment; bill: MonthlyBill }> {
  const userId = await ensureAuthenticatedUserId();
  const { customerId, month, year, partialPaymentAmount, expectedPaymentDate, notes } = params;

  let recordedPayment: Payment | undefined = undefined;

  // 1. If partial payment is provided, record it
  if (partialPaymentAmount && partialPaymentAmount > 0) {
    recordedPayment = await addPayment({
      customerId,
      amount: partialPaymentAmount,
      paymentDate: getTodayKolkata(),
      paymentMethod: params.paymentMethod || 'cash',
      billingMonth: month,
      billingYear: year,
      expectedPaymentDate,
      note: notes || 'Partial payment received',
    });
  }

  // 2. Ensure bill exists and update expectedPaymentDate & notes
  let bill = await getBillForCustomer(customerId, month, year);
  if (!bill) {
    const res = await generateMonthlyBill(customerId, month, year);
    bill = res.bill;
  }

  const billId = getBillDocId(customerId, year, month);
  const billRef = doc(db, 'users', userId, 'monthlyBills', billId);
  const now = Date.now();

  const updates: Record<string, any> = {
    updatedAt: now,
  };
  if (expectedPaymentDate && expectedPaymentDate.trim() !== '') {
    updates.expectedPaymentDate = expectedPaymentDate.trim();
  }
  if (notes !== undefined && notes !== null && notes.trim() !== '') {
    updates.notes = notes.trim();
  }

  await updateDoc(billRef, cleanDocData(updates));

  // Recalculate bill
  const res = await generateMonthlyBill(customerId, month, year);
  await cascadeRecalculateCustomerBills(customerId, month, year);

  return { payment: recordedPayment, bill: res.bill };
}

/**
 * Loads full payment history and month-wise records for a customer.
 */
export async function getCustomerPaymentHistory(customerId: string): Promise<{
  customer: Customer | null;
  bills: MonthlyBill[];
  payments: Payment[];
}> {
  const userId = await ensureAuthenticatedUserId();
  const customer = await getCustomerById(customerId);

  // Load all monthly bills for customer
  const billsCol = collection(db, 'users', userId, 'monthlyBills');
  const billsSnap = await getDocs(query(billsCol, where('customerId', '==', customerId)));
  const bills: MonthlyBill[] = [];

  billsSnap.forEach((d) => {
    const data = d.data();
    bills.push({
      id: d.id,
      customerId: data.customerId,
      customerName: data.customerName || '',
      customerPhone: data.customerPhone || '',
      billingMonth: data.billingMonth || 1,
      billingYear: data.billingYear || 2026,
      totalMilk: data.totalMilk || 0,
      milkAmount: data.milkAmount || 0,
      previousBalance: data.previousBalance || 0,
      paymentsReceived: data.paymentsReceived || 0,
      remainingBalance: data.remainingBalance || 0,
      paymentStatus: (data.paymentStatus as PaymentStatus) || (data.remainingBalance <= 0 ? 'paid' : (data.paymentsReceived > 0 ? 'partially_paid' : 'due')),
      expectedPaymentDate: data.expectedPaymentDate || undefined,
      notes: data.notes || undefined,
      lastPaymentDate: data.lastPaymentDate || undefined,
      generatedAt: data.generatedAt || 0,
      updatedAt: data.updatedAt || 0,
    });
  });

  // Sort bills chronologically descending
  bills.sort((a, b) => {
    const idxA = a.billingYear * 12 + a.billingMonth;
    const idxB = b.billingYear * 12 + b.billingMonth;
    return idxB - idxA;
  });

  // Load all payments for customer
  const payments = await getPayments(customerId);

  return { customer, bills, payments };
}

/**
 * Computes the Monthly Payment Dashboard overview and customers list
 * for the selected month and year.
 * Includes both Active and Deactivated customers!
 */
export async function getMonthlyPaymentDashboard(
  month: number,
  year: number
): Promise<{
  overview: PaymentDashboardOverview;
  customers: CustomerPaymentSummary[];
}> {
  // Load ALL customers (onlyActive: false ensures deactivated customers are included!)
  const allCustomers = await getCustomers(false);
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
    // even if their bill or amount paid is ₹0.
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

    // Generate or fetch monthly bill for this customer
    let bill = await getBillForCustomer(cust.id, month, year);
    if (!bill) {
      try {
        const res = await generateMonthlyBill(cust.id, month, year);
        bill = res.bill;
      } catch (e) {
        console.warn(`Could not generate bill for customer ${cust.name}:`, e);
      }
    }

    if (!bill) {
      // Fallback empty bill if generation failed
      bill = {
        id: getBillDocId(cust.id, year, month),
        customerId: cust.id,
        customerName: cust.name,
        customerPhone: cust.phone,
        billingMonth: month,
        billingYear: year,
        totalMilk: 0,
        milkAmount: 0,
        previousBalance: 0,
        paymentsReceived: 0,
        remainingBalance: 0,
        paymentStatus: 'paid',
        generatedAt: Date.now(),
        updatedAt: Date.now(),
      };
    }

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

  // Sort customers: Outstanding dues first, then alphabetically
  customerSummaries.sort((a, b) => {
    if (b.remainingBalance !== a.remainingBalance) {
      return b.remainingBalance - a.remainingBalance;
    }
    return a.customer.name.localeCompare(b.customer.name);
  });

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
