import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  writeBatch,
  doc,
  collection,
  getDocs,
} from 'firebase/firestore';
const fs = typeof require !== 'undefined' ? (require('fs') as any) : null;
const path = typeof require !== 'undefined' ? (require('path') as any) : null;
import * as XLSX from 'xlsx';
import { Supplier, Customer, SupplierPurchase, Delivery, MonthlyBill, Payment } from '../src/types';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBJGRAY93E3PGIA8KTTVMi2f2UCCWLZlwM',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'milk-bill-a31be.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'milk-bill-a31be',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'milk-bill-a31be.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '792806488061',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:792806488061:web:0ed40b77f5349d9b758b94',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const USER_ID = 'default_supplier';

// ==========================================
// 1. DEFINE 2 NEW SUPPLIERS
// ==========================================
const NEW_SUPPLIERS: Supplier[] = [
  {
    id: 'sup_vikram_singh',
    name: 'Vikram Singh (Singhal Dairy Farm)',
    phone: '9812001122',
    isActive: true,
    createdAt: new Date('2026-09-25T08:00:00Z').getTime(),
    updatedAt: new Date('2026-09-25T08:00:00Z').getTime(),
  },
  {
    id: 'sup_rajesh_patel',
    name: 'Rajesh Patel (Gir Cow Dairy)',
    phone: '9812003344',
    isActive: true,
    createdAt: new Date('2026-09-25T08:00:00Z').getTime(),
    updatedAt: new Date('2026-09-25T08:00:00Z').getTime(),
  },
];

// ==========================================
// 2. DEFINE 50 NEW CUSTOMERS
// 25 Buffalo Milk (14 Morning, 11 Evening)
// 25 Cow Milk (14 Morning, 11 Evening)
// All 50 unique names, all 50 unique phone numbers
// ==========================================
interface CustomerSeed {
  name: string;
  phone: string;
  location: string;
  milkCategory: 'buffalo' | 'cow';
  deliveryTime: 'morning' | 'evening';
  defaultDailyQuantity: number;
  pricePerLiter: number;
}

