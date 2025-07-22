# Live Stream Manager

A professional [Next.js](https://nextjs.org) web application for managing live streams and controlling multiple OBS [Source Switchers](https://github.com/exeldro/obs-source-switcher) with real-time WebSocket integration and modern glass morphism UI.


![Live Stream Manager Interface](docs/new_home.png)

## Features

- **OBS Scene Control**: Switch between OBS layouts (1-Screen, 2-Screen, 4-Screen) with dynamic button states
- **Multi-Screen Source Control**: Manage 7 different screen positions (large, left, right, and 4 corners)
- **Real-time OBS Integration**: WebSocket connection with live status monitoring
- **Enhanced Stream Management**: Create, edit, and delete streams with comprehensive OBS cleanup
- **Team Organization**: Organize streams by teams with full CRUD operations and scene synchronization
- **Comprehensive Deletion**: Remove streams/teams with complete OBS component cleanup (scenes, sources, text files)
- **Audio Control**: Browser sources created with muted audio and OBS control enabled
- **Modern UI**: Glass morphism design with responsive layout and accessibility features
- **Professional Broadcasting**: Audio routing, scene management, and live status indicators
- **Dual Integration**: WebSocket API + text file monitoring for maximum compatibility
- **UUID-based Tracking**: Robust OBS group synchronization with rename-safe tracking
- **Enhanced Footer**: Real-time team/stream counts and OBS connection status
- **Optimized Performance**: Reduced code duplication and standardized API responses

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the control interface.

## Configuration

### Environment Variables

Create `.env.local` in the project root:

```env
# File storage directory (optional, defaults to ./files)
FILE_DIRECTORY=C:\\OBS\\source-switching

# OBS WebSocket settings (optional, these are defaults)
OBS_WEBSOCKET_HOST=127.0.0.1
OBS_WEBSOCKET_PORT=4455
OBS_WEBSOCKET_PASSWORD=your_password_here

# Security (IMPORTANT: Set in production)
API_KEY=your_secure_api_key_here
```

### Security Setup

**⚠️ IMPORTANT**: Set `API_KEY` in production to protect your OBS setup from unauthorized access.

Generate a secure API key:
```bash
# Generate a random 32-character key
openssl rand -hex 32
```

Without an API key, anyone on your network can control your OBS streams.

### OBS Source Switcher Setup

1. In OBS, configure Source Switcher properties
2. Enable "Current Source File" at the bottom
3. Point to one of the generated text files (e.g., `large.txt`, `left.txt`)
4. Set read interval to 1000ms
5. Sources will switch automatically when files change

### Database Setup

The project includes an empty template database for easy setup:

```bash
# Option 1: Use template database directly (development)
# Database will be created in ./files/sources.db
npm run create-sat-summer-2025-tables

# Option 2: Set up custom database location (recommended)
# 1. Copy the template database
cp files/sources.template.db /path/to/your/database/sources.db

# 2. Set environment variable in .env.local
echo "FILE_DIRECTORY=/path/to/your/database" >> .env.local

# 3. Create tables in your custom database
npm run create-sat-summer-2025-tables
```

**Template Database**: The repository includes `files/sources.template.db` with the proper schema but no data. Your local development database (`sources.db`) is automatically ignored by git to prevent committing personal data.

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # TypeScript validation
```

## Architecture

- **Frontend**: Next.js 15 with React 19 and TypeScript
- **Backend**: Next.js API routes with SQLite database
- **OBS Integration**: WebSocket connection + text file monitoring
- **Styling**: Custom CSS with glass morphism and Tailwind utilities
- **CI/CD**: Forgejo workflows with self-hosted runners

## API Endpoints

### Stream Management
- `GET /api/streams` - List all streams with team information
- `GET /api/streams/[id]` - Get individual stream details
- `POST /api/addStream` - Create new stream with browser source and team association
- `PUT /api/streams/[id]` - Update stream information
- `DELETE /api/streams/[id]` - Delete stream with comprehensive OBS cleanup:
  - Removes stream's nested scene
  - Deletes browser source
  - Removes from all source switchers
  - Clears text files referencing the stream

### Source Control
- `POST /api/setActive` - Set active stream for screen position (writes team-prefixed name to text file)
- `GET /api/getActive` - Get currently active sources for all screen positions

### Team Management
- `GET /api/teams` - Get all teams with group information and sync status
- `POST /api/teams` - Create new team with optional OBS scene creation
- `PUT /api/teams/[teamId]` - Update team name, group_name, or group_uuid
- `DELETE /api/teams/[teamId]` - Delete team with comprehensive OBS cleanup:
  - Deletes team scene/group
  - Removes team text source
  - Deletes all associated stream scenes
  - Removes all browser sources with team prefix
  - Clears all related text files
- `GET /api/getTeamName` - Get team name by ID

### OBS Group/Scene Management
- `POST /api/createGroup` - Create OBS scene from team and store UUID
- `POST /api/syncGroups` - Synchronize all teams with OBS groups
- `GET /api/verifyGroups` - Verify database groups exist in OBS with UUID tracking
  - Detects orphaned groups (excludes system scenes)
  - Identifies name mismatches
  - Shows sync status for all teams

### OBS Scene Control
- `POST /api/setScene` - Switch OBS to specified scene (1-Screen, 2-Screen, 4-Screen)
- `GET /api/getCurrentScene` - Get currently active OBS scene

### System Status
- `GET /api/obsStatus` - Real-time OBS connection, streaming, and recording status

### Authentication
All endpoints require API key authentication when `API_KEY` environment variable is set.

See `CLAUDE.md` for detailed architecture documentation and implementation details.

## Known Issues

### Text Centering
- **Issue**: Team name text overlays position left edge at center instead of centering the text itself
- **Workaround**: Manually change "Positional Alignment" to "Center" in OBS UI
- **Status**: Under investigation - requires further research into OBS API behavior

### System Scene Exclusion
Infrastructure scenes containing source switchers are excluded from orphaned group detection:
- 1-Screen, 2-Screen, 4-Screen, Starting, Ending, Audio, Movies
- Additional scenes can be added to the `SYSTEM_SCENES` array in `/app/api/verifyGroups/route.ts`


