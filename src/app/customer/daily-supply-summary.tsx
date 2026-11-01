import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Card,
  Divider,
  IconButton,
  Chip,
} from 'react-native-paper';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { getAllPurchasesForDate } from '../../services/milkTradeService';
import { initializeDailyDeliveries, isSupplierHoliday } from '../../services/deliveryService';
import { getCustomers } from '../../services/customerService';
import { MilkPurchase, Delivery, Customer } from '../../types';
import { BrandColors } from '../../constants/theme';
import { HeaderBar } from '../../components/HeaderBar';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { CalendarDatePickerModal } from '../../components/CalendarDatePickerModal';
import {
  getTodayKolkata,
  formatDisplayDate,
  addDays,
} from '../../utils/date';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function DailySupplySummaryScreen() {
  const params = useLocalSearchParams<{ date?: string }>();

  // Date selection state
  const [selectedDate, setSelectedDate] = useState<string>(
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : getTodayKolkata()
  );
  const [calendarPickerVisible, setCalendarPickerVisible] = useState(false);

  // Data states
  const [purchases, setPurchases] = useState<MilkPurchase[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [supplierHolidayActive, setSupplierHolidayActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Toggle detail visibility
  const [showSupplyList, setShowSupplyList] = useState(false);
  const [showSalesList, setShowSalesList] = useState(false);

  const loadData = useCallback(async (targetDate: string) => {
    try {
      const [purList, delList, custList, supHoliday] = await Promise.all([
        getAllPurchasesForDate(targetDate),
        initializeDailyDeliveries(targetDate),
        getCustomers(),
        isSupplierHoliday(targetDate),
      ]);

      setPurchases(purList);
      setDeliveries(delList);
      setCustomers(custList);
      setSupplierHolidayActive(supHoliday);
    } catch (err: any) {
      console.warn('Error loading daily supply summary:', err?.message || err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData(selectedDate);
    }, [selectedDate, loadData])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadData(selectedDate);
  };

  const handleDateChange = (delta: number) => {
    const next = addDays(selectedDate, delta);
    setSelectedDate(next);
    setLoading(true);
  };

  const handleSelectCalendarDate = (newDate: string) => {
    setCalendarPickerVisible(false);
    setSelectedDate(newDate);
    setLoading(true);
  };

  // ---------------------------------------------------------
  // SECTION A: TOTAL DAILY SUPPLY CALCULATIONS
  // ---------------------------------------------------------
  const supplyMetrics = useMemo(() => {
    let cowLitres = 0;
    let buffaloLitres = 0;
    let totalPurchaseCost = 0;

    purchases.forEach((p) => {
      const qty = Number(p.quantityLiters) || 0;
      const amt = Number(p.totalAmount) || (qty * (Number(p.pricePerLiter) || 0));
      if (p.milkCategory === 'cow') {
        cowLitres += qty;
      } else {
        buffaloLitres += qty;
      }
      totalPurchaseCost += amt;
    });

    const overallSupplied = cowLitres + buffaloLitres;

    // Unique suppliers count
    const uniqueSuppliers = new Set(purchases.map((p) => p.supplierId || p.supplierName));

    return {
      cowLitres: Number(cowLitres.toFixed(2)),
      buffaloLitres: Number(buffaloLitres.toFixed(2)),
      overallSupplied: Number(overallSupplied.toFixed(2)),
      totalPurchaseCost: Number(totalPurchaseCost.toFixed(2)),
      purchaseCount: purchases.length,
      supplierCount: uniqueSuppliers.size,
    };
  }, [purchases]);

  // ---------------------------------------------------------
  // SECTION B: TOTAL DAILY CUSTOMER SALES CALCULATIONS
  // ---------------------------------------------------------
  const salesMetrics = useMemo(() => {
    let cowLitres = 0;
    let buffaloLitres = 0;
    let totalCustomerSalesAmount = 0;
    let deliveredCustomerCount = 0;

    // Create quick lookup map for customer category
    const custMap = new Map<string, Customer>();
    customers.forEach((c) => custMap.set(c.id, c));

    deliveries.forEach((del) => {
      // Exclude holiday records
      if (del.status === 'customer_holiday' || del.status === 'supplier_holiday' || supplierHolidayActive) {
        return;
      }

      const qty = Number(del.actualQuantity) || 0;
      if (qty <= 0) return;

      const amt = Number(del.amount) || (qty * (Number(del.pricePerLiter) || 0));
      const cust = custMap.get(del.customerId);
      const category = cust?.milkCategory || 'buffalo';

      if (category === 'cow') {
        cowLitres += qty;
      } else {
        buffaloLitres += qty;
      }

      totalCustomerSalesAmount += amt;
      deliveredCustomerCount += 1;
    });

    const overallSold = cowLitres + buffaloLitres;

    return {
      cowLitres: Number(cowLitres.toFixed(2)),
      buffaloLitres: Number(buffaloLitres.toFixed(2)),
      overallSold: Number(overallSold.toFixed(2)),
      totalCustomerSalesAmount: Number(totalCustomerSalesAmount.toFixed(2)),
      deliveredCustomerCount,
    };
  }, [deliveries, customers, supplierHolidayActive]);

  // ---------------------------------------------------------
  // SECTION C: AUTOMATIC STOCK DIFFERENCE CALCULATIONS
  // ---------------------------------------------------------
  const stockMetrics = useMemo(() => {
    const remainingCow = Number((supplyMetrics.cowLitres - salesMetrics.cowLitres).toFixed(2));
    const remainingBuffalo = Number((supplyMetrics.buffaloLitres - salesMetrics.buffaloLitres).toFixed(2));
    const overallRemaining = Number((supplyMetrics.overallSupplied - salesMetrics.overallSold).toFixed(2));

    let statusType: 'surplus' | 'balanced' | 'deficit' = 'balanced';
    if (overallRemaining > 0) {
      statusType = 'surplus';
    } else if (overallRemaining < 0) {
      statusType = 'deficit';
    }

    return {
      remainingCow,
      remainingBuffalo,
      overallRemaining,
      statusType,
    };
  }, [supplyMetrics, salesMetrics]);

  // ---------------------------------------------------------
  // SECTION D: PROFIT & LOSS CALCULATIONS
  // ---------------------------------------------------------
  const financialMetrics = useMemo(() => {
    const purchaseCost = supplyMetrics.totalPurchaseCost;
    const salesRevenue = salesMetrics.totalCustomerSalesAmount;
    const net = Number((salesRevenue - purchaseCost).toFixed(2));

    let outcome: 'profit' | 'loss' | 'breakeven' = 'breakeven';
    if (net > 0) {
      outcome = 'profit';
    } else if (net < 0) {
      outcome = 'loss';
    }

    return {
      purchaseCost,
      salesRevenue,
      net,
      outcome,
    };
  }, [supplyMetrics, salesMetrics]);

  const isToday = selectedDate === getTodayKolkata();

  return (
    <View style={styles.container}>
      <HeaderBar
        title="Daily Supply Summary"
        subtitle="Daily Comparison • Stock & P/L"
        showBack
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[BrandColors.primary]}
          />
        }
      >
        {/* ========================================================= */}
        {/* INTERACTIVE DATE SELECTOR                                */}
        {/* ========================================================= */}
        <Card style={styles.dateSelectorCard}>
          <Card.Content style={styles.dateSelectorRow}>
            <IconButton
              icon="chevron-left"
              size={24}
              onPress={() => handleDateChange(-1)}
              iconColor={BrandColors.primaryDark}
            />

            <TouchableOpacity
              style={styles.dateCenter}
              onPress={() => setCalendarPickerVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.dateSelectorLabel}>Summary Date</Text>
              <View style={styles.dateDisplayRow}>
                <MaterialCommunityIcons
                  name="calendar-month"
                  size={18}
                  color={BrandColors.primaryDark}
                />
                <Text style={styles.dateValue}>{formatDisplayDate(selectedDate)}</Text>
              </View>
              <Text style={styles.dateTapHint}>Tap to choose date 📅</Text>
            </TouchableOpacity>

            <IconButton
              icon="chevron-right"
              size={24}
              onPress={() => handleDateChange(1)}
              iconColor={BrandColors.primaryDark}
            />
          </Card.Content>

          {!isToday && (
            <View style={styles.todayChipRow}>
              <Chip
                compact
                icon="calendar-today"
                onPress={() => {
                  setSelectedDate(getTodayKolkata());
                  setLoading(true);
                }}
                style={styles.todayChip}
                textStyle={styles.todayChipText}
              >
                Jump to Today
              </Chip>
            </View>
          )}
        </Card>

        {loading ? (
          <LoadingIndicator message="Loading daily summary..." />
        ) : (
          <>
            {/* ========================================================= */}
            {/* SECTION A: TOTAL DAILY SUPPLY                             */}
            {/* ========================================================= */}
            <Card style={styles.sectionCard}>
              <View style={[styles.sectionHeader, { borderLeftColor: '#2563EB' }]}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={[styles.sectionIconBadge, { backgroundColor: '#EFF6FF' }]}>
                    <MaterialCommunityIcons name="truck-delivery" size={20} color="#2563EB" />
                  </View>
                  <View>
                    <Text style={styles.sectionTitle}>A. Total Daily Supply</Text>
                    <Text style={styles.sectionSubtitle}>
                      {supplyMetrics.supplierCount} Suppliers • {supplyMetrics.purchaseCount} Purchases
                    </Text>
                  </View>
                </View>
              </View>

              <Card.Content style={styles.cardContent}>
                {/* Big Key Stats */}
                <View style={styles.twoColumnGrid}>
                  <View style={[styles.statBox, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}>
                    <Text style={styles.statBoxLabel}>Total Supplied Milk</Text>
                    <Text style={[styles.statBoxValue, { color: '#0369A1' }]}>
                      {supplyMetrics.overallSupplied}{' '}
                      <Text style={styles.statBoxUnit}>Litres</Text>
                    </Text>
                  </View>

                  <View style={[styles.statBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                    <Text style={styles.statBoxLabel}>Total Purchase Cost</Text>
                    <Text style={[styles.statBoxValue, { color: '#B91C1C' }]}>
                      ₹{supplyMetrics.totalPurchaseCost.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>

                {/* Category Breakdown */}
                <View style={styles.breakdownBox}>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>🐄 Cow Milk Supplied</Text>
                    <Text style={styles.breakdownValue}>{supplyMetrics.cowLitres} L</Text>
                  </View>
                  <Divider style={styles.subDivider} />
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>🐃 Buffalo Milk Supplied</Text>
                    <Text style={styles.breakdownValue}>{supplyMetrics.buffaloLitres} L</Text>
                  </View>
                </View>

                {/* Collapsible Purchase List */}
                {purchases.length > 0 && (
                  <TouchableOpacity
                    style={styles.expandToggle}
                    onPress={() => setShowSupplyList(!showSupplyList)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.expandToggleText}>
                      {showSupplyList ? 'Hide Supplier Entries' : `View ${purchases.length} Purchase Entries`}
                    </Text>
                    <MaterialCommunityIcons
                      name={showSupplyList ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={BrandColors.primary}
                    />
                  </TouchableOpacity>
                )}

                {showSupplyList && (
                  <View style={styles.entriesList}>
                    {purchases.map((p, idx) => (
                      <View key={p.id || idx} style={styles.entryRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.entryName}>{p.supplierName || 'Unknown Supplier'}</Text>
                          <Text style={styles.entrySub}>
                            {p.milkCategory === 'cow' ? '🐄 Cow' : '🐃 Buffalo'} • ₹{p.pricePerLiter}/L • {p.session}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.entryQty}>{p.quantityLiters} L</Text>
                          <Text style={styles.entryAmt}>₹{p.totalAmount}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </Card.Content>
            </Card>

            {/* ========================================================= */}
            {/* SECTION B: TOTAL DAILY CUSTOMER SALES                     */}
            {/* ========================================================= */}
            <Card style={styles.sectionCard}>
              <View style={[styles.sectionHeader, { borderLeftColor: '#059669' }]}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={[styles.sectionIconBadge, { backgroundColor: '#ECFDF5' }]}>
                    <MaterialCommunityIcons name="account-group" size={20} color="#059669" />
                  </View>
                  <View>
                    <Text style={styles.sectionTitle}>B. Total Daily Customer Sales</Text>
                    <Text style={styles.sectionSubtitle}>
                      {salesMetrics.deliveredCustomerCount} Customers Delivered
                    </Text>
                  </View>
                </View>
              </View>

              <Card.Content style={styles.cardContent}>
                {/* Big Key Stats */}
                <View style={styles.twoColumnGrid}>
                  <View style={[styles.statBox, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                    <Text style={styles.statBoxLabel}>Total Delivered Milk</Text>
                    <Text style={[styles.statBoxValue, { color: '#047857' }]}>
                      {salesMetrics.overallSold}{' '}
                      <Text style={styles.statBoxUnit}>Litres</Text>
                    </Text>
                  </View>

                  <View style={[styles.statBox, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                    <Text style={styles.statBoxLabel}>Total Sales Revenue</Text>
                    <Text style={[styles.statBoxValue, { color: '#15803D' }]}>
                      ₹{salesMetrics.totalCustomerSalesAmount.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>

                {/* Category Breakdown */}
                <View style={styles.breakdownBox}>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>🐄 Cow Milk Delivered</Text>
                    <Text style={styles.breakdownValue}>{salesMetrics.cowLitres} L</Text>
                  </View>
                  <Divider style={styles.subDivider} />
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>🐃 Buffalo Milk Delivered</Text>
                    <Text style={styles.breakdownValue}>{salesMetrics.buffaloLitres} L</Text>
                  </View>
                </View>

                {/* Collapsible Delivery List */}
                {deliveries.filter((d) => d.actualQuantity > 0).length > 0 && (
                  <TouchableOpacity
                    style={styles.expandToggle}
                    onPress={() => setShowSalesList(!showSalesList)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.expandToggleText}>
                      {showSalesList ? 'Hide Customer Deliveries' : `View Deliveries`}
                    </Text>
                    <MaterialCommunityIcons
                      name={showSalesList ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={BrandColors.primary}
                    />
                  </TouchableOpacity>
                )}

                {showSalesList && (
                  <View style={styles.entriesList}>
                    {deliveries
                      .filter((d) => d.actualQuantity > 0)
                      .map((d, idx) => (
                        <View key={d.id || idx} style={styles.entryRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.entryName}>{d.customerName || 'Customer'}</Text>
                            <Text style={styles.entrySub}>
                              Rate: ₹{d.pricePerLiter}/L
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.entryQty}>{d.actualQuantity} L</Text>
                            <Text style={styles.entryAmt}>₹{d.amount}</Text>
                          </View>
                        </View>
                      ))}
                  </View>
                )}
              </Card.Content>
            </Card>

            {/* ========================================================= */}
            {/* SECTION C: AUTOMATIC STOCK DIFFERENCE                     */}
            {/* ========================================================= */}
            <Card style={styles.sectionCard}>
              <View style={[styles.sectionHeader, { borderLeftColor: '#8B5CF6' }]}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={[styles.sectionIconBadge, { backgroundColor: '#F5F3FF' }]}>
                    <MaterialCommunityIcons name="scale-balance" size={20} color="#8B5CF6" />
                  </View>
                  <View>
                    <Text style={styles.sectionTitle}>C. Automatic Stock Difference</Text>
                    <Text style={styles.sectionSubtitle}>
                      Remaining = Total Supplied - Total Sold
                    </Text>
                  </View>
                </View>
              </View>

              <Card.Content style={styles.cardContent}>
                {/* Status Indicator Banner */}
                <View
                  style={[
                    styles.stockStatusBanner,
                    stockMetrics.statusType === 'surplus' && styles.bannerSurplus,
                    stockMetrics.statusType === 'balanced' && styles.bannerBalanced,
                    stockMetrics.statusType === 'deficit' && styles.bannerDeficit,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={
                      stockMetrics.statusType === 'surplus'
                        ? 'check-circle'
                        : stockMetrics.statusType === 'balanced'
                        ? 'equal-box'
                        : 'alert-circle'
                    }
                    size={22}
                    color={
                      stockMetrics.statusType === 'surplus'
                        ? '#059669'
                        : stockMetrics.statusType === 'balanced'
                        ? '#2563EB'
                        : '#DC2626'
                    }
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.stockStatusTitle,
                        stockMetrics.statusType === 'surplus' && { color: '#065F46' },
                        stockMetrics.statusType === 'balanced' && { color: '#1E40AF' },
                        stockMetrics.statusType === 'deficit' && { color: '#991B1B' },
                      ]}
                    >
                      {stockMetrics.statusType === 'surplus' && `Surplus: +${stockMetrics.overallRemaining} L Remaining`}
                      {stockMetrics.statusType === 'balanced' && 'Balanced: 0 L (Exact Match)'}
                      {stockMetrics.statusType === 'deficit' && `Deficit: ${stockMetrics.overallRemaining} L Shortage`}
                    </Text>
                    <Text style={styles.stockStatusSub}>
                      {stockMetrics.statusType === 'surplus' && 'You have unsold milk in stock for this date.'}
                      {stockMetrics.statusType === 'balanced' && 'All supplied milk was distributed to customers.'}
                      {stockMetrics.statusType === 'deficit' && 'Customer deliveries exceeded supplied milk.'}
                    </Text>
                  </View>
                </View>

                {/* Stock Table Comparison */}
                <View style={styles.stockTable}>
                  <View style={styles.stockTableHeader}>
                    <Text style={[styles.stockColHeader, { flex: 1.2 }]}>Category</Text>
                    <Text style={styles.stockColHeader}>Supplied</Text>
                    <Text style={styles.stockColHeader}>Delivered</Text>
                    <Text style={[styles.stockColHeader, { textAlign: 'right' }]}>Stock Diff</Text>
                  </View>
                  <Divider />

                  {/* Cow Row */}
                  <View style={styles.stockTableRow}>
                    <Text style={[styles.stockRowLabel, { flex: 1.2 }]}>🐄 Cow Milk</Text>
                    <Text style={styles.stockRowVal}>{supplyMetrics.cowLitres} L</Text>
                    <Text style={styles.stockRowVal}>{salesMetrics.cowLitres} L</Text>
                    <Text
                      style={[
                        styles.stockRowDiff,
                        stockMetrics.remainingCow >= 0 ? styles.diffPositive : styles.diffNegative,
                      ]}
                    >
                      {stockMetrics.remainingCow >= 0 ? `+${stockMetrics.remainingCow}` : stockMetrics.remainingCow} L
                    </Text>
                  </View>
                  <Divider style={styles.subDivider} />

                  {/* Buffalo Row */}
                  <View style={styles.stockTableRow}>
                    <Text style={[styles.stockRowLabel, { flex: 1.2 }]}>🐃 Buffalo Milk</Text>
                    <Text style={styles.stockRowVal}>{supplyMetrics.buffaloLitres} L</Text>
                    <Text style={styles.stockRowVal}>{salesMetrics.buffaloLitres} L</Text>
                    <Text
                      style={[
                        styles.stockRowDiff,
                        stockMetrics.remainingBuffalo >= 0 ? styles.diffPositive : styles.diffNegative,
                      ]}
                    >
                      {stockMetrics.remainingBuffalo >= 0 ? `+${stockMetrics.remainingBuffalo}` : stockMetrics.remainingBuffalo} L
                    </Text>
                  </View>
                  <Divider style={styles.subDivider} />

                  {/* Overall Row */}
                  <View style={[styles.stockTableRow, styles.stockRowTotal]}>
                    <Text style={[styles.stockRowLabelBold, { flex: 1.2 }]}>Overall Total</Text>
                    <Text style={styles.stockRowValBold}>{supplyMetrics.overallSupplied} L</Text>
                    <Text style={styles.stockRowValBold}>{salesMetrics.overallSold} L</Text>
                    <Text
                      style={[
                        styles.stockRowDiffBold,
                        stockMetrics.overallRemaining >= 0 ? styles.diffPositive : styles.diffNegative,
                      ]}
                    >
                      {stockMetrics.overallRemaining >= 0 ? `+${stockMetrics.overallRemaining}` : stockMetrics.overallRemaining} L
                    </Text>
                  </View>
                </View>
              </Card.Content>
            </Card>

            {/* ========================================================= */}
            {/* SECTION D: PROFIT & LOSS CALCULATION                      */}
            {/* ========================================================= */}
            <Card style={styles.sectionCard}>
              <View style={[styles.sectionHeader, { borderLeftColor: '#D97706' }]}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={[styles.sectionIconBadge, { backgroundColor: '#FFFBEB' }]}>
                    <MaterialCommunityIcons name="currency-inr" size={20} color="#D97706" />
                  </View>
                  <View>
                    <Text style={styles.sectionTitle}>D. Profit &amp; Loss Calculation</Text>
                    <Text style={styles.sectionSubtitle}>
                      Net = Customer Sales (₹) - Supply Cost (₹)
                    </Text>
                  </View>
                </View>
              </View>

              <Card.Content style={styles.cardContent}>
                {/* Financial Overview Row */}
                <View style={styles.financialRow}>
                  <View style={styles.financialCol}>
                    <Text style={styles.financialColLabel}>Total Purchase Cost</Text>
                    <Text style={styles.financialCostVal}>
                      ₹{financialMetrics.purchaseCost.toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <View style={styles.financialDividerCol}>
                    <Text style={styles.mathSymbol}>-</Text>
                  </View>

                  <View style={styles.financialCol}>
                    <Text style={styles.financialColLabel}>Total Sales Revenue</Text>
                    <Text style={styles.financialRevenueVal}>
                      ₹{financialMetrics.salesRevenue.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>

                {/* Net Profit / Loss Banner */}
                <View
                  style={[
                    styles.outcomeBanner,
                    financialMetrics.outcome === 'profit' && styles.outcomeProfit,
                    financialMetrics.outcome === 'loss' && styles.outcomeLoss,
                    financialMetrics.outcome === 'breakeven' && styles.outcomeBreakeven,
                  ]}
                >
                  <View style={styles.outcomeTopRow}>
                    <MaterialCommunityIcons
                      name={
                        financialMetrics.outcome === 'profit'
                          ? 'arrow-up-bold-circle'
                          : financialMetrics.outcome === 'loss'
                          ? 'arrow-down-bold-circle'
                          : 'swap-horizontal-bold'
                      }
                      size={28}
                      color={
                        financialMetrics.outcome === 'profit'
                          ? '#059669'
                          : financialMetrics.outcome === 'loss'
                          ? '#DC2626'
                          : '#4B5563'
                      }
                    />
                    <View style={styles.outcomeBadge}>
                      <Text
                        style={[
                          styles.outcomeBadgeText,
                          financialMetrics.outcome === 'profit' && { color: '#065F46' },
                          financialMetrics.outcome === 'loss' && { color: '#991B1B' },
                          financialMetrics.outcome === 'breakeven' && { color: '#374151' },
                        ]}
                      >
                        {financialMetrics.outcome === 'profit' && 'NET PROFIT'}
                        {financialMetrics.outcome === 'loss' && 'NET LOSS'}
                        {financialMetrics.outcome === 'breakeven' && 'BREAK-EVEN'}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={[
                      styles.outcomeAmount,
                      financialMetrics.outcome === 'profit' && { color: '#047857' },
                      financialMetrics.outcome === 'loss' && { color: '#B91C1C' },
                      financialMetrics.outcome === 'breakeven' && { color: '#1F2937' },
                    ]}
                  >
                    {financialMetrics.outcome === 'profit' && `+ ₹${financialMetrics.net.toLocaleString('en-IN')}`}
                    {financialMetrics.outcome === 'loss' && `- ₹${Math.abs(financialMetrics.net).toLocaleString('en-IN')}`}
                    {financialMetrics.outcome === 'breakeven' && '₹0.00'}
                  </Text>

                  <Text style={styles.outcomeFooterNote}>
                    {financialMetrics.outcome === 'profit' && '🎉 Great job! Customer sales exceeded milk purchase cost.'}
                    {financialMetrics.outcome === 'loss' && '⚠️ Supply purchase cost was higher than customer sales today.'}
                    {financialMetrics.outcome === 'breakeven' && 'Expenditure and revenue are exactly matched.'}
                  </Text>
                </View>
              </Card.Content>
            </Card>
          </>
        )}
      </ScrollView>

      {/* Calendar Date Picker Modal */}
      <CalendarDatePickerModal
        visible={calendarPickerVisible}
        selectedDate={selectedDate}
        onSelectDate={handleSelectCalendarDate}
        onDismiss={() => setCalendarPickerVisible(false)}
        title="Select Summary Date"
        zIndex={99999}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BrandColors.backgroundLight,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
  },
  dateSelectorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  dateSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  dateCenter: {
    alignItems: 'center',
    flex: 1,
  },
  dateSelectorLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    color: BrandColors.neutralGray,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dateDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  dateValue: {
    fontSize: 15,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  dateTapHint: {
    fontSize: 11,
    color: BrandColors.primaryDark,
    fontWeight: '600',
    marginTop: 2,
  },
  todayChipRow: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  todayChip: {
    backgroundColor: '#EEF2FF',
    height: 28,
  },
  todayChipText: {
    fontSize: 11,
    color: BrandColors.primaryDark,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 14,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 4,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    fontWeight: '500',
  },
  cardContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  twoColumnGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  statBox: {
    flex: 1,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
  },
  statBoxLabel: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    fontWeight: '600',
    marginBottom: 2,
  },
  statBoxValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  statBoxUnit: {
    fontSize: 11,
    fontWeight: '600',
  },
  breakdownBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  breakdownLabel: {
    fontSize: 12,
    color: BrandColors.textSecondaryLight,
    fontWeight: '600',
  },
  breakdownValue: {
    fontSize: 13,
    color: BrandColors.textLight,
    fontWeight: '800',
  },
  subDivider: {
    marginVertical: 4,
    backgroundColor: '#E2E8F0',
  },
  expandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 8,
  },
  expandToggleText: {
    fontSize: 12,
    color: BrandColors.primary,
    fontWeight: '700',
  },
  entriesList: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  entryName: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  entrySub: {
    fontSize: 11,
    color: BrandColors.neutralGray,
  },
  entryQty: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  entryAmt: {
    fontSize: 11,
    fontWeight: '600',
    color: BrandColors.neutralGray,
  },
  stockStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  bannerSurplus: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  bannerBalanced: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  bannerDeficit: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  stockStatusTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  stockStatusSub: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    marginTop: 1,
  },
  stockTable: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  stockTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F1F5F9',
  },
  stockColHeader: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: BrandColors.neutralGray,
    textTransform: 'uppercase',
  },
  stockTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stockRowTotal: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
  },
  stockRowLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.textLight,
  },
  stockRowLabelBold: {
    fontSize: 12,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  stockRowVal: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.neutralGray,
  },
  stockRowValBold: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  stockRowDiff: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  stockRowDiffBold: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  diffPositive: {
    color: '#059669',
  },
  diffNegative: {
    color: '#DC2626',
  },
  financialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  financialCol: {
    flex: 1,
  },
  financialDividerCol: {
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mathSymbol: {
    fontSize: 20,
    fontWeight: '800',
    color: BrandColors.neutralGray,
  },
  financialColLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: BrandColors.neutralGray,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  financialCostVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#B91C1C',
  },
  financialRevenueVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#047857',
  },
  outcomeBanner: {
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  outcomeProfit: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  outcomeLoss: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  outcomeBreakeven: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  outcomeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  outcomeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  outcomeBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  outcomeAmount: {
    fontSize: 26,
    fontWeight: '900',
    marginVertical: 4,
  },
  outcomeFooterNote: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    textAlign: 'center',
    marginTop: 2,
  },
});
