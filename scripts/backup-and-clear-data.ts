import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
const fs = typeof require !== 'undefined' ? (require('fs') as any) : null;
const path = typeof require !== 'undefined' ? (require('path') as any) : null;

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

const TARGET_COLLECTIONS = [
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

async function main() {
  console.log('=== STEP 1: BACKUP AND CLEAR EXISTING DATA ===\n');

  // 1. Fetch all documents for backup
  const backupData: Record<string, Record<string, any>> = {};
  const docCounts: Record<string, number> = {};
  let totalDocsToBackup = 0;

  for (const colName of TARGET_COLLECTIONS) {
    const snap = await getDocs(collection(db, 'users', USER_ID, colName));
    backupData[colName] = {};
    docCounts[colName] = snap.size;
    totalDocsToBackup += snap.size;

    snap.forEach((d) => {
      backupData[colName][d.id] = d.data();
    });
    console.log(`Read ${snap.size} documents from "${colName}"`);
  }

  console.log(`\nTotal documents read for backup: ${totalDocsToBackup}`);

  // 2. Write backup file
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = path.join(backupDir, `firestore_backup_${timestamp}.json`);
  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`[PASS] Backup file saved to: ${backupFilePath}`);

  // 3. Verify backup file
  console.log('\nVerifying backup file integrity...');
  if (!fs.existsSync(backupFilePath)) {
    throw new Error('Backup file was not created on disk!');
  }
  const fileContents = fs.readFileSync(backupFilePath, 'utf-8');
  const parsedBackup = JSON.parse(fileContents);

  let verifiedDocs = 0;
  for (const colName of TARGET_COLLECTIONS) {
    const savedKeys = Object.keys(parsedBackup[colName] || {});
    if (savedKeys.length !== docCounts[colName]) {
      throw new Error(
        `Backup verification mismatch in "${colName}": expected ${docCounts[colName]}, found ${savedKeys.length}`
      );
    }
    verifiedDocs += savedKeys.length;
  }

  if (verifiedDocs !== totalDocsToBackup) {
    throw new Error(`Total verified docs (${verifiedDocs}) != expected (${totalDocsToBackup})`);
  }
  console.log(`[PASS] Backup verified successfully: All ${verifiedDocs} documents accurately captured.\n`);

  // 4. Delete documents in batches
  console.log('Clearing Firestore collections...');
  let totalDeleted = 0;

  for (const colName of TARGET_COLLECTIONS) {
    const snap = await getDocs(collection(db, 'users', USER_ID, colName));
    if (snap.empty) continue;

    const docs = snap.docs;
    const CHUNK_SIZE = 400; // Under Firestore 500 batch limit
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      const chunk = docs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const d of chunk) {
        batch.delete(d.ref);
      }
      await batch.commit();
      totalDeleted += chunk.length;
    }
    console.log(`Deleted ${snap.size} documents from "${colName}"`);
  }

  console.log(`\nTotal documents deleted: ${totalDeleted}`);

  // 5. Verify all target collections are empty
  console.log('\nVerifying target collections are now empty...');
  for (const colName of TARGET_COLLECTIONS) {
    const snap = await getDocs(collection(db, 'users', USER_ID, colName));
    if (snap.size !== 0) {
      throw new Error(`Collection "${colName}" is not empty! Found ${snap.size} docs.`);
    }
  }

  console.log('[PASS] All target collections are completely cleared and empty.');
  console.log('\n=== STEP 1 COMPLETED SUCCESSFULLY ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Backup & Clear failed:', err);
  process.exit(1);
});
