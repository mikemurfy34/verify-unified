const PROOF_URL = "/proofs/geo/conflict/v1/geo_conflict_v1.corridor_state.proof.json";

function $(id) {
  return document.getElementById(id);
}

function truncate(str, len = 16) {
  if (!str || typeof str !== "string") return "—";
  if (str.length <= len) return str;
  return str.slice(0, len) + "…";
}

function setText(id, value) {
  const el = $(id);
  if (!el) return;
  el.textContent = value ?? "—";
}

function setChipStatus(status, label) {
  const chip = $("verification-chip");
  if (!chip) return;
  chip.classList.remove("chip-ok", "chip-failed", "chip-unknown");
  if (status === "ok") {
    chip.classList.add("chip-ok");
  } else if (status === "failed") {
    chip.classList.add("chip-failed");
  } else {
    chip.classList.add("chip-unknown");
  }
  chip.textContent = label;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return await res.json();
}

function inferCorridorRows(ledger) {
  if (!ledger) return [];
  if (Array.isArray(ledger)) return ledger;
  if (Array.isArray(ledger.corridors)) return ledger.corridors;
  if (Array.isArray(ledger.rows)) return ledger.rows;
  if (Array.isArray(ledger.data)) return ledger.data;
  return [];
}

function normaliseCorridor(row) {
  const id =
    row.corridor_id ??
    row.corridor ??
    row.country ??
    row.region ??
    row.id ??
    "—";

  const name =
    row.corridor_name ??
    row.name ??
    row.country_name ??
    row.region_name ??
    id;

  const pEvent =
    row.p_event ??
    row.p_conflict ??
    row.p ??
    row.probability ??
    null;

  const actionRaw =
    row.action ??
    row.policy_action ??
    row.codex_action ??
    null;

  const action = typeof actionRaw === "string"
    ? actionRaw.toLowerCase()
    : actionRaw;

  const archetype =
    row.archetype ??
    row.category ??
    row.type ??
    null;

  const notes =
    row.reason ??
    row.rationale ??
    row.notes ??
    "";

  return { id, name, pEvent, action, archetype, notes };
}

function formatPEvent(p) {
  if (p === null || p === undefined || Number.isNaN(p)) return "—";
  const num = typeof p === "number" ? p : Number(p);
  if (!Number.isFinite(num)) return "—";
  // Assume probabilities in [0,1]
  const pct = num <= 1 ? num * 100 : num;
  return pct.toFixed(1) + "%";
}

let currentProof = null;
let currentLedger = null;
let currentRows = [];

function renderCorridors(ledger) {
  const tbody = $("corridor-tbody");
  const empty = $("corridor-empty");
  if (!tbody) return [];

  const rows = inferCorridorRows(ledger).map(normaliseCorridor);
  tbody.innerHTML = "";

  if (!rows.length) {
    if (empty) empty.hidden = false;
    updateSummary([]);
    return [];
  }

  if (empty) empty.hidden = true;

  for (const row of rows) {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.textContent = row.name || row.id;
    tr.appendChild(tdName);

    const tdP = document.createElement("td");
    tdP.textContent = formatPEvent(row.pEvent);
    tr.appendChild(tdP);

    const tdAction = document.createElement("td");
    tdAction.textContent = row.action || "none";
    tdAction.classList.add("cell-action");
    if (row.action) {
      tdAction.classList.add("action-" + row.action.toLowerCase());
    }
    tr.appendChild(tdAction);

    const tdArch = document.createElement("td");
    tdArch.textContent = row.archetype || "—";
    tr.appendChild(tdArch);

    const tdNotes = document.createElement("td");
    tdNotes.textContent = row.notes || "";
    tr.appendChild(tdNotes);

    tbody.appendChild(tr);
  }

  updateSummary(rows);
  return rows;
}

function updateSummary(rows) {
  const counts = { alert: 0, hedge: 0, reroute: 0, none: 0 };
  for (const r of rows) {
    const a = (r.action || "none").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(counts, a)) {
      counts[a]++;
    } else {
      counts.none++;
    }
  }
  setText("summary-alert-count", String(counts.alert));
  setText("summary-hedge-count", String(counts.hedge));
  setText("summary-reroute-count", String(counts.reroute));
  setText("summary-none-count", String(counts.none));
}

function applyProofMeta(meta, refs, sig) {
  if (meta && meta.as_of) {
    setText("meta-as-of", meta.as_of);
  } else {
    setText("meta-as-of", "—");
  }

  if (sig) {
    setText("sig-alg", sig.alg || "—");
    setText("sig-public-key", truncate(sig.publicKey, 24));
    setText("sig-hash", truncate(sig.hash, 24));
  }

  if (Array.isArray(refs) && refs.length > 0) {
    const r0 = refs[0];
    setText("ref-path", r0.path || "—");
    setText("ref-hash", truncate(r0.hash, 24));
  }
}

function markLastRefresh() {
  const el = $("last-refresh-label");
  if (!el) return;
  const now = new Date();
  el.textContent = "Last refresh: " + now.toISOString();
}

