// Supabase Edge Function: referral-auth
// Required Edge Function secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Enable Phone Auth and configure an SMS provider in Supabase Auth settings.
// Never expose the service-role key in the browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const normalizePhone = (value: unknown) => String(value || "").replace(/[\s()-]/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "Server is not configured" }, 500);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const publicClient = createClient(url, anon, { auth: { persistSession: false } });

  try {
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "login") {
      const referralId = String(body.referral_id || "").trim();
      const password = String(body.password || "");
      if (!/^\d{6}$/.test(referralId) || password.length < 8) return json({ error: "Enter your 6-digit Referral ID and password (8+ characters)." }, 400);
      const { data: profile, error: profileError } = await admin
        .from("member_profiles").select("user_id,approval_status,phone")
        .eq("referral_id", referralId).maybeSingle();
      if (profileError || !profile) return json({ error: "Invalid ID or password." }, 401);
      if (profile.approval_status !== "approved") return json({ error: "Your account is awaiting Main Admin approval." }, 403);
      const phone = normalizePhone(profile.phone);
      const { data, error } = await publicClient.auth.signInWithPassword({ phone, password });
      if (error || !data.session) return json({ error: "Invalid ID or password." }, 401);
      return json({ session: data.session, user: data.user });
    }

    if (action === "register") {
      const password = String(body.password || "");
      const fullName = String(body.full_name || "").trim();
      const phone = normalizePhone(body.phone);
      const designation = String(body.designation || "Associate").trim();
      const sponsorId = String(body.sponsor_referral_id || "").trim();
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) return json({ error: "Mobile number must include country code, e.g. +919876543210." }, 400);
      if (password.length < 8 || !fullName || !/^\d{6}$/.test(sponsorId)) {
        return json({ error: "Name, mobile, sponsor ID and password (8+ characters) are required." }, 400);
      }
      const { data: sponsor, error: sponsorError } = await admin
        .from("member_profiles").select("user_id,workspace_owner_id,approval_status")
        .eq("referral_id", sponsorId).maybeSingle();
      if (sponsorError || !sponsor || sponsor.approval_status !== "approved") return json({ error: "Referral ID not found or sponsor is not approved." }, 400);

      // Check for duplicate mobile before creating the Auth user.
      const { data: duplicate } = await admin.from("member_profiles").select("user_id").eq("phone", phone).maybeSingle();
      if (duplicate) return json({ error: "This mobile number is already registered." }, 409);

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        phone, password, phone_confirm: false,
        user_metadata: { full_name: fullName, phone, designation },
      });
      if (createError || !created.user) return json({ error: createError?.message || "Registration failed." }, 400);

      let referralId = "";
      let inserted = false;
      for (let attempt = 0; attempt < 12 && !inserted; attempt++) {
        referralId = String(100000 + Math.floor(Math.random() * 900000));
        const { error: insertError } = await admin.from("member_profiles").insert({
          user_id: created.user.id,
          workspace_owner_id: sponsor.workspace_owner_id,
          sponsor_user_id: sponsor.user_id,
          referral_id: referralId,
          full_name: fullName,
          phone,
          designation,
          approval_status: "pending",
        });
        if (!insertError) inserted = true;
        else if (insertError.code !== "23505") {
          await admin.auth.admin.deleteUser(created.user.id);
          return json({ error: "Could not save registration. Please try again." }, 500);
        }
      }
      if (!inserted) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: "Could not allocate a unique ID. Please retry." }, 503);
      }

      // Supabase sends SMS OTP only when Phone Auth and an SMS provider are configured.
      const { error: otpError } = await publicClient.auth.signInWithOtp({
        phone, options: { shouldCreateUser: false },
      });
      if (otpError) {
        await admin.from("member_profiles").delete().eq("user_id", created.user.id);
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: "SMS OTP could not be sent. Check Supabase Phone Auth and SMS provider settings." }, 502);
      }
      return json({ message: "OTP sent. Verify your mobile number to submit registration for Main Admin approval.", referral_id: referralId }, 201);
    }

    if (action === "verify_otp") {
      const phone = normalizePhone(body.phone);
      const token = String(body.token || "").trim();
      if (!/^\+[1-9]\d{7,14}$/.test(phone) || !/^\d{4,8}$/.test(token)) return json({ error: "Enter the registered mobile and SMS OTP." }, 400);
      const { data, error } = await publicClient.auth.verifyOtp({ phone, token, type: "sms" });
      if (error || !data.session || !data.user) return json({ error: "OTP invalid or expired. Request a new OTP." }, 400);
      const { data: profile, error: profileError } = await admin.from("member_profiles")
        .select("referral_id,approval_status").eq("user_id", data.user.id).maybeSingle();
      if (profileError || !profile) return json({ error: "Registration profile not found." }, 404);
      return json({
        session: data.session, user: data.user, referral_id: profile.referral_id,
        approval_status: profile.approval_status,
        message: "Mobile verified. Main Admin approval is still required before CRM access.",
      });
    }

    if (action === "approve" || action === "reject") {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (!token) return json({ error: "Admin sign-in required." }, 401);
      const { data: callerData, error: callerError } = await admin.auth.getUser(token);
      const caller = callerData.user;
      if (callerError || !caller) return json({ error: "Admin sign-in required." }, 401);
      const targetUserId = String(body.user_id || "");
      if (!targetUserId) return json({ error: "Member is required." }, 400);
      const { data: target, error: targetError } = await admin
        .from("member_profiles").select("user_id,workspace_owner_id")
        .eq("user_id", targetUserId).maybeSingle();
      if (targetError || !target || target.workspace_owner_id !== caller.id) return json({ error: "Only the Main Admin can process this request." }, 403);
      const status = action === "approve" ? "approved" : "rejected";
      const { error: updateError } = await admin.from("member_profiles").update({
        approval_status: status, approved_at: action === "approve" ? new Date().toISOString() : null,
        approved_by: caller.id,
      }).eq("user_id", targetUserId);
      if (updateError) return json({ error: "Could not update approval status." }, 500);
      if (action === "approve") {
        const { error: membershipError } = await admin.from("workspace_members").upsert({
          workspace_owner_id: caller.id, member_user_id: targetUserId, role: "associate",
        }, { onConflict: "workspace_owner_id,member_user_id" });
        if (membershipError) return json({ error: "Approved, but workspace access could not be linked." }, 500);
      }
      return json({ status });
    }
    return json({ error: "Unknown action." }, 400);
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
});
