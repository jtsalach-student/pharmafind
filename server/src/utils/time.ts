import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export const isOpenNow = (opensAt: string, closesAt: string, timezoneName = 'Africa/Accra'): boolean => {
  const now = dayjs().tz(timezoneName);
  const [openHour, openMinute] = opensAt.split(':').map(Number);
  const [closeHour, closeMinute] = closesAt.split(':').map(Number);

  const open = now.hour(openHour).minute(openMinute).second(0);
  const close = now.hour(closeHour).minute(closeMinute).second(0);

  if (close.isBefore(open) || close.isSame(open)) {
    return now.isAfter(open) || now.isBefore(close);
  }
  return now.isAfter(open) && now.isBefore(close);
};
