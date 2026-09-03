//! sess — session-trace autopsy for agent transcript JSONL files.
//!
//! Reads Pi session logs (~/.pi/agent/sessions/**) and Claude Code project
//! transcripts (~/.claude/projects/**) and answers the questions the raw
//! JSON walls make expensive: what happened, how long, how many tokens,
//! which tools, what failed. Format is auto-detected per file.
//!
//!   sess stat  <file|dir>...    per-session summary table + totals
//!   sess tools <file|dir>...    tool-call frequency and failure table
//!   sess tail  [-n N] <file>    last N events, one line each
//!   sess grep  <text> <file|dir>...   case-insensitive content search
//!
//! Every stored line is untrusted at the read boundary: malformed JSON or
//! missing fields count as parse errors / fall back to "meta" instead of
//! aborting the sweep.

const std = @import("std");
const Io = std.Io;

const usage_text =
    \\usage: sess <command> [args]
    \\
    \\commands:
    \\  stat  <file|dir>...        per-session summary (turns, tools, tokens, cost)
    \\  tools <file|dir>...        aggregated tool-call table with error counts
    \\  tail  [-n N] <file>        last N events of one session (default 10)
    \\  grep  [-m N] <text> <file|dir>...
    \\                             case-insensitive search over message content
    \\                             (-m caps printed matches, default 200; 0 = all)
    \\
    \\Directories are walked recursively for *.jsonl files. Pi and Claude Code
    \\transcript formats are detected automatically. Times are UTC.
    \\
;

/// Default cap on printed `grep` matches. Uncapped, a search over a whole
/// corpus emitted 11.4 MB — output growing with the input rather than with
/// the question, which is the one thing this tool exists to avoid. The scan
/// still completes so the reported total is the true one.
const default_grep_matches: u64 = 200;

const max_file_bytes = 1 << 31;

pub fn main(init: std.process.Init) !void {
    const gpa = init.gpa;
    const io = init.io;

    var args = std.process.Args.Iterator.init(init.minimal.args);
    _ = args.skip();

    const cmd = args.next() orelse fail("missing command\n{s}", .{usage_text});

    var stdout_buf: [8192]u8 = undefined;
    var stdout = Io.File.stdout().writerStreaming(io, &stdout_buf);
    const w = &stdout.interface;

    // Retained allocations (paths, dupe'd names, table rows) live for the
    // whole command; per-line JSON trees live in a separate arena reset on
    // every line. See processFile.
    var retained_state = std.heap.ArenaAllocator.init(gpa);
    defer retained_state.deinit();
    const retained = retained_state.allocator();

    if (std.mem.eql(u8, cmd, "-h") or std.mem.eql(u8, cmd, "--help") or std.mem.eql(u8, cmd, "help")) {
        try w.writeAll(usage_text);
    } else if (std.mem.eql(u8, cmd, "stat")) {
        const files = collectPathArgs(gpa, io, retained, &args);
        try cmdStat(gpa, io, retained, w, files);
    } else if (std.mem.eql(u8, cmd, "tools")) {
        const files = collectPathArgs(gpa, io, retained, &args);
        try cmdTools(gpa, io, retained, w, files);
    } else if (std.mem.eql(u8, cmd, "tail")) {
        var n: u64 = 10;
        var file: ?[]const u8 = null;
        while (args.next()) |arg| {
            if (std.mem.eql(u8, arg, "-n")) {
                const v = args.next() orelse fail("missing value after -n", .{});
                n = std.fmt.parseInt(u64, v, 10) catch fail("-n expects an integer, got '{s}'", .{v});
            } else if (file == null) {
                file = arg;
            } else fail("tail takes exactly one file", .{});
        }
        try cmdTail(gpa, io, w, file orelse fail("tail needs a session file\n{s}", .{usage_text}), n);
    } else if (std.mem.eql(u8, cmd, "grep")) {
        var max = default_grep_matches;
        var needle = args.next() orelse fail("grep needs a search string\n{s}", .{usage_text});
        if (std.mem.eql(u8, needle, "-m")) {
            const v = args.next() orelse fail("missing value after -m", .{});
            max = std.fmt.parseInt(u64, v, 10) catch fail("-m expects an integer, got '{s}'", .{v});
            needle = args.next() orelse fail("grep needs a search string\n{s}", .{usage_text});
        }
        const files = collectPathArgs(gpa, io, retained, &args);
        try cmdGrep(gpa, io, w, needle, files, max);
    } else {
        fail("unknown command '{s}'\n{s}", .{ cmd, usage_text });
    }

    try w.flush();
}

fn fail(comptime fmt: []const u8, fmt_args: anytype) noreturn {
    std.debug.print("sess: " ++ fmt ++ "\n", fmt_args);
    std.process.exit(2);
}

// ---------------------------------------------------------------- files --

fn collectPathArgs(
    gpa: std.mem.Allocator,
    io: Io,
    retained: std.mem.Allocator,
    args: *std.process.Args.Iterator,
) [][]const u8 {
    var out: std.ArrayList([]const u8) = .empty;
    while (args.next()) |arg| collectInto(gpa, io, retained, arg, &out);
    if (out.items.len == 0) fail("no session files given\n{s}", .{usage_text});
    const owned = retained.dupe([]const u8, out.items) catch |err| fail("out of memory: {t}", .{err});
    out.deinit(gpa);
    return owned;
}

fn collectInto(
    gpa: std.mem.Allocator,
    io: Io,
    retained: std.mem.Allocator,
    arg: []const u8,
    out: *std.ArrayList([]const u8),
) void {
    // Anything that is not an openable directory is handed on as a candidate
    // file, including paths that failed to open at all. A sweep is routinely
    // handed a list captured moments earlier, and transcripts are deleted and
    // rotated under it — one vanished file must not cost every other file's
    // results (D1). `FileIter.open` is the single place that decides whether
    // a path is readable, and it reports the skip with the real error.
    var dir = Io.Dir.cwd().openDir(io, arg, .{ .iterate = true }) catch {
        const copy = retained.dupe(u8, arg) catch |e| fail("out of memory: {t}", .{e});
        out.append(gpa, copy) catch |e| fail("out of memory: {t}", .{e});
        return;
    };
    defer dir.close(io);

    var walker = dir.walk(gpa) catch |err| fail("out of memory walking '{s}': {t}", .{ arg, err });
    defer walker.deinit();
    const base = std.mem.trimEnd(u8, arg, "/");
    while (walker.next(io) catch |err| fail("error walking '{s}': {t}", .{ arg, err })) |entry| {
        if (entry.kind != .file) continue;
        if (!std.mem.endsWith(u8, entry.basename, ".jsonl")) continue;
        const full = std.fmt.allocPrint(retained, "{s}/{s}", .{ base, entry.path }) catch |err|
            fail("out of memory: {t}", .{err});
        out.append(gpa, full) catch |err| fail("out of memory: {t}", .{err});
    }
}

// ----------------------------------------------------------- json access --

fn jget(v: std.json.Value, key: []const u8) ?std.json.Value {
    return switch (v) {
        .object => |o| o.get(key),
        else => null,
    };
}

fn jstr(v: std.json.Value, key: []const u8) ?[]const u8 {
    return switch (jget(v, key) orelse return null) {
        .string => |s| s,
        else => null,
    };
}

fn jbool(v: std.json.Value, key: []const u8) bool {
    return switch (jget(v, key) orelse return false) {
        .bool => |b| b,
        else => false,
    };
}

fn jarr(v: std.json.Value, key: []const u8) ?[]std.json.Value {
    return switch (jget(v, key) orelse return null) {
        .array => |a| a.items,
        else => null,
    };
}

/// Externally-derived count: negative, non-numeric, or too large for u64
/// collapses to 0. The upper clamp matters: `@intFromFloat` on a finite
/// float >= 2^64 is safety-checked UB, so one absurd token count in a
/// transcript line would abort the whole sweep. (NaN fails `f >= 0`.)
fn ju64(v: std.json.Value, key: []const u8) u64 {
    return switch (jget(v, key) orelse return 0) {
        .integer => |i| if (i < 0) 0 else @intCast(i),
        .float => |f| if (f >= 0 and f < 0x1p64) @intFromFloat(f) else 0,
        else => 0,
    };
}

fn jf64(v: std.json.Value, key: []const u8) f64 {
    return switch (jget(v, key) orelse return 0) {
        .integer => |i| @floatFromInt(i),
        .float => |f| f,
        else => 0,
    };
}

/// Content that is either a plain string or an array of {type:"text",text}
/// blocks (Claude tool_result payloads, Pi user content) → first text.
fn firstText(v: ?std.json.Value) []const u8 {
    const val = v orelse return "";
    switch (val) {
        .string => |s| return s,
        .array => |a| {
            for (a.items) |item| {
                if (jstr(item, "text")) |t| return t;
            }
            return "";
        },
        else => return "",
    }
}

// ------------------------------------------------------------------ time --

/// Days since 1970-01-01 for a proleptic Gregorian date (Hinnant's civil
/// algorithm); 0.16 std has no signed civil-date helper.
fn daysFromCivil(y0: i64, m: i64, d: i64) i64 {
    const y = if (m <= 2) y0 - 1 else y0;
    const era = @divFloor(y, 400);
    const yoe = y - era * 400;
    const mp = @mod(m + 9, 12);
    const doy = @divFloor(153 * mp + 2, 5) + d - 1;
    const doe = yoe * 365 + @divFloor(yoe, 4) - @divFloor(yoe, 100) + doy;
    return era * 146097 + doe - 719468;
}

