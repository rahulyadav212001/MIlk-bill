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
import { db, ensureAuthenticatedUserId, cleanDocData } from './firebase';
import { Customer, MilkDeliveryTime, MilkCategory, FinalAccountClosingSummary } from '../types';
import { getTodayKolkata, formatDisplayDate, getMonthName } from '../utils/date';

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
    const isDeactivated = data.isDeactivated === true || data.accountStatus === 'deactivated';
    const isActive = data.isActive !== false && !isDeactivated;

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
      isActive,
      isDeactivated,
      deactivatedAt: data.deactivatedAt || undefined,
      closingDate: data.closingDate || undefined,
      billingPeriodStart: data.billingPeriodStart || undefined,
      billingPeriodEnd: data.billingPeriodEnd || undefined,
      finalBillAmount: data.finalBillAmount !== undefined ? Number(data.finalBillAmount) : undefined,
      finalOutstandingAmount: data.finalOutstandingAmount !== undefined ? Number(data.finalOutstandingAmount) : undefined,
      accountStatus: isDeactivated ? 'deactivated' : 'active',
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
    const isDeactivated = data.isDeactivated === true || data.accountStatus === 'deactivated';
    const isActive = data.isActive !== false && !isDeactivated;

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
      isActive,
      isDeactivated,
      deactivatedAt: data.deactivatedAt || undefined,
      closingDate: data.closingDate || undefined,
      billingPeriodStart: data.billingPeriodStart || undefined,
      billingPeriodEnd: data.billingPeriodEnd || undefined,
      finalBillAmount: data.finalBillAmount !== undefined ? Number(data.finalBillAmount) : undefined,
      finalOutstandingAmount: data.finalOutstandingAmount !== undefined ? Number(data.finalOutstandingAmount) : undefined,
      accountStatus: isDeactivated ? 'deactivated' : 'active',
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

  await setDoc(newDocRef, cleanDocData(newCustomer));

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

  await updateDoc(docRef, cleanDocData(updatePayload));

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

/**
 * Fetch all deactivated customers
 */
export async function getDeactivatedCustomers(): Promise<Customer[]> {
  const all = await getCustomers(false);
  return all.filter((c) => c.isDeactivated || c.accountStatus === 'deactivated');
}

/**
 * Calculates final bill preview according to customer's current monthly billing cycle,
 * without re-calculating or charging already completed and paid billing cycles.
 */
export async function calculateFinalBillPreview(
  customerId: string,
  closingDate: string
): Promise<FinalAccountClosingSummary> {
  const userId = await ensureAuthenticatedUserId();
  const customer = await getCustomerById(customerId);
  if (!customer) throw new Error('Customer not found.');

  const joiningDate = customer.deliveryStartDate;
  const today = getTodayKolkata();

  if (closingDate < joiningDate) {
    throw new Error(`Closing date (${closingDate}) cannot be earlier than joining date (${joiningDate}).`);
  }
  if (closingDate > today) {
    throw new Error('Closing date cannot be in the future.');
  }

  const [cYear, cMonth] = closingDate.split('-').map(Number);

  // 1. Determine the start date of the active billing cycle
  // Monthly billing runs from the 1st of the month to month-end.
  // If the customer joined in the current month, their cycle starts on their joining date!
  const firstDayOfClosingMonth = `${cYear}-${cMonth < 10 ? '0' + cMonth : cMonth}-01`;
  const billingPeriodStart = joiningDate > firstDayOfClosingMonth ? joiningDate : firstDayOfClosingMonth;
  const billingPeriodEnd = closingDate;
  const billingPeriodLabel = `${formatDisplayDate(billingPeriodStart)} to ${formatDisplayDate(billingPeriodEnd)}`;

  // 2. Identify completed billing months prior to current cycle
  const [jYear, jMonth] = joiningDate.split('-').map(Number);
  const startMonthIndex = jYear * 12 + jMonth;
  const closeMonthIndex = cYear * 12 + cMonth;
  const completedBillingMonthsCount = Math.max(0, closeMonthIndex - startMonthIndex);

  let previousBalance = 0;
  let isPreviousMonthPaid = true;
  let lastCompletedMonthLabel: string | undefined = undefined;

  if (completedBillingMonthsCount > 0) {
    let prevMonth = cMonth - 1;
    let prevYear = cYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = cYear - 1;
    }
    lastCompletedMonthLabel = `${getMonthName(prevMonth)} ${prevYear}`;

    const { getBillForCustomer, generateMonthlyBill } = await import('./billingService');
    // Ensure all prior completed months have their bills generated chronologically so balances roll forward accurately
    let curMonth = jMonth;
    let curYear = jYear;
    let lastBill = null;

    while (curYear < cYear || (curYear === cYear && curMonth < cMonth)) {
      let b = await getBillForCustomer(customerId, curMonth, curYear);
      if (!b) {
        const generated = await generateMonthlyBill(customerId, curMonth, curYear);
        b = generated.bill;
      }
      lastBill = b;
      curMonth++;
      if (curMonth > 12) {
        curMonth = 1;
        curYear++;
      }
    }

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

  // 3. Load actual daily deliveries for the active billing cycle strictly up to closingDate
  const { getCustomerDeliveries } = await import('./deliveryService');
  const monthDeliveries = await getCustomerDeliveries(customerId, cMonth, cYear);
  const currentCycleDeliveries = monthDeliveries.filter(
    (d) => d.deliveryDate >= billingPeriodStart && d.deliveryDate <= billingPeriodEnd
  );

  const currentCycleMilkQuantity = Number(
    currentCycleDeliveries.reduce((acc, d) => acc + d.actualQuantity, 0).toFixed(2)
  );
  const currentCycleMilkAmount = Number(
    currentCycleDeliveries.reduce((acc, d) => acc + d.amount, 0).toFixed(2)
  );

  // 4. Load payments received in the active billing month
  const payCol = collection(db, 'users', userId, 'payments');
  const paySnap = await getDocs(
    query(
      payCol,
      where('customerId', '==', customerId),
      where('billingMonth', '==', cMonth),
      where('billingYear', '==', cYear)
    )
  );
  let currentMonthPayments = 0;
  paySnap.forEach((d) => {
    currentMonthPayments += d.data().amount || 0;
  });
  currentMonthPayments = Number(currentMonthPayments.toFixed(2));

  // 5. Final Bill Amount and Outstanding Calculation:
  // Final Bill Amount = currentCycleMilkAmount (the unbilled charges for this cycle)
  // Final Outstanding = max(0, Previous Unpaid Balance + Current Cycle Milk - Current Payments)
  const finalBillAmount = currentCycleMilkAmount;
  const rawOutstanding = Number(
    (previousBalance + finalBillAmount - currentMonthPayments).toFixed(2)
  );
  const finalOutstandingAmount = Math.max(0, rawOutstanding);

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
    // Aliases
    totalMilkQuantity: currentCycleMilkQuantity,
    totalMilkAmount: finalBillAmount,
    currentMilkBill: finalBillAmount,
    currentMilkQuantity: currentCycleMilkQuantity,
    totalPaymentsReceived: currentMonthPayments,
  };
}

