import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

type CampaignType = "pesach" | "rosh_hashana";

const campaigns: { name: CampaignType; label: string }[] = [
  { name: "pesach", label: "מבצע שקל פסח" },
  { name: "rosh_hashana", label: "מבצע שקל ראש השנה" },
];

const NONE_VALUE = "__none__";
const NEW_VALUE = "__new__";

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

  const { data: groups } = useQuery({
    queryKey: ["shekel-groups"],
    queryFn: async () => {
      const { data } = await supabase
        .from("shekel_campaign_groups")
        .select("*")
        .order("name");
      return data || [];
    },
  });

  const getSetting = (name: CampaignType) => (settings || []).find((s: any) => s.campaign_name === name);

  const saveMutation = useMutation({
    mutationFn: async ({ campaignName, startDate, endDate, threshold, doubleThreshold, groupId, isActive }: {
      campaignName: CampaignType; startDate: string; endDate: string; threshold: number; doubleThreshold: number | null; groupId: string | null; isActive: boolean;
    }) => {
      const existing = getSetting(campaignName);
      const payload: any = {
        start_date: startDate,
        end_date: endDate,
        threshold_amount: threshold,
        double_gift_threshold: doubleThreshold,
        group_id: groupId,
        group_name: null,
        is_active: isActive,
      };
      if (existing) {
        const { error } = await supabase.from("shekel_campaign_settings").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shekel_campaign_settings").insert({
          supplier_id: supplierId,
          campaign_name: campaignName,
          ...payload,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shekel-settings", supplierId] });
      queryClient.invalidateQueries({ queryKey: ["shekel-settings"] });
      toast.success("הגדרות מבצע שקל נשמרו");
    },
    onError: () => toast.error("שגיאה בשמירת הגדרות"),
  });

  const createGroupMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("shekel_campaign_groups")
        .insert({ name })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shekel-groups"] });
      toast.success("ריכוז נוצר");
    },
    onError: (e: any) => toast.error(e.message?.includes("duplicate") ? "שם הריכוז כבר קיים" : "שגיאה ביצירת ריכוז"),
  });

  return (
    <TabsContent value="shekel">
      <div className="space-y-4">
        {campaigns.map((campaign) => (
          <CampaignCard
            key={campaign.name}
            label={campaign.label}
            setting={getSetting(campaign.name)}
            groups={groups || []}
            onSave={(startDate, endDate, threshold, doubleThreshold, groupId, isActive) =>
              saveMutation.mutate({ campaignName: campaign.name, startDate, endDate, threshold, doubleThreshold, groupId, isActive })
            }
            onCreateGroup={async (name) => {
              const g = await createGroupMutation.mutateAsync(name);
              return g.id;
            }}
            isPending={saveMutation.isPending}
          />
        ))}
      </div>
    </TabsContent>
  );
}

function CampaignCard({ label, setting, groups, onSave, onCreateGroup, isPending }: {
  label: string;
  setting: any;
  groups: any[];
  onSave: (startDate: string, endDate: string, threshold: number, doubleThreshold: number | null, groupId: string | null, isActive: boolean) => void;
  onCreateGroup: (name: string) => Promise<string>;
  isPending: boolean;
}) {
  const [isActive, setIsActive] = useState(setting?.is_active ?? false);
  const [startDate, setStartDate] = useState(setting?.start_date || "");
  const [endDate, setEndDate] = useState(setting?.end_date || "");
  const [threshold, setThreshold] = useState(setting?.threshold_amount?.toString() || "1200");
  const [doubleThreshold, setDoubleThreshold] = useState(setting?.double_gift_threshold?.toString() || "");
  const [groupId, setGroupId] = useState<string | null>(setting?.group_id || null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  useEffect(() => {
    if (setting) {
      setIsActive(setting.is_active);
      setStartDate(setting.start_date || "");
      setEndDate(setting.end_date || "");
      setThreshold(setting.threshold_amount?.toString() || "1200");
      setDoubleThreshold(setting.double_gift_threshold?.toString() || "");
      setGroupId(setting.group_id || null);
    }
  }, [setting?.id]);

  const parsedDouble = doubleThreshold.trim() === "" ? null : (parseFloat(doubleThreshold) || null);

  const handleGroupChange = async (val: string) => {
    if (val === NEW_VALUE) {
      setCreateOpen(true);
      return;
    }
    setGroupId(val === NONE_VALUE ? null : val);
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    try {
      const id = await onCreateGroup(name);
      setGroupId(id);
      setNewGroupName("");
      setCreateOpen(false);
    } catch {}
  };

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
            <div className="grid grid-cols-2 gap-3">
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
              <div>
                <Label>סף ל-2 מתנות (אופציונלי)</Label>
                <Input
                  type="number"
                  value={doubleThreshold}
                  onChange={(e) => setDoubleThreshold(e.target.value)}
                  placeholder="ריק = רק מתנה אחת"
                />
              </div>
              <div className="col-span-2">
                <Label>שיוך לריכוז ספקים (אופציונלי)</Label>
                <Select value={groupId ?? NONE_VALUE} onValueChange={handleGroupChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="ללא ריכוז" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>ללא ריכוז</SelectItem>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                    <SelectItem value={NEW_VALUE}>
                      <span className="flex items-center gap-1 text-primary"><Plus className="w-3 h-3" /> צור ריכוז חדש</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => onSave(startDate, endDate, parseFloat(threshold) || 1200, parsedDouble, groupId, isActive)}
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
            onClick={() => onSave(startDate || setting.start_date, endDate || setting.end_date, parseFloat(threshold) || 1200, parsedDouble, groupId, false)}
            disabled={isPending}
          >
            ביטול השתתפות
          </Button>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>צור ריכוז ספקים חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>שם הריכוז</Label>
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="לדוגמא: אלקטרה"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>ביטול</Button>
            <Button onClick={handleCreateGroup} disabled={!newGroupName.trim()}>צור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
