# Planning map

The Long-horizon planning playbook imports this by path. The pattern is
adapted from the `wayfinder` skill in Matt Pocock's skills repo
(github.com/mattpocock/skills, MIT), rebuilt on a repo document instead of
an issue tracker.

## Claim

A spec session assumes its open decisions converge in one grilling
conversation. Some efforts carry more than that: the answers depend on
research, prototypes, or owner rulings that each need their own session, and
a spec written over the open forks encodes guesses. The planning map holds
those open decisions in the repo so sessions can resolve them one at a time.
The map produces decisions and hands each settled region to the `spec`
skill. Slices and build steps stay in the spec.

## The map document

One markdown file per effort, `docs/plans/<slug>.md` in the repo the effort
belongs to. Sections, in order:

- **Goal.** What this planning effort ends with: the spec, decision, or
  change it is working toward. One or two lines. Every session orients here
  before choosing a question, and the goal fixes the scope.
- **Notes.** Domain, skills every session should consult, standing owner
  preferences for this effort.
- **Decisions.** One line per resolved question: the gist of the answer plus
  a link to where the detail lives (an ADR, a spec, a research note). A
  decision lives in one place; the map indexes it without restating it.
- **Open questions.** The questions that can be stated sharply now, each
  sized to one session. Give each a type (below) and name its blockers:
  `after <question>` means resolve that one first. A blocked question stays
  listed until its blockers resolve.
- **Not yet specifiable.** Areas the effort will have to settle that cannot
  be phrased as a sharp question yet, written as loosely as the current view
  allows. The placement test: can you state the question precisely now,
  regardless of whether you can answer it. Sharp goes to Open questions and
  vague stays here. Leave this section coarse; one area may graduate into
  several questions, or none, once its blockers resolve.
- **Out of scope.** Work consciously ruled outside the goal, one line each
  with the reason. Ruled-out work returns only if the owner redraws the
  goal, and then as a fresh effort.

## Question types

Each type names the estate mechanism that resolves it:

- **Research.** A fact outside the repo that a decision waits on. Delegate
  research children per the delegation standard, or run the `deep-research`
  skill when the answer should persist as its own artifact. Research is the
  one type that may batch: several questions can run in one session.
- **Prototype.** A fork that observing an artifact settles faster than
  arguing. Run the Prototype playbook and link the verdict.
- **Grilling.** A judgment call only the owner can make. Ask in
  `ask_user_question` rounds as the `spec` skill does. The owner answers;
  a session that fills in the owner's rulings has produced fiction.
- **Task.** Manual work that blocks a decision rather than informing it:
  provisioning access, signing up for a service, moving data so its shape
  can be seen. Do it directly when the agent can; generate a `wizard` when
  only the owner can. The decision line records what was done and the facts
  later questions depend on.

## Session rules

- Resolve one question per session (research batches excepted). The map is
  the cross-session memory; trust it over recollection.
- After resolving: append the Decision line, delete the question, graduate
  anything the answer made specifiable from Not yet specifiable into Open
  questions, and delete questions the answer invalidated. When the answer
  shows a question sits outside the goal, move its gist to Out of scope
  instead of resolving it.
- When a settled region is big enough to build, hand it to the `spec` skill
  in its own session and link the resulting spec from Decisions. The map is
  done when Open questions and Not yet specifiable are both empty.
- Commit the map edit with the session's other artifacts; the diff is the
  session's planning record.
