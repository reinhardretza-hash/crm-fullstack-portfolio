# RDEvolution CRM – technische Projektvorstellung

Dieses CRM habe ich als Full-Stack-Softwareprojekt umgesetzt. Mein Schwerpunkt lag auf Backend-Fachlogik, PostgreSQL-Datenintegrität, Authentifizierung, Tests und einem wartbaren Betrieb.

## Funktionsumfang

Unternehmen und Kontakte, Leads und Vertriebspipelines, Deals, Aufgaben und Follow-ups, interner Kalender, E-Mail-Versand, Angebote, Rechnungen, Benutzer- und Rollenverwaltung sowie Audit-/Aktivitätsfunktionen.

## Architektur

| Bereich | Technische Umsetzung |
| --- | --- |
| Benutzeroberfläche | Next.js 16, React 19, TypeScript, Tailwind CSS, Radix |
| Backend | Serverfunktionen und fachlich getrennte Module |
| Datenhaltung | PostgreSQL, Prisma 7, versionierte Migrationen |
| Authentifizierung | Auth.js Credentials/JWT, Zugriffsschutz und Rollenberechtigungen |
| Validierung | Zod |
| E-Mails und Dokumente | SMTP/Nodemailer, PDFKit |
| Qualität | Vitest, Unit-/Integrationstests, ESLint, TypeScript, Production-Build |

## Herausforderungen und Lösungen

**Datenintegrität:** Mit Datenbank-Constraints, Triggern und atomaren Updates werden fachliche Regeln abgesichert. Versionierungsmechanismen schützen vor konkurrierenden Änderungen.

**Zugriffsschutz:** Aktionen und Routen prüfen die Berechtigungen; sicherheitsrelevante Vorgänge sind auf verschiedene Rollen getestet. Konfigurationswerte werden beim Start validiert.

**E-Mail-Zuverlässigkeit:** Unklare SMTP-Ausgänge werden von eindeutigen Fehlern unterschieden, um ungewollte doppelte Sendungen zu vermeiden.

**Testisolation:** Integrationstests verlangen eine separate PostgreSQL-Testdatenbank und verweigern ungeeignete Datenbanknamen vor destruktiven Testaktionen.

**Deployment:** Das Projekt beinhaltet technische Grundlagen für einen Betrieb mit Linux, Reverse Proxy, HTTPS, Migrationsprozessen und Backups. Produktiver Betrieb erfordert eine eigene Sicherheits- und Infrastrukturprüfung.

## Code kennenlernen

Die fachliche Logik befindet sich unter `src/modules`, PostgreSQL-Schema und Migrationen unter `prisma`, automatisierte Tests unter `tests`. Lokaler Start und Prüfkommandos sind in der [README](../README.md) dokumentiert.

**Hinweis:** Die Veröffentlichungsversion wird aus einem separat geprüften Dateistand mit neuer Git-Historie erstellt. Tests und Sicherheitsprüfungen sind vor Veröffentlichung erneut auszuführen.

*Stand: November 2026.*
