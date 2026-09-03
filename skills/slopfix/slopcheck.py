#!/usr/bin/env python3
"""slopcheck: score markdown or plain text against the mechanical half of the
house prose standard.

This is the slopfix skill's own tool, stdlib-only. The external harnesses in
tests/ drive this script by
path and pin the caller's contract: exit codes, flag discrimination, the
partition, the matchers, profiles, and overlays. Run them after any edit:

    python3 tests/test_cli.py ./slopcheck.py
    python3 tests/test_behaviors.py ./slopcheck.py
    python3 tests/test_overlay.py ./slopcheck.py
    python3 tests/test_technical.py ./slopcheck.py
    python3 tests/test_notation.py ./slopcheck.py

Layout, top to bottom: scan (partition, segmentation, statistics), profiles
(rules, thresholds, the house lexicon, overlays), check (matchers and flag
decisions), report (rendering), and the CLI. Policy lives in the profiles;
scan measures facts; check decides flags; report only renders.
"""

import bisect
import sys

# ---------------------------------------------------------------------------
# scan: partition, segmentation, statistics
# ---------------------------------------------------------------------------

# Partitioning is the whole reason this is not a one-pass regex. A
# command-heavy README legitimately has almost no prose, and scoring its
# bullet list for burstiness produces a confident wrong answer. Fenced code
# is dropped entirely; inline code spans become the placeholder word "code"
# so they count toward sentence length without polluting a lexicon scan.

EM_DASH = b"\xe2\x80\x94"
MID_BAND_LOW, MID_BAND_HIGH = 14, 22

DIGITS = frozenset(range(ord("0"), ord("9") + 1))
UPPER = frozenset(range(ord("A"), ord("Z") + 1))
LOWER = frozenset(range(ord("a"), ord("z") + 1))
ALPHA = UPPER | LOWER
ALNUM = ALPHA | DIGITS
# Word bytes hold contractions and compounds together; the matchers use the
# same predicate for word boundaries, so tokenization and matching cannot
# drift apart.
WORD = ALNUM | {ord("'"), ord("-")}


class Stats:
    """Profile-independent measurements. A number here is a fact about the
    document; whether it is good or bad is decided in check."""

    def __init__(self):
        self.total_lines = 0
        self.prose_lines = 0
        self.nonprose_lines = 0
        self.list_dominant = False
        self.words = 0
        self.unique_words = 0
        self.sentences = 0
        self.mean_len = 0.0
        self.stdev_len = 0.0
        self.cv = 0.0
        self.mid_band = 0.0
        self.ttr = 0.0
        self.em_dashes = 0

    def per_1k(self, n):
        return 0.0 if self.words == 0 else n * 1000.0 / self.words


class Analysis:
    """One document's measurements: the partitioned prose stream, its
    lowercased copy, source-sized natural-language and heading masks (every
    excluded byte NUL), the prose-to-source line map, and the stats."""

    def __init__(self, prose, lowered, surface, headings, seg_starts, seg_lines, stats):
        self.prose = prose
        self.lowered = lowered
        self.surface = surface
        self.headings = headings
        self.seg_starts = seg_starts
        self.seg_lines = seg_lines
        self.stats = stats

    def prose_line(self, off):
        """Map an offset in prose (or lowered) to its 1-based source line."""
        idx = bisect.bisect_right(self.seg_starts, off)
        return 0 if idx == 0 else self.seg_lines[idx - 1]


def fence_marker(t):
    """A fence marker on a trimmed line: three or more backticks or tildes at
    the start. Returns (char, run_length) or None."""
    if len(t) < 3:
        return None
    c = t[0]
    if c not in (ord("`"), ord("~")):
        return None
    n = 0
    while n < len(t) and t[n] == c:
        n += 1
    return (c, n) if n >= 3 else None


def is_list_marker(line):
    t = line.lstrip(b" \t")
    if len(t) < 2:
        return False
    if t[0] in (ord("-"), ord("*"), ord("+")) and t[1] in (ord(" "), ord("\t")):
        return True
    i = 0
    while i < len(t) and t[i] in DIGITS:
        i += 1
    return i > 0 and i + 1 < len(t) and t[i] in (ord("."), ord(")")) and t[i + 1] == ord(" ")


def is_non_prose(line):
    """Structure rather than prose: heading, table row, blockquote, indented
    code block, or list item."""
    t = line.lstrip(b" \t")
    if not t:
        return False  # blank: counted separately
    if t[0] in (ord("#"), ord("|"), ord(">")):
        return True
    if line.startswith(b"    ") or line.startswith(b"\t"):
        return True
    return is_list_marker(t)


def atx_heading_content(line):
    """First content byte of a supported ATX heading: zero to three ASCII
    spaces, one to six hashes, then an ASCII space. Returns offset or None."""
    i = 0
    while i < len(line) and i < 4 and line[i] == ord(" "):
        i += 1
    if i > 3:
        return None
    hashes = _byte_run(line, i, ord("#"))
    if hashes < 1 or hashes > 6:
        return None
    i += hashes
    if i >= len(line) or line[i] != ord(" "):
        return None
    while i < len(line) and line[i] in (ord(" "), ord("\t")):
        i += 1
    return i


def _byte_run(line, start, want):
    i = start
    while i < len(line) and line[i] == want:
        i += 1
    return i - start


def _is_escaped(line, at):
    backslashes = 0
    i = at - 1
    while i >= 0 and line[i] == ord("\\"):
        backslashes += 1
        i -= 1
    return backslashes % 2 == 1


def _matching_backtick_end(line, start, want):
    i = start
    while i < len(line):
        if line[i] != ord("`"):
            i += 1
            continue
        run = _byte_run(line, i, ord("`"))
        if run == want:
            return i + run
        i += run
    return None


def _link_destination_end(line, start):
    for i in range(start, len(line)):
        if line[i] == ord(")") and not _is_escaped(line, i):
            return i + 1
    return None


