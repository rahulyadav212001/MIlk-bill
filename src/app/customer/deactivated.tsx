import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Button,
  Card,
  Divider,
  Searchbar,
  Text,
} from 'react-native-paper';
import { EmptyState } from '../../components/EmptyState';
import { HeaderBar } from '../../components/HeaderBar';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { BrandColors } from '../../constants/theme';
import {
  getDeactivatedCustomers,
  reactivateCustomer,
} from '../../services/customerService';
import { Customer } from '../../types';
import { formatDisplayDate } from '../../utils/date';
import { makePhoneCall } from '../../utils/phone';

export default function DeactivatedCustomersScreen() {
  const router = useRouter();

  const [deactivatedCustomers, setDeactivatedCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const list = await getDeactivatedCustomers();
      setDeactivatedCustomers(list);
    } catch (err) {
      console.error('Failed to load deactivated customers:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return deactivatedCustomers;
    const q = searchQuery.toLowerCase().trim();
    return deactivatedCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.location && c.location.toLowerCase().includes(q))
    );
  }, [deactivatedCustomers, searchQuery]);

  const handlePromptReactivate = (customer: Customer) => {
    Alert.alert(
      'Reactivate Customer Account',
      `Do you want to reactivate ${customer.name}'s account?\n\nThis will restore the customer to the active customer list and daily delivery schedules.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reactivate',
          onPress: async () => {
            setReactivatingId(customer.id);
            try {
              await reactivateCustomer(customer.id);
              Alert.alert('Success', `${customer.name}'s account has been reactivated.`);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to reactivate customer.');
            } finally {
              setReactivatingId(null);
            }
          },
        },
      ]
    );
  };

  const renderCustomerItem = ({ item }: { item: Customer }) => {
    const isPending = (item.finalOutstandingAmount || 0) > 0;

    return (
      <Card style={styles.card}>
        <Card.Content>
          {/* Header Row: Customer Name & Deactivated Badge */}
          <View style={styles.cardHeader}>
            <View style={styles.custInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.custName}>{item.name}</Text>
                <View style={styles.deactivatedBadge}>
                  <Text style={styles.deactivatedBadgeText}>Closed</Text>
                </View>
              </View>

              <View style={styles.custMetaRow}>
                <TouchableOpacity
                  onPress={() => makePhoneCall(item.phone)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  style={styles.phoneTouch}
                >
                  <Text style={styles.phoneText}>📞 {item.phone}</Text>
                </TouchableOpacity>
                {item.location ? (
                  <View style={styles.locationContainer}>
                    <Text style={styles.metaSeparator}>•</Text>
                    <Text style={styles.locationText} numberOfLines={1}>
                      📍 {item.location}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {/* Customer Milk Specifications */}
          <View style={styles.customerSpecsBox}>
            <View style={styles.specLine}>
              <Text style={styles.specText}>
                Category:{' '}
                <Text style={styles.boldText}>
                  {item.milkCategory === 'cow' ? '🐄 Cow Milk' : '🐃 Buffalo Milk'}
                </Text>
              </Text>
              <Text style={styles.specSeparator}>•</Text>
              <Text style={styles.specText}>
                Rate:{' '}
                <Text style={styles.boldText}>₹{item.pricePerLiter}/L</Text>
              </Text>
            </View>

            <View style={styles.specLine}>
              <Text style={styles.specText}>
                Joined:{' '}
                <Text style={styles.boldText}>
                  {formatDisplayDate(item.deliveryStartDate)}
                </Text>
              </Text>
              <Text style={styles.specSeparator}>•</Text>
              <Text style={styles.specText}>
                Closed:{' '}
                <Text style={styles.boldText}>
                  {item.closingDate ? formatDisplayDate(item.closingDate) : 'N/A'}
                </Text>
              </Text>
            </View>

            {item.billingPeriodStart ? (
              <View style={styles.specLine}>
                <Text style={styles.specText}>
                  Final Cycle:{' '}
                  <Text style={styles.boldText}>
                    {formatDisplayDate(item.billingPeriodStart)} to {formatDisplayDate(item.billingPeriodEnd || item.closingDate || '')}
                  </Text>
                </Text>
              </View>
            ) : null}
          </View>

          <Divider style={styles.divider} />

          {/* Financial Closing Summary Box */}
          <View style={styles.financialBox}>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Final Bill Amount:</Text>
              <Text style={styles.financialValue}>
                ₹{item.finalBillAmount !== undefined ? item.finalBillAmount : '0'}
              </Text>
            </View>

            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Outstanding Balance:</Text>
              <View
                style={[
                  styles.balanceBadge,
                  isPending ? styles.balanceBadgePending : styles.balanceBadgePaid,
                ]}
              >
                <Text
                  style={[
                    styles.balanceBadgeText,
                    isPending ? styles.balanceTextPending : styles.balanceTextPaid,
                  ]}
                >
                  {isPending ? `Pending ₹${item.finalOutstandingAmount}` : 'Fully Paid (₹0)'}
                </Text>
              </View>
            </View>
          </View>

          <Divider style={styles.divider} />

          {/* Card Actions: View History, Payment & Reactivate */}
          <View style={styles.actionRow}>
            <Button
              mode="contained"
              icon="cash-multiple"
              compact
              onPress={() =>
                router.push({
                  pathname: '/customer/[id]/payment',
                  params: { id: item.id },
                } as any)
              }
              style={styles.paymentBtn}
              buttonColor={BrandColors.success}
            >
              Collect Payment
            </Button>

            <Button
              mode="outlined"
              icon="history"
              compact
              onPress={() =>
                router.push({
                  pathname: '/customer/[id]/history',
                  params: { id: item.id },
                } as any)
              }
              style={styles.historyBtn}
              textColor={BrandColors.primaryDark}
            >
              History
            </Button>

            <Button
              mode="outlined"
              icon="account-check-outline"
              compact
              loading={reactivatingId === item.id}
              disabled={reactivatingId === item.id}
              onPress={() => handlePromptReactivate(item)}
              style={styles.reactivateBtn}
              textColor={BrandColors.primary}
            >
              Reactivate
            </Button>
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <HeaderBar
        title="Deactivated Customers"
        subtitle={`${deactivatedCustomers.length} Closed Accounts`}
        showBack={true}
      />

      <Searchbar
        placeholder="Search closed accounts by name or phone..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchBar}
        inputStyle={styles.searchInput}
        clearIcon={searchQuery ? 'close-circle' : undefined}
        onClearIconPress={() => setSearchQuery('')}
      />

      {loading ? (
        <LoadingIndicator message="Loading closed customer accounts..." />
      ) : filteredCustomers.length === 0 ? (
        <EmptyState
          icon="account-check-outline"
          title="No Deactivated Customers"
          message={
            searchQuery
              ? 'No closed accounts match your search filter.'
              : 'All registered customer accounts are active and receiving milk.'
          }
        />
      ) : (
        <FlatList
          data={filteredCustomers}
          keyExtractor={(item) => item.id}
          renderItem={renderCustomerItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  searchBar: {
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    elevation: 2,
    height: 46,
  },
  searchInput: {
    fontSize: 14,
    minHeight: 46,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 24,
  },
  card: {
    marginVertical: 6,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  custInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  custName: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  deactivatedBadge: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  deactivatedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: BrandColors.danger,
  },
  custMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  phoneTouch: {
    paddingVertical: 2,
  },
  phoneText: {
    fontSize: 13,
    color: BrandColors.primaryDark,
    fontWeight: '600',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  metaSeparator: {
    marginHorizontal: 6,
    color: '#94A3B8',
    fontSize: 12,
  },
  locationText: {
    fontSize: 12,
    color: '#64748B',
    flexShrink: 1,
  },
  customerSpecsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
  },
  specLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  specText: {
    fontSize: 12,
    color: '#64748B',
  },
  boldText: {
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  specSeparator: {
    marginHorizontal: 8,
    color: '#CBD5E1',
    fontSize: 12,
  },
  divider: {
    marginVertical: 8,
    backgroundColor: '#F1F5F9',
  },
  financialBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 10,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 3,
  },
  financialLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  financialValue: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  balanceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  balanceBadgePending: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  balanceBadgePaid: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  balanceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  balanceTextPending: {
    color: '#D97706',
  },
  balanceTextPaid: {
    color: BrandColors.success,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  paymentBtn: {
    flex: 1.2,
    borderRadius: 8,
  },
  historyBtn: {
    flex: 0.9,
    borderRadius: 8,
    borderColor: BrandColors.borderLight,
  },
  reactivateBtn: {
    flex: 1,
    borderRadius: 8,
    borderColor: BrandColors.primary,
  },
});
