import { randomUUID } from 'node:crypto';
import { nextOccurrence, occurrencesBetween, validateWindow, WindowOccurrence } from '../domain/maintenanceWindows';
import type { MaintenanceWindow } from '../domain/types';
import { ConflictProblem, NotFoundProblem, ValidationProblem } from '../errors/problem';
import type { ChangeRequestRepository, MaintenanceWindowRepository } from '../repositories';
import type { MaintenanceWindowInput } from '../validation/schemas';

export interface WindowWithNext extends MaintenanceWindow {
  nextOpening?: WindowOccurrence;
}

const ACTIVE_CHANGE_STATES = new Set(['APPROVED', 'SCHEDULED', 'IN_PROGRESS']);

export class MaintenanceWindowService {
  constructor(
    private readonly repo: MaintenanceWindowRepository,
    private readonly changes: ChangeRequestRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private assertValid(input: MaintenanceWindowInput): void {
    const errors = validateWindow(input);
    if (errors.length) throw new ValidationProblem(errors.map((message) => ({ path: '(window)', message })));
  }

  async list(accountId: string): Promise<WindowWithNext[]> {
    const nowIso = this.now().toISOString();
    const windows = await this.repo.find((w) => w.accountId === accountId, (a, b) => a.name.localeCompare(b.name));
    return windows.map((w) => ({ ...w, nextOpening: nextOccurrence(w, nowIso) }));
  }

  async get(accountId: string, id: string): Promise<MaintenanceWindow> {
    const w = await this.repo.get(id);
    if (!w || w.accountId !== accountId) throw new NotFoundProblem('MaintenanceWindow', id);
    return w;
  }

  async create(accountId: string, input: MaintenanceWindowInput): Promise<MaintenanceWindow> {
    this.assertValid(input);
    const existing = await this.repo.find((w) => w.accountId === accountId && w.name.toLowerCase() === input.name.toLowerCase());
    if (existing.length) throw new ConflictProblem(`A maintenance window named "${input.name}" already exists`);
    return this.repo.insert({ id: `MW-${randomUUID()}`, accountId, ...input, daysOfWeek: [...input.daysOfWeek].sort() });
  }

  async update(accountId: string, id: string, input: MaintenanceWindowInput): Promise<MaintenanceWindow> {
    const current = await this.get(accountId, id);
    this.assertValid(input);
    await this.assertNotInUse(id, 'modified');
    return this.repo.update({ ...current, ...input, daysOfWeek: [...input.daysOfWeek].sort() });
  }

  async remove(accountId: string, id: string): Promise<void> {
    await this.get(accountId, id);
    await this.assertNotInUse(id, 'deleted');
    await this.repo.delete(id);
  }

  /** Every opening of every account window in the next `days`, chronologically — drives the scheduling picker. */
  async upcoming(accountId: string, days: number): Promise<Array<WindowOccurrence & { name: string }>> {
    const from = this.now();
    const to = new Date(from.getTime() + days * 86_400_000);
    const windows = await this.repo.find((w) => w.accountId === accountId);
    return windows
      .flatMap((w) => occurrencesBetween(w, from.toISOString(), to.toISOString()).map((o) => ({ ...o, name: w.name })))
      .filter((o) => o.end > from.toISOString())
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  /** Changing a window under a scheduled change would silently move it outside its approved slot. */
  private async assertNotInUse(id: string, verb: string): Promise<void> {
    const using = await this.changes.find((c) => c.maintenanceWindowId === id && ACTIVE_CHANGE_STATES.has(c.status));
    if (using.length) {
      throw new ConflictProblem(`Window cannot be ${verb} while ${using.length} change request(s) are scheduled in it`, {
        changeRequestIds: using.map((c) => c.id),
      });
    }
  }
}
