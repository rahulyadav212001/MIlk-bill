import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  runTransaction,
} from 'firebase/firestore';
import { db, ensureAuthenticatedUserId } from './firebase';
import {
  Supplier,
  MilkPurchase,
  MilkSale,
  MilkCategory,
  MilkSession,
  OverallStockSummary,
  CategoryStock,
  EnrichedPurchaseTransaction,
  SupplierRangeSummary,
  DateSummary,
  RangeAccountsHistory,
} from '../types';

function getPurchasesCollection(userId: string) {
  return collection(db, 'users', userId, 'milkPurchases');
}

function getLegacyPurchasesCollection(userId: string) {
  return collection(db, 'users', userId, 'supplierPurchases');
}

function getSalesCollection(userId: string) {
  return collection(db, 'users', userId, 'milkSales');
}

/**
 * Remove all keys with `undefined` values recursively so Firestore never throws
 * "Function setDoc() called with invalid data. Unsupported field value: undefined"
 */
function cleanDocData<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        result[key] = cleanDocData(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * Record a new milk purchase from a supplier.
 * Stores every Buy transaction separately with a unique document ID,
 * ensuring previous transactions are never overwritten even for the same supplier,
 * milk category, date, and session.
 */
export async function recordMilkPurchase(data: {
  supplierId: string;
  supplierName: string;
  supplierPhone: string;
  milkCategory: MilkCategory;
  session: MilkSession;
  purchaseDate: string;
  quantityLiters: number;
  pricePerLiter: number;
}): Promise<MilkPurchase> {
  const userId = await ensureAuthenticatedUserId();
  const quantity = Number(data.quantityLiters);
  const price = Number(data.pricePerLiter);

  if (isNaN(quantity) || quantity <= 0) {
    throw new Error('Milk quantity must be greater than 0 Litres.');
  }
  if (isNaN(price) || price <= 0) {
    throw new Error('Purchase rate per litre must be greater than ₹0.');
  }
  if (!data.milkCategory || (data.milkCategory !== 'buffalo' && data.milkCategory !== 'cow')) {
    throw new Error('Please select a valid milk category (Buffalo Milk or Cow Milk).');
  }

  const coll = getPurchasesCollection(userId);
  const now = Date.now();
  // Guaranteed unique transaction ID
  const docId = `purchase_${data.supplierId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const dRef = doc(coll, docId);

  const totalAmount = Number((quantity * price).toFixed(2));

  const newPurchase: MilkPurchase = {
    id: docId,
    supplierId: data.supplierId || '',
    supplierName: data.supplierName || '',
    supplierPhone: data.supplierPhone || '',
    milkCategory: data.milkCategory,
    session: data.session || 'morning',
    purchaseDate: data.purchaseDate,
    quantityLiters: quantity,
    pricePerLiter: price,
    totalAmount,
    totalSoldQuantity: 0,
    remainingQuantity: quantity,
    wastageQuantity: 0,
    isSold: false,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(dRef, cleanDocData(newPurchase));
  return newPurchase;
}

/**
 * Record a single final milk sale against a purchase transaction.
 * Uses atomic Firestore transactions to prevent duplicate sales entries.
 * Stores the permanent sales history record in Firestore.
 */
export async function recordMilkSale(data: {
  purchaseId: string;
  soldQuantityLiters?: number;
  quantityLiters?: number;
  pricePerLiter?: number;
  saleDate?: string;
  notes?: string;
}): Promise<MilkSale> {
  const userId = await ensureAuthenticatedUserId();
  const soldQty = Number(data.soldQuantityLiters ?? data.quantityLiters);
  const price = data.pricePerLiter ? Number(data.pricePerLiter) : 0;

  if (isNaN(soldQty) || soldQty <= 0) {
    throw new Error('Sold milk quantity must be greater than 0 Litres.');
  }
  if (price < 0) {
    throw new Error('Sale price per litre cannot be negative.');
  }

  const purchaseRef = doc(db, 'users', userId, 'milkPurchases', data.purchaseId);
  const saleDocId = `sale_${data.purchaseId}`;
  const saleRef = doc(db, 'users', userId, 'milkSales', saleDocId);

  return await runTransaction(db, async (txn) => {
    let pSnap = await txn.get(purchaseRef);
    let isLegacy = false;
    let legacyRef = null;

    if (!pSnap.exists()) {
      legacyRef = doc(db, 'users', userId, 'supplierPurchases', data.purchaseId);
      pSnap = await txn.get(legacyRef);
      isLegacy = true;
    }

    if (!pSnap.exists()) {
      throw new Error('Purchase transaction record not found.');
    }

    const pData = pSnap.data() as any;

    // Check if already sold - strictly prevent duplicate sales entries
    if (pData.isSold === true || pData.status === 'sold' || pData.status === 'completed') {
      throw new Error('This purchase transaction has already been sold. Duplicate sales are not allowed.');
    }

    const existingSaleSnap = await txn.get(saleRef);
    if (existingSaleSnap.exists()) {
      throw new Error('A sales record has already been saved for this purchase transaction.');
    }

    const purchasedQty = Number(pData.quantityLiters || 0);
    const purchaseRate = Number(pData.pricePerLiter || 0);
    const totalPurchaseAmount = Number(
      (pData.totalAmount !== undefined ? pData.totalAmount : purchasedQty * purchaseRate).toFixed(2)
    );

    if (soldQty > purchasedQty) {
      throw new Error(
        `Sold quantity (${soldQty} L) cannot exceed purchased quantity (${purchasedQty} L).`
      );
    }

    const remainingQty = Math.max(0, Number((purchasedQty - soldQty).toFixed(2)));
    // Automatic Waste of Money Calculation: Loss Amount = Wasted Milk Quantity * Purchase Price Per Litre
    const wastageQty = remainingQty;
    const lossAmount = Number((wastageQty * purchaseRate).toFixed(2));
    const status: 'no_loss' | 'remaining' | 'loss' = remainingQty === 0 ? 'no_loss' : 'remaining';
    const statusText = remainingQty === 0 ? 'No Loss' : `${remainingQty} Litres Remaining`;

    const now = Date.now();
    const saleDate = data.saleDate || pData.purchaseDate || new Date().toISOString().split('T')[0];

    // Build permanent sales history document - NO UNDEFINED VALUES
    const saleRecord: Record<string, any> = {
      id: saleDocId,
      purchaseId: data.purchaseId,
      supplierId: pData.supplierId || '',
      supplierName: pData.supplierName || '',
      supplierPhone: pData.supplierPhone || '',
      milkCategory: pData.milkCategory || 'buffalo',
      session: pData.session || 'morning',
      purchaseDate: pData.purchaseDate || saleDate,
      saleDate: saleDate,
      purchasedQuantityLiters: purchasedQty,
      purchasePricePerLiter: purchaseRate,
      totalPurchaseAmount: totalPurchaseAmount,
      soldQuantityLiters: soldQty,
      quantityLiters: soldQty,
      remainingQuantityLiters: remainingQty,
      remainingQuantity: remainingQty,
      wastageQuantity: wastageQty,
      lossAmount: lossAmount,
      status: status,
      statusText: statusText,
      createdAt: now,
      updatedAt: now,
    };

    if (price > 0) {
      saleRecord.pricePerLiter = price;
      saleRecord.totalAmount = Number((soldQty * price).toFixed(2));
    }

    if (data.notes && data.notes.trim()) {
      saleRecord.notes = data.notes.trim();
    }

    // Set permanent sales document
    txn.set(saleRef, cleanDocData(saleRecord));

    // Update purchase document to mark as SOLD
    const purchaseUpdatePayload = {
      totalSoldQuantity: soldQty,
      remainingQuantity: remainingQty,
      wastageQuantity: wastageQty,
      lossAmount: lossAmount,
      isSold: true,
      status: 'sold',
      saleRecordId: saleDocId,
      updatedAt: now,
    };

    if (isLegacy) {
      txn.set(purchaseRef, cleanDocData({ ...pData, ...purchaseUpdatePayload }), { merge: true });
    } else {
      txn.update(purchaseRef, cleanDocData(purchaseUpdatePayload));
    }

    return saleRecord as MilkSale;
  });
}

/**
 * Recalculate totalSoldQuantity and remainingQuantity for a purchase transaction
 */
export async function recalculatePurchaseQuantities(userId: string, purchaseId: string): Promise<void> {
  const purchaseRef = doc(db, 'users', userId, 'milkPurchases', purchaseId);
  let purchaseSnap = await getDoc(purchaseRef);
  let targetRef = purchaseRef;

  if (!purchaseSnap.exists()) {
    const legRef = doc(db, 'users', userId, 'supplierPurchases', purchaseId);
    const legSnap = await getDoc(legRef);
    if (legSnap.exists()) {
      targetRef = legRef;
      purchaseSnap = legSnap;
    } else {
      return;
    }
  }

  const purchase = purchaseSnap.data() as any;

  // Query all sales for this purchaseId
  const salesColl = getSalesCollection(userId);
  const q = query(salesColl, where('purchaseId', '==', purchaseId));
  const snap = await getDocs(q);

  let cumulativeSold = 0;
  snap.forEach((d) => {
    const s = d.data() as MilkSale;
    cumulativeSold += Number(s.quantityLiters) || 0;
  });

  cumulativeSold = Number(cumulativeSold.toFixed(2));
  const wastage = Number(purchase.wastageQuantity || 0);
  const qtyLiters = Number(purchase.quantityLiters || 0);
  const remaining = Math.max(0, Number((qtyLiters - cumulativeSold - wastage).toFixed(2)));

  const updatePayload = {
    totalSoldQuantity: cumulativeSold,
    remainingQuantity: remaining,
    updatedAt: Date.now(),
  };

  await updateDoc(targetRef, cleanDocData(updatePayload));
}

/**
 * Record explicit wastage on a purchase
 */
export async function recordWastage(purchaseId: string, wastageQuantity: number): Promise<void> {
  const userId = await ensureAuthenticatedUserId();
  const wastage = Number(wastageQuantity);
  if (isNaN(wastage) || wastage < 0) {
    throw new Error('Wastage quantity must be a positive number.');
  }

  const purchaseRef = doc(db, 'users', userId, 'milkPurchases', purchaseId);
  let purchaseSnap = await getDoc(purchaseRef);
  let targetRef = purchaseRef;

  if (!purchaseSnap.exists()) {
    const legRef = doc(db, 'users', userId, 'supplierPurchases', purchaseId);
    const legSnap = await getDoc(legRef);
    if (legSnap.exists()) {
      targetRef = legRef;
      purchaseSnap = legSnap;
    } else {
      throw new Error('Purchase record not found.');
    }
  }

  const purchase = purchaseSnap.data() as any;
  const sold = Number(purchase.totalSoldQuantity || 0);
  const qtyLiters = Number(purchase.quantityLiters || 0);
  const remaining = Math.max(0, Number((qtyLiters - sold - wastage).toFixed(2)));

  const updatePayload = {
    wastageQuantity: wastage,
    remainingQuantity: remaining,
    updatedAt: Date.now(),
  };

  await updateDoc(targetRef, cleanDocData(updatePayload));
}

/**
 * Fetch the single permanent milk sale for a purchase transaction
 */
export async function getSaleForPurchase(purchaseId: string): Promise<MilkSale | null> {
  const userId = await ensureAuthenticatedUserId();
  const saleRef = doc(db, 'users', userId, 'milkSales', `sale_${purchaseId}`);
  const snap = await getDoc(saleRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  const purchasedQty = Number(data.purchasedQuantityLiters || 0);
  const soldQty = Number(data.soldQuantityLiters || data.quantityLiters || 0);
  const remQty = Number(
    data.remainingQuantityLiters !== undefined
      ? data.remainingQuantityLiters
      : data.remainingQuantity !== undefined
      ? data.remainingQuantity
      : Math.max(0, purchasedQty - soldQty)
  );

  return {
    id: snap.id,
    purchaseId: data.purchaseId || purchaseId,
    supplierId: data.supplierId || '',
    supplierName: data.supplierName || '',
    supplierPhone: data.supplierPhone || '',
    milkCategory: (data.milkCategory as MilkCategory) || 'buffalo',
    session: (data.session as MilkSession) || 'morning',
    purchaseDate: data.purchaseDate || data.saleDate || '',
    saleDate: data.saleDate || '',
    purchasedQuantityLiters: purchasedQty,
    purchasePricePerLiter: Number(data.purchasePricePerLiter || 0),
    totalPurchaseAmount: Number(data.totalPurchaseAmount || 0),
    soldQuantityLiters: soldQty,
    quantityLiters: soldQty,
    remainingQuantityLiters: remQty,
    remainingQuantity: remQty,
    status: (data.status as any) || (remQty === 0 ? 'no_loss' : 'remaining'),
    statusText: data.statusText || (remQty === 0 ? 'No Loss' : `${remQty} Litres Remaining`),
    pricePerLiter: data.pricePerLiter ? Number(data.pricePerLiter) : undefined,
    totalAmount: data.totalAmount ? Number(data.totalAmount) : undefined,
    wastageQuantity:
      data.wastageQuantity !== undefined
        ? Number(data.wastageQuantity)
        : remQty,
    lossAmount:
      data.lossAmount !== undefined
        ? Number(data.lossAmount)
        : Number((remQty * Number(data.purchasePricePerLiter || 0)).toFixed(2)),
    notes: data.notes || undefined,
    createdAt: data.createdAt || 0,
    updatedAt: data.updatedAt || 0,
  };
}

/**
 * Fetch all milk sales for a given purchase ID
 */
export async function getSalesForPurchase(purchaseId: string): Promise<MilkSale[]> {
  const sale = await getSaleForPurchase(purchaseId);
  return sale ? [sale] : [];
}

/**
 * Delete a milk sale and automatically update the purchase record
 */
export async function deleteMilkSale(saleId: string, purchaseId?: string): Promise<void> {
  const userId = await ensureAuthenticatedUserId();
  const dRef = doc(db, 'users', userId, 'milkSales', saleId);

  let targetPurchaseId = purchaseId;
  if (!targetPurchaseId) {
    const snap = await getDoc(dRef);
    if (snap.exists()) {
      targetPurchaseId = snap.data().purchaseId;
    }
  }

  await deleteDoc(dRef);

  if (targetPurchaseId) {
    // Reset purchase isSold status
    const pRef = doc(db, 'users', userId, 'milkPurchases', targetPurchaseId);
    const pSnap = await getDoc(pRef);
    if (pSnap.exists()) {
      const p = pSnap.data();
      const qtyLiters = Number(p.quantityLiters || 0);
      await updateDoc(pRef, {
        totalSoldQuantity: 0,
        remainingQuantity: qtyLiters,
        isSold: false,
        status: 'pending',
        updatedAt: Date.now(),
      });
    }
    await recalculatePurchaseQuantities(userId, targetPurchaseId);
  }
}

/**
 * Fetch all milk purchases for a specific date across all suppliers.
 * Includes legacy records if milkPurchases has none for that date.
 */
export async function getAllPurchasesForDate(
  date: string,
  supplierId?: string
): Promise<MilkPurchase[]> {
  const userId = await ensureAuthenticatedUserId();
  const coll = getPurchasesCollection(userId);

  let q = query(coll, where('purchaseDate', '==', date));
  if (supplierId) {
    q = query(coll, where('purchaseDate', '==', date), where('supplierId', '==', supplierId));
  }

  const snapshot = await getDocs(q);
  const list: MilkPurchase[] = [];

  snapshot.forEach((d) => {
    const data = d.data();
    const qtyLiters = Number(data.quantityLiters) || 0;
    const soldQty = Number(data.totalSoldQuantity) || 0;
    const isSold = data.isSold === true || soldQty > 0;
    list.push({
      id: d.id,
      supplierId: data.supplierId,
      supplierName: data.supplierName || '',
      supplierPhone: data.supplierPhone || '',
      milkCategory: (data.milkCategory as MilkCategory) || 'buffalo',
      session: (data.session as MilkSession) || 'morning',
      purchaseDate: data.purchaseDate,
      quantityLiters: qtyLiters,
      pricePerLiter: Number(data.pricePerLiter) || 0,
      totalAmount: Number(data.totalAmount) || 0,
      totalSoldQuantity: soldQty,
      remainingQuantity:
        data.remainingQuantity !== undefined
          ? Number(data.remainingQuantity)
          : Math.max(0, qtyLiters - soldQty),
      wastageQuantity: Number(data.wastageQuantity) || 0,
      isSold: isSold,
      status: (data.status as any) || (isSold ? 'sold' : 'pending'),
      saleRecordId: data.saleRecordId || undefined,
      createdAt: data.createdAt || 0,
      updatedAt: data.updatedAt || 0,
    });
  });

  // If no records in milkPurchases for this date, also check legacy supplierPurchases
  if (list.length === 0) {
    const legColl = getLegacyPurchasesCollection(userId);
    let legQ = query(legColl, where('purchaseDate', '==', date));
    if (supplierId) {
      legQ = query(legColl, where('purchaseDate', '==', date), where('supplierId', '==', supplierId));
    }
    const legSnap = await getDocs(legQ);
    legSnap.forEach((d) => {
      const data = d.data();
      const qtyLiters = Number(data.quantityLiters) || 0;
      const soldQty = Number(data.totalSoldQuantity) || 0;
      const isSold = data.isSold === true || soldQty > 0;
      list.push({
        id: d.id,
        supplierId: data.supplierId,
        supplierName: data.supplierName || '',
        supplierPhone: data.supplierPhone || '',
        milkCategory: (data.milkCategory as MilkCategory) || 'buffalo',
        session: (data.session as MilkSession) || 'morning',
        purchaseDate: data.purchaseDate,
        quantityLiters: qtyLiters,
        pricePerLiter: Number(data.pricePerLiter) || 0,
        totalAmount: Number(data.totalAmount) || 0,
        totalSoldQuantity: soldQty,
        remainingQuantity:
          data.remainingQuantity !== undefined
            ? Number(data.remainingQuantity)
            : Math.max(0, qtyLiters - soldQty),
        wastageQuantity: Number(data.wastageQuantity) || 0,
        isSold: isSold,
        status: (data.status as any) || (isSold ? 'sold' : 'pending'),
        saleRecordId: data.saleRecordId || undefined,
        createdAt: data.createdAt || 0,
        updatedAt: data.updatedAt || 0,
      });
    });
  }

  // Sort: morning first, afternoon second, evening third; then createdAt
  const sessionOrder = { morning: 1, afternoon: 2, evening: 3 };
  return list.sort((a, b) => {
    const orderDiff = (sessionOrder[a.session] || 1) - (sessionOrder[b.session] || 1);
    if (orderDiff !== 0) return orderDiff;
    return a.createdAt - b.createdAt;
  });
}

/**
 * Fetch all milk purchases for a specific date range [startDate, endDate]
 */
export async function getAllPurchasesForDateRange(
  startDate: string,
  endDate: string,
  supplierId?: string
): Promise<MilkPurchase[]> {
  const userId = await ensureAuthenticatedUserId();
  const coll = getPurchasesCollection(userId);

  let q = query(
    coll,
    where('purchaseDate', '>=', startDate),
    where('purchaseDate', '<=', endDate)
  );
  if (supplierId) {
    q = query(
      coll,
      where('purchaseDate', '>=', startDate),
      where('purchaseDate', '<=', endDate),
      where('supplierId', '==', supplierId)
    );
  }

  const snapshot = await getDocs(q);
  const list: MilkPurchase[] = [];
  const seenIds = new Set<string>();

  snapshot.forEach((d) => {
    const data = d.data();
    const qtyLiters = Number(data.quantityLiters) || 0;
    const soldQty = Number(data.totalSoldQuantity) || 0;
    const isSold = data.isSold === true || soldQty > 0;
    seenIds.add(d.id);
    list.push({
      id: d.id,
      supplierId: data.supplierId,
      supplierName: data.supplierName || '',
      supplierPhone: data.supplierPhone || '',
      milkCategory: (data.milkCategory as MilkCategory) || 'buffalo',
      session: (data.session as MilkSession) || 'morning',
      purchaseDate: data.purchaseDate,
      quantityLiters: qtyLiters,
      pricePerLiter: Number(data.pricePerLiter) || 0,
      totalAmount: Number(data.totalAmount) || 0,
      totalSoldQuantity: soldQty,
      remainingQuantity:
        data.remainingQuantity !== undefined
          ? Number(data.remainingQuantity)
          : Math.max(0, qtyLiters - soldQty),
      wastageQuantity: Number(data.wastageQuantity) || 0,
      isSold: isSold,
      status: (data.status as any) || (isSold ? 'sold' : 'pending'),
      saleRecordId: data.saleRecordId || undefined,
      createdAt: data.createdAt || 0,
      updatedAt: data.updatedAt || 0,
    });
  });

  // Also query legacy supplierPurchases collection for any historical records in this range
  const legColl = getLegacyPurchasesCollection(userId);
  let legQ = query(
    legColl,
    where('purchaseDate', '>=', startDate),
    where('purchaseDate', '<=', endDate)
  );
  if (supplierId) {
    legQ = query(
      legColl,
      where('purchaseDate', '>=', startDate),
      where('purchaseDate', '<=', endDate),
      where('supplierId', '==', supplierId)
    );
  }
  const legSnap = await getDocs(legQ);
  legSnap.forEach((d) => {
    if (!seenIds.has(d.id)) {
      const data = d.data();
      const qtyLiters = Number(data.quantityLiters) || 0;
      const soldQty = Number(data.totalSoldQuantity) || 0;
      const isSold = data.isSold === true || soldQty > 0;
      list.push({
        id: d.id,
        supplierId: data.supplierId,
        supplierName: data.supplierName || '',
        supplierPhone: data.supplierPhone || '',
        milkCategory: (data.milkCategory as MilkCategory) || 'buffalo',
        session: (data.session as MilkSession) || 'morning',
        purchaseDate: data.purchaseDate,
        quantityLiters: qtyLiters,
        pricePerLiter: Number(data.pricePerLiter) || 0,
        totalAmount: Number(data.totalAmount) || 0,
        totalSoldQuantity: soldQty,
        remainingQuantity:
          data.remainingQuantity !== undefined
            ? Number(data.remainingQuantity)
            : Math.max(0, qtyLiters - soldQty),
        wastageQuantity: Number(data.wastageQuantity) || 0,
        isSold: isSold,
        status: (data.status as any) || (isSold ? 'sold' : 'pending'),
        saleRecordId: data.saleRecordId || undefined,
        createdAt: data.createdAt || 0,
        updatedAt: data.updatedAt || 0,
      });
    }
  });

  // Sort: date ascending, then morning/afternoon/evening, then createdAt
  const sessionOrder = { morning: 1, afternoon: 2, evening: 3 };
  return list.sort((a, b) => {
    const dateCmp = a.purchaseDate.localeCompare(b.purchaseDate);
    if (dateCmp !== 0) return dateCmp;
    const orderDiff = (sessionOrder[a.session] || 1) - (sessionOrder[b.session] || 1);
    if (orderDiff !== 0) return orderDiff;
    return a.createdAt - b.createdAt;
  });
}

/**
 * Fetch all milk sales for a given date range [startDate, endDate]
 */
export async function getMilkSalesForDateRange(
  startDate: string,
  endDate: string
): Promise<MilkSale[]> {
  const userId = await ensureAuthenticatedUserId();
  const coll = getSalesCollection(userId);

  const q = query(
    coll,
    where('saleDate', '>=', startDate),
    where('saleDate', '<=', endDate)
  );

  const snapshot = await getDocs(q);
  const list: MilkSale[] = [];

  snapshot.forEach((d) => {
    const data = d.data();
    const purchasedQty = Number(data.purchasedQuantityLiters || 0);
    const soldQty = Number(data.soldQuantityLiters || data.quantityLiters || 0);
    const remQty = Number(
      data.remainingQuantityLiters !== undefined
        ? data.remainingQuantityLiters
        : data.remainingQuantity !== undefined
        ? data.remainingQuantity
        : Math.max(0, purchasedQty - soldQty)
    );
    list.push({
      id: d.id,
      purchaseId: data.purchaseId || '',
      supplierId: data.supplierId || '',
      supplierName: data.supplierName || '',
      supplierPhone: data.supplierPhone || '',
      milkCategory: (data.milkCategory as MilkCategory) || 'buffalo',
      session: (data.session as MilkSession) || 'morning',
      purchaseDate: data.purchaseDate || data.saleDate || '',
      saleDate: data.saleDate || '',
      purchasedQuantityLiters: purchasedQty,
      purchasePricePerLiter: Number(data.purchasePricePerLiter || 0),
      totalPurchaseAmount: Number(data.totalPurchaseAmount || 0),
      soldQuantityLiters: soldQty,
      quantityLiters: soldQty,
      remainingQuantityLiters: remQty,
      remainingQuantity: remQty,
      status: (data.status as any) || (remQty === 0 ? 'no_loss' : 'remaining'),
      statusText: data.statusText || (remQty === 0 ? 'No Loss' : `${remQty} Litres Remaining`),
      pricePerLiter: data.pricePerLiter ? Number(data.pricePerLiter) : undefined,
      totalAmount: data.totalAmount ? Number(data.totalAmount) : undefined,
      wastageQuantity:
        data.wastageQuantity !== undefined
          ? Number(data.wastageQuantity)
          : remQty,
      lossAmount:
        data.lossAmount !== undefined
          ? Number(data.lossAmount)
          : Number((remQty * Number(data.purchasePricePerLiter || 0)).toFixed(2)),
      notes: data.notes || undefined,
      createdAt: data.createdAt || 0,
      updatedAt: data.updatedAt || 0,
    });
  });

  return list.sort((a, b) => a.saleDate.localeCompare(b.saleDate));
}

/**
 * Fetch all milk sales for a given date
 */
export async function getMilkSales(date?: string): Promise<MilkSale[]> {
  const userId = await ensureAuthenticatedUserId();
  const coll = getSalesCollection(userId);

  let q = query(coll);
  if (date) {
    q = query(coll, where('saleDate', '==', date));
  }

  const snapshot = await getDocs(q);
  const list: MilkSale[] = [];

  snapshot.forEach((d) => {
    const data = d.data();
    const purchasedQty = Number(data.purchasedQuantityLiters || 0);
    const soldQty = Number(data.soldQuantityLiters || data.quantityLiters || 0);
    const remQty = Number(
      data.remainingQuantityLiters !== undefined
        ? data.remainingQuantityLiters
        : data.remainingQuantity !== undefined
        ? data.remainingQuantity
        : Math.max(0, purchasedQty - soldQty)
    );
    list.push({
      id: d.id,
      purchaseId: data.purchaseId || '',
      supplierId: data.supplierId || '',
      supplierName: data.supplierName || '',
      supplierPhone: data.supplierPhone || '',
      milkCategory: (data.milkCategory as MilkCategory) || 'buffalo',
      session: (data.session as MilkSession) || 'morning',
      purchaseDate: data.purchaseDate || data.saleDate || '',
      saleDate: data.saleDate || '',
      purchasedQuantityLiters: purchasedQty,
      purchasePricePerLiter: Number(data.purchasePricePerLiter || 0),
      totalPurchaseAmount: Number(data.totalPurchaseAmount || 0),
      soldQuantityLiters: soldQty,
      quantityLiters: soldQty,
      remainingQuantityLiters: remQty,
      remainingQuantity: remQty,
      status: (data.status as any) || (remQty === 0 ? 'no_loss' : 'remaining'),
      statusText: data.statusText || (remQty === 0 ? 'No Loss' : `${remQty} Litres Remaining`),
      pricePerLiter: data.pricePerLiter ? Number(data.pricePerLiter) : undefined,
      totalAmount: data.totalAmount ? Number(data.totalAmount) : undefined,
      wastageQuantity:
        data.wastageQuantity !== undefined
          ? Number(data.wastageQuantity)
          : remQty,
      lossAmount:
        data.lossAmount !== undefined
          ? Number(data.lossAmount)
          : Number((remQty * Number(data.purchasePricePerLiter || 0)).toFixed(2)),
      notes: data.notes || undefined,
      createdAt: data.createdAt || 0,
      updatedAt: data.updatedAt || 0,
    });
  });

  return list.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Delete a milk purchase transaction
 */
export async function deleteMilkPurchase(purchaseId: string): Promise<void> {
  const userId = await ensureAuthenticatedUserId();
  const dRef = doc(db, 'users', userId, 'milkPurchases', purchaseId);
  await deleteDoc(dRef);

  // Clean up associated sales
  const salesColl = getSalesCollection(userId);
  const q = query(salesColl, where('purchaseId', '==', purchaseId));
  const snap = await getDocs(q);
  for (const s of snap.docs) {
    await deleteDoc(s.ref);
  }

  // Also clean up legacy supplierPurchases if present
  try {
    const legRef = doc(db, 'users', userId, 'supplierPurchases', purchaseId);
    await deleteDoc(legRef);
  } catch {
    // Ignore legacy cleanup error
  }
}

/**
 * Update an existing milk purchase transaction.
 * Automatically recalculates total amount, remaining quantity, wastage, loss, and status.
 * If a linked sale document exists, automatically synchronizes the sale record with updated purchase data.
 */
export async function updateMilkPurchase(
  purchaseId: string,
  updates: {
    quantityLiters?: number;
    pricePerLiter?: number;
    milkCategory?: MilkCategory;
    session?: MilkSession;
    purchaseDate?: string;
  }
): Promise<MilkPurchase> {
  const userId = await ensureAuthenticatedUserId();
  const pRef = doc(db, 'users', userId, 'milkPurchases', purchaseId);
  const pSnap = await getDoc(pRef);
  if (!pSnap.exists()) {
    throw new Error('Purchase record not found.');
  }
  const current = pSnap.data() as MilkPurchase;

  const newQty = updates.quantityLiters !== undefined ? Number(updates.quantityLiters) : current.quantityLiters;
  const newPrice = updates.pricePerLiter !== undefined ? Number(updates.pricePerLiter) : current.pricePerLiter;
  const newCategory = updates.milkCategory || current.milkCategory || 'buffalo';
  const newSession = updates.session || current.session || 'morning';
  const newDate = updates.purchaseDate || current.purchaseDate;

  if (isNaN(newQty) || newQty <= 0) {
    throw new Error('Milk quantity must be greater than 0 Litres.');
  }
  if (isNaN(newPrice) || newPrice <= 0) {
    throw new Error('Purchase rate per litre must be greater than ₹0.');
  }

  const soldQty = Number(current.totalSoldQuantity) || 0;
  if (soldQty > newQty) {
    throw new Error(`Cannot reduce purchase quantity to ${newQty} L because ${soldQty} L has already been sold.`);
  }

  const newTotalAmount = Number((newQty * newPrice).toFixed(2));
  const newRemaining = Math.max(0, Number((newQty - soldQty).toFixed(2)));
  const newWastage = newRemaining;
  const newLoss = Number((newWastage * newPrice).toFixed(2));
  const isSold = soldQty > 0 || current.isSold === true;
  const status = isSold ? (newRemaining === 0 ? 'sold' : 'pending') : 'pending';

  const updatedRecord: Partial<MilkPurchase> = {
    quantityLiters: newQty,
    pricePerLiter: newPrice,
    totalAmount: newTotalAmount,
    milkCategory: newCategory,
    session: newSession,
    purchaseDate: newDate,
    remainingQuantity: newRemaining,
    wastageQuantity: newWastage,
    lossAmount: newLoss,
    status: status as any,
    updatedAt: Date.now(),
  };

  await updateDoc(pRef, cleanDocData(updatedRecord));

  // Sync linked sales record if exists
  const saleDocId = `sale_${purchaseId}`;
  const saleRef = doc(db, 'users', userId, 'milkSales', saleDocId);
  const saleSnap = await getDoc(saleRef);
  if (saleSnap.exists()) {
    const saleData = saleSnap.data() as MilkSale;
    const saleSold = Number(saleData.soldQuantityLiters) || soldQty;
    const saleRemaining = Math.max(0, Number((newQty - saleSold).toFixed(2)));
    const saleLoss = Number((saleRemaining * newPrice).toFixed(2));

    await updateDoc(saleRef, cleanDocData({
      purchasedQuantityLiters: newQty,
      purchasePricePerLiter: newPrice,
      totalPurchaseAmount: newTotalAmount,
      milkCategory: newCategory,
      session: newSession,
      purchaseDate: newDate,
      remainingQuantityLiters: saleRemaining,
      remainingQuantity: saleRemaining,
      wastageQuantity: saleRemaining,
      lossAmount: saleLoss,
      status: saleRemaining === 0 ? 'no_loss' : 'loss',
      statusText: saleRemaining === 0 ? 'No Loss' : `${saleRemaining} Litres Remaining`,
      updatedAt: Date.now(),
    }));
  }

  return {
    ...current,
    ...updatedRecord,
  } as MilkPurchase;
}

export interface SupplierInventoryBreakdown {
  supplierId: string;
  totalPurchased: number;
  totalSold: number;
  remaining: number;
  buffaloPurchased: number;
  buffaloSold: number;
  buffaloRemaining: number;
  cowPurchased: number;
  cowSold: number;
  cowRemaining: number;
  entriesCount: number;
}

/**
 * Helper to compute separate Buffalo & Cow breakdown for a specific supplier
 */
export function computeSupplierInventory(
  supplierId: string,
  purchases: MilkPurchase[]
): SupplierInventoryBreakdown {
  const supPurchases = purchases.filter(
    (p) => p.supplierId === supplierId && !(p as any).supplierDeleted && !(p as any).isSupplierDeleted
  );

  let buffaloPurchased = 0;
  let buffaloSold = 0;
  let buffaloRemaining = 0;
  let cowPurchased = 0;
  let cowSold = 0;
  let cowRemaining = 0;

  for (const p of supPurchases) {
    const qty = Number(p.quantityLiters) || 0;
    const sold = Number(p.totalSoldQuantity) || 0;
    const rem = Number(p.remainingQuantity) || Math.max(0, qty - sold);

    if (p.milkCategory === 'cow') {
      cowPurchased += qty;
      cowSold += sold;
      cowRemaining += rem;
    } else {
      buffaloPurchased += qty;
      buffaloSold += sold;
      buffaloRemaining += rem;
    }
  }

  return {
    supplierId,
    totalPurchased: Number((buffaloPurchased + cowPurchased).toFixed(2)),
    totalSold: Number((buffaloSold + cowSold).toFixed(2)),
    remaining: Number((buffaloRemaining + cowRemaining).toFixed(2)),
    buffaloPurchased: Number(buffaloPurchased.toFixed(2)),
    buffaloSold: Number(buffaloSold.toFixed(2)),
    buffaloRemaining: Number(buffaloRemaining.toFixed(2)),
    cowPurchased: Number(cowPurchased.toFixed(2)),
    cowSold: Number(cowSold.toFixed(2)),
    cowRemaining: Number(cowRemaining.toFixed(2)),
    entriesCount: supPurchases.length,
  };
}

/**
 * Helper to compute category stock
 */
function computeCategoryStock(
  category: MilkCategory,
  purchases: MilkPurchase[]
): CategoryStock {
  const catPurchases = purchases.filter((p) => p.milkCategory === category);

  const purchasedLiters = Number(
    catPurchases.reduce((acc, p) => acc + (p.quantityLiters || 0), 0).toFixed(2)
  );
  const soldLiters = Number(
    catPurchases.reduce((acc, p) => acc + (p.totalSoldQuantity || 0), 0).toFixed(2)
  );
  const remainingLiters = Number(
    catPurchases.reduce((acc, p) => acc + (p.remainingQuantity || 0), 0).toFixed(2)
  );

  let status: 'no_loss' | 'loss' | 'surplus' = 'no_loss';
  if (remainingLiters > 0) {
    status = 'loss';
  } else {
    status = 'no_loss';
  }

  return {
    category,
    purchasedLiters,
    soldLiters,
    remainingLiters,
    status,
  };
}

/**
 * Calculate complete daily stock summary.
 * Filters out deleted or inactive suppliers to ensure accurate active stock calculation.
 */
export function calculateDailyStockSummary(
  date: string,
  suppliers: Supplier[],
  purchases: MilkPurchase[]
): {
  overall: OverallStockSummary;
} {
  const activeSupplierIds = new Set(
    (suppliers || []).filter((s) => s.isActive !== false).map((s) => s.id)
  );

  const activePurchases =
    suppliers && suppliers.length > 0
      ? purchases.filter(
          (p) =>
            activeSupplierIds.has(p.supplierId) &&
            !(p as any).supplierDeleted &&
            !(p as any).isSupplierDeleted
        )
      : purchases.filter(
          (p) => !(p as any).supplierDeleted && !(p as any).isSupplierDeleted
        );

  const buffalo = computeCategoryStock('buffalo', activePurchases);
  const cow = computeCategoryStock('cow', activePurchases);

  const totalPurchasedLiters = Number((buffalo.purchasedLiters + cow.purchasedLiters).toFixed(2));
  const totalSoldLiters = Number((buffalo.soldLiters + cow.soldLiters).toFixed(2));
  const remainingLiters = Number((buffalo.remainingLiters + cow.remainingLiters).toFixed(2));

  let overallStatus: 'no_loss' | 'loss' | 'surplus' = 'no_loss';
  if (remainingLiters > 0) {
    overallStatus = 'loss';
  } else {
    overallStatus = 'no_loss';
  }

  return {
    overall: {
      totalPurchasedLiters,
      totalSoldLiters,
      remainingLiters,
      status: overallStatus,
      buffalo,
      cow,
    },
  };
}

export type SupplierDayHistory = SupplierRangeSummary;
export type DailyAccountsHistory = RangeAccountsHistory & { date: string };

/**
 * Fetch organized supplier-wise, date-wise, and session-wise account history for any date range [startDate, endDate]
 */
export async function getRangeAccountHistory(
  startDate: string,
  endDate: string,
  periodLabel?: string
): Promise<RangeAccountsHistory> {
  const purchases = await getAllPurchasesForDateRange(startDate, endDate);
  const sales = await getMilkSalesForDateRange(startDate, endDate);

  // Map sales by purchaseId
  const salesByPurchase = new Map<string, MilkSale[]>();
  for (const s of sales) {
    if (!salesByPurchase.has(s.purchaseId)) {
      salesByPurchase.set(s.purchaseId, []);
    }
    salesByPurchase.get(s.purchaseId)!.push(s);
  }

  // Enrich each purchase with sales, wastage, actual loss amount, and sales revenue
  const enrichedPurchases: EnrichedPurchaseTransaction[] = purchases.map((p) => {
    const pSales = salesByPurchase.get(p.id) || [];
    const soldQty = Number(p.totalSoldQuantity || (pSales[0]?.soldQuantityLiters ?? 0));
    const remQty = Number(
      p.remainingQuantity !== undefined
        ? p.remainingQuantity
        : Math.max(0, p.quantityLiters - soldQty)
    );
    const isSold = p.isSold || pSales.length > 0;
    // Automatic Waste of Money Calculation: Loss Amount = Wasted Milk Quantity * Purchase Price Per Litre
    const wastageQty = isSold ? remQty : Number(p.wastageQuantity || (pSales[0]?.wastageQuantity ?? 0));
    const lossAmt = Number((wastageQty * p.pricePerLiter).toFixed(2));
    const revenue = Number(
      pSales.reduce((acc, s) => {
        if (s.totalAmount) return acc + s.totalAmount;
        if (s.pricePerLiter) return acc + Number((s.soldQuantityLiters * s.pricePerLiter).toFixed(2));
        return acc;
      }, 0).toFixed(2)
    );

    return {
      ...p,
      sales: pSales,
      totalSoldQuantity: soldQty,
      remainingQuantity: remQty,
      actualWastageQuantity: wastageQty,
      actualLossAmount: lossAmt,
      salesRevenue: revenue,
    };
  });

  // 1. Group by Supplier
  const supplierMap = new Map<string, EnrichedPurchaseTransaction[]>();
  for (const p of enrichedPurchases) {
    if (!supplierMap.has(p.supplierId)) {
      supplierMap.set(p.supplierId, []);
    }
    supplierMap.get(p.supplierId)!.push(p);
  }

  const supplierSummaries: SupplierRangeSummary[] = [];
  supplierMap.forEach((supPurchases, supId) => {
    const firstP = supPurchases[0];
    const supName = firstP?.supplierName || 'Unknown';
    const supPhone = firstP?.supplierPhone || '';

    const sessionOrder: MilkSession[] = ['morning', 'afternoon', 'evening'];
    const sessionsList: {
      session: MilkSession;
      purchases: EnrichedPurchaseTransaction[];
    }[] = [];

    sessionOrder.forEach((sess) => {
      const sessPurchases = supPurchases.filter((p) => p.session === sess);
      if (sessPurchases.length > 0) {
        sessionsList.push({
          session: sess,
          purchases: sessPurchases,
        });
      }
    });

    const totPurchased = Number(
      supPurchases.reduce((acc, p) => acc + (p.quantityLiters || 0), 0).toFixed(2)
    );
    const totSold = Number(
      supPurchases.reduce((acc, p) => acc + (p.totalSoldQuantity || 0), 0).toFixed(2)
    );
    const totRemaining = Number(
      supPurchases.reduce((acc, p) => acc + (p.remainingQuantity || 0), 0).toFixed(2)
    );
    const totWastage = Number(
      supPurchases.reduce((acc, p) => acc + (p.actualWastageQuantity || 0), 0).toFixed(2)
    );
    const totAmt = Number(
      supPurchases.reduce((acc, p) => acc + (p.totalAmount || 0), 0).toFixed(2)
    );
    const totRev = Number(
      supPurchases.reduce((acc, p) => acc + (p.salesRevenue || 0), 0).toFixed(2)
    );
    const totLoss = Number(
      supPurchases.reduce((acc, p) => acc + (p.actualLossAmount || 0), 0).toFixed(2)
    );

    const bufPurchases = supPurchases.filter((p) => p.milkCategory === 'buffalo');
    const cowPurchases = supPurchases.filter((p) => p.milkCategory === 'cow');

    supplierSummaries.push({
      supplierId: supId,
      supplierName: supName,
      supplierPhone: supPhone,
      totalPurchasedLiters: totPurchased,
      totalSoldLiters: totSold,
      totalRemainingLiters: totRemaining,
      totalWastageLiters: totWastage,
      totalPurchaseAmount: totAmt,
      totalAmount: totAmt,
      totalSalesRevenue: totRev,
      totalLossAmount: totLoss,
      buffaloPurchased: Number(bufPurchases.reduce((acc, p) => acc + (p.quantityLiters || 0), 0).toFixed(2)),
      buffaloSold: Number(bufPurchases.reduce((acc, p) => acc + (p.totalSoldQuantity || 0), 0).toFixed(2)),
      cowPurchased: Number(cowPurchases.reduce((acc, p) => acc + (p.quantityLiters || 0), 0).toFixed(2)),
      cowSold: Number(cowPurchases.reduce((acc, p) => acc + (p.totalSoldQuantity || 0), 0).toFixed(2)),
      sessions: sessionsList,
      transactions: supPurchases,
    });
  });

  // 2. Group by Date
  const dateMap = new Map<string, EnrichedPurchaseTransaction[]>();
  for (const p of enrichedPurchases) {
    if (!dateMap.has(p.purchaseDate)) {
      dateMap.set(p.purchaseDate, []);
    }
    dateMap.get(p.purchaseDate)!.push(p);
  }

  const dateSummaries: DateSummary[] = [];
  dateMap.forEach((dtPurchases, dt) => {
    dateSummaries.push({
      date: dt,
      totalPurchasedLiters: Number(dtPurchases.reduce((acc, p) => acc + (p.quantityLiters || 0), 0).toFixed(2)),
      totalSoldLiters: Number(dtPurchases.reduce((acc, p) => acc + (p.totalSoldQuantity || 0), 0).toFixed(2)),
      totalRemainingLiters: Number(dtPurchases.reduce((acc, p) => acc + (p.remainingQuantity || 0), 0).toFixed(2)),
      totalWastageLiters: Number(dtPurchases.reduce((acc, p) => acc + (p.actualWastageQuantity || 0), 0).toFixed(2)),
      totalPurchaseAmount: Number(dtPurchases.reduce((acc, p) => acc + (p.totalAmount || 0), 0).toFixed(2)),
      totalAmount: Number(dtPurchases.reduce((acc, p) => acc + (p.totalAmount || 0), 0).toFixed(2)),
      totalSalesRevenue: Number(dtPurchases.reduce((acc, p) => acc + (p.salesRevenue || 0), 0).toFixed(2)),
      totalLossAmount: Number(dtPurchases.reduce((acc, p) => acc + (p.actualLossAmount || 0), 0).toFixed(2)),
      purchases: dtPurchases,
    });
  });
  dateSummaries.sort((a, b) => b.date.localeCompare(a.date));

  // 3. Overall Totals
  const totalPurchasedLiters = Number(
    enrichedPurchases.reduce((acc, p) => acc + (p.quantityLiters || 0), 0).toFixed(2)
  );
  const totalSoldLiters = Number(
    enrichedPurchases.reduce((acc, p) => acc + (p.totalSoldQuantity || 0), 0).toFixed(2)
  );
  const totalRemainingLiters = Number(
    enrichedPurchases.reduce((acc, p) => acc + (p.remainingQuantity || 0), 0).toFixed(2)
  );
  const totalWastageLiters = Number(
    enrichedPurchases.reduce((acc, p) => acc + (p.actualWastageQuantity || 0), 0).toFixed(2)
  );
  const totalPurchaseAmount = Number(
    enrichedPurchases.reduce((acc, p) => acc + (p.totalAmount || 0), 0).toFixed(2)
  );
  const totalSalesRevenue = Number(
    enrichedPurchases.reduce((acc, p) => acc + (p.salesRevenue || 0), 0).toFixed(2)
  );
  const totalLossAmount = Number(
    enrichedPurchases.reduce((acc, p) => acc + (p.actualLossAmount || 0), 0).toFixed(2)
  );

  const bufAll = enrichedPurchases.filter((p) => p.milkCategory === 'buffalo');
  const cowAll = enrichedPurchases.filter((p) => p.milkCategory === 'cow');

  return {
    startDate,
    endDate,
    periodLabel: periodLabel || (startDate === endDate ? startDate : `${startDate} to ${endDate}`),
    totalPurchasedLiters,
    totalSoldLiters,
    totalRemainingLiters,
    totalWastageLiters,
    totalPurchaseAmount,
    totalAmount: totalPurchaseAmount,
    totalSalesRevenue,
    totalLossAmount,
    buffaloPurchased: Number(bufAll.reduce((acc, p) => acc + (p.quantityLiters || 0), 0).toFixed(2)),
    buffaloSold: Number(bufAll.reduce((acc, p) => acc + (p.totalSoldQuantity || 0), 0).toFixed(2)),
    buffaloRemaining: Number(bufAll.reduce((acc, p) => acc + (p.remainingQuantity || 0), 0).toFixed(2)),
    buffaloPurchaseAmount: Number(bufAll.reduce((acc, p) => acc + (p.totalAmount || 0), 0).toFixed(2)),
    cowPurchased: Number(cowAll.reduce((acc, p) => acc + (p.quantityLiters || 0), 0).toFixed(2)),
    cowSold: Number(cowAll.reduce((acc, p) => acc + (p.totalSoldQuantity || 0), 0).toFixed(2)),
    cowRemaining: Number(cowAll.reduce((acc, p) => acc + (p.remainingQuantity || 0), 0).toFixed(2)),
    cowPurchaseAmount: Number(cowAll.reduce((acc, p) => acc + (p.totalAmount || 0), 0).toFixed(2)),
    suppliers: supplierSummaries.sort((a, b) => a.supplierName.localeCompare(b.supplierName)),
    dates: dateSummaries,
    transactions: enrichedPurchases,
  };
}

/**
 * Fetch organized monthly history for a given month and year
 */
export async function getMonthlyAccountHistory(
  year: number,
  month: number
): Promise<RangeAccountsHistory> {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDate = `${year}-${pad(month)}-01`;
  const endDate = `${year}-${pad(month)}-${pad(daysInMonth)}`;
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const periodLabel = `${monthNames[month - 1]} ${year}`;
  return getRangeAccountHistory(startDate, endDate, periodLabel);
}

/**
 * Fetch organized supplier-wise and session-wise daily account history
 */
export async function getDailyAccountHistory(
  date: string
): Promise<DailyAccountsHistory & RangeAccountsHistory> {
  const rangeHistory = await getRangeAccountHistory(date, date, date);
  return {
    ...rangeHistory,
    date,
  };
}
