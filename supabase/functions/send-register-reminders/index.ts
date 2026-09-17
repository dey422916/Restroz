import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing backend Supabase environment variables." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Dedicated CRON_SECRET server-to-server authorization validation
    const authHeader = req.headers.get("Authorization") ?? "";
    const customCronHeader = req.headers.get("x-cron-secret") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : authHeader.trim();

    if (!cronSecret || (token !== cronSecret && customCronHeader !== cronSecret)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Valid cron authorization secret required." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SUPABASE_SERVICE_ROLE_KEY is used exclusively for internal DB queries
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Optional restaurant filter if passed in request body
    let targetRestaurantId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.restaurant_id === "string") {
          targetRestaurantId = body.restaurant_id;
        }
      } catch {
        // Body is optional (e.g. empty ping from cron)
      }
    }

    // 1. Invoke the authoritative server-side reminder calculation RPC
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "check_and_send_register_reminders",
      targetRestaurantId ? { p_restaurant_id: targetRestaurantId } : {}
    );

    if (rpcError) {
      return new Response(
        JSON.stringify({ error: `RPC check_and_send_register_reminders error: ${rpcError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reminders = rpcResult?.reminders || [];
    const pushDeliveries: Array<{
      restaurant_id: string;
      slot_key: string;
      tokens_count: number;
      expo_status?: number;
      expo_result?: any;
      error?: string;
    }> = [];
    const deadTokensToPrune: string[] = [];

    // 2. Dispatch push notifications to Expo Push API for each overdue restaurant
    for (const reminder of reminders) {
      const tokens: string[] = reminder.push_tokens || [];
      const validTokens = tokens.filter(
        (t) => typeof t === "string" && (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken[") || t.length > 10)
      );

      if (validTokens.length > 0) {
        const messages = validTokens.map((token) => ({
          to: token,
          sound: "default",
          title: reminder.title || "Register Still Open",
          body: reminder.message || "Yesterday's register is still open. Please close the register to complete the business day.",
          priority: "high",
          channelId: "register-reminders",
          data: {
            type: "REGISTER_REMINDER",
            restaurant_id: reminder.restaurant_id,
            register_id: reminder.register_id,
            slot_key: reminder.slot_key,
          },
        }));

        try {
          const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Accept-encoding": "gzip, deflate",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(messages),
          });

          const expoResult = await expoResponse.json();
          pushDeliveries.push({
            restaurant_id: reminder.restaurant_id,
            slot_key: reminder.slot_key,
            tokens_count: validTokens.length,
            expo_status: expoResponse.status,
            expo_result: expoResult,
          });

          // Check if any tokens returned DeviceNotRegistered error to prune them
          if (Array.isArray(expoResult?.data)) {
            expoResult.data.forEach((ticket: any, idx: number) => {
              if (
                ticket?.status === "error" &&
                ticket?.details?.error === "DeviceNotRegistered" &&
                validTokens[idx]
              ) {
                deadTokensToPrune.push(validTokens[idx]);
              }
            });
          }
        } catch (pushErr: any) {
          pushDeliveries.push({
            restaurant_id: reminder.restaurant_id,
            slot_key: reminder.slot_key,
            tokens_count: validTokens.length,
            error: pushErr.message || String(pushErr),
          });
        }
      }
    }

    // 3. Prune any dead tokens detected from Expo response
    if (deadTokensToPrune.length > 0) {
      await adminClient.rpc("remove_invalid_push_tokens", {
        p_tokens: deadTokensToPrune,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        reminders_dispatched: reminders.length,
        push_deliveries: pushDeliveries,
        pruned_dead_tokens_count: deadTokensToPrune.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
