import "server-only";

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import type {
  AvailabilityBlockRow,
  ConfirmedSlotRow,
  MeetingRow,
  MeetingVoteRow,
  ParticipantRow,
  TrackingEventRow,
} from "@/lib/types";

type LocalTableName =
  | "meetings"
  | "participants"
  | "availability_blocks"
  | "confirmed_slots"
  | "meeting_votes"
  | "tracking_events";

interface LocalStore {
  meetings: MeetingRow[];
  participants: ParticipantRow[];
  availability_blocks: AvailabilityBlockRow[];
  confirmed_slots: ConfirmedSlotRow[];
  meeting_votes: MeetingVoteRow[];
  tracking_events: TrackingEventRow[];
}

type LocalRow =
  | MeetingRow
  | ParticipantRow
  | AvailabilityBlockRow
  | ConfirmedSlotRow
  | MeetingVoteRow
  | TrackingEventRow;

interface Filter {
  column: string;
  value: unknown;
}

interface QueryResult<T> {
  data: T | null;
  error: Error | null;
}

const STORE_PATH = path.join(process.cwd(), ".modu-local-db.json");

let queue = Promise.resolve();

function emptyStore(): LocalStore {
  return {
    meetings: [],
    participants: [],
    availability_blocks: [],
    confirmed_slots: [],
    meeting_votes: [],
    tracking_events: [],
  };
}

async function readStore(): Promise<LocalStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as Partial<LocalStore>;
    return {
      ...emptyStore(),
      ...parsed,
      meetings: parsed.meetings ?? [],
      participants: parsed.participants ?? [],
      availability_blocks: parsed.availability_blocks ?? [],
      confirmed_slots: parsed.confirmed_slots ?? [],
      meeting_votes: parsed.meeting_votes ?? [],
      tracking_events: parsed.tracking_events ?? [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw error;
  }
}

