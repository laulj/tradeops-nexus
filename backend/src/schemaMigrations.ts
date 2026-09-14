import type { Database } from "sqlite"

/**
 * Adds a column when it is missing, tolerating the one failure that is not an
 * error: another connection adding it first.
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, so "is the column there?" followed by
 * `ALTER TABLE` is two round trips, and the answer to the first can be stale by
 * the time the second runs. Two overlapping initializations of one file — a first
 * page load firing several requests at once (initMiddleware runs per request), two
 * cluster workers, or the old and new process during a nodemon restart — both see
 * the old schema and both try to add the column; the loser used to fail the
 * request with `SQLITE_ERROR: duplicate column name: username`.
 *
 * Only that case is swallowed: the column is re-read afterwards and anything else
 * is rethrown, so a real duplicate (for instance an existing column with
 * different casing, which SQLite treats as the same name) still fails loudly.
 *
 * Returns whether this call is the one that added the column.
 */
export const ensureColumn = async (
    db: Database,
    table: string,
    column: string,
    definition: string,
): Promise<boolean> => {
    const exists = async () =>
        ((await db.all(`PRAGMA table_info("${table}")`)) as { name: string }[]).some((c) => c.name === column)

    if (await exists()) return false

    try {
        await db.exec(`ALTER TABLE "${table}" ADD COLUMN ${column} ${definition}`)
        return true
    } catch (err) {
        if (!(await exists())) throw err
        return false
    }
}
