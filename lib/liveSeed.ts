import type { LiveStream } from './twitch';

/**
 * Pure planning for the live-test seeder: distribute fetched live channels
 * across N synthetic, distinctly-branded teams (round-robin) so the per-team
 * label look can be tested over real live video. No DB / network here so it's
 * unit-testable.
 */
export interface PlannedTeam {
  team_id: number;
  team_name: string;
  color_bg: string;
  color_accent: string;
  color_text: string;
  logo_path: string | null;
  streams: { name: string; login: string }[];
}

// Distinct palettes so adjacent teams read differently on screen.
const PALETTE = [
  { color_bg: '#1d3557', color_accent: '#ffd166', color_text: '#ffffff' },
  { color_bg: '#3a0ca3', color_accent: '#f72585', color_text: '#ffffff' },
  { color_bg: '#2b9348', color_accent: '#d9ed92', color_text: '#ffffff' },
  { color_bg: '#9d0208', color_accent: '#ffba08', color_text: '#ffffff' },
  { color_bg: '#264653', color_accent: '#2a9d8f', color_text: '#ffffff' },
  { color_bg: '#5a189a', color_accent: '#e0aaff', color_text: '#ffffff' },
];

/**
 * @param streams   fetched live channels (display name + login)
 * @param teamCount number of synthetic teams to spread them across (>=1)
 * @returns teams (team_id starting at 1) each holding their round-robin slice;
 *          teams that would be empty are omitted.
 */
export function planLiveSeed(streams: LiveStream[], teamCount: number): PlannedTeam[] {
  const n = Math.max(1, Math.floor(teamCount));
  const teams: PlannedTeam[] = [];
  for (let i = 0; i < n; i++) {
    const palette = PALETTE[i % PALETTE.length];
    teams.push({
      team_id: i + 1,
      team_name: `Live Team ${i + 1}`,
      ...palette,
      logo_path: null,
      streams: [],
    });
  }
  streams.forEach((s, idx) => {
    teams[idx % n].streams.push({ name: s.displayName || s.login, login: s.login });
  });
  return teams.filter((t) => t.streams.length > 0);
}
