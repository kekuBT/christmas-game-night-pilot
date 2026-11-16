#!/bin/sh
# cgn-artifact-gate: the artifact gate of the Render image (Beta R4 packaging, handoff 6919813048). Not part of the
# runtime. The Dockerfile runs it as its first build steps, and again on the finished image; an operator can rerun the
# second form over SSH on the instance.
#
#   cgn-artifact-gate.sh gate <inputs folder> <output folder>
#       The build. Every check must pass, or the build stops (ARTIFACT_GATE_FAILED, a non-zero exit):
#       1. the three deploy-side scripts are byte for byte the reviewed ones (pins/scripts.sha256);
#       2. the inputs' artifact/ folder holds exactly one file, the audited archive, and its SHA-256 is the pinned one
#          (pins/archive.sha256): a693c543..., recorded in docs/beta/release-7097ac2.md, nothing else;
#       3. the archive, read without extracting it: only regular files and folders (no links, devices or pipes), no
#          absolute path, no "..", no name twice;
#       4. unpacked as root with no owners or modes from the archive: one package root (the archive's top level, or one
#          folder in it), and in it exactly the 144 inventoried files plus release.json, no node_modules, nothing else;
#       5. its inventory (every file but release.json, sorted, with its SHA-256) is byte for byte
#          pins/release-7097ac2.inventory.sha256, whose own SHA-256 is fe6d74f8...;
#       6. release.json names exactly the pinned revision (no "-dirty") and Node v22.16.0, and nothing but
#          revision, builtAt and node; the build's own Node is v22.16.0;
#       7. npm ci --omit=dev --ignore-scripts installs from the archive's package-lock.json (its integrity hashes), and
#          node_modules then holds exactly ws 8.22.1 and zod 3.25.76;
#       8. the verified package is moved to the output folder, and ARTIFACT_GATE_OK is printed.
#   cgn-artifact-gate.sh installed <app folder>
#       The finished image, or the instance over SSH: the installed release still has the pinned inventory,
#       release.json, exactly ws and zod, and runs on Node v22.16.0. Prints INSTALLED_OK.
#
# The pins are fixed here and in pins/: there is no build argument (Render turns a service's environment variables
# into build arguments, so none is read).
set -eu
REVISION=7097ac2bb062925bb296a129f4771f1e68fd522d
NODE_VERSION=v22.16.0
ARCHIVE=mchezo-7097ac2.tgz
INVENTORY_SHA256=fe6d74f8df7280a52102f70ab1d356428e810dfa614f45b53a60596d8e89a61c
INVENTORY_FILES=144
DEPS="ws@8.22.1 zod@3.25.76"
fail() { echo "ARTIFACT_GATE_FAILED: $*" >&2; exit 1; }
note() { echo "artifact-gate: $*"; }
PINS=""

