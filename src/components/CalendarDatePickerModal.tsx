import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {
  Text,
  Modal,
  Portal,
  IconButton,
  Chip,
} from 'react-native-paper';
import { BrandColors } from '../constants/theme';
import { getTodayKolkata, addDays, getMonthName } from '../utils/date';

interface CalendarDatePickerModalProps {
  visible: boolean;
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  onDismiss: () => void;
  title?: string;
  zIndex?: number;
}

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function CalendarDatePickerModal({
  visible,
  selectedDate,
  onSelectDate,
  onDismiss,
  title = 'Select Date',
}: CalendarDatePickerModalProps) {
  // Parse incoming YYYY-MM-DD
  const parseDate = (dStr: string) => {
    const parts = dStr.split('-');
    if (parts.length === 3) {
      return {
        year: parseInt(parts[0], 10),
        month: parseInt(parts[1], 10), // 1-12
        day: parseInt(parts[2], 10),
      };
    }
    const today = new Date();
    return {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
    };
  };

  const initial = parseDate(selectedDate || getTodayKolkata());
  const [currentYear, setCurrentYear] = useState(initial.year);
  const [currentMonth, setCurrentMonth] = useState(initial.month); // 1-12
  const [prevSelectedDate, setPrevSelectedDate] = useState(selectedDate);

  if (selectedDate !== prevSelectedDate) {
    setPrevSelectedDate(selectedDate);
    const p = parseDate(selectedDate);
    setCurrentYear(p.year);
    setCurrentMonth(p.month);
  }

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // Generate calendar days for currentMonth (1-12) & currentYear
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month - 1, 1).getDay(); // 0 is Sunday
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  // Pad numbers
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  const handleDayPress = (day: number) => {
    const formatted = `${currentYear}-${pad(currentMonth)}-${pad(day)}`;
    onSelectDate(formatted);
    onDismiss();
  };

  const handlePresetPress = (presetDate: string) => {
    onSelectDate(presetDate);
    onDismiss();
  };

  const todayStr = getTodayKolkata();
  const yesterdayStr = addDays(todayStr, -1);

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.modalContent, { zIndex: 100000, elevation: 30 }]}
        style={{ zIndex: 99999 }}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header Title */}
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <IconButton icon="close" size={20} onPress={onDismiss} />
          </View>

          {/* Quick Preset Buttons */}
          <View style={styles.presetRow}>
            <Chip
              compact
              selected={selectedDate === todayStr}
              onPress={() => handlePresetPress(todayStr)}
              style={styles.presetChip}
            >
              Today
            </Chip>
            <Chip
              compact
              selected={selectedDate === yesterdayStr}
              onPress={() => handlePresetPress(yesterdayStr)}
              style={styles.presetChip}
            >
              Yesterday
            </Chip>
          </View>

          {/* Month & Year Navigation */}
          <View style={styles.monthNavRow}>
            <IconButton
              icon="chevron-left"
              size={24}
              onPress={handlePrevMonth}
              iconColor={BrandColors.primaryDark}
            />
            <Text style={styles.monthYearText}>
              {getMonthName(currentMonth)} {currentYear}
            </Text>
            <IconButton
              icon="chevron-right"
              size={24}
              onPress={handleNextMonth}
              iconColor={BrandColors.primaryDark}
            />
          </View>

          {/* Days of Week Header */}
          <View style={styles.weekDaysRow}>
            {DAYS_OF_WEEK.map((d) => (
              <Text key={d} style={styles.weekDayText}>
                {d}
              </Text>
            ))}
          </View>

          {/* Calendar Grid */}
          <View style={styles.daysGrid}>
            {/* Empty slots before day 1 */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <View key={`empty-${i}`} style={styles.dayCell} />
            ))}

            {/* Days in Month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${currentYear}-${pad(currentMonth)}-${pad(day)}`;
              const isSelected = selectedDate === dateStr;
              const isToday = todayStr === dateStr;

              return (
                <TouchableOpacity
                  key={`day-${day}`}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                    isToday && !isSelected && styles.dayCellToday,
                  ]}
                  onPress={() => handleDayPress(day)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dayText,
                      isSelected && styles.dayTextSelected,
                      isToday && !isSelected && styles.dayTextToday,
                    ]}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Selected Date Footer */}
          <View style={styles.footerRow}>
            <Text style={styles.footerLabel}>Selected Date:</Text>
            <Text style={styles.footerValue}>{selectedDate}</Text>
          </View>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    padding: 18,
    borderRadius: 16,
    maxHeight: '85%',
    elevation: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: BrandColors.textLight,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  presetChip: {
    backgroundColor: '#F1F5F9',
  },
  monthNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  monthYearText: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.textLight,
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekDayText: {
    width: 38,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.neutralGray,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  dayCell: {
    width: '14.28%',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
    borderRadius: 20,
  },
  dayCellSelected: {
    backgroundColor: BrandColors.primaryDark,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: BrandColors.primary,
  },
  dayText: {
    fontSize: 14,
    color: BrandColors.textLight,
    fontWeight: '600',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dayTextToday: {
    color: BrandColors.primaryDark,
    fontWeight: '800',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  footerLabel: {
    fontSize: 13,
    color: BrandColors.neutralGray,
  },
  footerValue: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
});
