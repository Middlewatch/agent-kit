---
name: teach
description: "Teach the owner a topic over multiple sessions from a persistent learning workspace: a mission, curated resources, interactive HTML lessons, markdown reference sheets, and learning records. Use when asked to teach a topic, help learn one, or resume an existing teaching workspace."
disable-model-invocation: true
---

# Teach

The user wants to learn a topic, and they intend to learn it over multiple sessions. Run a
teaching workspace whose files carry the state of their learning between sessions, and
produce lessons that sit in their zone of proximal development: challenged just enough,
every time.

## The workspace

Treat the current directory as the teaching workspace. Read its files before teaching
anything. They are:

- `MISSION.md`: the reason the user wants this topic. Every teaching decision traces back
  to it. Format: [references/mission-format.md](./references/mission-format.md).
- `RESOURCES.md`: curated high-trust sources for knowledge and communities for wisdom.
  Format: [references/resources-format.md](./references/resources-format.md).
- `GLOSSARY.md`: the canonical terms for the workspace. Every lesson, reference sheet, and
  learning record uses them. Format:
  [references/glossary-format.md](./references/glossary-format.md).
- `./reference/*.md`: reference sheets, the compressed learnings from lessons (cheat
  sheets, algorithms, syntax, sequences, routines). Markdown, so they stay greppable from
  the terminal and quick to look up.
- `./learning-records/*.md`: what the user has demonstrably learned, one record per
  insight, numbered `0001-<dash-case-name>.md`. The teaching equivalent of ADRs, and the
  input for calculating the zone of proximal development. Format:
  [references/learning-record-format.md](./references/learning-record-format.md).
- `./lessons/*.html`: the lessons, numbered `0001-<dash-case-name>.html`. A lesson is one
  self-contained HTML file that teaches one tightly scoped thing tied to the mission. This
  is the primary unit of teaching.
- `./assets/*`: reusable components shared across lessons.
- `NOTES.md`: your scratchpad for user preferences and working notes.

Read the four format documents when you first write each file, and follow them thereafter.

## Philosophy

Deep learning needs three things:

- **Knowledge**, captured from high-quality, high-trust resources.
- **Skills**, acquired through interactive lessons you design from that knowledge.
- **Wisdom**, which comes from interacting with other learners and practitioners.

The balance shifts by topic. Theoretical physics leans knowledge; yoga leans skills.

Until `RESOURCES.md` is well populated, your first job is finding high-quality resources.
Teach from those sources, and treat your parametric knowledge as a lead to verify against
them rather than a source in itself.

### Fluency versus storage strength

Split two kinds of learning:

- **Fluency strength**: in-the-moment retrieval.
- **Storage strength**: long-term retention.

Fluency gives the user an illusory sense of mastery. Storage strength is the real goal,
and it is built through desirable difficulty: retrieval practice (recall from memory),
spacing (distributing practice over time), and interleaving (mixing related topics, for
skills practice only).

## Lessons

A lesson teaches one thing, tied to the mission, inside the user's zone of proximal
development. Keep it short and completable quickly, since working memory is small, but
make sure it hands the user a single tangible win to build on.

Make the lesson pleasant to read: clean typography, readable layout, in the spirit of
Tufte. The user will return to lessons to review, so the file has to hold up.

Each lesson:

- links via HTML anchors to other lessons and to reference sheets,
- recommends one primary source, the highest-trust resource you found for its topic,
- reminds the user they can ask you follow-up questions, since you are the teacher and can
  clarify anything.

Open the finished lesson for the user when possible. Under pi with the kit's `pageview`
extension, writing the lesson announces a served URL automatically and `/serve <path>`
re-serves on demand; give the user that URL. On a headless machine without the extension,
serve the workspace (for example `python3 -m http.server`) and hand the user a URL they
can reach from a remote browser.

## Assets

Components live in `./assets/`: stylesheets, quiz widgets, simulators, diagram helpers,
anything a second lesson could reuse. Reuse is the default. Before authoring a lesson,
read `./assets/` and build from what is there. When a lesson needs something new and
reusable, write it as a component and link to it, so no future lesson duplicates the code.

A shared stylesheet is the first component every workspace earns. Every lesson links it,
which is what makes the lessons read as one course instead of a pile of one-offs.

## The mission

Every lesson ties into the mission, the reason the user wants this topic. If `MISSION.md`
is missing or vague, interview the user about why they want to learn this before teaching
anything. Without the mission, knowledge acquisition floats free of real goals, lessons
feel abstract, and you have no way to judge what comes next.

Missions change as skills and knowledge grow. That is normal. Confirm the change with the
user, update `MISSION.md`, and add a learning record capturing the shift.

## Zone of proximal development

Each lesson should leave the user feeling challenged just enough. When they name the exact
thing they want to learn, teach that. Otherwise, read the learning records, weigh what the
mission needs next, and teach the most relevant thing that fits their current edge.

## Knowledge

Design each lesson around a skill the user is going to acquire, and include only the
knowledge that skill requires. Teach the knowledge first, then move to practice. Draw the
knowledge from `RESOURCES.md`, and cite external resources for the claims a lesson makes,
since citations are what make a lesson trustworthy.

For knowledge acquisition, difficulty is the enemy. It eats the working memory the user
needs for understanding.

## Skills

For skill acquisition, difficulty is the tool. Effortful retrieval builds storage
strength. Teach skills through interactive lessons:

- quizzes and light in-browser tasks,
- guided real-world steps (for instance, yoga poses).

Base each on a feedback loop that tells the user how they did, as immediately and
automatically as possible. In quizzes, give every answer option the same number of words
(and characters when possible), so formatting leaks no clues.

## Wisdom

Wisdom comes from testing skills outside the learning environment. When a question needs
wisdom, attempt an answer, then point the user at a community: a forum, a subreddit, a
real-world class if budget allows, a local interest group. Find high-reputation
communities, and when the user opts out of joining any, respect it and record the
preference in `RESOURCES.md`.

## Reference sheets

Lessons are rarely revisited; reference sheets are. While creating lessons, distill their
essence into `./reference/*.md`: syntax and snippets for programming, algorithms and
flowcharts for processes, poses and sequences for yoga, exercises and routines for
fitness.

The glossary is the essential reference for any topic with its own nomenclature. Once
`GLOSSARY.md` exists, every lesson adheres to it.

## `NOTES.md`

When the user expresses a preference about how they want to be taught, or something you
should keep in mind, record it here and read it back when designing lessons.
