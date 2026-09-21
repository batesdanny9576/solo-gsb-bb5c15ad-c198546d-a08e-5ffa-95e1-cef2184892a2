import { useMemo } from 'react'

/**
 * 编码共现视图：编码两两关系矩阵 + 选中单元格的交集片段明细。
 *
 * 后端按「先合并同一编码自身重叠 / 相邻区间、再对编码对求交集」的口径
 * 返回上三角（含对角线）非零格，这里镜像为方阵。metric 可在共现覆盖
 * 字符数（chars）与共现片段数（fragments）之间切换，颜色按当前口径下
 * 的最大值深浅着色。
 */
export function cellKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

export default function CooccurrenceMatrix({
  codes,
  matrix,
  metric,
  onMetricChange,
  selectedPair,
  onSelectPair,
  onLocateFragment,
  loading,
}) {
  const codesById = useMemo(() => new Map(codes.map((c) => [c.id, c])), [codes])
  const cellMap = useMemo(() => {
    const m = new Map()
    for (const c of matrix?.cells || []) m.set(cellKey(c.row_code_id, c.col_code_id), c)
    return m
  }, [matrix])

  const maxValue = useMemo(() => {
    let max = 0
    for (const c of matrix?.cells || []) {
      if (!c.diagonal) max = Math.max(max, c[metric === 'chars' ? 'char_count' : 'fragment_count'])
    }
    return max
  }, [matrix, metric])

  const activeIds = matrix?.active_code_ids || []
  const selectedCell = selectedPair
    ? cellMap.get(cellKey(selectedPair[0], selectedPair[1])) || null
    : null

  if (loading) {
    return <div className="cooc-empty">共现统计加载中…</div>
  }

  if (!matrix) return null

  if (activeIds.length === 0) {
    return (
      <div className="cooc-empty">
        当前筛选条件下没有任何编码标注，无法生成共现矩阵。
        <br />
        请在右侧编码本中勾选编码，或先为本文档添加编码。
      </div>
    )
  }

  if (activeIds.length < 2) {
    const only = codesById.get(activeIds[0])
    return (
      <div className="cooc-empty">
        当前筛选条件下仅有 1 个编码（{only?.name}），至少需要 2 个编码才能呈现两两共现关系。
      </div>
    )
  }

  const offDiagonal = matrix.cells.filter((c) => !c.diagonal)
  const totalChars = offDiagonal.reduce((n, c) => n + c.char_count, 0)
  const totalFragments = offDiagonal.reduce((n, c) => n + c.fragment_count, 0)
  const nonZeroPairs = offDiagonal.length

  function cellColor(cell) {
    if (cell.diagonal) return undefined
    const value = cell[metric === 'chars' ? 'char_count' : 'fragment_count']
    if (value === 0 || maxValue === 0) return undefined
    // 深浅按线性归一，带下限避免最大格颜色过深
    const t = value / maxValue
    const alpha = 0.12 + 0.62 * t
    const ink = t > 0.55
    return { background: `rgba(37, 99, 235, ${alpha.toFixed(3)})`, color: ink ? '#fff' : undefined }
  }

  return (
    <div className="cooc-view">
      <div className="cooc-toolbar">
        <div className="metric-toggle" role="group" aria-label="共现口径">
          <button
            type="button"
            className={metric === 'chars' ? 'active' : ''}
            onClick={() => onMetricChange('chars')}
          >
            共现覆盖字符数
          </button>
          <button
            type="button"
            className={metric === 'fragments' ? 'active' : ''}
            onClick={() => onMetricChange('fragments')}
          >
            共现片段数
          </button>
        </div>
        <span className="cooc-summary">
          {activeIds.length} 个编码 · {nonZeroPairs} 对存在共现 · 合计 {totalChars} 字符 /{' '}
          {totalFragments} 个片段
        </span>
      </div>

      <div className="cooc-scroll">
        <table className="cooc-matrix">
          <thead>
            <tr>
              <th className="cooc-corner">编码</th>
              {activeIds.map((id) => {
                const code = codesById.get(id)
                return (
                  <th key={id} className="cooc-col-head">
                    <span className="dot" style={{ background: code?.color }} />
                    {code?.name}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {activeIds.map((rowId) => {
              const rowCode = codesById.get(rowId)
              return (
                <tr key={rowId}>
                  <th className="cooc-row-head">
                    <span className="dot" style={{ background: rowCode?.color }} />
                    {rowCode?.name}
                  </th>
                  {activeIds.map((colId) => {
                    const cell = cellMap.get(cellKey(rowId, colId))
                    if (!cell) {
                      return (
                        <td key={colId} className="cooc-cell zero" title="无共现">
                          0
                        </td>
                      )
                    }
                    const value = cell[metric === 'chars' ? 'char_count' : 'fragment_count']
                    const isSelected =
                      selectedPair &&
                      cellKey(selectedPair[0], selectedPair[1]) === cellKey(rowId, colId)
                    const title = cell.diagonal
                      ? `${rowCode?.name} · 自身合并覆盖 ${cell.char_count} 字 / ${cell.fragment_count} 段`
                      : `${codesById.get(rowId)?.name} × ${codesById.get(colId)?.name}\n共现 ${cell.char_count} 字 / ${cell.fragment_count} 段`
                    return (
                      <td key={colId} className="cooc-cell-wrap">
                        <button
                          type="button"
                          className={`cooc-cell ${cell.diagonal ? 'diagonal' : ''} ${
                            isSelected ? 'selected' : ''
                          }`}
                          style={cellColor(cell)}
                          title={title}
                          onClick={() => onSelectPair([rowId, colId])}
                        >
                          {value}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="cooc-legend">
        口径：先合并同一编码自身重叠 / 相邻的半开区间，再对编码对求交集，共享字符不重复计数；
        颜色深浅按{metric === 'chars' ? '共现字符数' : '共现片段数'}相对最大值着色，斜纹格为编码自身合并覆盖。
      </p>

      <CoocDetail
        cell={selectedCell}
        codesById={codesById}
        metric={metric}
        onLocateFragment={onLocateFragment}
      />
    </div>
  )
}

function CoocDetail({ cell, codesById, metric, onLocateFragment }) {
  if (!cell) {
    return (
      <div className="cooc-detail empty">
        点击矩阵中的非零单元格，查看对应交集片段及原文摘录；点击片段可回到正文定位高亮。
      </div>
    )
  }

  const a = codesById.get(cell.row_code_id)
  const b = codesById.get(cell.col_code_id)
  const title = cell.diagonal
    ? `${a?.name} · 自身合并覆盖`
    : `${a?.name} × ${b?.name} · 交集片段`

  return (
    <div className="cooc-detail">
      <div className="cooc-detail-head">
        <strong>{title}</strong>
        <span className="cooc-detail-stats">
          共现 {cell.char_count} 字 · {cell.fragment_count} 个片段
          {metric === 'fragments' && '（当前口径：片段数）'}
        </span>
      </div>
      <ul className="cooc-fragment-list">
        {cell.fragments.map((f) => (
          <li key={`${f.start}-${f.end}`}>
            <button
              type="button"
              className="cooc-fragment"
              title={`[${f.start}, ${f.end}) ${f.end - f.start} 字 · 点击回到正文定位`}
              onClick={() => onLocateFragment({ start: f.start, end: f.end })}
            >
              <code className="cooc-fragment-range">
                [{f.start}, {f.end})
              </code>
              <span className="cooc-fragment-text">{f.text}</span>
              <span className="cooc-fragment-len">{f.end - f.start} 字</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
