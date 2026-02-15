/**
 * Format a date string (yyyy-mm-dd or ISO) to dd/mm/yyyy
 */
export function formatDate(date: string | null | undefined): string {
  if (!date) return "-";
  const d = date.slice(0, 10); // take yyyy-mm-dd part
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
