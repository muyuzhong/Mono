"""WebSocket 双向报文预算；与 Desktop 的 shared/wire.ts 保持一致。"""

from __future__ import annotations

import json

MAX_FRAME_BYTES = 1_048_576
MAX_STRING_BYTES = 262_144
MAX_CONTAINER_ITEMS = 4_096
MAX_DEPTH = 32


class WireLimitError(ValueError):
    """报文超出协议资源预算，连接必须停止派发。"""


def decode_wire_text(text: str) -> object:
    """在 JSON 解码前限制 UTF-8 大小，解码后限制字段与容器；不截断数据。"""
    try:
        if len(text) > MAX_FRAME_BYTES or len(text.encode("utf-8")) > MAX_FRAME_BYTES:
            raise WireLimitError("WebSocket frame exceeds byte limit")
        value = json.loads(text)
    except (RecursionError, UnicodeError) as exc:
        raise WireLimitError("WebSocket frame cannot be safely decoded") from exc

    pending = [(value, 0)]
    while pending:
        item, depth = pending.pop()
        if depth > MAX_DEPTH:
            raise WireLimitError("WebSocket value exceeds depth limit")
        if isinstance(item, str):
            try:
                size = len(item.encode("utf-8"))
            except UnicodeError as exc:
                raise WireLimitError("WebSocket string is not valid UTF-8") from exc
            if size > MAX_STRING_BYTES:
                raise WireLimitError("WebSocket string exceeds byte limit")
        elif isinstance(item, (dict, list)):
            if len(item) > MAX_CONTAINER_ITEMS:
                raise WireLimitError("WebSocket container exceeds item limit")
            children = (
                [*item.keys(), *item.values()] if isinstance(item, dict) else item
            )
            pending.extend((child, depth + 1) for child in children)
    return value