/// "2026-07-13T04:35:26.287Z" → epoch milliseconds. Null on anything that
/// does not look like the fixed ISO shape both transcript formats emit.
fn parseIsoMs(s: []const u8) ?i64 {
    if (s.len < 19) return null;
    if (s[4] != '-' or s[7] != '-' or s[10] != 'T' or s[13] != ':' or s[16] != ':') return null;
    const y = std.fmt.parseInt(i64, s[0..4], 10) catch return null;
    const mo = std.fmt.parseInt(i64, s[5..7], 10) catch return null;
    const d = std.fmt.parseInt(i64, s[8..10], 10) catch return null;
    const h = std.fmt.parseInt(i64, s[11..13], 10) catch return null;
    const mi = std.fmt.parseInt(i64, s[14..16], 10) catch return null;
    const sec = std.fmt.parseInt(i64, s[17..19], 10) catch return null;
    var ms: i64 = 0;
    if (s.len > 20 and s[19] == '.') {
        var scale: i64 = 100;
        var i: usize = 20;
        while (i < s.len and s[i] >= '0' and s[i] <= '9' and scale > 0) : (i += 1) {
            ms += (s[i] - '0') * scale;
            scale = @divTrunc(scale, 10);
        }
    }
    const days = daysFromCivil(y, mo, d);
    return ((days * 86400 + h * 3600 + mi * 60 + sec) * 1000) + ms;
}

/// "…T04:35:26…" → "04:35:26"; fixed width for alignment.
fn isoClock(ts: ?[]const u8) []const u8 {
    const s = ts orelse return "--:--:--";
    if (s.len < 19) return "--:--:--";
    return s[11..19];
}

/// "2026-07-13T04:35…" → "07-13 04:35" written into buf.
fn isoStamp(buf: []u8, ts: ?[]const u8) []const u8 {
    const s = ts orelse return "-";
    if (s.len < 16) return "-";
    return std.fmt.bufPrint(buf, "{s} {s}", .{ s[5..10], s[11..16] }) catch "-";
}

// -------------------------------------------------------------- humanize --

fn fmtCount(buf: []u8, n: u64) []const u8 {
    if (n >= 1_000_000_000)
        return std.fmt.bufPrint(buf, "{d}.{d}G", .{ n / 1_000_000_000, (n % 1_000_000_000) / 100_000_000 }) catch unreachable;
    if (n >= 100_000_000)
        return std.fmt.bufPrint(buf, "{d}M", .{n / 1_000_000}) catch unreachable;
    if (n >= 1_000_000)
        return std.fmt.bufPrint(buf, "{d}.{d}M", .{ n / 1_000_000, (n % 1_000_000) / 100_000 }) catch unreachable;
    if (n >= 100_000)
        return std.fmt.bufPrint(buf, "{d}k", .{n / 1_000}) catch unreachable;
    if (n >= 1_000)
        return std.fmt.bufPrint(buf, "{d}.{d}k", .{ n / 1_000, (n % 1_000) / 100 }) catch unreachable;
    return std.fmt.bufPrint(buf, "{d}", .{n}) catch unreachable;
}

fn fmtDur(buf: []u8, ms: u64) []const u8 {
    const s = ms / 1000;
    if (s >= 3600)
        return std.fmt.bufPrint(buf, "{d}h{d:0>2}m", .{ s / 3600, (s % 3600) / 60 }) catch unreachable;
    if (s >= 60)
        return std.fmt.bufPrint(buf, "{d}m{d:0>2}s", .{ s / 60, s % 60 }) catch unreachable;
    return std.fmt.bufPrint(buf, "{d}s", .{s}) catch unreachable;
}

fn fmtCost(buf: []u8, cost: f64) []const u8 {
    if (cost <= 0) return "-";
    return std.fmt.bufPrint(buf, "${d:.2}", .{cost}) catch unreachable;
}

/// Byte-cap on a UTF-8 snippet at a codepoint boundary (never mid-sequence).
fn truncUtf8(s: []const u8, max: usize) struct { text: []const u8, cut: bool } {
    if (s.len <= max) return .{ .text = s, .cut = false };
    var end = max;
    while (end > 0 and (s[end] & 0xC0) == 0x80) end -= 1;
    return .{ .text = s[0..end], .cut = true };
}

/// Flatten a snippet for one-line display: every C0 control byte and DEL
/// becomes a space (transcript content is untrusted — a raw ESC/BEL would
/// let a stored line inject terminal escape sequences into our output),
/// byte-capped at a codepoint boundary, "…" when cut. Arena-owned result.
fn snippet(arena: std.mem.Allocator, s: []const u8, max: usize) []const u8 {
    const trimmed = std.mem.trim(u8, s, " \t\r\n");
    const t = truncUtf8(trimmed, max);
    const out = arena.alloc(u8, t.text.len + 3) catch return "";
    for (t.text, 0..) |ch, i| out[i] = if (ch < 0x20 or ch == 0x7f) ' ' else ch;
    if (t.cut) {
        @memcpy(out[t.text.len..][0..3], "…");
        return out;
    }
    return out[0..t.text.len];
}

/// Flatten a short untrusted identifier — a model id, a tool name, a
/// formatted timestamp — for display. Same control-byte rule as `snippet`,
/// without truncation or the cut marker: these strings reach the terminal
/// outside any snippet, and a transcript that names its tool with an OSC
/// sequence would otherwise drive the viewer's terminal. Returns the input
/// unchanged (no allocation) in the overwhelmingly common clean case.
fn flattenName(alloc: std.mem.Allocator, s: []const u8) []const u8 {
    for (s) |ch| {
        if (ch < 0x20 or ch == 0x7f) break;
    } else return s;
    const out = alloc.alloc(u8, s.len) catch return "?";
    for (s, 0..) |ch, i| out[i] = if (ch < 0x20 or ch == 0x7f) ' ' else ch;
    return out;
}

// -------------------------------------------------- normalized line view --

const Format = enum { pi, claude };

const Kind = enum { prompt, assistant, tool_result, meta };

const BlockKind = enum { text, thinking, tool_call, tool_result };

const Block = struct {
    kind: BlockKind,
    name: ?[]const u8 = null, // tool name (Pi results, all calls)
    id: ?[]const u8 = null, // tool_use id (Claude pairing)
    text: []const u8 = "",
    is_error: bool = false,
};

const Usage = struct {
    input: u64 = 0,
    output: u64 = 0,
    cache_read: u64 = 0,
    cache_write: u64 = 0,
    cost: f64 = 0,

    fn add(self: *Usage, other: Usage) void {
        self.input += other.input;
        self.output += other.output;
        self.cache_read += other.cache_read;
        self.cache_write += other.cache_write;
        self.cost += other.cost;
    }
};

/// One transcript line, normalized across formats. All slices point into
/// the per-line arena and die at the next line.
const Facts = struct {
    kind: Kind = .meta,
    ts_iso: ?[]const u8 = null,
    model: ?[]const u8 = null,
    request_id: ?[]const u8 = null, // Claude: dedupe API turns across block-lines
    usage: ?Usage = null,
    blocks: []const Block = &.{},
};

/// Harness-injected `user` lines wrap their payload in a marker tag the
/// model is meant to read as machine text: `<task-notification>…`,
/// `<command-name>/clear</command-name>`, `<local-command-stdout>…`. They
/// are the harness talking to itself, not someone asking for something, so
/// TURNS must not count them.
///
/// Grounded in a census of a live corpus (over 207k Claude and 91k Pi
/// lines); every tag below except the four marked as siblings was observed
/// there. An unrecognized future wrapper falls through and
/// counts as a prompt, so drift shows up as a visible overcount rather than
/// as silently missing turns — and the fixture corpora are the alarm.
const wrapper_tags = [_][]const u8{
    "task-notification",
    "command-name",
    "command-message",
    "command-args", // sibling of command-name
    "local-command-caveat",
    "local-command-stdout",
    "local-command-stderr", // sibling of local-command-stdout
    "bash-input",
    "bash-stdout",
    "bash-stderr", // sibling of bash-stdout
    "system-reminder", // sibling; injected, never typed
};

/// True when `text` opens with one of `wrapper_tags`.
fn opensWithWrapperTag(text: []const u8) bool {
    const s = std.mem.trimStart(u8, text, " \t\r\n");
    if (s.len < 2 or s[0] != '<') return false;
    const close = std.mem.indexOfScalar(u8, s[1..], '>') orelse return false;
    const tag = s[1..][0..close];
    for (wrapper_tags) |known| {
        if (std.mem.eql(u8, tag, known)) return true;
    }
    return false;
}

/// A `user` line is harness transport when it carries text and *every*
/// non-empty text block on it is a wrapper. Checking every block rather
/// than just the first fails safe on a wrapper-then-prose line (none exist
/// in today's corpus, but the cost of allowing for one is a loop). A line
/// with no text at all is left alone: absence of prose is not evidence of a
/// machine.
fn isHarnessInjected(blocks: []const Block) bool {
    var saw_wrapper = false;
    for (blocks) |b| {
        if (b.kind != .text) continue;
        if (std.mem.trim(u8, b.text, " \t\r\n").len == 0) continue;
        if (!opensWithWrapperTag(b.text)) return false;
        saw_wrapper = true;
    }
    return saw_wrapper;
}

/// Claude Code stamps `promptSource:"system"` on `user` lines it generated
/// itself. It is absent from human lines and from the older wrapper-tagged
/// injections alike, so it can only ever narrow the count.
fn claudeSystemGenerated(v: std.json.Value) bool {
    const src = jstr(v, "promptSource") orelse return false;
    return std.mem.eql(u8, src, "system");
}

fn detectFormat(buf: []const u8, scratch: std.mem.Allocator) ?Format {
    var lines = std.mem.splitScalar(u8, buf, '\n');
    var checked: usize = 0;
    while (lines.next()) |line| {
        const trimmed = std.mem.trim(u8, line, " \t\r");
        if (trimmed.len == 0) continue;
        checked += 1;
        if (checked > 5) break;
        const v = std.json.parseFromSliceLeaky(std.json.Value, scratch, trimmed, .{}) catch continue;
        if (jget(v, "parentUuid") != null or jget(v, "userType") != null or jget(v, "sessionId") != null)
            return .claude;
        const t = jstr(v, "type") orelse continue;
        if (std.mem.eql(u8, t, "file-history-snapshot")) return .claude;
        if (jget(v, "parentId") != null) return .pi;
        if (std.mem.eql(u8, t, "session") and jget(v, "version") != null and jget(v, "cwd") != null)
            return .pi;
    }
    return null;
}

