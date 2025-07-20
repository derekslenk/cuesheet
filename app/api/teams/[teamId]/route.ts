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
        const body = await request.json();
        const { team_name, group_name, group_uuid } = body;
        
        // Allow updating any combination of fields
        if (!team_name && group_name === undefined && group_uuid === undefined) {
            return NextResponse.json({ error: 'At least one field (team_name, group_name, or group_uuid) must be provided' }, { status: 400 });
        }

        const db = await getDatabase();
        
        // Build dynamic query based on what fields are being updated
        const updates: string[] = [];
        const values: (string | number | null)[] = [];
        
        if (team_name) {
            updates.push('team_name = ?');
            values.push(team_name);
        }
        
        if (group_name !== undefined) {
            updates.push('group_name = ?');
            values.push(group_name);
        }
        
        if (group_uuid !== undefined) {
            updates.push('group_uuid = ?');
            values.push(group_uuid);
        }
        
        values.push(teamId);
        
        const result = await db.run(
            `UPDATE ${TABLE_NAMES.TEAMS} SET ${updates.join(', ')} WHERE team_id = ?`,
            values
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