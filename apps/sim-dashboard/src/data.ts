import runIndex from '../../../simulations/workforce-development/city-opportunity-simulator/runs/index.json';
import baselineAgentCsv from '../../../simulations/workforce-development/city-opportunity-simulator/runs/workforce_001-baseline-seed42/agent_states.csv?raw';
import outreachAgentCsv from '../../../simulations/workforce-development/city-opportunity-simulator/runs/workforce_001-expanded-outreach-seed42/agent_states.csv?raw';
import trainingAgentCsv from '../../../simulations/workforce-development/city-opportunity-simulator/runs/workforce_001-expanded-training-seed42/agent_states.csv?raw';
import demandAgentCsv from '../../../simulations/workforce-development/city-opportunity-simulator/runs/workforce_001-expanded-employer-demand-seed42/agent_states.csv?raw';

type Run = (typeof runIndex.runs)[number];
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
