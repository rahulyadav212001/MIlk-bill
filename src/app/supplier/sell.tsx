import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Button,
  Card,
  Divider,
  HelperText,
  IconButton,
  Modal,
  Portal,
  Searchbar,
  Text,
  TextInput,
} from 'react-native-paper';
import { CalendarDatePickerModal } from '../../components/CalendarDatePickerModal';
import { EmptyState } from '../../components/EmptyState';
import { HeaderBar } from '../../components/HeaderBar';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { BrandColors } from '../../constants/theme';
import {
  calculateDailyStockSummary,
  computeSupplierInventory,
  deleteMilkSale,
  getAllPurchasesForDate,
  recordMilkSale,
} from '../../services/milkTradeService';
import { getSuppliers } from '../../services/supplierPurchaseService';
import { MilkPurchase, Supplier } from '../../types';
import { formatDateAndDay, formatDisplayDate, getTodayKolkata } from '../../utils/date';

export default function SellScreen() {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKolkata());

  // Data states
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<MilkPurchase[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Calendar Date Picker Modal State
  const [calendarPickerVisible, setCalendarPickerVisible] = useState(false);

  // Sales Details Modal State
  const [salesDetailsModalVisible, setSalesDetailsModalVisible] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<MilkPurchase | null>(null);
  const [newSaleQtyStr, setNewSaleQtyStr] = useState('');
  const [savingSaleEntry, setSavingSaleEntry] = useState(false);
  const [saleEntryError, setSaleEntryError] = useState('');
  const [saleEntrySuccess, setSaleEntrySuccess] = useState('');

  // Load Sell data
  const loadData = useCallback(async () => {
    try {
      const targetDate = selectedDate;
      const [supData, pData] = await Promise.all([
        getSuppliers(),
        getAllPurchasesForDate(targetDate),
      ]);
      setSuppliers(supData);
      setPurchases(pData);
    } catch (err: any) {
      console.warn('Could not load sell supply data:', err?.message || err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Stock summary calculation (reactive, automatically updates with any purchase/sale)
  const stockSummary = useMemo(() => {
    return calculateDailyStockSummary(selectedDate, suppliers, purchases);
  }, [selectedDate, suppliers, purchases]);

  // Filter suppliers by name or phone
  const filteredSuppliers = useMemo(() => {
    if (!searchQuery.trim()) return suppliers;
    const q = searchQuery.toLowerCase().trim();
    return suppliers.filter(
      (s) => s.name.toLowerCase().includes(q) || s.phone.includes(q)
    );
  }, [suppliers, searchQuery]);

  // Open Sales details modal for a specific purchase
  const handleOpenPurchaseSalesDetails = (purchase: MilkPurchase) => {
    setSelectedPurchase(purchase);
    setNewSaleQtyStr(
      purchase.isSold && purchase.totalSoldQuantity ? purchase.totalSoldQuantity.toString() : ''
    );
    setSaleEntryError('');
    setSaleEntrySuccess('');
    setSalesDetailsModalVisible(true);
  };

  const newSaleNumericQty = parseFloat(newSaleQtyStr) || 0;

  // Save new milk sale entry
  const handleSaveNewSaleEntry = async () => {
    if (!selectedPurchase) return;
    if (newSaleNumericQty <= 0) {
      setSaleEntryError('Milk sold quantity must be greater than 0 Litres.');
      return;
    }
    if (newSaleNumericQty > selectedPurchase.quantityLiters) {
      setSaleEntryError(
        `Sold quantity (${newSaleNumericQty} L) cannot exceed purchased quantity (${selectedPurchase.quantityLiters} L).`
      );
      return;
    }

    setSavingSaleEntry(true);
    setSaleEntryError('');

    try {
      await recordMilkSale({
        purchaseId: selectedPurchase.id,
        quantityLiters: newSaleNumericQty,
        saleDate: selectedPurchase.purchaseDate || selectedDate || getTodayKolkata(),
      });

      const remaining = Math.max(
        0,
        Number((selectedPurchase.quantityLiters - newSaleNumericQty).toFixed(2))
      );
      const wastedQty = remaining;
      const lossAmt = Number((wastedQty * selectedPurchase.pricePerLiter).toFixed(2));
      const updated: MilkPurchase = {
        ...selectedPurchase,
        totalSoldQuantity: newSaleNumericQty,
        remainingQuantity: remaining,
        wastageQuantity: wastedQty,
        lossAmount: lossAmt,
        isSold: true,
        status: 'sold',
      };
      setSelectedPurchase(updated);
      setSaleEntrySuccess(
        wastedQty > 0
          ? `Recorded ${newSaleNumericQty}L sold. Waste of Milk: ${wastedQty}L, Waste of Money: ₹${lossAmt.toLocaleString('en-IN')}`
          : `Recorded ${newSaleNumericQty}L sold. Status: No Loss!`
      );

      await loadData();
      setTimeout(() => {
        setSaleEntrySuccess('');
        setSalesDetailsModalVisible(false);
      }, 1200);
    } catch (err: any) {
      setSaleEntryError(err?.message || 'Failed to record sale.');
    } finally {
      setSavingSaleEntry(false);
    }
  };

  // Reset Sale entry to allow re-entry
  const handleResetSale = (purchase: MilkPurchase) => {
    Alert.alert(
      'Reset Sale Record',
      'Are you sure you want to reset this sales record? This will allow you to re-enter the sold milk quantity.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Sale',
          style: 'destructive',
          onPress: async () => {
            try {
              const saleId = `sale_${purchase.id}`;
              await deleteMilkSale(saleId, purchase.id);
              await loadData();
              const updatedPurchases = await getAllPurchasesForDate(selectedDate);
              const currentP = updatedPurchases.find((p) => p.id === purchase.id);
              if (currentP) {
                setSelectedPurchase(currentP);
                setNewSaleQtyStr('');
              } else {
                setSalesDetailsModalVisible(false);
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to reset sale.');
            }
          },
        },
      ]
    );
  };

  // Render Seller Supplier Card
  const renderSellSupplierItem = ({ item }: { item: Supplier }) => {
    const supPurchases = purchases.filter((p) => p.supplierId === item.id);
    const inv = computeSupplierInventory(item.id, purchases);

    return (
      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.nameRow}>
              <View style={styles.avatar}>
                <MaterialCommunityIcons name="account-tie" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.nameInfo}>
                <Text style={styles.supplierName}>{item.name}</Text>
                <Text style={styles.phoneText}>📞 {item.phone}</Text>
              </View>
            </View>
            <View
              style={[
                styles.countBadgeBox,
                supPurchases.length > 0 ? styles.countBadgeBoxActive : styles.countBadgeBoxEmpty,
              ]}
            >
              <Text
                style={[
                  styles.countBadgeText,
                  supPurchases.length > 0
                    ? styles.countBadgeTextActive
                    : styles.countBadgeTextEmpty,
                ]}
              >
                {supPurchases.length} session{supPurchases.length === 1 ? '' : 's'}
              </Text>
            </View>
          </View>

          {/* Supplier-Wise Milk Tracking Breakdown */}
          {supPurchases.length > 0 && (
            <View style={styles.supplierInventoryTable}>
              <View style={styles.supplierInvRowHeader}>
                <Text style={styles.supplierInvColHeaderTitle}>Category</Text>
                <Text style={styles.supplierInvColHeader}>Purchased</Text>
                <Text style={styles.supplierInvColHeader}>Supplied/Sold</Text>
                <Text style={styles.supplierInvColHeader}>Remaining</Text>
              </View>
              <View style={styles.supplierInvRow}>
                <Text style={styles.supplierInvCategoryLabel}>🐃 Buffalo</Text>
                <Text style={styles.supplierInvValue}>{inv.buffaloPurchased} L</Text>
                <Text style={styles.supplierInvValue}>{inv.buffaloSold} L</Text>
                <Text
                  style={[
                    styles.supplierInvValue,
                    inv.buffaloRemaining > 0 ? styles.remWarning : styles.remSuccess,
                  ]}
                >
                  {inv.buffaloRemaining} L
                </Text>
              </View>
              <View style={styles.supplierInvRow}>
                <Text style={styles.supplierInvCategoryLabel}>🐄 Cow</Text>
                <Text style={styles.supplierInvValue}>{inv.cowPurchased} L</Text>
                <Text style={styles.supplierInvValue}>{inv.cowSold} L</Text>
                <Text
                  style={[
                    styles.supplierInvValue,
                    inv.cowRemaining > 0 ? styles.remWarning : styles.remSuccess,
                  ]}
                >
                  {inv.cowRemaining} L
                </Text>
              </View>
              <View style={[styles.supplierInvRow, styles.supplierInvTotalRow]}>
                <Text style={styles.supplierInvTotalLabel}>Total</Text>
                <Text style={styles.supplierInvTotalValue}>{inv.totalPurchased} L</Text>
                <Text style={styles.supplierInvTotalValue}>{inv.totalSold} L</Text>
                <Text
                  style={[
                    styles.supplierInvTotalValue,
                    inv.remaining > 0 ? styles.remWarning : styles.remSuccess,
                  ]}
                >
                  {inv.remaining} L
                </Text>
              </View>
            </View>
          )}

          <Divider style={styles.divider} />

          {/* Purchase Sessions List for Selected Date */}
          <Text style={styles.supplierPurchasesHeader}>
            {item.name} – Today&apos;s Purchases ({selectedDate})
          </Text>

          {supPurchases.length === 0 ? (
            <View style={styles.emptySessionBox}>
              <MaterialCommunityIcons
                name="information-outline"
                size={18}
                color={BrandColors.neutralGray}
                style={{ marginBottom: 4 }}
              />
              <Text style={styles.emptySessionText}>
                No milk purchases recorded for this supplier on {formatDisplayDate(selectedDate)}.
              </Text>
            </View>
          ) : (
            <View style={styles.sessionItemsList}>
              {supPurchases.map((p) => {
                const isSold =
                  p.isSold || (p.totalSoldQuantity != null && p.totalSoldQuantity > 0);
                const isNoRemaining = p.remainingQuantity === 0;
                const sessionEmoji =
                  p.session === 'evening' ? '🌇' : p.session === 'afternoon' ? '☀️' : '🌅';
                const sessionName =
                  p.session.charAt(0).toUpperCase() + p.session.slice(1);
                const categoryLabel =
                  p.milkCategory === 'cow' ? '🐄 Cow Milk' : '🐃 Buffalo Milk';

                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.purchaseSessionItem,
                      isSold
                        ? isNoRemaining
                          ? styles.sessionItemBalanced
                          : styles.sessionItemPartial
                        : styles.sessionItemPending,
                    ]}
                    onPress={() => handleOpenPurchaseSalesDetails(p)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.sessionTopRow}>
                      <View style={styles.sessionTitleRow}>
                        <Text style={styles.sessionItemTitle}>
                          {sessionEmoji} {sessionName}: {p.quantityLiters} L {categoryLabel}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.statusBadgeBox,
                          {
                            backgroundColor: !isSold
                              ? '#EFF6FF'
                              : isNoRemaining
                                ? '#ECFDF5'
                                : '#FEF3C7',
                            borderColor: !isSold
                              ? '#BFDBFE'
                              : isNoRemaining
                                ? '#A7F3D0'
                                : '#FDE68A',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            {
                              color: !isSold
                                ? BrandColors.primaryDark
                                : isNoRemaining
                                  ? BrandColors.success
                                  : '#D97706',
                            },
                          ]}
                        >
                          {!isSold
                            ? '⏳ Pending'
                            : isNoRemaining
                              ? '✓ No Loss'
                              : `⚠️ ${p.remainingQuantity}L Left`}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.sessionItemDetails}>
                      Purchase Rate: ₹{p.pricePerLiter.toLocaleString('en-IN')}/L • Total: ₹
                      {p.totalAmount.toLocaleString('en-IN')}
                    </Text>

                    <View style={styles.sessionBottomRow}>
                      <View style={styles.sessionStatusRow}>
                        <Text style={styles.sessionSoldText}>
                          Sold: <Text style={styles.boldText}>{p.totalSoldQuantity || 0} L</Text>
                        </Text>
                        <Text
                          style={[
                            styles.sessionRemainingText,
                            { color: isNoRemaining ? BrandColors.success : '#D97706' },
                          ]}
                        >
                          Remaining: <Text style={styles.boldText}>{p.remainingQuantity} L</Text>
                        </Text>
                      </View>

                      <View style={styles.sessionChevronBox}>
                        <Text style={styles.sessionTapPrompt}>
                          {isSold ? 'View Sale' : 'Record Sale'}
                        </Text>
                        <MaterialCommunityIcons
                          name="chevron-right"
                          size={18}
                          color={BrandColors.primaryDark}
                        />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Navbar with Back Action returning to Supply Landing Page */}
      <HeaderBar
        title="Sell Milk"
        subtitle={`${formatDisplayDate(selectedDate)} • ${filteredSuppliers.length} Available Sellers`}
        showBack={true}
      />

      {/* Seller Search Bar with Clickable Date and Day Selector (No Calendar Icon) */}
      <View style={styles.searchRowContainer}>
        <Searchbar
          placeholder="Search seller name or phone..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
          inputStyle={styles.searchbarInput}
          iconColor={BrandColors.neutralGray}
          clearIcon={searchQuery ? 'close-circle' : undefined}
          onClearIconPress={() => setSearchQuery('')}
        />
        <TouchableOpacity
          style={styles.dateSelectorBtn}
          onPress={() => setCalendarPickerVisible(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Selected date: ${formatDateAndDay(selectedDate)}. Tap to change date.`}
        >
          <Text style={styles.dateSelectorBtnText} numberOfLines={1}>
            {formatDateAndDay(selectedDate)}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingIndicator message="Loading sales & stock data..." />
      ) : (
        <FlatList
          data={filteredSuppliers}
          keyExtractor={(item) => item.id}
          renderItem={renderSellSupplierItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[BrandColors.primary]}
            />
          }
          ListHeaderComponent={
            <View style={styles.sellHeaderContainer}>
              {/* Overall KPI Summary Dashboard */}
              <Card style={styles.kpiCard}>
                <Card.Content style={styles.kpiCardContent}>
                  <View style={styles.kpiHeaderRow}>
                    <View style={styles.kpiHeaderLeft}>
                      <MaterialCommunityIcons
                        name="chart-box-outline"
                        size={20}
                        color={BrandColors.primaryDark}
                      />
                      <Text style={styles.kpiHeaderTitle}>Today&apos;s Milk Stock &amp; Sales</Text>
                    </View>

                    <View style={styles.kpiDatePill}>
                      <Text style={styles.kpiDatePillText}>
                        Date: {formatDisplayDate(selectedDate)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.kpiRow}>
                    <View style={[styles.kpiBox, styles.kpiBoxPurchased]}>
                      <Text style={styles.kpiLabel}>Total Purchased</Text>
                      <Text style={[styles.kpiValue, { color: BrandColors.primaryDark }]}>
                        {stockSummary.overall.totalPurchasedLiters} L
                      </Text>
                    </View>

                    <View style={[styles.kpiBox, styles.kpiBoxSold]}>
                      <Text style={styles.kpiLabel}>Milk Sold</Text>
                      <Text style={[styles.kpiValue, { color: BrandColors.success }]}>
                        {stockSummary.overall.totalSoldLiters} L
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.kpiBox,
                        stockSummary.overall.remainingLiters === 0
                          ? styles.kpiBoxSold
                          : styles.kpiBoxRemaining,
                      ]}
                    >
                      <Text style={styles.kpiLabel}>Remaining Milk</Text>
                      <Text
                        style={[
                          styles.kpiValue,
                          {
                            color:
                              stockSummary.overall.remainingLiters === 0
                                ? BrandColors.success
                                : '#D97706',
                          },
                        ]}
                      >
                        {stockSummary.overall.remainingLiters} L
                      </Text>
                    </View>
                  </View>

                  {/* Overall Loss / No Loss Status Banner */}
                  <View style={styles.bannerContainer}>
                    {stockSummary.overall.remainingLiters === 0 ? (
                      <View style={styles.noLossBanner}>
                        <MaterialCommunityIcons
                          name="check-decagram"
                          size={20}
                          color={BrandColors.success}
                        />
                        <Text style={styles.noLossBannerText}>Status: No Remaining Milk</Text>
                      </View>
                    ) : (
                      <View style={styles.lossBanner}>
                        <MaterialCommunityIcons
                          name="clock-alert-outline"
                          size={20}
                          color="#D97706"
                        />
                        <Text style={styles.lossBannerText}>
                          Status: {stockSummary.overall.remainingLiters} Litres Remaining (Unsold)
                        </Text>
                      </View>
                    )}
                  </View>

                  <Divider style={styles.kpiDivider} />

                  {/* Buffalo vs Cow Separate Category Stock Breakdown */}
                  <Text style={styles.categoryBreakdownTitle}>Category Stock Breakdown</Text>
                  <View style={styles.categoryRow}>
                    {/* Buffalo Stock Card */}
                    <View style={styles.categoryCard}>
                      <Text style={styles.categoryTitle}>🐃 Buffalo Milk</Text>
                      <Text style={styles.categoryStat}>
                        Purchased:{' '}
                        <Text style={styles.boldText}>
                          {stockSummary.overall.buffalo.purchasedLiters} L
                        </Text>
                      </Text>
                      <Text style={styles.categoryStat}>
                        Sold:{' '}
                        <Text style={[styles.boldText, { color: BrandColors.success }]}>
                          {stockSummary.overall.buffalo.soldLiters} L
                        </Text>
                      </Text>
                      <Text style={styles.categoryStat}>
                        Remaining:{' '}
                        <Text
                          style={[
                            styles.boldText,
                            {
                              color:
                                stockSummary.overall.buffalo.remainingLiters === 0
                                  ? BrandColors.success
                                  : '#D97706',
                            },
                          ]}
                        >
                          {stockSummary.overall.buffalo.remainingLiters} L
                        </Text>
                      </Text>
                    </View>

                    {/* Cow Stock Card */}
                    <View style={styles.categoryCard}>
                      <Text style={styles.categoryTitle}>🐄 Cow Milk</Text>
                      <Text style={styles.categoryStat}>
                        Purchased:{' '}
                        <Text style={styles.boldText}>
                          {stockSummary.overall.cow.purchasedLiters} L
                        </Text>
                      </Text>
                      <Text style={styles.categoryStat}>
                        Sold:{' '}
                        <Text style={[styles.boldText, { color: BrandColors.success }]}>
                          {stockSummary.overall.cow.soldLiters} L
                        </Text>
                      </Text>
                      <Text style={styles.categoryStat}>
                        Remaining:{' '}
                        <Text
                          style={[
                            styles.boldText,
                            {
                              color:
                                stockSummary.overall.cow.remainingLiters === 0
                                  ? BrandColors.success
                                  : '#D97706',
                            },
                          ]}
                        >
                          {stockSummary.overall.cow.remainingLiters} L
                        </Text>
                      </Text>
                    </View>
                  </View>
                </Card.Content>
              </Card>

              {/* Sellers Section Header */}
              <View style={styles.sellersSectionHeader}>
                <Text style={styles.sellersSectionTitle}>Available Sellers</Text>
                <Text style={styles.sellersSectionSubtitle}>
                  Select a purchase session below to record milk sales
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="account-cash-outline"
              title={searchQuery ? 'No Matching Sellers' : 'No Sellers Available'}
              description={
                searchQuery
                  ? `No seller matched "${searchQuery}".`
                  : 'No suppliers registered or available for sales.'
              }
            />
          }
        />
      )}

      {/* Sales Details Modal (Milk Sale Record) */}
      <Portal>
        <Modal
          visible={salesDetailsModalVisible}
          onDismiss={() => setSalesDetailsModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { maxHeight: '90%' }]}
        >
          {selectedPurchase && (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Milk Sale Record</Text>
                  <Text style={styles.modalSubtitle}>
                    {selectedPurchase.supplierName} •{' '}
                    {formatDisplayDate(selectedPurchase.purchaseDate)}
                  </Text>
                </View>
                <IconButton
                  icon="close"
                  size={20}
                  onPress={() => setSalesDetailsModalVisible(false)}
                />
              </View>

              {/* ONLY the 6 Purchase Details as requested */}
              <View style={styles.purchaseInfoBanner}>
                <View style={styles.infoBannerRow}>
                  <Text style={styles.infoBannerLabel}>Supplier Name:</Text>
                  <Text style={styles.infoBannerValBold}>{selectedPurchase.supplierName}</Text>
                </View>
                <View style={styles.infoBannerRow}>
                  <Text style={styles.infoBannerLabel}>Milk Category:</Text>
                  <Text style={styles.infoBannerVal}>
                    {selectedPurchase.milkCategory === 'cow' ? '🐄 Cow Milk' : '🐃 Buffalo Milk'}
                  </Text>
                </View>
                <View style={styles.infoBannerRow}>
                  <Text style={styles.infoBannerLabel}>Purchase Session:</Text>
                  <Text style={styles.infoBannerVal}>
                    {selectedPurchase.session.charAt(0).toUpperCase() +
                      selectedPurchase.session.slice(1)}
                  </Text>
                </View>
                <View style={styles.infoBannerRow}>
                  <Text style={styles.infoBannerLabel}>Purchased Quantity:</Text>
                  <Text style={styles.infoBannerValBold}>
                    {selectedPurchase.quantityLiters} Litres
                  </Text>
                </View>
                <View style={styles.infoBannerRow}>
                  <Text style={styles.infoBannerLabel}>Purchase Rate per Litre:</Text>
                  <Text style={styles.infoBannerValBold}>
                    ₹{selectedPurchase.pricePerLiter.toLocaleString('en-IN')}
                  </Text>
                </View>
                <View style={styles.infoBannerRow}>
                  <Text style={styles.infoBannerLabel}>Total Purchase Amount:</Text>
                  <Text style={[styles.infoBannerValBold, { color: BrandColors.primaryDark }]}>
                    ₹{selectedPurchase.totalAmount.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>

              {selectedPurchase.isSold ? (
                /* --- ALREADY SOLD / COMPLETED SUMMARY --- */
                <View style={styles.soldSummaryBox}>
                  <View style={styles.soldBadgeRow}>
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={20}
                      color={BrandColors.success}
                    />
                    <Text style={styles.soldBadgeText}>
                      Sale Completed &amp; Permanently Recorded
                    </Text>
                  </View>
                  <Divider style={{ marginVertical: 10 }} />
                  <View style={styles.infoBannerRow}>
                    <Text style={styles.infoBannerLabel}>Sold Quantity:</Text>
                    <Text style={[styles.infoBannerValBold, { color: BrandColors.success }]}>
                      {selectedPurchase.totalSoldQuantity || 0} Litres
                    </Text>
                  </View>
                  <View style={styles.infoBannerRow}>
                    <Text style={styles.infoBannerLabel}>Waste of Milk:</Text>
                    <Text
                      style={[
                        styles.infoBannerValBold,
                        {
                          color:
                            (selectedPurchase.remainingQuantity || 0) === 0
                              ? BrandColors.success
                              : BrandColors.danger,
                        },
                      ]}
                    >
                      {selectedPurchase.remainingQuantity || 0} Litres
                    </Text>
                  </View>
                  <View style={styles.infoBannerRow}>
                    <Text style={styles.infoBannerLabel}>Waste of Money:</Text>
                    <Text
                      style={[
                        styles.infoBannerValBold,
                        {
                          color:
                            (selectedPurchase.remainingQuantity || 0) === 0
                              ? BrandColors.success
                              : BrandColors.danger,
                        },
                      ]}
                    >
                      ₹
                      {Number(
                        (
                          (selectedPurchase.remainingQuantity || 0) *
                          selectedPurchase.pricePerLiter
                        ).toFixed(2)
                      ).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={styles.infoBannerRow}>
                    <Text style={styles.infoBannerLabel}>Status:</Text>
                    <Text
                      style={[
                        styles.infoBannerValBold,
                        {
                          color:
                            (selectedPurchase.remainingQuantity || 0) === 0
                              ? BrandColors.success
                              : BrandColors.danger,
                        },
                      ]}
                    >
                      {(selectedPurchase.remainingQuantity || 0) === 0
                        ? 'No Loss'
                        : `${selectedPurchase.remainingQuantity} Litres Wasted`}
                    </Text>
                  </View>

                  <View
                    style={{
                      marginTop: 16,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Button
                      mode="text"
                      icon="refresh"
                      textColor={BrandColors.danger}
                      onPress={() => handleResetSale(selectedPurchase)}
                    >
                      Reset Sale Record
                    </Button>
                    <Button
                      mode="contained"
                      buttonColor={BrandColors.primaryDark}
                      onPress={() => setSalesDetailsModalVisible(false)}
                    >
                      Done
                    </Button>
                  </View>
                </View>
              ) : (
                /* --- RECORD NEW SALE FORM (ONLY ONE INPUT FIELD) --- */
                <View style={styles.newSaleFormBox}>
                  <Text style={styles.newSaleFormTitle}>Enter Quantity Sold</Text>

                  {saleEntryError ? (
                    <HelperText type="error" visible style={styles.helperText}>
                      {saleEntryError}
                    </HelperText>
                  ) : null}

                  {saleEntrySuccess ? (
                    <HelperText
                      type="info"
                      visible
                      style={[styles.helperText, { color: BrandColors.success }]}
                    >
                      {saleEntrySuccess}
                    </HelperText>
                  ) : null}

                  {/* ONLY ONE INPUT FIELD */}
                  <TextInput
                    label="Milk Sold (Litres) *"
                    value={newSaleQtyStr}
                    onChangeText={(t) => {
                      setNewSaleQtyStr(t);
                      setSaleEntryError('');
                    }}
                    mode="outlined"
                    keyboardType="decimal-pad"
                    style={styles.input}
                    placeholder={`Max ${selectedPurchase.quantityLiters} Litres`}
                    left={<TextInput.Icon icon="scale" />}
                    right={<TextInput.Affix text="Litres" />}
                  />

                  {/* Live Calculation Preview Box */}
                  {newSaleNumericQty > 0 &&
                    newSaleNumericQty <= selectedPurchase.quantityLiters && (
                      <View style={styles.liveCalculationBox}>
                        <Text style={styles.liveCalcTitle}>Live Wastage &amp; Loss Preview:</Text>
                        <View style={styles.infoBannerRow}>
                          <Text style={styles.infoBannerLabel}>Waste of Milk:</Text>
                          <Text
                            style={[
                              styles.infoBannerValBold,
                              {
                                color:
                                  selectedPurchase.quantityLiters - newSaleNumericQty === 0
                                    ? BrandColors.success
                                    : BrandColors.danger,
                              },
                            ]}
                          >
                            {(selectedPurchase.quantityLiters - newSaleNumericQty).toFixed(2)} Litres
                          </Text>
                        </View>
                        <View style={styles.infoBannerRow}>
                          <Text style={styles.infoBannerLabel}>Waste of Money:</Text>
                          <Text
                            style={[
                              styles.infoBannerValBold,
                              {
                                color:
                                  selectedPurchase.quantityLiters - newSaleNumericQty === 0
                                    ? BrandColors.success
                                    : BrandColors.danger,
                              },
                            ]}
                          >
                            ₹
                            {Number(
                              (
                                (selectedPurchase.quantityLiters - newSaleNumericQty) *
                                selectedPurchase.pricePerLiter
                              ).toFixed(2)
                            ).toLocaleString('en-IN')}
                          </Text>
                        </View>
                        <View style={styles.infoBannerRow}>
                          <Text style={styles.infoBannerLabel}>Status:</Text>
                          <Text
                            style={[
                              styles.infoBannerValBold,
                              {
                                color:
                                  selectedPurchase.quantityLiters - newSaleNumericQty === 0
                                    ? BrandColors.success
                                    : BrandColors.danger,
                              },
                            ]}
                          >
                            {selectedPurchase.quantityLiters - newSaleNumericQty === 0
                              ? 'No Loss'
                              : `${(selectedPurchase.quantityLiters - newSaleNumericQty).toFixed(2)} Litres Wasted`}
                          </Text>
                        </View>
                      </View>
                    )}

                  <View style={styles.modalActions}>
                    <Button
                      mode="text"
                      onPress={() => setSalesDetailsModalVisible(false)}
                      disabled={savingSaleEntry}
                      textColor={BrandColors.neutralGray}
                    >
                      Cancel
                    </Button>
                    <Button
                      mode="contained"
                      onPress={handleSaveNewSaleEntry}
                      loading={savingSaleEntry}
                      disabled={savingSaleEntry}
                      buttonColor={BrandColors.success}
                    >
                      Save Sale Record
                    </Button>
                  </View>
                </View>
              )}
            </ScrollView>
          )}
        </Modal>
      </Portal>

      {/* Calendar Date Picker Modal */}
      <CalendarDatePickerModal
        visible={calendarPickerVisible}
        onDismiss={() => setCalendarPickerVisible(false)}
        selectedDate={selectedDate}
        onSelectDate={(newDate) => setSelectedDate(newDate)}
        title="Select Date"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  searchRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: '#FFFFFF',
    gap: 10,
  },
  searchbar: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    elevation: 0,
    borderRadius: 8,
    height: 46,
  },
  searchbarInput: {
    minHeight: 46,
    fontSize: 14,
  },
  dateSelectorBtn: {
    height: 46,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateSelectorBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  supplierInventoryTable: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 12,
    marginBottom: 4,
    padding: 10,
  },
  supplierInvRowHeader: {
    flexDirection: 'row',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    marginBottom: 4,
  },
  supplierInvColHeaderTitle: {
    flex: 1.2,
    fontSize: 11,
    fontWeight: '700',
    color: BrandColors.neutralGray,
  },
  supplierInvColHeader: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: BrandColors.neutralGray,
    textAlign: 'right',
  },
  supplierInvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  supplierInvCategoryLabel: {
    flex: 1.2,
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.textLight,
  },
  supplierInvValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: BrandColors.textLight,
    textAlign: 'right',
  },
  supplierInvTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginTop: 4,
    paddingTop: 5,
  },
  supplierInvTotalLabel: {
    flex: 1.2,
    fontSize: 12,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  supplierInvTotalValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: BrandColors.textLight,
    textAlign: 'right',
  },
  remWarning: {
    color: '#D97706',
    fontWeight: '700',
  },
  remSuccess: {
    color: BrandColors.success,
    fontWeight: '700',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  sellHeaderContainer: {
    marginBottom: 16,
  },
  kpiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    elevation: 1,
  },
  kpiCardContent: {
    padding: 14,
  },
  kpiHeaderRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },

  kpiHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kpiHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  kpiDatePill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  kpiDatePillText: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    fontWeight: '600',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  kpiBox: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  kpiBoxPurchased: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  kpiBoxSold: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  kpiBoxRemaining: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  kpiLabel: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    fontWeight: '600',
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  bannerContainer: {
    marginTop: 4,
  },
  noLossBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  noLossBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.success,
  },
  lossBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  lossBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D97706',
  },
  kpiDivider: {
    marginVertical: 12,
  },
  categoryBreakdownTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.primaryDark,
    marginBottom: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.primaryDark,
    marginBottom: 4,
  },
  categoryStat: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  boldText: {
    fontWeight: '700',
    color: '#1E293B',
  },
  sellersSectionHeader: {
    marginTop: 16,
    marginBottom: 8,
  },
  sellersSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  sellersSectionSubtitle: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    elevation: 1,
  },
  cardContent: {
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BrandColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameInfo: {
    flex: 1,
  },
  supplierName: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  phoneText: {
    fontSize: 13,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  countBadgeBox: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countBadgeBoxActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  countBadgeBoxEmpty: {
    backgroundColor: '#F1F5F9',
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  countBadgeTextActive: {
    color: BrandColors.primaryDark,
  },
  countBadgeTextEmpty: {
    color: BrandColors.neutralGray,
  },
  divider: {
    marginVertical: 12,
  },
  supplierPurchasesHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.primaryDark,
    marginBottom: 8,
  },
  emptySessionBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
  },
  emptySessionText: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    textAlign: 'center',
  },
  sessionItemsList: {
    gap: 8,
  },
  purchaseSessionItem: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  sessionItemPending: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  sessionItemBalanced: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  sessionItemPartial: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  sessionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionTitleRow: {
    flex: 1,
  },
  sessionItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  statusBadgeBox: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sessionItemDetails: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginTop: 4,
  },
  sessionBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  sessionStatusRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sessionSoldText: {
    fontSize: 12,
    color: BrandColors.neutralGray,
  },
  sessionRemainingText: {
    fontSize: 12,
  },
  sessionChevronBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sessionTapPrompt: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.primaryDark,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    padding: 20,
    borderRadius: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  modalSubtitle: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  purchaseInfoBanner: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    gap: 6,
  },
  infoBannerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoBannerLabel: {
    fontSize: 13,
    color: BrandColors.neutralGray,
  },
  infoBannerVal: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  infoBannerValBold: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '700',
  },
  soldSummaryBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    gap: 6,
  },
  soldBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  soldBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.success,
  },
  newSaleFormBox: {
    gap: 10,
  },
  newSaleFormTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.primaryDark,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#FFFFFF',
  },
  helperText: {
    paddingHorizontal: 0,
  },
  liveCalculationBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 6,
    marginTop: 4,
  },
  liveCalcTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.primaryDark,
    marginBottom: 2,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 14,
  },
});
