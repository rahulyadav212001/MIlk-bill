import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from './firebase';
import { Payment } from '../types';
import { generateMonthlyBill } from './billingService';

const PAYMENTS_COL = 'payments';

export async function getPayments(
  customerId?: string,
  month?: number,
  year?: number
): Promise<Payment[]> {
  const colRef = collection(db, PAYMENTS_COL);
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

export async function addPayment(
  data: {
    customerId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: 'cash' | 'upi' | 'other';
    billingMonth: number;
    billingYear: number;
    note?: string;
  }
): Promise<Payment> {
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

  const colRef = collection(db, PAYMENTS_COL);
  const newDoc = doc(colRef);
  const payment: Payment = {
    id: newDoc.id,
    customerId: data.customerId,
    amount: Number(amount.toFixed(2)),
    paymentDate: data.paymentDate,
    paymentMethod: data.paymentMethod,
    billingMonth: data.billingMonth,
    billingYear: data.billingYear,
    note: data.note?.trim() || '',
    createdAt: Date.now(),
  };

  await setDoc(newDoc, payment);

  // Recalculate bill for that month so balances update immediately
  try {
    await generateMonthlyBill(data.customerId, data.billingMonth, data.billingYear);
  } catch (err) {
    console.warn('Could not auto-update bill balance:', err);
  }

  return payment;
}

export async function deletePayment(
  payment: Payment
): Promise<void> {
  const docRef = doc(db, PAYMENTS_COL, payment.id);
  await deleteDoc(docRef);

  // Recalculate bill for that month
  try {
    await generateMonthlyBill(payment.customerId, payment.billingMonth, payment.billingYear);
  } catch (err) {
    console.warn('Could not auto-update bill balance:', err);
  }
}