fn extract(arena: std.mem.Allocator, format: Format, v: std.json.Value) Facts {
    return switch (format) {
        .pi => extractPi(arena, v),
        .claude => extractClaude(arena, v),
    };
}

fn extractPi(arena: std.mem.Allocator, v: std.json.Value) Facts {
    const ts = jstr(v, "timestamp");
    const t = jstr(v, "type") orelse return .{ .ts_iso = ts };
    if (std.mem.eql(u8, t, "model_change"))
        return .{ .ts_iso = ts, .model = jstr(v, "modelId") };
    if (!std.mem.eql(u8, t, "message")) return .{ .ts_iso = ts };
    const m = jget(v, "message") orelse return .{ .ts_iso = ts };
    const role = jstr(m, "role") orelse return .{ .ts_iso = ts };

    if (std.mem.eql(u8, role, "user")) {
        var blocks: std.ArrayList(Block) = .empty;
        appendTextBlocks(arena, &blocks, jget(m, "content"));
        const owned = ownBlocks(arena, &blocks);
        // Pi shows no wrapper-tagged lines today; the check is here so both
        // formats answer "was this a human turn?" the same way.
        const kind: Kind = if (isHarnessInjected(owned)) .meta else .prompt;
        return .{ .kind = kind, .ts_iso = ts, .blocks = owned };
    }
    if (std.mem.eql(u8, role, "assistant")) {
        var usage: Usage = .{};
        if (jget(m, "usage")) |u| {
            usage = .{
                .input = ju64(u, "input"),
                .output = ju64(u, "output"),
                .cache_read = ju64(u, "cacheRead"),
                .cache_write = ju64(u, "cacheWrite"),
            };
            if (jget(u, "cost")) |c| usage.cost = jf64(c, "total");
        }
        var blocks: std.ArrayList(Block) = .empty;
        if (jarr(m, "content")) |items| for (items) |b| {
            const bt = jstr(b, "type") orelse continue;
            if (std.mem.eql(u8, bt, "text")) {
                blocks.append(arena, .{ .kind = .text, .text = jstr(b, "text") orelse "" }) catch {};
            } else if (std.mem.eql(u8, bt, "thinking")) {
                const body = jstr(b, "thinking") orelse jstr(b, "text") orelse "";
                blocks.append(arena, .{ .kind = .thinking, .text = body }) catch {};
            } else if (std.mem.eql(u8, bt, "toolCall")) {
                blocks.append(arena, .{
                    .kind = .tool_call,
                    .name = jstr(b, "name"),
                    .id = jstr(b, "id"),
                    .text = stringifyArgs(arena, jget(b, "arguments")),
                }) catch {};
            }
        };
        return .{
            .kind = .assistant,
            .ts_iso = ts,
            .model = jstr(m, "model"),
            .usage = usage,
            .blocks = ownBlocks(arena, &blocks),
        };
    }
    if (std.mem.eql(u8, role, "toolResult")) {
        var blocks: std.ArrayList(Block) = .empty;
        blocks.append(arena, .{
            .kind = .tool_result,
            .name = jstr(m, "toolName"),
            .id = jstr(m, "toolCallId"),
            .text = firstText(jget(m, "content")),
            .is_error = jbool(m, "isError"),
        }) catch {};
        return .{ .kind = .tool_result, .ts_iso = ts, .blocks = ownBlocks(arena, &blocks) };
    }
    return .{ .ts_iso = ts };
}

fn extractClaude(arena: std.mem.Allocator, v: std.json.Value) Facts {
    const ts = jstr(v, "timestamp");
    const t = jstr(v, "type") orelse return .{ .ts_iso = ts };
    const m = jget(v, "message") orelse return .{ .ts_iso = ts };

    if (std.mem.eql(u8, t, "assistant")) {
        var usage: ?Usage = null;
        if (jget(m, "usage")) |u| usage = .{
            .input = ju64(u, "input_tokens"),
            .output = ju64(u, "output_tokens"),
            .cache_read = ju64(u, "cache_read_input_tokens"),
            .cache_write = ju64(u, "cache_creation_input_tokens"),
        };
        var blocks: std.ArrayList(Block) = .empty;
        if (jarr(m, "content")) |items| for (items) |b| {
            const bt = jstr(b, "type") orelse continue;
            if (std.mem.eql(u8, bt, "text")) {
                blocks.append(arena, .{ .kind = .text, .text = jstr(b, "text") orelse "" }) catch {};
            } else if (std.mem.eql(u8, bt, "thinking")) {
                blocks.append(arena, .{ .kind = .thinking, .text = jstr(b, "thinking") orelse "" }) catch {};
            } else if (std.mem.eql(u8, bt, "tool_use")) {
                blocks.append(arena, .{
                    .kind = .tool_call,
                    .name = jstr(b, "name"),
                    .id = jstr(b, "id"),
                    .text = stringifyArgs(arena, jget(b, "input")),
                }) catch {};
            }
        };
        return .{
            .kind = .assistant,
            .ts_iso = ts,
            .model = jstr(m, "model"),
            .request_id = jstr(v, "requestId"),
            .usage = usage,
            .blocks = ownBlocks(arena, &blocks),
        };
    }

    if (std.mem.eql(u8, t, "user")) {
        if (jbool(v, "isMeta")) return .{ .ts_iso = ts };
        const content = jget(m, "content") orelse return .{ .ts_iso = ts };
        var blocks: std.ArrayList(Block) = .empty;
        var saw_result = false;
        var saw_text = false;
        switch (content) {
            .string => |s| {
                blocks.append(arena, .{ .kind = .text, .text = s }) catch {};
                saw_text = true;
            },
            .array => |a| for (a.items) |b| {
                const bt = jstr(b, "type") orelse continue;
                if (std.mem.eql(u8, bt, "tool_result")) {
                    saw_result = true;
                    blocks.append(arena, .{
                        .kind = .tool_result,
                        .id = jstr(b, "tool_use_id"),
                        .text = firstText(jget(b, "content")),
                        .is_error = jbool(b, "is_error"),
                    }) catch {};
                } else if (std.mem.eql(u8, bt, "text")) {
                    saw_text = true;
                    blocks.append(arena, .{ .kind = .text, .text = jstr(b, "text") orelse "" }) catch {};
                }
            },
            else => {},
        }
        const owned = ownBlocks(arena, &blocks);
        // A line carrying tool results is transport, not a human turn, even
        // when a text block rides along. Beyond that, TURNS counts only
        // lines a person actually wrote: `promptSource:"system"` and the
        // wrapper tags both mark the harness writing to itself.
        const kind: Kind = if (saw_result)
            .tool_result
        else if (saw_text and !claudeSystemGenerated(v) and !isHarnessInjected(owned))
            .prompt
        else
            .meta;
        return .{ .kind = kind, .ts_iso = ts, .blocks = owned };
    }

    return .{ .ts_iso = ts };
}

fn appendTextBlocks(arena: std.mem.Allocator, blocks: *std.ArrayList(Block), content: ?std.json.Value) void {
    const c = content orelse return;
    switch (c) {
        .string => |s| blocks.append(arena, .{ .kind = .text, .text = s }) catch {},
        .array => |a| for (a.items) |b| {
            if (jstr(b, "text")) |txt|
                blocks.append(arena, .{ .kind = .text, .text = txt }) catch {};
        },
        else => {},
    }
}

fn ownBlocks(arena: std.mem.Allocator, blocks: *std.ArrayList(Block)) []const Block {
    return blocks.toOwnedSlice(arena) catch &.{};
}

fn stringifyArgs(arena: std.mem.Allocator, args: ?std.json.Value) []const u8 {
    const a = args orelse return "";
    return std.json.Stringify.valueAlloc(arena, a, .{}) catch "";
}

// ------------------------------------------------------------- iteration --

/// Owns one transcript file's bytes and the per-line parse arena. Slices in
/// returned Facts die at the next `next()` call.
const FileIter = struct {
    buf: []u8,
    lines: std.mem.SplitIterator(u8, .scalar),
    line_no: u64 = 0,
    parse_errors: u64 = 0,
    format: Format,
    arena: std.heap.ArenaAllocator,

    fn open(gpa: std.mem.Allocator, io: Io, path: []const u8) ?FileIter {
        const buf = Io.Dir.cwd().readFileAlloc(io, path, gpa, .limited(max_file_bytes)) catch |err| {
            std.debug.print("sess: skipping '{s}': {t}\n", .{ path, err });
            return null;
        };
        var detect_arena = std.heap.ArenaAllocator.init(gpa);
        defer detect_arena.deinit();
        const format = detectFormat(buf, detect_arena.allocator()) orelse {
            std.debug.print("sess: skipping '{s}': unrecognized transcript format\n", .{path});
            gpa.free(buf);
            return null;
        };
        return .{
            .buf = buf,
            .lines = std.mem.splitScalar(u8, buf, '\n'),
            .format = format,
            .arena = std.heap.ArenaAllocator.init(gpa),
        };
    }

    fn close(self: *FileIter, gpa: std.mem.Allocator) void {
        self.arena.deinit();
        gpa.free(self.buf);
    }

    fn next(self: *FileIter) ?Facts {
        while (self.lines.next()) |line| {
            self.line_no += 1;
            const trimmed = std.mem.trim(u8, line, " \t\r");
            if (trimmed.len == 0) continue;
            _ = self.arena.reset(.retain_capacity);
            const v = std.json.parseFromSliceLeaky(std.json.Value, self.arena.allocator(), trimmed, .{}) catch {
                self.parse_errors += 1;
                continue;
            };
            return extract(self.arena.allocator(), self.format, v);
        }
        return null;
    }
};