/**
 * Permanently closes/deactivates a customer account, cuts off milk charges strictly after closingDate,
 * saves the final bill for the closing billing period, and updates customer status.
 */
export async function closeCustomerAccount(
  customerId: string,
  closingDate: string
): Promise<{ success: boolean; summary: FinalAccountClosingSummary }> {
  const userId = await ensureAuthenticatedUserId();
  const summary = await calculateFinalBillPreview(customerId, closingDate);

  // Zero out / stop any delivery records strictly after closingDate
  const { getCustomerDeliveries } = await import('./deliveryService');
  const allDeliveries = await getCustomerDeliveries(customerId);
  const futureDeliveries = allDeliveries.filter((d) => d.deliveryDate > closingDate);

  if (futureDeliveries.length > 0) {
    const delCol = collection(db, 'users', userId, 'deliveries');
    for (let i = 0; i < futureDeliveries.length; i += 400) {
      const batch = writeBatch(db);
      futureDeliveries.slice(i, i + 400).forEach((fd) => {
        const dRef = doc(delCol, fd.id);
        batch.update(dRef, {
          actualQuantity: 0,
          morningQuantity: 0,
          eveningQuantity: 0,
          amount: 0,
          status: 'stopped',
          updatedAt: Date.now(),
        });
      });
      await batch.commit();
    }
  }

  // Recalculate and generate final monthly bill for the closing month
  const [cYear, cMonth] = closingDate.split('-').map(Number);
  const { generateMonthlyBill } = await import('./billingService');
  await generateMonthlyBill(customerId, cMonth, cYear);

  // Update customer document
  const custDocRef = doc(db, 'users', userId, 'customers', customerId);
  const now = Date.now();
  await updateDoc(custDocRef, cleanDocData({
    isActive: false,
    isDeactivated: true,
    deactivatedAt: now,
    closingDate,
    billingPeriodStart: summary.billingPeriodStart,
    billingPeriodEnd: summary.billingPeriodEnd,
    finalBillAmount: summary.finalBillAmount,
    finalOutstandingAmount: summary.finalOutstandingAmount,
    accountStatus: 'deactivated',
    deliveryStopDate: closingDate,
    updatedAt: now,
  }));

  return { success: true, summary };
}

/**
 * Reactivates a previously closed customer account
 */
export async function reactivateCustomer(customerId: string): Promise<void> {
  const userId = await ensureAuthenticatedUserId();
  const custDocRef = doc(db, 'users', userId, 'customers', customerId);
  await updateDoc(custDocRef, {
    isActive: true,
    isDeactivated: false,
    accountStatus: 'active',
    deliveryStopDate: null,
    updatedAt: Date.now(),
  });
}