def copy_surface_line(dst, base, line, include, state):
    """Copy one line's natural-language bytes into the source-sized mask.
    Excluded bytes stay NUL. HTML comments are inline state because they may
    open or close mid-line; `state` is a one-element list holding the
    in-comment flag."""
    i = 0
    while i < len(line):
        if state[0]:
            rel = line.find(b"-->", i)
            if rel < 0:
                return
            i = rel + 3
            state[0] = False
            if not include:
                return
            continue
        if not include:
            return

        if line.startswith(b"<!--", i):
            state[0] = True
            i += 4
        elif line[i] == ord("`"):
            run = _byte_run(line, i, ord("`"))
            end = _matching_backtick_end(line, i + run, run)
            if end is not None:
                i = end
                continue
            dst[base + i : base + i + run] = line[i : i + run]
            i += run
        elif line[i] == ord("]") and i + 1 < len(line) and line[i + 1] == ord("(") \
                and not _is_escaped(line, i):
            end = _link_destination_end(line, i + 2)
            if end is not None:
                i = end
                continue
            dst[base + i] = line[i]
            i += 1
        else:
            dst[base + i] = line[i]
            i += 1


def append_stripped(out, line):
    """Append one prose line with inline code spans replaced by the
    placeholder word "code", link targets dropped, link text and emphasis
    content kept."""
    i = 0
    while i < len(line):
        c = line[i]
        if c == ord("`"):
            rel = line.find(b"`", i + 1)
            if rel < 0:
                out.append(c)
                i += 1
                continue
            out += b"code"
            i = rel + 1
        elif c == ord("(") and i > 0 and line[i - 1] == ord("]"):
            rel = line.find(b")", i + 1)
            if rel < 0:
                out.append(c)
                i += 1
                continue
            i = rel + 1  # drop the URL entirely
        elif c in (ord("["), ord("]"), ord("*"), ord("_")):
            i += 1  # drop emphasis and link brackets, keep the text
        else:
            out.append(c)
            i += 1


def partition(text):
    prose = bytearray()
    st = Stats()
    surface = bytearray(len(text))
    headings = bytearray(len(text))
    comment_state = [False]

    # The open fence, or None. CommonMark: only a line of the same character,
    # at least as long, and with no info string closes it — a ``` line inside
    # a ~~~ fence is content, not a toggle. Surface fence state is tracked
    # independently of the legacy prose partition.
    open_fence = None
    surface_fence = None
    # A list item's wrapped continuation lines are indented and carry no
    # marker of their own. Without this state they read as prose, which both
    # pollutes the lexicon scan and counts fragments as sentences.
    in_list = False
    seg_starts, seg_lines = [], []

    offset = 0
    for line in bytes(text).split(b"\n"):
        line_start = offset
        line_end = line_start + len(line)
        has_newline = line_end < len(text)
        if has_newline:
            surface[line_end] = ord("\n")
            headings[line_end] = ord("\n")
        offset = line_end + 1 if has_newline else line_end

        st.total_lines += 1
        t = line.strip(b" \t\r")
        indented_code = line.startswith(b"    ") or line.startswith(b"\t")

        surface_excluded = False
        if surface_fence is not None:
            surface_excluded = True
            if not indented_code:
                m = fence_marker(t)
                if m and m[0] == surface_fence[0] and m[1] >= surface_fence[1] \
                        and m[1] == len(t):
                    surface_fence = None
        elif not comment_state[0] and not indented_code:
            m = fence_marker(t)
            if m:
                surface_fence = m
                surface_excluded = True
        if not surface_excluded:
            include_surface = not indented_code
            copy_surface_line(surface, line_start, line, include_surface, comment_state)
            if include_surface:
                content_start = atx_heading_content(line)
                if content_start is not None:
                    lo = line_start + content_start
                    headings[lo:line_end] = surface[lo:line_end]

        if open_fence is not None:
            m = fence_marker(t)
            if m and m[0] == open_fence[0] and m[1] >= open_fence[1] and m[1] == len(t):
                open_fence = None
            st.nonprose_lines += 1
            continue
        m = fence_marker(t)
        if m:
            open_fence = m
            st.nonprose_lines += 1
            continue

        if not t:
            continue

        indented = len(line) > 0 and line[0] in (ord(" "), ord("\t"))
        if is_non_prose(line):
            if is_list_marker(line):
                in_list = True
            st.nonprose_lines += 1
            continue
        if in_list and indented:
            st.nonprose_lines += 1
            continue
        in_list = False

        st.prose_lines += 1
        seg_starts.append(len(prose))
        seg_lines.append(st.total_lines)
        append_stripped(prose, t)
        prose.append(ord(" "))

    nonblank = st.prose_lines + st.nonprose_lines
    st.list_dominant = nonblank > 0 and st.prose_lines * 2 < nonblank

    prose = bytes(prose)
    return Analysis(prose, prose.lower(), bytes(surface), bytes(headings),
                    seg_starts, seg_lines, st)


# Sentence segmentation is where a naive split on '.' produces nonsense: an
# abbreviation, an initial, or a decimal point is not a sentence boundary,
# and getting this wrong moves every shape statistic at once.

# Deliberately short: every entry also suppresses a real terminator when the
# same word legitimately ends a sentence, so only near-unambiguous
# abbreviations belong. ("no" is handled separately — it needs a digit.)
ABBREVIATIONS = frozenset(
    [b"mr", b"mrs", b"ms", b"dr", b"st", b"vs",
     b"etc", b"eg", b"ie", b"fig", b"approx", b"dept"])
MAX_ABBREVIATION_LEN = 8


def _is_abbreviation(s, i):
    start = i
    while start > 0 and s[start - 1] in ALPHA:
        start -= 1
    if start == i:
        return False  # no alphabetic token before the period
    if start > 0 and s[start - 1] in ALNUM:
        return False  # "1st."
    token = s[start:i]
    if len(token) == 1:
        return True  # an initial or a chain segment: "U.S.", "John F."
    if len(token) > MAX_ABBREVIATION_LEN:
        return False
    low = token.lower()
    if low == b"no":
        # "no" is a common sentence-final word; only "No. 5" style counts.
        j = i + 1
        while j < len(s) and s[j] == ord(" "):
            j += 1
        return j < len(s) and s[j] in DIGITS
    return low in ABBREVIATIONS


def _is_terminator(s, i):
    c = s[i]
    if c not in (ord("."), ord("!"), ord("?")):
        return False
    if c == ord("."):
        if i + 1 < len(s) and s[i + 1] in DIGITS:
            return False  # 17.31
        if _is_abbreviation(s, i):
            return False  # "U.S. Army", "etc. The"
    j = i + 1
    while j < len(s) and s[j] in (ord(" "), ord('"'), ord(")"), ord("'")):
        j += 1
    if j >= len(s):
        return True
    return s[j] in UPPER or s[j] in DIGITS


