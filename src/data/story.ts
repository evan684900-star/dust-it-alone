/**
 * L'histoire de Dust It Alone.
 *
 * Il y a 30 ans, la petite princesse Élise (8 ans) est tombée gravement malade.
 * Le seul remède se trouvait très loin, dans la Cité des Herbes : la famille royale
 * est partie en pleine nuit en promettant de revenir. Élise a guéri… mais la vie a
 * continué ailleurs, et peu à peu plus personne n'a pensé au château. L'oubli s'y
 * est déposé : c'est la poussière.
 *
 * Dans la précipitation, Élise a oublié son doudou, un petit mouton en peluche, sous
 * le lit de la Chambre royale. Oublié, il a grossi avec la poussière jusqu'à devenir
 * Mouton Ier, roi autoproclamé de la poussière : si le château se souvient, il
 * disparaît. Les moutons de poussière sont ses espions.
 *
 * Plume est né du vieux plumeau de Gustave, le balayeur du Roi. Il dormait depuis le
 * départ ; il se réveille parce qu'Élise, adulte, a repensé au château et a décidé
 * d'y revenir. À la fin, Élise revient, se souvient de son doudou… et Mouton Ier
 * redevient un simple mouton en peluche.
 */

export interface Speaker {
  name: string;
  /** Hauteur de la voix synthétique (Hz). */
  voice: number;
  /** Pensée (italique) plutôt que parole. */
  thought?: boolean;
}

export const SPEAKERS = {
  plume: { name: 'Plume', voice: 520, thought: true },
  mouton: { name: 'Mouton Ier', voice: 130 },
  hortense: { name: 'Grand-Mère Hortense (portrait)', voice: 330 },
  bertrand: { name: 'Oncle Bertrand (portrait)', voice: 250 },
  aldric: { name: 'Le Roi fondateur (portrait)', voice: 170 },
  elise: { name: 'Élise', voice: 640 },
  eliseAdult: { name: 'Élise', voice: 470 },
  roi: { name: 'Le Roi Léopold', voice: 210 },
  reine: { name: 'La Reine Margot', voice: 410 },
  anselme: { name: 'Anselme, le bibliothécaire', voice: 240 },
  gustave: { name: 'Gustave, le balayeur', voice: 290 },
  rose: { name: 'Rose, la cuisinière', voice: 380 },
  medecin: { name: 'Le médecin', voice: 260 },
  lou: { name: 'Lou, la fille d’Élise', voice: 720 },
} satisfies Record<string, Speaker>;

export type SpeakerId = keyof typeof SPEAKERS;
export type Line = [SpeakerId, string];

export interface RoomStory {
  /** Message écrit dans la poussière par Mouton Ier (il s'efface quand on nettoie). */
  dustMessage: string;
  /** Répliques à la première entrée dans la pièce. */
  enter: Line[];
  /** Les 3 souvenirs cachés sous la poussière (apparaissent à 25 %, 55 % et 85 % de propreté). */
  souvenirs: { id: string; name: string; icon: string; text: string }[];
  /** L'écho du passé, joué la première fois que la pièce est impeccable. */
  echo: { title: string; lines: Line[] };
}

export const INTRO: Line[] = [
  ['plume', '… Tant de poussière. Combien de temps ai-je dormi ?'],
  ['plume', 'Quelqu’un a pensé au château. Je l’ai senti. C’est pour ça que je me suis réveillé.'],
  ['plume', 'Le vieux balai de Gustave est toujours là. Bon. Au travail ! (maintiens le clic pour balayer)'],
];

