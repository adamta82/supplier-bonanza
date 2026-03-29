import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BonusAIAnalysisProps {
  agreementId: string;
  volume: number;
  target: number;
  periodStart: string;
  periodEnd: string;
  isQuantity: boolean;
  tiers: { target_value: number; bonus_percentage: number }[];
  currentTierIdx: number;
  supplierName: string;
  bonusType: string;
  bonusVolumeMoney?: number;
}

export default function BonusAIAnalysis({
  agreementId, volume, target, periodStart, periodEnd,
  isQuantity, tiers, currentTierIdx, supplierName, bonusType, bonusVolumeMoney,
}: BonusAIAnalysisProps) {
  const [refetchKey, setRefetchKey] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["bonus-ai-analysis", agreementId, refetchKey],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("analyze-bonus", {
        body: {
          volume, target, periodStart, periodEnd,
          isQuantity, tiers, currentTierIdx, supplierName, bonusType, bonusVolumeMoney,
        },
      });
      if (error) throw error;
      return data?.analysis as string;
    },
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  return (
    <div className="bg-accent/30 rounded-lg p-3 text-xs space-y-1 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1 text-primary font-semibold text-[11px]">
          <BarChart3 className="w-3.5 h-3.5" />
          סיכום נתונים
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={() => setRefetchKey((k) => k + 1)}
          disabled={isLoading}
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <div className="flex-1 text-muted-foreground leading-relaxed space-y-0.5">
        {isLoading ? (
          <span className="animate-pulse">טוען...</span>
        ) : isError ? (
          <span className="text-destructive">שגיאה</span>
        ) : (
          data?.split("\n").map((line, i) => (
            <div key={i} className="text-[11px]">{line}</div>
          ))
        )}
      </div>
    </div>
  );
}
