# OBS Source Switcher Plugin UI

A professional [Next.js](https://nextjs.org) web application for controlling multiple OBS [Source Switchers](https://obsproject.com/forum/resources/source-switcher.941/) with real-time WebSocket integration and modern glass morphism UI.

## Features

- **Multi-Screen Source Control**: Manage 7 different screen positions (large, left, right, and 4 corners)
- **Real-time OBS Integration**: WebSocket connection with live status monitoring
- **Team & Stream Management**: Organize streams by teams with full CRUD operations
- **Modern UI**: Glass morphism design with responsive layout
- **Professional Broadcasting**: Audio routing, scene management, and live status indicators
- **Dual Integration**: WebSocket API + text file monitoring for maximum compatibility

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

```bash
# Create seasonal database tables
npm run create-sat-summer-2025-tables
```

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

- `GET /api/streams` - List all streams
- `POST /api/addStream` - Create new stream and OBS source
- `POST /api/setActive` - Set active stream for screen position
- `GET /api/obsStatus` - Real-time OBS connection status
- `GET /api/teams` - Team management

See `CLAUDE.md` for detailed architecture documentation.


