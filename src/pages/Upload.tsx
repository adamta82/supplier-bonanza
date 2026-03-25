import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, RefreshCw } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

export default function UploadPage() {
  const queryClient = useQueryClient();

  // Last sync timestamps
  const { data: lastPurchaseSync } = useQuery({
    queryKey: ["last-purchase-sync"],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_records")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1);
      return data?.[0]?.created_at || null;
    },
  });

  const { data: lastSalesSync } = useQuery({
    queryKey: ["last-sales-sync"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_records")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1);
      return data?.[0]?.created_at || null;
    },
  });

  const formatSyncDate = (dateStr: string | null) => {
    if (!dateStr) return "לא בוצע סנכרון";
    const d = new Date(dateStr);
    return format(d, "dd/MM/yyyy HH:mm");
  };

  // Purchase sync
  const [syncProgress, setSyncProgress] = useState<{ synced: number; page: number } | null>(null);
  const [syncFromDate, setSyncFromDate] = useState<Date>(new Date("2026-01-01"));

  const syncPriority = useMutation({
    mutationFn: async () => {
      let skip = 0;
      let totalSynced = 0;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        page++;
        setSyncProgress({ synced: totalSynced, page });

        const { data, error } = await supabase.functions.invoke("sync-purchase-orders", {
          body: {
            startSkip: skip,
            max_pages: 3,
            clear_existing: skip === 0,
            from_date: format(syncFromDate, "yyyy-MM-dd"),
          },
        });

        if (error) throw new Error(error.message || "שגיאה בסנכרון");
        if (!data?.success) throw new Error(data?.error || "שגיאה בסנכרון");

        totalSynced += data.records_synced || 0;
        hasMore = data.has_more;
        skip = data.nextSkip || skip + 500;
      }

      return totalSynced;
    },
    onSuccess: (total) => {
      queryClient.invalidateQueries({ queryKey: ["purchases-summary"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["last-purchase-sync"] });
      toast.success(`סנכרון הושלם: ${total} רשומות סונכרנו מ-Priority`);
      setSyncProgress(null);
    },
    onError: (e) => {
      toast.error("שגיאה בסנכרון רכש: " + e.message);
      setSyncProgress(null);
    },
  });

  // Sales sync
  const [salesSyncProgress, setSalesSyncProgress] = useState<{ synced: number; page: number } | null>(null);
  const [salesSyncFromDate, setSalesSyncFromDate] = useState<Date>(new Date("2026-01-01"));

  const syncSalesOrders = useMutation({
    mutationFn: async () => {
      let skip = 0;
      let totalSynced = 0;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        page++;
        setSalesSyncProgress({ synced: totalSynced, page });

        const { data, error } = await supabase.functions.invoke("sync-sales-orders", {
          body: {
            startSkip: skip,
            max_pages: 3,
            clear_existing: skip === 0,
            from_date: format(salesSyncFromDate, "yyyy-MM-dd"),
          },
        });

        if (error) throw new Error(error.message || "שגיאה בסנכרון");
        if (!data?.success) throw new Error(data?.error || "שגיאה בסנכרון");

        totalSynced += data.records_synced || 0;
        hasMore = data.has_more;
        skip = data.nextSkip || skip + 500;
      }

      return totalSynced;
    },
    onSuccess: (total) => {
      queryClient.invalidateQueries({ queryKey: ["sales-all"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["last-sales-sync"] });
      toast.success(`סנכרון הושלם: ${total} הזמנות לקוח סונכרנו מ-Priority`);
      setSalesSyncProgress(null);
    },
    onError: (e) => {
      toast.error("שגיאה בסנכרון מכירות: " + e.message);
      setSalesSyncProgress(null);
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">סנכרון נתונים</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Purchase Orders Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              סנכרון הזמנות רכש
            </CardTitle>
            <CardDescription>
              שליפת הזמנות רכש מ-Priority. סטטוסים "מבוטלת" ו"טיוטא" מסוננים.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              סנכרון אחרון: <span className="font-medium text-foreground">{formatSyncDate(lastPurchaseSync)}</span>
            </p>
            {syncProgress && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  דף {syncProgress.page} • {syncProgress.synced} רשומות...
                </p>
                <Progress className="h-2" />
              </div>
            )}
            <div className="flex items-center gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !syncFromDate && "text-muted-foreground")}>
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {syncFromDate ? format(syncFromDate, "dd/MM/yyyy") : "בחר תאריך"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={syncFromDate} onSelect={(d) => d && setSyncFromDate(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              <Button onClick={() => syncPriority.mutate()} disabled={syncPriority.isPending} variant="outline" className="gap-2">
                <RefreshCw className={`w-4 h-4 ${syncPriority.isPending ? "animate-spin" : ""}`} />
                {syncPriority.isPending ? "מסנכרן..." : "סנכרן רכש"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sales Orders Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              סנכרון הזמנות לקוח
            </CardTitle>
            <CardDescription>
              שליפת הזמנות לקוח מ-Priority. שיוך ספק אוטומטי לפי הזמנות רכש מקושרות.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              סנכרון אחרון: <span className="font-medium text-foreground">{formatSyncDate(lastSalesSync)}</span>
            </p>
            {salesSyncProgress && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  דף {salesSyncProgress.page} • {salesSyncProgress.synced} רשומות...
                </p>
                <Progress className="h-2" />
              </div>
            )}
            <div className="flex items-center gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !salesSyncFromDate && "text-muted-foreground")}>
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {salesSyncFromDate ? format(salesSyncFromDate, "dd/MM/yyyy") : "בחר תאריך"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={salesSyncFromDate} onSelect={(d) => d && setSalesSyncFromDate(d)} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              <Button onClick={() => syncSalesOrders.mutate()} disabled={syncSalesOrders.isPending} variant="outline" className="gap-2">
                <RefreshCw className={`w-4 h-4 ${syncSalesOrders.isPending ? "animate-spin" : ""}`} />
                {syncSalesOrders.isPending ? "מסנכרן..." : "סנכרן מכירות"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
