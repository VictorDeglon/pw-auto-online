# Skill tree 2.0

**Built (first pass):** Driver, Gunfighter, Survivor, Hustler, Crew and four hybrid perks, 42 skills, as
`SKILLS` in `server/nakama/index.js` (the server is the source of truth; the tables below were the starting design
and differ in places). Rows open at 5, 12 and 18 points spent in a tree. The whole tree costs 221 points; level 100
gives about 108. Not built yet: the Pilot tree, training, mastery, gear and prestige.

## Original design

A bigger character build that grows out of the 15 skills the server has today (`SKILLS` in
`server/nakama/index.js`). Everything here stays server-checked: the room owns points, ranks and every bonus, the
browser only shows them.

## Goals

- Nobody can max everything. A level 100 player gets about 108 points; the full tree costs well over 300, so a build is
  a real choice.
- Every tree has a fork near the top: two capstones, you get one.
- Two trees together unlock hybrid perks, so mixed builds have their own payoff.
- Points aren't the only way up: you also get better by doing things (training, mastery, gear, prestige).

## Points

- 1 point per level, 2 every 10th level (as now), plus 1 for every 5 mastery tiers (below). About 130 at most.
- Rank n of a skill costs n points (as now).
- **Tiers:** each tree has three rows. Row 2 opens after 8 points in that tree, row 3 after 20, the capstone after 35.
- **Respec:** free once a day (as now); a second one the same day costs cash, 5,000 x level.

## Trees

Six trees, the three we have plus three new ones. "Today" marks skills that already exist.

### Driver

| Row | Skill | Ranks | Effect |
|---|---|---|---|
| 1 | Tuned Engine (today) | 5 | +4% top speed and acceleration |
| 1 | Track Tires (today) | 3 | +6% steering |
| 1 | Reinforced Frame (today) | 5 | -8% damage to your car |
| 2 | Nitrous (today) | 3 | 1 s of boost per rank |
| 2 | Road Mechanic (today) | 3 | your car slowly repairs |
| 2 | Drifter | 3 | drifting fills nitro and pays a little XP |
| 2 | Off-Roader | 3 | -25% brush and dirt slowdown, no fence damage at rank 3 |
| 3 | Hot-Wire | 2 | steal locked cars faster; rank 2 skips the alarm |
| 3 | Air Control | 3 | steer in the air; works with the Hydraulic jump |
| Cap | **Getaway Driver** | 1 | police lose you 40% faster while you drive |
| Cap | **Demolition** | 1 | ramming does double damage, your car takes half |

### Gunfighter

| Row | Skill | Ranks | Effect |
|---|---|---|---|
| 1 | Marksman (today) | 5 | +4% weapon damage |
| 1 | Steady Hands (today) | 3 | -10% spread |
| 1 | Deep Pockets (today) | 3 | +15% ammo carried |
| 2 | Quick Trigger (today) | 3 | +5% fire rate |
| 2 | Fast Hands | 3 | -10% reload and weapon swap time |
| 2 | Drive-By | 3 | -15% spread while shooting from a car |
| 3 | Bounty Hunter (today) | 3 | +20% XP for player kills |
| 3 | Headhunter | 3 | +10% headshot damage |
| Cap | **Dead Eye** | 1 | hold aim to slow time for 2 s (single player); online: a short zoom with no sway |
| Cap | **Heavy Gunner** | 1 | carry a rocket launcher and minigun with no speed loss |

### Survivor

| Row | Skill | Ranks | Effect |
|---|---|---|---|
| 1 | Thick Skin (today) | 5 | -5% damage taken |
| 1 | Cardio (today) | 3 | +5% running speed |
| 1 | Second Wind (today) | 3 | faster healing out of a fight |
| 2 | Low Profile (today) | 3 | wanted level cools 15% faster |
| 2 | Comeback (today) | 3 | respawn shield |
| 2 | Climber | 2 | climb walls and fences faster; rank 2 no fall damage under 8 m |
| 3 | Scavenger | 3 | more ammo and health from drops |
| 3 | Swimmer | 2 | swim faster, hold your breath longer |
| Cap | **Last Stand** | 1 | once a life, at 0 health you keep fighting for 5 s |
| Cap | **Ghost** | 1 | crouching in brush hides you from police and NPCs |

### Hustler (new)

Money, stores and jobs.

| Row | Skill | Ranks | Effect |
|---|---|---|---|
| 1 | Haggler | 5 | -4% shop prices |
| 1 | Pickpocket | 3 | more cash from NPCs and robberies |
| 1 | Hard Worker | 3 | +10% job pay |
| 2 | Fence | 3 | sell stolen cars for more |
| 2 | Smooth Talker | 2 | a robbed store calls the police later |
| 2 | Landlord | 3 | +10% income from owned places (see "Owning places" in TODO.md) |
| 3 | Big Score | 3 | robberies and heists pay +10% |
| 3 | Connections | 2 | rank 2: call a car to your spot from your garage |
| Cap | **Kingpin** | 1 | owned places pay twice as often |
| Cap | **Tax Free** | 1 | dying no longer drops cash |

