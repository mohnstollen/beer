# Beer Tracker

Persönliche PWA zum Dokumentieren von Bier-Tastings und zum Tracken von Kasten-Konsum und Vorrat.
Läuft komplett offline, alle Daten liegen lokal im Browser (IndexedDB). Optional können mehrere Geräte über die
eigene Nextcloud synchronisiert werden (siehe unten).

- Anforderungen: [docs/ANFORDERUNGEN.md](docs/ANFORDERUNGEN.md)
- UI-Skizze: [docs/UI-SKIZZE.md](docs/UI-SKIZZE.md)

## Starten

Die Web-App selbst braucht keine Abhängigkeiten und keinen Build-Schritt. Node 18+ wird nur für Dev-Server und Tests gebraucht,
`npm install` nur für die Android-App.

```bash
npm start        # http://localhost:8080
npm test         # Logik-Tests (node --test)
```

## Android-App

Die Android-App ist dieselbe App, verpackt mit [Capacitor](https://capacitorjs.com), plus einige native Funktionen.
Entwurf und Begründung stehen in [docs/ANDROID.md](docs/ANDROID.md).

- **Installieren:** auf dem Handy
  [beer-tracker.apk](https://github.com/mohnstollen/beer/releases/download/android-latest/beer-tracker.apk) laden,
  öffnen und „Installation aus dieser Quelle zulassen“ bestätigen. Für Updates die neue APK einfach darüber installieren,
  die Daten bleiben erhalten.
- **Vorteile gegenüber der PWA:**
  - Nextcloud-Sync ohne WebAppPassword, weil die Anfragen nativ laufen und dadurch kein CORS gilt
  - nativer Google-Barcode-Scanner
  - Export über das Teilen-Menü
  - Zurück-Taste
  - alles offline im APK
- **Daten** liegen in der App getrennt von der PWA. Übernahme per Sync oder JSON-Export/-Import.
- **Bauen:** Der Workflow `.github/workflows/android.yml` baut bei jedem Push. Auf dem Standard-Branch aktualisiert er das
  Release `android-latest`. Lokal geht es mit `npm install`, `node scripts/build-web.mjs`, `npx cap sync android` und dann
  `android/` in Android Studio öffnen.
- **Signatur:** Standardmäßig wird mit dem festen Debug-Schlüssel `android/debug.keystore` signiert (Standard-Passwort,
  nur für die private Nutzung gedacht). Für einen geheimen Release-Schlüssel die Secrets `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` und `ANDROID_KEY_PASSWORD` anlegen. Achtung: Beim Wechsel des
  Schlüssels muss die App einmal neu installiert werden. Vorher synchronisieren oder exportieren.

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

## Weitere Funktionen

- **Sorten bearbeiten:** in der Sortenauswahl auf „bearbeiten“ tippen oder unter **Mehr → Sorten**.
  Fehlt der Alkoholgehalt, steht dort ein Hinweis, denn ohne ihn zählt die Sorte nicht zur Alkoholmenge.
- **Barcode-Scan:** Der Knopf „▥ Scan“ in der Sortenauswahl öffnet die Kamera. Ist der Barcode schon bekannt,
  wird die Sorte direkt gewählt. Sonst werden Name, Brauerei und Alkoholgehalt aus
  [Open Food Facts](https://world.openfoodfacts.org) vorgeschlagen. Die Erkennung nutzt die native
  BarcodeDetector-API (Chrome/Android) oder ZXing (iOS/Safari, wird bei Bedarf geladen).
  Die Nummer kann auch eingetippt werden.
- **Orte:** Beim Tasting „Außer Haus“ speichert „📍 Standort“ die Koordinaten. Ist ein bekannter Ort
  in der Nähe (unter 250 m), wird sein Name vorgeschlagen. Unter Mehr → Orte gibt es die Auswertung pro Ort und eine
  Karte (OpenStreetMap über Leaflet). Die Statistik zeigt „Wo trinke ich was?“.
- **Bierstil-Lexikon:** 24 Stile mit Beschreibung, Alkoholgehalt, Glas, Temperatur und Foodpairing,
  durchsuchbar auch nach Speisen. Das Feld „Stil“ einer Sorte wird automatisch zugeordnet
  („Hefeweizen“ → Weißbier).
- **Erfolge & Bingo:** 17 Abzeichen mit Fortschritt, dazu ein Stil-Bingo und ein Länder-Bingo (je 4×4 mit Linien-Zählung).
  Das Land wird bei der Sorte eingetragen.

Kamera-Scan, Open Food Facts und Kartenkacheln brauchen Netz. Alles andere läuft offline.
Scanner- und Karten-Bibliothek werden nach dem ersten Laden zwischengespeichert.

## Synchronisation (Nextcloud / WebDAV)

Unter **Mehr → Synchronisation** verbindest du jedes Gerät mit denselben Nextcloud-Zugangsdaten.
In der Nextcloud liegen dann im Ordner `BeerTracker/` die Datei `beer-sync.json` (alle Daten) und der Ordner `fotos/`.

- Synchronisiert wird automatisch, wenige Sekunden nach jeder Änderung, beim Öffnen der App und wenn das Netz
  zurückkommt. Zusätzlich gibt es den Knopf „Jetzt synchronisieren“.
- Zusammenführung pro Eintrag: Die neueste Änderung gewinnt. Löschungen werden übertragen (Löschmarken werden 400 Tage aufbewahrt).
  Daten, die auf zwei Geräten getrennt erfasst wurden, werden vereinigt und nicht überschrieben.
- Fotos werden einzeln und nur einmal hochgeladen.
- Offline erfasste Einträge werden beim nächsten Sync übertragen.
- Zugangsdaten liegen nur lokal im Browser und sind nicht im JSON-Export enthalten. Verwende dafür ein eigenes,
  jederzeit widerrufbares **App-Passwort** (Nextcloud → Persönliche Einstellungen → Sicherheit).

**Einmalige Einrichtung in Nextcloud (Admin):** Browser erlauben einer Web-App den Zugriff auf einen fremden
Server nur, wenn dieser das per CORS freigibt. Nextcloud tut das von Haus aus nicht. Die App
[WebAppPassword](https://apps.nextcloud.com/apps/webapppassword) ergänzt diese Freigabe:

1. In Nextcloud die App **WebAppPassword** installieren.
2. In deren Einstellungen bei den erlaubten Origins für WebDAV `https://mohnstollen.github.io` eintragen.
   Alternativ geht das in der `config.php`: `'webapppassword.origins' => ['https://mohnstollen.github.io'],`
3. Ein App-Passwort erzeugen und es in der App zusammen mit Server-Adresse und Benutzername eintragen.

Auch andere WebDAV-Server funktionieren, wenn sie CORS für diese Adresse erlauben. Dann im Feld „Server“ die vollständige
WebDAV-Ordner-URL angeben. Zum lokalen Testen gibt es einen Mock-Server:
`node scripts/webdav-mock.mjs 8090 max geheim http://localhost:8080`.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | App-Hülle mit Tab-Leiste |
| `js/model.js` | Reine Logik: Restmengen, Trink-Ereignisse, Statistik, CSV, Formatierung |
| `js/db.js` | IndexedDB-Hülle (`beers`, `crates`, `consumptions`, `tastings`, `meta`) |
| `js/styles.js` | Bierstil-Lexikon (Daten) und Zuordnung freier Stil-Eingaben |
| `js/extras.js` | Barcode-Scan, Open Food Facts, Standort, Karte |
| `js/sync-core.js` | Sync-Zusammenführung (rein, getestet) |
| `js/sync.js` | WebDAV-Client |
| `js/native.js` | Brücke zur Android-App (Capacitor-Plugins) |
| `capacitor.config.json`, `android/` | Android-Projekt; `WebDavPlugin.java` für natives WebDAV |
| `scripts/build-web.mjs` | stellt `www/` für Pages und Android zusammen |
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
