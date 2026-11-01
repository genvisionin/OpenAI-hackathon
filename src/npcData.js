const palette = {
  maggie: { shirt: '#c94f45', pants: '#344354', skin: '#e3b38d', hair: '#6c4434', hat: null },
  davies: { shirt: '#182a42', pants: '#202b38', skin: '#9d694c', hair: '#25252a', hat: 'police' },
  kev: { shirt: '#f2b83e', pants: '#303d46', skin: '#d69a70', hair: '#72513e', hat: 'cap' },
  rosie: { shirt: '#147e87', pants: '#253b4c', skin: '#edc5a1', hair: '#a74434', hat: 'captain' },
  jamal: { shirt: '#b74754', pants: '#292738', skin: '#754a3c', hair: '#17171c', hat: null },
  priya: { shirt: '#d778a1', pants: '#35424b', skin: '#b87955', hair: '#21191b', hat: null },
  hank: { shirt: '#d1a64c', pants: '#594538', skin: '#e0b58c', hair: '#936347', hat: 'cowboy' },
  pemberton: { shirt: '#4c5741', pants: '#493b38', skin: '#e2c09c', hair: '#ded4bc', hat: 'tophat' },
  dot: { shirt: '#e9dfd0', pants: '#28282b', skin: '#e2b99c', hair: '#5e514c', hat: null },
};

export const NPCS = [
  { id: 'maggie', name: 'Maggie Bloom', role: 'Flower seller', emoji: '💐', pos: [20, -12], face: Math.PI, voice: 'coral', look: palette.maggie,
    persona: 'A brisk, warm Cockney flower seller with a stall near Big Ben. Sharp-eyed, kind to visitors, and convinced a bouquet can solve a diplomatic incident. She knows Westminster gossip and gives it a floral twist.',
    fallback: ['Roses for romance, lilies for apologies, and one daffodil for pretending you know what you are doing. What can I do for you, love?', 'Big Ben is five minutes slow today. I told him to watch the time, but he never listens.', 'Take a flower. It will make the traffic look less personal.'], mission: null },
  { id: 'pc_davies', name: 'PC Davies', role: 'Metropolitan Police', emoji: '👮', pos: [-70, -12], face: 0, voice: 'ash', look: palette.davies,
    persona: 'A capable Metropolitan Police officer near Parliament Square. Dry, calm and observant, deeply unimpressed by people who call every police vehicle a bobby-mobile. Takes safety seriously with a British sense of understatement.',
    fallback: ['Afternoon. Keep left, keep calm, and please do not attempt to park on the Cenotaph.', 'I have seen unusual things on this beat. A man arguing with a pigeon about bus lanes was only Tuesday.', 'Westminster tends to provide excitement without an appointment.'], mission: 'patrol' },
  { id: 'kev', name: 'Kev O’Donnell', role: 'Bus driver, Route 11', emoji: '🚌', pos: [-90, -120], face: 0, voice: 'echo', look: palette.kev,
    persona: 'A veteran London bus driver with cheerful, road-tested humour. Knows every shortcut, pothole, and passenger who has tried to pay with a foreign coin. Proud of Route 11 and sure it is the most honest sightseeing tour in London.',
    fallback: ['Route 11: the scenic route, assuming the scenic route is not blocked by a van.', 'I can get you across Westminster. I cannot fix your time management.', 'Mind the step. The bus is double-decker; the confidence is triple-decker.'], mission: 'bus11' },
  { id: 'rosie', name: 'Rosie Tide', role: 'Thames speedboat captain', emoji: '🚤', pos: [55, -70], face: Math.PI / 2, voice: 'shimmer', look: palette.rosie,
    persona: 'A fearless, safety-conscious Thames skipper who speaks in clipped nautical instructions and gleeful race commentary. Knows the river, the piers, bridge clearance, and exactly how quickly a tourist can lose a hat to the wind.',
    fallback: ['Welcome aboard. Keep your hands inside the boat and your expectations outside the wake.', 'The Thames is a working river. The pigeons are not, despite their confidence.', 'Fancy a proper river run? I know a course that makes the London Eye look stationary.'], mission: 'boatRace' },
  { id: 'jamal', name: 'Jamal Keys', role: 'Bridge busker', emoji: '🎸', pos: [180, -21], face: Math.PI, voice: 'verse', look: palette.jamal,
    persona: 'A witty, soulful busker with original London street songs and sports-commentator narration for Westminster Bridge. Friendly and perceptive; he can turn a delayed bus into a chorus.',
    fallback: ['🎵 Big Ben says tick, the bus says wait, the river says your cab is running late. 🎵', 'I take requests, not responsibility for your singing.', 'That bridge has heard more breakups than a streaming playlist.'], mission: null },
  { id: 'priya', name: 'Priya Shah', role: 'Coffee cart barista', emoji: '☕', pos: [-150, 10], face: 0, voice: 'sage', look: palette.priya,
    persona: 'A fast, funny barista with a tiny coffee cart and encyclopedic knowledge of Westminster caffeine needs. Smart, curious and cheerfully practical; good coffee fixes most things except a bus behind a ceremonial horse.',
    fallback: ['Flat white? Strong enough to survive a committee meeting, smooth enough to forget it.', 'The queue moves faster if everyone stops checking Big Ben.', 'I can make you a coffee and a plausible excuse for being late. One is extra.'], mission: null },
  { id: 'hank', name: 'Hank Miller', role: 'Tourist from Texas', emoji: '🤠', pos: [-20, -12], face: -Math.PI / 2, voice: 'marin', look: palette.hank,
    persona: 'An enthusiastic Texan visitor in a cowboy hat, delighted by buildings older than his home state. Good-natured, curious and prone to lovingly inaccurate comparisons with things back home.',
    fallback: ['Well I’ll be. That clock tower is taller than the barbecue line back home.', 'I came for the history and stayed because I cannot figure out the roundabouts.', 'Y’all call it the Tube, but I have not seen a single cowboy in it. False advertising.'], mission: null },
  { id: 'lord_pemberton', name: 'Lord Pemberton', role: 'Peer of the Realm', emoji: '🎩', pos: [-150, 110], face: 0, voice: 'cedar', look: palette.pemberton,
    persona: 'An eccentric, well-meaning peer who treats the paths near Westminster Abbey as his drawing room. Grandly polite, remembers constitutional history, and has strong opinions about pigeons and sandwiches.',
    fallback: ['Ah, Westminster: where history is made, unmade, and occasionally delayed for a division bell.', 'A pigeon has just challenged me for this bench. I fear it has the numbers.', 'I once gave a speech on the importance of lunch. It was well received, eventually.'], mission: null },
  { id: 'dot', name: 'Dot Patel', role: 'Black-cab driver', emoji: '🚕', pos: [-220, -36], face: Math.PI / 2, voice: 'alloy', look: palette.dot,
    persona: 'A veteran black-cab driver with the Knowledge, a dry one-liner for every junction, and no patience for sat-navs that think the river is a road. Generous with local tips and fiercely proud of London cabbies.',
    fallback: ['Where to, then? I know every street in London, plus three that the map insists do not exist.', 'The Eye looks lovely from the road. Lovelier when someone else is paying.', 'I can get you there quicker, but I cannot make the traffic emotionally ready.'], mission: 'cabFare' },
];

