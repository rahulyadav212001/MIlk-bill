process.env.EXPO_PUBLIC_FIREBASE_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBJGRAY93E3PGIA8KTTVMi2f2UCCWLZlwM';
process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'milk-bill-a31be.firebaseapp.com';
process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'milk-bill-a31be';
process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'milk-bill-a31be.firebasestorage.app';
process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '792806488061';
process.env.EXPO_PUBLIC_FIREBASE_APP_ID = process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:792806488061:web:0ed40b77f5349d9b758b94';

import {
  getCustomerDailyAccountHistory,
  getCustomerMonthlyAccountHistory,
  getCustomerRangeAccountHistory,
} from '../src/services/customerHistoryService';
import { getCustomers } from '../src/services/customerService';
import { getTodayKolkata } from '../src/utils/date';

async function main() {
  console.log('=== VERIFYING CUSTOMER HISTORY & BILLS ===\n');

  // 1. Fetch Customers
  const customers = await getCustomers();
  console.log(`[PASS] Found ${customers.length} registered customers in Firestore.`);
  if (customers.length === 0) {
    throw new Error('Expected at least 1 customer');
  }

  // 2. Daily History for today
  const today = getTodayKolkata();
  console.log(`Checking Daily History for ${today}...`);
  const todayHistory = await getCustomerDailyAccountHistory(today);
  console.log(`[PASS] Daily history loaded: ${todayHistory.totalCustomers} customers, ${todayHistory.totalMilkDelivered} L delivered, ₹${todayHistory.totalAmount}`);
  console.log(`  - Buffalo: ${todayHistory.buffaloDelivered} L (₹${todayHistory.buffaloAmount})`);
  console.log(`  - Cow: ${todayHistory.cowDelivered} L (₹${todayHistory.cowAmount})`);

  // Verify buffalo + cow = total
  const catTotalMilk = Number((todayHistory.buffaloDelivered + todayHistory.cowDelivered).toFixed(2));
  if (Math.abs(catTotalMilk - todayHistory.totalMilkDelivered) > 0.01) {
    throw new Error(`Category milk sum ${catTotalMilk} != total ${todayHistory.totalMilkDelivered}`);
  }

  // 3. Monthly History for October 2026
  console.log('\nChecking Monthly History for October 2026 (2026-10)...');
  const octHistory = await getCustomerMonthlyAccountHistory(2026, 10);
  console.log(`[PASS] October history loaded: ${octHistory.totalCustomers} customers with deliveries, ${octHistory.totalMilkDelivered} L total, ₹${octHistory.totalAmount}`);
  console.log(`  - Buffalo: ${octHistory.buffaloDelivered} L (₹${octHistory.buffaloAmount})`);
  console.log(`  - Cow: ${octHistory.cowDelivered} L (₹${octHistory.cowAmount})`);
  console.log(`  - Total delivery records: ${octHistory.allDeliveries.length}`);

  if (octHistory.allDeliveries.length > 0) {
    const firstCustSummary = octHistory.customerSummaries[0];
    console.log(`  - First customer summary: ${firstCustSummary.customerName}, ${firstCustSummary.totalMilkDelivered} L across ${firstCustSummary.deliveryCount} deliveries.`);
    if (firstCustSummary.deliveries.length !== firstCustSummary.deliveryCount) {
      throw new Error('Deliveries array length does not match deliveryCount');
    }
  }

  // 4. Custom Range History (Multi-month range e.g. 2026-10-01 to 2026-11-01)
  console.log('\nChecking Custom Range History (2026-10-01 to 2026-11-01)...');
  const customHistory = await getCustomerRangeAccountHistory('2026-10-01', '2026-11-01');
  console.log(`[PASS] Custom range history loaded: ${customHistory.totalCustomers} customers, ${customHistory.totalMilkDelivered} L, ₹${customHistory.totalAmount}`);
  console.log(`  - Period label: ${customHistory.periodLabel}`);
  console.log(`  - Date groups count: ${customHistory.dateSummaries.length}`);

  console.log('\n=== ALL CUSTOMER HISTORY & BILLS VERIFICATIONS PASSED SUCCESSFULLY! ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
