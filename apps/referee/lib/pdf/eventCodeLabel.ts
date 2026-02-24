const POINTS_PER_INCH = 72;

function escapePdfText(input: string) {
  return input.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const HELVETICA_BOLD_WIDTHS: Record<string, number> = {
  A: 722,
  B: 722,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 556,
  K: 722,
  L: 611,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
  "0": 556,
  "1": 556,
  "2": 556,
  "3": 556,
  "4": 556,
  "5": 556,
  "6": 556,
  "7": 556,
  "8": 556,
  "9": 556,
  "-": 333,
  "_": 556,
  " ": 278,
};

function measureHelveticaBold(text: string, fontSize: number) {
  let units = 0;
  for (const ch of text) {
    const upper = ch.toUpperCase();
    units += HELVETICA_BOLD_WIDTHS[upper] ?? 600;
  }
  return (units / 1000) * fontSize;
}

function buildLabelContent(code: string, foundingAccess: boolean, labelWidth: number, labelHeight: number) {
  const parts: string[] = [];
  const sidePadding = Math.max(4, labelWidth * 0.055);
  const availableWidth = labelWidth - sidePadding * 2;

  const calcFittedCodeSize = () => {
    const maxSize = Math.min(30, labelHeight * 0.56);
    const minSize = Math.max(10, labelHeight * 0.24);
    const estimatedAtMax = measureHelveticaBold(code, maxSize);
    if (estimatedAtMax <= availableWidth) return maxSize;
    const fitted = (availableWidth / Math.max(estimatedAtMax, 1)) * maxSize;
    return Math.max(minSize, Math.min(maxSize, fitted));
  };
  const codeFontSize = calcFittedCodeSize();

  const drawCentered = (fontRef: "F1" | "F2", fontSize: number, y: number, text: string, isBold = false) => {
    const safeText = escapePdfText(text);
    const measured = isBold ? measureHelveticaBold(text, fontSize) : text.length * fontSize * 0.52;
    const x = Math.max(sidePadding, (labelWidth - measured) / 2);
    parts.push(`BT /${fontRef} ${fontSize} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${safeText}) Tj ET`);
  };

  const titleY = labelHeight * 0.80;
  const mainY = foundingAccess ? labelHeight * 0.30 : labelHeight * 0.24;
  const foundingY = labelHeight * 0.08;

  drawCentered("F2", Math.min(9.5, labelHeight * 0.18), titleY, "EVENT CODE", true);
  drawCentered("F2", codeFontSize, mainY, code, true);
  if (foundingAccess) {
    drawCentered("F2", Math.min(8.5, labelHeight * 0.16), foundingY, "FOUNDING ACCESS", true);
  }

  return parts.join("\n") + "\n";
}

export function buildEventCodeLabelPdf(input: {
  code: string;
  foundingAccess: boolean;
  quantity?: number;
  widthInches?: number;
  heightInches?: number;
}) {
  const code = input.code.trim();
  const foundingAccess = Boolean(input.foundingAccess);
  const quantity = Math.max(1, Math.min(500, Math.floor(input.quantity ?? 1)));
  const widthInchesRaw = Number(input.widthInches ?? 1.5);
  const heightInchesRaw = Number(input.heightInches ?? 0.75);
  const widthInches = Number.isFinite(widthInchesRaw) ? Math.min(4, Math.max(0.5, widthInchesRaw)) : 1.5;
  const heightInches = Number.isFinite(heightInchesRaw) ? Math.min(2, Math.max(0.5, heightInchesRaw)) : 0.75;
  const labelWidth = widthInches * POINTS_PER_INCH;
  const labelHeight = heightInches * POINTS_PER_INCH;
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
    const content = buildLabelContent(code, foundingAccess, labelWidth, labelHeight);
    const contentLen = Buffer.byteLength(content, "utf8");
    addObject(
      pageObjId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${labelWidth} ${labelHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>`
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
