import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X, Copy } from "lucide-react";
import { formatDate } from "@/lib/formatDate";
import { fmtNum } from "@/lib/utils";

const bonusTypeLabels: Record<string, string> = {
  annual_target: "יעדים",
  marketing: "השתתפות בהוצאות פרסום",
  annual_fixed: "שנתי",
};

const periodLabels: Record<string, string> = {
  monthly: "חודשי",
  quarterly: "רבעוני",
  annual: "שנתי",
  custom: "מותאם",
};

const paymentTypeLabels: Record<string, string> = {
  goods: "סחורה",
  money: "כסף",
};

type TierForm = { target_value: string; bonus_percentage: string };
type ExclusionForm = { keyword: string; mode: "include" | "exclude"; counts_toward_target: boolean };

export default function Agreements() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    supplier_id: "",
    bonus_type: "annual_target",
    period_type: "annual",
    period_start: "",
    period_end: "",
    vat_included: false,
    target_type: "amount",
    fixed_amount: "",
    fixed_percentage: "",
    series_name: "",
    notes: "",
    bonus_payment_type: "goods",
  });
  const [tiers, setTiers] = useState<TierForm[]>([{ target_value: "", bonus_percentage: "" }]);
  const [exclusions, setExclusions] = useState<ExclusionForm[]>([]);

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id, name").order("name");
      return data || [];
    },
  });

  const { data: agreements, isLoading } = useQuery({
    queryKey: ["agreements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bonus_agreements")
        .select("*, suppliers(name), bonus_tiers(*)")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        supplier_id: form.supplier_id,
        bonus_type: form.bonus_type,
        period_type: form.period_type || null,
        period_start: form.period_start || null,
        period_end: form.period_end || null,
        vat_included: form.vat_included,
        target_type: form.target_type || null,
        category_filter: null,
        category_mode: null,
        fixed_amount: form.fixed_amount ? parseFloat(form.fixed_amount) : null,
        fixed_percentage: form.fixed_percentage ? parseFloat(form.fixed_percentage) : null,
        series_name: form.series_name || null,
        notes: form.notes || null,
        bonus_payment_type: form.bonus_payment_type,
        exclusions: exclusions.length > 0 ? JSON.stringify(exclusions) : "[]",
      };

      let agreementId = editId;

      if (editId) {
        const { error } = await supabase.from("bonus_agreements").update(payload).eq("id", editId);
        if (error) throw error;
        await supabase.from("bonus_tiers").delete().eq("agreement_id", editId);
      } else {
        const { data, error } = await supabase.from("bonus_agreements").insert(payload).select("id").single();
        if (error) throw error;
        agreementId = data.id;
      }

      const validTiers = tiers.filter((t) => t.target_value && t.bonus_percentage);
      if (validTiers.length > 0 && agreementId) {
        const { error } = await supabase.from("bonus_tiers").insert(
          validTiers.map((t, i) => ({
            agreement_id: agreementId!,
            tier_order: i + 1,
            target_value: parseFloat(t.target_value),
            bonus_percentage: parseFloat(t.bonus_percentage),
          }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agreements"] });
      toast.success(editId ? "הסכם עודכן" : "הסכם נוסף בהצלחה");
      resetForm();
    },
    onError: () => toast.error("שגיאה בשמירה"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bonus_agreements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agreements"] });
      toast.success("הסכם נמחק");
      resetForm();
    },
  });

  const resetForm = () => {
    setIsOpen(false);
    setEditId(null);
    setForm({
      supplier_id: "", bonus_type: "annual_target", period_type: "annual",
      period_start: "", period_end: "", vat_included: false, target_type: "amount",
      fixed_amount: "", fixed_percentage: "",
      series_name: "", notes: "", bonus_payment_type: "goods",
    });
    setTiers([{ target_value: "", bonus_percentage: "" }]);
    setExclusions([]);
  };

  const needsTiers = form.bonus_type === "annual_target" || (form.bonus_type === "marketing" && !form.fixed_amount);
  const needsFixed = form.bonus_type === "annual_fixed" || form.bonus_type === "marketing";
  const needsExclusions = form.bonus_type === "annual_target" || form.bonus_type === "marketing" || form.bonus_type === "annual_fixed";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">הסכמי בונוסים</h1>
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetForm(); else setIsOpen(true); }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 ml-2" />הסכם חדש</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "עריכת הסכם" : "הסכם בונוס חדש"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
              {/* Supplier */}
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

              {/* Bonus type + payment type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>סוג בונוס *</Label>
                  <Select value={form.bonus_type} onValueChange={(v) => setForm({ ...form, bonus_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(bonusTypeLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>אופן קבלת הבונוס</Label>
                  <Select value={form.bonus_payment_type} onValueChange={(v) => setForm({ ...form, bonus_payment_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="goods">סחורה</SelectItem>
                      <SelectItem value="money">כסף</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Period */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>מתאריך</Label>
                  <Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
                </div>
                <div>
                  <Label>עד תאריך</Label>
                  <Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
                </div>
              </div>

              {/* VAT & target type */}
              {(form.bonus_type === "annual_target" || form.bonus_type === "marketing") && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={form.vat_included} onChange={(e) => setForm({ ...form, vat_included: e.target.checked })} className="w-4 h-4" />
                    <Label>כולל מע"מ</Label>
                  </div>
                  <div>
                    <Label>סוג יעד</Label>
                    <Select value={form.target_type} onValueChange={(v) => setForm({ ...form, target_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="amount">שקלי (₪)</SelectItem>
                        <SelectItem value="quantity">כמותי (יחידות)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Fixed values */}
              {needsFixed && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>אחוז קבוע</Label>
                    <Input type="number" step="0.1" value={form.fixed_percentage} onChange={(e) => setForm({ ...form, fixed_percentage: e.target.value })} placeholder="%" />
                  </div>
                  <div>
                    <Label>סכום קבוע (₪)</Label>
                    <Input type="number" value={form.fixed_amount} onChange={(e) => setForm({ ...form, fixed_amount: e.target.value })} placeholder="₪" />
                  </div>
                </div>
              )}




              {/* Exclusions */}
              {needsExclusions && (
              <div className="space-y-3 border rounded-lg p-3">
                  <Label className="text-base font-semibold">חריגות</Label>
                  <p className="text-xs text-muted-foreground">סינון פריטים לפי מילת מפתח בשם הפריט</p>
                  {exclusions.map((exc, i) => (
                    <div key={i} className="flex flex-col gap-2 border-b pb-3">
                      <div className="flex gap-2 items-center">
                        <Select value={exc.mode} onValueChange={(v) => { const n = [...exclusions]; n[i].mode = v as "include" | "exclude"; setExclusions(n); }}>
                          <SelectTrigger className="w-[110px] text-xs h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="include">כולל</SelectItem>
                            <SelectItem value="exclude">לא כולל</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex-1">
                          <Input value={exc.keyword} onChange={(e) => { const n = [...exclusions]; n[i].keyword = e.target.value; setExclusions(n); }} placeholder="מילת מפתח (למשל: הובלה)" className="text-sm h-8" />
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExclusions(exclusions.filter((_, j) => j !== i))}>
                          <X className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                      <div className="flex gap-4 pr-2">
                        {(form.bonus_type === "annual_target" || form.bonus_type === "marketing") && (
                          <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                            <input type="checkbox" checked={exc.counts_toward_target} onChange={(e) => { const n = [...exclusions]; n[i].counts_toward_target = e.target.checked; setExclusions(n); }} className="w-3.5 h-3.5" />
                            נספר ביעד
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setExclusions([...exclusions, { keyword: "", mode: "exclude", counts_toward_target: true }])}>
                    + הוסף חריגה
                  </Button>
                </div>
              )}

              {/* Tiers */}
              {needsTiers && (
                <div className="space-y-3">
                  <Label className="text-base font-semibold">מדרגות יעד</Label>
                  {tiers.map((tier, i) => (
                    <div key={i} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label className="text-xs">יעד {form.target_type === "quantity" ? "(כמות)" : "(₪)"}</Label>
                        <Input
                          type="number"
                          value={tier.target_value}
                          onChange={(e) => {
                            const newTiers = [...tiers];
                            newTiers[i].target_value = e.target.value;
                            setTiers(newTiers);
                          }}
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs">אחוז בונוס</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={tier.bonus_percentage}
                          onChange={(e) => {
                            const newTiers = [...tiers];
                            newTiers[i].bonus_percentage = e.target.value;
                            setTiers(newTiers);
                          }}
                        />
                      </div>
                      {tiers.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setTiers([...tiers, { target_value: "", bonus_percentage: "" }])}>
                    + הוסף מדרגה
                  </Button>
                </div>
              )}

              {/* Notes */}
              <div>
                <Label>פרטים נוספים</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>

              <Button type="submit" className="w-full" disabled={saveMutation.isPending || !form.supplier_id}>
                {saveMutation.isPending ? "שומר..." : editId ? "עדכן הסכם" : "שמור הסכם"}
              </Button>
              {editId && (
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={() => { if (confirm("למחוק את ההסכם?")) deleteMutation.mutate(editId); }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-4 h-4 ml-2" />
                  {deleteMutation.isPending ? "מוחק..." : "מחק הסכם"}
                </Button>
              )}
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Agreements list */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ספק</TableHead>
                <TableHead>סוג בונוס</TableHead>
                <TableHead>קבלה</TableHead>
                <TableHead>תקופה</TableHead>
                <TableHead>מדרגות/ערכים</TableHead>
                <TableHead>חריגות</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">טוען...</TableCell></TableRow>
              ) : agreements?.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">אין הסכמים. הוסף הסכם חדש.</TableCell></TableRow>
              ) : (
                agreements?.map((a: any) => {
                  const excl = (() => {
                    try { return typeof a.exclusions === "string" ? JSON.parse(a.exclusions) : (a.exclusions || []); } catch { return []; }
                  })();
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium"><Link to={`/suppliers/${a.supplier_id}`} className="text-primary hover:underline">{a.suppliers?.name}</Link></TableCell>
                      <TableCell>
                        <Badge variant="secondary">{bonusTypeLabels[a.bonus_type] || a.bonus_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={a.bonus_payment_type === "money" ? "outline" : "default"}>
                          {paymentTypeLabels[a.bonus_payment_type] || "סחורה"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {a.period_start && a.period_end
                          ? `${formatDate(a.period_start)} - ${formatDate(a.period_end)}`
                          : periodLabels[a.period_type] || "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {a.bonus_tiers?.length > 0
                          ? a.bonus_tiers
                              .sort((x: any, y: any) => x.tier_order - y.tier_order)
                               .map((t: any) => `₪${fmtNum(t.target_value)} → ${t.bonus_percentage}%`)
                               .join(" | ")
                          : a.fixed_percentage
                          ? `${a.fixed_percentage}%`
                          : a.fixed_amount
                          ? `₪${fmtNum(a.fixed_amount)}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {excl.length > 0
                          ? excl.map((e: any) => `${e.mode === "include" ? "כולל" : "לא כולל"}: ${e.keyword}`).join(", ")
                          : a.series_name ? `סדרה: ${a.series_name}` : "-"}
                      </TableCell>
                      <TableCell className="flex gap-1">
                        <Button variant="ghost" size="icon" title="שכפל" onClick={() => {
                          setEditId(null);
                          setForm({
                            supplier_id: a.supplier_id,
                            bonus_type: a.bonus_type,
                            period_type: a.period_type || "annual",
                            period_start: a.period_start || "",
                            period_end: a.period_end || "",
                            vat_included: a.vat_included || false,
                            target_type: a.target_type || "amount",
                            fixed_amount: a.fixed_amount?.toString() || "",
                            fixed_percentage: a.fixed_percentage?.toString() || "",
                            series_name: a.series_name || "",
                            notes: a.notes || "",
                            bonus_payment_type: a.bonus_payment_type || "goods",
                          });
                          setTiers(
                            a.bonus_tiers?.length > 0
                              ? a.bonus_tiers
                                  .sort((x: any, y: any) => x.tier_order - y.tier_order)
                                  .map((t: any) => ({ target_value: t.target_value.toString(), bonus_percentage: t.bonus_percentage.toString() }))
                              : [{ target_value: "", bonus_percentage: "" }]
                          );
                          setExclusions(excl);
                          setIsOpen(true);
                        }}>
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="ערוך" onClick={() => {
                          setEditId(a.id);
                          setForm({
                            supplier_id: a.supplier_id,
                            bonus_type: a.bonus_type,
                            period_type: a.period_type || "annual",
                            period_start: a.period_start || "",
                            period_end: a.period_end || "",
                            vat_included: a.vat_included || false,
                            target_type: a.target_type || "amount",
                            fixed_amount: a.fixed_amount?.toString() || "",
                            fixed_percentage: a.fixed_percentage?.toString() || "",
                            series_name: a.series_name || "",
                            notes: a.notes || "",
                            bonus_payment_type: a.bonus_payment_type || "goods",
                          });
                          setTiers(
                            a.bonus_tiers?.length > 0
                              ? a.bonus_tiers
                                  .sort((x: any, y: any) => x.tier_order - y.tier_order)
                                  .map((t: any) => ({ target_value: t.target_value.toString(), bonus_percentage: t.bonus_percentage.toString() }))
                              : [{ target_value: "", bonus_percentage: "" }]
                          );
                          setExclusions(excl);
                          setIsOpen(true);
                        }}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
