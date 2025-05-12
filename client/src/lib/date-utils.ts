import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

/**
 * Convert a date string and time string to a California (US Pacific) timezone date object
 * This ensures all dates are stored in California time regardless of user's local timezone
 * 
 * @param dateStr Date string in YYYY-MM-DD format
 * @param timeStr Time string in HH:MM (24-hour) format
 * @returns ISO string with the date and time in California timezone
 */
export function toCaliforniaTime(dateStr: string, timeStr: string): string {
  // Get the current date in local timezone
  const localDate = new Date(`${dateStr}T${timeStr}:00`);
  
  // Define the California timezone (US Pacific)
  const californiaTimeZone = 'America/Los_Angeles';
  
  // Construct a date that represents the input time as if it were in California
  // For example, if input is "2023-10-01" and "14:00", this creates a date object
  // that represents 2:00 PM on Oct 1, 2023 in California time, regardless of where the user is
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: californiaTimeZone
  };
  
  // Format this as an ISO timestamp (in UTC)
  const pacificDate = new Date(
    localDate.toLocaleString('en-US', options).replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$1-$2T')
  );
  
  return pacificDate.toISOString();
}

/**
 * Format a date for display in California timezone
 * 
 * @param dateStr ISO date string 
 * @param formatStr Format string for date-fns
 * @returns Formatted date string in California timezone
 */
export function formatCaliforniaTime(dateStr: string, formatStr: string): string {
  // Parse the ISO string
  const date = parseISO(dateStr);
  
  // Convert to California timezone
  const californiaTimeZone = 'America/Los_Angeles';
  const californiaDate = toZonedTime(date, californiaTimeZone);
  
  // Format the date
  return format(californiaDate, formatStr);
}

/**
 * Creates a date in California timezone with the specified hours and minutes
 * Use this when creating dates that need to be in California time
 * 
 * @param date Base date object or date string
 * @param hours Hours in 24-hour format
 * @param minutes Minutes
 * @returns ISO string representing the specified date and time in California timezone
 */
export function createCaliforniaDate(date: Date | string, hours: number, minutes: number): string {
  // Parse the date if it's a string
  const baseDate = typeof date === 'string' ? new Date(date) : date;
  
  // Create a new date with the specified hours and minutes
  const newDate = new Date(baseDate);
  newDate.setHours(hours, minutes, 0, 0);
  
  // Define the California timezone
  const californiaTimeZone = 'America/Los_Angeles';
  
  // We need to adjust the date to be interpreted as California time
  // This approach ensures the local date is treated as if it were in California timezone
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: californiaTimeZone
  };
  
  // Format this as an ISO timestamp (in UTC)
  const pacificDate = new Date(
    newDate.toLocaleString('en-US', options).replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$1-$2T')
  );
  
  return pacificDate.toISOString();
}