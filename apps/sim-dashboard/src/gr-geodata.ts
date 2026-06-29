// Grand Rapids, MI geodata — schematic coordinates mapped to the 24000×16000 sim world.
// Real-world anchor: City Hall at ~(12000, 8000), lat 42.9634°N lon -85.6681°W

export type Ward = {
  id: string;
  name: string;
  color: string;
  bounds: [number, number, number, number]; // x, y, w, h
  commissioners: string[];
  population: number;
  neighborhoods: string[];
};

export type Venue = {
  id: string;
  name: string;
  kind: 'coffee' | 'bar' | 'club' | 'network' | 'govt' | 'chamber' | 'citycouncil' | 'education' | 'park';
  x: number;
  y: number;
  description: string;
  socialMultiplier: number; // boost to social_energy for agents visiting
  networkingChance: number; // 0-1 chance of forming a new agent connection per visit
};

export type CensusProfile = {
  archetype: string;
  label: string;
  icon: string;
  shareOfPop: number; // fraction of GR population
  medianAge: number;
  medianIncome: number;
  educationDistrib: Record<string, number>; // hs, some_college, bachelors, graduate
  dominantNeighborhoods: string[];
  color: string;
};

// ─── GR WARDS ───────────────────────────────────────────────────────────────
// Grand Rapids uses 3 wards, each electing 2 city commissioners + 1 mayor at-large
export const GR_WARDS: Ward[] = [
  {
    id: 'ward-1',
    name: '1st Ward',
    color: '#00d4ff',
    bounds: [11200, 800, 10800, 7200], // NE quadrant
    commissioners: ['Senita Lenear', 'Joe Jones'],
    population: 66000,
    neighborhoods: ['heritage_hill', 'easttown', 'east_hills', 'creston'],
  },
  {
    id: 'ward-2',
    name: '2nd Ward',
    color: '#b56bff',
    bounds: [200, 800, 11000, 7200], // NW quadrant + downtown west
    commissioners: ['Milinda Ysasi', 'Nathaniel Moody'],
    population: 62000,
    neighborhoods: ['west_side', 'belknap', 'westside_connection'],
  },
  {
    id: 'ward-3',
    name: '3rd Ward',
    color: '#00ff88',
    bounds: [200, 8000, 22800, 7800], // Southern belt
    commissioners: ['Kelsey Perdue', 'Drew Robbins'],
    population: 70000,
    neighborhoods: ['baxter', 'garfield_park', 'grandville_ave', 'south_hill'],
  },
];

