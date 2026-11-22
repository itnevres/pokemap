#!/bin/bash
# Usage (inside WSL): build-check.sh <gba|gbc> <project folder, Windows or /mnt/c path>
# Copies the project to WSL ext4, builds there, never writes to the folder. Prints one result line.
fam=$1; src=$2
[ -n "$fam" ] && [ -n "$src" ] || { echo "usage: build-check.sh <gba|gbc> <folder>"; exit 2; }
case "$src" in [A-Za-z]:*|*\*) src=$(wslpath -u "$src");; esac
[ -d "$src" ] || { echo "Build check $fam at $src: fail, no such folder, 0 s"; exit 1; }
T=$HOME/tools
work=$HOME/build-check/$fam; log=$HOME/build-check/$fam.log
[ "$CLEAN" = 1 ] && rm -rf "$work"
mkdir -p "$work"
rsync -a --exclude=.git "$src"/ "$work"/ || { echo "Build check $fam at $src: fail, copy failed, 0 s"; exit 1; }
cd "$work" || exit 1
start=$(date +%s)
case $fam in
  gba)
    export DEVKITPRO=/opt/devkitpro DEVKITARM=/opt/devkitpro/devkitARM
    export PATH=$DEVKITARM/bin:$PATH
    # Project's real build is `make modern` (devkitARM gcc, pokemonHnS.gba). GBA_TARGET=default runs plain
    # `make` (agbcc, pokeemerald.gba); agbcc is installed into the work copy only.
    if [ "${GBA_TARGET:-modern}" = default ]; then
      [ -f tools/agbcc/bin/agbcc ] || (cd $T/src/agbcc && ./install.sh "$work") >"$log" 2>&1
      rom=pokeemerald.gba; make -j"$(nproc)" >>"$log" 2>&1; rc=$?
    else
      rom=pokemonHnS.gba; make modern -j"$(nproc)" >"$log" 2>&1; rc=$?
    fi ;;
  gbc)
    export PATH=$T/rgbds-0.6.1/bin:$PATH
    rom=pokecrystal.gbc; make -j"$(nproc)" >"$log" 2>&1; rc=$? ;;
  *) echo "family must be gba or gbc"; exit 2 ;;
esac
secs=$(( $(date +%s) - start ))
if [ $rc -eq 0 ] && [ -f "$rom" ]; then
  echo "Build check $fam at $src: pass, $rom $(stat -c %s "$rom"), $secs s"
else
  tail -15 "$log"; echo "Build check $fam at $src: fail, ${rom:-none} 0, $secs s (log $log)"; exit 1
fi
