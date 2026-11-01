import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
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
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BrandColors } from '../constants/theme';
import { getSuppliers } from '../services/supplierPurchaseService';
import { getCustomers } from '../services/customerService';
import {
  markAllSuppliersHoliday,
  markAllCustomersHoliday,
  markSupplierHoliday,
  markCustomerHoliday,
  cancelSupplierHoliday,
  cancelCustomerHoliday,
  getSupplierHolidaysForDate,
  getCustomerHolidaysForDate,
} from '../services/holidayService';
import { Supplier, Customer } from '../types';
import { getTodayKolkata, formatDisplayDate } from '../utils/date';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onHolidaysUpdated: () => void;
}

export const HolidaySettingsModal: React.FC<Props> = ({
  visible,
  onDismiss,
  onHolidaysUpdated,
}) => {
  const today = getTodayKolkata();

  // Sub-modal views: 'menu' | 'all' | 'custom'
  const [currentView, setCurrentView] = useState<'menu' | 'all' | 'custom'>('menu');

  // All Holiday Checkboxes
  const [allSuppliersChecked, setAllSuppliersChecked] = useState(false);
  const [allCustomersChecked, setAllCustomersChecked] = useState(false);

  // Custom Holiday Tab: 'suppliers' | 'customers'
  const [customTab, setCustomTab] = useState<'suppliers' | 'customers'>('suppliers');

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

  const refreshLists = useCallback(async () => {
    setLoadingData(true);
    try {
      const [supList, custList, supHols, custHols] = await Promise.all([
        getSuppliers(),
        getCustomers(),
        getSupplierHolidaysForDate(today),
        getCustomerHolidaysForDate(today),
      ]);
      setSuppliers(supList);
      setCustomers(custList);
      setSupplierHolidays(supHols);
      setCustomerHolidays(custHols);
    } catch (err) {
      console.warn('Could not load suppliers/customers for holiday modal:', err);
    } finally {
      setLoadingData(false);
    }
  }, [today]);

  useEffect(() => {
    if (!visible) return;
    let isCancelled = false;
    Promise.all([
      getSuppliers(),
      getCustomers(),
      getSupplierHolidaysForDate(today),
      getCustomerHolidaysForDate(today),
    ])
      .then(([supList, custList, supHols, custHols]) => {
        if (!isCancelled) {
          setSuppliers(supList);
          setCustomers(custList);
          setSupplierHolidays(supHols);
          setCustomerHolidays(custHols);
        }
      })
      .catch((err) => {
        console.warn('Could not load suppliers/customers for holiday modal:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [visible, today]);

  const handleClose = () => {
    setCurrentView('menu');
    setAllSuppliersChecked(false);
    setAllCustomersChecked(false);
    setSelectedSupplierIds(new Set());
    setSelectedCustomerIds(new Set());
    onDismiss();
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
      confirmMessage = 'Are you sure you want to mark ALL suppliers and ALL customers on holiday for today?';
    } else if (allSuppliersChecked) {
      confirmMessage = 'Are you sure you want to mark ALL suppliers on holiday for today?';
    } else {
      confirmMessage = 'Are you sure you want to mark ALL customers on holiday for today?';
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
              await markAllSuppliersHoliday(suppliers, today);
            }
            if (allCustomersChecked) {
              await markAllCustomersHoliday(customers, today);
            }
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
                    await markSupplierHoliday(s.id, s.name, today);
                  }
                }
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
                    await markCustomerHoliday(c, today);
                  }
                }
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
              await cancelSupplierHoliday(s.id, today);
              await refreshLists();
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
              await cancelCustomerHoliday(c, today);
              await refreshLists();
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

  return (
    <Portal>
      {/* 1. Main Small Settings Dropdown/Popup with exactly 2 options */}
      <Modal
        visible={visible && currentView === 'menu'}
        onDismiss={handleClose}
        contentContainerStyle={styles.menuModalContent}
      >
        <View style={styles.menuHeader}>
          <MaterialCommunityIcons name="cog" size={20} color={BrandColors.primaryDark} />
          <Text style={styles.menuTitle}>Holiday Settings</Text>
        </View>
        <Text style={styles.dateSubtext}>Today: {formatDisplayDate(today)}</Text>

        <Divider style={styles.divider} />

        <TouchableOpacity style={styles.menuItem} onPress={handleOpenAllHoliday}>
          <View style={styles.menuIconBox}>
            <MaterialCommunityIcons name="calendar-sync" size={22} color={BrandColors.primaryDark} />
          </View>
          <View style={styles.menuItemTextCol}>
            <Text style={styles.menuItemTitle}>1. All Holiday</Text>
            <Text style={styles.menuItemSub}>Mark all suppliers, all customers, or both</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={BrandColors.neutralGray} />
        </TouchableOpacity>

        <Divider style={styles.divider} />

        <TouchableOpacity style={styles.menuItem} onPress={handleOpenCustomHoliday}>
          <View style={styles.menuIconBox}>
            <MaterialCommunityIcons name="account-cog" size={22} color="#D97706" />
          </View>
          <View style={styles.menuItemTextCol}>
            <Text style={styles.menuItemTitle}>2. Custom Holiday</Text>
            <Text style={styles.menuItemSub}>Select specific suppliers or customers</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={BrandColors.neutralGray} />
        </TouchableOpacity>

        <View style={styles.menuActions}>
          <Button mode="text" compact onPress={onDismiss} textColor={BrandColors.neutralGray}>
            Close
          </Button>
        </View>
      </Modal>

      {/* 2. All Holiday Popup Modal */}
      <Modal
        visible={visible && currentView === 'all'}
        onDismiss={() => setCurrentView('menu')}
        contentContainerStyle={styles.dialogModalContent}
      >
        <View style={styles.dialogHeader}>
          <MaterialCommunityIcons name="calendar-sync" size={22} color={BrandColors.primaryDark} />
          <Text style={styles.dialogTitle}>All Holiday</Text>
        </View>
        <Text style={styles.dialogSubtitle}>
          Select groups to put on holiday for today ({formatDisplayDate(today)}):
        </Text>

        <View style={styles.checkboxGroup}>
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setAllSuppliersChecked(!allSuppliersChecked)}
          >
            <Checkbox.Android
              status={allSuppliersChecked ? 'checked' : 'unchecked'}
              onPress={() => setAllSuppliersChecked(!allSuppliersChecked)}
              color={BrandColors.primaryDark}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.checkboxLabel}>All Suppliers</Text>
              <Text style={styles.checkboxSub}>
                Marks all {suppliers.length} suppliers as unavailable for today&apos;s purchase
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setAllCustomersChecked(!allCustomersChecked)}
          >
            <Checkbox.Android
              status={allCustomersChecked ? 'checked' : 'unchecked'}
              onPress={() => setAllCustomersChecked(!allCustomersChecked)}
              color={BrandColors.primaryDark}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.checkboxLabel}>All Customers</Text>
              <Text style={styles.checkboxSub}>
                Sets today&apos;s delivery milk quantity &amp; amount to 0 for all {customers.length} customers
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.modalButtonsRow}>
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
            onPress={handleApplyAllHoliday}
            loading={processing}
            disabled={processing}
            buttonColor={BrandColors.primaryDark}
          >
            Apply Holiday
          </Button>
        </View>
      </Modal>

      {/* 3. Custom Holiday Popup Modal */}
      <Modal
        visible={visible && currentView === 'custom'}
        onDismiss={() => setCurrentView('menu')}
        contentContainerStyle={styles.customModalContent}
      >
        <View style={styles.dialogHeader}>
          <MaterialCommunityIcons name="account-cog" size={22} color="#D97706" />
          <Text style={styles.dialogTitle}>Custom Holiday</Text>
        </View>
        <Text style={styles.dialogSubtitle}>
          Select specific suppliers or customers for {formatDisplayDate(today)}:
        </Text>

        <SegmentedButtons
          value={customTab}
          onValueChange={(v) => setCustomTab(v as any)}
          buttons={[
            { value: 'suppliers', label: `Suppliers (${suppliers.length})` },
            { value: 'customers', label: `Customers (${customers.length})` },
          ]}
          style={styles.segmented}
        />

        {loadingData ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator color={BrandColors.primaryDark} />
            <Text style={{ fontSize: 12, color: BrandColors.neutralGray, marginTop: 6 }}>
              Loading lists...
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.customListScroll}>
            {customTab === 'suppliers' ? (
              suppliers.length === 0 ? (
                <Text style={styles.emptyText}>No registered suppliers found.</Text>
              ) : (
                suppliers.map((s) => {
                  const isOnHoliday =
                    supplierHolidays.has('ALL') || supplierHolidays.has(s.id);
                  const isChecked = selectedSupplierIds.has(s.id);

                  return (
                    <View key={s.id} style={styles.listItemRow}>
                      <TouchableOpacity
                        style={styles.listItemTouchable}
                        onPress={() => toggleSupplierSelection(s.id)}
                      >
                        <Checkbox.Android
                          status={isChecked ? 'checked' : 'unchecked'}
                          onPress={() => toggleSupplierSelection(s.id)}
                          color={BrandColors.primaryDark}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemName}>{s.name}</Text>
                          <Text style={styles.itemPhone}>📞 {s.phone}</Text>
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
                          >
                            <Text style={styles.cancelLinkText}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })
              )
            ) : customers.length === 0 ? (
              <Text style={styles.emptyText}>No registered customers found.</Text>
            ) : (
              customers.map((c) => {
                const isOnHoliday = customerHolidays.has(c.id);
                const isChecked = selectedCustomerIds.has(c.id);

                return (
                  <View key={c.id} style={styles.listItemRow}>
                    <TouchableOpacity
                      style={styles.listItemTouchable}
                      onPress={() => toggleCustomerSelection(c.id)}
                    >
                      <Checkbox.Android
                        status={isChecked ? 'checked' : 'unchecked'}
                        onPress={() => toggleCustomerSelection(c.id)}
                        color={BrandColors.primaryDark}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{c.name}</Text>
                        <Text style={styles.itemPhone}>
                          {c.defaultDailyQuantity} L @ ₹{c.pricePerLiter}/L
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

        <View style={styles.modalButtonsRow}>
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
            disabled={processing}
            buttonColor={BrandColors.primaryDark}
          >
            Confirm Holiday
          </Button>
        </View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  menuModalContent: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 32,
    padding: 18,
    borderRadius: 14,
    maxWidth: 360,
    alignSelf: 'center',
    elevation: 6,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  dateSubtext: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginTop: 2,
    marginBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: BrandColors.backgroundLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuItemTextCol: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  menuItemSub: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  menuActions: {
    alignItems: 'flex-end',
    marginTop: 6,
  },
  dialogModalContent: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 24,
    padding: 20,
    borderRadius: 14,
    maxWidth: 420,
    alignSelf: 'center',
    elevation: 6,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  dialogSubtitle: {
    fontSize: 13,
    color: BrandColors.neutralGray,
    marginTop: 4,
    marginBottom: 16,
  },
  checkboxGroup: {
    backgroundColor: BrandColors.backgroundLight,
    borderRadius: 10,
    padding: 8,
    marginBottom: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  checkboxLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  checkboxSub: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  customModalContent: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    padding: 18,
    borderRadius: 14,
    maxHeight: '85%',
    maxWidth: 440,
    alignSelf: 'center',
    elevation: 6,
  },
  segmented: {
    marginBottom: 12,
  },
  customListScroll: {
    maxHeight: 280,
    marginVertical: 4,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.borderLight,
  },
  listItemTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  itemPhone: {
    fontSize: 12,
    color: BrandColors.neutralGray,
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
  emptyText: {
    textAlign: 'center',
    color: BrandColors.neutralGray,
    fontSize: 13,
    paddingVertical: 20,
  },
  centerLoading: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 14,
  },
  divider: {
    backgroundColor: BrandColors.borderLight,
  },
});
