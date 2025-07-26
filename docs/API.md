# API Documentation

This document provides detailed information about all API endpoints available in the Live Stream Manager application.

## Base URL
All API endpoints are available at `/api/*` relative to your application's base URL.

## Authentication
All endpoints require API key authentication when the `API_KEY` environment variable is set. Include the API key in the `Authorization` header:

```
Authorization: Bearer your_api_key_here
```

Authentication is bypassed for localhost requests in development mode.

## Response Format
All endpoints return JSON responses in the following format:

```json
{
  "success": true,
  "data": { /* response data */ },
  "message": "Optional success message"
}
```

Error responses:
```json
{
  "success": false,
  "error": "Error description",
  "message": "User-friendly error message"
}
```

## Stream Management

### GET /api/streams
List all streams with team information.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "StreamerName",
      "obs_source_name": "TeamName_StreamerName",
      "url": "https://twitch.tv/streamername",
      "team_id": 1,
      "team_name": "Team Alpha"
    }
  ]
}
```

### GET /api/streams/[id]
Get individual stream details by ID.

### POST /api/addStream
Create new stream with browser source and team association.

**Request Body:**
```json
{
  "name": "StreamerName",
  "url": "https://twitch.tv/streamername", // or just "streamername"
  "team_id": 1
}
```

### PUT /api/streams/[id]
Update stream information.

### DELETE /api/streams/[id]
Delete stream with comprehensive OBS cleanup:
- Removes stream's nested scene
- Deletes browser source
- Removes from all source switchers
- Clears text files referencing the stream

## Source Control

### POST /api/setActive
Set active stream for screen position (writes team-prefixed name to text file).

**Request Body:**
```json
{
  "screen": "large", // large, left, right, top_left, top_right, bottom_left, bottom_right
  "source": "TeamName_StreamerName"
}
```

### GET /api/getActive
Get currently active sources for all screen positions.

**Response:**
```json
{
  "success": true,
  "data": {
    "large": "TeamName_StreamerName",
    "left": "TeamName_StreamerName2",
    "right": "",
    // ... other positions
  }
}
```

## Team Management

### GET /api/teams
Get all teams with group information and sync status.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "team_id": 1,
      "team_name": "Team Alpha",
      "group_name": "Team Alpha",
      "group_uuid": "abc123-def456-ghi789"
    }
  ]
}
```

### POST /api/teams
Create new team with optional OBS scene creation.

**Request Body:**
```json
{
  "team_name": "New Team",
  "create_group": true // optional
}
```

### PUT /api/teams/[teamId]
Update team name, group_name, or group_uuid.

### DELETE /api/teams/[teamId]
Delete team with comprehensive OBS cleanup:
- Deletes team scene/group
- Removes team text source
- Deletes all associated stream scenes
- Removes all browser sources with team prefix
- Clears all related text files

### GET /api/getTeamName
Get team name by ID.

**Query Parameters:**
- `teamId`: Team ID to lookup

## OBS Group/Scene Management

### POST /api/createGroup
Create OBS scene from team and store UUID.

**Request Body:**
```json
{
  "team_id": 1
}
```

### POST /api/syncGroups
Synchronize all teams with OBS groups. Updates database with current OBS scene information.

### GET /api/verifyGroups
Verify database groups exist in OBS with UUID tracking.

**Response:**
```json
{
  "success": true,
  "data": {
    "teams": [
      {
        "team_id": 1,
        "team_name": "Team Alpha",
        "group_name": "Team Alpha",
        "group_uuid": "abc123",
        "status": "linked", // linked, name_changed, not_found
        "obs_name": "Team Alpha Modified" // if name changed in OBS
      }
    ],
    "orphanedGroups": [
      {
        "sceneName": "Orphaned Scene",
        "sceneUuid": "orphan123"
      }
    ]
  }
}
```

Features:
- Detects orphaned groups (excludes system scenes)
- Identifies name mismatches
- Shows sync status for all teams

## OBS Scene Control

### POST /api/setScene
Switch OBS to specified scene (1-Screen, 2-Screen, 4-Screen).

**Request Body:**
```json
{
  "scene": "2-Screen" // 1-Screen, 2-Screen, or 4-Screen
}
```

### GET /api/getCurrentScene
Get currently active OBS scene.

**Response:**
```json
{
  "success": true,
  "data": {
    "currentScene": "2-Screen"
  }
}
```

### POST /api/triggerTransition
Trigger studio mode transition from preview to program (requires studio mode enabled).

**Response:**
```json
{
  "success": true,
  "data": {
    "programScene": "2-Screen",
    "previewScene": "1-Screen"
  },
  "message": "Successfully transitioned preview to program"
}
```

**Error Conditions:**
- Studio mode not enabled (400 error)
- OBS connection issues (500 error)

## System Status

### GET /api/obsStatus
Real-time OBS connection, streaming, recording, and studio mode status.

**Response:**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "streaming": false,
    "recording": true,
    "studioMode": {
      "enabled": true,
      "previewScene": "1-Screen",
      "programScene": "2-Screen"
    }
  }
}
```

## Error Codes

- **400**: Bad Request - Invalid parameters or studio mode not enabled
- **401**: Unauthorized - Missing or invalid API key
- **404**: Not Found - Resource doesn't exist
- **500**: Internal Server Error - OBS connection issues or server errors

## Rate Limiting

Currently no rate limiting is implemented, but consider implementing it for production deployments to prevent abuse.

## WebSocket Integration

The application maintains a persistent WebSocket connection to OBS Studio for real-time communication. All API endpoints use this shared connection for optimal performance.