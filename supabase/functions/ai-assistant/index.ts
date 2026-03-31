import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper: fetch ALL rows from a table using pagination
async function fetchAll(supabase: any, table: string, select: string, filters?: (q: any) => any, orderBy?: { col: string; asc: boolean }) {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (filters) q = filters(q);
    if (orderBy) q = q.order(orderBy.col, { ascending: orderBy.asc });
    const { data, error } = await q;
    if (error) { console.error(`fetchAll ${table} error:`, error); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch ALL data using pagination to ensure accuracy
    const [suppliers, agreements, purchases, sales, txBonuses, historical, agreementNotes] = await Promise.all([
      fetchAll(supabase, "suppliers", "id, name, supplier_number, payment_terms, shotef, obligo, notes, annual_bonus_status"),
      fetchAll(supabase, "bonus_agreements", "*, suppliers(name), bonus_tiers(*)", (q: any) => q.eq("is_active", true)),
      fetchAll(supabase, "purchase_records", "supplier_name, supplier_number, order_number, order_date, item_description, quantity, unit_price, total_amount, total_with_vat, category, item_code"),
      fetchAll(supabase, "sales_records", "supplier_name, order_number, sale_date, item_description, quantity, sale_price, cost_price, profit_direct, category, brand, customer_name"),
      fetchAll(supabase, "transaction_bonuses", "*, suppliers(name)"),
      fetchAll(supabase, "historical_supplier_data", "*", undefined, { col: "year", asc: false }),
      fetchAll(supabase, "agreement_notes", "*, bonus_agreements(supplier_id, suppliers(name))"),
    ]);

    // Build summary stats
    const supplierCount = suppliers?.length || 0;
    const activeAgreements = agreements?.length || 0;
    const totalPurchases = purchases?.reduce((s: number, p: any) => s + (p.total_with_vat || p.total_amount || 0), 0) || 0;
    const totalSales = sales?.reduce((s: number, r: any) => s + (r.sale_price || 0), 0) || 0;
    const totalProfit = sales?.reduce((s: number, r: any) => s + (r.profit_direct || 0), 0) || 0;
    const totalTxBonus = txBonuses?.reduce((s: number, t: any) => s + (t.bonus_value || 0), 0) || 0;

    // Build per-supplier purchase summaries
    const purchaseBySupplier: Record<string, number> = {};
    purchases?.forEach((p: any) => {
      const name = p.supplier_name || "לא ידוע";
      purchaseBySupplier[name] = (purchaseBySupplier[name] || 0) + (p.total_with_vat || p.total_amount || 0);
    });

    // Build per-supplier sales summaries
    const salesBySupplier: Record<string, { sales: number; profit: number }> = {};
    sales?.forEach((s: any) => {
      const name = s.supplier_name || "לא ידוע";
      if (!salesBySupplier[name]) salesBySupplier[name] = { sales: 0, profit: 0 };
      salesBySupplier[name].sales += s.sale_price || 0;
      salesBySupplier[name].profit += s.profit_direct || 0;
    });

    // Agreements summary
    const agreementsSummary = agreements?.map((a: any) => ({
      supplier: a.suppliers?.name,
      type: a.bonus_type,
      payment: a.bonus_payment_type,
      period: `${a.period_start || "?"} - ${a.period_end || "?"}`,
      tiers: a.bonus_tiers?.sort((x: any, y: any) => x.tier_order - y.tier_order).map((t: any) => `יעד ${t.target_value} → ${t.bonus_percentage}%`),
      vat_included: a.vat_included,
      target_type: a.target_type,
      fixed_percentage: a.fixed_percentage,
      fixed_amount: a.fixed_amount,
      status: a.bonus_status,
    }));

    const systemPrompt = `אתה עוזר AI חכם של מערכת "ZABILO MARGIN" לניהול בונוסים ורווחיות ספקים.

כללי תשובה:
- ענה בקצרה ובתכלס. משפט או שניים מספיקים לשאלה פשוטה.
- השתמש בטבלאות Markdown רק כשיש כמה שורות נתונים להציג.
- אל תחזור על השאלה ואל תוסיף הקדמות מיותרות. תן את התשובה ישר.
- עגל סכומים כספיים לשקל הקרוב. אחוזים עם ספרה אחת אחרי הנקודה.
- אם חסר מידע קריטי להבנת השאלה, שאל שאלת הבהרה אחת קצרה ותמשיך.
- אל תשאל יותר משאלה אחת בתשובה. אם אתה לא בטוח, תן את התשובה הטובה ביותר עם הנתונים שיש לך וציין הסתייגות קצרה.
- דבר עברית בלבד.

הנתונים כוללים את כל הרשומות במערכת ללא הגבלה. הסכומים מדויקים.

=== נתוני מערכת ===

סיכום כללי:
- מספר ספקים: ${supplierCount}
- הסכמי בונוס פעילים: ${activeAgreements}
- סה"כ רשומות רכש: ${purchases?.length || 0}
- סה"כ רשומות מכירות: ${sales?.length || 0}
- סך רכישות (כולל מע"מ): ₪${Math.round(totalPurchases).toLocaleString()}
- סך מכירות (כולל מע"מ): ₪${Math.round(totalSales).toLocaleString()}
- רווח ישיר (לפני מע"מ): ₪${Math.round(totalProfit).toLocaleString()}
- סך בונוס עסקאות: ₪${Math.round(totalTxBonus).toLocaleString()}

רשימת ספקים:
${JSON.stringify(suppliers?.map((s: any) => ({ שם: s.name, מספר: s.supplier_number, תנאי_תשלום: s.payment_terms, שוטף: s.shotef, אובליגו: s.obligo })), null, 2)}

רכישות לפי ספק (סה"כ כולל מע"מ - כל הרשומות):
${JSON.stringify(Object.entries(purchaseBySupplier).sort((a, b) => b[1] - a[1]).map(([name, total]) => ({ ספק: name, סהכ: Math.round(total as number) })), null, 2)}

מכירות ורווח לפי ספק (כל הרשומות):
${JSON.stringify(Object.entries(salesBySupplier).sort((a, b) => b[1].sales - a[1].sales).map(([name, d]) => ({ ספק: name, מכירות: Math.round(d.sales), רווח: Math.round(d.profit), אחוז_רווח: d.sales > 0 ? ((d.profit / d.sales) * 100).toFixed(1) + "%" : "0%" })), null, 2)}

הסכמי בונוס פעילים:
${JSON.stringify(agreementsSummary, null, 2)}

בונוסי עסקאות:
${JSON.stringify(txBonuses?.map((t: any) => ({ ספק: (t as any).suppliers?.name, תאריך: t.transaction_date, שווי: t.bonus_value, סוג: t.bonus_payment_type, תיאור: t.description })), null, 2)}

נתונים היסטוריים:
${JSON.stringify(historical?.map((h: any) => ({ ספק: h.supplier_name, שנה: h.year, רכישות: h.purchase_volume, מכירות: h.sales_volume, רווח: h.profit_amount, אחוז_רווח: h.profit_margin })), null, 2)}

דוגמאות רכישות אחרונות (עד 100):
${JSON.stringify(purchases?.slice(0, 100).map((p: any) => ({ ספק: p.supplier_name, הזמנה: p.order_number, תאריך: p.order_date, פריט: p.item_description, כמות: p.quantity, סהכ: p.total_with_vat || p.total_amount })), null, 2)}

דוגמאות מכירות אחרונות (עד 100):
${JSON.stringify(sales?.slice(0, 100).map((s: any) => ({ ספק: s.supplier_name, הזמנה: s.order_number, תאריך: s.sale_date, פריט: s.item_description, לקוח: s.customer_name, מכירה: s.sale_price, עלות: s.cost_price, רווח: s.profit_direct, מותג: s.brand })), null, 2)}
`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "יותר מדי בקשות, נסה שוב בעוד דקה" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "נגמר הקרדיט, יש להוסיף קרדיט" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "שגיאה בשירות AI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
