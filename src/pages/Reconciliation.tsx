import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle, XCircle, AlertTriangle, FileCheck } from "lucide-react";
import FileUploadPreview from "@/components/FileUploadPreview";
import { parseDate, type ParsedFile } from "@/lib/parseExcelFile";

const fmtNum = (n: number | null) => n != null ? n.toLocaleString("he-IL", { maximumFractionDigits: 2 }) : "—";
const roundAgora = (n: number) => Math.round(n * 100) / 100;

type MatchStatus = "matched" | "mismatch" | "approved" | "missing";

interface ReconciliationRow {
  key: string;
  poNumber: string;
  supplierName: string;
  documentValue: number;
  referenceValue: number;
  diff: number;
  status: MatchStatus;
  details?: string;
}

export default function ReconciliationPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("upload");

  // Fetch all data
  const { data: purchaseRecords } = useQuery({
    queryKey: ["purchases-all-recon"],
    queryFn: async () => {
      const { data } = await supabase.from("purchase_records").select("*");
      return data || [];
    },
  });

  const { data: salesRecords } = useQuery({
    queryKey: ["sales-all-recon"],
    queryFn: async () => {
      const { data } = await supabase.from("sales_records").select("*");
      return data || [];
    },
  });

  const { data: supplierInvoices } = useQuery({
    queryKey: ["supplier-invoices"],
    queryFn: async () => {
      const { data } = await supabase.from("supplier_invoice_items").select("*");
      return data || [];
    },
  });

  const { data: deliveryNotes } = useQuery({
    queryKey: ["delivery-notes"],
    queryFn: async () => {
      const { data } = await supabase.from("delivery_note_items").select("*");
      return data || [];
    },
  });

  const { data: consolidatedInvoices } = useQuery({
    queryKey: ["consolidated-invoices"],
    queryFn: async () => {
      const { data } = await supabase.from("consolidated_invoice_items").select("*");
      return data || [];
    },
  });

  const { data: approvals } = useQuery({
    queryKey: ["reconciliation-approvals"],
    queryFn: async () => {
      const { data } = await supabase.from("reconciliation_approvals").select("*");
      return data || [];
    },
  });

  // Upload mutations
  const uploadMutation = (table: string, queryKey: string) => useMutation({
    mutationFn: async (records: any[]) => {
      // Delete existing
      await (supabase as any).from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      const chunkSize = 100;
      for (let i = 0; i < records.length; i += chunkSize) {
        const { error } = await (supabase as any).from(table).insert(records.slice(i, i + chunkSize));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast.success("הנתונים הועלו בהצלחה");
    },
    onError: (e: Error) => toast.error("שגיאה: " + e.message),
  });

  const uploadSupplierInvoices = uploadMutation("supplier_invoice_items", "supplier-invoices");
  const uploadDeliveryNotes = uploadMutation("delivery_note_items", "delivery-notes");
  const uploadConsolidated = uploadMutation("consolidated_invoice_items", "consolidated-invoices");

  const handleUploadSupplierInvoices = (parsed: ParsedFile) => {
    const batch = new Date().toISOString();
    const records = parsed.data.map((row) => ({
      invoice_number: (row["מספר חשבונית"] || "")?.toString().trim() || null,
      internal_number: (row["מס. פנימי"] || "")?.toString().trim() || null,
      po_number: (row["הזמנה"] || "")?.toString().trim() || null,
      supplier_number: (row["מס' ספק"] || row["מס ספק"] || "")?.toString().trim() || null,
      supplier_name: (row["שם ספק"] || "")?.toString().trim() || null,
      invoice_date: parseDate(row["תאריך"]),
      total_payment: parseFloat(row["סה'כ לתשלום"] || row["סה\"כ לתשלום"] || "0") || 0,
      item_code: (row["מק'ט"] || row["מק\"ט"] || "")?.toString().trim() || null,
      item_description: (row["תאור מוצר"] || "")?.toString().trim() || null,
      quantity: parseFloat(row["כמות"] || row["כמות פריטים"] || "1") || 1,
      unit_price: parseFloat(row["מחיר ליחידה"] || "0") || 0,
      total_with_vat: parseFloat(row["סה'כ כולל מע'מ"] || row["סה\"כ כולל מע\"מ"] || "0") || 0,
      status: (row["סטטוס"] || "")?.toString().trim() || null,
      upload_batch: batch,
    }));
    uploadSupplierInvoices.mutate(records);
  };

  const handleUploadDeliveryNotes = (parsed: ParsedFile) => {
    const batch = new Date().toISOString();
    const records = parsed.data.map((row) => ({
      note_number: (row["תעודה"] || "")?.toString().trim() || null,
      order_number: (row["הזמנה"] || "")?.toString().trim() || null,
      supplier_number: (row["מס' ספק"] || row["מס ספק"] || "")?.toString().trim() || null,
      supplier_name: (row["שם ספק"] || "")?.toString().trim() || null,
      customer_name: (row["שם לקוח"] || "")?.toString().trim() || null,
      item_code: (row["מק'ט"] || row["מק\"ט"] || "")?.toString().trim() || null,
      item_description: (row["תאור מוצר"] || "")?.toString().trim() || null,
      quantity: parseFloat(row["כמות פריטים"] || row["כמות"] || "1") || 1,
      total_price: parseFloat(row["מחיר סופי"] || "0") || 0,
      status: (row["סטטוס"] || "")?.toString().trim() || null,
      note_date: parseDate(row["תאריך"]),
      upload_batch: batch,
    }));
    uploadDeliveryNotes.mutate(records);
  };

  const handleUploadConsolidated = (parsed: ParsedFile) => {
    const batch = new Date().toISOString();
    const records = parsed.data.map((row) => ({
      invoice_number: (row["מספר חשבונית"] || "")?.toString().trim() || null,
      internal_number: (row["מס. פנימי"] || "")?.toString().trim() || null,
      po_number: (row["הזמנה"] || "")?.toString().trim() || null,
      gr_number: (row["תעודה"] || "")?.toString().trim() || null,
      supplier_number: (row["מס' ספק"] || row["מס ספק"] || "")?.toString().trim() || null,
      supplier_name: (row["שם ספק"] || "")?.toString().trim() || null,
      invoice_date: parseDate(row["תאריך"]),
      item_code: (row["מק'ט"] || row["מק\"ט"] || "")?.toString().trim() || null,
      item_description: (row["תאור מוצר"] || "")?.toString().trim() || null,
      unit_price: parseFloat(row["מחיר ליחידה"] || "0") || 0,
      quantity: parseFloat(row["כמות בחשבונית"] || row["כמות"] || "1") || 1,
      total_with_vat: parseFloat(row["סה'כ כולל מע'מ"] || row["סה\"כ כולל מע\"מ"] || "0") || 0,
      status: (row["סטטוס"] || "")?.toString().trim() || null,
      upload_batch: batch,
    }));
    uploadConsolidated.mutate(records);
  };

  // Approval mutation
  const approveMismatch = useMutation({
    mutationFn: async (row: ReconciliationRow & { matchType: string; documentType: string }) => {
      const { error } = await supabase.from("reconciliation_approvals").upsert({
        match_type: row.matchType,
        match_key: row.key,
        document_type: row.documentType,
        original_value: row.documentValue,
        matched_value: row.referenceValue,
      }, { onConflict: "match_type,match_key,document_type" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation-approvals"] });
      toast.success("האישור נשמר");
    },
    onError: (e: Error) => toast.error("שגיאה: " + e.message),
  });

  // ===== MATCHING LOGIC =====

  // 1. Standard: PO -> Supplier Invoice (amount matching)
  const standardMatches = (): ReconciliationRow[] => {
    if (!purchaseRecords || !supplierInvoices) return [];
    const approvalSet = new Set(approvals?.filter(a => a.match_type === "standard").map(a => a.match_key) || []);

    // Group purchases by PO
    const poTotals = new Map<string, { total: number; supplier: string }>();
    purchaseRecords.forEach((pr) => {
      if (!pr.order_number) return;
      const existing = poTotals.get(pr.order_number);
      poTotals.set(pr.order_number, {
        total: (existing?.total || 0) + (pr.total_amount || 0),
        supplier: existing?.supplier || pr.supplier_name || "",
      });
    });

    // Group invoices by PO (total_payment is document-level, take first)
    const invoiceTotals = new Map<string, number>();
    const invoiceByPO = new Map<string, Set<string>>();
    supplierInvoices.forEach((inv) => {
      if (!inv.po_number) return;
      // total_payment is the invoice total, same for all lines of the same internal_number
      if (!invoiceByPO.has(inv.po_number)) invoiceByPO.set(inv.po_number, new Set());
      if (inv.internal_number && !invoiceByPO.get(inv.po_number)!.has(inv.internal_number)) {
        invoiceByPO.get(inv.po_number)!.add(inv.internal_number);
        invoiceTotals.set(inv.po_number, (invoiceTotals.get(inv.po_number) || 0) + (inv.total_payment || 0));
      }
    });

    const rows: ReconciliationRow[] = [];
    poTotals.forEach((purchase, po) => {
      const invoiceTotal = invoiceTotals.get(po);
      if (invoiceTotal === undefined) {
        rows.push({
          key: po,
          poNumber: po,
          supplierName: purchase.supplier,
          documentValue: roundAgora(purchase.total),
          referenceValue: 0,
          diff: roundAgora(purchase.total),
          status: "missing",
        });
      } else {
        const diff = roundAgora(roundAgora(purchase.total) - roundAgora(invoiceTotal));
        const isApproved = approvalSet.has(po);
        rows.push({
          key: po,
          poNumber: po,
          supplierName: purchase.supplier,
          documentValue: roundAgora(purchase.total),
          referenceValue: roundAgora(invoiceTotal),
          diff,
          status: diff === 0 ? "matched" : isApproved ? "approved" : "mismatch",
        });
      }
    });

    // Check for invoices without matching PO
    invoiceTotals.forEach((total, po) => {
      if (!poTotals.has(po)) {
        rows.push({
          key: po,
          poNumber: po,
          supplierName: "",
          documentValue: 0,
          referenceValue: roundAgora(total),
          diff: roundAgora(-total),
          status: "missing",
          details: "חשבונית ללא PO מתאים",
        });
      }
    });

    return rows.sort((a, b) => {
      const order: Record<MatchStatus, number> = { mismatch: 0, missing: 1, approved: 2, matched: 3 };
      return order[a.status] - order[b.status];
    });
  };

  // 2. Delivery: SO -> Delivery Note (quantity matching)
  const deliveryMatches = (): ReconciliationRow[] => {
    if (!salesRecords || !deliveryNotes) return [];
    const approvalSet = new Set(approvals?.filter(a => a.match_type === "delivery").map(a => a.match_key) || []);

    // Group sales by SO
    const soQty = new Map<string, { qty: number; supplier: string }>();
    salesRecords.forEach((sr) => {
      if (!sr.order_number) return;
      const existing = soQty.get(sr.order_number);
      soQty.set(sr.order_number, {
        qty: (existing?.qty || 0) + (sr.quantity || 0),
        supplier: existing?.supplier || sr.supplier_name || "",
      });
    });

    // Group delivery notes by SO
    const noteQty = new Map<string, number>();
    deliveryNotes.forEach((dn) => {
      if (!dn.order_number) return;
      noteQty.set(dn.order_number, (noteQty.get(dn.order_number) || 0) + (dn.quantity || 0));
    });

    const rows: ReconciliationRow[] = [];
    soQty.forEach((sale, so) => {
      const noteTotal = noteQty.get(so);
      if (noteTotal === undefined) {
        rows.push({
          key: so,
          poNumber: so,
          supplierName: sale.supplier,
          documentValue: sale.qty,
          referenceValue: 0,
          diff: sale.qty,
          status: "missing",
          details: "אין תעודת משלוח",
        });
      } else {
        const diff = roundAgora(sale.qty - noteTotal);
        const isApproved = approvalSet.has(so);
        rows.push({
          key: so,
          poNumber: so,
          supplierName: sale.supplier,
          documentValue: sale.qty,
          referenceValue: noteTotal,
          diff,
          status: diff === 0 ? "matched" : isApproved ? "approved" : "mismatch",
        });
      }
    });

    return rows.sort((a, b) => {
      const order: Record<MatchStatus, number> = { mismatch: 0, missing: 1, approved: 2, matched: 3 };
      return order[a.status] - order[b.status];
    });
  };

  // 3. Inventory: PO -> GR -> Consolidated Invoice
  const inventoryMatches = (): ReconciliationRow[] => {
    if (!purchaseRecords || !consolidatedInvoices) return [];
    const approvalSet = new Set(approvals?.filter(a => a.match_type === "inventory").map(a => a.match_key) || []);

    // Consolidated invoices WITH GR and WITH PO
    const consolidatedByPO = new Map<string, { total: number; supplier: string; hasGR: boolean }>();
    consolidatedInvoices.forEach((ci) => {
      const po = ci.po_number;
      if (!po) return;
      const existing = consolidatedByPO.get(po);
      consolidatedByPO.set(po, {
        total: (existing?.total || 0) + (ci.total_with_vat || 0),
        supplier: existing?.supplier || ci.supplier_name || "",
        hasGR: existing?.hasGR || !!ci.gr_number,
      });
    });

    // Purchases by PO
    const poTotals = new Map<string, { total: number; supplier: string }>();
    purchaseRecords.forEach((pr) => {
      if (!pr.order_number) return;
      const existing = poTotals.get(pr.order_number);
      poTotals.set(pr.order_number, {
        total: (existing?.total || 0) + (pr.total_amount || 0),
        supplier: existing?.supplier || pr.supplier_name || "",
      });
    });

    const rows: ReconciliationRow[] = [];
    consolidatedByPO.forEach((ci, po) => {
      const purchase = poTotals.get(po);
      const purchaseTotal = purchase?.total || 0;
      const diff = roundAgora(roundAgora(purchaseTotal) - roundAgora(ci.total));
      const isApproved = approvalSet.has(po);
      rows.push({
        key: po,
        poNumber: po,
        supplierName: ci.supplier,
        documentValue: roundAgora(purchaseTotal),
        referenceValue: roundAgora(ci.total),
        diff,
        status: diff === 0 ? "matched" : isApproved ? "approved" : "mismatch",
        details: ci.hasGR ? "כולל GR" : "ללא GR",
      });
    });

    // Consolidated without PO (inventory replenishment)
    const noPOConsolidated = new Map<string, { total: number; supplier: string }>();
    consolidatedInvoices.forEach((ci) => {
      if (ci.po_number) return;
      const key = ci.internal_number || ci.invoice_number || "unknown";
      const existing = noPOConsolidated.get(key);
      noPOConsolidated.set(key, {
        total: (existing?.total || 0) + (ci.total_with_vat || 0),
        supplier: existing?.supplier || ci.supplier_name || "",
      });
    });

    noPOConsolidated.forEach((ci, key) => {
      rows.push({
        key,
        poNumber: "—",
        supplierName: ci.supplier,
        documentValue: 0,
        referenceValue: roundAgora(ci.total),
        diff: roundAgora(-ci.total),
        status: approvalSet.has(key) ? "approved" : "mismatch",
        details: "חשבונית מרכזת ללא PO",
      });
    });

    return rows.sort((a, b) => {
      const order: Record<MatchStatus, number> = { mismatch: 0, missing: 1, approved: 2, matched: 3 };
      return order[a.status] - order[b.status];
    });
  };

  const stdRows = standardMatches();
  const delRows = deliveryMatches();
  const invRows = inventoryMatches();

  const isUploading = uploadSupplierInvoices.isPending || uploadDeliveryNotes.isPending || uploadConsolidated.isPending;

  const statusBadge = (status: MatchStatus) => {
    switch (status) {
      case "matched": return <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]"><CheckCircle className="w-3 h-3 ml-1" />תקין</Badge>;
      case "approved": return <Badge variant="outline" className="border-[hsl(var(--success))] text-[hsl(var(--success))]"><CheckCircle className="w-3 h-3 ml-1" />אושר</Badge>;
      case "mismatch": return <Badge variant="destructive"><XCircle className="w-3 h-3 ml-1" />חריגה</Badge>;
      case "missing": return <Badge variant="secondary"><AlertTriangle className="w-3 h-3 ml-1" />חסר</Badge>;
    }
  };

  const countByStatus = (rows: ReconciliationRow[]) => ({
    matched: rows.filter(r => r.status === "matched").length,
    approved: rows.filter(r => r.status === "approved").length,
    mismatch: rows.filter(r => r.status === "mismatch").length,
    missing: rows.filter(r => r.status === "missing").length,
  });

  const renderSummaryCards = (rows: ReconciliationRow[]) => {
    const c = countByStatus(rows);
    return (
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-[hsl(var(--success))]">{c.matched}</p><p className="text-xs text-muted-foreground">תקין</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-[hsl(var(--success))]">{c.approved}</p><p className="text-xs text-muted-foreground">אושר</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-destructive">{c.mismatch}</p><p className="text-xs text-muted-foreground">חריגה</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-muted-foreground">{c.missing}</p><p className="text-xs text-muted-foreground">חסר</p></CardContent></Card>
      </div>
    );
  };

  const renderTable = (rows: ReconciliationRow[], matchType: string, docType: string, colA: string, colB: string) => (
    <div className="overflow-auto border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>מספר מסמך</TableHead>
            <TableHead>ספק</TableHead>
            <TableHead>{colA}</TableHead>
            <TableHead>{colB}</TableHead>
            <TableHead>הפרש</TableHead>
            <TableHead>סטטוס</TableHead>
            <TableHead>הערות</TableHead>
            <TableHead>פעולה</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">אין נתונים להתאמה</TableCell></TableRow>
          ) : rows.map((row) => (
            <TableRow key={row.key} className={row.status === "mismatch" ? "bg-destructive/5" : ""}>
              <TableCell className="font-mono text-sm">{row.poNumber}</TableCell>
              <TableCell>{row.supplierName}</TableCell>
              <TableCell>{fmtNum(row.documentValue)}</TableCell>
              <TableCell>{fmtNum(row.referenceValue)}</TableCell>
              <TableCell className={row.diff !== 0 ? "text-destructive font-medium" : "text-[hsl(var(--success))]"}>
                {fmtNum(row.diff)}
              </TableCell>
              <TableCell>{statusBadge(row.status)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{row.details || ""}</TableCell>
              <TableCell>
                {row.status === "mismatch" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => approveMismatch.mutate({ ...row, matchType, documentType: docType })}
                    disabled={approveMismatch.isPending}
                  >
                    אשר
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <FileCheck className="w-8 h-8" />
        התאמת מסמכים
      </h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="upload">העלאת גליונות</TabsTrigger>
          <TabsTrigger value="standard">סטנדרטי (PO↔חשבונית)</TabsTrigger>
          <TabsTrigger value="delivery">משלוחים (SO↔תעודה)</TabsTrigger>
          <TabsTrigger value="inventory">מלאי (PO↔GR↔מרכזת)</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <FileUploadPreview
            title="חשבוניות ספק"
            description="העמודות: תאריך, הזמנה (PO), סטטוס, מס' ספק, שם ספק, מספר חשבונית, מס. פנימי, סה'כ לתשלום, מק'ט, תאור מוצר, כמות, מחיר ליחידה, סה'כ כולל מע'מ."
            buttonLabel="העלה חשבוניות ספק"
            onUpload={handleUploadSupplierInvoices}
            isUploading={isUploading}
          />
          <FileUploadPreview
            title="תעודות משלוח"
            description="העמודות: תעודה (SH), הזמנה (SO), כמות פריטים, מחיר סופי, סטטוס."
            buttonLabel="העלה תעודות משלוח"
            onUpload={handleUploadDeliveryNotes}
            isUploading={isUploading}
          />
          <FileUploadPreview
            title="חשבוניות ספק מרכזות (כולל GR)"
            description="העמודות: תאריך, הזמנה (PO), סטטוס, שם ספק, מס' ספק, מספר חשבונית, מס. פנימי, תעודה (GR), מק'ט, תאור מוצר, מחיר ליחידה, כמות בחשבונית, סה'כ כולל מע'מ."
            buttonLabel="העלה חשבוניות מרכזות"
            onUpload={handleUploadConsolidated}
            isUploading={isUploading}
          />
        </TabsContent>

        <TabsContent value="standard">
          <Card>
            <CardHeader>
              <CardTitle>התאמת PO ↔ חשבונית ספק</CardTitle>
            </CardHeader>
            <CardContent>
              {renderSummaryCards(stdRows)}
              {renderTable(stdRows, "standard", "supplier_invoice", "סכום רכש (PO)", "סכום חשבונית")}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="delivery">
          <Card>
            <CardHeader>
              <CardTitle>התאמת SO ↔ תעודת משלוח (כמויות)</CardTitle>
            </CardHeader>
            <CardContent>
              {renderSummaryCards(delRows)}
              {renderTable(delRows, "delivery", "delivery_note", "כמות מכירה (SO)", "כמות תעודה")}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory">
          <Card>
            <CardHeader>
              <CardTitle>התאמת PO ↔ GR ↔ חשבונית מרכזת</CardTitle>
            </CardHeader>
            <CardContent>
              {renderSummaryCards(invRows)}
              {renderTable(invRows, "inventory", "consolidated_invoice", "סכום רכש (PO)", "סכום חשבונית מרכזת")}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
