# CI helpers for bin/mk-show. Safe to source: definitions only.

# Return HOST/OWNER/REPO without consulting cwd or making a network request.
show_github_repo_from_remote() {
  local remote="${1%/}" host path
  case "$remote" in
    https://*|http://*|ssh://*)
      path="${remote#*://}"
      host="${path%%/*}"
      path="${path#*/}"
      host="${host##*@}"
      host="${host%%:*}"
      ;;
    *@*:*)
      host="${remote%%:*}"
      host="${host##*@}"
      path="${remote#*:}"
      ;;
    *) return 1 ;;
  esac
  path="${path%.git}"
  [[ "$host" =~ ^[a-zA-Z0-9.-]+$ && "$path" =~ ^[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+$ ]] || return 1
  [[ "${path#*/}" != '.' && "${path#*/}" != '..' ]] || return 1
  printf '%s/%s\n' "$host" "$path"
}

# Print the CI verdict; nonzero means the promotion must remain blocked.
show_ci_check_runs() {
  local dev_root="$1" sha="$2" remote repo response
  if ! command -v gh >/dev/null 2>&1; then
    echo 'تعذّر الاستعلام عن CI — أداة gh غير موجودة'
    return 1
  fi
  if ! remote="$(git -C "$dev_root" remote get-url origin 2>/dev/null)" ||
     ! repo="$(show_github_repo_from_remote "$remote")"; then
    echo 'تعذّر تحديد مستودع CI من origin في DEV_ROOT'
    return 1
  fi
  # gh api has no -R. Pin both repo and host, and run inside DEV_ROOT.
  # Fetch once (all pages), so emptiness and failures use the same response.
  if ! response="$(cd "$dev_root" && GH_REPO="$repo" gh api \
      --hostname "${repo%%/*}" "repos/${repo#*/}/commits/$sha/check-runs" \
      --paginate 2>&1)"; then
    case "$response" in
      *'HTTP 401'*|*'gh auth login'*|*'GH_TOKEN'*|*'GITHUB_TOKEN'*)
        echo 'لا مصادقة gh صالحة — سجّل الدخول للمضيف المحدّد في origin' ;;
      *'error connecting to '*|*'no such host'*|*'dial tcp'*|*'timeout'*|*'connection refused'*|*'network is unreachable'*|*'TLS handshake'*)
        echo 'لا شبكة — تعذّر الاتصال بمضيف CI' ;;
      *) echo 'تعذّر الاستعلام عن CI — خطأ API أو صلاحية وصول؛ ليس غياب check-runs' ;;
    esac
    return 1
  fi
  printf '%s' "$response" | show_ci_verdict
}

show_ci_verdict() {
  local runs total nonpass names
  if ! runs="$(jq -se '
      if length > 0 and all(.[]; (.check_runs | type) == "array" and
        all(.check_runs[]; type == "object" and (.name | type) == "string"))
      then [.[].check_runs[]] else error("invalid check-runs response") end' 2>/dev/null)"; then
    echo 'تعذّر تحليل استجابة check-runs (jq فشل)'
    return 1
  fi
  total="$(printf '%s' "$runs" | jq 'length')"
  if [[ "$total" == '0' ]]; then
    echo 'لا check-runs — CI لم يعمل على هذا الالتزام'
    return 1
  fi
  nonpass="$(printf '%s' "$runs" | jq '[.[] | select(.conclusion != "success" and .conclusion != "skipped")]')"
  if [[ "$nonpass" != '[]' ]]; then
    names="$(printf '%s' "$nonpass" | jq -r '.[0:3] | map("\(.name) [\(.conclusion // "pending")]") | join("؛")')"
    echo "CI: $(printf '%s' "$nonpass" | jq 'length') check-run لم تنجح — $names"
    return 1
  fi
  echo "$total check-run كلّها نجحت."
}
