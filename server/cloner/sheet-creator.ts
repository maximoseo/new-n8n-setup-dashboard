import type {
  CreatedSheet,
  CreatedSheetTab,
  ParsedExcel,
  SheetTabMapping,
  SheetTabSpec
} from "../../shared/types.js";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

interface SheetProperties {
  title?: string;
  sheetId?: number;
}

interface SpreadsheetResponse {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  sheets?: Array<{ properties?: SheetProperties }>;
}

/**
 * Obtain a Google OAuth2 access token for the Sheets/Drive APIs.
 *
 * Prefers a directly-supplied token (GOOGLE_OAUTH_ACCESS_TOKEN); otherwise exchanges
 * a refresh token (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN).
 */
export async function getGoogleAccessToken(): Promise<string> {
  const directToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  if (directToken) return directToken;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (clientId && clientSecret && refreshToken) {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    });
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(30000)
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Google token refresh failed: ${response.status} ${text}`);
    }
    const json = JSON.parse(text) as { access_token?: string };
    if (!json.access_token) throw new Error("Google token refresh returned no access_token");
    return json.access_token;
  }

  throw new Error(
    "No Google credentials configured. Set GOOGLE_OAUTH_ACCESS_TOKEN, or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN."
  );
}

/** Creates Google Sheets and writes data via the REST API using an OAuth2 bearer token. */
export class GoogleSheetsClient {
  private readonly accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    };
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: this.authHeaders(),
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000)
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Google Sheets API ${method} failed: ${response.status} ${text}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** Create a new spreadsheet with the given tabs; returns the id, url and each tab's gid. */
  async createGoogleSheet(title: string, tabs: SheetTabSpec[]): Promise<CreatedSheet> {
    const body = {
      properties: { title },
      sheets: tabs.map((tab, index) => ({ properties: { title: tab.name, index: tab.index ?? index } }))
    };
    const fields = encodeURIComponent("spreadsheetId,spreadsheetUrl,sheets.properties");
    const result = await this.request<SpreadsheetResponse>("POST", `${SHEETS_API}?fields=${fields}`, body);

    const spreadsheetId = result.spreadsheetId ?? "";
    const url = result.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    const createdTabs: CreatedSheetTab[] = (result.sheets ?? []).map((sheet) => ({
      name: sheet.properties?.title ?? "",
      gid: sheet.properties?.sheetId ?? 0
    }));
    return { spreadsheetId, url, tabs: createdTabs };
  }

  /** Write a 2D array of values to a tab, starting at A1. */
  async writeSheetData(spreadsheetId: string, tabName: string, data: (string | number)[][]): Promise<void> {
    if (data.length === 0) return;
    const range = encodeURIComponent(`'${tabName}'!A1`);
    const url = `${SHEETS_API}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;
    await this.request("PUT", url, { values: data });
  }

  private async getTabGid(spreadsheetId: string, tabName: string): Promise<number | null> {
    const fields = encodeURIComponent("sheets.properties");
    const result = await this.request<SpreadsheetResponse>("GET", `${SHEETS_API}/${spreadsheetId}?fields=${fields}`);
    for (const sheet of result.sheets ?? []) {
      const properties = sheet.properties;
      if (properties && properties.title === tabName && typeof properties.sheetId === "number") {
        return properties.sheetId;
      }
    }
    return null;
  }

  /** Bold + shade the header row and freeze it. */
  async formatHeaders(spreadsheetId: string, tabName: string, headers: string[]): Promise<void> {
    const gid = await this.getTabGid(spreadsheetId, tabName);
    if (gid == null) return;

    const range: Record<string, unknown> = { sheetId: gid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0 };
    if (headers.length > 0) range.endColumnIndex = headers.length;

    const requests = [
      {
        repeatCell: {
          range,
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true },
              backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 }
            }
          },
          fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor"
        }
      },
      {
        updateSheetProperties: {
          properties: { sheetId: gid, gridProperties: { frozenRowCount: 1 } },
          fields: "gridProperties.frozenRowCount"
        }
      }
    ];

    await this.request("POST", `${SHEETS_API}/${spreadsheetId}:batchUpdate`, { requests });
  }

  /** Share the spreadsheet with an email address (writer role) via the Drive API. */
  async shareWithEmail(spreadsheetId: string, email: string): Promise<void> {
    await this.request("POST", `${DRIVE_API}/${spreadsheetId}/permissions?sendNotificationEmail=true`, {
      type: "user",
      role: "writer",
      emailAddress: email
    });
  }

  /** High-level helper: create the sheet, write each mapped Excel sheet, format headers, optionally share. */
  async createFromExcel(
    excel: ParsedExcel,
    title: string,
    tabMappings: SheetTabMapping[],
    shareWith?: string
  ): Promise<CreatedSheet> {
    const created = await this.createGoogleSheet(title, tabMappings.map((mapping) => ({ name: mapping.targetName })));

    for (const mapping of tabMappings) {
      const sheet = excel.sheets.find((candidate) => candidate.name === mapping.excelSheet);
      const rows = sheet?.rows ?? [];
      if (rows.length > 0) {
        await this.writeSheetData(created.spreadsheetId, mapping.targetName, rows);
      }
      await this.formatHeaders(created.spreadsheetId, mapping.targetName, sheet?.headers ?? []);
      const createdTab = created.tabs.find((tab) => tab.name === mapping.targetName);
      if (createdTab) createdTab.rowsWritten = rows.length;
    }

    if (shareWith) {
      await this.shareWithEmail(created.spreadsheetId, shareWith);
    }

    return created;
  }
}
