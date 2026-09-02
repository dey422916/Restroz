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

    // Client context for auth verification
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

    // Admin context using service_role key
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Verify caller role in public.profiles (Must be SUPER_ADMIN or ADMIN)
    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("*")
      .eq("id", caller.id)
      .single();

    if (profileError || !callerProfile || (callerProfile.role !== "ADMIN" && callerProfile.role !== "SUPER_ADMIN")) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Only Super Admins or Restaurant Admins can provision accounts." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, fullName, phone, role: requestedRole, restaurantId, preset, permissions } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email and initial password are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Role validation
    const targetRole = requestedRole === "ADMIN" ? "ADMIN" : "STAFF";
    if (callerProfile.role !== "SUPER_ADMIN" && targetRole === "ADMIN") {
      return new Response(
        JSON.stringify({ error: "Forbidden: Only Super Admin can create Restaurant Admin accounts." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists
    let targetUserId = null;
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id, email, full_name")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (existingProfile) {
      targetUserId = existingProfile.id;
    } else {
      // Server-side auth user creation with confirmed email (ZERO OTP, ZERO emails sent)
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName || email.split("@")[0], role: targetRole },
      });

      if (createError) {
        if (createError.message.includes("already registered") || createError.message.includes("already exists")) {
          const { data: retryUser } = await adminClient.from("profiles").select("id").eq("email", email.trim().toLowerCase()).maybeSingle();
          targetUserId = retryUser?.id;
        } else {
          return new Response(
            JSON.stringify({ error: createError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else if (newUser?.user) {
        targetUserId = newUser.user.id;
      }
    }

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: "Could not resolve user ID for provisioned account." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create or update profiles row
    const profilePayload = {
      id: targetUserId,
      email: email.trim().toLowerCase(),
      full_name: fullName?.trim() || email.split("@")[0],
      phone: phone || "",
      role: targetRole,
      updated_at: new Date().toISOString(),
    };
    await adminClient.from("profiles").upsert(profilePayload);

    // If restaurantId is provided, link restaurant membership
    let memberId = null;
    if (restaurantId) {
      const { data: existingMember } = await adminClient
        .from("restaurant_members")
        .select("id, is_active, role")
        .eq("restaurant_id", restaurantId)
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (existingMember) {
        if (existingMember.is_active) {
          return new Response(
            JSON.stringify({ error: `This user (${email}) is already an active member of this restaurant.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        await adminClient
          .from("restaurant_members")
          .update({ is_active: true, role: targetRole, updated_at: new Date().toISOString() })
          .eq("id", existingMember.id);
        memberId = existingMember.id;
      } else {
        const { data: newMem, error: memErr } = await adminClient
          .from("restaurant_members")
          .insert({
            restaurant_id: restaurantId,
            user_id: targetUserId,
            role: targetRole,
            is_active: true,
          })
          .select()
          .single();

        if (memErr || !newMem) {
          return new Response(
            JSON.stringify({ error: `Failed to create restaurant membership: ${memErr?.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        memberId = newMem.id;
      }

      // Configure permissions if STAFF
      if (targetRole === "STAFF" && memberId) {
        if (permissions) {
          await adminClient.from("restaurant_member_permissions").upsert({
            restaurant_member_id: memberId,
            ...permissions,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    // Record Audit Log (Password is NEVER logged)
    await adminClient.from("audit_logs").insert([
      {
        restaurant_id: restaurantId || null,
        user_id: caller.id,
        action: targetRole === "ADMIN" ? "CREATE_ADMIN" : "CREATE_STAFF",
        details: {
          created_user_id: targetUserId,
          created_user_email: email,
          assigned_role: targetRole,
          restaurant_id: restaurantId,
        },
      },
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        user_id: targetUserId,
        member_id: memberId,
        email: email.trim().toLowerCase(),
        role: targetRole,
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
