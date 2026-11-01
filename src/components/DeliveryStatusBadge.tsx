import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { DeliveryStatus } from '../types';
import { BrandColors } from '../constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  status: DeliveryStatus;
  size?: 'small' | 'medium';
}

export const DeliveryStatusBadge: React.FC<Props> = ({ status, size = 'medium' }) => {
  let label = 'Normal Delivery';
  let color = BrandColors.success;
  let bg = BrandColors.successLight;
  let icon: keyof typeof MaterialCommunityIcons.glyphMap = 'check-circle';

  if (status === 'customer_holiday') {
    label = 'Customer Holiday';
    color = '#D97706';
    bg = BrandColors.accentLight;
    icon = 'account-cancel';
  } else if (status === 'supplier_holiday') {
    label = 'Supplier Holiday';
    color = BrandColors.danger;
    bg = BrandColors.dangerLight;
    icon = 'store-off';
  }

  const isSmall = size === 'small';

  return (
    <View style={[styles.badge, { backgroundColor: bg }, isSmall && styles.badgeSmall]}>
      <MaterialCommunityIcons name={icon} size={isSmall ? 12 : 15} color={color} />
      <Text style={[styles.text, { color }, isSmall && styles.textSmall]}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    gap: 4,
  },
  badgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
  textSmall: {
    fontSize: 10,
    fontWeight: '600',
  },
});

