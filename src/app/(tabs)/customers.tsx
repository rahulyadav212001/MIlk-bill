import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  IconButton,
  Portal,
  Modal,
  TextInput,
  HelperText,
  Divider,
  Searchbar,
  SegmentedButtons,
} from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
} from '../../services/customerService';
import {
  initializeDailyDeliveries,
  updateDeliveryQuantity,
} from '../../services/deliveryService';
import {
  markCustomerHoliday,
  cancelCustomerHoliday,
  isSupplierHoliday,
} from '../../services/holidayService';
import {
  generateCustomerHistoryPDF,
} from '../../services/pdfService';
import {
  getCustomerDailyAccountHistory,
  getCustomerMonthlyAccountHistory,
  getCustomerRangeAccountHistory,
} from '../../services/customerHistoryService';
import {
  Customer,
  Delivery,
  MilkDeliveryTime,
  MilkCategory,
  CustomerRangeAccountsHistory,
} from '../../types';
import { BrandColors } from '../../constants/theme';
import { HeaderBar } from '../../components/HeaderBar';
import { HolidaySettingsModal } from '../../components/HolidaySettingsModal';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { EmptyState } from '../../components/EmptyState';
import { CalendarDatePickerModal } from '../../components/CalendarDatePickerModal';
import {
  getTodayKolkata,
  formatDisplayDate,
  addDays,
  getMonthName,
} from '../../utils/date';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function CustomersScreen() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKolkata());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [supplierHolidayActive, setSupplierHolidayActive] = useState(false);

  // Settings & Holiday Modal State
  const [holidaySettingsModalVisible, setHolidaySettingsModalVisible] = useState(false);

  // Add/Edit Customer Modal State
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custLocation, setCustLocation] = useState('');
  const [custMilkCategory, setCustMilkCategory] = useState<MilkCategory>('buffalo');
  const [custStartDate, setCustStartDate] = useState(getTodayKolkata());
  const [custQuantityStr, setCustQuantityStr] = useState('1');
  const [custPriceStr, setCustPriceStr] = useState('30');
  const [custDeliveryTime, setCustDeliveryTime] = useState<MilkDeliveryTime>('morning');
  const [savingCust, setSavingCust] = useState(false);
  const [custError, setCustError] = useState('');
  const addCustScrollRef = useRef<any>(null);

  // Direct Quantity Edit Modal
  const [qtyModalVisible, setQtyModalVisible] = useState(false);
  const [qtyTargetCustomer, setQtyTargetCustomer] = useState<Customer | null>(null);
  const [customQtyStr, setCustomQtyStr] = useState('');
  const [savingQty, setSavingQty] = useState(false);

  // Holiday Confirmation Modals
  const [holidayModalVisible, setHolidayModalVisible] = useState(false);
  const [holidayTargetCust, setHolidayTargetCust] = useState<Customer | null>(null);
  const [markingHoliday, setMarkingHoliday] = useState(false);

  const [cancelHolidayModalVisible, setCancelHolidayModalVisible] = useState(false);
  const [cancelHolidayTargetCust, setCancelHolidayTargetCust] = useState<Customer | null>(null);
  const [cancellingHoliday, setCancellingHoliday] = useState(false);

  // Review Quantity Modal (if delivery was manually edited prior to holiday)
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewTargetCust, setReviewTargetCust] = useState<Customer | null>(null);
  const [reviewQtyStr, setReviewQtyStr] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  // Customer History Modal & Tabs State: 'daily' | 'monthly' | 'custom'
  const [customerHistoryModalVisible, setCustomerHistoryModalVisible] = useState(false);
  const [customerHistoryTab, setCustomerHistoryTab] = useState<'daily' | 'monthly' | 'custom'>('daily');

  // Daily History states
  const [custHistoryDate, setCustHistoryDate] = useState<string>(getTodayKolkata());
  const [dailyCustHistoryData, setDailyCustHistoryData] = useState<CustomerRangeAccountsHistory | null>(null);
  const [loadingDailyCustHistory, setLoadingDailyCustHistory] = useState(false);

  // Monthly History states
  const [monthlyCustYear, setMonthlyCustYear] = useState<number>(() => {
    const today = getTodayKolkata();
    return parseInt(today.split('-')[0], 10);
  });
  const [monthlyCustMonth, setMonthlyCustMonth] = useState<number>(() => {
    const today = getTodayKolkata();
    return parseInt(today.split('-')[1], 10);
  });
  const [monthlyCustHistoryData, setMonthlyCustHistoryData] = useState<CustomerRangeAccountsHistory | null>(null);
  const [loadingMonthlyCustHistory, setLoadingMonthlyCustHistory] = useState(false);
  const [expandedMonthlyCustomers, setExpandedMonthlyCustomers] = useState<Set<string>>(new Set());

  // Custom History states (Multi-month range)
  const [custCustomStartDate, setCustCustomStartDate] = useState<string>(getTodayKolkata());
  const [custCustomEndDate, setCustCustomEndDate] = useState<string>(getTodayKolkata());
  const [customCustHistoryData, setCustomCustHistoryData] = useState<CustomerRangeAccountsHistory | null>(null);
  const [loadingCustomCustHistory, setLoadingCustomCustHistory] = useState(false);
  const [expandedCustomCustomers, setExpandedCustomCustomers] = useState<Set<string>>(new Set());

  // Calendar Date Picker Modal for customer history, main screen & registration
  const [calendarPickerVisible, setCalendarPickerVisible] = useState(false);
  const [calendarTargetField, setCalendarTargetField] = useState<
    'main' | 'history_daily' | 'custom_start' | 'custom_end' | 'cust_reg'
  >('main');

  // PDF generation loading
  const [generatingCustPDF, setGeneratingCustPDF] = useState(false);

  const loadData = useCallback(async (targetDate: string) => {
    try {
      const [custList, delList, supHoliday] = await Promise.all([
        getCustomers(),
        initializeDailyDeliveries(targetDate),
        isSupplierHoliday(targetDate),
      ]);
      setCustomers(custList);
      setDeliveries(delList);
      setSupplierHolidayActive(supHoliday);
      setPermissionError(false);
    } catch (err: any) {
      if (err?.code === 'permission-denied' || err?.message?.includes('insufficient permissions')) {
        setPermissionError(true);
      }
      console.warn('Could not load customers and deliveries:', err?.message || err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData(selectedDate);
    }, [loadData, selectedDate])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadData(selectedDate);
  };

  const handleDateChange = (delta: number) => {
    const nextDate = addDays(selectedDate, delta);
    setSelectedDate(nextDate);
    setLoading(true);
  };

  // --- Add / Edit Customer Handlers ---
  const handleOpenAddCustomer = () => {
    setEditingCustomer(null);
    setCustName('');
    setCustPhone('');
    setCustLocation('');
    setCustMilkCategory('buffalo');
    setCustStartDate(getTodayKolkata());
    setCustQuantityStr('1');
    setCustPriceStr('30');
    setCustDeliveryTime('morning');
    setCustError('');
    setAddModalVisible(true);
  };

  const handleOpenEditCustomer = (cust: Customer) => {
    setEditingCustomer(cust);
    setCustName(cust.name);
    setCustPhone(cust.phone);
    setCustLocation(cust.location || '');
    setCustMilkCategory(cust.milkCategory || 'buffalo');
    setCustStartDate(cust.deliveryStartDate || getTodayKolkata());
    setCustQuantityStr(
      cust.defaultDailyQuantity != null && cust.defaultDailyQuantity > 0
        ? cust.defaultDailyQuantity.toString()
        : '1'
    );
    setCustPriceStr(cust.pricePerLiter.toString());
    setCustDeliveryTime(cust.deliveryTime === 'evening' ? 'evening' : 'morning');
    setCustError('');
    setAddModalVisible(true);
  };

  const promptDeleteCustomer = (cust: Customer) => {
    Alert.alert(
      'Delete Customer',
      `Are you sure you want to delete this customer?\n\nThis action may also permanently delete all associated delivery history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCustomer(cust.id, true);
              await loadData(selectedDate);
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete customer.');
            }
          },
        },
      ]
    );
  };

  const handleSaveCustomer = async () => {
    if (!custName.trim()) {
      setCustError('Customer name is required.');
      return;
    }
    const cleanPhone = custPhone.trim();
    if (!cleanPhone || cleanPhone.length < 10) {
      setCustError('Please enter a valid 10-digit phone number.');
      return;
    }
    const cleanLocation = custLocation.trim();
    if (!cleanLocation) {
      setCustError('Customer location is required.');
      return;
    }
    if (!custMilkCategory) {
      setCustError('Please select a milk category.');
      return;
    }
    const cleanStartDate = custStartDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanStartDate)) {
      setCustError('Please enter a valid start date (YYYY-MM-DD).');
      return;
    }
    const newCustQty = parseFloat(custQuantityStr);
    if (isNaN(newCustQty) || newCustQty <= 0) {
      setCustError('How Many Litres of Milk must be greater than 0 (e.g. 1.5 Litres).');
      return;
    }
    const newCustPrice = parseFloat(custPriceStr) || 0;
    if (newCustPrice <= 0) {
      setCustError('Milk price per liter must be greater than ₹0.');
      return;
    }

    setSavingCust(true);
    setCustError('');

    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, {
          name: custName.trim(),
          phone: cleanPhone,
          location: cleanLocation,
          milkCategory: custMilkCategory,
          pricePerLiter: newCustPrice,
          defaultDailyQuantity: newCustQty,
          deliveryTime: custDeliveryTime,
          deliveryStartDate: cleanStartDate,
        });
      } else {
        await addCustomer({
          name: custName.trim(),
          phone: cleanPhone,
          location: cleanLocation,
          milkCategory: custMilkCategory,
          pricePerLiter: newCustPrice,
          defaultDailyQuantity: newCustQty,
          deliveryTime: custDeliveryTime,
          deliveryStartDate: cleanStartDate,
        });
      }

      setAddModalVisible(false);
      await loadData(selectedDate);
    } catch (err: any) {
      setCustError(err?.message || 'Failed to save customer.');
    } finally {
      setSavingCust(false);
    }
  };

  // --- Daily Quantity Editing Handlers ---
  const getDeliveryForCustomer = (customerId: string): Delivery | undefined => {
    return deliveries.find((d) => d.customerId === customerId);
  };

  const handleOpenCustomQty = (cust: Customer) => {
    const existing = getDeliveryForCustomer(cust.id);
    if (existing?.status === 'customer_holiday' || existing?.status === 'supplier_holiday') {
      Alert.alert('Notice', 'Cannot edit milk quantity while customer is on holiday.');
      return;
    }
    const currentQty = existing ? existing.actualQuantity : cust.defaultDailyQuantity;
    setQtyTargetCustomer(cust);
    setCustomQtyStr(currentQty.toString());
    setQtyModalVisible(true);
  };

  const handleSaveCustomQty = async () => {
    if (!qtyTargetCustomer) return;
    const val = parseFloat(customQtyStr);
    if (isNaN(val) || val < 0) {
      Alert.alert('Invalid Quantity', 'Please enter a valid positive decimal quantity (e.g. 0.5, 1, 1.5).');
      return;
    }

    setSavingQty(true);
    try {
      const updated = await updateDeliveryQuantity(
        qtyTargetCustomer.id,
        selectedDate,
        val,
        qtyTargetCustomer.name,
        qtyTargetCustomer.pricePerLiter
      );
      setDeliveries((prev) =>
        prev.map((d) => (d.customerId === qtyTargetCustomer.id ? updated : d))
      );
      setQtyModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update delivery quantity.');
    } finally {
      setSavingQty(false);
    }
  };

  // --- Customer Holiday Handlers ---
  const handleOpenConfirmHoliday = (cust: Customer) => {
    if (supplierHolidayActive) {
      Alert.alert('Supplier Holiday', 'Today is a Supplier Holiday. All deliveries are already paused.');
      return;
    }
    setHolidayTargetCust(cust);
    setHolidayModalVisible(true);
  };

  const handleConfirmHoliday = async () => {
    if (!holidayTargetCust) return;
    setMarkingHoliday(true);
    try {
      const res = await markCustomerHoliday(holidayTargetCust, selectedDate);
      setDeliveries((prev) =>
        prev.map((d) => (d.customerId === holidayTargetCust.id ? res.delivery : d))
      );
      setHolidayModalVisible(false);
      setHolidayTargetCust(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to mark customer holiday.');
    } finally {
      setMarkingHoliday(false);
    }
  };

  const handleOpenCancelHoliday = (cust: Customer) => {
    if (supplierHolidayActive) {
      Alert.alert('Supplier Holiday', 'Today is a Supplier Holiday. Deliveries remain paused.');
      return;
    }
    setCancelHolidayTargetCust(cust);
    setCancelHolidayModalVisible(true);
  };

  const handleConfirmCancelHoliday = async () => {
    if (!cancelHolidayTargetCust) return;
    setCancellingHoliday(true);
    try {
      const res = await cancelCustomerHoliday(cancelHolidayTargetCust, selectedDate);
      if (res.requiresReview) {
        // Must ask user to review/re-enter quantity because delivery was manually edited before holiday
        setCancelHolidayModalVisible(false);
        setReviewTargetCust(cancelHolidayTargetCust);
        setReviewQtyStr((res.previousQuantity || cancelHolidayTargetCust.defaultDailyQuantity).toString());
        setReviewModalVisible(true);
        setCancelHolidayTargetCust(null);
        return;
      }

      if (res.delivery) {
        setDeliveries((prev) =>
          prev.map((d) => (d.customerId === cancelHolidayTargetCust.id ? res.delivery! : d))
        );
      }
      setCancelHolidayModalVisible(false);
      setCancelHolidayTargetCust(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to cancel holiday.');
    } finally {
      setCancellingHoliday(false);
    }
  };

  const handleSaveReviewQty = async () => {
    if (!reviewTargetCust) return;
    const val = parseFloat(reviewQtyStr);
    if (isNaN(val) || val < 0) {
      Alert.alert('Invalid Quantity', 'Please enter a valid positive decimal quantity.');
      return;
    }
    setSavingReview(true);
    try {
      const res = await cancelCustomerHoliday(reviewTargetCust, selectedDate, val);
      if (res.delivery) {
        setDeliveries((prev) =>
          prev.map((d) => (d.customerId === reviewTargetCust.id ? res.delivery! : d))
        );
      }
      setReviewModalVisible(false);
      setReviewTargetCust(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to restore delivery.');
    } finally {
      setSavingReview(false);
    }
  };

  // --- Customer History Handlers (Daily / Monthly / Custom) ---
  const loadDailyCustomerHistory = async (date: string) => {
    setLoadingDailyCustHistory(true);
    try {
      const data = await getCustomerDailyAccountHistory(date);
      setDailyCustHistoryData(data);
    } catch (err) {
      console.error('Failed to load customer daily history:', err);
    } finally {
      setLoadingDailyCustHistory(false);
    }
  };

  const loadMonthlyCustomerHistory = async (year: number, month: number) => {
    setLoadingMonthlyCustHistory(true);
    try {
      const data = await getCustomerMonthlyAccountHistory(year, month);
      setMonthlyCustHistoryData(data);
    } catch (err) {
      console.error('Failed to load customer monthly history:', err);
    } finally {
      setLoadingMonthlyCustHistory(false);
    }
  };

  const loadCustomCustomerHistory = async (startDate: string, endDate: string) => {
    setLoadingCustomCustHistory(true);
    try {
      const data = await getCustomerRangeAccountHistory(startDate, endDate);
      setCustomCustHistoryData(data);
    } catch (err) {
      console.error('Failed to load customer custom history:', err);
    } finally {
      setLoadingCustomCustHistory(false);
    }
  };

  const handleOpenCustomerHistory = () => {
    const today = getTodayKolkata();
    setCustHistoryDate(today);
    loadDailyCustomerHistory(today);

    const yr = parseInt(today.split('-')[0], 10);
    const mo = parseInt(today.split('-')[1], 10);
    setMonthlyCustYear(yr);
    setMonthlyCustMonth(mo);
    loadMonthlyCustomerHistory(yr, mo);

    setCustCustomStartDate(today);
    setCustCustomEndDate(today);
    loadCustomCustomerHistory(today, today);

    setCustomerHistoryModalVisible(true);
  };

  const handlePrevCustomerMonth = () => {
    let newM = monthlyCustMonth - 1;
    let newY = monthlyCustYear;
    if (newM < 1) {
      newM = 12;
      newY -= 1;
    }
    setMonthlyCustMonth(newM);
    setMonthlyCustYear(newY);
    loadMonthlyCustomerHistory(newY, newM);
  };

  const handleNextCustomerMonth = () => {
    let newM = monthlyCustMonth + 1;
    let newY = monthlyCustYear;
    if (newM > 12) {
      newM = 1;
      newY += 1;
    }
    setMonthlyCustMonth(newM);
    setMonthlyCustYear(newY);
    loadMonthlyCustomerHistory(newY, newM);
  };

  const toggleMonthlyCustomerExpanded = (custId: string) => {
    setExpandedMonthlyCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(custId)) {
        next.delete(custId);
      } else {
        next.add(custId);
      }
      return next;
    });
  };

  const toggleCustomCustomerExpanded = (custId: string) => {
    setExpandedCustomCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(custId)) {
        next.delete(custId);
      } else {
        next.add(custId);
      }
      return next;
    });
  };

  const handleCalendarDateSelected = (newDate: string) => {
    setCalendarPickerVisible(false);
    if (calendarTargetField === 'main') {
      setSelectedDate(newDate);
      loadData(newDate);
    } else if (calendarTargetField === 'history_daily') {
      setCustHistoryDate(newDate);
      loadDailyCustomerHistory(newDate);
    } else if (calendarTargetField === 'custom_start') {
      setCustCustomStartDate(newDate);
      let end = custCustomEndDate;
      if (newDate > end) {
        end = newDate;
        setCustCustomEndDate(newDate);
      }
      loadCustomCustomerHistory(newDate, end);
    } else if (calendarTargetField === 'custom_end') {
      setCustCustomEndDate(newDate);
      let start = custCustomStartDate;
      if (newDate < start) {
        start = newDate;
        setCustCustomStartDate(newDate);
      }
      loadCustomCustomerHistory(start, newDate);
    } else if (calendarTargetField === 'cust_reg') {
      setCustStartDate(newDate);
      setCustError('');
    }
  };

  const handleDownloadCustomerPDF = async (reportType: 'daily' | 'monthly' | 'custom') => {
    let dataToExport: CustomerRangeAccountsHistory | null = null;
    if (reportType === 'daily') dataToExport = dailyCustHistoryData;
    else if (reportType === 'monthly') dataToExport = monthlyCustHistoryData;
    else dataToExport = customCustHistoryData;

    if (!dataToExport || dataToExport.allDeliveries.length === 0) {
      Alert.alert('No Data', 'There are no customer delivery records to generate PDF.');
      return;
    }

    setGeneratingCustPDF(true);
    try {
      await generateCustomerHistoryPDF(dataToExport, reportType);
    } catch (err: any) {
      Alert.alert('PDF Error', err?.message || 'Failed to generate Customer History PDF.');
    } finally {
      setGeneratingCustPDF(false);
    }
  };

  // Filter customers by search (name, phone, or location)
  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery.trim()) ||
      (c.location && c.location.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Dynamically calculate total customer milk for the selected date
  const customerMilkSummary = useMemo(() => {
    let cowLitres = 0;
    let buffaloLitres = 0;
    const handledCustIds = new Set<string>();

    customers.forEach((cust) => {
      handledCustIds.add(cust.id);
      const del = deliveries.find((d) => d.customerId === cust.id);
      const isCustHoliday = del?.status === 'customer_holiday';
      const isSupHoliday = del?.status === 'supplier_holiday' || supplierHolidayActive;

      let qty = 0;
      if (isCustHoliday || isSupHoliday) {
        qty = 0;
      } else if (del) {
        qty = Number(del.actualQuantity) || 0;
      } else {
        qty = Number(cust.defaultDailyQuantity) || 0;
      }

      if (cust.milkCategory === 'cow') {
        cowLitres += qty;
      } else {
        buffaloLitres += qty;
      }
    });

    deliveries.forEach((del) => {
      if (handledCustIds.has(del.customerId)) return;
      const isCustHoliday = del.status === 'customer_holiday';
      const isSupHoliday = del.status === 'supplier_holiday' || supplierHolidayActive;
      if (isCustHoliday || isSupHoliday) return;
      const qty = Number(del.actualQuantity) || 0;
      buffaloLitres += qty;
    });

    return {
      cow: Number(cowLitres.toFixed(2)),
      buffalo: Number(buffaloLitres.toFixed(2)),
      total: Number((cowLitres + buffaloLitres).toFixed(2)),
    };
  }, [customers, deliveries, supplierHolidayActive]);

  const renderCustomerItem = ({ item }: { item: Customer }) => {
    const del = getDeliveryForCustomer(item.id);
    const actualQty = del ? del.actualQuantity : item.defaultDailyQuantity;
    const dailyAmt = del
      ? del.amount
      : Number((item.defaultDailyQuantity * item.pricePerLiter).toFixed(2));
    const status = del ? del.status : 'delivered';

    const isCustomerHoliday = status === 'customer_holiday';
    const isSupHoliday = status === 'supplier_holiday' || supplierHolidayActive;

    return (
      <Card style={styles.card}>
        <Card.Content>
          {/* Header Row: Customer Name, Phone, Delivery Time Badge, Edit & Delete */}
          <View style={styles.cardHeader}>
            <View style={styles.custInfo}>
              <Text style={styles.custName}>{item.name}</Text>
              <Text style={styles.phoneText}>📞 {item.phone}</Text>
              {item.location ? (
                <Text style={styles.locationText} numberOfLines={1}>
                  📍 {item.location}
                </Text>
              ) : null}
            </View>

            <View style={styles.badgeRow}>
              {/* Delivery Time Badge */}
              <View style={styles.timeBadgeBox}>
                <Text style={styles.timeBadgeText}>
                  {item.deliveryTime === 'evening'
                    ? '🌇 Evening'
                    : item.deliveryTime === 'afternoon'
                    ? '☀️ Afternoon'
                    : '🌅 Morning'}
                </Text>
              </View>

              <IconButton
                icon="pencil-outline"
                size={18}
                iconColor={BrandColors.neutralGray}
                onPress={() => handleOpenEditCustomer(item)}
              />
              <IconButton
                icon="delete-outline"
                size={18}
                iconColor={BrandColors.danger}
                onPress={() => promptDeleteCustomer(item)}
              />
            </View>
          </View>

          {/* Customer Milk Specifications: Split into 2 clear lines */}
          <View style={styles.customerSpecsBox}>
            {/* Line 1: Default Quantity & Milk Category */}
            <View style={styles.specLine}>
              <Text style={styles.specText}>
                Default Milk:{' '}
                <Text style={styles.boldText}>
                  {item.defaultDailyQuantity > 0 ? `${item.defaultDailyQuantity} L` : '1 L'}
                </Text>
              </Text>
              <Text style={styles.specSeparator}>•</Text>
              <Text style={styles.specText}>
                Category:{' '}
                <Text style={styles.boldText}>
                  {item.milkCategory === 'cow' ? '🐄 Cow Milk' : '🐃 Buffalo Milk'}
                </Text>
              </Text>
            </View>

            {/* Line 2: Rate directly below default */}
            <View style={styles.specLine}>
              <Text style={styles.specText}>
                Rate:{' '}
                <Text style={styles.boldText}>₹{item.pricePerLiter}/L</Text>
              </Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          {/* Daily Milk Actual Quantity Section */}
          <View style={styles.quantitySection}>
            <View style={styles.qtyDisplayCol}>
              <Text style={styles.qtyLabel}>Actual Quantity</Text>
              <TouchableOpacity
                onPress={() => (isCustomerHoliday || isSupHoliday ? null : handleOpenCustomQty(item))}
                style={[
                  styles.qtyTouchBox,
                  (isCustomerHoliday || isSupHoliday) && styles.qtyTouchBoxDisabled,
                  actualQty === 0 && !(isCustomerHoliday || isSupHoliday) && styles.qtyTouchBoxPending,
                ]}
                disabled={isCustomerHoliday || isSupHoliday}
              >
                <Text
                  style={[
                    styles.qtyValue,
                    (isCustomerHoliday || isSupHoliday) && { color: BrandColors.neutralGray },
                    actualQty === 0 && !(isCustomerHoliday || isSupHoliday) && { color: '#D97706' },
                  ]}
                >
                  {actualQty === 0 && !(isCustomerHoliday || isSupHoliday)
                    ? '0 L (Pending)'
                    : `${actualQty} Liter`}
                </Text>
                {!(isCustomerHoliday || isSupHoliday) && (
                  <MaterialCommunityIcons
                    name="pencil"
                    size={14}
                    color={actualQty === 0 ? '#D97706' : BrandColors.primary}
                  />
                )}
              </TouchableOpacity>
            </View>

            {(isCustomerHoliday || isSupHoliday) && (
              <View style={styles.holidayBadgeContainer}>
                <View
                  style={[
                    styles.holidayStatusBadge,
                    {
                      backgroundColor: isSupHoliday ? '#FEE2E2' : '#FEF3C7',
                      borderColor: isSupHoliday ? '#FECACA' : '#FDE68A',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: isSupHoliday ? BrandColors.danger : '#D97706',
                      fontWeight: '700',
                      fontSize: 11,
                    }}
                  >
                    {isSupHoliday ? '🏪 Supplier Holiday' : '🏖️ Customer Holiday'}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Holiday Action Button (Directly ABOVE Today's Amount Section) */}
          <View style={styles.holidaySection}>
            {isSupHoliday ? (
              <Button
                mode="outlined"
                compact
                icon="store-off"
                disabled
                style={styles.supplierHolidayBtn}
                textColor={BrandColors.danger}
              >
                Supplier Holiday
              </Button>
            ) : isCustomerHoliday ? (
              <Button
                mode="contained"
                compact
                icon="calendar-check"
                onPress={() => handleOpenCancelHoliday(item)}
                style={styles.cancelHolidayBtn}
                buttonColor="#D97706"
                textColor="#FFFFFF"
              >
                Cancel Holiday
              </Button>
            ) : (
              <Button
                mode="outlined"
                compact
                icon="umbrella"
                onPress={() => handleOpenConfirmHoliday(item)}
                style={styles.holidayBtn}
                textColor="#D97706"
              >
                Holiday
              </Button>
            )}
          </View>

          {/* Today's Amount Section (Directly BELOW Holiday Button) */}
          <View style={styles.amountSection}>
            <Text style={styles.amountLabel}>Today&apos;s Amount:</Text>
            <Text
              style={[
                styles.amountValue,
                (isCustomerHoliday || isSupHoliday) && { color: BrandColors.neutralGray },
              ]}
            >
              ₹{dailyAmt}
            </Text>
          </View>

          <Divider style={styles.divider} />

          {/* Bottom Card Actions: History */}
          <View style={styles.actionRow}>
            <Button
              mode="contained"
              icon="history"
              compact
              onPress={() =>
                router.push({
                  pathname: '/customer/[id]/history',
                  params: { id: item.id },
                } as any)
              }
              style={styles.historyBtn}
              buttonColor={BrandColors.primaryDark}
            >
              History
            </Button>
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <HeaderBar
        title="Customers"
        subtitle={`${customers.length} Registered Customers`}
        onSettingsPress={() => setHolidaySettingsModalVisible(true)}
      />

      {/* Top Main Action Buttons */}
      <View style={styles.topBar}>
        <Button
          mode="contained"
          icon="plus"
          onPress={handleOpenAddCustomer}
          style={styles.topBtn}
          buttonColor={BrandColors.primaryDark}
        >
          Add Customer
        </Button>

        <Button
          mode="contained"
          icon="history"
          onPress={handleOpenCustomerHistory}
          style={styles.topBtn}
          buttonColor={BrandColors.secondary}
        >
          History
        </Button>
      </View>

      {permissionError && (
        <View style={styles.permissionBanner}>
          <MaterialCommunityIcons name="shield-alert-outline" size={20} color={BrandColors.danger} />
          <Text style={styles.permissionText}>
            Firebase permission denied. Go to Firebase Console &gt; Firestore Database &gt; Rules, set allow read, write: if true; and click Publish.
          </Text>
        </View>
      )}

      {/* Customer Dashboard: Box 1 (Total Customer Milk) & Box 2 (Calendar / Date Selector) */}
      <View style={styles.dashboardContainer}>
        {/* Box 1: Total Customer Milk */}
        <View style={styles.dashboardBox}>
          <View style={styles.dashHeaderRow}>
            <MaterialCommunityIcons name="water-percent" size={18} color={BrandColors.primary} />
            <Text style={styles.dashBoxTitle} numberOfLines={1}>
              Total Customer Milk
            </Text>
          </View>
          <View style={styles.dashTotalValueRow}>
            <Text style={styles.dashTotalValue}>{customerMilkSummary.total}</Text>
            <Text style={styles.dashTotalUnit}>Litres</Text>
          </View>
          <View style={styles.dashBreakdownRow}>
            <Text style={styles.dashBreakdownBadge} numberOfLines={1}>
              🐄 Cow: <Text style={styles.boldText}>{customerMilkSummary.cow} L</Text>
            </Text>
            <Text style={styles.dashBreakdownBadge} numberOfLines={1}>
              🐃 Buffalo: <Text style={styles.boldText}>{customerMilkSummary.buffalo} L</Text>
            </Text>
          </View>
        </View>

        {/* Box 2: Calendar / Date Selector */}
        <TouchableOpacity
          style={styles.dashboardBox}
          activeOpacity={0.7}
          onPress={() => {
            setCalendarTargetField('main');
            setCalendarPickerVisible(true);
          }}
        >
          <View style={styles.dashHeaderRow}>
            <MaterialCommunityIcons name="calendar-month" size={18} color={BrandColors.secondary} />
            <Text style={styles.dashBoxTitle} numberOfLines={1}>
              Delivery Date
            </Text>
          </View>
          <View style={styles.dashDateCenter}>
            <Text style={styles.dashDateValue} numberOfLines={1}>
              {formatDisplayDate(selectedDate)}
            </Text>
            <Text style={styles.dashDateHint}>Tap to choose date 📅</Text>
          </View>
          <View style={styles.dashDateNavRow}>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handleDateChange(-1);
              }}
              style={styles.dashNavBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="chevron-left" size={18} color={BrandColors.primaryDark} />
            </TouchableOpacity>
            <Text style={styles.dashNavLabel}>Change Day</Text>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handleDateChange(1);
              }}
              style={styles.dashNavBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="chevron-right" size={18} color={BrandColors.primaryDark} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </View>

      {/* Daily Supply Summary Button */}
      <TouchableOpacity
        style={styles.dailySupplySummaryBtn}
        onPress={() =>
          router.push({
            pathname: '/customer/daily-supply-summary',
            params: { date: selectedDate },
          } as any)
        }
        activeOpacity={0.85}
      >
        <View style={styles.dailySupplyBtnLeft}>
          <View style={styles.dailySupplyIconBadge}>
            <MaterialCommunityIcons name="chart-box-outline" size={20} color="#FFFFFF" />
          </View>
          <View style={styles.dailySupplyBtnTexts}>
            <Text style={styles.dailySupplyBtnTitle}>Daily Supply Summary</Text>
            <Text style={styles.dailySupplyBtnSub}>
              Compare Daily Supply vs Customer Sales • Stock & P/L
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <Searchbar
          placeholder="Search customer name or phone..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
        />
      </View>

      {loading ? (
        <LoadingIndicator message="Loading daily deliveries..." />
      ) : (
        <FlatList
          data={filteredCustomers}
          keyExtractor={(item) => item.id}
          renderItem={renderCustomerItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[BrandColors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="account-outline"
              title="No Customers Found"
              description="Click 'Add Customer' above to register your first milk recipient."
            />
          }
        />
      )}

      {/* Shared Settings & Holiday Modal (All Holiday / Custom Holiday) */}
      <HolidaySettingsModal
        visible={holidaySettingsModalVisible}
        onDismiss={() => setHolidaySettingsModalVisible(false)}
        onHolidaysUpdated={() => loadData(selectedDate)}
      />

      {/* 1. Customer Registration & Edit Modal */}
      <Portal>
        <Modal
          visible={addModalVisible}
          onDismiss={() => setAddModalVisible(false)}
          contentContainerStyle={styles.addCustomerModalContent}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardAvoidingView}
          >
            <View style={styles.addCustomerModalHeader}>
              <Text style={styles.modalTitle}>
                {editingCustomer ? 'Edit Customer' : 'Customer Registration'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {editingCustomer
                  ? 'Update customer details and delivery preference'
                  : 'Register a customer for daily milk delivery'}
              </Text>
            </View>

            {custError ? (
              <HelperText type="error" visible style={styles.helperText}>
                {custError}
              </HelperText>
            ) : null}

            <ScrollView
              ref={addCustScrollRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.addCustomerScrollView}
              contentContainerStyle={styles.addCustomerScrollContent}
            >
              {/* Field 1: Customer Name */}
              <TextInput
                label="Customer Name *"
                value={custName}
                onChangeText={(t) => {
                  setCustName(t);
                  setCustError('');
                }}
                mode="outlined"
                style={styles.input}
                placeholder="e.g. Rahul Sharma"
                left={<TextInput.Icon icon="account" />}
              />

              {/* Field 2: Phone Number */}
              <TextInput
                label="Phone Number *"
                value={custPhone}
                onChangeText={(t) => {
                  setCustPhone(t);
                  setCustError('');
                }}
                mode="outlined"
                keyboardType="phone-pad"
                style={styles.input}
                placeholder="e.g. 9876543210"
                left={<TextInput.Icon icon="phone" />}
              />

              {/* Field 3: Customer Location */}
              <TextInput
                label="Customer Location / Address *"
                value={custLocation}
                onChangeText={(t) => {
                  setCustLocation(t);
                  setCustError('');
                }}
                mode="outlined"
                style={styles.input}
                placeholder="e.g. Sector 14, Main Road, House #42"
                left={<TextInput.Icon icon="map-marker-outline" />}
              />

              {/* Field 4: Milk Category */}
              <View style={styles.timeSection}>
                <Text style={styles.fieldLabel}>Milk Category *</Text>
                <SegmentedButtons
                  value={custMilkCategory}
                  onValueChange={(v) => {
                    setCustMilkCategory(v as MilkCategory);
                    setCustError('');
                  }}
                  buttons={[
                    { value: 'buffalo', label: '🐃 Buffalo Milk', showSelectedCheck: true },
                    { value: 'cow', label: '🐄 Cow Milk', showSelectedCheck: true },
                  ]}
                  style={styles.timeSegmented}
                />
              </View>

              {/* Field 5: Milk Date (Click opens Calendar Date Picker) */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setCalendarTargetField('cust_reg');
                  setCalendarPickerVisible(true);
                }}
                style={styles.datePickerTouchable}
                accessibilityRole="button"
                accessibilityLabel="Select Milk Date"
              >
                <TextInput
                  label="Milk Date *"
                  value={formatDisplayDate(custStartDate)}
                  editable={false}
                  mode="outlined"
                  style={styles.inputNonEditable}
                  left={<TextInput.Icon icon="calendar" />}
                  right={
                    <TextInput.Icon
                      icon="calendar-edit"
                      onPress={() => {
                        setCalendarTargetField('cust_reg');
                        setCalendarPickerVisible(true);
                      }}
                    />
                  }
                  pointerEvents="none"
                />
              </TouchableOpacity>

              {/* Field 6: How Many Litres of Milk? */}
              <TextInput
                label="How Many Litres of Milk? *"
                value={custQuantityStr}
                onChangeText={(t) => {
                  setCustQuantityStr(t);
                  setCustError('');
                }}
                mode="outlined"
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="e.g. 1.5"
                left={<TextInput.Icon icon="cup-water" />}
                right={<TextInput.Affix text="Litres" />}
              />

              {/* Field 7: Milk Price (per litre) */}
              <TextInput
                label="Milk Price (per litre) *"
                value={custPriceStr}
                onChangeText={(t) => {
                  setCustPriceStr(t);
                  setCustError('');
                }}
                mode="outlined"
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="e.g. 30"
                left={<TextInput.Icon icon="currency-inr" />}
                right={<TextInput.Affix text="₹/L" />}
              />

              {/* Field 8: Milk Delivery Time */}
              <View style={styles.timeSection}>
                <Text style={styles.fieldLabel}>Milk Delivery Time *</Text>
                <SegmentedButtons
                  value={custDeliveryTime}
                  onValueChange={(v) => setCustDeliveryTime(v as MilkDeliveryTime)}
                  buttons={[
                    { value: 'morning', label: '🌅 Morning', showSelectedCheck: true },
                    { value: 'evening', label: '🌇 Evening', showSelectedCheck: true },
                  ]}
                  style={styles.timeSegmented}
                />
              </View>
            </ScrollView>

            {/* Permanent fixed action footer - always pinned and visible above keyboard! */}
            <View style={styles.modalFixedActions}>
              <Button
                mode="text"
                onPress={() => setAddModalVisible(false)}
                disabled={savingCust}
                textColor={BrandColors.neutralGray}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleSaveCustomer}
                loading={savingCust}
                disabled={savingCust}
                buttonColor={BrandColors.primaryDark}
              >
                {editingCustomer ? 'Update Customer' : 'Save Customer'}
              </Button>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>

      {/* 2. Direct Custom Quantity Modal */}
      <Portal>
        <Modal
          visible={qtyModalVisible}
          onDismiss={() => setQtyModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Text style={styles.modalTitle}>Edit Delivery Quantity</Text>
          <Text style={styles.modalSubtitle}>
            {qtyTargetCustomer?.name} on {formatDisplayDate(selectedDate)}
          </Text>

          <TextInput
            label="Delivered Milk Quantity in Liters *"
            value={customQtyStr}
            onChangeText={setCustomQtyStr}
            mode="outlined"
            keyboardType="decimal-pad"
            style={styles.input}
            right={<TextInput.Affix text="Liters" />}
          />

          <View style={styles.calcBox}>
            <Text style={styles.calcLabel}>Calculated Amount:</Text>
            <Text style={styles.calcValue}>
              ₹{Number(((parseFloat(customQtyStr) || 0) * (qtyTargetCustomer?.pricePerLiter || 0)).toFixed(2))}
            </Text>
          </View>

          <View style={styles.modalActions}>
            <Button
              mode="text"
              onPress={() => setQtyModalVisible(false)}
              disabled={savingQty}
              textColor={BrandColors.neutralGray}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSaveCustomQty}
              loading={savingQty}
              disabled={savingQty}
              buttonColor={BrandColors.primaryDark}
            >
              Save Quantity
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* 3. Confirm Customer Holiday Popup */}
      <Portal>
        <Modal
          visible={holidayModalVisible}
          onDismiss={() => setHolidayModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Text style={styles.modalTitle}>Confirm Customer Holiday</Text>
          <Text style={[styles.modalSubtitle, { marginVertical: 12, fontSize: 14 }]}>
            Are you sure you want to mark {holidayTargetCust?.name} as on holiday for today?
          </Text>

          <View style={styles.modalActions}>
            <Button
              mode="text"
              onPress={() => {
                setHolidayModalVisible(false);
                setHolidayTargetCust(null);
              }}
              disabled={markingHoliday}
              textColor={BrandColors.neutralGray}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleConfirmHoliday}
              loading={markingHoliday}
              disabled={markingHoliday}
              buttonColor="#D97706"
              textColor="#FFFFFF"
            >
              Confirm Holiday
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* 4. Cancel Customer Holiday Popup */}
      <Portal>
        <Modal
          visible={cancelHolidayModalVisible}
          onDismiss={() => setCancelHolidayModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Text style={styles.modalTitle}>Cancel Customer Holiday</Text>
          <Text style={[styles.modalSubtitle, { marginVertical: 12, fontSize: 14 }]}>
            Do you want to cancel this customer&apos;s holiday for today?
          </Text>

          <View style={styles.modalActions}>
            <Button
              mode="text"
              onPress={() => {
                setCancelHolidayModalVisible(false);
                setCancelHolidayTargetCust(null);
              }}
              disabled={cancellingHoliday}
              textColor={BrandColors.neutralGray}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleConfirmCancelHoliday}
              loading={cancellingHoliday}
              disabled={cancellingHoliday}
              buttonColor={BrandColors.primaryDark}
            >
              Confirm
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* 5. Review Quantity Modal (When delivery was manually edited prior to holiday) */}
      <Portal>
        <Modal
          visible={reviewModalVisible}
          onDismiss={() => setReviewModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Text style={styles.modalTitle}>Review Delivery Quantity</Text>
          <Text style={[styles.modalSubtitle, { marginVertical: 8, fontSize: 13 }]}>
            This delivery was manually edited before the holiday ({reviewQtyStr} L). Please review or enter the quantity to restore for today:
          </Text>

          <TextInput
            label="Restored Quantity in Liters *"
            value={reviewQtyStr}
            onChangeText={setReviewQtyStr}
            mode="outlined"
            keyboardType="decimal-pad"
            style={styles.input}
            right={<TextInput.Affix text="Liters" />}
          />

          <View style={styles.modalActions}>
            <Button
              mode="text"
              onPress={() => {
                setReviewModalVisible(false);
                setReviewTargetCust(null);
              }}
              disabled={savingReview}
              textColor={BrandColors.neutralGray}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSaveReviewQty}
              loading={savingReview}
              disabled={savingReview}
              buttonColor={BrandColors.primaryDark}
            >
              Restore Quantity
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* 6. Customer History Modal (Daily / Monthly / Custom) */}
      <Portal>
        <Modal
          visible={customerHistoryModalVisible}
          onDismiss={() => setCustomerHistoryModalVisible(false)}
          contentContainerStyle={[styles.modalContent, { maxHeight: '92%', height: '90%' }]}
        >
          <View style={styles.modalHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Customer History</Text>
              <Text style={styles.modalSubtitle}>Daily, Monthly &amp; Custom Account Records</Text>
            </View>
            <IconButton
              icon="close"
              size={20}
              onPress={() => setCustomerHistoryModalVisible(false)}
              accessibilityLabel="Close History"
            />
          </View>

          {/* Three History Tabs at Top */}
          <SegmentedButtons
            value={customerHistoryTab}
            onValueChange={(val) => setCustomerHistoryTab(val as 'daily' | 'monthly' | 'custom')}
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
            {customerHistoryTab === 'daily' && (
              <View>
                {/* Date Switcher: -1 Day, Interactive Date, +1 Day */}
                <View style={styles.historyDateSelectorRow}>
                  <Button
                    mode="text"
                    compact
                    icon="chevron-left"
                    onPress={() => {
                      const prev = addDays(custHistoryDate, -1);
                      setCustHistoryDate(prev);
                      loadDailyCustomerHistory(prev);
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
                    <Text style={styles.historyDateChipText}>{formatDisplayDate(custHistoryDate)}</Text>
                    <MaterialCommunityIcons name="chevron-down" size={14} color={BrandColors.neutralGray} />
                  </TouchableOpacity>
                  <Button
                    mode="text"
                    compact
                    contentStyle={{ flexDirection: 'row-reverse' }}
                    icon="chevron-right"
                    onPress={() => {
                      const next = addDays(custHistoryDate, 1);
                      setCustHistoryDate(next);
                      loadDailyCustomerHistory(next);
                    }}
                  >
                    +1 Day
                  </Button>
                </View>

                {/* PDF Download Button */}
                <Button
                  mode="contained"
                  icon="file-pdf-box"
                  onPress={() => handleDownloadCustomerPDF('daily')}
                  loading={generatingCustPDF}
                  disabled={generatingCustPDF || !dailyCustHistoryData || dailyCustHistoryData.allDeliveries.length === 0}
                  buttonColor="#DC2626"
                  style={styles.downloadPdfBtn}
                >
                  Download Daily PDF
                </Button>

                {loadingDailyCustHistory ? (
                  <LoadingIndicator message="Loading customer daily history..." />
                ) : !dailyCustHistoryData || dailyCustHistoryData.customerSummaries.length === 0 ? (
                  <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                    <MaterialCommunityIcons name="history" size={48} color={BrandColors.neutralGray} />
                    <Text style={{ marginTop: 8, color: BrandColors.neutralGray, textAlign: 'center' }}>
                      No customer delivery records found for {formatDisplayDate(custHistoryDate)}.
                    </Text>
                  </View>
                ) : (
                  <View>
                    {/* Day Summary Card */}
                    <View style={styles.historyDaySummaryCard}>
                      <Text style={styles.historyDaySummaryTitle}>
                        Summary for {formatDisplayDate(custHistoryDate)}
                      </Text>
                      <View style={styles.historyDayStatsRow}>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Customers</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.primaryDark }]}>
                            {dailyCustHistoryData.totalCustomers}
                          </Text>
                          <Text style={styles.historyStatSub}>Served</Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Total Milk</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.primaryDark }]}>
                            {dailyCustHistoryData.totalMilkDelivered} L
                          </Text>
                          <Text style={styles.historyStatSub}>Delivered</Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Total Amount</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.success }]}>
                            ₹{dailyCustHistoryData.totalAmount.toLocaleString('en-IN')}
                          </Text>
                          <Text style={styles.historyStatSub}>Billings</Text>
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
                            Delivered: <Text style={styles.boldText}>{dailyCustHistoryData.buffaloDelivered} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Amount: <Text style={[styles.boldText, { color: BrandColors.success }]}>₹{dailyCustHistoryData.buffaloAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                        </View>
                        <View style={styles.categoryBox}>
                          <Text style={{ fontWeight: '700', color: BrandColors.textLight }}>🐄 Cow Milk</Text>
                          <Text style={styles.categoryStat}>
                            Delivered: <Text style={styles.boldText}>{dailyCustHistoryData.cowDelivered} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Amount: <Text style={[styles.boldText, { color: BrandColors.success }]}>₹{dailyCustHistoryData.cowAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Customer-Wise Deliveries List */}
                    <Text style={[styles.subSectionTitle, { marginBottom: 8 }]}>
                      Customer-Wise Deliveries ({dailyCustHistoryData.customerSummaries.length})
                    </Text>
                    {dailyCustHistoryData.customerSummaries.map((c) => {
                      const timeEmoji =
                        c.deliveryTime === 'evening' ? '🌇' : c.deliveryTime === 'afternoon' ? '☀️' : '🌅';
                      const timeLabel =
                        c.deliveryTime ? c.deliveryTime.charAt(0).toUpperCase() + c.deliveryTime.slice(1) : 'Morning';
                      const catLabel = c.milkCategory === 'cow' ? '🐄 Cow' : '🐃 Buffalo';

                      return (
                        <View key={c.customerId} style={styles.supHistoryCard}>
                          <View style={styles.supHistoryHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.supHistoryName}>{c.customerName}</Text>
                              <Text style={styles.supHistoryPhone}>
                                📞 {c.customerPhone}{c.customerLocation ? ` • 📍 ${c.customerLocation}` : ''}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.historyStatusBadge,
                                {
                                  backgroundColor: c.paymentStatus === 'paid' ? '#ECFDF5' : '#FEF3C7',
                                  borderColor: c.paymentStatus === 'paid' ? '#A7F3D0' : '#FDE68A',
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.historyStatusBadgeText,
                                  { color: c.paymentStatus === 'paid' ? BrandColors.success : '#D97706' },
                                ]}
                              >
                                {c.paymentStatus === 'paid' ? '✓ Paid' : 'Pending'}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.historyBulletsBox}>
                            <Text style={styles.historyBulletLine}>
                              • Milk Category: <Text style={styles.boldText}>{catLabel}</Text> • Time: <Text style={styles.boldText}>{timeEmoji} {timeLabel}</Text>
                            </Text>
                            <Text style={styles.historyBulletLine}>
                              • Milk Quantity: <Text style={styles.boldText}>{c.totalMilkDelivered} Litres</Text>
                            </Text>
                            <Text style={styles.historyBulletLine}>
                              • Milk Rate: <Text style={styles.boldText}>₹{c.pricePerLiter}/Litre</Text>
                            </Text>
                            <Text style={styles.historyBulletLine}>
                              • Total Amount: <Text style={[styles.boldText, { color: BrandColors.primaryDark }]}>₹{c.totalAmount.toLocaleString('en-IN')}</Text>
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* ========================================================= */}
            {/* TAB 2: MONTHLY HISTORY                                    */}
            {/* ========================================================= */}
            {customerHistoryTab === 'monthly' && (
              <View>
                {/* Month & Year Switcher */}
                <View style={styles.monthSelectorRow}>
                  <Button mode="text" compact icon="chevron-left" onPress={handlePrevCustomerMonth}>
                    Prev Month
                  </Button>
                  <View style={styles.monthDisplayChip}>
                    <MaterialCommunityIcons name="calendar-month" size={18} color={BrandColors.primaryDark} />
                    <Text style={styles.historyDateChipText}>
                      {getMonthName(monthlyCustMonth)} {monthlyCustYear}
                    </Text>
                  </View>
                  <Button
                    mode="text"
                    compact
                    contentStyle={{ flexDirection: 'row-reverse' }}
                    icon="chevron-right"
                    onPress={handleNextCustomerMonth}
                  >
                    Next Month
                  </Button>
                </View>

                {/* PDF Download Button */}
                <Button
                  mode="contained"
                  icon="file-pdf-box"
                  onPress={() => handleDownloadCustomerPDF('monthly')}
                  loading={generatingCustPDF}
                  disabled={generatingCustPDF || !monthlyCustHistoryData || monthlyCustHistoryData.allDeliveries.length === 0}
                  buttonColor="#DC2626"
                  style={styles.downloadPdfBtn}
                >
                  Download Monthly PDF
                </Button>

                {loadingMonthlyCustHistory ? (
                  <LoadingIndicator message="Loading customer monthly history..." />
                ) : !monthlyCustHistoryData || monthlyCustHistoryData.customerSummaries.length === 0 ? (
                  <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                    <MaterialCommunityIcons name="calendar-blank" size={48} color={BrandColors.neutralGray} />
                    <Text style={{ marginTop: 8, color: BrandColors.neutralGray, textAlign: 'center' }}>
                      No customer delivery records found for {getMonthName(monthlyCustMonth)} {monthlyCustYear}.
                    </Text>
                  </View>
                ) : (
                  <View>
                    {/* Monthly Consolidated Summary Card */}
                    <View style={styles.historyDaySummaryCard}>
                      <Text style={styles.historyDaySummaryTitle}>
                        Monthly Summary – {getMonthName(monthlyCustMonth)} {monthlyCustYear}
                      </Text>
                      <View style={styles.historyDayStatsRow}>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Customers</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.primaryDark }]}>
                            {monthlyCustHistoryData.totalCustomers}
                          </Text>
                          <Text style={styles.historyStatSub}>Served</Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Total Milk</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.primaryDark }]}>
                            {monthlyCustHistoryData.totalMilkDelivered} L
                          </Text>
                          <Text style={styles.historyStatSub}>Delivered</Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Total Amount</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.success }]}>
                            ₹{monthlyCustHistoryData.totalAmount.toLocaleString('en-IN')}
                          </Text>
                          <Text style={styles.historyStatSub}>Billings</Text>
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
                            Delivered: <Text style={styles.boldText}>{monthlyCustHistoryData.buffaloDelivered} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Amount: <Text style={[styles.boldText, { color: BrandColors.success }]}>₹{monthlyCustHistoryData.buffaloAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                        </View>
                        <View style={styles.categoryBox}>
                          <Text style={{ fontWeight: '700', color: BrandColors.textLight }}>🐄 Cow Milk</Text>
                          <Text style={styles.categoryStat}>
                            Delivered: <Text style={styles.boldText}>{monthlyCustHistoryData.cowDelivered} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Amount: <Text style={[styles.boldText, { color: BrandColors.success }]}>₹{monthlyCustHistoryData.cowAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Customer-Wise Monthly List (Expandable to see daily deliveries) */}
                    <Text style={[styles.subSectionTitle, { marginBottom: 4 }]}>
                      Customer-Wise Accounts ({monthlyCustHistoryData.customerSummaries.length})
                    </Text>
                    <Text style={[styles.subSectionSubtitle, { marginBottom: 8 }]}>
                      Tap any customer below to expand their daily deliveries for this month
                    </Text>

                    {monthlyCustHistoryData.customerSummaries.map((c) => {
                      const isExpanded = expandedMonthlyCustomers.has(c.customerId);
                      const catLabel = c.milkCategory === 'cow' ? '🐄 Cow' : '🐃 Buffalo';

                      return (
                        <View key={c.customerId} style={styles.expandableCustomerCard}>
                          <TouchableOpacity
                            style={styles.expandableCustomerHeader}
                            onPress={() => toggleMonthlyCustomerExpanded(c.customerId)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.customerHeaderLeft}>
                              <Text style={styles.customerHeaderText}>{c.customerName}</Text>
                              <Text style={styles.customerHeaderStats}>
                                📞 {c.customerPhone} • {catLabel} • {c.totalMilkDelivered} L • ₹{c.totalAmount.toLocaleString('en-IN')}
                              </Text>
                            </View>
                            <MaterialCommunityIcons
                              name={isExpanded ? 'chevron-up' : 'chevron-down'}
                              size={22}
                              color={BrandColors.neutralGray}
                            />
                          </TouchableOpacity>

                          {isExpanded && (
                            <View style={styles.expandedCustomerDeliveries}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: BrandColors.neutralGray, textTransform: 'uppercase', marginBottom: 4 }}>
                                Daily Deliveries ({c.deliveries.length} days)
                              </Text>
                              {c.deliveries.map((d) => (
                                <View key={d.id} style={styles.dailyDeliveryItem}>
                                  <View>
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: BrandColors.textLight }}>
                                      📅 {formatDisplayDate(d.deliveryDate)}
                                    </Text>
                                    <Text style={{ fontSize: 11, color: BrandColors.neutralGray }}>
                                      {d.actualQuantity} L @ ₹{d.pricePerLiter}/L
                                    </Text>
                                  </View>
                                  <Text style={{ fontSize: 13, fontWeight: '700', color: BrandColors.primaryDark }}>
                                    ₹{d.amount}
                                  </Text>
                                </View>
                              ))}
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
            {/* TAB 3: CUSTOM HISTORY (Multi-month range)                 */}
            {/* ========================================================= */}
            {customerHistoryTab === 'custom' && (
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
                      <Text style={styles.customDateBtnVal}>{formatDisplayDate(custCustomStartDate)}</Text>
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
                      <Text style={styles.customDateBtnVal}>{formatDisplayDate(custCustomEndDate)}</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* PDF Download Button */}
                <Button
                  mode="contained"
                  icon="file-pdf-box"
                  onPress={() => handleDownloadCustomerPDF('custom')}
                  loading={generatingCustPDF}
                  disabled={generatingCustPDF || !customCustHistoryData || customCustHistoryData.allDeliveries.length === 0}
                  buttonColor="#DC2626"
                  style={styles.downloadPdfBtn}
                >
                  Download Custom History PDF
                </Button>

                {loadingCustomCustHistory ? (
                  <LoadingIndicator message="Loading custom period history..." />
                ) : !customCustHistoryData || customCustHistoryData.customerSummaries.length === 0 ? (
                  <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                    <MaterialCommunityIcons name="calendar-range" size={48} color={BrandColors.neutralGray} />
                    <Text style={{ marginTop: 8, color: BrandColors.neutralGray, textAlign: 'center' }}>
                      No customer delivery records found between {formatDisplayDate(custCustomStartDate)} and {formatDisplayDate(custCustomEndDate)}.
                    </Text>
                  </View>
                ) : (
                  <View>
                    {/* Period Summary Card */}
                    <View style={styles.historyDaySummaryCard}>
                      <Text style={styles.historyDaySummaryTitle}>
                        Period Summary ({customCustHistoryData.startDate} to {customCustHistoryData.endDate})
                      </Text>
                      <View style={styles.historyDayStatsRow}>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Customers</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.primaryDark }]}>
                            {customCustHistoryData.totalCustomers}
                          </Text>
                          <Text style={styles.historyStatSub}>Served</Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Total Milk</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.primaryDark }]}>
                            {customCustHistoryData.totalMilkDelivered} L
                          </Text>
                          <Text style={styles.historyStatSub}>Delivered</Text>
                        </View>
                        <View style={styles.historyStatBox}>
                          <Text style={styles.historyStatLabel}>Total Amount</Text>
                          <Text style={[styles.historyStatVal, { color: BrandColors.success }]}>
                            ₹{customCustHistoryData.totalAmount.toLocaleString('en-IN')}
                          </Text>
                          <Text style={styles.historyStatSub}>Billings</Text>
                        </View>
                      </View>
                    </View>

                    {/* Buffalo vs Cow Category Breakdown */}
                    <View style={styles.categorySummaryCard}>
                      <Text style={styles.categorySummaryTitle}>Period Milk Category Breakdown</Text>
                      <View style={styles.categorySummaryRow}>
                        <View style={styles.categoryBox}>
                          <Text style={{ fontWeight: '700', color: BrandColors.textLight }}>🐃 Buffalo Milk</Text>
                          <Text style={styles.categoryStat}>
                            Delivered: <Text style={styles.boldText}>{customCustHistoryData.buffaloDelivered} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Amount: <Text style={[styles.boldText, { color: BrandColors.success }]}>₹{customCustHistoryData.buffaloAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                        </View>
                        <View style={styles.categoryBox}>
                          <Text style={{ fontWeight: '700', color: BrandColors.textLight }}>🐄 Cow Milk</Text>
                          <Text style={styles.categoryStat}>
                            Delivered: <Text style={styles.boldText}>{customCustHistoryData.cowDelivered} L</Text>
                          </Text>
                          <Text style={styles.categoryStat}>
                            Amount: <Text style={[styles.boldText, { color: BrandColors.success }]}>₹{customCustHistoryData.cowAmount.toLocaleString('en-IN')}</Text>
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Customer-Wise Custom List (Expandable) */}
                    <Text style={[styles.subSectionTitle, { marginBottom: 4 }]}>
                      Customer-Wise Accounts ({customCustHistoryData.customerSummaries.length})
                    </Text>
                    <Text style={[styles.subSectionSubtitle, { marginBottom: 8 }]}>
                      Tap any customer below to view their delivery transactions in this date range
                    </Text>

                    {customCustHistoryData.customerSummaries.map((c) => {
                      const isExpanded = expandedCustomCustomers.has(c.customerId);
                      const catLabel = c.milkCategory === 'cow' ? '🐄 Cow' : '🐃 Buffalo';

                      return (
                        <View key={c.customerId} style={styles.expandableCustomerCard}>
                          <TouchableOpacity
                            style={styles.expandableCustomerHeader}
                            onPress={() => toggleCustomCustomerExpanded(c.customerId)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.customerHeaderLeft}>
                              <Text style={styles.customerHeaderText}>{c.customerName}</Text>
                              <Text style={styles.customerHeaderStats}>
                                📞 {c.customerPhone} • {catLabel} • {c.totalMilkDelivered} L • ₹{c.totalAmount.toLocaleString('en-IN')}
                              </Text>
                            </View>
                            <MaterialCommunityIcons
                              name={isExpanded ? 'chevron-up' : 'chevron-down'}
                              size={22}
                              color={BrandColors.neutralGray}
                            />
                          </TouchableOpacity>

                          {isExpanded && (
                            <View style={styles.expandedCustomerDeliveries}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: BrandColors.neutralGray, textTransform: 'uppercase', marginBottom: 4 }}>
                                Period Deliveries ({c.deliveries.length} entries)
                              </Text>
                              {c.deliveries.map((d) => (
                                <View key={d.id} style={styles.dailyDeliveryItem}>
                                  <View>
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: BrandColors.textLight }}>
                                      📅 {formatDisplayDate(d.deliveryDate)}
                                    </Text>
                                    <Text style={{ fontSize: 11, color: BrandColors.neutralGray }}>
                                      {d.actualQuantity} L @ ₹{d.pricePerLiter}/L
                                    </Text>
                                  </View>
                                  <Text style={{ fontSize: 13, fontWeight: '700', color: BrandColors.primaryDark }}>
                                    ₹{d.amount}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            <View style={[styles.modalActions, { marginTop: 16, marginBottom: 20 }]}>
              <Button
                mode="contained"
                onPress={() => setCustomerHistoryModalVisible(false)}
                buttonColor={BrandColors.primaryDark}
              >
                Close History
              </Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>

      {/* Calendar Date Picker Modal */}
      <CalendarDatePickerModal
        visible={calendarPickerVisible}
        selectedDate={
          calendarTargetField === 'main'
            ? selectedDate
            : calendarTargetField === 'history_daily'
            ? custHistoryDate
            : calendarTargetField === 'custom_start'
            ? custCustomStartDate
            : calendarTargetField === 'custom_end'
            ? custCustomEndDate
            : custStartDate
        }
        onSelectDate={handleCalendarDateSelected}
        onDismiss={() => setCalendarPickerVisible(false)}
        title={
          calendarTargetField === 'main'
            ? 'Select Delivery Date'
            : calendarTargetField === 'history_daily'
            ? 'Select Daily History Date'
            : calendarTargetField === 'custom_start'
            ? 'Select Custom Start Date'
            : calendarTargetField === 'custom_end'
            ? 'Select Custom End Date'
            : 'Select Milk Date'
        }
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
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  historyDateSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  historyDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  historyDateChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  downloadPdfBtn: {
    marginBottom: 12,
    borderRadius: 8,
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
    gap: 6,
  },
  historyStatBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  historyStatLabel: {
    fontSize: 10,
    color: BrandColors.neutralGray,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  historyStatVal: {
    fontSize: 14,
    fontWeight: '800',
    marginVertical: 2,
  },
  historyStatSub: {
    fontSize: 10,
    color: BrandColors.neutralGray,
  },
  categorySummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  categorySummaryTitle: {
    fontSize: 13,
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
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryStat: {
    fontSize: 12,
    color: BrandColors.textLight,
    marginTop: 2,
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  subSectionSubtitle: {
    fontSize: 12,
    color: BrandColors.neutralGray,
  },
  supHistoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 8,
  },
  supHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  supHistoryName: {
    fontSize: 14,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  supHistoryPhone: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginTop: 1,
  },
  historyBulletsBox: {
    gap: 3,
  },
  historyBulletLine: {
    fontSize: 12,
    color: BrandColors.textLight,
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
  expandableCustomerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    overflow: 'hidden',
  },
  expandableCustomerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#F8FAFC',
  },
  customerHeaderLeft: {
    flex: 1,
    paddingRight: 6,
  },
  customerHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  customerHeaderStats: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  expandedCustomerDeliveries: {
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 4,
  },
  dailyDeliveryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  topBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  topBtn: {
    flex: 1,
    borderRadius: 8,
  },
  dashboardContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
  },
  dashboardBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
    justifyContent: 'space-between',
    minHeight: 116,
  },
  dashHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  dashBoxTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: BrandColors.textSecondaryLight,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dashTotalValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    marginVertical: 2,
  },
  dashTotalValue: {
    fontSize: 22,
    fontWeight: '900',
    color: BrandColors.primaryDark,
  },
  dashTotalUnit: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.neutralGray,
  },
  dashBreakdownRow: {
    flexDirection: 'column',
    gap: 2,
    marginTop: 2,
  },
  dashBreakdownBadge: {
    fontSize: 11,
    color: BrandColors.textLight,
  },
  dashDateCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  dashDateValue: {
    fontSize: 13,
    fontWeight: '800',
    color: BrandColors.textLight,
    textAlign: 'center',
  },
  dashDateHint: {
    fontSize: 10,
    fontWeight: '600',
    color: BrandColors.primaryDark,
    marginTop: 1,
  },
  dashDateNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  dashNavBtn: {
    padding: 2,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
  },
  dashNavLabel: {
    fontSize: 10,
    color: BrandColors.neutralGray,
    fontWeight: '600',
  },
  dailySupplySummaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BrandColors.primaryDark,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    elevation: 2,
  },
  dailySupplyBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  dailySupplyIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailySupplyBtnTexts: {
    flex: 1,
  },
  dailySupplyBtnTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  dailySupplyBtnSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  dateSelectorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  dateSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  dateCenter: {
    alignItems: 'center',
  },
  dateLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    color: BrandColors.neutralGray,
    fontWeight: '700',
  },
  dateValue: {
    fontSize: 15,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  searchSection: {
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  searchBar: {
    backgroundColor: '#FFFFFF',
    elevation: 1,
    borderRadius: 8,
    height: 42,
  },
  searchInput: {
    minHeight: 0,
    fontSize: 13,
  },
  listContainer: {
    padding: 16,
    paddingTop: 4,
    paddingBottom: 32,
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
    alignItems: 'flex-start',
  },
  custInfo: {
    flex: 1,
  },
  custName: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  phoneText: {
    fontSize: 13,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  locationText: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeBadgeBox: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'center',
  },
  timeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  customerSpecsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  specLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  specText: {
    fontSize: 13,
    color: BrandColors.neutralGray,
  },
  specSeparator: {
    fontSize: 12,
    color: '#CBD5E1',
  },
  boldText: {
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  divider: {
    marginVertical: 10,
    backgroundColor: BrandColors.borderLight,
  },
  quantitySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qtyDisplayCol: {
    alignItems: 'flex-start',
  },
  qtyLabel: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  qtyTouchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BrandColors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginVertical: 4,
  },
  qtyTouchBoxDisabled: {
    backgroundColor: '#F1F5F9',
  },
  qtyValue: {
    fontSize: 16,
    fontWeight: '800',
    color: BrandColors.primaryDark,
  },
  adjustCol: {
    gap: 4,
  },
  adjustBtnRow: {
    flexDirection: 'row',
    gap: 6,
  },
  adjustBtn: {
    minWidth: 64,
    borderRadius: 6,
  },
  holidayBadgeContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  holidayStatusBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-end',
  },
  holidaySection: {
    marginTop: 10,
    marginBottom: 6,
  },
  holidayBtn: {
    borderColor: '#D97706',
    borderRadius: 8,
  },
  cancelHolidayBtn: {
    borderRadius: 8,
  },
  supplierHolidayBtn: {
    borderColor: BrandColors.dangerLight,
    borderRadius: 8,
  },
  amountSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: BrandColors.backgroundLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  amountLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.textLight,
  },
  amountValue: {
    fontSize: 16,
    fontWeight: '800',
    color: BrandColors.primaryDark,
  },
  actionRow: {
    flexDirection: 'row',
  },
  historyBtn: {
    flex: 1,
    borderRadius: 8,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    padding: 20,
    borderRadius: 14,
  },
  addCustomerModalContent: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 14,
    maxHeight: '90%',
  },
  keyboardAvoidingView: {
    flexShrink: 1,
  },
  addCustomerModalHeader: {
    marginBottom: 4,
  },
  addCustomerScrollView: {
    flexShrink: 1,
  },
  addCustomerScrollContent: {
    paddingBottom: 8,
  },
  datePickerTouchable: {
    marginBottom: 10,
  },
  inputNonEditable: {
    backgroundColor: '#F8FAFC',
    marginBottom: 0,
  },
  modalFixedActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  modalSubtitle: {
    fontSize: 13,
    color: BrandColors.neutralGray,
    marginBottom: 14,
    marginTop: 2,
  },
  input: {
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  helperText: {
    paddingHorizontal: 0,
    marginBottom: 6,
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
    marginTop: 12,
  },
  monthSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
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
  timeSection: {
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.textLight,
    marginBottom: 6,
  },
  timeSegmented: {
    backgroundColor: '#F8FAFC',
  },
  dateFieldContainer: {
    marginBottom: 10,
  },
  dateQuickRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  quickDateBtn: {
    flex: 1,
    borderRadius: 6,
  },
  dateNoticeRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6,
  },
  dateNoticeText: {
    fontSize: 12,
    color: BrandColors.textLight,
  },
  pastDateNotice: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 15,
  },
  todayNotice: {
    fontSize: 11,
    color: BrandColors.success,
    fontWeight: '600',
    marginTop: 4,
  },
  qtyTouchBoxPending: {
    borderColor: '#F59E0B',
    backgroundColor: '#FEF3C7',
  },
});
