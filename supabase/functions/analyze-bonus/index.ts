import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { volume, target, periodStart, periodEnd, isQuantity, tiers, currentTierIdx, bonusPercentage, supplierName, bonusType, bonusVolumeMoney } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const now = new Date();
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    const totalDays = Math.max((end.getTime() - start.getTime()) / 86400000, 1);
    const elapsedDays = Math.max((now.getTime() - start.getTime()) / 86400000, 0);
    const remainingDays = Math.max((end.getTime() - now.getTime()) / 86400000, 0);
    const elapsedPct = Math.min((elapsedDays / totalDays) * 100, 100).toFixed(0);
    const volumePct = target > 0 ? ((volume / target) * 100).toFixed(1) : "0";
    const remainingToTarget = Math.max(target - volume, 0);
    const dailyRate = elapsedDays > 0 ? volume / elapsedDays : 0;
    const requiredDailyRate = remainingDays > 0 ? remainingToTarget / remainingDays : 0;
    const monthlyRate = dailyRate * 30;
    const requiredMonthly = requiredDailyRate * 30;

    const unit = isQuantity ? "יח'" : "₪";
    const fmtVol = (v: number) => isQuantity ? Math.round(v).toLocaleString() : `₪${Math.round(v).toLocaleString()}`;
    
    const tiersInfo = tiers?.map((t: any, i: number) => {
      const tierPct = target > 0 ? ((volume / t.target_value) * 100).toFixed(0) : "0";
      return `מדרגה ${i+1}: ${fmtVol(t.target_value)} → ${t.bonus_percentage}% (ביצוע ${tierPct}%)${i === currentTierIdx ? " ✓הושגה" : ""}`;
    }).join("; ") || "";

    // Determine remaining months and if Nov/Dec are included
    const endMonth = end.getMonth(); // 0-indexed
    const nowMonth = now.getMonth();
    const hasStrongMonths = remainingDays > 0 && (
      (endMonth >= 10) || // ends in Nov or Dec
      (nowMonth <= 10 && endMonth >= 10) // Nov/Dec still ahead
    );

    const prompt = `אתה אנליסט עסקי מנוסה. תן ניתוח בעברית (3-4 משפטים) בפורמט הבא על מצב הבונוס:

נתונים:
- ספק: ${supplierName}
- סוג: ${bonusType === "annual_target" ? "יעדים שנתיים" : bonusType === "marketing" ? "השתתפות בהוצאות פרסום" : bonusType}
- ביצוע: ${fmtVol(volume)} מתוך יעד ${fmtVol(target)} (${volumePct}%)
- נותר להשלמה: ${fmtVol(remainingToTarget)}
${isQuantity && bonusVolumeMoney ? `- מחזור כספי: ₪${Math.round(bonusVolumeMoney).toLocaleString()}` : ""}
- קצב חודשי נוכחי: ${fmtVol(monthlyRate)}
- קצב חודשי נדרש להשלמת היעד: ${fmtVol(requiredMonthly)}
- תקופה: ${periodStart} עד ${periodEnd}
- חלפו ${elapsedPct}% מהתקופה (${Math.round(elapsedDays)} ימים), נותרו ${Math.round(remainingDays)} ימים
- מדרגות: ${tiersInfo}
- מדרגה נוכחית: ${currentTierIdx >= 0 ? `מדרגה ${currentTierIdx + 1}` : "טרם הושגה מדרגה"}
${hasStrongMonths ? "- שים לב: חודשי נובמבר-דצמבר שנותרו הם חודשים חזקים משמעותית מבחינת רכישות" : ""}

פורמט התשובה (בדיוק ככה):
"בוצעו ${fmtVol(volume)} מתוך ${fmtVol(target)} (${volumePct}%). [ניתוח קצב - האם הקצב הנוכחי מספיק, תוך התחשבות בעונתיות]. [הערכת סיכוי להגיע למדרגה הבאה]. [המלצה אחת קצרה]."

חשוב:
- היה ריאליסטי אך אופטימי כשיש סיכוי סביר
- קח בחשבון שנובמבר-דצמבר הם חודשים חזקים בענף הקמעונאי (עלייה של 30-50% ברכישות)
- ציין סכומים ספציפיים (ביצוע, נותר, קצב)
- אל תשתמש בכותרות או בולטים`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "אתה אנליסט עסקי מנוסה שנותן תובנות מדויקות עם נתונים. היה ריאליסטי אך אופטימי. תענה ב-3-4 משפטים ענייניים עם סכומים ספציפיים." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const analysis = result.choices?.[0]?.message?.content || "לא ניתן לייצר ניתוח";

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-bonus error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
