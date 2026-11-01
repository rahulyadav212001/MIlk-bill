# MilkDesk - Milk Billing & Delivery App 🥛📋

A complete, production-grade milk delivery and monthly billing application built with **React Native**, **Expo (Expo Router)**, **TypeScript**, and **Firebase (Cloud Firestore)**.

The app opens directly to the main dashboard without any authentication or login barriers, allowing milk suppliers to immediately manage daily deliveries, customer accounts, leaves/holidays, monthly billing generation, and payment collections.

---

## 🚀 Key Features

1. **Direct Access Dashboard**
   - Launches immediately to the business dashboard with zero login friction.
   - Live dairy statistics from Cloud Firestore: Active Customers, Today's Milk & Sales, Monthly Revenue, Total Collections, and Outstanding Balances.
   - Quick one-tap navigation to all operational sections.

2. **Customer Registration & Management**
   - Clean 4-field registration form: Customer Name, Phone Number, Daily Milk Quantity (Liters), Milk Price Per Liter (₹).
   - Automatic calculation of default daily amount: `Daily Milk Quantity × Milk Price Per Liter`.
   - Validation for phone uniqueness, positive milk quantity (supports decimals e.g., 0.5L, 1.25L), and positive milk price.
   - Deactivate/activate customers without altering historical deliveries.
   - Search by customer name and phone number.

3. **Daily Milk Delivery Management**
   - Automatically initializes delivery records for active customers on any selected date.
   - **Strictly Idempotent**: Uses stable document IDs (`delivery_{customerId}_{date}`) so opening the screen multiple times never generates duplicate records.
   - Date ribbon with previous/next day switching and one-tap "Go to Today" (Asia/Kolkata timezone standard).
   - Real-time daily summary: Total Milk Delivered, Total Daily Amount, Normal vs Holiday counts.

4. **Daily Delivery Quantity Editing**
   - Edit milk quantity for any date with quick presets: `0L`, `0.25L`, `0.5L`, `0.75L`, `1L`, `1.5L`, `2L`, `3L`, stepper (+/- 0.25L), or direct custom decimal input.
   - Live recalculation of delivery amount: `Actual Milk Quantity × Price Per Liter`.
   - Flags record as `manuallyEdited` and preserves customer default settings for future deliveries.

5. **Customer & Supplier Holiday Management**
   - **Customer Holidays**: Supports single dates or date ranges. Delivers `0L` and charges `₹0`. Safely restores normal defaults if canceled.
   - **Supplier Holidays**: Excludes entire date from billing across all customers (`0L` and `₹0`).
   - **Strict Priority Rule**: `Supplier Holiday` > `Customer Holiday` > `Normal Delivery`.

6. **Monthly Billing Generation & Ledger**
   - Idempotent generation (`bill_{customerId}_{year}_{month}`).
   - Accurately sums deliveries from the 1st to the last day of the selected month using actual saved delivery records.
   - Accounts for customer/supplier holiday counts.
   - Carries forward previous unpaid balance.
   - Automatic formula: `Remaining Balance = Previous Balance + Milk Amount - Payments Received`.
   - Recalculates dynamically when deliveries or payments are updated.

7. **Payment Management**
   - Record payments with amount, payment date, method (Cash, UPI, Other), and notes.
   - Supports partial payments, full payments, and multiple payments per month.
   - Automatically synchronizes customer monthly bill balance.

8. **Dairy Profile & Demo Seeder**
   - Edit Dairy Business Name and Contact Phone in Settings.
   - One-tap "Seed Sample Customers" button in Settings to immediately populate 4 sample customers (Rahul Sharma, Priya Patel, Amit Verma, Vikram Singh).

---

## 🛠 Technology Stack

- **Framework**: Expo (SDK 58) with React Native 0.88 & React 19
- **Navigation**: Expo Router (file-based routing)
- **Language**: TypeScript (strict typechecking)
- **UI Components**: React Native Paper (MD3 theme) & `@expo/vector-icons`
- **Backend / Database**: Cloud Firestore
- **Date / Timezone**: `Asia/Kolkata` (IST) with strict ISO `YYYY-MM-DD` formatting

---

## 📂 Project Structure

```text
├── src/
│   ├── app/                         # Expo Router screens
│   │   ├── _layout.tsx              # Root layout with PaperProvider
│   │   ├── index.tsx                # Direct redirect to /(tabs)/dashboard
│   │   ├── settings.tsx             # Dairy Profile, Config & Sample Data Seeder
│   │   ├── customer/
│   │   │   ├── add.tsx              # 4-field Customer Registration
│   │   │   └── [id].tsx             # Customer Detail & Edit
│   │   ├── billing/
│   │   │   └── [customerId].tsx     # Customer Monthly Statement Detail
│   │   └── (tabs)/
│   │       ├── _layout.tsx          # Bottom tab bar navigator
│   │       ├── dashboard.tsx        # Business metrics & overview
│   │       ├── delivery.tsx         # Daily Milk Delivery screen & date picker
│   │       ├── customers.tsx        # Customer Management & search
│   │       ├── billing.tsx          # Monthly Billing & generation
│   │       ├── payments.tsx         # Payment recording & collection
│   │       └── holidays.tsx         # Customer & Supplier Holiday leaves
│   ├── components/                  # Reusable UI components
│   │   ├── HeaderBar.tsx
│   │   ├── MetricCard.tsx
│   │   ├── DeliveryStatusBadge.tsx
│   │   ├── QuantityEditModal.tsx    # Modal for adjusting delivery liters
│   │   ├── LoadingIndicator.tsx
│   │   └── EmptyState.tsx
│   ├── constants/
│   │   ├── config.ts                # App configuration constants
│   │   └── theme.ts                 # BrandColors & Paper Theme
│   ├── services/                    # Clean Firebase service layer
│   │   ├── firebase.ts              # Firebase initialization (Firestore)
│   │   ├── customerService.ts       # Customer CRUD & duplicate validation
│   │   ├── deliveryService.ts       # Daily delivery generation & updates
│   │   ├── holidayService.ts        # Customer/Supplier holidays & priority
│   │   ├── billingService.ts        # Monthly bill generation & calculations
│   │   ├── paymentService.ts        # Payment recordings & balance sync
│   │   ├── dashboardService.ts      # Live dashboard aggregation queries
│   │   └── supplierService.ts       # Dairy supplier profile service
│   ├── types/
│   │   └── index.ts                 # Strict TypeScript domain interfaces
│   └── utils/
│       └── date.ts                  # Asia/Kolkata date calculations
├── firestore.rules                  # Production Firebase Security Rules
├── scripts/
│   └── verify-scenarios.ts          # Test suite verifying all 13 project scenarios
├── .env.example                     # Environment variables template
├── .env                             # Active environment configuration
└── package.json
```

---

## 🔒 Firestore Security Rules

See [`firestore.rules`](file:///c:/Users/Asus/OneDrive/Desktop/bill%20rahul/firestore.rules).
Key rules:
- Open access for direct supplier app operations without auth token restrictions.
- Strict data validation for milk quantity (`qty >= 0`), prices (`price > 0`), valid phone numbers (10+ digits), and payment amounts (`amount > 0`).

---

## 🧪 Testing Scenarios

Run the automated test suite verifying all 13 project scenarios:

```bash
npm test
```

---

## 🏃 Running the Application

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the Expo Dev Server**:
   ```bash
   npx expo start
   ```

3. **Run on Target Platforms**:
   - Web: Press `w` in terminal or run `npm run web`
   - Android: Press `a` in terminal or scan QR code with Expo Go
   - iOS: Press `i` in terminal or scan QR code with Expo Go
