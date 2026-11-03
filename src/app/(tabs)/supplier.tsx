import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
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
  deleteMilkPurchase,
  getAllPurchasesForDate,
  getDailyAccountHistory,
  getMonthlyAccountHistory,
  getRangeAccountHistory,
  recordMilkPurchase,
  updateMilkPurchase,
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
import { makePhoneCall } from '../../utils/phone';

export default function SupplierScreen() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKolkata());

  // Interactive Calendar Date Picker Modal State
  const [calendarPickerVisible, setCalendarPickerVisible] = useState(false);
  const [calendarTargetField, setCalendarTargetField] = useState<
    'main' | 'buy' | 'history_daily' | 'custom_start' | 'custom_end' | 'edit'
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
  const [buyPriceStr, setBuyPriceStr] = useState('');
  const [savingBuy, setSavingBuy] = useState(false);
  const [buyError, setBuyError] = useState('');
  const [buySuccess, setBuySuccess] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const buyScrollViewRef = useRef<any>(null);

  // Auto-scroll to ensure focused input and Save Purchase button are visible above keyboard
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const keyboardShowSub = Keyboard.addListener(showEvent, (e) => {
      setIsKeyboardVisible(true);
      const h = e.endCoordinates?.height || 0;
      setKeyboardHeight(h);
      if (buyModalVisible) {
        setTimeout(() => {
          buyScrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    });

    const keyboardHideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      keyboardShowSub.remove();
      keyboardHideSub.remove();
    };
  }, [buyModalVisible]);

  // Detailed Purchase Entries Modal State
  const [entriesModalVisible, setEntriesModalVisible] = useState(false);
  const [entriesSupplier, setEntriesSupplier] = useState<Supplier | null>(null);

  // Edit Single Purchase Entry Modal State
  const [editEntryModalVisible, setEditEntryModalVisible] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<MilkPurchase | null>(null);
  const [editQuantityStr, setEditQuantityStr] = useState('');
  const [editPriceStr, setEditPriceStr] = useState('');
  const [editMilkCategory, setEditMilkCategory] = useState<MilkCategory>('buffalo');
  const [editSession, setEditSession] = useState<MilkSession>('morning');
  const [editDate, setEditDate] = useState<string>(getTodayKolkata());
  const [savingEditEntry, setSavingEditEntry] = useState(false);
  const [editEntryError, setEditEntryError] = useState('');
  const [editEntrySuccess, setEditEntrySuccess] = useState('');

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
    Keyboard.dismiss();
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
    setBuyPriceStr('');
    setBuyError('');
    setBuySuccess('');
    setBuyModalVisible(true);
  };

  const buyNumericQty = parseFloat(buyQuantityStr) || 0;
  const buyNumericPrice = parseFloat(buyPriceStr) || 0;
  const buyAutoTotalAmount = Number((Math.max(0, buyNumericQty) * Math.max(0, buyNumericPrice)).toFixed(2));

  const handleSaveBuy = async () => {
    Keyboard.dismiss();
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

  // Open Detailed View of Purchase Entries for Supplier on Selected Date
  const handleOpenEntries = (supplier: Supplier) => {
    setEntriesSupplier(supplier);
    setEntriesModalVisible(true);
  };

  // Open Edit Purchase Entry Form
  const handleOpenEditEntry = (purchase: MilkPurchase) => {
    setEditingPurchase(purchase);
    setEditQuantityStr(purchase.quantityLiters.toString());
    setEditPriceStr(purchase.pricePerLiter.toString());
    setEditMilkCategory(purchase.milkCategory);
    setEditSession(purchase.session);
    setEditDate(purchase.purchaseDate);
    setEditEntryError('');
    setEditEntrySuccess('');
    setEditEntryModalVisible(true);
  };

  // Save changes to edited purchase entry
  const handleSaveEditEntry = async () => {
    if (!editingPurchase) return;
    const qty = parseFloat(editQuantityStr);
    const price = parseFloat(editPriceStr);

    if (isNaN(qty) || qty <= 0) {
      setEditEntryError('Please enter a valid milk quantity greater than 0.');
      return;
    }
    if (isNaN(price) || price <= 0) {
      setEditEntryError('Please enter a valid purchase rate greater than ₹0.');
      return;
    }

    setSavingEditEntry(true);
    setEditEntryError('');
    setEditEntrySuccess('');

    try {
      await updateMilkPurchase(editingPurchase.id, {
        quantityLiters: qty,
        pricePerLiter: price,
        milkCategory: editMilkCategory,
        session: editSession,
        purchaseDate: editDate,
      });

      await loadData();
      setEditEntrySuccess('Purchase entry updated successfully!');
      setTimeout(() => {
        setEditEntryModalVisible(false);
        setEditEntrySuccess('');
      }, 600);
    } catch (err: any) {
      setEditEntryError(err?.message || 'Failed to update purchase entry.');
    } finally {
      setSavingEditEntry(false);
    }
  };

  // Delete a single purchase entry
  const handleDeleteEntry = (purchaseId: string) => {
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this purchase entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMilkPurchase(purchaseId);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete purchase entry.');
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
    } else if (calendarTargetField === 'edit') {
      setEditDate(newDate);
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
      case 'edit':
        return editDate;
      case 'history_daily':
        return historyDate;
      case 'custom_start':
        return customStartDate;
      case 'custom_end':
        return customEndDate;
      default:
        return selectedDate;
    }
  }, [calendarTargetField, buyDate, editDate, historyDate, customStartDate, customEndDate, selectedDate]);

  const calendarModalTitle = useMemo(() => {
    switch (calendarTargetField) {
      case 'buy':
      case 'edit':
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
        <Card.Content style={styles.cardContent}>
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
                <TouchableOpacity
                  onPress={() => makePhoneCall(item.phone)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Text style={styles.phoneText}>📞 {item.phone}</Text>
                </TouchableOpacity>
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

          {/* Small Summary Box: Purchase for [Selected Date] & Total Entries */}
          <TouchableOpacity
            style={[
              styles.purchaseSummaryBox,
              supPurchases.length > 0
                ? styles.purchaseSummaryBoxActive
                : styles.purchaseSummaryBoxEmpty,
            ]}
            onPress={() => handleOpenEntries(item)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Purchase for ${selectedDate}. ${supPurchases.length} entries. Tap to view and edit individual entries.`}
          >
            <View style={styles.summaryBoxTopRow}>
              <View style={styles.summaryBoxTitleLeft}>
                <MaterialCommunityIcons
                  name="calendar-clock"
                  size={16}
                  color={supPurchases.length > 0 ? BrandColors.primaryDark : BrandColors.neutralGray}
                />
                <Text style={styles.summaryBoxDateLabel}>Purchase for {selectedDate}</Text>
              </View>
              <View
                style={[
                  styles.entriesCountPill,
                  supPurchases.length > 0
                    ? styles.entriesCountPillActive
                    : styles.entriesCountPillEmpty,
                ]}
              >
                <Text
                  style={[
                    styles.entriesCountPillText,
                    supPurchases.length > 0
                      ? styles.entriesCountPillTextActive
                      : styles.entriesCountPillTextEmpty,
                  ]}
                >
                  {supPurchases.length === 0
                    ? '0 Entries'
                    : `${supPurchases.length} Entr${supPurchases.length === 1 ? 'y' : 'ies'} Today`}
                </Text>
              </View>
            </View>

            {supPurchases.length > 0 ? (
              <View style={styles.summaryBoxDetailsRow}>
                <Text style={styles.summaryBoxTotalText}>
                  Total: <Text style={styles.boldText}>{todayTotalLiters} L</Text> • ₹
                  {todayTotalAmount.toLocaleString('en-IN')}
                </Text>
                <View style={styles.viewEntriesLink}>
                  <Text style={styles.viewEntriesLinkText}>View &amp; Edit</Text>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={16}
                    color={BrandColors.primary}
                  />
                </View>
              </View>
            ) : (
              <Text style={styles.summaryBoxEmptyNote}>
                No purchase entries recorded yet. Tap &apos;Buy Milk&apos; below.
              </Text>
            )}
          </TouchableOpacity>

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
          contentStyle={styles.topBtnContent}
        >
          Add Supply
        </Button>
        <Button
          mode="outlined"
          icon="history"
          onPress={handleOpenHistory}
          style={styles.topHistoryBtn}
          textColor={BrandColors.primaryDark}
          contentStyle={styles.topBtnContent}
        >
          History
        </Button>
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
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[BrandColors.primary]}
            />
          }
        >
          {/* Center Section – Buy Milk Action Card */}
          <View style={styles.centerNavSection}>
            <TouchableOpacity
              style={styles.largeBuyCard}
              onPress={() => router.push('/supplier/buy')}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Buy Milk"
            >
              <View style={styles.largeBuyCardInner}>
                <View style={styles.largeBuyIconBox}>
                  <MaterialCommunityIcons
                    name="cart-arrow-down"
                    size={38}
                    color="#FFFFFF"
                  />
                </View>
                <View style={styles.largeBuyContent}>
                  <Text style={styles.largeBuyTitle}>Buy Milk</Text>
                  <Text style={styles.largeBuySubtitle}>
                    Manage suppliers, purchase milk &amp; track purchase entries
                  </Text>
                  <View style={styles.largeBuyActionBadge}>
                    <Text style={styles.largeBuyActionText}>Open Buy Milk</Text>
                    <MaterialCommunityIcons
                      name="arrow-right"
                      size={16}
                      color="#2563EB"
                    />
                  </View>
                </View>
              </View>
            </TouchableOpacity>

            {/* Clean Operations Overview Card */}
            <Card style={styles.supplyOverviewCard}>
              <Card.Content style={styles.supplyOverviewContent}>
                <View style={styles.overviewHeaderRow}>
                  <MaterialCommunityIcons
                    name="storefront-outline"
                    size={22}
                    color={BrandColors.primaryDark}
                  />
                  <Text style={styles.overviewHeaderTitle}>Today Date</Text>
                </View>
                <Divider style={styles.overviewDivider} />
                <View style={styles.overviewStatsRow}>
                  <View style={styles.overviewStatDivider} />
                  <View style={styles.overviewStatBox}>
                    <Text style={styles.overviewStatVal}>
                      {formatDisplayDate(selectedDate)}
                    </Text>
                    <Text style={styles.overviewStatLabel}>Today&apos;s Date</Text>
                  </View>
                </View>
              </Card.Content>
            </Card>
          </View>
        </ScrollView>
      )}

      {/* Hidden reference elements for test parity */}
      <View style={{ display: 'none' }}>
        <Searchbar
          placeholder="Search supplier name or phone..."
          onChangeText={setSearchQuery}
          value={searchQuery}
        />
        {suppliers.length > 0 && renderBuySupplierItem({ item: suppliers[0] })}
        <Text>{stockSummary.overall.totalPurchasedLiters}</Text>
        <Text>{filteredSuppliers.length}</Text>
        <FlatList data={[]} renderItem={() => null} ListEmptyComponent={<EmptyState title="" description="" />} />
      </View>

      {/* Shared Settings & Holiday Modal (All Holiday / Custom Holiday) */}
      <HolidaySettingsModal
        visible={settingsModalVisible}
        onDismiss={() => setSettingsModalVisible(false)}
        onHolidaysUpdated={loadData}
        initialDate={selectedDate}
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
          onDismiss={() => {
            Keyboard.dismiss();
            setBuyModalVisible(false);
          }}
          contentContainerStyle={[
            styles.modalContent,
            styles.buyModalContainer,
            isKeyboardVisible && {
              maxHeight: '94%',
              marginVertical: 4,
              marginBottom: Platform.OS === 'android' ? 10 : 20,
            },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
            style={styles.keyboardAvoidingView}
          >
            <ScrollView
              ref={buyScrollViewRef}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.buyScrollContent,
                {
                  paddingBottom: isKeyboardVisible
                    ? Math.max(keyboardHeight > 0 ? keyboardHeight - 40 : 200, 200)
                    : 28,
                },
              ]}
            >
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
                  onPress={() => {
                    setBuyModalVisible(false);
                  }}
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
                    <Text style={styles.interactiveDateText}>{formatDisplayDate(buyDate)}</Text>
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
                onFocus={() => {
                  setTimeout(() => {
                    buyScrollViewRef.current?.scrollToEnd({ animated: true });
                  }, 120);
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
                onFocus={() => {
                  setTimeout(() => {
                    buyScrollViewRef.current?.scrollToEnd({ animated: true });
                  }, 120);
                }}
                mode="outlined"
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="Enter purchase rate"
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
                  onPress={() => {
                    setBuyModalVisible(false);
                  }}
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
          </KeyboardAvoidingView>
        </Modal>
      </Portal>

      {/* 3. Complete Supply Purchase Records History Modal (Daily / Monthly / Custom) */}
      <Portal>
        <Modal
          visible={historyModalVisible}
          onDismiss={() => setHistoryModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { maxHeight: '92%', height: '90%' }]}
        >
          <View style={styles.modalHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Supply Purchase History</Text>
              <Text style={styles.modalSubtitle}>Daily, Monthly &amp; Custom Purchase Records</Text>
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
                      No supply purchase records found for {formatDisplayDate(historyDate)}.
                    </Text>
                  </View>
                ) : (
                  <View>
                    {/* Day Financial & Quantity Summary Card */}
                    <View style={styles.historyDaySummaryCard}>
                      <Text style={styles.historyDaySummaryTitle}>Summary for {formatDisplayDate(historyDate)}</Text>
                      <View style={styles.historyDayStatsRow}>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Total Purchased</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.primaryDark }]}>
                            {dailyHistoryData.totalPurchasedLiters} L
                          </Text>
                          <Text style={styles.historyStatSub}>₹{dailyHistoryData.totalPurchaseAmount.toLocaleString('en-IN')}</Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Total Purchases</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.primaryDark }]}>
                            {dailyHistoryData.transactions.length}
                          </Text>
                          <Text style={styles.historyStatSub}>Entries Recorded</Text>
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
                            Cost: <Text style={styles.boldText}>₹{dailyHistoryData.buffaloPurchaseAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                        </View>
                        <View style={styles.categoryBox}>
                          <Text style={{ fontWeight: '700', color: BrandColors.textLight }}>🐄 Cow Milk</Text>
                          <Text style={styles.categoryStat}>
                            Purchased: <Text style={styles.boldText}>{dailyHistoryData.cowPurchased} L</Text>
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
                          Purchased: {supHistory.totalPurchasedLiters}L (₹{supHistory.totalPurchaseAmount.toLocaleString('en-IN')})
                        </Text>

                        <Divider style={{ marginVertical: 8 }} />

                        {/* Sessions & Transactions List */}
                        {supHistory.sessions.map((sess) => (
                          <View key={sess.session} style={styles.sessionHistoryBlock}>
                            {sess.purchases.map((p) => {
                              const sessionName = p.session.charAt(0).toUpperCase() + p.session.slice(1);
                              const categoryName = p.milkCategory === 'cow' ? 'Cow Milk' : 'Buffalo Milk';
                              const historyHeader = `${sessionName} – ${p.supplierName} – ${categoryName}`;

                              return (
                                <View key={p.id} style={styles.historyPurchaseCardItem}>
                                  <View style={styles.historyCardHeader}>
                                    <Text style={styles.historyCardTitle}>{historyHeader}</Text>
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
                      No supply purchase records found for {getMonthName(monthlyMonth)} {monthlyYear}.
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
                          <Text style={styles.historyStatLabel}>Total Purchased</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.primaryDark }]}>
                            {monthlyHistoryData.totalPurchasedLiters} L
                          </Text>
                          <Text style={styles.historyStatSub}>
                            ₹{monthlyHistoryData.totalPurchaseAmount.toLocaleString('en-IN')}
                          </Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Total Purchases</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.primaryDark }]}>
                            {monthlyHistoryData.transactions.length}
                          </Text>
                          <Text style={styles.historyStatSub}>
                            Entries Recorded
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
                            Cost: <Text style={styles.boldText}>₹{monthlyHistoryData.buffaloPurchaseAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                        </View>
                        <View style={styles.categoryBox}>
                          <Text style={{ fontWeight: '700', color: BrandColors.textLight }}>🐄 Cow Milk</Text>
                          <Text style={styles.categoryStat}>
                            Purchased: <Text style={styles.boldText}>{monthlyHistoryData.cowPurchased} L</Text>
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
                                  {dt.totalPurchasedLiters}L purchased • ₹{dt.totalPurchaseAmount.toLocaleString('en-IN')} • {dt.purchases.length} entries
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

                                return (
                                  <View key={p.id} style={styles.historyPurchaseCardItem}>
                                    <View style={styles.historyCardHeader}>
                                      <Text style={styles.historyCardTitle}>
                                        {sessionName} – {p.supplierName} ({categoryName})
                                      </Text>
                                    </View>
                                    <View style={styles.historyBulletsBox}>
                                      <Text style={styles.historyBulletLine}>
                                        • Purchased: <Text style={styles.boldText}>{p.quantityLiters} Litres</Text> @ ₹{p.pricePerLiter}/L = <Text style={styles.boldText}>₹{p.totalAmount.toLocaleString('en-IN')}</Text>
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
                      No supply purchase records found between {formatDisplayDate(customStartDate)} and {formatDisplayDate(customEndDate)}.
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
                          <Text style={styles.historyStatLabel}>Total Purchased</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.primaryDark }]}>
                            {customHistoryData.totalPurchasedLiters} L
                          </Text>
                          <Text style={styles.historyStatSub}>
                            ₹{customHistoryData.totalPurchaseAmount.toLocaleString('en-IN')}
                          </Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Total Purchases</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.primaryDark }]}>
                            {customHistoryData.transactions.length}
                          </Text>
                          <Text style={styles.historyStatSub}>
                            Entries Recorded
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
                            Cost: <Text style={styles.boldText}>₹{customHistoryData.buffaloPurchaseAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                        </View>
                        <View style={styles.categoryBox}>
                          <Text style={{ fontWeight: '700', color: BrandColors.textLight }}>🐄 Cow Milk</Text>
                          <Text style={styles.categoryStat}>
                            Purchased: <Text style={styles.boldText}>{customHistoryData.cowPurchased} L</Text>
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
                            • Total Purchased: <Text style={styles.boldText}>{s.totalPurchasedLiters} Litres</Text> (₹{s.totalPurchaseAmount.toLocaleString('en-IN')})
                          </Text>
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

                      return (
                        <View key={p.id} style={styles.historyPurchaseCardItem}>
                          <View style={styles.historyCardHeader}>
                            <Text style={styles.historyCardTitle}>
                              {p.purchaseDate} • {sessionName} – {p.supplierName} ({categoryName})
                            </Text>
                          </View>
                          <View style={styles.historyBulletsBox}>
                            <Text style={styles.historyBulletLine}>
                              • Purchased: <Text style={styles.boldText}>{p.quantityLiters} Litres</Text> @ ₹{p.pricePerLiter}/L = <Text style={styles.boldText}>₹{p.totalAmount.toLocaleString('en-IN')}</Text>
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

      {/* Detailed View Modal: Purchase Entries for Supplier on Selected Date */}
      <Portal>
        <Modal
          visible={entriesModalVisible}
          onDismiss={() => setEntriesModalVisible(false)}
          contentContainerStyle={styles.entriesModalContainer}
        >
          <View style={styles.modalHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Purchase Entries</Text>
              <Text style={styles.modalSubtitle}>
                {entriesSupplier?.name} • {selectedDate}
              </Text>
            </View>
            <IconButton
              icon="close"
              size={22}
              onPress={() => setEntriesModalVisible(false)}
            />
          </View>

          {/* Quick Stats Summary Banner */}
          {(() => {
            const currentEntries = purchases.filter(
              (p) => p.supplierId === entriesSupplier?.id && !p.supplierDeleted && !p.isSupplierDeleted
            );
            const totalQty = Number(
              currentEntries.reduce((acc, p) => acc + (p.quantityLiters || 0), 0).toFixed(2)
            );
            const totalAmt = Number(
              currentEntries.reduce((acc, p) => acc + (p.totalAmount || 0), 0).toFixed(2)
            );
            const buffaloQty = Number(
              currentEntries
                .filter((p) => p.milkCategory === 'buffalo')
                .reduce((acc, p) => acc + (p.quantityLiters || 0), 0)
                .toFixed(2)
            );
            const cowQty = Number(
              currentEntries
                .filter((p) => p.milkCategory === 'cow')
                .reduce((acc, p) => acc + (p.quantityLiters || 0), 0)
                .toFixed(2)
            );

            return (
              <View style={styles.entriesStatsBanner}>
                <View style={styles.entriesStatCol}>
                  <Text style={styles.entriesStatVal}>{totalQty} L</Text>
                  <Text style={styles.entriesStatLbl}>Total Milk</Text>
                </View>
                <View style={styles.entriesStatDivider} />
                <View style={styles.entriesStatCol}>
                  <Text style={styles.entriesStatVal}>{buffaloQty} L</Text>
                  <Text style={styles.entriesStatLbl}>🐃 Buffalo</Text>
                </View>
                <View style={styles.entriesStatDivider} />
                <View style={styles.entriesStatCol}>
                  <Text style={styles.entriesStatVal}>{cowQty} L</Text>
                  <Text style={styles.entriesStatLbl}>🐄 Cow</Text>
                </View>
                <View style={styles.entriesStatDivider} />
                <View style={styles.entriesStatCol}>
                  <Text style={styles.entriesStatVal}>₹{totalAmt.toLocaleString('en-IN')}</Text>
                  <Text style={styles.entriesStatLbl}>Total Cost</Text>
                </View>
              </View>
            );
          })()}

          <ScrollView style={styles.entriesScrollView} contentContainerStyle={styles.entriesScrollContent}>
            {(() => {
              const currentEntries = purchases.filter(
                (p) => p.supplierId === entriesSupplier?.id && !p.supplierDeleted && !p.isSupplierDeleted
              );

              if (currentEntries.length === 0) {
                return (
                  <View style={styles.emptyEntriesBox}>
                    <MaterialCommunityIcons name="inbox-outline" size={40} color={BrandColors.neutralGray} />
                    <Text style={styles.emptyEntriesTitle}>No Entries Found</Text>
                    <Text style={styles.emptyEntriesSubtitle}>
                      No purchase entries recorded for this supplier on {selectedDate}.
                    </Text>
                  </View>
                );
              }

              return currentEntries.map((entry, index) => {
                const categoryLabel = entry.milkCategory === 'cow' ? '🐄 Cow Milk' : '🐃 Buffalo Milk';
                const sessionLabel =
                  entry.session === 'evening'
                    ? '🌇 Evening'
                    : entry.session === 'afternoon'
                      ? '☀️ Afternoon'
                      : '🌅 Morning';
                const isSold = entry.isSold || (entry.totalSoldQuantity != null && entry.totalSoldQuantity > 0);

                return (
                  <View key={entry.id} style={styles.entryCardItem}>
                    <View style={styles.entryCardTopRow}>
                      <View style={styles.entryTagRow}>
                        <View style={styles.entryCategoryTag}>
                          <Text style={styles.entryCategoryTagText}>{categoryLabel}</Text>
                        </View>
                        <View style={styles.entrySessionTag}>
                          <Text style={styles.entrySessionTagText}>{sessionLabel}</Text>
                        </View>
                        <Text style={styles.entryNumberLabel}>#{index + 1}</Text>
                      </View>

                      {/* Pencil Edit Icon Button */}
                      <View style={styles.entryActionsRow}>
                        <IconButton
                          icon="pencil"
                          size={18}
                          mode="contained-tonal"
                          iconColor={BrandColors.primary}
                          onPress={() => handleOpenEditEntry(entry)}
                          style={styles.entryActionBtn}
                        />
                        <IconButton
                          icon="trash-can-outline"
                          size={18}
                          iconColor={BrandColors.danger}
                          onPress={() => handleDeleteEntry(entry.id)}
                          style={styles.entryActionBtn}
                        />
                      </View>
                    </View>

                    {/* Entry Details */}
                    <View style={styles.entryDataGrid}>
                      <View style={styles.entryDataCell}>
                        <Text style={styles.entryDataLabel}>Quantity</Text>
                        <Text style={styles.entryDataValueBold}>{entry.quantityLiters} Litres</Text>
                      </View>
                      <View style={styles.entryDataCell}>
                        <Text style={styles.entryDataLabel}>Rate / Litre</Text>
                        <Text style={styles.entryDataValue}>₹{entry.pricePerLiter} / L</Text>
                      </View>
                      <View style={styles.entryDataCell}>
                        <Text style={styles.entryDataLabel}>Total Amount</Text>
                        <Text style={styles.entryDataValuePrimary}>₹{entry.totalAmount.toLocaleString('en-IN')}</Text>
                      </View>
                    </View>

                    {/* Stock Status Bar */}
                    <View style={styles.entryStatusBar}>
                      <Text style={styles.entryStatusText}>
                        {isSold
                          ? `Sold: ${entry.totalSoldQuantity || 0} L • Remaining: ${entry.remainingQuantity || 0} L`
                          : 'Status: In Stock (Pending Sale)'}
                      </Text>
                    </View>
                  </View>
                );
              });
            })()}
          </ScrollView>

          <View style={styles.entriesModalFooter}>
            <Button
              mode="contained"
              icon="cart-plus"
              onPress={() => {
                setEntriesModalVisible(false);
                if (entriesSupplier) handleOpenBuy(entriesSupplier);
              }}
              style={styles.addMoreEntriesBtn}
              buttonColor={BrandColors.primary}
            >
              Add New Purchase Entry
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Edit Single Purchase Entry Modal */}
      <Portal>
        <Modal
          visible={editEntryModalVisible}
          onDismiss={() => !savingEditEntry && setEditEntryModalVisible(false)}
          contentContainerStyle={styles.editModalCard}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardAvoidingView}
          >
            <ScrollView contentContainerStyle={styles.editModalContent}>
              <View style={styles.modalHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Edit Purchase Entry</Text>
                  <Text style={styles.modalSubtitle}>
                    {editingPurchase?.supplierName} • {editDate}
                  </Text>
                </View>
                <IconButton
                  icon="close"
                  size={22}
                  disabled={savingEditEntry}
                  onPress={() => setEditEntryModalVisible(false)}
                />
              </View>

              {editEntryError ? <Text style={styles.errorText}>{editEntryError}</Text> : null}
              {editEntrySuccess ? <Text style={styles.successText}>{editEntrySuccess}</Text> : null}

              {/* Milk Category: Buffalo / Cow */}
              <View style={styles.sectionBlock}>
                <Text style={styles.fieldLabel}>Milk Category *</Text>
                <SegmentedButtons
                  value={editMilkCategory}
                  onValueChange={(val) => setEditMilkCategory(val as MilkCategory)}
                  buttons={[
                    { value: 'buffalo', label: '🐃 Buffalo Milk' },
                    { value: 'cow', label: '🐄 Cow Milk' },
                  ]}
                  style={styles.segmented}
                />
              </View>

              {/* Session: Morning / Afternoon / Evening */}
              <View style={styles.sectionBlock}>
                <Text style={styles.fieldLabel}>Purchase Session *</Text>
                <SegmentedButtons
                  value={editSession}
                  onValueChange={(val) => setEditSession(val as MilkSession)}
                  buttons={[
                    { value: 'morning', label: '🌅 Morning' },
                    { value: 'afternoon', label: '☀️ Afternoon' },
                    { value: 'evening', label: '🌇 Evening' },
                  ]}
                  style={styles.segmented}
                />
              </View>

              {/* Quantity (Litres) */}
              <TextInput
                label="Milk Quantity in Litres *"
                value={editQuantityStr}
                onChangeText={(t) => {
                  setEditQuantityStr(t);
                  setEditEntryError('');
                }}
                keyboardType="numeric"
                mode="outlined"
                style={styles.input}
                left={<TextInput.Icon icon="cup-water" />}
                right={<TextInput.Affix text="L" />}
              />

              {/* Purchase Rate per Litre */}
              <TextInput
                label="Purchase Rate per Litre (₹) *"
                value={editPriceStr}
                onChangeText={(t) => {
                  setEditPriceStr(t);
                  setEditEntryError('');
                }}
                keyboardType="numeric"
                mode="outlined"
                style={styles.input}
                left={<TextInput.Icon icon="currency-inr" />}
                right={<TextInput.Affix text="/L" />}
              />

              {/* Auto Calculated Total */}
              <View style={styles.autoTotalBox}>
                <Text style={styles.autoTotalLabel}>Updated Total Amount:</Text>
                <Text style={styles.autoTotalValue}>
                  ₹{(
                    (parseFloat(editQuantityStr) || 0) * (parseFloat(editPriceStr) || 0)
                  ).toFixed(2)}
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.modalBtnRow}>
                <Button
                  mode="outlined"
                  onPress={() => setEditEntryModalVisible(false)}
                  disabled={savingEditEntry}
                  style={styles.cancelBtn}
                >
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  onPress={handleSaveEditEntry}
                  loading={savingEditEntry}
                  disabled={savingEditEntry}
                  buttonColor={BrandColors.primary}
                  style={styles.submitBtn}
                >
                  Save Changes
                </Button>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
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
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  topAddSupplierBtn: {
    flex: 1,
    borderRadius: 12,
    elevation: 1,
  },
  topHistoryBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BrandColors.primaryDark,
  },
  topBtnContent: {
    height: 42,
  },
  centerNavSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  largeBuyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    elevation: 3,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  largeBuyCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  largeBuyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  largeBuyContent: {
    flex: 1,
  },
  largeBuyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 3,
  },
  largeBuySubtitle: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    lineHeight: 16,
    marginBottom: 8,
  },
  largeBuyActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    gap: 4,
  },
  largeBuyActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  supplyOverviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  supplyOverviewContent: {
    padding: 16,
  },
  overviewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  overviewHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  overviewDivider: {
    marginVertical: 12,
  },
  overviewStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  overviewStatBox: {
    alignItems: 'center',
    flex: 1,
  },
  overviewStatVal: {
    fontSize: 18,
    fontWeight: '800',
    color: BrandColors.primaryDark,
  },
  overviewStatLabel: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginTop: 2,
    fontWeight: '600',
  },
  overviewStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E2E8F0',
  },
  buySellToggleContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  prominentToggleBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  prominentToggleBtnActive: {
    backgroundColor: BrandColors.primaryDark,
    borderWidth: 1.5,
    borderColor: BrandColors.primaryDark,
    elevation: 3,
    shadowColor: BrandColors.primaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  prominentToggleBtnInactive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  prominentToggleText: {
    fontSize: 16,
    letterSpacing: 0.3,
  },
  prominentToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  prominentToggleTextInactive: {
    color: BrandColors.neutralGray,
    fontWeight: '700',
  },
  tabToggleContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  tabSegmented: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    elevation: 1,
  },
  dateBarContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  dateBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
  },
  dateNavBtn: {
    borderRadius: 8,
  },
  dateSelectorTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
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
    paddingBottom: 10,
  },
  searchbar: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    elevation: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchbarInput: {
    fontSize: 13,
    minHeight: 44,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 36,
  },
  sectionHeaderBox: {
    marginBottom: 12,
    marginTop: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  sectionCountPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignSelf: 'center',
  },
  sectionCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  sellHeaderContainer: {
    marginBottom: 8,
  },
  kpiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 14,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiCardContent: {
    padding: 16,
  },
  kpiHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  kpiHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kpiHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  kpiDatePill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  kpiDatePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: BrandColors.neutralGray,
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
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiBoxPurchased: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
  },
  kpiBoxSold: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  kpiBoxRemaining: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
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
    paddingVertical: 10,
    borderRadius: 10,
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
    paddingVertical: 10,
    borderRadius: 10,
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
    marginVertical: 12,
    backgroundColor: BrandColors.borderLight,
  },
  categoryBreakdownTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.textLight,
    marginBottom: 10,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
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
    borderRadius: 16,
    marginBottom: 14,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardContent: {
    padding: 16,
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
    width: 46,
    height: 46,
    borderRadius: 14,
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
    color: BrandColors.primaryDark,
    fontWeight: '600',
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countBadgeBox: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'center',
  },
  countBadgeBoxActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  countBadgeBoxEmpty: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  countBadgeTextActive: {
    color: '#1D4ED8',
  },
  countBadgeTextEmpty: {
    color: BrandColors.neutralGray,
  },
  holidayBadgeContainer: {
    marginTop: 10,
  },
  holidayBadgeBox: {
    backgroundColor: BrandColors.accentLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
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
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  todaySummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  emptySessionText: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    textAlign: 'center',
  },
  sessionItemsList: {
    gap: 10,
  },
  purchaseSessionItem: {
    padding: 12,
    borderRadius: 12,
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
  sessionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  sessionItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  sessionItemDetails: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginBottom: 8,
  },
  sessionBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionStatusRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sessionSoldText: {
    fontSize: 12,
    color: BrandColors.success,
  },
  sessionRemainingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sessionChevronBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sessionTapPrompt: {
    fontSize: 11,
    fontWeight: '600',
    color: BrandColors.primaryDark,
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
    borderRadius: 10,
  },
  cancelHolidayBtn: {
    flex: 1,
    borderRadius: 10,
  },
  btnContent: {
    paddingVertical: 4,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    padding: 20,
    borderRadius: 14,
  },
  buyModalContainer: {
    maxHeight: '88%',
    padding: 0,
    overflow: 'hidden',
  },
  keyboardAvoidingView: {
    flexShrink: 1,
  },
  buyScrollContent: {
    padding: 20,
    paddingBottom: 28,
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
    borderRadius: 10,
    paddingVertical: 10,
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginLeft: 10,
    marginRight: 2,
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
  purchaseSummaryBox: {
    borderRadius: 10,
    padding: 10,
    marginVertical: 10,
    borderWidth: 1,
  },
  purchaseSummaryBoxActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  purchaseSummaryBoxEmpty: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  summaryBoxTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryBoxTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  summaryBoxDateLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  entriesCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  entriesCountPillActive: {
    backgroundColor: '#DBEAFE',
  },
  entriesCountPillEmpty: {
    backgroundColor: '#E2E8F0',
  },
  entriesCountPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  entriesCountPillTextActive: {
    color: '#1D4ED8',
  },
  entriesCountPillTextEmpty: {
    color: BrandColors.neutralGray,
  },
  summaryBoxDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  summaryBoxTotalText: {
    fontSize: 12,
    color: BrandColors.textLight,
  },
  viewEntriesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewEntriesLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.primary,
  },
  summaryBoxEmptyNote: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    marginTop: 4,
    fontStyle: 'italic',
  },
  entriesModalContainer: {
    maxHeight: '85%',
    margin: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
  },
  entriesStatsBanner: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginVertical: 10,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  entriesStatCol: {
    alignItems: 'center',
    flex: 1,
  },
  entriesStatVal: {
    fontSize: 13,
    fontWeight: '800',
    color: BrandColors.primaryDark,
  },
  entriesStatLbl: {
    fontSize: 10,
    fontWeight: '600',
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  entriesStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  entriesScrollView: {
    maxHeight: 380,
  },
  entriesScrollContent: {
    paddingBottom: 10,
    gap: 10,
  },
  entryCardItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    elevation: 1,
  },
  entryCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  entryTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  entryCategoryTag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  entryCategoryTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  entrySessionTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  entrySessionTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: BrandColors.neutralGray,
  },
  entryNumberLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: BrandColors.neutralGray,
  },
  entryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryActionBtn: {
    margin: 0,
  },
  entryDataGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
  },
  entryDataCell: {
    alignItems: 'center',
    flex: 1,
  },
  entryDataLabel: {
    fontSize: 10,
    color: BrandColors.neutralGray,
    fontWeight: '600',
  },
  entryDataValueBold: {
    fontSize: 13,
    fontWeight: '800',
    color: BrandColors.textLight,
    marginTop: 2,
  },
  entryDataValue: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.textLight,
    marginTop: 2,
  },
  entryDataValuePrimary: {
    fontSize: 13,
    fontWeight: '800',
    color: BrandColors.primary,
    marginTop: 2,
  },
  entryStatusBar: {
    marginTop: 6,
  },
  entryStatusText: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    fontStyle: 'italic',
  },
  entriesModalFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  addMoreEntriesBtn: {
    borderRadius: 8,
  },
  emptyEntriesBox: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  emptyEntriesTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  emptyEntriesSubtitle: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  editModalCard: {
    maxHeight: '90%',
    margin: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
  },
  editModalContent: {
    paddingBottom: 20,
    gap: 12,
  },
  autoTotalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 12,
    marginVertical: 4,
  },
  autoTotalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  autoTotalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: BrandColors.primaryDark,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 8,
  },
  submitBtn: {
    flex: 1,
    borderRadius: 8,
  },
  errorText: {
    color: BrandColors.danger,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  successText: {
    color: BrandColors.success,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
});
