# Workflow durum toplayıcı — yerelde `python3 topla.py`, Mac'te `ssh mac python3 - < topla.py`.
# Yalnız okur. Çıktı: tek satır JSON {runs: [...], sureler: [...]}.
#  runs    : son 12 saatte etkinliği olan run'lar (canlı ajan = günlüğü son 5 dk'da yazılmış)
#  sureler : bitmiş run'lardan paket başına gerçek süre (dk) — kalan süre tahmini için
import glob, json, os, re, time

HOME = os.path.expanduser("~")
now = time.time()
out = {"runs": [], "sureler": []}

wf_json = {}
for f in glob.glob(f"{HOME}/.claude/projects/*/*/workflows/wf_*.json"):
    wf_json[os.path.basename(f)[:-5]] = f

for d in glob.glob(f"{HOME}/.claude/projects/*/*/subagents/workflows/wf_*"):
    if now - os.path.getmtime(d) > 12 * 3600:
        continue
    run_id = os.path.basename(d)
    agents = []
    for m in glob.glob(f"{d}/agent-*.meta.json"):
        try:
            meta = json.load(open(m))
        except Exception:
            continue
        log = m[: -len(".meta.json")] + ".jsonl"
        son = os.path.getmtime(log) if os.path.exists(log) else os.path.getmtime(m)
        agents.append({
            "ad": meta.get("description", ""),
            "faz": meta.get("workflowPhase", ""),
            "model": meta.get("model", ""),
            "basla": os.path.getmtime(m),
            "son": son,
        })
    agents.sort(key=lambda a: a["basla"])
    durum, isim = None, None
    if run_id in wf_json:
        try:
            j = json.load(open(wf_json[run_id]))
            durum, isim = j.get("status"), j.get("workflowName")
        except Exception:
            pass
    canli = [a for a in agents if now - a["son"] < 300]
    paket_bas = {}
    for a in agents:
        m = re.search(r"stack-(\d+)", a["ad"])
        if m:
            paket_bas.setdefault(m.group(1), a["basla"])
    out["runs"].append({
        "id": run_id,
        "ad": isim,
        "durum": durum or ("sürüyor" if canli else "sessiz"),
        "canli": len(canli) > 0,
        "sonEtkinlik": max([a["son"] for a in agents], default=os.path.getmtime(d)),
        "ajanSayisi": len(agents),
        "aktifAjanlar": [{k: a[k] for k in ("ad", "faz", "model", "basla", "son")} for a in canli],
        "sonAjan": agents[-1] if agents else None,
        "paketBaslangic": paket_bas,
    })

# Paket süreleri: bitmiş run'larda "stack-NN" etiketli ajanların ilk başlangıcından
# bir sonraki paketin ilk başlangıcına (ya da run sonuna) kadar geçen süre.
for f in wf_json.values():
    if now - os.path.getmtime(f) > 3 * 86400:
        continue
    try:
        j = json.load(open(f))
    except Exception:
        continue
    ag = [p for p in j.get("workflowProgress", []) if p.get("type") == "workflow_agent" and p.get("startedAt")]
    ilk = {}
    for p in ag:
        m = re.search(r"stack-(\d+)", p.get("label", ""))
        if m:
            no = int(m.group(1))
            ilk[no] = min(ilk.get(no, p["startedAt"]), p["startedAt"])
    sira = sorted(ilk.items(), key=lambda x: x[1])
    son = (j.get("startTime") or 0) + (j.get("durationMs") or 0)
    for i, (no, t) in enumerate(sira):
        bitis = sira[i + 1][1] if i + 1 < len(sira) else son
        dk = (bitis - t) / 60000
        # Son paket yarıda kesilmiş olabilir; yalnız tamamlanmış run'ın son paketini say
        if i + 1 == len(sira) and j.get("status") != "completed":
            continue
        if 10 < dk < 600:
            out["sureler"].append({"no": no, "dk": round(dk), "run": j.get("runId")})

print(json.dumps(out, ensure_ascii=False))