function buildBriefMarkdown() {
  const meta = currentProof && currentProof.meta ? currentProof.meta : {};
  const sig = currentProof && currentProof.sig ? currentProof.sig : {};
  const refs = currentProof && Array.isArray(currentProof.refs) ? currentProof.refs : [];
  const asOf = meta.as_of || new Date().toISOString();
  const version = meta.version || "v1.1";
  const system = meta.system || "codex";
  const domain = meta.domain || "geo_conflict_v1";
  const proofId = (sig.publicKey ? truncate(sig.publicKey, 24) : "—") +
    " | " +
    (sig.hash ? truncate(sig.hash, 24) : "—");

  const counts = { alert: 0, hedge: 0, reroute: 0, none: 0 };
  for (const r of currentRows) {
    const a = (r.action || "none").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(counts, a)) {
      counts[a]++;
    } else {
      counts.none++;
    }
  }
  const totalCorridors = currentRows.length;
  const elevated = counts.alert + counts.hedge + counts.reroute;

  const lines = [];

  // 1. Cover block
  lines.push("# Codex Geo Conflict v1 – Corridor State Brief");
  lines.push("");
  lines.push(`As of: ${asOf}`);
  lines.push(`Version: ${version}`);
  lines.push(`System: ${system} | Domain: ${domain}`);
  lines.push(`Proof ID: ${proofId}`);
  if (refs.length > 0 && refs[0].path) {
    lines.push(`Ledger ref: \`${refs[0].path}\``);
  }
  lines.push("");

  // 2. Topline assessment
  lines.push("## Topline assessment");
  lines.push("");
  if (totalCorridors === 0) {
    lines.push("- No corridor data available in this snapshot.");
  } else {
    lines.push(`- Total corridors in this snapshot: **${totalCorridors}**`);
    lines.push(`- Corridors with elevated actions (alert/hedge/reroute): **${elevated}**`);
    lines.push(`- Action distribution: alert=${counts.alert}, hedge=${counts.hedge}, reroute=${counts.reroute}, none=${counts.none}`);
  }
  lines.push("");

  // 3. Risk map by corridor
  lines.push("## Risk map by corridor");
  lines.push("");
  if (totalCorridors === 0) {
    lines.push("_No corridors to display._");
  } else {
    lines.push("| Corridor | p_event (12m) | Action | Archetype | Notes |");
    lines.push("|----------|----------------|--------|-----------|-------|");
    for (const r of currentRows) {
      const name = r.name || r.id || "—";
      const pStr = formatPEvent(r.pEvent);
      const action = r.action || "none";
      const arch = r.archetype || "—";
      const notes = (r.notes || "").replace(/\|/g, "\\|");
      lines.push(`| ${name} | ${pStr} | ${action} | ${arch} | ${notes} |`);
    }
  }
  lines.push("");

  // 4. Policy actions (framework)
  lines.push("## Policy actions (framework)");
  lines.push("");
  lines.push("- **Alert**: increase monitoring / intelligence collection for flagged corridors.");
  lines.push("- **Hedge**: explore financial / supply chain hedges aligned with corridor exposure.");
  lines.push("- **Reroute**: reduce or reroute physical / financial flows away from high-risk corridors.");
  lines.push("");

  // 5. Verification section
  lines.push("## Verification");
  lines.push("");
  lines.push("This brief is derived from a Codex ledger snapshot referenced by a signed proof.");
  lines.push("- State is anchored in: **ledger → proof → `verify-unified`**.");
  lines.push("- `verify-unified` enforces RFC8785 canonicalisation, SHA-256 hashing, and Ed25519 signatures.");
  lines.push("- A successful verification run guarantees that the ledger and proof have not been tampered with between generation and use.");
  lines.push("");

  return lines.join("\n");
}

function exportBrief() {
  try {
    const md = buildBriefMarkdown();
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);

    const meta = currentProof && currentProof.meta ? currentProof.meta : {};
    const asOf = meta.as_of || new Date().toISOString();
    const datePart = asOf.slice(0, 10).replace(/:/g, "-");

    const a = document.createElement("a");
    a.href = url;
    a.download = `codex-geo-conflict-v1-brief-${datePart}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("[geo-conflict] Failed to export brief:", err);
    window.alert("Failed to export brief. See console for details.");
  }
}

async function loadAll() {
  setChipStatus("unknown", "Verification: Loading…");

  try {
    const proof = await fetchJson(PROOF_URL);
    currentProof = proof;
    const { meta, refs, sig } = proof;
    applyProofMeta(meta, refs, sig);

    // We assume CLI / CI has already verified this proof.
    setChipStatus("ok", "Verification: Proof present (CI / CLI)");

    // Try to load the referenced ledger for corridor table rendering
    let ledger = null;
    if (Array.isArray(refs) && refs.length > 0 && refs[0].path) {
      const ledgerUrl = "/" + refs[0].path;
      try {
        ledger = await fetchJson(ledgerUrl);
      } catch (err) {
        console.error("[geo-conflict] Failed to fetch ledger:", err);
      }
    }

    currentLedger = ledger || null;
    if (ledger) {
      currentRows = renderCorridors(ledger);
    } else {
      const empty = $("corridor-empty");
      if (empty) empty.hidden = false;
      currentRows = [];
      updateSummary([]);
    }

    markLastRefresh();
  } catch (err) {
    console.error("[geo-conflict] Failed to load proof/ledger:", err);
    setChipStatus("failed", "Verification: Failed to load proof");
    currentProof = null;
    currentLedger = null;
    currentRows = [];
    updateSummary([]);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btnRefresh = $("btn-refresh");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      loadAll();
    });
  }

  const btnExport = $("btn-export-brief");
  if (btnExport) {
    btnExport.addEventListener("click", () => {
      exportBrief();
    });
  }

  loadAll();
});