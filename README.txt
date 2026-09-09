EVEN G2 SHEET MUSIC v0.8

Fix:
- Die Erkennung ist wieder bewusst so tolerant wie in der ersten funktionierenden Version.
- Staff-Line-Erkennung wird NICHT mehr als harter Filter verwendet.
- Dadurch werden echte Notenzeilen nicht mehr komplett verworfen.
- Staff-Line-Muster dienen nur noch dazu, erkannte Bereiche besser zu sortieren.
- Falls die automatische Erkennung gar nichts findet, erzeugt die App mehrere sinnvolle Seitenstreifen statt 0 Ergebnissen oder einem ganzen Seitenbild.

Beibehalten:
- 1 oder 2 Zeilen
- echter Quellausschnitt verschieben: links/rechts und hoch/runter
- Ausschnitthöhe und -breite verändern
- Kontrast
- Invertieren
- Speichern

Start:
npm install
npm run dev

Paket:
npm run build
npm run pack
