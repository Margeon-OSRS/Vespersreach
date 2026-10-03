/**
 * Core type definitions for Vesper Reach.
 * Everything here is plain data: no classes, no Maps/Sets, so GameState
 * round-trips through JSON unchanged.
 */

export type ResourceKey = 'food' | 'industry' | 'dust' | 'science' | 'influence';
export const RESOURCE_KEYS: ResourceKey[] = ['food', 'industry', 'dust', 'science', 'influence'];

export interface Fidsi {
  food: number;
  industry: number;
  dust: number;
  science: number;
  influence: number;
}

export const zeroFidsi = (): Fidsi => ({ food: 0, industry: 0, dust: 0, science: 0, influence: 0 });

// ---------------------------------------------------------------------------
// Static data definitions (loaded from /data/*.json)
// ---------------------------------------------------------------------------

export type PlanetTypeId =
  | 'terran' | 'ocean' | 'jungle' | 'arid' | 'desert' | 'tundra'
  | 'arctic' | 'lava' | 'barren' | 'gasGiant' | 'asteroids';

export type PlanetSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge';

export interface PlanetTypeDef {
  id: PlanetTypeId;
  name: string;
  description: string;
  /** Colonisation tier. 0 is available from the start; higher tiers unlock by tech. */
  tier: number;
  yieldsPerPop: Fidsi;
  /** Base population at medium size; scaled by size. */
  basePop: number;
  approval: number;
  /** Three colours used by procedural planet art: ground, highlight, atmosphere. */
  palette: [string, string, string];
  /** Relative generation weight. */
  weight: number;
}

export interface AnomalyDef {
  id: string;
  name: string;
  description: string;
  /** Flat per-planet modifiers to system output. */
  modifiers: Partial<Fidsi>;
  approval?: number;
  popBonus?: number;
  weight: number;
}

export interface DepositDef {
  id: string;
  name: string;
  kind: 'strategic' | 'luxury';
  description: string;
  colour: string;
  weight: number;
}

/** A modifier applied by an improvement, trait, law or anomaly. */
export interface Effect {
  resource?: ResourceKey;
  /** Flat amount added to the system (or empire) each turn. */
  flat?: number;
  /** Amount per unit of population in the system. */
  perPop?: number;
  /** Percent bonus (10 = +10%) applied after flat and per-pop sums. */
  percent?: number;
  approval?: number;
  /** Percent bonus to population growth. */
  growth?: number;
  /** Percent reduction to ship cost built in this system. */
  shipCost?: number;
}

export interface ImprovementDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  upkeep: number;
  effects: Effect[];
  /** Tech id required before this can be queued. Omit for always available. */
  requires?: string;
  /** Only one per empire. */
  unique?: boolean;
  /** Not shown in build lists; granted by the game (e.g. the capital seat). */
  hidden?: boolean;
  /** Can only be queued in the empire home system. */
  capitalOnly?: boolean;
  factionOnly?: string;
}

export type HullClass = 'explorer' | 'colony' | 'corvette' | 'frigate' | 'cruiser' | 'battleship' | 'carrier';

export interface HullDef {
  id: string;
  name: string;
  class: HullClass;
  description: string;
  cost: number;
  hp: number;
  /** Lane units moved per turn. */
  speed: number;
  commandPoints: number;
  slots: { weapon: number; defence: number; support: number };
  /** Special roles that change what the ship can do outside combat. */
  roles?: Array<'explore' | 'outpost' | 'ark'>;
  /** Population carried by an ark hull. */
  cargoPop?: number;
  /** Ground troops carried for invasions. */
  troops?: number;
  requires?: string;
  factionOnly?: string;
}

export type ModuleSlot = 'weapon' | 'defence' | 'support';

export interface ModuleDef {
  id: string;
  name: string;
  slot: ModuleSlot;
  kind: 'kinetic' | 'laser' | 'missile' | 'shield' | 'armour' | 'flak' | 'engine' | 'probe' | 'repair';
  description: string;
  cost: number;
  stats: Record<string, number>;
  requires?: string;
}

export type TechQuadrant = 'economy' | 'science' | 'military' | 'empire';

