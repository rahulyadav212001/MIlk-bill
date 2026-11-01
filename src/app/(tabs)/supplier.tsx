import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
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
  SegmentedButtons,
  Text,
  TextInput
} from 'react-native-paper';
import { CalendarDatePickerModal } from '../../components/CalendarDatePickerModal';
import { EmptyState } from '../../components/EmptyState';
import { HeaderBar } from '../../components/HeaderBar';
import { HolidaySettingsModal } from '../../components/HolidaySettingsModal';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { BrandColors } from '../../constants/theme';
import {
  cancelSupplierHoliday,
  getSupplierHolidaysForDate,
} from '../../services/holidayService';
import {
  calculateDailyStockSummary,
  deleteMilkSale,
  getAllPurchasesForDate,
  getDailyAccountHistory,
  getMonthlyAccountHistory,
  getRangeAccountHistory,
  recordMilkPurchase,
  recordMilkSale,
} from '../../services/milkTradeService';
import { generateSupplyHistoryPDF } from '../../services/pdfService';
import {
  addSupplier,
  deleteSupplier,
  getSuppliers,
  updateSupplier,
} from '../../services/supplierPurchaseService';
import {
  MilkCategory,
  MilkPurchase,
  MilkSession,
  RangeAccountsHistory,
  Supplier,
} from '../../types';
import { addDays, formatDisplayDate, getMonthName, getTodayKolkata } from '../../utils/date';

