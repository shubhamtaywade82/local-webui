# Refactoring.Guru — “Refactoring” hub (`/refactoring`)

This note mirrors the **top-level sections** of the official [Refactoring hub](https://refactoring.guru/refactoring): what refactoring is for, how “dirty” vs “clean” code is framed on the site, why the **process** (small steps + verification) matters, how **code smells** relate to problems worth fixing, and how **refactoring techniques** (the catalog) map to concrete moves.

Use this file when you want RAG to anchor on the **refactoring** vertical (not only design patterns).

## Start here (official)

- [Refactoring: clean your code](https://refactoring.guru/refactoring) — landing page for the whole refactoring track  
- [Start from the very beginning](https://refactoring.guru/refactoring/what-is-refactoring) — “what is refactoring” thread on the site  
- [Refactoring course (premium)](https://refactoring.guru/refactoring/course) — structured course advertised from the hub  

## Five themes from the hub (original summaries)

1. **Dirty code (site framing)** — the hub describes “dirty” code as what accumulates under pressure: shortcuts, weak conventions, and rushed design. Treat it as a **risk signal**, not a moral judgment: name the concrete symptoms (smells), then reduce risk with tests and small refactors.  
2. **Clean code** — the site ties clean code to readability, maintainability, and predictable change. In practice: clear naming, low duplication, small units, and tests that describe behavior. Official: [Clean code (under refactoring)](https://refactoring.guru/refactoring/what-is-refactoring/clean-code).  
3. **Refactoring process** — the hub stresses **incremental** change and **checking** after each step so behavior stays stable. Pair refactors with a fast feedback loop (tests, types, smallest deployable slice). Official: [How to refactor](https://refactoring.guru/refactoring/what-is-refactoring/how).  
4. **Code smells** — smells are **heuristics**: recurring shapes that often correlate with design or process problems. Fixing a smell can be quick; repeating smells may mean the model or boundaries are wrong. Official: [Code smells](https://refactoring.guru/refactoring/smells).  
5. **Refactoring techniques** — the catalog lists named moves (extract method, move field, etc.). Each has tradeoffs; pick one that matches the smell and the test safety you have. Official: [Refactoring catalog](https://refactoring.guru/refactoring/catalog).  

## Related local KB files

- `refactoring-basics.md` — debt, when/how links  
- `dirty-code-and-pressures.md` — causes and responses  
- `refactoring-process-and-safety.md` — stepwise workflow  
- `code-smells-*.md` — smell groups + links  
- `refactorings-*.md` — technique families + catalog link  
