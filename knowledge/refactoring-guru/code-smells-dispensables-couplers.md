# Code smells — Dispensables & couplers

**Dispensables** add noise: dead code, speculative hooks, duplicate logic, or classes that only hold data with no behavior. Deletion and consolidation usually beat cleverness.

**Couplers** tie modules too tightly: excessive imports, long chains of getters, “middle man” objects that only forward calls, or feature envy where one object constantly reaches into another’s fields.

**Official catalogs**

- [Dispensables](https://refactoring.guru/refactoring/smells/dispensables)
- [Couplers](https://refactoring.guru/refactoring/smells/couplers)
- [Feature Envy](https://refactoring.guru/refactoring/smells/feature-envy)
- [Inappropriate Intimacy](https://refactoring.guru/refactoring/smells/inappropriate-intimacy)
- [Message Chains](https://refactoring.guru/refactoring/smells/message-chains)
- [Middle Man](https://refactoring.guru/refactoring/smells/middle-man)
