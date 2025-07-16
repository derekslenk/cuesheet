import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';
import { TABLE_NAMES } from '@/lib/constants';

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ teamId: string }> }
) {
    try {
        const { teamId: teamIdParam } = await params;
        const teamId = parseInt(teamIdParam);
        const { team_name } = await request.json();
        
        if (!team_name) {
            return NextResponse.json({ error: 'Team name is required' }, { status: 400 });
        }

        const db = await getDatabase();
        
        const result = await db.run(
            `UPDATE ${TABLE_NAMES.TEAMS} SET team_name = ? WHERE team_id = ?`,
            [team_name, teamId]
        );
        
        if (result.changes === 0) {
            return NextResponse.json({ error: 'Team not found' }, { status: 404 });
        }
        
        return NextResponse.json({ message: 'Team updated successfully' });
    } catch (error) {
        console.error('Error updating team:', error);
        return NextResponse.json({ error: 'Failed to update team' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ teamId: string }> }
) {
    try {
        const { teamId: teamIdParam } = await params;
        const teamId = parseInt(teamIdParam);
        const db = await getDatabase();
        
        await db.run('BEGIN TRANSACTION');
        
        try {
            await db.run(
                `DELETE FROM ${TABLE_NAMES.STREAMS} WHERE team_id = ?`,
                [teamId]
            );
            
            const result = await db.run(
                `DELETE FROM ${TABLE_NAMES.TEAMS} WHERE team_id = ?`,
                [teamId]
            );
            
            if (result.changes === 0) {
                await db.run('ROLLBACK');
                return NextResponse.json({ error: 'Team not found' }, { status: 404 });
            }
            
            await db.run('COMMIT');
            return NextResponse.json({ message: 'Team and associated streams deleted successfully' });
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error deleting team:', error);
        return NextResponse.json({ error: 'Failed to delete team' }, { status: 500 });
    }
}