# The inventory of an unpacked package, exactly as docs/beta/release-7097ac2.md computes it.
inventory() {
  (cd "$1" && LC_ALL=C find . -type f ! -path ./release.json ! -path './node_modules/*' -print0 | LC_ALL=C sort -z | xargs -0 sha256sum)
}
check_inventory() { # <package root> <work file>
  inventory "$1" > "$2" || fail "could not compute the inventory"
  lines=$(wc -l < "$2" | tr -d ' ')
  [ "$lines" -eq "$INVENTORY_FILES" ] || fail "the inventory has $lines files, not $INVENTORY_FILES"
  cmp -s "$2" "$PINS/release-7097ac2.inventory.sha256" || fail "the inventory differs from the pinned one: $(diff "$PINS/release-7097ac2.inventory.sha256" "$2" | head -5 | tr '\n' ' ')"
  got=$(sha256sum < "$2" | cut -d' ' -f1)
  [ "$got" = "$INVENTORY_SHA256" ] || fail "the inventory's SHA-256 is $got, not $INVENTORY_SHA256"
  note "inventory: $INVENTORY_FILES files, SHA-256 $got (the pinned one)"
}
check_release_json() { # <package root>
  node -e '
    const [file, rev, nodeV] = process.argv.slice(1);
    const r = JSON.parse(require("node:fs").readFileSync(file, "utf8"));
    const keys = Object.keys(r).sort().join(",");
    if (keys !== "builtAt,node,revision") { console.error(`release.json has the keys ${keys}`); process.exit(1); }
    if (r.revision !== rev) { console.error(`release.json names the revision ${r.revision}, not ${rev}`); process.exit(1); }
    if (r.node !== nodeV) { console.error(`release.json names Node ${r.node}, not ${nodeV}`); process.exit(1); }
    console.log(`artifact-gate: release.json: revision ${r.revision}, node ${r.node}, built ${r.builtAt}`);
  ' "$1/release.json" "$REVISION" "$NODE_VERSION" || fail "release.json is not the pinned release"
}
check_node() {
  v=$(node -v) || fail "node is not installed"
  [ "$v" = "$NODE_VERSION" ] || fail "this is Node $v, not $NODE_VERSION"
}
check_deps() { # <package root>
  [ -d "$1/node_modules" ] || fail "there is no node_modules"
  other=$(cd "$1/node_modules" && find . ! -type d ! -path './ws/*' ! -path './zod/*' ! -path ./.package-lock.json | head -3 | tr '\n' ' ')
  [ -z "$other" ] || fail "node_modules holds something outside ws and zod: $other"
  [ -z "$(find "$1/node_modules" -type l | head -1)" ] || fail "node_modules holds a link"
  entries=$(cd "$1/node_modules" && ls -A | LC_ALL=C sort | tr '\n' ' ')
  [ "$entries" = ".package-lock.json ws zod " ] || fail "node_modules holds: $entries(expected exactly ws and zod)"
  got=$(cd "$1" && node -e 'const r = (p) => require("./node_modules/" + p + "/package.json"); console.log(`ws@${r("ws").version} zod@${r("zod").version}`)') || fail "could not read the installed versions"
  [ "$got" = "$DEPS" ] || fail "installed $got, not $DEPS"
  note "runtime packages: $got, nothing else"
}

