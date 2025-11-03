# Project Overview

## Live Stream Manager (obs-ss-plugin-webui)

This is a **Next.js web application** (branded as "Live Stream Manager") that controls multiple OBS Source Switchers. It provides a comprehensive UI for managing live stream sources across different screen layouts.

## Primary Purpose

- Control OBS Studio streaming sources through a web interface
- Manage multiple stream sources (primarily Twitch streams) across 7 screen positions:
  - Large (main)
  - Left, Right
  - Top Left, Top Right
  - Bottom Left, Bottom Right
- Organize streams into teams/groups
- Switch between different scene layouts (1-Screen, 2-Screen, 4-Screen)
- Support studio mode with preview/program transitions

## Key Integration Points

1. **OBS WebSocket API**: Direct control of OBS Studio for source creation, scene management, and status monitoring
2. **OBS Source Switcher Plugin**: Text file-based system where the app writes source names to files that OBS monitors and switches sources accordingly
3. **SQLite Database**: Stores stream and team configuration data with seasonal table naming

## Target Use Case

Professional live streaming setup where operators need to:
- Quickly switch between multiple stream sources
- Organize streamers by teams
- Control complex multi-screen layouts
- Monitor OBS connection and streaming status in real-time
