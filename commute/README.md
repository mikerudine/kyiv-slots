# Дорога на Осокорки (commute)

Turn-based mini-game for *One Day in Kyiv*: get from Obolon (right bank) to Osokorky (left bank) before the 00:00 curfew, starting at 17:00 with 500 UAH.

- The map is a graph of real-ish Kyiv points and bridges (Pivnichnyi, Metro, Paton, Pivdennyi, Darnytskyi).
- At every stop the city offers **two** transport options, plus walking (very slow) and a taxi (surge, often unaffordable) that are always there.
- You can't take the route you just used straight back.
- **Bridges are the core dilemma.** The five bridges are Pivnichnyi, Metro, Paton, Pivdennyi and Darnytskyi. Each one lets only certain transport across:
  - Metro bridge: metro, walking and buses.
  - Paton: road transport only, no walking.
  - Pivdennyi: cars, marshrutkas, buses and metro.
  - Darnytskyi: city train, marshrutkas and taxis.
  - After every turn the city may start or end an air alert, close or reopen bridges, and drop one allowed transport type. During an alert the Metro bridge always closes. A status panel under the map shows every bridge, and the map draws closed bridges in red.
- Once you reach the left bank you are never sent back across the river: no offered option, wrong-way bus, walk or taxi crosses back. The left bank has extra stops (Lisovyi masyv, Lisova, Chernihivska, Rusanivka, Bereznyaky, Vyrlytsia, Boryspilska), so there's still room for trouble there.
- The trip log scrolls and keeps the whole trip. The end screen has a "📜 Read the whole trip" view.
- If nothing at all can go, a ⏳ wait (20 min) option appears.
- Every ride comes with trouble (v3 adds road accidents, scooters dying after 5 min, wrong-direction metro, a frozen "Kyiv Digital" ticket app, motorcades, a dead phone (coffee shop, 50 UAH, 30 min), chatty friends, downpours, crowd-closed metro, a taxi driver who has never heard of Osokorky, a driver who may stop at a shelter during an alert, construction-site dead ends, the marshrutka overshooting your stop (35% of rides), and GPS jamming during alerts that "puts you in Peru" and gets you lost): air alerts, blackouts, tunnel stops, buses once an hour or going the wrong way, marshrutka queues, "no seats", being dropped halfway, dead trams, jammed bridges, rain, taxi cancellations, dead scooters.
- The city prefers to offer options that lead away from the goal or are slow.
- Balance (bots in `window.__commute.simulate(n, smart)`): random play arrives about 3–4% of the time; a greedy "skilled" bot arrives about 34%.
- Hand-drawn pixel style: a 120×124 canvas upscaled with `image-rendering: pixelated`. The lines are jittered with a fixed seed so they never wiggle, and nothing scrolls.

Live: https://mikerudine.github.io/kyiv-slots/menu/ → commute

## v4: transport realism
- **City train:** it only runs on the ring line, Petrivka (Zenit) – Troieshchyna – Darnytsia – Vydubychi – Karavaievi Dachi – Sviatoshyn – Petrivka, so you only get it when you're at one of those stations. Even there it's offered about 60% of the time.
- **Speed tram:** right bank Starovokzalna – Borshchahivka, left bank Troieshchyna – Livoberezhna.
- **Metro:** offered at most every 3–4 turns ("maybe you'll get lucky").
- **New stops:** Karavaievi Dachi, Sviatoshyn, Starovokzalna, Borshchahivka.
