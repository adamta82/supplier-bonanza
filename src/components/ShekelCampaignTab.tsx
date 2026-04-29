import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

type CampaignType = "pesach" | "rosh_hashana";

const campaigns: { name: CampaignType; label: string }[] = [
  { name: "pesach", label: "מבצע שקל פסח" },
  { name: "rosh_hashana", label: "מבצע שקל ראש השנה" },
];

export default function ShekelCampaignTab({ supplierId }: { supplierId: string }) {
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["shekel-settings", supplierId],
    queryFn: async () => {
      const { data } = await supabase
        .from("shekel_campaign_settings")
        .select("*")
        .eq("supplier_id", supplierId);
      return data || [];
    },
  });

  const getSetting = (name: CampaignType) => (settings || []).find((s: any) => s.campaign_name === name);

  const saveMutation = useMutation({
    mutationFn: async ({ campaignName, startDate, endDate, threshold, doubleThreshold, isActive }: {
      campaignName: CampaignType; startDate: string; endDate: string; threshold: number; doubleThreshold: number | null; isActive: boolean;
    }) => {
      const existing = getSetting(campaignName);
      if (existing) {
        const { error } = await supabase.from("shekel_campaign_settings").update({
          start_date: startDate,
          end_date: endDate,
          threshold_amount: threshold,
          double_gift_threshold: doubleThreshold,
          is_active: isActive,
        }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shekel_campaign_settings").insert({
          supplier_id: supplierId,
          campaign_name: campaignName,
          start_date: startDate,
          end_date: endDate,
          threshold_amount: threshold,
          double_gift_threshold: doubleThreshold,
          is_active: isActive,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shekel-settings", supplierId] });
      toast.success("הגדרות מבצע שקל נשמרו");
    },
    onError: () => toast.error("שגיאה בשמירת הגדרות"),
  });

  return (
    <TabsContent value="shekel">
      <div className="space-y-4">
        {campaigns.map((campaign) => (
          <CampaignCard
            key={campaign.name}
            label={campaign.label}
            setting={getSetting(campaign.name)}
            onSave={(startDate, endDate, threshold, isActive) =>
              saveMutation.mutate({ campaignName: campaign.name, startDate, endDate, threshold, isActive })
            }
            isPending={saveMutation.isPending}
          />
        ))}
      </div>
    </TabsContent>
  );
}

function CampaignCard({ label, setting, onSave, isPending }: {
  label: string;
  setting: any;
  onSave: (startDate: string, endDate: string, threshold: number, isActive: boolean) => void;
  isPending: boolean;
}) {
  const [isActive, setIsActive] = useState(setting?.is_active ?? false);
  const [startDate, setStartDate] = useState(setting?.start_date || "");
  const [endDate, setEndDate] = useState(setting?.end_date || "");
  const [threshold, setThreshold] = useState(setting?.threshold_amount?.toString() || "1200");

  // Sync when setting loads
  useState(() => {
    if (setting) {
      setIsActive(setting.is_active);
      setStartDate(setting.start_date || "");
      setEndDate(setting.end_date || "");
      setThreshold(setting.threshold_amount?.toString() || "1200");
    }
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{label}</h3>
          <div className="flex items-center gap-2">
            <Label htmlFor={`toggle-${label}`} className="text-sm">משתתף</Label>
            <Switch
              id={`toggle-${label}`}
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>
        {isActive && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>מתאריך</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>עד תאריך</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div>
                <Label>סף זכאות (₪ כולל מע״מ)</Label>
                <Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => onSave(startDate, endDate, parseFloat(threshold) || 1200, isActive)}
              disabled={isPending || !startDate || !endDate}
            >
              {isPending ? "שומר..." : "שמור"}
            </Button>
          </div>
        )}
        {!isActive && setting && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSave(startDate || setting.start_date, endDate || setting.end_date, parseFloat(threshold) || 1200, false)}
            disabled={isPending}
          >
            ביטול השתתפות
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
