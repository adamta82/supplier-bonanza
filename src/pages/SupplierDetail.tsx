import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, TrendingUp, ShoppingCart, Award, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatDate } from "@/lib/formatDate";

const bonusTypeLabels: Record<string, string> = {
  annual_target: "שנתי/תקופתי (יעדים)",
  marketing: "שיווק",
  transaction: "עסקה",
  annual_fixed: "שנתי קבוע",
  network: "רשתי",
};

type FilterMode = "all" | "month" | "quarter" | "custom";

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedQuarter, setSelectedQuarter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
  });
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const dateRange = useMemo(() => {
    if (filterMode === "month") {
      const [y, m] = selectedMonth.split("-").map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    }
    if (filterMode === "quarter") {
      const [y, q] = selectedQuarter.split("-Q").map(Number);
      const start = new Date(y, (q - 1) * 3, 1);
      const end = new Date(y, q * 3, 0);
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    }
    if (filterMode === "custom" && dateFrom && dateTo) {
      return { start: dateFrom, end: dateTo };
    }
    return null;
  }, [filterMode, selectedMonth, selectedQuarter, dateFrom, dateTo]);

  const { data: supplier } = useQuery({
    queryKey: ["supplier", id],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("*").eq("id", id!).single();
      return data;
    },
    enabled: !!id,
  });

  const { data: agreements } = useQuery({
    queryKey: ["supplier-agreements", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("bonus_agreements")
        .select("*, bonus_tiers(*)")
        .eq("supplier_id", id!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: purchases } = useQuery({
    queryKey: ["supplier-purchases", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_records")
        .select("*")
        .eq("supplier_id", id!)
        .order("order_date", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: sales } = useQuery({
    queryKey: ["supplier-sales", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_records")
        .select("*")
        .eq("supplier_id", id!)
        .order("sale_date", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: bonuses } = useQuery({
    queryKey: ["supplier-bonuses", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transaction_bonuses")
        .select("*, bonus_agreements(bonus_type)")
        .eq("supplier_id", id!)
        .order("transaction_date", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const filterByDate = <T extends Record<string, any>>(items: T[], dateField: string) => {
    if (!dateRange) return items;
    return items.filter((item) => {
      const d = item[dateField];
      return d && d >= dateRange.start && d <= dateRange.end;
    });
  };

  const filteredPurchases = useMemo(() => filterByDate(purchases || [], "order_date"), [purchases, dateRange]);
  const filteredSales = useMemo(() => filterByDate(sales || [], "sale_date"), [sales, dateRange]);
  const filteredBonuses = useMemo(() => filterByDate(bonuses || [], "transaction_date"), [bonuses, dateRange]);

  const totalPurchases = filteredPurchases.reduce((s, r) => s + (r.total_amount || 0), 0);
  const totalSales = filteredSales.reduce((s, r) => s + (r.sale_price || 0) * (r.quantity || 0), 0);
  const totalDirectProfit = filteredSales.reduce((s, r) => s + (r.profit_direct || 0), 0);
  const totalBonusValue = filteredBonuses.reduce((s, r) => s + (r.bonus_value || 0), 0);
  const weLoveProfit = totalDirectProfit + totalBonusValue;

  const monthlyData = useMemo(() => {
    const map: Record<string, { purchases: number; sales: number; profit: number; weLove: number }> = {};
    const fp = filteredPurchases;
    const fs = filteredSales;
    const fb = filteredBonuses;
    fp.forEach((r) => {
      const m = r.order_date?.slice(0, 7) || "unknown";
      if (!map[m]) map[m] = { purchases: 0, sales: 0, profit: 0, weLove: 0 };
      map[m].purchases += r.total_amount || 0;
    });
    fs.forEach((r) => {
      const m = r.sale_date?.slice(0, 7) || "unknown";
      if (!map[m]) map[m] = { purchases: 0, sales: 0, profit: 0, weLove: 0 };
      map[m].sales += (r.sale_price || 0) * (r.quantity || 0);
      map[m].profit += r.profit_direct || 0;
    });
    fb.forEach((r) => {
      const m = r.transaction_date?.slice(0, 7) || "unknown";
      if (!map[m]) map[m] = { purchases: 0, sales: 0, profit: 0, weLove: 0 };
      map[m].weLove += r.bonus_value || 0;
    });
    // Add profit to weLove for total
    Object.values(map).forEach((v) => { v.weLove += v.profit; });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));
  }, [filteredPurchases, filteredSales, filteredBonuses]);

  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
  }, []);

  const quarters = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    return [`${y}-Q1`, `${y}-Q2`, `${y}-Q3`, `${y}-Q4`, `${y - 1}-Q1`, `${y - 1}-Q2`, `${y - 1}-Q3`, `${y - 1}-Q4`];
  }, []);

  if (!supplier) return <div className="text-center py-12 text-muted-foreground">טוען...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/suppliers">
          <Button variant="ghost" size="icon"><ArrowRight className="w-5 h-5" /></Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">{supplier.name}</h1>
          <p className="text-muted-foreground text-sm">
            {supplier.supplier_number && `מס׳ ספק: ${supplier.supplier_number}`}
            {supplier.payment_terms && ` | ${supplier.payment_terms}`}
            {supplier.shotef && ` | שוטף ${supplier.shotef}`}
          </p>
        </div>
      </div>

      {/* Date filter */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">סינון לפי</Label>
              <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">הכל</SelectItem>
                  <SelectItem value="month">חודש</SelectItem>
                  <SelectItem value="quarter">רבעון</SelectItem>
                  <SelectItem value="custom">תאריכים</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {filterMode === "month" && (
              <div>
                <Label className="text-xs">חודש</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {filterMode === "quarter" && (
              <div>
                <Label className="text-xs">רבעון</Label>
                <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{quarters.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {filterMode === "custom" && (
              <>
                <div>
                  <Label className="text-xs">מתאריך</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px]" />
                </div>
                <div>
                  <Label className="text-xs">עד תאריך</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px]" />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <ShoppingCart className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">רכישות</div>
            <div className="text-lg font-bold">₪{totalPurchases.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">מכירות</div>
            <div className="text-lg font-bold">₪{totalSales.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <Target className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">רווח ישיר</div>
            <div className="text-lg font-bold">₪{totalDirectProfit.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <Award className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">בונוסים</div>
            <div className="text-lg font-bold">₪{totalBonusValue.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-4 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1 text-primary" />
            <div className="text-xs text-muted-foreground">רווח וילוב</div>
            <div className="text-lg font-bold text-primary">₪{weLoveProfit.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly chart */}
      {monthlyData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>ביצועים {filterMode === "all" ? "חודשיים" : "לפי תקופה"}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `₪${v.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="purchases" name="מחזור קניות" fill="hsl(217, 71%, 45%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="sales" name="מחזור מכירות" fill="hsl(142, 71%, 45%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="profit" name="רווח ישיר" fill="hsl(45, 93%, 47%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="weLove" name="רווח וילוב" fill="hsl(280, 60%, 50%)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="agreements" dir="rtl">
        <TabsList>
          <TabsTrigger value="agreements">הסכמים ({agreements?.length || 0})</TabsTrigger>
          <TabsTrigger value="purchases">רכישות ({filteredPurchases.length})</TabsTrigger>
          <TabsTrigger value="sales">מכירות ({filteredSales.length})</TabsTrigger>
          <TabsTrigger value="bonuses">בונוסים ({filteredBonuses.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="agreements">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>סוג</TableHead>
                    <TableHead>תקופה</TableHead>
                    <TableHead>מדרגות/ערכים</TableHead>
                    <TableHead>קטגוריה</TableHead>
                    <TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agreements?.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">אין הסכמים</TableCell></TableRow>
                  ) : agreements?.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell><Badge variant="secondary">{bonusTypeLabels[a.bonus_type] || a.bonus_type}</Badge></TableCell>
                      <TableCell className="text-sm">{a.period_start && a.period_end ? `${formatDate(a.period_start)} - ${formatDate(a.period_end)}` : "-"}</TableCell>
                      <TableCell className="text-sm">
                        {a.bonus_tiers?.length > 0
                          ? a.bonus_tiers.sort((x: any, y: any) => x.tier_order - y.tier_order).map((t: any) => `₪${t.target_value.toLocaleString()} → ${t.bonus_percentage}%`).join(" | ")
                          : a.fixed_percentage ? `${a.fixed_percentage}%` : a.fixed_amount ? `₪${a.fixed_amount.toLocaleString()}` : "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {a.category_mode === "include_only" ? `רק: ${a.category_filter}` : a.category_mode === "exclude" ? `חוץ מ: ${a.category_filter}` : a.series_name ? `סדרה: ${a.series_name}` : "הכל"}
                      </TableCell>
                      <TableCell><Badge variant={a.is_active ? "default" : "outline"}>{a.is_active ? "פעיל" : "לא פעיל"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="purchases">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תאריך</TableHead>
                    <TableHead>מס׳ הזמנה</TableHead>
                    <TableHead>פריט</TableHead>
                    <TableHead>קטגוריה</TableHead>
                    <TableHead>כמות</TableHead>
                    <TableHead>סכום</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPurchases.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">אין רכישות</TableCell></TableRow>
                  ) : filteredPurchases.slice(0, 50).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDate(r.order_date)}</TableCell>
                      <TableCell>{r.order_number || "-"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{r.item_description || r.item_code || "-"}</TableCell>
                      <TableCell>{r.category || "-"}</TableCell>
                      <TableCell>{r.quantity || "-"}</TableCell>
                      <TableCell>₪{(r.total_amount || 0).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
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
                    <TableHead>פריט</TableHead>
                    <TableHead>לקוח</TableHead>
                    <TableHead>כמות</TableHead>
                    <TableHead>מחיר מכירה</TableHead>
                    <TableHead>רווח ישיר</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSales.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">אין מכירות</TableCell></TableRow>
                  ) : filteredSales.slice(0, 50).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDate(r.sale_date)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{r.item_description || r.item_code || "-"}</TableCell>
                      <TableCell>{r.customer_name || "-"}</TableCell>
                      <TableCell>{r.quantity || "-"}</TableCell>
                      <TableCell>₪{(r.sale_price || 0).toLocaleString()}</TableCell>
                      <TableCell>₪{(r.profit_direct || 0).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bonuses">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תאריך</TableHead>
                    <TableHead>סוג</TableHead>
                    <TableHead>תיאור</TableHead>
                    <TableHead>סכום עסקה</TableHead>
                    <TableHead>ערך בונוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBonuses.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">אין בונוסים</TableCell></TableRow>
                  ) : filteredBonuses.map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell>{formatDate(b.transaction_date)}</TableCell>
                      <TableCell><Badge variant="secondary">{bonusTypeLabels[b.bonus_agreements?.bonus_type] || "-"}</Badge></TableCell>
                      <TableCell className="max-w-[200px] truncate">{b.description || "-"}</TableCell>
                      <TableCell>₪{(b.total_value || 0).toLocaleString()}</TableCell>
                      <TableCell className="font-semibold text-primary">₪{(b.bonus_value || 0).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
