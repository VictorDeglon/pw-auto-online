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
  // ================================================================== PROLOGUE · LAST RIDE
  // Six years of silence, then Tommy calls. Marco gets off the bus by Poway High with nothing but a bag and a pistol.
  // Everything up to his first car (Impound) also teaches how to play: a step's `tips` bring up how-to-play cards.
  {
    id: 'p0-tommy', title: 'Last Ride', giver: 'tommy', at: 'phs', type: 'main', act: 1, auto: true, offline: true, quiet: true,
    pitch: 'Tommy finally called. He\'s waiting out front of Poway High.',
    reward: { money: 0 },
    steps: [
      { do: 'stage', scene: 'tommy' },
      { do: 'text', from: 'tommy', delay: 1.5, wait: 2.5, msg: 'You actually came. I\'m out front on Espola, by the stadium. Come alone. Don\'t go to Ma\'s yet, she\'ll make you eat.' },
      { do: 'goto', to: '@tommy', r: 14, text: 'Go and talk to <em>Tommy</em>. He\'s out front on Espola Road.', tips: ['look', 'move'] },
      { do: 'goto', to: '@tommy', r: 4, foot: true, text: 'Talk to <em>Tommy</em>.', tips: ['sprint'] },
      { do: 'cutscene', scene: 'tommy' },
      { do: 'wait', t: 1 },
      { do: 'talk', lines: [['marco', 'Black sedan. No lights. A bar across the front. It hit him like it had done it before.']] },
      { do: 'flee', from: '@flash', n: 2, r: 110, to: 'home', text: 'Flashlights. They\'re coming back for the witness. <em>Run.</em> Get to Ma\'s house on Harrow Lane.', tips: ['sprint', 'roll'] },
      { do: 'goto', to: 'home', r: 9, text: 'Get to <em>Ma\'s house</em> on Harrow Lane.' },
      { do: 'act', big: 'ESPOLA ROAD', title: 'By morning they\'ll call it an accident.' },
    ],
  },
  // ================================================================== ACT I · THE DEACON'S DEBT
  {
    id: 'a1-homecoming', title: 'Homecoming', giver: 'rosa', at: 'home', type: 'main', act: 1, needs: ['p0-tommy'],
    pitch: 'Rosa is on the porch, waiting up for a son who isn\'t coming home.',
    reward: { money: 150, trust: { rosa: 10, walt: 5 } },
    steps: [
      { do: 'talk', tips: ['talk'], lines: [
        ['rosa', 'Marco? Mijo, it\'s the middle of the night. Tommy said you might come. He wouldn\'t say why.'],
        ['rosa', 'Why are you shaking? Why do you smell like smoke?'],
        ['marco', 'Ma. Sit down.'],
        ['marco', 'A car ran him off the road. Espola, past the high school. It had no lights on. I was there. I watched it.'],
        ['rosa', 'No. He called me at ten. He said he\'d fix the porch light Sunday. He said...'],
        ['rosa', '...Go inside, Marco. Your room is still your room. I need to sit out here a while.'],
      ] },
      { do: 'card', title: 'FOUR DAYS LATER', sub: 'Old Poway Park', t: 3.4, hour: 10.5 },
      { do: 'talk', lines: [
        ['rosa', 'The Sheriff closed it. "Single-car accident, excessive speed." Sergeant Kessler brought the report himself. With a casserole.'],
        ['marco', 'There were two cars, Ma. I told them. Nobody wrote it down.'],
        ['rosa', 'Then tell it to somebody who can do something with it. The memorial is at Old Poway Park, by the train depot. Walt is driving me.'],
        ['rosa', 'Don\'t be late to your brother\'s memorial. That\'s all I ask. Today, that\'s all.'],
      ] },
      { do: 'stage', scene: 'memorial' },
      { do: 'goto', to: 'oldPoway', r: 30, text: 'Get to Tommy\'s memorial at <em>Old Poway Park</em>.', tips: ['travel', 'map'] },
      { do: 'goto', to: '@walt', r: 7, foot: true, text: 'Join them by the <em>depot</em>.' },
      { do: 'cutscene', scene: 'memorial' },
      { do: 'talk', lines: [
        ['walt', 'Jericho Vance. The Deacon, the people who work for him call him. Sells cars on Danielson Street, coaches Little League, and owns the rest of Poway on the side.'],
        ['walt', 'The Iron Mountain Syndicate, they call it in the canyons. Stolen cars, deputies on his payroll, and a church pew with his name on it.'],
        ['walt', 'Tommy drove for him. I never asked what. That was my mistake, son, not his.'],
        ['marco', 'Forty thousand dollars, Walt. By the first.'],
        ['walt', 'Then you\'d better start collecting. Your brother left something with me for a day like this. A cigar box. Come see me at the depot.'],
      ] },
      { do: 'learn', keys: ['crime:shoplift'] },
    ],
    after: [{ t: 6, text: ['dee', 'Doc. Tommy\'s friend, from the garage. I saw who showed up at the memorial. If you\'re still in town tomorrow you\'ve got more guts than sense. That\'s a compliment.'] }],
  },
  {
    id: 'a1-collections', title: 'Collections', giver: 'walt', at: 'oldPoway', type: 'main', act: 1, needs: ['a1-homecoming'],
    pitch: 'Tommy left Walt a cigar box full of IOUs.',
    reward: { money: 0, trust: { walt: 5 } },
    steps: [
      { do: 'talk', lines: [
        ['walt', 'Tommy\'s cigar box. Rubber bands, a lighter that doesn\'t light, and IOUs. Your brother lent money the way he drove: fast, and to the wrong people.'],
        ['walt', 'The top one: Hector Ibarra, forty-two hundred dollars. Works the door at the Rusty Spur on Poway Road.'],
        ['marco', 'And if Hector doesn\'t feel like paying a dead man?'],
        ['walt', 'Then he pays a live one. Fists, son, not guns. A dead man pays nobody, and a body on Poway Road brings the Sheriff.'],
      ] },
      { do: 'goto', to: 'spur', r: 14, text: 'Find <em>Hector</em> at the Rusty Spur on Poway Road.', tips: ['map'] },
      { do: 'spawnNpc', as: 'hector', who: 'hector', at: 'spur' },
      { do: 'goto', to: '@hector', r: 5, foot: true, text: 'Talk to <em>Hector</em> at the door.' },
      { do: 'talk', lines: [
        ['marco', 'Hector Ibarra? Tommy Reyes says you owe him forty-two hundred dollars.'],
        ['hector', 'Tommy Reyes is dead, compadre. Dead men don\'t collect.'],
        ['marco', 'His brother does.'],
        ['hector', 'Yeah? The Deacon already came by for Tommy\'s debts. Get in line behind God.'],
      ] },
      { do: 'brawl', as: 'hector', who: 'hector', at: 'spur', give: 50, giveUp: 'Okay! OKAY! I\'ll pay! Just stop!', text: 'Teach <em>Hector</em> some manners. Fists only.', tips: ['punch'] },
      { do: 'pay', money: 1200, label: 'Hector\'s first payment.' },
      { do: 'talk', lines: [
        ['hector', 'Twelve hundred. It\'s all I got on me. I swear on my mother.'],
        ['marco', 'I\'ll be back for the rest. Tell the Deacon a Reyes is collecting now.'],
      ] },
      { do: 'loseCops', if: 'wanted', text: 'Somebody called it in. <em>Lose the Sheriff:</em> get out of sight, then out of the circle.', tips: ['stars'] },
      { do: 'phone', from: 'boone', lines: [
        ['boone', 'You the one who just rearranged Hector Ibarra\'s face outside the Spur? Tommy Reyes\'s little brother?'],
        ['marco', 'Who is this?'],
        ['boone', 'Boone Calloway. Six-Shooter, Tommy called me. I rode with him.'],
        ['boone', 'The Deacon\'s men will come for you before the first of the month, debt or no debt. Poway Road Pawn, the back room. You\'re going to want iron.'],
      ] },
    ],
  },
  {
    id: 'a1-iron', title: 'Iron', giver: 'boone', at: 'pawn', type: 'main', act: 1, needs: ['a1-collections'],
    pitch: 'Boone Calloway rode with Tommy. He sells "antiques" out back.',
    reward: { money: 250, trust: { boone: 10 } },
    steps: [
      { do: 'talk', lines: [
        ['boone', 'So you\'re the smart one. Tommy said you were. He also said you couldn\'t hit a barn from inside it.'],
        ['marco', 'I\'ve never needed to.'],
        ['boone', 'You do now. The Deacon has a man named Pike. Cyrus Pike. Wears a mask to work. When the Deacon says a debt is overdue, Pike is the reminder.'],
        ['boone', 'That piece on your hip was Tommy\'s. I kept it oiled for him. Hold Tab and pick it. Bottles out back.'],
      ] },
      { do: 'targets', at: 'pawn', n: 5, text: 'Shoot the <em>bottles</em> on the plank. Right click aims.', tips: ['wheel', 'aim', 'shoot'] },
      { do: 'talk', lines: [
        ['boone', 'Huh. Not bad for a man who never needed to.'],
        ['boone', 'Tommy, me, Doc, a kid called Rattler, and Hollis Shaw. The Dust Devils. Fastest cars in East County. We ran parts up Sycamore Canyon and never shot anybody who didn\'t shoot first.'],
        ['boone', 'Then the Deacon came along. He bought Hollis, Hollis got greedy, and Hollis is under the Mt. Woodson trailhead now. Tommy took the Deacon\'s money after that, and we all stopped talking.'],
        ['marco', 'Where do I find Rattler?'],
        ['boone', 'Boosting cars on Poway Road like it\'s a sport. You need wheels, and that boy needs somebody to be loyal to. Ammo\'s at the counter. Tell them Boone sent you. They won\'t care.'],
      ] },
    ],
  },
  {
    id: 'a1-wheels', title: 'Wheels', giver: 'jesse', at: 'rattler', type: 'main', act: 1, needs: ['a1-iron'],
    pitch: 'Jesse "Rattler" Ortiz boosted cars for Tommy. He\'d like to boost one for you.',
    reward: { money: 300, trust: { jesse: 10, dee: 5 } },
    steps: [
      { do: 'talk', lines: [
        ['jesse', 'No way. Marco Reyes. Tommy talked about you like you were a movie he saw once.'],
        ['jesse', 'Boone says you need wheels. Rule one: never buy what you can borrow forever.'],
        ['jesse', 'Walk up to anything with an engine, hit F. If somebody\'s in it, F pulls them out. You don\'t say sorry. You say "drive safe."'],
        ['marco', 'And where am I driving it?'],
        ['jesse', 'Doc\'s Garage on Kirkham Way. She\'s been waiting four days for you to stop feeling sorry for yourself. Her words.'],
      ] },
      { do: 'goto', to: 'deeGarage', r: 14, car: true, text: 'Drive to <em>Doc\'s Garage</em> on Kirkham Way.', tips: ['car', 'drive', 'radio'] },
      { do: 'spawnNpc', as: 'jesse2', who: 'jesse', at: 'deeGarage' },
      { do: 'talk', lines: [
        ['dee', 'Took you long enough. Nice car. Whose is it?'],
        ['marco', 'Some guy\'s.'],
        ['dee', 'Good answer. Listen. Tommy\'s gold car isn\'t in your mother\'s driveway. Kessler had it towed the morning after. To the Sheriff\'s impound lot. "Evidence."'],
        ['dee', 'Tommy died in a car that wasn\'t his, Marco. So what is his own car evidence of?'],
        ['marco', 'Something Kessler doesn\'t want anybody to find.'],
        ['dee', 'Then tonight we take it back. Rattler, show him the picks.'],
        ['jesse', 'Hold E by a parked car: no alarm, no broken glass, no owner running out in a bathrobe. Tommy taught me. Now I\'m teaching you. Circle of life.'],
      ] },
      { do: 'learn', keys: ['ability:lockpick'] },
      { do: 'release', as: 'jesse2' },
    ],
  },
  {
    id: 'a1-impound', title: 'Impound', giver: 'dee', at: 'deeGarage', type: 'main', act: 1, needs: ['a1-wheels'],
    pitch: 'Tommy\'s gold car is in the Sheriff\'s impound lot. Not for long.',
    reward: { money: 500, trust: { dee: 15, jesse: 5, boone: 5 } },
    steps: [
      { do: 'talk', lines: [
        ['dee', 'The impound lot is behind the Sheriff\'s station. Two deputies on nights, and one of them sleeps.'],
        ['dee', 'Get in quiet. Crouch, stay out of their eyeline. If they see you it gets loud, and loud is fine as long as you\'re fast.'],
        ['dee', 'The gate\'s chained. Tommy\'s car has a V8. Do the math.'],
      ] },
      { do: 'card', title: 'THAT NIGHT', sub: 'Poway Sheriff Station', t: 3, hour: 23.4 },
      { do: 'spawnCar', as: 'gold', type: 'sports', tint: 0xf0b23a, at: 'impound', parked: true, tommy: true, protect: 'Tommy\'s car was destroyed.' },
      { do: 'goto', to: 'impound', r: 70, text: 'Get to the <em>Sheriff\'s impound lot</em>. Leave your ride outside.' },
      { do: 'sneak', at: '@gold', guards: 2, looks: 'deputy', alarm: 'stars', r: 4, text: 'Get to <em>Tommy\'s car</em> without the deputies seeing you.', tips: ['crouch'] },
      { do: 'enterCar', car: 'gold', text: 'Get in <em>Tommy\'s car</em>.' },
      { do: 'heat', n: 2, text: 'The gate alarm is screaming. <em>Go.</em>' },
      { do: 'loseCops', text: 'Lose the <em>Sheriff</em> in Tommy\'s car.', tips: ['stars'] },
      { do: 'learn', keys: ['garage:dee'] },
      { do: 'garageSave', car: 'gold', carName: 'Tommy\'s car', at: 'deeGarage', tommy: true, text: 'Pull into the bay at <em>Doc\'s Garage</em> and press <em>E</em>: save Tommy\'s car.', tips: ['garage'] },
      { do: 'cutscene', scene: 'dustdevils' },
      { do: 'learn', keys: ['crime:repo'] },
      { do: 'act', big: 'THE DUST DEVILS', title: 'Ride again.' },
    ],
    after: [
      { t: 8, text: ['dee', 'Tommy\'s car is yours now. N calls it, anywhere. Save more cars in any garage and I\'ll tune them: engine, brakes, paint, the works.'], tip: 'callcar' },
      { t: 45, text: ['boone', 'Gun dealers are the pink $ on your map. More iron, more ammo, better everything. The Deacon isn\'t buying cheap.'] },
      { t: 85, text: ['jesse', 'Bored? J gets you a courier job anywhere. Honest money. Gross, I know. Car lots sell cars too, if you\'re into paying.'], tip: 'jobs' },
      { t: 130, text: ['walt', 'Your journal\'s under Esc. Who you\'ve met, what you owe, what you know. Mostly what you owe.'], tip: 'journal' },
      { t: 180, text: ['dee', 'One more thing. The banks on Poway Road. Walk in unarmed sometime and hold E at the door. Just looking. Tommy always said looking is free.'] },
    ],
  },
  {
    id: 'a1-tommys-friend', title: 'Repo Man', giver: 'dee', at: 'deeGarage', type: 'main', act: 1, needs: ['a1-impound'],
    pitch: 'Forty thousand dollars is a lot of repos. Start with one.',
    reward: { money: 900, trust: { dee: 15 } },
    steps: [
      { do: 'talk', lines: [
        ['dee', 'You want to pay the Deacon? Start with my list. People who owe me for repairs and stopped answering their phones.'],
        ['dee', 'A guy on High Valley Road owes me nine grand. His SUV sits in his driveway like it\'s paid for. Bring it here and it becomes collateral.'],
        ['dee', 'Don\'t scratch it. And do not bring the Sheriff to my door.'],
      ] },
      { do: 'spawnCar', as: 'suv', type: 'suv', model: 'suv-luxury', tint: 0xd8c8b0, at: 'highValley', parked: true, protect: 'The SUV was destroyed.' },
      { do: 'enterCar', car: 'suv', text: 'Take the <em>SUV</em> parked on High Valley Road. Pick the lock (hold <em>E</em>) and nobody hears a thing.' },
      { do: 'deliver', car: 'suv', carName: 'SUV', to: 'deeGarage', r: 12, noHeat: true, minHealth: 35, wreckText: 'The SUV is totaled. Doc won\'t take scrap.', text: 'Bring the SUV to <em>Doc\'s Garage</em> on Kirkham Way. Don\'t wreck it.' },
      { do: 'talk', lines: [
        ['dee', 'Not bad. Tommy would\'ve done it faster, but he\'d also have eaten a burrito in it.'],
        ['dee', 'That\'s the list from now on. Three cars a day, parked in driveways all over town. Bring them in, I pay you, you pay the Deacon. Everybody\'s happy except the people walking to work.'],
        ['dee', 'And come back when you\'re ready. There\'s something about Tommy you should see for yourself.'],
      ] },
      { do: 'learn', keys: ['crime:repo'] },
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
        ['dee', 'The Sheriff says he took the curve past the high school at ninety. 2 AM. Alone.'],
        ['dee', 'Tommy drove that road ten thousand times. He didn\'t miss that curve.'],
        ['marco', 'He didn\'t miss it. Somebody put him through it. Black sedan, no lights, a bar across the front.'],
        ['dee', '...A push bar. You know who puts push bars on black sedans, Marco? Come by the shop. Not on the phone.'],
      ] },
    ],
  },
  {
    id: 'a1-night-shift', title: 'Night Shift', giver: 'dee', at: 'deeGarage', type: 'main', act: 1, needs: ['a1-espola-run'],
    pitch: 'What did Tommy really do for Jericho Vance?',
    reward: { money: 600, trust: { dee: 10 } },
    steps: [
      { do: 'talk', lines: [
        ['dee', 'Last year Tommy started working "night shifts" at Vance Prestige Motors. Detailing, he said. At three in the morning.'],
        ['dee', 'Jericho Vance. Nice teeth, city-council regular. Sells luxury cars that don\'t always belong to him.'],
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
      { do: 'goto', to: 'deeGarage', r: 12, text: 'Bring the jacket to <em>Doc\'s Garage</em>.' },
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
        ['kessler', 'You\'re the brother. Sergeant Wade Kessler. I wrote up the accident.'],
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
        ['tommy', 'I did things for Jericho Vance. Bad things. The proof is his own book, and I know where he keeps it.'],
        ['tommy', 'If tonight goes wrong, it wasn\'t an accident. Okay? Don\'t let them call it an accident.'],
      ] },
      { do: 'talk', lines: [
        ['marco', 'Jericho Vance. He said the name on the phone. He knew they were coming, and he called me anyway.'],
        ['rosa', 'Mijo...'],
        ['marco', 'I\'m done promising, Ma.'],
      ] },
      { do: 'learn', keys: ['crime:mugging'] },
      { do: 'act', n: 1, title: 'Homecoming' },
    ],
  },

  // ================================================================== SIDE JOBS
  {
    id: 's-rail-yard', title: 'Coyote Colors', giver: 'walt', at: 'oldPoway', type: 'side', needs: ['a1-collections'],
    pitch: 'Somebody is painting coyote skulls on the old depot.',
    reward: { money: 200, rep: 4, trust: { walt: 10 } },
    steps: [
      { do: 'talk', lines: [
        ['walt', 'Somebody\'s painting coyote skulls on my depot. That\'s Los Coyotes marking territory. They\'re pushing into Poway from the east.'],
        ['walt', 'These ones are prospects. Kids who want in. Run them off before somebody older and meaner comes to paint the next one. Fists only. They\'re still somebody\'s kids.'],
      ] },
      { do: 'takedown', as: 'taggers', at: 'oldPoway', n: 3, spread: 30, looks: 'tagger', spookR: 18, speed: 5.9, time: 180, pose: 'aim',
        lethalFail: 'Walt said run them off. Not that.', text: 'Catch the <em>Coyote prospects</em>. Fists only.', tips: ['sprint', 'punch'] },
      { do: 'talk', lines: [['walt', 'They\'ll tell their bosses the depot has a guardian now. Good. Let them wonder who.']] },
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
          [['walt', 'That curve on Espola past the high school. I pass it every morning.'], ['marco', 'Walt?'],
           ['walt', 'I was on the water that night. I heard it too, son. Two engines. One of them had that big V8 burble the county cars have.'], ['walt', 'Ask me again another day. When I\'m braver.']],
        ] },
      { do: 'dropoff', as: 'walt' },
      { do: 'talk', lines: [['walt', 'Smooth as a Sunday. You drive like your father. Don\'t tell him I said so, wherever he is.']] },
    ],
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
