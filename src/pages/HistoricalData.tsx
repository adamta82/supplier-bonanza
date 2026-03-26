import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpDown, ArrowUp, ArrowDown, History, Loader2, Upload, Save } from "lucide-react";
import { toast } from "sonner";
import { fmtNum } from "@/lib/utils";
import FileUploadPreview from "@/components/FileUploadPreview";
import HistoricalFilters from "@/components/HistoricalFilters";
import type { ParsedFile } from "@/lib/parseExcelFile";
import {
  processPurchases, processSales, aggregateSuppliers, getUniqueValues,
  P_SUPPLIER_NAME, P_STATUS, S_STATUS, S_SUPPLIER,
  type HistoricalFilters as Filters, type SupplierAggregate,
} from "@/lib/historicalDataProcessor";

type SortField = "name" | "purchaseVolume" | "salesVolume" | "profitAmount" | "profitMargin";
type SortDir = "asc" | "desc";

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

const emptyFilters: Filters = { suppliers: [], statuses: [], dateFrom: "", dateTo: "" };

export default function HistoricalData() {
  const [selectedYear, setSelectedYear] = useState(String(currentYear - 1));
  const [sortField, setSortField] = useState<SortField>("purchaseVolume");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [purchaseParsed, setPurchaseParsed] = useState<ParsedFile | null>(null);
  const [salesParsed, setSalesParsed] = useState<ParsedFile | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const queryClient = useQueryClient();

  // Collect unique values for filter dropdowns
  const availableSuppliers = useMemo(() => {
    const all: string[] = [];
    if (purchaseParsed) all.push(...getUniqueValues(purchaseParsed.data, P_SUPPLIER_NAME));
    if (salesParsed) all.push(...getUniqueValues(salesParsed.data, S_SUPPLIER));
    return [...new Set(all)].sort((a, b) => a.localeCompare(b, "he"));
  }, [purchaseParsed, salesParsed]);

  const availableStatuses = useMemo(() => {
    const all: string[] = [];
    if (purchaseParsed) all.push(...getUniqueValues(purchaseParsed.data, P_STATUS));
    if (salesParsed) all.push(...getUniqueValues(salesParsed.data, S_STATUS));
    return [...new Set(all)].sort((a, b) => a.localeCompare(b, "he"));
  }, [purchaseParsed, salesParsed]);

  // Process and aggregate
  const aggregated = useMemo<SupplierAggregate[]>(() => {
    if (!purchaseParsed && !salesParsed) return [];

    const purchaseMap = purchaseParsed
      ? processPurchases(purchaseParsed, filters)
      : new Map();

    // Build supplier number -> name map from purchases
    const supNameMap = new Map<string, string>();
    purchaseMap.forEach((v, k) => supNameMap.set(k, v.name));

    const salesMap = salesParsed
      ? processSales(salesParsed, purchaseParsed, supNameMap, filters)
      : new Map();

    return aggregateSuppliers(purchaseMap, salesMap);
  }, [purchaseParsed, salesParsed, filters]);

  // Sort
  const sortedData = useMemo(() => {
    return [...aggregated].sort((a, b) => {
      const fieldMap: Record<SortField, keyof SupplierAggregate> = {
        name: "supplierName",
        purchaseVolume: "purchaseVolume",
        salesVolume: "salesVolume",
        profitAmount: "profitAmount",
        profitMargin: "profitMargin",
      };
      const key = fieldMap[sortField];
      const aVal = a[key];
      const bVal = b[key];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal, "he") : bVal.localeCompare(aVal, "he");
      }
      return sortDir === "asc" ? (Number(aVal) || 0) - (Number(bVal) || 0) : (Number(bVal) || 0) - (Number(aVal) || 0);
    });
  }, [aggregated, sortField, sortDir]);

  const totals = useMemo(() => {
    if (!sortedData.length) return { purchases: 0, sales: 0, profit: 0, margin: 0 };
    const purchases = sortedData.reduce((s, r) => s + r.purchaseVolume, 0);
    const sales = sortedData.reduce((s, r) => s + r.salesVolume, 0);
    const profit = sortedData.reduce((s, r) => s + r.profitAmount, 0);
    const margin = sales > 0 ? (profit / sales) * 100 : 0;
    return { purchases, sales, profit, margin };
  }, [sortedData]);

  // Save to DB
  const saveMutation = useMutation({
    mutationFn: async () => {
      const year = Number(selectedYear);
      // Delete existing year data
      await supabase.from("historical_supplier_data").delete().eq("year", year);

      // Get suppliers for ID mapping
      const { data: suppliers } = await supabase.from("suppliers").select("id, supplier_number, name");
      const supIdMap = new Map<string, string>();
      for (const s of suppliers || []) {
        if (s.supplier_number) supIdMap.set(s.supplier_number, s.id);
      }

      const rows = sortedData.map((r) => ({
        year,
        supplier_number: r.supplierNumber,
        supplier_name: r.supplierName,
        supplier_id: supIdMap.get(r.supplierNumber) || null,
        purchase_volume: r.purchaseVolume,
        sales_volume: r.salesVolume,
        cost_total: r.costTotal,
        profit_amount: r.profitAmount,
        profit_margin: r.profitMargin,
        record_count: r.recordCount,
      }));

      if (rows.length) {
        const { error } = await supabase.from("historical_supplier_data").insert(rows);
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["historical-data"] });
      toast.success(`${count} רשומות נשמרו לשנת ${selectedYear}`);
    },
    onError: (err: any) => toast.error("שגיאה בשמירה: " + err.message),
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 inline mr-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 inline mr-1" /> : <ArrowDown className="w-3 h-3 inline mr-1" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold">נתונים היסטוריים</h1>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          {sortedData.length > 0 && (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              שמור {sortedData.length} רשומות
            </Button>
          )}
        </div>
      </div>

      {/* Upload areas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FileUploadPreview
          title="הזמנות רכש"
          description="העלה קובץ אקסל עם הזמנות רכש לשנה הנבחרת"
          buttonLabel="טען נתוני רכש"
          onUpload={(data) => setPurchaseParsed(data)}
          isUploading={false}
        />
        <FileUploadPreview
          title="הזמנות לקוח (מכירות)"
          description="העלה קובץ אקסל עם הזמנות לקוח לשנה הנבחרת"
          buttonLabel="טען נתוני מכירות"
          onUpload={(data) => setSalesParsed(data)}
          isUploading={false}
        />
      </div>

      {/* Status badges */}
      {(purchaseParsed || salesParsed) && (
        <div className="flex gap-2 text-sm">
          {purchaseParsed && (
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
              רכשים: {purchaseParsed.data.length} שורות
            </span>
          )}
          {salesParsed && (
            <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
              מכירות: {salesParsed.data.length} שורות
            </span>
          )}
          {aggregated.length > 0 && (
            <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">
              {aggregated.length} ספקים
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      {(purchaseParsed || salesParsed) && (
        <HistoricalFilters
          filters={filters}
          onChange={setFilters}
          availableSuppliers={availableSuppliers}
          availableStatuses={availableStatuses}
        />
      )}

      {/* KPI Summary */}
      {sortedData.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">סה"כ רכישות</p>
              <p className="text-xl font-bold">₪{fmtNum(totals.purchases)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">סה"כ מכירות</p>
              <p className="text-xl font-bold">₪{fmtNum(totals.sales)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">סה"כ רווח</p>
              <p className="text-xl font-bold text-success">₪{fmtNum(totals.profit)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">אחוז רווח כללי</p>
              <p className="text-xl font-bold">{totals.margin.toFixed(1)}%</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Data Table */}
      {sortedData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>נתוני {selectedYear} לפי ספק ({sortedData.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
                    <SortIcon field="name" />ספק
                  </TableHead>
                  <TableHead>מספר ספק</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("purchaseVolume")}>
                    <SortIcon field="purchaseVolume" />מחזור רכישות
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("salesVolume")}>
                    <SortIcon field="salesVolume" />מחזור מכירות
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("profitAmount")}>
                    <SortIcon field="profitAmount" />רווח
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("profitMargin")}>
                    <SortIcon field="profitMargin" />% רווח
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((row) => (
                  <TableRow key={row.supplierNumber}>
                    <TableCell className="font-medium">{row.supplierName}</TableCell>
                    <TableCell className="text-muted-foreground">{row.supplierNumber}</TableCell>
                    <TableCell>₪{fmtNum(row.purchaseVolume)}</TableCell>
                    <TableCell>₪{fmtNum(row.salesVolume)}</TableCell>
                    <TableCell className={row.profitAmount >= 0 ? "text-success" : "text-destructive"}>
                      ₪{fmtNum(row.profitAmount)}
                    </TableCell>
                    <TableCell className="font-medium">{row.profitMargin.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
