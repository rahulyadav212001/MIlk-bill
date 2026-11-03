import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import { db, ensureAuthenticatedUserId, cleanDocData } from './firebase';
import { Delivery, MonthlyBill, Customer, PaymentStatus } from '../types';
import { getCustomerById, getCustomers } from './customerService';
import { getCustomerDeliveries } from './deliveryService';

export function getBillDocId(customerId: string, year: number, month: number): string {
  return `bill_${customerId}_${year}_${month}`;
}

function getPaymentsCollection(userId: string) {
  return collection(db, 'users', userId, 'payments');
}

export async function getBillForCustomer(
  customerId: string,
  month: number,
  year: number
): Promise<MonthlyBill | null> {
  const userId = await ensureAuthenticatedUserId();
  const billId = getBillDocId(customerId, year, month);
  const billRef = doc(db, 'users', userId, 'monthlyBills', billId);
  const snap = await getDoc(billRef);
  if (snap.exists()) {
    const data = snap.data();
    return {
      id: snap.id,
      customerId: data.customerId,
      customerName: data.customerName || '',
      customerPhone: data.customerPhone || '',
      billingMonth: data.billingMonth || month,
      billingYear: data.billingYear || year,
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
    };
  }
  return null;
}

/**
 * Loads previous outstanding balance for a customer from prior month bill.
 * If prior month has not been generated yet, generates it idempotently if the customer
 * was registered in or before that month.
 */
export async function getPreviousBalance(
  customerId: string,
  month: number,
  year: number
): Promise<number> {
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = year - 1;
  }

  let prevBill = await getBillForCustomer(customerId, prevMonth, prevYear);
  if (!prevBill) {
    const customer = await getCustomerById(customerId);
    if (customer?.deliveryStartDate) {
      const [jYear, jMonth] = customer.deliveryStartDate.split('-').map(Number);
      if (prevYear > jYear || (prevYear === jYear && prevMonth >= jMonth)) {
        try {
          const res = await generateMonthlyBill(customerId, prevMonth, prevYear);
          prevBill = res.bill;
        } catch (e) {
          console.warn('Could not auto-generate previous month bill:', e);
        }
      }
    }
  }

  return prevBill ? prevBill.remainingBalance : 0;
}

/**
 * Generates or recalculates a customer's monthly bill idempotently
 * Formula:
 * Daily Amount = Actual Quantity * Price
 * Monthly Milk Amount = Sum of Daily Amounts
 * Remaining Balance = Previous Balance + Monthly Milk Amount - Payments Received
 */