### Pilot (new)

Planes, the helicopter and boats.

| Row | Skill | Ranks | Effect |
|---|---|---|---|
| 1 | Flight School | 3 | +8% plane and helicopter handling |
| 1 | Sea Legs | 3 | +6% boat speed |
| 1 | Soft Landing | 2 | less damage from rough landings |
| 2 | Afterburner | 3 | a jet boost, like nitro |
| 2 | Hover | 2 | the helicopter holds still in strong wind |
| 2 | Cargo Runner | 3 | +10% pay for cargo flights |
| 3 | Flak Jacket | 3 | -10% damage to your aircraft |
| 3 | Parachute Pro | 2 | open low and steer the chute |
| Cap | **Ace** | 1 | lock-on for aircraft weapons |
| Cap | **Smuggler** | 1 | flying low keeps you off police radar |

### Crew (new)

Playing with others: gangs, companions, team modes.

| Row | Skill | Ranks | Effect |
|---|---|---|---|
| 1 | Leader | 3 | one more companion per rank (E) |
| 1 | Medic | 3 | revive downed crew faster |
| 1 | Rally | 3 | crew near you heal 5% faster |
| 2 | Spotter | 2 | enemies you hit show on your crew's map for 5 s |
| 2 | Wheelman | 3 | passengers take -10% damage |
| 2 | Recruiter | 2 | companions have more health and better aim |
| 3 | Turf Boss | 3 | +10% from gang turf (see "Gangs" in TODO.md) |
| 3 | Shared Stash | 1 | crew can take ammo from you |
| Cap | **Warlord** | 1 | your crew gets +5% damage while you're alive |
| Cap | **Guardian** | 1 | crew near you take -10% damage |

## Hybrid perks

Need the named points in both trees. One point each.

| Perk | Needs | Effect |
|---|---|---|
| Stunt Pilot | Driver 15 + Pilot 15 | a car leaving a ramp glides further; planes roll faster |
| Outlaw | Gunfighter 15 + Survivor 15 | +10% damage while wanted |
| Heist Crew | Hustler 15 + Crew 15 | heists need one less player |
| Drive-By Master | Driver 15 + Gunfighter 15 | full accuracy from cars |
| Bush Pilot | Pilot 15 + Survivor 15 | land planes on dirt and hills |
| Fixer | Hustler 15 + Survivor 15 | buy your way out of 1 wanted star |

## Other ways to upgrade your character

### Training (get better by doing it)

Five stats from 0 to 100. They go up as you use them, slowly fade if you stop, and give small bonuses (about +10% at 100).

| Stat | Trained by | Gives |
|---|---|---|
| Stamina | running, swimming, climbing | sprint longer |
| Strength | melee, carrying, climbing | melee damage, less knockback |
| Shooting | hits | less recoil |
| Driving | clean driving, near misses, races | better handling |
| Flying | flight time, landings | steadier aircraft |

The gym at a plaza and the shooting range at a gun store train faster for cash.

### Mastery

- **Weapons:** kills with a weapon raise its mastery (5 tiers): camos, then attachments (scope, extended mag,
  suppressor), then a small bonus at tier 5.
- **Cars:** distance driven in a model unlocks paint, rims and one tune slot per tier.
- Every 5 mastery tiers across everything gives 1 skill point.

### Gear

- **Armour:** light, medium and heavy vests from the stores; heavier means slower.
- **Clothing perks:** a few outfits carry a small perk (running shoes +3% speed, hi-vis vest: police ignore you on jobs).
- **Gadgets:** binoculars, lockpicks, repair kit, flare, grappling hook.

### Prestige

At level 100 you can prestige: back to level 1 with skills reset, keeping mastery, cash and gear. Each prestige
gives a badge by your name, +1 starting point and one permanent pick (a hybrid perk with no requirements, or one
skill at rank 1 for free). Up to 10 times.

## Building it

1. Server: extend `SKILLS` with `row`, `capOf` and `hybrid`; checks for tier gates and capstone pairs; keep old ranks
   when the format changes (existing players keep what they bought).
2. Server: training and mastery counters in `progress/stats`, with rate limits like the NPC kills.
3. UI: a skill screen with six tabs, the rows and the fork, plus a "planner" that tries out a build before you spend.
4. Game: hook each effect into the code it changes (cars, weapons, police, shops, aircraft, companions).
5. Balance pass online: damage caps in the room have to include the new bonuses.
