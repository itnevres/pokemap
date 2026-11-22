---
name: build-check
description: Check that a GBA (pokeemerald family) or GBC (pokecrystal) project folder still builds, after a PokeMap test or live check wrote to it. Use for the D29 acceptance check on scratch project copies, never on the real subjects.
---

# Build check (roadmap D29)

Runs the family's build in WSL2 Ubuntu on an ext4 copy of the folder. The folder itself is only read. Toolchain and versions are in RESUME.md, "Environments".

## Steps

1. Never point this at the real subject projects. Building regenerates tracked files there (for example `include/constants/map_groups.h`). Use a scratch copy. Snapshot a real project's `git status --porcelain` before and after anyway if one is ever involved.
2. Run, with forward slashes in the path (backslashes are eaten between Git Bash and wsl.exe), `<family>` being `gba` or `gbc`:
   ```bash
   MSYS_NO_PATHCONV=1 wsl -d Ubuntu -- bash "/mnt/c/Programming Projects/PokeMap/.claude/skills/build-check/build-check.sh" <family> "C:/path/to/scratch/project"
   ```
   From a PokeMap worktree, use that worktree's `.claude/skills/build-check/build-check.sh` path instead.
3. Wait for the one result line. The build runs `make -j16` under `$HOME/build-check/<family>` and the log is `$HOME/build-check/<family>.log`. Typical wall time: GBC about 4 s, GBA about 40 s clean.
4. On `fail`, the script prints the last 15 log lines. Report them. Don't fix the project.

## Family details

- **gba**: `make modern` with devkitARM r65, ROM `pokemonHnS.gba` (32 MiB). This is what the project itself uses (`tools/verify/build.sh`). Set `GBA_TARGET=default` for the plain `make` path (agbcc, `pokeemerald.gba`): the script installs agbcc from `~/tools/src/agbcc` into the work copy only. Plain `make` currently fails on HEAD (see RESUME).
- **gbc**: `make` with rgbds 0.6.1 from `~/tools/rgbds-0.6.1/bin`, ROM `pokecrystal.gbc` (2 MiB).
- The work copy is incremental (rsync without `--delete`, mtimes kept). Pass `CLEAN=1` (`wsl -d Ubuntu --exec env CLEAN=1 bash ...`) for a clean build, which also drops files deleted from the source.
- `.git` is not copied.

## Record

Report one line:

`Build check <family> at <folder>: pass|fail, <rom> <bytes>, <seconds> s`

Put it in the task report (`docs/superpowers/task-reports/<plan-slug>/`). A `fail` means the work isn't done.
