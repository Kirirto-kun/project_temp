export const MOVES = ['Anchor first', 'Give a reason', 'Ask why', "Trade, don't concede", 'Let silence work', 'Name the range', 'Bracket', 'Get it in writing'];

export const FAQ = [
  {
    q: 'Is the counterpart a real person?',
    a: 'No. It is a simulation. Its limit is a scenario setting taken from the range you enter, not knowledge of anyone’s real budget.',
  },
  {
    q: 'How is “left on the table” worked out?',
    a: 'It is the distance between where you stopped and the scenario’s limit, measured against your range. It does not predict what anyone would pay.',
  },
  {
    q: 'Do I need a microphone or a camera?',
    a: 'No. Everything works by typing. Voice practice and the voice debrief are optional. The camera is never used.',
  },
  {
    q: 'What happens to my recordings?',
    a: 'Only your own microphone is recorded, only after you agree, and only for the analysis. Raw audio is deleted after the analysis and never kept longer than 24 hours.',
  },
  {
    q: 'Is this a subscription?',
    a: 'No. Practice rounds, replays and the debrief are free within a daily limit. The optional conversation pack is a one-time payment with no renewal.',
  },
  {
    q: 'Why was I charged?',
    a: 'Only if you bought a conversation pack. The receipt from our payment provider lists the date and the amount. Refunds remove unused credits.',
  },
];

export const COACH_NOTES: Record<string, { big: string; sub: string }> = {
  raise: { big: 'The first number sets the range for the whole talk.', sub: 'In this round you open first. The debrief shows what that number did.' },
  offer: { big: 'The first offer is rarely the last one.', sub: 'Ask what is flexible before you answer with a number.' },
  rent: { big: 'A reliable tenant is worth money to a landlord.', sub: 'Name what you bring before you name your price.' },
  bill: { big: 'Retention teams have room they do not volunteer.', sub: 'Ask what is possible, then hold your number.' },
};

export const COUNTERPART_ROLES: Record<string, string[]> = {
  raise: ['Manager', 'Director', 'Head of people'],
  offer: ['Recruiter', 'Hiring manager'],
  rent: ['Landlord', 'Property manager'],
  bill: ['Retention specialist', 'Account manager'],
};

export const KIND_TILES = [
  { kind: 'raise', title: 'A raise', bars: [90, 70] },
  { kind: 'offer', title: 'A job offer', bars: [75, 60] },
  { kind: 'rent', title: 'Rent', bars: [60, 45] },
  { kind: 'bill', title: 'A bill or rate', bars: [50, 30] },
] as const;
