import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export default function Transactions() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    supplier_id: "",
    transaction_date: new Date().toISOString().split("T")[0],
    description: "",
    total_value: "",
    bonus_value: "",
    items_detail: "",
    counts_toward_target: true,
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id, name").order("name");
      return data || [];
    },
  });

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["transaction-bonuses"],
    queryFn: async () => {
      const { data } = await supabase
        .from("transaction_bonuses")
        .select("*, suppliers(name)")
        .order("transaction_date", { ascending: false });
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("transaction_bonuses").insert({
        supplier_id: form.supplier_id,
        transaction_date: form.transaction_date,
        description: form.description || null,
        total_value: parseFloat(form.total_value),
        bonus_value: parseFloat(form.bonus_value),
        items_detail: form.items_detail || null,
        counts_toward_target: form.counts_toward_target,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transaction-bonuses"] });
      toast.success("בונוס עסקה נוסף");
      setIsOpen(false);
      setForm({ supplier_id: "", transaction_date: new Date().toISOString().split("T")[0], description: "", total_value: "", bonus_value: "", items_detail: "", counts_toward_target: true });
    },
    onError: () => toast.error("שגיאה"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transaction_bonuses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transaction-bonuses"] });
      toast.success("נמחק");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">בונוס עסקה</h1>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 ml-2" />הוסף עסקה</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>בונוס עסקה חדש</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
              <div>
                <Label>ספק *</Label>
                <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                  <SelectTrigger><SelectValue placeholder="בחר ספק" /></SelectTrigger>
                  <SelectContent>
                    {suppliers?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>תאריך עסקה</Label>
                <Input type="date" value={form.transaction_date} onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} />
              </div>
              <div>
                <Label>תיאור</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="למשל: עסקת מזגנים" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>שווי עסקה כולל (₪) *</Label>
                  <Input type="number" value={form.total_value} onChange={(e) => setForm({ ...form, total_value: e.target.value })} required />
                </div>
                <div>
                  <Label>שווי בונוס (₪) *</Label>
                  <Input type="number" value={form.bonus_value} onChange={(e) => setForm({ ...form, bonus_value: e.target.value })} required />
                </div>
              </div>
              <div>
                <Label>פירוט פריטים</Label>
                <Input value={form.items_detail} onChange={(e) => setForm({ ...form, items_detail: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.counts_toward_target} onChange={(e) => setForm({ ...form, counts_toward_target: e.target.checked })} className="w-4 h-4" />
                <Label>נספר ליעד שנתי</Label>
              </div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending || !form.supplier_id}>
                {saveMutation.isPending ? "שומר..." : "שמור"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ספק</TableHead>
                <TableHead>תאריך</TableHead>
                <TableHead>תיאור</TableHead>
                <TableHead>שווי עסקה</TableHead>
                <TableHead>שווי בונוס</TableHead>
                <TableHead>נספר ליעד</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">טוען...</TableCell></TableRow>
              ) : transactions?.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">אין עסקאות בונוס.</TableCell></TableRow>
              ) : (
                transactions?.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.suppliers?.name}</TableCell>
                    <TableCell>{t.transaction_date}</TableCell>
                    <TableCell>{t.description || "-"}</TableCell>
                    <TableCell>₪{t.total_value.toLocaleString()}</TableCell>
                    <TableCell className="text-success font-medium">₪{t.bonus_value.toLocaleString()}</TableCell>
                    <TableCell>{t.counts_toward_target ? "✓" : "✗"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("למחוק?")) deleteMutation.mutate(t.id); }}>
                        <Trash2 className="w-4 h-4 text-destructive" />
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
