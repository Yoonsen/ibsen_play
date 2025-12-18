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

const colorForSpeaker = (name, gender) => {
  if (!name) return GENDER_COLORS[gender] ?? '#6b7280'
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

const SceneNetwork = ({ scene, currentSpeaker, femaleMap }) => {
  const graph = useMemo(() => buildSceneGraph(scene, femaleMap), [scene, femaleMap])
  const positions = useMemo(() => computePositions(graph.nodes, 620, 620), [graph.nodes])
  const maxEdge = useMemo(() => graph.edges.reduce((m, e) => Math.max(m, e.count ?? 0), 0), [graph.edges])

  if (!scene) return <p style={{ margin: '12px 0' }}>Velg et stykke for å starte.</p>

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
      <svg width={640} height={640} style={{ display: 'block', margin: '0 auto' }}>
        {graph.edges.map((e, i) => {
          const from = positions.get(e.source)
          const to = positions.get(e.target)
          if (!from || !to) return null
          const weight = e.count ?? 1
          const w = maxEdge ? 0.6 + 4 * (weight / maxEdge) : 1
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
            />
          )
        })}

        {graph.nodes.map((node) => {
          const pos = positions.get(node.id)
          if (!pos) return null
          const isCurrent = currentSpeaker === node.id
          const base = colorForSpeaker(node.id, node.gender)
          const r = 10 + Math.min(16, Math.sqrt(node.words || 0))
          return (
            <g key={node.id}>
              {isCurrent && (
                <circle cx={pos.x} cy={pos.y} r={r + 8} fill={base} opacity={0.15} />
              )}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r}
                fill={base}
                stroke={isCurrent ? '#111827' : '#0f172a'}
                strokeWidth={isCurrent ? 2.4 : 1}
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
  const [speedMs, setSpeedMs] = useState(350)
  const timerRef = useRef(null)
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

  const currentScene = sceneSequence[sceneIndex] || null
  const currentTurn = currentScene?.turns?.[turnIndex] || null

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
    const advance = () => {
      const nextTurn = turnIndex + 1
      if (nextTurn < turns.length) {
        setTurnIndex(nextTurn)
        return
      }
      const nextScene = sceneIndex + 1
      if (nextScene < sceneSequence.length) {
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

  const handleStart = () => {
    setSceneIndex(0)
    setTurnIndex(0)
    setIsPlaying(true)
  }

  const handlePause = () => setIsPlaying(false)

  const handleNextScene = () => {
    setIsPlaying(false)
    setTurnIndex(0)
    setSceneIndex((idx) => Math.min(sceneSequence.length - 1, idx + 1))
  }

  const handlePrevScene = () => {
    setIsPlaying(false)
    setTurnIndex(0)
    setSceneIndex((idx) => Math.max(0, idx - 1))
  }

  const progress = useMemo(() => {
    if (!sceneSequence.length) return 0
    const scenesDone = sceneIndex + turnIndex / Math.max(1, currentScene?.turns?.length || 1)
    return Math.min(100, (scenesDone / sceneSequence.length) * 100)
  }, [sceneIndex, turnIndex, sceneSequence.length, currentScene])

  return (
    <div style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif', color: '#0f172a', background: '#f1f5f9', minHeight: '100vh' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 16px 48px 16px' }}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Ibsen animasjon</h1>
          <p style={{ margin: '6px 0 0 0', color: '#475569' }}>
            Velg et stykke og se aktene spille ut som et levende nettverk. Alt annet UI er fjernet.
          </p>
        </header>

        {loading && <p>Laster data…</p>}
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

        {!loading && !error && (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, boxShadow: '0 10px 24px rgba(15,23,42,0.06)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ fontWeight: 600, fontSize: 14 }}>Stykke</label>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  style={{ padding: '10px 12px', fontSize: 15, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}
                >
                  {plays.map((p) => (
                    <option key={p.id} value={p.id}>
                      {displayTitle(p.title)}
                    </option>
                  ))}
                </select>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={handleStart} style={btnStyle(true)}>Start fra akt 1</button>
                  <button onClick={isPlaying ? handlePause : () => setIsPlaying(true)} style={btnStyle()}>
                    {isPlaying ? 'Pause' : 'Fortsett'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={handlePrevScene} style={btnStyle(false)}>Forrige scene</button>
                  <button onClick={handleNextScene} style={btnStyle(false)}>Neste scene</button>
                </div>

                <label style={{ fontSize: 14, marginTop: 8 }}>Hastighet: {speedMs} ms per tur</label>
                <input
                  type="range"
                  min={100}
                  max={1200}
                  step={20}
                  value={speedMs}
                  onChange={(e) => setSpeedMs(Number(e.target.value))}
                  style={{ width: '100%' }}
                />

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Status</div>
                  <div style={{ fontSize: 14, color: '#475569' }}>
                    Akt {currentScene?.act ?? '-'} · Scene {currentScene?.scene ?? '-'}
                  </div>
                  <div style={{ fontSize: 14, color: '#475569' }}>
                    Tur {turnIndex + 1} / {currentScene?.turns?.length ?? 0}
                  </div>
                  <div style={{ marginTop: 10, background: '#e2e8f0', borderRadius: 8, height: 10, overflow: 'hidden' }}>
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
              <SceneNetwork scene={currentScene} currentSpeaker={currentTurn?.speaker} femaleMap={femaleMap} />
            </div>
          </div>
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

