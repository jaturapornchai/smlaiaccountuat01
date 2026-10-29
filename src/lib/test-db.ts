import { psql } from "./uat-health";

// ฐานทดสอบแยกที่ AI สร้างเองได้: uat_<ชื่อ> คัดลอกจาก uat_template (= สำเนา smldemo, สร้าง/รีเฟรชด้วย runner/make-test-template.sh)
// ป้าย COMMENT 'uat-tester' = ฐานที่เครื่องมือนี้สร้าง — ตัวรันยอมให้ db.* ใช้ และลบได้เฉพาะฐานที่มีป้ายนี้ (ต้องตรงกับ runner/run.mjs)
// ชื่อฐานใส่ใน SQL ตรงๆ ได้เพราะผ่าน NAME (a-z0-9_) แล้ว — DDL ผูกชื่อฐานเป็นพารามิเตอร์ไม่ได้
export const TEST_DB_MARK = "uat-tester";
const MAX = 5; // ponytail: เพดานกันดิสก์เต็ม (ฐานละ ~600 MB)
const NAME = /^[a-z0-9_]{1,30}$/;
const MAIN = "smlerpmainuatadmin"; // ฐานหลักของ provider uatadmin — มีแล้วจึงลงทะเบียนให้เปิดในจอ ERP ได้
const W = { db: "postgres", write: true };

const rows = async (sql: string, db = "postgres") => (await psql(sql, { db })).split("\n").filter(Boolean);
const list = () => rows(`select datname from pg_database where shobj_description(oid, 'pg_database') = '${TEST_DB_MARK}' order by datname`);
const hasMain = async () => (await rows(`select 1 from pg_database where datname = '${MAIN}'`)).length > 0;

// ลงทะเบียนเหมือน ERP สร้างกิจการ (smlaiaccount backend workspace_google.go WorkspaceCreateDatabase: data_group 'MAIN' + สิทธิ์ผู้ใช้)
async function register(db: string) {
  if (!(await hasMain())) return `not in the ERP database list (no provider uatadmin yet) — use it from db.* steps`;
  const code = db.toUpperCase();
  const users = ["SUPERADMIN", "admin", process.env.UAT_ADMIN_USER].filter((u): u is string => !!u && /^\w+$/.test(u));
  await psql(
    `insert into sml_database_list (data_group, data_code, data_name, data_database_name, last_database_xml_update) values ('MAIN', '${code}', 'ทดสอบ ${code}', '${db}', now());` +
      `insert into sml_database_list_user_and_group (data_group, data_code, user_or_group_code, user_or_group_status) select 'MAIN', '${code}', u, 0 from unnest(array['${[...new Set(users)].join("','")}']) u`,
    { db: MAIN, write: true },
  );
  return `listed in provider uatadmin as ${code} (ui.adminLogin then pick it)`;
}

async function unregister(db: string) {
  if (!(await hasMain())) return;
  await psql(`delete from sml_database_list_user_and_group where data_group = 'MAIN' and data_code = '${db.toUpperCase()}'; delete from sml_database_list where data_database_name = '${db}'`, { db: MAIN, write: true });
}

export async function testDb(action: string, raw: string): Promise<string> {
  const have = await list();
  const show = (msg: string, dbs = have) => `${msg}\ntest DBs ${dbs.length}/${MAX}: ${dbs.join(", ") || "-"}`;
  if (action === "list") return show("ok");
  const name = raw.trim().toLowerCase().replace(/^uat_/, "");
  if (!NAME.test(name) || name.startsWith("template")) throw new Error("name: a-z 0-9 _ (1-30 chars), not 'template*'");
  const db = `uat_${name}`;
  if (action === "create") {
    if (have.includes(db)) return show(`${db} already exists`);
    if (have.length >= MAX) throw new Error(`limit ${MAX} test DBs — drop one first (${have.join(", ")})`);
    await psql(`CREATE DATABASE "${db}" TEMPLATE uat_template STRATEGY FILE_COPY`, { ...W, timeout: 180_000 });
    await psql(`COMMENT ON DATABASE "${db}" IS '${TEST_DB_MARK}'`, W);
    return show(`created ${db} = copy of smldemo (from uat_template) · ${await register(db)}`, [...have, db]);
  }
  if (action === "drop") {
    if (!have.includes(db)) throw new Error(`${db} was not created by test_db — refused`);
    await unregister(db);
    await psql(`DROP DATABASE "${db}" WITH (FORCE)`, { ...W, timeout: 60_000 });
    return show(`dropped ${db}`, have.filter((d) => d !== db));
  }
  throw new Error("action: list | create | drop");
}
