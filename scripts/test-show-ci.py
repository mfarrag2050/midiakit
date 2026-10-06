#!/usr/bin/env python3
"""602 regression: test CI helpers offline, never execute bin/mk-show."""
import os
from pathlib import Path
import subprocess
import tempfile

HELPERS = Path(__file__).resolve().parent / 'lib' / 'show-ci.sh'


def shell(body, *args, cwd, env):
    return subprocess.run(
        ['bash', '-c', 'set -euo pipefail; source "$1"; shift; ' + body,
         'test-show-ci', str(HELPERS), *args],
        cwd=cwd, env=env, text=True, capture_output=True, check=False,
    )


with tempfile.TemporaryDirectory(prefix='602-gate-cwd-') as tmp:
    root = Path(tmp)
    dev = root / 'dev repo'
    outside = root / 'outside'
    other = root / 'other-repo'
    mocks = root / 'mock-bin'
    for directory in (dev, outside, other, mocks):
        directory.mkdir()
    for directory in (dev, other):
        subprocess.run(['git', 'init', '-q', str(directory)], check=True)
    subprocess.run(['git', '-C', str(dev), 'remote', 'add', 'origin',
                    'git@github.com:sample-owner/sample-repo.git'], check=True)
    subprocess.run(['git', '-C', str(other), 'remote', 'add', 'origin',
                    'https://github.com/wrong-owner/wrong-repo.git'], check=True)

    # Only the external HTTP client is replaced; git and jq remain real.
    gh = mocks / 'gh'
    gh.write_text('''#!/usr/bin/env bash
set -euo pipefail
[[ "$PWD" == "$EXPECTED_DEV" && "$GH_REPO" == 'github.com/sample-owner/sample-repo' ]] || exit 91
[[ "$*" == 'api --hostname github.com repos/sample-owner/sample-repo/commits/abc123/check-runs --paginate' ]] || exit 92
printf '%s\\n' "$API_RESPONSE"
exit "$API_EXIT"
''')
    gh.chmod(0o755)
    env = dict(os.environ, PATH=str(mocks) + os.pathsep + os.environ['PATH'],
               EXPECTED_DEV=str(dev), GH_REPO='wrong-owner/wrong-repo',
               GH_HOST='wrong-host.example', API_RESPONSE='', API_EXIT='0')

    remotes = [
        'git@github.com:sample-owner/sample-repo.git',
        'git@github.com:sample-owner/sample-repo',
        'https://github.com/sample-owner/sample-repo.git',
        'https://github.com/sample-owner/sample-repo',
        'ssh://git@github.com/sample-owner/sample-repo.git',
        'ssh://git@github.com:22/sample-owner/sample-repo',
    ]
    for remote in remotes:
        result = shell('show_github_repo_from_remote "$1"', remote, cwd=outside, env=env)
        assert result.returncode == 0, result.stderr
        assert result.stdout.strip() == 'github.com/sample-owner/sample-repo', result.stdout
        print(f'PASS remote: {remote} -> {result.stdout.strip()}')
    for remote in ('/tmp/local-repo', 'https://github.com/owner', 'https://github.com/a/b/c'):
        result = shell('show_github_repo_from_remote "$1"', remote, cwd=outside, env=env)
        assert result.returncode != 0 and result.stdout == '', remote
        print(f'PASS rejected remote: {remote}')

    success = '{"check_runs":[{"name":"build","conclusion":"success"}]}'
    cases = [
        ('success', success, 0, True, '1 check-run'),
        ('auth-missing', 'To get started with GitHub CLI, please run: gh auth login', 4, False, 'لا مصادقة gh'),
        ('auth-invalid', 'gh: Bad credentials (HTTP 401)', 1, False, 'لا مصادقة gh'),
        ('network', 'error connecting to api.github.com', 1, False, 'لا شبكة'),
        ('forbidden', 'gh: Forbidden (HTTP 403)', 1, False, 'خطأ API'),
        ('empty', '{"check_runs":[]}', 0, False, 'لا check-runs'),
        ('failed', '{"check_runs":[{"name":"build","conclusion":"failure"}]}', 0, False, 'لم تنجح'),
        ('pending', '{"check_runs":[{"name":"build","conclusion":null}]}', 0, False, 'pending'),
        ('later-page-failed', success + '\n{"check_runs":[{"name":"lint","conclusion":"failure"}]}', 0, False, 'lint [failure]'),
        ('skipped', '{"check_runs":[{"name":"build","conclusion":"skipped"}]}', 0, True, '1 check-run'),
        ('malformed-run', '{"check_runs":[42]}', 0, False, 'تعذّر تحليل'),
        ('malformed', '{"message":"unexpected"}', 0, False, 'تعذّر تحليل'),
    ]
    for name, response, exit_code, passes, message in cases:
        env.update(API_RESPONSE=response, API_EXIT=str(exit_code))
        for cwd in (outside, other):
            # Match cmd_gate's conditional capture, including Bash errexit semantics.
            result = shell('if output="$(show_ci_check_runs "$1" abc123)"; then '
                           'printf "%s\\n" "$output"; else printf "%s\\n" "$output"; exit 1; fi',
                           str(dev), cwd=cwd, env=env)
            assert (result.returncode == 0) == passes, (name, result.stdout, result.stderr)
            assert message in result.stdout, (name, result.stdout)
        print(f'PASS CI {name}: outside + unrelated repo -> {"accept" if passes else "reject"}')

print('PASS: 6 remote formats, 3 rejected remotes, 12 CI scenarios × 2 caller directories')
