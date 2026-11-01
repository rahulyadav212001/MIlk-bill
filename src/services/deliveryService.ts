import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, ensureAuthenticatedUserId } from './firebase';
import { Delivery, DeliveryStatus, SupplierHoliday, Customer } from '../types';
import { getCustomers } from './customerService';
import { getTodayKolkata, getDatesBetween } from '../utils/date';

function getDeliveriesCollection(userId: string) {
  return collection(db, 'users', userId, 'deliveries');
}

export function getDeliveryDocId(customerId: string, date: string): string {
  return `delivery_${customerId}_${date}`;
}

export async function isSupplierHoliday(date: string, userId?: string): Promise<boolean> {
  const uid = userId || await ensureAuthenticatedUserId();
  const coll = collection(db, 'users', uid, 'supplierHolidays');
  const snap = await getDocs(coll);
  for (const d of snap.docs) {
    const data = d.data() as SupplierHoliday;
    if (data.startDate && data.endDate) {
      if (date >= data.startDate && date <= data.endDate) {
        return true;
      }
    }
  }
  return false;
}

export function calculateSummary(totalActiveCustomers: number, deliveries: Delivery[]) {
  let totalMilkDelivered = 0;
  let totalDailyAmount = 0;
  let customerHolidayCount = 0;
  let supplierHolidayCount = 0;
  let normalDeliveryCount = 0;

  for (const del of deliveries) {
    totalMilkDelivered += del.actualQuantity;
    totalDailyAmount += del.amount;
    if (del.status === 'customer_holiday') customerHolidayCount++;
    else if (del.status === 'supplier_holiday') supplierHolidayCount++;
    else if (del.status === 'delivered') normalDeliveryCount++;
  }

  return {
    totalActiveCustomers,
    totalMilkDelivered: Number(totalMilkDelivered.toFixed(2)),
    totalDailyAmount: Number(totalDailyAmount.toFixed(2)),
    customerHolidayCount,
    supplierHolidayCount,
    normalDeliveryCount,
  };
}

/**
 * Check whether a target date is within the customer's active delivery date range
 */
export function isDeliveryDateAllowed(
  targetDate: string,
  startDate?: string,
  stopDate?: string | null
): { allowed: boolean; status: DeliveryStatus } {
  if (startDate && targetDate < startDate) {
    return { allowed: false, status: 'not_started' };
  }
  if (stopDate && targetDate > stopDate) {
    return { allowed: false, status: 'stopped' };
  }
  return { allowed: true, status: 'delivered' };
}

/**
 * Idempotently initializes daily delivery records for the given date.
 * Loads active customers, applies start/stop date rules, and generates missing records.
 */