export interface TechDef {
  id: string;
  name: string;
  quadrant: TechQuadrant;
  era: number;
  cost: number;
  description: string;
  prerequisites: string[];
  unlocks: {
    improvements?: string[];
    hulls?: string[];
    modules?: string[];
    /** Raises the colonisable planet tier to this value. */
    planetTier?: number;
    laws?: string[];
  };
}

export interface LawDef {
  id: string;
  name: string;
  ideology: Ideology;
  /** Tech required before the law can be passed. */
  requires?: string;
  description: string;
  cost: number;
  upkeep: number;
  effects: Effect[];
}

export interface EventDef {
  id: string;
  name: string;
  description: string;
  weight: number;
  minTurn: number;
  effects: Effect[];
  duration: number;
}

/** Faction-wide rule changes. Only the fields present apply. */
export interface FactionModifiers {
  food?: number;
  industry?: number;
  dust?: number;
  science?: number;
  influence?: number;
  approval?: number;
  growth?: number;
  shipCost?: number;
  /** Cannot build outpost ships; relies on arks. */
  cannotOutpost?: boolean;
  /** Arks found a full colony immediately instead of an outpost. */
  instantColony?: boolean;
  /** Each colonised planet loses one max population every N turns. */
  depletionEvery?: number;
  /** Cannot declare war; relevant from milestone 3. */
  pacifist?: boolean;
  /** Extra Dust per unit of any other resource produced. */
  dustPerOutput?: number;
}

export interface FactionDef {
  id: string;
  name: string;
  demonym: string;
  blurb: string;
  affinity: { id: string; name: string; description: string };
  traits: Array<{ name: string; description: string }>;
  modifiers: FactionModifiers;
  uniqueHull: string;
  uniqueImprovement: string;
  colours: { primary: string; secondary: string };
  homePlanet: PlanetTypeId;
  shipPrefix: string;
  /** False for non-player factions such as pirates. */
  playable?: boolean;
  /** True for minor factions (not playable, no AI, one system). */
  minor?: boolean;
  startingDust: number;
}

