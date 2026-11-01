import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Alert,
  RefreshControl,
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
  HelperText,
} from 'react-native-paper';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  getSupplierById,
  getSupplierPurchases,
  saveSupplierPurchase,
  deleteSupplierPurchase,
} from '../../../services/supplierPurchaseService';
import {
  generateSupplierDailyPDF,
  generateSupplierMonthlyPDF,
} from '../../../services/pdfService';
import { Supplier, SupplierPurchase } from '../../../types';
import { BrandColors } from '../../../constants/theme';
import { HeaderBar } from '../../../components/HeaderBar';
import { LoadingIndicator } from '../../../components/LoadingIndicator';
import { EmptyState } from '../../../components/EmptyState';
import {
  getTodayKolkata,
  formatDisplayDate,
  getCurrentMonthAndYear,
  getMonthName,
  addDays,
} from '../../../utils/date';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function SupplierHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [purchases, setPurchases] = useState<SupplierPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // View Mode: 'daily' vs 'monthly'
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');

  // Daily Mode: selected date
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKolkata());

  // Monthly Mode: month & year
  const { month: currMonth, year: currYear } = getCurrentMonthAndYear();
  const [selectedMonth, setSelectedMonth] = useState<number>(currMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currYear);

  // PDF Generating Indicator
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Edit Purchase Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<SupplierPurchase | null>(null);
  const [editQtyStr, setEditQtyStr] = useState('');
  const [editPriceStr, setEditPriceStr] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const sup = await getSupplierById(id);
      setSupplier(sup);

      let pList: SupplierPurchase[] = [];
      if (viewMode === 'daily') {
        pList = await getSupplierPurchases(id, selectedDate);
      } else {
        pList = await getSupplierPurchases(id, undefined, selectedMonth, selectedYear);
      }
      setPurchases(pList);
    } catch (err) {
      console.error('Failed to load supplier history:', err);
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

  // --- Date and Month Switchers ---
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

  // --- PDF Generation Handlers ---
  const handleDailyPdf = async () => {
    if (!supplier) return;
    setGeneratingPdf(true);
    try {
      // Find morning and evening records for the selected date
      const morning = purchases.find((p) => p.session === 'morning');
      const evening = purchases.find((p) => p.session === 'evening');
      await generateSupplierDailyPDF(supplier, selectedDate, morning, evening);
    } catch (err: any) {
      Alert.alert('PDF Error', err?.message || 'Failed to generate Daily PDF.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleMonthlyPdf = async () => {
    if (!supplier) return;
    setGeneratingPdf(true);
    try {
      // Fetch full month purchases
      const monthPurchases = await getSupplierPurchases(
        supplier.id,
        undefined,
        selectedMonth,
        selectedYear
      );
      await generateSupplierMonthlyPDF(supplier, selectedMonth, selectedYear, monthPurchases);
    } catch (err: any) {
      Alert.alert('PDF Error', err?.message || 'Failed to generate Monthly PDF.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // --- Edit & Delete Handlers ---
  const handleOpenEdit = (p: SupplierPurchase) => {
    setEditingPurchase(p);
    setEditQtyStr(p.quantityLiters.toString());
    setEditPriceStr(p.pricePerLiter.toString());
    setEditError('');
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingPurchase || !supplier) return;
    const q = parseFloat(editQtyStr);
    const pr = parseFloat(editPriceStr);

    if (isNaN(q) || q < 0) {
      setEditError('Valid milk quantity is required.');
      return;
    }
    if (isNaN(pr) || pr <= 0) {
      setEditError('Valid price per liter is required.');
      return;
    }

    setSavingEdit(true);
    setEditError('');

    try {
      await saveSupplierPurchase(
        { id: supplier.id, name: supplier.name, phone: supplier.phone },
        editingPurchase.purchaseDate,
        editingPurchase.session,
        q,
        pr
      );
      setEditModalVisible(false);
      await loadData();
    } catch (err: any) {
      setEditError(err?.message || 'Failed to update purchase.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = (purchase: SupplierPurchase) => {
    Alert.alert(
      'Delete Purchase Record',
      'Are you sure you want to delete this purchase record?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSupplierPurchase(purchase.id);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete record.');
            }
          },
        },
      ]
    );
  };

  // Calculations for daily view
  const morningPurchase = purchases.find((p) => p.session === 'morning');
  const eveningPurchase = purchases.find((p) => p.session === 'evening');
  const dailyTotalMilk = Number(
    ((morningPurchase?.quantityLiters || 0) + (eveningPurchase?.quantityLiters || 0)).toFixed(2)
  );
  const dailyTotalAmount = Number(
    ((morningPurchase?.totalAmount || 0) + (eveningPurchase?.totalAmount || 0)).toFixed(2)
  );

  // Calculations for monthly view
  const monthlyTotalMilk = Number(
    purchases.reduce((sum, p) => sum + p.quantityLiters, 0).toFixed(2)
  );
  const monthlyTotalAmount = Number(
    purchases.reduce((sum, p) => sum + p.totalAmount, 0).toFixed(2)
  );

  return (
    <View style={styles.container}>
      <HeaderBar
        title={supplier?.name || 'Supplier History'}
        subtitle={`📞 ${supplier?.phone || ''}`}
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
        {/* Toggle View Mode: Daily vs Monthly */}
        <SegmentedButtons
          value={viewMode}
          onValueChange={(v) => setViewMode(v as 'daily' | 'monthly')}
          buttons={[
            { value: 'daily', label: '📅 Daily History' },
            { value: 'monthly', label: '📆 Monthly History' },
          ]}
          style={styles.segmented}
        />

        {/* Date Selector Bar */}
        {viewMode === 'daily' ? (
          <Card style={styles.selectorCard}>
            <Card.Content style={styles.selectorRow}>
              <IconButton icon="chevron-left" onPress={() => handleDayChange(-1)} />
              <View style={styles.selectorCenter}>
                <Text style={styles.selectorLabel}>Selected Date</Text>
                <Text style={styles.selectorValue}>{formatDisplayDate(selectedDate)}</Text>
              </View>
              <IconButton icon="chevron-right" onPress={() => handleDayChange(1)} />
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.selectorCard}>
            <Card.Content style={styles.selectorRow}>
              <IconButton icon="chevron-left" onPress={() => handleMonthChange(-1)} />
              <View style={styles.selectorCenter}>
                <Text style={styles.selectorLabel}>Selected Month</Text>
                <Text style={styles.selectorValue}>
                  {getMonthName(selectedMonth)} {selectedYear}
                </Text>
              </View>
              <IconButton icon="chevron-right" onPress={() => handleMonthChange(1)} />
            </Card.Content>
          </Card>
        )}

        {/* PDF Reports Section */}
        <Card style={styles.pdfCard}>
          <Card.Content>
            <View style={styles.pdfHeader}>
              <MaterialCommunityIcons name="file-pdf-box" size={24} color="#DC2626" />
              <Text style={styles.pdfHeading}>Supplier PDF Reports</Text>
            </View>
            <View style={styles.pdfBtnRow}>
              <Button
                mode="contained"
                icon="file-document-outline"
                onPress={handleDailyPdf}
                loading={generatingPdf && viewMode === 'daily'}
                disabled={generatingPdf}
                style={styles.pdfBtn}
                buttonColor={BrandColors.primaryDark}
              >
                Daily PDF
              </Button>
              <Button
                mode="contained"
                icon="calendar-text-outline"
                onPress={handleMonthlyPdf}
                loading={generatingPdf && viewMode === 'monthly'}
                disabled={generatingPdf}
                style={styles.pdfBtn}
                buttonColor={BrandColors.secondary}
              >
                Monthly PDF
              </Button>
            </View>
          </Card.Content>
        </Card>

        {loading ? (
          <LoadingIndicator message="Loading purchase records..." />
        ) : viewMode === 'daily' ? (
          /* DAILY VIEW DETAILS */
          <View>
            {/* Morning Entry Card */}
            <Card style={styles.sessionCard}>
              <Card.Content>
                <View style={styles.sessionHeader}>
                  <View style={styles.sessionTitleRow}>
                    <Text style={styles.sessionBadge}>🌅 Morning</Text>
                    <Text style={styles.sessionStatus}>
                      {morningPurchase ? 'Recorded' : 'Not Recorded'}
                    </Text>
                  </View>
                  {morningPurchase ? (
                    <View style={styles.actionIcons}>
                      <IconButton
                        icon="pencil"
                        size={18}
                        iconColor={BrandColors.primary}
                        onPress={() => handleOpenEdit(morningPurchase)}
                      />
                      <IconButton
                        icon="delete"
                        size={18}
                        iconColor={BrandColors.danger}
                        onPress={() => handleDelete(morningPurchase)}
                      />
                    </View>
                  ) : null}
                </View>

                {morningPurchase ? (
                  <View style={styles.metricsGrid}>
                    <View style={styles.metricCol}>
                      <Text style={styles.metricLabel}>Milk Quantity</Text>
                      <Text style={styles.metricVal}>{morningPurchase.quantityLiters} L</Text>
                    </View>
                    <View style={styles.metricCol}>
                      <Text style={styles.metricLabel}>Price / Liter</Text>
                      <Text style={styles.metricVal}>₹{morningPurchase.pricePerLiter}</Text>
                    </View>
                    <View style={styles.metricCol}>
                      <Text style={styles.metricLabel}>Amount</Text>
                      <Text style={[styles.metricVal, { color: BrandColors.primaryDark }]}>
                        ₹{morningPurchase.totalAmount}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.noEntryText}>No morning milk purchase recorded for this date.</Text>
                )}
              </Card.Content>
            </Card>

            {/* Evening Entry Card */}
            <Card style={styles.sessionCard}>
              <Card.Content>
                <View style={styles.sessionHeader}>
                  <View style={styles.sessionTitleRow}>
                    <Text style={styles.sessionBadge}>🌇 Evening</Text>
                    <Text style={styles.sessionStatus}>
                      {eveningPurchase ? 'Recorded' : 'Not Recorded'}
                    </Text>
                  </View>
                  {eveningPurchase ? (
                    <View style={styles.actionIcons}>
                      <IconButton
                        icon="pencil"
                        size={18}
                        iconColor={BrandColors.primary}
                        onPress={() => handleOpenEdit(eveningPurchase)}
                      />
                      <IconButton
                        icon="delete"
                        size={18}
                        iconColor={BrandColors.danger}
                        onPress={() => handleDelete(eveningPurchase)}
                      />
                    </View>
                  ) : null}
                </View>

                {eveningPurchase ? (
                  <View style={styles.metricsGrid}>
                    <View style={styles.metricCol}>
                      <Text style={styles.metricLabel}>Milk Quantity</Text>
                      <Text style={styles.metricVal}>{eveningPurchase.quantityLiters} L</Text>
                    </View>
                    <View style={styles.metricCol}>
                      <Text style={styles.metricLabel}>Price / Liter</Text>
                      <Text style={styles.metricVal}>₹{eveningPurchase.pricePerLiter}</Text>
                    </View>
                    <View style={styles.metricCol}>
                      <Text style={styles.metricLabel}>Amount</Text>
                      <Text style={[styles.metricVal, { color: BrandColors.primaryDark }]}>
                        ₹{eveningPurchase.totalAmount}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.noEntryText}>No evening milk purchase recorded for this date.</Text>
                )}
              </Card.Content>
            </Card>

            {/* Daily Total Summary Card */}
            <Card style={styles.summaryCard}>
              <Card.Content>
                <Text style={styles.summaryTitle}>Daily Total Summary</Text>
                <Divider style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total Daily Milk:</Text>
                  <Text style={styles.summaryVal}>{dailyTotalMilk} Liters</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total Daily Amount:</Text>
                  <Text style={[styles.summaryVal, { color: BrandColors.primaryDark, fontSize: 18 }]}>
                    ₹{dailyTotalAmount}
                  </Text>
                </View>
              </Card.Content>
            </Card>
          </View>
        ) : (
          /* MONTHLY VIEW DETAILS */
          <View>
            <Card style={styles.summaryCard}>
              <Card.Content>
                <Text style={styles.summaryTitle}>
                  {getMonthName(selectedMonth)} {selectedYear} Consolidated Summary
                </Text>
                <Divider style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total Monthly Milk:</Text>
                  <Text style={styles.summaryVal}>{monthlyTotalMilk} Liters</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total Monthly Amount:</Text>
                  <Text style={[styles.summaryVal, { color: BrandColors.primaryDark, fontSize: 18 }]}>
                    ₹{monthlyTotalAmount}
                  </Text>
                </View>
              </Card.Content>
            </Card>

            <Text style={styles.monthListHeading}>All Purchase Records in {getMonthName(selectedMonth)}</Text>

            {purchases.length === 0 ? (
              <EmptyState
                icon="calendar-blank"
                title="No Purchases Recorded"
                description={`No milk purchases recorded for ${getMonthName(selectedMonth)} ${selectedYear}.`}
              />
            ) : (
              purchases.map((p) => (
                <Card key={p.id} style={styles.recordCard}>
                  <Card.Content style={styles.recordContent}>
                    <View style={styles.recordLeft}>
                      <Text style={styles.recordDate}>{formatDisplayDate(p.purchaseDate)}</Text>
                      <Text style={styles.recordSession}>
                        {p.session === 'morning' ? '🌅 Morning' : '🌇 Evening'} • {p.quantityLiters} L @ ₹{p.pricePerLiter}/L
                      </Text>
                    </View>
                    <View style={styles.recordRight}>
                      <Text style={styles.recordAmount}>₹{p.totalAmount}</Text>
                      <View style={styles.actionIcons}>
                        <IconButton
                          icon="pencil"
                          size={16}
                          iconColor={BrandColors.primary}
                          onPress={() => handleOpenEdit(p)}
                        />
                        <IconButton
                          icon="delete"
                          size={16}
                          iconColor={BrandColors.danger}
                          onPress={() => handleDelete(p)}
                        />
                      </View>
                    </View>
                  </Card.Content>
                </Card>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Edit Purchase Modal */}
      <Portal>
        <Modal
          visible={editModalVisible}
          onDismiss={() => setEditModalVisible(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Text style={styles.modalTitle}>Edit Milk Purchase</Text>
          <Text style={styles.modalSubtitle}>
            {editingPurchase?.session === 'morning' ? '🌅 Morning' : '🌇 Evening'} on{' '}
            {editingPurchase ? formatDisplayDate(editingPurchase.purchaseDate) : ''}
          </Text>

          {editError ? (
            <HelperText type="error" visible style={styles.helperText}>
              {editError}
            </HelperText>
          ) : null}

          <TextInput
            label="Milk Quantity in Liters *"
            value={editQtyStr}
            onChangeText={(t) => {
              setEditQtyStr(t);
              setEditError('');
            }}
            mode="outlined"
            keyboardType="decimal-pad"
            style={styles.input}
            right={<TextInput.Affix text="Liters" />}
          />

          <TextInput
            label="Price Per Liter *"
            value={editPriceStr}
            onChangeText={(t) => {
              setEditPriceStr(t);
              setEditError('');
            }}
            mode="outlined"
            keyboardType="decimal-pad"
            style={styles.input}
            right={<TextInput.Affix text="₹/L" />}
          />

          <View style={styles.calcBox}>
            <Text style={styles.calcLabel}>Updated Total Amount:</Text>
            <Text style={styles.calcValue}>
              ₹{Number(((parseFloat(editQtyStr) || 0) * (parseFloat(editPriceStr) || 0)).toFixed(2))}
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
              onPress={handleSaveEdit}
              loading={savingEdit}
              disabled={savingEdit}
              buttonColor={BrandColors.primaryDark}
            >
              Save Changes
            </Button>
          </View>
        </Modal>
      </Portal>
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
    marginBottom: 14,
  },
  selectorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 14,
    elevation: 2,
    borderColor: BrandColors.borderLight,
    borderWidth: 1,
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  selectorCenter: {
    alignItems: 'center',
  },
  selectorLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    color: BrandColors.neutralGray,
    fontWeight: '700',
  },
  selectorValue: {
    fontSize: 16,
    fontWeight: '800',
    color: BrandColors.textLight,
    marginTop: 2,
  },
  pdfCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 14,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  pdfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  pdfHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  pdfBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pdfBtn: {
    flex: 1,
    borderRadius: 8,
  },
  sessionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sessionBadge: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  sessionStatus: {
    fontSize: 11,
    color: BrandColors.neutralGray,
  },
  actionIcons: {
    flexDirection: 'row',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: BrandColors.backgroundLight,
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  metricCol: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    fontWeight: '600',
  },
  metricVal: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.textLight,
    marginTop: 2,
  },
  noEntryText: {
    fontSize: 13,
    color: BrandColors.neutralGray,
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: 6,
    marginBottom: 14,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.primaryDark + '30',
  },
  summaryTitle: {
    fontSize: 15,
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
    marginVertical: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: BrandColors.neutralGray,
  },
  summaryVal: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  monthListHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.textLight,
    marginBottom: 8,
  },
  recordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  recordContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordLeft: {
    flex: 1,
  },
  recordDate: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  recordSession: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  recordRight: {
    alignItems: 'flex-end',
  },
  recordAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.primaryDark,
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
  input: {
    marginBottom: 12,
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
