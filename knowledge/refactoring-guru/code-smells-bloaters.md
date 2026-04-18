# Code smells — Bloaters

Bloaters are structures that have grown too large for clarity. Typical symptoms: methods or classes that do too many unrelated things, primitive values standing in for real concepts, duplicated parameter groups, or long argument lists that obscure intent.

**Heuristic:** if you need several comments to explain control flow in one method, or a class name ends with `Util`/`Manager` while touching unrelated concerns, look here first.

**Official catalog**

- [Bloaters](https://refactoring.guru/refactoring/smells/bloaters)
- [Long Method](https://refactoring.guru/refactoring/smells/long-method)
- [Large Class](https://refactoring.guru/refactoring/smells/large-class)
- [Primitive Obsession](https://refactoring.guru/refactoring/smells/primitive-obsession)
- [Long Parameter List](https://refactoring.guru/refactoring/smells/long-parameter-list)
- [Data Clumps](https://refactoring.guru/refactoring/smells/data-clumps)
