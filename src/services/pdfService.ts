import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  Supplier,
  SupplierPurchase,
  Customer,
  Delivery,
  MonthlyBill,
  RangeAccountsHistory,
  CustomerRangeAccountsHistory,
} from '../types';
import { formatDisplayDate, getMonthName } from '../utils/date';

const baseStyles = `
  <style>
    * { box-sizing: border-box; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
    body { padding: 24px; color: #1e293b; background: #fff; margin: 0; }
    .header { border-bottom: 2px solid #1565c0; padding-bottom: 12px; margin-bottom: 18px; }
    .title { font-size: 22px; font-weight: bold; color: #1565c0; margin: 0; }
    .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; }
    .meta-col { flex: 1; }
    .meta-label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; }
    .meta-val { font-size: 14px; font-weight: 600; color: #0f172a; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 18px; font-size: 13px; }
    th { background: #1565c0; color: #fff; text-align: left; padding: 8px 10px; font-weight: 600; }
    td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) td { background: #f8fafc; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .summary-card { background: #f1f5f9; border-radius: 8px; padding: 14px; margin-top: 14px; }
    .summary-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 14px; }
    .summary-total { border-top: 2px solid #cbd5e1; padding-top: 8px; font-size: 16px; font-weight: bold; color: #1565c0; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    .badge-morning { background: #fef3c7; color: #d97706; }
    .badge-evening { background: #e0e7ff; color: #4338ca; }
    .page-break { page-break-after: always; }
  </style>
`;

/**
 * 1. Supplier Daily PDF
 */
export async function generateSupplierDailyPDF(
  supplier: Supplier,
  date: string,
  morningPurchase?: SupplierPurchase,
  eveningPurchase?: SupplierPurchase
): Promise<void> {
  const mQty = morningPurchase ? morningPurchase.quantityLiters : 0;
  const mRate = morningPurchase ? morningPurchase.pricePerLiter : 0;
  const mAmt = morningPurchase ? morningPurchase.totalAmount : 0;

  const eQty = eveningPurchase ? eveningPurchase.quantityLiters : 0;
  const eRate = eveningPurchase ? eveningPurchase.pricePerLiter : 0;
  const eAmt = eveningPurchase ? eveningPurchase.totalAmount : 0;

  const totalQty = Number((mQty + eQty).toFixed(2));
  const totalAmt = Number((mAmt + eAmt).toFixed(2));

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Supplier Daily Purchase - ${supplier.name}</title>
        ${baseStyles}
      </head>
      <body>
        <div class="header">
          <h1 class="title">Daily Milk Purchase Receipt</h1>
          <div class="subtitle">Supplier Purchase Record</div>
        </div>

        <div class="meta-box">
          <div class="meta-col">
            <div class="meta-label">Supplier Name</div>
            <div class="meta-val">${supplier.name}</div>
            <div class="meta-label" style="margin-top: 6px;">Phone</div>
            <div class="meta-val">${supplier.phone || '-'}</div>
          </div>
          <div class="meta-col text-right">
            <div class="meta-label">Purchase Date</div>
            <div class="meta-val">${formatDisplayDate(date)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Session</th>
              <th class="text-right">Quantity (Liters)</th>
              <th class="text-right">Rate / Liter</th>
              <th class="text-right">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="badge badge-morning">Morning</span></td>
              <td class="text-right">${mQty > 0 ? `${mQty} L` : '-'}</td>
              <td class="text-right">${mRate > 0 ? `₹${mRate}` : '-'}</td>
              <td class="text-right">${mAmt > 0 ? `₹${mAmt}` : '-'}</td>
            </tr>
            <tr>
              <td><span class="badge badge-evening">Evening</span></td>
              <td class="text-right">${eQty > 0 ? `${eQty} L` : '-'}</td>
              <td class="text-right">${eRate > 0 ? `₹${eRate}` : '-'}</td>
              <td class="text-right">${eAmt > 0 ? `₹${eAmt}` : '-'}</td>
            </tr>
          </tbody>
        </table>

        <div class="summary-card">
          <div class="summary-row">
            <span>Total Milk Purchased:</span>
            <strong>${totalQty} Liters</strong>
          </div>
          <div class="summary-row summary-total">
            <span>Total Purchase Amount:</span>
            <span>₹${totalAmt}</span>
          </div>
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  }
}

/**
 * 2. Supplier Monthly PDF
 */
