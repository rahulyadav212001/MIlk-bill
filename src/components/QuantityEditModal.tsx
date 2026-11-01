import React, { useState } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { Modal, Portal, Text, Button, TextInput, Chip, IconButton, HelperText } from 'react-native-paper';
import { Delivery } from '../types';
import { BrandColors } from '../constants/theme';
import { formatDisplayDate } from '../utils/date';

interface Props {
  visible: boolean;
  delivery: Delivery | null;
  customerName: string;
  onDismiss: () => void;
  onSave: (deliveryId: string, newQuantity: number) => Promise<void>;
}

const PRESET_QUANTITIES = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3];

interface ModalContentProps {
  delivery: Delivery;
  customerName: string;
  onDismiss: () => void;
  onSave: (deliveryId: string, newQuantity: number) => Promise<void>;
}

const QuantityEditModalContent: React.FC<ModalContentProps> = ({
  delivery,
  customerName,
  onDismiss,
  onSave,
}) => {
  const [quantityStr, setQuantityStr] = useState<string>(delivery.actualQuantity.toString());
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const numericQty = parseFloat(quantityStr) || 0;
  const calculatedAmount = Number((Math.max(0, numericQty) * delivery.pricePerLiter).toFixed(2));

  const handlePreset = (preset: number) => {
    setQuantityStr(preset.toString());
    setError('');
  };

  const handleStep = (delta: number) => {
    const current = parseFloat(quantityStr) || 0;
    const next = Math.max(0, current + delta);
    setQuantityStr(next.toFixed(2).replace(/\.?0+$/, ''));
    setError('');
  };

  const handleSave = async () => {
    const qty = parseFloat(quantityStr);
    if (isNaN(qty) || qty < 0) {
      setError('Please enter a valid quantity of 0 or greater.');
      return;
    }

    setSaving(true);
    try {
      await onSave(delivery.id, qty);
      onDismiss();
    } catch (err: any) {
      setError(err?.message || 'Failed to update delivery quantity.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.modalTitle}>Edit Milk Delivery</Text>

      {/* Customer & Date Info */}
      <View style={styles.infoBox}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Customer:</Text>
          <Text style={styles.infoValue}>{customerName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Date:</Text>
          <Text style={styles.infoValue}>{formatDisplayDate(delivery.deliveryDate || delivery.date || '')}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Rate:</Text>
          <Text style={styles.infoValue}>₹{delivery.pricePerLiter} / Liter</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Default Quantity:</Text>
          <Text style={styles.infoValue}>{delivery.defaultQuantity} L</Text>
        </View>
      </View>

      {/* Quick Preset Buttons */}
      <Text style={styles.sectionLabel}>Quick Presets</Text>
      <View style={styles.presetsContainer}>
        {PRESET_QUANTITIES.map((val) => {
          const isSelected = numericQty === val;
          return (
            <Chip
              key={val}
              selected={isSelected}
              mode={isSelected ? 'flat' : 'outlined'}
              style={[styles.presetChip, isSelected && styles.presetChipSelected]}
              textStyle={isSelected ? styles.presetTextSelected : styles.presetText}
              onPress={() => handlePreset(val)}
            >
              {val} L
            </Chip>
          );
        })}
      </View>

      {/* Stepper & Input */}
      <Text style={styles.sectionLabel}>Actual Delivered Quantity (Liters)</Text>
      <View style={styles.stepperRow}>
        <IconButton
          icon="minus"
          mode="contained"
          containerColor={BrandColors.primaryLight}
          iconColor={BrandColors.primaryDark}
          size={24}
          onPress={() => handleStep(-0.25)}
        />
        <TextInput
          mode="outlined"
          value={quantityStr}
          onChangeText={(t) => {
            setQuantityStr(t);
            setError('');
          }}
          keyboardType="decimal-pad"
          style={styles.input}
          contentStyle={styles.inputContent}
        />
        <IconButton
          icon="plus"
          mode="contained"
          containerColor={BrandColors.primaryLight}
          iconColor={BrandColors.primaryDark}
          size={24}
          onPress={() => handleStep(0.25)}
        />
      </View>

      {error ? <HelperText type="error">{error}</HelperText> : null}

      {/* Automatically Calculated Amount */}
      <View style={styles.calculationBox}>
        <Text style={styles.calcFormula}>
          {numericQty} L × ₹{delivery.pricePerLiter}
        </Text>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Total Amount:</Text>
          <Text style={styles.amountHighlight}>₹{calculatedAmount}</Text>
        </View>
      </View>

      {/* Buttons */}
      <View style={styles.actionsRow}>
        <Button
          mode="outlined"
          onPress={onDismiss}
          style={styles.cancelBtn}
          textColor={BrandColors.neutralGray}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          mode="contained"
          onPress={handleSave}
          style={styles.saveBtn}
          loading={saving}
          disabled={saving}
        >
          Save Delivery
        </Button>
      </View>
    </ScrollView>
  );
};

export const QuantityEditModal: React.FC<Props> = ({
  visible,
  delivery,
  customerName,
  onDismiss,
  onSave,
}) => {
  return (
    <Portal>
      <Modal
        visible={visible && Boolean(delivery)}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modalContainer}
      >
        {delivery ? (
          <QuantityEditModalContent
            key={delivery.id}
            delivery={delivery}
            customerName={customerName}
            onDismiss={onDismiss}
            onSave={onSave}
          />
        ) : null}
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    borderRadius: 16,
    maxHeight: '90%',
    padding: 20,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: BrandColors.textLight,
    marginBottom: 16,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: BrandColors.backgroundLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BrandColors.borderLight,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  infoLabel: {
    fontSize: 13,
    color: BrandColors.textSecondaryLight,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.textLight,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.textSecondaryLight,
    marginBottom: 8,
  },
  presetsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  presetChip: {
    borderRadius: 8,
  },
  presetChipSelected: {
    backgroundColor: BrandColors.primaryDark,
  },
  presetText: {
    fontSize: 12,
  },
  presetTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    maxWidth: 140,
    backgroundColor: '#FFFFFF',
  },
  inputContent: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
  },
  calculationBox: {
    backgroundColor: BrandColors.primaryLight,
    borderRadius: 12,
    padding: 14,
    marginVertical: 14,
    alignItems: 'center',
  },
  calcFormula: {
    fontSize: 13,
    color: BrandColors.primaryDark,
    marginBottom: 4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: BrandColors.primaryDark,
  },
  amountHighlight: {
    fontSize: 26,
    fontWeight: '800',
    color: BrandColors.primaryDark,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    borderRadius: 8,
    borderColor: BrandColors.borderLight,
  },
  saveBtn: {
    borderRadius: 8,
    backgroundColor: BrandColors.primary,
  },
});
