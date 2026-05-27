/**
 * D3 force-directed MBTI relationship graph
 */
const GraphView = (() => {
  let svg, g, simulation, nodes, links;
  let width = 800;
  let height = 480;
  let selectedCode = null;
  let activeTemperament = 'all';
  let edgeFilters = { best: true, good: true, challenge: true };
  let onSelectCallback = null;

  function getTemperamentColor(code) {
    const t = MBTI_TYPES[code]?.temperament;
    return TEMPERAMENTS[t]?.color || '#888';
  }

  function createAvatarDef(svgEl, id, hue) {
    const gradId = `grad-${id}`;
    const defs = svgEl.select('defs').empty() ? svgEl.append('defs') : svgEl.select('defs');
    const grad = defs.append('linearGradient').attr('id', gradId).attr('x1', '0%').attr('y1', '0%').attr('x2', '100%').attr('y2', '100%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', `hsl(${hue}, 70%, 55%)`);
    grad.append('stop').attr('offset', '100%').attr('stop-color', `hsl(${hue + 40}, 80%, 45%)`);
    return gradId;
  }

  function init(containerId, callback) {
    onSelectCallback = callback;
    const container = document.getElementById(containerId);
    if (!container) return;

    width = container.clientWidth || 800;
    height = 480;

    d3.select(`#${containerId} svg`).remove();

    svg = d3.select(`#${containerId}`)
      .append('svg')
      .attr('id', 'graph-svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', height);

    const defs = svg.append('defs');
    defs.append('filter').attr('id', 'glow')
      .html('<feGaussianBlur stdDeviation="3" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>');

    g = svg.append('g');

    const zoom = d3.zoom()
      .scaleExtent([0.4, 2.5])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    nodes = Object.values(MBTI_TYPES).map((t) => ({
      id: t.code,
      ...t,
      r: 28,
    }));

    links = COMPATIBILITY_EDGES.map((e) => ({ ...e }));

    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance((d) => (d.tier === 'best' ? 120 : d.tier === 'good' ? 150 : 180)).strength(0.35))
      .force('charge', d3.forceManyBody().strength(-420))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(36))
      .force('x', d3.forceX(width / 2).strength(0.04))
      .force('y', d3.forceY(height / 2).strength(0.04));

    // Temperament clustering
    const tempX = { NT: width * 0.25, NF: width * 0.75, SJ: width * 0.25, SP: width * 0.75 };
    const tempY = { NT: height * 0.3, NF: height * 0.3, SJ: height * 0.7, SP: height * 0.7 };
    nodes.forEach((n) => {
      simulation.force(`pull-${n.id}`, d3.forceX(tempX[n.temperament]).strength(0.12));
      simulation.force(`pull-y-${n.id}`, d3.forceY(tempY[n.temperament]).strength(0.12));
    });

    render();
    simulation.on('tick', tick);

    window.addEventListener('resize', debounce(resize, 200));
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function resize() {
    const container = document.getElementById('graph-container');
    if (!container || !svg) return;
    width = container.clientWidth || 800;
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    simulation.force('center', d3.forceCenter(width / 2, height / 2));
    simulation.alpha(0.3).restart();
  }

  function visibleLink(d) {
    return edgeFilters[d.tier];
  }

  function render() {
    const link = g.selectAll('.graph-link')
      .data(links.filter(visibleLink), (d) => `${d.source.id || d.source}-${d.target.id || d.target}-${d.tier}`);

    link.exit().remove();

    const linkEnter = link.enter().append('line')
      .attr('class', (d) => `graph-link ${d.tier}`);

    const linkMerge = linkEnter.merge(link);

    const node = g.selectAll('.graph-node')
      .data(nodes, (d) => d.id);

    node.exit().remove();

    const nodeEnter = node.enter().append('g')
      .attr('class', 'graph-node')
      .call(drag(simulation))
      .on('click', (_, d) => selectNode(d.id));

    nodeEnter.each(function (d) {
      const el = d3.select(this);
      const gradId = createAvatarDef(svg, d.id, d.avatarHue);
      el.append('circle')
        .attr('r', d.r)
        .attr('fill', `url(#${gradId})`)
        .attr('stroke', 'rgba(255,255,255,0.35)')
        .attr('stroke-width', 2)
        .style('filter', 'url(#glow)');
      el.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', '#fff')
        .attr('font-size', '11px')
        .attr('font-weight', '700')
        .attr('pointer-events', 'none')
        .text(d.id);
    });

    const nodeMerge = nodeEnter.merge(node);
    updateHighlight();
    tick();
  }

  function tick() {
    g.selectAll('.graph-link')
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    g.selectAll('.graph-node')
      .attr('transform', (d) => `translate(${d.x},${d.y})`);
  }

  function drag(sim) {
    function dragstarted(event, d) {
      if (!event.active) sim.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    function dragended(event, d) {
      if (!event.active) sim.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    return d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended);
  }

  function selectNode(code) {
    const wasSelected = selectedCode === code;
    selectedCode = wasSelected ? null : code;
    updateHighlight();
    if (onSelectCallback && !wasSelected) onSelectCallback(code);
  }

  function updateHighlight() {
    const related = new Set();
    if (selectedCode) {
      related.add(selectedCode);
      const type = MBTI_TYPES[selectedCode];
      if (type) {
        [...type.bestPartner, ...type.goodMatch, ...type.challenging].forEach((c) => related.add(c));
      }
    }

    g.selectAll('.graph-node').each(function (d) {
      const el = d3.select(this);
      const tempMatch = activeTemperament === 'all' || d.temperament === activeTemperament;
      const dim = (activeTemperament !== 'all' && !tempMatch) ||
        (selectedCode && !related.has(d.id));
      el.classed('dimmed', dim);
      el.classed('highlight', selectedCode === d.id);
    });

    g.selectAll('.graph-link').each(function (d) {
      const el = d3.select(this);
      const s = d.source.id || d.source;
      const t = d.target.id || d.target;
      const connected = selectedCode && (s === selectedCode || t === selectedCode);
      const dim = selectedCode && !connected;
      el.classed('dimmed', dim);
      el.classed('highlight', connected);
    });
  }

  function setTemperamentFilter(temp) {
    activeTemperament = temp;
    updateHighlight();
  }

  function setEdgeFilters(filters) {
    edgeFilters = { ...edgeFilters, ...filters };
    const visibleLinks = links.filter(visibleLink);
    simulation.force(
      'link',
      d3.forceLink(visibleLinks)
        .id((d) => d.id)
        .distance((d) => (d.tier === 'best' ? 120 : d.tier === 'good' ? 150 : 180))
        .strength(0.35)
    );
    simulation.alpha(0.4).restart();
    render();
  }

  function focusType(code) {
    selectedCode = code;
    updateHighlight();
    const n = nodes.find((x) => x.id === code);
    if (n && svg) {
      const transform = d3.zoomIdentity
        .translate(width / 2 - n.x, height / 2 - n.y);
      svg.transition().duration(500).call(
        d3.zoom().transform,
        transform
      );
    }
  }

  function searchHighlight(query) {
    if (!query) {
      selectedCode = null;
      updateHighlight();
      return;
    }
    const q = query.toUpperCase();
    const match = nodes.find((n) => n.id.includes(q) || MBTI_TYPES[n.id].name.includes(query));
    if (match) focusType(match.id);
  }

  return {
    init,
    selectNode,
    focusType,
    setTemperamentFilter,
    setEdgeFilters,
    searchHighlight,
    resize,
  };
})();
