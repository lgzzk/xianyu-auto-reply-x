#!/bin/sh
set -eu
export DISPLAY=:99
Xvfb "$DISPLAY" -screen 0 1440x900x24 -ac +extension RANDR >/tmp/xvfb.log 2>&1 &
for i in $(seq 1 30); do
  [ -S /tmp/.X11-unix/X99 ] && break
  sleep 1
done
x11vnc -display "$DISPLAY" -forever -shared -rfbport 5900 -nopw -listen 0.0.0.0 >/tmp/x11vnc.log 2>&1 &
websockify --web=/usr/share/novnc 6080 127.0.0.1:5900 >/tmp/novnc.log 2>&1 &
exec python websocket/main.py
