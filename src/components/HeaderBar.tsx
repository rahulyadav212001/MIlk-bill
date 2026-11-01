import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Appbar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { BrandColors } from '../constants/theme';

interface HeaderBarProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  showLogo?: boolean;
  onSettingsPress?: () => void;
  actions?: {
    icon: string;
    onPress: () => void;
  }[];
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  title,
  subtitle,
  showBack = false,
  showLogo = true,
  onSettingsPress,
  actions = [],
}) => {
  const router = useRouter();

  return (
    <Appbar.Header style={styles.header} elevated>
      {showBack ? (
        <Appbar.BackAction
          color="#FFFFFF"
          onPress={() => router.back()}
        />
      ) : showLogo ? (
        <View style={styles.logoBadge}>
          <Image
            source={require('../../assets/images/milk-bill-icon-white.png')}
            style={styles.logoImg}
            contentFit="contain"
          />
        </View>
      ) : null}
      <Appbar.Content
        title={title}
        subtitle={subtitle}
        titleStyle={styles.title}
        subtitleStyle={styles.subtitle}
      />
      {actions.map((act, idx) => (
        <Appbar.Action
          key={idx}
          icon={act.icon}
          color="#FFFFFF"
          onPress={act.onPress}
        />
      ))}
      {onSettingsPress && (
        <Appbar.Action
          icon="cog-outline"
          color="#FFFFFF"
          size={22}
          onPress={onSettingsPress}
        />
      )}
    </Appbar.Header>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: BrandColors.primaryDark,
  },
  logoBadge: {
    marginLeft: 12,
    marginRight: 2,
    width: 30,
    height: 30,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  logoImg: {
    width: 24,
    height: 24,
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 18,
  },
  subtitle: {
    color: BrandColors.primaryLight,
    fontSize: 12,
  },
});
