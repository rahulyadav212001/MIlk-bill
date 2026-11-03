export type MilkSession = 'morning' | 'afternoon' | 'evening';

export type MilkDeliveryTime = 'morning' | 'afternoon' | 'evening' | 'both';

export type MilkCategory = 'buffalo' | 'cow';

export type DeliveryStatus =
  | 'delivered'
  | 'stopped'
  | 'not_started'
  | 'customer_holiday'
  | 'supplier_holiday';

export type PaymentMethod = 'cash' | 'upi' | 'other';

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  milkCategory?: MilkCategory; // optional legacy field
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SupplierPurchase {
  id: string; // unique transaction id or stable format
  supplierId: string;
  supplierName: string;
  supplierPhone: string;
  milkCategory?: MilkCategory; // 'buffalo' | 'cow'
  purchaseDate: string; // YYYY-MM-DD
  session: MilkSession; // 'morning' | 'afternoon' | 'evening'
  quantityLiters: number;
  pricePerLiter: number;
  totalAmount: number; // quantityLiters * pricePerLiter
  totalSoldQuantity?: number;
  remainingQuantity?: number;
  wastageQuantity?: number;
  supplierDeleted?: boolean;
  isSupplierDeleted?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MilkPurchase {
  id: string; // unique transaction id
  supplierId: string;
  supplierName: string;
  supplierPhone: string;
  milkCategory: MilkCategory; // 'buffalo' | 'cow'
  session: MilkSession; // 'morning' | 'afternoon' | 'evening'
  purchaseDate: string; // YYYY-MM-DD
  quantityLiters: number;
  pricePerLiter: number;
  totalAmount: number; // quantityLiters * pricePerLiter
  totalSoldQuantity: number;
  remainingQuantity: number;
  wastageQuantity?: number;
  lossAmount?: number;
  isSold?: boolean;
  status?: 'pending' | 'sold' | 'completed';
  saleRecordId?: string;
  supplierDeleted?: boolean;
  isSupplierDeleted?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MilkSale {
  id: string;
  purchaseId: string; // linked purchase transaction id (1-to-1)
  supplierId: string;
  supplierName: string;
  supplierPhone?: string;
  milkCategory: MilkCategory; // 'buffalo' | 'cow'
  session: MilkSession; // 'morning' | 'afternoon' | 'evening'
  purchaseDate: string; // date purchased
  saleDate: string; // YYYY-MM-DD
  purchasedQuantityLiters: number; // original purchased quantity
  purchasePricePerLiter: number; // purchase rate per litre
  totalPurchaseAmount: number; // total purchase amount (quantity * rate)
  soldQuantityLiters: number; // sold quantity in litres
  quantityLiters: number; // alias for compatibility
  remainingQuantityLiters: number; // purchased - sold
  remainingQuantity: number; // alias for compatibility
  status: 'no_loss' | 'remaining' | 'loss';
  statusText: string; // 'No Loss' or 'X Litres Remaining'
  pricePerLiter?: number; // optional selling rate
  totalAmount?: number; // optional sales revenue
  wastageQuantity?: number;
  lossAmount?: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CategoryStock {
  category: MilkCategory;
  purchasedLiters: number;
  soldLiters: number;
  remainingLiters: number;
  status: 'no_loss' | 'loss' | 'surplus';
}

export interface OverallStockSummary {
  totalPurchasedLiters: number;
  totalSoldLiters: number;
  remainingLiters: number;
  status: 'no_loss' | 'loss' | 'surplus';
  buffalo: CategoryStock;
  cow: CategoryStock;
}

export interface SupplierStockItem {
  supplier: Supplier;
  todayPurchasedLiters: number;
  todayPurchasedAmount: number;
  todaySoldLiters: number;
  todayRemainingLiters: number;
  status: 'no_loss' | 'loss' | 'surplus';
  purchasesCount: number;
  salesCount: number;
}

export interface EnrichedPurchaseTransaction extends MilkPurchase {
  sales: MilkSale[];
  salesRevenue: number;
  actualWastageQuantity: number;
  actualLossAmount: number;
}

export interface SupplierRangeSummary {
  supplierId: string;
  supplierName: string;
  supplierPhone: string;
  totalPurchasedLiters: number;
  totalSoldLiters: number;
  totalRemainingLiters: number;
  totalWastageLiters: number;
  totalPurchaseAmount: number;
  totalAmount: number;
  totalSalesRevenue: number;
  totalLossAmount: number;
  buffaloPurchased: number;
  buffaloSold: number;
  cowPurchased: number;
  cowSold: number;
  sessions: {
    session: MilkSession;
    purchases: EnrichedPurchaseTransaction[];
  }[];
  transactions: EnrichedPurchaseTransaction[];
}

export interface DateSummary {
  date: string; // YYYY-MM-DD
  totalPurchasedLiters: number;
  totalSoldLiters: number;
  totalRemainingLiters: number;
  totalWastageLiters: number;
  totalPurchaseAmount: number;
  totalAmount?: number;
  totalSalesRevenue: number;
  totalLossAmount: number;
  purchases: EnrichedPurchaseTransaction[];
}

export interface RangeAccountsHistory {
  startDate: string;
  endDate: string;
  periodLabel: string;
  totalPurchasedLiters: number;
  totalSoldLiters: number;
  totalRemainingLiters: number;
  totalWastageLiters: number;
  totalPurchaseAmount: number;
  totalAmount: number;
  totalSalesRevenue: number;
  totalLossAmount: number;
  buffaloPurchased: number;
  buffaloSold: number;
  buffaloRemaining: number;
  buffaloPurchaseAmount: number;
  cowPurchased: number;
  cowSold: number;
  cowRemaining: number;
  cowPurchaseAmount: number;
  suppliers: SupplierRangeSummary[];
  dates: DateSummary[];
  transactions: EnrichedPurchaseTransaction[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  milkCategory?: MilkCategory; // 'buffalo' | 'cow'
  location?: string; // address or area
  defaultDailyQuantity: number; // in Liters
  morningQuantity?: number; // Litres in morning
  eveningQuantity?: number; // Litres in evening
  pricePerLiter: number; // in ₹
  deliveryTime?: MilkDeliveryTime; // 'morning' | 'afternoon' | 'evening' | 'both'
  deliveryStartDate: string; // YYYY-MM-DD
  deliveryStopDate?: string | null; // YYYY-MM-DD (optional, inclusive)
  isActive: boolean;
  isDeactivated?: boolean;
  deactivatedAt?: number;
  closingDate?: string; // YYYY-MM-DD
  billingPeriodStart?: string; // YYYY-MM-DD
  billingPeriodEnd?: string; // YYYY-MM-DD
  finalBillAmount?: number;
  finalOutstandingAmount?: number;
  accountStatus?: 'active' | 'deactivated';
  createdAt: number;
  updatedAt: number;
}

export interface FinalAccountClosingSummary {
  customerId: string;
  customerName: string;
  customerPhone: string;
  joiningDate: string; // YYYY-MM-DD
  closingDate: string; // YYYY-MM-DD
  billingPeriodStart: string; // YYYY-MM-DD (start of current cycle)
  billingPeriodEnd: string; // YYYY-MM-DD (closing date)
  billingPeriodLabel: string; // e.g. "1 Nov 2026 to 5 Nov 2026"
  billingMonth: number; // 1-12
  billingYear: number;
  completedBillingMonthsCount: number;
  lastCompletedMonthLabel?: string;
  isPreviousMonthPaid: boolean;
  milkCategory: MilkCategory;
  defaultDailyQuantity: number;
  pricePerLiter: number;
  currentCycleMilkQuantity: number; // Litres in this cycle
  currentCycleMilkAmount: number; // ₹ milk charges in this cycle
  currentCycleDeliveries: Delivery[]; // actual daily milk entries in this cycle
  previousBalance: number; // unpaid balance carried from prior completed bills
  currentMonthPayments: number; // payments received in this cycle
  finalBillAmount: number; // current cycle milk charges (₹)
  finalOutstandingAmount: number; // previousBalance + finalBillAmount - currentMonthPayments
  deliveriesCount: number;
  totalMilkQuantity?: number;
  totalMilkAmount?: number;
  currentMilkBill?: number;
  currentMilkQuantity?: number;
  totalPaymentsReceived?: number;
}

export interface Delivery {
  id: string; // stable: delivery_{customerId}_{date}
  customerId: string;
  customerName?: string;
  deliveryDate: string; // YYYY-MM-DD
  date?: string; // backwards compatibility alias
  defaultQuantity: number;
  morningQuantity?: number;
  eveningQuantity?: number;
  actualQuantity: number;
  pricePerLiter: number;
  amount: number; // actualQuantity * pricePerLiter
  status: DeliveryStatus;
  manuallyEdited: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface EnrichedCustomerDelivery extends Delivery {
  customerPhone?: string;
  customerLocation?: string;
  milkCategory: MilkCategory; // 'buffalo' | 'cow'
  deliveryTime: MilkDeliveryTime; // 'morning' | 'afternoon' | 'evening'
  paymentStatus?: 'paid' | 'pending';
}

export interface CustomerHistorySummary {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerLocation?: string;
  milkCategory: MilkCategory;
  deliveryTime: MilkDeliveryTime;
  pricePerLiter: number;
  totalMilkDelivered: number;
  totalAmount: number;
  deliveryCount: number;
  deliveries: EnrichedCustomerDelivery[];
  paymentStatus?: 'paid' | 'pending';
}

export interface CustomerDateSummary {
  date: string; // YYYY-MM-DD
  totalMilk: number;
  totalAmount: number;
  deliveriesCount: number;
  deliveries: EnrichedCustomerDelivery[];
}

export interface CustomerRangeAccountsHistory {
  startDate: string;
  endDate: string;
  periodLabel: string;
  totalCustomers: number;
  totalMilkDelivered: number;
  totalAmount: number;
  buffaloDelivered: number;
  buffaloAmount: number;
  cowDelivered: number;
  cowAmount: number;
  customerSummaries: CustomerHistorySummary[];
  allDeliveries: EnrichedCustomerDelivery[];
  dateSummaries: CustomerDateSummary[];
}

export type PaymentStatus = 'paid' | 'partially_paid' | 'due';

export interface MonthlyBill {
  id: string; // stable: bill_{customerId}_{year}_{month}
  customerId: string;
  customerName: string;
  customerPhone: string;
  billingMonth: number; // 1-12
  billingYear: number;
  totalMilk: number; // Liters
  milkAmount: number; // ₹
  customerHolidayCount?: number;
  supplierHolidayCount?: number;
  previousBalance: number;
  paymentsReceived: number;
  remainingBalance: number; // previousBalance + milkAmount - paymentsReceived
  paymentStatus?: PaymentStatus;
  expectedPaymentDate?: string;
  notes?: string;
  lastPaymentDate?: string;
  generatedAt: number;
  updatedAt: number;
}

export interface Payment {
  id: string;
  customerId: string;
  billId?: string;
  amount: number;
  paymentDate: string; // YYYY-MM-DD
  paymentMethod: PaymentMethod;
  billingMonth: number;
  billingYear: number;
  expectedPaymentDate?: string;
  paymentStatus?: PaymentStatus;
  note?: string;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface CustomerPaymentSummary {
  customer: Customer;
  bill: MonthlyBill;
  milkAmount: number;
  previousBalance: number;
  totalDue: number; // previousBalance + milkAmount
  paidAmount: number; // paymentsReceived
  remainingBalance: number;
  paymentStatus: PaymentStatus;
  expectedPaymentDate?: string;
  lastPaymentDate?: string;
  isDeactivated: boolean;
}

export interface PaymentDashboardOverview {
  month: number;
  year: number;
  totalMonthlyBills: number;
  totalAmountReceived: number;
  totalOutstandingAmount: number;
  paidCustomersCount: number;
  dueCustomersCount: number;
  partiallyPaidCustomersCount: number;
  totalCustomersCount: number;
}

export interface SupplierProfile {
  businessName?: string;
  phone?: string;
}

export interface DashboardStats {
  totalActiveCustomers: number;
  todayTotalMilk: number;
  todayTotalAmount: number;
  currentMonthMilkAmount: number;
  totalPaymentsReceived: number;
  totalOutstandingBalance: number;
  customerHolidays: number;
  supplierHolidays: number;
}

export interface CustomerHoliday {
  id: string;
  customerId: string;
  customerName?: string;
  holidayDate?: string;
  holidayStatus?: string;
  previousQuantity?: number;
  previousAmount?: number;
  previousManuallyEdited?: boolean;
  startDate?: string;
  endDate?: string;
  reason?: string;
  createdAt: number;
}

export interface SupplierHoliday {
  id: string;
  startDate?: string;
  endDate?: string;
  supplierId?: string;
  supplierName?: string;
  holidayDate?: string;
  isAllSuppliers?: boolean;
  reason?: string;
  createdAt: number;
}
