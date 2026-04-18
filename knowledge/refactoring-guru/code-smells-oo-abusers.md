# Code smells — Object-orientation abusers

These smells suggest inheritance, conditionals, or state are fighting the domain model: switches on type, half-used subclass hooks, parallel class hierarchies, or APIs that force callers to know too much about internals.

**Heuristic:** repeated `switch` on the same discriminant, or subclasses that override most methods with empty bodies, often signal a missing polymorphic abstraction.

**Official catalog**

- [Object-orientation abusers](https://refactoring.guru/refactoring/smells/object-orientation-abusers)
- [Switch Statements](https://refactoring.guru/refactoring/smells/switch-statements)
- [Temporary Field](https://refactoring.guru/refactoring/smells/temporary-field)
- [Refused Bequest](https://refactoring.guru/refactoring/smells/refused-bequest)
- [Alternative Classes with Different Interfaces](https://refactoring.guru/refactoring/smells/alternative-classes-with-different-interfaces)
