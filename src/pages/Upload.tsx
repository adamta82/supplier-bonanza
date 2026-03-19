import { useState, useCallback } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Upload as UploadIcon, FileSpreadsheet, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";

type ParsedRow = Record<string, any>;

export default function UploadPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("purchases");
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id, name, supplier_number");
      return data || [];
    },
  });

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const workbook = XLSX.read(data, { type: "binary" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<ParsedRow>(sheet);
      if (json.length > 0) {
        setHeaders(Object.keys(json[0]));
        setParsedData(json);
      }
    };
    reader.readAsBinaryString(file);
  }, []);

  const parseDate = (val: any): string | null => {
    if (!val) return null;
    const s = val.toString().trim();
    const parts = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (parts) {
      return `${parts[3]}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (!isNaN(Number(s)) && Number(s) > 40000) {
      const d = new Date((Number(s) - 25569) * 86400 * 1000);
      return d.toISOString().slice(0, 10);
    }
    return null;
  };

  const uploadPurchases = useMutation({
    mutationFn: async () => {
      const batch = new Date().toISOString();

      const supplierMap = new Map<string, string>();
      parsedData.forEach((row) => {
        const num = (row["מס' ספק"] || row["מס ספק"] || "")?.toString().trim();
        const name = (row["שם ספק"] || row["supplier_name"] || "")?.toString().trim();
        if (num && name) supplierMap.set(num, name);
      });

      const existingNumbers = new Set(suppliers?.map((s) => s.supplier_number) || []);
      const newSuppliers: { name: string; supplier_number: string }[] = [];
      supplierMap.forEach((name, num) => {
        if (!existingNumbers.has(num)) {
          newSuppliers.push({ name, supplier_number: num });
        }
      });

      if (newSuppliers.length > 0) {
        const { error } = await supabase.from("suppliers").insert(newSuppliers);
        if (error) throw error;
      }

      const { data: allSuppliers } = await supabase.from("suppliers").select("id, name, supplier_number");
      const supplierIdMap = new Map<string, string>();
      allSuppliers?.forEach((s) => {
        if (s.supplier_number) supplierIdMap.set(s.supplier_number, s.id);
      });

      const { error: deleteError } = await supabase
        .from("purchase_records")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (deleteError) throw deleteError;

      const records = parsedData.map((row) => {
        const supplierNumber = (row["מס' ספק"] || row["מס ספק"] || "")?.toString().trim();
        const supplierName = (row["שם ספק"] || row["supplier_name"] || "")?.toString().trim();
        const orderNumber = (row["הזמנה"] || row["order_number"] || "")?.toString().trim();
        const priceILS = parseFloat(row["מחיר כולל מע'מ"] || row["מחיר כולל מעמ"] || row["מחיר סופי בשקלים"] || row["מחיר סופי"] || row["total_amount"] || "0") || 0;
        const unitPriceRaw = parseFloat(row["סה'כ מחיר"] || row["סהכ מחיר"] || row["מחיר סופי"] || row["unit_price"] || "0") || null;
        // עמודה ל — הזמנת לקוח (האס-או המקושר לפי-או זה)
        const customerSO = (row["הזמנת לקוח"] || row["הז. לקוח"] || row["הז לקוח"] || "")?.toString().trim() || null;

        return {
          supplier_id: supplierIdMap.get(supplierNumber) || null,
          supplier_name: supplierName,
          supplier_number: supplierNumber || null,
          order_number: orderNumber || null,
          order_date: parseDate(row["תאריך"] || row["order_date"]),
          item_code: (row["מק'ט"] || row['מק"ט'] || row["item_code"] || "")?.toString().trim() || null,
          item_description:
            (row["תאור מוצר"] || row["תאור פריט"] || row["item_description"] || "")?.toString().trim() || null,
          quantity: parseFloat(row["כמות"] || row["quantity"] || "1") || 1,
          unit_price: unitPriceRaw,
          total_amount: priceILS,
          category: row["קטגוריה"] || row["category"] || null,
          upload_batch: batch,
          // שמירת האס-או המקושר לפי-או זה (עמודה ל בגליון)
          customer_po: customerSO,
        };
      });

      const chunkSize = 100;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { error } = await supabase.from("purchase_records").insert(chunk);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases-summary"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(`${parsedData.length} שורות רכישה הועלו בהצלחה`);
      setParsedData([]);
      setHeaders([]);
      setFileName("");
    },
    onError: (e) => toast.error("שגיאה בהעלאה: " + e.message),
  });

  const uploadSales = useMutation({
    mutationFn: async () => {
      const batch = new Date().toISOString();

      // שלב 1: בנה מיפוי אס-או -> ספק מתוך עמודת customer_po ברכישות
      const { data: existingPurchases } = await supabase
        .from("purchase_records")
        .select("order_number, customer_po, supplier_id, supplier_name, supplier_number");

      const soToSupplierFromPO = new Map<
        string,
        {
          id: string | null;
          name: string;
          number: string;
        }
      >();

      (existingPurchases || []).forEach((pr) => {
        // customer_po של הרכישה = מספר האס-או של המכירה (עמודה ל בגליון הרכישות)
        if (!pr.customer_po) return;
        if (!soToSupplierFromPO.has(pr.customer_po)) {
          soToSupplierFromPO.set(pr.customer_po, {
            id: pr.supplier_id,
            name: pr.supplier_name || "",
            number: pr.supplier_number || "",
          });
        }
      });

      // שלב 2: בנה מיפוי אס-או -> ספק מתוך קובץ המכירות (גיבוי אם אין פי-או תואם)
      const soToSupplierFromFile = new Map<
        string,
        {
          id: string | null;
          name: string;
          number: string;
        }
      >();

      parsedData.forEach((row) => {
        const so = (row["הזמנה"] || "")?.toString().trim();
        const suppNum = (row["ספק מועדף"] || row["מס' ספק"] || row["מס ספק"] || "")?.toString().trim();
        const suppName = (row["שם ספק"] || row["ספק"] || "")?.toString().trim();
        if (so && suppNum && !soToSupplierFromFile.has(so)) {
          const existingSupplier = suppliers?.find((s) => s.supplier_number === suppNum || s.name === suppName);
          soToSupplierFromFile.set(so, {
            id: existingSupplier?.id || null,
            name: suppName,
            number: suppNum,
          });
        }
      });

      // שלב 3: מפה כל שורת מכירה לספק הנכון
      const records = parsedData.map((row) => {
        const so = (row["הזמנה"] || "")?.toString().trim();

        // קודם מחפשים לפי אס-או ב-customer_po של הרכישות, אחר כך בקובץ המכירות
        const supplierInfo = soToSupplierFromPO.get(so) || soToSupplierFromFile.get(so);

        const salePrice = parseFloat(row["מחיר ליחידה"] || row["מחיר מכירה"] || row["sale_price"] || "0") || 0;
        const costPrice = parseFloat(row["עלות"] || row["מחיר עלות"] || row["cost_price"] || "0") || 0;
        const qty = parseFloat(row["כמות"] || row["quantity"] || "1") || 1;
        const customerPo = (
          row["הז. רכש (לקוח)"] ||
          row["הז רכש"] ||
          row["מס' הזמנה זבילו"] ||
          row["מס הזמנה זבילו"] ||
          row["customer_po"] ||
          ""
        )
          ?.toString()
          .trim();

        return {
          supplier_id: supplierInfo?.id || null,
          supplier_name: supplierInfo?.name || null,
          item_code: (row["מק'ט"] || row['מק"ט'] || row["item_code"] || "")?.toString() || null,
          item_description: row["תאור מוצר"] || row["שם פריט"] || row["תאור פריט"] || row["item_description"] || null,
          quantity: qty,
          sale_price: salePrice,
          cost_price: costPrice,
          profit_direct: (salePrice - costPrice) * qty,
          customer_name: row["שם לקוח"] || row["לקוח"] || row["customer_name"] || null,
          sale_date: parseDate(row["תאריך"] || row["sale_date"]),
          category: row["קטגוריה"] || row["category"] || null,
          upload_batch: batch,
          order_number: so || null,
          customer_po: customerPo || null,
          brand: (row["מותג"] || row["brand"] || "")?.toString().trim() || null,
        };
      });

      const { error: deleteError } = await supabase
        .from("sales_records")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (deleteError) throw deleteError;

      const chunkSize = 100;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { error } = await supabase.from("sales_records").insert(chunk);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-all"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(`${parsedData.length} רשומות מכירה הועלו בהצלחה`);
      setParsedData([]);
      setHeaders([]);
      setFileName("");
    },
    onError: (e) => toast.error("שגיאה בהעלאה: " + e.message),
  });

  const [syncProgress, setSyncProgress] = useState<{ synced: number; page: number } | null>(null);
  const [syncFromDate, setSyncFromDate] = useState<Date>(new Date("2026-01-01"));

  const syncPriority = useMutation({
    mutationFn: async () => {
      let skip = 0;
      let totalSynced = 0;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        page++;
        setSyncProgress({ synced: totalSynced, page });

        const { data, error } = await supabase.functions.invoke("sync-purchase-orders", {
          body: {
            startSkip: skip,
            max_pages: 20,
            clear_existing: skip === 0,
            from_date: format(syncFromDate, "yyyy-MM-dd"),
          },
        });

        if (error) throw new Error(error.message || "שגיאה בסנכרון");
        if (!data?.success) throw new Error(data?.error || "שגיאה בסנכרון");

        totalSynced += data.records_synced || 0;
        hasMore = data.has_more;
        skip = data.nextSkip || skip + 500;
      }

      return totalSynced;
    },
    onSuccess: (total) => {
      queryClient.invalidateQueries({ queryKey: ["purchases-summary"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(`סנכרון הושלם: ${total} רשומות סונכרנו מ-Priority`);
      setSyncProgress(null);
    },
    onError: (e) => {
      toast.error("שגיאה בסנכרון רכש: " + e.message);
      setSyncProgress(null);
    },
  });

  const [salesSyncProgress, setSalesSyncProgress] = useState<{ synced: number; page: number } | null>(null);
  const [salesSyncFromDate, setSalesSyncFromDate] = useState<Date>(new Date("2026-01-01"));

  const syncSalesOrders = useMutation({
    mutationFn: async () => {
      let skip = 0;
      let totalSynced = 0;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        page++;
        setSalesSyncProgress({ synced: totalSynced, page });

        const { data, error } = await supabase.functions.invoke("sync-sales-orders", {
          body: {
            startSkip: skip,
            max_pages: 20,
            clear_existing: skip === 0,
            from_date: format(salesSyncFromDate, "yyyy-MM-dd"),
          },
        });

        if (error) throw new Error(error.message || "שגיאה בסנכרון");
        if (!data?.success) throw new Error(data?.error || "שגיאה בסנכרון");

        totalSynced += data.records_synced || 0;
        hasMore = data.has_more;
        skip = data.nextSkip || skip + 500;
      }

      return totalSynced;
    },
    onSuccess: (total) => {
      queryClient.invalidateQueries({ queryKey: ["sales-all"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(`סנכרון הושלם: ${total} הזמנות לקוח סונכרנו מ-Priority`);
      setSalesSyncProgress(null);
    },
    onError: (e) => {
      toast.error("שגיאה בסנכרון מכירות: " + e.message);
      setSalesSyncProgress(null);
    },
  });

  const isUploading = uploadPurchases.isPending || uploadSales.isPending;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">העלאת נתונים</h1>

      {/* Priority Sync Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Purchase Orders Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              סנכרון הזמנות רכש
            </CardTitle>
            <CardDescription>
              שליפת הזמנות רכש מ-Priority. סטטוסים "מבוטלת" ו"טיוטא" מסוננים.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {syncProgress && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  דף {syncProgress.page} • {syncProgress.synced} רשומות...
                </p>
                <Progress className="h-2" />
              </div>
            )}
            <div className="flex items-center gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !syncFromDate && "text-muted-foreground")}>
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {syncFromDate ? format(syncFromDate, "dd/MM/yyyy") : "בחר תאריך"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={syncFromDate} onSelect={(d) => d && setSyncFromDate(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              <Button onClick={() => syncPriority.mutate()} disabled={syncPriority.isPending} variant="outline" className="gap-2">
                <RefreshCw className={`w-4 h-4 ${syncPriority.isPending ? "animate-spin" : ""}`} />
                {syncPriority.isPending ? "מסנכרן..." : "סנכרן רכש"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sales Orders Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              סנכרון הזמנות לקוח
            </CardTitle>
            <CardDescription>
              שליפת הזמנות לקוח מ-Priority. שיוך ספק אוטומטי לפי הזמנות רכש מקושרות.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {salesSyncProgress && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  דף {salesSyncProgress.page} • {salesSyncProgress.synced} רשומות...
                </p>
                <Progress className="h-2" />
              </div>
            )}
            <div className="flex items-center gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !salesSyncFromDate && "text-muted-foreground")}>
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {salesSyncFromDate ? format(salesSyncFromDate, "dd/MM/yyyy") : "בחר תאריך"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={salesSyncFromDate} onSelect={(d) => d && setSalesSyncFromDate(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              <Button onClick={() => syncSalesOrders.mutate()} disabled={syncSalesOrders.isPending} variant="outline" className="gap-2">
                <RefreshCw className={`w-4 h-4 ${syncSalesOrders.isPending ? "animate-spin" : ""}`} />
                {syncSalesOrders.isPending ? "מסנכרן..." : "סנכרן מכירות"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="purchases">דוח רכישות</TabsTrigger>
          <TabsTrigger value="sales">דוח מכירות</TabsTrigger>
        </TabsList>

        <TabsContent value="purchases">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                העלאת דוח רכישות (Excel)
              </CardTitle>
              <CardDescription>
                העלה קובץ Excel עם הזמנות רכש. עמודות: מס' ספק, שם ספק, הזמנה (פי-או), תאריך, מק'ט, תאור מוצר, כמות,
                מחיר סופי בשקלים, הזמנת לקוח (אס-או). ספקים חדשים ייווצרו אוטומטית.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFile}
                  className="block w-full text-sm border rounded-lg p-3 bg-muted cursor-pointer"
                />
                {fileName && <p className="text-sm text-muted-foreground mt-1">קובץ: {fileName}</p>}
              </div>
              {parsedData.length > 0 && (
                <>
                  <p className="text-sm font-medium">{parsedData.length} שורות נקראו. תצוגה מקדימה (עד 10):</p>
                  <div className="overflow-auto max-h-[300px] border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {headers.map((h) => (
                            <TableHead key={h}>{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedData.slice(0, 10).map((row, i) => (
                          <TableRow key={i}>
                            {headers.map((h) => (
                              <TableCell key={h}>{row[h]?.toString() || ""}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button onClick={() => uploadPurchases.mutate()} disabled={isUploading} className="gap-2">
                    <UploadIcon className="w-4 h-4" />
                    {isUploading ? "מעלה..." : `העלה ${parsedData.length} שורות רכישה`}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                העלאת דוח מכירות (Excel)
              </CardTitle>
              <CardDescription>
                העלה קובץ Excel עם הזמנות לקוח. עמודות: מס. לקוח, שם לקוח, הזמנה (אס-או), תאריך, מס' הזמנה זבילו, מק'ט,
                תאור מוצר, מחיר ליחידה, עלות, כמות, ספק מועדף, שם ספק. ספק מועדף מופץ אוטומטית לכל שורות אותו אס-או.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFile}
                  className="block w-full text-sm border rounded-lg p-3 bg-muted cursor-pointer"
                />
                {fileName && <p className="text-sm text-muted-foreground mt-1">קובץ: {fileName}</p>}
              </div>
              {parsedData.length > 0 && (
                <>
                  <p className="text-sm font-medium">{parsedData.length} שורות נקראו. תצוגה מקדימה:</p>
                  <div className="overflow-auto max-h-[300px] border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {headers.map((h) => (
                            <TableHead key={h}>{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedData.slice(0, 10).map((row, i) => (
                          <TableRow key={i}>
                            {headers.map((h) => (
                              <TableCell key={h}>{row[h]?.toString() || ""}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button onClick={() => uploadSales.mutate()} disabled={isUploading} className="gap-2">
                    <UploadIcon className="w-4 h-4" />
                    {isUploading ? "מעלה..." : `העלה ${parsedData.length} רשומות מכירה`}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
