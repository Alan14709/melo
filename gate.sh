#!/usr/bin/env bash
set -u

ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
cd "$ROOT" || exit 1

ARTIFACTS_DIR="$ROOT/artifacts"
SUMMARY_JSON="$ARTIFACTS_DIR/summary.json"
BUILD_LOG="$ARTIFACTS_DIR/build.log"

mkdir -p "$ARTIFACTS_DIR"
rm -rf "$ARTIFACTS_DIR"/run-* "$SUMMARY_JSON"

json_escape() {
  local value="${1:-}"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/ }
  value=${value//$'\r'/ }
  printf '%s' "$value"
}

json_bool_or_empty() {
  local file="$1"
  local key="$2"
  node -e "const fs=require('fs');try{const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const v=j[process.argv[2]];if(typeof v==='boolean')process.stdout.write(String(v));}catch{}" "$file" "$key"
}

json_num_or_nan() {
  local file="$1"
  local key="$2"
  node -e "const fs=require('fs');try{const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const v=Number(j[process.argv[2]]);process.stdout.write(Number.isFinite(v)?String(v):'NaN');}catch{process.stdout.write('NaN')}" "$file" "$key"
}

json_str_or_empty() {
  local file="$1"
  local key="$2"
  node -e "const fs=require('fs');try{const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const v=j[process.argv[2]];if(v!=null)process.stdout.write(String(v));}catch{}" "$file" "$key"
}

run_cmd_capture() {
  local cmd="$1"
  local log="$2"
  bash -lc "$cmd" >"$log" 2>&1
  return $?
}

now_iso() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Preflight: no inventar entorno grafico.
HAS_DISPLAY=0
if [[ -n "${DISPLAY:-}" || -n "${WAYLAND_DISPLAY:-}" ]]; then
  HAS_DISPLAY=1
fi

if [[ "$HAS_DISPLAY" -ne 1 ]]; then
  cat > "$SUMMARY_JSON" <<JSON
{
  "verdict_global": "INVALID_ENVIRONMENT",
  "reason": "no_graphical_display",
  "details": {
    "DISPLAY": "$(json_escape "${DISPLAY:-}")",
    "WAYLAND_DISPLAY": "$(json_escape "${WAYLAND_DISPLAY:-}")",
    "XDG_SESSION_TYPE": "$(json_escape "${XDG_SESSION_TYPE:-}")",
    "XDG_RUNTIME_DIR": "$(json_escape "${XDG_RUNTIME_DIR:-}")"
  },
  "runs": []
}
JSON
  cat "$SUMMARY_JSON"
  exit 2
fi

BUILD_EXIT=0
echo "[gate] build production"
if ! run_cmd_capture "npm run build" "$BUILD_LOG"; then
  BUILD_EXIT=1
fi

for i in 1 2 3; do
  RUN_DIR="$ARTIFACTS_DIR/run-$i"
  RUN_STARTED_AT="$(now_iso)"
  mkdir -p "$RUN_DIR"

  rm -f "$ROOT/test-results/smoke-report.json" "$ROOT/test-results/stress-report.json"

  echo "[gate] run-$i smoke"
  run_cmd_capture "cd '$ROOT' && MELO_RUN_SMOKE=1 MELO_LINUX_COMPAT_MODE=1 ./dist-electron/linux-unpacked/melo --no-sandbox" "$RUN_DIR/smoke.log"
  echo $? > "$RUN_DIR/smoke.exit"
  if [[ -f "$ROOT/test-results/smoke-report.json" ]]; then
    cp "$ROOT/test-results/smoke-report.json" "$RUN_DIR/smoke-report.json"
  fi

  echo "[gate] run-$i stress"
  run_cmd_capture "cd '$ROOT' && MELO_RUN_STRESS=1 MELO_STRESS_SWITCHES=40 MELO_LINUX_COMPAT_MODE=1 ./dist-electron/linux-unpacked/melo --no-sandbox" "$RUN_DIR/stress.log"
  echo $? > "$RUN_DIR/stress.exit"
  if [[ -f "$ROOT/test-results/stress-report.json" ]]; then
    cp "$ROOT/test-results/stress-report.json" "$RUN_DIR/stress-report.json"
  fi

  RUN_FINISHED_AT="$(now_iso)"
  echo "$RUN_STARTED_AT" > "$RUN_DIR/started_at"
  echo "$RUN_FINISHED_AT" > "$RUN_DIR/finished_at"
