#!/usr/bin/env python3
"""Compare the Supabase Postgres migrations with the schema in the Cloudflare D1 database.

What it checks, per table: the table exists; every column exists with the expected SQLite type
(MIGRATION-PLAN.md section 2.6 type rules), NOT NULL and primary-key membership; and every
foreign key (column, target table, target column, ON DELETE action).
Differences listed in DOCUMENTED (each one explained in PORT-NOTES.md) are reported but do not fail.
Anything else is an unexplained difference and the script exits 1.

Not checked: CHECK constraints, UNIQUE constraints, indexes, defaults, triggers, views. Those are
covered by the insert tests and by reading the migration.

Usage (from the d1/ folder; needs wrangler logged in for --remote):
    python3 check_schema.py --local
    python3 check_schema.py --remote
Python 3.10+, standard library only.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Per-repo configuration
# ---------------------------------------------------------------------------
HERE = Path(__file__).resolve().parent
PG_MIGRATIONS = HERE.parent / "supabase" / "migrations"
DATABASE = "bloomsbury-db"
SCHEMA_PREFIXES = ("app.", "public.")  # stripped: SQLite has no schemas
TABLE_RENAMES: dict[str, str] = {}      # Postgres table -> D1 table (e.g. auth.users -> users)

# Every documented difference, with the PORT-NOTES.md reason.
DOCUMENTED = {
    "dropped_tables": {},
    "added_tables": {},
    "dropped_columns": {
        ("entity_mentions", "embedding"): "vector(1536) is not stored in D1; it becomes a Vectorize index",
    },
    "dropped_fks": {},
}

# ---------------------------------------------------------------------------
# Postgres side: parse the migrations into a final-state model
# ---------------------------------------------------------------------------
INT_TYPES = {"int", "int2", "int4", "int8", "integer", "smallint", "bigint", "serial", "bigserial", "smallserial"}
REAL_TYPES = {"numeric", "decimal", "real", "double", "float", "float4", "float8"}
TEXT_TYPES = {"text", "uuid", "varchar", "character", "char", "citext", "timestamptz", "timestamp",
              "date", "time", "timetz", "jsonb", "json", "interval", "inet"}
COLUMN_STOP = re.compile(
    r"\s+(not\s+null|null|default|references|primary\s+key|unique|check|constraint|generated|collate)\b",
    re.I,
)


def strip_sql(text: str) -> str:
    text = re.sub(r"\$(\w*)\$.*?\$\1\$", "''", text, flags=re.S)  # dollar-quoted bodies
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    text = re.sub(r"--[^\n]*", " ", text)
    return text


def split_top(text: str, sep: str = ",") -> list[str]:
    parts, depth, cur, quote = [], 0, [], False
    for ch in text:
        if ch == "'":
            quote = not quote
        if not quote:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            elif ch == sep and depth == 0:
                parts.append("".join(cur).strip())
                cur = []
                continue
        cur.append(ch)
    if "".join(cur).strip():
        parts.append("".join(cur).strip())
    return parts


def table_name(raw: str) -> str:
    name = raw.strip().strip('"').lower()
    if name in TABLE_RENAMES:
        return TABLE_RENAMES[name]
    for prefix in SCHEMA_PREFIXES:
        if name.startswith(prefix):
            return name[len(prefix):]
    return name


def expected_type(pg_type: str, enums: set[str]) -> str:
    t = pg_type.strip().lower()
    if t.endswith("[]"):
        return "TEXT"  # arrays become JSON arrays
    base = re.split(r"[\s(]", t, maxsplit=1)[0]
    base = base.split(".")[-1]
    if base == "vector":
        return "DROPPED"
    if base in INT_TYPES:
        return "INTEGER"
    if base in REAL_TYPES:
        return "REAL"
    if base == "boolean" or base == "bool":
        return "INTEGER"
    if base == "bytea":
        return "BLOB"
    if base in TEXT_TYPES or base in enums:
        return "TEXT"
    raise ValueError(f"no type rule for Postgres type {pg_type!r}")


REF_RE = re.compile(r"references\s+([\w.\"]+)\s*(?:\(([^)]*)\))?(.*)$", re.I | re.S)


def on_delete(rest: str) -> str:
    m = re.search(r"on\s+delete\s+(cascade|set\s+null|set\s+default|restrict|no\s+action)", rest, re.I)
    return re.sub(r"\s+", " ", m.group(1).upper()) if m else "NO ACTION"


class PgModel:
    def __init__(self) -> None:
        self.tables: dict[str, dict] = {}
        self.enums: set[str] = set()

    def column(self, table: str, definition: str) -> None:
        m = re.match(r'"?(\w+)"?\s+(.*)$', definition.strip(), re.S)
        name, rest = m.group(1).lower(), m.group(2)
        stop = COLUMN_STOP.search(" " + rest)
        pg_type = (" " + rest)[: stop.start()].strip() if stop else rest.strip()
        low = rest.lower()
        pk = bool(re.search(r"primary\s+key", low))
        notnull = pk or bool(re.search(r"not\s+null", low))
        identity = bool(re.search(r"generated\s+(always|by\s+default)\s+as\s+identity", low))
        t = self.tables[table]
        t["cols"][name] = {"type": expected_type(pg_type, self.enums), "notnull": notnull, "identity": identity}
        if pk:
            t["pk"] = [name]
        ref = REF_RE.search(rest)
        if ref:
            self.fk(table, [name], ref.group(1), ref.group(2), ref.group(3))

    def fk(self, table: str, cols: list[str], target: str, target_cols: str | None, rest: str) -> None:
        self.tables[table]["fks"].append({
            "cols": cols,
            "target": table_name(target),
            "target_cols": [c.strip().strip('"').lower() for c in target_cols.split(",")] if target_cols else None,
            "on_delete": on_delete(rest),
        })

    def table_constraint(self, table: str, item: str) -> bool:
        low = item.lower().strip()
        if low.startswith("constraint"):
            low = re.sub(r"^constraint\s+\S+\s+", "", low)
            item = re.sub(r"^constraint\s+\S+\s+", "", item.strip(), flags=re.I)
        if low.startswith("primary key"):
            cols = re.search(r"\(([^)]*)\)", item).group(1)
            self.tables[table]["pk"] = [c.strip().lower() for c in cols.split(",")]
            for c in self.tables[table]["pk"]:
                if c in self.tables[table]["cols"]:
                    self.tables[table]["cols"][c]["notnull"] = True
            return True
        if low.startswith("foreign key"):
            m = re.match(r"foreign\s+key\s*\(([^)]*)\)\s*(references.*)$", item, re.I | re.S)
            ref = REF_RE.search(m.group(2))
            self.fk(table, [c.strip().lower() for c in m.group(1).split(",")], ref.group(1), ref.group(2), ref.group(3))
            return True
        return low.startswith(("unique", "check", "exclude"))

    def statement(self, stmt: str) -> None:
        s = stmt.strip()
        low = s.lower()
        m = re.match(r"create\s+type\s+([\w.\"]+)\s+as\s+enum", low)
        if m:
            self.enums.add(table_name(m.group(1)))
            return
        m = re.match(r"create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.\"]+)\s*\((.*)\)\s*$", s, re.I | re.S)
        if m:
            name = table_name(m.group(1))
            self.tables[name] = {"cols": {}, "pk": [], "fks": []}
            for item in split_top(m.group(2)):
                if not self.table_constraint(name, item):
                    self.column(name, item)
            return
        m = re.match(r"drop\s+table\s+(?:if\s+exists\s+)?([\w.\"]+)", low)
        if m:
            self.tables.pop(table_name(m.group(1)), None)
            return
        m = re.match(r"alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w.\"]+)\s+(.*)$", s, re.I | re.S)
        if not m:
            return
        name = table_name(m.group(1))
        if name not in self.tables:
            return
        for action in split_top(m.group(2)):
            a = action.strip()
            al = a.lower()
            if al.startswith("add column"):
                self.column(name, re.sub(r"^add\s+column\s+(if\s+not\s+exists\s+)?", "", a, flags=re.I))
            elif al.startswith("add "):
                self.table_constraint(name, re.sub(r"^add\s+", "", a, flags=re.I))
            elif al.startswith("drop column"):
                col = re.sub(r"^drop\s+column\s+(if\s+exists\s+)?", "", al).split()[0].strip('"')
                self.tables[name]["cols"].pop(col, None)
                self.tables[name]["fks"] = [f for f in self.tables[name]["fks"] if col not in f["cols"]]
            elif re.match(r"alter\s+column\s+\S+\s+drop\s+not\s+null", al):
                col = al.split()[2].strip('"')
                self.tables[name]["cols"][col]["notnull"] = False
            elif re.match(r"alter\s+column\s+\S+\s+set\s+not\s+null", al):
                col = al.split()[2].strip('"')
                self.tables[name]["cols"][col]["notnull"] = True
            elif re.match(r"rename\s+column", al):
                old, new = re.match(r"rename\s+column\s+(\S+)\s+to\s+(\S+)", al).groups()
                self.tables[name]["cols"][new.strip('"')] = self.tables[name]["cols"].pop(old.strip('"'))
            elif re.match(r"alter\s+column\s+\S+\s+(set\s+data\s+)?type", al):
                raise ValueError(f"column type change not handled: {a}")

    def resolve_fk_targets(self) -> None:
        for t in self.tables.values():
            for fk in t["fks"]:
                if fk["target_cols"] is None:
                    fk["target_cols"] = list(self.tables.get(fk["target"], {}).get("pk", ["id"]))


def load_pg() -> PgModel:
    model = PgModel()
    files = sorted(PG_MIGRATIONS.glob("*.sql"))
    if not files:
        sys.exit(f"no migrations found in {PG_MIGRATIONS}")
    for f in files:
        for stmt in split_top(strip_sql(f.read_text()), ";"):
            model.statement(stmt)
    model.resolve_fk_targets()
    return model


# ---------------------------------------------------------------------------
# D1 side
# ---------------------------------------------------------------------------
SKIP = "m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%' AND m.name <> 'd1_migrations'"
COLS_SQL = ("SELECT m.name AS tbl, p.name AS col, p.type AS type, p.\"notnull\" AS nn, p.pk AS pk "
            f"FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type = 'table' AND {SKIP} "
            "ORDER BY m.name, p.cid")
FKS_SQL = ("SELECT m.name AS tbl, f.id AS id, f.seq AS seq, f.\"from\" AS col, f.\"table\" AS target, "
           "f.\"to\" AS target_col, f.on_delete AS on_delete "
           f"FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) f WHERE m.type = 'table' AND {SKIP} "
           "ORDER BY m.name, f.id, f.seq")


def d1_query(where: str, sql: str) -> list[dict]:
    cmd = ["wrangler", "d1", "execute", DATABASE, f"--{where}", "--json", "--command", sql]
    out = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"wrangler failed:\n{out.stdout}\n{out.stderr}")
    return json.loads(out.stdout)[0]["results"]


def load_d1(where: str) -> dict:
    tables: dict[str, dict] = {}
    for r in d1_query(where, COLS_SQL):
        t = tables.setdefault(r["tbl"], {"cols": {}, "pk": [], "fks": []})
        t["cols"][r["col"]] = {"type": r["type"].upper(), "notnull": bool(r["nn"]), "pk": r["pk"]}
    for name, t in tables.items():
        t["pk"] = [c for c, v in sorted(t["cols"].items(), key=lambda kv: kv[1]["pk"]) if v["pk"]]
    grouped: dict[tuple, dict] = {}
    for r in d1_query(where, FKS_SQL):
        g = grouped.setdefault((r["tbl"], r["id"]), {"cols": [], "target": r["target"], "target_cols": [],
                                                      "on_delete": r["on_delete"].upper()})
        g["cols"].append(r["col"])
        g["target_cols"].append(r["target_col"])
    for (tbl, _), g in grouped.items():
        tables[tbl]["fks"].append(g)
    return tables


# ---------------------------------------------------------------------------
# Compare
# ---------------------------------------------------------------------------
def fk_key(fk: dict) -> tuple:
    return (tuple(fk["cols"]), fk["target"], tuple(fk["target_cols"] or ()), fk["on_delete"])


def compare(pg: PgModel, d1: dict) -> tuple[list[str], list[str]]:
    unexplained, explained = [], []

    def diff(kind: str, key, msg: str) -> None:
        reason = DOCUMENTED.get(kind, {}).get(key)
        (explained if reason else unexplained).append(f"{msg}" + (f"  [documented: {reason}]" if reason else ""))

    for t in sorted(set(pg.tables) - set(d1)):
        diff("dropped_tables", t, f"table {t}: in Postgres, missing in D1")
    for t in sorted(set(d1) - set(pg.tables)):
        diff("added_tables", t, f"table {t}: in D1, not in Postgres")
    for t in sorted(set(pg.tables) & set(d1)):
        p, d = pg.tables[t], d1[t]
        for c, spec in p["cols"].items():
            if c not in d["cols"]:
                diff("dropped_columns", (t, c), f"column {t}.{c}: in Postgres, missing in D1")
                continue
            got = d["cols"][c]
            if spec["type"] != got["type"]:
                unexplained.append(f"column {t}.{c}: expected type {spec['type']}, D1 has {got['type']}")
            # INTEGER PRIMARY KEY is the rowid alias: never NULL, but PRAGMA reports notnull=0.
            rowid_alias = got["type"] == "INTEGER" and d["pk"] == [c]
            if spec["notnull"] != got["notnull"] and not rowid_alias:
                unexplained.append(f"column {t}.{c}: expected NOT NULL={spec['notnull']}, D1 has {got['notnull']}")
        for c in d["cols"]:
            if c not in p["cols"]:
                diff("added_columns", (t, c), f"column {t}.{c}: in D1, not in Postgres")
        if p["pk"] != d["pk"]:
            unexplained.append(f"table {t}: primary key {p['pk']} in Postgres, {d['pk']} in D1")
        pg_fks = {fk_key(f) for f in p["fks"]}
        d1_fks = {fk_key(f) for f in d["fks"]}
        for f in sorted(pg_fks - d1_fks):
            diff("dropped_fks", (t, f[0]), f"foreign key {t}{list(f[0])} -> {f[1]}{list(f[2])} ON DELETE {f[3]}: missing in D1")
        for f in sorted(d1_fks - pg_fks):
            unexplained.append(f"foreign key {t}{list(f[0])} -> {f[1]}{list(f[2])} ON DELETE {f[3]}: in D1, not in Postgres")
    return unexplained, explained


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    where = ap.add_mutually_exclusive_group(required=True)
    where.add_argument("--local", action="store_true")
    where.add_argument("--remote", action="store_true")
    args = ap.parse_args()
    target = "remote" if args.remote else "local"

    pg = load_pg()
    d1 = load_d1(target)
    unexplained, explained = compare(pg, d1)
    n_cols = sum(len(t["cols"]) for t in pg.tables.values())
    n_fks = sum(len(t["fks"]) for t in pg.tables.values())
    print(f"Postgres migrations: {len(pg.tables)} tables, {n_cols} columns, {n_fks} foreign keys "
          f"({len(list(PG_MIGRATIONS.glob('*.sql')))} files)")
    print(f"D1 {DATABASE} ({target}): {len(d1)} tables")
    print(f"Documented differences: {len(explained)}")
    for line in explained:
        print(f"  - {line}")
    print(f"Unexplained differences: {len(unexplained)}")
    for line in unexplained:
        print(f"  - {line}")
    print("RESULT: PASS" if not unexplained else "RESULT: FAIL")
    return 0 if not unexplained else 1


if __name__ == "__main__":
    sys.exit(main())
