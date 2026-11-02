import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db, ensureAuthenticatedUserId } from './firebase';
import { getCustomers } from './customerService';
import {
  Customer,
  Delivery,
  EnrichedCustomerDelivery,
  CustomerHistorySummary,
  CustomerRangeAccountsHistory,
  CustomerDateSummary,
} from '../types';
import { getMonthName, formatDisplayDate } from '../utils/date';

/**
 * Fetch organized customer-wise, date-wise, and category-wise account history
 * for any date range [startDate, endDate] (e.g. daily, monthly, or custom multi-month).
 */
export async function getCustomerRangeAccountHistory(
  startDate: string,
  endDate: string,
  periodLabel?: string
): Promise<CustomerRangeAccountsHistory> {
  const userId = await ensureAuthenticatedUserId();

  // 1. Fetch all registered customers to map categories, phone, location, delivery times
  const allCustomers = await getCustomers();
  const customerMap = new Map<string, Customer>();
  allCustomers.forEach((c) => customerMap.set(c.id, c));

  // 2. Query deliveries in date range [startDate, endDate]
  const delCol = collection(db, 'users', userId, 'deliveries');
  const delQuery = query(
    delCol,
    where('deliveryDate', '>=', startDate),
    where('deliveryDate', '<=', endDate)
  );
  const snap = await getDocs(delQuery);

  // 3. Query payments for payment status context
  const payCol = collection(db, 'users', userId, 'payments');
  const paySnap = await getDocs(payCol);
  const customerPaidMap = new Map<string, number>();
  paySnap.forEach((pDoc) => {
    const pData = pDoc.data();
    if (pData.customerId && pData.amount) {
      const prev = customerPaidMap.get(pData.customerId) || 0;
      customerPaidMap.set(pData.customerId, prev + pData.amount);
    }
  });

  // 4. Enrich each delivery record
  const enrichedDeliveries: EnrichedCustomerDelivery[] = [];

  snap.forEach((dDoc) => {
    const dData = dDoc.data() as Delivery;
    const cust = customerMap.get(dData.customerId);

    const milkCategory = cust?.milkCategory || 'buffalo';
    const deliveryTime = cust?.deliveryTime || 'morning';
    const customerPhone = cust?.phone || '';
    const customerLocation = cust?.location || '';

    // If customer has made payments, we can flag paymentStatus
    const paidSoFar = customerPaidMap.get(dData.customerId) || 0;
    const paymentStatus: 'paid' | 'pending' = paidSoFar > 0 ? 'paid' : 'pending';

    enrichedDeliveries.push({
      id: dDoc.id,
      customerId: dData.customerId,
      customerName: dData.customerName || cust?.name || 'Unknown Customer',
      customerPhone,
      customerLocation,
      deliveryDate: dData.deliveryDate,
      milkCategory,
      deliveryTime,
      defaultQuantity: dData.defaultQuantity || 0,
      morningQuantity: dData.morningQuantity,
      eveningQuantity: dData.eveningQuantity,
      actualQuantity: dData.actualQuantity !== undefined ? dData.actualQuantity : 0,
      pricePerLiter: dData.pricePerLiter || cust?.pricePerLiter || 0,
      amount: dData.amount !== undefined ? dData.amount : 0,
      status: dData.status,
      manuallyEdited: dData.manuallyEdited === true,
      paymentStatus,
      createdAt: dData.createdAt || 0,
      updatedAt: dData.updatedAt || 0,
    });
  });

  // Sort deliveries by date ascending, then customer name
  enrichedDeliveries.sort((a, b) => {
    const cmp = a.deliveryDate.localeCompare(b.deliveryDate);
    if (cmp !== 0) return cmp;
    return (a.customerName || '').localeCompare(b.customerName || '');
  });

  // 5. Aggregate metrics
  let totalMilkDelivered = 0;
  let totalAmount = 0;
  let buffaloDelivered = 0;
  let buffaloAmount = 0;
  let cowDelivered = 0;
  let cowAmount = 0;

  for (const d of enrichedDeliveries) {
    totalMilkDelivered += d.actualQuantity;
    totalAmount += d.amount;

    if (d.milkCategory === 'cow') {
      cowDelivered += d.actualQuantity;
      cowAmount += d.amount;
    } else {
      buffaloDelivered += d.actualQuantity;
      buffaloAmount += d.amount;
    }
  }

  totalMilkDelivered = Number(totalMilkDelivered.toFixed(2));
  totalAmount = Number(totalAmount.toFixed(2));
  buffaloDelivered = Number(buffaloDelivered.toFixed(2));
  buffaloAmount = Number(buffaloAmount.toFixed(2));
  cowDelivered = Number(cowDelivered.toFixed(2));
  cowAmount = Number(cowAmount.toFixed(2));

  // 6. Group by customer into customerSummaries
  const customerGroupMap = new Map<string, EnrichedCustomerDelivery[]>();
  for (const d of enrichedDeliveries) {
    if (!customerGroupMap.has(d.customerId)) {
      customerGroupMap.set(d.customerId, []);
    }
    customerGroupMap.get(d.customerId)!.push(d);
  }

  const customerSummaries: CustomerHistorySummary[] = [];
  customerGroupMap.forEach((delList, custId) => {
    const first = delList[0];
    const cust = customerMap.get(custId);
    const cTotalMilk = Number(delList.reduce((acc, x) => acc + x.actualQuantity, 0).toFixed(2));
    const cTotalAmount = Number(delList.reduce((acc, x) => acc + x.amount, 0).toFixed(2));

    customerSummaries.push({
      customerId: custId,
      customerName: first.customerName || cust?.name || 'Customer',
      customerPhone: first.customerPhone || cust?.phone || '',
      customerLocation: first.customerLocation || cust?.location || '',
      milkCategory: first.milkCategory,
      deliveryTime: first.deliveryTime,
      pricePerLiter: first.pricePerLiter,
      totalMilkDelivered: cTotalMilk,
      totalAmount: cTotalAmount,
      deliveryCount: delList.length,
      deliveries: delList,
      paymentStatus: first.paymentStatus,
    });
  });

  // Sort customer summaries by name
  customerSummaries.sort((a, b) => a.customerName.localeCompare(b.customerName));

  // 7. Group by date into dateSummaries
  const dateGroupMap = new Map<string, EnrichedCustomerDelivery[]>();
  for (const d of enrichedDeliveries) {
    if (!dateGroupMap.has(d.deliveryDate)) {
      dateGroupMap.set(d.deliveryDate, []);
    }
    dateGroupMap.get(d.deliveryDate)!.push(d);
  }

  const dateSummaries: CustomerDateSummary[] = [];
  const sortedDates = Array.from(dateGroupMap.keys()).sort();
  for (const dt of sortedDates) {
    const dList = dateGroupMap.get(dt)!;
    const dMilk = Number(dList.reduce((acc, x) => acc + x.actualQuantity, 0).toFixed(2));
    const dAmt = Number(dList.reduce((acc, x) => acc + x.amount, 0).toFixed(2));
    dateSummaries.push({
      date: dt,
      totalMilk: dMilk,
      totalAmount: dAmt,
      deliveriesCount: dList.length,
      deliveries: dList,
    });
  }

  const label =
    periodLabel ||
    (startDate === endDate
      ? formatDisplayDate(startDate)
      : `${formatDisplayDate(startDate)} to ${formatDisplayDate(endDate)}`);

  return {
    startDate,
    endDate,
    periodLabel: label,
    totalCustomers: customerSummaries.length,
    totalMilkDelivered,
    totalAmount,
    buffaloDelivered,
    buffaloAmount,
    cowDelivered,
    cowAmount,
    customerSummaries,
    allDeliveries: enrichedDeliveries,
    dateSummaries,
  };
}

/**
 * Fetch daily history for all customers on a single date
 */
export async function getCustomerDailyAccountHistory(
  date: string
): Promise<CustomerRangeAccountsHistory> {
  return getCustomerRangeAccountHistory(date, date, `Daily Accounts – ${formatDisplayDate(date)}`);
}

/**
 * Fetch monthly history for all customers for a given month and year
 */
export async function getCustomerMonthlyAccountHistory(
  year: number,
  month: number
): Promise<CustomerRangeAccountsHistory> {
  const mStr = month < 10 ? `0${month}` : `${month}`;
  const startDate = `${year}-${mStr}-01`;

  // Determine last day of the month
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${mStr}-${lastDay < 10 ? `0${lastDay}` : lastDay}`;

  const periodLabel = `${getMonthName(month)} ${year}`;
  return getCustomerRangeAccountHistory(startDate, endDate, periodLabel);
}