// ─── KEY VENUES ──────────────────────────────────────────────────────────────
export const GR_VENUES: Venue[] = [
  // Government
  {
    id: 'city-hall',
    name: 'City Hall',
    kind: 'govt',
    x: 11800,
    y: 7600,
    description: 'Grand Rapids City Hall — seat of the 3-ward commission system',
    socialMultiplier: 0.8,
    networkingChance: 0.12,
  },
  {
    id: 'chamber',
    name: 'Grand Rapids Chamber',
    kind: 'chamber',
    x: 12400,
    y: 7400,
    description: 'Chamber of Commerce — 111 Pearl St NW, connecting employers & workforce',
    socialMultiplier: 1.4,
    networkingChance: 0.38,
  },
  {
    id: 'kent-county',
    name: 'Kent County Courthouse',
    kind: 'govt',
    x: 11200,
    y: 7200,
    description: 'Kent County government center',
    socialMultiplier: 0.7,
    networkingChance: 0.06,
  },
  {
    id: 'gvsu-downtown',
    name: 'GVSU DeVos',
    kind: 'education',
    x: 12200,
    y: 7000,
    description: 'Grand Valley State downtown campus — DeVos Center',
    socialMultiplier: 1.3,
    networkingChance: 0.28,
  },

  // Networking / Social Capital
  {
    id: 'devos-place',
    name: 'DeVos Place',
    kind: 'network',
    x: 12000,
    y: 6800,
    description: 'Convention center — high-density professional networking events',
    socialMultiplier: 1.8,
    networkingChance: 0.55,
  },
  {
    id: 'eberhard-center',
    name: 'Eberhard Center',
    kind: 'network',
    x: 11600,
    y: 6600,
    description: 'Professional events & workforce meetups',
    socialMultiplier: 1.5,
    networkingChance: 0.42,
  },

  // Coffee Shops (opportunity creation)
  {
    id: 'coffee-uprising',
    name: 'Uprising Bakehouse',
    kind: 'coffee',
    x: 13200,
    y: 7800,
    description: 'Worker-owned café on the east side — casual networking, mentorship chats',
    socialMultiplier: 1.2,
    networkingChance: 0.22,
  },
  {
    id: 'coffee-madcap',
    name: 'Madcap Coffee',
    kind: 'coffee',
    x: 12600,
    y: 7600,
    description: 'Fulton St specialty coffee — startup founders and nonprofit staff hub',
    socialMultiplier: 1.3,
    networkingChance: 0.25,
  },
  {
    id: 'coffee-biggby',
    name: 'Biggby Coffee (Easttown)',
    kind: 'coffee',
    x: 14400,
    y: 7200,
    description: 'Local anchor for Easttown neighborhood',
    socialMultiplier: 1.0,
    networkingChance: 0.15,
  },
  {
    id: 'coffee-hopcat',
    name: 'Rowster Coffee',
    kind: 'coffee',
    x: 10800,
    y: 8000,
    description: 'West side specialty roaster — small biz community',
    socialMultiplier: 1.1,
    networkingChance: 0.18,
  },

  // Bars (social capital & serendipitous connections)
  {
    id: 'bar-hopcat',
    name: 'HopCat',
    kind: 'bar',
    x: 12800,
    y: 8200,
    description: 'Iconic Grand Rapids craft beer bar on Ionia Ave',
    socialMultiplier: 1.6,
    networkingChance: 0.30,
  },
  {
    id: 'bar-pyramid-scheme',
    name: 'Pyramid Scheme',
    kind: 'bar',
    x: 11400,
    y: 8400,
    description: 'Alternative bar & music venue — west side creatives',
    socialMultiplier: 1.4,
    networkingChance: 0.20,
  },
  {
    id: 'bar-stella',
    name: 'Stella\'s Lounge',
    kind: 'bar',
    x: 12200,
    y: 8600,
    description: 'Downtown lounge — employer/employee social crossover',
    socialMultiplier: 1.5,
    networkingChance: 0.28,
  },

  // Clubs (high-energy social, youth opportunity)
  {
    id: 'club-rumors',
    name: 'Rumors Nightclub',
    kind: 'club',
    x: 12000,
    y: 9200,
    description: 'Downtown nightlife — social energy reset for stressed agents',
    socialMultiplier: 2.0,
    networkingChance: 0.15,
  },
  {
    id: 'club-intersection',
    name: 'The Intersection',
    kind: 'club',
    x: 11600,
    y: 8800,
    description: 'Live music venue — community events & job fairs in off-hours',
    socialMultiplier: 1.8,
    networkingChance: 0.22,
  },

  // Parks
  {
    id: 'park-riverside',
    name: 'Riverside Park',
    kind: 'park',
    x: 9600,
    y: 5600,
    description: 'North bank outdoor recreation — community gatherings',
    socialMultiplier: 1.2,
    networkingChance: 0.12,
  },
  {
    id: 'park-heartside',
    name: 'Heartside Park',
    kind: 'park',
    x: 11800,
    y: 9000,
    description: 'Central gathering space near shelters — wraparound services',
    socialMultiplier: 0.9,
    networkingChance: 0.08,
  },
];

