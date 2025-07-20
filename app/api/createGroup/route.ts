import { NextRequest, NextResponse } from 'next/server';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { getTableName, BASE_TABLE_NAMES } from '@/lib/constants';
import { validateInteger } from '@/lib/security';

const { createGroupIfNotExists } = require('@/lib/obsClient');

const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamId, groupName } = body;

    // Validate input
    if (!teamId || !groupName) {
      return NextResponse.json({ error: 'Team ID and group name are required' }, { status: 400 });
    }

    const validTeamId = validateInteger(teamId);
    if (!validTeamId) {
      return NextResponse.json({ error: 'Invalid team ID' }, { status: 400 });
    }

    // Sanitize group name (only allow alphanumeric, spaces, dashes, underscores)
    const sanitizedGroupName = groupName.replace(/[^a-zA-Z0-9\s\-_]/g, '');
    if (!sanitizedGroupName || sanitizedGroupName.length === 0) {
      return NextResponse.json({ error: 'Invalid group name' }, { status: 400 });
    }

    // Open database connection
    const dbPath = path.join(FILE_DIRECTORY, 'sources.db');
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    const teamsTableName = getTableName(BASE_TABLE_NAMES.TEAMS, {
      year: 2025,
      season: 'summer',
      suffix: 'sat'
    });

    // Create group in OBS first to get UUID
    const result = await createGroupIfNotExists(sanitizedGroupName);

    // Update team with group name and UUID
    await db.run(
      `UPDATE ${teamsTableName} SET group_name = ?, group_uuid = ? WHERE team_id = ?`,
      [sanitizedGroupName, result.sceneUuid, validTeamId]
    );

    await db.close();

    return NextResponse.json({ 
      success: true, 
      message: 'Group created/updated successfully',
      groupName: sanitizedGroupName,
      obsResult: result
    });
  } catch (error) {
    console.error('Error creating group:', error);
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 });
  }
}