import runIndex from '../../../simulations/workforce-development/city-opportunity-simulator/runs/index.json';
import baselineAgentCsv from '../../../simulations/workforce-development/city-opportunity-simulator/runs/workforce_001-baseline-seed42/agent_states.csv?raw';
import outreachAgentCsv from '../../../simulations/workforce-development/city-opportunity-simulator/runs/workforce_001-expanded-outreach-seed42/agent_states.csv?raw';
import trainingAgentCsv from '../../../simulations/workforce-development/city-opportunity-simulator/runs/workforce_001-expanded-training-seed42/agent_states.csv?raw';
import demandAgentCsv from '../../../simulations/workforce-development/city-opportunity-simulator/runs/workforce_001-expanded-employer-demand-seed42/agent_states.csv?raw';
import cityWorld from '../../../simulations/workforce-development/city-opportunity-simulator/world.json';

type Run = (typeof runIndex.runs)[number];
export type DailyActivity = {
  day: number;
  kind: 'sleep' | 'preparation' | 'school' | 'work' | 'training' | 'workforce_program' | 'food' | 'community';
  start: number;
  end: number;
  at_home: boolean;
  destination_id?: string;
  destination_x?: number;
  destination_y?: number;
  route?: Array<[number, number]>;
  commute_hours?: number;
};

export type AgentRow = {
  week: number;
  agent_id: string;
  status: 'unaware' | 'aware' | 'training' | 'trained' | 'employed';
  goal: string;
  current_subgoal: string;
  blockers: string;
  skill: number;
  motivation: number;
  confidence: number;
  money_pressure: number;
  transportation_pressure: number;
  family_pressure: number;
  mentor_contact: boolean;
  employer_contact: boolean;
  training_started: string | number | null;
  x: number;
  y: number;
  home_x: number;
  home_y: number;
  destination_id: string;
  destination_x: number;
  destination_y: number;
  route: string;
  day_start_hour: number;
  day_end_hour: number;
  mobility_mode: 'walk' | 'bike' | 'car';
  travel_speed: number;
  route_distance: number;
  commute_hours: number;
  priority_score: number;
  active_days: number;
  weekly_time_budget: number;
  action_time_hours: number;
  time_access_score: number;
  neighborhood_id: string;
  resident_archetype: string;
  age_band: string;
  income_band: string;
  education_level: string;
  work_hours: number;
  caregiving_hours: number;
  program_interest: number;
  job_archetype_id: string;
  hourly_wage: number;
  assigned_job_destination_id: string;
  assigned_program_id: string;
  assigned_training_id: string;
  assigned_food_id: string;
  hunger: number;
  fatigue: number;
  bathroom_pressure: number;
  preparation_pressure: number;
  stress: number;
  social_energy: number;
  energy: number;
  interaction_count: number;
  peer_support: number;
  daily_schedule: DailyActivity[];
};

export type DashboardRun = Run & {
  agentRows: AgentRow[];
};

function parseBoolean(value: string): boolean {
  return value.trim().toLowerCase() === 'true';
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

function parseCsv(csv: string): AgentRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const [, ...rows] = lines;
  return rows.map((line) => {
    const parts = splitCsvLine(line);
    return {
      week: Number(parts[0]),
      agent_id: parts[1],
      status: parts[2] as AgentRow['status'],
      goal: parts[3],
      current_subgoal: parts[4],
      blockers: parts[5],
      skill: Number(parts[6]),
      motivation: Number(parts[7]),
      confidence: Number(parts[8]),
      money_pressure: Number(parts[9]),
      transportation_pressure: Number(parts[10]),
      family_pressure: Number(parts[11]),
      mentor_contact: parseBoolean(parts[12]),
      employer_contact: parseBoolean(parts[13]),
      training_started: parts[14] === '' ? null : Number(parts[14]),
      x: Number(parts[15]),
      y: Number(parts[16]),
      home_x: Number(parts[17]),
      home_y: Number(parts[18]),
      destination_id: parts[19],
      destination_x: Number(parts[20]),
      destination_y: Number(parts[21]),
      route: parts[22],
      day_start_hour: Number(parts[23]),
      day_end_hour: Number(parts[24]),
      mobility_mode: parts[25] as AgentRow['mobility_mode'],
      travel_speed: Number(parts[26]),
      route_distance: Number(parts[27]),
      commute_hours: Number(parts[28]),
      priority_score: Number(parts[29]),
      active_days: Number(parts[30]),
      weekly_time_budget: Number(parts[31]),
      action_time_hours: Number(parts[32]),
      time_access_score: Number(parts[33]),
      neighborhood_id: parts[34],
      resident_archetype: parts[35],
      age_band: parts[36],
      income_band: parts[37],
      education_level: parts[38],
      work_hours: Number(parts[39]),
      caregiving_hours: Number(parts[40]),
      program_interest: Number(parts[41]),
      job_archetype_id: parts[42],
      hourly_wage: Number(parts[43]),
      assigned_job_destination_id: parts[44],
      assigned_program_id: parts[45],
      assigned_training_id: parts[46],
      assigned_food_id: parts[47],
      hunger: Number(parts[48]),
      fatigue: Number(parts[49]),
      bathroom_pressure: Number(parts[50]),
      preparation_pressure: Number(parts[51]),
      stress: Number(parts[52]),
      social_energy: Number(parts[53]),
      energy: Number(parts[54]),
      interaction_count: Number(parts[55]),
      peer_support: Number(parts[56]),
      daily_schedule: JSON.parse(parts[57]) as DailyActivity[],
    };
  });
}

const agentCsvByScenario: Record<string, string> = {
  baseline: baselineAgentCsv,
  'expanded-outreach': outreachAgentCsv,
  'expanded-training': trainingAgentCsv,
  'expanded-employer-demand': demandAgentCsv,
};

export const dashboardRuns: DashboardRun[] = runIndex.runs.map((run) => ({
  ...run,
  agentRows: parseCsv(agentCsvByScenario[run.scenario_id]),
}));

export const dashboardIndex = runIndex;
export const dashboardWorld = cityWorld;
