### Prototype

**You own the verdict; the code is throwaway.** For "prototype", "mock it
up", "sketch this", "try this layout", or an empirical fork (which behavior,
which timing, which approach) that observation settles faster than argument.
Distinct from Investigation, which reads instead of building, and from
feature work, which routes to `spec`/`build`.

1. Run the `prototype` skill: name the one question the prototype exists to
   answer, pick the question shape, build throwaway in the unversioned
   `spikes/` directory (or the scratchpad), one command to run.
2. When the design space is open, gather references before building: prior
   art, a short moodboard of themes, palettes, and layouts, and let the
   owner pick a direction. Skip when the direction is set.
3. When comparing alternatives, build genuinely different variants behind
   one switcher (buttons or a keypress), each labeled so the owner can name
   it (exhaust-the-design-space).
4. Observe on the matching surface: serve a visual variant to the owner (the
   `pageview` extension announces written HTML) and let them drive it; log
   the timing or print the output for a behavioral one. Observation, not
   assertion, decides.
5. Capture the verdict and delete the code, per the skill's capture rule. A
   settled feature direction hands off to `spec`; a still-contested shape
   goes to the Interrogate playbook.

**Reply:** the question, the variants explored, the evidence, tradeoffs,
your recommendation, the artifact path, and a plain statement that the code
is throwaway.
