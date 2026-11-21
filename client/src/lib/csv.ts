function cellText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value) ?? String(value);
  return String(value);
}

/** Quote CSV cells and neutralize formula-like strings before spreadsheet import. */
export function csvCell(value: unknown): string {
  const text = cellText(value);
  const safeText = typeof value === "string" && /^[\s\u0000-\u001F\u007F]*[=+\-@]/u.test(text)
    ? `'${text}`
    : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}
