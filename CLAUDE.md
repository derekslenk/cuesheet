# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js web application that controls multiple OBS Source Switchers. It provides a UI for managing stream sources across different screen layouts (large, left, right, topLeft, topRight, bottomLeft, bottomRight) and communicates with OBS WebSocket API to control streaming sources.

## Key Commands

### Development
- `npm run dev` - Start the development server
- `npm run build` - Build the production application
- `npm start` - Start the production server
- `npm run lint` - Run ESLint to check code quality
- `npm run type-check` - Run TypeScript type checking without emitting files

## Architecture Overview

### Technology Stack
- **Frontend**: Next.js 15.1.6 with React 19, TypeScript, and Tailwind CSS
- **Backend**: Next.js API routes
- **Database**: SQLite with sqlite3 driver
- **OBS Integration**: obs-websocket-js for WebSocket communication with OBS Studio
- **Styling**: Tailwind CSS with @tailwindcss/forms plugin

### Project Structure
- `/app` - Next.js App Router pages and API routes
  - `/api` - Backend API endpoints for stream management
  - `/add` - Page for adding new stream clients
- `/components` - Reusable React components (e.g., Dropdown)
- `/lib` - Core utilities and database connection
  - `database.ts` - SQLite database initialization and connection management
  - `obsClient.js` - OBS WebSocket client for communicating with OBS Studio
  - `constants.ts` - Shared constants (table names, etc.)
- `/types` - TypeScript type definitions
- `/files` - Default directory for SQLite database and text files (configurable via .env.local)

### Key Concepts

1. **Stream Management**: The app manages stream sources that can be assigned to different screen positions. Each stream has:
   - name: Display name
   - obs_source_name: Name of the source in OBS
   - url: Stream URL
   - team_id: Associated team identifier

2. **Screen Types**: Seven different screen positions are supported: large, left, right, topLeft, topRight, bottomLeft, bottomRight

3. **Text File Integration**: The app writes the active source name to text files that OBS Source Switcher reads to switch sources automatically

4. **Environment Configuration**:
   - `FILE_DIRECTORY`: Directory for database and text files (default: ./files)
   - `OBS_WEBSOCKET_HOST`: OBS WebSocket host (default: 127.0.0.1)
   - `OBS_WEBSOCKET_PORT`: OBS WebSocket port (default: 4455)
   - `OBS_WEBSOCKET_PASSWORD`: OBS WebSocket password (optional)

### API Endpoints

- `POST /api/addStream` - Add new stream to database and OBS
- `GET /api/streams` - Get all available streams
- `GET /api/teams` - Get all teams
- `GET /api/getActive` - Get currently active sources for all screens
- `POST /api/setActive` - Set active stream for a specific screen
- `GET /api/getTeamName` - Get team name by ID

### Database Schema

Two main tables:
- `streams`: id, name, obs_source_name, url, team_id
- `teams`: team_id, team_name

### OBS Integration Pattern

The app communicates with OBS through:
1. WebSocket connection using obs-websocket-js
2. Text files that OBS Source Switcher monitors for source changes
3. Direct source management through OBS WebSocket API

When setting an active source:
1. User selects stream in UI
2. API writes source name to corresponding text file (e.g., largeScreen.txt)
3. OBS Source Switcher detects file change and switches to that source