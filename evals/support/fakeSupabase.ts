// A minimal, chainable fake of the subset of the Supabase query builder that
// lib/voiceDemo/data.ts actually uses (.select/.eq/.is/.order/.limit/
// .maybeSingle, plus .insert/.update/.upsert). Not a general Supabase mock —
// just enough surface to drive our data-layer logic in tests without a real
// database.
//
// `handlers` maps table name -> a function receiving the recorded call
// description and returning { data } or { error }. Every call the code makes
// is also pushed to `.calls` so tests can assert on exactly what was queried
// (e.g. which column was filtered, whether insert vs update was used).

export type RecordedCall = {
  table: string;
  ops: { method: string; arg?: unknown }[];
};

type Resolution = { data?: unknown; error?: unknown };
type Handler = (call: RecordedCall) => Resolution;

export function makeFakeSupabase(handlers: Record<string, Handler>) {
  const calls: RecordedCall[] = [];

  function resolve(record: RecordedCall): Resolution {
    calls.push(record);
    const handler = handlers[record.table];
    if (!handler) throw new Error(`fakeSupabase: no handler registered for table "${record.table}"`);
    return handler(record);
  }

  function selectChain(record: RecordedCall) {
    const chain = {
      eq(col: string, val: unknown) {
        record.ops.push({ method: "eq", arg: [col, val] });
        return chain;
      },
      is(col: string, val: unknown) {
        record.ops.push({ method: "is", arg: [col, val] });
        return chain;
      },
      order(col: string, opts: unknown) {
        record.ops.push({ method: "order", arg: [col, opts] });
        return chain;
      },
      limit(n: number) {
        record.ops.push({ method: "limit", arg: n });
        return chain;
      },
      maybeSingle: async () => resolve(record),
      // Makes `await builder.eq(...).order(...).limit(20)` work without an
      // explicit terminal call, same as the real supabase-js builder.
      then(onFulfilled: (v: Resolution) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(resolve(record)).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  return {
    calls,
    from(table: string) {
      return {
        select(cols: string) {
          return selectChain({ table, ops: [{ method: "select", arg: cols }] });
        },
        insert: (obj: unknown) => Promise.resolve(resolve({ table, ops: [{ method: "insert", arg: obj }] })),
        upsert: (obj: unknown) => Promise.resolve(resolve({ table, ops: [{ method: "upsert", arg: obj }] })),
        update(obj: unknown) {
          const record: RecordedCall = { table, ops: [{ method: "update", arg: obj }] };
          return {
            eq: (col: string, val: unknown) => {
              record.ops.push({ method: "eq", arg: [col, val] });
              return Promise.resolve(resolve(record));
            },
          };
        },
      };
    },
  };
}

/** Pull an `.eq(col, val)` filter value out of a recorded call, for assertions. */
export function eqArg(call: RecordedCall, col: string): unknown {
  const op = call.ops.find((o) => o.method === "eq" && Array.isArray(o.arg) && o.arg[0] === col);
  return op && Array.isArray(op.arg) ? op.arg[1] : undefined;
}
