import type { Archetype, ScenarioKind } from '@/contracts/domain';

/**
 * Safe counterpart lines. {amount} is filled by code from the engine action; no template
 * contains any other number. Each archetype has a few variants chosen by turn number.
 */
export interface ReplyTemplates {
  hold: readonly string[];
  holdWithOffer: readonly string[];
  concede: readonly string[];
  accept: readonly string[];
  walkAway: readonly string[];
  probe: readonly string[];
  objectPrefix: readonly string[];
  clarify: readonly string[];
  outOfRange: readonly string[];
}

export const TEMPLATES: Record<Archetype, ReplyTemplates> = {
  budget_guard: {
    hold: ["I hear you, but the budget doesn't move that easily.", "I understand. I still can't change the number right now."],
    holdWithOffer: ['I can stay at {amount}. That is what the budget allows today.', "Right now {amount} is what I can do."],
    concede: ['Let me see what I can do. I can go to {amount}.', 'Okay. I can stretch to {amount}.'],
    accept: ["Then let's settle on {amount}.", "{amount} it is. I'll put it through."],
    walkAway: ["I don't think we'll get there today. Let's stop here and revisit later.", "We're too far apart. Let's leave it for now."],
    probe: ['If you can show me impact beyond your current role, I have a bit of room.', 'What would help is a clear picture of what you have delivered.'],
    objectPrefix: ['', 'To be honest, '],
    clarify: ['I heard more than one number. Which one are you asking for?'],
    outOfRange: ["That is well outside anything I could approve. Let's be realistic."],
  },
  analyst: {
    hold: ["I'd need more than that to change my view.", "That doesn't give me enough to work with yet."],
    holdWithOffer: ['Based on what I have, {amount} is where I stand.', 'The numbers I see support {amount}.'],
    concede: ['That is a fair point. I can move to {amount}.', 'Given that, {amount} is justifiable.'],
    accept: ['Agreed. {amount}.', '{amount} works. I will document the rationale.'],
    walkAway: ["Without evidence I can't take this further. Let's pause here."],
    probe: ["What I'd need is evidence: results or market data I can take to finance.", 'Walk me through the data behind your number.'],
    objectPrefix: ['', 'Looking at the data, '],
    clarify: ['You mentioned two numbers. Which one is your ask?'],
    outOfRange: ["That number isn't supported by anything I've seen."],
  },
  relationship: {
    hold: ['I really want to make this work, I just need a bit more from you.', 'I appreciate you raising it. Let me hear more.'],
    holdWithOffer: ['For now {amount} is what I can offer, but I am listening.', "I'm at {amount} for the moment."],
    concede: ["I'd like to get you closer. How about {amount}?", 'Okay, I can go to {amount} for you.'],
    accept: ['Great, {amount} then. Thank you for being open about it.', "Let's do {amount}."],
    walkAway: ["I think we both need some time. Let's pick this up another day."],
    probe: ['Tell me what matters most to you here, and what you have taken on.', 'Help me understand what changed in your role.'],
    objectPrefix: ['', 'I want to be upfront: '],
    clarify: ['Just so I understand, which number are you asking for?'],
    outOfRange: ["That's a big jump from where we are. Help me understand it."],
  },
  hardliner: {
    hold: ['No.', "That doesn't change anything."],
    holdWithOffer: ['{amount}. That is the number.', 'I am at {amount}.'],
    concede: ['Fine. {amount}.', 'I can do {amount}. That is a stretch.'],
    accept: ['{amount}. Done.', 'Agreed at {amount}.'],
    walkAway: ['We are done here.', "This isn't going anywhere. We'll stop."],
    probe: ['Give me a reason I can defend, not just a number.', 'Why should I move at all?'],
    objectPrefix: [''],
    clarify: ['Pick one number.'],
    outOfRange: ['Not happening.'],
  },
};

export const OPENINGS: Record<Exclude<ScenarioKind, 'custom'>, readonly string[]> = {
  raise: ['Thanks for making time. You wanted to talk about your compensation?', 'Come in. You said you wanted to discuss your pay?'],
  offer: ["We're excited to have you. Our offer is {amount}. What do you think?", 'Thanks for your patience. We can offer {amount}.'],
  rent: ['Your lease is up for renewal at {amount}. What did you want to discuss?', 'The renewal comes in at {amount}. You wanted to talk?'],
  bill: ['Thanks for calling. Your current rate is {amount}. How can I help?', 'I see your plan at {amount}. What can I do for you today?'],
};

export function pick<T>(items: readonly T[], seed: number): T {
  return items[Math.abs(seed) % items.length]!;
}
