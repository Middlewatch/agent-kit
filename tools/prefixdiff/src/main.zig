//! prefixdiff — report where two files' bytes first diverge.
//!
//! Built for prompt-cache debugging: request payloads must share a
//! byte-identical prefix to stay cache-warm, and when caching silently
//! degrades the question is always "at which byte, and what changed?".
//!
//! Exit codes follow cmp(1): 0 identical, 1 differ, 2 usage/IO error.

const std = @import("std");
const Io = std.Io;

const usage_text =
    \\usage: prefixdiff [options] <fileA> <fileB>
    \\
    \\Reports the length of the common byte prefix, the divergence offset
    \\(with line:col), and an escaped context window around the divergence.
    \\
    \\options:
    \\  -c, --context <n>   bytes of context on each side of the divergence (default 64)
    \\  -q, --quiet         no output; exit code only
    \\  -p, --porcelain     one machine-readable summary line instead of the report
    \\  -h, --help          show this help
    \\  --                  end of options; treat the rest as file names
    \\
    \\exit codes: 0 identical, 1 differ, 2 error. They answer only "identical or
    \\not"; a strict prefix and a mid-content divergence both exit 1, and the
    \\difference is in the report or in the summary line's status field.
    \\
;

/// What kind of relationship the two inputs turned out to have. One
/// classification, used by both renderers, so the report and the summary line
/// cannot disagree about what happened.
const Outcome = enum {
    /// Byte-for-byte equal.
    identical,
    /// One input ran out while still matching. For a growing conversation this
    /// is the healthy shape: the cached prefix survived and the request got longer.
    prefix,
    /// The inputs disagree at a byte both of them have.
    differ,

    fn name(o: Outcome) []const u8 {
        return @tagName(o);
    }
};

const max_file_bytes = 1 << 31;

pub fn main(init: std.process.Init) !void {
    const gpa = init.gpa;
    const io = init.io;

    var args = std.process.Args.Iterator.init(init.minimal.args);
    _ = args.skip();

    var context: usize = 64;
    var quiet = false;
    var porcelain = false;
    var paths: [2][]const u8 = undefined;
    var npaths: usize = 0;
    var opts_ended = false;

    while (args.next()) |arg| {
        const is_opt = !opts_ended and arg.len > 1 and arg[0] == '-';
        if (!opts_ended and std.mem.eql(u8, arg, "--")) {
            opts_ended = true;
        } else if (is_opt and (std.mem.eql(u8, arg, "-h") or std.mem.eql(u8, arg, "--help"))) {
            var buf: [4096]u8 = undefined;
            var w = Io.File.stdout().writerStreaming(io, &buf);
            w.interface.writeAll(usage_text) catch |err| fail("cannot write: {t}", .{err});
            w.interface.flush() catch |err| fail("cannot write: {t}", .{err});
            return;
        } else if (is_opt and (std.mem.eql(u8, arg, "-q") or std.mem.eql(u8, arg, "--quiet"))) {
            quiet = true;
        } else if (is_opt and (std.mem.eql(u8, arg, "-p") or std.mem.eql(u8, arg, "--porcelain"))) {
            porcelain = true;
        } else if (is_opt and (std.mem.eql(u8, arg, "-c") or std.mem.eql(u8, arg, "--context"))) {
            const v = args.next() orelse fail("missing value after {s}", .{arg});
            context = std.fmt.parseInt(usize, v, 10) catch
                fail("context must be a non-negative integer, got '{s}'", .{safe(gpa, v)});
        } else if (is_opt) {
            fail("unknown option '{s}'\n{s}", .{ safe(gpa, arg), usage_text });
        } else if (npaths < 2) {
            paths[npaths] = arg;
            npaths += 1;
        } else {
            fail("expected exactly two files\n{s}", .{usage_text});
        }
    }
    if (npaths != 2) fail("expected exactly two files\n{s}", .{usage_text});
    if (quiet and porcelain) fail("--quiet and --porcelain are different output modes; pick one", .{});

    // D3 covers every byte this program displays, and a path is a byte string
    // an attacker may have chosen. Escape once, here, and show only these.
    const shown: [2][]const u8 = .{ safe(gpa, paths[0]), safe(gpa, paths[1]) };

    const a = readWhole(io, gpa, paths[0], shown[0]);
    defer gpa.free(a);
    const b = readWhole(io, gpa, paths[1], shown[1]);
    defer gpa.free(b);

    const report = Report.compute(a, b);

    if (!quiet) {
        var buf: [4096]u8 = undefined;
        var w = Io.File.stdout().writerStreaming(io, &buf);
        if (porcelain)
            renderPorcelain(&w.interface, report, a) catch |err|
                fail("cannot write summary: {t}", .{err})
        else
            render(&w.interface, gpa, report, shown[0], shown[1], a, b, context) catch |err|
                fail("cannot write report: {t}", .{err});
        w.interface.flush() catch |err| fail("cannot write report: {t}", .{err});
    }
    std.process.exit(if (report.diverge == null) 0 else 1);
}

