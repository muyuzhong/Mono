import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeWireText } from "../../src/shared/wire";

interface WireCase {
  name: string; prefix: string; repeat: string; count: number; suffix: string;
  closing?: string; accepted: boolean;
}
const cases: WireCase[] = JSON.parse(readFileSync(new URL("../../../tests/fixtures/websocket-bounds.json", import.meta.url), "utf8"));

describe("shared WebSocket boundary vectors", () => {
  it.each(cases)("$name", (test) => {
    const text = test.prefix + test.repeat.repeat(test.count) + test.suffix + (test.closing ?? "").repeat(test.count);
    if (test.accepted) expect(decodeWireText(text)).toEqual(JSON.parse(text));
    else expect(() => decodeWireText(text)).toThrow();
  });
});
