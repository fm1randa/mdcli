#!/usr/bin/env bash
# Notifies the maintainer bot's webhook when a claude.ai cloud session ends a
# turn (Stop), fails (StopFailure) or waits on a permission prompt or input
# (Notification). Registered in .claude/settings.json; cloud sessions only run
# hooks committed in the repo.
#
# Runs only when CLAUDE_CODE_REMOTE=true, MDCLI_WEBHOOK_URL is set and curl
# exists; otherwise it exits at once. It never blocks the session: it prints
# nothing on stdout, always exits 0, and sends the request detached (nohup,
# curl --max-time 10).
#
# Payload (JSON POST to $MDCLI_WEBHOOK_URL): event (claude_session_stopped |
# claude_session_failed | claude_session_notification), source, hook_event_name,
# repo, session_id, session_url (https://claude.ai/code/<id>, with a "cse_"
# prefix turned into "session_"), branch, head (short sha), cwd,
# hook_session_id, notification_type, message, reason, error, stop_hook_active,
# last_assistant_message (first 1500 chars) and at (UTC ISO 8601). The hook
# input is read from stdin with jq, falling back to python3.
#
# MDCLI_WEBHOOK_AUTH, when set, is sent as the Authorization header: as is if
# it already starts with "Authorization:", otherwise prefixed with
# "Authorization: ". Secrets come only from the environment and are never
# echoed; the header goes to curl through a private temp file, not argv.

{
  [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
  [ -n "${MDCLI_WEBHOOK_URL:-}" ] || exit 0
  command -v curl >/dev/null 2>&1 || exit 0

  input=$(cat)

  session_id="${CLAUDE_CODE_REMOTE_SESSION_ID:-}"
  case "$session_id" in
    cse_*) session_id="session_${session_id#cse_}" ;;
  esac
  session_url=""
  [ -n "$session_id" ] && session_url="https://claude.ai/code/$session_id"

  project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"
  branch=$(git -C "$project_dir" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  head=$(git -C "$project_dir" rev-parse --short HEAD 2>/dev/null || true)
  at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  if command -v jq >/dev/null 2>&1; then
    payload=$(printf '%s' "$input" | jq -c \
      --arg session_id "$session_id" --arg session_url "$session_url" \
      --arg branch "$branch" --arg head "$head" --arg at "$at" '
      def s: if . == null then null else tostring end;
      (try . catch {}) as $in
      | ($in.hook_event_name // "" | tostring) as $name
      | {
          event: (if $name == "Stop" then "claude_session_stopped"
                  elif $name == "StopFailure" then "claude_session_failed"
                  elif $name == "Notification" then "claude_session_notification"
                  else "claude_session_" + ($name | ascii_downcase) end),
          source: "cloud",
          hook_event_name: $name,
          repo: "fm1randa/mdcli",
          session_id: $session_id,
          session_url: $session_url,
          branch: $branch,
          head: $head,
          cwd: ($in.cwd | s),
          hook_session_id: ($in.session_id | s),
          notification_type: ($in.notification_type | s),
          message: ($in.message | s),
          reason: ($in.reason | s),
          error: (if $in.error == null then null
                  elif ($in.error | type) == "string" then $in.error
                  else ($in.error | tojson) end),
          stop_hook_active: ($in.stop_hook_active // false),
          last_assistant_message: ($in.last_assistant_message | s
                                   | if . == null then null else .[0:1500] end),
          at: $at
        }' 2>/dev/null) || payload=""
  fi

  if [ -z "${payload:-}" ] && command -v python3 >/dev/null 2>&1; then
    payload=$(printf '%s' "$input" | SESSION_ID="$session_id" \
      SESSION_URL="$session_url" BRANCH="$branch" HEAD_SHA="$head" AT="$at" \
      python3 -I -c '
import json, os, sys

try:
    data = json.loads(sys.stdin.read() or "{}")
except ValueError:
    data = {}
if not isinstance(data, dict):
    data = {}

def text(key):
    value = data.get(key)
    if value is None or isinstance(value, str):
        return value
    return json.dumps(value) if isinstance(value, (dict, list)) else str(value)

name = text("hook_event_name") or ""
events = {
    "Stop": "claude_session_stopped",
    "StopFailure": "claude_session_failed",
    "Notification": "claude_session_notification",
}
last = text("last_assistant_message")
print(json.dumps({
    "event": events.get(name, "claude_session_" + name.lower()),
    "source": "cloud",
    "hook_event_name": name,
    "repo": "fm1randa/mdcli",
    "session_id": os.environ["SESSION_ID"],
    "session_url": os.environ["SESSION_URL"],
    "branch": os.environ["BRANCH"],
    "head": os.environ["HEAD_SHA"],
    "cwd": text("cwd"),
    "hook_session_id": text("session_id"),
    "notification_type": text("notification_type"),
    "message": text("message"),
    "reason": text("reason"),
    "error": text("error"),
    "stop_hook_active": bool(data.get("stop_hook_active", False)),
    "last_assistant_message": last[:1500] if last is not None else None,
    "at": os.environ["AT"],
}))
' 2>/dev/null) || payload=""
  fi

  [ -n "${payload:-}" ] || exit 0

  tmp=$(umask 077 && mktemp -d 2>/dev/null) || exit 0
  printf '%s' "$payload" >"$tmp/payload.json"
  : >"$tmp/headers"
  if [ -n "${MDCLI_WEBHOOK_AUTH:-}" ]; then
    case "$MDCLI_WEBHOOK_AUTH" in
      Authorization:*) printf '%s\n' "$MDCLI_WEBHOOK_AUTH" >"$tmp/headers" ;;
      *) printf 'Authorization: %s\n' "$MDCLI_WEBHOOK_AUTH" >"$tmp/headers" ;;
    esac
  fi

  nohup bash -c '
    curl -sS -o /dev/null --max-time 10 -X POST \
      -H "Content-Type: application/json" -H "@$1/headers" \
      --data-binary "@$1/payload.json" "$2"
    rm -rf "$1"
  ' cloud-notify "$tmp" "$MDCLI_WEBHOOK_URL" </dev/null >/dev/null 2>&1 &
} >/dev/null 2>&1

exit 0
