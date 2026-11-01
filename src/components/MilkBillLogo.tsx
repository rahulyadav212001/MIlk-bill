import React from 'react';
import { View, StyleSheet, Text, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { BrandColors } from '../constants/theme';

export interface MilkBillLogoProps {
  variant?: 'vertical' | 'horizontal' | 'icon' | 'badge';
  size?: 'small' | 'medium' | 'large';
  colorTheme?: 'light' | 'dark';
  style?: ViewStyle;
  showSubtitle?: boolean;
}

export const MilkBillLogo: React.FC<MilkBillLogoProps> = ({
  variant = 'vertical',
  size = 'medium',
  colorTheme = 'light',
  style,
  showSubtitle = true,
}) => {
  const isDark = colorTheme === 'dark';

  if (variant === 'icon') {
    const iconDim = size === 'small' ? 36 : size === 'large' ? 96 : 56;
    return (
      <View style={[styles.iconContainer, style]}>
        <Image
          source={require('../../assets/images/icon.png')}
          style={{ width: iconDim, height: iconDim, borderRadius: iconDim * 0.22 }}
          contentFit="contain"
          transition={200}
        />
      </View>
    );
  }

  if (variant === 'badge') {
    const badgeDim = size === 'small' ? 32 : size === 'large' ? 64 : 44;
    return (
      <View style={[styles.badgeRow, style]}>
        <Image
          source={require('../../assets/images/icon.png')}
          style={{ width: badgeDim, height: badgeDim, borderRadius: badgeDim * 0.22 }}
          contentFit="contain"
        />
        <View style={styles.badgeTextCol}>
          <Text style={[styles.badgeTitle, isDark && styles.textWhite]}>
            Milk<Text style={styles.textPrimary}> Bill</Text>
          </Text>
          {showSubtitle && (
            <Text style={[styles.badgeSubtitle, isDark && styles.textMutedDark]}>
              Dairy Management
            </Text>
          )}
        </View>
      </View>
    );
  }

  if (variant === 'horizontal') {
    const logoWidth = size === 'small' ? 140 : size === 'large' ? 260 : 200;
    const logoHeight = logoWidth * 0.5625; // 16:9 ratio
    return (
      <View style={[styles.horizontalContainer, style]}>
        <Image
          source={require('../../assets/images/milk-bill-logo-horizontal.png')}
          style={{ width: logoWidth, height: logoHeight }}
          contentFit="contain"
          transition={200}
        />
      </View>
    );
  }

  // Default: 'vertical' stacked lockup
  const vertWidth = size === 'small' ? 120 : size === 'large' ? 240 : 180;
  const vertHeight = vertWidth; // 1:1 ratio
  return (
    <View style={[styles.verticalContainer, style]}>
      <Image
        source={require('../../assets/images/milk-bill-logo-vertical.png')}
        style={{ width: vertWidth, height: vertHeight }}
        contentFit="contain"
        transition={200}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  verticalContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  horizontalContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badgeTextCol: {
    justifyContent: 'center',
  },
  badgeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  badgeSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  textPrimary: {
    color: BrandColors.primaryDark,
  },
  textWhite: {
    color: '#FFFFFF',
  },
  textMutedDark: {
    color: '#94A3B8',
  },
});

export default MilkBillLogo;

