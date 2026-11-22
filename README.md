# Beer Tracker

Persönliche PWA zum Dokumentieren von Bier-Tastings und zum Tracken von Kasten-Konsum und Vorrat.
Läuft komplett offline, alle Daten liegen lokal im Browser (IndexedDB). Es gibt keinen Server und keine Accounts.

- Anforderungen: [docs/ANFORDERUNGEN.md](docs/ANFORDERUNGEN.md)
- UI-Skizze: [docs/UI-SKIZZE.md](docs/UI-SKIZZE.md)

## Starten

Es gibt keine Abhängigkeiten und keinen Build-Schritt. Node 18+ wird nur für Dev-Server und Tests gebraucht.

```bash
npm start        # http://localhost:8080
npm test         # Logik-Tests (node --test)
```

## Veröffentlichen (GitHub Pages)

Der Workflow `.github/workflows/pages.yml` führt bei jedem Push die Tests aus. Bei Pushes auf den
**Standard-Branch** veröffentlicht er die App außerdem auf GitHub Pages. Die Cache-Version des
Service Workers wird dabei automatisch auf den Commit gesetzt, sodass installierte Apps Updates bekommen
(„Neue Version verfügbar – Neu laden“).

Einmalig einrichten: im Repository unter **Settings → Pages → Build and deployment → Source** die Option
**GitHub Actions** wählen. Danach ist die App unter `https://<user>.github.io/<repo>/` erreichbar.
Auf dem Handy dann im Browser öffnen und „Zum Startbildschirm hinzufügen“ wählen.

## Hinweise (Nachkauf & MHD)

Auf dem Startbildschirm erscheinen automatisch Hinweise. Am Start-Tab zeigt ein roter Punkt an, dass es
welche gibt, und installiert auch ein App-Badge, wo das unterstützt wird.

- **fast leer:** Der Bestand einer Sorte über alle offenen Kästen liegt bei höchstens N Flaschen (Standard 3).
  Ein Tipp auf „Nachkauf“ öffnet einen neuen Kasten mit Gebinde, Preis und Händler vom letzten Kasten.
- **leer:** Der letzte Kasten einer Sorte ist seit höchstens 7 Tagen leer, und es gibt keinen neuen.
- **MHD bald / abgelaufen:** Ein offener Kasten erreicht in höchstens 14 Tagen sein MHD oder hat es schon überschritten.

Jeder Hinweis lässt sich wegklicken. Die Schwellen werden unter „Mehr → Hinweise“ eingestellt.
Einzelflaschen lösen keinen Nachkauf-Hinweis aus.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | App-Hülle mit Tab-Leiste |
| `js/model.js` | Reine Logik: Restmengen, Trink-Ereignisse, Statistik, CSV, Formatierung |
| `js/db.js` | IndexedDB-Hülle (`beers`, `crates`, `consumptions`, `tastings`, `meta`) |
| `js/ui.js` | DOM-Helfer, Sheets, Toast, Chips/Sterne, Diagramme, Foto-Feld |
| `js/app.js` | Ansichten (Start, Bestand, Verlauf, Statistik, Mehr) und Formulare |
| `sw.js` | Service Worker (App-Shell-Cache, Version wird beim Deployment gesetzt) |

## Entscheidungen

- **PWA + IndexedDB**, Notenskala **5 Sterne**.
- Mengen werden intern in **ml** gespeichert und in Flaschen bzw. Litern angezeigt.
- Ein Tasting zählt als 1 Bier. Ist es mit einem Kasten verknüpft, sinkt dessen Bestand um eine Flasche.
- Ein Kasten ist „leer“, wenn der Rest 0 ist. Das wird berechnet und nicht gespeichert.
- Alkoholfrei ist eine eigene Sorte (`alcoholFree`, ABV 0) und kann per „Variante von“ mit der
  alkoholischen Sorte verknüpft werden. In der Statistik lassen sich beide zusammenfassen.
- Backup als JSON (vollständig, Fotos als Data-URL) und CSV (alle Trink-Einträge, `;`-getrennt).