export async function generateMonthlyBill(
  customerId: string,
  month: number,
  year: number
): Promise<{ bill: MonthlyBill; deliveries: Delivery[] }> {
  const userId = await ensureAuthenticatedUserId();
  const customer = await getCustomerById(customerId);
  if (!customer) throw new Error('Customer not found.');

  // Load existing bill to preserve custom fields if present
  const existingBill = await getBillForCustomer(customerId, month, year);

  // Load actual deliveries for the month
  const deliveries = await getCustomerDeliveries(customerId, month, year);

  let totalMilk = 0;
  let milkAmount = 0;

  for (const del of deliveries) {
    totalMilk += del.actualQuantity;
    milkAmount += del.amount;
  }

  totalMilk = Number(totalMilk.toFixed(2));
  milkAmount = Number(milkAmount.toFixed(2));

  // Load prior month's remaining balance
  const previousBalance = await getPreviousBalance(customerId, month, year);

  // Load payments received in this month for this customer
  const payCol = getPaymentsCollection(userId);
  const payQ = query(
    payCol,
    where('customerId', '==', customerId),
    where('billingMonth', '==', month),
    where('billingYear', '==', year)
  );
  const paySnap = await getDocs(payQ);
  let paymentsReceived = 0;
  let latestPaymentDate: string | undefined = undefined;

  paySnap.forEach((d) => {
    const pData = d.data();
    paymentsReceived += pData.amount || 0;
    if (pData.paymentDate) {
      if (!latestPaymentDate || pData.paymentDate > latestPaymentDate) {
        latestPaymentDate = pData.paymentDate;
      }
    }
  });
  paymentsReceived = Number(paymentsReceived.toFixed(2));

  // Remaining Balance = Previous Balance + Monthly Milk Amount - Payments Received
  const remainingBalance = Number(
    (previousBalance + milkAmount - paymentsReceived).toFixed(2)
  );

  // Derive Payment Status
  let paymentStatus: PaymentStatus = 'due';
  if (remainingBalance <= 0) {
    paymentStatus = 'paid';
  } else if (paymentsReceived > 0) {
    paymentStatus = 'partially_paid';
  } else {
    paymentStatus = 'due';
  }

  const billId = getBillDocId(customerId, year, month);
  const now = Date.now();

  const billData: Record<string, any> = {
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
    generatedAt: existingBill?.generatedAt || now,
    updatedAt: now,
  };

  if (existingBill?.expectedPaymentDate) {
    billData.expectedPaymentDate = existingBill.expectedPaymentDate;
  }
  if (existingBill?.notes) {
    billData.notes = existingBill.notes;
  }
  const lastPayment = latestPaymentDate || existingBill?.lastPaymentDate;
  if (lastPayment) {
    billData.lastPaymentDate = lastPayment;
  }

  const bill = billData as MonthlyBill;
  const billRef = doc(db, 'users', userId, 'monthlyBills', billId);
  await setDoc(billRef, cleanDocData(billData), { merge: true });

  // If customer is deactivated, update finalOutstandingAmount on customer document
  if (customer.isDeactivated || customer.accountStatus === 'deactivated') {
    const custRef = doc(db, 'users', userId, 'customers', customerId);
    await updateDoc(custRef, cleanDocData({
      finalOutstandingAmount: Math.max(0, remainingBalance),
      updatedAt: now,
    }));
  }

  return { bill, deliveries };
}

/**
 * Cascade-recalculates all subsequent monthly bills for a customer chronologically.
 * This guarantees that if a payment is made or changed in month M, month M+1, M+2, etc.
 * have their carried-forward previousBalance updated automatically without duplicating or losing dues.
 */
export async function cascadeRecalculateCustomerBills(
  customerId: string,
  fromMonth: number,
  fromYear: number
): Promise<void> {
  const userId = await ensureAuthenticatedUserId();
  const billsCol = collection(db, 'users', userId, 'monthlyBills');
  const snap = await getDocs(query(billsCol, where('customerId', '==', customerId)));

  const fromIndex = fromYear * 12 + fromMonth;
  const subsequentBills: { month: number; year: number; index: number }[] = [];

  snap.forEach((d) => {
    const data = d.data();
    const bMonth = data.billingMonth;
    const bYear = data.billingYear;
    if (bMonth && bYear) {
      const idx = bYear * 12 + bMonth;
      if (idx > fromIndex) {
        subsequentBills.push({ month: bMonth, year: bYear, index: idx });
      }
    }
  });

  // Sort chronologically ascending
  subsequentBills.sort((a, b) => a.index - b.index);

  for (const b of subsequentBills) {
    await generateMonthlyBill(customerId, b.month, b.year);
  }
}

/**
 * Generates bills for all customers who have deliveries or were registered for the month
 */
export async function generateAllCustomersMonthlyBills(
  month: number,
  year: number
): Promise<{ customer: Customer; bill: MonthlyBill; deliveries: Delivery[] }[]> {
  const allCustomers = await getCustomers();
  const results: { customer: Customer; bill: MonthlyBill; deliveries: Delivery[] }[] = [];

  for (const cust of allCustomers) {
    const res = await generateMonthlyBill(cust.id, month, year);
    if (
      res.deliveries.length > 0 ||
      res.bill.totalMilk > 0 ||
      res.bill.remainingBalance !== 0 ||
      res.bill.paymentsReceived > 0
    ) {
      results.push({
        customer: cust,
        bill: res.bill,
        deliveries: res.deliveries,
      });
    }
  }

  return results;
}