// ------------------------------------------------------------------ stat --

const Row = struct {
    path: []const u8,
    format: Format,
    first_ms: ?i64 = null,
    dur_ms: u64 = 0,
    start: []const u8 = "-",
    prompts: u64 = 0,
    api_turns: u64 = 0,
    tool_calls: u64 = 0,
    tool_errors: u64 = 0,
    parse_errors: u64 = 0,
    usage: Usage = .{},
    model: []const u8 = "-",
};

fn statFile(gpa: std.mem.Allocator, io: Io, retained: std.mem.Allocator, path: []const u8) ?Row {
    var it = FileIter.open(gpa, io, path) orelse return null;
    defer it.close(gpa);

    var row: Row = .{ .path = path, .format = it.format };
    var first_iso_buf: [32]u8 = undefined;
    var first_iso: ?[]const u8 = null;
    var last_ms: ?i64 = null;
    // One API request spans several transcript lines and repeats its usage
    // on each, so usage is counted the first time a requestId is seen. The
    // repeats are not necessarily adjacent — sidechain lines interleave —
    // so this is a seen-set, not a compare-against-previous. Ids point into
    // the per-line arena and die at the next line, so the set's keys are
    // duped into one that outlives the file. Bounded by the count of
    // distinct requests in a single transcript; both die with the row.
    var rid_arena = std.heap.ArenaAllocator.init(gpa);
    defer rid_arena.deinit();
    var seen_rids: std.StringHashMapUnmanaged(void) = .empty;
    defer seen_rids.deinit(gpa);
    var model_buf: [64]u8 = undefined;
    var model: ?[]const u8 = null;

    while (it.next()) |facts| {
        if (facts.ts_iso) |ts| {
            if (parseIsoMs(ts)) |ms| {
                if (row.first_ms == null) {
                    row.first_ms = ms;
                    const n = @min(ts.len, first_iso_buf.len);
                    @memcpy(first_iso_buf[0..n], ts[0..n]);
                    first_iso = first_iso_buf[0..n];
                }
                last_ms = ms;
            }
        }
        if (facts.model) |m| {
            // Cap on a codepoint boundary (D7): a raw byte cap on a long
            // multi-byte model id would emit a lone lead byte.
            const capped = truncUtf8(m, model_buf.len).text;
            @memcpy(model_buf[0..capped.len], capped);
            model = model_buf[0..capped.len];
        }
        switch (facts.kind) {
            .prompt => row.prompts += 1,
            .assistant => {
                var first_line_of_turn = true;
                if (facts.request_id) |rid| {
                    const gop = seen_rids.getOrPut(gpa, rid) catch |err|
                        fail("out of memory: {t}", .{err});
                    if (gop.found_existing) {
                        first_line_of_turn = false;
                    } else {
                        gop.key_ptr.* = rid_arena.allocator().dupe(u8, rid) catch |err|
                            fail("out of memory: {t}", .{err});
                    }
                }
                if (first_line_of_turn) {
                    row.api_turns += 1;
                    if (facts.usage) |u| row.usage.add(u);
                }
                for (facts.blocks) |b| {
                    if (b.kind == .tool_call) row.tool_calls += 1;
                }
            },
            .tool_result => for (facts.blocks) |b| {
                if (b.kind == .tool_result and b.is_error) row.tool_errors += 1;
            },
            .meta => {},
        }
    }

    row.parse_errors = it.parse_errors;
    if (row.first_ms) |f| if (last_ms) |l| {
        if (l > f) row.dur_ms = @intCast(l - f);
    };
    var stamp_buf: [16]u8 = undefined;
    // Both strings come from the transcript and are printed outside any
    // snippet, so they are flattened before they can reach a terminal (D3).
    row.start = retained.dupe(u8, flattenName(retained, isoStamp(&stamp_buf, first_iso))) catch "-";
    if (model) |m| row.model = retained.dupe(u8, flattenName(retained, m)) catch "-";
    return row;
}

fn rowLessThan(_: void, a: Row, b: Row) bool {
    const av = a.first_ms orelse std.math.maxInt(i64);
    const bv = b.first_ms orelse std.math.maxInt(i64);
    return av < bv;
}

fn cmdStat(
    gpa: std.mem.Allocator,
    io: Io,
    retained: std.mem.Allocator,
    w: *Io.Writer,
    files: [][]const u8,
) !void {
    var rows: std.ArrayList(Row) = .empty;
    defer rows.deinit(gpa);
    for (files) |path| {
        if (statFile(gpa, io, retained, path)) |row| try rows.append(gpa, row);
    }
    if (rows.items.len == 0) fail("no readable session files", .{});
    std.mem.sort(Row, rows.items, {}, rowLessThan);

    try w.print("{s:<12} {s:>7} {s:<3} {s:>5} {s:>5} {s:>5} {s:>4} {s:>7} {s:>7} {s:>8} {s:>8} {s:>8}  {s:<22} {s}\n", .{
        "START", "DUR", "FMT", "TURNS", "API", "TOOLS", "ERR", "IN", "OUT", "CACHE_R", "CACHE_W", "COST", "MODEL", "FILE",
    });

    var total: Row = .{ .path = "", .format = .pi };
    for (rows.items) |row| {
        try printStatRow(w, row, false);
        total.prompts += row.prompts;
        total.api_turns += row.api_turns;
        total.tool_calls += row.tool_calls;
        total.tool_errors += row.tool_errors;
        total.parse_errors += row.parse_errors;
        total.dur_ms += row.dur_ms;
        total.usage.add(row.usage);
    }
    if (rows.items.len > 1) {
        total.start = "TOTAL";
        total.model = "";
        var count_buf: [32]u8 = undefined;
        total.path = std.fmt.bufPrint(&count_buf, "{d} sessions", .{rows.items.len}) catch "";
        try printStatRow(w, total, true);
    }
    try reportSkipped(w, total.parse_errors);
}

fn printStatRow(w: *Io.Writer, row: Row, is_total: bool) !void {
    // One buffer per column: every slice in the argument tuple must stay
    // valid until print consumes the whole tuple.
    var bufs: [10][32]u8 = undefined;
    const fmt_label: []const u8 = if (is_total)
        ""
    else switch (row.format) {
        .pi => "pi",
        .claude => "cc",
    };
    try w.print("{s:<12} {s:>7} {s:<3} {s:>5} {s:>5} {s:>5} {s:>4} {s:>7} {s:>7} {s:>8} {s:>8} {s:>8}  {s:<22} {s}\n", .{
        row.start,
        if (row.dur_ms == 0 and row.first_ms == null) "-" else fmtDur(&bufs[0], row.dur_ms),
        fmt_label,
        fmtCount(&bufs[1], row.prompts),
        fmtCount(&bufs[2], row.api_turns),
        fmtCount(&bufs[3], row.tool_calls),
        fmtCount(&bufs[4], row.tool_errors),
        fmtCount(&bufs[5], row.usage.input),
        fmtCount(&bufs[6], row.usage.output),
        fmtCount(&bufs[7], row.usage.cache_read),
        fmtCount(&bufs[8], row.usage.cache_write),
        fmtCost(&bufs[9], row.usage.cost),
        row.model,
        std.fs.path.basename(row.path),
    });
}

// ----------------------------------------------------------------- tools --

const ToolAgg = struct {
    name: []const u8,
    calls: u64 = 0,
    errors: u64 = 0,
};

const IdName = struct {
    id: []const u8,
    name: []const u8,
};

fn findTool(list: *std.ArrayList(ToolAgg), retained: std.mem.Allocator, raw_name: []const u8) *ToolAgg {
    // Tool names are transcript-supplied and printed raw in the table, so
    // they are flattened on the way in (D3). Flattening *before* the lookup
    // matters: matching a raw name against stored flattened ones would miss
    // and append a fresh row for every occurrence.
    const name = flattenName(retained, raw_name);
    for (list.items) |*t| {
        if (std.mem.eql(u8, t.name, name)) return t;
    }
    const owned = retained.dupe(u8, name) catch |err| fail("out of memory: {t}", .{err});
    list.append(retained, .{ .name = owned }) catch |err| fail("out of memory: {t}", .{err});
    return &list.items[list.items.len - 1];
}

fn toolLessThan(_: void, a: ToolAgg, b: ToolAgg) bool {
    return a.calls > b.calls;
}

fn cmdTools(
    gpa: std.mem.Allocator,
    io: Io,
    retained: std.mem.Allocator,
    w: *Io.Writer,
    files: [][]const u8,
) !void {
    var tools: std.ArrayList(ToolAgg) = .empty;
    var parse_errors: u64 = 0;

    for (files) |path| {
        var it = FileIter.open(gpa, io, path) orelse continue;
        defer it.close(gpa);
        defer parse_errors += it.parse_errors;

        // Claude pairs results to calls by id; names live past the line
        // arena, so dupe them into a per-file arena.
        var file_arena = std.heap.ArenaAllocator.init(gpa);
        defer file_arena.deinit();
        const fa = file_arena.allocator();
        var ids: std.ArrayList(IdName) = .empty;

        while (it.next()) |facts| {
            for (facts.blocks) |b| switch (b.kind) {
                .tool_call => {
                    const name = b.name orelse "(unnamed)";
                    findTool(&tools, retained, name).calls += 1;
                    if (b.id) |id| {
                        const entry: IdName = .{
                            .id = fa.dupe(u8, id) catch continue,
                            .name = fa.dupe(u8, name) catch continue,
                        };
                        ids.append(fa, entry) catch {};
                    }
                },
                .tool_result => {
                    if (!b.is_error) continue;
                    var name: []const u8 = b.name orelse "(unknown)";
                    if (b.name == null) {
                        if (b.id) |id| for (ids.items) |e| {
                            if (std.mem.eql(u8, e.id, id)) {
                                name = e.name;
                                break;
                            }
                        };
                    }
                    findTool(&tools, retained, name).errors += 1;
                },
                else => {},
            };
        }
    }

    if (tools.items.len == 0) {
        try w.writeAll("no tool calls found\n");
        try reportSkipped(w, parse_errors);
        return;
    }
    std.mem.sort(ToolAgg, tools.items, {}, toolLessThan);

    var totals: ToolAgg = .{ .name = "TOTAL" };
    try w.print("{s:<26} {s:>7} {s:>7} {s:>6}\n", .{ "TOOL", "CALLS", "ERRORS", "ERR%" });
    for (tools.items) |t| {
        try printToolRow(w, t);
        totals.calls += t.calls;
        totals.errors += t.errors;
    }
    if (tools.items.len > 1) try printToolRow(w, totals);
    try reportSkipped(w, parse_errors);
}

