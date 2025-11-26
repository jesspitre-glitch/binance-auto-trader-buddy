// Utility functions for working with Binance server time (UTC)

/**
 * Get current time in UTC (Binance server time)
 */
export function getBinanceNow(): Date {
  return new Date();
}

/**
 * Get UTC timestamp in milliseconds (Binance server time)
 */
export function getBinanceTimestamp(): number {
  return Date.now();
}

/**
 * Convert a date string to UTC Date object
 */
export function parseBinanceDate(dateString: string): Date {
  return new Date(dateString);
}

/**
 * Format date in UTC for display (Binance server time)
 */
export function formatBinanceDate(date: Date | string, options?: {
  includeTime?: boolean;
  includeSeconds?: boolean;
}): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  
  if (!options?.includeTime) {
    return `${day}/${month}/${year}`;
  }
  
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  
  if (options?.includeSeconds) {
    const seconds = String(d.getUTCSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds} UTC`;
  }
  
  return `${day}/${month}/${year} ${hours}:${minutes} UTC`;
}

/**
 * Calculate time ago from now in UTC (Binance server time)
 */
export function getBinanceTimeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = Date.now();
  const timestamp = d.getTime();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d siden`;
  } else if (hours > 0) {
    return `${hours}t siden`;
  } else if (minutes > 0) {
    return `${minutes}m siden`;
  } else {
    return `${seconds}s siden`;
  }
}

/**
 * Get start of day in UTC (Binance server time)
 */
export function getStartOfDayUTC(date?: Date): Date {
  const d = date || new Date();
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    0, 0, 0, 0
  ));
}

/**
 * Subtract days in UTC (Binance server time)
 */
export function subtractDaysUTC(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

/**
 * Subtract hours in UTC (Binance server time)
 */
export function subtractHoursUTC(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setUTCHours(result.getUTCHours() - hours);
  return result;
}

/**
 * Get duration between two dates in minutes (UTC)
 */
export function getDurationMinutes(startDate: Date | string, endDate: Date | string): number {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
}
