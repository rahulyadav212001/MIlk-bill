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
  writeBatch,
} from 'firebase/firestore';
import { db, ensureAuthenticatedUserId } from './firebase';
import { Supplier, SupplierPurchase, MilkSession, MilkCategory } from '../types';

function getSuppliersCollection(userId: string) {
  return collection(db, 'users', userId, 'suppliers');
}

function getPurchasesCollection(userId: string) {
  return collection(db, 'users', userId, 'supplierPurchases');
}

/**
 * Fetch all suppliers for the active account
 */
export async function getSuppliers(onlyActive: boolean = false): Promise<Supplier[]> {
  const userId = await ensureAuthenticatedUserId();
  const coll = getSuppliersCollection(userId);
  const q = onlyActive ? query(coll, where('isActive', '==', true)) : query(coll);
  const snapshot = await getDocs(q);

  const list: Supplier[] = [];
  snapshot.forEach((d) => {
    const data = d.data();
    list.push({
      id: d.id,
      name: data.name || '',
      phone: data.phone || '',
      milkCategory: (data.milkCategory as MilkCategory) || 'buffalo',
      isActive: data.isActive !== false,
      createdAt: data.createdAt || 0,
      updatedAt: data.updatedAt || 0,
    });
  });

  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get supplier by ID
 */
export async function getSupplierById(supplierId: string): Promise<Supplier | null> {
  const userId = await ensureAuthenticatedUserId();
  const dRef = doc(db, 'users', userId, 'suppliers', supplierId);
  const snap = await getDoc(dRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    name: data.name || '',
    phone: data.phone || '',
    milkCategory: (data.milkCategory as MilkCategory) || 'buffalo',
    isActive: data.isActive !== false,
    createdAt: data.createdAt || 0,
    updatedAt: data.updatedAt || 0,
  };
}

/**
 * Add a new supplier with phone duplicate prevention.
 * Registers supplier with only Supplier Name and Phone Number.
 */
export async function addSupplier(
  name: string,
  phone: string,
  milkCategory?: MilkCategory
): Promise<Supplier> {
  const userId = await ensureAuthenticatedUserId();
  const cleanPhone = phone.trim();
  const cleanName = name.trim();

  if (!cleanName) throw new Error('Supplier name is required.');
  if (!cleanPhone || cleanPhone.length < 10) throw new Error('Valid 10-digit phone number is required.');

  // Duplicate check
  const coll = getSuppliersCollection(userId);
  const dupQ = query(coll, where('phone', '==', cleanPhone));
  const dupSnap = await getDocs(dupQ);
  if (!dupSnap.empty) {
    throw new Error(`A supplier with phone number "${cleanPhone}" is already registered.`);
  }

  const newDocRef = doc(coll);
  const now = Date.now();
  const newSupplier: Supplier = {
    id: newDocRef.id,
    name: cleanName,
    phone: cleanPhone,
    ...(milkCategory ? { milkCategory } : {}),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(newDocRef, newSupplier);
  return newSupplier;
}

/**
 * Update an existing supplier
 */
export async function updateSupplier(supplierId: string, data: Partial<Supplier>): Promise<void> {
  const userId = await ensureAuthenticatedUserId();
  const dRef = doc(db, 'users', userId, 'suppliers', supplierId);
  await updateDoc(dRef, {
    ...data,
    updatedAt: Date.now(),
  });
}

/**
 * Toggle supplier active/deactivate
 */
export async function toggleSupplierStatus(supplierId: string, isActive: boolean): Promise<void> {
  await updateSupplier(supplierId, { isActive });
}

/**
 * Fetch purchases for a supplier with optional date or month filtering
 */
export async function getSupplierPurchases(
  supplierId: string,
  date?: string,
  month?: number,
  year?: number
): Promise<SupplierPurchase[]> {
  const userId = await ensureAuthenticatedUserId();
  const coll = getPurchasesCollection(userId);

  let q = query(coll, where('supplierId', '==', supplierId));
  if (date) {
    q = query(coll, where('supplierId', '==', supplierId), where('purchaseDate', '==', date));
  }

  const snapshot = await getDocs(q);
  let list: SupplierPurchase[] = [];

  snapshot.forEach((d) => {
    const data = d.data();
    list.push({
      id: d.id,
      supplierId: data.supplierId,
      supplierName: data.supplierName || '',
      supplierPhone: data.supplierPhone || '',
      milkCategory: (data.milkCategory as MilkCategory) || 'buffalo',
      purchaseDate: data.purchaseDate,
      session: data.session as MilkSession,
      quantityLiters: data.quantityLiters || 0,
      pricePerLiter: data.pricePerLiter || 0,
      totalAmount: data.totalAmount || 0,
      createdAt: data.createdAt || 0,
      updatedAt: data.updatedAt || 0,
    });
  });

  if (month && year && !date) {
    const monthStr = month < 10 ? `0${month}` : `${month}`;
    const prefix = `${year}-${monthStr}`;
    list = list.filter((p) => p.purchaseDate.startsWith(prefix));
  }

  // Sort chronologically by date then session (morning first)
  return list.sort((a, b) => {
    if (a.purchaseDate !== b.purchaseDate) {
      return a.purchaseDate.localeCompare(b.purchaseDate);
    }
    return a.session === 'morning' ? -1 : 1;
  });
}

/**
 * Record or update a milk purchase.
 * Supports customDocId to store every buy transaction separately without overwriting,
 * while maintaining backward compatibility with stable session doc IDs.
 */
export async function saveSupplierPurchase(
  supplier: { id: string; name: string; phone: string; milkCategory?: MilkCategory },
  purchaseDate: string,
  session: MilkSession,
  quantityLiters: number,
  pricePerLiter: number,
  milkCategory?: MilkCategory,
  customDocId?: string
): Promise<SupplierPurchase> {
  const userId = await ensureAuthenticatedUserId();
  if (quantityLiters < 0) throw new Error('Quantity cannot be negative.');
  if (pricePerLiter <= 0) throw new Error('Price per liter must be positive.');

  const totalAmount = Number((quantityLiters * pricePerLiter).toFixed(2));
  const docId = customDocId || `purchase_${supplier.id}_${purchaseDate}_${session}`;
  const dRef = doc(db, 'users', userId, 'supplierPurchases', docId);

  const existing = await getDoc(dRef);
  const now = Date.now();
  const effectiveCategory = milkCategory || supplier.milkCategory || 'buffalo';

  const record: SupplierPurchase = {
    id: docId,
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierPhone: supplier.phone,
    milkCategory: effectiveCategory,
    purchaseDate,
    session,
    quantityLiters,
    pricePerLiter,
    totalAmount,
    createdAt: existing.exists() ? (existing.data()?.createdAt || now) : now,
    updatedAt: now,
  };

  await setDoc(dRef, record, { merge: true });
  return record;
}

/**
 * Delete a supplier purchase record
 */
export async function deleteSupplierPurchase(purchaseId: string): Promise<void> {
  const userId = await ensureAuthenticatedUserId();
  const dRef = doc(db, 'users', userId, 'supplierPurchases', purchaseId);
  await deleteDoc(dRef);
}

/**
 * Delete a supplier and properly handle associated purchase and sales records.
 * Excludes the supplier's milk quantity from active stock immediately.
 */
export async function deleteSupplier(
  supplierId: string,
  deleteHistory: boolean = true
): Promise<void> {
  const userId = await ensureAuthenticatedUserId();

  // 1. Handle milkPurchases associated with this supplier
  const milkPurchasesColl = collection(db, 'users', userId, 'milkPurchases');
  const mpQuery = query(milkPurchasesColl, where('supplierId', '==', supplierId));
  const mpSnap = await getDocs(mpQuery);

  const mpDocs = mpSnap.docs;
  for (let i = 0; i < mpDocs.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = mpDocs.slice(i, i + 400);
    chunk.forEach((d) => {
      if (deleteHistory) {
        batch.delete(d.ref);
      } else {
        batch.update(d.ref, {
          supplierDeleted: true,
          isSupplierDeleted: true,
          remainingQuantity: 0,
          updatedAt: Date.now(),
        });
      }
    });
    await batch.commit();
  }

  // 2. Handle milkSales associated with this supplier
  const salesColl = collection(db, 'users', userId, 'milkSales');
  const salesQuery = query(salesColl, where('supplierId', '==', supplierId));
  const salesSnap = await getDocs(salesQuery);

  const salesDocs = salesSnap.docs;
  for (let i = 0; i < salesDocs.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = salesDocs.slice(i, i + 400);
    chunk.forEach((d) => {
      if (deleteHistory) {
        batch.delete(d.ref);
      } else {
        batch.update(d.ref, {
          supplierDeleted: true,
          isSupplierDeleted: true,
          updatedAt: Date.now(),
        });
      }
    });
    await batch.commit();
  }

  // 3. Handle legacy supplierPurchases if any
  if (deleteHistory) {
    const legColl = getPurchasesCollection(userId);
    const legQ = query(legColl, where('supplierId', '==', supplierId));
    const legSnap = await getDocs(legQ);

    const docs = legSnap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + 400);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  // 4. Delete the supplier doc
  const supplierRef = doc(db, 'users', userId, 'suppliers', supplierId);
  await deleteDoc(supplierRef);
}
