import { ILLUSTRATIONS } from '@/content/avatars';

const HAIR: Record<string, string> = {
  short: 'M30 34c0-12 9-19 20-19s20 7 20 19c-3-5-9-8-20-8s-17 3-20 8z',
  long: 'M28 40c0-16 9-25 22-25s22 9 22 25v22c-3 0-5-2-6-5V38c-4-4-9-6-16-6s-12 2-16 6v19c-1 3-3 5-6 5z',
  bun: 'M31 35c0-11 8-18 19-18s19 7 19 18c-4-4-10-6-19-6s-15 2-19 6zM44 10a6 6 0 1 1 12 0a6 6 0 1 1-12 0z',
  curly: 'M27 38c-3-12 6-24 23-24s26 12 23 24c-2-3-4-4-6-4-1-3-4-5-8-5-3-2-6-2-9-2s-6 0-9 2c-4 0-7 2-8 5-2 0-4 1-6 4z',
  crop: 'M32 32c1-9 8-14 18-14s17 5 18 14c-4-3-10-4-18-4s-14 1-18 4z',
  side: 'M30 36c0-13 9-20 21-20 9 0 17 5 19 14-8-4-18-5-27-3-5 1-9 4-13 9z',
};

/** Flat counterpart illustration in brand tints; a hold ring marks who is speaking. */
export function Avatar({ avatarId, size = 64, speaking = false, label }: { avatarId: string; size?: number; speaking?: boolean; label?: string }) {
  const traits = ILLUSTRATIONS[avatarId] ?? { background: 'hold', hair: 'short', glasses: false, collar: 'crew' };
  const tint = traits.background === 'hold' ? 'var(--hold-tint)' : 'var(--gap-tint)';
  return (
    <span
      className="inline-block shrink-0 rounded-[12px]"
      style={{ width: size, height: size, boxShadow: speaking ? '0 0 0 2px var(--paper), 0 0 0 4px var(--hold)' : undefined }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} className="block rounded-[12px]">
        <rect width="100" height="100" fill={tint} />
        <path d="M16 100c2-19 16-29 34-29s32 10 34 29z" fill="var(--ink)" />
        {traits.collar === 'shirt' && <path d="M42 72l8 10 8-10-8-2z" fill="var(--raised)" />}
        {traits.collar === 'blazer' && <path d="M40 72l10 18 10-18-10 4z" fill="var(--raised)" />}
        {traits.collar === 'crew' && <path d="M40 72c2 4 6 6 10 6s8-2 10-6c-3-1-6-2-10-2s-7 1-10 2z" fill="var(--raised)" />}
        <rect x="44" y="56" width="12" height="14" rx="3" fill="var(--raised)" stroke="var(--ink)" strokeWidth="2" />
        <ellipse cx="50" cy="42" rx="18" ry="20" fill="var(--raised)" stroke="var(--ink)" strokeWidth="2" />
        <path d={HAIR[traits.hair] ?? HAIR.short} fill="var(--ink)" />
        <circle cx="43" cy="44" r="1.8" fill="var(--ink)" />
        <circle cx="57" cy="44" r="1.8" fill="var(--ink)" />
        <path d="M45 53c3 2 7 2 10 0" stroke="var(--ink)" strokeWidth="2" fill="none" strokeLinecap="round" />
        {traits.glasses && (
          <g stroke="var(--ink)" strokeWidth="1.8" fill="none">
            <rect x="37" y="39" width="11" height="9" rx="3" />
            <rect x="52" y="39" width="11" height="9" rx="3" />
            <path d="M48 43h4" />
          </g>
        )}
      </svg>
    </span>
  );
}

/** The AI coach mark: a neutral flat glyph, labelled as AI. */
export function CoachMark({ size = 56, speaking = false }: { size?: number; speaking?: boolean }) {
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-[12px] bg-hold-tint"
      style={{ width: size, height: size, boxShadow: speaking ? '0 0 0 2px var(--paper), 0 0 0 4px var(--hold)' : undefined }}
      role="img"
      aria-label="Alex, AI practice coach"
    >
      <svg viewBox="0 0 48 48" width={size * 0.6} height={size * 0.6} aria-hidden>
        <rect x="6" y="14" width="36" height="6" rx="2" fill="var(--ink)" />
        <rect x="6" y="24" width="26" height="6" rx="2" fill="var(--hold)" />
        <rect x="32" y="24" width="8" height="6" rx="2" fill="var(--gap)" />
        <rect x="6" y="34" width="20" height="6" rx="2" fill="var(--won)" />
      </svg>
    </span>
  );
}
