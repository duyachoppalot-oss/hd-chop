'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';

type Node = { id: string; type: 'part' | 'model' | 'concept'; label: string; sub?: string };
type Edge = { id: string; source: string; target: string; label?: string; kind: string };

const PAGE: Record<string, string> = { part: '/part/', model: '/model/', concept: '/concept/' };
const hrefOf = (id: string) => {
  const [type, key] = id.split(':');
  return PAGE[type] + encodeURIComponent(key);
};

// Explorable graph of parts, models and concepts. Starts from one node;
// each click asks /api/graph for that node's neighbours and adds them.
export function WebGraph({ seed }: { seed: string }) {
  const box = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  const expanded = useRef(new Set<string>());
  const layout = useRef<cytoscape.Layouts | null>(null);
  const router = useRouter();
  const [selected, setSelected] = useState<Node | null>(null);
  const [links, setLinks] = useState<{ other: string; label?: string; kind: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState('');

  async function expand(id: string) {
    const g = cy.current;
    if (!g || expanded.current.has(id)) return;
    expanded.current.add(id);
    setBusy(true);
    const models = g.nodes('[type = "model"]').map((n) => n.data('label')).join(',');
    const res = await fetch(`/api/graph?${new URLSearchParams({ node: id, models })}`);
    const { nodes, edges } = (await res.json()) as { nodes: Node[]; edges: Edge[] };
    // The graph may have been torn down while the fetch ran (dev StrictMode
    // mounts twice; navigating away); adding to a destroyed instance throws.
    if (g.destroyed() || cy.current !== g) return setBusy(false);
    const origin = g.getElementById(id);
    const at = origin.nonempty() ? origin.position() : { x: 0, y: 0 };
    const els: ElementDefinition[] = [];
    // New nodes start on a ring around the node that pulled them in.
    const self = nodes.find((n) => n.id === id);
    if (self && g.getElementById(id).empty()) els.push({ group: 'nodes', data: { ...self }, position: at });
    const fresh = nodes.filter((n) => n.id !== id && g.getElementById(n.id).empty());
    fresh.forEach((n, i) => {
      const a = (2 * Math.PI * i) / Math.max(1, fresh.length);
      const r = 120 + fresh.length * 4;
      els.push({ group: 'nodes', data: { ...n }, position: { x: at.x + r * Math.cos(a), y: at.y + r * Math.sin(a) } });
    });
    for (const e of edges) {
      if (g.getElementById(e.id).empty() && g.getElementById(`${e.target}>${e.source}`).empty()) els.push({ group: 'edges', data: { ...e } });
    }
    g.add(els);
    g.getElementById(id).addClass('expanded');
    layout.current?.stop();
    layout.current = g.layout({ name: 'cose', animate: true, animationDuration: 500, randomize: false, fit: true, padding: 40, nodeRepulsion: () => 400000, idealEdgeLength: () => 120, nodeOverlap: 20, gravity: 1 } as cytoscape.LayoutOptions).run();
    setBusy(false);
  }

  function select(id: string) {
    const g = cy.current;
    if (!g || g.destroyed()) return;
    const n = g.getElementById(id);
    setSelected(n.data() as Node);
    setLinks(
      n.connectedEdges().map((e) => ({
        other: e.source().id() === id ? e.target().id() : e.source().id(),
        label: e.data('label'),
        kind: e.data('kind'),
      }))
    );
  }

  useEffect(() => {
    if (!box.current) return;
    expanded.current.clear();
    const g = cytoscape({
      container: box.current,
      wheelSensitivity: 0.3,
      maxZoom: 1.4, // fit() on a small graph would blow nodes up
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            color: '#f2e8d0',
            'font-size': 10,
            'font-family': 'Oswald, sans-serif',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'text-outline-color': '#0b0a08',
            'text-outline-width': 2,
            width: 18,
            height: 18,
          },
        },
        { selector: 'node[type = "part"]', style: { 'background-color': '#d4a52c', shape: 'round-rectangle', width: 22, height: 14 } },
        { selector: 'node[type = "model"]', style: { 'background-color': '#f2e8d0', shape: 'ellipse', width: 26, height: 26, 'font-size': 12, 'font-weight': 700 } },
        { selector: 'node[type = "concept"]', style: { 'background-color': '#b8743a', shape: 'diamond', width: 26, height: 26, 'font-size': 11 } },
        { selector: 'node.expanded', style: { 'border-width': 2, 'border-color': '#f2e8d0' } },
        { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#6fae6a' } },
        {
          selector: 'edge',
          style: { width: 1, 'line-color': '#4a4234', 'curve-style': 'bezier', label: 'data(label)', 'font-size': 8, color: '#a39a86', 'text-rotation': 'autorotate', 'text-outline-color': '#0b0a08', 'text-outline-width': 2 },
        },
        { selector: 'edge[kind = "supersedes"]', style: { 'line-color': '#d4a52c', width: 2, 'target-arrow-shape': 'triangle', 'target-arrow-color': '#d4a52c' } },
        { selector: 'edge[kind = "is"]', style: { 'line-style': 'dashed', 'line-color': '#6b5532' } },
      ],
    });
    cy.current = g;
    g.on('tap', 'node', (e) => {
      const id = e.target.id();
      select(id);
      expand(id).then(() => select(id));
    });
    g.on('dbltap', 'node', (e) => router.push(hrefOf(e.target.id())));
    expand(seed).then(() => select(seed));
    return () => {
      layout.current?.stop();
      layout.current = null;
      if (cy.current === g) cy.current = null;
      g.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  function addSeed(e: React.FormEvent) {
    e.preventDefault();
    const v = add.trim();
    if (!v) return;
    // "concept:seat" / "part:..." as typed; a bare model code or part number is guessed.
    const id = v.includes(':') ? v : /^[A-Z]{2,}[A-Z0-9]*$/i.test(v) && !/\d{4}/.test(v) ? `model:${v.toUpperCase()}` : `part:${v}`;
    expand(id).then(() => select(id));
    setAdd('');
  }

  return (
    <div className="web">
      <div ref={box} className="web-canvas" />
      <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <div className="panel">
          <form onSubmit={addSeed} className="row">
            <input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add: FLHR, 61268-03, concept:seat" style={{ flex: 1 }} />
            <button type="submit">Add</button>
          </form>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="ghost"
              onClick={() => {
                cy.current?.elements().remove();
                expanded.current.clear();
                setSelected(null);
                setLinks([]);
              }}
            >
              Clear
            </button>
            <button className="ghost" onClick={() => cy.current?.fit(undefined, 40)}>Fit</button>
            {busy ? <span className="small muted">Loading…</span> : null}
          </div>
          <div className="legend">
            <span><i style={{ background: '#d4a52c' }} />part</span>
            <span><i style={{ background: '#f2e8d0', borderRadius: 6 }} />model</span>
            <span><i style={{ background: '#b8743a' }} />concept</span>
          </div>
        </div>
        {selected ? (
          <div className="panel">
            <h3>{selected.type} · {selected.label}</h3>
            {selected.sub ? <p className="small muted" style={{ margin: '4px 0' }}>{selected.sub}</p> : null}
            <p style={{ margin: '6px 0' }}>
              <a href={hrefOf(selected.id)}>Open {selected.type} page →</a>
            </p>
            <div style={{ maxHeight: '48vh', overflow: 'auto' }}>
              <table className="list small">
                <tbody>
                  {links.map((l) => (
                    <tr key={l.other} style={{ cursor: 'pointer' }} onClick={() => select(l.other)}>
                      <td>{l.other.replace(/^\w+:/, '')}</td>
                      <td className="muted">{l.kind === 'has' ? `${l.label} parts` : l.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