export async function initializeDailyDeliveries(
  date: string
): Promise<Delivery[]> {
  const userId = await ensureAuthenticatedUserId();
  const activeCustomers = await getCustomers(true);

  // Check Supplier Holiday priority
  const supplierHolidayActive = await isSupplierHoliday(date, userId);

  // Fetch customer holidays for this date
  const custHolidaysCol = collection(db, 'users', userId, 'customerHolidays');
  const holidaySnap = await getDocs(query(custHolidaysCol, where('holidayDate', '==', date)));
  const holidayCustomerIds = new Set(holidaySnap.docs.map((d) => d.data().customerId));

  // Fetch existing delivery records for this date
  const delCol = getDeliveriesCollection(userId);
  const q = query(delCol, where('deliveryDate', '==', date));
  const snap = await getDocs(q);

  const existingMap = new Map<string, Delivery>();
  snap.forEach((d) => {
    const data = d.data();
    existingMap.set(data.customerId, {
      id: d.id,
      customerId: data.customerId,
      customerName: data.customerName || '',
      deliveryDate: data.deliveryDate,
      defaultQuantity: data.defaultQuantity || 0,
      actualQuantity: data.actualQuantity !== undefined ? data.actualQuantity : 0,
      pricePerLiter: data.pricePerLiter || 0,
      amount: data.amount !== undefined ? data.amount : 0,
      status: data.status as DeliveryStatus,
      manuallyEdited: data.manuallyEdited === true,
      createdAt: data.createdAt || 0,
      updatedAt: data.updatedAt || 0,
    });
  });

  const batch = writeBatch(db);
  let batchCount = 0;
  const now = Date.now();
  const finalDeliveries: Delivery[] = [];

  for (const customer of activeCustomers) {
    const existing = existingMap.get(customer.id);

    if (supplierHolidayActive) {
      // Supplier holiday takes precedence over all other statuses
      const docId = getDeliveryDocId(customer.id, date);
      const delivery: Delivery = {
        id: docId,
        customerId: customer.id,
        customerName: customer.name,
        deliveryDate: date,
        defaultQuantity: customer.defaultDailyQuantity,
        actualQuantity: 0,
        pricePerLiter: customer.pricePerLiter,
        amount: 0,
        status: 'supplier_holiday',
        manuallyEdited: false,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      if (!existing || existing.status !== 'supplier_holiday' || existing.actualQuantity !== 0) {
        batch.set(doc(db, 'users', userId, 'deliveries', docId), delivery, { merge: true });
        batchCount++;
      }
      finalDeliveries.push(delivery);
      continue;
    }

    if (existing) {
      finalDeliveries.push(existing);
    } else {
      // Check start & stop dates
      const dateCheck = isDeliveryDateAllowed(
        date,
        customer.deliveryStartDate,
        customer.deliveryStopDate
      );

      const isHoliday = holidayCustomerIds.has(customer.id);
      const isAllowed = dateCheck.allowed && !isHoliday;
      const actualQuantity = isAllowed ? customer.defaultDailyQuantity : 0;
      const amount = isAllowed
        ? Number((actualQuantity * customer.pricePerLiter).toFixed(2))
        : 0;
      const status: DeliveryStatus = isHoliday
        ? 'customer_holiday'
        : dateCheck.status;

      const docId = getDeliveryDocId(customer.id, date);
      const newDelivery: Delivery = {
        id: docId,
        customerId: customer.id,
        customerName: customer.name,
        deliveryDate: date,
        defaultQuantity: customer.defaultDailyQuantity,
        actualQuantity,
        pricePerLiter: customer.pricePerLiter,
        amount,
        status,
        manuallyEdited: false,
        createdAt: now,
        updatedAt: now,
      };

      const docRef = doc(db, 'users', userId, 'deliveries', docId);
      batch.set(docRef, newDelivery);
      batchCount++;
      finalDeliveries.push(newDelivery);
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return finalDeliveries;
}

/**
 * Update actual milk quantity delivered to a customer on a specific date.
 * Directly recalculates amount = actualQuantity * pricePerLiter.
 */
export async function updateDeliveryQuantity(
  customerId: string,
  date: string,
  newQuantity: number,
  customerName?: string,
  pricePerLiterFallback?: number
): Promise<Delivery> {
  const userId = await ensureAuthenticatedUserId();
  const docId = getDeliveryDocId(customerId, date);
  const docRef = doc(db, 'users', userId, 'deliveries', docId);
  const snap = await getDoc(docRef);

  const now = Date.now();
  let delivery: Delivery;

  if (snap.exists()) {
    const data = snap.data();
    const price = data.pricePerLiter || pricePerLiterFallback || 0;
    const amount = Number((newQuantity * price).toFixed(2));
    const status: DeliveryStatus = newQuantity > 0 ? 'delivered' : 'stopped';

    delivery = {
      id: docId,
      customerId,
      customerName: data.customerName || customerName || '',
      deliveryDate: date,
      defaultQuantity: data.defaultQuantity || newQuantity,
      actualQuantity: newQuantity,
      pricePerLiter: price,
      amount,
      status,
      manuallyEdited: true,
      createdAt: data.createdAt || now,
      updatedAt: now,
    };

    await updateDoc(docRef, {
      actualQuantity: newQuantity,
      amount,
      status,
      manuallyEdited: true,
      updatedAt: now,
    });
  } else {
    // Create new record
    const price = pricePerLiterFallback || 0;
    const amount = Number((newQuantity * price).toFixed(2));
    const status: DeliveryStatus = newQuantity > 0 ? 'delivered' : 'stopped';

    delivery = {
      id: docId,
      customerId,
      customerName: customerName || '',
      deliveryDate: date,
      defaultQuantity: newQuantity,
      actualQuantity: newQuantity,
      pricePerLiter: price,
      amount,
      status,
      manuallyEdited: true,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(docRef, delivery);
  }

  try {
    const { generateMonthlyBill } = await import('./billingService');
    const [yStr, mStr] = date.split('-');
    await generateMonthlyBill(customerId, parseInt(mStr, 10), parseInt(yStr, 10));
  } catch {
    // Non-fatal
  }

  return delivery;
}

/**
 * Fetch delivery history for a customer
 */
export async function getCustomerDeliveries(
  customerId: string,
  month?: number,
  year?: number
): Promise<Delivery[]> {
  const userId = await ensureAuthenticatedUserId();
  const delCol = getDeliveriesCollection(userId);
  const q = query(delCol, where('customerId', '==', customerId));
  const snap = await getDocs(q);

  let list: Delivery[] = [];
  snap.forEach((d) => {
    const data = d.data();
    list.push({
      id: d.id,
      customerId: data.customerId,
      customerName: data.customerName || '',
      deliveryDate: data.deliveryDate,
      defaultQuantity: data.defaultQuantity || 0,
      actualQuantity: data.actualQuantity || 0,
      pricePerLiter: data.pricePerLiter || 0,
      amount: data.amount || 0,
      status: data.status as DeliveryStatus,
      manuallyEdited: data.manuallyEdited === true,
      createdAt: data.createdAt || 0,
      updatedAt: data.updatedAt || 0,
    });
  });

  if (month && year) {
    const monthStr = month < 10 ? `0${month}` : `${month}`;
    const prefix = `${year}-${monthStr}`;
    list = list.filter((d) => d.deliveryDate.startsWith(prefix));
  }

  return list.sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
}

/**
 * Delete a specific delivery record
 */
export async function deleteDelivery(deliveryId: string): Promise<void> {
  const userId = await ensureAuthenticatedUserId();
  const dRef = doc(db, 'users', userId, 'deliveries', deliveryId);
  await deleteDoc(dRef);
}

/**
 * Automatically accounts for deliveries when a customer starts from a past date.
 * Creates delivery documents from startDate up to today so pending milk quantities
 * can be entered later.
 */
export async function accountForPastDeliveries(
  customer: Customer,
  startDate: string,
  targetToday?: string
): Promise<Delivery[]> {
  const userId = await ensureAuthenticatedUserId();
  const today = targetToday || getTodayKolkata();
  if (startDate > today) {
    return [];
  }

  const dates = getDatesBetween(startDate, today);
  if (dates.length === 0) return [];

  const delCol = getDeliveriesCollection(userId);
  const now = Date.now();
  const batch = writeBatch(db);
  let batchCount = 0;
  const createdDeliveries: Delivery[] = [];
  const affectedMonths = new Set<string>(); // "YYYY-M"

  for (const d of dates) {
    const docId = getDeliveryDocId(customer.id, d);
    const docRef = doc(delCol, docId);

    // For previous days (d < today), actualQuantity is 0 (pending milk quantity)
    // For today (d === today), actualQuantity is 0 (or defaultDailyQuantity if specified)
    const isToday = d === today;
    const actualQuantity = isToday ? (customer.defaultDailyQuantity || 0) : 0;
    const amount = Number((actualQuantity * customer.pricePerLiter).toFixed(2));

    const delivery: Delivery = {
      id: docId,
      customerId: customer.id,
      customerName: customer.name,
      deliveryDate: d,
      defaultQuantity: customer.defaultDailyQuantity || 0,
      actualQuantity,
      pricePerLiter: customer.pricePerLiter,
      amount,
      status: 'delivered',
      manuallyEdited: false,
      createdAt: now,
      updatedAt: now,
    };

    batch.set(docRef, delivery, { merge: true });
    batchCount++;
    createdDeliveries.push(delivery);

    const [yStr, mStr] = d.split('-');
    affectedMonths.add(`${parseInt(yStr, 10)}-${parseInt(mStr, 10)}`);
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  // Recalculate monthly bills for affected months
  for (const mKey of affectedMonths) {
    const [year, month] = mKey.split('-').map(Number);
    try {
      const { generateMonthlyBill } = await import('./billingService');
      await generateMonthlyBill(customer.id, month, year);
    } catch {
      // Non-fatal
    }
  }

  return createdDeliveries;
}
