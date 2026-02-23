const POINTS_PER_INCH = 72;
const LABEL_WIDTH = 1.5 * POINTS_PER_INCH;
const LABEL_HEIGHT = 0.75 * POINTS_PER_INCH;

function escapePdfText(input: string) {
  return input.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function estimateTextWidth(text: string, fontSize: number) {
  // Good-enough width estimate for Helvetica/Helvetica-Bold centering.
  return text.length * fontSize * 0.56;
}

function buildLabelContent(code: string, foundingAccess: boolean) {
  const parts: string[] = [];
  const safeCode = escapePdfText(code);

  const drawCentered = (fontRef: "F1" | "F2", fontSize: number, y: number, text: string) => {
    const safeText = escapePdfText(text);
    const x = Math.max(2, (LABEL_WIDTH - estimateTextWidth(text, fontSize)) / 2);
    parts.push(`BT /${fontRef} ${fontSize} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${safeText}) Tj ET`);
  };

  drawCentered("F2", 9.5, 43.0, "EVENT CODE");
  drawCentered("F2", 26, foundingAccess ? 16 : 13, safeCode);
  if (foundingAccess) {
    drawCentered("F2", 8.5, 4.5, "FOUNDING ACCESS");
  }

  return parts.join("\n") + "\n";
}

export function buildEventCodeLabelPdf(input: {
  code: string;
  foundingAccess: boolean;
  quantity?: number;
}) {
  const code = input.code.trim();
  const foundingAccess = Boolean(input.foundingAccess);
  const quantity = Math.max(1, Math.min(500, Math.floor(input.quantity ?? 1)));
  if (!code) {
    throw new Error("Code is required.");
  }

  type Obj = { id: number; body: string };
  const objects: Obj[] = [];
  const addObject = (id: number, body: string) => objects.push({ id, body });

  // 1: catalog, 2: pages, 3/4: fonts
  addObject(3, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  addObject(4, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);

  const firstPageId = 5;
  const pageIds: number[] = [];
  for (let i = 0; i < quantity; i += 1) {
    const pageObjId = firstPageId + i * 2;
    const contentObjId = pageObjId + 1;
    const content = buildLabelContent(code, foundingAccess);
    const contentLen = Buffer.byteLength(content, "utf8");
    addObject(
      pageObjId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LABEL_WIDTH} ${LABEL_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>`
    );
    addObject(contentObjId, `<< /Length ${contentLen} >>\nstream\n${content}endstream`);
    pageIds.push(pageObjId);
  }

  addObject(2, `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  addObject(1, `<< /Type /Catalog /Pages 2 0 R >>`);

  objects.sort((a, b) => a.id - b.id);

  let pdf = "%PDF-1.4\n%RI\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets[obj.id] = Buffer.byteLength(pdf, "utf8");
    pdf += `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  const maxId = objects[objects.length - 1]?.id ?? 0;
  pdf += `xref\n0 ${maxId + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= maxId; i += 1) {
    const offset = offsets[i] ?? 0;
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return pdf;
}
