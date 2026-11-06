import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { bootstrapQueries } from "../src/infrastructure/persistence/d1/initialize-user";
const user = "bootstrap-test";
const legacy = [
  ["research", "研究", "#168ab5", 0],
  ["development", "個人開発", "#12a89a", 1],
  ["career", "就活", "#ec846c", 2],
  ["study", "学習", "#9380c4", 3],
] as const;
function database(old = false) {
  const d = new DatabaseSync(":memory:");
  d.exec(readFileSync("drizzle/0000_curly_wildside.sql", "utf8"));
  if (old) {
    d.prepare("INSERT INTO preferences (user_id,seeded,revision,day_start) VALUES (?,1,7,420)").run(
      user,
    );
    for (const [id, name, color, position] of legacy)
      d.prepare("INSERT INTO categories (user_id,id,name,color,position) VALUES (?,?,?,?,?)").run(
        user,
        id,
        name,
        color,
        position,
      );
  }
  return d;
}
function run(d: DatabaseSync, token?: string) {
  d.exec("BEGIN");
  try {
    for (const q of bootstrapQueries(user, token)) d.prepare(q.sql).run(...q.values);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
function rows(d: DatabaseSync) {
  return d.prepare("SELECT id,name FROM categories WHERE user_id=? ORDER BY position").all(user);
}
test("新規ユーザーの初期項目は打刻1つ", () => {
  const d = database();
  try {
    run(d);
    assert.deepEqual(
      rows(d).map((r) => r.name),
      ["打刻"],
    );
    assert.equal(d.prepare("SELECT seeded FROM preferences").get()?.seeded, 2);
    assert.equal(d.prepare("SELECT sidebar FROM preferences").get()?.sidebar, "#000000");
  } finally {
    d.close();
  }
});
test("未使用・未編集の旧初期項目だけを変更し、設定とrevisionを維持", () => {
  const d = database(true);
  try {
    run(d, "migration");
    assert.deepEqual(
      rows(d).map((r) => r.name),
      ["打刻"],
    );
    const p = d.prepare("SELECT * FROM preferences").get()!;
    assert.equal(p.day_start, 420);
    assert.equal(p.revision, 8);
    run(d, "migration");
    assert.deepEqual(
      rows(d).map((r) => r.name),
      ["打刻"],
    );
    assert.equal(d.prepare("SELECT revision FROM preferences").get()?.revision, 8);
  } finally {
    d.close();
  }
});
test("旧初期項目に記録があれば履歴と作業を残す", () => {
  const d = database(true);
  try {
    d.prepare(
      "INSERT INTO sessions (user_id,id,category_id,started_at,ended_at,business_day,day_start,timezone,created_at,updated_at) VALUES (?,'record','research',0,1000,'1970-01-01',300,'Asia/Tokyo',0,0)",
    ).run(user);
    run(d);
    assert.equal(rows(d).length, 4);
    assert.equal(d.prepare("SELECT COUNT(*) AS n FROM sessions").get()?.n, 1);
  } finally {
    d.close();
  }
});
test("名称・非表示・順序を個人編集した作業は置き換えない", () => {
  for (const change of ["name='卒業研究'", "hidden=1", "position=10"]) {
    const d = database(true);
    try {
      d.exec(`UPDATE categories SET ${change} WHERE id='research'`);
      run(d);
      assert.equal(rows(d).length, 4);
      assert.equal(d.prepare("SELECT revision FROM preferences").get()?.revision, 7);
    } finally {
      d.close();
    }
  }
});
test("追加した作業がある場合も旧初期項目を残す", () => {
  const d = database(true);
  try {
    d.prepare(
      "INSERT INTO categories (user_id,id,name,color,position) VALUES (?,'custom','読書','#168ab5',4)",
    ).run(user);
    run(d);
    assert.equal(rows(d).length, 5);
  } finally {
    d.close();
  }
});
test("初期項目を削除しても勝手に再作成しない", () => {
  const d = database();
  try {
    run(d);
    d.exec("DELETE FROM categories");
    run(d);
    assert.equal(rows(d).length, 0);
  } finally {
    d.close();
  }
});

test("未使用の旧初期カラーは黒へ移行し、個人カラーでは作業を消さない", () => {
  for (const color of ["#272c34", "#123456"]) {
    const d = database(true);
    try {
      d.prepare("UPDATE preferences SET revision=0,sidebar=?").run(color);
      d.exec("UPDATE categories SET name='自分の作業' WHERE id='research'");
      run(d);
      assert.equal(rows(d).length, 4);
      assert.equal(
        d.prepare("SELECT sidebar FROM preferences").get()?.sidebar,
        color === "#272c34" ? "#000000" : color,
      );
    } finally {
      d.close();
    }
  }
});
