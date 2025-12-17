import "dotenv/config";
import { createSheetsClient } from "../lib/googleSheets";

async function main() {
  const sheets = createSheetsClient();
  const tabName = process.env.GOOGLE_SHEETS_TAB_NAME || "feedback";

  const createResponse = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: "RI MVP Feedback" },
      sheets: [
        {
          properties: {
            title: tabName,
          },
        },
      ],
    },
  });

  const spreadsheetId = createResponse.data.spreadsheetId;
  if (!spreadsheetId) {
    throw new Error("Spreadsheet creation failed (missing ID).");
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1:F1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [["created_at", "type", "message", "email", "page_url", "user_agent"]],
    },
  });

  console.log("Created spreadsheet:", createResponse.data.properties?.title ?? "RI MVP Feedback");
  console.log("Spreadsheet ID:", spreadsheetId);
  console.log(`Tab initialized: ${tabName}`);
}

main().catch((error) => {
  console.error("Failed to create feedback sheet:", error);
  process.exit(1);
});
