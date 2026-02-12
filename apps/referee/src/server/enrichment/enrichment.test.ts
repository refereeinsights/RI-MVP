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
});
