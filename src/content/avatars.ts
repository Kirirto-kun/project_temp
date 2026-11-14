import { PERSONAS, type CatalogPersona } from '@/scenarios/personas';
import type { Archetype } from '@/contracts/domain';

export interface IllustrationTraits {
  background: 'hold' | 'gap';
  hair: 'short' | 'long' | 'bun' | 'curly' | 'crop' | 'side';
  glasses: boolean;
  collar: 'shirt' | 'crew' | 'blazer';
}

/** Flat illustration traits per counterpart. Colours come only from brand tokens. */
export const ILLUSTRATIONS: Record<string, IllustrationTraits> = {
  'maya-chen': { background: 'hold', hair: 'bun', glasses: false, collar: 'blazer' },
  'daniel-okafor': { background: 'gap', hair: 'crop', glasses: true, collar: 'shirt' },
  'priya-raman': { background: 'gap', hair: 'long', glasses: false, collar: 'crew' },
  'tom-becker': { background: 'hold', hair: 'side', glasses: false, collar: 'blazer' },
  'ana-souza': { background: 'hold', hair: 'curly', glasses: false, collar: 'crew' },
  'linda-park': { background: 'gap', hair: 'short', glasses: true, collar: 'crew' },
  'sam-wright': { background: 'gap', hair: 'crop', glasses: false, collar: 'shirt' },
  'jordan-lee': { background: 'hold', hair: 'short', glasses: false, collar: 'shirt' },
};

export const ARCHETYPE_LABELS: Record<Archetype, { title: string; hint: string }> = {
  budget_guard: { title: 'Budget guard', hint: 'Protects a fixed budget' },
  analyst: { title: 'Analyst', hint: 'Moves on evidence' },
  relationship: { title: 'Relationship builder', hint: 'Opens up to questions' },
  hardliner: { title: 'Hardliner', hint: 'Tests whether you hold' },
};

export type PublicCard = Pick<CatalogPersona, 'avatarId' | 'name' | 'role' | 'tenure' | 'archetype' | 'kinds' | 'style'>;

export const AVATAR_CARDS: PublicCard[] = PERSONAS.map(({ avatarId, name, role, tenure, archetype, kinds, style }) => ({ avatarId, name, role, tenure, archetype, kinds, style }));

export function cardFor(avatarId: string): PublicCard | undefined {
  return AVATAR_CARDS.find((c) => c.avatarId === avatarId);
}
