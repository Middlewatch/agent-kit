# Glossary

## System-prompt core

The replaceable role and harness prose at the start of Pi's assembled system
prompt. A system-prompt template arranges that core and generated instruction
blocks; a slash-command prompt template sends a user message.

## Instruction scope

The authority recorded when Pi loads an instruction file: global instructions
apply across workspaces, while workspace instructions apply within the loader's
named directory. The file's prose does not determine its scope.

**Current preview.** A reconstruction from Pi's loaded prompt inputs and the
live selected template, without running per-turn extension or provider hooks.
It is transient and has not been sent.