def sentence_lengths(s):
    """Word count of each sentence. Trailing text with no terminator is still
    a sentence: a document rarely ends in recognized punctuation."""
    lengths = []
    words = 0
    k = 0
    while k < len(s):
        if s[k] in WORD:
            words += 1
            while k < len(s) and s[k] in WORD:
                k += 1
            continue
        if _is_terminator(s, k):
            if words > 0:
                lengths.append(words)
            words = 0
        k += 1
    if words > 0:
        lengths.append(words)
    return lengths


def tokenize(low):
    """Split prose into words. A token that does not open with an alphanumeric
    — a bare hyphen or apostrophe run — is consumed but not counted."""
    words = []
    i = 0
    while i < len(low):
        if low[i] not in WORD:
            i += 1
            continue
        start = i
        while i < len(low) and low[i] in WORD:
            i += 1
        if low[start] in ALNUM:
            words.append(low[start:i])
    return words


def measure(a):
    st = a.stats
    words = tokenize(a.lowered)
    st.words = len(words)
    if st.words:
        st.unique_words = len(set(words))
        st.ttr = st.unique_words / st.words

    lengths = sentence_lengths(a.prose)
    st.sentences = len(lengths)
    if st.sentences:
        mean = sum(lengths) / st.sentences
        var = sum((n - mean) ** 2 for n in lengths) / st.sentences
        st.mean_len = mean
        st.stdev_len = var ** 0.5
        if mean > 0:
            st.cv = st.stdev_len / mean
        mid = sum(1 for n in lengths if MID_BAND_LOW <= n <= MID_BAND_HIGH)
        st.mid_band = mid / st.sentences

    st.em_dashes = a.surface.count(EM_DASH)


def analyze(text):
    a = partition(text)
    measure(a)
    return a


# ---------------------------------------------------------------------------
# profiles: rules, thresholds, lexicon, overlays
# ---------------------------------------------------------------------------

# Match kinds. Each is a different answer to "when is this term actually the
# tell?", and every one exists because the alternative produced a false
# positive on a live document.
M_WORD = "word"              # whole word, case-insensitive
M_WORD_LOWER = "word-lower"  # whole word, only where the document wrote it lowercase
M_PHRASE = "phrase"          # phrase anywhere, bounded at both ends
M_SENT_INIT = "sent-init"    # phrase only at the start of a sentence
M_DISCOURSE = "discourse"    # sentence-initial word followed by a comma
M_SUBSTRING = "substring"    # anywhere, no boundaries; contractions

C_FOCAL, C_SOFT, C_SIGNPOST, C_CLOSING, C_SYCOPHANCY, C_CONTRACTION = (
    "focal", "soft", "signposting", "closing", "sycophancy", "contraction")

FLAG, INFO = "flag", "info"

# The house avoid list: a *surface* signal, secondary to grounding,
# dependency, and density. Re-grounding it is a commit here carrying its
# evidence; the retired Go tree's docs/ (in git history) hold the corpus
# sweeps behind each match-kind demotion. Deliberately absent: "harness"
# (house vocabulary for a conformance harness), sentence fragments, and
# second-person address.
HOUSE_LEXICON = [
    # Single words that cluster in generated prose, on word boundaries.
    (b"delve", C_FOCAL, M_WORD), (b"delves", C_FOCAL, M_WORD),
    (b"delved", C_FOCAL, M_WORD), (b"delving", C_FOCAL, M_WORD),
    (b"tapestry", C_FOCAL, M_WORD), (b"pivotal", C_FOCAL, M_WORD),
    (b"intricate", C_FOCAL, M_WORD), (b"intricacy", C_FOCAL, M_WORD),
    (b"intricacies", C_FOCAL, M_WORD), (b"meticulously", C_FOCAL, M_WORD),
    (b"meticulous", C_FOCAL, M_WORD), (b"multifaceted", C_FOCAL, M_WORD),
    (b"seamless", C_FOCAL, M_WORD), (b"seamlessly", C_FOCAL, M_WORD),
    (b"testament", C_FOCAL, M_WORD), (b"foster", C_FOCAL, M_WORD),
    (b"fosters", C_FOCAL, M_WORD), (b"fostering", C_FOCAL, M_WORD),
    (b"elevate", C_FOCAL, M_WORD), (b"elevates", C_FOCAL, M_WORD),
    (b"elevating", C_FOCAL, M_WORD), (b"holistic", C_FOCAL, M_WORD),
    (b"ever-evolving", C_FOCAL, M_WORD), (b"beacon", C_FOCAL, M_WORD),
    (b"cornerstone", C_FOCAL, M_WORD), (b"myriad", C_FOCAL, M_WORD),
    (b"plethora", C_FOCAL, M_WORD), (b"empower", C_FOCAL, M_WORD),
    (b"empowers", C_FOCAL, M_WORD),
    # Lowercase-only: the capitalized form is a proper noun (Amazon Bedrock).
    (b"bedrock", C_FOCAL, M_WORD_LOWER),
    # Words whose slop use cannot be told from a legitimate domain use
    # without judgment; reported, never flagged.
    (b"leverage", C_SOFT, M_WORD), (b"leverages", C_SOFT, M_WORD),
    (b"leveraging", C_SOFT, M_WORD), (b"robust", C_SOFT, M_WORD),
    (b"comprehensive", C_SOFT, M_WORD), (b"nuanced", C_SOFT, M_WORD),
    (b"landscape", C_SOFT, M_WORD), (b"paradigm", C_SOFT, M_WORD),
    (b"transformative", C_SOFT, M_WORD), (b"realm", C_SOFT, M_WORD),
    (b"realms", C_SOFT, M_WORD), (b"underscore", C_SOFT, M_WORD),
    (b"underscores", C_SOFT, M_WORD), (b"underscoring", C_SOFT, M_WORD),
    (b"showcase", C_SOFT, M_WORD), (b"showcases", C_SOFT, M_WORD),
    (b"showcasing", C_SOFT, M_WORD), (b"unlock", C_SOFT, M_WORD),
    (b"unlocking", C_SOFT, M_WORD),
    # Multiword filler that announces a point instead of making one.
    (b"it's worth noting", C_SIGNPOST, M_PHRASE),
    (b"it is worth noting", C_SIGNPOST, M_PHRASE),
    (b"it's important to note", C_SIGNPOST, M_PHRASE),
    (b"it is important to note", C_SIGNPOST, M_PHRASE),
    (b"at its core", C_SIGNPOST, M_PHRASE),
    (b"when it comes to", C_SIGNPOST, M_PHRASE),
    (b"in the realm of", C_SIGNPOST, M_PHRASE),
    (b"plays a pivotal role", C_SIGNPOST, M_PHRASE),
    (b"play a pivotal role", C_SIGNPOST, M_PHRASE),
    (b"in today's fast-paced", C_SIGNPOST, M_PHRASE),
    (b"in an era where", C_SIGNPOST, M_PHRASE),
    (b"needless to say", C_SIGNPOST, M_PHRASE),
    (b"it should be noted", C_SIGNPOST, M_PHRASE),
    # Closing rituals that are rituals only when they open a sentence:
    # "To summarize, ..." is the tell; "too lazy to summarize the log" is an
    # infinitive with an object and must not count.
    (b"in conclusion", C_CLOSING, M_SENT_INIT),
    (b"in summary", C_CLOSING, M_SENT_INIT),
    (b"to summarize", C_CLOSING, M_SENT_INIT),
    (b"to sum up", C_CLOSING, M_SENT_INIT),
    (b"all in all", C_CLOSING, M_SENT_INIT),
    (b"at the end of the day", C_CLOSING, M_SENT_INIT),
    # Lone adverbs that are closing rituals only as a sentence-opening
    # discourse marker: "Overall, the design held." flags; "Overall verdict:
    # green" and "the overall latency" do not.
    (b"overall", C_CLOSING, M_DISCOURSE),
    (b"ultimately", C_CLOSING, M_DISCOURSE),
    # Closing rituals that are a tell wherever they appear.
    (b"hope this helps", C_CLOSING, M_PHRASE),
    (b"let me know if you'd like", C_CLOSING, M_PHRASE),
    (b"the journey doesn't end here", C_CLOSING, M_PHRASE),
    # Sycophantic openers.
    (b"great question", C_SYCOPHANCY, M_PHRASE),
    (b"excellent question", C_SYCOPHANCY, M_PHRASE),
    (b"you're absolutely right", C_SYCOPHANCY, M_PHRASE),
    (b"you are absolutely right", C_SYCOPHANCY, M_PHRASE),
    (b"i'd be happy to", C_SYCOPHANCY, M_PHRASE),
    (b"i would be happy to", C_SYCOPHANCY, M_PHRASE),
    (b"certainly!", C_SYCOPHANCY, M_PHRASE),
    # Contractions, counted as a positive signal: their near-absence across a
    # long stretch of prose reads as generated formality. Substrings
    # deliberately — "n't" is a suffix, not a word.
    (b"n't", C_CONTRACTION, M_SUBSTRING), (b"'re", C_CONTRACTION, M_SUBSTRING),
    (b"'ve", C_CONTRACTION, M_SUBSTRING), (b"'ll", C_CONTRACTION, M_SUBSTRING),
    (b"'d", C_CONTRACTION, M_SUBSTRING), (b"it's", C_CONTRACTION, M_SUBSTRING),
    (b"that's", C_CONTRACTION, M_SUBSTRING),
    (b"there's", C_CONTRACTION, M_SUBSTRING),
    (b"here's", C_CONTRACTION, M_SUBSTRING),
    (b"what's", C_CONTRACTION, M_SUBSTRING),
    (b"let's", C_CONTRACTION, M_SUBSTRING),
    (b"i'm", C_CONTRACTION, M_SUBSTRING),
    (b"you're", C_CONTRACTION, M_SUBSTRING),
    (b"we're", C_CONTRACTION, M_SUBSTRING),
    (b"they're", C_CONTRACTION, M_SUBSTRING),
]

