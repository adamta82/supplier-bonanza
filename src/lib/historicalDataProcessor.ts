import type { ParsedFile } from "./parseExcelFile";

export interface SingleFilters {
  suppliers: string[];
  statuses: string[];
  dateFrom: string;
  dateTo: string;
}

export interface HistoricalFilters {
  purchase: SingleFilters;
  sales: SingleFilters;
}

export interface SupplierAggregate {
  supplierNumber: string;
  supplierName: string;
  purchaseVolume: number;
  salesVolume: number;
  costTotal: number;
  profitAmount: number;
  profitMargin: number;
  recordCount: number;
}

/** Parse dd/mm/yyyy or Excel serial to yyyy-mm-dd */
function toDateStr(val: any): string | null {
  if (!val) return null;
  if (typeof val === "number" && val > 40000) {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function num(v: any): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function matchesFilters(
  row: Record<string, any>,
  dateCol: string,
  statusCol: string,
  supplierCol: string,
  filters: SingleFilters
): boolean {
  if (filters.statuses.length > 0) {
    const status = String(row[statusCol] || "").trim();
    if (!filters.statuses.includes(status)) return false;
  }
  if (filters.suppliers.length > 0) {
    const sup = String(row[supplierCol] || "").trim();
    if (!filters.suppliers.includes(sup)) return false;
  }
  if (filters.dateFrom || filters.dateTo) {
    const d = toDateStr(row[dateCol]);
    if (d) {
      if (filters.dateFrom && d < filters.dateFrom) return false;
      if (filters.dateTo && d > filters.dateTo) return false;
    }
  }
  return true;
}

export function getUniqueValues(data: Record<string, any>[], col: string): string[] {
  const set = new Set<string>();
  for (const row of data) {
    const v = String(row[col] || "").trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "he"));
}

// Purchase columns
const P_SUPPLIER_NUM = "מס' ספק";
const P_SUPPLIER_NAME = "שם ספק";
const P_DATE = "תאריך";
const P_STATUS = "סטטוס";
const P_TOTAL_VAT = "מחיר כולל מע'מ";
const P_CUSTOMER_PO = "הזמנת לקוח";

// Sales columns
const S_ORDER = "הזמנה";
const S_DATE = "תאריך";
const S_CUSTOMER_PO = "הז. רכש (לקוח)";
const S_PRICE = "מחיר ליחידה";
const S_COST = "עלות";
const S_QTY = "כמות";
const S_STATUS = "סטטוס הזמנה";
const S_SUPPLIER = "ספק מועדף";

export function processPurchases(
  parsed: ParsedFile,
  filters: HistoricalFilters
): Map<string, { name: string; volume: number; count: number }> {
  const map = new Map<string, { name: string; volume: number; count: number }>();

  for (const row of parsed.data) {
    if (!matchesFilters(row, P_DATE, P_STATUS, P_SUPPLIER_NAME, filters)) continue;

    const supNum = String(row[P_SUPPLIER_NUM] || "").trim();
    const supName = String(row[P_SUPPLIER_NAME] || "").trim();
    if (!supNum && !supName) continue;

    const key = supNum || supName;
    const existing = map.get(key) || { name: supName, volume: 0, count: 0 };
    existing.volume += num(row[P_TOTAL_VAT]);
    existing.count += 1;
    if (!existing.name && supName) existing.name = supName;
    map.set(key, existing);
  }

  return map;
}

/**
 * Build a map: SO -> supplier number by propagating across rows sharing the same SO.
 * Also build PO->supplier from purchases for cross-linking.
 */
function buildSalesSupplierMap(
  salesData: Record<string, any>[],
  purchaseData?: Record<string, any>[]
): Map<string, string> {
  // SO -> supplier number (from ספק מועדף)
  const soSupplier = new Map<string, string>();
  for (const row of salesData) {
    const so = String(row[S_ORDER] || "").trim();
    const sup = String(row[S_SUPPLIER] || "").trim();
    if (so && sup) soSupplier.set(so, sup);
  }

  // Also try from purchases: customer_po -> supplier
  if (purchaseData) {
    for (const row of purchaseData) {
      const customerPo = String(row[P_CUSTOMER_PO] || "").trim();
      const supNum = String(row[P_SUPPLIER_NUM] || "").trim();
      if (customerPo && supNum && !soSupplier.has(customerPo)) {
        soSupplier.set(customerPo, supNum);
      }
    }
  }

  return soSupplier;
}

export function processSales(
  salesParsed: ParsedFile,
  purchaseParsed: ParsedFile | null,
  purchaseSupplierNames: Map<string, string>,
  filters: HistoricalFilters
): Map<string, { name: string; salesVolume: number; costTotal: number; profitAmount: number; count: number }> {
  const soSupplierMap = buildSalesSupplierMap(
    salesParsed.data,
    purchaseParsed?.data
  );

  const map = new Map<string, { name: string; salesVolume: number; costTotal: number; profitAmount: number; count: number }>();

  for (const row of salesParsed.data) {
    if (!matchesFilters(row, S_DATE, S_STATUS, S_SUPPLIER, filters)) continue;

    const so = String(row[S_ORDER] || "").trim();
    let supNum = String(row[S_SUPPLIER] || "").trim();

    // Propagate: if this row has no supplier, look up from SO map
    if (!supNum && so) {
      supNum = soSupplierMap.get(so) || "";
    }

    if (!supNum) continue;

    const qty = num(row[S_QTY]);
    const price = num(row[S_PRICE]);
    const cost = num(row[S_COST]);
    const saleTotal = price * qty;
    const costTotal = cost * qty;
    const profit = saleTotal - costTotal;

    const existing = map.get(supNum) || {
      name: purchaseSupplierNames.get(supNum) || supNum,
      salesVolume: 0,
      costTotal: 0,
      profitAmount: 0,
      count: 0,
    };
    existing.salesVolume += saleTotal;
    existing.costTotal += costTotal;
    existing.profitAmount += profit;
    existing.count += 1;
    map.set(supNum, existing);
  }

  return map;
}

export function aggregateSuppliers(
  purchaseMap: Map<string, { name: string; volume: number; count: number }>,
  salesMap: Map<string, { name: string; salesVolume: number; costTotal: number; profitAmount: number; count: number }>
): SupplierAggregate[] {
  const allKeys = new Set([...purchaseMap.keys(), ...salesMap.keys()]);
  const results: SupplierAggregate[] = [];

  for (const key of allKeys) {
    const p = purchaseMap.get(key);
    const s = salesMap.get(key);
    const purchaseVolume = p?.volume || 0;
    const salesVolume = s?.salesVolume || 0;
    const costTotal = s?.costTotal || 0;
    const profitAmount = s?.profitAmount || 0;
    const margin = salesVolume > 0 ? (profitAmount / salesVolume) * 100 : 0;
    const name = p?.name || s?.name || key;

    results.push({
      supplierNumber: key,
      supplierName: name,
      purchaseVolume,
      salesVolume,
      costTotal,
      profitAmount,
      profitMargin: margin,
      recordCount: (p?.count || 0) + (s?.count || 0),
    });
  }

  return results;
}

export { P_SUPPLIER_NAME, P_STATUS, S_STATUS, S_SUPPLIER, P_DATE, S_DATE };
