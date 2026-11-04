-- Fachliche Invariante zusätzlich auf Datenbankebene absichern: eine Notiz
-- gehört zu GENAU einem unterstützten Ziel (Company XOR Contact), nie zu
-- beiden, nie zu keinem. Die Zod-Validierung (src/validations/note.ts)
-- verhindert dies bereits auf Anwendungsebene, aber direkter DB-Zugriff
-- (Skripte, zukünftige Migrationen, ein Bug in einer anderen Codepfad-
-- Änderung) könnte das umgehen. Prisma unterstützt CHECK-Constraints nicht
-- deklarativ im Schema, daher hier bewusst als reines SQL in der Migration.
--
-- NICHT auf `activities` angewendet: Activity wird nach Einführung von
-- Leads/Deals voraussichtlich weitere Zieltypen (deal_id, lead_id) erhalten,
-- eine starre Zwei-Wege-XOR-Regel wäre dann falsch und müsste ohnehin wieder
-- geändert werden. Bis dahin gilt die Invariante dort nur durch die
-- Aufrufer-Disziplin in src/modules/activity/log.ts, nicht per Constraint.
ALTER TABLE "notes"
  ADD CONSTRAINT "notes_exactly_one_target_check"
  CHECK ((company_id IS NOT NULL) <> (contact_id IS NOT NULL));