/// Every command reports what it could not parse. Dropping input silently is
/// worse than failing, because the numbers that come out still look right.
fn reportSkipped(w: *Io.Writer, n: u64) !void {
    if (n > 0) try w.print("({d} unparseable lines skipped)\n", .{n});
}

fn printToolRow(w: *Io.Writer, t: ToolAgg) !void {
    const err_pct: u64 = if (t.calls == 0) 0 else t.errors * 100 / t.calls;
    try w.print("{s:<26} {d:>7} {d:>7} {d:>5}%\n", .{ t.name, t.calls, t.errors, err_pct });
}

// ------------------------------------------------------------------ tail --

fn cmdTail(
    gpa: std.mem.Allocator,
    io: Io,
    w: *Io.Writer,
    path: []const u8,
    n: u64,
) !void {
    // Pass 1: count displayable records and learn Claude id→name pairs.
    var file_arena = std.heap.ArenaAllocator.init(gpa);
    defer file_arena.deinit();
    const fa = file_arena.allocator();
    var ids: std.ArrayList(IdName) = .empty;

    var total: u64 = 0;
    {
        var it = FileIter.open(gpa, io, path) orelse fail("cannot read '{s}'", .{path});
        defer it.close(gpa);
        while (it.next()) |facts| {
            if (facts.kind != .meta) total += 1;
            for (facts.blocks) |b| {
                if (b.kind == .tool_call) {
                    if (b.id) |id| if (b.name) |name| {
                        ids.append(fa, .{
                            .id = fa.dupe(u8, id) catch continue,
                            .name = fa.dupe(u8, name) catch continue,
                        }) catch {};
                    };
                }
            }
        }
    }

    const skip = total -| n;
    var it = FileIter.open(gpa, io, path) orelse fail("cannot read '{s}'", .{path});
    defer it.close(gpa);
    var seen: u64 = 0;
    var shown: u64 = 0;
    while (it.next()) |facts| {
        if (facts.kind == .meta) continue;
        seen += 1;
        if (seen <= skip) continue;
        try renderRecord(w, it.arena.allocator(), facts, ids.items);
        shown += 1;
    }
    if (shown == 0) try w.writeAll("no displayable events\n");
    try reportSkipped(w, it.parse_errors);
}

fn renderRecord(w: *Io.Writer, arena: std.mem.Allocator, facts: Facts, ids: []const IdName) !void {
    // The clock is sliced out of a transcript-supplied timestamp and the
    // tool names below come straight off the line, all printed outside any
    // snippet — flatten each before it reaches the terminal (D3).
    const clock = flattenName(arena, isoClock(facts.ts_iso));
    switch (facts.kind) {
        .prompt => {
            var joined: []const u8 = "";
            for (facts.blocks) |b| {
                if (b.kind == .text and b.text.len > 0) {
                    joined = b.text;
                    break;
                }
            }
            try w.print("{s} user       {s}\n", .{ clock, snippet(arena, joined, 120) });
        },
        .assistant => {
            for (facts.blocks) |b| switch (b.kind) {
                .text => try w.print("{s} assistant  {s}\n", .{ clock, snippet(arena, b.text, 120) }),
                .thinking => try w.print("{s}   ~ thinking ({d} chars)\n", .{ clock, b.text.len }),
                .tool_call => try w.print("{s}   → {s}  {s}\n", .{
                    clock, flattenName(arena, b.name orelse "(tool)"), snippet(arena, b.text, 100),
                }),
                .tool_result => {},
            };
        },
        .tool_result => {
            for (facts.blocks) |b| {
                if (b.kind != .tool_result) continue;
                var name: []const u8 = b.name orelse "(tool)";
                if (b.name == null) {
                    if (b.id) |id| for (ids) |e| {
                        if (std.mem.eql(u8, e.id, id)) {
                            name = e.name;
                            break;
                        }
                    };
                }
                const mark: []const u8 = if (b.is_error) "✗" else "✓";
                try w.print("{s}   {s} {s}  {s}\n", .{
                    clock, mark, flattenName(arena, name), snippet(arena, b.text, 100),
                });
            }
        },
        .meta => {},
    }
}

// ------------------------------------------------------------------ grep --

fn asciiLower(c: u8) u8 {
    return if (c >= 'A' and c <= 'Z') c + 32 else c;
}

/// Case-insensitive (ASCII) substring search; returns byte offset.
fn indexOfIgnoreCase(hay: []const u8, needle: []const u8) ?usize {
    if (needle.len == 0 or needle.len > hay.len) return null;
    var i: usize = 0;
    outer: while (i + needle.len <= hay.len) : (i += 1) {
        for (needle, 0..) |nc, j| {
            if (asciiLower(hay[i + j]) != asciiLower(nc)) continue :outer;
        }
        return i;
    }
    return null;
}

fn cmdGrep(
    gpa: std.mem.Allocator,
    io: Io,
    w: *Io.Writer,
    needle: []const u8,
    files: [][]const u8,
    max: u64,
) !void {
    var matches: u64 = 0;
    var printed: u64 = 0;
    var parse_errors: u64 = 0;
    for (files) |path| {
        var it = FileIter.open(gpa, io, path) orelse continue;
        defer it.close(gpa);
        defer parse_errors += it.parse_errors;
        while (it.next()) |facts| {
            for (facts.blocks) |b| {
                const at = indexOfIgnoreCase(b.text, needle) orelse continue;
                matches += 1;
                // Keep scanning past the cap: the count reported at the end
                // is the true total, not "where we stopped looking".
                if (max != 0 and printed >= max) break;
                const start = at -| 60;
                const end = @min(b.text.len, at + needle.len + 60);
                const label: []const u8 = switch (b.kind) {
                    .text => if (facts.kind == .prompt) "user" else "assistant",
                    .thinking => "thinking",
                    .tool_call => b.name orelse "tool",
                    .tool_result => "result",
                };
                // Re-cut to codepoint boundaries so the window never opens
                // mid-sequence.
                var s = start;
                while (s < b.text.len and (b.text[s] & 0xC0) == 0x80) s += 1;
                var e = end;
                while (e > s and e < b.text.len and (b.text[e] & 0xC0) == 0x80) e -= 1;
                // Clock and label are transcript-supplied and printed
                // outside the snippet, so both are flattened (D3).
                const arena = it.arena.allocator();
                try w.print("{s}:{d} {s} {s}: {s}\n", .{
                    path,
                    it.line_no,
                    flattenName(arena, isoClock(facts.ts_iso)),
                    flattenName(arena, label),
                    snippet(arena, b.text[s..e], 150),
                });
                printed += 1;
                break; // one hit per record keeps output scannable
            }
        }
    }
    if (matches == 0) try w.writeAll("no matches\n");
    if (printed < matches)
        try w.print("(showing {d} of {d} matches; -m 0 for all)\n", .{ printed, matches });
    try reportSkipped(w, parse_errors);
}

// ----------------------------------------------------------------- tests --

test "daysFromCivil epoch anchors" {
    try std.testing.expectEqual(@as(i64, 0), daysFromCivil(1970, 1, 1));
    try std.testing.expectEqual(@as(i64, 1), daysFromCivil(1970, 1, 2));
    try std.testing.expectEqual(@as(i64, 10957), daysFromCivil(2000, 1, 1));
    try std.testing.expectEqual(@as(i64, 11017), daysFromCivil(2000, 3, 1));
}

test "parseIsoMs" {
    try std.testing.expectEqual(@as(?i64, 0), parseIsoMs("1970-01-01T00:00:00.000Z"));
    try std.testing.expectEqual(@as(?i64, 86400000), parseIsoMs("1970-01-02T00:00:00Z"));
    // 2026-07-13T04:35:26.287Z, cross-checked externally.
    try std.testing.expectEqual(@as(?i64, 1783917326287), parseIsoMs("2026-07-13T04:35:26.287Z"));
    try std.testing.expectEqual(@as(?i64, null), parseIsoMs("not a timestamp"));
    try std.testing.expectEqual(@as(?i64, null), parseIsoMs(""));
}

test "fmtCount tiers" {
    var buf: [32]u8 = undefined;
    try std.testing.expectEqualStrings("512", fmtCount(&buf, 512));
    try std.testing.expectEqualStrings("1.5k", fmtCount(&buf, 1500));
    try std.testing.expectEqualStrings("204k", fmtCount(&buf, 204665));
    try std.testing.expectEqualStrings("1.2M", fmtCount(&buf, 1_234_567));
    try std.testing.expectEqualStrings("3.1G", fmtCount(&buf, 3_106_000_000));
}

test "fmtDur tiers" {
    var buf: [32]u8 = undefined;
    try std.testing.expectEqualStrings("42s", fmtDur(&buf, 42_000));
    try std.testing.expectEqualStrings("6m32s", fmtDur(&buf, 392_000));
    try std.testing.expectEqualStrings("1h02m", fmtDur(&buf, 3_722_000));
}

