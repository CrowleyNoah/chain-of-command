# Chain of Command - a military idle game

Drill to earn supplies, recruit troops that earn while you sleep, buy gear, send missions,
catch supply crates, and get promoted (promotion = prestige: reset for permanent medals).

## Run / install
Same as the calculator: publish this folder (GitHub Pages etc.), open the https link in Chrome,
menu -> Install app. Or just double-click index.html to try it on a PC.
After changing files, bump VERSION in sw.js (coc-v1 -> coc-v2).

## Change things
- config.js: your callsign (name) and colors.
- core.js: ALL the numbers - units, costs, upgrades, ranks, missions, achievements, story lines.
  Check pacing with:  node tests/sim.js
- Save is stored on each device. Command tab -> Export / Import moves it between phone and PC.