export async function generateSupplierMonthlyPDF(
  supplier: Supplier,
  month: number,
  year: number,
  purchases: SupplierPurchase[]
): Promise<void> {
  const monthName = getMonthName(month);

  // Group purchases by date
  const dateMap = new Map<string, { morning?: SupplierPurchase; evening?: SupplierPurchase }>();
  for (const p of purchases) {
    const existing = dateMap.get(p.purchaseDate) || {};
    if (p.session === 'morning') existing.morning = p;
    else existing.evening = p;
    dateMap.set(p.purchaseDate, existing);
  }

  const sortedDates = Array.from(dateMap.keys()).sort();

  let monthlyTotalMilk = 0;
  let monthlyTotalAmt = 0;

  let rowsHtml = '';
  for (const dt of sortedDates) {
    const entry = dateMap.get(dt)!;
    const mQty = entry.morning ? entry.morning.quantityLiters : 0;
    const mRate = entry.morning ? entry.morning.pricePerLiter : 0;
    const mAmt = entry.morning ? entry.morning.totalAmount : 0;

    const eQty = entry.evening ? entry.evening.quantityLiters : 0;
    const eRate = entry.evening ? entry.evening.pricePerLiter : 0;
    const eAmt = entry.evening ? entry.evening.totalAmount : 0;

    const dayTotalQty = Number((mQty + eQty).toFixed(2));
    const dayTotalAmt = Number((mAmt + eAmt).toFixed(2));

    monthlyTotalMilk += dayTotalQty;
    monthlyTotalAmt += dayTotalAmt;

    rowsHtml += `
      <tr>
        <td>${formatDisplayDate(dt)}</td>
        <td class="text-right">${mQty > 0 ? `${mQty} L` : '-'}</td>
        <td class="text-right">${mRate > 0 ? `₹${mRate}` : '-'}</td>
        <td class="text-right">${mAmt > 0 ? `₹${mAmt}` : '-'}</td>
        <td class="text-right">${eQty > 0 ? `${eQty} L` : '-'}</td>
        <td class="text-right">${eRate > 0 ? `₹${eRate}` : '-'}</td>
        <td class="text-right">${eAmt > 0 ? `₹${eAmt}` : '-'}</td>
        <td class="text-right"><strong>${dayTotalQty} L</strong></td>
        <td class="text-right"><strong>₹${dayTotalAmt}</strong></td>
      </tr>
    `;
  }

  monthlyTotalMilk = Number(monthlyTotalMilk.toFixed(2));
  monthlyTotalAmt = Number(monthlyTotalAmt.toFixed(2));

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Supplier Monthly Purchase Report - ${supplier.name}</title>
        ${baseStyles}
      </head>
      <body>
        <div class="header">
          <h1 class="title">Monthly Milk Purchase Statement</h1>
          <div class="subtitle">${monthName} ${year}</div>
        </div>

        <div class="meta-box">
          <div class="meta-col">
            <div class="meta-label">Supplier Name</div>
            <div class="meta-val">${supplier.name}</div>
            <div class="meta-label" style="margin-top: 6px;">Phone</div>
            <div class="meta-val">${supplier.phone || '-'}</div>
          </div>
          <div class="meta-col text-right">
            <div class="meta-label">Billing Period</div>
            <div class="meta-val">${monthName} ${year}</div>
            <div class="meta-label" style="margin-top: 6px;">Total Purchase Entries</div>
            <div class="meta-val">${sortedDates.length} Days</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th class="text-right">M. Qty</th>
              <th class="text-right">M. Rate</th>
              <th class="text-right">M. Amt</th>
              <th class="text-right">E. Qty</th>
              <th class="text-right">E. Rate</th>
              <th class="text-right">E. Amt</th>
              <th class="text-right">Total Milk</th>
              <th class="text-right">Total Amt</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="9" class="text-center">No purchases recorded for this month.</td></tr>'}
          </tbody>
        </table>

        <div class="summary-card">
          <div class="summary-row">
            <span>Total Milk Purchased in ${monthName}:</span>
            <strong>${monthlyTotalMilk} Liters</strong>
          </div>
          <div class="summary-row summary-total">
            <span>Total Monthly Purchase Amount:</span>
            <span>₹${monthlyTotalAmt}</span>
          </div>
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  }
}

/**
 * 3. Individual Customer Monthly Bill PDF
 */