test "truncUtf8 never cuts mid-codepoint" {
    const s = "ab\xE2\x80\xA6cd"; // "ab…cd"
    try std.testing.expectEqualStrings("ab", truncUtf8(s, 3).text);
    try std.testing.expectEqualStrings("ab", truncUtf8(s, 4).text);
    try std.testing.expectEqualStrings("ab\xE2\x80\xA6", truncUtf8(s, 5).text);
    try std.testing.expect(!truncUtf8(s, 7).cut);
}

test "indexOfIgnoreCase" {
    try std.testing.expectEqual(@as(?usize, 4), indexOfIgnoreCase("the QUICK fox", "quick"));
    try std.testing.expectEqual(@as(?usize, null), indexOfIgnoreCase("abc", "abcd"));
    try std.testing.expectEqual(@as(?usize, null), indexOfIgnoreCase("abc", ""));
}

fn parseTestLine(arena: std.mem.Allocator, line: []const u8) !std.json.Value {
    return std.json.parseFromSliceLeaky(std.json.Value, arena, line, .{});
}

test "detectFormat distinguishes pi and claude" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const pi_line =
        \\{"type":"session","version":"1.0","cwd":"/srv/x","id":"a","timestamp":"2026-07-13T04:35:26.287Z"}
    ;
    const cc_line =
        \\{"type":"user","parentUuid":null,"sessionId":"s","message":{"role":"user","content":"hi"}}
    ;
    try std.testing.expectEqual(@as(?Format, .pi), detectFormat(pi_line, arena.allocator()));
    try std.testing.expectEqual(@as(?Format, .claude), detectFormat(cc_line, arena.allocator()));
    try std.testing.expectEqual(@as(?Format, null), detectFormat("not json at all", arena.allocator()));
}

test "extractPi assistant line: usage, cost, tool calls" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const line =
        \\{"type":"message","timestamp":"2026-07-13T04:35:26.287Z","message":{"role":"assistant","model":"m1","stopReason":"toolUse","usage":{"input":100,"output":50,"cacheRead":10,"cacheWrite":5,"cost":{"total":0.25}},"content":[{"type":"thinking","thinking":"hm"},{"type":"toolCall","id":"t1","name":"bash","arguments":{"cmd":"ls"}}]}}
    ;
    const v = try parseTestLine(arena.allocator(), line);
    const facts = extractPi(arena.allocator(), v);
    try std.testing.expectEqual(Kind.assistant, facts.kind);
    try std.testing.expectEqualStrings("m1", facts.model.?);
    try std.testing.expectEqual(@as(u64, 100), facts.usage.?.input);
    try std.testing.expectEqual(@as(u64, 5), facts.usage.?.cache_write);
    try std.testing.expectApproxEqAbs(@as(f64, 0.25), facts.usage.?.cost, 1e-9);
    try std.testing.expectEqual(@as(usize, 2), facts.blocks.len);
    try std.testing.expectEqual(BlockKind.tool_call, facts.blocks[1].kind);
    try std.testing.expectEqualStrings("bash", facts.blocks[1].name.?);
}

test "extractPi toolResult error line" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const line =
        \\{"type":"message","timestamp":"2026-07-13T04:35:27.000Z","message":{"role":"toolResult","toolName":"bash","toolCallId":"t1","isError":true,"content":[{"type":"text","text":"boom"}]}}
    ;
    const v = try parseTestLine(arena.allocator(), line);
    const facts = extractPi(arena.allocator(), v);
    try std.testing.expectEqual(Kind.tool_result, facts.kind);
    try std.testing.expect(facts.blocks[0].is_error);
    try std.testing.expectEqualStrings("boom", facts.blocks[0].text);
}

test "extractClaude: tool_result carrier is not a prompt" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const line =
        \\{"type":"user","timestamp":"2026-07-13T04:35:28.000Z","sessionId":"s","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t9","is_error":true,"content":"failed"}]}}
    ;
    const v = try parseTestLine(arena.allocator(), line);
    const facts = extractClaude(arena.allocator(), v);
    try std.testing.expectEqual(Kind.tool_result, facts.kind);
    try std.testing.expect(facts.blocks[0].is_error);
    try std.testing.expectEqualStrings("t9", facts.blocks[0].id.?);
}

test "extractClaude: assistant usage snake_case and requestId" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const line =
        \\{"type":"assistant","timestamp":"2026-07-13T04:35:29.000Z","requestId":"req_1","sessionId":"s","message":{"role":"assistant","model":"claude-x","usage":{"input_tokens":7,"output_tokens":3,"cache_read_input_tokens":1000,"cache_creation_input_tokens":20},"content":[{"type":"tool_use","id":"t2","name":"Read","input":{"p":"/x"}}]}}
    ;
    const v = try parseTestLine(arena.allocator(), line);
    const facts = extractClaude(arena.allocator(), v);
    try std.testing.expectEqual(Kind.assistant, facts.kind);
    try std.testing.expectEqualStrings("req_1", facts.request_id.?);
    try std.testing.expectEqual(@as(u64, 1000), facts.usage.?.cache_read);
    try std.testing.expectEqualStrings("Read", facts.blocks[0].name.?);
}

test "extractClaude: isMeta user line is meta" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const line =
        \\{"type":"user","isMeta":true,"sessionId":"s","message":{"role":"user","content":"caveat"}}
    ;
    const v = try parseTestLine(arena.allocator(), line);
    try std.testing.expectEqual(Kind.meta, extractClaude(arena.allocator(), v).kind);
}

test "snippet flattens and caps" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const out = snippet(arena.allocator(), "  a\nb\tc  ", 100);
    try std.testing.expectEqualStrings("a b c", out);
    const capped = snippet(arena.allocator(), "xxxxxxxxxx", 4);
    try std.testing.expectEqualStrings("xxxx…", capped);
}

test "snippet neutralizes terminal control bytes" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    // ESC ] 0 ; … BEL is an OSC title-set sequence; passed through raw it
    // would let transcript content drive the viewer's terminal.
    const out = snippet(arena.allocator(), "a\x1b]0;PWNED\x07b\x08c\x7fd", 100);
    try std.testing.expectEqualStrings("a ]0;PWNED b c d", out);
}

test "ju64 clamps negative, fractional, and overflow-sized numbers" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const line =
        \\{"huge":1e30,"neg_int":-1,"neg_float":-2.5,"fits":1.5e19,"over":2e19,"frac":5.9,"int":3}
    ;
    const v = try parseTestLine(arena.allocator(), line);
    try std.testing.expectEqual(@as(u64, 0), ju64(v, "huge"));
    try std.testing.expectEqual(@as(u64, 0), ju64(v, "neg_int"));
    try std.testing.expectEqual(@as(u64, 0), ju64(v, "neg_float"));
    // 1.5e19 is exactly representable and fits u64; 2e19 exceeds 2^64.
    try std.testing.expectEqual(@as(u64, 15_000_000_000_000_000_000), ju64(v, "fits"));
    try std.testing.expectEqual(@as(u64, 0), ju64(v, "over"));
    try std.testing.expectEqual(@as(u64, 5), ju64(v, "frac"));
    try std.testing.expectEqual(@as(u64, 3), ju64(v, "int"));
    try std.testing.expectEqual(@as(u64, 0), ju64(v, "missing"));
}

test "extractClaude: overflow-sized float token count collapses to 0" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const line =
        \\{"type":"assistant","timestamp":"2026-01-06T09:00:01.000Z","requestId":"r1","sessionId":"s","message":{"role":"assistant","model":"m","usage":{"input_tokens":1e30,"output_tokens":5},"content":[{"type":"text","text":"ok"}]}}
    ;
    const v = try parseTestLine(arena.allocator(), line);
    const facts = extractClaude(arena.allocator(), v);
    try std.testing.expectEqual(@as(u64, 0), facts.usage.?.input);
    try std.testing.expectEqual(@as(u64, 5), facts.usage.?.output);
}

/// Writes fixture bytes into a testing tmp dir and yields a path that
/// `FileIter.open`/`statFile` (which resolve via `Io.Dir.cwd()`) can use:
/// `std.testing.tmpDir` creates `.zig-cache/tmp/<sub>` relative to the same
/// cwd, so the relative path stays valid for the whole test.
const TestTranscript = struct {
    tmp: std.testing.TmpDir,
    path: []u8,

    fn init(bytes: []const u8) !TestTranscript {
        var tmp = std.testing.tmpDir(.{});
        errdefer tmp.cleanup();
        var f = try tmp.dir.createFile(std.testing.io, "fixture.jsonl", .{});
        defer f.close(std.testing.io);
        try f.writeStreamingAll(std.testing.io, bytes);
        const path = try std.fmt.allocPrint(
            std.testing.allocator,
            ".zig-cache/tmp/{s}/fixture.jsonl",
            .{&tmp.sub_path},
        );
        return .{ .tmp = tmp, .path = path };
    }

    fn deinit(self: *TestTranscript) void {
        std.testing.allocator.free(self.path);
        self.tmp.cleanup();
    }
};

test "statFile survives a transcript line with an absurd token count" {
    var tf = try TestTranscript.init(
        \\{"parentUuid":null,"sessionId":"s","type":"user","timestamp":"2026-01-06T09:00:00.000Z","message":{"role":"user","content":"hi"}}
        \\{"parentUuid":"u1","sessionId":"s","type":"assistant","timestamp":"2026-01-06T09:00:01.000Z","requestId":"r1","message":{"role":"assistant","model":"m","usage":{"input_tokens":1e30,"output_tokens":5},"content":[{"type":"text","text":"ok"}]}}
        \\
    );
    defer tf.deinit();
    var retained = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer retained.deinit();
    const row = statFile(std.testing.allocator, std.testing.io, retained.allocator(), tf.path) orelse
        return error.TestUnexpectedResult;
    try std.testing.expectEqual(@as(u64, 1), row.prompts);
    try std.testing.expectEqual(@as(u64, 1), row.api_turns);
    try std.testing.expectEqual(@as(u64, 0), row.usage.input);
    try std.testing.expectEqual(@as(u64, 5), row.usage.output);
}

