import { useEffect, useMemo, useRef, useState } from 'react'

const GENDER_COLORS = { F: '#c62828', M: '#1d4ed8', '?': '#4b5563' }
const TURN_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0ea5e9', '#d946ef', '#16a34a', '#f97316', '#1d4ed8', '#e11d48', '#10b981']

const hashString = (str) => {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return h
}

const colorForSpeaker = (name, gender, colorMap) => {
  if (!name) return GENDER_COLORS[gender] ?? '#6b7280'
  const fromMap = colorMap?.get(name)
  if (fromMap) return fromMap
  const idx = Math.abs(hashString(name)) % TURN_COLORS.length
  return TURN_COLORS[idx] ?? GENDER_COLORS[gender] ?? '#6b7280'
}

const displayTitle = (title) => (title ? String(title).replace(/_/g, ' ') : '')

const computePositions = (nodes = [], width = 560, height = 560) => {
  if (!nodes.length) return new Map()
  const sorted = [...nodes].sort((a, b) => (a.id || '').localeCompare(b.id || ''))
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) * 0.35
  const map = new Map()
  const n = sorted.length
  sorted.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)
    map.set(node.id || node.name, { x, y })
  })
  return map
}

const normalizeGender = (name, rawGender, femaleMap = {}) => {
  if (rawGender === 'F' || rawGender === 'M' || rawGender === '?') return rawGender
  if (typeof rawGender === 'boolean') return rawGender ? 'F' : 'M'
  if (name in femaleMap) return femaleMap[name] ? 'F' : 'M'
  return '?'
}

const buildSceneGraph = (scene, femaleMap) => {
  const turns = scene?.turns ?? []
  const nodesMap = new Map()
  const edgesMap = new Map()

  const ensureNode = (speaker) => {
    if (!speaker) return null
    if (!nodesMap.has(speaker)) {
      nodesMap.set(speaker, { id: speaker, name: speaker, gender: normalizeGender(speaker, undefined, femaleMap), words: 0 })
    }
    return nodesMap.get(speaker)
  }

  turns.forEach((turn, idx) => {
    const node = ensureNode(turn.speaker)
    if (node) node.words += Number(turn.words ?? 0)
    if (idx === 0) return
    const prev = turns[idx - 1]
    const a = prev?.speaker
    const b = turn?.speaker
    if (!a || !b) return
    const key = `${a}|${b}`
    if (!edgesMap.has(key)) edgesMap.set(key, { source: a, target: b, count: 0 })
    edgesMap.get(key).count += 1
  })

  return { nodes: Array.from(nodesMap.values()), edges: Array.from(edgesMap.values()) }
}

const BUILD_TAG = 'v2025-12-18-3'

