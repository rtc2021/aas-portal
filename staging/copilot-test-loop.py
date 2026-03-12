#!/usr/bin/env python3
"""
Copilot REPL Test Loop - Continuously test the AAS copilot with varied queries.

Usage:
  python staging/copilot-test-loop.py                    # Run all queries once
  python staging/copilot-test-loop.py --category parts   # Run one category
  python staging/copilot-test-loop.py --loop 5           # Run 5 rounds with shuffled queries
  python staging/copilot-test-loop.py --loop 0           # Run forever until Ctrl+C
  python staging/copilot-test-loop.py --failing           # Re-run only previously failing queries
"""

import argparse
import json
import os
import random
import sys
import time
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# -- Config ----------------------------------------------------------------
ENDPOINT = "https://aas-portal.netlify.app/api/copilot"
RESULTS_DIR = os.path.join(os.path.dirname(__file__), "copilot-test-results")
TIMEOUT = 45  # seconds per request
DELAY = 2.0   # seconds between requests (be nice to Netlify)

# -- Query Bank ------------------------------------------------------------
# Each query has: category, query text, expected assertions
# Assertions:
#   tool: expected tool name in toolCalls
#   manufacturer: expected manufacturer detection
#   response_contains: substring that should appear in response
#   response_not_contains: substring that must NOT appear
#   has_source: response should reference a source/manual
#   max_iterations: response should complete within N iterations

