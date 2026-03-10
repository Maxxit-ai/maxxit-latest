"""
AskSurf Persistent Session Service
Maintains a logged-in browser profile to avoid short-lived API token expiration.

Usage:
  # First-time login (headed browser — requires display/VNC):
  python services/surf-session-service.py --login

  # Normal headless mode (after login):
  python services/surf-session-service.py

Environment:
  SURF_SERVICE_PORT=5010 (default)
  SURF_PROFILE_DIR=~/.surf-session-profile (default)
  SURF_SESSION_ID=<uuid>  (optional — reuse specific session, else new per request)
"""

import os
import sys
import json
import time
import uuid
import logging
import argparse

from pathlib import Path

from flask import Flask, request, jsonify
from flask_cors import CORS
from playwright.sync_api import sync_playwright, Playwright, BrowserContext, Page

# ─── Configuration ──────────────────────────────────────────────
SURF_API_BASE = "https://api.asksurf.ai/muninn/v4/chat/sessions"
SURF_SITE_URL = "https://www.asksurf.ai"
DEFAULT_PORT = int(os.environ.get("SURF_SERVICE_PORT", "5010"))
DEFAULT_PROFILE_DIR = os.environ.get(
    "SURF_PROFILE_DIR",
    str(Path.home() / ".surf-session-profile"),
)
DEFAULT_SESSION_ID = os.environ.get("SURF_SESSION_ID", "")

TOKEN_REFRESH_INTERVAL_SEC = 600  # 10 minutes

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── Global State ───────────────────────────────────────────────
_current_token: str | None = None
_token_captured_at: float = 0.0
_playwright: Playwright | None = None
_context: BrowserContext | None = None
_page: Page | None = None


# ════════════════════════════════════════════════════════════════
#  TOKEN CAPTURE
# ════════════════════════════════════════════════════════════════

def _on_request(req):
    """Intercept outgoing requests to capture fresh Bearer token."""
    global _current_token, _token_captured_at
    if "api.asksurf.ai" in req.url:
        auth = req.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            token = auth.split(" ", 1)[1]
            if token != _current_token:
                _current_token = token
                _token_captured_at = time.time()
                logger.info("🔑 Captured fresh Surf auth token")


