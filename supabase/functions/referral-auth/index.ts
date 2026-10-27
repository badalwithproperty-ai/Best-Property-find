// Supabase Edge Function: referral-auth
// Configure SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
// as Edge Function secrets. Never put the service-role key in index.html.
// This endpoint is a backend foundation; wire the frontend only after deploying it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

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
      if (!/^\d{6}$/.test(referralId) || password.length < 6) {
        return json({ error: "Enter a valid 6-digit ID and password." }, 400);
      }
      const { data: profile, error: profileError } = await admin
        .from("member_profiles").select("user_id,approval_status")
        .eq("referral_id", referralId).maybeSingle();
      if (profileError || !profile) return json({ error: "Invalid ID or password." }, 401);
      if (profile.approval_status !== "approved") {
        return json({ error: "Your account is awaiting Main Admin approval." }, 403);
      }
      const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.user_id);
      if (userError || !userData.user?.email) return json({ error: "Invalid ID or password." }, 401);
      const { data, error } = await publicClient.auth.signInWithPassword({
        email: userData.user.email, password,
      });
      if (error || !data.session) return json({ error: "Invalid ID or password." }, 401);
      return json({ session: data.session, user: data.user });
    }

    if (action === "register") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const fullName = String(body.full_name || "").trim();
      const phone = String(body.phone || "").trim();
      const designation = String(body.designation || "Associate").trim();
      const sponsorId = String(body.sponsor_referral_id || "").trim();
      if (!email || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 ||
          !fullName || !phone || !/^\d{6}$/.test(sponsorId)) {
        return json({ error: "Name, valid email, mobile, sponsor ID and password (8+ characters) are required." }, 400);
      }
      const { data: sponsor, error: sponsorError } = await admin
        .from("member_profiles").select("user_id,workspace_owner_id,approval_status")
        .eq("referral_id", sponsorId).maybeSingle();
      if (sponsorError || !sponsor || sponsor.approval_status !== "approved") {
        return json({ error: "Referral ID not found or sponsor is not approved." }, 400);
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email, password, email_confirm: false,
        user_metadata: { full_name: fullName, phone, designation },
      });
      if (createError || !created.user) return json({ error: createError?.message || "Registration failed." }, 400);

      // Generate and reserve a random six-digit ID; database UNIQUE constraint prevents collisions.
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
      return json({ message: "Registration submitted for Main Admin approval.", referral_id: referralId }, 201);
    }

    return json({ error: "Unknown action." }, 400);
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
});
