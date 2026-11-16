"""Run the full investigation from the command line and print each step."""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nexora.engine import investigation  # noqa: E402

t0 = time.perf_counter()
for e in investigation.run(use_llm="--llm" in sys.argv):
    if e["type"] == "step":
        print(f"\n[{e['index']}/{e['total']}] {e['module']:<11} {e['title']}")
        print("   ", e["summary"])
    elif e["type"] == "done":
        r = e["report"]
        print("\n=== REPORT ===")
        print(r["summary"])
        print("Recommendation:", r["recommendation"])
print(f"\n(completed in {time.perf_counter() - t0:.1f}s)")