// ─── CENSUS-BASED AGENT ARCHETYPES ───────────────────────────────────────────
// Source: 2020 US Census + ACS 5-year estimates for Grand Rapids, MI
// Population ~198,000 | Median age 31.4 | Median HH income $47,800
export const GR_CENSUS_ARCHETYPES: CensusProfile[] = [
  {
    archetype: 'young_adult_seeker',
    label: 'Young Adult (18-24)',
    icon: '🧑',
    shareOfPop: 0.17,
    medianAge: 21,
    medianIncome: 22000,
    educationDistrib: { hs: 0.45, some_college: 0.40, bachelors: 0.13, graduate: 0.02 },
    dominantNeighborhoods: ['heritage_hill', 'easttown', 'baxter'],
    color: '#00d4ff',
  },
  {
    archetype: 'working_parent',
    label: 'Working Parent (25-44)',
    icon: '👩‍👧',
    shareOfPop: 0.29,
    medianAge: 34,
    medianIncome: 48000,
    educationDistrib: { hs: 0.28, some_college: 0.32, bachelors: 0.28, graduate: 0.12 },
    dominantNeighborhoods: ['grandville_ave', 'garfield_park', 'westside_connection'],
    color: '#ffb800',
  },
  {
    archetype: 'career_changer',
    label: 'Mid-Career Changer (35-54)',
    icon: '🔄',
    shareOfPop: 0.22,
    medianAge: 44,
    medianIncome: 55000,
    educationDistrib: { hs: 0.22, some_college: 0.35, bachelors: 0.30, graduate: 0.13 },
    dominantNeighborhoods: ['east_hills', 'heritage_hill', 'west_side'],
    color: '#b56bff',
  },
  {
    archetype: 'senior_worker',
    label: 'Older Worker (55+)',
    icon: '👴',
    shareOfPop: 0.16,
    medianAge: 64,
    medianIncome: 38000,
    educationDistrib: { hs: 0.38, some_college: 0.30, bachelors: 0.22, graduate: 0.10 },
    dominantNeighborhoods: ['south_hill', 'creston', 'west_side'],
    color: '#ff7e5f',
  },
  {
    archetype: 'student',
    label: 'Student (16-22)',
    icon: '📚',
    shareOfPop: 0.09,
    medianAge: 19,
    medianIncome: 8000,
    educationDistrib: { hs: 0.60, some_college: 0.38, bachelors: 0.02, graduate: 0.00 },
    dominantNeighborhoods: ['heritage_hill', 'baxter', 'belknap'],
    color: '#00ff88',
  },
  {
    archetype: 'employer',
    label: 'Employer / Manager',
    icon: '💼',
    shareOfPop: 0.07,
    medianAge: 42,
    medianIncome: 95000,
    educationDistrib: { hs: 0.05, some_college: 0.15, bachelors: 0.50, graduate: 0.30 },
    dominantNeighborhoods: ['heritage_hill', 'east_hills', 'west_side'],
    color: '#ff2d6b',
  },
];

// Icon glyphs for venue kinds (used in Phaser rendering)
export const VENUE_ICONS: Record<string, string> = {
  coffee: '☕',
  bar: '🍺',
  club: '🎵',
  network: '🤝',
  govt: '🏛',
  chamber: '💼',
  citycouncil: '⚖️',
  education: '🎓',
  park: '🌳',
};

// Color by venue kind
export const VENUE_COLORS: Record<string, number> = {
  coffee: 0xd4813a,
  bar: 0xff7e5f,
  club: 0xb56bff,
  network: 0x00d4ff,
  govt: 0xffb800,
  chamber: 0xffb800,
  citycouncil: 0xffb800,
  education: 0x00ff88,
  park: 0x4d9250,
};

// Archetype color map for Phaser tinting
export const ARCHETYPE_COLORS: Record<string, number> = {
  young_adult_seeker: 0x00d4ff,
  working_parent: 0xffb800,
  career_changer: 0xb56bff,
  senior_worker: 0xff7e5f,
  student: 0x00ff88,
  employer: 0xff2d6b,
};
