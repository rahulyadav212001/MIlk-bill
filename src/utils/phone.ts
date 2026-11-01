import { Alert, Linking } from 'react-native';

/**
 * Opens the device's default phone dialer with the phone number prefilled.
 */
export function makePhoneCall(phone?: string): void {
  if (!phone) return;
  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  if (!cleanPhone) return;

  Linking.openURL(`tel:${cleanPhone}`).catch((err) => {
    console.warn('Could not open phone dialer:', err);
    Alert.alert('Notice', `Unable to open phone dialer for ${phone}`);
  });
}

