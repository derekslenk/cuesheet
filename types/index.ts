export type Stream = {
    id: number;
    name: string;
    obs_source_name: string;
    url: string;
    team_id: number;
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
};