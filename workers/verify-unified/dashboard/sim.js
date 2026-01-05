const H = { "x-api-key":"dev","x-tenant":"alpha","x-actor":"op","x-clearance":"secret" };
async function j(method, path, body){
  const opt = { method, headers:{...H} };
  if(body!==undefined){ opt.headers["content-type"]="application/json"; opt.body = JSON.stringify(body); }
  const r = await fetch(path, opt);
  const text = await r.text(); let data; try{ data=JSON.parse(text) }catch{ data={ raw:text } }
  return { status:r.status, data, headers:{ alg:r.headers.get("x-proof-alg")||"", hash:r.headers.get("x-proof-hash")||"", sig:r.headers.get("x-proof-sig")||"" }};
}
function setProof(el,h){ el.innerHTML = `
  <span class="proof">alg: <b class="mono">${h.alg||"-"}</b></span>
  <span class="proof">hash: <b class="mono">${h.hash||"-"}</b></span>
  <span class="proof">sig: <b class="mono">${h.sig? "present":"-"}</b></span>` }
function showJSON(el,obj){ el.textContent = JSON.stringify(obj, null, 2); }
function bind(idSel, run){
  const card = document.getElementById(idSel), out = card.querySelector("pre"), proofs = card.querySelector(".proofs");
  card.querySelector("button.run").onclick = async ()=>{
    card.querySelector(".status").textContent = "running…";
    try{ const {headers,data,status} = await run(card); setProof(proofs, headers); showJSON(out,data);
      card.querySelector(".status").innerHTML = `<span class="ok">OK</span> ${status}`;
    }catch(e){ card.querySelector(".status").innerHTML = `<span class="err">ERROR</span>`; showJSON(out,{ error:String(e) }); }
  };
}
window.addEventListener("DOMContentLoaded", ()=>{
  bind("spec",     async ()=> j("GET","/svc/sim/spec"));
  bind("collapse", async (c)=> j("POST","/svc/sim/hypothesis/collapse",{
    hypotheses: JSON.parse(c.querySelector("textarea.hyps").value||"[]"),
    weights:    JSON.parse(c.querySelector("textarea.weights").value||"[]"),
    seed:       c.querySelector("input.seed").value||"codex"
  }));
  bind("project",  async (c)=> j("POST","/svc/sim/project",{
    series: JSON.parse(c.querySelector("textarea.series").value||"[]"),
    constraints: JSON.parse(c.querySelector("textarea.cons").value||"{}")
  }));
});