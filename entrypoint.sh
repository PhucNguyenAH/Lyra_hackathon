#!/usr/bin/env bash
set -euo pipefail

# Virtual display for the headful login browser.
Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &
export DISPLAY=:99

# Minimal window manager so the browser window is framed/maximized.
fluxbox >/dev/null 2>&1 &

# x11vnc is started per-login by the app (LoginSessionManager); it targets :99.
# The app binds the platform port; VNC stays on localhost.
exec uvicorn api.main:app --host 0.0.0.0 --port "${PORT:-8000}"