export async function generateCustomerMonthlyBillPDF(
  customer: Customer,
  month: number,
  year: number,
  deliveries: Delivery[],
  bill: MonthlyBill
): Promise<void> {
  const monthName = getMonthName(month);

  let rowsHtml = '';
  for (const d of deliveries) {
    rowsHtml += `
      <tr>
        <td>${formatDisplayDate(d.deliveryDate)}</td>
        <td class="text-right">${d.actualQuantity} L</td>
        <td class="text-right">₹${d.pricePerLiter}</td>
        <td class="text-right">₹${d.amount}</td>
        <td class="text-center">${d.status === 'delivered' ? 'Delivered' : d.status}</td>
      </tr>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Customer Bill - ${customer.name}</title>
        ${baseStyles}
      </head>
      <body>
        <div class="header">
          <h1 class="title">Monthly Milk Bill</h1>
          <div class="subtitle">${monthName} ${year} Statement</div>
        </div>

        <div class="meta-box">
          <div class="meta-col">
            <div class="meta-label">Customer Name</div>
            <div class="meta-val">${customer.name}</div>
            <div class="meta-label" style="margin-top: 6px;">Phone</div>
            <div class="meta-val">${customer.phone || '-'}</div>
          </div>
          <div class="meta-col text-right">
            <div class="meta-label">Billing Period</div>
            <div class="meta-val">${monthName} ${year}</div>
            <div class="meta-label" style="margin-top: 6px;">Rate / Liter</div>
            <div class="meta-val">₹${customer.pricePerLiter} / L</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th class="text-right">Delivered Quantity</th>
              <th class="text-right">Rate</th>
              <th class="text-right">Amount</th>
              <th class="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="5" class="text-center">No delivery records for this period.</td></tr>'}
          </tbody>
        </table>

        <div class="summary-card">
          <div class="summary-row">
            <span>Total Milk Delivered:</span>
            <strong>${bill.totalMilk} Liters</strong>
          </div>
          <div class="summary-row">
            <span>Current Month Milk Charges:</span>
            <strong>₹${bill.milkAmount}</strong>
          </div>
          <div class="summary-row">
            <span>Previous Outstanding Balance:</span>
            <strong>₹${bill.previousBalance}</strong>
          </div>
          <div class="summary-row">
            <span>Payments Received:</span>
            <strong style="color: #10b981;">₹${bill.paymentsReceived}</strong>
          </div>
          <div class="summary-row summary-total">
            <span>Remaining Balance Due:</span>
            <span style="color: ${bill.remainingBalance > 0 ? '#ef4444' : '#10b981'};">
              ₹${bill.remainingBalance}
            </span>
          </div>
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  }
}

/**
 * 4. Combined Monthly Report for All Customers
 */
export async function generateCombinedMonthlyAllCustomersPDF(
  month: number,
  year: number,
  data: { customer: Customer; bill: MonthlyBill; deliveries: Delivery[] }[]
): Promise<void> {
  const monthName = getMonthName(month);

  const totalCustomers = data.length;
  let totalMilk = 0;
  let totalMilkAmount = 0;
  let totalPaymentsReceived = 0;
  let totalOutstanding = 0;

  for (const item of data) {
    totalMilk += item.bill.totalMilk;
    totalMilkAmount += item.bill.milkAmount;
    totalPaymentsReceived += item.bill.paymentsReceived;
    if (item.bill.remainingBalance > 0) {
      totalOutstanding += item.bill.remainingBalance;
    }
  }

  totalMilk = Number(totalMilk.toFixed(2));
  totalMilkAmount = Number(totalMilkAmount.toFixed(2));
  totalPaymentsReceived = Number(totalPaymentsReceived.toFixed(2));
  totalOutstanding = Number(totalOutstanding.toFixed(2));

  // Build following pages for each customer
  let customerPagesHtml = '';
  data.forEach((item, index) => {
    let rows = '';
    item.deliveries.forEach((d) => {
      rows += `
        <tr>
          <td>${formatDisplayDate(d.deliveryDate)}</td>
          <td class="text-right">${d.actualQuantity} L</td>
          <td class="text-right">₹${d.pricePerLiter}</td>
          <td class="text-right">₹${d.amount}</td>
        </tr>
      `;
    });

    const isLast = index === data.length - 1;
    customerPagesHtml += `
      <div class="${isLast ? '' : 'page-break'}">
        <div class="header">
          <h2 class="title" style="font-size: 18px;">Customer Monthly Statement</h2>
          <div class="subtitle">${monthName} ${year} • Bill ${index + 1} of ${totalCustomers}</div>
        </div>

        <div class="meta-box">
          <div class="meta-col">
            <div class="meta-label">Customer Name</div>
            <div class="meta-val">${item.customer.name}</div>
            <div class="meta-label" style="margin-top: 4px;">Phone</div>
            <div class="meta-val">${item.customer.phone || '-'}</div>
          </div>
          <div class="meta-col text-right">
            <div class="meta-label">Billing Period</div>
            <div class="meta-val">${monthName} ${year}</div>
            <div class="meta-label" style="margin-top: 4px;">Default Daily Rate</div>
            <div class="meta-val">₹${item.customer.pricePerLiter}/L</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Delivery Date</th>
              <th class="text-right">Delivered Quantity</th>
              <th class="text-right">Rate</th>
              <th class="text-right">Daily Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="4" class="text-center">No deliveries this month.</td></tr>'}
          </tbody>
        </table>

        <div class="summary-card">
          <div class="summary-row">
            <span>Total Milk Delivered:</span>
            <strong>${item.bill.totalMilk} Liters</strong>
          </div>
          <div class="summary-row">
            <span>Total Milk Amount:</span>
            <strong>₹${item.bill.milkAmount}</strong>
          </div>
          <div class="summary-row">
            <span>Previous Balance:</span>
            <strong>₹${item.bill.previousBalance}</strong>
          </div>
          <div class="summary-row">
            <span>Payments Received:</span>
            <strong style="color: #10b981;">₹${item.bill.paymentsReceived}</strong>
          </div>
          <div class="summary-row summary-total">
            <span>Remaining Balance:</span>
            <span style="color: ${item.bill.remainingBalance > 0 ? '#ef4444' : '#10b981'};">
              ₹${item.bill.remainingBalance}
            </span>
          </div>
        </div>
      </div>
    `;
  });

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Combined Monthly Customer Report - ${monthName} ${year}</title>
        ${baseStyles}
      </head>
      <body>
        <!-- Page 1: Overview Summary -->
        <div class="page-break">
          <div class="header">
            <h1 class="title">Milk Billing Monthly Report</h1>
            <div class="subtitle">Complete Customer Distribution & Billing Summary</div>
          </div>

          <div class="meta-box">
            <div class="meta-col">
              <div class="meta-label">Billing Period</div>
              <div class="meta-val" style="font-size: 18px; color: #1565c0;">${monthName} ${year}</div>
            </div>
            <div class="meta-col text-right">
              <div class="meta-label">Total Active Customers</div>
              <div class="meta-val" style="font-size: 18px;">${totalCustomers}</div>
            </div>
          </div>

          <div class="summary-card" style="padding: 20px; margin-top: 24px;">
            <div style="font-size: 16px; font-weight: bold; margin-bottom: 14px; color: #1e293b;">
              Monthly Consolidated Statistics
            </div>
            <div class="summary-row" style="font-size: 15px; padding: 6px 0;">
              <span>Total Customers Billed:</span>
              <strong>${totalCustomers}</strong>
            </div>
            <div class="summary-row" style="font-size: 15px; padding: 6px 0;">
              <span>Total Milk Delivered:</span>
              <strong>${totalMilk} Liters</strong>
            </div>
            <div class="summary-row" style="font-size: 15px; padding: 6px 0;">
              <span>Total Milk Amount:</span>
              <strong>₹${totalMilkAmount}</strong>
            </div>
            <div class="summary-row" style="font-size: 15px; padding: 6px 0;">
              <span>Total Payments Received:</span>
              <strong style="color: #10b981;">₹${totalPaymentsReceived}</strong>
            </div>
            <div class="summary-row summary-total" style="font-size: 18px; padding-top: 14px;">
              <span>Total Outstanding Balance:</span>
              <span style="color: #ef4444;">₹${totalOutstanding}</span>
            </div>
          </div>

          <div style="margin-top: 40px; font-size: 12px; color: #94a3b8; text-align: center;">
            Individual customer statements follow on the next pages.
          </div>
        </div>

        <!-- Following Pages: Customer Individual Statements -->
        ${customerPagesHtml}
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  }
}

/**
 * 5. Supply & Sales History PDF (Daily, Monthly, Custom)
 */
export async function generateSupplyHistoryPDF(
  history: RangeAccountsHistory,
  reportType: 'daily' | 'monthly' | 'custom' = 'daily'
): Promise<void> {
  const typeTitle =
    reportType === 'daily'
      ? 'Daily Supply Purchase Report'
      : reportType === 'monthly'
      ? 'Monthly Supply Purchase Report'
      : 'Custom Period Supply Purchase Report';

  // Build supplier breakdown rows
  const supplierRowsHtml = history.suppliers
    .map(
      (s) => `
      <tr>
        <td><strong>${s.supplierName}</strong><br/><span style="font-size: 11px; color: #64748b;">${s.supplierPhone}</span></td>
        <td class="text-right">${s.totalPurchasedLiters} L</td>
        <td class="text-right">₹${s.totalPurchaseAmount.toLocaleString('en-IN')}</td>
        <td class="text-right">${s.sessions.reduce((acc, sess) => acc + sess.purchases.length, 0)} Sessions</td>
      </tr>
    `
    )
    .join('');

  // Build transaction rows
  const transactionRowsHtml = history.transactions
    .map((p) => {
      const sessionEmoji =
        p.session === 'evening' ? '🌇 Evening' : p.session === 'afternoon' ? '☀️ Afternoon' : '🌅 Morning';
      const catLabel = p.milkCategory === 'cow' ? '🐄 Cow' : '🐃 Buffalo';

      return `
      <tr>
        <td>${p.purchaseDate}<br/><span style="font-size: 11px; color: #64748b;">${sessionEmoji}</span></td>
        <td><strong>${p.supplierName}</strong></td>
        <td>${catLabel}</td>
        <td class="text-right">${p.quantityLiters} L</td>
        <td class="text-right">₹${p.pricePerLiter.toLocaleString('en-IN')}</td>
        <td class="text-right">₹${p.totalAmount.toLocaleString('en-IN')}</td>
      </tr>
    `;
    })
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${typeTitle} - ${history.periodLabel}</title>
        ${baseStyles}
        <style>
          .kpi-grid { display: flex; gap: 10px; margin-bottom: 18px; }
          .kpi-card { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; }
          .kpi-title { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: bold; margin-bottom: 4px; }
          .kpi-val { font-size: 16px; font-weight: bold; color: #1e293b; }
          .section-heading { font-size: 15px; font-weight: bold; color: #1565c0; margin: 18px 0 8px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">Milk Billing – Supply Purchase Report</h1>
          <div class="subtitle">${typeTitle} • <strong>${history.periodLabel}</strong></div>
        </div>

        <div class="meta-box">
          <div class="meta-col">
            <div class="meta-label">Report Period</div>
            <div class="meta-val">${history.periodLabel} (${history.startDate} to ${history.endDate})</div>
            <div class="meta-label" style="margin-top: 6px;">Total Transactions</div>
            <div class="meta-val">${history.transactions.length} Records</div>
          </div>
          <div class="meta-col text-right">
            <div class="meta-label">Generated On</div>
            <div class="meta-val">${formatDisplayDate(new Date().toISOString().split('T')[0])}</div>
            <div class="meta-label" style="margin-top: 6px;">Suppliers Included</div>
            <div class="meta-val">${history.suppliers.length} Registered Suppliers</div>
          </div>
        </div>

        <!-- High-Level Financial & Quantity KPI Grid -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-title">Total Purchased</div>
            <div class="kpi-val" style="color: #1565c0;">${history.totalPurchasedLiters} L</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">₹${history.totalPurchaseAmount.toLocaleString('en-IN')}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Total Records</div>
            <div class="kpi-val" style="color: #1565c0;">${history.transactions.length}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Purchases</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Buffalo Milk</div>
            <div class="kpi-val" style="color: #1e293b;">${history.buffaloPurchased} L</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">₹${history.buffaloPurchaseAmount.toLocaleString('en-IN')}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Cow Milk</div>
            <div class="kpi-val" style="color: #1e293b;">${history.cowPurchased} L</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">₹${history.cowPurchaseAmount.toLocaleString('en-IN')}</div>
          </div>
        </div>

        <!-- Milk Category Breakdown -->
        <div class="section-heading">1. Milk Category Breakdown</div>
        <table>
          <thead>
            <tr>
              <th>Milk Category</th>
              <th class="text-right">Purchased (L)</th>
              <th class="text-right">Purchase Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>🐃 Buffalo Milk</td>
              <td class="text-right">${history.buffaloPurchased} L</td>
              <td class="text-right">₹${history.buffaloPurchaseAmount.toLocaleString('en-IN')}</td>
            </tr>
            <tr>
              <td>🐄 Cow Milk</td>
              <td class="text-right">${history.cowPurchased} L</td>
              <td class="text-right">₹${history.cowPurchaseAmount.toLocaleString('en-IN')}</td>
            </tr>
          </tbody>
        </table>

        <!-- Supplier-wise Breakdown -->
        <div class="section-heading">2. Supplier-Wise Accounts Breakdown</div>
        <table>
          <thead>
            <tr>
              <th>Supplier</th>
              <th class="text-right">Purchased</th>
              <th class="text-right">Total Cost</th>
              <th class="text-right">Sessions</th>
            </tr>
          </thead>
          <tbody>
            ${supplierRowsHtml || '<tr><td colspan="4" class="text-center">No supplier records found.</td></tr>'}
          </tbody>
        </table>

        <!-- Detailed Transactions -->
        <div class="section-heading">3. Detailed Purchase Transactions (${history.transactions.length})</div>
        <table>
          <thead>
            <tr>
              <th>Date &amp; Session</th>
              <th>Supplier</th>
              <th>Category</th>
              <th class="text-right">Purchased</th>
              <th class="text-right">Rate</th>
              <th class="text-right">Total Amt</th>
            </tr>
          </thead>
          <tbody>
            ${transactionRowsHtml || '<tr><td colspan="6" class="text-center">No transactions found.</td></tr>'}
          </tbody>
        </table>

        <!-- Final Financial Summary Card -->
        <div class="summary-card">
          <div class="summary-row">
            <span>Total Milk Purchased:</span>
            <strong>${history.totalPurchasedLiters} Litres</strong>
          </div>
          <div class="summary-row summary-total">
            <span>Total Purchase Expenditure:</span>
            <strong>₹${history.totalPurchaseAmount.toLocaleString('en-IN')}</strong>
          </div>
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  }
}

/**
 * 6. Individual Customer Daily Bill PDF
 */
export async function generateCustomerDailyBillPDF(
  customer: Customer,
  date: string,
  delivery: Delivery,
  previousBalance: number = 0,
  paymentsReceived: number = 0
): Promise<void> {
  const sessionEmoji =
    customer.deliveryTime === 'evening'
      ? '🌇 Evening'
      : customer.deliveryTime === 'afternoon'
      ? '☀️ Afternoon'
      : '🌅 Morning';
  const categoryLabel = customer.milkCategory === 'cow' ? '🐄 Cow Milk' : '🐃 Buffalo Milk';

  const dailyAmount =
    delivery.amount !== undefined
      ? delivery.amount
      : Number((delivery.actualQuantity * (delivery.pricePerLiter || customer.pricePerLiter)).toFixed(2));
  const totalPayable = Number((previousBalance + dailyAmount - paymentsReceived).toFixed(2));

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Daily Customer Bill - ${customer.name} - ${formatDisplayDate(date)}</title>
        ${baseStyles}
      </head>
      <body>
        <div class="header">
          <h1 class="title">Milk Billing – Daily Customer Bill</h1>
          <div class="subtitle">Daily Milk Delivery Statement &amp; Receipt</div>
        </div>

        <div class="meta-box">
          <div class="meta-col">
            <div class="meta-label">Customer Name</div>
            <div class="meta-val">${customer.name}</div>
            <div class="meta-label" style="margin-top: 6px;">Phone Number</div>
            <div class="meta-val">${customer.phone || '-'}</div>
            ${customer.location ? `<div class="meta-label" style="margin-top: 6px;">Location / Address</div><div class="meta-val">${customer.location}</div>` : ''}
          </div>
          <div class="meta-col text-right">
            <div class="meta-label">Delivery Date</div>
            <div class="meta-val" style="color: #1565c0;">${formatDisplayDate(date)}</div>
            <div class="meta-label" style="margin-top: 6px;">Delivery Session</div>
            <div class="meta-val">${sessionEmoji}</div>
            <div class="meta-label" style="margin-top: 6px;">Milk Category</div>
            <div class="meta-val">${categoryLabel}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Delivery Date</th>
              <th>Milk Category</th>
              <th>Session</th>
              <th class="text-right">Delivered Quantity</th>
              <th class="text-right">Rate</th>
              <th class="text-right">Daily Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${formatDisplayDate(date)}</td>
              <td>${categoryLabel}</td>
              <td>${sessionEmoji}</td>
              <td class="text-right">${delivery.actualQuantity} Litres</td>
              <td class="text-right">₹${delivery.pricePerLiter || customer.pricePerLiter}/L</td>
              <td class="text-right" style="font-weight: 700; color: #1565c0;">₹${dailyAmount}</td>
            </tr>
          </tbody>
        </table>

        <div class="summary-card">
          <div class="summary-row">
            <span>Delivered Milk Quantity:</span>
            <strong>${delivery.actualQuantity} Litres</strong>
          </div>
          <div class="summary-row">
            <span>Rate per Litre:</span>
            <strong>₹${delivery.pricePerLiter || customer.pricePerLiter} / Litre</strong>
          </div>
          <div class="summary-row">
            <span>Today's Delivery Charge:</span>
            <strong style="color: #1565c0;">₹${dailyAmount}</strong>
          </div>
          ${previousBalance > 0 ? `
          <div class="summary-row">
            <span>Previous Outstanding Balance:</span>
            <strong>₹${previousBalance}</strong>
          </div>` : ''}
          ${paymentsReceived > 0 ? `
          <div class="summary-row">
            <span>Payment Received:</span>
            <strong style="color: #16a34a;">₹${paymentsReceived}</strong>
          </div>` : ''}
          <div class="summary-row summary-total">
            <span>Total Payable Amount:</span>
            <span style="color: #1565c0;">₹${totalPayable}</span>
          </div>
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  }
}

/**
 * 7. Customer Delivery History PDF (Daily, Monthly, Custom)
 */
export async function generateCustomerHistoryPDF(
  history: CustomerRangeAccountsHistory,
  reportType: 'daily' | 'monthly' | 'custom' = 'daily'
): Promise<void> {
  const typeTitle =
    reportType === 'daily'
      ? 'Daily Customer Delivery Report'
      : reportType === 'monthly'
      ? 'Monthly Customer Delivery Report'
      : 'Custom Period Customer Delivery Report';

  // Customer breakdown rows
  const customerRowsHtml = history.customerSummaries
    .map(
      (c) => `
      <tr>
        <td><strong>${c.customerName}</strong><br/><span style="font-size: 11px; color: #64748b;">${c.customerPhone}${c.customerLocation ? ` • ${c.customerLocation}` : ''}</span></td>
        <td>${c.milkCategory === 'cow' ? '🐄 Cow' : '🐃 Buffalo'}</td>
        <td>${c.deliveryTime === 'evening' ? '🌇 Evening' : c.deliveryTime === 'afternoon' ? '☀️ Afternoon' : '🌅 Morning'}</td>
        <td class="text-right">₹${c.pricePerLiter}/L</td>
        <td class="text-right" style="font-weight: 700;">${c.totalMilkDelivered} L</td>
        <td class="text-right" style="color: #1565c0; font-weight: 700;">₹${c.totalAmount.toLocaleString('en-IN')}</td>
        <td class="text-center">${c.deliveryCount} day(s)</td>
        <td class="text-center"><span class="badge ${c.paymentStatus === 'paid' ? 'badge-morning' : 'badge-evening'}">${c.paymentStatus === 'paid' ? 'Paid' : 'Pending'}</span></td>
      </tr>
    `
    )
    .join('');

  // Detailed transactions rows
  const deliveryRowsHtml = history.allDeliveries
    .map((d) => {
      const sessionEmoji =
        d.deliveryTime === 'evening' ? '🌇 Evening' : d.deliveryTime === 'afternoon' ? '☀️ Afternoon' : '🌅 Morning';
      const catLabel = d.milkCategory === 'cow' ? '🐄 Cow' : '🐃 Buffalo';
      const isDelivered = d.status === 'delivered';

      return `
      <tr>
        <td>${d.deliveryDate}</td>
        <td><strong>${d.customerName}</strong><br/><span style="font-size: 10px; color: #64748b;">${d.customerPhone}</span></td>
        <td>${catLabel}</td>
        <td>${sessionEmoji}</td>
        <td class="text-right">${d.actualQuantity} L</td>
        <td class="text-right">₹${d.pricePerLiter}/L</td>
        <td class="text-right" style="color: #1565c0; font-weight: 600;">₹${d.amount.toLocaleString('en-IN')}</td>
        <td class="text-center"><span class="badge ${isDelivered ? 'badge-morning' : 'badge-evening'}">${isDelivered ? 'Delivered' : d.status}</span></td>
        <td class="text-center"><span class="badge ${d.paymentStatus === 'paid' ? 'badge-morning' : 'badge-evening'}">${d.paymentStatus === 'paid' ? 'Paid' : 'Pending'}</span></td>
      </tr>
    `;
    })
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${typeTitle} - ${history.periodLabel}</title>
        ${baseStyles}
        <style>
          .kpi-grid { display: flex; gap: 10px; margin-bottom: 18px; }
          .kpi-card { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; }
          .kpi-title { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: bold; margin-bottom: 4px; }
          .kpi-val { font-size: 16px; font-weight: bold; color: #1e293b; }
          .section-heading { font-size: 15px; font-weight: bold; color: #1565c0; margin: 18px 0 8px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">Milk Billing – Customer Delivery Report</h1>
          <div class="subtitle">${typeTitle} • <strong>${history.periodLabel}</strong></div>
        </div>

        <div class="meta-box">
          <div class="meta-col">
            <div class="meta-label">Report Period</div>
            <div class="meta-val">${history.periodLabel} (${history.startDate} to ${history.endDate})</div>
            <div class="meta-label" style="margin-top: 6px;">Total Deliveries Recorded</div>
            <div class="meta-val">${history.allDeliveries.length} Records</div>
          </div>
          <div class="meta-col text-right">
            <div class="meta-label">Generated On</div>
            <div class="meta-val">${formatDisplayDate(new Date().toISOString().split('T')[0])}</div>
            <div class="meta-label" style="margin-top: 6px;">Active Customers Billed</div>
            <div class="meta-val">${history.totalCustomers} Customers</div>
          </div>
        </div>

        <!-- High-Level KPI Grid -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-title">Total Milk Delivered</div>
            <div class="kpi-val" style="color: #1565c0;">${history.totalMilkDelivered} L</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">All Active Customers</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Total Delivery Amount</div>
            <div class="kpi-val" style="color: #16a34a;">₹${history.totalAmount.toLocaleString('en-IN')}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Total Billing Amount</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Buffalo Milk</div>
            <div class="kpi-val" style="color: #1e293b;">${history.buffaloDelivered} L</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">₹${history.buffaloAmount.toLocaleString('en-IN')}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Cow Milk</div>
            <div class="kpi-val" style="color: #1e293b;">${history.cowDelivered} L</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">₹${history.cowAmount.toLocaleString('en-IN')}</div>
          </div>
        </div>

        <!-- Section 1: Category Breakdown -->
        <div class="section-heading">1. Milk Category Breakdown</div>
        <table>
          <thead>
            <tr>
              <th>Milk Category</th>
              <th class="text-right">Delivered Quantity (L)</th>
              <th class="text-right">Total Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>🐃 Buffalo Milk</td>
              <td class="text-right"><strong>${history.buffaloDelivered} L</strong></td>
              <td class="text-right" style="color: #1565c0; font-weight: 600;">₹${history.buffaloAmount.toLocaleString('en-IN')}</td>
            </tr>
            <tr>
              <td>🐄 Cow Milk</td>
              <td class="text-right"><strong>${history.cowDelivered} L</strong></td>
              <td class="text-right" style="color: #1565c0; font-weight: 600;">₹${history.cowAmount.toLocaleString('en-IN')}</td>
            </tr>
          </tbody>
        </table>

        <!-- Section 2: Customer-wise Breakdown -->
        <div class="section-heading">2. Customer-Wise Delivery Summary (${history.customerSummaries.length})</div>
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Category</th>
              <th>Session</th>
              <th class="text-right">Rate</th>
              <th class="text-right">Delivered</th>
              <th class="text-right">Total Amount</th>
              <th class="text-center">Days</th>
              <th class="text-center">Payment</th>
            </tr>
          </thead>
          <tbody>
            ${customerRowsHtml || '<tr><td colspan="8" class="text-center">No customer records found.</td></tr>'}
          </tbody>
        </table>

        <!-- Section 3: Detailed Deliveries -->
        <div class="section-heading">3. Detailed Customer Deliveries (${history.allDeliveries.length})</div>
        <table>
          <thead>
            <tr>
              <th>Delivery Date</th>
              <th>Customer</th>
              <th>Category</th>
              <th>Session</th>
              <th class="text-right">Quantity</th>
              <th class="text-right">Rate</th>
              <th class="text-right">Amount</th>
              <th class="text-center">Status</th>
              <th class="text-center">Payment</th>
            </tr>
          </thead>
          <tbody>
            ${deliveryRowsHtml || '<tr><td colspan="9" class="text-center">No deliveries found.</td></tr>'}
          </tbody>
        </table>

        <!-- Final Financial Summary Card -->
        <div class="summary-card">
          <div class="summary-row">
            <span>Total Milk Delivered:</span>
            <strong>${history.totalMilkDelivered} Litres</strong>
          </div>
          <div class="summary-row">
            <span>Total Customers:</span>
            <strong>${history.totalCustomers} Customers</strong>
          </div>
          <div class="summary-row">
            <span>Buffalo Milk Delivered:</span>
            <strong>${history.buffaloDelivered} Litres (₹${history.buffaloAmount.toLocaleString('en-IN')})</strong>
          </div>
          <div class="summary-row">
            <span>Cow Milk Delivered:</span>
            <strong>${history.cowDelivered} Litres (₹${history.cowAmount.toLocaleString('en-IN')})</strong>
          </div>
          <div class="summary-row summary-total">
            <span>Total Deliveries Revenue / Amount:</span>
            <span style="color: #1565c0;">₹${history.totalAmount.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  }
}