# Rule IDs are their stable tokens. The lexicon-backed rules map to the class
# they count; the rest are computed directly in evaluate().
LEXICON_RULES = {
    "focal": C_FOCAL, "soft-focal": C_SOFT, "signposting": C_SIGNPOST,
    "closing": C_CLOSING, "sycophancy": C_SYCOPHANCY,
    "contractions": C_CONTRACTION,
}
TECHNICAL_RULES = ("optional-plurals", "time-marker", "heading-period")
# Rules whose fix is a mechanical swap to the standard form, for the closing
# advice: the three technical notation rules plus the two typography rules.
NOTATION_RULES = frozenset(TECHNICAL_RULES) | {"curly-quotes", "emoji"}

# Thresholds are the ratified ones. Ten sentences is the floor where a
# standard deviation carries any information; below it the coefficient of
# variation swings on a single long sentence. The guard is absolute volume,
# not the prose-to-list ratio: a ratio guard once silently disabled
# burstiness on every real document in the estate.
THRESHOLDS = {
    "shape_min_sentences": 10,
    "shape_min_words": 150,
    "cv_below": 0.45,
    "mid_band_at_least": 0.60,
}


def house_profile():
    return {
        "name": "house",
        # Report order. Soft focal and contractions are information. Em
        # dashes, curly quotes, and emoji are absolute flags wherever the
        # scanner exposes natural language.
        "rules": [
            ("burstiness", FLAG), ("mid-band", FLAG), ("focal", FLAG),
            ("signposting", FLAG), ("closing", FLAG), ("sycophancy", FLAG),
            ("soft-focal", INFO), ("contractions", INFO),
            ("em-dashes", FLAG), ("curly-quotes", FLAG), ("emoji", FLAG),
        ],
        "thresholds": dict(THRESHOLDS),
        "lexicon": list(HOUSE_LEXICON),
    }


def technical_profile():
    # The adjudicated superset: every house rule at house policy, plus the
    # three corpus-kept notation rules as flags.
    p = house_profile()
    p["name"] = "technical"
    p["rules"] += [(rule, FLAG) for rule in TECHNICAL_RULES]
    return p


PROFILES = {"house": house_profile, "technical": technical_profile}

# Overlay files: one directive per line. `drop TEXT`, or `CLASS MATCH TEXT`.
OVERLAY_CLASSES = {
    "focal": C_FOCAL, "soft": C_SOFT, "signposting": C_SIGNPOST,
    "closing": C_CLOSING, "sycophancy": C_SYCOPHANCY,
    "contraction": C_CONTRACTION,
}
OVERLAY_MATCHES = {
    "word": M_WORD, "word-lower": M_WORD_LOWER, "phrase": M_PHRASE,
    "sent-init": M_SENT_INIT, "discourse": M_DISCOURSE,
    "substring": M_SUBSTRING,
}


class OverlayError(Exception):
    def __init__(self, source, line, message):
        super().__init__(f"{source}:{line}: {message}")