const CUSTOMER_SEEDS: CustomerSeed[] = [
  // --- 25 Buffalo Milk Customers ---
  // Morning (14)
  { name: 'Rahul Sharma', phone: '9823400001', location: 'Sector 14, Urban Estate', milkCategory: 'buffalo', deliveryTime: 'morning', defaultDailyQuantity: 1.5, pricePerLiter: 72 },
  { name: 'Priya Verma', phone: '9823400002', location: 'Civil Lines, Near Clock Tower', milkCategory: 'buffalo', deliveryTime: 'morning', defaultDailyQuantity: 2.0, pricePerLiter: 72 },
  { name: 'Amit Gupta', phone: '9823400003', location: 'Model Town, Block B', milkCategory: 'buffalo', deliveryTime: 'morning', defaultDailyQuantity: 1.0, pricePerLiter: 75 },
  { name: 'Sneha Patel', phone: '9823400004', location: 'Green Park Extension', milkCategory: 'buffalo', deliveryTime: 'morning', defaultDailyQuantity: 1.5, pricePerLiter: 72 },
  { name: 'Rajesh Khanna', phone: '9823400005', location: 'Malviya Nagar, Main Market', milkCategory: 'buffalo', deliveryTime: 'morning', defaultDailyQuantity: 2.5, pricePerLiter: 70 },
  { name: 'Anjali Mehta', phone: '9823400006', location: 'Vasant Kunj, Pocket C', milkCategory: 'buffalo', deliveryTime: 'morning', defaultDailyQuantity: 1.0, pricePerLiter: 75 },
  { name: 'Vikas Malhotra', phone: '9823400007', location: 'Rohini Sector 9', milkCategory: 'buffalo', deliveryTime: 'morning', defaultDailyQuantity: 2.0, pricePerLiter: 72 },
  { name: 'Pooja Joshi', phone: '9823400008', location: 'Janakpuri, C-Block', milkCategory: 'buffalo', deliveryTime: 'morning', defaultDailyQuantity: 1.5, pricePerLiter: 72 },
  { name: 'Sanjay Singhania', phone: '9823400009', location: 'Shanti Nagar, Lane 4', milkCategory: 'buffalo', deliveryTime: 'morning', defaultDailyQuantity: 3.0, pricePerLiter: 70 },
  { name: 'Neha Bansal', phone: '9823400010', location: 'Tilak Nagar, Near Metro', milkCategory: 'buffalo', deliveryTime: 'morning', defaultDailyQuantity: 1.0, pricePerLiter: 75 },
  { name: 'Manoj Tiwari', phone: '9823400011', location: 'Rajouri Garden, MIG Flats', milkCategory: 'buffalo', deliveryTime: 'morning', defaultDailyQuantity: 1.5, pricePerLiter: 72 },
  { name: 'Sunita Rao', phone: '9823400012', location: 'Pitampura, Saraswati Vihar', milkCategory: 'buffalo', deliveryTime: 'morning', defaultDailyQuantity: 2.0, pricePerLiter: 72 },
  { name: 'Deepak Chopra', phone: '9823400013', location: 'South Extension, Part 1', milkCategory: 'buffalo', deliveryTime: 'morning', defaultDailyQuantity: 1.0, pricePerLiter: 75 },
  { name: 'Ritu Aggarwal', phone: '9823400014', location: 'Lajpat Nagar, Central Road', milkCategory: 'buffalo', deliveryTime: 'morning', defaultDailyQuantity: 1.5, pricePerLiter: 72 },
  // Evening (11)
  { name: 'Suresh Nair', phone: '9823400015', location: 'Defence Colony, A-Block', milkCategory: 'buffalo', deliveryTime: 'evening', defaultDailyQuantity: 1.5, pricePerLiter: 72 },
  { name: 'Kavita Yadav', phone: '9823400016', location: 'Greater Kailash 1, Enclave', milkCategory: 'buffalo', deliveryTime: 'evening', defaultDailyQuantity: 2.0, pricePerLiter: 72 },
  { name: 'Alok Pandey', phone: '9823400017', location: 'Mayur Vihar, Phase 1', milkCategory: 'buffalo', deliveryTime: 'evening', defaultDailyQuantity: 1.0, pricePerLiter: 75 },
  { name: 'Divya Saxena', phone: '9823400018', location: 'Dwarka Sector 6, DDA Flats', milkCategory: 'buffalo', deliveryTime: 'evening', defaultDailyQuantity: 1.5, pricePerLiter: 72 },
  { name: 'Rohit Bhatia', phone: '9823400019', location: 'Noida Sector 50, Pocket B', milkCategory: 'buffalo', deliveryTime: 'evening', defaultDailyQuantity: 2.0, pricePerLiter: 70 },
  { name: 'Meenakshi Soni', phone: '9823400020', location: 'Gurugram Sector 21, Gate 2', milkCategory: 'buffalo', deliveryTime: 'evening', defaultDailyQuantity: 1.0, pricePerLiter: 75 },
  { name: 'Tarun Jain', phone: '9823400021', location: 'Punjabi Bagh West', milkCategory: 'buffalo', deliveryTime: 'evening', defaultDailyQuantity: 1.5, pricePerLiter: 72 },
  { name: 'Swati Kapoor', phone: '9823400022', location: 'Paschim Vihar, B-4', milkCategory: 'buffalo', deliveryTime: 'evening', defaultDailyQuantity: 2.5, pricePerLiter: 70 },
  { name: 'Gaurav Sethi', phone: '9823400023', location: 'Ashok Vihar, Phase 2', milkCategory: 'buffalo', deliveryTime: 'evening', defaultDailyQuantity: 1.0, pricePerLiter: 75 },
  { name: 'Preeti Chauhan', phone: '9823400024', location: 'Kirti Nagar, Block 3', milkCategory: 'buffalo', deliveryTime: 'evening', defaultDailyQuantity: 1.5, pricePerLiter: 72 },
  { name: 'Harish Rawat', phone: '9823400025', location: 'Patel Nagar East', milkCategory: 'buffalo', deliveryTime: 'evening', defaultDailyQuantity: 2.0, pricePerLiter: 72 },

  // --- 25 Cow Milk Customers ---
  // Morning (14)
  { name: 'Arvind Kejriwal', phone: '9823400026', location: 'Sector 15, Near Community Center', milkCategory: 'cow', deliveryTime: 'morning', defaultDailyQuantity: 1.5, pricePerLiter: 56 },
  { name: 'Shalini Mishra', phone: '9823400027', location: 'Civil Lines, Rajpur Road', milkCategory: 'cow', deliveryTime: 'morning', defaultDailyQuantity: 2.0, pricePerLiter: 56 },
  { name: 'Pradeep Kumar', phone: '9823400028', location: 'Model Town, Phase 3', milkCategory: 'cow', deliveryTime: 'morning', defaultDailyQuantity: 1.0, pricePerLiter: 58 },
  { name: 'Monica Roy', phone: '9823400029', location: 'Green Park Main', milkCategory: 'cow', deliveryTime: 'morning', defaultDailyQuantity: 1.5, pricePerLiter: 56 },
  { name: 'Nitin Gadkari', phone: '9823400030', location: 'Malviya Nagar, Shivalik', milkCategory: 'cow', deliveryTime: 'morning', defaultDailyQuantity: 2.5, pricePerLiter: 54 },
  { name: 'Rekha Sharma', phone: '9823400031', location: 'Vasant Vihar, Block E', milkCategory: 'cow', deliveryTime: 'morning', defaultDailyQuantity: 1.0, pricePerLiter: 58 },
  { name: 'Ashish Dewan', phone: '9823400032', location: 'Rohini Sector 11, Pocket G', milkCategory: 'cow', deliveryTime: 'morning', defaultDailyQuantity: 2.0, pricePerLiter: 56 },
  { name: 'Pallavi Sengupta', phone: '9823400033', location: 'Janakpuri, B-2 Block', milkCategory: 'cow', deliveryTime: 'morning', defaultDailyQuantity: 1.5, pricePerLiter: 56 },
  { name: 'Bhupesh Baghel', phone: '9823400034', location: 'Shanti Nagar, Near Temple', milkCategory: 'cow', deliveryTime: 'morning', defaultDailyQuantity: 3.0, pricePerLiter: 54 },
  { name: 'Tanvi Kulkarni', phone: '9823400035', location: 'Tilak Nagar, Jail Road', milkCategory: 'cow', deliveryTime: 'morning', defaultDailyQuantity: 1.0, pricePerLiter: 58 },
  { name: 'Rakesh Roshan', phone: '9823400036', location: 'Rajouri Garden, Main Ring', milkCategory: 'cow', deliveryTime: 'morning', defaultDailyQuantity: 1.5, pricePerLiter: 56 },
  { name: 'Shilpa Shetty', phone: '9823400037', location: 'Pitampura, Harsh Vihar', milkCategory: 'cow', deliveryTime: 'morning', defaultDailyQuantity: 2.0, pricePerLiter: 56 },
  { name: 'Varun Dhawan', phone: '9823400038', location: 'South Extension, Part 2', milkCategory: 'cow', deliveryTime: 'morning', defaultDailyQuantity: 1.0, pricePerLiter: 58 },
  { name: 'Natasha Dalal', phone: '9823400039', location: 'Lajpat Nagar 4, Amar Colony', milkCategory: 'cow', deliveryTime: 'morning', defaultDailyQuantity: 1.5, pricePerLiter: 56 },
  // Evening (11)
  { name: 'Pankaj Tripathi', phone: '9823400040', location: 'Defence Colony, C-Block', milkCategory: 'cow', deliveryTime: 'evening', defaultDailyQuantity: 1.5, pricePerLiter: 56 },
  { name: 'Richa Chadha', phone: '9823400041', location: 'Greater Kailash 2, M-Block', milkCategory: 'cow', deliveryTime: 'evening', defaultDailyQuantity: 2.0, pricePerLiter: 56 },
  { name: 'Kunal Khemu', phone: '9823400042', location: 'Mayur Vihar, Pocket 4', milkCategory: 'cow', deliveryTime: 'evening', defaultDailyQuantity: 1.0, pricePerLiter: 58 },
  { name: 'Soha Ali Khan', phone: '9823400043', location: 'Dwarka Sector 10, Metro View', milkCategory: 'cow', deliveryTime: 'evening', defaultDailyQuantity: 1.5, pricePerLiter: 56 },
  { name: 'Abhay Deol', phone: '9823400044', location: 'Noida Sector 62, Stellar Park', milkCategory: 'cow', deliveryTime: 'evening', defaultDailyQuantity: 2.0, pricePerLiter: 54 },
  { name: 'Radhika Apte', phone: '9823400045', location: 'Gurugram Sector 45, Sushant Lok', milkCategory: 'cow', deliveryTime: 'evening', defaultDailyQuantity: 1.0, pricePerLiter: 58 },
  { name: 'Vicky Kaushal', phone: '9823400046', location: 'Punjabi Bagh East, Club Road', milkCategory: 'cow', deliveryTime: 'evening', defaultDailyQuantity: 1.5, pricePerLiter: 56 },
  { name: 'Katrina Kaif', phone: '9823400047', location: 'Paschim Vihar, GH-9', milkCategory: 'cow', deliveryTime: 'evening', defaultDailyQuantity: 2.5, pricePerLiter: 54 },
  { name: 'Siddharth Malhotra', phone: '9823400048', location: 'Ashok Vihar, Deep Market', milkCategory: 'cow', deliveryTime: 'evening', defaultDailyQuantity: 1.0, pricePerLiter: 58 },
  { name: 'Kiara Advani', phone: '9823400049', location: 'Kirti Nagar, Mansarover Garden', milkCategory: 'cow', deliveryTime: 'evening', defaultDailyQuantity: 1.5, pricePerLiter: 56 },
  { name: 'Ayushmann Khurrana', phone: '9823400050', location: 'Patel Nagar West, Main Bazar', milkCategory: 'cow', deliveryTime: 'evening', defaultDailyQuantity: 2.0, pricePerLiter: 56 },
];

