import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BrandColors } from '../constants/theme';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  subtitle?: string;
  color?: string;
  bgColor?: string;
  onPress?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  icon,
  subtitle,
  color = BrandColors.primary,
  bgColor = '#FFFFFF',
  onPress,
}) => {
  return (
    <Card style={[styles.card, { backgroundColor: bgColor }]} onPress={onPress}>
      <Card.Content style={styles.content}>
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.value, { color }]} numberOfLines={1}>
            {value}
          </Text>
          {subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        <View style={[styles.iconContainer, { backgroundColor: color + '18' }]}>
          <MaterialCommunityIcons name={icon} size={28} color={color} />
        </View>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    elevation: 2,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 13,
    color: BrandColors.textSecondaryLight,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 11,
    color: BrandColors.neutralGray,
    marginTop: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

