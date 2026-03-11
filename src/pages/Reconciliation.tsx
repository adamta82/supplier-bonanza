import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle, XCircle, AlertTriangle, FileCheck, ChevronDown, ChevronLeft } from "lucide-react";
import FileUploadPreview from "@/components/FileUploadPreview";
import { parseDate, type ParsedFile } from "@/lib/parseExcelFile";
import { formatDate } from "@/lib/formatDate";

const fmtNum = (n: number | null) => n != null ? Math.round(n).toLocaleString("he-IL") : "—";
const fmtDiff = (n: number | null) => n != null ? (n > 0 ? "+" : "") + Math.round(n).toLocaleString("he-IL") : "—";
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
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
      const { data } = await (supabase as any).from("supplier_invoice_items").select("*");
      return data || [];
    },
  });

  const { data: deliveryNotes } = useQuery({
    queryKey: ["delivery-notes"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("delivery_note_items").select("*");
      return data || [];
    },
  });

  const { data: consolidatedInvoices } = useQuery({
    queryKey: ["consolidated-invoices"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("consolidated_invoice_items").select("*");
      return data || [];
    },
  });

  const { data: approvals } = useQuery({
    queryKey: ["reconciliation-approvals"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("reconciliation_approvals").select("*");
      return data || [];
    },
  });

  // Upload mutations
  const uploadMutation = (table: string, queryKey: string) => useMutation({
    mutationFn: async (records: any[]) => {
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
      const { error } = await (supabase as any).from("reconciliation_approvals").upsert({
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

  const standardMatches = (): ReconciliationRow[] => {
    if (!purchaseRecords || !supplierInvoices) return [];
    const approvalSet = new Set(approvals?.filter((a: any) => a.match_type === "standard").map((a: any) => a.match_key) || []);

    const poTotals = new Map<string, { total: number; supplier: string }>();
    purchaseRecords.forEach((pr) => {
      if (!pr.order_number) return;
      const existing = poTotals.get(pr.order_number);
      const amountWithVat = (pr.total_amount || 0) * 1.18;
      poTotals.set(pr.order_number, {
        total: (existing?.total || 0) + amountWithVat,
        supplier: existing?.supplier || pr.supplier_name || "",
      });
    });

    const invoiceTotals = new Map<string, number>();
    const invoiceByPO = new Map<string, Set<string>>();
    supplierInvoices.forEach((inv: any) => {
      if (!inv.po_number) return;
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
        rows.push({ key: po, poNumber: po, supplierName: purchase.supplier, documentValue: roundAgora(purchase.total), referenceValue: 0, diff: roundAgora(purchase.total), status: "missing" });
      } else {
        const diff = roundAgora(roundAgora(purchase.total) - roundAgora(invoiceTotal));
        rows.push({ key: po, poNumber: po, supplierName: purchase.supplier, documentValue: roundAgora(purchase.total), referenceValue: roundAgora(invoiceTotal), diff, status: diff === 0 ? "matched" : approvalSet.has(po) ? "approved" : "mismatch" });
      }
    });

    invoiceTotals.forEach((total, po) => {
      if (!poTotals.has(po)) {
        rows.push({ key: po, poNumber: po, supplierName: "", documentValue: 0, referenceValue: roundAgora(total), diff: roundAgora(-total), status: "missing", details: "חשבונית ללא PO מתאים" });
      }
    });

    return rows.sort((a, b) => {
      const order: Record<MatchStatus, number> = { mismatch: 0, missing: 1, approved: 2, matched: 3 };
      return order[a.status] - order[b.status];
    });
  };

  const deliveryMatches = (): ReconciliationRow[] => {
    if (!salesRecords || !deliveryNotes) return [];
    const approvalSet = new Set(approvals?.filter((a: any) => a.match_type === "delivery").map((a: any) => a.match_key) || []);

    const soQty = new Map<string, { qty: number; supplier: string }>();
    salesRecords.forEach((sr) => {
      if (!sr.order_number) return;
      const existing = soQty.get(sr.order_number);
      soQty.set(sr.order_number, { qty: (existing?.qty || 0) + (sr.quantity || 0), supplier: existing?.supplier || sr.supplier_name || "" });
    });

    const noteQty = new Map<string, number>();
    deliveryNotes.forEach((dn: any) => {
      if (!dn.order_number) return;
      noteQty.set(dn.order_number, (noteQty.get(dn.order_number) || 0) + (dn.quantity || 0));
    });

    const rows: ReconciliationRow[] = [];
    soQty.forEach((sale, so) => {
      const noteTotal = noteQty.get(so);
      if (noteTotal === undefined) {
        rows.push({ key: so, poNumber: so, supplierName: sale.supplier, documentValue: sale.qty, referenceValue: 0, diff: sale.qty, status: "missing", details: "אין תעודת משלוח" });
      } else {
        const diff = roundAgora(sale.qty - noteTotal);
        rows.push({ key: so, poNumber: so, supplierName: sale.supplier, documentValue: sale.qty, referenceValue: noteTotal, diff, status: diff === 0 ? "matched" : approvalSet.has(so) ? "approved" : "mismatch" });
      }
    });

    return rows.sort((a, b) => {
      const order: Record<MatchStatus, number> = { mismatch: 0, missing: 1, approved: 2, matched: 3 };
      return order[a.status] - order[b.status];
    });
  };

  const inventoryMatches = (): ReconciliationRow[] => {
    if (!purchaseRecords || !consolidatedInvoices) return [];
    const approvalSet = new Set(approvals?.filter((a: any) => a.match_type === "inventory").map((a: any) => a.match_key) || []);

    const consolidatedByPO = new Map<string, { total: number; supplier: string; hasGR: boolean }>();
    consolidatedInvoices.forEach((ci: any) => {
      const po = ci.po_number;
      if (!po) return;
      const existing = consolidatedByPO.get(po);
      consolidatedByPO.set(po, { total: (existing?.total || 0) + (ci.total_with_vat || 0), supplier: existing?.supplier || ci.supplier_name || "", hasGR: existing?.hasGR || !!ci.gr_number });
    });

    const poTotals = new Map<string, { total: number; supplier: string }>();
    purchaseRecords.forEach((pr) => {
      if (!pr.order_number) return;
      const existing = poTotals.get(pr.order_number);
      poTotals.set(pr.order_number, { total: (existing?.total || 0) + (pr.total_amount || 0), supplier: existing?.supplier || pr.supplier_name || "" });
    });

    const rows: ReconciliationRow[] = [];
    consolidatedByPO.forEach((ci, po) => {
      const purchase = poTotals.get(po);
      const purchaseTotal = purchase?.total || 0;
      const diff = roundAgora(roundAgora(purchaseTotal) - roundAgora(ci.total));
      rows.push({ key: po, poNumber: po, supplierName: ci.supplier, documentValue: roundAgora(purchaseTotal), referenceValue: roundAgora(ci.total), diff, status: diff === 0 ? "matched" : approvalSet.has(po) ? "approved" : "mismatch", details: ci.hasGR ? "כולל GR" : "ללא GR" });
    });

    const noPOConsolidated = new Map<string, { total: number; supplier: string }>();
    consolidatedInvoices.forEach((ci: any) => {
      if (ci.po_number) return;
      const key = ci.internal_number || ci.invoice_number || "unknown";
      const existing = noPOConsolidated.get(key);
      noPOConsolidated.set(key, { total: (existing?.total || 0) + (ci.total_with_vat || 0), supplier: existing?.supplier || ci.supplier_name || "" });
    });

    noPOConsolidated.forEach((ci, key) => {
      rows.push({ key, poNumber: "—", supplierName: ci.supplier, documentValue: 0, referenceValue: roundAgora(ci.total), diff: roundAgora(-ci.total), status: approvalSet.has(key) ? "approved" : "mismatch", details: "חשבונית מרכזת ללא PO" });
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

  // ===== DRILL-DOWN DETAILS =====

  const renderStandardDrillDown = (poNumber: string) => {
    const poItems = purchaseRecords?.filter(pr => pr.order_number === poNumber) || [];
    const invItems = supplierInvoices?.filter((inv: any) => inv.po_number === poNumber) || [];

    return (
      <div className="p-4 bg-muted/30 space-y-4">
        {/* Purchase records (PO lines) */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">📦 שורות רכש (PO: {poNumber})</h4>
          {poItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">אין רשומות רכש עבור PO זה</p>
          ) : (
            <div className="overflow-auto border rounded-lg bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תאריך</TableHead>
                    <TableHead>מק״ט</TableHead>
                    <TableHead>תיאור</TableHead>
                    <TableHead>ספק</TableHead>
                    <TableHead>כמות</TableHead>
                    <TableHead>מחיר יחידה</TableHead>
                    <TableHead>סה״כ</TableHead>
                    <TableHead>קטגוריה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {poItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs">{item.order_date ? formatDate(item.order_date) : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{item.item_code || "—"}</TableCell>
                      <TableCell className="text-xs">{item.item_description || "—"}</TableCell>
                      <TableCell className="text-xs">{item.supplier_name || "—"}</TableCell>
                      <TableCell className="text-xs">{fmtNum(item.quantity)}</TableCell>
                      <TableCell className="text-xs">{fmtNum(item.unit_price)}</TableCell>
                      <TableCell className="text-xs font-medium">{fmtNum(item.total_amount)}</TableCell>
                      <TableCell className="text-xs">{item.category || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Supplier invoice lines */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">🧾 שורות חשבונית ספק</h4>
          {invItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">אין חשבוניות ספק עבור PO זה</p>
          ) : (
            <div className="overflow-auto border rounded-lg bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תאריך</TableHead>
                    <TableHead>מס׳ חשבונית</TableHead>
                    <TableHead>מס׳ פנימי</TableHead>
                    <TableHead>מק״ט</TableHead>
                    <TableHead>תיאור</TableHead>
                    <TableHead>כמות</TableHead>
                    <TableHead>מחיר יחידה</TableHead>
                    <TableHead>סה״כ כולל מע״מ</TableHead>
                    <TableHead>סה״כ לתשלום</TableHead>
                    <TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invItems.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs">{item.invoice_date ? formatDate(item.invoice_date) : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{item.invoice_number || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{item.internal_number || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{item.item_code || "—"}</TableCell>
                      <TableCell className="text-xs">{item.item_description || "—"}</TableCell>
                      <TableCell className="text-xs">{fmtNum(item.quantity)}</TableCell>
                      <TableCell className="text-xs">{fmtNum(item.unit_price)}</TableCell>
                      <TableCell className="text-xs">{fmtNum(item.total_with_vat)}</TableCell>
                      <TableCell className="text-xs font-medium">{fmtNum(item.total_payment)}</TableCell>
                      <TableCell className="text-xs">{item.status || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDeliveryDrillDown = (soNumber: string) => {
    const soItems = salesRecords?.filter(sr => sr.order_number === soNumber) || [];
    const dnItems = deliveryNotes?.filter((dn: any) => dn.order_number === soNumber) || [];

    return (
      <div className="p-4 bg-muted/30 space-y-4">
        {/* Sales records (SO lines) */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">🛒 שורות מכירה (SO: {soNumber})</h4>
          {soItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">אין רשומות מכירה עבור SO זה</p>
          ) : (
            <div className="overflow-auto border rounded-lg bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תאריך</TableHead>
                    <TableHead>מק״ט</TableHead>
                    <TableHead>תיאור</TableHead>
                    <TableHead>לקוח</TableHead>
                    <TableHead>ספק</TableHead>
                    <TableHead>כמות</TableHead>
                    <TableHead>מחיר מכירה</TableHead>
                    <TableHead>מחיר עלות</TableHead>
                    <TableHead>רווח</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {soItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs">{item.sale_date ? formatDate(item.sale_date) : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{item.item_code || "—"}</TableCell>
                      <TableCell className="text-xs">{item.item_description || "—"}</TableCell>
                      <TableCell className="text-xs">{item.customer_name || "—"}</TableCell>
                      <TableCell className="text-xs">{item.supplier_name || "—"}</TableCell>
                      <TableCell className="text-xs">{fmtNum(item.quantity)}</TableCell>
                      <TableCell className="text-xs">{fmtNum(item.sale_price)}</TableCell>
                      <TableCell className="text-xs">{fmtNum(item.cost_price)}</TableCell>
                      <TableCell className="text-xs font-medium">{fmtNum(item.profit_direct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Delivery note lines */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">🚚 שורות תעודת משלוח</h4>
          {dnItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">אין תעודות משלוח עבור SO זה</p>
          ) : (
            <div className="overflow-auto border rounded-lg bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תאריך</TableHead>
                    <TableHead>מס׳ תעודה</TableHead>
                    <TableHead>מק״ט</TableHead>
                    <TableHead>תיאור</TableHead>
                    <TableHead>לקוח</TableHead>
                    <TableHead>ספק</TableHead>
                    <TableHead>כמות</TableHead>
                    <TableHead>מחיר סופי</TableHead>
                    <TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dnItems.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs">{item.note_date ? formatDate(item.note_date) : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{item.note_number || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{item.item_code || "—"}</TableCell>
                      <TableCell className="text-xs">{item.item_description || "—"}</TableCell>
                      <TableCell className="text-xs">{item.customer_name || "—"}</TableCell>
                      <TableCell className="text-xs">{item.supplier_name || "—"}</TableCell>
                      <TableCell className="text-xs">{fmtNum(item.quantity)}</TableCell>
                      <TableCell className="text-xs">{fmtNum(item.total_price)}</TableCell>
                      <TableCell className="text-xs">{item.status || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderInventoryDrillDown = (poNumber: string) => {
    const poItems = poNumber !== "—" ? (purchaseRecords?.filter(pr => pr.order_number === poNumber) || []) : [];
    const ciItems = poNumber !== "—"
      ? (consolidatedInvoices?.filter((ci: any) => ci.po_number === poNumber) || [])
      : (consolidatedInvoices?.filter((ci: any) => !ci.po_number && (ci.internal_number === poNumber || ci.invoice_number === poNumber)) || []);

    return (
      <div className="p-4 bg-muted/30 space-y-4">
        {/* Purchase records (PO lines) */}
        {poNumber !== "—" && (
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">📦 שורות רכש (PO: {poNumber})</h4>
            {poItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">אין רשומות רכש עבור PO זה</p>
            ) : (
              <div className="overflow-auto border rounded-lg bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>תאריך</TableHead>
                      <TableHead>מק״ט</TableHead>
                      <TableHead>תיאור</TableHead>
                      <TableHead>ספק</TableHead>
                      <TableHead>כמות</TableHead>
                      <TableHead>מחיר יחידה</TableHead>
                      <TableHead>סה״כ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {poItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs">{item.order_date ? formatDate(item.order_date) : "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{item.item_code || "—"}</TableCell>
                        <TableCell className="text-xs">{item.item_description || "—"}</TableCell>
                        <TableCell className="text-xs">{item.supplier_name || "—"}</TableCell>
                        <TableCell className="text-xs">{fmtNum(item.quantity)}</TableCell>
                        <TableCell className="text-xs">{fmtNum(item.unit_price)}</TableCell>
                        <TableCell className="text-xs font-medium">{fmtNum(item.total_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* Consolidated invoice lines */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">🧾 שורות חשבונית מרכזת</h4>
          {ciItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">אין חשבוניות מרכזות</p>
          ) : (
            <div className="overflow-auto border rounded-lg bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תאריך</TableHead>
                    <TableHead>מס׳ חשבונית</TableHead>
                    <TableHead>מס׳ פנימי</TableHead>
                    <TableHead>GR</TableHead>
                    <TableHead>מק״ט</TableHead>
                    <TableHead>תיאור</TableHead>
                    <TableHead>כמות</TableHead>
                    <TableHead>מחיר יחידה</TableHead>
                    <TableHead>סה״כ כולל מע״מ</TableHead>
                    <TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ciItems.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs">{item.invoice_date ? formatDate(item.invoice_date) : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{item.invoice_number || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{item.internal_number || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{item.gr_number || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{item.item_code || "—"}</TableCell>
                      <TableCell className="text-xs">{item.item_description || "—"}</TableCell>
                      <TableCell className="text-xs">{fmtNum(item.quantity)}</TableCell>
                      <TableCell className="text-xs">{fmtNum(item.unit_price)}</TableCell>
                      <TableCell className="text-xs font-medium">{fmtNum(item.total_with_vat)}</TableCell>
                      <TableCell className="text-xs">{item.status || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ===== RENDER TABLE WITH DRILL-DOWN =====

  const renderTable = (rows: ReconciliationRow[], matchType: string, docType: string, colA: string, colB: string, drillDownRenderer: (key: string) => React.ReactNode) => (
    <div className="overflow-auto border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
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
            <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">אין נתונים להתאמה</TableCell></TableRow>
          ) : rows.map((row) => {
            const isExpanded = expandedRows.has(`${matchType}-${row.key}`);
            const rowKey = `${matchType}-${row.key}`;
            return (
              <>
                <TableRow
                  key={row.key}
                  className={`cursor-pointer transition-colors ${row.status === "mismatch" ? "bg-destructive/5" : ""} ${isExpanded ? "bg-accent/50" : "hover:bg-muted/50"}`}
                  onClick={() => toggleRow(rowKey)}
                >
                  <TableCell className="w-8 px-2">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronLeft className="w-4 h-4 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{row.poNumber}</TableCell>
                  <TableCell>{row.supplierName}</TableCell>
                  <TableCell>{fmtNum(row.documentValue)}</TableCell>
                  <TableCell>{fmtNum(row.referenceValue)}</TableCell>
                  <TableCell className={row.diff !== 0 ? "text-destructive font-medium" : "text-[hsl(var(--success))]"}>
                    {fmtDiff(row.diff)}
                  </TableCell>
                  <TableCell>{statusBadge(row.status)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.details || ""}</TableCell>
                  <TableCell>
                    {row.status === "mismatch" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          approveMismatch.mutate({ ...row, matchType, documentType: docType });
                        }}
                        disabled={approveMismatch.isPending}
                      >
                        אשר
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow key={`${row.key}-detail`}>
                    <TableCell colSpan={9} className="p-0">
                      {drillDownRenderer(row.poNumber)}
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })}
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
          <FileUploadPreview title="חשבוניות ספק" description="העמודות: תאריך, הזמנה (PO), סטטוס, מס' ספק, שם ספק, מספר חשבונית, מס. פנימי, סה'כ לתשלום, מק'ט, תאור מוצר, כמות, מחיר ליחידה, סה'כ כולל מע'מ." buttonLabel="העלה חשבוניות ספק" onUpload={handleUploadSupplierInvoices} isUploading={isUploading} />
          <FileUploadPreview title="תעודות משלוח" description="העמודות: תעודה (SH), הזמנה (SO), כמות פריטים, מחיר סופי, סטטוס." buttonLabel="העלה תעודות משלוח" onUpload={handleUploadDeliveryNotes} isUploading={isUploading} />
          <FileUploadPreview title="חשבוניות ספק מרכזות (כולל GR)" description="העמודות: תאריך, הזמנה (PO), סטטוס, שם ספק, מס' ספק, מספר חשבונית, מס. פנימי, תעודה (GR), מק'ט, תאור מוצר, מחיר ליחידה, כמות בחשבונית, סה'כ כולל מע'מ." buttonLabel="העלה חשבוניות מרכזות" onUpload={handleUploadConsolidated} isUploading={isUploading} />
        </TabsContent>

        <TabsContent value="standard">
          <Card>
            <CardHeader><CardTitle>התאמת PO ↔ חשבונית ספק</CardTitle></CardHeader>
            <CardContent>
              {renderSummaryCards(stdRows)}
              {renderTable(stdRows, "standard", "supplier_invoice", "סכום רכש (PO)", "סכום חשבונית", renderStandardDrillDown)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="delivery">
          <Card>
            <CardHeader><CardTitle>התאמת SO ↔ תעודת משלוח (כמויות)</CardTitle></CardHeader>
            <CardContent>
              {renderSummaryCards(delRows)}
              {renderTable(delRows, "delivery", "delivery_note", "כמות מכירה (SO)", "כמות תעודה", renderDeliveryDrillDown)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory">
          <Card>
            <CardHeader><CardTitle>התאמת PO ↔ GR ↔ חשבונית מרכזת</CardTitle></CardHeader>
            <CardContent>
              {renderSummaryCards(invRows)}
              {renderTable(invRows, "inventory", "consolidated_invoice", "סכום רכש (PO)", "סכום חשבונית מרכזת", renderInventoryDrillDown)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