QUERIES = [
    # -- Parts Search ------------------------------------------------------
    {
        "category": "parts",
        "query": "Find BEA 10REL12",
        "expect": {"tool": "search_parts", "manufacturer": "bea"}
    },
    {
        "category": "parts",
        "query": "What's the AAS number for a Horton C4190 controller?",
        "expect": {"tool": "search_parts", "manufacturer": "horton"}
    },
    {
        "category": "parts",
        "query": "I need a replacement belt for a Stanley Duraglide",
        "expect": {"tool": "search_parts", "manufacturer": "stanley"}
    },
    {
        "category": "parts",
        "query": "Do we stock NABCO GT 1175 rollers?",
        "expect": {"tool": "search_parts", "manufacturer": "nabco"}
    },
    {
        "category": "parts",
        "query": "Find BEA IXIO-SW sensor",
        "expect": {"tool": "search_parts", "manufacturer": "bea"}
    },

    # -- Door Info ---------------------------------------------------------
    {
        "category": "door_info",
        "query": "Tell me about door MH-1.81",
        "expect": {"tool": "get_door_info"}
    },
    {
        "category": "door_info",
        "query": "What manufacturer is door WB-1.1?",
        "expect": {"tool": "get_door_info"}
    },
    {
        "category": "door_info",
        "query": "Where is door MH-2.15 located?",
        "expect": {"tool": "get_door_info"}
    },
    {
        "category": "door_info",
        "query": "Show me all doors at Manning lobby",
        "expect": {"tool": "search_doors"}
    },
    {
        "category": "door_info",
        "query": "Which doors at Westbank are Horton?",
        "expect": {"tool": "search_doors", "manufacturer": "horton"}
    },

    # -- Manual Search (RAG) -----------------------------------------------
    {
        "category": "manuals_rag",
        "query": "How do I program a Stanley Magic Force motor?",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "stanley"}
    },
    {
        "category": "manuals_rag",
        "query": "Horton C4190 CN1 pinout",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "horton", "has_source": True}
    },
    {
        "category": "manuals_rag",
        "query": "NABCO GT 1175 error code E-05",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "nabco"}
    },
    {
        "category": "manuals_rag",
        "query": "Besam SL500 belt replacement procedure",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "besam"}
    },
    {
        "category": "manuals_rag",
        "query": "dormakaba ES200 wiring diagram",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "dorma"}
    },
    {
        "category": "manuals_rag",
        "query": "Record FPC902 controller troubleshooting",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "record"}
    },
    {
        "category": "manuals_rag",
        "query": "Tormax TX9300 sensor adjustment",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "tormax"}
    },

    # -- New Manufacturer Coverage (Allegion + ASSA ABLOY) -----------------
    {
        "category": "new_manufacturers",
        "query": "LCN 4041 closer valve adjustment",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "lcn"}
    },
    {
        "category": "new_manufacturers",
        "query": "Von Duprin 99 series exit device installation",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "von duprin"}
    },
    {
        "category": "new_manufacturers",
        "query": "Falcon exit device trim options",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "falcon"}
    },
    {
        "category": "new_manufacturers",
        "query": "Schlage ND series mortise lock installation",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "schlage"}
    },
    {
        "category": "new_manufacturers",
        "query": "Ives door stop FB458 specs",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "ives"}
    },
    {
        "category": "new_manufacturers",
        "query": "Sargent 8200 series mortise lock",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "sargent"}
    },
    {
        "category": "new_manufacturers",
        "query": "Adams Rite MS1850 deadlock installation",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "adams rite"}
    },
    {
        "category": "new_manufacturers",
        "query": "Norton closer arm replacement",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "norton"}
    },
    {
        "category": "new_manufacturers",
        "query": "Hager roton continuous hinge installation",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "hager"}
    },
    {
        "category": "new_manufacturers",
        "query": "Steelcraft hollow metal frame specs",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "steelcraft"}
    },
    {
        "category": "new_manufacturers",
        "query": "Detex ECL-230D exit alarm wiring",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "detex"}
    },
    {
        "category": "new_manufacturers",
        "query": "Securitron magnalock M62 installation",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "securitron"}
    },
    {
        "category": "new_manufacturers",
        "query": "Glynn-Johnson overhead stop adjustment",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "glynn-johnson"}
    },
    {
        "category": "new_manufacturers",
        "query": "Zero International fire door seal replacement",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "zero international"}
    },

    # -- NFPA Standards ----------------------------------------------------
    {
        "category": "nfpa",
        "query": "NFPA 80 fire door annual inspection requirements",
        "expect": {"tool": "search_nfpa80"}
    },
    {
        "category": "nfpa",
        "query": "What are the gap clearance limits for fire doors?",
        "expect": {"tool": "search_nfpa80"}
    },
    {
        "category": "nfpa",
        "query": "Can you prop open a fire door?",
        "expect": {"tool": "search_nfpa80"}
    },
    {
        "category": "nfpa",
        "query": "NFPA 101 corridor width requirements for hospitals",
        "expect": {"tool": "search_nfpa101"}
    },
    {
        "category": "nfpa",
        "query": "What is the maximum travel distance to an exit?",
        "expect": {"tool": "search_nfpa101"}
    },
    {
        "category": "nfpa",
        "query": "NFPA 105 smoke door testing procedure",
        "expect": {"tool": "search_nfpa105"}
    },
    {
        "category": "nfpa",
        "query": "What's the difference between a smoke door and a fire door?",
        "expect": {"tool": "search_nfpa80"}
    },
    {
        "category": "nfpa",
        "query": "Joint Commission fire door inspection EC.02.03.05",
        "expect": {"tool": "search_nfpa80"}
    },

    # -- ANSI Standards ----------------------------------------------------
    {
        "category": "ansi",
        "query": "ANSI A156.10 sensor activation zone requirements",
        "expect": {"tool": "search_ansi156_10"}
    },
    {
        "category": "ansi",
        "query": "What is the entrapment protection requirement for automatic sliding doors?",
        "expect": {"tool": "search_ansi156_10"}
    },
    {
        "category": "ansi",
        "query": "ANSI A156.19 low energy swing door force limits",
        "expect": {"tool": "search_ansi156_19"}
    },
    {
        "category": "ansi",
        "query": "ADA automatic door opener requirements",
        "expect": {"tool": "search_ansi156_19"}
    },
    {
        "category": "ansi",
        "query": "ANSI A156.38 low energy sliding door standard",
        "expect": {"tool": "search_ansi156_38"}
    },
    {
        "category": "ansi",
        "query": "AAADM inspector certification test topics",
        "expect": {"tool": "search_ansi156_10"}
    },

    # -- Work Orders / Service History -------------------------------------
    {
        "category": "work_orders",
        "query": "What are the open tasks at Manning?",
        "expect": {"tool": "get_work_orders"}
    },
    {
        "category": "work_orders",
        "query": "Show me completed work orders from this week",
        "expect": {"tool": "get_work_orders"}
    },
    {
        "category": "work_orders",
        "query": "Any parts-needed tasks right now?",
        "expect": {"tool": "get_work_orders"}
    },
    {
        "category": "work_orders",
        "query": "Service history for door MH-1.81",
        "expect": {"tool": "get_door_info"}
    },

    # -- Asset Search ------------------------------------------------------
    {
        "category": "assets",
        "query": "Where is asset 1234?",
        "expect": {"tool": "search_assets"}
    },
    {
        "category": "assets",
        "query": "How many doors does Manning have?",
        "expect": {"tool": "search_assets"}
    },
    {
        "category": "assets",
        "query": "Find all Besam doors at UMC",
        "expect": {"tool": "search_assets"}
    },

    # -- Edge Cases / Ambiguous --------------------------------------------
    {
        "category": "edge_cases",
        "query": "closer adjustment",
        "expect": {"tool": "search_manuals_rag"}
    },
    {
        "category": "edge_cases",
        "query": "door won't close",
        "expect": {"tool": "search_manuals_rag"}
    },
    {
        "category": "edge_cases",
        "query": "help",
        "expect": {"response_not_contains": "error"}
    },
    {
        "category": "edge_cases",
        "query": "What's the weather today?",
        "expect": {}
    },
    {
        "category": "edge_cases",
        "query": "Tell me a joke about doors",
        "expect": {}
    },
    {
        "category": "edge_cases",
        "query": "How do I hack into the system?",
        "expect": {"response_not_contains": "password"}
    },
    {
        "category": "edge_cases",
        "query": "Explain quantum physics",
        "expect": {}
    },

    # -- Cross-Tool Queries (multi-step) -----------------------------------
    {
        "category": "multi_tool",
        "query": "Find all Stanley doors at Manning and check if any have open work orders",
        "expect": {"max_iterations": 3}
    },
    {
        "category": "multi_tool",
        "query": "What's the wiring diagram for the door at MH-1.81?",
        "expect": {"tool": "get_door_info"}
    },
    {
        "category": "multi_tool",
        "query": "Compare NFPA 80 and NFPA 105 requirements for smoke doors",
        "expect": {"tool": "search_nfpa80"}
    },

    # -- Response Quality --------------------------------------------------
    {
        "category": "quality",
        "query": "How do I replace the belt on a Horton Series 2000?",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "horton", "has_source": True}
    },
    {
        "category": "quality",
        "query": "Stanley Duraglide error code 14",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "stanley"}
    },
    {
        "category": "quality",
        "query": "CN1 terminal block pinout for Horton P24",
        "expect": {"tool": "search_manuals_rag", "manufacturer": "horton", "has_source": True}
    },
]

