import { DEFAULT_CATEGORIES } from "../../../domain/categories/work-category";

type Query = { sql: string; values: (string | number)[] };

const LEGACY_DEFAULTS = [
  ["research", "研究", "#168ab5", 0],
  ["development", "個人開発", "#12a89a", 1],
  ["career", "就活", "#ec846c", 2],
  ["study", "学習", "#9380c4", 3],
] as const;

/** Run as one atomic batch. Only a pristine, unused legacy preset is replaced. */
export function bootstrapQueries(user: string, token = crypto.randomUUID()): Query[] {
  const migrated =
    "EXISTS (SELECT 1 FROM preferences WHERE user_id=? AND mutation_token=? AND seeded=1)";
  return [
    {
      sql: "INSERT INTO preferences (user_id,sidebar) VALUES (?,'#000000') ON CONFLICT DO NOTHING",
      values: [user],
    },
    ...DEFAULT_CATEGORIES.map((c, i) => ({
      sql: "INSERT INTO categories (user_id,id,name,color,position) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM preferences WHERE user_id=? AND seeded=0) ON CONFLICT DO NOTHING",
      values: [user, c.id, c.name, c.color, i, user],
    })),
    { sql: "UPDATE preferences SET seeded=2 WHERE user_id=? AND seeded=0", values: [user] },
    {
      sql: "UPDATE preferences SET sidebar='#000000',revision=revision+1,mutation_token=? WHERE user_id=? AND seeded=1 AND revision=0 AND sidebar='#272c34'",
      values: [`${token}:theme`, user],
    },
    {
      sql: `UPDATE preferences SET revision=revision+1,mutation_token=? WHERE user_id=? AND seeded=1
        AND (SELECT COUNT(*) FROM categories WHERE user_id=?)=4
        AND NOT EXISTS (SELECT 1 FROM sessions WHERE user_id=?)
        AND (SELECT COUNT(*) FROM categories WHERE user_id=? AND hidden=0 AND archived=0 AND
          (${LEGACY_DEFAULTS.map(() => "(id=? AND name=? AND color=? AND position=?)").join(" OR ")}))=4`,
      values: [token, user, user, user, user, ...LEGACY_DEFAULTS.flat()],
    },
    {
      sql: `DELETE FROM categories WHERE user_id=? AND id IN ('research','development','career','study') AND ${migrated}`,
      values: [user, user, token],
    },
    ...DEFAULT_CATEGORIES.map((c, i) => ({
      sql: `INSERT INTO categories (user_id,id,name,color,position) SELECT ?,?,?,?,? WHERE ${migrated}`,
      values: [user, c.id, c.name, c.color, i, user, token],
    })),
    { sql: "UPDATE preferences SET seeded=2 WHERE user_id=? AND seeded=1", values: [user] },
  ];
}
