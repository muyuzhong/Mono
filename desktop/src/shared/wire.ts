// 双向 WebSocket 预算，与 lion_code/server/wire.py 一致。
export const MAX_FRAME_BYTES = 1_048_576;
export const MAX_STRING_BYTES = 262_144;
export const MAX_CONTAINER_ITEMS = 4_096;
export const MAX_DEPTH = 32;

const encoder = new TextEncoder();

export function decodeWireText(text: string): unknown {
  if (text.length > MAX_FRAME_BYTES || encoder.encode(text).byteLength > MAX_FRAME_BYTES) {
    throw new Error("WebSocket frame exceeds byte limit");
  }
  const value: unknown = JSON.parse(text);
  const pending: Array<[unknown, number]> = [[value, 0]];
  while (pending.length) {
    const [item, depth] = pending.pop()!;
    if (depth > MAX_DEPTH) throw new Error("WebSocket value exceeds depth limit");
    if (typeof item === "string") {
      if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(item)
        || encoder.encode(item).byteLength > MAX_STRING_BYTES) {
        throw new Error("WebSocket string exceeds byte limit or is not valid UTF-8");
      }
    } else if (item !== null && typeof item === "object") {
      const keys = Object.keys(item);
      if (keys.length > MAX_CONTAINER_ITEMS) throw new Error("WebSocket container exceeds item limit");
      const children: unknown[] = Array.isArray(item) ? item : [...keys, ...Object.values(item)];
      for (const child of children) pending.push([child, depth + 1]);
    }
  }
  return value;
}
