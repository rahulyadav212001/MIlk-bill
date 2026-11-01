import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BrandColors } from '../constants/theme';

interface EmptyStateProps {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  message?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'clipboard-text-outline',
  title,
  message,
  description,
  actionLabel,
  onAction,
}) => {
  const displayMessage = message || description || '';
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <MaterialCommunityIcons name={icon} size={48} color={BrandColors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{displayMessage}</Text>
      {actionLabel && onAction && (
        <Button mode="contained" onPress={onAction} style={styles.button}>
          {actionLabel}
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginVertical: 24,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: BrandColors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.textLight,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: BrandColors.textSecondaryLight,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    maxWidth: 280,
  },
  button: {
    backgroundColor: BrandColors.primary,
    borderRadius: 8,
  },
});