export default function SupplierScreen() {
  // Navigation tab within Supply page: 'buy' vs 'sell'
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKolkata());

  // Interactive Calendar Date Picker Modal State
  const [calendarPickerVisible, setCalendarPickerVisible] = useState(false);
  const [calendarTargetField, setCalendarTargetField] = useState<
    'main' | 'buy' | 'history_daily' | 'custom_start' | 'custom_end'
  >('main');

  // Supply History Modal & Tabs State: 'daily' | 'monthly' | 'custom'
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyTab, setHistoryTab] = useState<'daily' | 'monthly' | 'custom'>('daily');

  // Daily History states
  const [historyDate, setHistoryDate] = useState<string>(getTodayKolkata());
  const [dailyHistoryData, setDailyHistoryData] = useState<RangeAccountsHistory | null>(null);
  const [loadingDailyHistory, setLoadingDailyHistory] = useState(false);

  // Monthly History states
  const [monthlyYear, setMonthlyYear] = useState<number>(() => {
    const today = getTodayKolkata();
    return parseInt(today.split('-')[0], 10);
  });
  const [monthlyMonth, setMonthlyMonth] = useState<number>(() => {
    const today = getTodayKolkata();
    return parseInt(today.split('-')[1], 10);
  });
  const [monthlyHistoryData, setMonthlyHistoryData] = useState<RangeAccountsHistory | null>(null);
  const [loadingMonthlyHistory, setLoadingMonthlyHistory] = useState(false);
  const [expandedMonthlyDates, setExpandedMonthlyDates] = useState<Set<string>>(new Set());

  // Custom History states
  const [customStartDate, setCustomStartDate] = useState<string>(getTodayKolkata());
  const [customEndDate, setCustomEndDate] = useState<string>(getTodayKolkata());
  const [customHistoryData, setCustomHistoryData] = useState<RangeAccountsHistory | null>(null);
  const [loadingCustomHistory, setLoadingCustomHistory] = useState(false);

  // PDF Export state
  const [generatingPDF, setGeneratingPDF] = useState(false);

  // Data states
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<MilkPurchase[]>([]);
  const [supplierHolidays, setSupplierHolidays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [permissionError, setPermissionError] = useState(false);

  // Search filter for suppliers
  const [searchQuery, setSearchQuery] = useState('');

  // Settings / Holiday Modal State
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  // 1. Supply Registration Modal State (ONLY Supplier Name and Phone Number)
  const [supplierModalVisible, setSupplierModalVisible] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierError, setSupplierError] = useState('');

  // 2. Buy Modal State (Milk Purchase with selectable Milk Category & Session)
  const [buyModalVisible, setBuyModalVisible] = useState(false);
  const [buyTargetSupplier, setBuyTargetSupplier] = useState<Supplier | null>(null);
  const [buyDate, setBuyDate] = useState<string>(getTodayKolkata());
  const [buyMilkCategory, setBuyMilkCategory] = useState<MilkCategory>('buffalo');
  const [buySession, setBuySession] = useState<MilkSession>('morning');
  const [buyQuantityStr, setBuyQuantityStr] = useState('');
  const [buyPriceStr, setBuyPriceStr] = useState('80');
  const [savingBuy, setSavingBuy] = useState(false);
  const [buyError, setBuyError] = useState('');
  const [buySuccess, setBuySuccess] = useState('');

  // 3. Purchase Sales Details Modal State (Triggered on clicking purchase in Sell tab)
  const [salesDetailsModalVisible, setSalesDetailsModalVisible] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<MilkPurchase | null>(null);
  const [newSaleQtyStr, setNewSaleQtyStr] = useState('');
  const [savingSaleEntry, setSavingSaleEntry] = useState(false);
  const [saleEntryError, setSaleEntryError] = useState('');
  const [saleEntrySuccess, setSaleEntrySuccess] = useState('');

  // Load all supply data from Firestore
  const loadData = useCallback(async () => {
    try {
      const targetDate = selectedDate;
      const [supData, hols, pData] = await Promise.all([
        getSuppliers(),
        getSupplierHolidaysForDate(targetDate),
        getAllPurchasesForDate(targetDate),
      ]);
      setSuppliers(supData);
      setSupplierHolidays(hols);
      setPurchases(pData);
      setPermissionError(false);
    } catch (err: any) {
      if (err?.code === 'permission-denied' || err?.message?.includes('insufficient permissions')) {
        setPermissionError(true);
      }
      console.warn('Could not load supply data:', err?.message || err);
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

  // 1. Load complete daily history for selected history date
  const loadDailyHistory = useCallback(async (targetDate: string) => {
    setLoadingDailyHistory(true);
    try {
      const history = await getDailyAccountHistory(targetDate);
      setDailyHistoryData(history);
    } catch (err) {
      console.error('Failed to load daily accounts history:', err);
    } finally {
      setLoadingDailyHistory(false);
    }
  }, []);

  // 2. Load complete monthly history for selected month & year
  const loadMonthlyHistory = useCallback(async (year: number, month: number) => {
    setLoadingMonthlyHistory(true);
    try {
      const history = await getMonthlyAccountHistory(year, month);
      setMonthlyHistoryData(history);
    } catch (err) {
      console.error('Failed to load monthly accounts history:', err);
    } finally {
      setLoadingMonthlyHistory(false);
    }
  }, []);

  // 3. Load complete custom date range history
  const loadCustomHistory = useCallback(async (startDate: string, endDate: string) => {
    setLoadingCustomHistory(true);
    try {
      const history = await getRangeAccountHistory(startDate, endDate);
      setCustomHistoryData(history);
    } catch (err) {
      console.error('Failed to load custom accounts history:', err);
    } finally {
      setLoadingCustomHistory(false);
    }
  }, []);

  // Open History modal (loads daily, monthly, and custom range)
  const handleOpenHistory = () => {
    setHistoryTab('daily');
    setHistoryDate(selectedDate);
    loadDailyHistory(selectedDate);

    const parts = selectedDate.split('-');
    const yr = parseInt(parts[0], 10);
    const mo = parseInt(parts[1], 10);
    setMonthlyYear(yr);
    setMonthlyMonth(mo);
    loadMonthlyHistory(yr, mo);

    setCustomStartDate(selectedDate);
    setCustomEndDate(selectedDate);
    loadCustomHistory(selectedDate, selectedDate);

    setHistoryModalVisible(true);
  };

  // Month navigation helpers for Monthly History
  const handlePrevMonth = () => {
    let newM = monthlyMonth - 1;
    let newY = monthlyYear;
    if (newM < 1) {
      newM = 12;
      newY -= 1;
    }
    setMonthlyMonth(newM);
    setMonthlyYear(newY);
    loadMonthlyHistory(newY, newM);
  };

  const handleNextMonth = () => {
    let newM = monthlyMonth + 1;
    let newY = monthlyYear;
    if (newM > 12) {
      newM = 1;
      newY += 1;
    }
    setMonthlyMonth(newM);
    setMonthlyYear(newY);
    loadMonthlyHistory(newY, newM);
  };

  // Expand / collapse individual dates in Monthly History
  const toggleDateExpanded = (dateStr: string) => {
    setExpandedMonthlyDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) {
        next.delete(dateStr);
      } else {
        next.add(dateStr);
      }
      return next;
    });
  };

  // PDF Export for Daily, Monthly, and Custom History
  const handleDownloadPDF = async (reportType: 'daily' | 'monthly' | 'custom') => {
    const data =
      reportType === 'daily'
        ? dailyHistoryData
        : reportType === 'monthly'
          ? monthlyHistoryData
          : customHistoryData;

    if (!data || data.transactions.length === 0) {
      Alert.alert(
        'No Records to Export',
        `No purchase or sales records found for the selected ${reportType} period.`
      );
      return;
    }

    setGeneratingPDF(true);
    try {
      await generateSupplyHistoryPDF(data, reportType);
    } catch (err: any) {
      console.error('PDF export failed:', err);
      Alert.alert('PDF Export Error', err?.message || 'Failed to generate PDF.');
    } finally {
      setGeneratingPDF(false);
    }
  };

  // --- Supply Registration Handlers (ONLY Supplier Name and Phone Number) ---
  const handleOpenAddSupplier = () => {
    setEditingSupplier(null);
    setSupplierName('');
    setSupplierPhone('');
    setSupplierError('');
    setSupplierModalVisible(true);
  };

  const handleOpenEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setSupplierName(supplier.name);
    setSupplierPhone(supplier.phone);
    setSupplierError('');
    setSupplierModalVisible(true);
  };

  const promptDeleteSupplier = (supplier: Supplier) => {
    Alert.alert(
      'Delete Supplier',
      `Are you sure you want to delete this supplier?\n\nThis action may also permanently delete all associated purchase history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSupplier(supplier.id, true);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete supplier.');
            }
          },
        },
      ]
    );
  };

  const handleSaveSupplier = async () => {
    if (!supplierName.trim()) {
      setSupplierError('Supplier name is required.');
      return;
    }
    const cleanPhone = supplierPhone.trim();
    if (!cleanPhone || cleanPhone.length < 10) {
      setSupplierError('Please enter a valid 10-digit phone number.');
      return;
    }

    setSavingSupplier(true);
    setSupplierError('');

    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, {
          name: supplierName.trim(),
          phone: cleanPhone,
        });
      } else {
        await addSupplier(supplierName.trim(), cleanPhone);
      }

      setSupplierModalVisible(false);
      await loadData();
    } catch (err: any) {
      setSupplierError(err?.message || 'Failed to save supplier.');
    } finally {
      setSavingSupplier(false);
    }
  };

  // --- Buy Tab Handlers (Multiple Purchases per day supported) ---
  const handleOpenBuy = (supplier: Supplier) => {
    const isHoliday = supplierHolidays.has('ALL') || supplierHolidays.has(supplier.id);
    if (isHoliday) {
      Alert.alert(
        'Supplier Unavailable',
        'This supplier is marked on holiday for today and is unavailable for purchases. Cancel holiday first to buy milk.'
      );
      return;
    }

    setBuyTargetSupplier(supplier);
    setBuyDate(selectedDate);
    setBuyMilkCategory('buffalo');
    setBuySession('morning');
    setBuyQuantityStr('');
    setBuyPriceStr('80');
    setBuyError('');
    setBuySuccess('');
    setBuyModalVisible(true);
  };

  const buyNumericQty = parseFloat(buyQuantityStr) || 0;
  const buyNumericPrice = parseFloat(buyPriceStr) || 0;
  const buyAutoTotalAmount = Number((Math.max(0, buyNumericQty) * Math.max(0, buyNumericPrice)).toFixed(2));

  const handleSaveBuy = async () => {
    if (!buyTargetSupplier) return;
    if (buyNumericQty <= 0) {
      setBuyError('Milk quantity must be greater than 0 Litres.');
      return;
    }
    if (buyNumericPrice <= 0) {
      setBuyError('Purchase rate per litre must be greater than ₹0.');
      return;
    }

    setSavingBuy(true);
    setBuyError('');

    try {
      await recordMilkPurchase({
        supplierId: buyTargetSupplier.id,
        supplierName: buyTargetSupplier.name,
        supplierPhone: buyTargetSupplier.phone,
        milkCategory: buyMilkCategory,
        session: buySession,
        purchaseDate: buyDate,
        quantityLiters: buyNumericQty,
        pricePerLiter: buyNumericPrice,
      });

      setBuySuccess(
        `Recorded ${buyNumericQty}L ${buyMilkCategory === 'cow' ? 'Cow' : 'Buffalo'} Milk (${buySession}) @ ₹${buyNumericPrice}/L`
      );
      await loadData();
      setTimeout(() => {
        setBuyModalVisible(false);
        setBuySuccess('');
        setBuyTargetSupplier(null);
      }, 1000);
    } catch (err: any) {
      setBuyError(err?.message || 'Failed to save milk purchase.');
    } finally {
      setSavingBuy(false);
    }
  };

  // --- Sell Tab Handlers: Opening Purchase Entry & Managing Sales ---
  const handleOpenPurchaseSalesDetails = (purchase: MilkPurchase) => {
    setSelectedPurchase(purchase);
    // If already sold, prefill with totalSoldQuantity; otherwise empty string
    setNewSaleQtyStr(purchase.isSold && purchase.totalSoldQuantity ? purchase.totalSoldQuantity.toString() : '');
    setSaleEntryError('');
    setSaleEntrySuccess('');
    setSalesDetailsModalVisible(true);
  };

  const newSaleNumericQty = parseFloat(newSaleQtyStr) || 0;

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

      const remaining = Math.max(0, Number((selectedPurchase.quantityLiters - newSaleNumericQty).toFixed(2)));
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

  const handleCancelHoliday = (supplier: Supplier) => {
    const today = selectedDate;
    Alert.alert(
      'Cancel Supplier Holiday',
      `Do you want to cancel the holiday for ${supplier.name} for today?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await cancelSupplierHoliday(supplier.id, today);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to cancel holiday.');
            }
          },
        },
      ]
    );
  };

  // Calendar Modal Date Selected
  const handleCalendarDateSelected = (newDate: string) => {
    if (calendarTargetField === 'main') {
      setSelectedDate(newDate);
    } else if (calendarTargetField === 'buy') {
      setBuyDate(newDate);
    } else if (calendarTargetField === 'history_daily') {
      setHistoryDate(newDate);
      loadDailyHistory(newDate);
    } else if (calendarTargetField === 'custom_start') {
      setCustomStartDate(newDate);
      const end = newDate > customEndDate ? newDate : customEndDate;
      if (newDate > customEndDate) {
        setCustomEndDate(newDate);
      }
      loadCustomHistory(newDate, end);
    } else if (calendarTargetField === 'custom_end') {
      setCustomEndDate(newDate);
      const start = newDate < customStartDate ? newDate : customStartDate;
      if (newDate < customStartDate) {
        setCustomStartDate(newDate);
      }
      loadCustomHistory(start, newDate);
    }
  };

  const currentSelectedDateForModal = useMemo(() => {
    switch (calendarTargetField) {
      case 'buy':
        return buyDate;
      case 'history_daily':
        return historyDate;
      case 'custom_start':
        return customStartDate;
      case 'custom_end':
        return customEndDate;
      default:
        return selectedDate;
    }
  }, [calendarTargetField, buyDate, historyDate, customStartDate, customEndDate, selectedDate]);

  const calendarModalTitle = useMemo(() => {
    switch (calendarTargetField) {
      case 'buy':
        return 'Select Purchase Date';
      case 'history_daily':
        return 'Select Daily History Date';
      case 'custom_start':
        return 'Select Custom Start Date';
      case 'custom_end':
        return 'Select Custom End Date';
      default:
        return 'Select Date';
    }
  }, [calendarTargetField]);

  // --- Render Supplier in Buy Tab ---
  const renderBuySupplierItem = ({ item }: { item: Supplier }) => {
    const isHoliday = supplierHolidays.has('ALL') || supplierHolidays.has(item.id);
    const supPurchases = purchases.filter((p) => p.supplierId === item.id);
    const todayTotalLiters = Number(
      supPurchases.reduce((acc, p) => acc + (p.quantityLiters || 0), 0).toFixed(2)
    );
    const todayTotalAmount = Number(
      supPurchases.reduce((acc, p) => acc + (p.totalAmount || 0), 0).toFixed(2)
    );

    return (
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={styles.nameRow}>
              <View style={[styles.avatar, isHoliday && { backgroundColor: '#F59E0B' }]}>
                <MaterialCommunityIcons
                  name={isHoliday ? 'store-off' : 'account-tie'}
                  size={24}
                  color="#FFFFFF"
                />
              </View>
              <View style={styles.nameInfo}>
                <Text style={styles.supplierName}>{item.name}</Text>
                <Text style={styles.phoneText}>📞 {item.phone}</Text>
              </View>
            </View>

            <View style={styles.statusRow}>
              <IconButton
                icon="pencil-outline"
                size={18}
                iconColor={BrandColors.neutralGray}
                onPress={() => handleOpenEditSupplier(item)}
              />
              <IconButton
                icon="delete-outline"
                size={18}
                iconColor={BrandColors.danger}
                onPress={() => promptDeleteSupplier(item)}
              />
            </View>
          </View>

          {isHoliday && (
            <View style={styles.holidayBadgeContainer}>
              <View style={styles.holidayBadgeBox}>
                <Text style={styles.holidayBadgeText}>
                  🏖️ On Holiday (Unavailable for Today&apos;s Purchase)
                </Text>
              </View>
            </View>
          )}

          {/* Today's Purchases Count & Amount for this Supplier */}
          <View style={styles.todaySummaryRow}>
            <Text style={styles.todaySummaryLabel}>Purchases for {selectedDate}:</Text>
            <Text style={styles.todaySummaryValue}>
              {supPurchases.length > 0
                ? `${supPurchases.length} entry (${todayTotalLiters} L • ₹${todayTotalAmount})`
                : 'No purchases recorded'}
            </Text>
          </View>

          <Divider style={styles.divider} />

          {/* Action Button: Buy Milk */}
          <View style={styles.buttonRow}>
            {isHoliday ? (
              <Button
                mode="contained"
                icon="calendar-check"
                onPress={() => handleCancelHoliday(item)}
                style={styles.cancelHolidayBtn}
                buttonColor="#D97706"
                textColor="#FFFFFF"
                contentStyle={styles.btnContent}
              >
                Cancel Holiday
              </Button>
            ) : (
              <Button
                mode="contained"
                icon="cart-plus"
                onPress={() => handleOpenBuy(item)}
                style={styles.addMilkBtn}
                buttonColor={BrandColors.primary}
                contentStyle={styles.btnContent}
              >
                Buy Milk
              </Button>
            )}
          </View>
        </Card.Content>
      </Card>
    );
  };

  // --- Render Supplier in Sell Tab (Displays Supplier & Clickable Purchase Sessions) ---
  const renderSellSupplierItem = ({ item }: { item: Supplier }) => {
    const supPurchases = purchases.filter((p) => p.supplierId === item.id);

    return (
      <Card style={styles.card}>
        <Card.Content>
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
            <View style={styles.countBadgeBox}>
              <Text style={styles.countBadgeText}>
                {supPurchases.length} session{supPurchases.length === 1 ? '' : 's'}
              </Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          {/* Purchase Sessions List for Selected Date */}
          <Text style={styles.supplierPurchasesHeader}>
            {item.name} – Today&apos;s Purchases ({selectedDate})
          </Text>

          {supPurchases.length === 0 ? (
            <View style={styles.emptySessionBox}>
              <Text style={styles.emptySessionText}>
                No milk purchases recorded for this supplier on {formatDisplayDate(selectedDate)}.
              </Text>
            </View>
          ) : (
            <View style={styles.sessionItemsList}>
              {supPurchases.map((p) => {
                const isSold = p.isSold || (p.totalSoldQuantity != null && p.totalSoldQuantity > 0);
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
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <View style={styles.sessionTitleRow}>
                        <Text style={styles.sessionItemTitle}>
                          {sessionEmoji} {sessionName}: {p.quantityLiters} L {categoryLabel}
                        </Text>
                      </View>
                      <Text style={styles.sessionItemDetails}>
                        Purchase Rate: ₹{p.pricePerLiter.toLocaleString('en-IN')}/L • Total: ₹{p.totalAmount.toLocaleString('en-IN')}
                      </Text>
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
                    </View>

                    <View style={styles.sessionItemAction}>
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
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={20}
                        color={BrandColors.neutralGray}
                      />
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
      {/* Top Navbar with Clean Small Settings Gear Button */}
      <HeaderBar
        title="Supply"
        subtitle={`${suppliers.length} Registered Suppliers`}
        onSettingsPress={() => setSettingsModalVisible(true)}
      />

      {/* Top Action Bar: Add Supply and History side-by-side */}
      <View style={styles.topActionBar}>
        <Button
          mode="contained"
          icon="plus"
          onPress={handleOpenAddSupplier}
          style={styles.topAddSupplierBtn}
          buttonColor={BrandColors.primaryDark}
        >
          Add Supply
        </Button>
        <Button
          mode="outlined"
          icon="history"
          onPress={handleOpenHistory}
          style={styles.topHistoryBtn}
          textColor={BrandColors.primaryDark}
        >
          History
        </Button>
      </View>

      {/* Buy & Sell Navigation Tabs directly below Add Supply & History */}
      <View style={styles.tabToggleContainer}>
        <SegmentedButtons
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as 'buy' | 'sell')}
          buttons={[
            {
              value: 'buy',
              label: '🛒 Buy',
              showSelectedCheck: true,
            },
            {
              value: 'sell',
              label: '🏷️ Sell',
              showSelectedCheck: true,
            },
          ]}
          style={styles.tabSegmented}
        />
      </View>

      {/* Interactive Date Switcher Row with Calendar Modal trigger */}
      <View style={styles.dateBar}>
        <Button
          mode="text"
          compact
          icon="chevron-left"
          onPress={() => setSelectedDate((d) => addDays(d, -1))}
          textColor={BrandColors.neutralGray}
        >
          -1 Day
        </Button>

        <TouchableOpacity
          style={styles.dateSelectorTouch}
          onPress={() => {
            setCalendarTargetField('main');
            setCalendarPickerVisible(true);
          }}
        >
          <MaterialCommunityIcons name="calendar" size={16} color={BrandColors.primaryDark} />
          <Text style={styles.dateSelectorText}>{formatDisplayDate(selectedDate)}</Text>
          <MaterialCommunityIcons name="chevron-down" size={14} color={BrandColors.neutralGray} />
        </TouchableOpacity>

        <Button
          mode="text"
          compact
          contentStyle={{ flexDirection: 'row-reverse' }}
          icon="chevron-right"
          onPress={() => setSelectedDate((d) => addDays(d, 1))}
          textColor={BrandColors.neutralGray}
        >
          +1 Day
        </Button>
      </View>

      {/* Supplier Search Bar */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search supplier name or phone..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
          inputStyle={styles.searchbarInput}
          iconColor={BrandColors.neutralGray}
          clearIcon={searchQuery ? 'close-circle' : undefined}
          onClearIconPress={() => setSearchQuery('')}
        />
      </View>

      {permissionError && (
        <View style={styles.permissionBanner}>
          <MaterialCommunityIcons name="shield-alert-outline" size={20} color={BrandColors.danger} />
          <Text style={styles.permissionText}>
            Firebase permission denied. Check your Firestore Security Rules.
          </Text>
        </View>
      )}

      {loading ? (
        <LoadingIndicator message="Loading supply data..." />
      ) : activeTab === 'buy' ? (
        /* --- BUY TAB VIEW --- */
        <FlatList
          data={filteredSuppliers}
          keyExtractor={(item) => item.id}
          renderItem={renderBuySupplierItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[BrandColors.primary]}
            />
          }
          ListHeaderComponent={
            <View style={styles.sectionHeaderBox}>
              <Text style={styles.sectionTitle}>Milk Purchase (Buy)</Text>
              <Text style={styles.sectionSubtitle}>
                Select a supplier to record purchases with Buffalo/Cow milk and session
              </Text>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="truck-delivery-outline"
              title={searchQuery ? 'No Matching Suppliers' : 'No Suppliers Registered'}
              description={
                searchQuery
                  ? `No supplier matched "${searchQuery}".`
                  : "Click 'Add Supply' above to register your first supplier."
              }
            />
          }
        />
      ) : (
        /* --- SELL TAB VIEW --- */
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
                <Card.Content>
                  <Text style={styles.kpiHeaderTitle}>Today&apos;s Milk Stock &amp; Sales</Text>
                  <Text style={styles.kpiHeaderDate}>Date: {formatDisplayDate(selectedDate)}</Text>

                  <View style={styles.kpiRow}>
                    <View style={styles.kpiBox}>
                      <Text style={styles.kpiLabel}>Total Purchased</Text>
                      <Text style={[styles.kpiValue, { color: BrandColors.primaryDark }]}>
                        {stockSummary.overall.totalPurchasedLiters} L
                      </Text>
                    </View>

                    <View style={styles.kpiBox}>
                      <Text style={styles.kpiLabel}>Milk Sold</Text>
                      <Text style={[styles.kpiValue, { color: BrandColors.success }]}>
                        {stockSummary.overall.totalSoldLiters} L
                      </Text>
                    </View>

                    <View style={styles.kpiBox}>
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
                        <MaterialCommunityIcons name="check-decagram" size={20} color={BrandColors.success} />
                        <Text style={styles.noLossBannerText}>Status: No Remaining Milk</Text>
                      </View>
                    ) : (
                      <View style={styles.lossBanner}>
                        <MaterialCommunityIcons name="clock-alert-outline" size={20} color="#D97706" />
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
                        Purchased: <Text style={styles.boldText}>{stockSummary.overall.buffalo.purchasedLiters} L</Text>
                      </Text>
                      <Text style={styles.categoryStat}>
                        Sold: <Text style={[styles.boldText, { color: BrandColors.success }]}>{stockSummary.overall.buffalo.soldLiters} L</Text>
                      </Text>
                      <Text style={styles.categoryStat}>
                        Remaining: <Text style={[styles.boldText, { color: stockSummary.overall.buffalo.remainingLiters === 0 ? BrandColors.success : '#D97706' }]}>{stockSummary.overall.buffalo.remainingLiters} L</Text>
                      </Text>
                    </View>

                    {/* Cow Stock Card */}
                    <View style={styles.categoryCard}>
                      <Text style={styles.categoryTitle}>🐄 Cow Milk</Text>
                      <Text style={styles.categoryStat}>
                        Purchased: <Text style={styles.boldText}>{stockSummary.overall.cow.purchasedLiters} L</Text>
                      </Text>
                      <Text style={styles.categoryStat}>
                        Sold: <Text style={[styles.boldText, { color: BrandColors.success }]}>{stockSummary.overall.cow.soldLiters} L</Text>
                      </Text>
                      <Text style={styles.categoryStat}>
                        Remaining: <Text style={[styles.boldText, { color: stockSummary.overall.cow.remainingLiters === 0 ? BrandColors.success : '#D97706' }]}>{stockSummary.overall.cow.remainingLiters} L</Text>
                      </Text>
                    </View>
                  </View>
                </Card.Content>
              </Card>

              <View style={styles.sectionHeaderBox}>
                <Text style={styles.sectionTitle}>Supplier Purchases &amp; Milk Sales</Text>
                <Text style={styles.sectionSubtitle}>
                  Click any purchase session entry to view and record its sales
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="tag-outline"
              title={searchQuery ? 'No Matching Suppliers' : 'No Suppliers Found'}
              description={
                searchQuery
                  ? `No supplier matched "${searchQuery}".`
                  : 'Register suppliers to track milk stock and sales.'
              }
            />
          }
        />
      )}

      {/* Shared Settings & Holiday Modal (All Holiday / Custom Holiday) */}
      <HolidaySettingsModal
        visible={settingsModalVisible}
        onDismiss={() => setSettingsModalVisible(false)}
        onHolidaysUpdated={loadData}
      />

      {/* 1. Supply Registration Modal (ONLY Supplier Name and Phone Number) */}
      <Portal>
        <Modal
          visible={supplierModalVisible}
          onDismiss={() => setSupplierModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Text style={styles.modalTitle}>
              {editingSupplier ? 'Edit Supplier' : 'Register New Supplier'}
            </Text>
            <Text style={styles.modalSubtitle}>
              Enter supplier contact information
            </Text>

            {supplierError ? (
              <HelperText type="error" visible style={styles.helperText}>
                {supplierError}
              </HelperText>
            ) : null}

            {/* Field 1: Supplier Name */}
            <TextInput
              label="Supplier Name *"
              value={supplierName}
              onChangeText={(t) => {
                setSupplierName(t);
                setSupplierError('');
              }}
              mode="outlined"
              style={styles.input}
              placeholder="e.g. Rahul"
              left={<TextInput.Icon icon="account" />}
            />

            {/* Field 2: Phone Number */}
            <TextInput
              label="Phone Number *"
              value={supplierPhone}
              onChangeText={(t) => {
                setSupplierPhone(t);
                setSupplierError('');
              }}
              mode="outlined"
              keyboardType="phone-pad"
              style={styles.input}
              placeholder="e.g. 9876543210"
              left={<TextInput.Icon icon="phone" />}
            />

            <View style={styles.modalActions}>
              <Button
                mode="text"
                onPress={() => setSupplierModalVisible(false)}
                disabled={savingSupplier}
                textColor={BrandColors.neutralGray}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleSaveSupplier}
                loading={savingSupplier}
                disabled={savingSupplier}
                buttonColor={BrandColors.primaryDark}
              >
                {editingSupplier ? 'Update Supplier' : 'Save Supplier'}
              </Button>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>

      {/* 2. Buy Modal (Milk Purchase Entry with Multiple Purchases Support) */}
      <Portal>
        <Modal
          visible={buyModalVisible}
          onDismiss={() => setBuyModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Milk Purchase (Buy)</Text>
                <Text style={styles.modalSubtitle}>
                  Record milk purchase transaction for {buyTargetSupplier?.name}
                </Text>
              </View>
              <IconButton
                icon="close"
                size={20}
                onPress={() => setBuyModalVisible(false)}
                accessibilityLabel="Close Milk Purchase"
              />
            </View>

            {buyError ? (
              <HelperText type="error" visible style={styles.helperText}>
                {buyError}
              </HelperText>
            ) : null}

            {buySuccess ? (
              <HelperText type="info" visible style={[styles.helperText, { color: BrandColors.success }]}>
                {buySuccess}
              </HelperText>
            ) : null}

            {/* Auto-filled Supplier Name */}
            <TextInput
              label="Supplier Name"
              value={buyTargetSupplier?.name || ''}
              mode="outlined"
              disabled
              style={styles.input}
              left={<TextInput.Icon icon="account" />}
            />

            {/* Auto-filled Phone Number */}
            <TextInput
              label="Phone Number"
              value={buyTargetSupplier?.phone || ''}
              mode="outlined"
              disabled
              style={styles.input}
              left={<TextInput.Icon icon="phone" />}
            />

            {/* Interactive Calendar Date Picker for Purchase Date */}
            <View style={styles.sectionBlock}>
              <Text style={styles.fieldLabel}>Purchase Date *</Text>
              <TouchableOpacity
                style={styles.interactiveDateBox}
                onPress={() => {
                  setCalendarTargetField('buy');
                  setCalendarPickerVisible(true);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.interactiveDateLeft}>
                  <MaterialCommunityIcons name="calendar" size={20} color={BrandColors.primaryDark} />
                  <Text style={styles.interactiveDateText}>{formatDisplayDate(buyDate)} ({buyDate})</Text>
                </View>
                <View style={styles.changeDateBadge}>
                  <Text style={styles.changeDateBadgeText}>Change</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Selectable Milk Category: Buffalo Milk / Cow Milk */}
            <View style={styles.sectionBlock}>
              <Text style={styles.fieldLabel}>Milk Category *</Text>
              <SegmentedButtons
                value={buyMilkCategory}
                onValueChange={(val) => setBuyMilkCategory(val as MilkCategory)}
                buttons={[
                  { value: 'buffalo', label: '🐃 Buffalo Milk', showSelectedCheck: true },
                  { value: 'cow', label: '🐄 Cow Milk', showSelectedCheck: true },
                ]}
                style={styles.segmented}
              />
            </View>

            {/* Selectable Purchase Session: Morning / Afternoon / Evening */}
            <View style={styles.sectionBlock}>
              <Text style={styles.fieldLabel}>Purchase Session *</Text>
              <SegmentedButtons
                value={buySession}
                onValueChange={(val) => setBuySession(val as MilkSession)}
                buttons={[
                  { value: 'morning', label: '🌅 Morning', showSelectedCheck: true },
                  { value: 'afternoon', label: '☀️ Afternoon', showSelectedCheck: true },
                  { value: 'evening', label: '🌇 Evening', showSelectedCheck: true },
                ]}
                style={styles.segmented}
              />
            </View>

            {/* Milk Quantity (Litres) */}
            <TextInput
              label="Milk Quantity in Litres *"
              value={buyQuantityStr}
              onChangeText={(t) => {
                setBuyQuantityStr(t);
                setBuyError('');
              }}
              mode="outlined"
              keyboardType="decimal-pad"
              style={styles.input}
              placeholder="e.g. 100"
              left={<TextInput.Icon icon="cup-water" />}
              right={<TextInput.Affix text="Litres" />}
            />

            {/* Purchase Rate (₹ per litre) */}
            <TextInput
              label="Purchase Rate (₹ per litre) *"
              value={buyPriceStr}
              onChangeText={(t) => {
                setBuyPriceStr(t);
                setBuyError('');
              }}
              mode="outlined"
              keyboardType="decimal-pad"
              style={styles.input}
              placeholder="e.g. 80"
              left={<TextInput.Icon icon="currency-inr" />}
              right={<TextInput.Affix text="₹/L" />}
            />

            {/* Auto Calculated Total Purchase Amount */}
            <View style={styles.calcBox}>
              <Text style={styles.calcLabel}>Total Purchase Amount:</Text>
              <Text style={styles.calcFormula}>
                {buyNumericQty} Litres × ₹{buyNumericPrice}
              </Text>
              <Text style={styles.calcValue}>₹{buyAutoTotalAmount.toLocaleString('en-IN')}</Text>
            </View>

            <View style={styles.modalActions}>
              <Button
                mode="text"
                onPress={() => setBuyModalVisible(false)}
                disabled={savingBuy}
                textColor={BrandColors.neutralGray}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleSaveBuy}
                loading={savingBuy}
                disabled={savingBuy}
                buttonColor={BrandColors.primaryDark}
              >
                Save Purchase
              </Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>

      {/* 3. Sales Details Modal (Opened on clicking a specific purchase entry in Sell Tab) */}
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
                    {selectedPurchase.supplierName} • {formatDisplayDate(selectedPurchase.purchaseDate)}
                  </Text>
                </View>
                <IconButton icon="close" size={20} onPress={() => setSalesDetailsModalVisible(false)} />
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
                    {selectedPurchase.session.charAt(0).toUpperCase() + selectedPurchase.session.slice(1)}
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
                  <Text style={styles.infoBannerValBold}>₹{selectedPurchase.pricePerLiter.toLocaleString('en-IN')}</Text>
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
                    <MaterialCommunityIcons name="check-circle" size={20} color={BrandColors.success} />
                    <Text style={styles.soldBadgeText}>Sale Completed &amp; Permanently Recorded</Text>
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
                        { color: (selectedPurchase.remainingQuantity || 0) === 0 ? BrandColors.success : BrandColors.danger },
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
                        { color: (selectedPurchase.remainingQuantity || 0) === 0 ? BrandColors.success : BrandColors.danger },
                      ]}
                    >
                      ₹{Number(((selectedPurchase.remainingQuantity || 0) * selectedPurchase.pricePerLiter).toFixed(2)).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={styles.infoBannerRow}>
                    <Text style={styles.infoBannerLabel}>Status:</Text>
                    <Text
                      style={[
                        styles.infoBannerValBold,
                        { color: (selectedPurchase.remainingQuantity || 0) === 0 ? BrandColors.success : BrandColors.danger },
                      ]}
                    >
                      {(selectedPurchase.remainingQuantity || 0) === 0
                        ? 'No Loss'
                        : `${selectedPurchase.remainingQuantity} Litres Wasted`}
                    </Text>
                  </View>

                  <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Button
                      mode="text"
                      icon="refresh"
                      textColor={BrandColors.danger}
                      onPress={() => handleResetSale(selectedPurchase)}
                    >
                      Reset Sale
                    </Button>
                    <Button
                      mode="contained"
                      onPress={() => setSalesDetailsModalVisible(false)}
                      buttonColor={BrandColors.primaryDark}
                    >
                      Close
                    </Button>
                  </View>
                </View>
              ) : (
                /* --- RECORD SALE: ONLY ONE INPUT FIELD --- */
                <View style={styles.recordSaleFormBox}>
                  <Text style={styles.subSectionTitle}>Record Milk Sale</Text>
                  <Text style={styles.subSectionSubtitle}>
                    Enter the sold milk quantity for this {selectedPurchase.quantityLiters}L purchase
                  </Text>

                  {saleEntryError ? (
                    <HelperText type="error" visible style={styles.helperText}>
                      {saleEntryError}
                    </HelperText>
                  ) : null}
                  {saleEntrySuccess ? (
                    <HelperText type="info" visible style={[styles.helperText, { color: BrandColors.success }]}>
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
                    placeholder={`e.g. ${selectedPurchase.quantityLiters}`}
                    left={<TextInput.Icon icon="cup-water" />}
                    right={<TextInput.Affix text="Litres" />}
                  />

                  {/* Live Calculation Preview */}
                  {newSaleQtyStr.trim() !== '' && !isNaN(newSaleNumericQty) && newSaleNumericQty >= 0 ? (() => {
                    const liveWastedQty = Math.max(0, Number((selectedPurchase.quantityLiters - newSaleNumericQty).toFixed(2)));
                    const liveWasteOfMoney = Number((liveWastedQty * selectedPurchase.pricePerLiter).toFixed(2));
                    const liveIsNoLoss = liveWastedQty === 0;

                    return (
                      <View style={styles.liveCalculationBox}>
                        <View style={styles.liveCalcRow}>
                          <Text style={styles.liveCalcLabel}>Waste of Milk:</Text>
                          <Text
                            style={[
                              styles.liveCalcVal,
                              { color: liveIsNoLoss ? BrandColors.success : BrandColors.danger },
                            ]}
                          >
                            {liveWastedQty} Litres
                          </Text>
                        </View>
                        <View style={styles.liveCalcRow}>
                          <Text style={styles.liveCalcLabel}>Waste of Money:</Text>
                          <Text
                            style={[
                              styles.liveCalcVal,
                              { color: liveIsNoLoss ? BrandColors.success : BrandColors.danger },
                            ]}
                          >
                            ₹{liveWasteOfMoney.toLocaleString('en-IN')}
                          </Text>
                        </View>
                        <View style={styles.liveCalcRow}>
                          <Text style={styles.liveCalcLabel}>Status:</Text>
                          <Text
                            style={[
                              styles.liveCalcVal,
                              { color: liveIsNoLoss ? BrandColors.success : BrandColors.danger },
                            ]}
                          >
                            {liveIsNoLoss ? 'No Loss' : `${liveWastedQty} Litres Wasted`}
                          </Text>
                        </View>
                      </View>
                    );
                  })() : null}

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
                      icon="check"
                      onPress={handleSaveNewSaleEntry}
                      loading={savingSaleEntry}
                      disabled={
                        savingSaleEntry ||
                        newSaleNumericQty <= 0 ||
                        newSaleNumericQty > selectedPurchase.quantityLiters
                      }
                      buttonColor={BrandColors.success}
                    >
                      Save Sale
                    </Button>
                  </View>
                </View>
              )}
            </ScrollView>
          )}
        </Modal>
      </Portal>

      {/* 4. Complete Supply & Sales Records History Modal (Daily / Monthly / Custom) */}
      <Portal>
        <Modal
          visible={historyModalVisible}
          onDismiss={() => setHistoryModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { maxHeight: '92%', height: '90%' }]}
        >
          <View style={styles.modalHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Supply &amp; Sales History</Text>
              <Text style={styles.modalSubtitle}>Daily, Monthly &amp; Custom Account Records</Text>
            </View>
            <IconButton
              icon="close"
              size={20}
              onPress={() => setHistoryModalVisible(false)}
              accessibilityLabel="Close History"
            />
          </View>

          {/* Three History Tabs at Top */}
          <SegmentedButtons
            value={historyTab}
            onValueChange={(val) => setHistoryTab(val as 'daily' | 'monthly' | 'custom')}
            buttons={[
              { value: 'daily', label: 'Daily History' },
              { value: 'monthly', label: 'Monthly History' },
              { value: 'custom', label: 'Custom History' },
            ]}
            style={{ marginBottom: 10 }}
          />

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* ========================================================= */}
            {/* TAB 1: DAILY HISTORY                                      */}
            {/* ========================================================= */}
            {historyTab === 'daily' && (
              <View>
                {/* Date Switcher: -1 Day, Interactive Date, +1 Day */}
                <View style={styles.historyDateSelectorRow}>
                  <Button
                    mode="text"
                    compact
                    icon="chevron-left"
                    onPress={() => {
                      const prev = addDays(historyDate, -1);
                      setHistoryDate(prev);
                      loadDailyHistory(prev);
                    }}
                  >
                    -1 Day
                  </Button>
                  <TouchableOpacity
                    style={styles.historyDateChip}
                    onPress={() => {
                      setCalendarTargetField('history_daily');
                      setCalendarPickerVisible(true);
                    }}
                  >
                    <MaterialCommunityIcons name="calendar" size={16} color={BrandColors.primaryDark} />
                    <Text style={styles.historyDateChipText}>{formatDisplayDate(historyDate)}</Text>
                    <MaterialCommunityIcons name="chevron-down" size={14} color={BrandColors.neutralGray} />
                  </TouchableOpacity>
                  <Button
                    mode="text"
                    compact
                    contentStyle={{ flexDirection: 'row-reverse' }}
                    icon="chevron-right"
                    onPress={() => {
                      const next = addDays(historyDate, 1);
                      setHistoryDate(next);
                      loadDailyHistory(next);
                    }}
                  >
                    +1 Day
                  </Button>
                </View>

                {/* PDF Download Button */}
                <Button
                  mode="contained"
                  icon="file-pdf-box"
                  onPress={() => handleDownloadPDF('daily')}
                  loading={generatingPDF}
                  disabled={generatingPDF || !dailyHistoryData || dailyHistoryData.transactions.length === 0}
                  buttonColor="#DC2626"
                  style={styles.downloadPdfBtn}
                >
                  Download Daily PDF
                </Button>

                {loadingDailyHistory ? (
                  <LoadingIndicator message="Loading daily history..." />
                ) : !dailyHistoryData || dailyHistoryData.transactions.length === 0 ? (
                  <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                    <MaterialCommunityIcons name="history" size={48} color={BrandColors.neutralGray} />
                    <Text style={{ marginTop: 8, color: BrandColors.neutralGray, textAlign: 'center' }}>
                      No supply or sales records found for {formatDisplayDate(historyDate)}.
                    </Text>
                  </View>
                ) : (
                  <View>
                    {/* Day Financial & Quantity Summary Card */}
                    <View style={styles.historyDaySummaryCard}>
                      <Text style={styles.historyDaySummaryTitle}>Summary for {formatDisplayDate(historyDate)}</Text>
                      <View style={styles.historyDayStatsRow}>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Purchased</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.primaryDark }]}>
                            {dailyHistoryData.totalPurchasedLiters} L
                          </Text>
                          <Text style={styles.historyStatSub}>₹{dailyHistoryData.totalPurchaseAmount.toLocaleString('en-IN')}</Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Sold</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.success }]}>
                            {dailyHistoryData.totalSoldLiters} L
                          </Text>
                          <Text style={styles.historyStatSub}>₹{dailyHistoryData.totalSalesRevenue.toLocaleString('en-IN')}</Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Remaining</Text>
                          <Text
                            style={[
                              styles.historyStatVal,
                              {
                                color: dailyHistoryData.totalRemainingLiters === 0 ? BrandColors.success : '#D97706',
                              },
                            ]}
                          >
                            {dailyHistoryData.totalRemainingLiters} L
                          </Text>
                          <Text style={styles.historyStatSub}>
                            {dailyHistoryData.totalRemainingLiters === 0 ? 'No Loss' : 'In Stock'}
                          </Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Waste of Money</Text>
                          <Text
                            style={[
                              styles.historyStatVal,
                              {
                                color: dailyHistoryData.totalLossAmount === 0 ? BrandColors.success : BrandColors.danger,
                              },
                            ]}
                          >
                            ₹{dailyHistoryData.totalLossAmount.toLocaleString('en-IN')}
                          </Text>
                          <Text
                            style={[
                              styles.historyStatSub,
                              {
                                color: dailyHistoryData.totalLossAmount === 0 ? BrandColors.success : BrandColors.danger,
                              },
                            ]}
                          >
                            Waste: {dailyHistoryData.totalWastageLiters} L
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Buffalo vs Cow Category Summary */}
                    <View style={styles.categorySummaryCard}>
                      <Text style={styles.categorySummaryTitle}>Milk Category Breakdown</Text>
                      <View style={styles.categorySummaryRow}>
                        <View style={styles.categoryBox}>
                          <Text style={{ fontWeight: '700', color: BrandColors.textLight }}>🐃 Buffalo Milk</Text>
                          <Text style={styles.categoryStat}>
                            Purchased: <Text style={styles.boldText}>{dailyHistoryData.buffaloPurchased} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Sold: <Text style={[styles.boldText, { color: BrandColors.success }]}>{dailyHistoryData.buffaloSold} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Remaining: <Text style={[styles.boldText, { color: dailyHistoryData.buffaloRemaining === 0 ? BrandColors.success : '#D97706' }]}>{dailyHistoryData.buffaloRemaining} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Cost: <Text style={styles.boldText}>₹{dailyHistoryData.buffaloPurchaseAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                        </View>
                        <View style={styles.categoryBox}>
                          <Text style={{ fontWeight: '700', color: BrandColors.textLight }}>🐄 Cow Milk</Text>
                          <Text style={styles.categoryStat}>
                            Purchased: <Text style={styles.boldText}>{dailyHistoryData.cowPurchased} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Sold: <Text style={[styles.boldText, { color: BrandColors.success }]}>{dailyHistoryData.cowSold} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Remaining: <Text style={[styles.boldText, { color: dailyHistoryData.cowRemaining === 0 ? BrandColors.success : '#D97706' }]}>{dailyHistoryData.cowRemaining} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Cost: <Text style={styles.boldText}>₹{dailyHistoryData.cowPurchaseAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Supplier-wise and Session-wise Transactions */}
                    <Text style={[styles.subSectionTitle, { marginBottom: 8 }]}>
                      Supplier-Wise Accounts ({dailyHistoryData.suppliers.length})
                    </Text>
                    {dailyHistoryData.suppliers.map((supHistory) => (
                      <View key={supHistory.supplierId} style={styles.supHistoryCard}>
                        <View style={styles.supHistoryHeader}>
                          <Text style={styles.supHistoryName}>{supHistory.supplierName}</Text>
                          <Text style={styles.supHistoryPhone}>📞 {supHistory.supplierPhone}</Text>
                        </View>
                        <Text style={styles.supHistoryDayTotals}>
                          Purchased: {supHistory.totalPurchasedLiters}L (₹{supHistory.totalPurchaseAmount.toLocaleString('en-IN')}) • Sold: {supHistory.totalSoldLiters}L • Waste of Milk: {supHistory.totalWastageLiters}L • Waste of Money: ₹{supHistory.totalLossAmount.toLocaleString('en-IN')}
                        </Text>

                        <Divider style={{ marginVertical: 8 }} />

                        {/* Sessions & Transactions List */}
                        {supHistory.sessions.map((sess) => (
                          <View key={sess.session} style={styles.sessionHistoryBlock}>
                            {sess.purchases.map((p) => {
                              const sessionName = p.session.charAt(0).toUpperCase() + p.session.slice(1);
                              const categoryName = p.milkCategory === 'cow' ? 'Cow Milk' : 'Buffalo Milk';
                              const historyHeader = `${sessionName} – ${p.supplierName} – ${categoryName}`;
                              const isNoLoss = p.actualWastageQuantity === 0;

                              return (
                                <View key={p.id} style={styles.historyPurchaseCardItem}>
                                  <View style={styles.historyCardHeader}>
                                    <Text style={styles.historyCardTitle}>{historyHeader}</Text>
                                    <View
                                      style={[
                                        styles.historyStatusBadge,
                                        {
                                          backgroundColor: isNoLoss ? '#ECFDF5' : '#FEF2F2',
                                          borderColor: isNoLoss ? '#A7F3D0' : '#FECACA',
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.historyStatusBadgeText,
                                          {
                                            color: isNoLoss ? BrandColors.success : BrandColors.danger,
                                          },
                                        ]}
                                      >
                                        {isNoLoss ? '✓ No Loss' : `${p.actualWastageQuantity}L Wasted`}
                                      </Text>
                                    </View>
                                  </View>

                                  <View style={styles.historyBulletsBox}>
                                    <Text style={styles.historyBulletLine}>
                                      • Purchased: <Text style={styles.boldText}>{p.quantityLiters} Litres</Text>
                                    </Text>
                                    <Text style={styles.historyBulletLine}>
                                      • Purchase Rate: <Text style={styles.boldText}>₹{p.pricePerLiter.toLocaleString('en-IN')}/Litre</Text>
                                    </Text>
                                    <Text style={styles.historyBulletLine}>
                                      • Total Purchase Amount: <Text style={styles.boldText}>₹{p.totalAmount.toLocaleString('en-IN')}</Text>
                                    </Text>
                                    <Text style={styles.historyBulletLine}>
                                      • Sold: <Text style={[styles.boldText, { color: BrandColors.success }]}>{p.totalSoldQuantity || 0} Litres</Text>
                                    </Text>
                                    <Text style={styles.historyBulletLine}>
                                      • Waste of Milk: <Text style={[styles.boldText, { color: isNoLoss ? BrandColors.success : BrandColors.danger }]}>{p.actualWastageQuantity} Litres</Text>
                                    </Text>
                                    <Text style={styles.historyBulletLine}>
                                      • Waste of Money: <Text style={[styles.boldText, { color: isNoLoss ? BrandColors.success : BrandColors.danger }]}>₹{p.actualLossAmount.toLocaleString('en-IN')}</Text>
                                    </Text>
                                    {p.salesRevenue > 0 ? (
                                      <Text style={[styles.historyBulletLine, { color: BrandColors.success }]}>
                                        • Sales Revenue: <Text style={styles.boldText}>₹{p.salesRevenue.toLocaleString('en-IN')}</Text>
                                      </Text>
                                    ) : null}
                                    <Text style={styles.historyBulletLine}>
                                      • Status: <Text style={[styles.boldText, { color: isNoLoss ? BrandColors.success : BrandColors.danger }]}>{isNoLoss ? 'No Loss' : `${p.actualWastageQuantity} Litres Wasted`}</Text>
                                    </Text>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* ========================================================= */}
            {/* TAB 2: MONTHLY HISTORY                                    */}
            {/* ========================================================= */}
            {historyTab === 'monthly' && (
              <View>
                {/* Month & Year Switcher: < Prev Month | October 2026 | Next Month > */}
                <View style={styles.monthSelectorRow}>
                  <Button mode="text" compact icon="chevron-left" onPress={handlePrevMonth}>
                    Prev Month
                  </Button>
                  <View style={styles.monthDisplayChip}>
                    <MaterialCommunityIcons name="calendar-month" size={18} color={BrandColors.primaryDark} />
                    <Text style={styles.historyDateChipText}>
                      {getMonthName(monthlyMonth)} {monthlyYear}
                    </Text>
                  </View>
                  <Button
                    mode="text"
                    compact
                    contentStyle={{ flexDirection: 'row-reverse' }}
                    icon="chevron-right"
                    onPress={handleNextMonth}
                  >
                    Next Month
                  </Button>
                </View>

                {/* PDF Download Button */}
                <Button
                  mode="contained"
                  icon="file-pdf-box"
                  onPress={() => handleDownloadPDF('monthly')}
                  loading={generatingPDF}
                  disabled={generatingPDF || !monthlyHistoryData || monthlyHistoryData.transactions.length === 0}
                  buttonColor="#DC2626"
                  style={styles.downloadPdfBtn}
                >
                  Download Monthly PDF
                </Button>

                {loadingMonthlyHistory ? (
                  <LoadingIndicator message="Loading monthly history..." />
                ) : !monthlyHistoryData || monthlyHistoryData.transactions.length === 0 ? (
                  <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                    <MaterialCommunityIcons name="calendar-blank" size={48} color={BrandColors.neutralGray} />
                    <Text style={{ marginTop: 8, color: BrandColors.neutralGray, textAlign: 'center' }}>
                      No supply or sales records found for {getMonthName(monthlyMonth)} {monthlyYear}.
                    </Text>
                  </View>
                ) : (
                  <View>
                    {/* Monthly Consolidated Summary Card */}
                    <View style={styles.historyDaySummaryCard}>
                      <Text style={styles.historyDaySummaryTitle}>
                        Monthly Summary – {getMonthName(monthlyMonth)} {monthlyYear}
                      </Text>
                      <View style={styles.historyDayStatsRow}>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Purchased</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.primaryDark }]}>
                            {monthlyHistoryData.totalPurchasedLiters} L
                          </Text>
                          <Text style={styles.historyStatSub}>
                            ₹{monthlyHistoryData.totalPurchaseAmount.toLocaleString('en-IN')}
                          </Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Sold</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.success }]}>
                            {monthlyHistoryData.totalSoldLiters} L
                          </Text>
                          <Text style={styles.historyStatSub}>
                            ₹{monthlyHistoryData.totalSalesRevenue.toLocaleString('en-IN')}
                          </Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Remaining</Text>
                          <Text
                            style={[
                              styles.historyStatVal,
                              {
                                color: monthlyHistoryData.totalRemainingLiters === 0 ? BrandColors.success : '#D97706',
                              },
                            ]}
                          >
                            {monthlyHistoryData.totalRemainingLiters} L
                          </Text>
                          <Text style={styles.historyStatSub}>
                            {monthlyHistoryData.totalRemainingLiters === 0 ? 'No Loss' : 'In Stock'}
                          </Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Waste of Money</Text>
                          <Text
                            style={[
                              styles.historyStatVal,
                              {
                                color: monthlyHistoryData.totalLossAmount === 0 ? BrandColors.success : BrandColors.danger,
                              },
                            ]}
                          >
                            ₹{monthlyHistoryData.totalLossAmount.toLocaleString('en-IN')}
                          </Text>
                          <Text
                            style={[
                              styles.historyStatSub,
                              {
                                color: monthlyHistoryData.totalLossAmount === 0 ? BrandColors.success : BrandColors.danger,
                              },
                            ]}
                          >
                            Waste: {monthlyHistoryData.totalWastageLiters} L
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Buffalo vs Cow Category Breakdown */}
                    <View style={styles.categorySummaryCard}>
                      <Text style={styles.categorySummaryTitle}>Monthly Milk Category Breakdown</Text>
                      <View style={styles.categorySummaryRow}>
                        <View style={styles.categoryBox}>
                          <Text style={{ fontWeight: '700', color: BrandColors.textLight }}>🐃 Buffalo Milk</Text>
                          <Text style={styles.categoryStat}>
                            Purchased: <Text style={styles.boldText}>{monthlyHistoryData.buffaloPurchased} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Sold: <Text style={[styles.boldText, { color: BrandColors.success }]}>{monthlyHistoryData.buffaloSold} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Remaining: <Text style={[styles.boldText, { color: monthlyHistoryData.buffaloRemaining === 0 ? BrandColors.success : '#D97706' }]}>{monthlyHistoryData.buffaloRemaining} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Cost: <Text style={styles.boldText}>₹{monthlyHistoryData.buffaloPurchaseAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                        </View>
                        <View style={styles.categoryBox}>
                          <Text style={{ fontWeight: '700', color: BrandColors.textLight }}>🐄 Cow Milk</Text>
                          <Text style={styles.categoryStat}>
                            Purchased: <Text style={styles.boldText}>{monthlyHistoryData.cowPurchased} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Sold: <Text style={[styles.boldText, { color: BrandColors.success }]}>{monthlyHistoryData.cowSold} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Remaining: <Text style={[styles.boldText, { color: monthlyHistoryData.cowRemaining === 0 ? BrandColors.success : '#D97706' }]}>{monthlyHistoryData.cowRemaining} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Cost: <Text style={styles.boldText}>₹{monthlyHistoryData.cowPurchaseAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Supplier-wise Monthly Breakdown */}
                    <Text style={[styles.subSectionTitle, { marginBottom: 8 }]}>
                      Supplier-Wise Accounts ({monthlyHistoryData.suppliers.length})
                    </Text>
                    {monthlyHistoryData.suppliers.map((s) => (
                      <View key={s.supplierId} style={styles.supHistoryCard}>
                        <View style={styles.supHistoryHeader}>
                          <Text style={styles.supHistoryName}>{s.supplierName}</Text>
                          <Text style={styles.supHistoryPhone}>📞 {s.supplierPhone}</Text>
                        </View>
                        <View style={{ marginTop: 6, gap: 3 }}>
                          <Text style={styles.historyBulletLine}>
                            • Total Purchased: <Text style={styles.boldText}>{s.totalPurchasedLiters} Litres</Text> (₹{s.totalPurchaseAmount.toLocaleString('en-IN')})
                          </Text>
                          <Text style={styles.historyBulletLine}>
                            • Total Sold: <Text style={[styles.boldText, { color: BrandColors.success }]}>{s.totalSoldLiters} Litres</Text>
                          </Text>
                          <Text style={styles.historyBulletLine}>
                            • Remaining Unsold: <Text style={[styles.boldText, { color: s.totalRemainingLiters === 0 ? BrandColors.success : '#D97706' }]}>{s.totalRemainingLiters} Litres</Text>
                          </Text>
                          <Text style={styles.historyBulletLine}>
                            • Waste of Milk: <Text style={[styles.boldText, { color: s.totalWastageLiters === 0 ? BrandColors.success : BrandColors.danger }]}>{s.totalWastageLiters} Litres</Text>
                          </Text>
                          <Text style={styles.historyBulletLine}>
                            • Waste of Money: <Text style={[styles.boldText, { color: s.totalLossAmount === 0 ? BrandColors.success : BrandColors.danger }]}>₹{s.totalLossAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                          {s.totalSalesRevenue > 0 ? (
                            <Text style={[styles.historyBulletLine, { color: BrandColors.success }]}>
                              • Sales Revenue: <Text style={styles.boldText}>₹{s.totalSalesRevenue.toLocaleString('en-IN')}</Text>
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))}

                    {/* Expandable Daily Transactions List */}
                    <Text style={[styles.subSectionTitle, { marginTop: 12, marginBottom: 4 }]}>
                      Daily Accounts Breakdown ({monthlyHistoryData.dates.length} Days)
                    </Text>
                    <Text style={styles.subSectionSubtitle}>
                      Tap any date below to expand and view full daily transactions
                    </Text>

                    {monthlyHistoryData.dates.map((dt) => {
                      const isExpanded = expandedMonthlyDates.has(dt.date);
                      return (
                        <View key={dt.date} style={styles.expandableDateCard}>
                          <TouchableOpacity
                            style={styles.expandableDateHeader}
                            onPress={() => toggleDateExpanded(dt.date)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.dateHeaderLeft}>
                              <MaterialCommunityIcons
                                name="calendar-today"
                                size={18}
                                color={BrandColors.primaryDark}
                              />
                              <View>
                                <Text style={styles.dateHeaderText}>
                                  {formatDisplayDate(dt.date)} ({dt.date})
                                </Text>
                                <Text style={styles.dateHeaderStats}>
                                  {dt.totalPurchasedLiters}L buy • {dt.totalSoldLiters}L sold • {dt.totalRemainingLiters}L rem • ₹{dt.totalPurchaseAmount.toLocaleString('en-IN')}
                                </Text>
                              </View>
                            </View>
                            <MaterialCommunityIcons
                              name={isExpanded ? 'chevron-up' : 'chevron-down'}
                              size={22}
                              color={BrandColors.neutralGray}
                            />
                          </TouchableOpacity>

                          {isExpanded && (
                            <View style={styles.expandedTransactionsBox}>
                              {dt.purchases.map((p) => {
                                const sessionName = p.session.charAt(0).toUpperCase() + p.session.slice(1);
                                const categoryName = p.milkCategory === 'cow' ? 'Cow Milk' : 'Buffalo Milk';
                                const isNoLoss = p.actualWastageQuantity === 0;

                                return (
                                  <View key={p.id} style={styles.historyPurchaseCardItem}>
                                    <View style={styles.historyCardHeader}>
                                      <Text style={styles.historyCardTitle}>
                                        {sessionName} – {p.supplierName} ({categoryName})
                                      </Text>
                                      <View
                                        style={[
                                          styles.historyStatusBadge,
                                          {
                                            backgroundColor: isNoLoss ? '#ECFDF5' : '#FEF2F2',
                                            borderColor: isNoLoss ? '#A7F3D0' : '#FECACA',
                                          },
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            styles.historyStatusBadgeText,
                                            {
                                              color: isNoLoss ? BrandColors.success : BrandColors.danger,
                                            },
                                          ]}
                                        >
                                          {isNoLoss ? '✓ No Loss' : `${p.actualWastageQuantity}L Wasted`}
                                        </Text>
                                      </View>
                                    </View>
                                    <View style={styles.historyBulletsBox}>
                                      <Text style={styles.historyBulletLine}>
                                        • Purchased: <Text style={styles.boldText}>{p.quantityLiters} Litres</Text> @ ₹{p.pricePerLiter}/L = <Text style={styles.boldText}>₹{p.totalAmount.toLocaleString('en-IN')}</Text>
                                      </Text>
                                      <Text style={styles.historyBulletLine}>
                                        • Sold: <Text style={[styles.boldText, { color: BrandColors.success }]}>{p.totalSoldQuantity || 0} Litres</Text>
                                      </Text>
                                      <Text style={styles.historyBulletLine}>
                                        • Waste of Milk: <Text style={[styles.boldText, { color: isNoLoss ? BrandColors.success : BrandColors.danger }]}>{p.actualWastageQuantity} Litres</Text>
                                      </Text>
                                      <Text style={styles.historyBulletLine}>
                                        • Waste of Money: <Text style={[styles.boldText, { color: isNoLoss ? BrandColors.success : BrandColors.danger }]}>₹{p.actualLossAmount.toLocaleString('en-IN')}</Text>
                                      </Text>
                                      <Text style={styles.historyBulletLine}>
                                        • Status: <Text style={[styles.boldText, { color: isNoLoss ? BrandColors.success : BrandColors.danger }]}>{isNoLoss ? 'No Loss' : `${p.actualWastageQuantity} Litres Wasted`}</Text>
                                      </Text>
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* ========================================================= */}
            {/* TAB 3: CUSTOM HISTORY                                     */}
            {/* ========================================================= */}
            {historyTab === 'custom' && (
              <View>
                {/* Date Range Selector: Start Date & End Date */}
                <View style={styles.customRangeRow}>
                  <TouchableOpacity
                    style={styles.customDateBtn}
                    onPress={() => {
                      setCalendarTargetField('custom_start');
                      setCalendarPickerVisible(true);
                    }}
                  >
                    <MaterialCommunityIcons name="calendar-start" size={16} color={BrandColors.primaryDark} />
                    <View>
                      <Text style={styles.customDateBtnLabel}>From (Start Date)</Text>
                      <Text style={styles.customDateBtnVal}>{formatDisplayDate(customStartDate)}</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.customDateBtn}
                    onPress={() => {
                      setCalendarTargetField('custom_end');
                      setCalendarPickerVisible(true);
                    }}
                  >
                    <MaterialCommunityIcons name="calendar-end" size={16} color={BrandColors.primaryDark} />
                    <View>
                      <Text style={styles.customDateBtnLabel}>To (End Date)</Text>
                      <Text style={styles.customDateBtnVal}>{formatDisplayDate(customEndDate)}</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* PDF Download Button */}
                <Button
                  mode="contained"
                  icon="file-pdf-box"
                  onPress={() => handleDownloadPDF('custom')}
                  loading={generatingPDF}
                  disabled={generatingPDF || !customHistoryData || customHistoryData.transactions.length === 0}
                  buttonColor="#DC2626"
                  style={styles.downloadPdfBtn}
                >
                  Download Custom History PDF
                </Button>

                {loadingCustomHistory ? (
                  <LoadingIndicator message="Loading custom period history..." />
                ) : !customHistoryData || customHistoryData.transactions.length === 0 ? (
                  <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                    <MaterialCommunityIcons name="calendar-range" size={48} color={BrandColors.neutralGray} />
                    <Text style={{ marginTop: 8, color: BrandColors.neutralGray, textAlign: 'center' }}>
                      No supply or sales records found between {formatDisplayDate(customStartDate)} and {formatDisplayDate(customEndDate)}.
                    </Text>
                  </View>
                ) : (
                  <View>
                    {/* Custom Range Summary Card */}
                    <View style={styles.historyDaySummaryCard}>
                      <Text style={styles.historyDaySummaryTitle}>
                        Period Summary ({customHistoryData.startDate} to {customHistoryData.endDate})
                      </Text>
                      <View style={styles.historyDayStatsRow}>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Purchased</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.primaryDark }]}>
                            {customHistoryData.totalPurchasedLiters} L
                          </Text>
                          <Text style={styles.historyStatSub}>
                            ₹{customHistoryData.totalPurchaseAmount.toLocaleString('en-IN')}
                          </Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Sold</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.success }]}>
                            {customHistoryData.totalSoldLiters} L
                          </Text>
                          <Text style={styles.historyStatSub}>
                            ₹{customHistoryData.totalSalesRevenue.toLocaleString('en-IN')}
                          </Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Remaining</Text>
                          <Text
                            style={[
                              styles.historyStatVal,
                              {
                                color: customHistoryData.totalRemainingLiters === 0 ? BrandColors.success : '#D97706',
                              },
                            ]}
                          >
                            {customHistoryData.totalRemainingLiters} L
                          </Text>
                          <Text style={styles.historyStatSub}>
                            {customHistoryData.totalRemainingLiters === 0 ? 'No Loss' : 'In Stock'}
                          </Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Waste of Money</Text>
                          <Text
                            style={[
                              styles.historyStatVal,
                              {
                                color: customHistoryData.totalLossAmount === 0 ? BrandColors.success : BrandColors.danger,
                              },
                            ]}
                          >
                            ₹{customHistoryData.totalLossAmount.toLocaleString('en-IN')}
                          </Text>
                          <Text
                            style={[
                              styles.historyStatSub,
                              {
                                color: customHistoryData.totalLossAmount === 0 ? BrandColors.success : BrandColors.danger,
                              },
                            ]}
                          >
                            Waste: {customHistoryData.totalWastageLiters} L
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Buffalo vs Cow Category Summary */}
                    <View style={styles.categorySummaryCard}>
                      <Text style={styles.categorySummaryTitle}>Period Milk Category Breakdown</Text>
                      <View style={styles.categorySummaryRow}>
                        <View style={styles.categoryBox}>
                          <Text style={{ fontWeight: '700', color: BrandColors.textLight }}>🐃 Buffalo Milk</Text>
                          <Text style={styles.categoryStat}>
                            Purchased: <Text style={styles.boldText}>{customHistoryData.buffaloPurchased} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Sold: <Text style={[styles.boldText, { color: BrandColors.success }]}>{customHistoryData.buffaloSold} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Remaining: <Text style={[styles.boldText, { color: customHistoryData.buffaloRemaining === 0 ? BrandColors.success : '#D97706' }]}>{customHistoryData.buffaloRemaining} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Cost: <Text style={styles.boldText}>₹{customHistoryData.buffaloPurchaseAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                        </View>
                        <View style={styles.categoryBox}>
                          <Text style={{ fontWeight: '700', color: BrandColors.textLight }}>🐄 Cow Milk</Text>
                          <Text style={styles.categoryStat}>
                            Purchased: <Text style={styles.boldText}>{customHistoryData.cowPurchased} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Sold: <Text style={[styles.boldText, { color: BrandColors.success }]}>{customHistoryData.cowSold} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Remaining: <Text style={[styles.boldText, { color: customHistoryData.cowRemaining === 0 ? BrandColors.success : '#D97706' }]}>{customHistoryData.cowRemaining} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Cost: <Text style={styles.boldText}>₹{customHistoryData.cowPurchaseAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Supplier-wise breakdown */}
                    <Text style={[styles.subSectionTitle, { marginBottom: 8 }]}>
                      Supplier-Wise Accounts ({customHistoryData.suppliers.length})
                    </Text>
                    {customHistoryData.suppliers.map((s) => (
                      <View key={s.supplierId} style={styles.supHistoryCard}>
                        <View style={styles.supHistoryHeader}>
                          <Text style={styles.supHistoryName}>{s.supplierName}</Text>
                          <Text style={styles.supHistoryPhone}>📞 {s.supplierPhone}</Text>
                        </View>
                        <View style={{ marginTop: 6, gap: 3 }}>
                          <Text style={styles.historyBulletLine}>
                            • Purchased: <Text style={styles.boldText}>{s.totalPurchasedLiters} Litres</Text> (₹{s.totalPurchaseAmount.toLocaleString('en-IN')})
                          </Text>
                          <Text style={styles.historyBulletLine}>
                            • Sold: <Text style={[styles.boldText, { color: BrandColors.success }]}>{s.totalSoldLiters} Litres</Text>
                          </Text>
                          <Text style={styles.historyBulletLine}>
                            • Remaining: <Text style={[styles.boldText, { color: s.totalRemainingLiters === 0 ? BrandColors.success : '#D97706' }]}>{s.totalRemainingLiters} Litres</Text>
                          </Text>
                          <Text style={styles.historyBulletLine}>
                            • Waste of Milk: <Text style={[styles.boldText, { color: s.totalWastageLiters === 0 ? BrandColors.success : BrandColors.danger }]}>{s.totalWastageLiters} Litres</Text>
                          </Text>
                          <Text style={styles.historyBulletLine}>
                            • Waste of Money: <Text style={[styles.boldText, { color: s.totalLossAmount === 0 ? BrandColors.success : BrandColors.danger }]}>₹{s.totalLossAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                          {s.totalSalesRevenue > 0 ? (
                            <Text style={[styles.historyBulletLine, { color: BrandColors.success }]}>
                              • Sales Revenue: <Text style={styles.boldText}>₹{s.totalSalesRevenue.toLocaleString('en-IN')}</Text>
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))}

                    {/* Detailed Transactions List */}
                    <Text style={[styles.subSectionTitle, { marginTop: 12, marginBottom: 8 }]}>
                      Transactions ({customHistoryData.transactions.length})
                    </Text>
                    {customHistoryData.transactions.map((p) => {
                      const sessionName = p.session.charAt(0).toUpperCase() + p.session.slice(1);
                      const categoryName = p.milkCategory === 'cow' ? 'Cow Milk' : 'Buffalo Milk';
                      const isNoLoss = p.actualWastageQuantity === 0;

                      return (
                        <View key={p.id} style={styles.historyPurchaseCardItem}>
                          <View style={styles.historyCardHeader}>
                            <Text style={styles.historyCardTitle}>
                              {p.purchaseDate} • {sessionName} – {p.supplierName} ({categoryName})
                            </Text>
                            <View
                              style={[
                                styles.historyStatusBadge,
                                {
                                  backgroundColor: isNoLoss ? '#ECFDF5' : '#FEF2F2',
                                  borderColor: isNoLoss ? '#A7F3D0' : '#FECACA',
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.historyStatusBadgeText,
                                  {
                                    color: isNoLoss ? BrandColors.success : BrandColors.danger,
                                  },
                                ]}
                              >
                                {isNoLoss ? '✓ No Loss' : `${p.actualWastageQuantity}L Wasted`}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.historyBulletsBox}>
                            <Text style={styles.historyBulletLine}>
                              • Purchased: <Text style={styles.boldText}>{p.quantityLiters} Litres</Text> @ ₹{p.pricePerLiter}/L = <Text style={styles.boldText}>₹{p.totalAmount.toLocaleString('en-IN')}</Text>
                            </Text>
                            <Text style={styles.historyBulletLine}>
                              • Sold: <Text style={[styles.boldText, { color: BrandColors.success }]}>{p.totalSoldQuantity || 0} Litres</Text>
                            </Text>
                            <Text style={styles.historyBulletLine}>
                              • Waste of Milk: <Text style={[styles.boldText, { color: isNoLoss ? BrandColors.success : BrandColors.danger }]}>{p.actualWastageQuantity} Litres</Text>
                            </Text>
                            <Text style={styles.historyBulletLine}>
                              • Waste of Money: <Text style={[styles.boldText, { color: isNoLoss ? BrandColors.success : BrandColors.danger }]}>₹{p.actualLossAmount.toLocaleString('en-IN')}</Text>
                            </Text>
                            <Text style={styles.historyBulletLine}>
                              • Status: <Text style={[styles.boldText, { color: isNoLoss ? BrandColors.success : BrandColors.danger }]}>{isNoLoss ? 'No Loss' : `${p.actualWastageQuantity} Litres Wasted`}</Text>
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            <View style={[styles.modalActions, { marginTop: 16, marginBottom: 20 }]}>
              <Button mode="contained" onPress={() => setHistoryModalVisible(false)} buttonColor={BrandColors.primaryDark}>
                Close History
              </Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>

      {/* Interactive Calendar Date Picker Modal - Placed at absolute bottom so it renders on top of all modals */}
      <CalendarDatePickerModal
        visible={calendarPickerVisible}
        selectedDate={currentSelectedDateForModal}
        onSelectDate={handleCalendarDateSelected}
        onDismiss={() => setCalendarPickerVisible(false)}
        title={calendarModalTitle}
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
  topActionBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  topAddSupplierBtn: {
    flex: 1,
    borderRadius: 8,
  },
  topHistoryBtn: {
    flex: 1,
    borderRadius: 8,
    borderColor: BrandColors.primaryDark,
  },
  tabToggleContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tabSegmented: {
    backgroundColor: '#FFFFFF',
  },
  dateBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  dateSelectorTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  dateSelectorText: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchbar: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    elevation: 1,
    height: 44,
  },
  searchbarInput: {
    fontSize: 13,
    minHeight: 44,
  },
  listContainer: {
    padding: 16,
    paddingTop: 4,
    paddingBottom: 36,
  },
  sectionHeaderBox: {
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  sellHeaderContainer: {
    marginBottom: 8,
  },
  kpiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 14,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  kpiHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  kpiHeaderDate: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginBottom: 12,
  },
  kpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  kpiBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: BrandColors.neutralGray,
    textTransform: 'uppercase',
    marginBottom: 4,
    textAlign: 'center',
  },
  kpiValue: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  bannerContainer: {
    marginBottom: 12,
  },
  noLossBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BrandColors.successLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BrandColors.success + '40',
  },
  noLossBannerText: {
    fontSize: 13,
    fontWeight: '800',
    color: BrandColors.success,
  },
  lossBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BrandColors.accentLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F59E0B60',
  },
  lossBannerText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#D97706',
    flex: 1,
  },
  kpiDivider: {
    marginVertical: 10,
    backgroundColor: BrandColors.borderLight,
  },
  categoryBreakdownTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.textLight,
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
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: BrandColors.textLight,
    marginBottom: 6,
  },
  categoryStat: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    marginBottom: 3,
  },
  boldText: {
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
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
    backgroundColor: BrandColors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameInfo: {
    flex: 1,
  },
  supplierName: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  phoneText: {
    fontSize: 13,
    color: BrandColors.neutralGray,
    marginTop: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countBadgeBox: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignSelf: 'center',
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  holidayBadgeContainer: {
    marginTop: 8,
  },
  holidayBadgeBox: {
    backgroundColor: BrandColors.accentLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignSelf: 'flex-start',
  },
  holidayBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  todaySummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 8,
    marginTop: 10,
  },
  todaySummaryLabel: {
    fontSize: 12,
    color: BrandColors.neutralGray,
  },
  todaySummaryValue: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  supplierPurchasesHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: BrandColors.textLight,
    marginBottom: 8,
  },
  emptySessionBox: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  emptySessionText: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    fontStyle: 'italic',
  },
  sessionItemsList: {
    gap: 8,
  },
  purchaseSessionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  sessionItemBalanced: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  sessionItemPartial: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  sessionItemPending: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  sessionItemDetails: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  sessionStatusRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  sessionSoldText: {
    fontSize: 11,
    color: BrandColors.success,
  },
  sessionRemainingText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sessionItemAction: {
    alignItems: 'flex-end',
    gap: 4,
  },
  statusBadgeBox: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'center',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  divider: {
    marginVertical: 12,
    backgroundColor: BrandColors.borderLight,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addMilkBtn: {
    flex: 1,
    borderRadius: 8,
  },
  cancelHolidayBtn: {
    flex: 1,
    borderRadius: 8,
  },
  btnContent: {
    paddingVertical: 2,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    padding: 20,
    borderRadius: 14,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  modalSubtitle: {
    fontSize: 13,
    color: BrandColors.neutralGray,
    marginBottom: 10,
  },
  input: {
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  helperText: {
    paddingHorizontal: 0,
    marginBottom: 6,
  },
  sectionBlock: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.textLight,
    marginBottom: 6,
  },
  interactiveDateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginVertical: 4,
  },
  interactiveDateLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  changeDateBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginLeft: 10,
  },
  changeDateBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  interactiveDateText: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  segmented: {
    backgroundColor: '#F8FAFC',
  },
  calcBox: {
    backgroundColor: BrandColors.primaryLight,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginVertical: 8,
  },
  calcLabel: {
    fontSize: 11,
    color: BrandColors.primaryDark,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  calcFormula: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginVertical: 2,
  },
  calcValue: {
    fontSize: 20,
    fontWeight: '800',
    color: BrandColors.primaryDark,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  purchaseInfoBanner: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  infoBannerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  infoBannerLabel: {
    fontSize: 12,
    color: BrandColors.neutralGray,
  },
  infoBannerVal: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.textLight,
  },
  infoBannerValBold: {
    fontSize: 13,
    fontWeight: '800',
    color: BrandColors.primaryDark,
  },
  liveCalculationBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 10,
  },
  liveCalcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  liveCalcLabel: {
    fontSize: 12,
    color: BrandColors.neutralGray,
  },
  liveCalcVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  soldSummaryBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginVertical: 10,
  },
  soldBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  soldBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: BrandColors.success,
  },
  recordSaleFormBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  subSectionSubtitle: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    marginBottom: 8,
  },
  historyDateSelectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 6,
    marginBottom: 12,
  },
  historyDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  historyDateChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  historyDaySummaryCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 12,
  },
  historyDaySummaryTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1D4ED8',
    marginBottom: 8,
  },
  historyDayStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyStatBox: {
    flex: 1,
    alignItems: 'center',
  },
  historyStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: BrandColors.neutralGray,
    textTransform: 'uppercase',
  },
  historyStatVal: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  historyStatSub: {
    fontSize: 10,
    color: BrandColors.neutralGray,
  },
  supHistoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  supHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  supHistoryName: {
    fontSize: 15,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  supHistoryPhone: {
    fontSize: 12,
    color: BrandColors.neutralGray,
  },
  supHistoryDayTotals: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  sessionHistoryBlock: {
    marginTop: 6,
  },
  sessionHistoryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: BrandColors.textLight,
    marginBottom: 4,
  },
  historyPurchaseCardItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: BrandColors.textLight,
    flex: 1,
  },
  historyStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'center',
  },
  historyStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  historyBulletsBox: {
    gap: 3,
  },
  historyBulletLine: {
    fontSize: 12,
    color: BrandColors.textLight,
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: BrandColors.danger + '40',
    padding: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  permissionText: {
    flex: 1,
    fontSize: 12,
    color: '#991B1B',
    lineHeight: 16,
    fontWeight: '500',
  },
  monthSelectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 6,
    marginBottom: 10,
  },
  monthDisplayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  customRangeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  customDateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  customDateBtnLabel: {
    fontSize: 10,
    color: BrandColors.neutralGray,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  customDateBtnVal: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.primaryDark,
    marginTop: 2,
  },
  downloadPdfBtn: {
    marginBottom: 12,
    borderRadius: 8,
  },
  expandableDateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    overflow: 'hidden',
  },
  expandableDateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#F8FAFC',
  },
  dateHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  dateHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  dateHeaderStats: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  expandedTransactionsBox: {
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  categorySummaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  categorySummaryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: BrandColors.textLight,
    marginBottom: 6,
  },
  categorySummaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
});
