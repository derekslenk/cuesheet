# Live Stream Manager

A professional [Next.js](https://nextjs.org) web application for managing live streams and controlling multiple OBS [Source Switchers](https://github.com/exeldro/obs-source-switcher) with real-time WebSocket integration and modern glass morphism UI.


![Live Stream Manager Interface](docs/new_home.png)

## Features

- **Studio Mode Support**: Full preview/program scene management with transition controls for professional broadcasting
- **OBS Scene Control**: Switch between OBS layouts (1-Screen, 2-Screen, 4-Screen) with dynamic button states
- **Multi-Screen Source Control**: Manage 7 different screen positions (large, left, right, and 4 corners)
- **Real-time OBS Integration**: WebSocket connection with live status monitoring
- **Enhanced Stream Management**: Create, edit, and delete streams with comprehensive OBS cleanup
- **Team Organization**: Organize streams by teams with full CRUD operations and scene synchronization
- **Collapsible Stream Groups**: Organized stream display with expandable team groups for better UI management
- **Comprehensive Deletion**: Remove streams/teams with complete OBS component cleanup (scenes, sources, text files)
- **Audio Control**: Browser sources created with muted audio and OBS control enabled
- **Modern UI**: Glass morphism design with responsive layout and accessibility features
- **Professional Broadcasting**: Audio routing, scene management, and live status indicators
- **Dual Integration**: WebSocket API + text file monitoring for maximum compatibility
- **UUID-based Tracking**: Robust OBS group synchronization with rename-safe tracking
- **Enhanced Footer**: Real-time team/stream counts, OBS connection status, and studio mode indicators
- **API Security**: Optional API key authentication for production deployments
- **Optimized Performance**: Consolidated CSS architecture and standardized API responses

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

## API Documentation

The application provides a comprehensive REST API for managing streams, teams, and OBS integration. 

**📚 [Complete API Documentation](docs/API.md)**

Key endpoints include:
- Stream management (CRUD operations)
- Source control for 7 screen positions  
- Team and OBS group management
- Scene switching and studio mode controls
- Real-time status monitoring

All endpoints support API key authentication for production deployments.

See [`CLAUDE.md`](CLAUDE.md) for detailed architecture documentation and [`docs/API.md`](docs/API.md) for complete endpoint specifications.

## Known Issues

### Text Centering
- **Issue**: Team name text overlays position left edge at center instead of centering the text itself
- **Workaround**: Manually change "Positional Alignment" to "Center" in OBS UI
- **Status**: Under investigation - requires further research into OBS API behavior

### System Scene Exclusion
Infrastructure scenes containing source switchers are excluded from orphaned group detection:
- 1-Screen, 2-Screen, 4-Screen, Starting, Ending, Audio, Movies, Resources
- Additional scenes can be added to the `SYSTEM_SCENES` array in `/app/api/verifyGroups/route.ts`


