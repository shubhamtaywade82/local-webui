# Dirty code — pressures and responses

The [Refactoring hub](https://refactoring.guru/refactoring) introduces **dirty code** as what tends to appear when experience, time pressure, weak coordination, and shortcuts stack up. The point is not to shame authors but to **recognize systemic causes** so fixes stick: clearer requirements, smaller batches, review, and time for cleanup.

**Practical responses (original):**

- **Make risk visible:** list failing tests, hot spots in churn, and incidents tied to modules.  
- **Shrink the change surface:** boundaries, seams, and characterization tests before large edits.  
- **Prefer steady cleanup** over a freeze-for-rewrite unless risk is explicitly managed.  
- **Tie cleanup to product work:** preparatory refactors right before the feature that needs the area stable.  

**Official context (same site family)**

- [Refactoring landing](https://refactoring.guru/refactoring) — dirty vs clean framing  
- [What is refactoring?](https://refactoring.guru/refactoring/what-is-refactoring) — motivation and clean-code discussion on the site  
- [Technical debt](https://refactoring.guru/refactoring/what-is-refactoring/technical-debt) — debt as a refactoring driver  
- [When to refactor](https://refactoring.guru/refactoring/what-is-refactoring/when) — timing heuristics  