fn fail(comptime fmt: []const u8, fmt_args: anytype) noreturn {
    std.debug.print("prefixdiff: " ++ fmt ++ "\n", fmt_args);
    std.process.exit(2);
}

fn readWhole(io: Io, gpa: std.mem.Allocator, path: []const u8, shown: []const u8) []u8 {
    return Io.Dir.cwd().readFileAlloc(io, path, gpa, .limited(max_file_bytes)) catch |err|
        fail("cannot read '{s}': {t}", .{ shown, err });
}

/// Display form of an argument: the same escaping applied to file content, so
/// no byte the program echoes can reach the terminal unflattened. Falls back
/// to the raw bytes only if the escaped copy cannot be allocated, which is not
/// a case an attacker controls.
fn safe(gpa: std.mem.Allocator, bytes: []const u8) []const u8 {
    var out: std.ArrayList(u8) = .empty;
    appendEscaped(gpa, &out, bytes) catch {
        out.deinit(gpa);
        return bytes;
    };
    return out.toOwnedSlice(gpa) catch bytes;
}

const Report = struct {
    a_len: usize,
    b_len: usize,
    /// Offset of the first differing byte. When one input is a strict
    /// prefix of the other this is the shorter length. Null = identical.
    diverge: ?usize,

    fn compute(a: []const u8, b: []const u8) Report {
        return .{
            .a_len = a.len,
            .b_len = b.len,
            .diverge = std.mem.indexOfDiff(u8, a, b),
        };
    }

    fn prefixLen(r: Report) usize {
        return r.diverge orelse r.a_len;
    }

    fn outcome(r: Report) Outcome {
        const at = r.diverge orelse return .identical;
        return if (at == r.a_len or at == r.b_len) .prefix else .differ;
    }
};

const LineCol = struct { line: usize, col: usize };

fn lineCol(buf: []const u8, idx: usize) LineCol {
    var line: usize = 1;
    var line_start: usize = 0;
    for (buf[0..idx], 0..) |ch, i| {
        if (ch == '\n') {
            line += 1;
            line_start = i + 1;
        }
    }
    return .{ .line = line, .col = idx - line_start + 1 };
}

/// Plural suffix for a byte count. One table so the report cannot disagree
/// with itself, and so goldens do not freeze an "1 bytes" into place.
fn plural(n: usize) []const u8 {
    return if (n == 1) "" else "s";
}

/// Share of `whole` covered by `part`, as the severity reading: how much of
/// each input was still in the common prefix.
///
/// An empty input reports 100%, which is the literally correct answer — all of
/// nothing is shared — and is never read in isolation, because an empty input
/// against a non-empty one is always classified `.prefix` and says so on the
/// next line. Reporting 0% there would claim a divergence inside bytes that do
/// not exist.
fn pct(part: usize, whole: usize) f64 {
    if (whole == 0) return 100.0;
    return 100.0 * @as(f64, @floatFromInt(part)) / @as(f64, @floatFromInt(whole));
}