export const ROOM_STORY: Record<string, RoomStory> = {
  attic: {
    dustMessage: 'QUI OSE ?',
    enter: [],
    souvenirs: [
      { id: 'attic-1', name: 'Un plumeau usé', icon: '🪶', text: 'Le vieux plumeau de Gustave, le balayeur du Roi. C’est de lui que je suis né. Il sent encore la cire et le savon noir.' },
      { id: 'attic-2', name: 'Une malle de voyage vide', icon: '🧳', text: 'Une étiquette dit : « Cité des Herbes ». La malle a été vidée en vitesse. Il manque une chaussette d’enfant.' },
      { id: 'attic-3', name: 'Un dessin d’enfant', icon: '🖍️', text: 'Un château, un soleil, une petite fille et un mouton tout rond. En bas, écrit en grosses lettres : « ÉLISE ET MOUTON ».' },
    ],
    echo: { title: 'Le grenier aux trésors', lines: [
      ['elise', 'Gustave ! Gustave ! Je me cache ici, ne dis rien à Maman !'],
      ['gustave', 'Je ne vois rien, mademoiselle. Juste un mouton qui dépasse de derrière la malle.'],
      ['elise', 'C’est pas un mouton, c’est MOUTON. Il s’appelle Mouton.'],
    ] },
  },
  gallery: {
    dustMessage: "VA-T'EN",
    enter: [
      ['hortense', 'Enfin quelqu’un ! Trente ans que j’ai de la poussière dans le nez. Tu comptes rester planté là ?'],
      ['bertrand', 'Hortense, chut… il y a des moutons partout. Ils nous ESPIONNENT.'],
      ['aldric', 'Petit esprit du ménage, le château t’attendait. Rends-nous la mémoire.'],
    ],
    souvenirs: [
      { id: 'gallery-1', name: 'Page du journal d’Élise (1)', icon: '📖', text: '« Aujourd’hui j’ai de la fièvre. Le médecin a fait une drôle de tête. Mouton dit que ce n’est rien. Mouton a toujours raison. »' },
      { id: 'gallery-2', name: 'Un ruban rose', icon: '🎀', text: 'Le ruban qu’Élise portait aux grandes fêtes. Il est tombé derrière le cadre de Grand-Mère Hortense, qui fait semblant de ne pas l’avoir vu.' },
      { id: 'gallery-3', name: 'Un portrait inachevé', icon: '🖼️', text: 'Le portrait d’Élise, commencé l’été de ses huit ans. Le peintre n’a jamais pu le finir : il manque le sourire.' },
    ],
    echo: { title: 'La pose', lines: [
      ['reine', 'Élise, ma chérie, il faut rester immobile pour le peintre.'],
      ['elise', 'Mais Mouton veut être sur le tableau aussi !'],
      ['roi', 'Alors Mouton posera la prochaine fois. Promis.'],
      ['hortense', '(Il n’y a jamais eu de prochaine fois.)'],
    ] },
  },
  library: {
    dustMessage: 'ICI ON OUBLIE',
    enter: [['plume', 'La bibliothèque. Les livres aussi s’endorment, quand plus personne ne les ouvre.']],
    souvenirs: [
      { id: 'library-1', name: 'Le Grimoire du Ménage', icon: '📕', text: '« La poussière n’est que de l’oubli qui retombe. Ce qu’on oublie s’endort ; ce qu’on se rappelle se réveille. » — chapitre premier.' },
      { id: 'library-2', name: 'Page du journal d’Élise (2)', icon: '📖', text: '« Anselme m’a lu l’histoire de la Cité des Herbes, là où poussent les plantes qui guérissent tout. J’aimerais y aller. Avec Mouton. »' },
      { id: 'library-3', name: 'Une carte du royaume', icon: '🗺️', text: 'Un trajet tracé à l’encre rouge, du château jusqu’à la Cité des Herbes, tout au sud. Vingt jours de voyage. En bas : « Partir cette nuit. »' },
    ],
    echo: { title: 'La leçon d’Anselme', lines: [
      ['elise', 'Monsieur Anselme, pourquoi la poussière revient toujours ?'],
      ['anselme', 'Parce que les choses qu’on oublie finissent toujours par s’endormir, mademoiselle.'],
      ['elise', 'Alors moi, je n’oublierai jamais rien. Promis.'],
    ] },
  },
  bedroom: {
    dustMessage: 'ELLE NE REVIENDRA PAS',
    enter: [
      ['mouton', 'Tu fouilles dans MA chambre, petit plumeau ? Il n’y a rien ici. Plus rien.'],
      ['plume', 'Cette voix… Elle sort de sous le lit. Ou de partout à la fois.'],
    ],
    souvenirs: [
      { id: 'bedroom-1', name: 'Un flacon de remède vide', icon: '🧪', text: 'Une étiquette du médecin : « Fièvre des neiges. Ne guérit qu’avec la fleur d’argent de la Cité des Herbes. Partir au plus vite. »' },
      { id: 'bedroom-2', name: 'Page du journal d’Élise (3)', icon: '📖', text: '« On part cette nuit. Papa dit qu’on reviendra au printemps. J’ai tout préparé. Je n’ai rien oublié. Je crois. »' },
      { id: 'bedroom-3', name: 'Une empreinte ronde sous le lit', icon: '🫧', text: 'Sous le lit, la poussière a gardé une forme ronde, toute petite. Comme si quelque chose y était resté longtemps… puis avait grandi.' },
    ],
    echo: { title: 'La nuit du départ', lines: [
      ['medecin', 'La fièvre monte. Il faut partir cette nuit, Majesté. Pas demain : cette nuit.'],
      ['reine', 'Élise, mon cœur, on t’emmène. Tu dors dans la voiture, d’accord ?'],
      ['elise', 'Et Mouton ? … Mouton ?'],
      ['roi', 'Chut, ma chérie. On reviendra. Je te le promets.'],
    ] },
  },
  hall: {
    dustMessage: 'CE CHÂTEAU EST À MOI',
    enter: [
      ['mouton', 'Tu as réveillé les portraits, les livres, la chambre… Assez ! Ce château m’appartient.'],
      ['mouton', 'Tant qu’on l’oublie, j’existe. Tu comprends ? Si tout le monde se souvient… je disparais.'],
      ['plume', 'Il a peur. Ce n’est pas un méchant. C’est quelqu’un qui a peur.'],
    ],
    souvenirs: [
      { id: 'hall-1', name: 'Une invitation au bal', icon: '💌', text: '« Grand bal du printemps, en l’honneur des huit ans de la princesse Élise. » Le bal n’a jamais eu lieu.' },
      { id: 'hall-2', name: 'Un petit soulier de bal', icon: '👞', text: 'Un soulier d’enfant, abandonné sur la première marche de l’escalier d’honneur. L’autre est parti dans la voiture.' },
      { id: 'hall-3', name: 'La clé du château', icon: '🗝️', text: 'Une grosse clé de fer, accrochée près de la porte. Une étiquette, écrite par le Roi : « Pour le retour ».' },
    ],
    echo: { title: 'Les préparatifs du bal', lines: [
      ['gustave', 'Plus haut, les guirlandes ! La princesse veut voir des étoiles partout !'],
      ['elise', 'Et un gâteau aussi grand que l’escalier !'],
      ['roi', 'Aussi grand que l’escalier, rien que ça ?'],
      ['elise', 'Et une part pour Mouton.'],
    ] },
  },
  kitchen: {
    dustMessage: 'PLUS DE TARTES',
    enter: [['plume', 'Les cuisines. On sent encore… la tarte aux pommes ? Non. Le souvenir d’une tarte aux pommes.']],
    souvenirs: [
      { id: 'kitchen-1', name: 'La recette de Rose', icon: '🥧', text: '« Tarte aux pommes d’Élise : beaucoup de cannelle, pas de raisins secs (Élise trie les raisins secs). »' },
      { id: 'kitchen-2', name: 'Une cuillère en bois mordillée', icon: '🥄', text: 'Les traces de petites dents. Rose disait que c’était Biscotte. Tout le monde savait que c’était Élise.' },
      { id: 'kitchen-3', name: 'Un panier pour le voyage', icon: '🧺', text: 'Un panier préparé à la hâte : du pain, des pommes, une couverture. Et une petite assiette, pour Mouton.' },
    ],
    echo: { title: 'La dernière tarte', lines: [
      ['rose', 'Pour la route, Majesté : la tarte d’Élise, encore chaude.'],
      ['roi', 'Merci, Rose. Gardez le château en ordre. Nous reviendrons.'],
      ['rose', 'Je garderai une part au chaud. Le temps qu’il faudra.'],
    ] },
  },
  banquet: {
    dustMessage: 'LA FÊTE EST FINIE',
    enter: [['mouton', 'Ici, ils riaient. Tous. Moi, j’étais sous le lit. Personne n’est venu me chercher.']],
    souvenirs: [
      { id: 'banquet-1', name: 'Un plan de table', icon: '📜', text: 'À côté du nom « Élise », une petite chaise a été dessinée au crayon, avec écrit : « Mouton (invité d’honneur) ».' },
      { id: 'banquet-2', name: 'Un verre gravé', icon: '🍷', text: '« Au retour ! » — gravé par le Roi le soir du départ. Jamais bu.' },
      { id: 'banquet-3', name: 'Page du journal d’Élise (4)', icon: '📖', text: '« Dans la voiture, j’ai pleuré. Je ne trouve plus Mouton. Maman dit qu’il est sûrement dans une malle. Il n’est dans aucune malle. »' },
    ],
    echo: { title: 'Le toast', lines: [
      ['roi', 'Mes amis, ce soir pas de bal. Mais je lève mon verre au retour.'],
      ['reine', 'Au retour.'],
      ['gustave', 'Au retour, Majesté. Le château vous attendra.'],
    ] },
  },
  chapel: {
    dustMessage: 'SILENCE',
    enter: [['plume', 'La chapelle. Les vitraux font des taches de couleur dans la poussière. On dirait qu’ils attendent quelqu’un.']],
    souvenirs: [
      { id: 'chapel-1', name: 'Une bougie jamais allumée', icon: '🕯️', text: 'Une étiquette : « À allumer le jour où Élise sera guérie. » Personne n’était là pour l’allumer.' },
      { id: 'chapel-2', name: 'Une lettre de la Cité des Herbes', icon: '✉️', text: '« Élise est guérie ! Elle court, elle rit, elle a un appétit d’ogre. Nous rentrerons bientôt. » — La Reine. La lettre n’a jamais été ouverte.' },
      { id: 'chapel-3', name: 'Une poignée de poussière d’étoile', icon: '✨', text: 'Ici, la poussière brille plus qu’ailleurs. Le Grimoire dit que ce sont les souvenirs les plus précieux qui brillent ainsi.' },
    ],
    echo: { title: 'La prière', lines: [
      ['reine', 'Faites qu’elle guérisse. Faites qu’on revienne.'],
      ['elise', 'Et faites que Mouton n’ait pas peur tout seul.'],
    ] },
  },
  courtyard: {
    dustMessage: 'LE VENT EST À MOI',
    enter: [['plume', 'Le grand air ! Le vieil arbre a perdu ses feuilles des centaines de fois depuis le départ.']],
    souvenirs: [
      { id: 'courtyard-1', name: 'Une balançoire cassée', icon: '🪢', text: 'Accrochée au grand arbre. Le Roi l’avait installée lui-même, et s’était coincé le doigt. Il avait juré très fort.' },
      { id: 'courtyard-2', name: 'Des initiales gravées', icon: '🌳', text: 'Sur l’écorce : « É + M ». Élise et Mouton, à la vie à la mort.' },
      { id: 'courtyard-3', name: 'Page du journal d’Élise (5)', icon: '📖', text: '« Je vais mieux. La Cité des Herbes est jolie, mais l’arbre de la cour me manque. Et Mouton. Surtout Mouton. »' },
    ],
    echo: { title: 'La balançoire', lines: [
      ['elise', 'Plus haut, Papa ! Plus haut ! Mouton veut toucher le ciel !'],
      ['roi', 'Mouton a le vertige, je te signale.'],
      ['elise', 'Non, il a pas le vertige. Il est courageux. C’est le plus courageux des moutons.'],
    ] },
  },
  cellar: {
    dustMessage: 'PERSONNE NE DESCEND',
    enter: [['mouton', 'Pourquoi tu continues ? Ils ne reviendront pas. Trente ans, petit plumeau. TRENTE ANS.']],
    souvenirs: [
      { id: 'cellar-1', name: 'Une bouteille « réservée »', icon: '🍾', text: '« Pour les seize ans d’Élise ». La bouteille attend toujours, couchée dans la poussière.' },
      { id: 'cellar-2', name: 'Les lettres jamais postées', icon: '📮', text: 'Une liasse de lettres de Gustave, adressées à la Cité des Herbes. Aucun timbre. Il n’a jamais osé les envoyer.' },
      { id: 'cellar-3', name: 'Page du journal d’Élise (6)', icon: '📖', text: '« J’ai seize ans aujourd’hui. On ne rentrera pas au château, Papa a trop de travail ici. J’ai arrêté de demander. »' },
    ],
    echo: { title: 'Gustave seul', lines: [
      ['gustave', 'Un an déjà. Je balaie tous les jours, au cas où.'],
      ['gustave', 'Deux ans. Trois. Les moutons de poussière reviennent plus vite que moi.'],
      ['gustave', 'Je pose mon plumeau là. Si un jour ils reviennent… il saura quoi faire.'],
    ] },
  },
  dungeon: {
    dustMessage: "PRISONNIER DE L'OUBLI",
    enter: [['plume', 'Les cachots… Personne n’y a jamais été enfermé. Sauf l’oubli. Et lui, il ne demande qu’à sortir.']],
    souvenirs: [
      { id: 'dungeon-1', name: 'Une cachette d’enfant', icon: '🏰', text: 'Un coin des cachots aménagé en forteresse avec des coussins. Une pancarte : « INTERDIT AUX ADULTES (sauf Gustave) ».' },
      { id: 'dungeon-2', name: 'Un petit trône en bois', icon: '🪑', text: 'Un trône jouet, fabriqué par Gustave pour Mouton. Une couronne en papier est posée dessus. C’est là qu’il a appris à être roi.' },
      { id: 'dungeon-3', name: 'Page du journal d’Élise (7)', icon: '📖', text: '« J’ai rêvé du château cette nuit. Il y avait un petit plumeau qui balayait tout seul. Bizarre, non ? »' },
    ],
    echo: { title: 'La forteresse', lines: [
      ['elise', 'Mouton est le roi des cachots ! Et moi je suis sa générale !'],
      ['gustave', 'Et moi alors ?'],
      ['elise', 'Toi tu es le gardien du plumeau. C’est le travail le plus important.'],
    ] },
  },
  clocktower: {
    dustMessage: "LE TEMPS S'EST ARRÊTÉ",
    enter: [['plume', 'L’horloge s’est arrêtée à minuit moins cinq, la nuit du départ. Elle attend la suite.']],
    souvenirs: [
      { id: 'clocktower-1', name: 'Un engrenage doré', icon: '⚙️', text: 'Une petite pièce tombée du mécanisme. Sans elle, l’horloge ne peut pas repartir. Je la garde précieusement.' },
      { id: 'clocktower-2', name: 'Page du journal d’Élise (8)', icon: '📖', text: '« J’ai une fille maintenant. Elle s’appelle Lou. Ce soir, elle m’a demandé où j’ai grandi. Je n’ai pas su quoi répondre. Alors je lui ai parlé du château. »' },
      { id: 'clocktower-3', name: 'Une longue-vue', icon: '🔭', text: 'Elle est pointée vers le sud, vers la route. Quelqu’un a longtemps guetté une voiture qui ne venait pas.' },
    ],
    echo: { title: 'Minuit moins cinq', lines: [
      ['roi', 'Gustave, arrêtez l’horloge. Quand nous rentrerons, nous la remettrons en marche ensemble.'],
      ['gustave', 'Bien, Majesté. Minuit moins cinq. Elle vous attendra.'],
    ] },
  },
  ramparts: {
    dustMessage: 'PERSONNE NE VIENDRA',
    enter: [
      ['mouton', 'Regarde la route, petit plumeau. Vide. Comme depuis trente ans.'],
      ['plume', 'Regarde mieux. Là-bas, tout au bout… de la poussière qui se soulève. Une voiture ?'],
    ],
    souvenirs: [
      { id: 'ramparts-1', name: 'Un drapeau plié', icon: '🚩', text: 'Le drapeau du château, plié avec soin. À hisser « le jour du retour ».' },
      { id: 'ramparts-2', name: 'Page du journal d’Élise (9)', icon: '📖', text: '« Lou veut voir le château. Moi aussi, je crois. J’ai peur de ce que je vais trouver. On part demain. »' },
      { id: 'ramparts-3', name: 'Une plume de Plume', icon: '🪶', text: 'Une de mes plumes, accrochée aux créneaux. Je ne me souviens pas d’être monté ici. Peut-être en rêve, il y a très longtemps.' },
    ],
    echo: { title: 'Le guetteur', lines: [
      ['gustave', 'Rien sur la route, aujourd’hui encore.'],
      ['gustave', 'Ce n’est pas grave. Demain, peut-être.'],
    ] },
  },
  throne: {
    dustMessage: 'MOUTON Ier, ROI DE LA POUSSIÈRE',
    enter: [
      ['mouton', 'Tu es venu jusqu’ici. Jusqu’à mon trône. Très bien, petit plumeau.'],
      ['mouton', 'Si tu nettoies cette salle, tout le château se souviendra. Et moi… moi, je disparaîtrai.'],
      ['plume', 'Ou alors, quelqu’un se souviendra enfin de toi.'],
    ],
    souvenirs: [
      { id: 'throne-1', name: 'Une couronne en papier', icon: '👑', text: 'La couronne en papier du petit trône des cachots. Mouton l’a gardée trente ans. Elle est un peu trop petite pour lui, maintenant.' },
      { id: 'throne-2', name: 'Page du journal d’Élise (10)', icon: '📖', text: '« Je vois les tours ! Lou crie de joie. Mon cœur bat si fort. Mouton, si tu savais… »' },
      { id: 'throne-3', name: 'Une étiquette cousue', icon: '🏷️', text: 'Une petite étiquette de tissu, usée : « Mouton — appartient à Élise ». Elle était cachée sous des montagnes de poussière.' },
    ],
    echo: { title: 'Le roi de la poussière', lines: [
      ['mouton', 'Personne n’est venu me chercher. Alors j’ai mangé la poussière, et j’ai grandi, grandi…'],
      ['mouton', 'Je me suis fait roi, pour que quelqu’un fasse attention à moi.'],
    ] },
  },
};

