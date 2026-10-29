#!/bin/sh
# สร้าง/รีเฟรชฐานแม่แบบ uat_template = สำเนา smldemo (ครั้งแรก และเมื่ออยากให้ฐานทดสอบใหม่ได้ข้อมูล smldemo ล่าสุด)
# MCP test_db คัดลอกจากแม่แบบนี้ด้วย CREATE DATABASE … TEMPLATE (ไม่กี่วินาที) — smldemo มีคนต่ออยู่ตลอดจึงเป็นแม่แบบตรงๆ ไม่ได้
# รัน (บนเซิร์ฟเวอร์ ในโฟลเดอร์แอป): sh runner/make-test-template.sh · ใช้ UAT_PSQL / UAT_PG_DUMP / UAT_PG_* จาก .env.local
set -eu
cd "$(dirname "$0")/.."
set -a; . ./.env.local; set +a
export PGHOST="$UAT_PG_HOST" PGPORT="${UAT_PG_PORT:-5432}" PGUSER="$UAT_PG_USER" PGPASSWORD="${UAT_PG_PASSWORD:-}" PGOPTIONS=""
PSQL="${UAT_PSQL:-psql}"
q() { "$PSQL" -X -q -v ON_ERROR_STOP=1 -d postgres -c "$1" </dev/null; }

q "DROP DATABASE IF EXISTS uat_template_next"
q "CREATE DATABASE uat_template_next"
"${UAT_PG_DUMP:-pg_dump}" -d smldemo | "$PSQL" -X -q -d uat_template_next >/dev/null
q "ALTER DATABASE uat_template WITH IS_TEMPLATE false" 2>/dev/null || true
q "DROP DATABASE IF EXISTS uat_template"
q "ALTER DATABASE uat_template_next RENAME TO uat_template"
q "COMMENT ON DATABASE uat_template IS 'uat-tester template'"
q "ALTER DATABASE uat_template WITH ALLOW_CONNECTIONS false IS_TEMPLATE true"
echo "uat_template พร้อมแล้ว"
