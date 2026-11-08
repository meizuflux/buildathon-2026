// Resident app model. Kept separate from the UI so the rules and API mapping can be tested without React.

/** A household answer that may be unknown ("Not sure"). */
export type Answer = 'yes' | 'no' | 'unknown';

/** What a shelter has reported about one capability. */
export type CapabilityState = 'confirmed' | 'not_available' | 'unknown';

export type Requirement = 'wheelchairEntrance' | 'pets' | 'children' | 'poweredEquipment';

export interface Household {
  id: string;
  adults: number;
  children: number;
  pets: boolean;
  wheelchairEntrance: Answer;
  poweredEquipment: Answer;
  vehicle: Answer;
  transportHelp: Answer;
  location: { label: string; lat: number; lng: number };
}

export interface Capability {
  state: CapabilityState;
  /** What exactly was reported, in plain language. */
  detail: string;
}

export interface Shelter {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  status: 'open' | 'closed';
  /** Spaces reported available, or null when not reported. */
  spaces: number | null;
  /** Local wall-clock minute (see `localMinute`) the shelter record was last updated. */
  spacesReportedAt: number;
  capabilities: Record<Requirement, Capability>;
}

export interface OfficialInstruction {
  id: string;
  level: 'mandatory' | 'advisory';
  headline: string;
  details: string;
  authority: string;
  issuedAt: number;
}

export interface Broadcast {
  id: string;
  title: string;
  body: string;
  authority: string;
  severity: 'critical' | 'attention' | 'info';
  at: number;
}

export type MessageState = 'sending' | 'sent' | 'failed';

export interface Message {
  id: string;
  body: string;
  at: number;
  state: MessageState;
}

export interface SystemNotice {
  id: string;
  at: number;
  title: string;
  lines: string[];
}

/** One requirement checked against one shelter. */
export interface RequirementCheck {
  requirement: Requirement;
  /** required, or possibly (the household answered "Not sure"). */
  need: 'required' | 'possibly';
  state: CapabilityState;
  label: string;
  detail: string;
}

export interface ShelterAssessment {
  shelter: Shelter;
  checks: RequirementCheck[];
  spacesOk: boolean | null;
  /** Reasons the shelter cannot be used at all. */
  blockers: string[];
  /** Things that could not be confirmed. */
  unresolved: string[];
  eligible: boolean;
  verified: boolean;
}

export interface Recommendation {
  /** recommended: a confirmed fit. unverified: the plan's shelter has unconfirmed or unmet needs. none: no destination. */
  status: 'recommended' | 'unverified' | 'none';
  destination: ShelterAssessment | null;
  alternatives: { assessment: ShelterAssessment; whyNot: string }[];
  /** Household-side unknowns that affect the choice. */
  householdUnknowns: string[];
  /** The coordinators' plan counted space for this household. Still not a confirmed placement. */
  reserved: boolean;
}