def _normalize_overlay_text(src):
    src = src.strip(b" \t")
    if not src:
        return None
    out = bytearray()
    space_pending = False
    for b in src:
        if b in (ord(" "), ord("\t")):
            space_pending = True
            continue
        if space_pending and out:
            out.append(ord(" "))
        space_pending = False
        if ord("A") <= b <= ord("Z"):
            b += ord("a") - ord("A")
        out.append(b)
    return bytes(out)


def parse_overlay(source, src):
    """Parse one overlay file into a list of ops: ("drop", text) or
    ("add", (text, class, match))."""
    ops = []
    if src.startswith(b"\xef\xbb\xbf"):
        src = src[3:]
    for lineno, line in enumerate(src.split(b"\n"), start=1):
        if line.endswith(b"\r"):
            line = line[:-1]
        line = line.strip(b" \t")
        if not line or line[0] == ord("#"):
            continue
        parts = line.split(None, 1)
        first = parts[0]
        rest = parts[1] if len(parts) > 1 else b""
        if first == b"drop":
            text = _normalize_overlay_text(rest)
            if not text:
                raise OverlayError(source, lineno, "missing text")
            ops.append(("drop", text))
            continue
        cls = OVERLAY_CLASSES.get(first.decode("ascii", "replace"))
        if cls is None:
            raise OverlayError(source, lineno,
                               f"unknown class or directive '{first.decode('ascii', 'replace')}'")
        match_parts = rest.split(None, 1)
        if not match_parts:
            raise OverlayError(source, lineno, "missing match kind")
        match = OVERLAY_MATCHES.get(match_parts[0].decode("ascii", "replace"))
        if match is None:
            raise OverlayError(source, lineno,
                               f"unknown match kind '{match_parts[0].decode('ascii', 'replace')}'")
        text = _normalize_overlay_text(match_parts[1] if len(match_parts) > 1 else b"")
        if not text:
            raise OverlayError(source, lineno, "missing text")
        ops.append(("add", (text, cls, match)))
    return ops


def apply_overlays(lexicon, overlays):
    entries = list(lexicon)
    for ops in overlays:
        for op, payload in ops:
            text = payload if op == "drop" else payload[0]
            folded = text.lower()
            entries = [e for e in entries if e[0].lower() != folded]
            if op == "add":
                entries.append(payload)
    return entries


# ---------------------------------------------------------------------------
# check: matchers and flag decisions
# ---------------------------------------------------------------------------

def _find_sub(hay, needle):
    """Non-overlapping occurrences with no boundary condition at all."""
    if not needle or len(needle) > len(hay):
        return []
    at = []
    i = 0
    while True:
        rel = hay.find(needle, i)
        if rel < 0:
            return at
        at.append(rel)
        i = rel + len(needle)


def _find_bounded(hay, term):
    """Every non-overlapping occurrence whose edges fall on non-word bytes,
    so "delve" hits and "underscore_case" does not, and "fan-in summary"
    does not contain the ritual "in summary"."""
    if not term:
        return []
    hits = []
    i = 0
    while True:
        rel = hay.find(term, i)
        if rel < 0:
            return hits
        at = rel
        end = at + len(term)
        before_ok = at == 0 or hay[at - 1] not in WORD
        after_ok = end >= len(hay) or hay[end] not in WORD
        if before_ok and after_ok:
            hits.append(at)
        i = end


def _sentence_initial(hay, at):
    j = at
    while j > 0:
        c = hay[j - 1]
        if c in (ord(" "), ord('"'), ord("'"), ord(")")):
            j -= 1
            continue
        return c in (ord("."), ord("!"), ord("?"))
    return True


def _find_sentence_initial(hay, phrase):
    if not phrase:
        return []
    hits = []
    i = 0
    while True:
        rel = hay.find(phrase, i)
        if rel < 0:
            return hits
        at = rel
        end = at + len(phrase)
        after_ok = end >= len(hay) or hay[end] not in WORD
        if after_ok and _sentence_initial(hay, at):
            hits.append(at)
        i = end


def _find_discourse_marker(hay, word):
    """Sentence-opening word followed by a comma: "Overall, it held" flags,
    "Overall verdict: green" stays an adjective on a noun."""
    if not word:
        return []
    hits = []
    i = 0
    while True:
        rel = hay.find(word, i)
        if rel < 0:
            return hits
        at = rel
        end = at + len(word)
        comma = end < len(hay) and hay[end] == ord(",")
        if comma and _sentence_initial(hay, at):
            hits.append(at)
        i = end


def find_entry(a, text, match):
    """Locate one lexicon entry; offsets index the prose stream, so
    prose_line can trace each to a source line. The lowercase-only kind reads
    the original prose, where casing is the whole signal."""
    if match == M_WORD or match == M_PHRASE:
        return _find_bounded(a.lowered, text)
    if match == M_WORD_LOWER:
        return _find_bounded(a.prose, text)
    if match == M_SENT_INIT:
        return _find_sentence_initial(a.lowered, text)
    if match == M_DISCOURSE:
        return _find_discourse_marker(a.lowered, text)
    if match == M_SUBSTRING:
        return _find_sub(a.lowered, text)
    return []


def make_positioner(src):
    """Map byte offsets in a source-sized view to (1-based line, byte col)."""
    line_starts = [0]
    for i, b in enumerate(src):
        if b == ord("\n"):
            line_starts.append(i + 1)

    def position(off):
        idx = bisect.bisect_right(line_starts, off)
        return idx, off - line_starts[idx - 1] + 1

    return position


def em_dash_offsets(surface):
    return _find_sub(surface, EM_DASH)


CURLY_THIRD_BYTES = frozenset([0x98, 0x99, 0x9C, 0x9D])  # ' ' " "


def curly_quote_offsets(surface):
    """Curly single and double quotes (U+2018, U+2019, U+201C, U+201D) on the
    natural-language surface. The standard form is the straight quote."""
    hits = []
    i = 0
    while True:
        rel = surface.find(b"\xe2\x80", i)
        if rel < 0:
            return hits
        if rel + 2 < len(surface) and surface[rel + 2] in CURLY_THIRD_BYTES:
            hits.append(rel)
            i = rel + 3
        else:
            i = rel + 2


def _is_emoji_codepoint(cp):
    # Decorative ranges: symbols and pictographs, misc symbols and dingbats,
    # and the star/arrow block. Conservative on purpose: arrows (U+2190
    # block) and other technical symbols stay legal.
    return (0x1F000 <= cp <= 0x1FAFF or 0x2600 <= cp <= 0x27BF
            or 0x2B00 <= cp <= 0x2BFF)