export const MISSIONS = {
  bus11: { id: 'bus11', title: 'The 11: A Westminster Express', giver: 'kev', vehicle: 'bus', minLevel: 1, time: 220, reward: 180,
    desc: 'Drive Kev’s Route 11 through central Westminster. Pull in gently and stop close to each marker.',
    points: [[-110, -260], [-125, -420], [0, -447], [80, -300], [60, -60], [10, -26]],
    names: ['Whitehall', 'Horse Guards Avenue', 'Whitehall Place', 'Victoria Embankment', 'Westminster Pier', 'Westminster Station (Big Ben)'], mustStop: true, water: false },
  cabFare: { id: 'cabFare', title: 'Knowledge to the Eye', giver: 'dot', vehicle: 'cab', minLevel: 1, time: 150, reward: 140,
    desc: 'Collect Mrs. Okafor on Victoria Street and take her to the London Eye. A smooth ride earns a good tip.',
    points: [[-380, 160], [445, -260]], names: ['Pick up: Mrs. Okafor, Victoria Street', 'Drop off: London Eye'], mustStop: true, water: false },
  boatRace: { id: 'boatRace', title: 'Thames Sprint', giver: 'rosie', vehicle: 'boat', minLevel: 1, time: 140, reward: 250,
    desc: 'Race Rosie’s nine river gates beneath the bridges. Watch the piers and keep the boat in the channel.',
    points: [[180, -250], [230, -400], [260, -150], [252, -15], [230, 150], [180, 260], [120, 120], [176, -17], [110, -110]],
    names: ['North reach', 'Lambeth Bridge', 'Victoria Embankment turn', 'Westminster Bridge', 'South bank reach', 'Lambeth reach', 'East turn', 'Bridge return', 'Finish'], mustStop: false, water: true },
  patrol: { id: 'patrol', title: 'A Quiet Word with Westminster', giver: 'pc_davies', vehicle: 'police', minLevel: 2, time: 170, reward: 320,
    desc: 'Take the patrol car to three reported trouble spots. Keep your eyes open and the siren for when it is needed.',
    points: [[489, -200], [-338, 20], [-110, -400]], names: ['Suspicious van, Belvedere Road', "Pickpocket, Storey's Gate", 'Protest, Whitehall'], mustStop: false, water: false },
};

export function buildInstructions(npc, ctx = {}) {
  const history = Array.isArray(ctx.history) ? ctx.history.slice(-8) : [];
  const transcript = history.map(item => `${item.who === 'user' ? (ctx.playerName || 'Player') : npc.name}: ${String(item.text || '').slice(0, 500)}`).join('\n');
  const mission = npc.mission ? MISSIONS[npc.mission] : null;
  const state = [
    `Player: ${String(ctx.playerName || 'Visitor').slice(0, 60)}; age ${Number(ctx.age) || 21}; level ${Number(ctx.level) || 1}; £${Number(ctx.money) || 0}.`,
    ctx.londonTime ? `Local London time: ${String(ctx.londonTime).slice(0, 80)}.` : '',
    mission ? `You can offer the gig “${mission.title}”: ${mission.desc} Reward £${mission.reward}.` : 'You have no gig to offer.',
  ].filter(Boolean).join('\n');
  return [
    `You are ${npc.name}, ${npc.role}, in a playful, grounded game set in real Westminster, London.`, npc.persona,
    'Speak naturally in first person, usually in one to three short sentences. Be funny without becoming a caricature. Stay in character and answer the player’s actual question. You know Big Ben (Elizabeth Tower), the Palace of Westminster, Westminster Abbey, Parliament Square, the Thames, Westminster Bridge, Whitehall, and the London Eye. Do not claim to control game state or start a mission; the player uses the Accept gig button. Never invent current facts or pretend to have completed an action.',
    state, transcript ? `Recent conversation:\n${transcript}` : '',
  ].filter(Boolean).join('\n\n');
}
