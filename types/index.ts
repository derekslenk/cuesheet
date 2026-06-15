export type Stream = {
    id: number;
    name: string;
    obs_source_name: string;
    url: string;
    team_id: number;
  };

export type StreamWithTeam = Stream & {
    team_name: string;
    group_name?: string | null;
  };
  
export type Screen = {
    screen: string;
    id: number;
  };
  
export type Team = {
    team_id: number;
    team_name: string;
    group_name?: string | null;
    group_uuid?: string | null;
    // Per-team branding for the HTML stream-label overlay (Phase 1 / US-003).
    // Nullable: unset values fall back to the event-default palette in
    // lib/overlayData.ts. Added by scripts/addTeamBrandingColumns.ts.
    color_bg?: string | null;
    color_accent?: string | null;
    color_text?: string | null;
    logo_path?: string | null;
};