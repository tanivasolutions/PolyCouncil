import {
  AlignmentType,
  Document,
  HeadingLevel,
  NumberFormat,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const NUMBERING_REF = "pc-numbered-list";

export function extractAssistantText(response) {
  const content = response?.content ?? [];
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n")
    .trim();
}

function parseTableRow(line) {
  return line
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell, index, arr) => {
      if (line.trim().startsWith("|") && index === 0 && cell === "") {
        return false;
      }
      if (line.trim().endsWith("|") && index === arr.length - 1 && cell === "") {
        return false;
      }
      return true;
    });
}

function isTableSeparator(line) {
  const trimmed = line.trim();
  return /^[\|\s\-:]+$/.test(trimmed.replace(/\|/g, ""));
}

function buildDocxTable(tableLines) {
  const rows = tableLines
    .map((line) => parseTableRow(line))
    .filter((row) => row.length);
  if (!rows.length) return null;

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (cells, rowIndex) =>
        new TableRow({
          children: cells.map(
            (cellText) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: cellText,
                        bold: rowIndex === 0,
                      }),
                    ],
                  }),
                ],
              })
          ),
        })
    ),
  });
}

export function buildDocxChildren(documentText) {
  const lines = documentText.split("\n");
  const children = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.includes("|")) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().includes("|")) {
        if (!isTableSeparator(lines[i])) {
          tableLines.push(lines[i]);
        }
        i++;
      }
      const table = buildDocxTable(tableLines);
      if (table) children.push(table);
      continue;
    }

    if (trimmed.startsWith("### ")) {
      children.push(
        new Paragraph({ text: trimmed.slice(4), heading: HeadingLevel.HEADING_3 })
      );
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      children.push(
        new Paragraph({ text: trimmed.slice(3), heading: HeadingLevel.HEADING_2 })
      );
      i++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      children.push(
        new Paragraph({ text: trimmed.slice(2), heading: HeadingLevel.HEADING_1 })
      );
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      children.push(
        new Paragraph({
          text: trimmed.replace(/^[-*]\s+/, ""),
          bullet: { level: 0 },
        })
      );
      i++;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      children.push(
        new Paragraph({
          text: trimmed.replace(/^\d+\.\s+/, ""),
          numbering: { reference: NUMBERING_REF, level: 0 },
        })
      );
      i++;
      continue;
    }

    children.push(
      new Paragraph({ children: [new TextRun({ text: trimmed })] })
    );
    i++;
  }

  return children.length
    ? children
    : [new Paragraph({ children: [new TextRun({ text: "Empty document" })] })];
}

export function buildDocxDocument(documentText) {
  return new Document({
    numbering: {
      config: [
        {
          reference: NUMBERING_REF,
          levels: [
            {
              level: 0,
              format: NumberFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: buildDocxChildren(documentText),
      },
    ],
  });
}

export async function buildDocxBuffer(documentText) {
  const { Packer } = await import("docx");
  return Packer.toBuffer(buildDocxDocument(documentText));
}

export async function buildDocxBlob(documentText) {
  const { Packer } = await import("docx");
  return Packer.toBlob(buildDocxDocument(documentText));
}
