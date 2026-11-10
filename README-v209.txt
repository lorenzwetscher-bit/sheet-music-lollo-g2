Sheet Music for Even G2 – v2.0.9

Basis: v2.0.8. Nur die vereinbarten Änderungen:
- Neue Datei übernimmt ihren eigenen Namen; neuer Import bleibt ein eigener Song.
- Mehrfachimport über PDF-Auswahl oder „Mehrere PDFs / Bilder importieren“. Dateien werden nacheinander gespeichert und beim Öffnen erkannt; anschließend einzeln anpassen.
- Song-Reihenfolge: bisherige Reihenfolge, alphabetisch oder eigene Reihenfolge. Im eigenen Modus mit Pfeilen verschieben; Reihenfolge wird dauerhaft gespeichert.
- „Nächster Song“ nur am Handy: nächster Song im aktuellen Ordner nach gewählter Reihenfolge. Am Ende deaktiviert; kein automatischer Sprung in einen anderen Ordner.
- „Öffnen“ zeigt den Song direkt auf der Brille und in der Handy-Vorschau.

Brillenlayout und bestehende Noten-/Scroll-/Ausschnittfunktionen unverändert. Bluetooth-Fußschalter nicht enthalten.

Prüfung: Build und Sicherheitscheck bestanden. Automatisierte Ablaufprüfung mit simulierter Even-Bridge und IndexedDB bestanden: Import von fünf Dateien, sechster Einzelimport, Sortierung, eigene Reihenfolge, Songwechsel, Öffnen und Wiederherstellung aus persistentem Speicher. Kein Test auf echter G2-Hardware; 500–900 reale Notendateien nicht getestet.

Installation/Build wie bisher: npm install, npm run build, npm run pack.
