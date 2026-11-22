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

Zum Installieren auf dem Handy die Dateien auf einen beliebigen statischen HTTPS-Host legen
(z. B. GitHub Pages), im Browser öffnen und dann „Zum Startbildschirm hinzufügen“ wählen.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | App-Hülle mit Tab-Leiste |
| `js/model.js` | Reine Logik: Restmengen, Trink-Ereignisse, Statistik, CSV, Formatierung |
| `js/db.js` | IndexedDB-Hülle (`beers`, `crates`, `consumptions`, `tastings`, `meta`) |
| `js/ui.js` | DOM-Helfer, Sheets, Toast, Chips/Sterne, Diagramme, Foto-Feld |
| `js/app.js` | Ansichten (Start, Bestand, Verlauf, Statistik, Mehr) und Formulare |
| `sw.js` | Service Worker (App-Shell-Cache). Bei Änderungen `VERSION` erhöhen |

## Entscheidungen

- **PWA + IndexedDB**, Notenskala **5 Sterne**.
- Mengen werden intern in **ml** gespeichert und in Flaschen bzw. Litern angezeigt.
- Ein Tasting zählt als 1 Bier. Ist es mit einem Kasten verknüpft, sinkt dessen Bestand um eine Flasche.
- Ein Kasten ist „leer“, wenn der Rest 0 ist. Das wird berechnet und nicht gespeichert.
- Alkoholfrei ist eine eigene Sorte (`alcoholFree`, ABV 0) und kann per „Variante von“ mit der
  alkoholischen Sorte verknüpft werden. In der Statistik lassen sich beide zusammenfassen.
- Backup als JSON (vollständig, Fotos als Data-URL) und CSV (alle Trink-Einträge, `;`-getrennt).
