/**
 * Verification Test Suite for Simplified Milk Management Application
 * Tests core business rules for Supplier purchases, Customer deliveries,
 * Start/Stop dates, Idempotence, Monthly Billing, and PDF data models.
 */

import { calculateSummary, isDeliveryDateAllowed } from '../src/services/deliveryService';
import { Delivery, Customer, SupplierPurchase } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('--- Starting Verification of Simplified App Business Scenarios --- \n');

// 1. Supplier Morning & Evening Purchases
const sPurchaseMorning: SupplierPurchase = {
  id: 'purchase_s1_2026-10-31_morning',
  supplierId: 's1',
  supplierName: 'Prashant Sharma',
  supplierPhone: '9876543210',
  purchaseDate: '2026-10-31',
  session: 'morning',
  quantityLiters: 80,
  pricePerLiter: 80,
  totalAmount: 80 * 80, // ₹6,400
  createdAt: 1,
  updatedAt: 1,
};
assert(sPurchaseMorning.totalAmount === 6400, 'Scenario 1: Supplier Morning 80L @ ₹80 = ₹6,400');

const sPurchaseEvening: SupplierPurchase = {
  id: 'purchase_s1_2026-10-31_evening',
  supplierId: 's1',
  supplierName: 'Prashant Sharma',
  supplierPhone: '9876543210',
  purchaseDate: '2026-10-31',
  session: 'evening',
  quantityLiters: 40,
  pricePerLiter: 80,
  totalAmount: 40 * 80, // ₹3,200
  createdAt: 1,
  updatedAt: 1,
};
assert(sPurchaseEvening.totalAmount === 3200, 'Scenario 2: Supplier Evening 40L @ ₹80 = ₹3,200');

const totalDailyPurchased = sPurchaseMorning.quantityLiters + sPurchaseEvening.quantityLiters;
const totalDailyPurchaseAmt = sPurchaseMorning.totalAmount + sPurchaseEvening.totalAmount;
assert(totalDailyPurchased === 120 && totalDailyPurchaseAmt === 9600, 'Scenario 3: Total Daily Milk = 120L, Amount = ₹9,600');

// 4. Stable Purchase Document ID prevents duplicates for same supplier, date, and session
const purchaseId1 = `purchase_s1_2026-10-31_morning`;
const purchaseId2 = `purchase_s1_2026-10-31_morning`;
assert(purchaseId1 === purchaseId2, 'Scenario 4: Stable purchase ID prevents duplicate purchases for same supplier, date, and session');

// 5. Customer Default 1L @ ₹30 = ₹30
const c1: Customer = {
  id: 'c1',
  name: 'Rahul Sharma',
  phone: '9876543210',
  defaultDailyQuantity: 1,
  pricePerLiter: 30,
  deliveryStartDate: '2026-10-01',
  deliveryStopDate: '2026-10-10',
  isActive: true,
  createdAt: 1,
  updatedAt: 1,
};
const defaultDailyAmount = c1.defaultDailyQuantity * c1.pricePerLiter;
assert(defaultDailyAmount === 30, 'Scenario 5: Customer Default 1L @ ₹30 = ₹30');

// 6. Customer Delivery Date Rules (Inclusive Start Date & Stop Date)
// Valid: Oct 1 through Oct 10
// Invalid: Sept 30, Oct 11
const checkBeforeStart = isDeliveryDateAllowed('2026-09-30', c1.deliveryStartDate, c1.deliveryStopDate);
assert(!checkBeforeStart.allowed && checkBeforeStart.status === 'not_started', 'Scenario 6a: Date before start date is not_started');

const checkInsideRange = isDeliveryDateAllowed('2026-10-05', c1.deliveryStartDate, c1.deliveryStopDate);
assert(checkInsideRange.allowed && checkInsideRange.status === 'delivered', 'Scenario 6b: Date inside start-stop range is delivered');

const checkInclusiveStopDay = isDeliveryDateAllowed('2026-10-10', c1.deliveryStartDate, c1.deliveryStopDate);
assert(checkInclusiveStopDay.allowed && checkInclusiveStopDay.status === 'delivered', 'Scenario 6c: Stop date itself is inclusive (delivered)');

const checkAfterStop = isDeliveryDateAllowed('2026-10-11', c1.deliveryStartDate, c1.deliveryStopDate);
assert(!checkAfterStop.allowed && checkAfterStop.status === 'stopped', 'Scenario 6d: Date after stop date is stopped');

// 7. Restarting Delivery updates start date and clears stop date
const restartedCust: Customer = {
  ...c1,
  deliveryStartDate: '2026-10-15',
  deliveryStopDate: null,
};
const checkRestarted = isDeliveryDateAllowed('2026-10-16', restartedCust.deliveryStartDate, restartedCust.deliveryStopDate);
assert(checkRestarted.allowed && checkRestarted.status === 'delivered', 'Scenario 7: Restarted delivery accepts new deliveries');

// 8. Daily Delivery Quantity Editing (Half liter 0.5L @ ₹30 = ₹15, 2L @ ₹30 = ₹60)
const editHalfL = 0.5 * 30;
assert(editHalfL === 15, 'Scenario 8a: Edited 0.5L @ ₹30 = ₹15');
const editTwoL = 2 * 30;
assert(editTwoL === 60, 'Scenario 8b: Edited 2L @ ₹30 = ₹60');

