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

const sampleDates = `
  <section>
    Tournament Dates: Mar 14-16, 2026
    Registration deadline: 02/20/2026
  </section>
`;

const sampleVenues = `
  <div>
    <p>
      <strong>Fields:</strong><br />
      <strong>
        <a href="https://example.com/AC_Lehi_Sports_Park_25.pdf">Lehi Sports Complex 2228 N Center St, Mesa, AZ 85201</a><br />
        <a href="https://example.com/AC_New_Red_Mountain_25.pdf">Red Mountain Soccer Complex- North- 7745 East Brown Rd, Mesa AZ 85207</a>
      </strong>
    </p>
  </div>
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

  it("extracts date candidates from month and numeric formats", () => {
    const res = extractFromPage(sampleDates, "https://example.com/dates");
    const weekend = res.dates.find((d) => d.start_date === "2026-03-14" && d.end_date === "2026-03-16");
    const deadline = res.dates.find((d) => d.start_date === "2026-02-20");
    assert(weekend);
    assert(deadline);
  });

  it("extracts venue candidates from linked field lists", () => {
    const res = extractFromPage(sampleVenues, "https://example.com/events/arsenal-challenge");
    const lehi = res.venues.find((v) => v.address_text?.includes("2228 N Center St") && v.address_text?.includes("85201"));
    assert(lehi);
    assert.strictEqual(lehi?.venue_name, "Lehi Sports Complex");
    // PDF layout links should not become venue URLs.
    assert.strictEqual(lehi?.venue_url ?? null, null);
  });
});
