import React, { useEffect, useState } from "react";
import { Package } from "@phosphor-icons/react";
import { literatureSupabase as supabase } from "./literatureSupabase.js";

export function BookDonationForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true); setError("");
    try {
      if (!values.email.trim() && !values.phone.trim()) throw new Error("Provide an email address or phone number so we can arrange your donation.");
      const response = await fetch("/api/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, registrationType: "book_donation", privacyConsent: values.privacyConsent === "on" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Your donation could not be submitted. Please try again.");
      setSent(true);
    } catch (error) { setError(error.message || "Please try again later."); }
    finally { setBusy(false); }
  }
  return <main className="literature-auth">
    <a href="/literature">← Back to Adventist Literature Network</a>
    {sent ? <section className="book-donation-confirmation" role="status">
      <Package size={36} aria-hidden="true" />
      <h1>Thank you for offering your books</h1>
      <p>Your donation offer has been saved. DBS Kaduna will contact you to discuss the books and arrange collection or delivery.</p>
      <a href="/literature">Return to the Adventist Literature Network</a>
      <button type="button" onClick={() => setSent(false)}>Offer more books</button>
    </section> : <form onSubmit={submit}>
      <Package size={36} aria-hidden="true" />
      <p>ADVENTIST LITERATURE NETWORK</p><h1>Donate books</h1>
      <span>No registration or sign-in needed. Tell us about the books you would like to give and how we can reach you.</span>
      <label>Your name or organisation<input name="donorName" autoComplete="name" minLength={2} maxLength={150} required /></label>
      <p>Provide at least one contact method. You can use an email address already linked to a DBS account.</p>
      <label>Email (optional if you provide a phone number)<input name="email" type="email" autoComplete="email" maxLength={254} /></label>
      <label>Phone or WhatsApp (optional if you provide an email)<input name="phone" type="tel" autoComplete="tel" maxLength={40} /></label>
      <label>State<input name="state" autoComplete="address-level1" maxLength={100} required /></label>
      <label>LGA or city<input name="lgaCity" autoComplete="address-level2" maxLength={100} required /></label>
      <label>Book titles or descriptions<textarea name="bookDetails" rows={4} minLength={2} maxLength={3000} placeholder="List the books, languages and condition, if known." required /></label>
      <label>Total number of books<input name="quantity" type="number" min={1} max={1000000} step={1} required /></label>
      <label>Collection or delivery notes (optional)<textarea name="notes" rows={3} maxLength={2000} /></label>
      <label className="book-donation-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      <div className="book-donation-privacy"><strong>Privacy Notice</strong><p>DBS Kaduna will use these details to review your donation and contact you about collection or delivery. Your contact details and donation offer are visible only to administrators.</p></div>
      {error && <div className="literature-error" role="alert">{error}</div>}
      <label className="book-donation-consent"><input name="privacyConsent" type="checkbox" required /><span>I agree to DBS Kaduna using my details to contact me about this donation.</span></label>
      <button disabled={busy}>{busy ? "Sending…" : "Send donation offer"}</button>
    </form>}
  </main>;
}

const PAGE_SIZE = 10;
export function DonationOffers() {
  const [offers, setOffers] = useState([]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    Promise.all([
      supabase.from("literature_donation_offers").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("onevoice_settings").select("setting_key,setting_value").like("setting_key", "guest_book_donation:%").limit(500),
    ]).then(([stored, recovered]) => {
        if (cancelled) return;
        const primaryOffers = stored.error ? [] : (stored.data || []);
        const recoveredOffers = recovered.error ? [] : (recovered.data || []).map(item => ({
          ...item.setting_value,
          fallbackKey: item.setting_key,
        }));
        if (stored.error && recovered.error) {
          setError("Donation offers could not be loaded. Please refresh and try again.");
          return;
        }
        const combined = [...primaryOffers, ...recoveredOffers]
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        setCount(combined.length);
        setOffers(combined.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
      }).catch(() => { if (!cancelled) setError("Donation offers could not be loaded. Please refresh and try again."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page]);
  async function updateStatus(id, status) {
    setSaving(id); setError("");
    try {
      const current = offers.find(offer => offer.id === id);
      const result = current?.fallbackKey
        ? await supabase.from("onevoice_settings").update({ setting_value: { ...current, fallbackKey: undefined, status } }).eq("setting_key", current.fallbackKey).select("setting_key").single()
        : await supabase.from("literature_donation_offers").update({ status }).eq("id", id).select("id").single();
      if (result.error || !result.data) throw new Error("Could not save the donation status. Please try again.");
      setOffers(current => current.map(offer => offer.id === id ? { ...offer, status } : offer));
    } catch (error) { setError(error.message); }
    finally { setSaving(null); }
  }
  return <section className="literature-panel">
    <div className="literature-panel-heading"><div><p>PUBLIC DONATIONS</p><h2>Book donation offers</h2></div><strong>{count}</strong></div>
    <p>Contact donors to arrange collection or delivery. Offers are not added to available inventory automatically.</p>
    {error && <div role="alert" className="literature-error">{error}</div>}
    {loading ? <p role="status">Loading donations…</p> : <div className="book-donation-offers">{offers.length ? offers.map(offer => <article key={offer.id}>
      <h3>{offer.donor_name}</h3><p>{offer.quantity} books · {offer.lga_city}, {offer.state}</p>
      <p className="book-donation-details">{offer.book_details}</p>
      <p>{offer.email && <span>Email: {offer.email}<br /></span>}{offer.phone && <span>Phone / WhatsApp: {offer.phone}</span>}</p>
      {offer.notes && <p className="book-donation-details">Collection / delivery notes: {offer.notes}</p>}
      <small>Submitted {new Date(offer.created_at).toLocaleDateString()}</small>
      <label>Status<select value={offer.status} disabled={saving !== null} onChange={event => updateStatus(offer.id, event.target.value)}>
        <option value="new">New</option><option value="contacted">Contacted</option><option value="received">Received</option><option value="closed">Closed</option>
      </select></label>
    </article>) : <p>No donation offers yet.</p>}</div>}
    <div className="book-donation-pagination"><button type="button" disabled={loading || saving !== null || page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(count / PAGE_SIZE))}</span><button type="button" disabled={loading || saving !== null || (page + 1) * PAGE_SIZE >= count} onClick={() => setPage(page + 1)}>Next</button></div>
  </section>;
}
