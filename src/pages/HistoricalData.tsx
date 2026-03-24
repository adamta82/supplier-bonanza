import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fmtNum } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const VAT_RATE = 0.18;
const addVAT = (amount: number) => amount * (1 + VAT_RATE);

type SortField = "name" | "purchaseVolume" | "salesVolume" | "profitAmount" | "profitMargin";
type SortDir = "asc" | "desc";

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

export default function HistoricalData() {
  const [selectedYear, setSelectedYear] = useState(String(currentYear - 1));
  const [sortField, setSortField] = useState<SortField>("purchaseVolume");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [syncProgress, setSyncProgress] = useState("");
  const queryClient = useQueryClient();

  const { data: historicalData, isLoading } = useQuery({
    queryKey: ["historical-data", selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("historical_supplier_data")
        .select("*")
        .eq("year", Number(selectedYear));
      if (error) throw error;
      return data || [];
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const year = Number(selectedYear);

      // Phase 1: Purchases
      setSyncProgress("מסנכרן רכשים...");
      let purchasesDone = false;
      let skip = 0;
      while (!purchasesDone) {
        const { data, error } = await supabase.functions.invoke("sync-historical-data", {
          body: { year, phase: "purchases", startSkip: skip, max_pages: 10 },
        });
        if (error) throw error;
        if (data.has_more) {
          skip = data.nextSkip;
          setSyncProgress(`מסנכרן רכשים... (${skip} רשומות)`);
        } else {
          purchasesDone = true;
          setSyncProgress(`רכשים הושלמו - ${data.suppliers_found || 0} ספקים`);
        }
      }

      // Phase 2: Sales
      setSyncProgress("מסנכרן מכירות...");
      let salesDone = false;
      skip = 0;
      while (!salesDone) {
        const { data, error } = await supabase.functions.invoke("sync-historical-data", {
          body: { year, phase: "sales", startSkip: skip, max_pages: 10 },
        });
        if (error) throw error;
        if (data.has_more) {
          skip = data.nextSkip;
          setSyncProgress(`מסנכרן מכירות... (${skip} רשומות)`);
        } else {
          salesDone = true;
          setSyncProgress("");
        }
      }

      return { year };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["historical-data", selectedYear] });
      toast.success(`נתוני ${result.year} סונכרנו בהצלחה`);
    },
    onError: (err: any) => {
      setSyncProgress("");
      toast.error("שגיאה בסנכרון: " + (err.message || "שגיאה לא ידועה"));
    },
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 inline mr-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 inline mr-1" /> : <ArrowDown className="w-3 h-3 inline mr-1" />;
  };

  const sortedData = useMemo(() => {
    if (!historicalData) return [];
    return [...historicalData].sort((a, b) => {
      const fieldMap: Record<SortField, string> = {
        name: "supplier_name",
        purchaseVolume: "purchase_volume",
        salesVolume: "sales_volume",
        profitAmount: "profit_amount",
        profitMargin: "profit_margin",
      };
      const key = fieldMap[sortField];
      const aVal = (a as any)[key];
      const bVal = (b as any)[key];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal, "he") : bVal.localeCompare(aVal, "he");
      }
      return sortDir === "asc" ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
    });
  }, [historicalData, sortField, sortDir]);

  // Totals
  const totals = useMemo(() => {
    if (!sortedData.length) return { purchases: 0, sales: 0, profit: 0, margin: 0 };
    const purchases = sortedData.reduce((s, r) => s + (r.purchase_volume || 0), 0);
    const sales = sortedData.reduce((s, r) => s + (r.sales_volume || 0), 0);
    const profit = sortedData.reduce((s, r) => s + addVAT(r.profit_amount || 0), 0);
    const margin = sales > 0 ? (profit / sales) * 100 : 0;
    return { purchases, sales, profit, margin };
  }, [sortedData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold">נתונים היסטוריים</h1>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            סנכרן נתוני {selectedYear}
          </Button>
        </div>
      </div>

      {syncProgress && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">{syncProgress}</span>
            </div>
            <Progress className="mt-2" value={undefined} />
          </CardContent>
        </Card>
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
              <p className="text-xs text-muted-foreground">סה"כ רווח ישיר</p>
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

      <Card>
        <CardHeader>
          <CardTitle>נתוני {selectedYear} לפי ספק</CardTitle>
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
                  <SortIcon field="purchaseVolume" />מחזור רכישות (כולל מע"מ)
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("salesVolume")}>
                  <SortIcon field="salesVolume" />מחזור מכירות (כולל מע"מ)
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("profitAmount")}>
                  <SortIcon field="profitAmount" />רווח ישיר
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("profitMargin")}>
                  <SortIcon field="profitMargin" />% רווח
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">טוען...</TableCell>
                </TableRow>
              ) : sortedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    אין נתונים לשנת {selectedYear}. לחץ "סנכרן" כדי למשוך מפריוריטי.
                  </TableCell>
                </TableRow>
              ) : (
                sortedData.map((row) => {
                  const profitWithVat = addVAT(row.profit_amount || 0);
                  const margin = row.sales_volume ? (profitWithVat / row.sales_volume) * 100 : 0;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        {row.supplier_id ? (
                          <Link to={`/suppliers/${row.supplier_id}`} className="text-primary hover:underline">
                            {row.supplier_name}
                          </Link>
                        ) : (
                          row.supplier_name
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.supplier_number || "-"}</TableCell>
                      <TableCell>₪{fmtNum(row.purchase_volume || 0)}</TableCell>
                      <TableCell>₪{fmtNum(row.sales_volume || 0)}</TableCell>
                      <TableCell className={profitWithVat >= 0 ? "text-success" : "text-destructive"}>
                        ₪{fmtNum(profitWithVat)}
                      </TableCell>
                      <TableCell className="font-medium">{margin.toFixed(1)}%</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
