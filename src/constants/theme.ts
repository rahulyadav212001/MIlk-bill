import { MD3LightTheme } from 'react-native-paper';

export const BrandColors = {
  primary: '#1E88E5', // Dairy blue
  primaryDark: '#1565C0',
  primaryLight: '#E3F2FD',
  secondary: '#00897B', // Teal
  secondaryLight: '#E0F2F1',
  accent: '#F59E0B', // Amber
  accentLight: '#FEF3C7',
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
  success: '#10B981',
  successLight: '#D1FAE5',
  neutralGray: '#64748B',
  surfaceLight: '#FFFFFF',
  backgroundLight: '#F8FAFC',
  borderLight: '#E2E8F0',
  textLight: '#0F172A',
  textSecondaryLight: '#64748B',
};

export const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: BrandColors.primary,
    onPrimary: '#FFFFFF',
    primaryContainer: BrandColors.primaryLight,
    onPrimaryContainer: BrandColors.primaryDark,
    secondary: BrandColors.secondary,
    secondaryContainer: BrandColors.secondaryLight,
    background: BrandColors.backgroundLight,
    surface: BrandColors.surfaceLight,
    error: BrandColors.danger,
    outline: BrandColors.borderLight,
  },
};
