# Allocation experiments

Input: Synthetic demo: previous seven-site baseline and final nine-hub network; three household seeds

All profiles protect required needs before capacity, utilization, supplies, and travel.
Search status OPTIMAL proves that profile's objective; FEASIBLE/TIME_LIMIT/UNKNOWN does not.

| Scenario | Seed | Profile | Unassigned | Unmet | Overflow | Empty/full sites | Utilization range | No-car mean/p95 km | All mean km | Search |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | ---: | --- |
| previous_seven_sites | 42 | needs_first | 0 | 0 | 0 | 1/3 | 0%–100% | 6.259/13.52 | 6.691 | OPTIMAL |
| base | 42 | needs_first | 0 | 0 | 0 | 4/2 | 0%–100% | 3.001/5.809 | 3.192 | OPTIMAL |
| base | 42 | headroom | 0 | 0 | 0 | 4/0 | 0%–85% | 3.001/5.809 | 3.347 | OPTIMAL |
| base | 7 | needs_first | 0 | 0 | 0 | 4/3 | 0%–100% | 3.099/5.665 | 3.183 | OPTIMAL |
| base | 7 | headroom | 0 | 0 | 0 | 4/0 | 0%–85% | 3.099/5.665 | 3.385 | OPTIMAL |
| base | 97 | needs_first | 0 | 0 | 0 | 4/3 | 0%–100% | 3.041/5.658 | 3.224 | OPTIMAL |
| base | 97 | headroom | 0 | 0 | 0 | 4/0 | 0%–85% | 3.041/5.658 | 3.432 | OPTIMAL |
| base | 42 | balanced | 0 | 0 | 0 | 0/0 | 45%–50% | 2.627/4.471 | 3.654 | OPTIMAL |
| capacity_shortage | 42 | balanced | 0 | 0 | 347 | 0/9 | 113%–115% | 2.627/4.471 | 6.857 | UNKNOWN |
| medical_outage | 42 | balanced | 0 | 270 | 0 | 0/0 | 45%–50% | 2.61/4.471 | 3.589 | OPTIMAL |
| shelter_closed | 42 | balanced | 0 | 0 | 0 | 0/0 | 65%–70% | 3.011/6.639 | 3.715 | OPTIMAL |
| no_open | 42 | balanced | 1000 | 0 | 0 | 0/0 | — | None/None | None | NO_DESTINATION |
| base | 7 | balanced | 0 | 0 | 0 | 0/0 | 45%–50% | 2.728/5.042 | 3.731 | OPTIMAL |
| capacity_shortage | 7 | balanced | 0 | 0 | 347 | 0/9 | 114%–115% | 2.728/5.042 | 6.928 | UNKNOWN |
| medical_outage | 7 | balanced | 0 | 265 | 0 | 0/0 | 45%–50% | 2.713/5.042 | 3.674 | OPTIMAL |
| shelter_closed | 7 | balanced | 0 | 0 | 0 | 0/0 | 65%–68% | 3.077/6.377 | 3.864 | OPTIMAL |
| no_open | 7 | balanced | 1000 | 0 | 0 | 0/0 | — | None/None | None | NO_DESTINATION |
| base | 97 | balanced | 0 | 0 | 0 | 0/0 | 45%–50% | 2.672/4.824 | 3.65 | OPTIMAL |
| capacity_shortage | 97 | balanced | 0 | 0 | 411 | 0/9 | 117%–117% | 2.672/4.824 | 6.708 | UNKNOWN |
| medical_outage | 97 | balanced | 0 | 263 | 0 | 0/0 | 45%–50% | 2.659/4.824 | 6.92 | FEASIBLE |
| shelter_closed | 97 | balanced | 0 | 0 | 0 | 0/0 | 65%–70% | 3.015/6.037 | 3.684 | OPTIMAL |
| no_open | 97 | balanced | 1000 | 0 | 0 | 0/0 | — | None/None | None | NO_DESTINATION |

Suggested profile: **balanced**.
Measured base scenarios only; not a universal optimum or clinical validation.

## Per-site base results

### needs_first (seed 42)

| Shelter | Assigned people | Usable capacity | Utilization |
| --- | ---: | ---: | ---: |
| Palmetto Ridge / Corkscrew School Hub | 879 | 1800 | 48.8% |
| Cypress Palm / Sabal Palm School Hub | 620 | 1200 | 51.7% |
| Big Cypress / Max Hasse Community Hub | 498 | 500 | 99.6% |
| Estates Elementary School | 0 | 500 | 0.0% |
| Big Corkscrew Island Regional Park | 0 | 500 | 0.0% |
| Estates Branch Library | 250 | 250 | 100.0% |
| Palmetto Elementary School | 500 | 500 | 100.0% |
| Bear Creek Elementary School | 0 | 500 | 0.0% |
| Greater Naples Fire Rescue Station 74 | 0 | 250 | 0.0% |

### headroom (seed 42)

| Shelter | Assigned people | Usable capacity | Utilization |
| --- | ---: | ---: | ---: |
| Palmetto Ridge / Corkscrew School Hub | 987 | 1800 | 54.8% |
| Cypress Palm / Sabal Palm School Hub | 698 | 1200 | 58.2% |
| Big Cypress / Max Hasse Community Hub | 425 | 500 | 85.0% |
| Estates Elementary School | 0 | 500 | 0.0% |
| Big Corkscrew Island Regional Park | 0 | 500 | 0.0% |
| Estates Branch Library | 212 | 250 | 84.8% |
| Palmetto Elementary School | 425 | 500 | 85.0% |
| Bear Creek Elementary School | 0 | 500 | 0.0% |
| Greater Naples Fire Rescue Station 74 | 0 | 250 | 0.0% |

### balanced (seed 42)

| Shelter | Assigned people | Usable capacity | Utilization |
| --- | ---: | ---: | ---: |
| Palmetto Ridge / Corkscrew School Hub | 810 | 1800 | 45.0% |
| Cypress Palm / Sabal Palm School Hub | 540 | 1200 | 45.0% |
| Big Cypress / Max Hasse Community Hub | 250 | 500 | 50.0% |
| Estates Elementary School | 225 | 500 | 45.0% |
| Big Corkscrew Island Regional Park | 225 | 500 | 45.0% |
| Estates Branch Library | 125 | 250 | 50.0% |
| Palmetto Elementary School | 234 | 500 | 46.8% |
| Bear Creek Elementary School | 225 | 500 | 45.0% |
| Greater Naples Fire Rescue Station 74 | 113 | 250 | 45.2% |


## Interpretation

- Zero unmet needs means every assigned household matches the current broad capability flags; specific treatments and inventory are not verified.
- Missing medical support and closed-site scenarios expose infrastructure gaps. Priority changes cannot create missing capabilities or destinations.
- Travel is straight-line distance. Balance can increase travel and exposure to limited supply labels; compare those columns before choosing a profile.
- assignments.csv contains every per-household result; report.json includes per-site loads, unmet requirements, repeat moves, and solver bounds.
