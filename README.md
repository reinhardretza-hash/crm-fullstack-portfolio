# RDEvolution CRM

**Full-Stack-Projekt aus eigener Entwicklung** – CRM für Unternehmen, Kontakte, Leads, Vertriebspipelines, Aufgaben, Kalender, ausgehende E-Mails, Angebote, Rechnungen und Rollenverwaltung.

Dieses Repository dient als technisches Entwickler-Portfolio. Es demonstriert die Umsetzung von Geschäftslogik, Datenintegrität, Zugriffsschutz und automatisierten Tests. Die Anwendung ist keine gehostete öffentliche Demo und keine Zusage für einen produktiven Einsatz ohne eigene Einrichtung und Sicherheitsprüfung.

## Technologien

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS und Radix UI
- **Backend:** serverseitige Next.js-Funktionen und modulare Geschäftslogik
- **Datenbank:** PostgreSQL, Prisma 7, versionierte Migrationen
- **Authentifizierung:** Auth.js (Credentials/JWT), rollenbasierte Berechtigungen
- **Qualität:** Vitest, ESLint, TypeScript-Checks, Build- und Integrationstests
- **Weitere Funktionen:** PDFKit, SMTP-E-Mail-Versand, Zod-Validierung

Weitere technische Hintergründe: [Projektvorstellung](docs/PORTFOLIO.md).

## Lokal ausführen

Voraussetzungen: Node.js 24 LTS, npm, PostgreSQL und eine **separate lokale Entwicklungsdatenbank**.

1. `.env.example` zu `.env` kopieren und die erforderlichen Variablen mit eigenen sicheren Werten ausfüllen. Niemals echte Zugangsdaten committen.
2. `npm ci` und `npx prisma generate` ausführen.
3. Die Datenbank mit `npx prisma migrate deploy` vorbereiten.
4. Den ersten lokalen Benutzer mit `npm run db:seed` anlegen.
5. Mit `npm run dev` starten.

```sh
npm ci
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

### Prüfen

```sh
npm run quality
```

Integrationstests benötigen eine **eigens konfigurierte** PostgreSQL-Testdatenbank und `TEST_DATABASE_URL`. Sie löschen Testdatensätze. Niemals auf einer produktiven Datenbank laufen lassen.

```sh
npm run test:integration
```

## Sicherheit und Veröffentlichungsstand

- Echte Zugangsdaten gehören nur in lokale oder geschützte Umgebungsvariablen.
- Beispiele in `.env.example` sind Platzhalter und keine Zugangsdaten.
- Diese öffentliche Kopie soll **ohne die bisherige private Git-Historie** entstehen.
- Die Quellcode- und Drittanbieter-Lizenzfragen sind unabhängig von der technischen Bereinigung zu klären.
- Vor Veröffentlichung sind ein Secrets-Scan, eine Prüfung personenbezogener/geschäftlicher Daten, die Projekt-Tests und eine manuelle Codeprüfung erforderlich.

**Autor:** Reinhard Wesali Retza · [Portfolio](https://reinhardwesaliretza.de)

*Hinweis: Ein öffentliches GitHub-Repository bedeutet nicht automatisch, dass eine Open-Source-Lizenz erteilt wird.*
