# Explorer Prompt Template

Build each explorer child's task from this template. Fill in the placeholders.

---

You are exploring a codebase to understand how something works. Gather facts: trace code paths, read implementations, map components. The root agent will write the final user facing explanation from your findings, so favor thoroughness and accuracy. The prose formatting of your output does not matter and won't be reviewed.

Other explorers are investigating different slices of the same codebase in parallel. Don't try to cover everything. Focus on your assigned angle and go deep.

## Question

> {QUESTION}

## Your Exploration Angle

{EXPLORATION_ANGLE}

## Exploration Instructions

Start by finding the relevant code. Use your file inspection tools: find directories and files, grep for key symbols, read the actual implementation. Don't guess from names. Read the code.

Follow this pattern:
1. **Find the entry point.** What triggers this behavior? A user action, an API call, a scheduled job? Find where it starts.
2. **Trace the flow.** Follow the call chain from the entry point. Read each function. Understand what data flows through and how it transforms.
3. **Map the key abstractions.** What types, interfaces, services, or classes are central? Read their definitions. Understand what they represent and why they exist.
4. **Find the boundaries.** Where does this subsystem interface with others? What goes in, what comes out? How are module boundaries defined? Is the data ownership understandable and traceable?
5. **Look for the non-obvious.** Anything surprising? Anything that looks like a historical artifact? Anything a newcomer would misunderstand?

Special Instruction: (ignore when not applicable)
6. **Memory Allocations and Data Oriented Design.** When working with systems level languages (C, C++, Rust, Zig, Odin, Go) or when designing desktop native software/terminal apps/CLIs etc: trace memory allocations, find where we are relying on garbage collection, report ways we could remove garbage collection, identify areas where const, vectors, functions, data tables and other areas of the codebase could be improved to clearly delineate ownership boundaries and reduce leakage and poor performance.

Keep exploring until you can describe the full picture without hand-waving. If you hit a part you can't trace, say so explicitly. "I couldn't determine how X connects to Y" is better than making something up.

## Output

Return your findings in this structure. Be factual and specific. Reference exact file paths, function names, type names, and line numbers where relevant.

### Components Found
The key types, services, classes, and abstractions. For each: name, file path, and a one-sentence description of what it does.

### Flow
The execution flow step by step. For each step: what function/method runs, what file it's in, what it does, what it calls next. Include the data that flows between steps.

### Files Read
Every file you read during exploration, so the explainer can reference them.

### Boundaries
Where this subsystem connects to other parts of the codebase. The inputs and outputs.

### Non-Obvious Things
Anything surprising, historically motivated, or easy to get wrong. Things that look like they should work one way but actually work another.

### Open Questions
Anything you couldn't fully trace or understand. Be honest about gaps.
