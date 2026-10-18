// Street jobs: short side missions where somebody teaches Marco a new way to make money he shouldn't (each one opens
// a crime in src/story/crimes.js). They hang off the main storylines, so they open in order with them:
//   Lucky Break (pickpocketing, the fence) → Cat Scratch (catalytic converters) → Open House (burglary)
//   Card Tricks (ATM skimming) → Register (store stick-ups)
// Each also drops a piece of what really happened to Tommy. Step types: src/story/story.js.
// Everyone here is fictional; the places are real.

const isNight = h => h >= 21 || h < 5;

export const STREET_MISSIONS = [
  {
    id: 'c-lucky', title: 'Lucky Break', giver: 'lucky', at: 'lucky', type: 'side', needs: ['a1-tommys-friend'],
    pitch: 'Tommy owed a pawnbroker on Poway Road. She\'d like to discuss it.',
    reward: { money: 150, trust: { lucky: 10 } },
    steps: [
      { do: 'talk', lines: [
        ['lucky', 'So you\'re the other Reyes. Tommy had your chin. He also had my eleven hundred dollars.'],
        ['lucky', 'I don\'t sue, I don\'t send letters, and I don\'t forgive. I do take installments.'],
        ['marco', 'I don\'t have eleven hundred dollars.'],
        ['lucky', 'Nobody in your family ever does. Old Poway Park. Saturday crowd, train rides, kettle corn. People carry their wallets in their back pockets like it\'s 1955.'],
        ['lucky', 'Walk up behind somebody. Slow hands. If they turn around, you\'re just a man who bumped into them. Bring me two.'],
      ] },
      { do: 'learn', keys: ['crime:pickpocket'] },
      { do: 'crime', kind: 'pickpocket', n: 2, at: 'oldPoway', text: 'Lift <em>two wallets</em>: walk up behind someone and hold <em>E</em>. Don\'t let them turn around.' },
      { do: 'goto', to: 'lucky', r: 6, foot: true, text: 'Bring them to <em>Lucky</em> on Poway Road.' },
      { do: 'talk', lines: [
        ['lucky', 'Look at that. Tommy took three weeks to learn what you did in an afternoon.'],
        ['lucky', 'Debt\'s paid down. And now you know where I am. Whatever you find lying around Poway, I buy. Not cars. I\'m a lady.'],
        ['lucky', 'Something else, since you\'re family. Tommy pawned his class ring here the week before. Came back two days later and paid it off in cash. New hundreds. In order.'],
        ['marco', 'Where does Tommy get new hundreds?'],
        ['lucky', 'From somebody who gets them from a bank. Ask yourself who in this town pays people like that.'],
      ] },
      { do: 'learn', keys: ['crime:fence'] },
    ],
  },
  {
    id: 'c-cat-scratch', title: 'Cat Scratch', giver: 'lucky', at: 'lucky', type: 'side', needs: ['c-lucky', 'a1-night-shift'],
    pitch: 'Lucky has a buyer for precious metals. The kind bolted under cars.',
    reward: { money: 250, trust: { lucky: 10 } },
    steps: [
      { do: 'talk', lines: [
        ['lucky', 'Rhodium, palladium, platinum. You know where you find all three in Poway? Under every hybrid in every driveway.'],
        ['lucky', 'Catalytic converters. Get down under the car, saw it off, two minutes of the worst noise you ever heard. I pay two, three hundred each.'],
        ['marco', 'People will hear that.'],
        ['lucky', 'People hear everything. Then they say "I thought it was a leaf blower." Do it where nobody\'s looking, if you\'ve got a brain.'],
      ] },
      { do: 'learn', keys: ['crime:parts'] },
      { do: 'crime', kind: 'parts', n: 1, text: 'Crouch (<em>C</em>) next to a <em>parked car</em> and hold <em>E</em> to saw off the converter.' },
      { do: 'goto', to: 'lucky', r: 6, foot: true, text: 'Bring the converter to <em>Lucky</em>.' },
      { do: 'talk', lines: [
        ['lucky', 'Beautiful. Ugly, but beautiful.'],
        ['lucky', 'You know who never brought me parts? Tommy. Too proud. He did whole cars, for Vance.'],
        ['lucky', 'And Vance pays his drivers through a feed store up Sycamore Canyon. The Salas place. Money goes in as horse feed and comes out clean.'],
      ] },
    ],
  },
  {
    id: 'c-open-house', title: 'Open House', giver: 'lucky', at: 'lucky', type: 'side', needs: ['c-lucky', 'a2-paper-trail'],
    when: c => isNight(c.hour), whenText: 'Lucky: "Burglary is a night job, sweetheart. Come back after nine."',
    pitch: 'Vance\'s ledger has his customers\' names in it. Lucky has ideas.',
    reward: { money: 400, trust: { lucky: 10 } },
    steps: [
      { do: 'talk', lines: [
        ['lucky', 'Dee showed me a page of that book. Don\'t look at me like that, she wanted a fence\'s opinion. Those are customers, Marco. People who buy stolen SUVs.'],
        ['lucky', 'Rich and careless, and they can\'t call the Sheriff about what\'s in their own house without explaining where it came from.'],
        ['marco', 'You want me to rob Vance\'s customers.'],
        ['lucky', 'I want you to visit them. At night, when the lights are off and the house is empty. Mostly empty. Bring me something nice.'],
      ] },
      { do: 'learn', keys: ['crime:burglary'] },
      { do: 'crime', kind: 'burglary', n: 1, night: true, nightText: 'Wait for <em>9 PM</em>. Burglary is a night job.', text: 'Break into a <em>house with its lights off</em>: hold <em>E</em> at the front door.' },
      { do: 'goto', to: 'lucky', r: 6, foot: true, text: 'Bring it to <em>Lucky</em>.' },
      { do: 'talk', lines: [
        ['lucky', 'A jewelry box with somebody else\'s initials, and a laptop with a sticky note that says PASSWORD. People.'],
        ['lucky', 'One name in that book wasn\'t a customer, by the way. "K." Paid monthly. Never bought a car. Vance pays him like a utility bill.'],
        ['marco', 'Kessler.'],
        ['lucky', 'I didn\'t say that. I sell guitars.'],
      ] },
    ],
  },
  {
    id: 'c-card-tricks', title: 'Card Tricks', giver: 'nina', at: 'canyonMouth', type: 'side', needs: ['n2-wrong-lane'],
    pitch: 'Nina has a gadget that eats bank cards.',
    reward: { money: 300 },
    steps: [
      { do: 'talk', lines: [
        ['nina', 'This is a skimmer. It sits over the card slot on an ATM and remembers everyone who uses it.'],
        ['nina', 'Banks put cameras over the machines. Cameras record, and the footage takes a little while to reach anyone who cares.'],
        ['marco', 'So I shoot the camera.'],
        ['nina', 'Or you don\'t stand where it can see you. Either way it\'s quieter than a robbery. Plant it, come back in a few hours, bring me the numbers.'],
      ] },
      { do: 'learn', keys: ['crime:skim'] },
      { do: 'crime', kind: 'skim:plant', n: 1, text: 'Plant the skimmer on a bank\'s <em>ATM</em> (hold <em>E</em>). Watch for the camera.' },
      { do: 'crime', kind: 'skim', n: 1, text: 'Give it a few hours (3 minutes), then <em>collect the skimmer</em>.' },
      { do: 'loseCops', if: 'wanted', text: 'Lose the <em>Sheriff</em>.' },
      { do: 'goto', to: 'canyonMouth', r: 12, text: 'Bring the numbers to <em>Nina</em>.' },
      { do: 'talk', lines: [
        ['nina', 'Four hundred cards. My uncle\'s accountant would cry. He\'s only allowed to launder money, not make it.'],
        ['nina', 'Funny thing. Half of Vance\'s payroll banks at the same branch on Poway Road. Including a Sheriff\'s sergeant who makes a lot more than a sergeant makes.'],
      ] },
    ],
  },
  {
    id: 'c-register', title: 'Register', giver: 'nina', at: 'canyonMouth', type: 'side', needs: ['n3-second-opinion'],
    pitch: 'Nina wants to see if your hands stay steady.',
    reward: { money: 400 },
    steps: [
      { do: 'talk', lines: [
        ['nina', 'My uncle says you can\'t trust a man until you\'ve watched him point a gun at a stranger. My uncle says a lot of things.'],
        ['nina', 'Gun out, calm voice, take what they give you. Every store has a silent alarm. You get about half a minute before the Sheriff knows. Less if the clerk is quick.'],
        ['nina', 'Pick any one. A gas station is good. Nobody in a gas station at night wants to be a hero.'],
      ] },
      { do: 'learn', keys: ['crime:stickup'] },
      { do: 'crime', kind: 'stickup', n: 1, text: 'Hold up a <em>store or gas station</em>: gun out, hold <em>E</em> at the door. Then get out.' },
      { do: 'loseCops', if: 'wanted', text: 'Lose the <em>Sheriff</em>.' },
      { do: 'goto', to: 'canyonMouth', r: 12, text: 'Back to <em>Nina</em>.' },
      { do: 'talk', lines: [
        ['nina', 'Steady. Tommy\'s hands were steady too, before the pills.'],
        ['marco', 'You knew Tommy?'],
        ['nina', 'Everybody who moved anything up this canyon knew Tommy. He drove for Vance, and Vance stores in our barns.'],
        ['nina', 'The night he died, his wasn\'t the only car that left our yard. A black one went out ten minutes after him, lights off. My uncle told me not to remember it.'],
      ] },
    ],
  },
];
