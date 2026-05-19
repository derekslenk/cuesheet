import { NextResponse } from 'next/server';
import { getTableName, BASE_TABLE_NAMES } from '@/lib/constants';
import { withDb } from '@/lib/db';

const { createGroupIfNotExists } = require('@/lib/obsClient');

export async function POST() {
  try {
    const teamsTableName = getTableName(BASE_TABLE_NAMES.TEAMS, {
      year: 2025,
      season: 'summer',
      suffix: 'sat'
    });

    // Get all teams without groups
    const teamsWithoutGroups = await withDb((db) =>
      db.all(
        `SELECT team_id, team_name FROM ${teamsTableName} WHERE group_name IS NULL`
      )
    );

    const syncResults = [];

    for (const team of teamsWithoutGroups) {
      try {
        // Create group in OBS using team name
        const obsResult = await createGroupIfNotExists(team.team_name);

        // Update database with group name
        await withDb(async (db) => {
          await db.run(
            `UPDATE ${teamsTableName} SET group_name = ? WHERE team_id = ?`,
            [team.team_name, team.team_id]
          );
        });

        syncResults.push({
          teamId: team.team_id,
          teamName: team.team_name,
          groupName: team.team_name,
          success: true,
          obsResult
        });
      } catch (error) {
        console.error(`Error syncing team ${team.team_id}:`, error);
        syncResults.push({
          teamId: team.team_id,
          teamName: team.team_name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const successCount = syncResults.filter(r => r.success).length;
    const failureCount = syncResults.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      message: `Sync completed: ${successCount} successful, ${failureCount} failed`,
      results: syncResults,
      summary: {
        total: syncResults.length,
        successful: successCount,
        failed: failureCount
      }
    });
  } catch (error) {
    console.error('Error syncing groups:', error);
    return NextResponse.json({ error: 'Failed to sync groups' }, { status: 500 });
  }
}
