import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { formatDate } from "@/lib/formatDate";
import * as XLSX from "xlsx";

export default function Errors() {
  const { data: orphanPurchases } = useQuery({
    queryKey: ["orphan-purchases"],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_records")
        .select("*")
        .is("supplier_id", null)
        .is("supplier_name", null)
        .not("item_description", "ilike", "%הובלה%")
        .order("order_date", { ascending: false });
      return data || [];
    },
  });

  const { data: orphanSales } = useQuery({
    queryKey: ["orphan-sales"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_records")
        .select("*")
        .is("supplier_id", null)
        .is("supplier_name", null)
        .not("item_description", "ilike", "%הובלה%")
        .order("sale_date", { ascending: false });
      return data || [];
    },
  });

  const exportToExcel = () => {
    const purchaseRows = (orphanPurchases || []).map((r) => ({
      "תאריך": r.order_date ? formatDate(r.order_date) : "",
      "מס׳ הזמנה": r.order_number || "",
      "מס׳ ספק (מקור)": r.supplier_number || "",
      "מק״ט": r.item_code || "",
      "תיאור פריט": r.item_description || "",
      "סכום": r.total_amount || 0,
    }));
    const salesRows = (orphanSales || []).map((r) => ({
      "תאריך": r.sale_date ? formatDate(r.sale_date) : "",
      "מס׳ הזמנה": r.order_number || "",
      "לקוח": r.customer_name || "",
      "מק״ט": r.item_code || "",
      "תיאור פריט": r.item_description || "",
    }));
    const wb = XLSX.utils.book_new();
    if (purchaseRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchaseRows), "רכשים ללא ספק");
    if (salesRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesRows), "מכירות ללא ספק");
    if (!purchaseRows.length && !salesRows.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ "הודעה": "אין שגויים" }]), "ריק");
    }
    XLSX.writeFile(wb, "שגויים.xlsx");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">שגויים</h1>
          <p className="text-muted-foreground">רכשים והזמנות שלא שויכו לספק במערכת</p>
        </div>
        <Button variant="outline" onClick={exportToExcel}>
          <Download className="h-4 w-4 ml-2" />
          ייצוא לאקסל
        </Button>
      </div>

      <Tabs defaultValue="purchases" dir="rtl">
        <TabsList>
          <TabsTrigger value="purchases">רכשים ללא ספק ({orphanPurchases?.length || 0})</TabsTrigger>
          <TabsTrigger value="sales">מכירות ללא ספק ({orphanSales?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="purchases">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תאריך</TableHead>
                    <TableHead>מס׳ הזמנה</TableHead>
                    <TableHead>מס׳ ספק (מקור)</TableHead>
                    <TableHead>מק״ט</TableHead>
                    <TableHead>תיאור פריט</TableHead>
                    <TableHead>סכום</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!orphanPurchases?.length ? (
                   <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">אין רכשים שגויים 🎉</TableCell></TableRow>
                  ) : (
                    orphanPurchases.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.order_date ? formatDate(r.order_date) : "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.order_number || "-"}</TableCell>
                        <TableCell>{r.supplier_number || "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.item_code || "-"}</TableCell>
                        <TableCell>{r.item_description || "-"}</TableCell>
                        <TableCell>₪{(r.total_amount || 0).toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תאריך</TableHead>
                    <TableHead>מס׳ הזמנה</TableHead>
                    <TableHead>לקוח</TableHead>
                    <TableHead>מק״ט</TableHead>
                    <TableHead>תיאור פריט</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!orphanSales?.length ? (
                   <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">אין מכירות שגויות 🎉</TableCell></TableRow>
                  ) : (
                    orphanSales.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.sale_date ? formatDate(r.sale_date) : "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.order_number || "-"}</TableCell>
                        <TableCell>{r.customer_name || "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.item_code || "-"}</TableCell>
                        <TableCell>{r.item_description || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
