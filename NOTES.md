send inputs every time theyre pressed (or very often).

sending them every tick is arbritrary and lowers chance of arriving before next tick.

save every 100 milliseconds and squash. that way you dont need to squash for all inputs

global should be clonable. // recursive clone

entities have children and parents. // parent child index tracking

entities are constructed from old unused instances. // create(game, ..args) / dispose()

entities have data on them as interfaces. // Player / IPlayer
