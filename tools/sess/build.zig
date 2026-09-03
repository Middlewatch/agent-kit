const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const main_mod = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });

    const exe = b.addExecutable(.{
        .name = "sess",
        .root_module = main_mod,
    });
    b.installArtifact(exe);

    const test_step = b.step("test", "Run unit tests");
    const tests = b.addTest(.{ .root_module = main_mod });
    test_step.dependOn(&b.addRunArtifact(tests).step);
}
