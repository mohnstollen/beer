# UI-Skizze – Beer Tasting & Tracking

Festgelegt für den Start (siehe „Offen“ in den Anforderungen):

- **Plattform:** PWA (installierbar, offline, Handy zuerst, ohne Build-Schritt)
- **Speicherung:** lokal in IndexedDB, Backup per JSON-Export/-Import
- **Notenskala:** 5 Sterne

## Navigation

Untere Tab-Leiste, immer sichtbar. Formulare öffnen als Vollbild-Sheet von unten.

```
┌─────────────────────────────────────┐
│                                     │
│              (Inhalt)               │
│                                     │
├───────┬───────┬───────┬──────┬──────┤
│ Start │Bestand│Verlauf│Stats │ Mehr │
└───────┴───────┴───────┴──────┴──────┘
```

## 1. Start

Der wichtigste Bildschirm. `+1 getrunken` ist der größte Button.
Bei genau einem offenen Kasten bucht ein Tipp sofort (Undo-Leiste erscheint).
Bei mehreren öffnet sich die Kastenauswahl (2).

```
┌─────────────────────────────────────┐
│  Prost!                  So, 22.11. │
│                                     │
│  ┌───────────────────────────────┐  │
│  │                               │  │
│  │        🍺  +1 getrunken       │  │
│  │      Radeberger · 14 übrig    │  │
│  │                               │  │
│  └───────────────────────────────┘  │
│  ┌──────────────┐ ┌──────────────┐  │
│  │ ★ Neues      │ │ ▦ Neuer      │  │
│  │   Tasting    │ │   Kasten     │  │
│  └──────────────┘ └──────────────┘  │
│                                     │
│  Bestand                     alle › │
│  ┌───────────────────────────────┐  │
│  │ Radeberger        14/20  ███░ │  │
│  │ MHD 03/2027                   │  │
│  ├───────────────────────────────┤  │
│  │ Tegernseer Hell    3/20  █░░░ │  │
│  │ MHD 01/2027 · fast leer       │  │
│  └───────────────────────────────┘  │
│                                     │
│  Diese Woche: 6 Bier · 3,0 l        │
├─────────────────────────────────────┤
│ ✓ +1 Radeberger         Rückgängig  │  ← Undo-Leiste (5 s)
└─────────────────────────────────────┘
```

## 2. +1 getrunken (Sheet)

Nur bei mehreren offenen Kästen oder bei langem Druck auf `+1`.
Nachträgliche Erfassung über Menge und Zeitpunkt.

