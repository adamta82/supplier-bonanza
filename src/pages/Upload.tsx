import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Upload as UploadIcon, FileSpreadsheet } from "lucide-react";
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

  // Parse dd/mm/yyyy date to yyyy-mm-dd
  const parseDate = (val: any): string | null => {
    if (!val) return null;
    const s = val.toString().trim();
    // dd/mm/yyyy
    const parts = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (parts) {
      return `${parts[3]}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
    }
    // Already yyyy-mm-dd or ISO
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // Excel serial number
    if (!isNaN(Number(s)) && Number(s) > 40000) {
      const d = new Date((Number(s) - 25569) * 86400 * 1000);
      return d.toISOString().slice(0, 10);
    }
    return null;
  };

  const uploadPurchases = useMutation({
    mutationFn: async () => {
      const batch = new Date().toISOString();

      // Collect unique suppliers from the data
      const supplierMap = new Map<string, string>(); // supplier_number -> name
      parsedData.forEach((row) => {
        const num = (row["מס' ספק"] || row["מס ספק"] || "")?.toString().trim();
        const name = (row["שם ספק"] || row["supplier_name"] || "")?.toString().trim();
        if (num && name) supplierMap.set(num, name);
      });

      // Ensure all suppliers exist
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

      // Re-fetch suppliers to get IDs
      const { data: allSuppliers } = await supabase.from("suppliers").select("id, name, supplier_number");
      const supplierIdMap = new Map<string, string>();
      allSuppliers?.forEach((s) => {
        if (s.supplier_number) supplierIdMap.set(s.supplier_number, s.id);
      });

      // Delete ALL existing purchase records before inserting new ones
      // This preserves supplier data (agreements, obligo, bonus status, etc.)
      const { error: deleteError } = await supabase.from("purchase_records").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (deleteError) throw deleteError;

      // Map rows to purchase records
      const records = parsedData.map((row) => {
        const supplierNumber = (row["מס' ספק"] || row["מס ספק"] || "")?.toString().trim();
        const supplierName = (row["שם ספק"] || row["supplier_name"] || "")?.toString().trim();
        const orderNumber = (row["הזמנה"] || row["order_number"] || "")?.toString().trim();
        const priceILS = parseFloat(row["מחיר סופי בשקלים"] || row["מחיר סופי"] || row["total_amount"] || "0") || 0;

        return {
          supplier_id: supplierIdMap.get(supplierNumber) || null,
          supplier_name: supplierName,
          supplier_number: supplierNumber || null,
          order_number: orderNumber || null,
          order_date: parseDate(row["תאריך"] || row["order_date"]),
          item_code: (row["מק'ט"] || row["מק\"ט"] || row["item_code"] || "")?.toString().trim() || null,
          item_description: (row["תאור מוצר"] || row["תאור פריט"] || row["item_description"] || "")?.toString().trim() || null,
          quantity: parseFloat(row["כמות"] || row["quantity"] || "1") || 1,
          unit_price: parseFloat(row["מחיר סופי"] || row["unit_price"] || "0") || null,
          total_amount: priceILS,
          category: row["קטגוריה"] || row["category"] || null,
          upload_batch: batch,
        };
      });

      // Insert in chunks
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

      // Build a map of SO number -> supplier info by propagating from rows that have a supplier
      const soSupplierMap = new Map<string, { number: string; name: string }>();
      parsedData.forEach((row) => {
        const so = (row["הזמנה"] || row["order_number"] || "")?.toString().trim();
        const suppNum = (row["ספק מועדף"] || row["מס' ספק"] || row["מס ספק"] || "")?.toString().trim();
        const suppName = (row["שם ספק"] || row["supplier_name"] || "")?.toString().trim();
        if (so && suppNum && !soSupplierMap.has(so)) {
          soSupplierMap.set(so, { number: suppNum, name: suppName });
        }
      });

      const records = parsedData.map((row) => {
        const so = (row["הזמנה"] || row["order_number"] || "")?.toString().trim();
        let supplierNumber = (row["ספק מועדף"] || row["מס' ספק"] || row["מס ספק"] || "")?.toString().trim();
        let supplierName = (row["שם ספק"] || row["supplier_name"] || row["ספק"] || "")?.toString().trim();

        // Propagate supplier from SO group if current row has none
        if (!supplierNumber && so && soSupplierMap.has(so)) {
          const mapped = soSupplierMap.get(so)!;
          supplierNumber = mapped.number;
          if (!supplierName) supplierName = mapped.name;
        }

        const salePrice = parseFloat(row["מחיר ליחידה"] || row["מחיר מכירה"] || row["sale_price"] || "0") || 0;
        const costPrice = parseFloat(row["עלות"] || row["מחיר עלות"] || row["cost_price"] || "0") || 0;
        const qty = parseFloat(row["כמות"] || row["quantity"] || "1") || 1;

        const existingSupplier = suppliers?.find(
          (s) => (supplierNumber && s.supplier_number === supplierNumber) || (supplierName && s.name === supplierName)
        );

        return {
          supplier_id: existingSupplier?.id || null,
          supplier_name: supplierName || null,
          item_code: (row["מק'ט"] || row["מק\"ט"] || row["item_code"] || "")?.toString() || null,
          item_description: row["תאור מוצר"] || row["שם פריט"] || row["תאור פריט"] || row["item_description"] || null,
          quantity: qty,
          sale_price: salePrice,
          cost_price: costPrice,
          profit_direct: (salePrice - costPrice) * qty,
          customer_name: row["שם לקוח"] || row["לקוח"] || row["customer_name"] || null,
          sale_date: parseDate(row["תאריך"] || row["sale_date"]),
          category: row["קטגוריה"] || row["category"] || null,
          upload_batch: batch,
        };
      });

      // Delete existing sales before inserting
      const { error: deleteError } = await supabase.from("sales_records").delete().neq("id", "00000000-0000-0000-0000-000000000000");
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

  const isUploading = uploadPurchases.isPending || uploadSales.isPending;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">העלאת נתונים</h1>

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
                העלה קובץ Excel עם הזמנות רכש. עמודות: מס' ספק, שם ספק, הזמנה (PO), תאריך, מק'ט, תאור מוצר, כמות, מחיר סופי בשקלים.
                ספקים חדשים ייווצרו אוטומטית.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="block w-full text-sm border rounded-lg p-3 bg-muted cursor-pointer" />
                {fileName && <p className="text-sm text-muted-foreground mt-1">קובץ: {fileName}</p>}
              </div>
              {parsedData.length > 0 && (
                <>
                  <p className="text-sm font-medium">{parsedData.length} שורות נקראו. תצוגה מקדימה (עד 10):</p>
                  <div className="overflow-auto max-h-[300px] border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {headers.map((h) => <TableHead key={h}>{h}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedData.slice(0, 10).map((row, i) => (
                          <TableRow key={i}>
                            {headers.map((h) => <TableCell key={h}>{row[h]?.toString() || ""}</TableCell>)}
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
                העלה קובץ Excel עם הזמנות לקוח. עמודות: מס. לקוח, שם לקוח, הזמנה (SO), תאריך, מס' הזמנה זבילו, מק'ט, תאור מוצר, מחיר ליחידה, עלות, כמות, ספק מועדף, שם ספק.
                ספק מועדף מופץ אוטומטית לכל שורות אותו SO.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="block w-full text-sm border rounded-lg p-3 bg-muted cursor-pointer" />
                {fileName && <p className="text-sm text-muted-foreground mt-1">קובץ: {fileName}</p>}
              </div>
              {parsedData.length > 0 && (
                <>
                  <p className="text-sm font-medium">{parsedData.length} שורות נקראו. תצוגה מקדימה:</p>
                  <div className="overflow-auto max-h-[300px] border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {headers.map((h) => <TableHead key={h}>{h}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedData.slice(0, 10).map((row, i) => (
                          <TableRow key={i}>
                            {headers.map((h) => <TableCell key={h}>{row[h]?.toString() || ""}</TableCell>)}
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