def _launch_browser(profile_dir: str, headless: bool = True) -> tuple:
    """Launch Playwright with a persistent browser context."""
    global _playwright, _context, _page

    _playwright = sync_playwright().start()

    _context = _playwright.chromium.launch_persistent_context(
        user_data_dir=profile_dir,
        headless=headless,
        viewport={"width": 1280, "height": 720},
        user_agent=(
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        args=[
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
        ],
    )

    _page = _context.new_page()
    _page.on("request", _on_request)

    return _playwright, _context, _page


def _shutdown_browser():
    """Gracefully close Playwright resources."""
    global _playwright, _context, _page
    try:
        if _context:
            _context.close()
        if _playwright:
            _playwright.stop()
    except Exception as e:
        logger.warning(f"Browser shutdown warning: {e}")


# ════════════════════════════════════════════════════════════════
#  TOKEN REFRESH LOOP
# ════════════════════════════════════════════════════════════════

def _refresh_token():
    """
    Refresh the token inline if it's older than TOKEN_REFRESH_INTERVAL_SEC.
    Must be called from the main thread (same thread that owns Playwright).
    """
    global _current_token, _token_captured_at
    if not _token_captured_at:
        return
    age = time.time() - _token_captured_at
    if age < TOKEN_REFRESH_INTERVAL_SEC:
        return
    try:
        if _page and not _page.is_closed():
            logger.info(f"🔄 Token is {int(age)}s old — refreshing session...")
            _page.goto(SURF_SITE_URL, wait_until="networkidle", timeout=30000)
            _page.wait_for_timeout(5000)
            logger.info(
                f"✅ Token refresh complete — "
                f"token age: {int(time.time() - _token_captured_at)}s"
            )
    except Exception as e:
        logger.error(f"❌ Token refresh error: {e}")


# ════════════════════════════════════════════════════════════════
#  SURF API CALL (using captured token)
# ════════════════════════════════════════════════════════════════

def _call_surf_api(content: str, session_id: str | None = None) -> str | None:
    """
    Call the Surf SSE chat API using the current captured token.
    Parses the event stream and returns the FINAL ai_text.
    """
    import requests

    if not _current_token:
        raise RuntimeError("No auth token captured yet — session may not be loaded")

    sid = session_id or DEFAULT_SESSION_ID or str(uuid.uuid4())
    url = f"{SURF_API_BASE}/{sid}/sse?session_type=V2&platform=WEB&lang=en"

    request_id = uuid.uuid4().hex[:20]

    resp = requests.post(
        url,
        headers={
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "Authorization": f"Bearer {_current_token}",
        },
        json={
            "request_id": request_id,
            "type": "chat_request",
            "messages": [
                {
                    "role": "user",
                    "content": [{"type": "text", "text": content}],
                }
            ],
        },
        stream=True,
        timeout=120,
    )

    if resp.status_code != 200:
        raise RuntimeError(
            f"Surf API returned {resp.status_code}: {resp.text[:500]}"
        )

    ai_text: str | None = None
    for line in resp.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue
        json_str = line[6:].strip()
        if not json_str:
            continue
        try:
            parsed = json.loads(json_str)
            if (
                parsed.get("type") == "stream_event"
                and parsed.get("event_type") == "custom"
                and parsed.get("data", {}).get("event_data", {}).get("type") == "FINAL"
            ):
                ai_text = parsed["data"]["event_data"]["ai_text"]
        except (json.JSONDecodeError, KeyError):
            continue

    return ai_text


# ════════════════════════════════════════════════════════════════
#  FLASK ENDPOINTS
# ════════════════════════════════════════════════════════════════

@app.route("/health", methods=["GET"])
def health():
    token_age = int(time.time() - _token_captured_at) if _token_captured_at else None
    return jsonify({
        "status": "ok" if _current_token else "no_token",
        "service": "surf-session",
        "has_token": _current_token is not None,
        "token_age_seconds": token_age,
        "profile_dir": DEFAULT_PROFILE_DIR,
    })


@app.route("/chat", methods=["POST"])
def chat():
    """
    Main endpoint — called by research.ts.
    Body: { "content": "..." }
    Returns: { "success": true, "ai_text": "..." }
    """
    data = request.json or {}
    content = data.get("content")

    if not content or not isinstance(content, str):
        return jsonify({"success": False, "error": "Missing or invalid 'content'"}), 400

    # Refresh token if stale (runs on main thread — Playwright-safe)
    _refresh_token()

    if not _current_token:
        # Try a quick page load to capture token
        try:
            if _page and not _page.is_closed():
                _page.goto(SURF_SITE_URL, wait_until="networkidle", timeout=30000)
                _page.wait_for_timeout(5000)
        except Exception:
            pass

        if not _current_token:
            return jsonify({
                "success": False,
                "error": "No auth token — run with --login first to authenticate",
            }), 503

    try:
        session_id = data.get("session_id") or DEFAULT_SESSION_ID or None
        ai_text = _call_surf_api(content, session_id=session_id)

        if not ai_text:
            return jsonify({
                "success": False,
                "error": "No FINAL response received from Surf API",
            }), 502

        return jsonify({"success": True, "ai_text": ai_text})

    except RuntimeError as e:
        logger.error(f"Surf API error: {e}")
        return jsonify({"success": False, "error": str(e)}), 502
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/token-status", methods=["GET"])
def token_status():
    """Debug endpoint — shows current token (masked) and age."""
    masked = f"{_current_token[:8]}...{_current_token[-4:]}" if _current_token else None
    return jsonify({
        "has_token": _current_token is not None,
        "token_masked": masked,
        "token_age_seconds": int(time.time() - _token_captured_at) if _token_captured_at else None,
    })


# ════════════════════════════════════════════════════════════════
#  ENTRYPOINT
# ════════════════════════════════════════════════════════════════

def run_login_mode(profile_dir: str):
    """
    Launch a headed (visible) browser for manual AskSurf login.
    After you log in, press Enter in the terminal to save the session and exit.
    """
    print("━" * 60)
    print("  🔐 SURF SESSION LOGIN MODE")
    print("━" * 60)
    print()
    print(f"  Profile dir: {profile_dir}")
    print(f"  A browser window will open to: {SURF_SITE_URL}")
    print()
    print("  1. Log into your AskSurf account in the browser")
    print("  2. Make sure you can see the chat page (this triggers token capture)")
    print("  3. Come back here and press ENTER to save the session")
    print()
    print("━" * 60)

    _launch_browser(profile_dir, headless=False)

    try:
        _page.goto(SURF_SITE_URL, wait_until="networkidle", timeout=60000)
    except Exception as e:
        logger.warning(f"Initial navigation note: {e}")

    input("\n✅ Press ENTER when you have logged in and see the chat page...\n")

    # Give it a moment to capture final cookies
    try:
        _page.wait_for_timeout(3000)
    except Exception:
        pass

    _shutdown_browser()

    print()
    if _current_token:
        print(f"✅ Session saved! Token captured: {_current_token[:12]}...")
    else:
        print("⚠️  Session saved but no token was captured yet.")
        print("   The token will be captured on the first request in normal mode.")
    print(f"📁 Profile saved to: {profile_dir}")
    print()
    print("Now start the service in normal mode:")
    print(f"  python {sys.argv[0]}")


def run_service_mode(profile_dir: str, port: int):
    """Launch the headless browser + Flask server."""
    print("━" * 60)
    print("  🌊 SURF SESSION SERVICE")
    print("━" * 60)
    print(f"  Profile: {profile_dir}")
    print(f"  Port:    {port}")
    print("━" * 60)

    _launch_browser(profile_dir, headless=True)

    # Navigate to AskSurf to trigger initial token capture from stored session
    try:
        logger.info("🌐 Loading AskSurf to capture initial token from stored session...")
        _page.goto(SURF_SITE_URL, wait_until="networkidle", timeout=60000)
        _page.wait_for_timeout(5000)
    except Exception as e:
        logger.warning(f"Initial page load note: {e}")

    if _current_token:
        logger.info(f"✅ Initial token captured: {_current_token[:12]}...")
    else:
        logger.warning("⚠️  No token captured yet — it may appear on first /chat call")

    logger.info(f"🔄 Lazy token refresh enabled (every {TOKEN_REFRESH_INTERVAL_SEC}s on request)")

    # Start Flask
    try:
        app.run(host="0.0.0.0", port=port, debug=False)
    finally:
        _shutdown_browser()


def main():
    parser = argparse.ArgumentParser(description="AskSurf Persistent Session Service")
    parser.add_argument(
        "--login",
        action="store_true",
        help="Run in login mode (headed browser for manual login)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"Service port (default: {DEFAULT_PORT})",
    )
    parser.add_argument(
        "--profile-dir",
        type=str,
        default=DEFAULT_PROFILE_DIR,
        help=f"Browser profile directory (default: {DEFAULT_PROFILE_DIR})",
    )
    args = parser.parse_args()

    # Ensure profile directory exists
    os.makedirs(args.profile_dir, exist_ok=True)

    if args.login:
        run_login_mode(args.profile_dir)
    else:
        run_service_mode(args.profile_dir, args.port)


if __name__ == "__main__":
    main()
