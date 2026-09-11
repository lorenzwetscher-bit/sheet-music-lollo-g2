Version 1.8.0 - eingefrorene Entwicklungsumgebung

Diese Version veraendert die App-Funktionen von v1.7.9 nicht.
Sie friert die direkten Abhaengigkeiten auf feste Versionen ein:
- @evenrealities/even_hub_sdk 0.0.14
- pdfjs-dist 6.3.289
- vite 7.1.3
- utif 3.1.0
- heic-to 1.5.2
- @evenrealities/evenhub-cli 0.1.14

ERSTER START AUF WINDOWS:
1. Alle alten Vite-/Simulator-CMD-Fenster schliessen.
2. RESET-UND-INSTALLIEREN.bat doppelklicken.
3. Dadurch werden alte node_modules/Lockfiles entfernt und die festgelegten Versionen installiert.
4. Danach start-simulator.bat doppelklicken.
5. package-lock.json danach behalten.

SPAETER:
- In demselben Ordner einfach start-simulator.bat verwenden.
- Falls node_modules neu aufgebaut werden muessen, INSTALLIERE-MIT-LOCK.bat verwenden.
- Nicht erneut RESET-UND-INSTALLIEREN.bat ausfuehren, wenn der funktionierende Lock bereits existiert.

Hinweis:
Die package-lock.json entsteht beim ersten npm install auf deinem PC. Danach sorgt npm ci dafuer,
dass genau diese aufgeloesten Paketversionen erneut installiert werden.
