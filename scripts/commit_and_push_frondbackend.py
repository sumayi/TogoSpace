#!/usr/bin/env python3
"""按显式 action 执行仓库状态查看、提交、同步、推送。

背景:
    现在前后端代码都位于同一个仓库中：
    - `frontend/` 为前端目录
    - 其余源码与脚本位于主仓库根目录
    - sync / push 仍然以当前 git 分支为单位执行

用法:
    python scripts/commit_and_push_frondbackend.py --action status
    python scripts/commit_and_push_frondbackend.py --action commit -m "fix: description"
    python scripts/commit_and_push_frondbackend.py --action push
    python scripts/commit_and_push_frondbackend.py --action sync,commit,push --target frontend -m "fix: description"

说明:
    - --action 必填，使用逗号分隔动作
    - --target 默认 all，可选 frontend / backend / all
    - 包含 commit 时必须传 -m/--message
    - sync 仅做 fast-forward，不自动 merge
    - status 为独立动作，不与其他 action 混用
    - target 仅影响 status / commit 的文件范围；sync / push 始终作用于当前分支
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


REMOTE_NAME = "origin"
REPO_DISPLAY_NAME = "仓库"
VALID_ACTIONS = ("status", "sync", "commit", "push")
VALID_ACTION_SEQUENCES = {
    ("status",),
    ("sync",),
    ("commit",),
    ("push",),
    ("sync", "commit"),
    ("sync", "push"),
    ("commit", "push"),
    ("sync", "commit", "push"),
}
VALID_TARGETS = ("frontend", "backend", "all")


def run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess:
    """执行命令，失败时抛异常。"""
    return subprocess.run(cmd, cwd=cwd, check=True, capture_output=True, text=True)


def get_pathspecs(target: str) -> list[str]:
    if target == "frontend":
        return ["frontend"]
    if target == "backend":
        return [".", ":(exclude)frontend"]
    return ["."]


def get_status_lines(repo: Path, target: str = "all") -> list[str]:
    """返回 git status --porcelain 的非空行。"""
    result = run(["git", "status", "--porcelain", "--", *get_pathspecs(target)], cwd=repo)
    return [line for line in result.stdout.splitlines() if line.strip()]


def has_changes(repo: Path, target: str = "all") -> bool:
    """检查仓库是否有未提交的改动。"""
    return bool(get_status_lines(repo, target))


def get_current_branch(repo: Path) -> str:
    result = run(["git", "branch", "--show-current"], cwd=repo)
    return result.stdout.strip()


def get_tracking_target(repo: Path) -> tuple[str, str]:
    """返回当前仓库用于同步/推送的 (remote, branch)。"""
    current_branch = get_current_branch(repo)
    try:
        result = run(["git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd=repo)
        upstream = result.stdout.strip()
        remote, branch = upstream.split("/", 1)
        return remote, branch
    except subprocess.CalledProcessError:
        return REMOTE_NAME, current_branch


def fetch_remote_branch(repo: Path, name: str, remote: str, branch: str) -> None:
    print(f"{name}: 获取远端状态...")
    try:
        run(["git", "fetch", remote, branch], cwd=repo)
    except subprocess.CalledProcessError as e:
        print(f"{name}: 获取远端状态失败")
        print(e.stderr.strip())
        sys.exit(1)


def try_fetch_remote_branch(repo: Path, remote: str, branch: str) -> tuple[bool, str]:
    try:
        run(["git", "fetch", remote, branch], cwd=repo)
        return True, ""
    except subprocess.CalledProcessError as e:
        return False, e.stderr.strip()


def get_ahead_behind(repo: Path, remote: str, branch: str) -> tuple[int, int]:
    result = run(
        ["git", "rev-list", "--left-right", "--count", f"{remote}/{branch}...HEAD"],
        cwd=repo,
    )
    behind_raw, ahead_raw = result.stdout.strip().split()
    return int(behind_raw), int(ahead_raw)


def get_latest_commit(repo: Path) -> str:
    result = run(["git", "log", "-1", "--oneline"], cwd=repo)
    return result.stdout.strip()


def pull_ff_only(repo: Path, name: str, remote: str, branch: str) -> None:
    print(f"{name}: fast-forward 拉取远端代码...")
    try:
        run(["git", "pull", "--ff-only", remote, branch], cwd=repo)
    except subprocess.CalledProcessError as e:
        print(f"{name}: 拉取失败，可能需要手动处理")
        print(e.stderr.strip())
        print("请手动处理后再运行此脚本:")
        print(f"  cd {repo}")
        print("  git status")
        print(f"  git pull --ff-only {remote} {branch}")
        sys.exit(1)


def push_remote_branch(repo: Path, name: str, remote: str, branch: str) -> None:
    print(f"{name}: 推送到远端...")
    try:
        run(["git", "push", remote, f"HEAD:{branch}"], cwd=repo)
    except subprocess.CalledProcessError as e:
        print(f"{name}: 推送失败")
        print(e.stderr.strip())
        sys.exit(1)


def commit_target(repo: Path, name: str, commit_msg: str, target: str) -> None:
    """提交指定目标范围的改动。"""
    print(f"{name}: 提交本地改动...")
    pathspecs = get_pathspecs(target)
    try:
        run(["git", "add", "-A", "--", *pathspecs], cwd=repo)
        run(["git", "commit", "-m", commit_msg], cwd=repo)
    except subprocess.CalledProcessError as e:
        print(f"{name}: 提交失败")
        print(e.stderr.strip())
        sys.exit(1)


def parse_actions(raw: str) -> list[str]:
    seen: set[str] = set()
    actions: list[str] = []

    for token in raw.split(","):
        action = token.strip().lower()
        if not action:
            continue
        if action not in VALID_ACTIONS:
            print(f"❌ 未知 action: '{action}'（可选: {', '.join(VALID_ACTIONS)}）", file=sys.stderr)
            sys.exit(1)
        if action in seen:
            print(f"❌ 重复 action: '{action}'", file=sys.stderr)
            sys.exit(1)
        seen.add(action)
        actions.append(action)

    if not actions:
        print("❌ --action 不能为空", file=sys.stderr)
        sys.exit(1)

    if tuple(actions) not in VALID_ACTION_SEQUENCES:
        valid_examples = ", ".join(",".join(seq) for seq in VALID_ACTION_SEQUENCES)
        print(f"❌ 非法 action 顺序: '{raw}'", file=sys.stderr)
        print(f"   仅支持: {valid_examples}", file=sys.stderr)
        sys.exit(1)

    return actions


def ensure_message_requirements(actions: list[str], message: str | None) -> None:
    if "commit" in actions and not message:
        print("❌ action 包含 commit 时，必须传 -m/--message", file=sys.stderr)
        sys.exit(1)
    if "commit" not in actions and message:
        print("❌ 未执行 commit 时，不需要传 -m/--message", file=sys.stderr)
        sys.exit(1)


def print_repo_status(repo: Path, name: str, target: str) -> None:
    branch = get_current_branch(repo)
    dirty = has_changes(repo, target)
    latest_commit = get_latest_commit(repo)
    remote, remote_branch = get_tracking_target(repo)
    fetched, fetch_error = try_fetch_remote_branch(repo, remote, remote_branch)

    print(f"[{name}]")
    print(f"  target: {target}")
    print(f"  branch: {branch}")
    print(f"  worktree: {'dirty' if dirty else 'clean'}")
    print(f"  latest: {latest_commit}")

    if fetched:
        behind, ahead = get_ahead_behind(repo, remote, remote_branch)
        print(f"  remote: {remote}/{remote_branch}")
        print(f"  behind: {behind}")
        print(f"  ahead: {ahead}")
    else:
        print(f"  remote: {remote}/{remote_branch} (unavailable)")
        print(f"  fetch_error: {fetch_error}")

    lines = get_status_lines(repo, target)
    if lines:
        print("  changes:")
        for line in lines:
            print(f"    {line}")

    print()


def ensure_can_sync_or_push(
    repo: Path,
    name: str,
    dirty: bool,
    behind: int,
    ahead: int,
    remote: str,
    branch: str,
) -> None:
    if dirty and behind > 0:
        print(f"{name}: 存在未提交改动，且本地落后远端 {behind} 个提交，无法安全自动同步")
        print("请先手动处理冲突/同步后再运行脚本")
        print(f"  cd {repo}")
        print("  git status")
        sys.exit(1)

    if behind > 0 and ahead > 0:
        print(f"{name}: 本地与远端已分叉 (behind={behind}, ahead={ahead})，请手动处理")
        print(f"  cd {repo}")
        print("  git status")
        print(f"  git log --oneline --left-right {remote}/{branch}...HEAD")
        sys.exit(1)


def process_repo(repo: Path, name: str, actions: list[str], commit_msg: str | None, target: str) -> None:
    remote, remote_branch = get_tracking_target(repo)
    dirty = has_changes(repo, target)
    behind = 0
    ahead = 0

    if target != "all" and any(action in actions for action in ("sync", "push")):
        print(f"{name}: sync/push 按分支执行，不区分 {target} 目录范围")

    if "sync" in actions or "push" in actions:
        fetch_remote_branch(repo, name, remote, remote_branch)
        behind, ahead = get_ahead_behind(repo, remote, remote_branch)
        ensure_can_sync_or_push(repo, name, dirty, behind, ahead, remote, remote_branch)

    if "sync" in actions:
        if behind > 0:
            pull_ff_only(repo, name, remote, remote_branch)
            fetch_remote_branch(repo, name, remote, remote_branch)
            behind, ahead = get_ahead_behind(repo, remote, remote_branch)
        else:
            print(f"{name}: 无需同步")

    if "commit" in actions:
        dirty = has_changes(repo, target)
        if dirty:
            commit_target(repo, name, commit_msg or "", target)
        else:
            print(f"{name}: 目标范围内无未提交改动，跳过 commit")

    if "push" in actions:
        fetch_remote_branch(repo, name, remote, remote_branch)
        behind, ahead = get_ahead_behind(repo, remote, remote_branch)
        ensure_can_sync_or_push(repo, name, has_changes(repo), behind, ahead, remote, remote_branch)
        if ahead > 0:
            push_remote_branch(repo, name, remote, remote_branch)
        else:
            print(f"{name}: 无需推送")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="TogoSpace 仓库提交/同步/推送脚本")
    parser.add_argument(
        "--action",
        type=str,
        required=True,
        help="要执行的动作，使用逗号分隔，例如: sync,commit,push",
    )
    parser.add_argument(
        "--target",
        type=str,
        default="all",
        choices=VALID_TARGETS,
        help="目标范围：frontend / backend / all，默认 all",
    )
    parser.add_argument(
        "-m",
        "--message",
        type=str,
        default=None,
        help="commit message；仅在 action 包含 commit 时必填",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    actions = parse_actions(args.action)
    ensure_message_requirements(actions, args.message)

    repo_root = Path(__file__).resolve().parent.parent

    print(f"ℹ️  action: {','.join(actions)}")
    print(f"ℹ️  target: {args.target}")

    if actions == ["status"]:
        print_repo_status(repo_root, REPO_DISPLAY_NAME, args.target)
        print("完成")
        return

    process_repo(repo_root, REPO_DISPLAY_NAME, actions, args.message, args.target)
    print("完成")


if __name__ == "__main__":
    main()
