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
import { Customer, MilkDeliveryTime, MilkCategory } from '../types';
import { getTodayKolkata } from '../utils/date';

function getCustomersCollection(userId: string) {
  return collection(db, 'users', userId, 'customers');
}

export async function getCustomers(onlyActive: boolean = false): Promise<Customer[]> {
  const userId = await ensureAuthenticatedUserId();
  const colRef = getCustomersCollection(userId);
  const snapshot = await getDocs(colRef);

  const customers: Customer[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    customers.push({
      id: docSnap.id,
      name: data.name || '',
      phone: data.phone || '',
      milkCategory: (data.milkCategory as MilkCategory) || 'buffalo',
      location: data.location || '',
      defaultDailyQuantity: data.defaultDailyQuantity || 0,
      morningQuantity: data.morningQuantity !== undefined ? Number(data.morningQuantity) : undefined,
      eveningQuantity: data.eveningQuantity !== undefined ? Number(data.eveningQuantity) : undefined,
      pricePerLiter: data.pricePerLiter || 0,
      deliveryTime: (data.deliveryTime as MilkDeliveryTime) || 'morning',
      deliveryStartDate: data.deliveryStartDate || getTodayKolkata(),
      deliveryStopDate: data.deliveryStopDate || null,
      isActive: data.isActive !== false,
      createdAt: data.createdAt || 0,
      updatedAt: data.updatedAt || 0,
    });
  });

  const sorted = customers.sort((a, b) => a.name.localeCompare(b.name));
  return onlyActive ? sorted.filter((c) => c.isActive) : sorted;
}

export async function getCustomerById(customerId: string): Promise<Customer | null> {
  const userId = await ensureAuthenticatedUserId();
  const docRef = doc(db, 'users', userId, 'customers', customerId);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = snap.data();
    return {
      id: snap.id,
      name: data.name || '',
      phone: data.phone || '',
      milkCategory: (data.milkCategory as MilkCategory) || 'buffalo',
      location: data.location || '',
      defaultDailyQuantity: data.defaultDailyQuantity || 0,
      morningQuantity: data.morningQuantity !== undefined ? Number(data.morningQuantity) : undefined,
      eveningQuantity: data.eveningQuantity !== undefined ? Number(data.eveningQuantity) : undefined,
      pricePerLiter: data.pricePerLiter || 0,
      deliveryTime: (data.deliveryTime as MilkDeliveryTime) || 'morning',
      deliveryStartDate: data.deliveryStartDate || getTodayKolkata(),
      deliveryStopDate: data.deliveryStopDate || null,
      isActive: data.isActive !== false,
      createdAt: data.createdAt || 0,
      updatedAt: data.updatedAt || 0,
    };
  }
  return null;
}

export async function checkPhoneExists(
  phone: string,
  excludeCustomerId?: string
): Promise<boolean> {
  const userId = await ensureAuthenticatedUserId();
  const normalizedPhone = phone.trim();
  const colRef = getCustomersCollection(userId);
  const q = query(colRef, where('phone', '==', normalizedPhone));
  const snap = await getDocs(q);

  if (snap.empty) return false;
  if (!excludeCustomerId) return true;
  return snap.docs.some((d) => d.id !== excludeCustomerId);
}

