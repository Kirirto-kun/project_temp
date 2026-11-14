import type { Archetype, Persona, StandardKind } from '@/contracts/domain';

export interface CatalogPersona extends Persona {
  tenure: string;
  kinds: readonly StandardKind[];
  /** One-line public description of how this counterpart behaves. */
  style: string;
}

/**
 * Negotiation counterparts. Server-side fields (voiceKey) stay here; the UI shows the public
 * card fields with flat illustrations keyed by the same avatarId. All people are fictional.
 */
export const PERSONAS: readonly CatalogPersona[] = [
  {
    avatarId: 'maya-chen',
    name: 'Maya Chen',
    role: 'Engineering manager',
    tenure: '6 years at the company',
    archetype: 'budget_guard',
    voiceKey: 'warm_mid',
    kinds: ['raise', 'offer'],
    style: 'Protects a fixed budget. Moves when you show impact.',
  },
  {
    avatarId: 'daniel-okafor',
    name: 'Daniel Okafor',
    role: 'Director of engineering',
    tenure: '11 years at the company',
    archetype: 'analyst',
    voiceKey: 'steady_low',
    kinds: ['raise', 'offer'],
    style: 'Wants evidence. Market data and results move him.',
  },
  {
    avatarId: 'priya-raman',
    name: 'Priya Raman',
    role: 'Head of people',
    tenure: '4 years at the company',
    archetype: 'relationship',
    voiceKey: 'warm_mid',
    kinds: ['raise', 'offer'],
    style: 'Friendly and patient. Questions open her up.',
  },
  {
    avatarId: 'tom-becker',
    name: 'Tom Becker',
    role: 'VP of finance',
    tenure: '15 years at the company',
    archetype: 'hardliner',
    voiceKey: 'steady_low',
    kinds: ['raise', 'offer'],
    style: 'Short on patience. Respects a reason and a calm silence.',
  },
  {
    avatarId: 'ana-souza',
    name: 'Ana Souza',
    role: 'Recruiter',
    tenure: '3 years in talent acquisition',
    archetype: 'relationship',
    voiceKey: 'bright_mid',
    kinds: ['offer'],
    style: 'Wants to close the hire. Has more room than the first number.',
  },
  {
    avatarId: 'linda-park',
    name: 'Linda Park',
    role: 'Landlord',
    tenure: 'Owns the building for 9 years',
    archetype: 'budget_guard',
    voiceKey: 'calm_high',
    kinds: ['rent'],
    style: 'Points to rising costs. A reliable tenant matters to her.',
  },
  {
    avatarId: 'sam-wright',
    name: 'Sam Wright',
    role: 'Property manager',
    tenure: 'Manages 40 units',
    archetype: 'hardliner',
    voiceKey: 'steady_low',
    kinds: ['rent', 'bill'],
    style: 'Says the rate is the rate. Tests whether you will hold.',
  },
  {
    avatarId: 'jordan-lee',
    name: 'Jordan Lee',
    role: 'Retention specialist',
    tenure: '5 years in customer retention',
    archetype: 'analyst',
    voiceKey: 'bright_mid',
    kinds: ['bill'],
    style: 'Follows the script until you bring numbers.',
  },
];

export function findPersona(avatarId: string): CatalogPersona | undefined {
  return PERSONAS.find((persona) => persona.avatarId === avatarId);
}

export function personasForKind(kind: StandardKind): CatalogPersona[] {
  return PERSONAS.filter((persona) => persona.kinds.includes(kind));
}

export function toPersona(catalog: CatalogPersona): Persona {
  return {
    name: catalog.name,
    role: catalog.role,
    archetype: catalog.archetype,
    avatarId: catalog.avatarId,
    voiceKey: catalog.voiceKey,
  };
}

export const ARCHETYPES: readonly Archetype[] = ['budget_guard', 'analyst', 'relationship', 'hardliner'];
