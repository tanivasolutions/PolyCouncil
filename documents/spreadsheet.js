import * as XLSX from "xlsx";

export const SPREADSHEET_PREVIEW_ROWS = 10;
export const SPREADSHEET_FULL_ROW_THRESHOLD = 50;
export const SPREADSHEET_PREVIEW_ROW_THRESHOLD = 200;

function getExtension(filename) {
  const match = String(filename ?? "").match(/(\.[^.]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function escapeCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

export function countTotalRows(sheets) {
  if (!sheets || typeof sheets !== "object") {
    return 0;
  }
  return Object.values(sheets).reduce(
    (total, rows) => total + (Array.isArray(rows) ? rows.length : 0),
    0
  );
}

function getColumnHeaders(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return [];
  }
  if (Array.isArray(rows[0])) {
    return rows[0].map((cell) => String(cell ?? ""));
  }
  return Object.keys(rows[0]);
}

export function objectRowsToMarkdownTable(rows, maxRows = null) {
  if (!rows?.length) {
    return "(empty sheet)";
  }

  const limited =
    maxRows != null && maxRows >= 0 ? rows.slice(0, maxRows) : rows;

  if (Array.isArray(limited[0])) {
    const normalized = limited.map((row) =>
      Array.isArray(row) ? row.map((cell) => escapeCell(cell)) : [escapeCell(row)]
    );
    const columnCount = Math.max(...normalized.map((row) => row.length), 1);
    const padded = normalized.map((row) => {
      const copy = [...row];
      while (copy.length < columnCount) {
        copy.push("");
      }
      return copy;
    });
    const header = `| ${padded[0].join(" | ")} |`;
    const separator = `| ${padded[0].map(() => "---").join(" | ")} |`;
    const body = padded.slice(1).map((row) => `| ${row.join(" | ")} |`);
    return [header, separator, ...body].join("\n");
  }

  const keys = Object.keys(limited[0]);
  if (!keys.length) {
    return "(empty sheet)";
  }

  const header = `| ${keys.map(escapeCell).join(" | ")} |`;
  const separator = `| ${keys.map(() => "---").join(" | ")} |`;
  const body = limited.map(
    (row) => `| ${keys.map((key) => escapeCell(row[key])).join(" | ")} |`
  );

  return `${header}\n${separator}\n${body.join("\n")}`;
}

export function buildSpreadsheetSummary(sheets) {
  const names = Object.keys(sheets ?? {});
  if (!names.length) {
    return "Spreadsheet with no sheets.";
  }

  const lines = [`Spreadsheet with ${names.length} sheet(s):`];
  for (const name of names) {
    const rows = sheets[name] ?? [];
    const headers = getColumnHeaders(rows);
    lines.push(
      `- "${name}": ${rows.length} row(s), columns: ${
        headers.length ? headers.join(", ") : "(none)"
      }`
    );
  }
  return lines.join("\n");
}

export function buildSpreadsheetPreviewMarkdown(sheets, maxRows = SPREADSHEET_PREVIEW_ROWS) {
  const names = Object.keys(sheets ?? {});
  if (!names.length) {
    return "";
  }

  return names
    .map((name) => {
      const table = objectRowsToMarkdownTable(sheets[name], maxRows);
      return `### ${name}\n\n${table}`;
    })
    .join("\n\n");
}

export function sheetsToFullMarkdown(sheets) {
  return buildSpreadsheetPreviewMarkdown(sheets, null);
}

export function parseWorkbookFromBuffer(file, buffer) {
  const ext = getExtension(file?.name);
  const readType = ext === ".csv" ? "string" : "array";
  const data = ext === ".csv" ? new TextDecoder().decode(buffer) : buffer;
  return XLSX.read(data, { type: readType });
}

export function workbookToSheetObjects(workbook) {
  const sheets = {};
  for (const sheetName of workbook.SheetNames) {
    sheets[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: "",
    });
  }
  return sheets;
}

export async function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

export async function buildSpreadsheetRepresentations(file) {
  const buffer = await readFileAsArrayBuffer(file);
  const workbook = parseWorkbookFromBuffer(file, buffer);
  const full = workbookToSheetObjects(workbook);
  const rowCount = countTotalRows(full);

  return {
    summary: buildSpreadsheetSummary(full),
    preview: buildSpreadsheetPreviewMarkdown(full, SPREADSHEET_PREVIEW_ROWS),
    full,
    rowCount,
  };
}

export function isSpreadsheetPayload(content) {
  return Boolean(
    content &&
      typeof content === "object" &&
      !Array.isArray(content) &&
      ("full" in content || "summary" in content)
  );
}

export function normalizeSpreadsheetPayload(content) {
  if (isSpreadsheetPayload(content)) {
    const full = content.full ?? {};
    return {
      summary: content.summary ?? buildSpreadsheetSummary(full),
      preview:
        content.preview ??
        buildSpreadsheetPreviewMarkdown(full, SPREADSHEET_PREVIEW_ROWS),
      full,
      rowCount: content.rowCount ?? countTotalRows(full),
    };
  }

  const sheets = content && typeof content === "object" ? content : {};
  return {
    summary: buildSpreadsheetSummary(sheets),
    preview: buildSpreadsheetPreviewMarkdown(sheets, SPREADSHEET_PREVIEW_ROWS),
    full: sheets,
    rowCount: countTotalRows(sheets),
  };
}

export function isSpreadsheetStorageKind(kind) {
  return kind === "xlsx" || kind === "csv" || kind === "spreadsheet";
}

export function resolveSpreadsheetInjectionTier(rowCount, metadata, agentName) {
  const tags = (metadata?.tags ?? []).map((tag) => String(tag).toLowerCase());
  const agent = String(agentName ?? "")
    .trim()
    .toLowerCase();
  const hasRatesTag = tags.includes("rates");
  const minPreviewAgent =
    hasRatesTag && ["strategist", "pragmatist"].includes(agent);

  if (rowCount < SPREADSHEET_FULL_ROW_THRESHOLD) {
    return "full";
  }
  if (rowCount <= SPREADSHEET_PREVIEW_ROW_THRESHOLD) {
    return "preview";
  }
  if (minPreviewAgent) {
    return "preview";
  }
  return "summary";
}
