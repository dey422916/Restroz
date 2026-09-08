/**
 * Standardized Date and Time formatting utilities for Orders, KOTs, Invoices, and Reports.
 * Ensures consistent output format: "09 Sep 2026, 12:45 AM"
 */

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Formats an order's created_at timestamp into standard display format:
 * "09 Sep 2026, 12:45 AM"
 */
export function formatOrderDateTime(dateInput?: string | Date | null): string {
  if (!dateInput) return 'N/A';
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return 'N/A';

    const day = String(d.getDate()).padStart(2, '0');
    const month = MONTH_NAMES_SHORT[d.getMonth()];
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // hour '0' should be '12'
    const formattedHours = String(hours).padStart(2, '0');

    return `${day} ${month} ${year}, ${formattedHours}:${minutes} ${ampm}`;
  } catch {
    return 'N/A';
  }
}

/**
 * Formats date only: "09 Sep 2026"
 */
export function formatOrderDate(dateInput?: string | Date | null): string {
  if (!dateInput) return 'N/A';
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return 'N/A';
    const day = String(d.getDate()).padStart(2, '0');
    const month = MONTH_NAMES_SHORT[d.getMonth()];
    return `${day} ${month} ${d.getFullYear()}`;
  } catch {
    return 'N/A';
  }
}

/**
 * Formats time only: "12:45 AM"
 */
export function formatOrderTime(dateInput?: string | Date | null): string {
  if (!dateInput) return 'N/A';
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return 'N/A';
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  } catch {
    return 'N/A';
  }
}
