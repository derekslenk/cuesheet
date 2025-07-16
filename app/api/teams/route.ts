import { NextResponse } from 'next/server';
import { getDatabase } from '../../../lib/database';
import { Team } from '@/types';
import { TABLE_NAMES } from '@/lib/constants';

export async function GET() {
    const db = await getDatabase();
    const teams: Team[] = await db.all(`SELECT * FROM ${TABLE_NAMES.TEAMS}`);
    return NextResponse.json(teams);
}

export async function POST(request: Request) {
    try {
        const { team_name } = await request.json();
        
        if (!team_name) {
            return NextResponse.json({ error: 'Team name is required' }, { status: 400 });
        }

        const db = await getDatabase();
        
        const result = await db.run(
            `INSERT INTO ${TABLE_NAMES.TEAMS} (team_name) VALUES (?)`,
            [team_name]
        );
        
        const newTeam: Team = {
            team_id: result.lastID!,
            team_name: team_name
        };
        
        return NextResponse.json(newTeam, { status: 201 });
    } catch (error) {
        console.error('Error creating team:', error);
        return NextResponse.json({ error: 'Failed to create team' }, { status: 500 });
    }
}