# Android-App – Entwurf

## Entscheidung: Capacitor-Hülle um die bestehende App

| Variante | Aufwand | Offline | Sync ohne CORS-Freigabe | Nativer Scanner | Ein Code für Web + Android |
|---|---|---|---|---|---|
| **Capacitor (gewählt)** | gering | ja, App-Dateien im APK | **ja** (native HTTP-Anfragen) | ja (ML Kit) | **ja** |
| Trusted Web Activity (Bubblewrap) | sehr gering | ja (Service Worker) | nein, gleiche CORS-Grenzen wie im Browser | nein | ja |
| Native Neuentwicklung (Kotlin/Compose) | sehr hoch | ja | ja | ja | nein, zwei Codebasen |

Capacitor packt dieselben HTML/JS/CSS-Dateien in eine Android-App (WebView) und ergänzt gezielt native
Funktionen. Alles, was im Browser funktioniert, bleibt gleich. Neue Funktionen kommen weiterhin einmal in
`js/` dazu und sind dann in der PWA und in der App verfügbar.

## Was die Android-App besser kann als die PWA

1. **Nextcloud-Sync ohne WebAppPassword:** WebDAV-Anfragen laufen nativ (OkHttp) statt über `fetch`.
   Dafür gelten keine CORS-Regeln, also reichen Server-Adresse, Benutzer und App-Passwort. Ein eigenes
   kleines Plugin (`WebDavPlugin.java`) unterstützt auch `MKCOL`, das Android-Standard-HTTP nicht kann.
2. **Nativer Barcode-Scanner:** Google Code Scanner (ML Kit). Er braucht keine Kamera-Berechtigung, erkennt schnell und auch
   bei schlechtem Licht. Ist er nicht verfügbar, wird der bisherige Web-Scanner genutzt.
3. **Export über das Teilen-Menü:** JSON/CSV-Backup lassen sich direkt an Nextcloud, Drive, Mail usw. senden.
   Downloads per `<a download>` funktionieren in Android-WebViews nicht.
4. **Zurück-Taste:** Sie schließt zuerst ein offenes Formular, dann wechselt sie zum Start, erst dann verlässt sie die App.
5. **Komplett offline ab Installation:** Alle App-Dateien und die Scanner-Bibliothek liegen im APK.
6. **Eigenes Icon, Splash-Screen, Statusleiste** in der App-Farbe.

## Architektur

```
beer/
├─ index.html, css/, js/          ← gemeinsame App (unverändert für Web)
│  └─ js/native.js                ← Brücke: erkennt Android, ruft native Plugins auf
├─ capacitor.config.json          ← App-ID, Name, Web-Verzeichnis, Plugin-Einstellungen
├─ scripts/build-web.mjs          ← kopiert die App nach www/ (für Capacitor und Pages)
└─ android/                       ← generiertes Android-Projekt (Gradle)
   └─ app/src/main/java/…/
      ├─ MainActivity.java        ← registriert das WebDAV-Plugin
      └─ WebDavPlugin.java        ← native WebDAV-Anfragen (OkHttp)
```

- **Kein Bundler nötig:** Native Plugins werden über `window.Capacitor.registerPlugin('Name')` angesprochen.
  Im Browser ist `window.Capacitor` nicht vorhanden, dann greifen automatisch die Web-Wege.
- **App-ID:** `io.github.mohnstollen.beer`
- **Daten:** IndexedDB in der WebView, wie im Browser. Die App hat einen eigenen Speicher. Daten aus der PWA übernimmst
  du per Sync oder JSON-Export/Import.
- **Service Worker:** wird in der App nicht registriert, weil die Dateien ohnehin lokal im APK liegen.

## Berechtigungen

| Berechtigung | Wofür | Wann gefragt |
|---|---|---|
| Internet | Sync, Open Food Facts, Karte | nie (Standard) |
| Standort (ungefähr/genau) | „📍 Standort“ beim Außer-Haus-Tasting | beim ersten Antippen |
| Kamera | Foto zum Tasting; Web-Scanner als Rückfall | beim ersten Foto/Scan |

Der ML-Kit-Scanner selbst braucht keine Kamera-Berechtigung.

## Bauen & Verteilen

- **GitHub Actions** (`.github/workflows/android.yml`) baut bei jedem Push eine **Debug-APK** und stellt sie als
  Artefakt bereit. Herunterladen, auf dem Handy öffnen, „Aus unbekannten Quellen installieren“ erlauben.
- **Release-APK (signiert):** Sind die Secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS` und `ANDROID_KEY_PASSWORD` gesetzt, wird zusätzlich eine signierte Release-APK gebaut.
  Updates lassen sich nur mit demselben Schlüssel über eine bestehende Installation spielen, also den Keystore gut aufbewahren.
- **Lokal:** `npm install`, `npm run android:sync`, dann `android/` in Android Studio öffnen und starten.
- Ein Play-Store-Eintrag ist möglich (App-Bundle `bundleRelease`), aber für eine persönliche App nicht nötig.

## Später denkbar

- Erinnerungen als echte Benachrichtigung (MHD, Nachkauf) über `@capacitor/local-notifications`
- Homescreen-Widget „+1 getrunken“ (nativer Android-Code)
- Sync im Hintergrund (WorkManager)
