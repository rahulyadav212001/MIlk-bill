import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import {
  Text,
  Modal,
  Portal,
  Button,
  Checkbox,
  SegmentedButtons,
  Divider,
  Chip,
  ActivityIndicator,
  Searchbar,
  IconButton,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BrandColors } from '../constants/theme';
import { CalendarDatePickerModal } from './CalendarDatePickerModal';
import { getSuppliers } from '../services/supplierPurchaseService';
import { getCustomers } from '../services/customerService';
import {
  markAllSuppliersHoliday,
  markAllCustomersHoliday,
  markSupplierHoliday,
  markCustomerHoliday,
  cancelSupplierHoliday,
  cancelCustomerHoliday,
  cancelAllSuppliersHoliday,
  cancelAllCustomersHoliday,
  getSupplierHolidaysForDate,
  getCustomerHolidaysForDate,
} from '../services/holidayService';
import { Supplier, Customer } from '../types';
import { getTodayKolkata, formatDisplayDate, addDays } from '../utils/date';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onHolidaysUpdated: () => void;
  initialDate?: string;
}

export const HolidaySettingsModal: React.FC<Props> = ({
  visible,
  onDismiss,
  onHolidaysUpdated,
  initialDate,
}) => {
  const today = getTodayKolkata();
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || today);
  const [prevInitialDate, setPrevInitialDate] = useState<string | undefined>(initialDate);

  if (initialDate !== prevInitialDate) {
    setPrevInitialDate(initialDate);
    setSelectedDate(initialDate || today);
  }

  const [calendarPickerVisible, setCalendarPickerVisible] = useState(false);

  // Sub-modal views: 'menu' | 'all' | 'custom'
  const [currentView, setCurrentView] = useState<'menu' | 'all' | 'custom'>('menu');

  // All Holiday Checkboxes
  const [allSuppliersChecked, setAllSuppliersChecked] = useState(false);
  const [allCustomersChecked, setAllCustomersChecked] = useState(false);

  // Custom Holiday Tab: 'suppliers' | 'customers'
  const [customTab, setCustomTab] = useState<'suppliers' | 'customers'>('suppliers');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'on_holiday' | 'selected'>('all');

  // Loaded lists
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [supplierHolidays, setSupplierHolidays] = useState<Set<string>>(new Set());
  const [customerHolidays, setCustomerHolidays] = useState<Set<string>>(new Set());

  // Selected for custom holiday
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Set<string>>(new Set());
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());

  const [loadingData, setLoadingData] = useState(false);
  const [processing, setProcessing] = useState(false);

  const screenHeight = Dimensions.get('window').height;
  const listMaxHeight = Math.min(360, Math.max(200, screenHeight - 380));

  const isToday = selectedDate === today;

  // Refresh lists for a specific date
  const refreshLists = useCallback(async (targetDate: string = selectedDate) => {
    try {
      const [supList, custList, supHols, custHols] = await Promise.all([
        getSuppliers(),
        getCustomers(),
        getSupplierHolidaysForDate(targetDate),
        getCustomerHolidaysForDate(targetDate),
      ]);
      setSuppliers(supList);
      setCustomers(custList);
      setSupplierHolidays(supHols);
      setCustomerHolidays(custHols);
    } catch (err) {
      console.warn('Could not load suppliers/customers for holiday modal:', err);
    }
  }, [selectedDate]);

  // When visible or selectedDate changes, fetch data asynchronously
  useEffect(() => {
    if (!visible) return;
    let isCancelled = false;

    Promise.all([
      getSuppliers(),
      getCustomers(),
      getSupplierHolidaysForDate(selectedDate),
      getCustomerHolidaysForDate(selectedDate),
    ])
      .then(([supList, custList, supHols, custHols]) => {
        if (!isCancelled) {
          setSuppliers(supList);
          setCustomers(custList);
          setSupplierHolidays(supHols);
          setCustomerHolidays(custHols);
          setLoadingData(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.warn('Could not load suppliers/customers for holiday modal:', err);
          setLoadingData(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [visible, selectedDate]);

  const handleClose = () => {
    setCurrentView('menu');
    setAllSuppliersChecked(false);
    setAllCustomersChecked(false);
    setSelectedSupplierIds(new Set());
    setSelectedCustomerIds(new Set());
    setSearchQuery('');
    setFilterMode('all');
    onDismiss();
  };

  const handleDateChange = (days: number) => {
    const nextDate = addDays(selectedDate, days);
    setSelectedDate(nextDate);
  };

  // --- Handlers: All Holiday ---
  const handleOpenAllHoliday = () => {
    setCurrentView('all');
  };

  const handleApplyAllHoliday = () => {
    if (!allSuppliersChecked && !allCustomersChecked) {
      Alert.alert('Selection Required', 'Please select at least one option: All Suppliers, All Customers, or both.');
      return;
    }

    let confirmMessage = '';
    if (allSuppliersChecked && allCustomersChecked) {
      confirmMessage = `Are you sure you want to mark ALL suppliers and ALL customers on holiday for ${formatDisplayDate(selectedDate)}?`;
    } else if (allSuppliersChecked) {
      confirmMessage = `Are you sure you want to mark ALL suppliers on holiday for ${formatDisplayDate(selectedDate)}?`;
    } else {
      confirmMessage = `Are you sure you want to mark ALL customers on holiday for ${formatDisplayDate(selectedDate)}?`;
    }

    Alert.alert('Confirm All Holiday', confirmMessage, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm Holiday',
        style: 'destructive',
        onPress: async () => {
          setProcessing(true);
          try {
            if (allSuppliersChecked) {
              await markAllSuppliersHoliday(suppliers, selectedDate);
            }
            if (allCustomersChecked) {
              await markAllCustomersHoliday(customers, selectedDate);
            }
            await refreshLists(selectedDate);
            onHolidaysUpdated();
            onDismiss();
            Alert.alert('Success', 'Holidays successfully applied for today.');
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to apply holidays.');
          } finally {
            setProcessing(false);
          }
        },
      },
    ]);
  };

  // Cancel all holidays for selected date
  const handleCancelAllHolidays = () => {
    Alert.alert(
      'Resume All Operations',
      `Are you sure you want to cancel all supplier and customer holidays for ${formatDisplayDate(selectedDate)} and resume normal operations?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resume All',
          onPress: async () => {
            setProcessing(true);
            try {
              await Promise.all([
                cancelAllSuppliersHoliday(suppliers, selectedDate),
                cancelAllCustomersHoliday(customers, selectedDate),
              ]);
              await refreshLists(selectedDate);
              onHolidaysUpdated();
              Alert.alert('Success', 'All holidays cancelled. Deliveries and purchases are resumed.');
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to cancel holidays.');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  // --- Handlers: Custom Holiday ---
  const handleOpenCustomHoliday = () => {
    setCurrentView('custom');
  };

  const toggleSupplierSelection = (id: string) => {
    setSelectedSupplierIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCustomerSelection = (id: string) => {
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    if (customTab === 'suppliers') {
      const allSelected = filteredSuppliers.every((s) => selectedSupplierIds.has(s.id));
      setSelectedSupplierIds((prev) => {
        const next = new Set(prev);
        if (allSelected) {
          filteredSuppliers.forEach((s) => next.delete(s.id));
        } else {
          filteredSuppliers.forEach((s) => next.add(s.id));
        }
        return next;
      });
    } else {
      const allSelected = filteredCustomers.every((c) => selectedCustomerIds.has(c.id));
      setSelectedCustomerIds((prev) => {
        const next = new Set(prev);
        if (allSelected) {
          filteredCustomers.forEach((c) => next.delete(c.id));
        } else {
          filteredCustomers.forEach((c) => next.add(c.id));
        }
        return next;
      });
    }
  };

  const handleConfirmCustomHoliday = () => {
    if (customTab === 'suppliers') {
      if (selectedSupplierIds.size === 0) {
        Alert.alert('Selection Required', 'Please select at least one supplier.');
        return;
      }

      Alert.alert(
        'Confirm Custom Holiday',
        `Are you sure you want to mark ${selectedSupplierIds.size} selected supplier(s) on holiday for today?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm Holiday',
            style: 'destructive',
            onPress: async () => {
              setProcessing(true);
              try {
                for (const s of suppliers) {
                  if (selectedSupplierIds.has(s.id)) {
                    await markSupplierHoliday(s.id, s.name, selectedDate);
                  }
                }
                await refreshLists(selectedDate);
                onHolidaysUpdated();
                onDismiss();
                Alert.alert('Success', 'Selected suppliers marked on holiday for today.');
              } catch (err: any) {
                Alert.alert('Error', err?.message || 'Failed to apply supplier holidays.');
              } finally {
                setProcessing(false);
              }
            },
          },
        ]
      );
    } else {
      if (selectedCustomerIds.size === 0) {
        Alert.alert('Selection Required', 'Please select at least one customer.');
        return;
      }

      Alert.alert(
        'Confirm Custom Holiday',
        `Are you sure you want to mark ${selectedCustomerIds.size} selected customer(s) on holiday for today?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm Holiday',
            style: 'destructive',
            onPress: async () => {
              setProcessing(true);
              try {
                for (const c of customers) {
                  if (selectedCustomerIds.has(c.id)) {
                    await markCustomerHoliday(c, selectedDate);
                  }
                }
                await refreshLists(selectedDate);
                onHolidaysUpdated();
                onDismiss();
                Alert.alert('Success', 'Selected customers marked on holiday for today.');
              } catch (err: any) {
                Alert.alert('Error', err?.message || 'Failed to apply customer holidays.');
              } finally {
                setProcessing(false);
              }
            },
          },
        ]
      );
    }
  };

  // --- Handlers: Cancel Individual Holiday ---
  const handleCancelSupplierHoliday = (s: Supplier) => {
    Alert.alert(
      'Cancel Supplier Holiday',
      `Do you want to cancel the holiday for ${s.name} for today?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setProcessing(true);
            try {
              await cancelSupplierHoliday(s.id, selectedDate);
              await refreshLists(selectedDate);
              onHolidaysUpdated();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to cancel holiday.');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelCustomerHoliday = (c: Customer) => {
    Alert.alert(
      'Cancel Customer Holiday',
      `Do you want to cancel the holiday for ${c.name} for today?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setProcessing(true);
            try {
              await cancelCustomerHoliday(c, selectedDate);
              await refreshLists(selectedDate);
              onHolidaysUpdated();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to cancel holiday.');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  // Status metrics
  const isGlobalSupplierHoliday = supplierHolidays.has('ALL');
  const activeSupplierHolidaysCount = isGlobalSupplierHoliday
    ? suppliers.length
    : suppliers.filter((s) => supplierHolidays.has(s.id)).length;
  const activeCustomerHolidaysCount = customers.filter((c) => customerHolidays.has(c.id)).length;
  const anyActiveHolidays = activeSupplierHolidaysCount > 0 || activeCustomerHolidaysCount > 0;

  // Filtered lists for custom view
  const q = searchQuery.toLowerCase().trim();

  const filteredSuppliers = suppliers.filter((s) => {
    const matchesSearch = !q || s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q));
    if (!matchesSearch) return false;

    const isOnHoliday = supplierHolidays.has('ALL') || supplierHolidays.has(s.id);
    const isSelected = selectedSupplierIds.has(s.id);

    if (filterMode === 'on_holiday') return isOnHoliday;
    if (filterMode === 'selected') return isSelected;
    return true;
  });

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch = !q || c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q));
    if (!matchesSearch) return false;

    const isOnHoliday = customerHolidays.has(c.id);
    const isSelected = selectedCustomerIds.has(c.id);

    if (filterMode === 'on_holiday') return isOnHoliday;
    if (filterMode === 'selected') return isSelected;
    return true;
  });

  const selectedCount = customTab === 'suppliers' ? selectedSupplierIds.size : selectedCustomerIds.size;

  return (
    <Portal>
      {/* Calendar Date Picker Modal for interactive date switching */}
      <CalendarDatePickerModal
        visible={calendarPickerVisible}
        selectedDate={selectedDate}
        onSelectDate={(newDate) => {
          setSelectedDate(newDate);
          setCalendarPickerVisible(false);
        }}
        onDismiss={() => setCalendarPickerVisible(false)}
        title="Select Holiday Date"
      />

      <Modal
        visible={visible}
        onDismiss={handleClose}
        contentContainerStyle={styles.cardContainer}
      >
        {/* 1. Header Bar */}
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            {currentView !== 'menu' ? (
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setCurrentView('menu')}
                accessibilityLabel="Back to Menu"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="arrow-left" size={22} color={BrandColors.primaryDark} />
              </TouchableOpacity>
            ) : (
              <View style={styles.headerIconCircle}>
                <MaterialCommunityIcons name="calendar-clock" size={22} color={BrandColors.primaryDark} />
              </View>
            )}

            <View style={styles.headerTextGroup}>
              <Text style={styles.headerTitle}>
                {currentView === 'menu' && 'Holiday Settings'}
                {currentView === 'all' && 'All Holiday'}
                {currentView === 'custom' && 'Custom Holiday'}
              </Text>
              <Text style={styles.headerSubtitle}>
                {currentView === 'menu' && 'Manage delivery & supply pauses'}
                {currentView === 'all' && 'Bulk pause for suppliers & customers'}
                {currentView === 'custom' && 'Select individual members to pause'}
              </Text>
            </View>
          </View>

          <IconButton
            icon="close"
            size={22}
            iconColor={BrandColors.neutralGray}
            style={styles.closeBtn}
            onPress={handleClose}
            accessibilityLabel="Close holiday settings"
          />
        </View>

        {/* 2. Interactive Date Selector & Status Banner */}
        <View style={styles.dateSelectorBar}>
          <View style={styles.dateInfoLeft}>
            <View style={styles.calendarMiniIcon}>
              <MaterialCommunityIcons name="calendar-month-outline" size={16} color={BrandColors.primaryDark} />
            </View>
            <TouchableOpacity
              style={styles.dateTouchable}
              onPress={() => setCalendarPickerVisible(true)}
              activeOpacity={0.7}
            >
              <View style={styles.dateRow}>
                <Text style={styles.dateMainText}>{formatDisplayDate(selectedDate)}</Text>
                {isToday && (
                  <View style={styles.todayPill}>
                    <Text style={styles.todayPillText}>Today</Text>
                  </View>
                )}
              </View>
              <Text style={styles.dateTapHint}>Tap to choose date 📅</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dateNavControls}>
            <TouchableOpacity
              style={styles.dateNavBtn}
              onPress={() => handleDateChange(-1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Previous day"
            >
              <MaterialCommunityIcons name="chevron-left" size={20} color={BrandColors.primaryDark} />
            </TouchableOpacity>

            {!isToday && (
              <TouchableOpacity
                style={styles.todayResetPill}
                onPress={() => setSelectedDate(today)}
                accessibilityLabel="Reset to today"
              >
                <Text style={styles.todayResetText}>Today</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.dateNavBtn}
              onPress={() => handleDateChange(1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Next day"
            >
              <MaterialCommunityIcons name="chevron-right" size={20} color={BrandColors.primaryDark} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Active Metrics Pill Row */}
        <View style={styles.metricsPillRow}>
          <View style={[styles.metricPill, activeSupplierHolidaysCount > 0 && styles.metricPillActive]}>
            <MaterialCommunityIcons
              name="truck-outline"
              size={13}
              color={activeSupplierHolidaysCount > 0 ? '#B45309' : BrandColors.neutralGray}
            />
            <Text style={[styles.metricPillText, activeSupplierHolidaysCount > 0 && styles.metricPillTextActive]}>
              Suppliers: {activeSupplierHolidaysCount}/{suppliers.length} paused
            </Text>
          </View>

          <View style={[styles.metricPill, activeCustomerHolidaysCount > 0 && styles.metricPillActive]}>
            <MaterialCommunityIcons
              name="account-outline"
              size={13}
              color={activeCustomerHolidaysCount > 0 ? '#B45309' : BrandColors.neutralGray}
            />
            <Text style={[styles.metricPillText, activeCustomerHolidaysCount > 0 && styles.metricPillTextActive]}>
              Customers: {activeCustomerHolidaysCount}/{customers.length} paused
            </Text>
          </View>
        </View>

        {/* Section Navigation Tabs (Quick Switcher between All Holiday & Custom Holiday) */}
        {currentView !== 'menu' && (
          <View style={styles.topTabBar}>
            <TouchableOpacity
              style={[styles.topTabBtn, currentView === 'all' && styles.topTabBtnActive]}
              onPress={() => setCurrentView('all')}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons
                name="calendar-sync"
                size={16}
                color={currentView === 'all' ? BrandColors.primaryDark : BrandColors.neutralGray}
              />
              <Text style={[styles.topTabText, currentView === 'all' && styles.topTabTextActive]}>
                1. All Holiday
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.topTabBtn, currentView === 'custom' && styles.topTabBtnActive]}
              onPress={() => setCurrentView('custom')}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons
                name="account-cog"
                size={16}
                color={currentView === 'custom' ? '#D97706' : BrandColors.neutralGray}
              />
              <Text style={[styles.topTabText, currentView === 'custom' && styles.topTabTextActive]}>
                2. Custom Holiday
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <Divider style={styles.cardDivider} />

        {/* ========================================================
            VIEW 1: MENU / HUB VIEW
            ======================================================== */}
        {currentView === 'menu' && (
          <ScrollView
            style={styles.menuScrollArea}
            contentContainerStyle={styles.menuScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.menuIntro}>
              Choose a holiday mode to configure pause for {formatDisplayDate(selectedDate)}:
            </Text>

            {/* Option 1: 1. All Holiday Card */}
            <TouchableOpacity
              style={styles.sectionOptionCard}
              onPress={handleOpenAllHoliday}
              activeOpacity={0.8}
            >
              <View style={[styles.optionIconContainer, { backgroundColor: BrandColors.primaryLight }]}>
                <MaterialCommunityIcons name="calendar-sync" size={26} color={BrandColors.primaryDark} />
              </View>

              <View style={styles.optionContentCol}>
                <View style={styles.optionTitleRow}>
                  <Text style={styles.optionTitleText}>1. All Holiday</Text>
                  <View style={styles.bulkTag}>
                    <Text style={styles.bulkTagText}>Bulk Pause</Text>
                  </View>
                </View>
                <Text style={styles.optionSubText}>
                  Mark all suppliers, all customers, or both
                </Text>
                <Text style={styles.optionDetailText}>
                  Instantly pauses supply and sets daily delivery quantity to 0 for all records.
                </Text>

                {isGlobalSupplierHoliday && (
                  <View style={styles.activeStatusPill}>
                    <MaterialCommunityIcons name="beach" size={13} color="#D97706" />
                    <Text style={styles.activeStatusText}>Global Supplier Holiday Active</Text>
                  </View>
                )}
              </View>

              <View style={styles.optionChevronBox}>
                <MaterialCommunityIcons name="chevron-right" size={22} color={BrandColors.neutralGray} />
              </View>
            </TouchableOpacity>

            {/* Option 2: 2. Custom Holiday Card */}
            <TouchableOpacity
              style={styles.sectionOptionCard}
              onPress={handleOpenCustomHoliday}
              activeOpacity={0.8}
            >
              <View style={[styles.optionIconContainer, { backgroundColor: BrandColors.accentLight }]}>
                <MaterialCommunityIcons name="account-cog" size={26} color="#D97706" />
              </View>

              <View style={styles.optionContentCol}>
                <View style={styles.optionTitleRow}>
                  <Text style={styles.optionTitleText}>2. Custom Holiday</Text>
                  <View style={styles.selectiveTag}>
                    <Text style={styles.selectiveTagText}>Selective</Text>
                  </View>
                </View>
                <Text style={styles.optionSubText}>
                  Select specific suppliers or customers
                </Text>
                <Text style={styles.optionDetailText}>
                  Choose individual suppliers or customers to pause, or resume paused deliveries.
                </Text>

                {activeCustomerHolidaysCount > 0 && (
                  <View style={styles.activeStatusPill}>
                    <MaterialCommunityIcons name="account-check" size={13} color="#D97706" />
                    <Text style={styles.activeStatusText}>
                      {activeCustomerHolidaysCount} Customer(s) on holiday
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.optionChevronBox}>
                <MaterialCommunityIcons name="chevron-right" size={22} color={BrandColors.neutralGray} />
              </View>
            </TouchableOpacity>

            {/* Quick Resume All Card if any active holidays */}
            {anyActiveHolidays && (
              <View style={styles.resumeAllCard}>
                <View style={styles.resumeAllLeft}>
                  <MaterialCommunityIcons name="refresh-circle" size={24} color="#059669" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resumeAllTitle}>Active Holidays Detected</Text>
                    <Text style={styles.resumeAllSub}>
                      Resume all deliveries &amp; purchases for this date with one tap
                    </Text>
                  </View>
                </View>

                <Button
                  mode="outlined"
                  compact
                  textColor="#059669"
                  style={styles.resumeAllBtn}
                  onPress={handleCancelAllHolidays}
                  loading={processing}
                  disabled={processing}
                >
                  Resume All
                </Button>
              </View>
            )}

            <View style={styles.menuCloseRow}>
              <Button
                mode="text"
                onPress={handleClose}
                textColor={BrandColors.neutralGray}
                style={{ alignSelf: 'flex-end' }}
              >
                Close
              </Button>
            </View>
          </ScrollView>
        )}

        {/* ========================================================
            VIEW 2: ALL HOLIDAY (BULK)
            ======================================================== */}
        {currentView === 'all' && (
          <ScrollView
            style={styles.viewScrollArea}
            contentContainerStyle={styles.viewScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.dialogSubtitle}>
              Select groups to put on holiday for today ({formatDisplayDate(selectedDate)}):
            </Text>

            {/* Interactive Toggle Card 1: All Suppliers */}
            <TouchableOpacity
              style={[
                styles.bulkToggleCard,
                allSuppliersChecked && styles.bulkToggleCardSelected,
              ]}
              onPress={() => setAllSuppliersChecked(!allSuppliersChecked)}
              activeOpacity={0.8}
            >
              <Checkbox.Android
                status={allSuppliersChecked ? 'checked' : 'unchecked'}
                onPress={() => setAllSuppliersChecked(!allSuppliersChecked)}
                color={BrandColors.primaryDark}
              />

              <View style={styles.bulkCardIconBox}>
                <MaterialCommunityIcons
                  name="truck-delivery-outline"
                  size={24}
                  color={allSuppliersChecked ? BrandColors.primaryDark : BrandColors.neutralGray}
                />
              </View>

              <View style={styles.bulkCardContent}>
                <View style={styles.bulkCardTitleRow}>
                  <Text style={styles.bulkCardTitle}>All Suppliers</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{suppliers.length} Registered</Text>
                  </View>
                </View>
                <Text style={styles.bulkCardSub}>
                  Marks all {suppliers.length} suppliers as unavailable for today&apos;s purchase
                </Text>

                {isGlobalSupplierHoliday && (
                  <View style={styles.inlineWarningBadge}>
                    <Text style={styles.inlineWarningText}>Already active for this date</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            {/* Interactive Toggle Card 2: All Customers */}
            <TouchableOpacity
              style={[
                styles.bulkToggleCard,
                allCustomersChecked && styles.bulkToggleCardSelected,
              ]}
              onPress={() => setAllCustomersChecked(!allCustomersChecked)}
              activeOpacity={0.8}
            >
              <Checkbox.Android
                status={allCustomersChecked ? 'checked' : 'unchecked'}
                onPress={() => setAllCustomersChecked(!allCustomersChecked)}
                color={BrandColors.primaryDark}
              />

              <View style={styles.bulkCardIconBox}>
                <MaterialCommunityIcons
                  name="account-group-outline"
                  size={24}
                  color={allCustomersChecked ? BrandColors.primaryDark : BrandColors.neutralGray}
                />
              </View>

              <View style={styles.bulkCardContent}>
                <View style={styles.bulkCardTitleRow}>
                  <Text style={styles.bulkCardTitle}>All Customers</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{customers.length} Registered</Text>
                  </View>
                </View>
                <Text style={styles.bulkCardSub}>
                  Sets today&apos;s delivery milk quantity &amp; amount to 0 for all {customers.length} customers
                </Text>

                {activeCustomerHolidaysCount === customers.length && customers.length > 0 && (
                  <View style={styles.inlineWarningBadge}>
                    <Text style={styles.inlineWarningText}>All customers currently on holiday</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            {/* Information Notice Banner */}
            <View style={styles.infoNoticeBox}>
              <MaterialCommunityIcons name="information-outline" size={18} color={BrandColors.primaryDark} />
              <Text style={styles.infoNoticeText}>
                Applying bulk holiday pauses milk supply/delivery for today. Individual records can be resumed or cancelled anytime.
              </Text>
            </View>

            {/* Action Buttons Row */}
            <View style={styles.modalButtonsRow}>
              <Button
                mode="text"
                onPress={() => setCurrentView('menu')}
                disabled={processing}
                textColor={BrandColors.neutralGray}
              >
                Back
              </Button>

              {anyActiveHolidays && (
                <Button
                  mode="outlined"
                  onPress={handleCancelAllHolidays}
                  loading={processing}
                  disabled={processing}
                  textColor="#D97706"
                  style={styles.cancelAllBtn}
                >
                  Clear All
                </Button>
              )}

              <Button
                mode="contained"
                onPress={handleApplyAllHoliday}
                loading={processing}
                disabled={processing || (!allSuppliersChecked && !allCustomersChecked)}
                buttonColor={BrandColors.primaryDark}
                icon="calendar-check"
                style={styles.applyBtn}
              >
                Apply Holiday
              </Button>
            </View>
          </ScrollView>
        )}

        {/* ========================================================
            VIEW 3: CUSTOM HOLIDAY (SELECTIVE)
            ======================================================== */}
        {currentView === 'custom' && (
          <View style={styles.customContainer}>
            <Text style={styles.dialogSubtitle}>
              Select specific suppliers or customers for {formatDisplayDate(selectedDate)}:
            </Text>

            {/* Segmented Button: Suppliers | Customers */}
            <SegmentedButtons
              value={customTab}
              onValueChange={(v) => {
                setCustomTab(v as any);
                setSearchQuery('');
                setFilterMode('all');
              }}
              buttons={[
                {
                  value: 'suppliers',
                  label: `Suppliers (${suppliers.length})`,
                  icon: 'truck-outline',
                },
                {
                  value: 'customers',
                  label: `Customers (${customers.length})`,
                  icon: 'account-outline',
                },
              ]}
              style={styles.segmented}
            />

            {/* Searchbar & Filter Chips */}
            <View style={styles.searchAndFilters}>
              <Searchbar
                placeholder={`Search ${customTab === 'suppliers' ? 'suppliers' : 'customers'}...`}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchBar}
                inputStyle={styles.searchInput}
              />

              <View style={styles.filterChipRow}>
                <Chip
                  compact
                  selected={filterMode === 'all'}
                  onPress={() => setFilterMode('all')}
                  style={styles.filterChip}
                  textStyle={styles.filterChipText}
                >
                  All ({customTab === 'suppliers' ? suppliers.length : customers.length})
                </Chip>

                <Chip
                  compact
                  selected={filterMode === 'on_holiday'}
                  onPress={() => setFilterMode('on_holiday')}
                  style={[styles.filterChip, filterMode === 'on_holiday' && styles.filterChipSelected]}
                  textStyle={styles.filterChipText}
                >
                  🏖️ On Holiday (
                  {customTab === 'suppliers' ? activeSupplierHolidaysCount : activeCustomerHolidaysCount}
                  )
                </Chip>

                <Chip
                  compact
                  selected={filterMode === 'selected'}
                  onPress={() => setFilterMode('selected')}
                  style={[styles.filterChip, filterMode === 'selected' && styles.filterChipSelected]}
                  textStyle={styles.filterChipText}
                >
                  ✓ Selected ({selectedCount})
                </Chip>

                <TouchableOpacity
                  style={styles.selectAllBtn}
                  onPress={handleSelectAllVisible}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.selectAllBtnText}>
                    {(customTab === 'suppliers' ? filteredSuppliers : filteredCustomers).every((item) =>
                      customTab === 'suppliers'
                        ? selectedSupplierIds.has(item.id)
                        : selectedCustomerIds.has(item.id)
                    ) && (customTab === 'suppliers' ? filteredSuppliers : filteredCustomers).length > 0
                      ? 'Deselect All'
                      : 'Select All'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* List / Loading View */}
            {loadingData ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator color={BrandColors.primaryDark} size="small" />
                <Text style={styles.loadingText}>Loading lists...</Text>
              </View>
            ) : (
              <ScrollView
                style={[styles.customListScroll, { maxHeight: listMaxHeight }]}
                contentContainerStyle={{ paddingBottom: 10 }}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
              >
                {customTab === 'suppliers' ? (
                  filteredSuppliers.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <MaterialCommunityIcons name="truck-remove-outline" size={32} color={BrandColors.neutralGray} />
                      <Text style={styles.emptyText}>
                        {searchQuery ? 'No matching suppliers found.' : 'No registered suppliers found.'}
                      </Text>
                    </View>
                  ) : (
                    filteredSuppliers.map((s) => {
                      const isOnHoliday =
                        supplierHolidays.has('ALL') || supplierHolidays.has(s.id);
                      const isChecked = selectedSupplierIds.has(s.id);

                      return (
                        <View
                          key={s.id}
                          style={[
                            styles.itemCard,
                            isChecked && styles.itemCardSelected,
                            isOnHoliday && styles.itemCardOnHoliday,
                          ]}
                        >
                          <TouchableOpacity
                            style={styles.itemTouchable}
                            onPress={() => toggleSupplierSelection(s.id)}
                            activeOpacity={0.7}
                          >
                            <Checkbox.Android
                              status={isChecked ? 'checked' : 'unchecked'}
                              onPress={() => toggleSupplierSelection(s.id)}
                              color={BrandColors.primaryDark}
                            />

                            <View style={[styles.avatarCircle, { backgroundColor: BrandColors.primaryLight }]}>
                              <Text style={styles.avatarText}>
                                {s.name.slice(0, 1).toUpperCase()}
                              </Text>
                            </View>

                            <View style={styles.itemDetails}>
                              <Text style={styles.itemName} numberOfLines={1}>
                                {s.name}
                              </Text>
                              <Text style={styles.itemPhone}>📞 {s.phone || 'No phone'}</Text>
                            </View>
                          </TouchableOpacity>

                          {isOnHoliday && (
                            <View style={styles.holidayStatusBadgeRow}>
                              <Chip compact style={styles.onHolidayChip}>
                                <Text style={styles.onHolidayText}>On Holiday</Text>
                              </Chip>
                              <TouchableOpacity
                                onPress={() => handleCancelSupplierHoliday(s)}
                                style={styles.cancelLink}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Text style={styles.cancelLinkText}>Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })
                  )
                ) : filteredCustomers.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <MaterialCommunityIcons name="account-off" size={32} color={BrandColors.neutralGray} />
                    <Text style={styles.emptyText}>
                      {searchQuery ? 'No matching customers found.' : 'No registered customers found.'}
                    </Text>
                  </View>
                ) : (
                  filteredCustomers.map((c) => {
                    const isOnHoliday = customerHolidays.has(c.id);
                    const isChecked = selectedCustomerIds.has(c.id);

                    return (
                      <View
                        key={c.id}
                        style={[
                          styles.itemCard,
                          isChecked && styles.itemCardSelected,
                          isOnHoliday && styles.itemCardOnHoliday,
                        ]}
                      >
                        <TouchableOpacity
                          style={styles.itemTouchable}
                          onPress={() => toggleCustomerSelection(c.id)}
                          activeOpacity={0.7}
                        >
                          <Checkbox.Android
                            status={isChecked ? 'checked' : 'unchecked'}
                            onPress={() => toggleCustomerSelection(c.id)}
                            color={BrandColors.primaryDark}
                          />

                          <View style={[styles.avatarCircle, { backgroundColor: BrandColors.secondaryLight }]}>
                            <Text style={[styles.avatarText, { color: BrandColors.secondary }]}>
                              {c.name.slice(0, 1).toUpperCase()}
                            </Text>
                          </View>

                          <View style={styles.itemDetails}>
                            <Text style={styles.itemName} numberOfLines={1}>
                              {c.name}
                            </Text>
                            <Text style={styles.itemPhone}>
                              🥛 {c.defaultDailyQuantity} L @ ₹{c.pricePerLiter}/L
                            </Text>
                          </View>
                        </TouchableOpacity>

                        {isOnHoliday && (
                          <View style={styles.holidayStatusBadgeRow}>
                            <Chip compact style={styles.onHolidayChip}>
                              <Text style={styles.onHolidayText}>On Holiday</Text>
                            </Chip>
                            <TouchableOpacity
                              onPress={() => handleCancelCustomerHoliday(c)}
                              style={styles.cancelLink}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Text style={styles.cancelLinkText}>Cancel</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            )}

            {/* Custom Holiday Sticky Bottom Bar */}
            <View style={styles.customBottomBar}>
              <View style={styles.selectedCountPill}>
                <Text style={styles.selectedCountText}>
                  {selectedCount} selected
                </Text>
                {selectedCount > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      if (customTab === 'suppliers') setSelectedSupplierIds(new Set());
                      else setSelectedCustomerIds(new Set());
                    }}
                    style={styles.clearSelectionBtn}
                  >
                    <Text style={styles.clearSelectionText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.customActionButtons}>
                <Button
                  mode="text"
                  onPress={() => setCurrentView('menu')}
                  disabled={processing}
                  textColor={BrandColors.neutralGray}
                >
                  Back
                </Button>
                <Button
                  mode="contained"
                  onPress={handleConfirmCustomHoliday}
                  loading={processing}
                  disabled={processing || selectedCount === 0}
                  buttonColor={BrandColors.primaryDark}
                  icon="check"
                  style={styles.confirmBtn}
                >
                  Confirm Holiday
                </Button>
              </View>
            </View>
          </View>
        )}
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 20,
    maxWidth: 480,
    maxHeight: '90%',
    alignSelf: 'center',
    width: '92%',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.16,
        shadowRadius: 14,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BrandColors.backgroundLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: BrandColors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextGroup: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  headerSubtitle: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginTop: 1,
  },
  closeBtn: {
    margin: 0,
  },
  dateSelectorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BrandColors.backgroundLight,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  dateInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  calendarMiniIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  dateTouchable: {
    flex: 1,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateMainText: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  todayPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  todayPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#166534',
  },
  dateTapHint: {
    fontSize: 10,
    color: BrandColors.neutralGray,
    marginTop: 1,
  },
  dateNavControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateNavBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  todayResetPill: {
    backgroundColor: BrandColors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  todayResetText: {
    fontSize: 10,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  metricsPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
  },
  metricPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: BrandColors.backgroundLight,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  metricPillActive: {
    backgroundColor: BrandColors.accentLight,
    borderColor: '#FDE68A',
  },
  metricPillText: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    fontWeight: '500',
  },
  metricPillTextActive: {
    color: '#92400E',
    fontWeight: '700',
  },
  topTabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: BrandColors.backgroundLight,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  topTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 8,
  },
  topTabBtnActive: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  topTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.neutralGray,
  },
  topTabTextActive: {
    color: BrandColors.textLight,
    fontWeight: '700',
  },
  cardDivider: {
    backgroundColor: BrandColors.borderLight,
    marginVertical: 6,
  },
  menuScrollArea: {
    maxHeight: 460,
  },
  menuScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  menuIntro: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginBottom: 12,
  },
  sectionOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
    padding: 14,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  optionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionContentCol: {
    flex: 1,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  optionTitleText: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  bulkTag: {
    backgroundColor: BrandColors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  bulkTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  selectiveTag: {
    backgroundColor: BrandColors.accentLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  selectiveTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  optionSubText: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginBottom: 2,
  },
  optionDetailText: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 15,
  },
  activeStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BrandColors.accentLight,
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6,
  },
  activeStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  optionChevronBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  resumeAllCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  resumeAllLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  resumeAllTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  resumeAllSub: {
    fontSize: 10,
    color: '#047857',
  },
  resumeAllBtn: {
    borderColor: '#059669',
  },
  menuCloseRow: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  viewScrollArea: {
    maxHeight: 520,
  },
  viewScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  dialogSubtitle: {
    fontSize: 13,
    color: BrandColors.neutralGray,
    marginBottom: 12,
    lineHeight: 18,
  },
  bulkToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: BrandColors.borderLight,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  bulkToggleCardSelected: {
    borderColor: BrandColors.primaryDark,
    backgroundColor: '#F0F7FF',
  },
  bulkCardIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: BrandColors.backgroundLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  bulkCardContent: {
    flex: 1,
  },
  bulkCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  bulkCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  countBadge: {
    backgroundColor: BrandColors.backgroundLight,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: BrandColors.neutralGray,
  },
  bulkCardSub: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    lineHeight: 16,
  },
  inlineWarningBadge: {
    backgroundColor: BrandColors.accentLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  inlineWarningText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  infoNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: BrandColors.primaryLight,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
    marginBottom: 16,
  },
  infoNoticeText: {
    flex: 1,
    fontSize: 11,
    color: BrandColors.primaryDark,
    lineHeight: 16,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  cancelAllBtn: {
    borderColor: '#D97706',
  },
  applyBtn: {
    minWidth: 140,
  },
  customContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
  },
  segmented: {
    marginBottom: 10,
  },
  searchAndFilters: {
    marginBottom: 8,
  },
  searchBar: {
    height: 40,
    backgroundColor: BrandColors.backgroundLight,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
    elevation: 0,
  },
  searchInput: {
    minHeight: 0,
    fontSize: 13,
  },
  filterChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  filterChip: {
    height: 28,
    backgroundColor: BrandColors.backgroundLight,
  },
  filterChipSelected: {
    backgroundColor: BrandColors.primaryLight,
  },
  filterChipText: {
    fontSize: 11,
  },
  selectAllBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  selectAllBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  centerLoading: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginTop: 6,
  },
  customListScroll: {
    marginVertical: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
  },
  emptyText: {
    textAlign: 'center',
    color: BrandColors.neutralGray,
    fontSize: 12,
    marginTop: 8,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginBottom: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  itemCardSelected: {
    borderColor: BrandColors.primaryDark,
    backgroundColor: '#F8FAFC',
  },
  itemCardOnHoliday: {
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  itemTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  itemPhone: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    marginTop: 1,
  },
  holidayStatusBadgeRow: {
    alignItems: 'flex-end',
    gap: 2,
    paddingLeft: 6,
  },
  onHolidayChip: {
    backgroundColor: BrandColors.accentLight,
    height: 22,
  },
  onHolidayText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },
  cancelLink: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  cancelLinkText: {
    fontSize: 11,
    color: BrandColors.danger,
    fontWeight: '700',
  },
  customBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: BrandColors.borderLight,
    paddingTop: 10,
    marginTop: 6,
  },
  selectedCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectedCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.neutralGray,
  },
  clearSelectionBtn: {
    paddingHorizontal: 4,
  },
  clearSelectionText: {
    fontSize: 11,
    color: BrandColors.danger,
    fontWeight: '600',
  },
  customActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmBtn: {
    minWidth: 140,
  },
});
