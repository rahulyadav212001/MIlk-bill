import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Alert,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  IconButton,
  Portal,
  Modal,
  TextInput,
  SegmentedButtons,
  Divider,
} from 'react-native-paper';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { getCustomerById } from '../../../services/customerService';
import {
  getCustomerDeliveries,
  updateDeliveryQuantity,
  deleteDelivery,
} from '../../../services/deliveryService';
import { generateMonthlyBill } from '../../../services/billingService';
import {
  generateCustomerMonthlyBillPDF,
  generateCustomerDailyBillPDF,
} from '../../../services/pdfService';
import { Customer, Delivery, MonthlyBill } from '../../../types';
import { BrandColors } from '../../../constants/theme';
import { HeaderBar } from '../../../components/HeaderBar';
import { LoadingIndicator } from '../../../components/LoadingIndicator';
import { EmptyState } from '../../../components/EmptyState';
import { CalendarDatePickerModal } from '../../../components/CalendarDatePickerModal';
import {
  getTodayKolkata,
  formatDisplayDate,
  getCurrentMonthAndYear,
  getMonthName,
  addDays,
} from '../../../utils/date';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function CustomerHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // View Mode: 'daily' vs 'monthly'
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('monthly');

  // Daily Mode: selected date & calendar picker
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKolkata());
  const [calendarPickerVisible, setCalendarPickerVisible] = useState(false);

  // Monthly Mode: month & year
  const { month: currMonth, year: currYear } = getCurrentMonthAndYear();
  const [selectedMonth, setSelectedMonth] = useState<number>(currMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currYear);

  // Daily Bill Modal State
  const [dailyBillModalVisible, setDailyBillModalVisible] = useState(false);
  const [generatingDailyPdf, setGeneratingDailyPdf] = useState(false);

  // Monthly Bill Modal State
  const [billModalVisible, setBillModalVisible] = useState(false);
  const [activeBill, setActiveBill] = useState<MonthlyBill | null>(null);
  const [billDeliveries, setBillDeliveries] = useState<Delivery[]>([]);
  const [generatingBill, setGeneratingBill] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Edit Delivery Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null);
  const [editQtyStr, setEditQtyStr] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const cust = await getCustomerById(id);
      setCustomer(cust);

      let delList: Delivery[] = [];
      if (viewMode === 'daily') {
        const fullList = await getCustomerDeliveries(id);
        delList = fullList.filter((d) => d.deliveryDate === selectedDate);
      } else {
        delList = await getCustomerDeliveries(id, selectedMonth, selectedYear);
      }
      setDeliveries(delList);
    } catch (err) {
      console.error('Failed to load customer history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, viewMode, selectedDate, selectedMonth, selectedYear]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleDayChange = (delta: number) => {
    setSelectedDate((prev) => addDays(prev, delta));
  };

  const handleMonthChange = (delta: number) => {
    let nextM = selectedMonth + delta;
    let nextY = selectedYear;
    if (nextM < 1) {
      nextM = 12;
      nextY--;
    } else if (nextM > 12) {
      nextM = 1;
      nextY++;
    }
    setSelectedMonth(nextM);
    setSelectedYear(nextY);
  };

  // --- Monthly Bill Handler ---
  const handleOpenMonthlyBill = async () => {
    if (!id) return;
    setGeneratingBill(true);
    try {
      const res = await generateMonthlyBill(id, selectedMonth, selectedYear);
      setActiveBill(res.bill);
      setBillDeliveries(res.deliveries);
      setBillModalVisible(true);
    } catch (err: any) {
      Alert.alert('Billing Error', err?.message || 'Failed to calculate monthly bill.');
    } finally {
      setGeneratingBill(false);
    }
  };

  const handleDownloadBillPdf = async () => {
    if (!customer || !activeBill) return;
    setGeneratingPdf(true);
    try {
      await generateCustomerMonthlyBillPDF(
        customer,
        selectedMonth,
        selectedYear,
        billDeliveries,
        activeBill
      );
    } catch (err: any) {
      Alert.alert('PDF Error', err?.message || 'Failed to generate customer bill PDF.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // --- Daily Bill Handlers ---
  const handleOpenDailyBill = () => {
    setDailyBillModalVisible(true);
  };

  const handleDownloadDailyBillPdf = async () => {
    if (!customer) return;
    setGeneratingDailyPdf(true);
    try {
      const todayDel: Delivery = deliveries.find((d) => d.deliveryDate === selectedDate) || {
        id: `del_fallback_${selectedDate}`,
        customerId: customer.id,
        customerName: customer.name,
        deliveryDate: selectedDate,
        defaultQuantity: customer.defaultDailyQuantity || 0,
        actualQuantity: customer.defaultDailyQuantity || 0,
        pricePerLiter: customer.pricePerLiter,
        amount: Number(((customer.defaultDailyQuantity || 0) * customer.pricePerLiter).toFixed(2)),
        status: 'delivered',
        manuallyEdited: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await generateCustomerDailyBillPDF(customer, selectedDate, todayDel, 0, 0);
    } catch (err: any) {
      Alert.alert('PDF Error', err?.message || 'Failed to generate customer daily bill PDF.');
    } finally {
      setGeneratingDailyPdf(false);
    }
  };

  // --- Edit Historical Delivery Handlers ---
  const handleOpenEditDelivery = (del: Delivery) => {
    setEditingDelivery(del);
    setEditQtyStr(del.actualQuantity.toString());
    setEditModalVisible(true);
  };

  const handleSaveEditDelivery = async () => {
    if (!editingDelivery || !customer) return;
    const q = parseFloat(editQtyStr);
    if (isNaN(q) || q < 0) {
      Alert.alert('Invalid Quantity', 'Please enter a valid positive decimal quantity.');
      return;
    }

    setSavingEdit(true);
    try {
      await updateDeliveryQuantity(
        customer.id,
        editingDelivery.deliveryDate,
        q,
        customer.name,
        editingDelivery.pricePerLiter || customer.pricePerLiter
      );
      setEditModalVisible(false);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update delivery.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteDelivery = (del: Delivery) => {
    Alert.alert(
      'Delete Delivery Record',
      `Are you sure you want to delete this delivery record for ${formatDisplayDate(del.deliveryDate)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDelivery(del.id);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete delivery record.');
            }
          },
        },
      ]
    );
  };

  // Monthly totals
  const totalMonthMilk = Number(
    deliveries.reduce((sum, d) => sum + d.actualQuantity, 0).toFixed(2)
  );
  const totalMonthAmount = Number(
    deliveries.reduce((sum, d) => sum + d.amount, 0).toFixed(2)
  );

  const deliveryTimeLabel = customer?.deliveryTime
    ? customer.deliveryTime.charAt(0).toUpperCase() + customer.deliveryTime.slice(1)
    : 'Morning';

  return (
    <View style={styles.container}>
      <HeaderBar
        title={customer?.name || 'Customer History'}
        subtitle={`📞 ${customer?.phone || ''} • ⏰ ${deliveryTimeLabel} • Rate: ₹${customer?.pricePerLiter || 0}/L`}
        showBack
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[BrandColors.primary]}
          />
        }
      >
        {/* Toggle Mode: Monthly vs Daily */}
        <SegmentedButtons
          value={viewMode}
          onValueChange={(v) => setViewMode(v as 'daily' | 'monthly')}
          buttons={[
            { value: 'monthly', label: '📆 Monthly History' },
            { value: 'daily', label: '📅 Daily History' },
          ]}
          style={styles.segmented}
        />

        {/* Date / Month Selector Card */}
        {viewMode === 'daily' ? (
          <Card style={styles.selectorCard}>
            <Card.Content style={styles.selectorRow}>
              <IconButton icon="chevron-left" onPress={() => handleDayChange(-1)} />
              <TouchableOpacity
                style={styles.selectorCenter}
                onPress={() => setCalendarPickerVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.selectorLabel}>Delivery Date (Tap to pick)</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MaterialCommunityIcons name="calendar" size={16} color={BrandColors.primaryDark} />
                  <Text style={styles.selectorValue}>{formatDisplayDate(selectedDate)}</Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color={BrandColors.neutralGray} />
                </View>
              </TouchableOpacity>
              <IconButton icon="chevron-right" onPress={() => handleDayChange(1)} />
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.selectorCard}>
            <Card.Content style={styles.selectorRow}>
              <IconButton icon="chevron-left" onPress={() => handleMonthChange(-1)} />
              <View style={styles.selectorCenter}>
                <Text style={styles.selectorLabel}>Billing Month</Text>
                <Text style={styles.selectorValue}>
                  {getMonthName(selectedMonth)} {selectedYear}
                </Text>
              </View>
              <IconButton icon="chevron-right" onPress={() => handleMonthChange(1)} />
            </Card.Content>
          </Card>
        )}

        {/* Bill Action Banner: Daily vs Monthly */}
        {viewMode === 'daily' ? (
          <Card style={styles.billActionCard}>
            <Card.Content style={styles.billActionContent}>
              <View style={{ flex: 1 }}>
                <Text style={styles.billActionTitle}>Daily Customer Bill</Text>
                <Text style={styles.billActionSubtitle}>
                  View daily delivery charge, rate, and print Daily Bill PDF
                </Text>
              </View>
              <Button
                mode="contained"
                icon="receipt"
                onPress={handleOpenDailyBill}
                buttonColor={BrandColors.primaryDark}
              >
                Daily Bill
              </Button>
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.billActionCard}>
            <Card.Content style={styles.billActionContent}>
              <View style={{ flex: 1 }}>
                <Text style={styles.billActionTitle}>Monthly Customer Bill</Text>
                <Text style={styles.billActionSubtitle}>
                  Calculate charges, previous balance, payments, and print PDF
                </Text>
              </View>
              <Button
                mode="contained"
                icon="receipt"
                onPress={handleOpenMonthlyBill}
                loading={generatingBill}
                disabled={generatingBill}
                buttonColor={BrandColors.primaryDark}
              >
                Monthly Bill
              </Button>
            </Card.Content>
          </Card>
        )}

        {/* Summary Card */}
        {viewMode === 'monthly' ? (
          <Card style={styles.summaryCard}>
            <Card.Content>
              <Text style={styles.summaryTitle}>
                {getMonthName(selectedMonth)} {selectedYear} Delivery Summary
              </Text>
              <Divider style={styles.divider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Milk Delivered:</Text>
                <Text style={styles.summaryVal}>{totalMonthMilk} Liters</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Delivery Charges:</Text>
                <Text style={[styles.summaryVal, { color: BrandColors.primaryDark, fontSize: 18 }]}>
                  ₹{totalMonthAmount}
                </Text>
              </View>
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.summaryCard}>
            <Card.Content>
              <Text style={styles.summaryTitle}>
                Daily Summary – {formatDisplayDate(selectedDate)}
              </Text>
              <Divider style={styles.divider} />
              {(() => {
                const todayDel = deliveries.find((d) => d.deliveryDate === selectedDate);
                const qty = todayDel ? todayDel.actualQuantity : (customer?.defaultDailyQuantity || 0);
                const amt = todayDel ? todayDel.amount : Number((qty * (customer?.pricePerLiter || 0)).toFixed(2));
                return (
                  <>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Delivered Milk:</Text>
                      <Text style={styles.summaryVal}>{qty} Liters</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Today&apos;s Amount:</Text>
                      <Text style={[styles.summaryVal, { color: BrandColors.primaryDark, fontSize: 18 }]}>
                        ₹{amt}
                      </Text>
                    </View>
                  </>
                );
              })()}
            </Card.Content>
          </Card>
        )}

        {/* Deliveries List */}
        <Text style={styles.sectionHeading}>
          {viewMode === 'daily'
            ? `Delivery on ${formatDisplayDate(selectedDate)}`
            : `All Deliveries in ${getMonthName(selectedMonth)} (${deliveries.length} entries)`}
        </Text>

        {loading ? (
          <LoadingIndicator message="Loading delivery records..." />
        ) : deliveries.length === 0 ? (
          <EmptyState
            icon="truck-delivery-outline"
            title="No Deliveries Recorded"
            description="No delivery records found for this time period."
          />
        ) : (
          deliveries.map((d) => (
            <Card key={d.id} style={styles.deliveryCard}>
              <Card.Content style={styles.deliveryContent}>
                <View style={styles.deliveryLeft}>
                  <Text style={styles.deliveryDate}>{formatDisplayDate(d.deliveryDate)}</Text>
                  <Text style={styles.deliveryRate}>
                    {d.actualQuantity} L @ ₹{d.pricePerLiter}/L
                  </Text>
                </View>

                <View style={styles.deliveryRight}>
                  <Text style={styles.deliveryAmount}>₹{d.amount}</Text>
                  <View style={styles.actionRow}>
                    <View
                      style={[
                        styles.deliveryStatusBadge,
                        {
                          backgroundColor:
                            d.status === 'stopped' ||
                            d.status === 'customer_holiday' ||
                            d.status === 'supplier_holiday'
                              ? '#FEE2E2'
                              : d.status === 'not_started'
                              ? '#FEF3C7'
                              : '#ECFDF5',
                          borderColor:
                            d.status === 'stopped' ||
                            d.status === 'customer_holiday' ||
                            d.status === 'supplier_holiday'
                              ? '#FECACA'
                              : d.status === 'not_started'
                              ? '#FDE68A'
                              : '#A7F3D0',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.deliveryStatusText,
                          {
                            color:
                              d.status === 'stopped' ||
                              d.status === 'customer_holiday' ||
                              d.status === 'supplier_holiday'
                                ? BrandColors.danger
                                : d.status === 'not_started'
                                ? '#D97706'
                                : BrandColors.success,
                          },
                        ]}
                      >
                        {d.status === 'delivered'
                          ? 'Delivered'
                          : d.status === 'customer_holiday'
                          ? 'Holiday'
                          : d.status === 'supplier_holiday'
                          ? 'Supplier Holiday'
                          : d.status}
                      </Text>
                    </View>

                    <IconButton
                      icon="pencil"
                      size={16}
                      iconColor={BrandColors.primary}
                      onPress={() => handleOpenEditDelivery(d)}
                    />
                    <IconButton
                      icon="delete"
                      size={16}
                      iconColor={BrandColors.danger}
                      onPress={() => handleDeleteDelivery(d)}
                    />
                  </View>
                </View>
              </Card.Content>
            </Card>
          ))
        )}
      </ScrollView>

      {/* 1. Monthly Bill Modal */}
      <Portal>
        <Modal
          visible={billModalVisible}
          onDismiss={() => setBillModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <ScrollView>
            <Text style={styles.modalTitle}>Monthly Customer Statement</Text>
            <Text style={styles.modalSubtitle}>
              {customer?.name} • {getMonthName(selectedMonth)} {selectedYear}
            </Text>

            {activeBill ? (
              <View style={styles.billStatementBox}>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Total Milk Delivered:</Text>
                  <Text style={styles.billVal}>{activeBill.totalMilk} Liters</Text>
                </View>

                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Current Month Milk Charges:</Text>
                  <Text style={styles.billVal}>₹{activeBill.milkAmount}</Text>
                </View>

                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Previous Balance:</Text>
                  <Text style={styles.billVal}>₹{activeBill.previousBalance}</Text>
                </View>

                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Payments Received:</Text>
                  <Text style={[styles.billVal, { color: BrandColors.success }]}>
                    ₹{activeBill.paymentsReceived}
                  </Text>
                </View>

                <Divider style={styles.divider} />

                <View style={[styles.billRow, { marginTop: 4 }]}>
                  <Text style={[styles.billLabel, { fontWeight: '700', fontSize: 16 }]}>
                    Remaining Balance Due:
                  </Text>
                  <Text
                    style={[
                      styles.billVal,
                      {
                        fontSize: 20,
                        fontWeight: '800',
                        color: activeBill.remainingBalance > 0 ? BrandColors.danger : BrandColors.success,
                      },
                    ]}
                  >
                    ₹{activeBill.remainingBalance}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Button
                mode="text"
                onPress={() => setBillModalVisible(false)}
                textColor={BrandColors.neutralGray}
              >
                Close
              </Button>

              <Button
                mode="contained"
                icon="file-pdf-box"
                onPress={handleDownloadBillPdf}
                loading={generatingPdf}
                disabled={generatingPdf}
                buttonColor={BrandColors.primaryDark}
              >
                Share Bill PDF
              </Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>

      {/* 2. Daily Bill Modal */}
      <Portal>
        <Modal
          visible={dailyBillModalVisible}
          onDismiss={() => setDailyBillModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <ScrollView>
            <Text style={styles.modalTitle}>Daily Customer Bill</Text>
            <Text style={styles.modalSubtitle}>
              {customer?.name} • {formatDisplayDate(selectedDate)}
            </Text>

            {(() => {
              const currentDel = deliveries.find((d) => d.deliveryDate === selectedDate);
              const qty = currentDel ? currentDel.actualQuantity : (customer?.defaultDailyQuantity || 0);
              const rate = currentDel?.pricePerLiter || customer?.pricePerLiter || 0;
              const amt = currentDel ? currentDel.amount : Number((qty * rate).toFixed(2));
              const categoryLabel = customer?.milkCategory === 'cow' ? '🐄 Cow Milk' : '🐃 Buffalo Milk';

              return (
                <View style={styles.billStatementBox}>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Customer Phone:</Text>
                    <Text style={styles.billVal}>{customer?.phone}</Text>
                  </View>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Milk Category:</Text>
                    <Text style={styles.billVal}>{categoryLabel}</Text>
                  </View>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Delivery Session:</Text>
                    <Text style={styles.billVal}>{deliveryTimeLabel}</Text>
                  </View>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Delivered Quantity:</Text>
                    <Text style={styles.billVal}>{qty} Litres</Text>
                  </View>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Rate per Litre:</Text>
                    <Text style={styles.billVal}>₹{rate}/Litre</Text>
                  </View>
                  <Divider style={styles.divider} />
                  <View style={[styles.billRow, { marginTop: 4 }]}>
                    <Text style={[styles.billLabel, { fontWeight: '700', fontSize: 16 }]}>
                      Total Daily Charge:
                    </Text>
                    <Text
                      style={[
                        styles.billVal,
                        { fontSize: 20, fontWeight: '800', color: BrandColors.primaryDark },
                      ]}
                    >
                      ₹{amt}
                    </Text>
                  </View>
                </View>
              );
            })()}

            <View style={styles.modalActions}>
              <Button
                mode="text"
                onPress={() => setDailyBillModalVisible(false)}
                textColor={BrandColors.neutralGray}
              >
                Close
              </Button>
              <Button
                mode="contained"
                icon="file-pdf-box"
                onPress={handleDownloadDailyBillPdf}
                loading={generatingDailyPdf}
                disabled={generatingDailyPdf}
                buttonColor={BrandColors.primaryDark}
              >
                Download Daily Bill PDF
              </Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>

      {/* 3. Edit Historical Delivery Modal */}
      <Portal>
        <Modal
          visible={editModalVisible}
          onDismiss={() => setEditModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Text style={styles.modalTitle}>Edit Historical Delivery</Text>
          <Text style={styles.modalSubtitle}>
            Date: {editingDelivery ? formatDisplayDate(editingDelivery.deliveryDate) : ''}
          </Text>

          <TextInput
            label="Delivered Milk Quantity in Liters *"
            value={editQtyStr}
            onChangeText={setEditQtyStr}
            mode="outlined"
            keyboardType="decimal-pad"
            style={styles.input}
            right={<TextInput.Affix text="Liters" />}
          />

          <View style={styles.calcBox}>
            <Text style={styles.calcLabel}>Recalculated Daily Amount:</Text>
            <Text style={styles.calcValue}>
              ₹{Number(((parseFloat(editQtyStr) || 0) * (editingDelivery?.pricePerLiter || customer?.pricePerLiter || 0)).toFixed(2))}
            </Text>
          </View>

          <View style={styles.modalActions}>
            <Button
              mode="text"
              onPress={() => setEditModalVisible(false)}
              disabled={savingEdit}
              textColor={BrandColors.neutralGray}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSaveEditDelivery}
              loading={savingEdit}
              disabled={savingEdit}
              buttonColor={BrandColors.primaryDark}
            >
              Save Delivery
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Interactive Calendar Date Picker Modal */}
      <CalendarDatePickerModal
        visible={calendarPickerVisible}
        selectedDate={selectedDate}
        onSelectDate={(newDate) => {
          setSelectedDate(newDate);
          setCalendarPickerVisible(false);
        }}
        onDismiss={() => setCalendarPickerVisible(false)}
        title="Select Delivery Date"
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
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  segmented: {
    marginBottom: 12,
  },
  selectorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    borderColor: BrandColors.borderLight,
    borderWidth: 1,
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  selectorCenter: {
    alignItems: 'center',
  },
  selectorLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    color: BrandColors.neutralGray,
    fontWeight: '700',
  },
  selectorValue: {
    fontSize: 15,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  billActionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.primaryDark + '30',
  },
  billActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  billActionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  billActionSubtitle: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  divider: {
    marginVertical: 10,
    backgroundColor: BrandColors.borderLight,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 3,
  },
  summaryLabel: {
    fontSize: 13,
    color: BrandColors.neutralGray,
  },
  summaryVal: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.textLight,
    marginBottom: 8,
    marginTop: 4,
  },
  deliveryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  deliveryContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deliveryLeft: {
    flex: 1,
  },
  deliveryDate: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  deliveryRate: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  deliveryRight: {
    alignItems: 'flex-end',
  },
  deliveryAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  deliveryStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliveryStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    padding: 20,
    borderRadius: 14,
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
  billStatementBox: {
    backgroundColor: BrandColors.backgroundLight,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  billLabel: {
    fontSize: 14,
    color: BrandColors.neutralGray,
  },
  billVal: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  input: {
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
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
  calcValue: {
    fontSize: 20,
    fontWeight: '800',
    color: BrandColors.primaryDark,
    marginTop: 2,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
});
