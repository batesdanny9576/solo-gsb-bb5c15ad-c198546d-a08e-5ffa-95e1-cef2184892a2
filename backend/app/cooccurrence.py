"""编码共现（co-occurrence）统计的纯函数逻辑。

口径说明：
  - 每个编码（code）在文档上可能有多条半开区间标注，彼此可能重叠（keep
    决策允许同名共存）。统计前先把同一编码自身**重叠或相邻**的区间合并为
    互不相交的区间集合。
  - 编码对的共现片段 = 两个合并后区间集合的逐对交集。由于合并后集合内部
    互不相交，交集片段之间也互不相交，因此「共现字符数」不会重复计数。
  - 共现片段数 = 交集片段的条数。
  - 编码与自身的共现 = 合并后的自身覆盖（对角线上的口径基线）。
"""

from __future__ import annotations

from collections import defaultdict
from typing import Iterable


def merge_intervals(intervals: Iterable[tuple[int, int]]) -> list[tuple[int, int]]:
    """把同一编码的半开区间合并重叠或首尾相接（[a,b) 与 [b,c)）者。

    返回按起点排序、互不相交的区间列表，丢弃非法（end <= start）输入。
    """
    ordered = sorted(((s, e) for s, e in intervals if e > s), key=lambda iv: (iv[0], iv[1]))
    merged: list[tuple[int, int]] = []
    for s, e in ordered:
        if merged and s <= merged[-1][1]:
            # 重叠或相邻（s == 上一区间 end）都并入当前段
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    return merged


def intersect_interval_sets(
    a: list[tuple[int, int]], b: list[tuple[int, int]]
) -> list[tuple[int, int]]:
    """两个已合并（有序、互不相交）区间集合的交集，双指针线性扫描。"""
    out: list[tuple[int, int]] = []
    i = j = 0
    while i < len(a) and j < len(b):
        s = max(a[i][0], b[j][0])
        e = min(a[i][1], b[j][1])
        if s < e:
            out.append((s, e))
        # 末端较小的指针前移（末端相等则同时前移）
        if a[i][1] < b[j][1]:
            i += 1
        elif a[i][1] > b[j][1]:
            j += 1
        else:
            i += 1
            j += 1
    return out


def _cell(
    row_id: int,
    col_id: int,
    fragments: list[tuple[int, int]],
    *,
    diagonal: bool = False,
) -> dict:
    return {
        "row_code_id": row_id,
        "col_code_id": col_id,
        "char_count": sum(e - s for s, e in fragments),
        "fragment_count": len(fragments),
        "diagonal": diagonal,
        "fragments": [{"start": s, "end": e} for s, e in fragments],
    }


def build_cooccurrence(codings: Iterable[dict]) -> dict:
    """按文档内全部标注构建编码两两共现矩阵。

    codings 至少包含 code_id / start / end 字段。返回：
      {
        "active_code_ids": [...],          # 文档内有标注的编码，按 id 排序
        "cells": [ {row_code_id, col_code_id, char_count,
                    fragment_count, diagonal, fragments}, ... ],
      }
    cells 仅包含非零格（含始终非零的对角线自身覆盖），按 (row, col) 排序，
    只输出上三角（含对角线），前端镜像即可。
    """
    grouped: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for c in codings:
        grouped[c["code_id"]].append((c["start"], c["end"]))

    merged_by_code: dict[int, list[tuple[int, int]]] = {
        code_id: merge_intervals(intervals) for code_id, intervals in grouped.items()
    }
    active_ids = sorted(merged_by_code)

    cells: list[dict] = []
    for i, row_id in enumerate(active_ids):
        # 对角线：该编码合并后的自身覆盖
        cells.append(_cell(row_id, row_id, merged_by_code[row_id], diagonal=True))
        for col_id in active_ids[i + 1 :]:
            fragments = intersect_interval_sets(
                merged_by_code[row_id], merged_by_code[col_id]
            )
            if fragments:
                cells.append(_cell(row_id, col_id, fragments))

    return {"active_code_ids": active_ids, "cells": cells}
