import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
} from 'firebase/firestore';
import { db, ensureAuthenticatedUserId } from './firebase';
import { Delivery, MonthlyBill, Customer } from '../types';
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
      generatedAt: data.generatedAt || 0,
      updatedAt: data.updatedAt || 0,
    };
  }
  return null;
}

/**
 * Loads previous outstanding balance for a customer from prior month bill
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

  const prevBill = await getBillForCustomer(customerId, prevMonth, prevYear);
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
  paySnap.forEach((d) => {
    paymentsReceived += d.data().amount || 0;
  });
  paymentsReceived = Number(paymentsReceived.toFixed(2));

  // Remaining Balance = Previous Balance + Monthly Milk Amount - Payments Received
  const remainingBalance = Number(
    (previousBalance + milkAmount - paymentsReceived).toFixed(2)
  );

  const billId = getBillDocId(customerId, year, month);
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
    generatedAt: now,
    updatedAt: now,
  };

  const billRef = doc(db, 'users', userId, 'monthlyBills', billId);
  await setDoc(billRef, bill, { merge: true });

  return { bill, deliveries };
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
    // Include customers who have milk delivered, or existing balance, or payments
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
