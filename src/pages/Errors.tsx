import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download, Search, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/formatDate";
import { fmtNum } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export default function Errors() {
  const queryClient = useQueryClient();
  const [resolving, setResolving] = useState(false);

  const handleResolveSuppliers = async () => {
    if (!orphanSales?.length) return;
    const itemCodes = [...new Set(orphanSales.map((r) => r.item_code).filter(Boolean))] as string[];
    if (!itemCodes.length) {
      toast.error("אין מק״טים לבדיקה");
      return;
    }

    setResolving(true);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-suppliers", {
        body: { item_codes: itemCodes },
      });

      if (error) throw error;

      toast.success(`שויכו ${data.resolved} מק״טים לספקים. לא נמצאו: ${data.not_found}`);
      queryClient.invalidateQueries({ queryKey: ["orphan-sales"] });
    } catch (err: any) {
      toast.error("שגיאה בשיוך ספקים: " + (err.message || String(err)));
    } finally {
      setResolving(false);
    }
  };


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

  const { data: orphanSalesRaw } = useQuery({
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

  // שליפת כל האס-אויים השמורים בעמודת customer_po של הרכישות
  const { data: purchaseCustomerPOs } = useQuery({
    queryKey: ["purchase-customer-pos"],
    queryFn: async () => {
      const allPOs: string[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data } = await supabase
          .from("purchase_records")
          .select("customer_po")
          .not("customer_po", "is", null)
          .range(from, from + pageSize - 1);
        if (!data || data.length === 0) break;
        allPOs.push(...data.map((r) => r.customer_po).filter(Boolean) as string[]);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return new Set(allPOs);
    },
  });

  // סינון: הזמנת לקוח ללא ספק שגם האס-או שלה לא מופיע בעמודת customer_po של הרכישות
  const orphanSales = (orphanSalesRaw || []).filter((sale) => {
    if (!sale.order_number) return true;
    return !purchaseCustomerPOs?.has(sale.order_number);
  });

  const exportToExcel = () => {
    const purchaseRows = (orphanPurchases || []).map((r) => ({
      תאריך: r.order_date ? formatDate(r.order_date) : "",
      "מס׳ הזמנה": r.order_number || "",
      "מס׳ ספק (מקור)": r.supplier_number || "",
      "מק״ט": r.item_code || "",
      "תיאור פריט": r.item_description || "",
      סכום: r.total_amount || 0,
    }));
    const salesRows = orphanSales.map((r) => ({
      תאריך: r.sale_date ? formatDate(r.sale_date) : "",
      "מס׳ הזמנה": r.order_number || "",
      לקוח: r.customer_name || "",
      "מק״ט": r.item_code || "",
      "תיאור פריט": r.item_description || "",
    }));
    const wb = XLSX.utils.book_new();
    if (purchaseRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchaseRows), "רכשים ללא ספק");
    if (salesRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesRows), "מכירות ללא ספק");
    if (!purchaseRows.length && !salesRows.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ הודעה: "אין שגויים" }]), "ריק");
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
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        אין רכשים שגויים 🎉
                      </TableCell>
                    </TableRow>
                  ) : (
                    orphanPurchases.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.order_date ? formatDate(r.order_date) : "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.order_number || "-"}</TableCell>
                        <TableCell>{r.supplier_number || "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.item_code || "-"}</TableCell>
                        <TableCell>{r.item_description || "-"}</TableCell>
                        <TableCell>₪{fmtNum(r.total_amount)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales">
          <div className="flex justify-end mb-3">
            <Button
              variant="outline"
              onClick={handleResolveSuppliers}
              disabled={resolving || !orphanSales?.length}
            >
              {resolving ? (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 ml-2" />
              )}
              {resolving ? "מחפש ספקים..." : "חפש ספקים לפי מק״ט"}
            </Button>
          </div>
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
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        אין מכירות שגויות 🎉
                      </TableCell>
                    </TableRow>
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
