import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { db, ensureAuthenticatedUserId } from './firebase';
import { Customer, Delivery, CustomerHoliday, SupplierHoliday, DeliveryStatus } from '../types';
import { getDeliveryDocId } from './deliveryService';
import { generateMonthlyBill } from './billingService';

function getSupplierHolidaysCollection(userId: string) {
  return collection(db, 'users', userId, 'supplierHolidays');
}

function getCustomerHolidaysCollection(userId: string) {
  return collection(db, 'users', userId, 'customerHolidays');
}

export function getCustomerHolidayDocId(customerId: string, date: string): string {
  return `holiday_${customerId}_${date}`;
}

export function getSupplierHolidayDocId(supplierId: string, date: string): string {
  return `sup_holiday_${supplierId}_${date}`;
}

/**
 * Checks whether a specific date falls under any Supplier Holiday (global or specific)
 */
export async function isSupplierHoliday(date: string, supplierId?: string): Promise<boolean> {
  const userId = await ensureAuthenticatedUserId();
  const coll = getSupplierHolidaysCollection(userId);
  const snap = await getDocs(coll);

  for (const d of snap.docs) {
    const data = d.data() as SupplierHoliday;
    // Check global/all suppliers holiday (or legacy/dairy supplier holiday without specific supplierId)
    if (data.isAllSuppliers || data.supplierId === 'ALL' || !data.supplierId) {
      if ((data.holidayDate && data.holidayDate === date) || (data.startDate && data.endDate && date >= data.startDate && date <= data.endDate)) {
        return true;
      }
    }
    // Check specific supplier holiday
    if (supplierId && data.supplierId === supplierId) {
      if ((data.holidayDate && data.holidayDate === date) || (data.startDate && data.endDate && date >= data.startDate && date <= data.endDate)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Fetch set of supplier IDs that are on holiday for a given date
 */
export async function getSupplierHolidaysForDate(date: string): Promise<Set<string>> {
  const userId = await ensureAuthenticatedUserId();
  const coll = getSupplierHolidaysCollection(userId);
  const snap = await getDocs(coll);

  const holidaySet = new Set<string>();

  for (const d of snap.docs) {
    const data = d.data() as SupplierHoliday;
    const matchesDate = (data.holidayDate && data.holidayDate === date) ||
      (data.startDate && data.endDate && date >= data.startDate && date <= data.endDate);

    if (matchesDate) {
      if (data.isAllSuppliers || data.supplierId === 'ALL') {
        holidaySet.add('ALL');
      } else if (data.supplierId) {
        holidaySet.add(data.supplierId);
      }
    }
  }

  return holidaySet;
}

/**
 * Mark a single supplier as on holiday for today
 */
export async function markSupplierHoliday(
  supplierId: string,
  supplierName: string,
  date: string
): Promise<void> {
  const userId = await ensureAuthenticatedUserId();
  const docId = getSupplierHolidayDocId(supplierId, date);
  const dRef = doc(db, 'users', userId, 'supplierHolidays', docId);

  const now = Date.now();
  const data: SupplierHoliday = {
    id: docId,
    supplierId,
    supplierName,
    holidayDate: date,
    startDate: date,
    endDate: date,
    isAllSuppliers: false,
    reason: `Holiday for ${supplierName}`,
    createdAt: now,
  };

  await setDoc(dRef, data, { merge: true });
}

/**
 * Cancel a supplier's holiday for today
 */
export async function cancelSupplierHoliday(supplierId: string, date: string): Promise<void> {
  const userId = await ensureAuthenticatedUserId();
  const docId = getSupplierHolidayDocId(supplierId, date);
  const dRef = doc(db, 'users', userId, 'supplierHolidays', docId);
  await deleteDoc(dRef);

  // Also remove ALL holiday doc if present
  const allDocId = `sup_holiday_all_${date}`;
  const allRef = doc(db, 'users', userId, 'supplierHolidays', allDocId);
  const allSnap = await getDoc(allRef);
  if (allSnap.exists()) {
    await deleteDoc(allRef);
  }
}

/**
 * Mark all suppliers as on holiday for today
 */
export async function markAllSuppliersHoliday(
  suppliers: { id: string; name: string }[],
  date: string
): Promise<void> {
  const userId = await ensureAuthenticatedUserId();
  const now = Date.now();

  // 1. Mark global record
  const allDocId = `sup_holiday_all_${date}`;
  const allRef = doc(db, 'users', userId, 'supplierHolidays', allDocId);
  await setDoc(allRef, {
    id: allDocId,
    supplierId: 'ALL',
    holidayDate: date,
    startDate: date,
    endDate: date,
    isAllSuppliers: true,
    reason: 'All Suppliers Holiday',
    createdAt: now,
  }, { merge: true });

  // 2. Mark individual records for fast per-supplier lookups
  for (const s of suppliers) {
    const docId = getSupplierHolidayDocId(s.id, date);
    const sRef = doc(db, 'users', userId, 'supplierHolidays', docId);
    await setDoc(sRef, {
      id: docId,
      supplierId: s.id,
      supplierName: s.name,
      holidayDate: date,
      startDate: date,
      endDate: date,
      isAllSuppliers: true,
      reason: 'All Suppliers Holiday',
      createdAt: now,
    }, { merge: true });
  }
}

/**
 * Cancel all suppliers holiday for today
 */
export async function cancelAllSuppliersHoliday(
  suppliers: { id: string }[],
  date: string
): Promise<void> {
  const userId = await ensureAuthenticatedUserId();

  const allDocId = `sup_holiday_all_${date}`;
  await deleteDoc(doc(db, 'users', userId, 'supplierHolidays', allDocId));

  for (const s of suppliers) {
    const docId = getSupplierHolidayDocId(s.id, date);
    await deleteDoc(doc(db, 'users', userId, 'supplierHolidays', docId));
  }
}

/**
 * Fetch a customer's holiday record for a specific date if it exists
 */
export async function getCustomerHoliday(
  customerId: string,
  date: string
): Promise<CustomerHoliday | null> {
  const userId = await ensureAuthenticatedUserId();
  const holidayId = getCustomerHolidayDocId(customerId, date);
  const hRef = doc(db, 'users', userId, 'customerHolidays', holidayId);
  const snap = await getDoc(hRef);

  if (snap.exists()) {
    const data = snap.data();
    return {
      id: snap.id,
      customerId: data.customerId,
      customerName: data.customerName || '',
      holidayDate: data.holidayDate || date,
      holidayStatus: data.holidayStatus || 'customer_holiday',
      previousQuantity: data.previousQuantity !== undefined ? data.previousQuantity : 0,
      previousAmount: data.previousAmount !== undefined ? data.previousAmount : 0,
      previousManuallyEdited: data.previousManuallyEdited === true,
      createdAt: data.createdAt || 0,
    };
  }
  return null;
}

/**
 * Fetch set of customer IDs on holiday for a given date
 */
export async function getCustomerHolidaysForDate(date: string): Promise<Set<string>> {
  const userId = await ensureAuthenticatedUserId();
  const coll = getCustomerHolidaysCollection(userId);
  const q = query(coll, where('holidayDate', '==', date));
  const snap = await getDocs(q);

  const set = new Set<string>();
  snap.forEach((d) => {
    const data = d.data();
    if (data.customerId) {
      set.add(data.customerId);
    }
  });
  return set;
}

/**
 * Mark a customer as on holiday for a specific date.
 */
export async function markCustomerHoliday(
  customer: Customer,
  date: string
): Promise<{ success: boolean; holiday: CustomerHoliday; delivery: Delivery }> {
  const userId = await ensureAuthenticatedUserId();

  // Fetch existing delivery record for snapshot
  const delId = getDeliveryDocId(customer.id, date);
  const delRef = doc(db, 'users', userId, 'deliveries', delId);
  const delSnap = await getDoc(delRef);

  const holidayId = getCustomerHolidayDocId(customer.id, date);
  const holidayRef = doc(db, 'users', userId, 'customerHolidays', holidayId);
  const existingHolidaySnap = await getDoc(holidayRef);

  let prevQty = customer.defaultDailyQuantity;
  let prevAmount = Number((customer.defaultDailyQuantity * customer.pricePerLiter).toFixed(2));
  let prevManuallyEdited = false;

  if (existingHolidaySnap.exists()) {
    const exData = existingHolidaySnap.data();
    prevQty = exData?.previousQuantity ?? customer.defaultDailyQuantity;
    prevAmount = exData?.previousAmount ?? Number((prevQty * customer.pricePerLiter).toFixed(2));
    prevManuallyEdited = exData?.previousManuallyEdited === true;
  } else if (delSnap.exists() && delSnap.data()?.status !== 'customer_holiday') {
    prevQty = delSnap.data()?.actualQuantity ?? customer.defaultDailyQuantity;
    prevAmount = delSnap.data()?.amount ?? Number((prevQty * customer.pricePerLiter).toFixed(2));
    prevManuallyEdited = delSnap.data()?.manuallyEdited === true;
  }

  const now = Date.now();

  const holidayData: CustomerHoliday = {
    id: holidayId,
    customerId: customer.id,
    customerName: customer.name,
    holidayDate: date,
    holidayStatus: 'customer_holiday',
    previousQuantity: prevQty,
    previousAmount: prevAmount,
    previousManuallyEdited: prevManuallyEdited,
    createdAt: existingHolidaySnap.exists() ? (existingHolidaySnap.data()?.createdAt || now) : now,
  };

  await setDoc(holidayRef, holidayData);

  const updatedDelivery: Delivery = {
    id: delId,
    customerId: customer.id,
    customerName: customer.name,
    deliveryDate: date,
    defaultQuantity: customer.defaultDailyQuantity,
    actualQuantity: 0,
    pricePerLiter: customer.pricePerLiter,
    amount: 0,
    status: 'customer_holiday',
    manuallyEdited: false,
    createdAt: delSnap.exists() ? (delSnap.data()?.createdAt || now) : now,
    updatedAt: now,
  };

  await setDoc(delRef, updatedDelivery, { merge: true });

  try {
    const [yStr, mStr] = date.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    await generateMonthlyBill(customer.id, month, year);
  } catch (err) {
    console.warn('Could not recalculate monthly bill after holiday mark:', err);
  }

  return { success: true, holiday: holidayData, delivery: updatedDelivery };
}

/**
 * Mark all customers as on holiday for today
 */
export async function markAllCustomersHoliday(
  customers: Customer[],
  date: string
): Promise<void> {
  for (const c of customers) {
    if (c.isActive) {
      await markCustomerHoliday(c, date);
    }
  }
}

/**
 * Cancel all customers holiday for today
 */
export async function cancelAllCustomersHoliday(
  customers: Customer[],
  date: string
): Promise<void> {
  for (const c of customers) {
    await cancelCustomerHoliday(c, date);
  }
}

/**
 * Cancel a customer's holiday for a specific date.
 */
export async function cancelCustomerHoliday(
  customer: Customer,
  date: string,
  restoreQuantity?: number
): Promise<{
  success: boolean;
  requiresReview?: boolean;
  previousQuantity?: number;
  supplierHolidayActive?: boolean;
  delivery?: Delivery;
}> {
  const userId = await ensureAuthenticatedUserId();
  const holidayId = getCustomerHolidayDocId(customer.id, date);
  const holidayRef = doc(db, 'users', userId, 'customerHolidays', holidayId);
  const holidaySnap = await getDoc(holidayRef);

  const prevHolidayData = holidaySnap.exists() ? holidaySnap.data() : null;
  const wasManuallyEdited = prevHolidayData?.previousManuallyEdited === true;
  const previousQuantity = prevHolidayData?.previousQuantity !== undefined
    ? prevHolidayData.previousQuantity
    : customer.defaultDailyQuantity;

  // Supplier Holiday priority check:
  const supplierHolidayActive = await isSupplierHoliday(date);
  if (supplierHolidayActive) {
    if (holidaySnap.exists()) {
      await deleteDoc(holidayRef);
    }
    const delId = getDeliveryDocId(customer.id, date);
    const delRef = doc(db, 'users', userId, 'deliveries', delId);
    const now = Date.now();
    const updatedDelivery: Delivery = {
      id: delId,
      customerId: customer.id,
      customerName: customer.name,
      deliveryDate: date,
      defaultQuantity: customer.defaultDailyQuantity,
      actualQuantity: 0,
      pricePerLiter: customer.pricePerLiter,
      amount: 0,
      status: 'supplier_holiday',
      manuallyEdited: false,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(delRef, updatedDelivery, { merge: true });

    return {
      success: true,
      supplierHolidayActive: true,
      delivery: updatedDelivery,
    };
  }

  if (wasManuallyEdited && restoreQuantity === undefined) {
    return {
      success: false,
      requiresReview: true,
      previousQuantity,
    };
  }

  const finalQty = restoreQuantity !== undefined
    ? restoreQuantity
    : customer.defaultDailyQuantity;
  const finalManuallyEdited = restoreQuantity !== undefined ? true : false;
  const finalAmount = Number((finalQty * customer.pricePerLiter).toFixed(2));
  const finalStatus: DeliveryStatus = finalQty > 0 ? 'delivered' : 'stopped';

  const delId = getDeliveryDocId(customer.id, date);
  const delRef = doc(db, 'users', userId, 'deliveries', delId);
  const now = Date.now();

  const updatedDelivery: Delivery = {
    id: delId,
    customerId: customer.id,
    customerName: customer.name,
    deliveryDate: date,
    defaultQuantity: customer.defaultDailyQuantity,
    actualQuantity: finalQty,
    pricePerLiter: customer.pricePerLiter,
    amount: finalAmount,
    status: finalStatus,
    manuallyEdited: finalManuallyEdited,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(delRef, updatedDelivery, { merge: true });

  if (holidaySnap.exists()) {
    await deleteDoc(holidayRef);
  }

  try {
    const [yStr, mStr] = date.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    await generateMonthlyBill(customer.id, month, year);
  } catch (err) {
    console.warn('Could not recalculate monthly bill after holiday cancel:', err);
  }

  return {
    success: true,
    delivery: updatedDelivery,
  };
}
