import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { BrandColors } from '../constants/theme';

interface Props {
  message?: string;
}

export const LoadingIndicator: React.FC<Props> = ({ message = 'Loading...' }) => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={BrandColors.primary} />
      {message ? <Text style={styles.text}>{message}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  text: {
    marginTop: 12,
    fontSize: 14,
    color: BrandColors.textSecondaryLight,
    fontWeight: '500',
  },
});

