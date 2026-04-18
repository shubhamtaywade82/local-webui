# Refactoring process and safety

The [Refactoring hub](https://refactoring.guru/refactoring) highlights a **stepwise** refactoring process: change a little, verify, repeat. That matches industrial practice: predictable refactors are usually **mechanical moves under test**, not big speculative edits.

**Checklist (original, actionable):**

1. **Know the goal** — behavior unchanged; readability, coupling, or duplication improves.  
2. **Green baseline** — start from passing tests (automated) or the smallest executable check you have.  
3. **One refactor at a time** — e.g. rename only, then extract method, not both mixed in one commit if avoidable.  
4. **Commit or revert points** — each step should be revertible; avoid mixing refactor with feature logic in the same change set when you can.  
5. **Observe** — run tests and critical paths after each step; watch for API and data-shape ripple.  

**Official references**

- [Refactoring process (hub section)](https://refactoring.guru/refactoring) — site’s overview of process  
- [How to refactor](https://refactoring.guru/refactoring/what-is-refactoring/how)  
- [Refactoring catalog](https://refactoring.guru/refactoring/catalog) — concrete techniques  
- [Code smells](https://refactoring.guru/refactoring/smells) — what to look for before choosing a technique  
