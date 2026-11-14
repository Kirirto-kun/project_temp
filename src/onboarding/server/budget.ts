import type { IntakeStore } from './store';
import { IntakeError } from './errors';

interface Ledger {
  revision: number;
  reservations: Record<string, { day: string; ip: string; endsAt: number; cents: number }>;
}
export interface BudgetPort {
  reserve(attemptId: string, ipHash: string, deadline: number): Promise<void>;
  release(attemptId: string): Promise<void>;
}
export class DailyBudget implements BudgetPort {
  constructor(private store: IntakeStore, private limits: { dailyCents: number; attemptCents: number; concurrency: number; attemptsPerIp: number }, private now = Date.now) {}
  private key = 'budget-ledger';
  async reserve(attemptId: string, ip: string, endsAt: number) {
    const today = new Date(this.now()).toISOString().slice(0,10);
    for (let retry = 0; retry < 32; retry++) {
      const ledger = await this.store.read<Ledger>(this.key) ?? { revision: 0, reservations: {} };
      if (ledger.reservations[attemptId]) return;
      const all = Object.values(ledger.reservations);
      const daily = all.filter(r => r.day === today);
      if (daily.filter(r => r.ip === ip).length >= this.limits.attemptsPerIp) throw new IntakeError(429, 'INTAKE_QUOTA', 'Daily call limit reached. You can still use the form.');
      if (daily.reduce((sum,r) => sum + r.cents,0) + this.limits.attemptCents > this.limits.dailyCents) throw new IntakeError(429, 'DAILY_BUDGET', 'Calls are paused for today. Your brief is still available.');
      if (all.filter(r => r.endsAt > this.now()).length >= this.limits.concurrency) throw new IntakeError(429, 'CONCURRENCY_LIMIT', 'All coaches are busy. Please try again shortly.', true);
      const yesterday = new Date(this.now()-86400000).toISOString().slice(0,10);
      const reservations = Object.fromEntries(Object.entries(ledger.reservations).filter(([,r]) => r.day >= yesterday));
      reservations[attemptId] = { day: today, ip, endsAt, cents: this.limits.attemptCents };
      const next = { revision: ledger.revision + 1, reservations };
      const saved = ledger.revision === 0 ? await this.store.create(this.key,next,172800) : await this.store.compareAndSet(this.key,ledger.revision,next,172800);
      if (saved) return;
    }
    throw new IntakeError(503,'BUDGET_BUSY','Please try again shortly.',true);
  }
  async release(attemptId: string) {
    for (let retry=0;retry<32;retry++) {
      const ledger=await this.store.read<Ledger>(this.key);
      if (!ledger?.reservations[attemptId] || ledger.reservations[attemptId].endsAt<=this.now()) return;
      ledger.reservations[attemptId].endsAt=this.now();
      const revision=ledger.revision++;
      if(await this.store.compareAndSet(this.key,revision,ledger,172800)) return;
    }
    throw new IntakeError(503,'BUDGET_BUSY','Budget reconciliation is pending.',true);
  }
}
