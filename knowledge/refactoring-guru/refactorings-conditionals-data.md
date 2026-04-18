# Refactorings — Conditionals, data, and boundaries

Common moves: **decompose conditional**, **replace nested conditional with guard clauses**, **replace conditional with polymorphism**, **introduce parameter object**, **preserve whole object**, **encapsulate collection**, and refactors that move fields/methods between types to restore cohesion.

**Heuristic:** deep nesting often yields to guards plus extracted predicates or polymorphic dispatch on a small strategy set.

**Official entry points**

- [Refactoring catalog](https://refactoring.guru/refactoring/catalog) — sections *Simplifying Conditional Expressions*, *Organizing Data*, *Simplifying Method Calls*, *Moving Features between Objects*
