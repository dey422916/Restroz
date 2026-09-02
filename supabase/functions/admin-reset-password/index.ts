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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Client context for caller auth verification
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user: caller }, error: callerError } = await userClient.auth.getUser();
    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid auth session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin context using service_role key (Never exposed to client)
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Verify caller profile
    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, email, full_name, role")
      .eq("id", caller.id)
      .single();

    if (profileError || !callerProfile || (callerProfile.role !== "SUPER_ADMIN" && callerProfile.role !== "ADMIN")) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Only Super Admins or Restaurant Admins can reset user passwords." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const targetUserId = body.targetUserId || body.userId;
    const newPassword = body.newPassword || body.password;
    const restaurantId = body.restaurantId;

    if (!targetUserId || !newPassword) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: targetUserId and newPassword are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (newPassword.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters long." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check target user
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("id, email, role")
      .eq("id", targetUserId)
      .single();

    if (callerProfile.role === "ADMIN") {
      // Restaurant Admin can only reset STAFF in their restaurant
      let allowedQuery = adminClient
        .from("restaurant_members")
        .select("restaurant_id")
        .eq("user_id", caller.id)
        .eq("role", "ADMIN")
        .eq("is_active", true);

      if (restaurantId) {
        allowedQuery = allowedQuery.eq("restaurant_id", restaurantId);
      }

      const { data: callerMems } = await allowedQuery;
      const callerRestIds = (callerMems || []).map((m: any) => m.restaurant_id);

      const { data: targetMems } = await adminClient
        .from("restaurant_members")
        .select("restaurant_id, role")
        .eq("user_id", targetUserId)
        .eq("role", "STAFF")
        .eq("is_active", true)
        .in("restaurant_id", callerRestIds);

      if (!targetMems || targetMems.length === 0) {
        return new Response(
          JSON.stringify({ error: "Forbidden: You can only reset passwords for staff in your assigned restaurant." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Server-side password update using auth.admin.updateUserById (Never modifies caller's own account)
    const { data: updatedUser, error: updateError } = await adminClient.auth.admin.updateUserById(
      targetUserId,
      { password: newPassword }
    );

    if (updateError) {
      return new Response(
        JSON.stringify({ error: updateError.message || "Failed to update password." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record Audit Log (Password is NEVER logged or saved)
    await adminClient.from("audit_logs").insert([
      {
        user_id: caller.id,
        action: "RESET_MEMBER_PASSWORD",
        details: {
          target_user_id: userId,
          target_email: targetProfile?.email || updatedUser?.user?.email,
          target_role: targetProfile?.role,
          performed_by_role: callerProfile.role,
        },
      },
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Password updated successfully.",
        user_id: userId,
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
