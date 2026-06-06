function parseTextToRows(text) {
  const rows = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^[\|\s\-:]+$/.test(trimmed.replace(/\|/g, ""))) continue;

    if (trimmed.includes("|")) {
      const cells = trimmed
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell, index, arr) => {
          if (trimmed.startsWith("|") && index === 0 && cell === "") {
            return false;
          }
          if (trimmed.endsWith("|") && index === arr.length - 1 && cell === "") {
            return false;
          }
          return true;
        });
      if (cells.length) rows.push(cells);
      continue;
    }

    if (trimmed.includes("\t")) {
      rows.push(trimmed.split("\t"));
      continue;
    }

    rows.push([trimmed]);
  }

  return rows.length ? rows : [["No data generated"]];
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey =
    process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;

  try {
    if (!apiKey) {
      return res.status(500).json({
        error:
          "ANTHROPIC_API_KEY is not configured. Add it to .env.local or Vercel environment variables.",
      });
    }

    const prompt =
      req.body?.prompt ||
      "Create an Excel workbook with the content provided.";
    const context = req.body?.context || "";

    const headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "code-execution-2025-08-25,skills-2025-10-02",
    };

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8096,
        messages: [
          {
            role: "user",
            content:
              `${context}\n\n${prompt}\n\n` +
              "Create the Excel workbook and save it to /mnt/user-data/outputs/ so it can be retrieved.",
          },
        ],
        tools: [
          {
            type: "code_execution_20250825",
            name: "code_execution",
          },
        ],
        container: {
          skills: [
            {
              type: "anthropic",
              skill_id: "xlsx",
              version: "latest",
            },
          ],
        },
      }),
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      const message =
        data?.error?.message ||
        `Anthropic API error (${anthropicRes.status})`;
      return res.status(anthropicRes.status).json({ error: message });
    }

    const content = data.content || [];
    let fileId = null;

    const str = JSON.stringify(data);
    const fileIdMatch = str.match(/"file_id"\s*:\s*"([^"]+)"/);
    if (fileIdMatch) {
      fileId = fileIdMatch[1];
    }

    if (!fileId) {
      for (const block of content) {
        if (
          block.type === "tool_result" ||
          block.type === "text_editor_code_execution_tool_result" ||
          (typeof block.type === "string" && block.type.endsWith("_tool_result"))
        ) {
          const blockStr = JSON.stringify(block);
          const match = blockStr.match(/"file_id"\s*:\s*"([^"]+)"/);
          if (match) {
            fileId = match[1];
            break;
          }
        }
      }
    }

    if (fileId) {
      const fileRes = await fetch(
        `https://api.anthropic.com/v1/files/${fileId}/content`,
        {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "files-api-2025-04-14",
          },
        }
      );

      if (fileRes.ok) {
        const buffer = await fileRes.arrayBuffer();
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="iron-city-cargo.xlsx"'
        );
        return res.send(Buffer.from(buffer));
      }
    }

    const textContent = content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n\n");

    const XLSX = await import("xlsx");

    const sourceText =
      textContent.trim() ||
      `${context}\n\n${prompt}`.trim() ||
      "Iron City Cargo export";

    const rows = parseTextToRows(sourceText);
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Export");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="iron-city-cargo.xlsx"'
    );
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
