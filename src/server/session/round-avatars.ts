import 'server-only';
import type { AvatarOverride } from '@/onboarding/server/liveavatar';

/**
 * LiveAvatar avatar and voice per negotiation counterpart, keyed by the persona's avatarId in
 * `src/scenarios/personas.ts`. Personas without an entry (and custom scenarios) use the
 * configured LIVEAVATAR_AVATAR_ID / LIVEAVATAR_VOICE_ID. The sandbox ignores these entries.
 */
export const ROUND_AVATARS: Readonly<Record<string, Required<AvatarOverride>>> = {
  'maya-chen': { avatarId: '5dd4d830-957a-419f-9334-0dc4399ada5d', voiceId: 'b2bd6569-a537-4342-aeca-a1f15d2a2c97' },
  'daniel-okafor': { avatarId: '91342979-4c4c-44f1-bd3b-1c846d20341e', voiceId: 'c466083f-30f0-465b-a836-0b77abfe7956' },
  'priya-raman': { avatarId: 'bf00036b-558a-44b5-b2ff-1e3cec0f4ceb', voiceId: '8a504f9b-95dd-42d4-8b0c-edc2567b6382' },
  'tom-becker': { avatarId: '0930fd59-c8ad-434d-ad53-b391a1768720', voiceId: 'b952f553-f7f3-4e52-8625-86b4c415384f' },
};

export function roundAvatarFor(personaAvatarId: string): AvatarOverride {
  return Object.hasOwn(ROUND_AVATARS, personaAvatarId) ? ROUND_AVATARS[personaAvatarId]! : {};
}
