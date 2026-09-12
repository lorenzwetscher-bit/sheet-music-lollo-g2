export const isEnglish = /^en(?:-|$)/i.test(navigator.language || '')
export const lang = isEnglish ? 'en' : 'de'
export const tr = (de,en) => isEnglish ? en : de

const exact = new Map([
['Sheet Music for Even G2','Sheet Music for Even G2'],
['Noten automatisch erkennen, 1–8 Zeilen als einen durchgehenden Ausschnitt auf der G2 anzeigen und schnell durch die Ansichten wechseln.','Automatically detect sheet-music staves, show 1–8 lines as one continuous view on G2, and move quickly through your score.'],
['📷 Foto','📷 Photo'],['🖼️ Galerie','🖼️ Gallery'],['📄 PDF','📄 PDF'],
['Notenzeilen erkennen','Detect music lines'],['Sichtbare Notenzeilen','Visible music lines'],['Kontrast','Contrast'],
['Hintergrund ausblenden','Remove background'],['Invertieren','Invert'],['Ordner beim Speichern','Folder when saving'],
['Kein Ordner','No folder'],['Scrollen','Scrolling'],['Ein','On'],['Nach Zeit','Timed'],['Fingerscrollen an der Brille','Finger scroll on glasses'],
['Zeit bis Notenende','Time to end of score'],['Minuten','Minutes'],['Sekunden','Seconds'],['▶ Auto-Scroll bis Notenende','▶ Auto-scroll to end'],
['💾 Speichern','💾 Save'],['Auf G2 anzeigen','Show on G2'],['Noch keine Datei ausgewählt.','No file selected yet.'],
['Ansicht','View'],['Links / rechts:','Left / right:'],['Hoch / runter:','Up / down:'],['Höhe:','Height:'],['Breite:','Width:'],
['Diese Ausschnitt-Einstellung für alle Seiten übernehmen','Apply these crop settings to all pages'],
['Aus = jede Ansicht kann weiterhin unterschiedlich eingestellt werden.','Off = each view can still have different settings.'],
['Ausschnitt zurücksetzen','Reset crop'],['G2 aktualisieren','Refresh G2'],['← Zurück','← Back'],['Weiter →','Next →'],
['Gespeicherte Noten','Saved sheet music'],['Neuen Ordner erstellen','Create new folder'],['Ordner erstellen','Create folder'],['Noch nichts gespeichert.','Nothing saved yet.'],['Name der Noten','Score name'],['Dauer bis Notenende: 3:00','Time to end of score: 3:00']
])
export function translateStaticUI(root=document){
  if(!isEnglish)return
  const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT)
  const nodes=[];while(walk.nextNode())nodes.push(walk.currentNode)
  for(const n of nodes){const raw=n.nodeValue,trim=raw.trim(),v=exact.get(trim);if(v)n.nodeValue=raw.replace(trim,v)}
  const placeholders={scoreName:'Score name',folderName:'Create new folder'}
  for(const [id,p] of Object.entries(placeholders)){const el=document.getElementById(id);if(el)el.placeholder=p}
}