def emoji_offsets(surface):
    """Emoji on the natural-language surface, one hit per pictographic
    codepoint, located by the first byte of its UTF-8 sequence."""
    hits = []
    i = 0
    n = len(surface)
    while i < n:
        b = surface[i]
        if b < 0xC0:
            i += 1
            continue
        if b < 0xE0:
            need, cp = 2, b & 0x1F
        elif b < 0xF0:
            need, cp = 3, b & 0x0F
        elif b < 0xF8:
            need, cp = 4, b & 0x07
        else:
            i += 1
            continue
        if i + need > n:
            i += 1
            continue
        ok = True
        for k in range(1, need):
            c = surface[i + k]
            if c & 0xC0 != 0x80:
                ok = False
                break
            cp = (cp << 6) | (c & 0x3F)
        if not ok:
            i += 1
            continue
        if _is_emoji_codepoint(cp):
            hits.append(i)
        i += need
    return hits


# Technical notation detectors. Each reads a source-sized mask where every
# excluded byte is NUL and each newline sits at its byte offset, so a rule
# can never cross an excluded region or a line boundary unless its grammar
# says so. The technical word boundary is letters, digits, and underscore —
# deliberately narrower than the prose WORD set.

TECH_WORD = ALNUM | {ord("_")}
PLURAL_TOKEN = ALNUM | {ord("_"), ord("-")}


def _plural_marker_end(s, j):
    """An immediate case-insensitive (s) or (es) at j."""
    if j >= len(s) or s[j] != ord("("):
        return None
    def low(k):
        c = s[k]
        return c + 32 if c in UPPER else c
    if j + 3 < len(s) and low(j + 1) == ord("e") and low(j + 2) == ord("s") \
            and s[j + 3] == ord(")"):
        return j + 4
    if j + 2 < len(s) and low(j + 1) == ord("s") and s[j + 2] == ord(")"):
        return j + 3
    return None


def find_optional_plurals(surface):
    """An alnum token with internal underscores or hyphens, immediately
    followed by (s) or (es), with no token-set byte on either side."""
    spans = []
    i = 0
    n = len(surface)
    while i < n:
        if surface[i] not in ALNUM:
            i += 1
            continue
        if i > 0 and surface[i - 1] in PLURAL_TOKEN:
            i += 1
            continue
        j = i
        while j < n and surface[j] in PLURAL_TOKEN:
            j += 1
        # The token must end alnum: underscores and hyphens are internal only.
        if surface[j - 1] in ALNUM:
            end = _plural_marker_end(surface, j)
            if end is not None and (end >= n or surface[end] not in PLURAL_TOKEN):
                spans.append(i)
        i = j
    return spans


def _time_marker_end(s, k):
    """The marker at k: an immediate uppercase AM/PM, or with zero or one
    space a lowercase am/pm or a case-insensitive dotted a.m. / p.m."""
    if k >= len(s):
        return None
    def low(idx):
        c = s[idx]
        return c + 32 if c in UPPER else c
    if s[k] in (ord("A"), ord("P")) and k + 1 < len(s) and s[k + 1] == ord("M"):
        return k + 2
    m = k
    if s[m] == ord(" "):
        m += 1
    if m + 1 < len(s) and s[m] in (ord("a"), ord("p")) and s[m + 1] == ord("m"):
        return m + 2
    if m + 3 < len(s) and low(m) in (ord("a"), ord("p")) and s[m + 1] == ord(".") \
            and low(m + 2) == ord("m") and s[m + 3] == ord("."):
        return m + 4
    return None


def find_time_markers(surface):
    """A 12-hour value (1-12, optional :MM) carrying a nonstandard marker."""
    spans = []
    i = 0
    n = len(surface)
    while i < n:
        if surface[i] not in DIGITS or (i > 0 and surface[i - 1] in TECH_WORD):
            i += 1
            continue
        j = i
        while j < n and surface[j] in DIGITS:
            j += 1
        if j - i > 2:
            i += 1
            continue
        value = int(surface[i:j])
        if not 1 <= value <= 12:
            i += 1
            continue
        k = j
        if k < n and surface[k] == ord(":"):
            if k + 2 >= n or surface[k + 1] not in DIGITS or surface[k + 2] not in DIGITS:
                i += 1
                continue
            k += 3
        end = _time_marker_end(surface, k)
        if end is None or (end < n and surface[end] in TECH_WORD):
            i += 1
            continue
        spans.append(i)
        i = end
    return spans


def find_heading_periods(headings):
    """ATX heading content ending in one ASCII period. Trailing whitespace
    goes first, then an optional closing run of spaces and hashes."""
    spans = []
    off = 0
    n = len(headings)
    while off < n:
        rel = headings.find(b"\n", off)
        line_end = n if rel < 0 else rel
        content = headings[off:line_end]
        e = len(content)
        while e > 0 and content[e - 1] in (ord(" "), ord("\t"), ord("\r")):
            e -= 1
        h = e
        while h > 0 and content[h - 1] == ord("#"):
            h -= 1
        if h < e and h > 0 and content[h - 1] == ord(" "):
            e = h
            while e > 0 and content[e - 1] == ord(" "):
                e -= 1
        if e > 0 and content[e - 1] == ord("."):
            spans.append(off + e - 1)
        if rel < 0:
            break
        off = line_end + 1
    return spans


TECHNICAL_FINDERS = {
    "optional-plurals": ("surface", find_optional_plurals),
    "time-marker": ("surface", find_time_markers),
    "heading-period": ("headings", find_heading_periods),
}


def shape_reliable(st, th):
    return st.sentences >= th["shape_min_sentences"] and st.words >= th["shape_min_words"]


class Finding:
    """One rule's verdict, carried as numbers so the renderer owns
    presentation. hits are (line, col) pairs; col is 0 for prose-stream
    matches, where trimming makes a source column meaningless."""

    def __init__(self, rule, severity, triggered=False, reliable=True,
                 count=0, value=0.0, hits=None):
        self.rule = rule
        self.severity = severity
        self.triggered = triggered
        self.reliable = reliable
        self.count = count
        self.value = value
        self.hits = hits or []


class Result:
    def __init__(self, profile_name, stats, findings, lexicon_ignored):
        self.profile = profile_name
        self.stats = stats
        self.findings = findings
        self.lexicon_ignored = lexicon_ignored

    def flag_count(self):
        return sum(1 for f in self.findings if f.triggered and f.severity == FLAG)


