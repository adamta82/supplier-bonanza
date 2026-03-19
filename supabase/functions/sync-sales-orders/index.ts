import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRIORITY_BASE_URL =
  "https://bsb.netrun.co.il/odata/Priority/tabula.ini/zabilo";
const PAGE_SIZE = 500;
const EXCLUDED_STATUSES = [
  "איזור מרוחק",
  "בוטלה במערכת",
  "בוטלה וטופלה",
  "בוטלה להחלפה",
  "לא ניתן COD",
  "ממתין למקדמה",
  "שגיאת תשלום",
  "טיוטא",
  "הזמנה בוטלה",
  "שולם חלקי",
  "לא לחיוב כעת",
  "המתנת מסמכים",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Authenticate the calling user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    let dateFilter = "2025-01-01T00:00:00+02:00";
    let startSkip = 0;
    let maxPages = 10;
    let clearExisting = true;

    try {
      const body = await req.json();
      if (body.from_date) {
        const d = body.from_date.toString().trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          dateFilter = `${d}T00:00:00+02:00`;
        } else {
          dateFilter = d;
        }
      }
      if (body.startSkip !== undefined) startSkip = body.startSkip;
      else if (body.start_skip !== undefined) startSkip = body.start_skip;
      if (body.max_pages !== undefined) maxPages = body.max_pages;
      if (body.clear_existing !== undefined) clearExisting = body.clear_existing;
    } catch {
      // Use defaults
    }

    // Priority API credentials
    const priorityUsername = Deno.env.get("PRIORITY_API_USERNAME");
    const priorityPassword = Deno.env.get("PRIORITY_API_PASSWORD");
    if (!priorityUsername || !priorityPassword) {
      return new Response(
        JSON.stringify({ error: "Priority API credentials not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const basicAuth = btoa(`${priorityUsername}:${priorityPassword}`);
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load supplier map: supplier_number -> supplier_id
    const { data: suppliersData } = await supabaseAdmin
      .from("suppliers")
      .select("id, supplier_number, name");
    const supplierIdMap = new Map<string, string>();
    const supplierNameMap = new Map<string, string>();
    (suppliersData || []).forEach((s: any) => {
      if (s.supplier_number) {
        supplierIdMap.set(s.supplier_number, s.id);
        supplierNameMap.set(s.supplier_number, s.name);
      }
    });

    // Load purchase_records to build SO -> supplier mapping via customer_po
    // customer_po in purchase_records = the SO number of the linked sales order
    const { data: purchaseLinks } = await supabaseAdmin
      .from("purchase_records")
      .select("customer_po, supplier_id, supplier_name, supplier_number");

    const soToSupplier = new Map<string, { id: string | null; name: string; number: string }>();
    (purchaseLinks || []).forEach((pr: any) => {
      if (!pr.customer_po) return;
      if (!soToSupplier.has(pr.customer_po)) {
        soToSupplier.set(pr.customer_po, {
          id: pr.supplier_id,
          name: pr.supplier_name || "",
          number: pr.supplier_number || "",
        });
      }
    });

    // Clear existing sales records on first chunk
    if (clearExisting && startSkip === 0) {
      const { error: deleteError } = await supabaseAdmin
        .from("sales_records")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (deleteError) {
        console.error("Delete error:", deleteError);
        return new Response(
          JSON.stringify({ error: "Failed to clear old sync data", detail: deleteError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log("Cleared existing sales records");
    }

    // Fetch sales orders with pagination
    let skip = startSkip;
    let pagesProcessed = 0;
    let totalInserted = 0;
    let hasMore = true;
    const batchId = `priority_sales_sync_${new Date().toISOString().split("T")[0]}`;
    const seenKeys = new Set<string>();

    while (hasMore && pagesProcessed < maxPages) {
      const encodedDate = encodeURIComponent(dateFilter);
      const url = `${PRIORITY_BASE_URL}/ORDERS?$filter=CURDATE ge ${encodedDate}&$expand=ORDERITEMS_SUBFORM&$top=${PAGE_SIZE}&$skip=${skip}`;

      console.log(`Fetching Priority ORDERS: skip=${skip}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Priority API error: ${response.status} - ${errorText}`);
        return new Response(
          JSON.stringify({
            error: "Priority API request failed",
            status: response.status,
            detail: errorText,
            inserted_so_far: totalInserted,
            last_skip: skip,
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      const orders = data.value || [];

      if (orders.length === 0) {
        hasMore = false;
        break;
      }

      // Flatten: one record per order line item
      const records: any[] = [];
      for (const order of orders) {
        // Skip excluded statuses
        if (EXCLUDED_STATUSES.length > 0 && EXCLUDED_STATUSES.includes(order.ORDSTATUSDES)) continue;

        const soNumber = order.ORDNAME || null;
        const supplierInfo = soNumber ? soToSupplier.get(soNumber) : null;

        const items = order.ORDERITEMS_SUBFORM || [];
        for (const item of items) {
          // Composite dedup key
          const dedupeKey = `${order.ORDNAME}|${item.PARTNAME}|${item.TQUANT}|${item.VPRICE}|${item.KLINE}`;
          if (seenKeys.has(dedupeKey)) continue;
          seenKeys.add(dedupeKey);

          // If no supplier from PO link, try SUPNAME from the line item
          let suppId = supplierInfo?.id || null;
          let suppName = supplierInfo?.name || null;
          if (!suppId && item.SUPNAME) {
            suppId = supplierIdMap.get(item.SUPNAME) || null;
            suppName = supplierNameMap.get(item.SUPNAME) || item.SUPNAME;
          }

          // PURCHASEPRICE and QPROFIT are before VAT, add 18%
          const costPrice = item.PURCHASEPRICE != null ? Math.round(item.PURCHASEPRICE * 1.18 * 100) / 100 : null;
          const profitDirect = item.QPROFIT != null ? Math.round(item.QPROFIT * 1.18 * 100) / 100 : null;

          records.push({
            order_number: soNumber,
            sale_date: order.CURDATE ? order.CURDATE.split("T")[0] : null,
            customer_name: order.CDES || null,
            zabilo_id: order.REFERENCE || null,
            order_status: order.ORDSTATUSDES || null,
            customer_po: null, // not used for Priority sync
            item_code: item.PARTNAME || null,
            item_description: item.PDES || null,
            quantity: item.TQUANT ?? null,
            sale_price: item.VPRICE ?? null, // כולל מע"מ
            cost_price: costPrice,
            profit_direct: profitDirect,
            supplier_id: suppId,
            supplier_name: suppName,
            category: item.FAMILYDES || null,
            brand: null, // יוגדר בהמשך
            upload_batch: batchId,
          });
        }
      }

      // Insert this page's records
      if (records.length > 0) {
        for (let i = 0; i < records.length; i += 500) {
          const batch = records.slice(i, i + 500);
          const { error: insertError } = await supabaseAdmin
            .from("sales_records")
            .insert(batch);

          if (insertError) {
            console.error(`Insert error at skip=${skip}:`, insertError);
            return new Response(
              JSON.stringify({
                error: "Failed to insert records",
                detail: insertError.message,
                inserted_so_far: totalInserted,
                last_skip: skip,
              }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          totalInserted += batch.length;
        }
      }

      skip += PAGE_SIZE;
      pagesProcessed++;

      if (orders.length < PAGE_SIZE) {
        hasMore = false;
      }
    }

    console.log(`Synced ${totalInserted} sales records. hasMore=${hasMore}, nextSkip=${skip}`);

    return new Response(
      JSON.stringify({
        success: true,
        records_synced: totalInserted,
        has_more: hasMore,
        nextSkip: hasMore ? skip : null,
        sync_date: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
