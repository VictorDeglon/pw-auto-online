// Mission scripts. Each mission is data: a giver, where it starts, prerequisites, a reward, and a list
// of steps run in order by story.js (step types are documented at the top of STEPS there).
// Text in `text` fields may use <em>…</em> for the gold highlight. '@handle' in a place field means
// "where that spawned entity is right now".
// Story bible and Acts II-IV: docs/roadmap/03-story-and-characters.md.

import { LINES, LINE_MISSIONS } from './lines.js';
import { STREET_MISSIONS } from './streets.js';
export { LINES };

const isNight = h => h >= 20 || h < 5;

const BASE = [
  // ================================================================== PROLOGUE
  // Six years of silence, then Tommy calls. Marco drives down from LA, parks by Poway High, and gets a text.
  {
    id: 'p0-tommy', title: 'Tommy', giver: 'tommy', at: 'lakeGate', type: 'main', act: 1, auto: true, offline: true, quiet: true,
    pitch: 'Tommy finally called. He wants to meet at Lake Poway, after dark, alone.',
    reward: { money: 0 },
    steps: [
      { do: 'marcosCar' },
      { do: 'text', from: 'tommy', delay: 1.5, wait: 2.5, msg: 'You actually came. Lake Poway, the gate at the top of Lake Poway Road. Come alone. Don\'t go to Ma\'s yet, she\'ll make you eat.' },
      { do: 'stage', scene: 'tommy' },
      { do: 'goto', to: '@tommy', r: 45, text: 'Go and talk to <em>Tommy</em>. He\'s at the <em>Lake Poway</em> gate.' },
      { do: 'goto', to: '@tommy', r: 4, foot: true, text: 'Talk to <em>Tommy</em>.' },
      { do: 'cutscene', scene: 'tommy' },
      { do: 'wait', t: 1.2 },
      { do: 'talk', lines: [['marco', 'Black sedan. No lights. A bar across the front. It hit him like it had done it before.']] },
      { do: 'act', big: 'ESPOLA ROAD', title: 'Go see Rosa. She should hear it from you.' },
    ],
  },
  // ================================================================== ACT I · HOMECOMING
  {
    id: 'a1-homecoming', title: 'Homecoming', giver: 'rosa', at: 'home', type: 'main', act: 1, needs: ['p0-tommy'],
    pitch: 'Rosa is on the porch, waiting up for a son who isn\'t coming home.',
    reward: { money: 150, trust: { rosa: 10, walt: 5 } },
    steps: [
      { do: 'talk', lines: [
        ['rosa', 'Marco? Mijo, it\'s the middle of the night. Tommy said you might come. He wouldn\'t say why.'],
        ['rosa', 'Why do you smell like smoke?'],
        ['marco', 'Ma. Sit down.'],
        ['marco', 'A car ran him off the road. Espola, at the lake turn. It had no lights on. I was there. I watched it.'],
        ['rosa', 'No. He called me at ten. He said he\'d fix the porch light Sunday. He said...'],
        ['rosa', '...Go inside, Marco. Your room is still your room. I need to sit out here a while.'],
      ] },
      { do: 'card', title: 'FOUR DAYS LATER', sub: 'The Reyes house, Poway', t: 3.4, hour: 10.5 },
      { do: 'talk', lines: [
        ['rosa', 'The Sheriff closed it. "Single-car accident, excessive speed." Sergeant Kessler brought the report himself. With a casserole.'],
        ['marco', 'There were two cars, Ma. I told them. Nobody wrote it down.'],
        ['rosa', 'Then tell it to someone who can do something with it. I have a memorial to plan. Sunday, at Old Poway Park.'],
        ['rosa', 'Walt is holding sunflowers for me at the train depot. Tommy\'s favorite. Go get them.'],
        ['rosa', 'Take Tommy\'s car. The gold one. He left it in the driveway that night with the keys on the visor. He never left that car anywhere.'],
      ] },
      { do: 'ensureTommysCar', as: 'tommy' },
      { do: 'enterCar', car: 'tommy', text: 'Get in <em>Tommy\'s car</em>.' },
      { do: 'spawnNpc', as: 'walt', who: 'walt', at: 'oldPoway' },
      { do: 'goto', to: 'oldPoway', r: 14, text: 'Drive to <em>Old Poway Park</em> on Midland Road.' },
      { do: 'goto', to: '@walt', r: 5, foot: true, text: 'Talk to <em>Walt</em> at the depot.' },
      { do: 'talk', lines: [
        ['walt', 'Well, I\'ll be. Little Marco Reyes. You got tall and you got sad. Both look about right.'],
        ['walt', 'Your brother fixed my Studebaker when he was twelve. Charged me one root beer.'],
        ['marco', 'Walt, the Sheriff says he crashed alone. He didn\'t. I saw the other car.'],
        ['walt', '...Did you, now. Did you tell that to Kessler?'],
        ['marco', 'He didn\'t ask.'],
        ['walt', 'No. He wouldn\'t. Sunflowers. Mind the stems. And come see me when you want an old man\'s story. I\'ve got one about that night.'],
      ] },
      { do: 'goto', to: 'home', r: 10, text: 'Take the sunflowers <em>home</em> to Rosa.' },
      { do: 'talk', lines: [
        ['rosa', 'They\'re beautiful. He\'d pretend he didn\'t care, then stick one in his sun visor.'],
        ['rosa', 'The funeral home wants nine thousand dollars. I have eleven hundred and a casserole dish.'],
        ['rosa', 'Dee called. Tommy\'s friend from the garage. She asked if you were "still alive, or just still gone."'],
        ['marco', 'That sounds like Dee.'],
        ['rosa', 'Go see her. And Marco... whatever Tommy was mixed up in, it ends with him. Promise me.'],
        ['marco', '...I promise, Ma.'],
      ] },
      { do: 'learn', keys: ['crime:shoplift'] },
    ],
    after: [{ t: 5, text: ['dee', 'Heard you\'re back. Garage on Kirkham Way. Don\'t make me come get you.'] }],
  },
  {
    id: 'a1-tommys-friend', title: 'Tommy\'s Friend', giver: 'dee', at: 'deeGarage', type: 'main', act: 1, needs: ['a1-homecoming'],
    pitch: 'Dee has a repo job. Collateral, she calls it.',
    reward: { money: 400, trust: { dee: 15 } },
    steps: [
      { do: 'talk', lines: [
        ['dee', 'Look who found the 15 north. You missed the casseroles, and the part where your mom stopped eating.'],
        ['marco', 'I came as soon as I heard.'],
        ['dee', 'You came as soon as it was too late. Different thing.'],
        ['marco', 'I was there, Dee. At the lake. I saw the car that did it.'],
        ['dee', '...Rosa told me. She also told me you haven\'t slept since. Okay. Okay.'],
        ['dee', 'Anyway. I\'m short on rent. A guy on High Valley Road owes me nine grand in repairs and stopped answering.'],
        ['dee', 'His SUV\'s sitting in his driveway. Bring it here and it becomes collateral. Tommy used to do these for me.'],
        ['dee', 'Don\'t scratch it. And do not bring the Sheriff to my door.'],
      ] },
      { do: 'spawnCar', as: 'suv', type: 'suv', model: 'suv-luxury', tint: 0xd8c8b0, at: 'highValley', parked: true, protect: 'The SUV was destroyed.' },
      { do: 'enterCar', car: 'suv', text: 'Take the <em>SUV</em> parked on High Valley Road.' },
      { do: 'deliver', car: 'suv', carName: 'SUV', to: 'deeGarage', r: 12, noHeat: true, minHealth: 35, wreckText: 'The SUV is totaled. Dee won\'t take scrap.', text: 'Bring the SUV to <em>Dee\'s Garage</em> on Kirkham Way. Don\'t wreck it.' },
      { do: 'talk', lines: [
        ['dee', 'Not bad. Tommy would\'ve done it faster, but he\'d also have eaten a burrito in it.'],
        ['dee', 'That\'s not a compliment. It\'s... it\'s nice having a Reyes in the shop again.'],
        ['dee', 'Here. Tommy\'s picks. He could open a Lexus faster than its owner. No alarm, no broken glass, no neighbor at the window.'],
        ['dee', 'And this is my list. People who stopped paying me. Their cars sit in their driveways at night. Bring me one, I pay you. Collateral.'],
        ['marco', 'That\'s stealing, Dee.'],
        ['dee', 'It\'s collections. Tommy called it stealing too, right before he took the money. Come back when you\'re ready. There\'s something about him you should see.'],
      ] },
      { do: 'learn', keys: ['ability:lockpick', 'crime:repo', 'garage:dee'] },
    ],
  },
  {
    id: 'a1-espola-run', title: 'Espola Run', giver: 'dee', at: 'deeGarage', type: 'main', act: 1, needs: ['a1-tommys-friend'],
    pitch: 'Tommy\'s record up Espola Road still stands.',
    reward: { money: 300, trust: { dee: 10 } },
    steps: [
      { do: 'talk', lines: [
        ['dee', 'Every Sunday Tommy made me time him. Poway Road to the Lake Poway gate, straight up Espola.'],
        ['dee', 'His record still stands. I never cleared the stopwatch. Couldn\'t.'],
        ['dee', 'You want to know who your brother was? Drive his road. Start line\'s at Espola and Poway Road.'],
      ] },
      { do: 'goto', to: 'espolaStart', r: 14, car: true, text: 'Drive to the <em>start line</em>: Espola Road at Poway Road.' },
      { do: 'race', from: 'espolaStart', to: 'lakeGate', names: ['Espola Road', 'Lake Poway Road'], pace: 22, step: 320, countdown: true,
        parLabel: 'Tommy\'s record', text: 'Beat <em>Tommy\'s record</em> to the Lake Poway gate.', failText: 'Tommy\'s record stands. Try again.' },
      { do: 'phone', from: 'dee', lines: [
        ['dee', '...You beat it. Huh. He\'d have hated that. Then bought you a shake at the Hamburger Factory.'],
        ['dee', 'The Sheriff says he took the lake-road curve at ninety. 2 AM. Alone.'],
        ['dee', 'Tommy drove that road ten thousand times. He didn\'t miss that curve.'],
        ['marco', 'He didn\'t miss it. Somebody put him through it. Black sedan, no lights, a bar across the front.'],
        ['dee', '...A push bar. You know who puts push bars on black sedans, Marco? Come by the shop. Not on the phone.'],
      ] },
    ],
  },
  {
    id: 'a1-night-shift', title: 'Night Shift', giver: 'dee', at: 'deeGarage', type: 'main', act: 1, needs: ['a1-espola-run'],
    pitch: 'What did Tommy really do for Garrett Vance?',
    reward: { money: 600, trust: { dee: 10 } },
    steps: [
      { do: 'talk', lines: [
        ['dee', 'Last year Tommy started working "night shifts" at Vance Prestige Motors. Detailing, he said. At three in the morning.'],
        ['dee', 'Garrett Vance. Nice teeth, city-council regular. Sells luxury cars that don\'t always belong to him.'],
        ['dee', 'A Vance van leaves Danielson Street every night. Follow it. Stay back. Don\'t get seen.'],
      ] },
      { do: 'goto', to: 'vance', r: 30, car: true, text: 'Drive to <em>Vance Prestige Motors</em> on Danielson Street.' },
      { do: 'spawnCar', as: 'van', type: 'van', model: 'delivery', tint: 0x45454d, at: 'vance', ahead: 45, protect: 'The van was destroyed.' },
      { do: 'tail', car: 'van', to: 'ranch', min: 14, max: 120, text: 'Tail the <em>Vance van</em>. Stay back, don\'t lose it.', spotText: 'The driver spotted you.', lostText: 'You lost the van.' },
      { do: 'talk', lines: [['marco', 'A horse ranch off Sycamore Canyon. Nobody keeps horses behind roll-up doors.']] },
      { do: 'thugs', as: 'crew', at: '@van', n: 4, spread: 14, aggro: 40, text: 'Take out <em>Vance\'s crew</em>.' },
      { do: 'pickup', at: '@van', dx: 6, dz: 4, label: 'Tommy\'s work jacket', text: 'Search the <em>barn</em>.' },
      { do: 'talk', lines: [['marco', 'His jacket. "TOMMY" on the patch, grease on the sleeves, a parking stub from Vance\'s lot.']] },
      { do: 'loseCops', if: 'wanted', text: 'Lose the <em>Sheriff</em>.' },
      { do: 'goto', to: 'deeGarage', r: 12, text: 'Bring the jacket to <em>Dee\'s Garage</em>.' },
      { do: 'talk', lines: [
        ['dee', '...That\'s his. He wore it over everything. Even to my birthday.'],
        ['dee', 'So it\'s true. Vance runs stolen cars through that ranch, and Tommy was driving them.'],
        ['marco', 'And when Tommy wanted out, he ended up on Espola Road at 2 AM.'],
        ['dee', 'Say it slow and it sounds like something we can prove. Say it fast and it sounds like revenge.'],
        ['dee', 'One more thing. The cars Vance doesn\'t want end up behind the business park. A salvage yard. Guy called Torque. No paperwork, cash on the hood.'],
        ['dee', 'Tommy sold him a few. Now you know too. I\'m not saying use it. I\'m saying I can\'t pay you what this is going to cost.'],
      ] },
      { do: 'learn', keys: ['crime:chop'] },
    ],
  },
  {
    id: 'a1-personal-effects', title: 'Personal Effects', giver: 'rosa', at: 'home', type: 'main', act: 1, needs: ['a1-night-shift'],
    pitch: 'The Sheriff has Tommy\'s things.',
    reward: { money: 500, trust: { rosa: 15 } },
    steps: [
      { do: 'talk', lines: [
        ['rosa', 'The Sheriff\'s station called. They have Tommy\'s things from the car. A box.'],
        ['rosa', 'I can\'t walk in there. I\'ll see his handwriting on something and fall apart in front of strangers.'],
        ['marco', 'I\'ll go, Ma.'],
      ] },
      { do: 'spawnNpc', as: 'kessler', who: 'kessler', at: 'sheriff' },
      { do: 'goto', to: 'sheriff', r: 16, text: 'Pick up Tommy\'s things at the <em>Poway Sheriff Station</em>.' },
      { do: 'goto', to: '@kessler', r: 5, foot: true, text: 'Talk to <em>Sgt. Kessler</em> out front.' },
      { do: 'talk', lines: [
        ['kessler', 'You\'re the brother. Sergeant Ray Kessler. I wrote up the accident.'],
        ['kessler', 'Phone, wallet, some receipts. The rest went with the car.'],
        ['marco', 'The car went off a curve he drove every week.'],
        ['kessler', 'People drive tired. People drive high. Your brother had both in his history, son.'],
        ['kessler', 'And I hear you\'re telling people about a second car. At two in the morning. In the dark. From a hundred yards.'],
        ['kessler', 'Take the box. Take care of your mother. Let the rest go. That advice is free. It won\'t stay free.'],
      ] },
      { do: 'release', as: 'kessler' },
      { do: 'wait', t: 6, text: 'Head <em>home</em> with the box.' },
      { do: 'pursuers', as: 'hunters', n: 1, crew: 2, armed: true, shake: 260, shakeT: 8, text: '<em>Vance\'s men</em> are on you. Shake them or take them out.' },
      { do: 'loseCops', if: 'wanted', text: 'Lose the <em>Sheriff</em>.' },
      { do: 'goto', to: 'home', r: 10, text: 'Take Tommy\'s things <em>home</em>.' },
      { do: 'talk', lines: [
        ['rosa', 'You\'re bleeding. No. Don\'t tell me. I don\'t want to know what my sons do.'],
        ['rosa', 'His phone still works. It\'s been buzzing in that box for weeks. I couldn\'t look.'],
      ] },
      { do: 'voicemail', id: 'tommy-01', lines: [
        ['tommy', 'Hey. It\'s me. Practicing what I\'m going to say to you tonight, because I\'ll chicken out in person.'],
        ['tommy', 'I did things for Garrett Vance. Bad things. The proof is his own book, and I know where he keeps it.'],
        ['tommy', 'If tonight goes wrong, it wasn\'t an accident. Okay? Don\'t let them call it an accident.'],
      ] },
      { do: 'talk', lines: [
        ['marco', 'Garrett Vance. He said the name on the phone. He knew they were coming, and he called me anyway.'],
        ['rosa', 'Mijo...'],
        ['marco', 'I\'m done promising, Ma.'],
      ] },
      { do: 'learn', keys: ['crime:mugging'] },
      { do: 'act', n: 1, title: 'Homecoming' },
    ],
  },

  // ================================================================== SIDE JOBS
  {
    id: 's-rail-yard', title: 'Rail Yard Rascals', giver: 'walt', at: 'oldPoway', type: 'side', needs: ['a1-homecoming'],
    pitch: 'Taggers keep hitting the old train depot.',
    reward: { money: 150, rep: 4, trust: { walt: 10 } },
    steps: [
      { do: 'talk', lines: [
        ['walt', 'Some little vandals keep tagging the depot. Spray paint on a hundred-year-old train shed!'],
        ['walt', 'Go scare \'em straight. Scare. Not bury. They\'re somebody\'s kids.'],
      ] },
      { do: 'takedown', as: 'taggers', at: 'oldPoway', n: 3, spread: 30, looks: 'tagger', spookR: 18, speed: 5.9, time: 180, pose: 'aim',
        lethalFail: 'Walt said scare them. Not that.', text: 'Catch the <em>taggers</em>. Fists only. They\'re kids.' },
      { do: 'talk', lines: [['walt', 'Ha! They\'ll think twice. Back in my day we vandalized with dignity. Cow tipping.']] },
    ],
  },
  {
    id: 's-gone-fishin', title: 'Gone Fishin\'', giver: 'walt', at: 'oldPoway', type: 'side', needs: ['s-rail-yard'],
    pitch: 'Walt needs a ride to Lake Poway. A gentle one.',
    reward: { money: 250, trust: { walt: 10 } },
    steps: [
      { do: 'talk', lines: [
        ['walt', 'My truck\'s in the shop and the bass at Lake Poway don\'t care about my problems.'],
        ['walt', 'Drive me up there. Gently. I\'ve got a pacemaker and a thermos of coffee, and I\'m protective of both.'],
      ] },
      { do: 'passenger', as: 'walt', who: 'walt' },
      { do: 'comfort', npc: 'walt', to: 'lakeGate', r: 16, text: 'Drive Walt to <em>Lake Poway</em>. Smoothly.',
        failText: 'Walt got out at a red light. "I\'ll take the bus, thank you."',
        stories: [
          [['walt', 'Poway\'s name comes from the Kumeyaay. Pauwai, the place where the valleys meet. Prettiest name a town ever borrowed.']],
          [['walt', 'When I moved here, Poway Road was two lanes and a feed store. Now it\'s two lanes, a feed store and eleven boba shops.']],
          [['walt', 'Your father and I fished the lake before sunrise. He talked about you boys the whole time. Scared off every fish.']],
          [['walt', 'That curve on Espola by the lake road. I pass it every morning.'], ['marco', 'Walt?'],
           ['walt', 'I was on the water that night. I heard it too, son. Two engines. One of them had that big V8 burble the county cars have.'], ['walt', 'Ask me again another day. When I\'m braver.']],
        ] },
      { do: 'dropoff', as: 'walt' },
      { do: 'talk', lines: [['walt', 'Smooth as a Sunday. You drive like your father. Don\'t tell him I said so, wherever he is.']] },
    ],
  },
  {
    id: 's-porch-pirates', title: 'Porch Pirates', giver: 'brenda', at: 'brenda', type: 'side', repeat: 240,
    pitch: 'Brenda posted about it. Nobody did anything.',
    reward: { money: 120, rep: 2 },
    steps: [
      { do: 'talk', pickLines: [
        [['brenda', 'Finally, someone who looks like they have nothing better to do.'],
         ['brenda', 'A man in a hoodie just took a package off the Hendersons\' porch. I posted it. Forty-two comments. Zero action.'],
         ['brenda', 'Get it back. And teach him some manners. Legally.']],
        [['brenda', 'It happened AGAIN. Hoodie, sunglasses, the audacity.'],
         ['brenda', 'That was a limited-edition air fryer. Bring it back.']],
        [['brenda', 'Do you know what a doorbell camera is for? Neither do the porch pirates, apparently.'],
         ['brenda', 'He\'s on foot, two streets over. Go.']],
      ] },
      { do: 'takedown', as: 'pirate', near: 'brenda', min: 140, max: 320, n: 1, looks: 'pirate', spookR: 30, speed: 6.1, carrying: true,
        text: 'Chase down the <em>porch pirate</em>.', escapeText: 'The porch pirate got away.' },
      { do: 'pickup', at: '@pirate', dx: 1.2, label: 'the package', text: 'Grab the <em>package</em>.' },
      { do: 'goto', to: '@brenda', r: 6, text: 'Bring the package back to <em>Brenda</em>.' },
      { do: 'talk', lines: [['brenda', 'Wonderful. I\'m updating the thread: "Local hero, slightly sweaty."']],
        lethalLines: [['brenda', 'I said MANNERS. I\'m deleting my post and you never came here.']] },
    ],
    lethalReward: { money: 25, rep: -5 },
  },
  {
    id: 't-twin-peaks', title: 'Twin Peaks Sprint', giver: 'trial', at: 'twinPeaksW', type: 'trial', repeat: 1, needs: ['a1-espola-run'],
    pitch: 'Time trial: Pomerado Road to Espola Road.',
    reward: { money: 150 },
    steps: [
      { do: 'race', from: 'twinPeaksW', to: 'twinPeaksE', names: ['Twin Peaks Road'], pace: 24, limit: 1.35, step: 300, countdown: true,
        parLabel: 'Par', text: 'Sprint the length of <em>Twin Peaks Road</em>.', failText: 'Out of time.' },
    ],
  },
  {
    id: 't-parkway-night', title: 'Parkway After Dark', giver: 'trial', at: 'parkwayW', type: 'trial', repeat: 1, needs: ['a1-espola-run'],
    when: c => isNight(c.hour), whenText: 'Parkway After Dark runs 8 PM to 5 AM.',
    pitch: 'Night time trial on Scripps Poway Parkway.',
    reward: { money: 250 },
    steps: [
      { do: 'race', from: 'parkwayW', to: 'parkwayE', names: ['Scripps Poway Parkway'], pace: 30, limit: 1.35, step: 420, countdown: true,
        parLabel: 'Par', text: 'Run <em>Scripps Poway Parkway</em> east, flat out.', failText: 'Out of time.' },
    ],
  },
];
export const MISSIONS = [...BASE, ...LINE_MISSIONS, ...STREET_MISSIONS];
