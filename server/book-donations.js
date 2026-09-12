export async function submitBookDonation(supabase, payload) {
  const fail = (error) => ({ status: 400, body: { error } });
  if (payload.website) return { status: 200, body: { ok: true } };
  const fields = {
    donor_name: [payload.donorName, 150],
    email: [payload.email, 254],
    phone: [payload.phone, 40],
    state: [payload.state, 100],
    lga_city: [payload.lgaCity, 100],
    book_details: [payload.bookDetails, 3000],
    notes: [payload.notes, 2000],
  };
  const record = {};
  for (const [key, [value, limit]] of Object.entries(fields)) {
    if (value != null && typeof value !== "string") return fail("Please check your donation details.");
    record[key] = (value || "").trim();
    if (record[key].length > limit) return fail("One of your entries is too long. Please shorten it.");
  }
  record.email = record.email.toLowerCase();
  if (record.donor_name.length < 2 || !record.state || !record.lga_city || record.book_details.length < 2) {
    return fail("Provide your name, state, LGA/city, and book titles or descriptions.");
  }
  if (!record.email && !record.phone) return fail("Provide an email address or phone number so we can arrange your donation.");
  if (record.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record.email)) return fail("Provide a valid email address.");
  if (record.phone && !/^[+\d\s().-]{7,40}$/.test(record.phone)) return fail("Provide a valid phone number.");
  const quantity = Number(payload.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) return fail("Enter a whole number of books between 1 and 1,000,000.");
  if (payload.privacyConsent !== true) return fail("Please consent to being contacted about your donation.");
  const { error } = await supabase.from("literature_donation_offers").insert({
    ...record, email: record.email || null, phone: record.phone || null,
    quantity, status: "new", consent_at: new Date().toISOString(),
  });
  if (error) return { status: 503, body: { error: "Your donation could not be saved. Please try again later." } };
  return { status: 201, body: { ok: true } };
}
