/**
 * Date helper functions targeting Asia/Kolkata timezone and standard YYYY-MM-DD strings.
 */

export function getTodayKolkata(): string {
  // Use Intl to get date in Asia/Kolkata timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date()); // Outputs YYYY-MM-DD
}

export function getCurrentMonthAndYear(): { month: number; year: number } {
  const today = getTodayKolkata();
  const [yearStr, monthStr] = today.split('-');
  return {
    year: parseInt(yearStr, 10),
    month: parseInt(monthStr, 10),
  };
}

export function formatDisplayDate(dateString: string): string {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatShortDate(dateString: string): string {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Format date to simple "Date, Day, Month" string (e.g. "01 Sun, Nov")
 */
export function formatDateDayMonth(dateString: string): string {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dayNum = date.getDate().toString().padStart(2, '0');
  const dayName = date.toLocaleDateString('en-IN', { weekday: 'short' });
  const monthName = date.toLocaleDateString('en-IN', { month: 'short' });
  return `${dayNum} ${dayName}, ${monthName}`;
}

/**
 * Format date to "Date Month · Day" string (e.g. "01 Nov · Sunday")
 */
export function formatDateAndDay(dateString: string): string {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dayNum = date.getDate().toString().padStart(2, '0');
  const monthName = date.toLocaleDateString('en-IN', { month: 'short' });
  const dayName = date.toLocaleDateString('en-IN', { weekday: 'long' });
  return `${dayNum} ${monthName} · ${dayName}`;
}

export function getMonthName(month: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return months[month - 1] || '';
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getMonthDateRange(year: number, month: number): { startDate: string; endDate: string } {
  const paddedMonth = month.toString().padStart(2, '0');
  const daysInMonth = getDaysInMonth(year, month);
  const paddedLastDay = daysInMonth.toString().padStart(2, '0');
  return {
    startDate: `${year}-${paddedMonth}-01`,
    endDate: `${year}-${paddedMonth}-${paddedLastDay}`,
  };
}

export function isDateInRange(targetDate: string, startDate: string, endDate: string): boolean {
  return targetDate >= startDate && targetDate <= endDate;
}

export function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayStr}`;
}

export function getDatesBetween(startDate: string, endDate: string): string[] {
  if (startDate > endDate) return [];
  const dates: string[] = [];
  let curr = startDate;
  while (curr <= endDate) {
    dates.push(curr);
    curr = addDays(curr, 1);
  }
  return dates;
}

export function getDaysDifference(startDate: string, endDate: string): number {
  const [y1, m1, d1] = startDate.split('-').map(Number);
  const [y2, m2, d2] = endDate.split('-').map(Number);
  const t1 = new Date(y1, m1 - 1, d1).getTime();
  const t2 = new Date(y2, m2 - 1, d2).getTime();
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

