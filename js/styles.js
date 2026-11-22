// Bierstil-Lexikon mit Foodpairing. Reine Daten + Zuordnung freier Stil-Eingaben.

export const STYLE_LEXICON = [
  {
    id: 'pils', name: 'Pils', aliases: ['pilsner', 'pilsener', 'premium pils', 'german pils'],
    group: 'Untergärig', abv: '4,5–5,2 %', color: 'hellgelb bis strohgelb', bitter: 'deutlich herb',
    description: 'Klares, schlankes Lagerbier mit ausgeprägter Hopfenbittere und trockenem Abgang. Der meistgetrunkene Bierstil in Deutschland, ursprünglich aus Pilsen (Böhmen).',
    aroma: 'grasig-blumiger Hopfen, leicht brotig',
    glass: 'Pilstulpe', temp: '6–8 °C',
    food: ['Fisch und Meeresfrüchte', 'Salate mit Vinaigrette', 'Brathähnchen', 'milder Käse', 'Sushi'],
  },
  {
    id: 'helles', name: 'Helles', aliases: ['hell', 'lagerbier hell', 'münchner hell', 'munich helles'],
    group: 'Untergärig', abv: '4,7–5,4 %', color: 'hellgelb bis golden', bitter: 'mild',
    description: 'Bayerisches Lagerbier mit weichem Malzkörper und zurückhaltender Hopfung. Süffig und rund – das typische Biergartenbier.',
    aroma: 'getreidig, leicht süßlich, dezenter Hopfen',
    glass: 'Maßkrug oder Willibecher', temp: '6–8 °C',
    food: ['Weißwurst und Brezn', 'Obatzda', 'Brotzeit', 'Hendl', 'Spargel'],
  },
  {
    id: 'export', name: 'Export', aliases: ['dortmunder', 'dortmunder export', 'export hell'],
    group: 'Untergärig', abv: '5,0–5,6 %', color: 'golden', bitter: 'mittel',
    description: 'Kräftiger als Helles, weniger herb als Pils. Ursprünglich stärker eingebraut, um den Transport („Export“) zu überstehen.',
    aroma: 'ausgewogen malzig mit leichter Hopfennote',
    glass: 'Willibecher', temp: '7–9 °C',
    food: ['Bratwurst', 'Schnitzel', 'Currywurst', 'Pizza'],
  },
  {
    id: 'maerzen', name: 'Märzen', aliases: ['maerzen', 'marzen', 'festbier', 'wiesn', 'oktoberfestbier', 'wiener', 'vienna lager'],
    group: 'Untergärig', abv: '5,5–6,3 %', color: 'golden bis bernstein', bitter: 'mild bis mittel',
    description: 'Vollmundiges, malzbetontes Lagerbier, traditionell im März eingebraut und über den Sommer gelagert. Festbiere sind meist hellere Varianten.',
    aroma: 'Brotkruste, Karamell, Toast',
    glass: 'Maßkrug', temp: '7–9 °C',
    food: ['Schweinebraten', 'Haxe', 'Hendl', 'Kürbisgerichte', 'Laugengebäck'],
  },
  {
    id: 'keller', name: 'Kellerbier', aliases: ['keller', 'zwickel', 'zwickelbier', 'ungespundet', 'landbier'],
    group: 'Untergärig', abv: '4,8–5,5 %', color: 'golden, naturtrüb', bitter: 'mild bis mittel',
    description: 'Unfiltriertes Lagerbier, direkt „aus dem Keller“. Hefe und Trübstoffe sorgen für einen vollen, weichen Geschmack.',
    aroma: 'frisch, hefig, brotig',
    glass: 'Steinkrug oder Seidla', temp: '7–9 °C',
    food: ['fränkische Brotzeit', 'Bratwürste', 'Schäufele', 'Bauernbrot mit Griebenschmalz'],
  },
  {
    id: 'weissbier', name: 'Weißbier', aliases: ['weissbier', 'weizen', 'hefeweizen', 'hefeweißbier', 'hefeweissbier', 'weizenbier', 'kristallweizen', 'weisse'],
    group: 'Obergärig', abv: '5,0–5,6 %', color: 'hell bis bernstein, trüb', bitter: 'kaum',
    description: 'Mindestens 50 % Weizenmalz und eine spezielle Hefe, die Bananen- und Nelkenaromen bildet. Spritzig durch hohe Kohlensäure.',
    aroma: 'Banane, Nelke, Brot',
    glass: 'Weizenglas', temp: '8–10 °C',
    food: ['Weißwurst', 'Leberkäse', 'Fischgerichte', 'Salate', 'Desserts mit Banane'],
  },
  {
    id: 'dunkles', name: 'Dunkles', aliases: ['dunkel', 'münchner dunkel', 'munich dunkel', 'dunkles lager', 'dunkelbier'],
    group: 'Untergärig', abv: '4,8–5,6 %', color: 'kupfer bis dunkelbraun', bitter: 'mild',
    description: 'Malzbetontes dunkles Lagerbier mit Röstaromen, aber ohne die Schärfe eines Schwarzbiers.',
    aroma: 'Brotrinde, Nuss, leichte Schokolade',
    glass: 'Steinkrug oder Willibecher', temp: '8–10 °C',
    food: ['Schweinebraten mit Kruste', 'Knödel', 'Wildgerichte', 'Gulasch'],
  },
  {
    id: 'schwarzbier', name: 'Schwarzbier', aliases: ['schwarz', 'black lager'],
    group: 'Untergärig', abv: '4,4–5,4 %', color: 'tiefschwarz', bitter: 'mittel',
    description: 'Fast schwarzes, aber überraschend schlankes Lagerbier mit Röstmalz. Traditionell aus Thüringen und Sachsen.',
    aroma: 'Kaffee, Bitterschokolade, Röstbrot',
    glass: 'Pilstulpe oder Becher', temp: '8–10 °C',
    food: ['Thüringer Bratwurst', 'Grillfleisch', 'Räucherfisch', 'Schokoladendesserts'],
  },
  {
    id: 'bock', name: 'Bock', aliases: ['bockbier', 'maibock', 'heller bock', 'dunkler bock', 'weizenbock', 'eisbock'],
    group: 'Untergärig (meist)', abv: '6,3–7,5 %', color: 'golden bis dunkelbraun', bitter: 'mild',
    description: 'Starkbier mit mindestens 16 % Stammwürze. Kräftiger Malzkörper, wärmend. Maibock ist die helle Frühjahrsvariante.',
    aroma: 'Karamell, Honig, Trockenfrüchte',
    glass: 'Bockbierglas oder Pokal', temp: '8–12 °C',
    food: ['Wild', 'Ente', 'kräftiger Käse', 'Apfelstrudel'],
  },
  {
    id: 'doppelbock', name: 'Doppelbock', aliases: ['doppel-bock', 'salvator', 'starkbier'],
    group: 'Untergärig', abv: '7,0–10 %', color: 'bernstein bis dunkelbraun', bitter: 'mild',
    description: 'Noch stärker als Bock (mindestens 18 % Stammwürze). Klassisches „flüssiges Brot“ der Fastenzeit, Namen enden oft auf „-ator“.',
    aroma: 'Rosine, Pflaume, dunkles Brot, Karamell',
    glass: 'Pokal', temp: '10–13 °C',
    food: ['Schmorbraten', 'Blauschimmelkäse', 'Lebkuchen', 'Schokoladenkuchen'],
  },
  {
    id: 'koelsch', name: 'Kölsch', aliases: ['koelsch', 'kolsch'],
    group: 'Obergärig', abv: '4,8 %', color: 'hellgelb, blank', bitter: 'leicht herb',
    description: 'Obergäriges, kalt gelagertes helles Bier aus Köln (geschützte Herkunft). Leicht, fein-fruchtig und sehr süffig.',
    aroma: 'dezent fruchtig, leichter Hopfen',
    glass: 'Stange (0,2 l)', temp: '7–9 °C',
    food: ['Halve Hahn', 'Himmel un Ääd', 'Reibekuchen', 'Mett'],
  },
  {
    id: 'alt', name: 'Altbier', aliases: ['alt', 'düsseldorfer alt'],
    group: 'Obergärig', abv: '4,5–5,0 %', color: 'kupfer bis dunkelbraun', bitter: 'deutlich herb',
    description: 'Obergäriges Bier vom Niederrhein, „alt“ im Sinne der alten Brauweise. Malzig mit kräftiger Hopfenbittere.',
    aroma: 'Karamell, Nuss, würziger Hopfen',
    glass: 'Becher (0,25 l)', temp: '8–10 °C',
    food: ['Sauerbraten', 'Röggelchen mit Käse', 'Eisbein', 'Senfgerichte'],
  },
  {
    id: 'rauchbier', name: 'Rauchbier', aliases: ['rauch', 'rauchmärzen', 'smoked beer'],
    group: 'Untergärig', abv: '4,8–6,0 %', color: 'kupfer bis dunkelbraun', bitter: 'mittel',
    description: 'Mit über Buchenholz gedarrtem Malz gebraut – die Bamberger Spezialität schmeckt intensiv nach Rauch und Schinken.',
    aroma: 'Rauch, Speck, Holz',
    glass: 'Seidla oder Krug', temp: '8–10 °C',
    food: ['Schäufele', 'Räucherwaren', 'Grillgerichte', 'Bamberger Zwiebel'],
  },
  {
    id: 'sour', name: 'Sauerbier', aliases: ['sour', 'berliner weisse', 'berliner weiße', 'gose', 'lambic', 'gueuze', 'kriek', 'wild ale'],
    group: 'Spontan-/Mischgärung', abv: '3–7 %', color: 'hell bis rötlich', bitter: 'kaum',
    description: 'Durch Milchsäurebakterien oder wilde Hefen säuerlich. Berliner Weisse und Gose (mit Salz und Koriander) sind leicht, belgische Lambics komplex.',
    aroma: 'Zitrus, Joghurt, Frucht, teils „Stall“',
    glass: 'Schale oder Tulpe', temp: '6–8 °C',
    food: ['Ziegenkäse', 'Austern', 'Salate', 'Beerendesserts'],
  },
  {
    id: 'radler', name: 'Radler', aliases: ['alster', 'alsterwasser', 'biermischgetränk', 'shandy', 'russ'],
    group: 'Biermischgetränk', abv: '2–2,8 %', color: 'hell', bitter: 'kaum',
    description: 'Bier gemischt mit Zitronenlimonade, meist halb und halb. Mit Weißbier heißt es „Russ“.',
    aroma: 'Zitrone, süßlich',
    glass: 'Maßkrug oder Becher', temp: '5–7 °C',
    food: ['leichte Sommergerichte', 'Grillgemüse', 'Obstkuchen'],
  },
  {
    id: 'ipa', name: 'IPA', aliases: ['india pale ale', 'neipa', 'hazy ipa', 'double ipa', 'dipa', 'west coast ipa', 'session ipa'],
    group: 'Obergärig', abv: '5,5–7,5 %', color: 'golden bis bernstein', bitter: 'stark',
    description: 'India Pale Ale: stark gehopft, oft mit amerikanischen Aromahopfen. Hazy/NEIPA sind trüb, fruchtig und weniger bitter.',
    aroma: 'Grapefruit, Mango, Kiefer, Maracuja',
    glass: 'Tulpe oder Teku', temp: '8–10 °C',
    food: ['scharfes Curry', 'Burger', 'Tacos', 'kräftiger Cheddar', 'Karottenkuchen'],
  },
  {
    id: 'paleale', name: 'Pale Ale', aliases: ['ale', 'american pale ale', 'apa', 'english pale ale', 'bitter', 'golden ale', 'amber ale', 'red ale'],
    group: 'Obergärig', abv: '4,5–5,8 %', color: 'golden bis kupfer', bitter: 'mittel bis stark',
    description: 'Ausgewogenes obergäriges Bier – amerikanische Varianten mit fruchtigem Hopfen, englische eher malzig-erdig.',
    aroma: 'Zitrus, Karamell, Kräuter',
    glass: 'Nonic-Pint oder Tulpe', temp: '8–11 °C',
    food: ['Fish & Chips', 'Burger', 'Pizza', 'Hähnchen-Wings'],
  },
  {
    id: 'stout', name: 'Stout', aliases: ['dry stout', 'irish stout', 'imperial stout', 'milk stout', 'oatmeal stout'],
    group: 'Obergärig', abv: '4–10 %', color: 'schwarz, cremiger Schaum', bitter: 'mittel',
    description: 'Tiefschwarz durch geröstete Gerste. Irish Dry Stout ist schlank und trocken, Imperial Stout schwer und likörartig.',
    aroma: 'Espresso, Kakao, Röstmalz',
    glass: 'Pint oder Snifter', temp: '10–13 °C',
    food: ['Austern', 'Irish Stew', 'Schokoladentorte', 'Vanilleeis'],
  },
  {
    id: 'porter', name: 'Porter', aliases: ['baltic porter', 'robust porter'],
    group: 'Obergärig (Baltic: untergärig)', abv: '4,5–9 %', color: 'dunkelbraun bis schwarz', bitter: 'mittel',
    description: 'Der Vorläufer des Stouts aus London: dunkel, röstig, meist etwas süßer und weicher.',
    aroma: 'Schokolade, Karamell, Kaffee',
    glass: 'Pint oder Tulpe', temp: '10–13 °C',
    food: ['Grillrippchen', 'Wild', 'geräucherter Käse', 'Brownies'],
  },
  {
    id: 'witbier', name: 'Witbier', aliases: ['wit', 'blanche', 'belgian white', 'belgisches weißbier'],
    group: 'Obergärig', abv: '4,5–5,5 %', color: 'sehr hell, trüb', bitter: 'kaum',
    description: 'Belgisches Weizenbier mit Koriander und Orangenschale. Leicht, würzig und erfrischend.',
    aroma: 'Orange, Koriander, Pfeffer',
    glass: 'Becher', temp: '6–8 °C',
    food: ['Muscheln', 'Ziegenkäse', 'asiatische Gerichte', 'Salate'],
  },
  {
    id: 'tripel', name: 'Tripel', aliases: ['belgian tripel', 'golden strong ale', 'belgian strong', 'quadrupel', 'quad'],
    group: 'Obergärig', abv: '7,5–10 %', color: 'golden', bitter: 'mittel',
    description: 'Starkes, helles Klosterbier aus Belgien. Trocken, hochvergoren, würzig mit fruchtigen Hefeestern.',
    aroma: 'Birne, Pfeffer, Honig',
    glass: 'Kelch', temp: '8–12 °C',
    food: ['Geflügel', 'Hummer', 'Weichkäse', 'Thai-Gerichte'],
  },
  {
    id: 'dubbel', name: 'Dubbel', aliases: ['belgian dubbel', 'trappist', 'abbey', 'abteibier', 'klosterbier'],
    group: 'Obergärig', abv: '6–7,6 %', color: 'rotbraun', bitter: 'mild',
    description: 'Dunkles belgisches Klosterbier mit Kandiszucker, malzig-süßlich und fruchtig.',
    aroma: 'Rosine, Karamell, Banane',
    glass: 'Kelch', temp: '10–12 °C',
    food: ['Carbonade flamande', 'Wildschwein', 'Trappistenkäse', 'Schokolade'],
  },
  {
    id: 'lager', name: 'Lager', aliases: ['international lager', 'pale lager', 'american lager', 'premium lager', 'lagerbier', 'light lager'],
    group: 'Untergärig', abv: '4–5,5 %', color: 'hellgelb', bitter: 'mild',
    description: 'Sammelbegriff für helle, untergärige Biere internationaler Prägung – sauber, leicht, gut gekühlt am besten.',
    aroma: 'neutral, leicht getreidig',
    glass: 'Becher oder Flasche', temp: '4–7 °C',
    food: ['Tacos', 'Pizza', 'scharfe Snacks', 'Grill'],
  },
  {
    id: 'alkoholfrei', name: 'Alkoholfrei', aliases: ['alkoholfrei', 'alcohol free', 'non-alcoholic', '0,0', '0.0', 'nab'],
    group: 'Sonderform', abv: '< 0,5 %', color: 'je nach Grundstil', bitter: 'je nach Grundstil',
    description: 'Durch Entalkoholisierung oder gestoppte Gärung hergestellt. Inzwischen in fast jedem Stil erhältlich – vom Pils bis zum IPA.',
    aroma: 'oft etwas würziger/süßer als das Original',
    glass: 'wie beim Grundstil', temp: '6–8 °C',
    food: ['wie beim Grundstil', 'nach dem Sport', 'Mittagessen'],
  },
];

