import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Pencil, CheckCircle } from "lucide-react";

type SupplierForm = {
  name: string;
  supplier_number: string;
  payment_terms: string;
  shotef: string;
  obligo: string;
  notes: string;
  annual_bonus_status: string;
  reconciliation_date: string;
};

const emptyForm: SupplierForm = { name: "", supplier_number: "", payment_terms: "", shotef: "", obligo: "", notes: "", annual_bonus_status: "pending", reconciliation_date: "" };

export default function Suppliers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch agreements to check which suppliers have them by type
  const { data: agreements } = useQuery({
    queryKey: ["all-agreements-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("bonus_agreements").select("supplier_id, is_active, bonus_type");
      return data || [];
    },
  });

  // Fetch purchase records for PO search
  const { data: purchaseRecords } = useQuery({
    queryKey: ["all-purchases-po"],
    queryFn: async () => {
      const { data } = await supabase.from("purchase_records").select("order_number, supplier_id");
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: SupplierForm) => {
      const payload = {
        name: data.name,
        supplier_number: data.supplier_number || null,
        payment_terms: data.payment_terms || null,
        shotef: data.shotef ? parseInt(data.shotef) : null,
        obligo: data.obligo ? parseFloat(data.obligo) : null,
        notes: data.notes || null,
        annual_bonus_status: data.annual_bonus_status || "pending",
        reconciliation_date: data.reconciliation_date || null,
      };

      if (editId) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(editId ? "ספק עודכן בהצלחה" : "ספק נוסף בהצלחה");
      setIsOpen(false);
      setEditId(null);
      setForm(emptyForm);
    },
    onError: () => toast.error("שגיאה בשמירת הספק"),
  });

  const filtered = suppliers?.filter(
    (s) => {
      if (!search) return true;
      const q = search.toLowerCase();
      if (s.name.toLowerCase().includes(q) || s.supplier_number?.toLowerCase().includes(q)) return true;
      // Search by PO number
      const supplierPOs = purchaseRecords?.filter((p) => p.supplier_id === s.id);
      if (supplierPOs?.some((p) => p.order_number?.toLowerCase().includes(q))) return true;
      return false;
    }
  );

  const openEdit = (supplier: any) => {
    setEditId(supplier.id);
    setForm({
      name: supplier.name,
      supplier_number: supplier.supplier_number || "",
      payment_terms: supplier.payment_terms || "",
      shotef: supplier.shotef?.toString() || "",
      obligo: supplier.obligo?.toString() || "",
      notes: supplier.notes || "",
      annual_bonus_status: supplier.annual_bonus_status || "pending",
      reconciliation_date: supplier.reconciliation_date || "",
    });
    setIsOpen(true);
  };

  // Check if supplier has specific agreement types
  const hasAgreementType = (supplierId: string, types: string[]) => {
    return agreements?.some((a) => a.supplier_id === supplierId && types.includes(a.bonus_type));
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">ניהול ספקים</h1>
        <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) { setEditId(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 ml-2" />הוסף ספק</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editId ? "עריכת ספק" : "ספק חדש"}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}
              className="space-y-4"
            >
              <div>
                <Label>שם ספק *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <Label>מספר ספק</Label>
                <Input value={form.supplier_number} onChange={(e) => setForm({ ...form, supplier_number: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>שוטף (ימים)</Label>
                  <Input type="number" value={form.shotef} onChange={(e) => setForm({ ...form, shotef: e.target.value })} />
                </div>
                <div>
                  <Label>אובליגו (₪)</Label>
                  <Input type="number" value={form.obligo} onChange={(e) => setForm({ ...form, obligo: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>בונוס שנתי 2025</Label>
                  <Select value={form.annual_bonus_status} onValueChange={(v) => setForm({ ...form, annual_bonus_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">ממתין</SelectItem>
                      <SelectItem value="received">התקבל</SelectItem>
                      <SelectItem value="none">אין</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>כרטסת מתואמת עד</Label>
                <Input type="date" value={form.reconciliation_date} onChange={(e) => setForm({ ...form, reconciliation_date: e.target.value })} />
              </div>
              <div>
                <Label>הערות</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "שומר..." : "שמור"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="חיפוש ספק, מספר הזמנה..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-10"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>שם ספק</TableHead>
                <TableHead>בונוס שנתי</TableHead>
                <TableHead>בונוס יעדים</TableHead>
                <TableHead>השתתפות בפרסום</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">טוען...</TableCell></TableRow>
              ) : filtered?.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">אין ספקים. העלה דוח רכישות כדי להתחיל.</TableCell></TableRow>
              ) : (
                filtered?.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Link to={`/suppliers/${s.id}`} className="text-primary hover:underline">{s.name}</Link>
                    </TableCell>
                    <TableCell>
                      {hasAgreementType(s.id, "annual") ? (
                        <Badge variant="default" className="gap-1"><CheckCircle className="w-3 h-3" />יש</Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-muted-foreground">אין</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {hasAgreementType(s.id, "target") ? (
                        <Badge variant="default" className="gap-1"><CheckCircle className="w-3 h-3" />יש</Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-muted-foreground">אין</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {hasAgreementType(s.id, "marketing") ? (
                        <Badge variant="default" className="gap-1"><CheckCircle className="w-3 h-3" />יש</Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-muted-foreground">אין</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
