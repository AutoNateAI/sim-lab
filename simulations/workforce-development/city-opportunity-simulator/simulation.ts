export type ResidentStatus = 'unaware' | 'aware' | 'training' | 'trained' | 'employed';

export interface SimulationConfig {
  seed: number;
  weeks: number;
  population: number;
  budget: number;
  outreachRate: number;
  trainingSeats: number;
  jobOpenings: number;
}

export interface WeekResult {
  week: number;
  unaware: number;
  aware: number;
  training: number;
  trained: number;
  employed: number;
  budgetRemaining: number;
}

interface Resident {
  status: ResidentStatus;
  skillFit: number;
  trainingStarted?: number;
}

export const defaultConfig: SimulationConfig = {
  seed: 42,
  weeks: 16,
  population: 240,
  budget: 600_000,
  outreachRate: 0.08,
  trainingSeats: 36,
  jobOpenings: 90,
};

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function count(residents: Resident[], status: ResidentStatus): number {
  return residents.filter((resident) => resident.status === status).length;
}

export function runSimulation(config: SimulationConfig): WeekResult[] {
  const random = mulberry32(config.seed);
  const residents: Resident[] = Array.from({length: config.population}, (_, index) => ({
    status: index < Math.ceil(config.population * 0.05) ? 'aware' : 'unaware',
    skillFit: 0.55 + random() * 0.45,
  }));
  let budgetRemaining = config.budget;
  let jobsRemaining = config.jobOpenings;
  const results: WeekResult[] = [];

  for (let week = 0; week <= config.weeks; week += 1) {
    if (week > 0) {
      const currentAwareness = 1 - count(residents, 'unaware') / config.population;
      const outreachCost = Math.min(budgetRemaining, 2_500 + config.population * config.outreachRate * 30);
      budgetRemaining -= outreachCost;

      for (const resident of residents) {
        if (resident.status === 'unaware' && outreachCost > 0) {
          const networkBoost = 1 + currentAwareness * 0.8;
          if (random() < config.outreachRate * networkBoost) resident.status = 'aware';
        }
      }

      for (const resident of residents) {
        if (resident.status === 'training' && resident.trainingStarted !== undefined && week - resident.trainingStarted >= 3) {
          resident.status = random() < 0.92 ? 'trained' : 'aware';
          resident.trainingStarted = undefined;
        }
      }

      let occupiedSeats = count(residents, 'training');
      for (const resident of residents) {
        if (resident.status !== 'aware' || occupiedSeats >= config.trainingSeats || budgetRemaining < 3_500) continue;
        if (random() < 0.24) {
          resident.status = 'training';
          resident.trainingStarted = week;
          occupiedSeats += 1;
          budgetRemaining -= 3_500;
        }
      }

      for (const resident of residents) {
        if (resident.status !== 'trained' || jobsRemaining <= 0) continue;
        if (random() < 0.28 * resident.skillFit) {
          resident.status = 'employed';
          jobsRemaining -= 1;
        }
      }
    }

    results.push({
      week,
      unaware: count(residents, 'unaware'),
      aware: count(residents, 'aware'),
      training: count(residents, 'training'),
      trained: count(residents, 'trained'),
      employed: count(residents, 'employed'),
      budgetRemaining: Math.round(budgetRemaining),
    });
  }

  return results;
}