MODE=${1:-}
case "$MODE" in
installed)
  [ $# -eq 2 ] || fail "usage: cgn-artifact-gate.sh installed <app folder>"
  APP=$2
  PINS=$(cd "$(dirname "$0")/pins" && pwd) || fail "no pins folder next to this script"
  W=$(mktemp -d) || fail "no temporary folder"
  trap 'rm -rf "$W"' EXIT
  check_node
  [ -z "$(find "$APP" ! -type f ! -type d | head -1)" ] || fail "$APP holds something that is neither a file nor a folder"
  check_inventory "$APP" "$W/inventory"
  check_release_json "$APP"
  check_deps "$APP"
  # Everything outside node_modules is the inventory plus release.json.
  n=$(cd "$APP" && find . -type f ! -path './node_modules/*' | wc -l | tr -d ' ')
  [ "$n" -eq $((INVENTORY_FILES + 1)) ] || fail "$APP holds $n files outside node_modules, not $((INVENTORY_FILES + 1))"
  echo "INSTALLED_OK revision=$REVISION inventory=$INVENTORY_SHA256 deps=\"$DEPS\" node=$NODE_VERSION"
  ;;
gate)
  [ $# -eq 3 ] || fail "usage: cgn-artifact-gate.sh gate <inputs folder> <output folder>"
  IN=$(cd "$2" && pwd) || fail "no inputs folder at $2"; OUT=$3
  PINS=$IN/pins
  [ ! -e "$OUT" ] || fail "the output folder $OUT already exists"
  W=$(mktemp -d) || fail "no temporary folder"
  trap 'rm -rf "$W"' EXIT
  check_node

  # 1. The deploy-side scripts are the reviewed ones.
  (cd "$IN" && sha256sum -c --strict pins/scripts.sha256) || fail "a deploy-side script is not the reviewed one"

  # 2. Exactly one artifact, the audited archive.
  [ "$(ls -A "$IN/artifact")" = "$ARCHIVE" ] || fail "artifact/ must hold exactly $ARCHIVE (it holds: $(ls -A "$IN/artifact" | tr '\n' ' '))"
  [ -f "$IN/artifact/$ARCHIVE" ] && [ ! -L "$IN/artifact/$ARCHIVE" ] || fail "artifact/$ARCHIVE is not a regular file"
  (cd "$IN/artifact" && sha256sum -c --strict "$PINS/archive.sha256") || fail "the archive is not the audited one (its SHA-256 differs from pins/archive.sha256)"
  note "archive: $(sha256sum "$IN/artifact/$ARCHIVE" | cut -d' ' -f1) (the pinned SHA-256)"

  # 3. Its entries, read without extracting.
  A="$IN/artifact/$ARCHIVE"
  tar -tzf "$A" > "$W/names" || fail "the archive can't be listed"
  tar -tvzf "$A" > "$W/long" || fail "the archive can't be listed"
  [ "$(wc -l < "$W/names")" -eq "$(wc -l < "$W/long")" ] || fail "the two listings differ in length"
  bad=$(cut -c1 "$W/long" | grep -v '^[-d]$' | sort -u | tr -d '\n')
  [ -z "$bad" ] || fail "the archive holds entries that are neither files nor folders (types: $bad)"
  ! grep -q '^/' "$W/names" || fail "the archive holds an absolute path"
  ! grep -Eq '(^|/)\.\.(/|$)' "$W/names" || fail "the archive holds a path with '..'"
  dup=$(sed -e 's#^\./##' -e 's#/$##' "$W/names" | grep -v '^\.\?$' | LC_ALL=C sort | uniq -d | head -3 | tr '\n' ' ')
  [ -z "$dup" ] || fail "the archive names an entry twice: $dup"
  note "listing: $(wc -l < "$W/names" | tr -d ' ') entries, files and folders only, no absolute path, no '..', no duplicate"

  # 4. Unpack, find the one package root, and check exactly what is in it.
  mkdir "$W/x"
  tar -xzf "$A" -C "$W/x" --no-same-owner --no-same-permissions || fail "the archive can't be unpacked"
  [ -z "$(find "$W/x" ! -type f ! -type d | head -1)" ] || fail "the unpacked archive holds something that is neither a file nor a folder"
  if [ -f "$W/x/release.json" ]; then PKG="$W/x"
  elif [ "$(ls -A "$W/x" | wc -l | tr -d ' ')" -eq 1 ] && [ -f "$W/x/$(ls -A "$W/x")/release.json" ]; then PKG="$W/x/$(ls -A "$W/x")"
  else fail "no package root: release.json is neither at the archive's top level nor in its one folder"
  fi
  [ ! -e "$PKG/node_modules" ] || fail "the archive holds node_modules (it must not: they come from npm ci)"
  n=$(find "$PKG" -type f | wc -l | tr -d ' ')
  [ "$n" -eq $((INVENTORY_FILES + 1)) ] || fail "the package holds $n files, not $INVENTORY_FILES plus release.json"

  # 5. The inventory. 6. release.json.
  check_inventory "$PKG" "$W/inventory"
  check_release_json "$PKG"

  # 7. The runtime packages, from the archive's lockfile and its integrity hashes.
  (cd "$PKG" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund) || fail "npm ci failed"
  # npm 10 leaves an empty folder for each omitted scope (@babel, @types, ...). Only EMPTY top-level folders other than
  # ws and zod are removed (rmdir refuses anything else), so the exact listing in check_deps holds; a file or link
  # anywhere outside ws and zod still fails.
  find "$PKG/node_modules" -mindepth 1 -maxdepth 1 -type d ! -name ws ! -name zod -empty -exec rmdir {} + || fail "could not remove the empty scope folders"
  check_deps "$PKG"

  # 8. Publish.
  mkdir -p "$(dirname "$OUT")"
  mv "$PKG" "$OUT" || fail "could not move the package to $OUT"
  echo "ARTIFACT_GATE_OK archive=$(sha256sum "$A" | cut -d' ' -f1) revision=$REVISION inventory=$INVENTORY_SHA256 deps=\"$DEPS\""
  ;;
*)
  fail "usage: cgn-artifact-gate.sh gate <inputs folder> <output folder> | installed <app folder>"
  ;;
esac
