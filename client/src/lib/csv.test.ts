import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("csvCell", () => {
  it.each(["=1+1", "+SUM(A1:A2)", "-2+3", "@HYPERLINK(\"https://example.com\")", "  =cmd", "\t=cmd", "\uFEFF=cmd"])("neutralizes formula-like text %j", (value) => {
    expect(csvCell(value)).toBe(`"'${value.replaceAll('"', '""')}"`);
  });

  it("quotes embedded CSV quotes without changing ordinary text", () => {
    expect(csvCell('A "quoted" value')).toBe('"A ""quoted"" value"');
  });

  it("preserves numeric values including negatives", () => {
    expect(csvCell(-42)).toBe('"-42"');
  });
});