export async function addCustomer(data: {
  name: string;
  phone: string;
  milkCategory: MilkCategory;
  location: string;
  defaultDailyQuantity?: number;
  morningQuantity?: number;
  eveningQuantity?: number;
  pricePerLiter: number;
  deliveryTime?: MilkDeliveryTime;
  deliveryStartDate?: string;
  deliveryStopDate?: string | null;
}): Promise<Customer> {
  const userId = await ensureAuthenticatedUserId();
  const trimmedName = data.name.trim();
  const trimmedPhone = data.phone.trim();
  const trimmedLocation = (data.location || '').trim();
  const milkCategory = data.milkCategory;
  const morningQty = data.morningQuantity !== undefined ? Number(data.morningQuantity) : undefined;
  const eveningQty = data.eveningQuantity !== undefined ? Number(data.eveningQuantity) : undefined;
  let qty = data.defaultDailyQuantity !== undefined ? Number(data.defaultDailyQuantity) : 0;

  if (morningQty !== undefined || eveningQty !== undefined) {
    const sum = Number(((morningQty || 0) + (eveningQty || 0)).toFixed(2));
    if (sum > 0) {
      qty = sum;
    }
  }
  const price = Number(data.pricePerLiter);

  if (!trimmedName) throw new Error('Customer name is required.');
  if (!trimmedPhone || trimmedPhone.length < 10) {
    throw new Error('Please enter a valid phone number (at least 10 digits).');
  }
  if (!trimmedLocation) {
    throw new Error('Customer location is required.');
  }
  if (!milkCategory || (milkCategory !== 'buffalo' && milkCategory !== 'cow')) {
    throw new Error('Please select a valid milk category (Buffalo Milk or Cow Milk).');
  }
  if (isNaN(qty) || qty < 0) {
    throw new Error('Daily milk quantity cannot be negative.');
  }
  if (isNaN(price) || price <= 0) {
    throw new Error('Milk price per liter must be greater than 0.');
  }

  const exists = await checkPhoneExists(trimmedPhone);
  if (exists) {
    throw new Error(`A customer with phone number ${trimmedPhone} already exists.`);
  }

  let deliveryTime: MilkDeliveryTime = data.deliveryTime || 'morning';
  if ((morningQty || 0) > 0 && (eveningQty || 0) > 0) {
    deliveryTime = 'both';
  } else if ((eveningQty || 0) > 0 && (morningQty || 0) === 0) {
    deliveryTime = 'evening';
  } else if ((morningQty || 0) > 0 && (eveningQty || 0) === 0) {
    deliveryTime = 'morning';
  }

  const colRef = getCustomersCollection(userId);
  const newDocRef = doc(colRef);
  const now = Date.now();
  const startDate = data.deliveryStartDate || getTodayKolkata();

  const newCustomer: Customer = {
    id: newDocRef.id,
    name: trimmedName,
    phone: trimmedPhone,
    milkCategory,
    location: trimmedLocation,
    defaultDailyQuantity: qty,
    morningQuantity: morningQty,
    eveningQuantity: eveningQty,
    pricePerLiter: price,
    deliveryTime,
    deliveryStartDate: startDate,
    deliveryStopDate: data.deliveryStopDate || null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(newDocRef, newCustomer);

  // Automatically account for previous days if starting from a past date
  try {
    const today = getTodayKolkata();
    if (startDate <= today) {
      const { accountForPastDeliveries } = await import('./deliveryService');
      await accountForPastDeliveries(newCustomer, startDate, today);
    }
  } catch (err) {
    console.warn('Could not auto-generate past deliveries for customer:', err);
  }

  return newCustomer;
}

export async function updateCustomer(
  customerId: string,
  data: Partial<Customer>
): Promise<void> {
  const userId = await ensureAuthenticatedUserId();
  const docRef = doc(db, 'users', userId, 'customers', customerId);

  if (data.phone) {
    const exists = await checkPhoneExists(data.phone, customerId);
    if (exists) {
      throw new Error(`A customer with phone number ${data.phone} already exists.`);
    }
  }

  if (data.location !== undefined && !data.location.trim()) {
    throw new Error('Customer location is required.');
  }

  const updatePayload: any = {
    ...data,
    updatedAt: Date.now(),
  };

  if (data.morningQuantity !== undefined || data.eveningQuantity !== undefined) {
    const m = data.morningQuantity !== undefined ? Number(data.morningQuantity) : 0;
    const e = data.eveningQuantity !== undefined ? Number(data.eveningQuantity) : 0;
    if (data.defaultDailyQuantity === undefined && (m > 0 || e > 0)) {
      updatePayload.defaultDailyQuantity = Number((m + e).toFixed(2));
    }
  }

  await updateDoc(docRef, updatePayload);

  if (data.deliveryStartDate) {
    try {
      const updatedCust = await getCustomerById(customerId);
      const today = getTodayKolkata();
      if (updatedCust && data.deliveryStartDate <= today) {
        const { accountForPastDeliveries } = await import('./deliveryService');
        await accountForPastDeliveries(updatedCust, data.deliveryStartDate, today);
      }
    } catch (err) {
      console.warn('Could not auto-generate past deliveries on customer update:', err);
    }
  }
}

/**
 * Configure delivery start and stop dates for a customer
 * (Inclusive dates; restarting delivery sets a new start date and clears or updates stop date)
 */
export async function updateDeliverySettings(
  customerId: string,
  deliveryStartDate: string,
  deliveryStopDate?: string | null
): Promise<void> {
  const userId = await ensureAuthenticatedUserId();
  const docRef = doc(db, 'users', userId, 'customers', customerId);
  await updateDoc(docRef, {
    deliveryStartDate,
    deliveryStopDate: deliveryStopDate || null,
    updatedAt: Date.now(),
  });
}

export async function toggleCustomerStatus(
  customerId: string,
  isActive: boolean
): Promise<void> {
  const userId = await ensureAuthenticatedUserId();
  const docRef = doc(db, 'users', userId, 'customers', customerId);
  await updateDoc(docRef, {
    isActive,
    updatedAt: Date.now(),
  });
}

/**
 * Delete a registered customer and optionally all associated delivery history,
 * monthly bills, and payments. Prevents orphaned records while protecting unrelated accounts.
 */
export async function deleteCustomer(
  customerId: string,
  deleteHistory: boolean = true
): Promise<void> {
  const userId = await ensureAuthenticatedUserId();

  if (deleteHistory) {
    // 1. Delete all daily deliveries for this customer in safe batches
    const delCol = collection(db, 'users', userId, 'deliveries');
    const delSnap = await getDocs(query(delCol, where('customerId', '==', customerId)));
    const delDocs = delSnap.docs;
    for (let i = 0; i < delDocs.length; i += 400) {
      const batch = writeBatch(db);
      delDocs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    // 2. Delete all monthly bills for this customer in safe batches
    const billsCol = collection(db, 'users', userId, 'monthlyBills');
    const billsSnap = await getDocs(query(billsCol, where('customerId', '==', customerId)));
    const billDocs = billsSnap.docs;
    for (let i = 0; i < billDocs.length; i += 400) {
      const batch = writeBatch(db);
      billDocs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    // 3. Delete all payment records for this customer in safe batches
    const payCol = collection(db, 'users', userId, 'payments');
    const paySnap = await getDocs(query(payCol, where('customerId', '==', customerId)));
    const payDocs = paySnap.docs;
    for (let i = 0; i < payDocs.length; i += 400) {
      const batch = writeBatch(db);
      payDocs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  // 4. Delete the customer document
  const custDocRef = doc(db, 'users', userId, 'customers', customerId);
  await deleteDoc(custDocRef);
}