```
┌─────────────────────────────────────┐
│  ✕            Getrunken             │
│                                     │
│  Aus welchem Kasten?                │
│  ( • ) Radeberger          14 übrig │
│  (   ) Tegernseer Hell      3 übrig │
│                                     │
│  Menge       [ − ]   1   [ + ]      │
│                                     │
│  Wann?                              │
│  [ Jetzt ] [ Heute Abend ] [Gestern]│
│  [ 📅 Datum/Uhrzeit wählen ]        │
│                                     │
│  ┌───────────────────────────────┐  │
│  │           Buchen              │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## 3. Neues Tasting (Sheet) – Ziel unter 20 Sekunden

Reihenfolge = Tipp-Reihenfolge. Nur Sorte und Sterne sind nötig.

```
┌─────────────────────────────────────┐
│  ✕          Neues Tasting   Fertig  │
│                                     │
│  Sorte                              │
│  [ 🔍 Radeb…                     ]  │
│    Radeberger Pilsner               │
│    Radeberger Alkoholfrei  0,0 %    │
│    + Neue Sorte „Radeb…“            │
│                                     │
│  ☆ ☆ ☆ ☆ ☆        (groß, antippen)  │
│                                     │
│  [süffig] [hopfig] [malzig] [mild]  │
│  [bitter] [fruchtig] [spritzig]     │
│                                     │
│  Notiz (optional)                   │
│  [                               ]  │
│                                     │
│  [ 📷 Foto ]                        │
│                                     │
│  Außer Haus                  [ ○ ]  │
│   └ Ort: [ Biergarten Mü… ▾ ]       │  ← nur wenn an
│                                     │
│  ▸ Mehr: Kasten, Menge, Preis, Zeit │  ← eingeklappt
│     Zum Kasten: [Radeberger 14 ▾]   │
│     Menge: [0,33] [0,5] [Maß]       │
│     Preis: [ 4,50 € ]               │
└─────────────────────────────────────┘
```

- Wenn für die Sorte ein offener Kasten existiert, ist er vorausgewählt.
  Das Tasting zählt dann als eine Flasche aus dem Kasten.
- Außer Haus: Kasten-Feld ausgeblendet, Ort mit Vorschlägen aus bisherigen Orten.

## 4. Neuer Kasten (Sheet)

```
┌─────────────────────────────────────┐
│  ✕           Neuer Kasten  Speichern│
│                                     │
│  Sorte  [ 🔍 Sorte suchen/anlegen ] │
│                                     │
│  Gebinde                            │
│  [20×0,5 l] [24×0,33 l] [6er 0,33]  │
│  [6er 0,5] [Einzelflasche] [Fass]   │
│                                     │
│  Anzahl [ 20 ]   Inhalt [ 0,5 l ]   │
│  Preis  [ 17,99 € ]  (inkl. Pfand?) │
│  Kaufdatum [ 22.11.2026 ]           │
│  MHD       [ __.__.____ ]           │
│  Händler   [ Rewe ▾ ]               │
│                                     │
│  ☐ Gleich ein Tasting erfassen      │  ← vorausgewählt bei neuer Sorte
└─────────────────────────────────────┘
```

## 5. Sorte anlegen (Sheet, auch inline aus 3/4)

```
┌─────────────────────────────────────┐
│  ✕           Neue Sorte   Speichern │
│                                     │
│  Name      [ Radeberger Pilsner  ]  │
│  Brauerei  [ Radeberger        ▾ ]  │
│  Stil      [ Pils              ▾ ]  │
│  Alkoholfrei                 [ ○ ]  │
│  ABV       [ 4,8 ] %                │  ← ausgeblendet bei alkoholfrei
│  Variante von [ — keine —      ▾ ]  │  ← „alkoholfreie Variante von …“
│  [ 📷 Foto ]                        │
└─────────────────────────────────────┘
```

## 6. Bestand

```
┌─────────────────────────────────────┐
│  Bestand            [Offen|Leer]    │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Radeberger Pilsner            │  │
│  │ 20×0,5 l · Rewe · 17,99 €     │  │
│  │ 14 von 20 übrig   ███████░░░  │  │
│  │ gekauft 15.11. · MHD 03/2027  │  │
│  │              [ +1 ] [ ⋯ ]     │  │
│  └───────────────────────────────┘  │
│  ...                                │
│  Gesamt: 17 Flaschen · 8,1 l        │
└─────────────────────────────────────┘
```

Tipp auf Kasten → Detail: Konsum-Liste, Tasting dazu, Bearbeiten, Löschen.
Leere Kästen: Dauer (Kaufdatum bis leer), Preis pro Flasche/Liter.

## 7. Verlauf

```
┌─────────────────────────────────────┐
│  [ 🔍 Suche Sorte, Brauerei, Notiz ]│
│  [Alle|Tastings|Kasten] [★≥ ▾][Zeit▾]│
│                                     │
│  Heute                              │
│  ★★★★☆ Augustiner Hell   20:14      │
│        süffig, mild · Biergarten    │
│  🍺 ×1  Radeberger        18:02     │
│  Gestern                            │
│  🍺 ×3  Radeberger        (nachgetr.)│
│  ...                                │
└─────────────────────────────────────┘
```

Tipp → Eintrag bearbeiten/löschen.

## 8. Statistik

```
┌─────────────────────────────────────┐
│  Statistik [Woche|Monat|Jahr|Alles] │
│  Filter: [Alle|Alkoholisch|Alkfrei] │
│                                     │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐    │
│  │ 23  │ │11,5l│ │412g │ │48 € │    │
│  │Bier │ │Menge│ │Alk. │ │Ausg.│    │
│  └─────┘ └─────┘ └─────┘ └─────┘    │
│                                     │
│  Konsum pro Woche   ▁▃▅▂▇▄          │
│  Wochentage         Mo▁ Di▂ … Fr▇   │
│  Alkoholfrei        ████░░░░ 18 %   │
│  Ausgaben/Monat     ▃▅▂▆            │
│                                     │
│  Lieblingssorten                    │
│   nach Note:    1. Augustiner ★4,7  │
│   nach Menge:   1. Radeberger  54×  │
│                                     │
│  Kästen: ⌀ 12 Tage bis leer         │
│          ⌀ 0,90 €/Fl · 1,80 €/l     │
└─────────────────────────────────────┘
```

## 9. Mehr

- Sorten verwalten (Liste, Bearbeiten, Varianten)
- Export: JSON (vollständig, inkl. Fotos) und CSV (alle Trink-Einträge)
- Import: JSON-Backup wiederherstellen
- Tags bearbeiten (Standard: süffig, hopfig, malzig, mild, bitter, fruchtig, spritzig)
- Hinweis zur Speicherung („Daten liegen nur auf diesem Gerät“)

## Interaktionsregeln

- `+1` ohne Tasting geht immer; Tasting ist nie Pflicht.
- Nach jeder Buchung: Undo-Leiste für 5 Sekunden. Außerdem kann man im Verlauf löschen.
- Kasten ist automatisch „leer/abgeschlossen“, wenn Rest = 0. Das wird berechnet, nicht gespeichert.
- Tasting mit Kasten zählt als 1 Flasche aus dem Kasten. Tasting ohne Kasten zählt
  als 1 Bier mit gewählter Menge (Standard 0,5 l).
- Alle Mengen werden intern in ml gespeichert und als Flaschen bzw. Liter angezeigt.
