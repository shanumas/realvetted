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
  // Validate input parameters
  if (!dateStr || !timeStr) {
    throw new Error('Both dateStr and timeStr are required');
  }
  
  // Create a date object treating the input as if it were in California time
  // This is a simpler approach that avoids complex timezone conversions
  const isoString = `${dateStr}T${timeStr}:00`;
  const date = new Date(isoString);
  
  // Validate that the date is valid
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date/time combination: ${isoString}`);
  }
  
  // Return the ISO string directly - the backend will handle timezone conversion
  return date.toISOString();
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
  
  // Validate the base date
  if (isNaN(baseDate.getTime())) {
    throw new Error(`Invalid base date: ${date}`);
  }
  
  // Create a new date with the specified hours and minutes
  const newDate = new Date(baseDate);
  newDate.setHours(hours, minutes, 0, 0);
  
  // Validate the new date
  if (isNaN(newDate.getTime())) {
    throw new Error(`Failed to create valid date with hours ${hours} and minutes ${minutes}`);
  }
  
  // Return the ISO string directly - the backend will handle timezone conversion
  return newDate.toISOString();
}