// Fixture-corpus stat tests: the committed testdata files encode one sample
// of each known line type per format (including newer Claude Code types:
// mode, attachment, summary, model-fallback system lines) plus a truncated
// line. Exact-count assertions here are the format-drift alarm — if either
// harness changes its transcript shape, these are the tests that go red.

test "fixture corpus: pi stat counts" {
    var tf = try TestTranscript.init(@embedFile("testdata/pi_corpus.jsonl"));
    defer tf.deinit();
    var retained = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer retained.deinit();
    const row = statFile(std.testing.allocator, std.testing.io, retained.allocator(), tf.path) orelse
        return error.TestUnexpectedResult;
    try std.testing.expectEqual(Format.pi, row.format);
    try std.testing.expectEqual(@as(u64, 2), row.prompts);
    try std.testing.expectEqual(@as(u64, 3), row.api_turns);
    try std.testing.expectEqual(@as(u64, 2), row.tool_calls);
    try std.testing.expectEqual(@as(u64, 1), row.tool_errors);
    try std.testing.expectEqual(@as(u64, 1), row.parse_errors);
    try std.testing.expectEqual(@as(u64, 600), row.usage.input);
    try std.testing.expectEqual(@as(u64, 60), row.usage.output);
    try std.testing.expectEqual(@as(u64, 150), row.usage.cache_read);
    try std.testing.expectEqual(@as(u64, 15), row.usage.cache_write);
    try std.testing.expectApproxEqAbs(@as(f64, 0.6), row.usage.cost, 1e-9);
    try std.testing.expectEqual(@as(u64, 10_000), row.dur_ms);
    try std.testing.expectEqualStrings("test-model", row.model);
}

test "fixture corpus: claude stat counts" {
    var tf = try TestTranscript.init(@embedFile("testdata/claude_corpus.jsonl"));
    defer tf.deinit();
    var retained = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer retained.deinit();
    const row = statFile(std.testing.allocator, std.testing.io, retained.allocator(), tf.path) orelse
        return error.TestUnexpectedResult;
    try std.testing.expectEqual(Format.claude, row.format);
    // isMeta, mode, attachment, summary, system, and file-history-snapshot
    // lines must all stay out of every count below, and so must the three
    // harness-injected `user` lines (task-notification, /clear, and
    // local-command-stdout): exactly one line here is a person typing.
    try std.testing.expectEqual(@as(u64, 1), row.prompts);
    // Two assistant lines share requestId req_1: one API turn, usage
    // counted once; the tool_use block still counts as a call.
    try std.testing.expectEqual(@as(u64, 2), row.api_turns);
    try std.testing.expectEqual(@as(u64, 2), row.tool_calls);
    try std.testing.expectEqual(@as(u64, 1), row.tool_errors);
    try std.testing.expectEqual(@as(u64, 1), row.parse_errors);
    try std.testing.expectEqual(@as(u64, 30), row.usage.input);
    try std.testing.expectEqual(@as(u64, 13), row.usage.output);
    try std.testing.expectEqual(@as(u64, 3000), row.usage.cache_read);
    try std.testing.expectEqual(@as(u64, 60), row.usage.cache_write);
    try std.testing.expectEqual(@as(f64, 0), row.usage.cost);
    try std.testing.expectEqual(@as(u64, 8_000), row.dur_ms);
    try std.testing.expectEqualStrings("claude-test", row.model);
}

// ------------------------------------------------- what counts as a turn --

test "a vanished file does not cost the rest of the sweep" {
    // A file list captured moments before a sweep can name a transcript that
    // is already gone; sessions are rotated and cleaned under a running
    // sweep. One deleted path once aborted a run and discarded every other
    // file's results.
    var tf = try TestTranscript.init(
        \\{"parentUuid":null,"sessionId":"s","type":"user","timestamp":"2026-01-06T09:00:00.000Z","message":{"role":"user","content":"hi"}}
        \\{"parentUuid":"u1","sessionId":"s","type":"assistant","timestamp":"2026-01-06T09:00:01.000Z","requestId":"r1","message":{"role":"assistant","model":"m","usage":{"input_tokens":1,"output_tokens":1},"content":[{"type":"text","text":"ok"}]}}
        \\
    );
    defer tf.deinit();
    var retained = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer retained.deinit();
    var out: std.ArrayList([]const u8) = .empty;
    defer out.deinit(std.testing.allocator);

    // The invariant: a missing path never reaches `fail` (which exits the
    // process); collection survives it and keeps the later paths.
    collectInto(std.testing.allocator, std.testing.io, retained.allocator(), ".zig-cache/tmp/definitely-not-here.jsonl", &out);
    collectInto(std.testing.allocator, std.testing.io, retained.allocator(), tf.path, &out);
    try std.testing.expectEqual(@as(usize, 2), out.items.len);

    // The real file, collected after the missing one, still produces a row.
    const row = statFile(std.testing.allocator, std.testing.io, retained.allocator(), out.items[1]) orelse
        return error.TestUnexpectedResult;
    try std.testing.expectEqual(@as(u64, 1), row.prompts);
    // The missing path's own skip warning is exercised at the command level,
    // not here: reading it would print to stderr and break the gate's
    // silent-on-success contract.
}

test "flattenName neutralizes names and returns clean input untouched" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    // Clean input is passed through without allocating a copy.
    const clean = "claude-opus-5";
    try std.testing.expectEqual(clean.ptr, flattenName(a, clean).ptr);
    // ESC ] 0 ; … BEL in a model id or tool name is an OSC title-set
    // sequence, and all three commands print these names.
    try std.testing.expectEqualStrings("m ]0;PWNED ", flattenName(a, "m\x1b]0;PWNED\x07"));
    try std.testing.expectEqualStrings("Bash x", flattenName(a, "Bash\x7fx"));
}

test "statFile flattens and boundary-caps a hostile model id" {
    // A model id carrying an escape sequence, then 3-byte codepoints
    // straddling the 64-byte column cap: the row must be clean and the cap
    // must not leave a lone lead byte (D3 and D7).
    var tf = try TestTranscript.init(
        \\{"parentUuid":null,"sessionId":"s","type":"user","timestamp":"2026-01-06T09:00:00.000Z","message":{"role":"user","content":"hi"}}
        \\{"parentUuid":"u1","sessionId":"s","type":"assistant","timestamp":"2026-01-06T09:00:01.000Z","requestId":"r1","message":{"role":"assistant","model":"m\u001b]0;PWNED\u0007xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx€€€","usage":{"input_tokens":1,"output_tokens":1},"content":[{"type":"text","text":"ok"}]}}
        \\
    );
    defer tf.deinit();
    var retained = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer retained.deinit();
    const row = statFile(std.testing.allocator, std.testing.io, retained.allocator(), tf.path) orelse
        return error.TestUnexpectedResult;
    try expectNoControlBytes(row.model);
    try std.testing.expect(std.unicode.utf8ValidateSlice(row.model));
    try expectNoControlBytes(row.start);
}

test "opensWithWrapperTag" {
    try std.testing.expect(opensWithWrapperTag("<task-notification>\n<task-id>x</task-id>"));
    try std.testing.expect(opensWithWrapperTag("  \n<command-name>/clear</command-name>"));
    try std.testing.expect(!opensWithWrapperTag("<not-a-known-tag>hello"));
    try std.testing.expect(!opensWithWrapperTag("compare <a> and <b>"));
    try std.testing.expect(!opensWithWrapperTag("<unterminated"));
    try std.testing.expect(!opensWithWrapperTag(""));
    try std.testing.expect(!opensWithWrapperTag("<"));
}

test "extractClaude: harness-injected user lines are not prompts" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    // Every wrapper below was observed in the corpus census; each is
    // metadata rather than a TURN.
    const cases = [_]struct { want: Kind, line: []const u8 }{
        .{ .want = .prompt, .line =
        \\{"type":"user","sessionId":"s","promptSource":"typed","origin":{"kind":"human"},"message":{"role":"user","content":"run the tests"}}
        },
        .{ .want = .meta, .line =
        \\{"type":"user","sessionId":"s","promptSource":"system","message":{"role":"user","content":"<task-notification>\n<status>completed</status>\n</task-notification>"}}
        },
        // Same shape without the promptSource stamp: older lines carry only
        // the wrapper tag, so the tag alone has to be enough.
        .{ .want = .meta, .line =
        \\{"type":"user","sessionId":"s","message":{"role":"user","content":"<task-notification>\n<status>killed</status>\n</task-notification>"}}
        },
        .{ .want = .meta, .line =
        \\{"type":"user","sessionId":"s","message":{"role":"user","content":"<command-name>/clear</command-name>\n<command-message>clear</command-message>\n<command-args></command-args>"}}
        },
        .{ .want = .meta, .line =
        \\{"type":"user","sessionId":"s","message":{"role":"user","content":"<local-command-stdout>Set model to Opus 5</local-command-stdout>"}}
        },
        .{ .want = .meta, .line =
        \\{"type":"user","sessionId":"s","message":{"role":"user","content":"<bash-input> npm publish --access public</bash-input>"}}
        },
        // Content-array form, and a wrapper riding ahead of real prose: the
        // prose wins, because the check reads every block.
        .{ .want = .meta, .line =
        \\{"type":"user","sessionId":"s","message":{"role":"user","content":[{"type":"text","text":"<system-reminder>be careful</system-reminder>"}]}}
        },
        .{ .want = .prompt, .line =
        \\{"type":"user","sessionId":"s","message":{"role":"user","content":[{"type":"text","text":"<system-reminder>be careful</system-reminder>"},{"type":"text","text":"now do the work"}]}}
        },
        // An unrecognized wrapper still counts: drift shows up as an
        // overcount, never as silently missing turns.
        .{ .want = .prompt, .line =
        \\{"type":"user","sessionId":"s","message":{"role":"user","content":"<future-injection>whatever</future-injection>"}}
        },
        // A tool_result carrier stays transport even under the new rule.
        .{ .want = .tool_result, .line =
        \\{"type":"user","sessionId":"s","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"ok"}]}}
        },
    };
    for (cases) |c| {
        errdefer std.debug.print("failing case: {s}\n", .{c.line});
        const v = try parseTestLine(arena.allocator(), c.line);
        try std.testing.expectEqual(c.want, extractClaude(arena.allocator(), v).kind);
    }
}

