# Дорога на Осокорки (commute)

Turn-based mini-game for *One Day in Kyiv*: get from Obolon (right bank) to Osokorky (left bank) before the 00:00 curfew, starting at 17:00 with 200 UAH.

- The map is a graph of real-ish Kyiv points and bridges (Pivnichnyi, Metro, Paton, Pivdennyi, Darnytskyi).
- At every stop the city offers **two** transport options, plus walking (very slow) and a taxi (surge, often unaffordable) that are always there.
- You can't take the route you just used straight back.
- Every ride comes with trouble: air alerts, blackouts, tunnel stops, buses once an hour or going the wrong way, marshrutka queues, "no seats", being dropped halfway, dead trams, jammed bridges, rain, taxi cancellations, dead scooters.
- The city prefers to offer options that lead away from the goal or are slow.
- Balance (bots in `window.__commute.simulate(n, smart)`): random play arrives about 3% of the time; a greedy "skilled" bot arrives about 35%.
- Hand-drawn pixel style: a 120×124 canvas upscaled with `image-rendering: pixelated`. The lines are jittered with a fixed seed so they never wiggle, and nothing scrolls.

Live: https://mikerudine.github.io/kyiv-slots/menu/ → commute
