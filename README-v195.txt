v1.9.5 – Menü-Reparatur / Even SDK Audit

Behoben:
- G2-Bibliothek war in v1.9.4 ungültig: Logo-Image-Container war 320 px breit, Even erlaubt maximal 288 px.
- Logo-Renderer verwies noch auf die entfernte libraryCountLabel()-Funktion. Dadurch konnte das Logo-Update fehlschlagen.
- Bibliotheks-Rebuild wartet jetzt auf laufende Bildübertragungen, damit rebuildPageContainer und updateImageRawData nicht gegeneinander laufen.
- Interne Payload-Prüfung verhindert künftig ungültige Image-Größen, falsche Container-Anzahl, falsches Event-Capture und ungültige zOrder-Werte vor dem SDK-Aufruf.
- Wetscher-Logo bleibt groß, aber innerhalb eines gültigen 288x52 Containers.
- Klick aus der Notenansicht kann dadurch wieder zuverlässig die Bibliothek aufbauen.

Even-Regeln geprüft: Image max 288x144, genau ein Event-Capture, zOrder all-or-nothing/unique, Bild-Updates seriell, Startup genau einmal.