test "extractPi: wrapper-tagged user line is not a prompt" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const wrapped =
        \\{"type":"message","timestamp":"2026-01-05T10:00:00.000Z","message":{"role":"user","content":[{"type":"text","text":"<system-reminder>injected</system-reminder>"}]}}
    ;
    const typed =
        \\{"type":"message","timestamp":"2026-01-05T10:00:00.000Z","message":{"role":"user","content":"a real prompt"}}
    ;
    // No text at all is not evidence of a machine — an attachment-only turn
    // still counts.
    const textless =
        \\{"type":"message","timestamp":"2026-01-05T10:00:00.000Z","message":{"role":"user","content":[{"type":"image","source":"x"}]}}
    ;
    try std.testing.expectEqual(Kind.meta, extractPi(arena.allocator(), try parseTestLine(arena.allocator(), wrapped)).kind);
    try std.testing.expectEqual(Kind.prompt, extractPi(arena.allocator(), try parseTestLine(arena.allocator(), typed)).kind);
    try std.testing.expectEqual(Kind.prompt, extractPi(arena.allocator(), try parseTestLine(arena.allocator(), textless)).kind);
}

// ------------------------------------------------------ dedupe / detection --

test "statFile dedupes non-adjacent requestId repeats" {
    // req_1's block-lines are split by a req_2 sidechain line. Comparing
    // only against the previous requestId counted req_1 twice and doubled
    // its usage; the seen-set does not.
    var tf = try TestTranscript.init(
        \\{"parentUuid":null,"sessionId":"s","type":"user","timestamp":"2026-01-06T09:00:00.000Z","message":{"role":"user","content":"go"}}
        \\{"parentUuid":"u1","sessionId":"s","type":"assistant","timestamp":"2026-01-06T09:00:01.000Z","requestId":"req_1","message":{"role":"assistant","model":"m","usage":{"input_tokens":10,"output_tokens":1},"content":[{"type":"text","text":"a"}]}}
        \\{"parentUuid":"u1","sessionId":"s","type":"assistant","timestamp":"2026-01-06T09:00:02.000Z","requestId":"req_2","message":{"role":"assistant","model":"m","usage":{"input_tokens":20,"output_tokens":2},"content":[{"type":"text","text":"b"}]}}
        \\{"parentUuid":"u1","sessionId":"s","type":"assistant","timestamp":"2026-01-06T09:00:03.000Z","requestId":"req_1","message":{"role":"assistant","model":"m","usage":{"input_tokens":10,"output_tokens":1},"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{}}]}}
        \\
    );
    defer tf.deinit();
    var retained = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer retained.deinit();
    const row = statFile(std.testing.allocator, std.testing.io, retained.allocator(), tf.path) orelse
        return error.TestUnexpectedResult;
    try std.testing.expectEqual(@as(u64, 2), row.api_turns);
    try std.testing.expectEqual(@as(u64, 30), row.usage.input);
    try std.testing.expectEqual(@as(u64, 3), row.usage.output);
    // The repeated line's tool_use block is still a real call.
    try std.testing.expectEqual(@as(u64, 1), row.tool_calls);
}

test "detectFormat contract: every observed leading line type" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    // A transcript is identified from its first line alone. These are the
    // leading types observed across 920 Claude and 884 Pi files in the
    // corpus census; the Claude session-state types are recognized only
    // because they carry `sessionId`, which is what makes this a contract
    // worth pinning rather than an accident.
    const cases = [_]struct { want: ?Format, first: []const u8 }{
        .{ .want = .claude, .first =
        \\{"parentUuid":null,"sessionId":"s","userType":"external","version":"2.0","cwd":"/x","type":"user","message":{"role":"user","content":"hi"}}
        },
        .{ .want = .claude, .first =
        \\{"type":"mode","mode":"normal","sessionId":"s"}
        },
        .{ .want = .claude, .first =
        \\{"type":"agent-setting","sessionId":"s","setting":"model","value":"opus"}
        },
        .{ .want = .claude, .first =
        \\{"type":"queue-operation","sessionId":"s","operation":"add"}
        },
        .{ .want = .claude, .first =
        \\{"parentUuid":"a","sessionId":"s","userType":"external","version":"2.0","cwd":"/x","type":"assistant","message":{"role":"assistant","content":[]}}
        },
        .{ .want = .claude, .first =
        \\{"type":"file-history-snapshot","messageId":"m","snapshot":{"trackedFileBackups":{}}}
        },
        .{ .want = .pi, .first =
        \\{"type":"session","version":3,"id":"a","timestamp":"2026-01-05T10:00:00.000Z","cwd":"/tmp"}
        },
        .{ .want = .pi, .first =
        \\{"type":"message","id":"a","parentId":null,"timestamp":"2026-01-05T10:00:00.000Z","message":{"role":"user","content":"hi"}}
        },
        // Non-transcripts that share the directory tree must stay rejected:
        // subagent workflow journals and context-fold seed indexes.
        .{ .want = null, .first =
        \\{"type":"started","key":"v2:abc","agentId":"a1"}
        },
        .{ .want = null, .first =
        \\{"v":1,"kind":"fold-index","harness":"pi-context-fold","session":"s","seq":1}
        },
        .{ .want = null, .first = "not json at all" },
        .{ .want = null, .first = "" },
    };
    for (cases) |c| {
        errdefer std.debug.print("failing case: {s}\n", .{c.first});
        try std.testing.expectEqual(c.want, detectFormat(c.first, arena.allocator()));
    }
}

// ------------------------------------------------------------ hostile input --

/// Runs one candidate transcript line through both extractors and asserts
/// the display invariant on everything they produce: no byte a `snippet`
/// emits may be a C0 control or DEL, whatever the input was. Shared by the
/// fuzz entry points and the seeded mutation harness below.
fn checkLine(arena: std.mem.Allocator, line: []const u8) !void {
    const v = std.json.parseFromSliceLeaky(std.json.Value, arena, line, .{}) catch return;
    for ([_]Facts{ extractPi(arena, v), extractClaude(arena, v) }) |facts| {
        // Every transcript-derived string that can reach the terminal, not
        // just block text: model ids, tool names and the sliced clock are
        // printed outside any snippet, so they get the same flattening.
        try expectNoControlBytes(snippet(arena, facts.model orelse "", 64));
        try expectNoControlBytes(flattenName(arena, facts.model orelse ""));
        try expectNoControlBytes(flattenName(arena, isoClock(facts.ts_iso)));
        for (facts.blocks) |b| {
            try expectNoControlBytes(snippet(arena, b.text, 120));
            try expectNoControlBytes(flattenName(arena, b.name orelse ""));
        }
    }
}

fn expectNoControlBytes(s: []const u8) !void {
    for (s) |ch| {
        if (ch < 0x20 or ch == 0x7f) return error.ControlByteReachedTerminal;
    }
}

// Fuzz entry point: no byte sequence may crash format detection. In-tree
// `--fuzz` is opt-in; wiring it costs nothing and the corpus-replay path
// runs under a plain `zig build test`.
test "fuzz detectFormat" {
    try std.testing.fuzz({}, fuzzDetectFormat, .{});
}

fn fuzzDetectFormat(_: void, smith: *std.testing.Smith) !void {
    var buf: [4096]u8 = undefined;
    const n = smith.slice(&buf);
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    _ = detectFormat(buf[0..n], arena.allocator());
}

// Fuzz entry point: no byte sequence that parses as JSON may crash an
// extractor or smuggle a control byte through `snippet`.
test "fuzz extract and snippet" {
    try std.testing.fuzz({}, fuzzExtract, .{});
}

fn fuzzExtract(_: void, smith: *std.testing.Smith) !void {
    var buf: [4096]u8 = undefined;
    const n = smith.slice(&buf);
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    try checkLine(arena.allocator(), buf[0..n]);
}

// Deterministic mutation over the committed corpora. The seed is fixed
// rather than drawn per run, so anything this finds stays reproducible
// instead of depending on which seed the runner happened to pick — that is
// what makes it a gate rather than a lottery. It also runs on every `zig
// build test`, which `--fuzz` does not.
test "seeded corpus mutation never crashes the parser" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    var scratch: std.ArrayList(u8) = .empty;
    defer scratch.deinit(std.testing.allocator);

    var prng: std.Random.DefaultPrng = .init(0x5e5_5c0de);
    const rand = prng.random();
    const corpora = [_][]const u8{
        @embedFile("testdata/pi_corpus.jsonl"),
        @embedFile("testdata/claude_corpus.jsonl"),
    };
    for (corpora) |corpus| {
        for (0..200) |_| {
            scratch.clearRetainingCapacity();
            try scratch.appendSlice(std.testing.allocator, corpus);
            for (0..rand.uintLessThan(usize, 8) + 1) |_| {
                if (scratch.items.len == 0) break;
                const at = rand.uintLessThan(usize, scratch.items.len);
                switch (rand.uintLessThan(u8, 3)) {
                    0 => scratch.items[at] = rand.int(u8),
                    1 => _ = scratch.orderedRemove(at),
                    else => try scratch.insert(std.testing.allocator, at, rand.int(u8)),
                }
            }
            _ = detectFormat(scratch.items, arena.allocator());
            var lines = std.mem.splitScalar(u8, scratch.items, '\n');
            while (lines.next()) |line| {
                const trimmed = std.mem.trim(u8, line, " \t\r");
                if (trimmed.len == 0) continue;
                try checkLine(arena.allocator(), trimmed);
            }
            _ = arena.reset(.retain_capacity);
        }
    }
}
