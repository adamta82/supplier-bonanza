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
import { Plus, Search, Pencil, FileCheck, Award, CheckCircle, XCircle, Clock } from "lucide-react";
import { formatDate } from "@/lib/formatDate";

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

  // Fetch agreements to check which suppliers have them
  const { data: agreements } = useQuery({
    queryKey: ["all-agreements-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("bonus_agreements").select("supplier_id, is_active");
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
    (s) =>
      s.name.includes(search) ||
      s.supplier_number?.includes(search) ||
      false
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

  // Check if supplier has agreements
  const hasAgreements = (supplierId: string) => {
    return agreements?.some((a) => a.supplier_id === supplierId);
  };

  const getAnnualBonusIcon = (status: string | null) => {
    switch (status) {
      case "received":
        return <CheckCircle className="w-4 h-4 text-primary" />;
      case "none":
        return <XCircle className="w-4 h-4 text-muted-foreground" />;
      default: // pending
        return <Clock className="w-4 h-4 text-destructive" />;
    }
  };

  const getAnnualBonusLabel = (status: string | null) => {
    switch (status) {
      case "received": return "התקבל";
      case "none": return "אין";
      default: return "ממתין";
    }
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
                  <Label>תנאי תשלום</Label>
                  <Input value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="שוטף+30" />
                </div>
                <div>
                  <Label>שוטף (ימים)</Label>
                  <Input type="number" value={form.shotef} onChange={(e) => setForm({ ...form, shotef: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>אובליגו (₪)</Label>
                  <Input type="number" value={form.obligo} onChange={(e) => setForm({ ...form, obligo: e.target.value })} />
                </div>
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
          placeholder="חיפוש ספק..."
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
                <TableHead>מספר ספק</TableHead>
                <TableHead>הסכמים</TableHead>
                <TableHead>בונוס 2025</TableHead>
                <TableHead>תיאום כרטסת</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">טוען...</TableCell></TableRow>
              ) : filtered?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">אין ספקים. העלה דוח רכישות כדי להתחיל.</TableCell></TableRow>
              ) : (
                filtered?.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Link to={`/suppliers/${s.id}`} className="text-primary hover:underline">{s.name}</Link>
                    </TableCell>
                    <TableCell>{s.supplier_number || "-"}</TableCell>
                    <TableCell>
                      {hasAgreements(s.id) ? (
                        <Badge variant="default" className="gap-1"><FileCheck className="w-3 h-3" />יש</Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-muted-foreground">אין</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {getAnnualBonusIcon(s.annual_bonus_status)}
                        <span className="text-xs">{getAnnualBonusLabel(s.annual_bonus_status)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {s.reconciliation_date ? (
                        <span className="text-xs">עד {formatDate(s.reconciliation_date)}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">לא תואם</span>
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
