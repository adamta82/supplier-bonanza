import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format number without decimals (no agorot) */
export function fmtNum(n: number | null | undefined): string {
  return Math.round(n || 0).toLocaleString("he-IL", { maximumFractionDigits: 0 });
}
