import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
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
  SegmentedButtons,
  Divider,
} from 'react-native-paper';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { HeaderBar } from '../../../components/HeaderBar';
import { LoadingIndicator } from '../../../components/LoadingIndicator';
import { EmptyState } from '../../../components/EmptyState';
import { CalendarDatePickerModal } from '../../../components/CalendarDatePickerModal';
import { BrandColors } from '../../../constants/theme';
import { getCustomerById } from '../../../services/customerService';
import { getCustomerDeliveries } from '../../../services/deliveryService';
import {
  generateMonthlyBill,
  getBillForCustomer,
} from '../../../services/billingService';
import {
  getPayments,
  recordPaymentDone,
  recordPaymentDue,
  deletePayment,
  getCustomerPaymentHistory,
} from '../../../services/paymentService';
import {
  Customer,
  Delivery,
  MonthlyBill,
  Payment,
} from '../../../types';
import {
  getCurrentMonthAndYear,
  getMonthName,
  getDaysInMonth,
  formatDisplayDate,
  getTodayKolkata,
} from '../../../utils/date';
import { makePhoneCall } from '../../../utils/phone';

export default function CustomerPaymentDetailsScreen() {
  const params = useLocalSearchParams<{ id: string; month?: string; year?: string }>();
  const customerId = params.id;

  const { month: currMonth, year: currYear } = getCurrentMonthAndYear();
  const initialMonth = params.month ? parseInt(params.month, 10) : currMonth;
  const initialYear = params.year ? parseInt(params.year, 10) : currYear;

  const [selectedMonth, setSelectedMonth] = useState<number>(initialMonth);
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [bill, setBill] = useState<MonthlyBill | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [allBills, setAllBills] = useState<MonthlyBill[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // View Mode: 'calendar' vs 'ledger'
  const [viewTab, setViewTab] = useState<'calendar' | 'ledger'>('calendar');

  // Due / Partial Payment Modal State
  const [dueModalVisible, setDueModalVisible] = useState<boolean>(false);
  const [dueAmountInput, setDueAmountInput] = useState<string>('');
  const [partialPaymentInput, setPartialPaymentInput] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'other'>('cash');
  const [expectedDateInput, setExpectedDateInput] = useState<string>('');
  const [dueNotesInput, setDueNotesInput] = useState<string>('');
  const [savingDue, setSavingDue] = useState<boolean>(false);

  // Calendar Date Picker Modal for Expected Payment Date
  const [datePickerVisible, setDatePickerVisible] = useState<boolean>(false);

  // Processing Action State
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Month navigation handlers
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  // Load Data
  const loadData = useCallback(async () => {
    if (!customerId) return;
    try {
      const cust = await getCustomerById(customerId);
      setCustomer(cust);

      // Load deliveries for month
      const delList = await getCustomerDeliveries(customerId, selectedMonth, selectedYear);
      setDeliveries(delList);

      // Ensure monthly bill is generated & loaded
      let currentBill = await getBillForCustomer(customerId, selectedMonth, selectedYear);
      if (!currentBill) {
        const res = await generateMonthlyBill(customerId, selectedMonth, selectedYear);
        currentBill = res.bill;
      }
      setBill(currentBill);

      // Load payments for this month
      const pList = await getPayments(customerId, selectedMonth, selectedYear);
      setPayments(pList);

      // Load full customer history
      const history = await getCustomerPaymentHistory(customerId);
      setAllBills(history.bills);
    } catch (err) {
      console.error('Failed to load customer payment details:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId, selectedMonth, selectedYear]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  // Action 1: Payment Done (Full Settlement)
  const handlePaymentDone = () => {
    if (!bill || !customer) return;
    if (bill.remainingBalance <= 0) {
      Alert.alert('Already Settled', `${customer.name}'s bill is already completely paid (₹0 due).`);
      return;
    }

    Alert.alert(
      'Confirm Payment Done',
      `Mark entire remaining balance of ₹${bill.remainingBalance} as FULLY PAID for ${getMonthName(selectedMonth)} ${selectedYear}?\n\nThis will record a settlement payment and update outstanding balance to ₹0.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record Full Payment',
          onPress: async () => {
            setActionLoading(true);
            try {
              await recordPaymentDone({
                customerId: customer.id,
                month: selectedMonth,
                year: selectedYear,
                paymentDate: getTodayKolkata(),
                paymentMethod: 'cash',
                note: `Full payment of ₹${bill.remainingBalance} settled via Payment Done`,
              });
              Alert.alert('Success', `Recorded full payment of ₹${bill.remainingBalance}.`);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to record full payment.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Action 2: Open Due / Partial Payment Modal
  const handleOpenDueModal = () => {
    if (!bill) return;
    setDueAmountInput(bill.remainingBalance.toString());
    setPartialPaymentInput('');
    setPaymentMethod('cash');
    setExpectedDateInput(bill.expectedPaymentDate || '');
    setDueNotesInput(bill.notes || '');
    setDueModalVisible(true);
  };

  // Action 2: Save Due / Partial Payment
  const handleSaveDue = async () => {
    if (!bill || !customer) return;

    const partialAmt = partialPaymentInput.trim() ? parseFloat(partialPaymentInput) : 0;
    if (isNaN(partialAmt) || partialAmt < 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid partial payment amount.');
      return;
    }

    setSavingDue(true);
    try {
      await recordPaymentDue({
        customerId: customer.id,
        month: selectedMonth,
        year: selectedYear,
        partialPaymentAmount: partialAmt > 0 ? partialAmt : undefined,
        paymentMethod: partialAmt > 0 ? paymentMethod : undefined,
        expectedPaymentDate: expectedDateInput.trim() || undefined,
        notes: dueNotesInput.trim() || undefined,
      });

      setDueModalVisible(false);
      Alert.alert('Success', 'Payment and Due commitment recorded successfully.');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update payment status.');
    } finally {
      setSavingDue(false);
    }
  };

  // Delete Payment Record
  const handleDeletePayment = (paymentItem: Payment) => {
    Alert.alert(
      'Delete Payment',
      `Delete payment transaction of ₹${paymentItem.amount} made on ${formatDisplayDate(paymentItem.paymentDate)}?\n\nThis will restore the outstanding balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePayment(paymentItem);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete payment.');
            }
          },
        },
      ]
    );
  };

  // Prepare Days for Calendar (1 to daysInMonth)
  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
  const deliveryMap = useMemo(() => {
    const map = new Map<string, Delivery>();
    deliveries.forEach((d) => map.set(d.deliveryDate, d));
    return map;
  }, [deliveries]);

  const calendarDays = useMemo(() => {
    const list = [];
    const paddedMonth = selectedMonth < 10 ? `0${selectedMonth}` : `${selectedMonth}`;
    for (let day = 1; day <= daysInMonth; day++) {
      const paddedDay = day < 10 ? `0${day}` : `${day}`;
      const dateStr = `${selectedYear}-${paddedMonth}-${paddedDay}`;
      const del = deliveryMap.get(dateStr);
      list.push({
        day,
        dateStr,
        delivery: del,
      });
    }
    return list;
  }, [selectedYear, selectedMonth, daysInMonth, deliveryMap]);

  if (loading && !customer) {
    return (
      <View style={styles.container}>
        <HeaderBar title="Customer Payment" showBack />
        <LoadingIndicator message="Loading customer billing & payment records..." />
      </View>
    );
  }

  const remainingBalance = bill ? bill.remainingBalance : 0;
  const isSettled = remainingBalance <= 0;
  const statusColor = isSettled
    ? BrandColors.success
    : (bill?.paymentsReceived || 0) > 0
    ? '#D97706'
    : BrandColors.danger;

  const statusLabel = isSettled
    ? 'Fully Paid'
    : (bill?.paymentsReceived || 0) > 0
    ? 'Partially Paid'
    : 'Due / Pending';

  return (
    <View style={styles.container}>
      <HeaderBar
        title={customer?.name || 'Customer Payment'}
        subtitle={`📞 ${customer?.phone || ''} • Rate: ₹${customer?.pricePerLiter || 0}/L`}
        showBack
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[BrandColors.primaryDark]}
          />
        }
      >
        {/* Customer Header & Meta */}
        <Card style={styles.customerHeaderCard}>
          <Card.Content>
            <View style={styles.custHeaderRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.custNameText}>{customer?.name}</Text>
                  {customer?.isDeactivated ? (
                    <View style={styles.deactivatedBadge}>
                      <Text style={styles.deactivatedBadgeText}>Closed Account</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.metaRow}>
                  <TouchableOpacity onPress={() => makePhoneCall(customer?.phone || '')}>
                    <Text style={styles.phoneLink}>📞 {customer?.phone}</Text>
                  </TouchableOpacity>
                  {customer?.location ? (
                    <>
                      <Text style={styles.metaDot}>•</Text>
                      <Text style={styles.metaText}>📍 {customer.location}</Text>
                    </>
                  ) : null}
                </View>

                <View style={styles.specsRow}>
                  <Text style={styles.specItem}>
                    Joined: {formatDisplayDate(customer?.deliveryStartDate || '')}
                  </Text>
                  {customer?.closingDate ? (
                    <>
                      <Text style={styles.metaDot}>•</Text>
                      <Text style={styles.specItem}>
                        Closed: {formatDisplayDate(customer.closingDate)}
                      </Text>
                    </>
                  ) : null}
                </View>
              </View>

              <View
                style={[
                  styles.statusBadgeBig,
                  { backgroundColor: isSettled ? '#ECFDF5' : '#FEE2E2' },
                ]}
              >
                <Text style={[styles.statusBadgeBigText, { color: statusColor }]}>
                  {statusLabel}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Month & Year Navigator */}
        <Card style={styles.monthCard}>
          <Card.Content style={styles.monthContent}>
            <IconButton
              icon="chevron-left"
              size={24}
              iconColor={BrandColors.primaryDark}
              onPress={handlePrevMonth}
            />
            <View style={styles.monthCenter}>
              <Text style={styles.monthTitle}>
                {getMonthName(selectedMonth)} {selectedYear}
              </Text>
              <Text style={styles.monthSubtitle}>Monthly Billing & Ledger</Text>
            </View>
            <IconButton
              icon="chevron-right"
              size={24}
              iconColor={BrandColors.primaryDark}
              onPress={handleNextMonth}
            />
          </Card.Content>
        </Card>

        {/* Monthly Financial Summary Card */}
        {bill ? (
          <Card style={styles.summaryCard}>
            <Card.Content>
              <Text style={styles.summaryTitle}>Monthly Financial Summary</Text>
              <Divider style={styles.divider} />

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Milk Delivered:</Text>
                <Text style={styles.summaryVal}>{bill.totalMilk} Liters</Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Current Month Milk Charges:</Text>
                <Text style={styles.summaryVal}>₹{bill.milkAmount}</Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Previous Carried-Forward Due:</Text>
                <Text
                  style={[
                    styles.summaryVal,
                    { color: bill.previousBalance > 0 ? '#D97706' : BrandColors.textLight },
                  ]}
                >
                  ₹{bill.previousBalance}
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Charges Payable:</Text>
                <Text style={[styles.summaryVal, { fontWeight: '800' }]}>
                  ₹{bill.previousBalance + bill.milkAmount}
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Payments Received This Month:</Text>
                <Text style={[styles.summaryVal, { color: BrandColors.success, fontWeight: '700' }]}>
                  - ₹{bill.paymentsReceived}
                </Text>
              </View>

              <Divider style={styles.divider} />

              <View style={[styles.summaryRow, { marginTop: 4 }]}>
                <Text style={[styles.summaryLabel, { fontSize: 16, fontWeight: '800' }]}>
                  Remaining Outstanding Due:
                </Text>
                <Text
                  style={[
                    styles.summaryVal,
                    {
                      fontSize: 22,
                      fontWeight: '800',
                      color: isSettled ? BrandColors.success : BrandColors.danger,
                    },
                  ]}
                >
                  ₹{bill.remainingBalance}
                </Text>
              </View>

              {/* Expected Payment Date Banner */}
              {bill.expectedPaymentDate && !isSettled ? (
                <View style={styles.expectedBanner}>
                  <Text style={styles.expectedTitle}>
                    ⏰ Promised Payment Date: {bill.expectedPaymentDate}
                  </Text>
                  {bill.notes ? (
                    <Text style={styles.expectedNotes}>Note: {bill.notes}</Text>
                  ) : null}
                </View>
              ) : null}
            </Card.Content>
          </Card>
        ) : null}

        {/* Two Main Actions: Payment Done & Due */}
        <View style={styles.actionRowContainer}>
          <Button
            mode="contained"
            icon="check-circle"
            buttonColor={BrandColors.success}
            style={styles.actionBtn}
            contentStyle={styles.actionBtnContent}
            disabled={isSettled || actionLoading}
            loading={actionLoading}
            onPress={handlePaymentDone}
          >
            Payment Done
          </Button>

          <Button
            mode="contained"
            icon="clock-alert-outline"
            buttonColor="#D97706"
            style={styles.actionBtn}
            contentStyle={styles.actionBtnContent}
            onPress={handleOpenDueModal}
          >
            Due / Partial Pay
          </Button>
        </View>

        {/* Tab Toggle: Monthly Calendar vs Month-Wise History */}
        <SegmentedButtons
          value={viewTab}
          onValueChange={(v) => setViewTab(v as 'calendar' | 'ledger')}
          buttons={[
            { value: 'calendar', label: '📅 Monthly Calendar' },
            { value: 'ledger', label: '📊 Month-Wise Ledger' },
          ]}
          style={styles.segmented}
        />

        {/* VIEW 1: Monthly Calendar Grid */}
        {viewTab === 'calendar' ? (
          <View>
            <Card style={styles.calendarCard}>
              <Card.Content>
                <View style={styles.calHeaderRow}>
                  <Text style={styles.calTitle}>
                    Daily Milk Deliveries ({getMonthName(selectedMonth)})
                  </Text>
                  <Text style={styles.calSubTitle}>
                    {deliveries.filter((d) => d.status === 'delivered').length} delivery days
                  </Text>
                </View>

                {/* Calendar Legend */}
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendBox, { backgroundColor: '#DCFCE7' }]} />
                    <Text style={styles.legendText}>Delivered</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendBox, { backgroundColor: '#FEE2E2' }]} />
                    <Text style={styles.legendText}>Holiday</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendBox, { backgroundColor: '#F1F5F9' }]} />
                    <Text style={styles.legendText}>Stopped / None</Text>
                  </View>
                </View>

                <Divider style={styles.divider} />

                {/* Day Grid */}
                <View style={styles.gridContainer}>
                  {calendarDays.map((item) => {
                    const del = item.delivery;
                    const isDelivered = del && del.status === 'delivered';
                    const isHoliday = del && (del.status === 'customer_holiday' || del.status === 'supplier_holiday');
                    const isStopped = del && del.status === 'stopped';

                    const bg = isDelivered
                      ? '#DCFCE7'
                      : isHoliday
                      ? '#FEE2E2'
                      : isStopped
                      ? '#F1F5F9'
                      : '#FFFFFF';

                    const borderCol = isDelivered
                      ? '#86EFAC'
                      : isHoliday
                      ? '#FECACA'
                      : BrandColors.borderLight;

                    return (
                      <View
                        key={item.dateStr}
                        style={[
                          styles.gridCell,
                          { backgroundColor: bg, borderColor: borderCol },
                        ]}
                      >
                        <Text style={styles.cellDay}>{item.day}</Text>
                        {del ? (
                          <>
                            <Text style={styles.cellQty}>
                              {isHoliday ? '🏖️' : `${del.actualQuantity} L`}
                            </Text>
                            <Text style={styles.cellAmt}>
                              {isHoliday ? '₹0' : `₹${del.amount}`}
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.cellNone}>-</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </Card.Content>
            </Card>

            {/* Payment Transactions for Current Month */}
            <Card style={styles.paymentsCard}>
              <Card.Content>
                <Text style={styles.calTitle}>
                  Payments Received in {getMonthName(selectedMonth)} {selectedYear} ({payments.length})
                </Text>
                <Divider style={styles.divider} />

                {payments.length === 0 ? (
                  <Text style={styles.emptyPaymentsText}>
                    No payments recorded for this month yet. Use &apos;Payment Done&apos; or &apos;Due / Partial Pay&apos; above to record transactions.
                  </Text>
                ) : (
                  payments.map((p) => (
                    <View key={p.id} style={styles.paymentItemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.paymentItemDate}>
                          {formatDisplayDate(p.paymentDate)} • Method: {p.paymentMethod.toUpperCase()}
                        </Text>
                        {p.note ? <Text style={styles.paymentItemNote}>Note: {p.note}</Text> : null}
                      </View>

                      <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 6 }}>
                        <Text style={styles.paymentItemAmt}>₹{p.amount}</Text>
                        <IconButton
                          icon="delete-outline"
                          size={18}
                          iconColor={BrandColors.danger}
                          onPress={() => handleDeletePayment(p)}
                        />
                      </View>
                    </View>
                  ))
                )}
              </Card.Content>
            </Card>
          </View>
        ) : (
          /* VIEW 2: Month-Wise Ledger Table */
          <Card style={styles.ledgerCard}>
            <Card.Content>
              <Text style={styles.calTitle}>Complete Month-Wise Billing & Payment Ledger</Text>
              <Text style={styles.calSubTitle}>
                Chronological history with automated due carry forward
              </Text>
              <Divider style={styles.divider} />

              {allBills.length === 0 ? (
                <EmptyState
                  icon="receipt"
                  title="No Billing History"
                  message="No monthly statements found for this customer."
                />
              ) : (
                allBills.map((b) => {
                  const bSettled = b.remainingBalance <= 0;
                  const bStatusColor = bSettled
                    ? BrandColors.success
                    : b.paymentsReceived > 0
                    ? '#D97706'
                    : BrandColors.danger;

                  const bStatusText = bSettled
                    ? 'Paid'
                    : b.paymentsReceived > 0
                    ? 'Partially Paid'
                    : 'Due';

                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[
                        styles.ledgerRowCard,
                        b.billingMonth === selectedMonth && b.billingYear === selectedYear && styles.ledgerRowCardActive,
                      ]}
                      onPress={() => {
                        setSelectedMonth(b.billingMonth);
                        setSelectedYear(b.billingYear);
                        setViewTab('calendar');
                      }}
                    >
                      <View style={styles.ledgerTopRow}>
                        <Text style={styles.ledgerMonthText}>
                          {getMonthName(b.billingMonth)} {b.billingYear}
                        </Text>
                        <View
                          style={[
                            styles.ledgerBadge,
                            { backgroundColor: bSettled ? '#ECFDF5' : '#FEE2E2' },
                          ]}
                        >
                          <Text style={[styles.ledgerBadgeText, { color: bStatusColor }]}>
                            {bStatusText}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.ledgerFinRow}>
                        <View style={styles.ledgerCol}>
                          <Text style={styles.ledgerLabel}>Milk Bill</Text>
                          <Text style={styles.ledgerVal}>₹{b.milkAmount}</Text>
                        </View>

                        <View style={styles.ledgerCol}>
                          <Text style={styles.ledgerLabel}>Prev Due</Text>
                          <Text style={styles.ledgerVal}>₹{b.previousBalance}</Text>
                        </View>

                        <View style={styles.ledgerCol}>
                          <Text style={styles.ledgerLabel}>Paid</Text>
                          <Text style={[styles.ledgerVal, { color: BrandColors.success }]}>
                            ₹{b.paymentsReceived}
                          </Text>
                        </View>

                        <View style={styles.ledgerColRight}>
                          <Text style={styles.ledgerLabel}>Remaining</Text>
                          <Text
                            style={[
                              styles.ledgerValLarge,
                              { color: bSettled ? BrandColors.success : BrandColors.danger },
                            ]}
                          >
                            ₹{b.remainingBalance}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </Card.Content>
          </Card>
        )}
      </ScrollView>

      {/* Due / Partial Payment Modal */}
      <Portal>
        <Modal
          visible={dueModalVisible}
          onDismiss={() => setDueModalVisible(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <ScrollView>
            <Text style={styles.modalTitle}>Record Payment / Due Details</Text>
            <Text style={styles.modalSubTitle}>
              {customer?.name} • {getMonthName(selectedMonth)} {selectedYear}
            </Text>
            <Divider style={styles.divider} />

            <View style={styles.modalInfoBox}>
              <Text style={styles.modalInfoLabel}>Current Remaining Due:</Text>
              <Text style={styles.modalInfoVal}>₹{dueAmountInput || bill?.remainingBalance || 0}</Text>
            </View>

            <TextInput
              label="Partial Payment Received Now (₹)"
              value={partialPaymentInput}
              onChangeText={setPartialPaymentInput}
              mode="outlined"
              keyboardType="decimal-pad"
              placeholder="e.g. 2000 (leave 0 if customer pays later)"
              style={styles.modalInput}
            />

            {partialPaymentInput && parseFloat(partialPaymentInput) > 0 ? (
              <SegmentedButtons
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as any)}
                buttons={[
                  { value: 'cash', label: '💵 Cash' },
                  { value: 'upi', label: '📱 UPI' },
                  { value: 'other', label: '🏦 Other' },
                ]}
                style={{ marginVertical: 8 }}
              />
            ) : null}

            <TouchableOpacity
              onPress={() => setDatePickerVisible(true)}
              style={styles.datePickerTouch}
            >
              <Text style={styles.datePickerLabel}>Expected / Promised Payment Date:</Text>
              <View style={styles.datePickerBox}>
                <Text style={styles.datePickerVal}>
                  {expectedDateInput ? formatDisplayDate(expectedDateInput) : 'Select Promised Date 📅'}
                </Text>
              </View>
            </TouchableOpacity>

            <TextInput
              label="Optional Notes / Reason"
              value={dueNotesInput}
              onChangeText={setDueNotesInput}
              mode="outlined"
              placeholder="e.g. Promised to clear by next Monday"
              style={styles.modalInput}
            />

            <View style={styles.modalActionRow}>
              <Button
                mode="text"
                onPress={() => setDueModalVisible(false)}
                disabled={savingDue}
                textColor={BrandColors.neutralGray}
              >
                Cancel
              </Button>

              <Button
                mode="contained"
                buttonColor={BrandColors.primaryDark}
                loading={savingDue}
                disabled={savingDue}
                onPress={handleSaveDue}
              >
                Save Payment & Due
              </Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>

      {/* Date Picker Modal for Expected Payment Date */}
      <CalendarDatePickerModal
        visible={datePickerVisible}
        selectedDate={expectedDateInput || getTodayKolkata()}
        onSelectDate={(newDate) => {
          setExpectedDateInput(newDate);
          setDatePickerVisible(false);
        }}
        onDismiss={() => setDatePickerVisible(false)}
        title="Promised Payment Date"
        zIndex={99999}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 40,
  },
  customerHeaderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  custHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  custNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  deactivatedBadge: {
    backgroundColor: '#F3E8FF',
    borderColor: '#D8B4FE',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  deactivatedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7E22CE',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  phoneLink: {
    fontSize: 13,
    color: BrandColors.primary,
    fontWeight: '700',
  },
  metaDot: {
    marginHorizontal: 6,
    color: BrandColors.neutralGray,
  },
  metaText: {
    fontSize: 13,
    color: BrandColors.neutralGray,
  },
  specsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  specItem: {
    fontSize: 11,
    color: BrandColors.neutralGray,
  },
  statusBadgeBig: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statusBadgeBigText: {
    fontSize: 13,
    fontWeight: '800',
  },
  monthCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  monthContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  monthCenter: {
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  monthSubtitle: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    fontWeight: '600',
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
    fontSize: 15,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  divider: {
    marginVertical: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 3,
  },
  summaryLabel: {
    fontSize: 13,
    color: BrandColors.neutralGray,
    fontWeight: '600',
  },
  summaryVal: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  expectedBanner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
  },
  expectedTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  expectedNotes: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 2,
  },
  actionRowContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 8,
  },
  actionBtnContent: {
    paddingVertical: 4,
  },
  segmented: {
    marginBottom: 12,
  },
  calendarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  calHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  calSubTitle: {
    fontSize: 12,
    color: BrandColors.neutralGray,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendBox: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    fontWeight: '600',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-start',
  },
  gridCell: {
    width: '18.5%',
    padding: 4,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  cellDay: {
    fontSize: 11,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  cellQty: {
    fontSize: 10,
    fontWeight: '700',
    color: BrandColors.primaryDark,
    marginTop: 2,
  },
  cellAmt: {
    fontSize: 9,
    color: BrandColors.neutralGray,
    fontWeight: '600',
  },
  cellNone: {
    fontSize: 10,
    color: BrandColors.neutralGray,
  },
  paymentsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  emptyPaymentsText: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 10,
  },
  paymentItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 8,
  },
  paymentItemDate: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  paymentItemNote: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  paymentItemAmt: {
    fontSize: 15,
    fontWeight: '800',
    color: BrandColors.success,
  },
  ledgerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  ledgerRowCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  ledgerRowCardActive: {
    borderColor: BrandColors.primaryDark,
    backgroundColor: '#EFF6FF',
  },
  ledgerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ledgerMonthText: {
    fontSize: 14,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  ledgerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  ledgerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  ledgerFinRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  ledgerCol: {
    flex: 1,
  },
  ledgerColRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  ledgerLabel: {
    fontSize: 10,
    color: BrandColors.neutralGray,
    fontWeight: '600',
  },
  ledgerVal: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.textLight,
    marginTop: 2,
  },
  ledgerValLarge: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    padding: 20,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  modalSubTitle: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  modalInfoBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  modalInfoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  modalInfoVal: {
    fontSize: 16,
    fontWeight: '800',
    color: BrandColors.danger,
  },
  modalInput: {
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  datePickerTouch: {
    marginBottom: 12,
  },
  datePickerLabel: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    fontWeight: '600',
    marginBottom: 4,
  },
  datePickerBox: {
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
    borderRadius: 4,
    padding: 12,
    backgroundColor: '#F8FAFC',
  },
  datePickerVal: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
});
