import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function inspect() {
  console.log('=== INSPECTING CURRENT FIRESTORE DATA ===\n');

  const collections = [
    'suppliers',
    'customers',
    'supplierPurchases',
    'sales',
    'deliveries',
    'bills',
    'monthlyBills',
    'payments',
    'customerHolidays',
    'supplierHolidays',
  ];

  for (const colName of collections) {
    const snap = await getDocs(collection(db, 'users', USER_ID, colName));
    console.log(`Collection "${colName}": ${snap.size} documents`);
  }

  process.exit(0);
}

inspect().catch((err) => {
  console.error(err);
  process.exit(1);
});