/** La fin : quand la Salle du trône est impeccable. */
export const ENDING: { title: string; lines: Line[] } = {
  title: 'Le retour',
  lines: [
    ['plume', 'La dernière poussière tombe dans la pelle. Tout le château se souvient.'],
    ['mouton', 'Je… je rétrécis. Je deviens tout petit. C’est donc ça, disparaître ?'],
    ['lou', 'Maman ! Maman ! Il y a un mouton tout doux par terre !'],
    ['eliseAdult', '… Mouton ?'],
    ['eliseAdult', 'Mouton. Tu m’as attendue tout ce temps. Pardon. Je ne t’ai jamais oublié, tu sais. Jamais vraiment.'],
    ['mouton', '(Un tout petit mouton en peluche. Et il sourit.)'],
    ['eliseAdult', 'Lou, je te présente Mouton. Le plus courageux des moutons.'],
    ['lou', 'Et lui, c’est qui ? Le petit plumeau qui vole ?'],
    ['eliseAdult', 'Lui… je crois que c’est un vieil ami. Merci, Plume.'],
    ['plume', 'Là-haut, l’horloge repart. Minuit moins cinq… minuit. Une nouvelle journée commence au château.'],
  ],
};

/** Nombre de souvenirs (hors Salle du trône) nécessaires pour ouvrir la Salle du trône. */
export const THRONE_SOUVENIRS = 30;

export const ALL_SOUVENIRS = Object.entries(ROOM_STORY).flatMap(([room, s]) => s.souvenirs.map((x, i) => ({ ...x, room, index: i })));