export interface GameData {
  factions: FactionDef[];
  planetTypes: PlanetTypeDef[];
  anomalies: AnomalyDef[];
  deposits: DepositDef[];
  improvements: ImprovementDef[];
  hulls: HullDef[];
  modules: ModuleDef[];
  techs: TechDef[];
  laws: LawDef[];
  events: EventDef[];
  tactics: TacticDef[];
  heroes: HeroDef[];
  heroSkills: HeroSkillDef[];
  quests: QuestDef[];
  minors: MinorDef[];
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type GalaxySize = 'tiny' | 'small' | 'medium' | 'large' | 'huge';
export type GalaxyShape = 'spiral' | 'disc' | 'ring' | 'clusters';
export type GalaxyDensity = 'sparse' | 'normal' | 'dense';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface GameSettings {
  seed: string;
  size: GalaxySize;
  shape: GalaxyShape;
  density: GalaxyDensity;
  playerFaction: string;
  opponents: number;
  difficulty: Difficulty;
  /** 0 means no limit. */
  turnLimit: number;
}

export type StarClass = 'yellow' | 'orange' | 'red' | 'white' | 'blue' | 'binary';

export type PlanetStatus = 'none' | 'outpost' | 'colony';

export interface Planet {
  id: string;
  type: PlanetTypeId;
  size: PlanetSize;
  anomalyId: string | null;
  depositId: string | null;
  maxPop: number;
  pop: number;
  status: PlanetStatus;
  /** Turns spent as an outpost. */
  outpostTurns: number;
}

export type BuildKind = 'improvement' | 'ship';

export interface BuildItem {
  id: string;
  kind: BuildKind;
  defId: string;
  cost: number;
  progress: number;
}

export interface StarSystem {
  id: string;
  name: string;
  x: number;
  y: number;
  starClass: StarClass;
  planets: Planet[];
  ownerId: string | null;
  improvements: string[];
  buildQueue: BuildItem[];
  growthStock: number;
  /** Cached last-turn figures for UI display. */
  lastOutput: Fidsi;
  lastApproval: number;
  /** Set while a hostile armed fleet blockades the system. */
  siege: Siege | null;
  /** Turn of the last pirate raid, for a temporary approval penalty. */
  raidedTurn?: number;
}

export interface Lane {
  a: string;
  b: string;
  length: number;
}

export interface Ship {
  id: string;
  hullId: string;
  name: string;
  hp: number;
  cargoPop: number;
  /** Blueprint this ship was built from. */
  designId: string;
}

export interface Transit {
  from: string;
  to: string;
  /** Fraction of the lane travelled, from 0 to 1. */
  progress: number;
}

export interface Fleet {
  id: string;
  ownerId: string;
  name: string;
  /** System the fleet is parked in, or null while in transit. */
  systemId: string | null;
  transit: Transit | null;
  /** Remaining systems to visit, excluding the current one. */
  path: string[];
  ships: Ship[];
  /** Tactic card used when a battle starts. */
  tactic: string;
}

export interface Empire {
  id: string;
  factionId: string;
  name: string;
  colour: string;
  isPlayer: boolean;
  homeSystemId: string;
  dust: number;
  influence: number;
  /** Stored research points (consumed by research in milestone 2). */
  science: number;
  techs: string[];
  planetTier: number;
  exploredSystems: string[];
  knownSystems: string[];
  /** Pop-weighted average approval from the last turn. */
  approval: number;
  /** Last turn totals for UI. */
  lastTotals: Fidsi;
  eliminated: boolean;
  research: ResearchState;
  designs: ShipDesign[];
  isPirate: boolean;
  heroes: Hero[];
  /** Wars this empire has started; others hold it against them. */
  warDeclarations: number;
  senate: Senate;
  activeEvents: ActiveEvent[];
  quest: QuestState;
  stats: EmpireStats;
  /** Minor factions are static single-system polities that can be assimilated or conquered. */
  isMinor: boolean;
  /** Minor faction ids absorbed into this empire; their bonuses apply empire-wide. */
  assimilated: string[];
}

export type NotificationKind = 'info' | 'build' | 'colony' | 'growth' | 'explore' | 'warning' | 'fleet' | 'research' | 'battle' | 'siege' | 'diplomacy' | 'hero' | 'pirate' | 'event' | 'quest' | 'senate' | 'victory' | 'minor';

export interface Notification {
  turn: number;
  kind: NotificationKind;
  text: string;
  systemId?: string;
  fleetId?: string;
  battleId?: string;
}

export interface GameState {
  version: number;
  settings: GameSettings;
  turn: number;
  galaxy: {
    width: number;
    height: number;
    systems: StarSystem[];
    lanes: Lane[];
  };
  empires: Empire[];
  fleets: Fleet[];
  playerEmpireId: string;
  nextId: number;
  /** Notifications produced by the last end-turn, for the player empire. */
  notifications: Notification[];
  /** Pair key "empA|empB" (sorted) -> status. Missing means peace. */
  relations: Record<string, Relation>;
  /** Remembered grievances and favours, keyed "from>to"; decays toward zero. */
  attitudes: Record<string, number>;
  /** Proposals waiting for the player (or expired AI-to-AI deals). */
  offers: DiplomaticOffer[];
  /** Hero definition ids currently available for hire. */
  heroMarket: string[];
  /** Goodwill with minor factions, keyed "minorEmpireId|empireId", 0 to 100. */
  minorRelations: Record<string, number>;
  victory: Victory | null;
  /** Most recent battle reports, newest last. */
  battles: BattleReport[];
}

export const SAVE_VERSION = 4;

// ---------------------------------------------------------------------------
// Milestone 2: research, designs, combat
// ---------------------------------------------------------------------------

export interface TacticDef {
  id: string;
  name: string;
  description: string;
  /** Tactic ids this card gains a bonus against. */
  counters: string[];
  /** Percent damage modifiers per weapon kind. */
  damage: { kinetic?: number; laser?: number; missile?: number };
  /** Percent accuracy bonus. */
  accuracy?: number;
  /** Percent accuracy penalty applied to the enemy. */
  evasion?: number;
  /** Percent shield strength bonus. */
  shields?: number;
  /** Percent extra damage taken. */
  damageTaken?: number;
}

export interface ShipDesign {
  id: string;
  name: string;
  hullId: string;
  /** Module ids; each must fit a free slot of its type on the hull. */
  modules: string[];
}

export interface ResearchState {
  current: string | null;
  progress: number;
  queue: string[];
}

export interface Siege {
  by: string;
  turns: number;
}

export type RelationStatus = 'peace' | 'war' | 'alliance';

export interface Relation {
  status: RelationStatus;
  trade: boolean;
  research: boolean;
  /** Positive favours the lexicographically smaller empire id of the pair. */
  warScore: number;
  /** Turn the current status began. */
  sinceTurn: number;
}

export type TreatyKind = 'peace' | 'trade' | 'research' | 'alliance' | 'tribute';

export interface DiplomaticOffer {
  id: string;
  from: string;
  to: string;
  kind: TreatyKind;
  turn: number;
}

export interface BattleSide {
  empireId: string;
  empireName: string;
  fleetNames: string[];
  tactic: string;
  shipsBefore: number;
  shipsAfter: number;
  hpBefore: number;
  hpAfter: number;
  damageDealt: number;
  lost: string[];
}

export interface BattleReport {
  id: string;
  turn: number;
  systemId: string;
  systemName: string;
  attacker: BattleSide;
  defender: BattleSide;
  phases: Array<{ phase: number; name: string; lines: string[] }>;
  outcome: 'attacker' | 'defender' | 'stalemate';
}

// ---------------------------------------------------------------------------
// Milestone 3: heroes
// ---------------------------------------------------------------------------

export type HeroRole = 'governor' | 'admiral';

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  blurb: string;
  /** Faction the hero hails from; null for drifters. */
  faction: string | null;
  role: HeroRole | 'both';
  /** Skills known at level 1. */
  innate: string[];
  cost: number;
}