def evaluate(a, prof, ignore_lexicon=False):
    """Score one analysis against one profile: one finding per active rule,
    in profile order. Every flag decision happens here and nowhere else."""
    class_hits = {}
    if not ignore_lexicon:
        for text, cls, match in prof["lexicon"]:
            for off in find_entry(a, text, match):
                class_hits.setdefault(cls, []).append((a.prose_line(off), 0))
        for cls in class_hits:
            class_hits[cls].sort()

    th = prof["thresholds"]
    reliable = shape_reliable(a.stats, th)
    position = make_positioner(a.surface)

    findings = []
    for rule, severity in prof["rules"]:
        if rule in LEXICON_RULES and ignore_lexicon:
            continue
        f = Finding(rule, severity)
        if rule == "burstiness":
            f.reliable = reliable
            f.value = a.stats.cv
            f.triggered = reliable and a.stats.cv < th["cv_below"]
        elif rule == "mid-band":
            f.reliable = reliable
            f.value = a.stats.mid_band
            f.triggered = reliable and a.stats.mid_band >= th["mid_band_at_least"]
        elif rule == "em-dashes":
            f.hits = [position(off) for off in em_dash_offsets(a.surface)]
        elif rule == "curly-quotes":
            f.hits = [position(off) for off in curly_quote_offsets(a.surface)]
        elif rule == "emoji":
            f.hits = [position(off) for off in emoji_offsets(a.surface)]
        elif rule in LEXICON_RULES:
            f.hits = class_hits.get(LEXICON_RULES[rule], [])
        elif rule in TECHNICAL_FINDERS:
            view_name, finder = TECHNICAL_FINDERS[rule]
            view = a.surface if view_name == "surface" else a.headings
            f.hits = [position(off) for off in finder(view)]
        else:
            continue  # a rule this build cannot compute: drop, not "0 hits"
        if rule not in ("burstiness", "mid-band"):
            f.count = len(f.hits)
            f.triggered = f.count > 0
        findings.append(f)

    return Result(prof["name"], a.stats, findings, ignore_lexicon)


# ---------------------------------------------------------------------------
# report: rendering. Labels and formats only; flag decisions arrive made.
# ---------------------------------------------------------------------------

def _fmt_hits(f, _st):
    return f"{f.count} hits"


# The report, in order: (rule or None, label, verbose-only, formatter).
# Stat rows carry no rule and are always informational.
LAYOUT = [
    ("burstiness", "burstiness (CV of sentence length)", False,
     lambda f, st: f"{f.value:.2f}"),
    ("mid-band", "sentences in the 14-22 word band", False,
     lambda f, st: f"{f.value * 100:.0f}%"),
    ("focal", "focal vocabulary", False,
     lambda f, st: f"{f.count} hits ({st.per_1k(f.count):.1f}/1k)"),
    ("signposting", "signposting filler", False, _fmt_hits),
    ("closing", "closing ritual", False, _fmt_hits),
    ("sycophancy", "sycophantic opener", False, _fmt_hits),
    ("soft-focal", "soft focal (context-dependent)", False, _fmt_hits),
    (None, "words / sentences", True,
     lambda f, st: f"{st.words} / {st.sentences}"),
    (None, "mean sentence length", True,
     lambda f, st: f"{st.mean_len:.1f} words"),
    (None, "type-token ratio", True, lambda f, st: f"{st.ttr:.3f}"),
    ("contractions", "contractions", True, lambda f, st: f"{f.count}"),
    ("em-dashes", "em dashes", False, _fmt_hits),
    ("curly-quotes", "curly quotes", False, _fmt_hits),
    ("emoji", "emoji", False, _fmt_hits),
    ("optional-plurals", "optional-plurals", False, _fmt_hits),
    ("time-marker", "time-marker", False, _fmt_hits),
    ("heading-period", "heading-period", False, _fmt_hits),
    (None, "prose / non-prose lines", True,
     lambda f, st: f"{st.prose_lines} / {st.nonprose_lines}"),
]

_NO_FINDING = Finding(None, INFO)


def _tag(has_rule, f):
    if has_rule and f.triggered and f.severity == FLAG:
        return "FLAG"
    if not has_rule or f.severity == INFO or not f.reliable:
        return "--  "
    return "ok  "


def _locations(hits):
    limit = 20
    parts = []
    for i, (line, col) in enumerate(hits):
        if i == limit:
            parts.append(f"+{len(hits) - limit} more")
            break
        parts.append(f"{line}:{col}" if col > 0 else f"{line}")
    return ", ".join(parts)


def render(out, path, r, verbose, where, separate):
    found = {f.rule: f for f in r.findings}
    if separate:
        out.write("\n")
    out.write(f"{path}\n")

    for rule, label, verbose_only, fmt in LAYOUT:
        if verbose_only and not verbose:
            continue
        f = found.get(rule)
        if rule is not None and f is None:
            continue  # the profile does not carry this rule
        f = f if f is not None else _NO_FINDING
        out.write(f"  [{_tag(rule is not None, f)}] {label:<38} {fmt(f, r.stats)}\n")
        if where and f.hits:
            out.write(f"         where: {_locations(f.hits)}\n")

    # The two notes are mutually exclusive: an unscored document is already
    # explained by the guard note.
    guarded = any(f.rule in ("burstiness", "mid-band") and not f.reliable
                  for f in r.findings)
    if guarded:
        out.write(f"  note: {r.stats.sentences} sentences / {r.stats.words} prose"
                  " words is too little to score sentence shape\n")
    elif r.stats.list_dominant:
        out.write("  note: mostly lists and code; sentence shape scored on the"
                  " prose that remains\n")
    if r.lexicon_ignored:
        out.write("  note: file directive suppressed lexicon rules\n")

    # The tool scores the mechanical half of the standard only, and says so
    # on every run: a clean score is not a verdict that the writing is good.
    # When every raised flag is a notation rule, the honest advice is the
    # opposite — the fix really is the mechanical swap to the standard form.
    flags = 0
    notation_only = True
    for f in r.findings:
        if f.triggered and f.severity == FLAG:
            flags += 1
            if f.rule not in NOTATION_RULES:
                notation_only = False
    if flags == 0:
        out.write("  no surface flags. This says nothing about grounding, argument\n"
                  "  dependency, or stakes — re-read against the three tests.\n")
    elif notation_only:
        out.write(f"  {flags} notation flag(s). These are mechanical: write the"
                  " standard form.\n")
    else:
        out.write(f"  {flags} flag(s). Fix by injecting substance, not by swapping words:\n"
                  "  a cosmetic swap on a structurally weak draft leaves it weak.\n")


