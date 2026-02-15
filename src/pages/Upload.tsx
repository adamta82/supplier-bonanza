import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Upload as UploadIcon, FileSpreadsheet, CheckCircle } from "lucide-react";
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
        setParsedData(json.slice(0, 500)); // limit preview
      }
    };
    reader.readAsBinaryString(file);
  }, []);

  const matchSupplier = (name: string | undefined, number: string | undefined) => {
    if (!name && !number) return null;
    const found = suppliers?.find(
      (s) =>
        (number && s.supplier_number === number) ||
        (name && s.name === name)
    );
    return found?.id || null;
  };

  const uploadPurchases = useMutation({
    mutationFn: async () => {
      const batch = new Date().toISOString();
      const records = parsedData.map((row) => {
        const supplierName = row["שם ספק"] || row["supplier_name"] || row["ספק"] || "";
        const supplierNumber = row["מס ספק"] || row["supplier_number"] || row["מספר ספק"] || "";
        return {
          supplier_id: matchSupplier(supplierName, supplierNumber?.toString()),
          supplier_name: supplierName,
          supplier_number: supplierNumber?.toString() || null,
          order_number: (row["מס הזמנה"] || row["order_number"] || "")?.toString() || null,
          order_date: row["תאריך"] || row["order_date"] || null,
          item_code: (row["מק\"ט"] || row["קוד פריט"] || row["item_code"] || "")?.toString() || null,
          item_description: row["תאור פריט"] || row["שם פריט"] || row["item_description"] || null,
          quantity: parseFloat(row["כמות"] || row["quantity"] || "0") || null,
          unit_price: parseFloat(row["מחיר"] || row["מחיר יחידה"] || row["unit_price"] || "0") || null,
          total_amount: parseFloat(row["סכום"] || row["סה\"כ"] || row["total_amount"] || "0") || null,
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
      toast.success(`${parsedData.length} רשומות רכישה הועלו בהצלחה`);
      setParsedData([]);
      setHeaders([]);
      setFileName("");
    },
    onError: (e) => toast.error("שגיאה בהעלאה: " + e.message),
  });

  const uploadSales = useMutation({
    mutationFn: async () => {
      const batch = new Date().toISOString();
      const records = parsedData.map((row) => {
        const supplierName = row["שם ספק"] || row["supplier_name"] || row["ספק"] || "";
        const salePrice = parseFloat(row["מחיר מכירה"] || row["sale_price"] || "0") || 0;
        const costPrice = parseFloat(row["מחיר עלות"] || row["עלות"] || row["cost_price"] || "0") || 0;
        const qty = parseFloat(row["כמות"] || row["quantity"] || "1") || 1;
        return {
          supplier_id: matchSupplier(supplierName, undefined),
          supplier_name: supplierName,
          item_code: (row["מק\"ט"] || row["קוד פריט"] || row["item_code"] || "")?.toString() || null,
          item_description: row["שם פריט"] || row["תאור פריט"] || row["item_description"] || null,
          quantity: qty,
          sale_price: salePrice,
          cost_price: costPrice,
          profit_direct: (salePrice - costPrice) * qty,
          customer_name: row["לקוח"] || row["שם לקוח"] || row["customer_name"] || null,
          sale_date: row["תאריך"] || row["sale_date"] || null,
          category: row["קטגוריה"] || row["category"] || null,
          upload_batch: batch,
        };
      });

      const chunkSize = 100;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { error } = await supabase.from("sales_records").insert(chunk);
        if (error) throw error;
      }
    },
    onSuccess: () => {
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
                העלה קובץ Excel עם פירוט הזמנות רכש. עמודות נפוצות: שם ספק, מס ספק, מק"ט, תאור פריט, כמות, מחיר, סכום
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
                    {isUploading ? "מעלה..." : `העלה ${parsedData.length} רשומות רכישה`}
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
                העלה קובץ Excel עם מכירות לפי פריט. עמודות נפוצות: שם ספק, מק"ט, שם פריט, כמות, מחיר מכירה, מחיר עלות
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