async function writeStore(store: LocalStore) {
  await fs.writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function runExclusive<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function withDefaults(table: LocalTableName, row: Record<string, unknown>): LocalRow {
  const now = new Date();
  const nowIso = now.toISOString();

  if (table === "meetings") {
    return {
      id: String(row.id ?? randomUUID()),
      title: String(row.title ?? ""),
      agenda: String(row.agenda ?? ""),
      location: String(row.location ?? ""),
      duration_minutes: Number(row.duration_minutes ?? 60),
      date_start: String(row.date_start ?? ""),
      date_end: String(row.date_end ?? row.date_start ?? ""),
      workday_start: String(row.workday_start ?? "09:00"),
      workday_end: String(row.workday_end ?? "18:00"),
      lunch_start: String(row.lunch_start ?? "12:00"),
      lunch_end: String(row.lunch_end ?? "13:00"),
      admin_token: String(row.admin_token ?? ""),
      confirmed_slot_id: (row.confirmed_slot_id as string | null | undefined) ?? null,
      created_at: String(row.created_at ?? nowIso),
      expires_at: String(row.expires_at ?? addDays(now, 30).toISOString()),
      response_deadline: (row.response_deadline as string | null | undefined) ?? null,
    };
  }

  if (table === "participants") {
    return {
      id: String(row.id ?? randomUUID()),
      meeting_id: String(row.meeting_id ?? ""),
      name: String(row.name ?? ""),
      role: String(row.role ?? ""),
      attendance_type: row.attendance_type === "required" ? "required" : "optional",
      response_status: row.response_status === "submitted" ? "submitted" : "pending",
      participant_token: String(row.participant_token ?? ""),
      memo: (row.memo as string | null | undefined) ?? null,
      created_at: String(row.created_at ?? nowIso),
      updated_at: String(row.updated_at ?? nowIso),
    };
  }

  if (table === "availability_blocks") {
    return {
      id: String(row.id ?? randomUUID()),
      meeting_id: String(row.meeting_id ?? ""),
      participant_id: String(row.participant_id ?? ""),
      start_at: String(row.start_at ?? ""),
      end_at: String(row.end_at ?? ""),
      status:
        row.status === "avoid" || row.status === "preferred"
          ? row.status
          : "busy",
      note: (row.note as string | null | undefined) ?? null,
      created_at: String(row.created_at ?? nowIso),
    };
  }

  if (table === "confirmed_slots") {
    return {
      id: String(row.id ?? randomUUID()),
      meeting_id: String(row.meeting_id ?? ""),
      start_at: String(row.start_at ?? ""),
      end_at: String(row.end_at ?? ""),
      summary_text: String(row.summary_text ?? ""),
      created_at: String(row.created_at ?? nowIso),
    };
  }

  if (table === "tracking_events") {
    const viewportWidth = Number(row.viewport_width);
    return {
      id: String(row.id ?? randomUUID()),
      event_name: String(row.event_name ?? ""),
      page_path: String(row.page_path ?? ""),
      page_label: String(row.page_label ?? ""),
      meeting_id: (row.meeting_id as string | null | undefined) ?? null,
      visitor_id: (row.visitor_id as string | null | undefined) ?? null,
      session_id: (row.session_id as string | null | undefined) ?? null,
      referrer: (row.referrer as string | null | undefined) ?? null,
      user_agent: (row.user_agent as string | null | undefined) ?? null,
      device_type: String(row.device_type ?? "unknown"),
      viewport_width: Number.isFinite(viewportWidth) ? viewportWidth : null,
      created_at: String(row.created_at ?? nowIso),
    };
  }

  return {
    id: String(row.id ?? randomUUID()),
    meeting_id: String(row.meeting_id ?? ""),
    participant_id: String(row.participant_id ?? ""),
    start_at: String(row.start_at ?? ""),
    end_at: String(row.end_at ?? ""),
    created_at: String(row.created_at ?? nowIso),
  };
}

function matches(row: LocalRow, filters: Filter[]) {
  return filters.every((filter) => {
    const value = asRecord(row)[filter.column];
    return value === filter.value;
  });
}

function asRecord(row: LocalRow) {
  return row as unknown as Record<string, unknown>;
}

function parseColumns(columns: string | undefined) {
  if (!columns || columns.trim() === "*") return null;
  return columns
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
}

function project(row: LocalRow, columns: string[] | null) {
  if (!columns) return { ...row };
  const projected: Record<string, unknown> = {};
  for (const column of columns) {
    projected[column] = asRecord(row)[column];
  }
  return projected;
}

class LocalQueryBuilder implements PromiseLike<QueryResult<unknown>> {
  private action: "select" | "insert" | "update" | "delete" = "select";
  private filters: Filter[] = [];
  private rows: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private patch: Record<string, unknown> | null = null;
  private selectedColumns: string[] | null = null;
  private orderBy: { column: string; ascending: boolean } | null = null;
  private rowLimit: number | null = null;

  constructor(private readonly table: LocalTableName) {}

  select(columns?: string) {
    this.selectedColumns = parseColumns(columns);
    return this;
  }

  insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
    this.action = "insert";
    this.rows = rows;
    return this;
  }

  update(patch: Record<string, unknown>) {
    this.action = "update";
    this.patch = patch;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.rowLimit = count;
    return this;
  }

  single() {
    return this.executeSingle(false);
  }

  maybeSingle() {
    return this.executeSingle(true);
  }

  then<TResult1 = QueryResult<unknown>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.executeMany().then(onfulfilled, onrejected);
  }

  private async executeMany(): Promise<QueryResult<unknown>> {
    return runExclusive(async () => {
      const store = await readStore();
      const tableRows = store[this.table] as LocalRow[];
      let resultRows: LocalRow[] = [];
      let dirty = false;

      if (this.action === "insert") {
        const rawRows = Array.isArray(this.rows) ? this.rows : [this.rows ?? {}];
        resultRows = rawRows.map((row) => withDefaults(this.table, row));
        tableRows.push(...resultRows);
        dirty = true;
      } else if (this.action === "update") {
        resultRows = tableRows.filter((row) => matches(row, this.filters));
        for (const row of resultRows) {
          Object.assign(row, this.patch);
        }
        dirty = resultRows.length > 0;
      } else if (this.action === "delete") {
        const before = tableRows.length;
        const remaining = tableRows.filter((row) => !matches(row, this.filters));
        store[this.table] = remaining as never;
        dirty = remaining.length !== before;
        resultRows = [];
      } else {
        resultRows = tableRows.filter((row) => matches(row, this.filters));
      }

      if (this.orderBy) {
        const { column, ascending } = this.orderBy;
        resultRows = [...resultRows].sort((a, b) => {
          const av = String(asRecord(a)[column] ?? "");
          const bv = String(asRecord(b)[column] ?? "");
          return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }

      if (this.rowLimit !== null) {
        resultRows = resultRows.slice(0, Math.max(0, this.rowLimit));
      }

      if (dirty) await writeStore(store);

      const data =
        this.action === "insert" && !this.selectedColumns
          ? null
          : resultRows.map((row) => project(row, this.selectedColumns));

      return { data, error: null };
    });
  }

  private async executeSingle(maybe: boolean): Promise<QueryResult<unknown>> {
    const result = await this.executeMany();
    if (result.error) return result;

    const rows = Array.isArray(result.data) ? result.data : [];
    if (rows.length === 0) {
      return maybe
        ? { data: null, error: null }
        : { data: null, error: new Error("No rows returned") };
    }
    return { data: rows[0], error: null };
  }
}

export function createLocalSupabaseClient() {
  return {
    from(table: LocalTableName) {
      return new LocalQueryBuilder(table);
    },
  };
}