const SceneNetwork = ({ scene, currentTurnPair, currentSpeaker, currentTurn, isPlaying, femaleMap, colorMap, reservedHeight = 140 }) => {
  const graph = useMemo(() => buildSceneGraph(scene, femaleMap), [scene, femaleMap])
  const [anchors, setAnchors] = useState(new Map())
  const [positions, setPositions] = useState(new Map())
  const [weights, setWeights] = useState(new Map())
  const [nodeAlpha, setNodeAlpha] = useState(new Map())
  const [edgeAlpha, setEdgeAlpha] = useState(new Map())
  const [wordTotals, setWordTotals] = useState(new Map())
  const draggingRef = useRef(null)
  const activePointerRef = useRef(null)
  const svgRef = useRef(null)

  const [viewSize, setViewSize] = useState(640)
  const clamp = (v) => Math.max(12, Math.min(viewSize - 12, v ?? 0))

  useEffect(() => {
    const updateSize = () => {
      const w = typeof window !== 'undefined' ? window.innerWidth : 640
      const hAvail = typeof window !== 'undefined' ? window.innerHeight - reservedHeight : 640
      const target = Math.max(200, Math.min(640, Math.min(w - 24, hAvail - 12)))
      setViewSize(target)
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [reservedHeight])

  useEffect(() => {
    const a = computePositions(graph.nodes, viewSize, viewSize) || new Map()
    setAnchors(a)
    setPositions(a)
    setWeights(new Map())
    const initAlpha = new Map()
    graph.nodes.forEach(n => initAlpha.set(n.id, 0.2))
    setNodeAlpha(initAlpha)
    setEdgeAlpha(new Map())
    setWordTotals(new Map())
    draggingRef.current = null
  }, [graph.nodes, scene?.act, scene?.scene])

  useEffect(() => {
    const pair = currentTurnPair
    if (!pair?.from || !pair?.to) return
    setPositions(prev => {
      const next = new Map(prev)
      const pull = 0.07
      const anchorPull = 0.03
      const aPos = next.get(pair.from) || anchors.get(pair.from)
      const bPos = next.get(pair.to) || anchors.get(pair.to)
      if (aPos && bPos) {
        const ax = clamp(aPos.x + (bPos.x - aPos.x) * pull)
        const ay = clamp(aPos.y + (bPos.y - aPos.y) * pull)
        const bx = clamp(bPos.x + (aPos.x - bPos.x) * pull)
        const by = clamp(bPos.y + (aPos.y - bPos.y) * pull)
        next.set(pair.from, { x: ax, y: ay })
        next.set(pair.to, { x: bx, y: by })
      }
      for (const node of graph.nodes) {
        const anchor = anchors.get(node.id)
        const pos = next.get(node.id) || anchor
        if (!anchor || !pos) continue
        const px = clamp(pos.x + (anchor.x - pos.x) * anchorPull)
        const py = clamp(pos.y + (anchor.y - pos.y) * anchorPull)
        next.set(node.id, { x: px, y: py })
      }
      return next
    })
    setWeights(prev => {
      const next = new Map(prev)
      const key = `${pair.from}|${pair.to}`
      next.set(key, (next.get(key) ?? 0) + 1)
      return next
    })
  }, [currentTurnPair, anchors, graph.nodes])

  useEffect(() => {
    if (!isPlaying) return
    if (!currentTurn?.speaker) return
    setWordTotals(prev => {
      const next = new Map(prev)
      const w = Number(currentTurn.words ?? 0)
      next.set(currentTurn.speaker, (next.get(currentTurn.speaker) ?? 0) + w)
      return next
    })
  }, [isPlaying, currentTurn])

  useEffect(() => {
    if (!isPlaying) return
    if (!currentTurn) return
    const decay = 0.95
    const floor = 0.2
    setNodeAlpha(prev => {
      const next = new Map()
      graph.nodes.forEach(n => {
        const v = prev.get(n.id) ?? floor
        next.set(n.id, Math.max(floor, v * decay))
      })
      const s = currentTurn.speaker
      if (s) next.set(s, 1)
      return next
    })
    setEdgeAlpha(prev => {
      const next = new Map()
      for (const [k, v] of prev.entries()) {
        next.set(k, Math.max(floor, v * decay))
      }
      if (currentTurnPair?.from && currentTurnPair?.to) {
        const key = `${currentTurnPair.from}|${currentTurnPair.to}`
        next.set(key, 1)
      }
      return next
    })
  }, [isPlaying, currentTurn, currentTurnPair, graph.nodes])

  if (!scene) return <p style={{ margin: '12px 0' }}>Velg et stykke for å starte.</p>

  const maxEdge = useMemo(() => {
    let m = 0
    for (const v of weights.values()) {
      if (v > m) m = v
    }
    return m
  }, [weights])

  const handlePointerMove = (e) => {
    const id = draggingRef.current
    if (!id) return
    if (activePointerRef.current !== null && e.pointerId !== activePointerRef.current) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = clamp(e.clientX - rect.left)
    const y = clamp(e.clientY - rect.top)
    setPositions(prev => {
      const next = new Map(prev)
      next.set(id, { x, y })
      return next
    })
  }

  const handlePointerUp = (e) => {
    if (activePointerRef.current !== null && e.pointerId !== activePointerRef.current) return
    draggingRef.current = null
    activePointerRef.current = null
  }

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
      <svg
        ref={svgRef}
        width={viewSize}
        height={viewSize}
        style={{ display: 'block', margin: '0 auto', touchAction: 'none' }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {Array.from(weights.entries()).map(([key, weight], i) => {
          const [fromId, toId] = key.split('|')
          const from = positions.get(fromId) || anchors.get(fromId)
          const to = positions.get(toId) || anchors.get(toId)
          if (!from || !to) return null
          const w = maxEdge ? 0.4 + 4.2 * (weight / maxEdge) : 1
          const op = Math.max(0.2, edgeAlpha.get(key) ?? 0.2)
          return (
            <line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="#cbd5e1"
              strokeWidth={w}
              strokeLinecap="round"
              strokeOpacity={op}
            />
          )
        })}

        {graph.nodes.map((node) => {
          const pos = positions.get(node.id) || anchors.get(node.id)
          if (!pos) return null
          const isCurrent = currentSpeaker === node.id
          const base = colorForSpeaker(node.id, node.gender, colorMap)
          const spoken = wordTotals.get(node.id) ?? 0
          const r = 10 + Math.min(18, Math.sqrt(spoken || 0))
          const alpha = Math.max(0.2, nodeAlpha.get(node.id) ?? 0.2)
          return (
            <g
              key={node.id}
              onPointerDown={(e) => {
                e.preventDefault()
                draggingRef.current = node.id
                activePointerRef.current = e.pointerId
                e.currentTarget.setPointerCapture?.(e.pointerId)
              }}
            >
              {isCurrent && (
                <circle cx={pos.x} cy={pos.y} r={r + 10} fill={base} opacity={0.12} />
              )}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r}
                fill={base}
                fillOpacity={alpha}
                stroke={isCurrent ? '#111827' : '#0f172a'}
                strokeWidth={isCurrent ? 2.2 : 1}
                strokeOpacity={Math.max(0.4, alpha)}
              />
              <text x={pos.x} y={pos.y + r + 12} fontSize="12" textAnchor="middle" fill="#0f172a">
                {node.name}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function App() {
  const [plays, setPlays] = useState([])
  const [femaleMap, setFemaleMap] = useState({})
  const [selectedId, setSelectedId] = useState('')
  const [sceneIndex, setSceneIndex] = useState(0)
  const [turnIndex, setTurnIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speedMs, setSpeedMs] = useState(30)
  const [screenW, setScreenW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200))
  const timerRef = useRef(null)
  const isSeekingRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
        const url = `${base}ibsen_networks.json`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Fetch feilet: ${res.status}`)
        const json = await res.json()
        setFemaleMap(json.FEMALE_CHARACTERS || {})
        const list = json.plays || []
        setPlays(list)
        if (list.length > 0) setSelectedId(list[0].id)
      } catch (err) {
        setError(err?.message || 'Kunne ikke laste data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    const update = () => {
      setScreenW(typeof window !== 'undefined' ? window.innerWidth : 1200)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const selectedPlay = useMemo(() => plays.find((p) => p.id === selectedId), [plays, selectedId])

  const sceneSequence = useMemo(() => {
    if (!selectedPlay?.scene_turns) return []
    const parseNum = (v) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : 0
    }
    return [...selectedPlay.scene_turns].sort((a, b) => {
      const actDiff = parseNum(a.act) - parseNum(b.act)
      if (actDiff !== 0) return actDiff
      return parseNum(a.scene) - parseNum(b.scene)
    })
  }, [selectedPlay])

  const speakerColors = useMemo(() => {
    const names = new Set()
    sceneSequence.forEach(sc => sc.turns?.forEach(t => t?.speaker && names.add(t.speaker)))
    const list = Array.from(names).sort()
    const map = new Map()
    const n = Math.max(1, list.length)
    list.forEach((name, i) => {
      const hue = (i * 137.508) % 360 // golden angle for spread
      const color = `hsl(${hue}, 65%, 55%)`
      map.set(name, color)
    })
    return map
  }, [sceneSequence])

  const totalTurns = useMemo(
    () => sceneSequence.reduce((sum, sc) => sum + (sc.turns?.length ?? 0), 0),
    [sceneSequence]
  )

  const currentScene = sceneSequence[sceneIndex] || null
  const currentTurn = currentScene?.turns?.[turnIndex] || null
  const prevTurn = turnIndex > 0 ? currentScene?.turns?.[turnIndex - 1] : null
  const currentTurnPair = prevTurn && currentTurn ? { from: prevTurn.speaker, to: currentTurn.speaker } : null

  useEffect(() => {
    // reset playback when play changes
    setSceneIndex(0)
    setTurnIndex(0)
    setIsPlaying(false)
  }, [selectedPlay])

  useEffect(() => {
    if (!isPlaying) return
    if (!currentScene) return

    const turns = currentScene.turns || []
    const currentAct = currentScene.act
    const advance = () => {
      const nextTurn = turnIndex + 1
      if (nextTurn < turns.length) {
        setTurnIndex(nextTurn)
        return
      }
      const nextScene = sceneIndex + 1
      if (nextScene < sceneSequence.length) {
        const nextAct = sceneSequence[nextScene]?.act
        if (nextAct && currentAct && nextAct !== currentAct) {
          setIsPlaying(false) // stopp ved akt-skifte
          return
        }
        setSceneIndex(nextScene)
        setTurnIndex(0)
      } else {
        setIsPlaying(false)
      }
    }

    timerRef.current = window.setTimeout(advance, Math.max(80, speedMs))
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [isPlaying, currentScene, sceneSequence, sceneIndex, turnIndex, speedMs])

  const handlePause = () => setIsPlaying(false)

  const handleStop = () => {
    setIsPlaying(false)
    setSceneIndex(0)
    setTurnIndex(0)
  }

  const handlePrevAct = () => {
    // hop til start av forrige scene
    setIsPlaying(false)
    setTurnIndex(0)
    setSceneIndex((idx) => Math.max(0, idx - 1))
  }

  const handleNextAct = () => {
    setIsPlaying(false)
    setTurnIndex(0)
    setSceneIndex((idx) => Math.min(sceneSequence.length - 1, idx + 1))
  }

  const seekToProgress = (pct) => {
    if (!sceneSequence.length) return
    const turnsTotal = totalTurns || 1
    const clamped = Math.max(0, Math.min(0.9999, pct))
    let target = Math.floor(clamped * turnsTotal)
    for (let i = 0; i < sceneSequence.length; i++) {
      const len = sceneSequence[i].turns?.length ?? 0
      if (target < len) {
        setSceneIndex(i)
        setTurnIndex(target)
        setIsPlaying(false)
        return
      }
      target -= len
    }
    // fallback til siste scene/turn
    const lastIdx = Math.max(0, sceneSequence.length - 1)
    const lastTurns = sceneSequence[lastIdx]?.turns?.length ?? 0
    setSceneIndex(lastIdx)
    setTurnIndex(Math.max(0, lastTurns - 1))
    setIsPlaying(false)
  }

  const handleSeekPointer = (e, commit = false) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = rect.width > 0 ? x / rect.width : 0
    seekToProgress(pct)
    if (commit) {
      isSeekingRef.current = false
    }
  }

  const progress = useMemo(() => {
    if (!sceneSequence.length) return 0
    const scenesDone = sceneIndex + turnIndex / Math.max(1, currentScene?.turns?.length || 1)
    return Math.min(100, (scenesDone / sceneSequence.length) * 100)
  }, [sceneIndex, turnIndex, sceneSequence.length, currentScene])

  const isNarrow = screenW < 820

  return (
    <div
      style={{
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        color: '#0f172a',
        background: '#f1f5f9',
        minHeight: '100vh',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isNarrow ? '10px 12px 20px 12px' : '16px 16px 28px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 20 }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#7b1e1e', letterSpacing: 0.2 }}>Ibsen animasjon</h1>
          <span style={{ fontSize: 12, color: '#475569' }}>{BUILD_TAG}</span>
        </div>

        {loading && <p>Laster data…</p>}
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

        {!loading && !error && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={clusterRow}>
                <button onClick={handlePrevAct} style={clusterBtn(true, false)} title="Forrige scene">⏮</button>
                <button
                  onClick={isPlaying ? handlePause : () => setIsPlaying(true)}
                  style={clusterBtn(false, false)}
                  title={isPlaying ? 'Pause' : 'Fortsett'}
                >
                  {isPlaying ? '⏸' : '⏵'}
                </button>
                <button onClick={handleStop} style={clusterBtn(false, false)} title="Stopp (tilbake til start)">⏹</button>
                <button onClick={handleNextAct} style={clusterBtn(false, true)} title="Neste scene">⏭</button>
              </div>

              <div style={{ flex: '0 1 200px', minWidth: 160, maxWidth: 220 }}>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  style={{ width: '100%', height: 44, padding: '10px 12px', fontSize: 15, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}
                >
                  {plays.map((p) => (
                    <option key={p.id} value={p.id}>
                      {displayTitle(p.title)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 6, marginBottom: 10 }}>
              <SceneNetwork
                scene={currentScene}
                currentTurnPair={currentTurnPair}
                currentSpeaker={currentTurn?.speaker}
                currentTurn={currentTurn}
                isPlaying={isPlaying}
                femaleMap={femaleMap}
                colorMap={speakerColors}
                reservedHeight={isNarrow ? 240 : 180}
              />
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, boxShadow: '0 6px 18px rgba(15,23,42,0.06)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 14 }}>⏩ Hastighet: {speedMs} ms per tur</label>
                <input
                  type="range"
                  min={30}
                  max={1200}
                  step={10}
                  value={speedMs}
                  onChange={(e) => setSpeedMs(Number(e.target.value))}
                  style={{ flex: '1 1 260px' }}
                />
                <div style={clusterRow}>
                  <button onClick={() => setSpeedMs(30)} style={clusterBtn(true, true)}>⏩ Maks fart</button>
                </div>
              </div>

              <div style={{ fontSize: 14, color: '#475569' }}>
                Akt {currentScene?.act ?? '-'} · Scene {currentScene?.scene ?? '-'} · Tur {turnIndex + 1} / {currentScene?.turns?.length ?? 0}
              </div>
              <div
                style={{ marginTop: 4, background: '#e2e8f0', borderRadius: 8, height: 12, overflow: 'hidden', position: 'relative', cursor: 'pointer' }}
                onPointerDown={(e) => {
                  isSeekingRef.current = true
                  handleSeekPointer(e)
                }}
                onPointerMove={(e) => {
                  if (!isSeekingRef.current) return
                  handleSeekPointer(e)
                }}
                onPointerUp={(e) => {
                  if (!isSeekingRef.current) return
                  handleSeekPointer(e, true)
                }}
                onPointerLeave={() => {
                  if (isSeekingRef.current) isSeekingRef.current = false
                }}
              >
                <div style={{ width: `${progress}%`, height: '100%', background: '#2563eb', transition: 'width 120ms linear' }} />
              </div>
              {currentTurn?.speaker && (
                <div style={{ marginTop: 8, fontSize: 14 }}>
                  Nå: <strong>{currentTurn.speaker}</strong> ({currentTurn.words ?? 0} ord)
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const btnStyle = () => ({
  padding: '10px 12px',
  border: 'none',
  background: 'transparent',
  color: '#0f172a',
  fontWeight: 700,
  fontSize: 22,
  cursor: 'pointer',
})

const clusterRow = {
  display: 'flex',
  alignItems: 'center',
  overflow: 'hidden',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  background: '#ffffff',
  height: 44,
}

const clusterBtn = (isFirst = false, isLast = false) => ({
  ...btnStyle(),
  borderTop: '1px solid #cbd5e1',
  borderBottom: '1px solid #cbd5e1',
  borderLeft: isFirst ? '1px solid #cbd5e1' : 'none',
  borderRight: isLast ? '1px solid #cbd5e1' : 'none',
})

