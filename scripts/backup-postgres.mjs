import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Secrets are inherited from the protected environment, never command arguments.
const root = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
function fail(message) {
  throw new Error(message);
}
function connection(value) {
  if (!value) fail("DATABASE_URL bzw. RESTORE_DATABASE_URL fehlt.");
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("Ungültige PostgreSQL-Konfiguration.");
  }
  if (!/^postgres(ql)?:$/.test(url.protocol) || !url.pathname.slice(1))
    fail("PostgreSQL-Datenbank erforderlich.");
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,62}$/.test(database))
    fail("Datenbankname für Backup/Restore muss ein einfacher Bezeichner sein.");
  return {
    database,
    env: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: database,
      PGCONNECT_TIMEOUT: "10",
      PGSSLMODE: url.searchParams.get("sslmode") || "prefer",
    },
  };
}
function run(tool, args, env) {
  const executable = process.env.PG_BIN
    ? path.join(process.env.PG_BIN, tool + (process.platform === "win32" ? ".exe" : ""))
    : tool;
  const result = spawnSync(executable, args, {
    env,
    windowsHide: true,
    encoding: "utf8",
    timeout: 300_000,
  });
  // Do not echo raw PostgreSQL errors (can contain connection or customer data).
  if (result.error || result.status !== 0)
    fail(`${tool} fehlgeschlagen. Installation, Rechte und Verbindung prüfen.`);
}
function protect(target) {
  if (process.platform === "win32") {
    const identity = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
    const grant = statSync(target).isDirectory() ? `${identity}:(OI)(CI)F` : `${identity}:F`;
    const result = spawnSync("icacls", [target, "/inheritance:r", "/grant:r", grant], {
      windowsHide: true,
      encoding: "utf8",
    });
    if (result.status !== 0) fail("Zugriffsschutz des Backups fehlgeschlagen.");
  } else chmodSync(target, statSync(target).isDirectory() ? 0o700 : 0o600);
}
try {
  process.umask(0o077);
  const source = connection(process.env.DATABASE_URL);
  const mode = process.argv[2];
  if (mode === "backup") {
    if (!process.env.BACKUP_DIR || !path.isAbsolute(process.env.BACKUP_DIR))
      fail("BACKUP_DIR muss ein absoluter Pfad außerhalb des Repositories sein.");
    mkdirSync(process.env.BACKUP_DIR, { recursive: true, mode: 0o700 });
    const directory = realpathSync(process.env.BACKUP_DIR);
    const relative = path.relative(root, directory);
    if (
      !relative ||
      (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))
    )
      fail("Backups im Repository sind nicht erlaubt.");
    protect(directory);
    const days = Number(process.env.BACKUP_RETENTION_DAYS || "14");
    if (!Number.isInteger(days) || days < 1 || days > 3650)
      fail("BACKUP_RETENTION_DAYS muss zwischen 1 und 3650 liegen.");
    const prefix = `crm-${source.database.replace(/[^a-zA-Z0-9_-]/g, "_")}-`;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(directory, `${prefix}${stamp}.dump`);
    const temporary = file + ".partial";
    try {
      run("pg_dump", ["--format=custom", "--no-password", "--file", temporary], source.env);
      protect(temporary);
      renameSync(temporary, file);
      run("pg_restore", ["--list", file], source.env);
    } catch (error) {
      if (existsSync(temporary)) unlinkSync(temporary);
      throw error;
    }
    // Rotate only this database's completed archives after a successful backup.
    for (const name of readdirSync(directory)) {
      if (!name.startsWith(prefix) || !name.endsWith(".dump")) continue;
      // An ambiguous database prefix (crm-a- vs crm-a-other-) must never
      // rotate another database's archive. Accept only our timestamp suffix.
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.dump$/.test(name.slice(prefix.length)))
        continue;
      const candidate = path.join(directory, name);
      if (
        candidate !== file &&
        statSync(candidate).isFile() &&
        statSync(candidate).mtimeMs < Date.now() - days * 86400_000
      )
        unlinkSync(candidate);
    }
    console.log("Backup erfolgreich; Archiv geprüft und Rotation ausgeführt.");
  } else if (mode === "restore") {
    const target = connection(process.env.RESTORE_DATABASE_URL);
    if (target.database === source.database || process.env.RESTORE_CONFIRM !== target.database)
      fail("Separate leere Restore-Datenbank und RESTORE_CONFIRM mit ihrem Namen erforderlich.");
    const file = process.argv[3];
    if (!file || !path.isAbsolute(file) || !statSync(file).isFile())
      fail("Absoluter Pfad zu einem vertrauenswürdigen Backup erforderlich.");
    run(
      "pg_restore",
      [
        "--no-password",
        "--exit-on-error",
        "--single-transaction",
        "--no-owner",
        "--no-privileges",
        "--dbname",
        target.database,
        file,
      ],
      target.env,
    );
    console.log(
      "Restore in separate Datenbank erfolgreich. Datensatz- und Migration-Prüfung noch erforderlich.",
    );
  } else fail("Aufruf: node scripts/backup-postgres.mjs backup | restore ABSOLUTER_ARCHIVPFAD");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Backup/Restore fehlgeschlagen.");
  process.exitCode = 1;
}