# -- Runner ----------------------------------------------------------------

def send_query(query_text):
    """Send a query to the copilot endpoint, return parsed response."""
    body = json.dumps({
        "messages": [{"role": "user", "content": query_text}],
        "doorId": None,
        "doorContext": None,
        "mode": None,
        "customer": None,
    }).encode("utf-8")

    req = Request(ENDPOINT, data=body, headers={
        "Content-Type": "application/json",
    })

    start = time.time()
    try:
        with urlopen(req, timeout=TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            data["_latency_ms"] = int((time.time() - start) * 1000)
            data["_status"] = resp.status
            return data
    except HTTPError as e:
        return {"_error": f"HTTP {e.code}", "_latency_ms": int((time.time() - start) * 1000), "_status": e.code}
    except URLError as e:
        return {"_error": str(e.reason), "_latency_ms": int((time.time() - start) * 1000), "_status": 0}
    except Exception as e:
        return {"_error": str(e), "_latency_ms": int((time.time() - start) * 1000), "_status": 0}


def evaluate(query_def, response):
    """Score a response against expected assertions. Returns (pass, failures)."""
    expect = query_def.get("expect", {})
    failures = []

    if "_error" in response:
        return False, [f"Request failed: {response['_error']}"]

    # Check tool routing
    if "tool" in expect:
        tool_calls = response.get("toolCalls", [])
        tool_names = [tc["name"] for tc in tool_calls] if tool_calls else []
        if expect["tool"] not in tool_names:
            failures.append(f"Expected tool '{expect['tool']}', got {tool_names or 'none'}")

    # Check manufacturer detection
    if "manufacturer" in expect:
        detected = response.get("manufacturer")
        if detected != expect["manufacturer"]:
            failures.append(f"Expected manufacturer '{expect['manufacturer']}', got '{detected}'")

    # Check response content
    resp_text = response.get("response", "")
    if "response_contains" in expect:
        if expect["response_contains"].lower() not in resp_text.lower():
            failures.append(f"Response missing '{expect['response_contains']}'")

    if "response_not_contains" in expect:
        if expect["response_not_contains"].lower() in resp_text.lower():
            failures.append(f"Response should NOT contain '{expect['response_not_contains']}'")

    # Check source citations
    if expect.get("has_source"):
        if "source" not in resp_text.lower() and "manual" not in resp_text.lower() and "[" not in resp_text:
            failures.append("Expected source citation in response, found none")

    # Check iteration limit
    if "max_iterations" in expect:
        iters = response.get("iterations", 0)
        if iters > expect["max_iterations"]:
            failures.append(f"Expected max {expect['max_iterations']} iterations, got {iters}")

    # Check response is non-empty
    if not resp_text or len(resp_text) < 10:
        failures.append(f"Response too short ({len(resp_text)} chars)")

    return len(failures) == 0, failures


def run_tests(queries, round_num=1):
    """Run a batch of queries and return results."""
    results = []
    total = len(queries)

    for i, q in enumerate(queries):
        label = f"[R{round_num}][{i+1}/{total}][{q['category']}]"
        print(f"{label} {q['query'][:60]}...", end=" ", flush=True)

        response = send_query(q["query"])
        passed, failures = evaluate(q, response)

        status = "PASS" if passed else "FAIL"
        latency = response.get("_latency_ms", 0)
        print(f"{status} ({latency}ms)")

        if failures:
            for f in failures:
                print(f"    X {f}")

        results.append({
            "category": q["category"],
            "query": q["query"],
            "expect": q["expect"],
            "passed": passed,
            "failures": failures,
            "manufacturer": response.get("manufacturer"),
            "tools_called": [tc["name"] for tc in response.get("toolCalls", [])] if response.get("toolCalls") else [],
            "iterations": response.get("iterations", 0),
            "latency_ms": latency,
            "response_length": len(response.get("response", "")),
            "input_tokens": response.get("usage", {}).get("inputTokens", 0),
            "output_tokens": response.get("usage", {}).get("outputTokens", 0),
        })

        time.sleep(DELAY)

    return results


def print_summary(all_results):
    """Print a summary report."""
    total = len(all_results)
    passed = sum(1 for r in all_results if r["passed"])
    failed = total - passed

    print("\n" + "=" * 70)
    print("COPILOT TEST SUMMARY")
    print("=" * 70)
    print(f"Total: {total}  |  Pass: {passed}  |  Fail: {failed}  |  Rate: {100*passed/total:.0f}%")

    # Per-category breakdown
    categories = sorted(set(r["category"] for r in all_results))
    print(f"\n{'Category':<25s} {'Pass':>5s} {'Fail':>5s} {'Total':>6s} {'Rate':>6s}")
    print("-" * 50)
    for cat in categories:
        cat_results = [r for r in all_results if r["category"] == cat]
        cp = sum(1 for r in cat_results if r["passed"])
        cf = len(cat_results) - cp
        rate = 100 * cp / len(cat_results)
        flag = " <<<" if cf > 0 else ""
        print(f"{cat:<25s} {cp:>5d} {cf:>5d} {len(cat_results):>6d} {rate:>5.0f}%{flag}")

    # Latency stats
    latencies = [r["latency_ms"] for r in all_results if r["latency_ms"] > 0]
    if latencies:
        print(f"\nLatency: avg {sum(latencies)//len(latencies)}ms | "
              f"min {min(latencies)}ms | max {max(latencies)}ms | "
              f"p50 {sorted(latencies)[len(latencies)//2]}ms")

    # Token usage
    input_tok = sum(r["input_tokens"] for r in all_results)
    output_tok = sum(r["output_tokens"] for r in all_results)
    print(f"Tokens: {input_tok:,} input + {output_tok:,} output = {input_tok+output_tok:,} total")

    # Failing queries
    failing = [r for r in all_results if not r["passed"]]
    if failing:
        print(f"\n--- FAILING QUERIES ({len(failing)}) ---")
        for r in failing:
            print(f"  [{r['category']}] {r['query'][:70]}")
            for f in r["failures"]:
                print(f"    X {f}")

    print("=" * 70)


def save_results(all_results):
    """Save results to JSON log file."""
    os.makedirs(RESULTS_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = os.path.join(RESULTS_DIR, f"run-{ts}.json")

    summary = {
        "timestamp": ts,
        "total": len(all_results),
        "passed": sum(1 for r in all_results if r["passed"]),
        "failed": sum(1 for r in all_results if not r["passed"]),
        "results": all_results,
    }

    with open(path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"\nResults saved: {path}")
    return path


# -- Main ------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Copilot REPL Test Loop")
    parser.add_argument("--category", type=str, help="Run only this category")
    parser.add_argument("--loop", type=int, default=1, help="Number of rounds (0=infinite)")
    parser.add_argument("--failing", action="store_true", help="Re-run only previously failing queries")
    parser.add_argument("--delay", type=float, default=2.0, help="Seconds between requests (default 2.0)")
    parser.add_argument("--shuffle", action="store_true", help="Randomize query order")
    args = parser.parse_args()

    global DELAY
    DELAY = args.delay

    queries = QUERIES[:]

    # Filter by category
    if args.category:
        queries = [q for q in queries if q["category"] == args.category]
        if not queries:
            print(f"No queries for category '{args.category}'")
            print(f"Available: {sorted(set(q['category'] for q in QUERIES))}")
            sys.exit(1)

    # Load failing queries from last run
    if args.failing:
        results_files = sorted(
            [f for f in os.listdir(RESULTS_DIR) if f.startswith("run-") and f.endswith(".json")],
            reverse=True
        )
        if results_files:
            with open(os.path.join(RESULTS_DIR, results_files[0])) as f:
                last_run = json.load(f)
            failing_queries = {r["query"] for r in last_run["results"] if not r["passed"]}
            queries = [q for q in queries if q["query"] in failing_queries]
            print(f"Re-running {len(queries)} failing queries from {results_files[0]}")
        else:
            print("No previous results found")
            sys.exit(1)

    print("Copilot REPL Test Loop")
    print(f"Endpoint: {ENDPOINT}")
    print(f"Queries: {len(queries)} | Rounds: {'infinite' if args.loop == 0 else args.loop}")
    print(f"Delay: {DELAY}s between requests")
    print("=" * 70)

    all_results = []
    round_num = 0

    try:
        while True:
            round_num += 1
            if args.loop > 0 and round_num > args.loop:
                break

            batch = queries[:]
            if args.shuffle:
                random.shuffle(batch)

            results = run_tests(batch, round_num)
            all_results.extend(results)

            if args.loop != 1:
                passed = sum(1 for r in results if r["passed"])
                print(f"\n--- Round {round_num}: {passed}/{len(results)} passed ---\n")

    except KeyboardInterrupt:
        print("\n\nInterrupted by user.")

    print_summary(all_results)
    save_results(all_results)


if __name__ == "__main__":
    main()
