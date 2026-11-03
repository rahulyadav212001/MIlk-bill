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
  Searchbar,
  Divider,
} from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { HeaderBar } from '../../components/HeaderBar';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { EmptyState } from '../../components/EmptyState';
import { BrandColors } from '../../constants/theme';
import {
  getMonthlyPaymentDashboard,
  recordPaymentDone,
} from '../../services/paymentService';
import {
  CustomerPaymentSummary,
  PaymentDashboardOverview,
} from '../../types';
import {
  getCurrentMonthAndYear,
  getMonthName,
} from '../../utils/date';
import { makePhoneCall } from '../../utils/phone';

type FilterType = 'all' | 'paid' | 'due' | 'partially_paid' | 'deactivated';

export default function PaymentsScreen() {
  const router = useRouter();

  // Current Month & Year State
  const { month: currMonth, year: currYear } = getCurrentMonthAndYear();
  const [selectedMonth, setSelectedMonth] = useState<number>(currMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currYear);

  // Data State
  const [overview, setOverview] = useState<PaymentDashboardOverview | null>(null);
  const [customers, setCustomers] = useState<CustomerPaymentSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

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

  // Load Dashboard Data
  const loadData = useCallback(async () => {
    try {
      const data = await getMonthlyPaymentDashboard(selectedMonth, selectedYear);
      setOverview(data.overview);
      setCustomers(data.customers);
    } catch (err) {
      console.error('Failed to load payment dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedMonth, selectedYear]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  // Quick Action: Settle full remaining payment
  const handleQuickPaymentDone = (item: CustomerPaymentSummary) => {
    if (item.remainingBalance <= 0) {
      Alert.alert('Already Settled', `${item.customer.name}'s bill is already completely paid (₹0 due).`);
      return;
    }

    Alert.alert(
      'Payment Done',
      `Mark ${item.customer.name}'s remaining bill of ₹${item.remainingBalance} as FULLY PAID for ${getMonthName(selectedMonth)} ${selectedYear}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Paid',
          onPress: async () => {
            setProcessingId(item.customer.id);
            try {
              await recordPaymentDone({
                customerId: item.customer.id,
                month: selectedMonth,
                year: selectedYear,
                note: `Full payment of ₹${item.remainingBalance} collected via Payments Tab`,
              });
              Alert.alert('Success', `Recorded ₹${item.remainingBalance} payment for ${item.customer.name}.`);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to record payment.');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  };

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    return customers.filter((item) => {
      // 0. Ensure closed customers are never shown in any month strictly after their closing month
      if (item.isDeactivated) {
        const closingDateStr = item.customer.closingDate || item.customer.deliveryStopDate;
        let closeYear: number | undefined;
        let closeMonth: number | undefined;
        if (closingDateStr && typeof closingDateStr === 'string' && closingDateStr.includes('-')) {
          const parts = closingDateStr.split('-');
          closeYear = parseInt(parts[0], 10);
          closeMonth = parseInt(parts[1], 10);
        } else if (item.customer.deactivatedAt) {
          const d = new Date(item.customer.deactivatedAt);
          closeYear = d.getFullYear();
          closeMonth = d.getMonth() + 1;
        }

        if (closeYear !== undefined && closeMonth !== undefined && !isNaN(closeYear) && !isNaN(closeMonth)) {
          const closeMonthIndex = closeYear * 12 + closeMonth;
          const currentMonthIndex = selectedYear * 12 + selectedMonth;
          if (currentMonthIndex > closeMonthIndex) {
            return false;
          }
        }
      }

      // 1. Filter by category/status
      if (activeFilter === 'paid' && item.paymentStatus !== 'paid') return false;
      if (activeFilter === 'due' && item.paymentStatus !== 'due') return false;
      if (activeFilter === 'partially_paid' && item.paymentStatus !== 'partially_paid') return false;
      if (activeFilter === 'deactivated' && !item.isDeactivated) return false;

      // 2. Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.customer.name.toLowerCase().includes(q);
        const matchesPhone = item.customer.phone.includes(q);
        const matchesLoc = item.customer.location ? item.customer.location.toLowerCase().includes(q) : false;
        if (!matchesName && !matchesPhone && !matchesLoc) return false;
      }

      return true;
    });
  }, [customers, activeFilter, searchQuery, selectedMonth, selectedYear]);

  return (
    <View style={styles.container}>
      <HeaderBar
        title="Payment Management"
        subtitle={`${getMonthName(selectedMonth)} ${selectedYear} • Monthly Tracking & Collections`}
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
        {/* Month Selector Bar */}
        <Card style={styles.monthSelectorCard}>
          <Card.Content style={styles.monthSelectorContent}>
            <IconButton
              icon="chevron-left"
              size={24}
              iconColor={BrandColors.primaryDark}
              onPress={handlePrevMonth}
            />
            <View style={styles.monthDisplay}>
              <Text style={styles.monthNameText}>
                {getMonthName(selectedMonth)} {selectedYear}
              </Text>
              <Text style={styles.monthSubText}>Billing & Payment Cycle</Text>
            </View>
            <IconButton
              icon="chevron-right"
              size={24}
              iconColor={BrandColors.primaryDark}
              onPress={handleNextMonth}
            />
          </Card.Content>
        </Card>

        {/* Dashboard Overview Cards */}
        {overview ? (
          <View style={styles.overviewContainer}>
            <View style={styles.overviewRow}>
              <Card style={[styles.overviewCard, { borderLeftColor: BrandColors.primaryDark }]}>
                <Card.Content style={styles.cardPadding}>
                  <Text style={styles.overviewLabel}>Total Monthly Bills</Text>
                  <Text style={[styles.overviewValue, { color: BrandColors.primaryDark }]}>
                    ₹{overview.totalMonthlyBills}
                  </Text>
                </Card.Content>
              </Card>

              <Card style={[styles.overviewCard, { borderLeftColor: BrandColors.success }]}>
                <Card.Content style={styles.cardPadding}>
                  <Text style={styles.overviewLabel}>Total Received</Text>
                  <Text style={[styles.overviewValue, { color: BrandColors.success }]}>
                    ₹{overview.totalAmountReceived}
                  </Text>
                </Card.Content>
              </Card>
            </View>

            <View style={styles.overviewRow}>
              <Card style={[styles.overviewCard, { borderLeftColor: BrandColors.danger }]}>
                <Card.Content style={styles.cardPadding}>
                  <Text style={styles.overviewLabel}>Total Outstanding</Text>
                  <Text style={[styles.overviewValue, { color: BrandColors.danger }]}>
                    ₹{overview.totalOutstandingAmount}
                  </Text>
                </Card.Content>
              </Card>

              <Card style={[styles.overviewCard, { borderLeftColor: '#6366F1' }]}>
                <Card.Content style={styles.cardPadding}>
                  <Text style={styles.overviewLabel}>Paid vs Due Customers</Text>
                  <View style={styles.customerCountsRow}>
                    <Text style={[styles.overviewSubValue, { color: BrandColors.success }]}>
                      {overview.paidCustomersCount} Paid
                    </Text>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={[styles.overviewSubValue, { color: BrandColors.danger }]}>
                      {overview.dueCustomersCount} Due
                    </Text>
                  </View>
                </Card.Content>
              </Card>
            </View>
          </View>
        ) : null}

        {/* Search Bar */}
        <Searchbar
          placeholder="Search by customer name, phone, or area..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          clearIcon={searchQuery ? 'close-circle' : undefined}
          onClearIconPress={() => setSearchQuery('')}
        />

        {/* Filter Chips Horizontal Scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'all' && styles.filterChipActive]}
            onPress={() => setActiveFilter('all')}
          >
            <Text style={[styles.filterText, activeFilter === 'all' && styles.filterTextActive]}>
              All ({customers.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'due' && styles.filterChipActive]}
            onPress={() => setActiveFilter('due')}
          >
            <Text style={[styles.filterText, activeFilter === 'due' && styles.filterTextActive]}>
              Due ({customers.filter((c) => c.paymentStatus === 'due').length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'partially_paid' && styles.filterChipActive]}
            onPress={() => setActiveFilter('partially_paid')}
          >
            <Text style={[styles.filterText, activeFilter === 'partially_paid' && styles.filterTextActive]}>
              Partially Paid ({customers.filter((c) => c.paymentStatus === 'partially_paid').length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'paid' && styles.filterChipActive]}
            onPress={() => setActiveFilter('paid')}
          >
            <Text style={[styles.filterText, activeFilter === 'paid' && styles.filterTextActive]}>
              Paid ({customers.filter((c) => c.paymentStatus === 'paid').length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'deactivated' && styles.filterChipActive]}
            onPress={() => setActiveFilter('deactivated')}
          >
            <Text style={[styles.filterText, activeFilter === 'deactivated' && styles.filterTextActive]}>
              Deactivated ({customers.filter((c) => c.isDeactivated).length})
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Customer Payment List Header */}
        <View style={styles.listHeaderRow}>
          <Text style={styles.listHeaderText}>
            Customer Accounts ({filteredCustomers.length})
          </Text>
          <Text style={styles.listHeaderSub}>
            Tap a customer to open monthly calendar & billing
          </Text>
        </View>

        {/* Customer Payment Cards */}
        {loading ? (
          <LoadingIndicator message="Loading monthly customer payments..." />
        ) : filteredCustomers.length === 0 ? (
          <EmptyState
            icon="cash-check"
            title="No Customers Found"
            message={
              searchQuery
                ? 'No customer records match your search filter.'
                : 'No customer billing records found for this period.'
            }
          />
        ) : (
          filteredCustomers.map((item) => {
            const hasDue = item.remainingBalance > 0;
            const statusColor =
              item.paymentStatus === 'paid'
                ? BrandColors.success
                : item.paymentStatus === 'partially_paid'
                ? '#D97706'
                : BrandColors.danger;

            const statusBg =
              item.paymentStatus === 'paid'
                ? '#ECFDF5'
                : item.paymentStatus === 'partially_paid'
                ? '#FEF3C7'
                : '#FEE2E2';

            const statusLabel =
              item.paymentStatus === 'paid'
                ? 'Paid'
                : item.paymentStatus === 'partially_paid'
                ? 'Partially Paid'
                : 'Due';

            return (
              <Card
                key={item.customer.id}
                style={[
                  styles.customerCard,
                  item.isDeactivated && styles.customerCardDeactivated,
                ]}
                onPress={() =>
                  router.push({
                    pathname: '/customer/[id]/payment',
                    params: {
                      id: item.customer.id,
                      month: selectedMonth.toString(),
                      year: selectedYear.toString(),
                    },
                  } as any)
                }
              >
                <Card.Content>
                  {/* Top Row: Name, Status & Deactivated Badge */}
                  <View style={styles.custTopRow}>
                    <View style={styles.nameBlock}>
                      <View style={styles.nameBadgeRow}>
                        <Text style={styles.custName} numberOfLines={1}>
                          {item.customer.name}
                        </Text>
                        {item.isDeactivated ? (
                          <View style={styles.deactivatedPill}>
                            <Text style={styles.deactivatedPillText}>Closed</Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.contactRow}>
                        <TouchableOpacity
                          onPress={() => makePhoneCall(item.customer.phone)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.phoneText}>📞 {item.customer.phone}</Text>
                        </TouchableOpacity>
                        {item.customer.location ? (
                          <>
                            <Text style={styles.metaDot}>•</Text>
                            <Text style={styles.locText} numberOfLines={1}>
                              📍 {item.customer.location}
                            </Text>
                          </>
                        ) : null}
                      </View>
                    </View>

                    <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                      <Text style={[styles.statusText, { color: statusColor }]}>
                        {statusLabel}
                      </Text>
                    </View>
                  </View>

                  <Divider style={styles.cardDivider} />

                  {/* Financial Breakdown Row */}
                  <View style={styles.financialRow}>
                    <View style={styles.finCol}>
                      <Text style={styles.finLabel}>Monthly Bill</Text>
                      <Text style={styles.finVal}>₹{item.milkAmount}</Text>
                      {item.previousBalance > 0 ? (
                        <Text style={styles.finPrevDue}>
                          + ₹{item.previousBalance} prev
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.finCol}>
                      <Text style={styles.finLabel}>Amount Paid</Text>
                      <Text style={[styles.finVal, { color: BrandColors.success }]}>
                        ₹{item.paidAmount}
                      </Text>
                    </View>

                    <View style={styles.finColRight}>
                      <Text style={styles.finLabel}>Remaining Due</Text>
                      <Text
                        style={[
                          styles.finValLarge,
                          { color: hasDue ? BrandColors.danger : BrandColors.success },
                        ]}
                      >
                        ₹{item.remainingBalance}
                      </Text>
                    </View>
                  </View>

                  {/* Expected Payment Date Banner (if promised) */}
                  {item.expectedPaymentDate && hasDue ? (
                    <View style={styles.promiseBanner}>
                      <Text style={styles.promiseText}>
                        ⏰ Promised Payment Date: {item.expectedPaymentDate}
                      </Text>
                    </View>
                  ) : null}

                  {/* Bottom Action Row */}
                  <View style={styles.actionRow}>
                    <Button
                      mode="outlined"
                      icon="calendar-month-outline"
                      compact
                      style={styles.viewCalBtn}
                      textColor={BrandColors.primaryDark}
                      onPress={() =>
                        router.push({
                          pathname: '/customer/[id]/payment',
                          params: {
                            id: item.customer.id,
                            month: selectedMonth.toString(),
                            year: selectedYear.toString(),
                          },
                        } as any)
                      }
                    >
                      Calendar & Details
                    </Button>

                    {hasDue ? (
                      <Button
                        mode="contained"
                        icon="check-circle-outline"
                        compact
                        loading={processingId === item.customer.id}
                        disabled={processingId === item.customer.id}
                        buttonColor={BrandColors.success}
                        style={styles.payDoneBtn}
                        onPress={() => handleQuickPaymentDone(item)}
                      >
                        Payment Done
                      </Button>
                    ) : (
                      <View style={styles.settledBadge}>
                        <Text style={styles.settledText}>✓ Bill Settled</Text>
                      </View>
                    )}
                  </View>
                </Card.Content>
              </Card>
            );
          })
        )}
      </ScrollView>
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
  monthSelectorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  monthSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  monthDisplay: {
    alignItems: 'center',
  },
  monthNameText: {
    fontSize: 17,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  monthSubText: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    fontWeight: '600',
    marginTop: 2,
  },
  overviewContainer: {
    marginBottom: 12,
    gap: 8,
  },
  overviewRow: {
    flexDirection: 'row',
    gap: 8,
  },
  overviewCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    elevation: 1,
    borderLeftWidth: 4,
  },
  cardPadding: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  overviewLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: BrandColors.neutralGray,
    textTransform: 'uppercase',
  },
  overviewValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  customerCountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  overviewSubValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  metaDot: {
    marginHorizontal: 6,
    color: BrandColors.neutralGray,
  },
  searchBar: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 10,
    elevation: 1,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  searchInput: {
    fontSize: 14,
  },
  filterScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  filterChipActive: {
    backgroundColor: BrandColors.primaryDark,
    borderColor: BrandColors.primaryDark,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.neutralGray,
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  listHeaderRow: {
    marginVertical: 6,
  },
  listHeaderText: {
    fontSize: 14,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  listHeaderSub: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  customerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  customerCardDeactivated: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
  },
  custTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nameBlock: {
    flex: 1,
    marginRight: 8,
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  custName: {
    fontSize: 16,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  deactivatedPill: {
    backgroundColor: '#F3E8FF',
    borderColor: '#D8B4FE',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  deactivatedPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7E22CE',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  phoneText: {
    fontSize: 12,
    color: BrandColors.primary,
    fontWeight: '600',
  },
  locText: {
    fontSize: 12,
    color: BrandColors.neutralGray,
    flexShrink: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  cardDivider: {
    marginVertical: 10,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  finCol: {
    flex: 1,
  },
  finColRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  finLabel: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    fontWeight: '600',
  },
  finVal: {
    fontSize: 14,
    fontWeight: '800',
    color: BrandColors.textLight,
    marginTop: 2,
  },
  finPrevDue: {
    fontSize: 10,
    color: '#D97706',
    fontWeight: '700',
    marginTop: 1,
  },
  finValLarge: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  promiseBanner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 6,
    padding: 6,
    marginTop: 8,
  },
  promiseText: {
    fontSize: 11,
    color: '#B45309',
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  viewCalBtn: {
    flex: 1,
    borderColor: BrandColors.borderLight,
  },
  payDoneBtn: {
    flex: 1,
  },
  settledBadge: {
    flex: 1,
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  settledText: {
    fontSize: 12,
    fontWeight: '800',
    color: BrandColors.success,
  },
});
