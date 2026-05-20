import { NextRequest, NextResponse } from 'next/server';
import { TABLE_NAMES } from '@/lib/constants';
import { validateInteger } from '@/lib/security';
import { withDb } from '@/lib/db';

const { createGroupIfNotExists } = require('@/lib/obsClient');

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

    // Create group in OBS first to get UUID
    const result = await createGroupIfNotExists(sanitizedGroupName);

    // Update team with group name and UUID
    await withDb(async (db) => {
      await db.run(
        `UPDATE ${TABLE_NAMES.TEAMS} SET group_name = ?, group_uuid = ? WHERE team_id = ?`,
        [sanitizedGroupName, result.sceneUuid, validTeamId]
      );
    });

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