/// Append `bytes` with control/non-ASCII bytes escaped so a context window
/// is always printable on one terminal line.
fn appendEscaped(gpa: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8) !void {
    for (bytes) |ch| switch (ch) {
        '\n' => try out.appendSlice(gpa, "\\n"),
        '\r' => try out.appendSlice(gpa, "\\r"),
        '\t' => try out.appendSlice(gpa, "\\t"),
        '\\' => try out.appendSlice(gpa, "\\\\"),
        0x20...0x5B, 0x5D...0x7E => try out.append(gpa, ch),
        else => {
            var hex: [4]u8 = undefined;
            try out.appendSlice(gpa, std.fmt.bufPrint(&hex, "\\x{x:0>2}", .{ch}) catch unreachable);
        },
    };
}

/// One side's context line: escaped window before and after the divergence
/// point, separated by `┃`, with `⟨EOF⟩` when the divergence is past the end.
fn windowAlloc(gpa: std.mem.Allocator, bytes: []const u8, at: usize, context: usize) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(gpa);

    const start = at -| context;
    if (start > 0) try out.appendSlice(gpa, "…");
    try appendEscaped(gpa, &out, bytes[start..at]);
    try out.appendSlice(gpa, "┃");
    if (at >= bytes.len) {
        try out.appendSlice(gpa, "⟨EOF⟩");
    } else {
        const end = @min(bytes.len, at +| context);
        try appendEscaped(gpa, &out, bytes[at..end]);
        if (end < bytes.len) try out.appendSlice(gpa, "…");
    }
    return out.toOwnedSlice(gpa);
}

/// The machine-readable summary: one line, `key=value` fields in a fixed
/// order, no file names. This is the surface a script reads — the exit code
/// answers only "identical or not", and `status` is where the outcome class
/// lives. Names are omitted deliberately: the caller passed them, and echoing
/// them here would make the line's length depend on its input.
///
/// `line` and `col` appear only for `differ`, matching the report: a position
/// past the end of a file has no meaningful column.
fn renderPorcelain(w: *Io.Writer, report: Report, a: []const u8) !void {
    const at = report.prefixLen();
    const outcome = report.outcome();
    try w.print("status={s} prefix={d} a_bytes={d} b_bytes={d} a_pct={d:.1} b_pct={d:.1}", .{
        outcome.name(), at, report.a_len, report.b_len,
        pct(at, report.a_len),
        pct(at, report.b_len),
    });
    if (outcome == .differ) {
        const lc = lineCol(a, at);
        try w.print(" line={d} col={d}", .{ lc.line, lc.col });
    }
    try w.writeAll("\n");
}

fn render(
    w: *Io.Writer,
    gpa: std.mem.Allocator,
    report: Report,
    path_a: []const u8,
    path_b: []const u8,
    a: []const u8,
    b: []const u8,
    context: usize,
) !void {
    try w.print("A: {s} ({d} byte{s})\n", .{ path_a, report.a_len, plural(report.a_len) });
    try w.print("B: {s} ({d} byte{s})\n", .{ path_b, report.b_len, plural(report.b_len) });

    const at = report.diverge orelse {
        try w.writeAll("identical\n");
        return;
    };

    try w.print("\ncommon prefix: {d} byte{s} — {d:.1}% of A, {d:.1}% of B\n", .{
        at, plural(at), pct(at, report.a_len), pct(at, report.b_len),
    });

    if (report.outcome() == .prefix) {
        const shorter: []const u8 = if (at == report.a_len) "A" else "B";
        const longer: []const u8 = if (at == report.a_len) "B" else "A";
        const extra = @max(report.a_len, report.b_len) - at;
        try w.print("{s} is a strict prefix of {s}; {s} continues for {d} more byte{s}\n", .{
            shorter, longer, longer, extra, plural(extra),
        });
    } else {
        const lc_a = lineCol(a, at);
        try w.print("diverges at byte {d} (line {d}, col {d})\n", .{ at, lc_a.line, lc_a.col });
    }

    const win_a = try windowAlloc(gpa, a, at, context);
    defer gpa.free(win_a);
    const win_b = try windowAlloc(gpa, b, at, context);
    defer gpa.free(win_b);
    try w.print("\nA: {s}\nB: {s}\n", .{ win_a, win_b });
}

