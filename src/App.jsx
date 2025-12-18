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

const SceneNetwork = ({ scene, currentTurnPair, currentSpeaker, currentTurn, isPlaying, femaleMap, colorMap }) => {
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
      const target = Math.max(320, Math.min(640, w - 32))
      setViewSize(target)
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

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
  const [selectedAct, setSelectedAct] = useState('')
  const [turnIndex, setTurnIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speedMs, setSpeedMs] = useState(30)
  const [screenW, setScreenW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200))
  const [sheetOpen, setSheetOpen] = useState(false)
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

  const actOptions = useMemo(() => {
    const map = new Map()
    sceneSequence.forEach((scene, idx) => {
      const act = scene.act ?? '1'
      if (!map.has(act)) map.set(act, idx)
    })
    return Array.from(map.entries()).map(([act, index]) => ({ act, index }))
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
    const act = currentScene?.act ?? ''
    if (act && act !== selectedAct) {
      setSelectedAct(act)
    }
  }, [currentScene, selectedAct])

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
          setIsPlaying(false) // stopp på slutt av akt og bevar siste graf
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

  const handleSelectAct = (act) => {
    const opt = actOptions.find((o) => o.act === act)
    if (!opt) return
    setSelectedAct(act)
    setSceneIndex(opt.index)
    setTurnIndex(0)
    setIsPlaying(false)
  }

  const handlePrevAct = () => {
    const currentAct = currentScene?.act
    if (!currentAct) return
    const idx = actOptions.findIndex((o) => o.act === currentAct)
    if (idx > 0) {
      handleSelectAct(actOptions[idx - 1].act)
    }
  }

  const handleNextAct = () => {
    const currentAct = currentScene?.act
    if (!currentAct) return
    const idx = actOptions.findIndex((o) => o.act === currentAct)
    if (idx >= 0 && idx < actOptions.length - 1) {
      handleSelectAct(actOptions[idx + 1].act)
    }
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
    <div style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif', color: '#0f172a', background: '#f1f5f9', minHeight: '100vh' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 16px 48px 16px' }}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Ibsen animasjon</h1>
          <p style={{ margin: '6px 0 0 0', color: '#475569' }}>
            Velg et stykke og se aktene spille ut som et levende nettverk. Alt annet UI er fjernet.
          </p>
          <p style={{ margin: '4px 0 0 0', color: '#475569', fontSize: 14 }}>
            Du kan klikke og dra i nodene for å plassere dem manuelt.
          </p>
        </header>

        {loading && <p>Laster data…</p>}
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

        {!loading && !error && (
          <>
            {!isNarrow && (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, boxShadow: '0 10px 24px rgba(15,23,42,0.06)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                <label style={{ fontWeight: 600, fontSize: 14 }}>Stykke</label>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', fontSize: 15, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}
                >
                  {plays.map((p) => (
                    <option key={p.id} value={p.id}>
                      {displayTitle(p.title)}
                    </option>
                  ))}
                </select>
                      </div>
                      <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                        <label style={{ fontWeight: 600, fontSize: 14 }}>Akt</label>
                        <select
                          value={selectedAct}
                          onChange={(e) => handleSelectAct(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', fontSize: 15, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}
                        >
                          {actOptions.map((opt) => (
                            <option key={opt.act} value={opt.act}>
                              Akt {opt.act}
                            </option>
                          ))}
                        </select>
                      </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={handlePrevAct} style={btnStyle(false)} title="Forrige akt">⏮</button>
                      <button
                        onClick={isPlaying ? handlePause : () => setIsPlaying(true)}
                        style={btnStyle(true)}
                        title={isPlaying ? 'Pause' : 'Fortsett'}
                      >
                        {isPlaying ? '⏸' : '⏵'}
                      </button>
                      <button onClick={handleStop} style={btnStyle(false)} title="Stopp (tilbake til start)">⏹</button>
                      <button onClick={handleNextAct} style={btnStyle(false)} title="Neste akt">⏭</button>
                </div>

                    <label style={{ fontSize: 14, marginTop: 8 }}>⏩ Hastighet: {speedMs} ms per tur</label>
                <input
                  type="range"
                      min={30}
                  max={1200}
                      step={10}
                  value={speedMs}
                  onChange={(e) => setSpeedMs(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => setSpeedMs(30)} style={btnStyle(false)}>⏩ Maks fart</button>
                    </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Status</div>
                  <div style={{ fontSize: 14, color: '#475569' }}>
                    Akt {currentScene?.act ?? '-'} · Scene {currentScene?.scene ?? '-'}
                  </div>
                  <div style={{ fontSize: 14, color: '#475569' }}>
                    Tur {turnIndex + 1} / {currentScene?.turns?.length ?? 0}
                  </div>
                      <div
                        style={{ marginTop: 10, background: '#e2e8f0', borderRadius: 8, height: 12, overflow: 'hidden', position: 'relative', cursor: 'pointer' }}
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
                    <div style={{ marginTop: 12, fontSize: 15 }}>
                      Nå: <strong>{currentTurn.speaker}</strong> ({currentTurn.words ?? 0} ord)
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
                  <SceneNetwork
                    scene={currentScene}
                    currentTurnPair={currentTurnPair}
                    currentSpeaker={currentTurn?.speaker}
                    currentTurn={currentTurn}
                    isPlaying={isPlaying}
                    femaleMap={femaleMap}
                    colorMap={speakerColors}
                  />
                </div>
              </div>
            )}

            {isNarrow && (
              <div style={{ marginBottom: 88 }}>
                <SceneNetwork
                  scene={currentScene}
                  currentTurnPair={currentTurnPair}
                  currentSpeaker={currentTurn?.speaker}
                  currentTurn={currentTurn}
                  isPlaying={isPlaying}
                  femaleMap={femaleMap}
                  colorMap={speakerColors}
                />
              </div>
            )}
          </>
        )}

        {isNarrow && (
          <>
            <div
              style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                background: '#fff',
                borderTop: '1px solid #e2e8f0',
                boxShadow: '0 -6px 18px rgba(15,23,42,0.08)',
                padding: '10px 12px',
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                zIndex: 30,
              }}
            >
              <button onClick={handlePrevAct} style={btnStyle(false)} title="Forrige akt">⏮</button>
              <button
                onClick={isPlaying ? handlePause : () => setIsPlaying(true)}
                style={btnStyle(true)}
                title={isPlaying ? 'Pause' : 'Fortsett'}
              >
                {isPlaying ? '⏸' : '⏵'}
              </button>
              <button onClick={handleStop} style={btnStyle(false)} title="Stopp (tilbake til start)">⏹</button>
              <button onClick={handleNextAct} style={btnStyle(false)} title="Neste akt">⏭</button>
              <div
                style={{ flex: 1, background: '#e2e8f0', borderRadius: 8, height: 12, overflow: 'hidden', position: 'relative', cursor: 'pointer' }}
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
              <button onClick={() => setSheetOpen(true)} style={btnStyle(false)} title="Vis kontroller">⚙︎</button>
            </div>

            {sheetOpen && (
                <div
                  style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15,23,42,0.35)',
                    zIndex: 40,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-end',
                  }}
                  onClick={() => setSheetOpen(false)}
                >
                <div
                  style={{
                    width: '100%',
                    maxWidth: 520,
                    background: '#fff',
                    borderTopLeftRadius: 16,
                    borderTopRightRadius: 16,
                    padding: '16px 16px 24px 16px',
                    boxShadow: '0 -10px 26px rgba(15,23,42,0.18)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontWeight: 700 }}>Kontroller</div>
                    <button onClick={() => setSheetOpen(false)} style={btnStyle(false)}>Lukk</button>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <label style={{ fontWeight: 600, fontSize: 14 }}>Stykke</label>
                      <select
                        value={selectedId}
                        onChange={(e) => setSelectedId(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', fontSize: 15, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}
                      >
                        {plays.map((p) => (
                          <option key={p.id} value={p.id}>
                            {displayTitle(p.title)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                      <label style={{ fontWeight: 600, fontSize: 14 }}>Akt</label>
                      <select
                        value={selectedAct}
                        onChange={(e) => handleSelectAct(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', fontSize: 15, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}
                      >
                        {actOptions.map((opt) => (
                          <option key={opt.act} value={opt.act}>
                            Akt {opt.act}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    <button onClick={handlePrevAct} style={btnStyle(false)} title="Forrige akt">⏮</button>
                    <button
                      onClick={isPlaying ? handlePause : () => setIsPlaying(true)}
                      style={btnStyle(true)}
                      title={isPlaying ? 'Pause' : 'Fortsett'}
                    >
                      {isPlaying ? '⏸' : '⏵'}
                    </button>
                    <button onClick={handleStop} style={btnStyle(false)} title="Stopp (tilbake til start)">⏹</button>
                    <button onClick={handleNextAct} style={btnStyle(false)} title="Neste akt">⏭</button>
                  </div>

                  <label style={{ fontSize: 14, marginTop: 8 }}>⏩ Hastighet: {speedMs} ms per tur</label>
                  <input
                    type="range"
                    min={30}
                    max={1200}
                    step={10}
                    value={speedMs}
                    onChange={(e) => setSpeedMs(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    <button onClick={() => setSpeedMs(30)} style={btnStyle(false)}>⏩ Maks fart</button>
                  </div>

                  <div style={{ marginTop: 12, fontSize: 14, color: '#475569' }}>
                    Akt {currentScene?.act ?? '-'} · Scene {currentScene?.scene ?? '-'} · Tur {turnIndex + 1} / {currentScene?.turns?.length ?? 0}
                  </div>
            </div>
          </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const btnStyle = (primary = false) => ({
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid ' + (primary ? '#2563eb' : '#cbd5e1'),
  background: primary ? '#2563eb' : '#ffffff',
  color: primary ? '#fff' : '#0f172a',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: primary ? '0 10px 22px rgba(37,99,235,0.22)' : 'none'
})

