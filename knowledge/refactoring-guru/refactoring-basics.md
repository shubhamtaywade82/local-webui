# Refactoring basics

For the site’s **Refactoring** landing (dirty vs clean code, process, smells, techniques), see `refactoring-section-hub.md` and [Refactoring: clean your code](https://refactoring.guru/refactoring).

**What refactoring is:** small, behavior-preserving edits that improve readability, structure, or performance without changing what the system does for users. It is safest when guarded by fast tests and done in tiny steps you can commit or revert.

**Why it matters:** reduces accidental complexity, makes bugs easier to spot, and lowers the cost of the next feature. It pairs with **technical debt** work: pay down debt when interest (slowdown, defects) exceeds the cost of the fix.

**When to refactor:** before adding a feature that touches messy code (“preparatory refactoring”), after shipping when risk is low, or continuously as part of normal development—not as a big-bang rewrite unless risk is managed.

**Official references**

- [What is refactoring?](https://refactoring.guru/refactoring/what-is-refactoring)
- [Clean code](https://refactoring.guru/refactoring/what-is-refactoring/clean-code)
- [Technical debt](https://refactoring.guru/refactoring/what-is-refactoring/technical-debt)
- [When to refactor](https://refactoring.guru/refactoring/what-is-refactoring/when)
- [How to refactor](https://refactoring.guru/refactoring/what-is-refactoring/how)
