# usage: manifest.sh <repo> <out>  -> sha1 of every tracked+untracked (non-ignored) file, plus porcelain
cd "$1" || exit 1
{ git status --porcelain=v1 -uall; echo ===; git ls-files -co --exclude-standard -z | xargs -0 sha1sum; } > "$2"
sha1sum "$2" | cut -c1-12
