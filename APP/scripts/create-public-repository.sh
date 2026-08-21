#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s <source-repository> <new-public-repository>\n' "$0" >&2
}

if [[ $# -ne 2 ]]; then
  usage
  exit 2
fi

if ! command -v gitleaks >/dev/null 2>&1; then
  printf '%s\n' 'gitleaks is required to create a public repository.' >&2
  exit 1
fi

if [[ ! -d "$1" ]]; then
  printf 'Source repository does not exist: %s\n' "$1" >&2
  exit 1
fi

source_repository=$(cd "$1" && pwd -P)
destination_parent_input=$(dirname "$2")
destination_name=$(basename "$2")

if [[ ! -d "$destination_parent_input" ]]; then
  printf 'Destination parent does not exist: %s\n' "$destination_parent_input" >&2
  exit 1
fi

destination_parent=$(cd "$destination_parent_input" && pwd -P)
destination_repository="$destination_parent/$destination_name"

if [[ -z "$destination_name" || "$destination_name" == '.' || "$destination_name" == '..' ]]; then
  printf '%s\n' 'Destination must name a new repository directory.' >&2
  exit 1
fi

if [[ -e "$destination_repository" ]]; then
  printf 'Destination already exists: %s\n' "$destination_repository" >&2
  exit 1
fi

case "$destination_repository/" in
  "$source_repository/" | "$source_repository/"*)
    printf '%s\n' 'Destination must be outside the source repository.' >&2
    exit 1
    ;;
esac

git -C "$source_repository" rev-parse --is-inside-work-tree >/dev/null

if [[ -n "$(git -C "$source_repository" status --porcelain)" ]]; then
  printf '%s\n' 'Source repository must be clean before export.' >&2
  exit 1
fi

if [[ ! -f "$source_repository/LICENSE" ]]; then
  printf '%s\n' 'Source repository must contain a LICENSE file.' >&2
  exit 1
fi

created_destination=false
cleanup_on_failure() {
  if [[ "$created_destination" == true && -d "$destination_repository" ]]; then
    rm -rf -- "$destination_repository"
  fi
}
trap cleanup_on_failure EXIT

mkdir "$destination_repository"
created_destination=true

git -C "$source_repository" archive --format=tar HEAD | tar -xf - -C "$destination_repository"
gitleaks dir --redact --no-banner "$destination_repository"

git -C "$destination_repository" init -b main >/dev/null
git -C "$destination_repository" add -A

while IFS= read -r -d '' entry; do
  mode=${entry%% *}
  path=${entry#*$'\t'}
  if [[ "$mode" == '100755' ]]; then
    git -C "$destination_repository" update-index --chmod=+x -- "$path"
  fi
done < <(git -C "$source_repository" ls-files --stage -z)

if [[ -f "$destination_repository/APP/scripts/open-source-boundaries.test.mjs" ]]; then
  (
    cd "$destination_repository/APP"
    node --test ./scripts/open-source-boundaries.test.mjs
  )
fi

git -C "$destination_repository" \
  -c user.name='SekerChat Release' \
  -c user.email='noreply@example.com' \
  commit -m '初始: 发布 SekerChat 开源快照' >/dev/null

gitleaks git --redact --no-banner "$destination_repository"

created_destination=false
trap - EXIT
printf 'Created sanitized public repository: %s\n' "$destination_repository"
