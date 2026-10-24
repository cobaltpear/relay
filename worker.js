// Cobalt Pear relay — makes a RunPod endpoint for one model from the list, because RunPod's
// create API can't be called from a browser (CORS). It does only that: two fixed calls to
// rest.runpod.io with the caller's own key. The key is passed on and never stored or logged.
const ORIGINS = ["https://cobaltpear.github.io"];
const RUNPOD = "https://rest.runpod.io/v1";
// the image RunPod's own «Deploy image or video API» uses (vLLM-Omni on the Hub)
const IMAGE = "registry.runpod.net/runpod-workers-worker-vllm-omni-main-dockerfile:0dd4acb2f";
const GPUS = {
  24: ["NVIDIA GeForce RTX 4090", "NVIDIA RTX A5000", "NVIDIA L4", "NVIDIA GeForce RTX 3090", "NVIDIA A40", "NVIDIA RTX A6000"],
  48: ["NVIDIA A40", "NVIDIA RTX A6000", "NVIDIA L40S", "NVIDIA L40", "NVIDIA RTX 6000 Ada Generation"],
  80: ["NVIDIA A100 80GB PCIe", "NVIDIA A100-SXM4-80GB", "NVIDIA H100 80GB HBM3", "NVIDIA H100 PCIe", "NVIDIA H100 NVL"],
  141: ["NVIDIA H200", "NVIDIA H200 NVL", "NVIDIA B200"],
};

export default {
  async fetch(req, env) {
    const origin = req.headers.get("origin") || "";
    const allowed = ORIGINS.includes(origin) || (env.DEV_ORIGIN && origin === env.DEV_ORIGIN);
    const cors = allowed ? { "access-control-allow-origin": origin, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "POST", vary: "origin" } : {};
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
    if (!allowed) return reply(403, { error: "Not allowed from this page." });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST" || new URL(req.url).pathname !== "/create") return reply(404, { error: "Not found." });

    const key = req.headers.get("authorization") || "";
    let b;
    try { b = await req.json(); } catch { return reply(400, { error: "Bad request." }); }
    const model = String(b.model || ""), gpu = GPUS[b.gpu] ? b.gpu : 48;
    if (!/^Bearer \S+$/.test(key) || !/^\w[\w.-]{0,95}\/\w[\w.-]{0,95}$/.test(model)) return reply(400, { error: "Bad request." });
    const name = "cp-" + model.split("/")[1].toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);
    const call = async (path, body) => {  // RunPod's own error text is passed back, never logged
      const r = await fetch(RUNPOD + path, { method: "POST", headers: { authorization: key, "content-type": "application/json" }, body: JSON.stringify(body) });
      const text = await r.text();
      let j = null; try { j = JSON.parse(text); } catch {}
      return { ok: r.ok, status: r.status, j, text: text.slice(0, 300) };
    };
    const t = await call("/templates", { name, imageName: IMAGE, isServerless: true, containerDiskInGb: 60, env: { MODEL_NAME: model } });
    if (!t.ok || !t.j?.id) return reply(t.status === 401 || t.status === 403 ? 403 : 502, { error: t.status === 401 || t.status === 403 ? "This key can't create endpoints." : "RunPod: " + t.text });
    const e = await call("/endpoints", {
      name, templateId: t.j.id, gpuTypeIds: GPUS[gpu], gpuCount: 1,
      workersMin: 0, workersMax: 1, idleTimeout: 5, flashboot: true,
      executionTimeoutMs: b.video ? 1800000 : 600000, scalerType: "QUEUE_DELAY", scalerValue: 4,
    });
    if (!e.ok || !e.j?.id) await fetch(RUNPOD + "/templates/" + t.j.id, { method: "DELETE", headers: { authorization: key } }).catch(() => {});  // leave nothing half-made
    if (!e.ok || !e.j?.id) return reply(e.status === 401 || e.status === 403 ? 403 : 502, { error: e.status === 401 || e.status === 403 ? "This key can't create endpoints." : "RunPod: " + e.text });
    return reply(200, { id: e.j.id, name });
  },
};