test "compute: identical inputs" {
    const r = Report.compute("hello", "hello");
    try std.testing.expectEqual(@as(?usize, null), r.diverge);
    try std.testing.expectEqual(@as(usize, 5), r.prefixLen());
}

test "compute: differ at offset zero and mid-buffer" {
    try std.testing.expectEqual(@as(?usize, 0), Report.compute("xbc", "abc").diverge);
    try std.testing.expectEqual(@as(?usize, 2), Report.compute("abXd", "abYd").diverge);
}

test "compute: strict prefix diverges at shorter length" {
    const r = Report.compute("abc", "abcdef");
    try std.testing.expectEqual(@as(?usize, 3), r.diverge);
}

test "compute: both empty is identical, one empty diverges at zero" {
    try std.testing.expectEqual(@as(?usize, null), Report.compute("", "").diverge);
    try std.testing.expectEqual(@as(?usize, 0), Report.compute("", "x").diverge);
}

test "lineCol is 1-based and resets at newlines" {
    const buf = "ab\ncd\nef";
    try std.testing.expectEqual(LineCol{ .line = 1, .col = 1 }, lineCol(buf, 0));
    try std.testing.expectEqual(LineCol{ .line = 1, .col = 3 }, lineCol(buf, 2));
    try std.testing.expectEqual(LineCol{ .line = 2, .col = 1 }, lineCol(buf, 3));
    try std.testing.expectEqual(LineCol{ .line = 3, .col = 2 }, lineCol(buf, 7));
}

test "windowAlloc escapes controls and marks EOF" {
    const gpa = std.testing.allocator;
    const w1 = try windowAlloc(gpa, "ab\ncd", 3, 8);
    defer gpa.free(w1);
    try std.testing.expectEqualStrings("ab\\n┃cd", w1);

    const w2 = try windowAlloc(gpa, "abc", 3, 8);
    defer gpa.free(w2);
    try std.testing.expectEqualStrings("abc┃⟨EOF⟩", w2);

    const w3 = try windowAlloc(gpa, &.{ 0x01, 'x' }, 1, 8);
    defer gpa.free(w3);
    try std.testing.expectEqualStrings("\\x01┃x", w3);
}

test "outcome classifies identical, strict prefix and mid-content divergence" {
    try std.testing.expectEqual(Outcome.identical, Report.compute("abc", "abc").outcome());
    try std.testing.expectEqual(Outcome.prefix, Report.compute("abc", "abcdef").outcome());
    try std.testing.expectEqual(Outcome.prefix, Report.compute("abcdef", "abc").outcome());
    try std.testing.expectEqual(Outcome.differ, Report.compute("abXd", "abYd").outcome());
    // An empty input is a strict prefix of anything, never a divergence.
    try std.testing.expectEqual(Outcome.prefix, Report.compute("", "x").outcome());
    try std.testing.expectEqual(Outcome.identical, Report.compute("", "").outcome());
}

test "safe escapes control bytes in a displayed argument" {
    const gpa = std.testing.allocator;
    const s = safe(gpa, "name\x1b]0;PWNED\x07.json");
    defer gpa.free(s);
    try std.testing.expectEqualStrings("name\\x1b]0;PWNED\\x07.json", s);
}

test "windowAlloc saturates rather than overflowing on an extreme context" {
    const gpa = std.testing.allocator;
    const w = try windowAlloc(gpa, "abcdef", 3, std.math.maxInt(usize));
    defer gpa.free(w);
    try std.testing.expectEqualStrings("abc┃def", w);
}

test "windowAlloc truncates long sides with ellipses" {
    const gpa = std.testing.allocator;
    const w1 = try windowAlloc(gpa, "0123456789ABCDEF", 8, 3);
    defer gpa.free(w1);
    try std.testing.expectEqualStrings("…567┃89A…", w1);
}