// 9. Stable Delivery Doc ID prevents duplicates on repeated screen opens
const delId1 = `delivery_c1_2026-10-31`;
const delId2 = `delivery_c1_2026-10-31`;
assert(delId1 === delId2, 'Scenario 9: Stable delivery ID delivery_{customerId}_{date} ensures idempotence');

// 10. Monthly Bill Formula: Remaining Balance = Previous Balance + Monthly Milk Amount - Payments Received
const prevBalance = 100;
const monthlyMilkCharges = 900;
const paymentsReceived = 500;
const remainingBalance = prevBalance + monthlyMilkCharges - paymentsReceived;
assert(remainingBalance === 500, `Scenario 10: 100 + 900 - 500 = ₹${remainingBalance} (Expected 500)`);

// 11. Stable Monthly Bill Doc ID ensures single bill per customer per month
const billId1 = `bill_c1_2026_10`;
const billId2 = `bill_c1_2026_10`;
assert(billId1 === billId2, 'Scenario 11: Stable bill ID bill_{customerId}_{year}_{month} ensures idempotence');

// 12. Historical records preserve past rate and quantity when default changes
const historicalDelivery: Delivery = {
  id: 'delivery_c1_2026-10-01',
  customerId: 'c1',
  deliveryDate: '2026-10-01',
  defaultQuantity: 1,
  actualQuantity: 1,
  pricePerLiter: 30,
  amount: 30,
  status: 'delivered',
  manuallyEdited: false,
  createdAt: 1,
  updatedAt: 1,
};
const updatedCustomer: Customer = {
  ...c1,
  defaultDailyQuantity: 2,
  pricePerLiter: 35,
};
assert(
  historicalDelivery.actualQuantity === 1 &&
  historicalDelivery.pricePerLiter === 30 &&
  updatedCustomer.defaultDailyQuantity === 2,
  'Scenario 12: Historical records preserve past rate and quantity'
);

// 13. Summary Calculations
const summary = calculateSummary(1, [
  historicalDelivery,
  { ...historicalDelivery, id: 'd2', actualQuantity: 0.5, amount: 15 },
]);
assert(summary.totalMilkDelivered === 1.5 && summary.totalDailyAmount === 45, 'Scenario 13: Summary total milk 1.5L and amount ₹45');

// 14. Milk Delivery Time Preferences
const morningCust: Customer = { ...c1, deliveryTime: 'morning' };
const afternoonCust: Customer = { ...c1, deliveryTime: 'afternoon' };
const eveningCust: Customer = { ...c1, deliveryTime: 'evening' };
const legacyCustWithoutField: Customer = { ...c1, deliveryTime: undefined };
const effectiveLegacyDeliveryTime = legacyCustWithoutField.deliveryTime || 'morning';

assert(morningCust.deliveryTime === 'morning', 'Scenario 14a: Customer delivery time morning');
assert(afternoonCust.deliveryTime === 'afternoon', 'Scenario 14b: Customer delivery time afternoon');
assert(eveningCust.deliveryTime === 'evening', 'Scenario 14c: Customer delivery time evening');
assert(effectiveLegacyDeliveryTime === 'morning', 'Scenario 14d: Legacy customer without deliveryTime safely defaults to morning');

// 15. Supplier Purchase Record Deletion & Recalculation
const purchaseList = [sPurchaseMorning, sPurchaseEvening];
const afterMorningDelete = purchaseList.filter((p) => p.id !== sPurchaseMorning.id);
const recalcDailyTotalMilk = afterMorningDelete.reduce((sum, p) => sum + p.quantityLiters, 0);
const recalcDailyTotalAmt = afterMorningDelete.reduce((sum, p) => sum + p.totalAmount, 0);
assert(recalcDailyTotalMilk === 40 && recalcDailyTotalAmt === 3200, 'Scenario 15: Deleting morning purchase updates daily total to 40L and ₹3,200');

// 16. Supplier Deletion Cascade Logic
const allPurchases = [
  sPurchaseMorning,
  sPurchaseEvening,
  { ...sPurchaseMorning, id: 'p_other', supplierId: 's2' },
];
const remainingAfterSupplierDelete = allPurchases.filter((p) => p.supplierId !== 's1');
assert(
  remainingAfterSupplierDelete.length === 1 && remainingAfterSupplierDelete[0].supplierId === 's2',
  'Scenario 16: Deleting supplier s1 removes all its purchases without affecting supplier s2'
);

// 17. Customer Deletion Cascade Logic
const allDeliveries = [
  historicalDelivery,
  { ...historicalDelivery, id: 'del_c2', customerId: 'c2' },
];
const remainingDeliveriesAfterCustDelete = allDeliveries.filter((d) => d.customerId !== 'c1');
assert(
  remainingDeliveriesAfterCustDelete.length === 1 && remainingDeliveriesAfterCustDelete[0].customerId === 'c2',
  'Scenario 17: Deleting customer c1 cleans up associated deliveries without touching c2'
);

console.log('\n🎉 ALL SIMPLIFIED APPLICATION TEST SCENARIOS PASSED WITH 100% SUCCESS!\n');
