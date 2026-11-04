# Drittanbieter-Lizenzen – Prüfnotizen (04.11.2026)

Diese Datei dokumentiert einzelne Fälle, die bei einer automatisierten Lizenzinventur auffielen. Sie ersetzt weder die Lizenzen der Abhängigkeiten noch eine rechtliche Prüfung.

## `png-js` 2.0.0

In der `package-lock.json` der CRM-Kopie fehlt bei `node_modules/png-js` das Feld `license`. Das ist **nicht automatisch** eine fehlende Nutzungserlaubnis. Das upstream-Projekt ist `foliojs/png.js` (historische URL `devongovett/png.js`). In dessen `package.json` für Version 2.0.0 steht `license: "MIT"`; die upstream-Quelldatei `LICENSE` enthält die MIT-Lizenz mit Copyright-Hinweis für Devon Govett.

- Upstream-Lizenz: https://github.com/foliojs/png.js/blob/master/LICENSE
- Upstream-Paket: https://github.com/foliojs/png.js/blob/master/package.json
- Vor einer Veröffentlichung des **installierten** `node_modules`-Inhalts wären die tatsächlichen Lizenzdateien im jeweiligen npm-Paket nochmals zu prüfen. Der geplante Portfolio-Code enthält kein `node_modules`.

## `@img/sharp-libvips-*` und Sharp-Binärpakete

Die Lockdatei enthält Varianten mit `LGPL-3.0-or-later` oder Mehrfachlizenz-Angaben. Diese Abhängigkeiten sind besonders für eine Weitergabe von *Binärpaketen* relevant. Die geplante Veröffentlichung besteht aus dem eigenen Quellcode und dem Paket-Lockfile, nicht aus den Binärartefakten. Eventuelle Lizenzpflichten beim Bauen, Verteilen oder Hosten sind gesondert zu beachten.

## Schriften und Medien

Die Lockdatei enthält mindestens einen OFL-1.1-lizenzierten Schriftbestandteil. Bei einer Weitergabe von Fonts ist der jeweilige Lizenztext zu erhalten und der Name/Modifikationsstatus zu prüfen. Die zuvor vorhandenen SVG-Dateien und das Favicon wurden für den Veröffentlichungskandidaten entfernt, da ihre Herkunft nicht abschließend geklärt war.

## Weitere Schritte

- [x] Laufzeit-/Entwicklungsabhängigkeiten anhand der Lockdatei inventarisiert (862 Paket-Einträge, einschließlich transitive Plattformvarianten).
- [x] Fehlendes Lizenz-Metadatenfeld bei `png-js` durch Quell-Projekt-MIT-Lizenz geklärt (Bibliotheksquelle geprüft, installierter Tarball nicht unabhängig inspiziert).
- [ ] Lizenz- und Copyright-Hinweise bei späterer Distribution von Binärpaketen oder `node_modules` klären.
- [x] Ungeklärte Bilddateien aus dem Kandidaten entfernt; keine Schriftdateien im Repository enthalten.
- [ ] Paketabhängigkeiten auf konkrete Sicherheitswarnungen bewerten; verbleibende mittlere Warnungen sind keine automatisch erledigten Findings.
- [ ] Eine bewusste Entscheidung zur Lizenzierung des **eigenen** CRM-Quellcodes treffen.

Das bloße Sichtbarmachen des Codes auf GitHub bedeutet nicht automatisch die Freigabe unter einer Open-Source-Lizenz.
