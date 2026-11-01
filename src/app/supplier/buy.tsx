import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
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
  TextInput,
} from 'react-native-paper';
import { CalendarDatePickerModal } from '../../components/CalendarDatePickerModal';
import { EmptyState } from '../../components/EmptyState';
import { HeaderBar } from '../../components/HeaderBar';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { BrandColors } from '../../constants/theme';
import {
  cancelSupplierHoliday,
  getSupplierHolidaysForDate,
} from '../../services/holidayService';
import {
  deleteMilkPurchase,
  getAllPurchasesForDate,
  recordMilkPurchase,
  updateMilkPurchase,
} from '../../services/milkTradeService';
import {
  deleteSupplier,
  getSuppliers,
  updateSupplier,
} from '../../services/supplierPurchaseService';
import {
  MilkCategory,
  MilkPurchase,
  MilkSession,
  Supplier,
} from '../../types';
import { formatDateDayMonth, formatDisplayDate, getTodayKolkata } from '../../utils/date';
import { makePhoneCall } from '../../utils/phone';

export default function BuyScreen() {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKolkata());

  // Data states
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<MilkPurchase[]>([]);
  const [supplierHolidays, setSupplierHolidays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Calendar Date Picker Modal State
  const [calendarPickerVisible, setCalendarPickerVisible] = useState(false);
  const [calendarTargetField, setCalendarTargetField] = useState<'main' | 'buy' | 'edit'>('main');

  // Buy Modal State (Milk Purchase with selectable Category & Session)
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
  const [isRateFocused, setIsRateFocused] = useState(false);
  const buyScrollViewRef = useRef<any>(null);

  // Auto-scroll to ensure focused input is visible above keyboard
  useEffect(() => {
    const keyboardShowSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        if (isRateFocused) {
          setTimeout(() => {
            buyScrollViewRef.current?.scrollToEnd({ animated: true });
          }, 50);
        }
      }
    );
    return () => {
      keyboardShowSub.remove();
    };
  }, [isRateFocused]);

  // Edit Supplier Modal State
  const [editSupplierModalVisible, setEditSupplierModalVisible] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editSupplierName, setEditSupplierName] = useState('');
  const [editSupplierPhone, setEditSupplierPhone] = useState('');
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierError, setSupplierError] = useState('');

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

  // Load Buy data from Firestore
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
    } catch (err: any) {
      console.warn('Could not load buy supply data:', err?.message || err);
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

  // Filter suppliers by name or phone
  const filteredSuppliers = useMemo(() => {
    if (!searchQuery.trim()) return suppliers;
    const q = searchQuery.toLowerCase().trim();
    return suppliers.filter(
      (s) => s.name.toLowerCase().includes(q) || s.phone.includes(q)
    );
  }, [suppliers, searchQuery]);

  // Open Buy modal for a specific supplier
  const handleOpenBuy = (supplier: Supplier) => {
    setBuyTargetSupplier(supplier);
    setBuyDate(selectedDate);
    setBuyMilkCategory('buffalo');
    setBuySession('morning');
    setBuyQuantityStr('');
    setBuyPriceStr('');
    setBuyError('');
    setBuySuccess('');
    setIsRateFocused(false);
    setBuyModalVisible(true);
  };

  // Save new milk purchase
  const handleSaveBuy = async () => {
    if (!buyTargetSupplier) return;

    const qty = parseFloat(buyQuantityStr.trim());
    if (isNaN(qty) || qty <= 0) {
      setBuyError('Please enter a valid positive quantity in litres.');
      return;
    }

    const price = parseFloat(buyPriceStr.trim());
    if (isNaN(price) || price <= 0) {
      setBuyError('Please enter a valid positive price per litre.');
      return;
    }

    setSavingBuy(true);
    setBuyError('');
    setBuySuccess('');

    try {
      await recordMilkPurchase({
        supplierId: buyTargetSupplier.id,
        supplierName: buyTargetSupplier.name,
        supplierPhone: buyTargetSupplier.phone,
        milkCategory: buyMilkCategory,
        session: buySession,
        purchaseDate: buyDate,
        quantityLiters: qty,
        pricePerLiter: price,
      });

      setBuySuccess('Milk purchase recorded successfully!');
      setTimeout(() => {
        setBuyModalVisible(false);
        loadData();
      }, 700);
    } catch (err: any) {
      setBuyError(err?.message || 'Failed to record milk purchase.');
    } finally {
      setSavingBuy(false);
    }
  };

  // Edit Supplier Handlers
  const handleOpenEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setEditSupplierName(supplier.name);
    setEditSupplierPhone(supplier.phone);
    setSupplierError('');
    setEditSupplierModalVisible(true);
  };

  const handleSaveSupplier = async () => {
    if (!editingSupplier) return;
    const trimmedName = editSupplierName.trim();
    const trimmedPhone = editSupplierPhone.trim();

    if (!trimmedName) {
      setSupplierError('Supplier Name is required.');
      return;
    }
    if (!trimmedPhone || trimmedPhone.length < 10) {
      setSupplierError('Please enter a valid 10-digit phone number.');
      return;
    }

    setSavingSupplier(true);
    setSupplierError('');

    try {
      await updateSupplier(editingSupplier.id, {
        name: trimmedName,
        phone: trimmedPhone,
      });
      setEditSupplierModalVisible(false);
      loadData();
    } catch (err: any) {
      setSupplierError(err?.message || 'Failed to update supplier.');
    } finally {
      setSavingSupplier(false);
    }
  };

  const promptDeleteSupplier = (supplier: Supplier) => {
    Alert.alert(
      'Delete Supplier',
      `Are you sure you want to delete ${supplier.name}? All associated purchases will also be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSupplier(supplier.id);
              loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete supplier.');
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
    }
  };

  // Auto-calculated total purchase amount
  const buyNumericQty = parseFloat(buyQuantityStr) || 0;
  const buyNumericPrice = parseFloat(buyPriceStr) || 0;
  const buyAutoTotalAmount = Number((buyNumericQty * buyNumericPrice).toFixed(2));

  // Render Supplier Card in Buy Screen
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
      {/* Top Navbar with Back Action returning to Supply Landing Page */}
      <HeaderBar
        title="Buy Milk"
        subtitle={`${filteredSuppliers.length} Available Suppliers`}
        showBack={true}
      />

      {/* Supplier Search Bar with Clickable Date Selector */}
      <View style={styles.searchRowContainer}>
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
        <TouchableOpacity
          style={styles.dateSelectorBtn}
          onPress={() => {
            setCalendarTargetField('main');
            setCalendarPickerVisible(true);
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Selected date: ${formatDateDayMonth(selectedDate)}. Tap to change date.`}
        >
          <Text style={styles.dateSelectorBtnText} numberOfLines={1}>
            {formatDateDayMonth(selectedDate)}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingIndicator message="Loading suppliers..." />
      ) : (
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
              <View style={styles.sectionHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Milk Purchase (Buy)</Text>
                </View>
                <View style={styles.sectionCountPill}>
                  <Text style={styles.sectionCountText}>
                    {filteredSuppliers.length} Supplier{filteredSuppliers.length === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="truck-delivery-outline"
              title={searchQuery ? 'No Matching Suppliers' : 'No Suppliers Registered'}
              description={
                searchQuery
                  ? `No supplier matched "${searchQuery}".`
                  : 'Return to the main Supply page and click "Add Supply" to register suppliers.'
              }
            />
          }
        />
      )}

      {/* Buy Modal (Milk Purchase Entry) */}
      <Portal>
        <Modal
          visible={buyModalVisible}
          onDismiss={() => {
            setIsRateFocused(false);
            setBuyModalVisible(false);
          }}
          contentContainerStyle={[styles.modalContent, styles.buyModalContainer]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardAvoidingView}
          >
            <ScrollView
              ref={buyScrollViewRef}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.buyScrollContent}
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
                    setIsRateFocused(false);
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
                  setIsRateFocused(false);
                  setTimeout(() => {
                    buyScrollViewRef.current?.scrollTo({ y: 220, animated: true });
                  }, 150);
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
                  setIsRateFocused(true);
                  setTimeout(() => {
                    buyScrollViewRef.current?.scrollToEnd({ animated: true });
                  }, 150);
                }}
                onBlur={() => {
                  setIsRateFocused(false);
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
                    setIsRateFocused(false);
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

      {/* Edit Supplier Modal */}
      <Portal>
        <Modal
          visible={editSupplierModalVisible}
          onDismiss={() => setEditSupplierModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Text style={styles.modalTitle}>Edit Supplier</Text>
            <Text style={styles.modalSubtitle}>Update supplier contact information</Text>

            {supplierError ? (
              <HelperText type="error" visible style={styles.helperText}>
                {supplierError}
              </HelperText>
            ) : null}

            <TextInput
              label="Supplier Name *"
              value={editSupplierName}
              onChangeText={(t) => {
                setEditSupplierName(t);
                setSupplierError('');
              }}
              mode="outlined"
              style={styles.input}
              left={<TextInput.Icon icon="account" />}
            />

            <TextInput
              label="Phone Number *"
              value={editSupplierPhone}
              onChangeText={(t) => {
                setEditSupplierPhone(t);
                setSupplierError('');
              }}
              mode="outlined"
              keyboardType="phone-pad"
              style={styles.input}
              left={<TextInput.Icon icon="phone" />}
            />

            <View style={styles.modalActions}>
              <Button
                mode="text"
                onPress={() => setEditSupplierModalVisible(false)}
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
                Update Supplier
              </Button>
            </View>
          </KeyboardAvoidingView>
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

      {/* Calendar Date Picker Modal */}
      <CalendarDatePickerModal
        visible={calendarPickerVisible}
        selectedDate={
          calendarTargetField === 'buy'
            ? buyDate
            : calendarTargetField === 'edit'
              ? editDate
              : selectedDate
        }
        onSelectDate={handleCalendarDateSelected}
        onDismiss={() => setCalendarPickerVisible(false)}
        title={
          calendarTargetField === 'buy' || calendarTargetField === 'edit'
            ? 'Select Purchase Date'
            : 'Select Date'
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
  searchRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  searchbar: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    elevation: 1,
    height: 46,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchbarInput: {
    fontSize: 13,
    minHeight: 46,
  },
  dateSelectorBtn: {
    height: 46,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateSelectorBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.primaryDark,
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
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginVertical: 10,
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
    marginVertical: 3,
  },
  calcValue: {
    fontSize: 22,
    fontWeight: '800',
    color: BrandColors.primaryDark,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
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
  boldText: {
    fontWeight: '700',
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
