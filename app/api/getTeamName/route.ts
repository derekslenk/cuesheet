import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../lib/database';

export async function GET(request: NextRequest) {
  try {
    // Extract the team_id from the query string
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');

    if (!teamId) {
      return NextResponse.json(
        { error: 'Missing team_id' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const team = await db.get(
      'SELECT team_name FROM teams_2025_spring_adr WHERE team_id = ?',
      [teamId]
    );

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ team_name: team.team_name });
  } catch (error) {
    console.error('Error fetching team name:', error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { error: 'Failed to fetch team name' },
      { status: 500 }
    );
  }
}
