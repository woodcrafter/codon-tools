export function downloadTextFile(filename: string, content: string, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

export function toTsv(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; header: string }>) {
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const s = String(value);
    const needsQuotes = /[\t\n\r"]/g.test(s);
    const escaped = s.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };

  const header = columns.map(c => escape(c.header)).join("\t");
  const body = rows
    .map(row => columns.map(c => escape((row as any)[c.key])).join("\t"))
    .join("\n");

  return `${header}\n${body}\n`;
}

