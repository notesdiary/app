/**
 * Date & time utilities for the Notes Diary app.
 */

export function getTodayISO(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDate(iso: string): { weekday: string; md: string } {
  const date = new Date(iso + 'T00:00:00Z');

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const weekday = weekdays[date.getUTCDay()];
  const month = months[date.getUTCMonth()];
  const day = date.getUTCDate();

  return {
    weekday: weekday,
    md: `${month} ${day}`
  };
}

export function formatTime(hhmm: string): string {
  const [hours, minutes] = hhmm.split(':').map(Number);

  let hour = hours;
  const isPM = hour >= 12;

  if (hour === 0) {
    hour = 12;
  } else if (hour > 12) {
    hour -= 12;
  }

  const period = isPM ? 'PM' : 'AM';
  return `${hour}:${String(minutes).padStart(2, '0')} ${period}`;
}
