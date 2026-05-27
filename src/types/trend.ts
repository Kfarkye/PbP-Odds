export interface Trend {
  id: string;
  sample_games: number;
  edge_status: 'qualified' | 'thin' | 'faded' | 'active';
  // Other trend properties ...
}
