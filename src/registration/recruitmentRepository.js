import { supabase } from "../lib/supabase.js";

function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function loadRecruitmentCampaign(slug, recruitmentKind) {
  if (!slug) return null;
  if (!supabase) throw new Error("Registration is not configured yet.");

  const result = await supabase
    .from("recruitment_campaigns")
    .select("id,name,recruitment_kind,slug")
    .eq("slug", slug)
    .eq("recruitment_kind", recruitmentKind)
    .eq("is_active", true)
    .maybeSingle();

  return throwIfError(result);
}

export async function submitRecruitmentEnrolment({
  campaignSlug,
  recruitmentKind,
  fullName,
  phone,
  address,
}) {
  if (!supabase) throw new Error("Registration is not configured yet.");

  return throwIfError(
    await supabase.rpc("submit_recruitment_enrolment", {
      campaign_slug: campaignSlug || null,
      enrolment_kind: recruitmentKind,
      enrollee_name: fullName,
      enrollee_phone: phone,
      enrollee_address: address,
    }),
  );
}
