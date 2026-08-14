// GENERIERT von extract-cases.mjs — nicht von Hand editieren.
const CASES = [
 {
  "id": "A",
  "name": "Apex-Vollausbau (Koffein-Crash, suppressed→rebound)",
  "svg": "<svg viewBox=\"0 0 400 278\" role=\"img\" aria-label=\"Kurvendiagramm: MÜDIGKEIT über ZEIT\">\n        <path d=\"M52,34 L52,244 L382,244\" fill=\"none\" stroke=\"var(--muted)\" stroke-width=\"1.5\"></path>\n        <text x=\"52\" y=\"22\" font-size=\"11\" font-weight=\"700\" letter-spacing=\"0.1em\" fill=\"var(--muted)\">MÜDIGKEIT</text>\n        <text x=\"382\" y=\"266\" font-size=\"11\" font-weight=\"700\" letter-spacing=\"0.1em\" fill=\"var(--muted)\" text-anchor=\"end\">ZEIT</text>\n        <line class=\"c-stopline\" x1=\"266.5\" y1=\"37.0\" x2=\"266.5\" y2=\"244\"></line>\n        <rect class=\"c-chip\" x=\"208.8\" y=\"14.0\" width=\"115.4\" height=\"20.0\" rx=\"4\"></rect>\n        <text class=\"svglabel c-stop\" x=\"266.5\" y=\"27.5\" font-size=\"10.5\" text-anchor=\"middle\">WIRKUNG ENDET</text>\n        \n        <polyline data-series=\"0\" points=\"52.0,134.8 57.9,131.1 63.8,127.6 69.7,124.2 75.6,121.0 81.5,117.9 87.4,114.9 93.3,112.1 99.1,109.5 105.0,106.9 110.9,104.5 116.8,102.1 122.7,99.9 128.6,97.8 134.5,95.8 140.4,93.8 146.3,92.0 152.2,90.2 158.1,88.5 164.0,86.9 169.9,85.4 175.8,83.9 181.6,82.5 187.5,81.2 193.4,79.9 199.3,78.7 205.2,77.6 211.1,76.4 217.0,75.4 222.9,74.4 228.8,73.4 234.7,72.5 240.6,71.6 246.5,70.8 252.4,70.0 258.3,69.2 264.1,68.5 270.0,67.8 275.9,67.1 281.8,66.5 287.7,65.9 293.6,65.3 299.5,64.8 305.4,64.2 311.3,63.7 317.2,63.2 323.1,62.8 329.0,62.3 334.9,61.9 340.8,61.5 346.6,61.1 352.5,60.8 358.4,60.4 364.3,60.1 370.2,59.8 376.1,59.5 382.0,51.8\" fill=\"none\" stroke=\"var(--es)\" stroke-width=\"3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"></polyline>\n        \n        <circle cx=\"382\" cy=\"51.849999999999994\" r=\"4.5\" fill=\"var(--es)\"></circle>\n        <polyline data-series=\"1\" points=\"52.0,134.8 55.8,135.6 59.7,138.0 63.5,141.7 67.3,146.6 71.2,152.4 75.0,158.9 78.8,166.1 82.6,173.6 86.5,181.3 90.3,189.0 94.1,196.5 98.0,203.6 101.8,210.1 105.6,215.9 109.5,220.6 113.3,224.2 117.1,226.5 120.9,227.2 124.8,227.2 128.6,227.2 132.4,227.2 136.3,227.2 140.1,227.2 143.9,227.2 147.8,227.2 151.6,227.2 155.4,227.2 159.3,227.2 163.1,227.2 166.9,227.2 170.7,227.2 174.6,227.2 178.4,227.2 182.2,227.2 186.1,227.2 189.9,227.2 193.7,227.2 197.6,227.2 201.4,227.2 205.2,227.2 209.0,227.2 212.9,227.2 216.7,227.2 220.5,227.2 224.4,227.2 228.2,227.2 232.0,227.2 235.9,227.2 239.7,227.2 243.5,227.2 247.3,227.2 251.2,227.2 255.0,227.2 258.8,227.2 262.7,227.2 266.5,227.2\" fill=\"none\" stroke=\"var(--ueberich)\" stroke-width=\"3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"></polyline>\n        <polyline data-series=\"1\" data-tail=\"rebound\" points=\"266.5,227.2 274.8,224.9 283.0,218.3 291.3,208.2 299.5,195.4 307.8,180.4 316.0,164.0 324.3,146.9 332.5,129.8 340.8,113.4 349.0,98.4 357.3,85.5 365.5,75.4 373.8,68.9 382.0,66.6\" fill=\"none\" stroke=\"var(--ueberich)\" stroke-width=\"3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"></polyline>\n        <circle cx=\"382\" cy=\"66.55000000000001\" r=\"4.5\" fill=\"var(--ueberich)\"></circle>\n        <text class=\"svglabel c-series\" x=\"313.6\" y=\"54.4\" font-size=\"13\" text-anchor=\"middle\" data-series-label=\"0\">Adenosin</text><text class=\"svglabel c-series\" x=\"337.6\" y=\"240.4\" font-size=\"11.5\" text-anchor=\"middle\" data-series-label=\"1\">Müdigkeitsgefühl</text>\n        <line class=\"leader\" x1=\"230.0\" y1=\"145.3\" x2=\"377.6\" y2=\"68.8\"></line><text class=\"svglabel c-note\" x=\"217.0\" y=\"155.1\" font-size=\"8.5\" text-anchor=\"middle\" data-note-series=\"1\" data-at=\"apex\" data-leader=\"1\">KOFFEIN-CRASH</text>\n      </svg>",
  "card": {
   "relation": "trend",
   "text": "Koffein blockiert deine Adenosin-Rezeptoren: Es verdeckt die Müdigkeit nur, während der <span class=\"w-es\">Adenosin-Stau</span> weiter wächst. Lässt die Wirkung nach, trifft dich der Stau auf einmal — der Koffein-Crash.",
   "xlabel": "ZEIT",
   "ylabel": "MÜDIGKEIT",
   "series": [
    {
     "label": "Adenosin",
     "color": "es",
     "shape": "saturating-rise",
     "from": "mid",
     "to": "high"
    },
    {
     "label": "Müdigkeitsgefühl",
     "color": "ueberich",
     "shape": "suppressed",
     "from": "mid",
     "to": "low",
     "afterStop": "rebound",
     "reboundTo": "high"
    }
   ],
   "stop": {
    "label": "WIRKUNG ENDET",
    "t": 0.65
   },
   "notes": [
    {
     "label": "KOFFEIN-CRASH",
     "series": 1,
     "at": "apex"
    }
   ],
   "caption": "Der Espresso um 15 Uhr gibt keine Energie — er versteckt nur die Müdigkeit.",
   "type": "curve"
  }
 },
 {
  "id": "B",
  "name": "Ecken-Matrix reb-flat-low-t0.9-high (steilster Ast)",
  "svg": "<svg viewBox=\"0 0 400 278\" role=\"img\" aria-label=\"Kurvendiagramm: NIVEAU über ZEIT\">\n        <path d=\"M52,34 L52,244 L382,244\" fill=\"none\" stroke=\"var(--muted)\" stroke-width=\"1.5\"></path>\n        <text x=\"52\" y=\"22\" font-size=\"11\" font-weight=\"700\" letter-spacing=\"0.1em\" fill=\"var(--muted)\">NIVEAU</text>\n        <text x=\"382\" y=\"266\" font-size=\"11\" font-weight=\"700\" letter-spacing=\"0.1em\" fill=\"var(--muted)\" text-anchor=\"end\">ZEIT</text>\n        <line class=\"c-stopline\" x1=\"349\" y1=\"37.0\" x2=\"349\" y2=\"244\"></line>\n        <rect class=\"c-chip\" x=\"314.2\" y=\"14.0\" width=\"69.6\" height=\"20.0\" rx=\"4\"></rect>\n        <text class=\"svglabel c-stop\" x=\"349\" y=\"27.5\" font-size=\"10.5\" text-anchor=\"middle\">EREIGNIS</text>\n        \n        <polyline data-series=\"0\" points=\"52.0,227.2 57.9,224.2 63.8,221.2 69.7,218.2 75.6,215.2 81.5,212.2 87.4,209.2 93.3,206.2 99.1,203.2 105.0,200.2 110.9,197.2 116.8,194.2 122.7,191.2 128.6,188.2 134.5,185.2 140.4,182.2 146.3,179.2 152.2,176.2 158.1,173.2 164.0,170.2 169.9,167.2 175.8,164.2 181.6,161.2 187.5,158.2 193.4,155.2 199.3,152.2 205.2,149.2 211.1,146.2 217.0,143.2 222.9,140.2 228.8,137.2 234.7,134.2 240.6,131.2 246.5,128.2 252.4,125.2 258.3,122.2 264.1,119.2 270.0,116.2 275.9,113.2 281.8,110.2 287.7,107.2 293.6,104.2 299.5,101.2 305.4,98.2 311.3,95.2 317.2,92.2 323.1,89.2 329.0,86.2 334.9,83.2 340.8,80.2 346.6,77.2 352.5,74.2 358.4,71.2 364.3,68.2 370.2,65.2 376.1,62.2 382.0,51.8\" fill=\"none\" stroke=\"var(--es)\" stroke-width=\"3\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-dasharray=\"6 6\"></polyline>\n        \n        <circle cx=\"382\" cy=\"51.849999999999994\" r=\"4.5\" fill=\"var(--es)\"></circle>\n        <polyline data-series=\"1\" points=\"52.0,227.2 57.3,227.2 62.6,227.2 67.9,227.2 73.2,227.2 78.5,227.2 83.8,227.2 89.1,227.2 94.4,227.2 99.7,227.2 105.0,227.2 110.3,227.2 115.6,227.2 120.9,227.2 126.3,227.2 131.6,227.2 136.9,227.2 142.2,227.2 147.5,227.2 152.8,227.2 158.1,227.2 163.4,227.2 168.7,227.2 174.0,227.2 179.3,227.2 184.6,227.2 189.9,227.2 195.2,227.2 200.5,227.2 205.8,227.2 211.1,227.2 216.4,227.2 221.7,227.2 227.0,227.2 232.3,227.2 237.6,227.2 242.9,227.2 248.2,227.2 253.5,227.2 258.8,227.2 264.1,227.2 269.4,227.2 274.8,227.2 280.1,227.2 285.4,227.2 290.7,227.2 296.0,227.2 301.3,227.2 306.6,227.2 311.9,227.2 317.2,227.2 322.5,227.2 327.8,227.2 333.1,227.2 338.4,227.2 343.7,227.2 349.0,227.2\" fill=\"none\" stroke=\"var(--ueberich)\" stroke-width=\"3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"></polyline>\n        <polyline data-series=\"1\" data-tail=\"rebound\" points=\"349.0,227.2 351.4,224.9 353.7,218.3 356.1,208.2 358.4,195.4 360.8,180.4 363.1,164.0 365.5,146.9 367.9,129.8 370.2,113.4 372.6,98.4 374.9,85.5 377.3,75.4 379.6,68.9 382.0,66.6\" fill=\"none\" stroke=\"var(--ueberich)\" stroke-width=\"3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"></polyline>\n        <circle cx=\"382\" cy=\"66.55000000000001\" r=\"4.5\" fill=\"var(--ueberich)\"></circle>\n        <text class=\"svglabel c-series\" x=\"265.6\" y=\"84.9\" font-size=\"13\" text-anchor=\"middle\" data-series-label=\"0\">Referenz</text><text class=\"svglabel c-series\" x=\"289.6\" y=\"215.9\" font-size=\"13\" text-anchor=\"middle\" data-series-label=\"1\">Ereignis</text>\n        <line class=\"leader\" x1=\"310.1\" y1=\"161.3\" x2=\"379.0\" y2=\"70.5\"></line><text class=\"svglabel c-note\" x=\"305.0\" y=\"171.1\" font-size=\"8.5\" text-anchor=\"middle\" data-note-series=\"1\" data-at=\"apex\" data-leader=\"1\">APEX-NOTE</text>\n      </svg>",
  "card": {
   "type": "curve",
   "text": "Ereignis-Matrix reb-flat-low-t0.9-high.",
   "xlabel": "ZEIT",
   "ylabel": "NIVEAU",
   "stop": {
    "t": 0.9,
    "label": "EREIGNIS"
   },
   "series": [
    {
     "label": "Referenz",
     "color": "es",
     "shape": "linear-rise",
     "from": "low",
     "to": "high",
     "dash": true
    },
    {
     "label": "Ereignis",
     "color": "ueberich",
     "shape": "flat",
     "from": "low",
     "afterStop": "rebound",
     "reboundTo": "high"
    }
   ],
   "notes": [
    {
     "label": "APEX-NOTE",
     "series": 1,
     "at": "apex"
    }
   ],
   "caption": "reb-flat-low-t0.9-high"
  }
 },
 {
  "id": "C",
  "name": "luna-r2 Koffein (flat→rebound, 2 Notes)",
  "svg": "<svg viewBox=\"0 0 400 278\" role=\"img\" aria-label=\"Kurvendiagramm: DRUCK über WACHZEIT\">\n        <path d=\"M52,34 L52,244 L382,244\" fill=\"none\" stroke=\"var(--muted)\" stroke-width=\"1.5\"></path>\n        <text x=\"52\" y=\"22\" font-size=\"11\" font-weight=\"700\" letter-spacing=\"0.1em\" fill=\"var(--muted)\">DRUCK</text>\n        <text x=\"382\" y=\"266\" font-size=\"11\" font-weight=\"700\" letter-spacing=\"0.1em\" fill=\"var(--muted)\" text-anchor=\"end\">WACHZEIT</text>\n        <line class=\"c-stopline\" x1=\"289.6\" y1=\"37.0\" x2=\"289.6\" y2=\"244\"></line>\n        <rect class=\"c-chip\" x=\"232.3\" y=\"14.0\" width=\"114.7\" height=\"20.0\" rx=\"4\"></rect>\n        <text class=\"svglabel c-stop\" x=\"289.6\" y=\"27.5\" font-size=\"10.5\" text-anchor=\"middle\">BLOCKADE ENDE</text>\n        \n        <polyline data-series=\"0\" points=\"52.0,227.2 57.9,219.0 63.8,211.1 69.7,203.6 75.6,196.4 81.5,189.6 87.4,183.1 93.3,176.8 99.1,170.9 105.0,165.2 110.9,159.8 116.8,154.6 122.7,149.7 128.6,145.0 134.5,140.5 140.4,136.2 146.3,132.1 152.2,128.1 158.1,124.4 164.0,120.8 169.9,117.4 175.8,114.2 181.6,111.1 187.5,108.1 193.4,105.3 199.3,102.6 205.2,100.0 211.1,97.5 217.0,95.2 222.9,92.9 228.8,90.8 234.7,88.7 240.6,86.8 246.5,84.9 252.4,83.2 258.3,81.5 264.1,79.8 270.0,78.3 275.9,76.8 281.8,75.4 287.7,74.1 293.6,72.8 299.5,71.5 305.4,70.4 311.3,69.3 317.2,68.2 323.1,67.2 329.0,66.2 334.9,65.3 340.8,64.4 346.6,63.5 352.5,62.7 358.4,62.0 364.3,61.2 370.2,60.5 376.1,59.8 382.0,51.8\" fill=\"none\" stroke=\"var(--es)\" stroke-width=\"3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"></polyline>\n        \n        <circle cx=\"382\" cy=\"51.849999999999994\" r=\"4.5\" fill=\"var(--es)\"></circle>\n        <polyline data-series=\"1\" points=\"52.0,227.2 56.2,227.2 60.5,227.2 64.7,227.2 69.0,227.2 73.2,227.2 77.5,227.2 81.7,227.2 85.9,227.2 90.2,227.2 94.4,227.2 98.7,227.2 102.9,227.2 107.2,227.2 111.4,227.2 115.6,227.2 119.9,227.2 124.1,227.2 128.4,227.2 132.6,227.2 136.9,227.2 141.1,227.2 145.3,227.2 149.6,227.2 153.8,227.2 158.1,227.2 162.3,227.2 166.6,227.2 170.8,227.2 175.0,227.2 179.3,227.2 183.5,227.2 187.8,227.2 192.0,227.2 196.3,227.2 200.5,227.2 204.7,227.2 209.0,227.2 213.2,227.2 217.5,227.2 221.7,227.2 226.0,227.2 230.2,227.2 234.4,227.2 238.7,227.2 242.9,227.2 247.2,227.2 251.4,227.2 255.7,227.2 259.9,227.2 264.1,227.2 268.4,227.2 272.6,227.2 276.9,227.2 281.1,227.2 285.4,227.2 289.6,227.2\" fill=\"none\" stroke=\"var(--ich)\" stroke-width=\"3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"></polyline>\n        <polyline data-series=\"1\" data-tail=\"rebound\" points=\"289.6,227.2 296.2,224.9 302.8,218.3 309.4,208.2 316.0,195.4 322.6,180.4 329.2,164.0 335.8,146.9 342.4,129.8 349.0,113.4 355.6,98.4 362.2,85.5 368.8,75.4 375.4,68.9 382.0,66.6\" fill=\"none\" stroke=\"var(--ich)\" stroke-width=\"3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"></polyline>\n        <circle cx=\"382\" cy=\"66.55000000000001\" r=\"4.5\" fill=\"var(--ich)\"></circle>\n        <text class=\"svglabel c-series\" x=\"241.6\" y=\"62.3\" font-size=\"13\" text-anchor=\"middle\" data-series-label=\"0\">Adenosin</text><text class=\"svglabel c-series\" x=\"209.5\" y=\"247.9\" font-size=\"13\" text-anchor=\"middle\" data-series-label=\"1\">Gefühlter Druck</text>\n        <circle class=\"c-notedot\" cx=\"233.5\" cy=\"227.2\" r=\"3\" fill=\"var(--ich)\"></circle><text class=\"svglabel c-note\" x=\"233.5\" y=\"214.6\" font-size=\"9.5\" text-anchor=\"middle\" data-note-series=\"1\">DRUCK MASKIERT</text><circle class=\"c-notedot\" cx=\"349.0\" cy=\"113.4\" r=\"3\" fill=\"var(--ich)\"></circle><line class=\"leader\" x1=\"250.8\" y1=\"161.3\" x2=\"344.5\" y2=\"115.6\"></line><text class=\"svglabel c-note\" x=\"237.0\" y=\"171.1\" font-size=\"8.5\" text-anchor=\"middle\" data-note-series=\"1\" data-leader=\"1\">KOFFEIN-CRASH</text>\n      </svg>",
  "card": {
   "relation": "trend",
   "text": "<b>Koffein</b> macht den Druck nicht kleiner: Es blockiert Adenosin-Rezeptoren, während <span class=\"w-es\">Adenosin</span> weiter steigt.",
   "xlabel": "WACHZEIT",
   "ylabel": "DRUCK",
   "series": [
    {
     "label": "Adenosin",
     "color": "es",
     "shape": "saturating-rise",
     "from": "low",
     "to": "high"
    },
    {
     "label": "Gefühlter Druck",
     "color": "ich",
     "shape": "flat",
     "from": "low",
     "to": "low",
     "afterStop": "rebound"
    }
   ],
   "stop": {
    "label": "BLOCKADE ENDE",
    "t": 0.72
   },
   "notes": [
    {
     "label": "DRUCK MASKIERT",
     "series": 1,
     "t": 0.55,
     "side": "below"
    },
    {
     "label": "KOFFEIN-CRASH",
     "series": 1,
     "t": 0.9,
     "side": "above"
    }
   ],
   "caption": "Du fühlst dich nach Kaffee wach — bis der aufgestaute Druck durchbricht.",
   "type": "curve"
  }
 }
];
