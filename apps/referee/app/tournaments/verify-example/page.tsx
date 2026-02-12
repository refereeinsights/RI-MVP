import Link from "next/link";

export const runtime = "nodejs";

export default function VerificationExamplePage() {
  return (
    <main style={{ padding: "40px 16px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 900 }}>
        <div style={{ marginBottom: 16 }}>
          <h1 className="title" style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>
            Tournament Staff Verification (Example)
          </h1>
          <p className="subtitle" style={{ color: "#555", marginBottom: 6 }}>
            This is a preview of the verification form a tournament director will receive.
          </p>
          <Link href="/tournaments" style={{ fontSize: 12 }}>
            Back to tournaments
          </Link>
        </div>

        <form style={{ display: "grid", gap: 16, border: "1px solid #e5e7eb", borderRadius: 16, padding: 20, background: "#fff" }}>
          <div style={{ fontSize: 13, color: "#555" }}>
            Required fields are marked with <strong>*</strong>.
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ fontWeight: 700 }}>
              Start date *
              <input type="date" disabled style={inputStyle} />
            </label>
            <label style={{ fontWeight: 700 }}>
              End date *
              <input type="date" disabled style={inputStyle} />
            </label>
            <label style={{ fontWeight: 700 }}>
              Official website URL *
              <input type="url" disabled placeholder="https://..." style={inputStyle} />
            </label>
            <label style={{ fontWeight: 700 }}>
              Tournament director *
              <input type="text" disabled style={inputStyle} />
            </label>
            <label style={{ fontWeight: 700 }}>
              Tournament director email *
              <input type="email" disabled style={inputStyle} />
            </label>
            <label style={{ fontWeight: 700 }}>
              Referee pay *
              <input type="text" disabled style={inputStyle} />
            </label>
            <label style={{ fontWeight: 700 }}>
              Primary venue *
              <input type="text" disabled style={inputStyle} />
            </label>
            <label style={{ fontWeight: 700 }}>
              Address *
              <input type="text" disabled style={inputStyle} />
            </label>
            <label style={{ fontWeight: 700 }}>
              City *
              <input type="text" disabled style={inputStyle} />
            </label>
            <label style={{ fontWeight: 700 }}>
              State (2-letter) *
              <input type="text" disabled maxLength={2} placeholder="AZ" style={inputStyle} />
            </label>
            <label style={{ fontWeight: 700 }}>
              ZIP *
              <input type="text" disabled style={inputStyle} />
            </label>
            <label style={{ fontWeight: 700 }}>
              Additional venues
              <textarea disabled rows={3} placeholder="One venue per line" style={inputStyle} />
            </label>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ fontWeight: 700 }}>
              Tournament director phone
              <input type="tel" disabled style={inputStyle} />
            </label>
            <label style={{ fontWeight: 700 }}>
              Referee contact
              <input type="text" disabled style={inputStyle} />
            </label>
            <label style={{ fontWeight: 700 }}>
              Referee contact email
              <input type="email" disabled style={inputStyle} />
            </label>
            <label style={{ fontWeight: 700 }}>
              Referee contact phone
              <input type="tel" disabled style={inputStyle} />
            </label>
            <label style={{ fontWeight: 700 }}>
              Cash tournament?
              <input type="checkbox" disabled style={{ marginLeft: 10 }} />
            </label>
            <label style={{ fontWeight: 700 }}>
              Referee food
              <select disabled style={inputStyle}>
                <option>snacks</option>
                <option>meal</option>
              </select>
            </label>
            <label style={{ fontWeight: 700 }}>
              Referee tents
              <select disabled style={inputStyle}>
                <option>yes</option>
                <option>no</option>
              </select>
            </label>
            <label style={{ fontWeight: 700 }}>
              Facilities
              <select disabled style={inputStyle}>
                <option>restrooms</option>
                <option>portables</option>
              </select>
            </label>
            <label style={{ fontWeight: 700 }}>
              Travel lodging
              <select disabled style={inputStyle}>
                <option>hotel</option>
                <option>stipend</option>
              </select>
            </label>
            <label style={{ fontWeight: 700 }}>
              Mentors on site?
              <select disabled style={inputStyle}>
                <option>yes</option>
                <option>no</option>
              </select>
            </label>
          </div>

          <button type="button" disabled style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f3f4f6", fontWeight: 800 }}>
            Submit (disabled in preview)
          </button>
        </form>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 6,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#f9fafb",
};
