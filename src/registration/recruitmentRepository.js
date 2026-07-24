import { supabase } from "../lib/supabase.js";

function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function loadRecruitmentCampaign(slug, recruitmentKind) {
  if (!slug) return null;
  if (!supabase) throw new Error("Registration is not configured yet.");

  const result = await supabase.rpc("get_public_recruitment_campaign", {
    input_slug: slug,
  });

  const campaign = throwIfError(result)?.[0] ?? null;
  return campaign?.recruitment_kind === recruitmentKind ? campaign : null;
}

export async function loadRegistrationForm(recruitmentKind) {
  if (!supabase) throw new Error("Registration is not configured yet.");

  const result = await supabase
    .from("registration_forms")
    .select("id,recruitment_kind,title,description,fields,is_published")
    .eq("recruitment_kind", recruitmentKind)
    .eq("is_published", true)
    .maybeSingle();

  return throwIfError(result);
}

export async function submitRecruitmentEnrolment({
  campaignSlug,
  recruitmentKind,
  formData,
}) {
  const response = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      campaignSlug: campaignSlug || "",
      recruitmentKind,
      formData,
      website: formData.website || "",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Registration could not be completed.");
  }
  return payload;
}
