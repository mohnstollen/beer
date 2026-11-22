# Beer Tasting & Tracking App – Anforderungen

## Ziel

Persönliche App zum Dokumentieren von Bier-Tastings und zum Tracken von Konsum und Vorrat. Nur für den eigenen Gebrauch (kein Multi-User, kein Social).

**Leitprinzip:** Tasting einfach und schnell halten. Der Konsum von Kästen soll mit minimalem Aufwand erfasst werden.

## Die drei Erfassungsarten

| | Bestand | Tasting | Extra |
|---|---|---|---|
| **1. Kasten** | ja, mit Anzahl, sinkt beim Trinken | einmal pro Sorte (beim ersten Kasten) | Preis, MHD, Händler |
| **2. Einzelflasche daheim** | nein | immer | Preis optional |
| **3. Außer Haus** | nein | immer, wie 2 | Location |

Option 2 und 3 sind derselbe Eintragstyp. Der Unterschied ist nur das Feld **Ort** (leer = daheim, gefüllt = außer Haus).

Beispiel: Ein Kasten Radeberger (20 Flaschen) bekommt ein Tasting. Für die übrigen 19 Flaschen wird nur dokumentiert, wann sie getrunken wurden.

## Datenmodell

- **Sorte:** Name, Brauerei, Stil, ABV oder **alkoholfrei** (Schalter), Foto
- **Kasten:** Sorte, Kaufdatum, Anzahl, Gebinde, Preis, MHD, Händler
- **Konsum (Kasten):** Zeitstempel, Kasten, Menge (Standard 1)
- **Tasting-Eintrag:** Sorte, Zeitstempel, Note, Tags, Notiz, Foto, Ort (optional)

Regeln:
- Ein Tasting-Eintrag zählt automatisch als 1 getrunkenes Bier in der Statistik.
- Ein Tasting kann mit einem Kasten verknüpft werden („Tasting zum Kasten“).
- Eine Sorte kann mehrfach verkostet werden (z. B. neuer Kasten, andere Charge).
- Konsum intern in Millilitern speichern, Anzeige in Flaschen (für Statistik und Alkoholmenge).
- **Alkoholfrei:** Eine alkoholfreie Variante ist eine eigene Sorte (z. B. „Radeberger Alkoholfrei“) mit gesetztem Schalter „alkoholfrei“ (intern ABV = 0). Sie hat eigene Kästen und Tastings, damit Note und Verbrauch getrennt bleiben. Im Statistik-Filter lässt sich zwischen alkoholisch und alkoholfrei unterscheiden, und bei der Alkoholmenge zählt sie als 0.
- Bei der Sorten-Anlage optional die Verknüpfung zur Variante („alkoholfreie Variante von …“), damit beide Versionen zusammen auswertbar sind.

## Tasting (bewusst schlank)

- Gesamtnote (Sterne)
- 3–5 Tags zum Antippen, z. B. süffig, hopfig, malzig, mild, bitter, fruchtig, spritzig
- Optionale Notiz
- Optionales Foto (Etikett oder Glas)
- Zielzeit: unter 20 Sekunden
- Nicht im Umfang: Radar-Diagramm, IBU, SRM, Schaum-/Farbbewertung

## Funktionen

### Muss (MVP)
- Kasten anlegen (Sorte, Anzahl, Gebinde, Preis, MHD, Händler)
- **„+1 getrunken“** mit Auswahl des offenen Kastens, direkt vom Startbildschirm
- Nachträgliche Erfassung (z. B. „+3 gestern“) und Rückgängig für den letzten Eintrag
- Kasten gilt automatisch als abgeschlossen, wenn er leer ist
- Tasting-Formular inkl. Schalter „Außer Haus“ (blendet Ortsfeld ein)
- Verlauf aller Einträge mit Suche und Filter (Sorte, Brauerei, Note, Datum)
- Bestandsübersicht (offene Kästen, Restmenge, MHD)
- Offline-Nutzung
- Export/Backup (JSON oder CSV)

### Statistik (MVP oder kurz danach)
- Konsum pro Woche/Monat, Wochentage
- Anteil alkoholfrei vs. alkoholisch
- Ausgaben pro Monat, Preis pro Flasche und pro Liter
- Lieblingssorten nach Note und tatsächlichem Verbrauch
- Dauer pro Kasten (Kaufdatum bis leer)

### Später (optional)
- Nachkauf-Hinweis („Kasten fast leer“) und MHD-Warnung
- Ortsliste mit Auswertung („wo trinke ich was“)
- Barcode-Scan (EAN), z. B. über Open Food Facts
- Bierstile-Lexikon, Foodpairing-Tipps
- Gamification (Abzeichen, Stil-/Länder-Bingo)
- Karte/GPS für Orte

## Startbildschirm

- Großer Button **„+1 getrunken“** (bei einem offenen Kasten ein Tipp)
- Daneben/darunter: **„Neues Tasting“** und **„Neuer Kasten“**
- Kurzübersicht: aktueller Bestand

## Entscheidungen

- Gebinde als Vorlagen: Kasten 20×0,5 l, 24×0,33 l, 6er, Einzelflasche, Fass
- Einzelflaschen ohne Kasten laufen als „Kauf mit Anzahl 1“ durch denselben Ablauf
- „+1 getrunken“ ohne Tasting ist immer möglich, Tasting ist nie Pflicht
- Ort ist Freitext mit Vorschlägen aus bisherigen Orten, keine Karte oder GPS im Start
- Nur ein Nutzer, keine Accounts

## Offen

- Plattform: PWA (Offline, installierbar) oder native App
- Speicherung: lokal (IndexedDB) oder Sync über eigenen Server
- Notenskala: 5 Sterne oder 10 Punkte
