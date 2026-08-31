#!/bin/sh
set -eu
export DISPLAY=:99
Xvfb "$DISPLAY" -screen 0 1440x900x24 -ac +extension RANDR >/tmp/xvfb.log 2>&1 &
sleep 2
x11vnc -display "$DISPLAY" -forever -shared -rfbport 5900 -nopw -listen 0.0.0.0 >/tmp/x11vnc.log 2>&1 &
websockify --web=/usr/share/novnc 6080 localhost:5900 >/tmp/novnc.log 2>&1 &
exec python websocket/main.py
