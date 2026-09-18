# Implementation rationale

TypeScript loads configured action functions dynamically. Go registers functions programmatically, while its configuration still controls which actions run and their order. Go watches through polling rather than the TypeScript watcher.

A pattern's readable diagnostic rendering is not a unique identity. Keys and values may contain delimiters, so canonical identity must retain structure instead of joining unescaped key/value text.

Sources: [Go model](go/model.go), [message processing](go/msg.go), [agent guide](AGENTS.md).
