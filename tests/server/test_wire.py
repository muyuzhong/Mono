"""与 Desktop 共用边界向量，防止 UTF-8、容器和深度语义漂移。"""

import json
from pathlib import Path

import pytest

from lion_code.server.wire import WireLimitError, decode_wire_text

CASES = json.loads(
    (Path(__file__).parents[1] / "fixtures/websocket-bounds.json").read_text("utf-8")
)


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_shared_wire_bounds(case):
    text = (
        case["prefix"]
        + case["repeat"] * case["count"]
        + case["suffix"]
        + case.get("closing", "") * case["count"]
    )
    if case["accepted"]:
        assert decode_wire_text(text) == json.loads(text)
    else:
        with pytest.raises(WireLimitError):
            decode_wire_text(text)