export interface HeroSkillDef {
  id: string;
  name: string;
  tree: HeroRole;
  tier: number;
  requires?: string;
  description: string;
  /** Governor effects applied to the governed system. */
  effects?: Effect[];
  /** Admiral modifiers applied to the fleet in battle (percent) and movement (speed). */
  combat?: { damage?: number; accuracy?: number; evasion?: number; shields?: number; hp?: number; speed?: number };
}

export type HeroAssignment = { kind: 'governor'; systemId: string } | { kind: 'admiral'; fleetId: string };

export interface Hero {
  id: string;
  defId: string;
  level: number;
  xp: number;
  skills: string[];
  assignment: HeroAssignment | null;
}

// ---------------------------------------------------------------------------
// Milestone 4: politics, events, quests, minor factions, victory
// ---------------------------------------------------------------------------

export type Ideology = 'industrialist' | 'mercantile' | 'scientific' | 'pacifist' | 'militarist';
export const IDEOLOGIES: Ideology[] = ['industrialist', 'mercantile', 'scientific', 'pacifist', 'militarist'];

export interface Senate {
  /** Percent support per party; sums to 100. */
  support: Record<Ideology, number>;
  ruling: Ideology;
  nextElection: number;
  /** Active law ids. */
  laws: string[];
}

export interface ActiveEvent {
  id: string;
  until: number;
}

export interface QuestState {
  step: number;
  completed: boolean;
}

export interface EmpireStats {
  battlesWon: number;
  systemsCaptured: number;
  improvementsBuilt: number;
  shipsBuilt: number;
}

export type QuestObjectiveKind = 'explore' | 'systems' | 'techs' | 'tech' | 'improvement' | 'warships' | 'battles' | 'dust' | 'pop' | 'hero' | 'law' | 'captures';

export interface QuestStep {
  id: string;
  title: string;
  text: string;
  objective: { kind: QuestObjectiveKind; target: string | number };
  reward: { dust?: number; influence?: number; science?: number; tech?: string; text: string };
}

export interface QuestDef {
  factionId: string;
  title: string;
  steps: QuestStep[];
}

export interface MinorDef {
  /** Matches a faction id flagged `minor`. */
  id: string;
  pop: number;
  guards: number;
  bonusText: string;
  /** Empire-wide effects granted on assimilation. */
  bonus: Effect[];
}

export type VictoryKind = 'score' | 'conquest' | 'science' | 'economic' | 'wonder' | 'supremacy';

export interface Victory {
  empireId: string;
  kind: VictoryKind;
  turn: number;
}
