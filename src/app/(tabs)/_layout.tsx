import React from 'react';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BrandColors } from '../../constants/theme';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  // Elevate buttons upward to safely clear the system gesture bar across all phone screen sizes
  const safeBottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 24);
  const tabHeight = 62 + safeBottomInset;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BrandColors.primaryDark,
        tabBarInactiveTintColor: BrandColors.neutralGray,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: BrandColors.borderLight,
          borderTopWidth: 1,
          height: tabHeight,
          paddingBottom: safeBottomInset + 4,
          paddingTop: 8,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="supplier"
        options={{
          title: 'Supply',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="truck-delivery-outline" size={size} color={color as any} />
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Customer',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-group-outline" size={size} color={color as any} />
          ),
        }}
      />
    </Tabs>
  );
}
