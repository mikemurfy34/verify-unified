const H = { "x-api-key":"dev", "x-tenant":"alpha", "x-actor":"op", "x-clearance":"secret" };

async function j(method, path, body, ctype){
  const opt = { method, headers: { ...H } };
  if(body!==undefined){
    if(ctype){ opt.headers["content-type"]=ctype; opt.body = (typeof body==="string"?body:body); }
    else { opt.headers["content-type"]="application/json"; opt.body = JSON.stringify(body); }
  }
  const r = await fetch(path, opt);
  const text = await r.text();
  let data; try{ data = JSON.parse(text); }catch{ data = { raw:text } }
  return { status:r.status, data, headers: {
    alg: r.headers.get("x-proof-alg")||"",
    hash: r.headers.get("x-proof-hash")||"",
    sig: r.headers.get("x-proof-sig")||""
  }};
}

function setProof(el, h){ el.innerHTML = `
  <span class="proof">alg: <b class="mono">${h.alg||"—"}</b></span>
  <span class="proof">hash: <b class="mono">${h.hash||"—"}</b></span>
  <span class="proof">sig: <b class="mono">${h.sig? "present":"—"}</b></span>
`; }

function showJSON(el, obj){ el.textContent = JSON.stringify(obj, null, 2); }

function bind(idSel, run){
  const card = document.getElementById(idSel);
  const out = card.querySelector("pre");
  const proofs = card.querySelector(".proofs");
  card.querySelector("button.run").onclick = async ()=>{
    card.querySelector(".status").textContent = "running…";
    try{
      const {headers,data,status} = await run(card);
      setProof(proofs, headers);
      showJSON(out, data);
      card.querySelector(".status").innerHTML = `<span class="ok">OK</span> ${status}`;
    }catch(e){
      card.querySelector(".status").innerHTML = `<span class="err">ERROR</span>`;
      showJSON(out, { error:String(e) });
    }
  };
}

window.addEventListener("DOMContentLoaded", async ()=>{
  // Specs (shows env mode, verifies wiring)
  bind("tp-spec", async ()=>{
    return await j("GET","/svc/truth-physics/spec");
  });

  // Canonicalize demo
  bind("tp-canon", async (card)=>{
    const payload = { series:[1,2,3,4], note:"demo" };
    return await j("POST","/svc/truth-physics/canonicalize", payload);
  });

  // Score
  bind("tp-score", async (card)=>{
    const txt = card.querySelector("textarea").value.trim();
    const arr = txt.split(/[, \r\n]+/).filter(Boolean).map(Number);
    return await j("POST","/svc/truth-physics/score", { signals: arr });
  });

  // Forecast
  bind("tp-forecast", async (card)=>{
    const series = card.querySelector("textarea.series").value.trim().split(/[, \r\n]+/).filter(Boolean).map(Number);
    const steps  = Number(card.querySelector("input.steps").value||"3");
    return await j("POST","/svc/truth-physics/forecast", { series, steps });
  });

  // Plan
  bind("tp-plan", async (card)=>{
    const goals = card.querySelector("textarea.goals").value.trim().split(/\r?\n/).filter(Boolean);
    return await j("POST","/svc/truth-physics/plan", { goals });
  });

  // Feeds — spec/normalize/ingest
  bind("fd-spec", async ()=> await j("GET","/svc/feeds/spec"));
  bind("fd-norm", async (card)=>{
    const json = card.querySelector("textarea").value.trim();
    let obj; try{ obj = JSON.parse(json) }catch{ obj = {}; }
    return await j("POST","/svc/feeds/normalize", obj);
  });
  bind("fd-ingest-json", async (card)=>{
    const json = card.querySelector("textarea").value.trim();
    return await j("POST","/svc/feeds/ingest", json, "application/json");
  });
  bind("fd-ingest-ndjson", async (card)=>{
    const text = card.querySelector("textarea.nd").value;
    return await j("POST","/svc/feeds/ingest?format=ndjson", text, "application/x-ndjson");
  });
  bind("fd-ingest-csv", async (card)=>{
    const text = card.querySelector("textarea.csv").value;
    return await j("POST","/svc/feeds/ingest?format=csv", text, "text/csv");
  });

  // Domain pack — OceanOS / GovOS / Codex
  bind("dom-spec", async ()=> await j("GET","/svc/domain-pack/spec"));
  bind("dom-ocean", async (card)=>{
    const grid = card.querySelector("textarea.grid").value.trim()
      .split(/\n/).map(line => line.split(/[ ,]+/).filter(Boolean).map(Number));
    const threshold = Number(card.querySelector("input.thr").value||"0.6");
    return await j("POST","/svc/domain-pack/oceanos/restoration", { grid, threshold });
  });
  bind("dom-gov", async (card)=>{
    const goals = card.querySelector("textarea.goals").value.trim().split(/\r?\n/).filter(Boolean);
    return await j("POST","/svc/domain-pack/govos/ops-plan", { goals });
  });
  bind("dom-codex", async (card)=>{
    const series = card.querySelector("textarea.series").value.trim().split(/[, \r\n]+/).filter(Boolean).map(Number);
    const steps  = Number(card.querySelector("input.steps").value||"3");
    return await j("POST","/svc/domain-pack/codex/strategy", { series, steps });
  });
});