const NEW_CUSTOMERS: Customer[] = CUSTOMER_SEEDS.map((s, idx) => {
  const padIdx = (idx + 1).toString().padStart(2, '0');
  const safeName = s.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return {
    id: `cust_${padIdx}_${safeName}`,
    name: s.name,
    phone: s.phone,
    location: s.location,
    milkCategory: s.milkCategory,
    deliveryTime: s.deliveryTime,
    deliveryStartDate: '2026-10-01',
    deliveryStopDate: null,
    defaultDailyQuantity: s.defaultDailyQuantity,
    pricePerLiter: s.pricePerLiter,
    isActive: true,
    createdAt: new Date('2026-09-28T09:00:00Z').getTime() + idx * 60000,
    updatedAt: new Date('2026-09-28T09:00:00Z').getTime() + idx * 60000,
  };
});

async function main() {
  console.log('=== POPULATING FRESH DATA & GENERATING EXCEL WORKBOOK ===\n');

  // Verify unique phones
  const allPhones = new Set<string>();
  NEW_SUPPLIERS.forEach((s) => {
    if (allPhones.has(s.phone)) throw new Error(`Duplicate supplier phone: ${s.phone}`);
    allPhones.add(s.phone);
  });
  NEW_CUSTOMERS.forEach((c) => {
    if (allPhones.has(c.phone)) throw new Error(`Duplicate customer phone: ${c.phone}`);
    allPhones.add(c.phone);
  });
  console.log(`[PASS] Verified 52 unique fictional phone numbers (2 suppliers, 50 customers).`);

  // Verify category distribution
  const buffaloCusts = NEW_CUSTOMERS.filter((c) => c.milkCategory === 'buffalo');
  const cowCusts = NEW_CUSTOMERS.filter((c) => c.milkCategory === 'cow');
  console.log(`[PASS] Customer categories: ${buffaloCusts.length} Buffalo Milk, ${cowCusts.length} Cow Milk.`);
  if (buffaloCusts.length !== 25 || cowCusts.length !== 25) {
    throw new Error('Expected exactly 25 Buffalo and 25 Cow customers!');
  }

  // ==========================================
  // 3. GENERATE OCTOBER 2026 PURCHASES
  // 31 days (2026-10-01 to 2026-10-31)
  // Supplier 1: Vikram Singh -> Buffalo Milk (Morning 26L, Evening 20L)
  // Supplier 2: Rajesh Patel -> Cow Milk (Morning 26L, Evening 20L)
  // 31 * 4 = 124 purchase records
  // ==========================================
  console.log('\nGenerating October 2026 Supplier Purchases (31 days)...');
  const purchases: SupplierPurchase[] = [];

  for (let day = 1; day <= 31; day++) {
    const dayStr = day < 10 ? `0${day}` : `${day}`;
    const date = `2026-10-${dayStr}`;

    // Supplier 1 - Buffalo Morning
    purchases.push({
      id: `purchase_sup1_${date}_morning`,
      supplierId: NEW_SUPPLIERS[0].id,
      supplierName: NEW_SUPPLIERS[0].name,
      supplierPhone: NEW_SUPPLIERS[0].phone,
      milkCategory: 'buffalo',
      purchaseDate: date,
      session: 'morning',
      quantityLiters: 26,
      pricePerLiter: 60,
      totalAmount: 26 * 60, // 1560
      totalSoldQuantity: 24.5,
      remainingQuantity: 1.5,
      wastageQuantity: 0,
      createdAt: new Date(`${date}T06:00:00Z`).getTime(),
      updatedAt: new Date(`${date}T09:00:00Z`).getTime(),
    });

    // Supplier 1 - Buffalo Evening
    purchases.push({
      id: `purchase_sup1_${date}_evening`,
      supplierId: NEW_SUPPLIERS[0].id,
      supplierName: NEW_SUPPLIERS[0].name,
      supplierPhone: NEW_SUPPLIERS[0].phone,
      milkCategory: 'buffalo',
      purchaseDate: date,
      session: 'evening',
      quantityLiters: 20,
      pricePerLiter: 60,
      totalAmount: 20 * 60, // 1200
      totalSoldQuantity: 19.5,
      remainingQuantity: 0.5,
      wastageQuantity: 0,
      createdAt: new Date(`${date}T17:00:00Z`).getTime(),
      updatedAt: new Date(`${date}T20:00:00Z`).getTime(),
    });

    // Supplier 2 - Cow Morning
    purchases.push({
      id: `purchase_sup2_${date}_morning`,
      supplierId: NEW_SUPPLIERS[1].id,
      supplierName: NEW_SUPPLIERS[1].name,
      supplierPhone: NEW_SUPPLIERS[1].phone,
      milkCategory: 'cow',
      purchaseDate: date,
      session: 'morning',
      quantityLiters: 26,
      pricePerLiter: 46,
      totalAmount: 26 * 46, // 1196
      totalSoldQuantity: 25.0,
      remainingQuantity: 1.0,
      wastageQuantity: 0,
      createdAt: new Date(`${date}T06:15:00Z`).getTime(),
      updatedAt: new Date(`${date}T09:15:00Z`).getTime(),
    });

    // Supplier 2 - Cow Evening
    purchases.push({
      id: `purchase_sup2_${date}_evening`,
      supplierId: NEW_SUPPLIERS[1].id,
      supplierName: NEW_SUPPLIERS[1].name,
      supplierPhone: NEW_SUPPLIERS[1].phone,
      milkCategory: 'cow',
      purchaseDate: date,
      session: 'evening',
      quantityLiters: 20,
      pricePerLiter: 46,
      totalAmount: 20 * 46, // 920
      totalSoldQuantity: 19.5,
      remainingQuantity: 0.5,
      wastageQuantity: 0,
      createdAt: new Date(`${date}T17:15:00Z`).getTime(),
      updatedAt: new Date(`${date}T20:15:00Z`).getTime(),
    });
  }

  console.log(`[PASS] Generated ${purchases.length} supplier purchases for October 2026.`);

  // ==========================================
  // 4. GENERATE OCTOBER 2026 CUSTOMER DELIVERIES
  // 50 customers * 31 days = 1,550 delivery records
  // ==========================================
  console.log('\nGenerating October 2026 Customer Deliveries (50 customers * 31 days = 1550 deliveries)...');
  const deliveries: Delivery[] = [];

  for (const c of NEW_CUSTOMERS) {
    for (let day = 1; day <= 31; day++) {
      const dayStr = day < 10 ? `0${day}` : `${day}`;
      const date = `2026-10-${dayStr}`;

      // Realistic adjustments:
      // Oct 20 & Oct 24: Festive sweets (+0.5L for first 8 customers)
      // Oct 12: Customer 5 & Customer 28 took a single holiday
      let actualQty = c.defaultDailyQuantity;
      let status: Delivery['status'] = 'delivered';
      let manuallyEdited = false;

      if (day === 12 && (c.id.includes('05') || c.id.includes('28'))) {
        actualQty = 0;
        status = 'customer_holiday';
        manuallyEdited = true;
      } else if ((day === 20 || day === 24) && parseInt(c.id.slice(5, 7), 10) <= 8) {
        actualQty = Number((c.defaultDailyQuantity + 0.5).toFixed(2));
        manuallyEdited = true;
      }

      const amount = Number((actualQty * c.pricePerLiter).toFixed(2));

      deliveries.push({
        id: `delivery_${c.id}_${date}`,
        customerId: c.id,
        customerName: c.name,
        deliveryDate: date,
        defaultQuantity: c.defaultDailyQuantity,
        actualQuantity: actualQty,
        pricePerLiter: c.pricePerLiter,
        amount,
        status,
        manuallyEdited,
        createdAt: new Date(`${date}T07:30:00Z`).getTime(),
        updatedAt: new Date(`${date}T08:00:00Z`).getTime(),
      });
    }
  }

  console.log(`[PASS] Generated ${deliveries.length} customer deliveries for October 2026.`);

  // ==========================================
  // 5. GENERATE OCTOBER 2026 MONTHLY BILLS & PAYMENTS
  // 50 customers
  // ==========================================
  console.log('\nGenerating October 2026 Monthly Bills for 50 customers...');
  const monthlyBills: MonthlyBill[] = [];
  const payments: Payment[] = [];

  for (let idx = 0; idx < NEW_CUSTOMERS.length; idx++) {
    const c = NEW_CUSTOMERS[idx];
    const cDeliveries = deliveries.filter((d) => d.customerId === c.id);
    const totalMilk = Number(cDeliveries.reduce((sum, d) => sum + d.actualQuantity, 0).toFixed(2));
    const milkAmount = Number(cDeliveries.reduce((sum, d) => sum + d.amount, 0).toFixed(2));

    // Realistic payment: ~70% of customers have already paid their bill on Oct 31
    const isPaid = idx % 3 !== 0; // 33 paid, 17 pending
    const paidAmt = isPaid ? milkAmount : 0;
    const remainingBalance = Number((milkAmount - paidAmt).toFixed(2));

    monthlyBills.push({
      id: `bill_${c.id}_2026_10`,
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone,
      billingMonth: 10,
      billingYear: 2026,
      totalMilk,
      milkAmount,
      previousBalance: 0,
      paymentsReceived: paidAmt,
      remainingBalance,
      generatedAt: new Date('2026-10-31T21:00:00Z').getTime(),
      updatedAt: new Date('2026-10-31T21:00:00Z').getTime(),
    });

    if (isPaid) {
      payments.push({
        id: `payment_${c.id}_2026_10`,
        customerId: c.id,
        amount: paidAmt,
        paymentDate: '2026-10-31',
        paymentMethod: idx % 2 === 0 ? 'upi' : 'cash',
        billingMonth: 10,
        billingYear: 2026,
        note: 'October 2026 Monthly Bill Settled',
        createdAt: new Date('2026-10-31T21:30:00Z').getTime(),
      });
    }
  }

  console.log(`[PASS] Generated ${monthlyBills.length} monthly bills and ${payments.length} settled payments.`);

  // ==========================================
  // 6. POPULATE TO FIRESTORE USING BATCHES
  // ==========================================
  console.log('\nWriting all records to Firebase Firestore...');

  async function writeItemsInBatches<T extends { id: string }>(
    colName: string,
    items: T[],
    batchSize = 400
  ) {
    let written = 0;
    for (let i = 0; i < items.length; i += batchSize) {
      const chunk = items.slice(i, i + batchSize);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const ref = doc(db, 'users', USER_ID, colName, item.id);
        batch.set(ref, item);
      }
      await batch.commit();
      written += chunk.length;
    }
    console.log(`  ✓ Wrote ${written} documents to "${colName}"`);
  }

  await writeItemsInBatches('suppliers', NEW_SUPPLIERS);
  await writeItemsInBatches('customers', NEW_CUSTOMERS);
  await writeItemsInBatches('supplierPurchases', purchases);
  await writeItemsInBatches('deliveries', deliveries);
  await writeItemsInBatches('monthlyBills', monthlyBills);
  await writeItemsInBatches('payments', payments);

  console.log('\n[PASS] All Firestore records committed successfully.');

  // ==========================================
  // 7. CREATE EXCEL WORKBOOK (5 SHEETS)
  // 1. Suppliers
  // 2. Customers
  // 3. Supplier Purchases
  // 4. Customer Deliveries
  // 5. Summary
  // ==========================================
  console.log('\nCreating Excel Workbook: Milk_Management_Fresh_Data.xlsx...');

  const wb = XLSX.utils.book_new();

  // Sheet 1: Suppliers
  const suppliersSheetData = NEW_SUPPLIERS.map((s, idx) => ({
    'S.No': idx + 1,
    'Supplier ID': s.id,
    'Supplier Name': s.name,
    'Phone Number': s.phone,
    'Registration Date': '2026-09-25',
    'Status': 'Active',
  }));
  const wsSuppliers = XLSX.utils.json_to_sheet(suppliersSheetData);
  wsSuppliers['!cols'] = [
    { wch: 6 },
    { wch: 22 },
    { wch: 36 },
    { wch: 16 },
    { wch: 18 },
    { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSuppliers, 'Suppliers');

  // Sheet 2: Customers
  const customersSheetData = NEW_CUSTOMERS.map((c, idx) => ({
    'S.No': idx + 1,
    'Customer ID': c.id,
    'Customer Name': c.name,
    'Phone Number': c.phone,
    'Delivery Area / Location': c.location || '',
    'Milk Category': c.milkCategory === 'buffalo' ? 'Buffalo Milk' : 'Cow Milk',
    'Delivery Session': c.deliveryTime ? c.deliveryTime.charAt(0).toUpperCase() + c.deliveryTime.slice(1) : 'Morning',
    'Default Quantity (L)': c.defaultDailyQuantity,
    'Rate per Liter (₹)': c.pricePerLiter,
    'Start Date': c.deliveryStartDate,
    'Status': 'Active',
  }));
  const wsCustomers = XLSX.utils.json_to_sheet(customersSheetData);
  wsCustomers['!cols'] = [
    { wch: 6 },
    { wch: 26 },
    { wch: 24 },
    { wch: 16 },
    { wch: 34 },
    { wch: 16 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
    { wch: 14 },
    { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCustomers, 'Customers');

  // Sheet 3: Supplier Purchases
  const purchasesSheetData = purchases.map((p, idx) => ({
    'S.No': idx + 1,
    'Purchase ID': p.id,
    'Purchase Date': p.purchaseDate,
    'Supplier Name': p.supplierName,
    'Phone Number': p.supplierPhone,
    'Milk Category': p.milkCategory === 'buffalo' ? 'Buffalo Milk' : 'Cow Milk',
    'Session': p.session.charAt(0).toUpperCase() + p.session.slice(1),
    'Purchased Quantity (L)': p.quantityLiters,
    'Rate per Liter (₹)': p.pricePerLiter,
    'Total Amount (₹)': p.totalAmount,
    'Sold Quantity (L)': p.totalSoldQuantity || 0,
    'Remaining Stock (L)': p.remainingQuantity || 0,
    'Status': 'Sold / Balanced',
  }));
  const wsPurchases = XLSX.utils.json_to_sheet(purchasesSheetData);
  wsPurchases['!cols'] = [
    { wch: 6 },
    { wch: 34 },
    { wch: 14 },
    { wch: 34 },
    { wch: 15 },
    { wch: 15 },
    { wch: 12 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsPurchases, 'Supplier Purchases');

  // Sheet 4: Customer Deliveries
  const deliveriesSheetData = deliveries.map((d, idx) => {
    const cust = NEW_CUSTOMERS.find((c) => c.id === d.customerId);
    return {
      'S.No': idx + 1,
      'Delivery ID': d.id,
      'Delivery Date': d.deliveryDate,
      'Customer Name': d.customerName || cust?.name || '',
      'Phone Number': cust?.phone || '',
      'Location': cust?.location || '',
      'Milk Category': cust?.milkCategory === 'buffalo' ? 'Buffalo Milk' : 'Cow Milk',
      'Session': cust?.deliveryTime ? cust.deliveryTime.charAt(0).toUpperCase() + cust.deliveryTime.slice(1) : 'Morning',
      'Delivered Quantity (L)': d.actualQuantity,
      'Rate per Liter (₹)': d.pricePerLiter,
      'Total Amount (₹)': d.amount,
      'Delivery Status': d.status === 'delivered' ? 'Delivered' : 'Customer Holiday',
    };
  });
  const wsDeliveries = XLSX.utils.json_to_sheet(deliveriesSheetData);
  wsDeliveries['!cols'] = [
    { wch: 6 },
    { wch: 36 },
    { wch: 14 },
    { wch: 24 },
    { wch: 15 },
    { wch: 32 },
    { wch: 15 },
    { wch: 12 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDeliveries, 'Customer Deliveries');

  // Sheet 5: Summary
  const totalPurchaseLiters = purchases.reduce((sum, p) => sum + p.quantityLiters, 0);
  const totalPurchaseSpend = purchases.reduce((sum, p) => sum + p.totalAmount, 0);
  const totalBuffaloPurchased = purchases.filter((p) => p.milkCategory === 'buffalo').reduce((s, p) => s + p.quantityLiters, 0);
  const totalCowPurchased = purchases.filter((p) => p.milkCategory === 'cow').reduce((s, p) => s + p.quantityLiters, 0);
  const totalBuffaloPurchaseSpend = purchases.filter((p) => p.milkCategory === 'buffalo').reduce((s, p) => s + p.totalAmount, 0);
  const totalCowPurchaseSpend = purchases.filter((p) => p.milkCategory === 'cow').reduce((s, p) => s + p.totalAmount, 0);

  const totalDeliveryLiters = Number(deliveries.reduce((sum, d) => sum + d.actualQuantity, 0).toFixed(2));
  const totalDeliveryRevenue = Number(deliveries.reduce((sum, d) => sum + d.amount, 0).toFixed(2));

  const buffaloDeliveries = deliveries.filter((d) => {
    const c = NEW_CUSTOMERS.find((x) => x.id === d.customerId);
    return c?.milkCategory === 'buffalo';
  });
  const cowDeliveries = deliveries.filter((d) => {
    const c = NEW_CUSTOMERS.find((x) => x.id === d.customerId);
    return c?.milkCategory === 'cow';
  });

  const totalBuffaloDelivered = Number(buffaloDeliveries.reduce((s, d) => s + d.actualQuantity, 0).toFixed(2));
  const totalCowDelivered = Number(cowDeliveries.reduce((s, d) => s + d.actualQuantity, 0).toFixed(2));
  const totalBuffaloRevenue = Number(buffaloDeliveries.reduce((s, d) => s + d.amount, 0).toFixed(2));
  const totalCowRevenue = Number(cowDeliveries.reduce((s, d) => s + d.amount, 0).toFixed(2));

  const totalPaidRevenue = payments.reduce((s, p) => s + p.amount, 0);
  const totalPendingDue = Number((totalDeliveryRevenue - totalPaidRevenue).toFixed(2));

  const summarySheetData = [
    { 'Metric Category': 'OVERVIEW METRICS', 'Metric Name': 'Total Suppliers', 'Value / Quantity': 2, 'Financial Total (₹)': '-' },
    { 'Metric Category': 'OVERVIEW METRICS', 'Metric Name': 'Total Customers', 'Value / Quantity': 50, 'Financial Total (₹)': '-' },
    { 'Metric Category': 'OVERVIEW METRICS', 'Metric Name': 'Buffalo Milk Customers', 'Value / Quantity': 25, 'Financial Total (₹)': '-' },
    { 'Metric Category': 'OVERVIEW METRICS', 'Metric Name': 'Cow Milk Customers', 'Value / Quantity': 25, 'Financial Total (₹)': '-' },
    { 'Metric Category': 'OVERVIEW METRICS', 'Metric Name': 'Morning Session Customers', 'Value / Quantity': 28, 'Financial Total (₹)': '-' },
    { 'Metric Category': 'OVERVIEW METRICS', 'Metric Name': 'Evening Session Customers', 'Value / Quantity': 22, 'Financial Total (₹)': '-' },
    { 'Metric Category': '', 'Metric Name': '', 'Value / Quantity': '', 'Financial Total (₹)': '' },

    { 'Metric Category': 'OCTOBER 2026 PURCHASES', 'Metric Name': 'Total Purchase Transactions', 'Value / Quantity': purchases.length, 'Financial Total (₹)': '-' },
    { 'Metric Category': 'OCTOBER 2026 PURCHASES', 'Metric Name': 'Buffalo Milk Purchased', 'Value / Quantity': `${totalBuffaloPurchased} Litres`, 'Financial Total (₹)': `₹${totalBuffaloPurchaseSpend.toLocaleString('en-IN')}` },
    { 'Metric Category': 'OCTOBER 2026 PURCHASES', 'Metric Name': 'Cow Milk Purchased', 'Value / Quantity': `${totalCowPurchased} Litres`, 'Financial Total (₹)': `₹${totalCowPurchaseSpend.toLocaleString('en-IN')}` },
    { 'Metric Category': 'OCTOBER 2026 PURCHASES', 'Metric Name': 'Total Milk Purchased (Both)', 'Value / Quantity': `${totalPurchaseLiters} Litres`, 'Financial Total (₹)': `₹${totalPurchaseSpend.toLocaleString('en-IN')}` },
    { 'Metric Category': '', 'Metric Name': '', 'Value / Quantity': '', 'Financial Total (₹)': '' },

    { 'Metric Category': 'OCTOBER 2026 DELIVERIES', 'Metric Name': 'Total Delivery Records', 'Value / Quantity': deliveries.length, 'Financial Total (₹)': '-' },
    { 'Metric Category': 'OCTOBER 2026 DELIVERIES', 'Metric Name': 'Buffalo Milk Delivered', 'Value / Quantity': `${totalBuffaloDelivered} Litres`, 'Financial Total (₹)': `₹${totalBuffaloRevenue.toLocaleString('en-IN')}` },
    { 'Metric Category': 'OCTOBER 2026 DELIVERIES', 'Metric Name': 'Cow Milk Delivered', 'Value / Quantity': `${totalCowDelivered} Litres`, 'Financial Total (₹)': `₹${totalCowRevenue.toLocaleString('en-IN')}` },
    { 'Metric Category': 'OCTOBER 2026 DELIVERIES', 'Metric Name': 'Total Milk Delivered to Customers', 'Value / Quantity': `${totalDeliveryLiters} Litres`, 'Financial Total (₹)': `₹${totalDeliveryRevenue.toLocaleString('en-IN')}` },
    { 'Metric Category': '', 'Metric Name': '', 'Value / Quantity': '', 'Financial Total (₹)': '' },

    { 'Metric Category': 'FINANCIAL SUMMARY', 'Metric Name': 'Total Customer Billings', 'Value / Quantity': '-', 'Financial Total (₹)': `₹${totalDeliveryRevenue.toLocaleString('en-IN')}` },
    { 'Metric Category': 'FINANCIAL SUMMARY', 'Metric Name': 'Payments Collected (UPI & Cash)', 'Value / Quantity': `${payments.length} Payments`, 'Financial Total (₹)': `₹${totalPaidRevenue.toLocaleString('en-IN')}` },
    { 'Metric Category': 'FINANCIAL SUMMARY', 'Metric Name': 'Pending Receivables Due', 'Value / Quantity': `${monthlyBills.filter((b) => b.remainingBalance > 0).length} Customers`, 'Financial Total (₹)': `₹${totalPendingDue.toLocaleString('en-IN')}` },
    { 'Metric Category': 'FINANCIAL SUMMARY', 'Metric Name': 'Total Purchase Cost', 'Value / Quantity': '-', 'Financial Total (₹)': `₹${totalPurchaseSpend.toLocaleString('en-IN')}` },
    { 'Metric Category': 'FINANCIAL SUMMARY', 'Metric Name': 'Gross Profit Margin', 'Value / Quantity': '-', 'Financial Total (₹)': `₹${(totalDeliveryRevenue - totalPurchaseSpend).toLocaleString('en-IN')}` },
  ];

  const wsSummary = XLSX.utils.json_to_sheet(summarySheetData);
  wsSummary['!cols'] = [
    { wch: 28 },
    { wch: 34 },
    { wch: 26 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // Save Workbook to root
  const excelFilePath = path.resolve(process.cwd(), 'Milk_Management_Fresh_Data.xlsx');
  XLSX.writeFile(wb, excelFilePath);
  console.log(`[PASS] Excel workbook saved successfully to:\n       ${excelFilePath}`);

  console.log('\n=== ALL STEPS COMPLETED SUCCESSFULLY ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Population failed:', err);
  process.exit(1);
});