function norm(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9,. ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const INDEX = (() => {
  const exact = new Map();
  for (const s of STYLE_LEXICON) {
    for (const k of [s.name, s.id, ...s.aliases]) exact.set(norm(k), s);
  }
  return exact;
})();

/** Ordnet eine freie Stil-Eingabe („Hefeweizen“, „Premium Pils“) einem Lexikon-Eintrag zu. */
export function findStyle(input) {
  const n = norm(input);
  if (!n) return null;
  if (INDEX.has(n)) return INDEX.get(n);
  // längster enthaltener Alias gewinnt („Bayerisches Hefeweizen dunkel“ → Weißbier)
  let best = null;
  let bestLen = 0;
  for (const [k, s] of INDEX) {
    if (k.length >= 3 && (` ${n} `).includes(` ${k} `) && k.length > bestLen) { best = s; bestLen = k.length; }
  }
  if (best) return best;
  for (const [k, s] of INDEX) {
    if (k.length >= 4 && n.includes(k) && k.length > bestLen) { best = s; bestLen = k.length; }
  }
  return best;
}

/** Stile für das Stil-Bingo (4×4). */
export const BINGO_STYLES = ['pils', 'helles', 'weissbier', 'dunkles', 'schwarzbier', 'maerzen', 'bock', 'keller',
  'koelsch', 'alt', 'rauchbier', 'ipa', 'paleale', 'stout', 'witbier', 'sour'];
