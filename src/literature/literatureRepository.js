import { supabase } from "../lib/supabase.js";

function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data;
}

export async function loadPublicLiterature() {
  if (!supabase) return [];
  return throwIfError(
    await supabase
      .from("literature_catalogue")
      .select("id,title,author,short_description,cover_image_path,metadata")
      .eq("is_active", true)
      .order("title"),
  );
}

export async function loadLiteratureWorkspace(profile) {
  const catalogue = await loadPublicLiterature();
  if (!profile || !supabase) return { catalogue, requests: [], inventory: [], source: null, evangelist: null, coordinator: null };

  const [sourceResult, evangelistResult, coordinatorResult, requestResult] = await Promise.all([
    supabase.from("literature_sources").select("*").eq("profile_id", profile.id).maybeSingle(),
    supabase.from("literature_evangelists").select("*").eq("profile_id", profile.id).maybeSingle(),
    supabase.from("literature_coordinators").select("*").eq("profile_id", profile.id).maybeSingle(),
    supabase.from("literature_requests").select("*").order("created_at", { ascending: false }).limit(60),
  ]);
  const source = throwIfError(sourceResult);
  const evangelist = throwIfError(evangelistResult);
  const coordinator = throwIfError(coordinatorResult);
  const requests = throwIfError(requestResult);
  const inventory = source
    ? throwIfError(
      await supabase
        .from("literature_inventory")
        .select("*, literature_catalogue(title,author)")
        .eq("source_id", source.id)
        .order("created_at", { ascending: false }),
    )
    : [];
  return { catalogue, requests, inventory, source, evangelist, coordinator };
}

export async function searchLiterature(filters) {
  return throwIfError(
    await supabase.rpc("onevoice_search_literature", {
      input_literature_id: filters.literatureId || null,
      input_language: filters.language || null,
      input_state: filters.state || null,
      input_lga_city: filters.city || null,
      input_quantity: Number(filters.quantity || 1),
      input_latitude: null,
      input_longitude: null,
    }),
  );
}

export async function createLiteratureRequest(values) {
  return throwIfError(
    await supabase.rpc("onevoice_create_request", {
      input_inventory_id: values.inventoryId,
      input_quantity: Number(values.quantity),
      input_prospect_state: values.state,
      input_prospect_lga_city: values.city,
      input_prospect_general_location: values.location,
      input_delivery_method: values.deliveryMethod,
      input_note: values.note || null,
      input_dbs_student_id: null,
    }),
  );
}

export async function transitionLiteratureRequest(id, status, note = "") {
  return throwIfError(
    await supabase.rpc("onevoice_transition_request", {
      input_request_id: id,
      input_new_status: status,
      input_note: note || null,
    }),
  );
}

export async function adjustInventory(values) {
  return throwIfError(
    await supabase.rpc("onevoice_adjust_inventory", {
      input_source_id: values.sourceId,
      input_literature_id: values.literatureId,
      input_language: values.language,
      input_quantity_change: Number(values.quantity),
      input_reason: values.reason,
    }),
  );
}

export async function saveLiteratureTitle(values) {
  return throwIfError(
    await supabase.from("literature_catalogue").insert({
      title: values.title,
      author: values.author || null,
      short_description: values.description || "",
      metadata: { languages: values.languages.split(",").map((item) => item.trim()).filter(Boolean) },
    }),
  );
}
