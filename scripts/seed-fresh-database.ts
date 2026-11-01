/**
 * Script to reset existing Milk Billing business data and create a fresh testing dataset.
 * - Targets: users/default_supplier/ (isolated application account)
 * - 2 Suppliers
 * - 10 Customers with unique names, phones, prices, quantities, and delivery times
 * - 235 Historical Delivery records (Oct 6, Oct 16, Oct 21 to Oct 31, 2026)
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  writeBatch,
  query,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBJGRAY93E3PGIA8KTTVMi2f2UCCWLZlwM',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'milk-bill-a31be.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'milk-bill-a31be',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'milk-bill-a31be.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '792806488061',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:792806488061:web:0ed40b77f5349d9b758b94',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const USER_ID = 'default_supplier';

interface CustomerSeedData {
  id: string;
  name: string;
  phone: string;
  defaultDailyQuantity: number;
  pricePerLiter: number;
  deliveryTime: 'morning' | 'afternoon' | 'evening';
  deliveryStartDate: string;
}

const CUSTOMER_DATASET: CustomerSeedData[] = [
  // 8 Registered on October 6, 2026 (25 days ago)
  {
    id: 'cust_rahul_sharma',
    name: 'Rahul Sharma',
    phone: '9000000001',
    defaultDailyQuantity: 1,
    pricePerLiter: 30,
    deliveryTime: 'morning',
    deliveryStartDate: '2026-10-06',
  },
  {
    id: 'cust_amit_kumar',
    name: 'Amit Kumar',
    phone: '9000000002',
    defaultDailyQuantity: 1.5,
    pricePerLiter: 32,
    deliveryTime: 'evening',
    deliveryStartDate: '2026-10-06',
  },
  {
    id: 'cust_vijay_singh',
    name: 'Vijay Singh',
    phone: '9000000003',
    defaultDailyQuantity: 2,
    pricePerLiter: 35,
    deliveryTime: 'afternoon',
    deliveryStartDate: '2026-10-06',
  },
  {
    id: 'cust_mohit_verma',
    name: 'Mohit Verma',
    phone: '9000000004',
    defaultDailyQuantity: 0.5,
    pricePerLiter: 28,
    deliveryTime: 'morning',
    deliveryStartDate: '2026-10-06',
  },
  {
    id: 'cust_suresh_gupta',
    name: 'Suresh Gupta',
    phone: '9000000005',
    defaultDailyQuantity: 2.5,
    pricePerLiter: 40,
    deliveryTime: 'evening',
    deliveryStartDate: '2026-10-06',
  },
  {
    id: 'cust_deepak_yadav',
    name: 'Deepak Yadav',
    phone: '9000000006',
    defaultDailyQuantity: 1.25,
    pricePerLiter: 33,
    deliveryTime: 'afternoon',
    deliveryStartDate: '2026-10-06',
  },
  {
    id: 'cust_rohit_meena',
    name: 'Rohit Meena',
    phone: '9000000007',
    defaultDailyQuantity: 3,
    pricePerLiter: 38,
    deliveryTime: 'morning',
    deliveryStartDate: '2026-10-06',
  },
  {
    id: 'cust_karan_joshi',
    name: 'Karan Joshi',
    phone: '9000000008',
    defaultDailyQuantity: 0.75,
    pricePerLiter: 29,
    deliveryTime: 'evening',
    deliveryStartDate: '2026-10-06',
  },
  // 1 Registered on October 16, 2026 (15 days ago)
  {
    id: 'cust_ankit_jain',
    name: 'Ankit Jain',
    phone: '9000000009',
    defaultDailyQuantity: 1.75,
    pricePerLiter: 36,
    deliveryTime: 'morning',
    deliveryStartDate: '2026-10-16',
  },
  // 1 Registered on October 21, 2026 (10 days ago)
  {
    id: 'cust_nitin_patel',
    name: 'Nitin Patel',
    phone: '9000000010',
    defaultDailyQuantity: 2,
    pricePerLiter: 42,
    deliveryTime: 'afternoon',
    deliveryStartDate: '2026-10-21',
  },
];

const SUPPLIERS_DATASET = [
  {
    id: 'sup_prashant_sharma',
    name: 'Prashant Sharma',
    phone: '9876543211',
    isActive: true,
  },
  {
    id: 'sup_mahesh_kumar',
    name: 'Mahesh Kumar',
    phone: '9876543212',
    isActive: true,
  },
];

function generateDateRange(startDateStr: string, endDateStr: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDateStr);
  const end = new Date(endDateStr);

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export async function clearExistingData(): Promise<number> {
  const subcollections = [
    'suppliers',
    'supplierPurchases',
    'customers',
    'deliveries',
    'monthlyBills',
    'payments',
    'customerHolidays',
    'supplierHolidays',
  ];

  let totalDeleted = 0;
  for (const sub of subcollections) {
    const colRef = collection(db, 'users', USER_ID, sub);
    const snap = await getDocs(query(colRef));
    const docs = snap.docs;
    totalDeleted += docs.length;

    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  return totalDeleted;
}

export async function seedFreshDatabase() {
  console.log('--- Step 1: Clearing Old Data ---');
  const deletedCount = await clearExistingData();
  console.log(`Deleted ${deletedCount} existing records.`);

  console.log('--- Step 2: Creating 2 Suppliers ---');
  const now = Date.now();
  const supBatch = writeBatch(db);
  for (const s of SUPPLIERS_DATASET) {
    const sRef = doc(db, 'users', USER_ID, 'suppliers', s.id);
    supBatch.set(sRef, {
      ...s,
      createdAt: now,
      updatedAt: now,
    });
  }
  await supBatch.commit();
  console.log(`Created ${SUPPLIERS_DATASET.length} suppliers.`);

  console.log('--- Step 3: Creating 10 Customers ---');
  const custBatch = writeBatch(db);
  for (const c of CUSTOMER_DATASET) {
    const cRef = doc(db, 'users', USER_ID, 'customers', c.id);
    const regTimestamp = new Date(c.deliveryStartDate + 'T00:00:00+05:30').getTime();
    custBatch.set(cRef, {
      id: c.id,
      name: c.name,
      phone: c.phone,
      defaultDailyQuantity: c.defaultDailyQuantity,
      pricePerLiter: c.pricePerLiter,
      deliveryTime: c.deliveryTime,
      deliveryStartDate: c.deliveryStartDate,
      deliveryStopDate: null,
      isActive: true,
      createdAt: regTimestamp,
      updatedAt: regTimestamp,
    });
  }
  await custBatch.commit();
  console.log(`Created ${CUSTOMER_DATASET.length} customers.`);

  console.log('--- Step 4: Generating Historical Delivery Records ---');
  const referenceEndDate = '2026-10-31';
  const allDeliveries: any[] = [];

  for (const c of CUSTOMER_DATASET) {
    const dateRange = generateDateRange(c.deliveryStartDate, referenceEndDate);
    for (const d of dateRange) {
      const docId = `delivery_${c.id}_${d}`;
      const amount = Number((c.defaultDailyQuantity * c.pricePerLiter).toFixed(2));
      const delTimestamp = new Date(d + 'T06:00:00+05:30').getTime();
      allDeliveries.push({
        ref: doc(db, 'users', USER_ID, 'deliveries', docId),
        data: {
          id: docId,
          customerId: c.id,
          customerName: c.name,
          deliveryDate: d,
          defaultQuantity: c.defaultDailyQuantity,
          actualQuantity: c.defaultDailyQuantity,
          pricePerLiter: c.pricePerLiter,
          amount,
          status: 'delivered',
          manuallyEdited: false,
          createdAt: delTimestamp,
          updatedAt: delTimestamp,
        },
      });
    }
  }

  console.log(`Total delivery records to write: ${allDeliveries.length}`);
  for (let i = 0; i < allDeliveries.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = allDeliveries.slice(i, i + 400);
    chunk.forEach((item) => batch.set(item.ref, item.data));
    await batch.commit();
  }
  console.log(`Committed ${allDeliveries.length} delivery records in batches.`);

  console.log('--- Step 5: Validating Seeded Data ---');
  const supSnap = await getDocs(collection(db, 'users', USER_ID, 'suppliers'));
  const custSnap = await getDocs(collection(db, 'users', USER_ID, 'customers'));
  const delSnap = await getDocs(collection(db, 'users', USER_ID, 'deliveries'));

  console.log(`Validation Results:`);
  console.log(`- Suppliers: ${supSnap.size} (Expected 2)`);
  console.log(`- Customers: ${custSnap.size} (Expected 10)`);
  console.log(`- Deliveries: ${delSnap.size} (Expected 235)`);

  return {
    deletedCount,
    suppliersCount: supSnap.size,
    customersCount: custSnap.size,
    deliveriesCount: delSnap.size,
  };
}

// Execute if run directly
if (typeof require !== 'undefined' && (require as any).main === module) {
  seedFreshDatabase()
    .then((result) => {
      console.log('Seeding finished successfully:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seeding error:', err);
      process.exit(1);
    });
}