# ---------------------------------------------------------------------------
# CLI: option parsing, per-file pipeline, 0/1/2 exit codes
# ---------------------------------------------------------------------------

USAGE = """usage: slopcheck [options] <file|->...

Scores markdown or plain text against the mechanical half of the house
prose standard. Code fences, headings, tables, and list items are
partitioned out before sentence statistics are computed.

options:
  -p, --profile NAME  select a compiled-in profile (default: house)
      --overlay FILE  merge a lexicon overlay (repeatable)
  -q, --quiet         exit code only, no output
  -v, --verbose       include informational metrics that are never flags
  -w, --where         list each hit's location under its row, as the source
                      line, or line:col where the rule sees exact columns
  -h, --help          show this help

exit codes: 0 no flags, 1 flags raised, 2 error
"""

EXIT_CLEAN, EXIT_FLAGS, EXIT_ERROR = 0, 1, 2
MAX_INPUT_BYTES = 1 << 26  # prose past 64 MiB is a mistake, not a measurement

UTF8_BOM = b"\xef\xbb\xbf"
LEXICON_DIRECTIVE = b"<!-- slopcheck: ignore lexicon -->"
DIRECTIVE_PREFIX = b"<!-- slopcheck:"


class DirectiveError(Exception):
    def __init__(self, line):
        super().__init__("malformed directive; want '<!-- slopcheck: ignore lexicon -->'")
        self.line = line


def parse_input_directives(src):
    """Inspect only the first nonblank line after an optional UTF-8 BOM. An
    accepted directive line is removed while its exact newline is retained,
    so every later source line keeps its original number."""
    body = src[len(UTF8_BOM):] if src.startswith(UTF8_BOM) else src
    line_start = 0
    lineno = 0
    while True:
        lineno += 1
        line_end = len(body)
        after_line = len(body)
        newline_start = len(body)
        rel = body.find(b"\n", line_start)
        if rel >= 0:
            line_end = rel
            after_line = line_end + 1
            newline_start = line_end
            if line_end > line_start and body[line_end - 1] == ord("\r"):
                line_end -= 1
                newline_start -= 1

        trimmed = body[line_start:line_end].strip(b" \t")
        if trimmed:
            if trimmed == LEXICON_DIRECTIVE:
                cleaned = body[:line_start] + body[newline_start:after_line] + body[after_line:]
                return cleaned, True
            if trimmed.startswith(DIRECTIVE_PREFIX):
                raise DirectiveError(lineno)
            return body, False

        if after_line == len(body):
            return body, False
        line_start = after_line


def load(path, stdin):
    if path == "-":
        text = stdin.read(MAX_INPUT_BYTES + 1)
    else:
        with open(path, "rb") as f:
            text = f.read(MAX_INPUT_BYTES + 1)
    if len(text) > MAX_INPUT_BYTES:
        raise OSError(f"input exceeds the {MAX_INPUT_BYTES >> 20} MiB limit")
    return text


def usage_error(stderr, message):
    stderr.write(f"slopcheck: {message}\n")
    stderr.write(USAGE)
    return EXIT_ERROR


def run(args, stdin, stdout, stderr):
    quiet = verbose = where = False
    profile_name = "house"
    stdin_seen = False
    overlay_paths = []
    paths = []

    i = 0
    while i < len(args):
        arg = args[i]
        if arg in ("-h", "--help"):
            stdout.write(USAGE)
            return EXIT_CLEAN
        elif arg in ("-q", "--quiet"):
            quiet = True
        elif arg in ("-v", "--verbose"):
            verbose = True
        elif arg in ("-w", "--where"):
            where = True
        elif arg in ("-p", "--profile"):
            if i + 1 == len(args):
                return usage_error(stderr, f"option '{arg}' requires a value")
            i += 1
            profile_name = args[i]
        elif arg == "--overlay":
            if i + 1 == len(args):
                return usage_error(stderr, f"option '{arg}' requires a value")
            i += 1
            overlay_paths.append(args[i])
        elif len(arg) > 1 and arg[0] == "-":
            return usage_error(stderr, f"unknown option '{arg}'")
        else:
            if arg == "-":
                if stdin_seen:
                    return usage_error(stderr, "standard input '-' may appear only once")
                stdin_seen = True
            paths.append(arg)
        i += 1

    if not paths:
        return usage_error(stderr, "no input files")

    build = PROFILES.get(profile_name)
    if build is None:
        known = ", ".join(sorted(PROFILES))
        stderr.write(f"slopcheck: unknown profile '{profile_name}' (known: {known})\n")
        return EXIT_ERROR
    selected = build()

    overlays = []
    for path in overlay_paths:
        try:
            with open(path, "rb") as f:
                src = f.read()
        except OSError as err:
            stderr.write(f"slopcheck: cannot read '{path}': {err}\n")
            return EXIT_ERROR
        try:
            overlays.append(parse_overlay(path, src))
        except OverlayError as err:
            stderr.write(f"slopcheck: overlay {err}\n")
            return EXIT_ERROR
    selected["lexicon"] = apply_overlays(selected["lexicon"], overlays)

    any_flags = False
    for idx, path in enumerate(paths):
        display = "<stdin>" if path == "-" else path
        try:
            text = load(path, stdin)
        except OSError as err:
            stderr.write(f"slopcheck: cannot read '{display}': {err}\n")
            return EXIT_ERROR
        try:
            text, ignore_lexicon = parse_input_directives(text)
        except DirectiveError as err:
            stderr.write(f"slopcheck: {display}:{err.line}: {err}\n")
            return EXIT_ERROR
        result = evaluate(analyze(text), selected, ignore_lexicon)
        if not quiet:
            if verbose and idx == 0:
                if overlays:
                    stdout.write(f"profile: {selected['name']} + {len(overlays)} overlay(s)\n")
                else:
                    stdout.write(f"profile: {selected['name']}\n")
            render(stdout, display, result, verbose, where, idx > 0)
        if result.flag_count() > 0:
            any_flags = True

    return EXIT_FLAGS if any_flags else EXIT_CLEAN


def main():
    return run(sys.argv[1:], sys.stdin.buffer, sys.stdout, sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
