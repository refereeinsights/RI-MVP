import { describe, it } from "node:test";
import assert from "node:assert";
import { extractFromPage } from "./extract";

const sampleContact = `
  <div>
    Tournament Director: Jane Doe
    Email: jane.doe [at] example [dot] com
    Phone: (555) 123-4567
  </div>
  <div>Referee Assignor: Alex Ref ref.assignor@example.com</div>
`;

const sampleVenue = `
  <h2>Field Complex</h2>
  <p>123 Soccer Way, Springfield, IL 62704</p>
  <a href="https://maps.google.com/?q=123+Soccer+Way">Directions</a>
`;

const sampleRates = `
  <div>Referee Pay: $60-$75 per game (U12-U14, Center/AR)</div>
  <div>Hotel provided for out-of-town referees. Mileage reimbursement available.</div>
`;

const sampleDates = `
  <section>
    Tournament Dates: Mar 14-16, 2026
    Registration deadline: 02/20/2026
  </section>
`;

describe("extractFromPage", () => {
  it("extracts contact candidates with normalized email and role", () => {
    const res = extractFromPage(sampleContact, "https://example.com");
    // Debug log for email parsing during local runs
    console.log("contacts parsed", res.contacts);
    const emails = res.contacts.map((c) => c.email);
    assert(emails.some((e) => e === "jane.doe@example.com"));
    const hasAssignor = res.contacts.some((c) => c.role_normalized === "ASSIGNOR");
    assert.strictEqual(hasAssignor, true);
  });

  it("extracts venue candidates with address", () => {
    const res = extractFromPage(sampleVenue, "https://example.com");
    const venue = res.venues.find((v) => v.address_text?.includes("Soccer Way"));
    assert(venue);
    assert(venue?.confidence && venue.confidence > 0.3);
  });

  it("extracts comp candidates with rates and travel", () => {
    const res = extractFromPage(sampleRates, "https://example.com/refs");
    const comp = res.comps.find((c) => c.rate_amount_min === 60);
    assert(comp);
    assert(comp?.rate_amount_max === 75);
    assert(comp?.travel_lodging);
  });

  it("extracts date candidates from month and numeric formats", () => {
    const res = extractFromPage(sampleDates, "https://example.com/dates");
    const weekend = res.dates.find((d) => d.start_date === "2026-03-14" && d.end_date === "2026-03-16");
    const deadline = res.dates.find((d) => d.start_date === "2026-02-20");
    assert(weekend);
    assert(deadline);
  });
});
