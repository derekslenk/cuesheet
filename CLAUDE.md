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

### Database Management
- `npm run create-sat-summer-2025-tables` - Create database tables with seasonal naming convention

## Architecture Overview

### Technology Stack
- **Frontend**: Next.js 15.1.6 with React 19, TypeScript, and custom CSS with glass morphism design
- **Backend**: Next.js API routes
- **Database**: SQLite with sqlite3 driver
- **OBS Integration**: obs-websocket-js for WebSocket communication with OBS Studio
- **Styling**: Solarized Dark theme with CSS custom properties, Tailwind CSS utilities, and accessible glass morphism components

### Project Structure
- `/app` - Next.js App Router pages and API routes
  - `/api` - Backend API endpoints for stream management
  - `/streams` - Streams management page (add new streams and view existing)
  - `/teams` - Team management page
  - `/edit/[id]` - Individual stream editing
- `/components` - Reusable React components (Header, Footer, Dropdown)
- `/lib` - Core utilities and database connection
  - `database.ts` - SQLite database initialization and connection management
  - `obsClient.js` - OBS WebSocket client with persistent connection management
  - `constants.ts` - Dynamic table naming system for seasonal deployments
- `/types` - TypeScript type definitions
- `/files` - Default directory for SQLite database and text files (configurable via .env.local)
- `/scripts` - Database setup and management scripts
- `/.forgejo/workflows` - Forgejo CI/CD workflows for self-hosted runners

### Key Architectural Concepts

1. **Dynamic Table Naming System**: Uses seasonal configuration for table names (e.g., `streams_2025_summer_sat`, `teams_2025_summer_sat`) to support recurring deployments

2. **Persistent OBS Connection Management**: Single WebSocket connection shared across all API requests with automatic reconnection and connection state tracking

3. **Dual Integration Pattern**: 
   - WebSocket API for direct OBS control (source creation, status monitoring)
   - Text file system for OBS Source Switcher plugin integration (source switching)

4. **Solarized Dark Design System**: Accessible colorblind-friendly theme based on Solarized Dark palette with:
   - High contrast ratios (7.5:1+) meeting WCAG AAA standards
   - CSS custom properties for maintainable theming
   - Glass morphism effects with proper backdrop blur
   - Distinctive active navigation states for clear wayfinding

5. **Screen Position Management**: Seven distinct screen positions (large, left, right, topLeft, topRight, bottomLeft, bottomRight) with individual source control

6. **Real-time Status Monitoring**: Footer component polls OBS status every 30 seconds showing connection, streaming, and recording status

### Environment Configuration
- `FILE_DIRECTORY`: Directory for database and text files (default: ./files)
- `OBS_WEBSOCKET_HOST`: OBS WebSocket host (default: 127.0.0.1)
- `OBS_WEBSOCKET_PORT`: OBS WebSocket port (default: 4455)
- `OBS_WEBSOCKET_PASSWORD`: OBS WebSocket password (optional)
- `API_KEY`: Required for API authentication (set in production)

### API Endpoints

#### Stream Management
- `POST /api/addStream` - Add new stream to database and create browser source in OBS
- `GET /api/streams` - Get all available streams
- `GET /api/streams/[id]` - Individual stream operations

#### Source Control
- `POST /api/setActive` - Set active stream for specific screen position
- `GET /api/getActive` - Get currently active sources for all screens

#### Team Management
- `GET /api/teams` - Get all teams
- `GET /api/getTeamName` - Get team name by ID

#### System Status
- `GET /api/obsStatus` - Real-time OBS connection and streaming status

### Database Schema

Dynamic table names with seasonal configuration:
- `streams_YYYY_SEASON_SUFFIX`: id, name, obs_source_name, url, team_id
- `teams_YYYY_SEASON_SUFFIX`: team_id, team_name

### OBS Integration Pattern

The app uses a sophisticated dual integration approach:

1. **WebSocket Connection**: Direct OBS control using obs-websocket-js with persistent connection management
2. **Text File System**: Each screen position has a corresponding text file that OBS Source Switcher monitors

**Required OBS Source Switchers** (must be created with these exact names):
- `ss_large` - Large screen source switcher
- `ss_left` - Left screen source switcher  
- `ss_right` - Right screen source switcher
- `ss_top_left` - Top left screen source switcher
- `ss_top_right` - Top right screen source switcher
- `ss_bottom_left` - Bottom left screen source switcher
- `ss_bottom_right` - Bottom right screen source switcher

See [OBS Setup Guide](./docs/OBS_SETUP.md) for detailed configuration instructions.

**Source Control Workflow**:
1. User selects stream in React UI
2. API writes source name to position-specific text file (e.g., `large.txt`, `left.txt`)
3. OBS Source Switcher detects file change and switches to specified source
4. Real-time status updates via WebSocket API

**Connection Management**: The OBS client ensures a single persistent connection across all API requests with automatic reconnection handling and connection state validation.

### Component Patterns

- **Client Components**: All interactive components use `'use client'` directive for React 19 compatibility
- **Optimistic Updates**: UI updates immediately with error rollback for responsive user experience  
- **Consistent Layout**: Glass morphism design with unified component styling across all pages
- **Responsive Design**: Grid layouts adapt to different screen sizes with mobile-first approach

### Security Architecture

**Authentication**: API key-based authentication protects all API endpoints through Next.js middleware

**Input Validation**: Comprehensive validation using centralized security utilities in `/lib/security.ts`:
- Screen parameter allowlisting prevents path traversal attacks
- URL validation ensures only http/https protocols
- String sanitization removes potentially dangerous characters
- Integer validation prevents injection attacks

**Path Protection**: File operations are restricted to allowlisted screen names, preventing directory traversal

**Error Handling**: Secure error responses that don't leak system information