done

TOTAL_LAUNCH_FAILED=0
GLOBAL_FAIL=0
GLOBAL_INVALID=0

printf '{\n  "runs": [\n' > "$SUMMARY_JSON"

for i in 1 2 3; do
  RUN_DIR="$ARTIFACTS_DIR/run-$i"
  SMOKE_JSON="$RUN_DIR/smoke-report.json"
  STRESS_JSON="$RUN_DIR/stress-report.json"
  STARTED_AT="$(cat "$RUN_DIR/started_at" 2>/dev/null || echo "")"
  FINISHED_AT="$(cat "$RUN_DIR/finished_at" 2>/dev/null || echo "")"
  SMOKE_EXIT="$(cat "$RUN_DIR/smoke.exit" 2>/dev/null || echo "")"
  STRESS_EXIT="$(cat "$RUN_DIR/stress.exit" 2>/dev/null || echo "")"

  smoke_report_present=0
  stress_report_present=0
  [[ -f "$SMOKE_JSON" ]] && smoke_report_present=1
  [[ -f "$STRESS_JSON" ]] && stress_report_present=1

  smoke_success=""
  smoke_verdict=""
  smoke_reason=""
  if [[ "$smoke_report_present" -eq 1 ]]; then
    smoke_success="$(json_bool_or_empty "$SMOKE_JSON" success)"
    smoke_verdict="$(json_str_or_empty "$SMOKE_JSON" verdict)"
    smoke_reason="$(json_str_or_empty "$SMOKE_JSON" reason)"
  fi

  switches="NaN"
  successful="NaN"
  ratio="NaN"
  recoveries="NaN"
  gpu_fallbacks="NaN"
  no_sandbox_fallbacks="NaN"
  fallback_exhausted="NaN"
  launch_failures_reported="NaN"
  launch_successes_reported="NaN"
  stress_verdict=""
  stress_reason=""
  if [[ "$stress_report_present" -eq 1 ]]; then
    switches="$(json_num_or_nan "$STRESS_JSON" switches)"
    successful="$(json_num_or_nan "$STRESS_JSON" successfulSwitches)"
    recoveries="$(json_num_or_nan "$STRESS_JSON" recoveries)"
    gpu_fallbacks="$(json_num_or_nan "$STRESS_JSON" gpuFallbacksTriggered)"
    no_sandbox_fallbacks="$(json_num_or_nan "$STRESS_JSON" noSandboxFallbacksTriggered)"
    fallback_exhausted="$(json_num_or_nan "$STRESS_JSON" fallbackExhausted)"
    launch_failures_reported="$(json_num_or_nan "$STRESS_JSON" launchFailures)"
    launch_successes_reported="$(json_num_or_nan "$STRESS_JSON" launchSuccesses)"
    stress_verdict="$(json_str_or_empty "$STRESS_JSON" verdict)"
    stress_reason="$(json_str_or_empty "$STRESS_JSON" reason)"
    ratio="$(node -e "const s=Number(process.argv[1]);const ok=Number(process.argv[2]);if(Number.isFinite(s)&&s>0&&Number.isFinite(ok)){process.stdout.write((ok/s).toFixed(4))}else{process.stdout.write('NaN')}" "$switches" "$successful")"
  fi

  lf_smoke=$(grep -Eci 'render_process_gone.*launch-failed|launch-failed.*render_process_gone' "$RUN_DIR/smoke.log" 2>/dev/null || true)
  lf_stress=$(grep -Eci 'render_process_gone.*launch-failed|launch-failed.*render_process_gone' "$RUN_DIR/stress.log" 2>/dev/null || true)
  launch_failed=$((lf_smoke + lf_stress))
  TOTAL_LAUNCH_FAILED=$((TOTAL_LAUNCH_FAILED + launch_failed))

  missing_reports=0
  if [[ "$smoke_report_present" -eq 0 || "$stress_report_present" -eq 0 ]]; then
    missing_reports=1
  fi

  is_invalid=0
  if [[ "$smoke_verdict" == "INVALID_ENVIRONMENT" || "$stress_verdict" == "INVALID_ENVIRONMENT" || "$smoke_reason" == "no_graphical_display" || "$stress_reason" == "no_graphical_display" ]]; then
    is_invalid=1
    GLOBAL_INVALID=1
  fi

  is_fail=0
  if [[ "$is_invalid" -eq 0 ]]; then
    if [[ "$smoke_success" != "true" ]]; then
      is_fail=1
    fi
    node -e "const s=Number(process.argv[1]);const r=Number(process.argv[2]);if(!(Number.isFinite(s)&&s>=20&&Number.isFinite(r)&&r>=0.9))process.exit(1)" "$switches" "$ratio" || is_fail=1
    if [[ "$launch_failed" -ne 0 ]]; then
      is_fail=1
    fi
    if [[ "$missing_reports" -eq 1 ]]; then
      is_fail=1
    fi
  fi

  if [[ "$is_fail" -eq 1 ]]; then
    GLOBAL_FAIL=1
  fi

  comma=','
  [[ "$i" -eq 3 ]] && comma=''
  cat >> "$SUMMARY_JSON" <<JSON
    {
      "run": $i,
      "smoke_success": "${smoke_success}",
      "switches": "${switches}",
      "successfulSwitches": "${successful}",
      "ratio": "${ratio}",
      "recoveries": "${recoveries}",
      "gpu_fallbacks": "${gpu_fallbacks}",
      "no_sandbox_fallbacks": "${no_sandbox_fallbacks}",
      "fallback_exhausted": "${fallback_exhausted}",
      "launch_failures_reported": "${launch_failures_reported}",
      "launch_successes_reported": "${launch_successes_reported}",
      "launch_failed": $launch_failed,
      "invalid_environment": $is_invalid,
      "smoke_reason": "$(json_escape "$smoke_reason")",
      "stress_reason": "$(json_escape "$stress_reason")",
      "smoke_report_present": $smoke_report_present,
      "stress_report_present": $stress_report_present,
      "missing_reports": $missing_reports,
      "started_at": "$(json_escape "$STARTED_AT")",
      "finished_at": "$(json_escape "$FINISHED_AT")",
      "smoke_exit": "$(json_escape "$SMOKE_EXIT")",
      "stress_exit": "$(json_escape "$STRESS_EXIT")"
    }$comma
JSON
done

VERDICT_GLOBAL="PASS"
if [[ "$GLOBAL_INVALID" -eq 1 ]]; then
  VERDICT_GLOBAL="INVALID_ENVIRONMENT"
elif [[ "$GLOBAL_FAIL" -eq 1 || "$TOTAL_LAUNCH_FAILED" -ne 0 || "$BUILD_EXIT" -ne 0 ]]; then
  VERDICT_GLOBAL="FAIL"
fi

cat >> "$SUMMARY_JSON" <<JSON
  ],
  "total_launch_failed": $TOTAL_LAUNCH_FAILED,
  "build_exit": $BUILD_EXIT,
  "verdict_global": "$VERDICT_GLOBAL"
}
JSON

cat "$SUMMARY_JSON"

if [[ "$VERDICT_GLOBAL" == "INVALID_ENVIRONMENT" ]]; then
  exit 2
fi
if [[ "$VERDICT_GLOBAL" == "FAIL" ]]; then
  exit 1
fi
exit 0
