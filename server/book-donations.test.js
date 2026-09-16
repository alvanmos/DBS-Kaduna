import test from "node:test";
import assert from "node:assert/strict";
import { submitBookDonation } from "./book-donations.js";

const offer = { donorName: "Guest Donor", email: "existing@example.org", phone: "", state: "Kaduna", lgaCity: "Kaduna", bookDetails: "Ten English Bibles in good condition", quantity: "10", privacyConsent: true };
function database(error = null) {
  const writes = [];
  return { writes, from(table) {
    assert.equal(table, "literature_donation_offers");
    return { async insert(record) { writes.push(record); return { error }; } };
  } };
}
test("guest offers need no auth API, even for an existing or repeated email", async () => {
  const db = database();
  for (let i = 0; i < 2; i++) assert.equal((await submitBookDonation(db, offer)).status, 201);
  assert.equal(db.writes.length, 2);
  assert.equal(db.writes[0].status, "new");
  assert.equal(db.writes[0].quantity, 10);
  assert.equal(db.writes[0].profile_id, undefined);
});
test("phone-only offers and normalized email are supported", async () => {
  const db = database();
  assert.equal((await submitBookDonation(db, { ...offer, email: "", phone: "+234 800 123 4567" })).status, 201);
  assert.equal(db.writes[0].email, null);
  await submitBookDonation(db, { ...offer, email: "  GUEST@EXAMPLE.ORG  ", status: "received", profile_id: "someone-else" });
  assert.equal(db.writes[1].email, "guest@example.org");
  assert.equal(db.writes[1].status, "new");
  assert.equal(db.writes[1].profile_id, undefined);
});
test("invalid offers and missing consent never reach storage", async () => {
  const db = database();
  for (const change of [
    { email: "", phone: "" }, { email: "invalid" }, { phone: "abc" },
    { quantity: 0 }, { quantity: 1.5 }, { quantity: 1000001 }, { quantity: "bad" },
    { privacyConsent: false }, { privacyConsent: "true" }, { donorName: " " },
    { state: "" }, { lgaCity: "" }, { bookDetails: "" }, { notes: "x".repeat(2001) },
    { donorName: { injected: true } },
  ]) assert.equal((await submitBookDonation(db, { ...offer, ...change })).status, 400, JSON.stringify(change));
  assert.equal(db.writes.length, 0);
});
test("honeypot submissions do not persist", async () => {
  const db = database();
  assert.equal((await submitBookDonation(db, { ...offer, website: "spam" })).status, 200);
  assert.equal(db.writes.length, 0);
});
test("storage failures cannot be reported as success or expose database details", async () => {
  const result = await submitBookDonation(database({ message: "private database detail" }), offer);
  assert.equal(result.status, 503);
  assert.equal(result.body.ok, undefined);
  assert.doesNotMatch(result.body.error, /private database/);
});
test("storage failures deliver the validated offer through a private fallback", async () => {
  let delivered;
  const result = await submitBookDonation(database({ code: "42P01", message: "table missing" }), offer, {
    onStorageFailure: async donation => { delivered = donation; },
  });
  assert.equal(result.status, 202);
  assert.equal(result.body.ok, true);
  assert.equal(delivered.email, "existing@example.org");
  assert.equal(delivered.quantity, 10);
});
test("failed storage and failed fallback return a retryable error", async () => {
  const result = await submitBookDonation(database({ code: "42P01", message: "table missing" }), offer, {
    onStorageFailure: async () => { throw new Error("email unavailable"); },
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.ok, undefined);
});
