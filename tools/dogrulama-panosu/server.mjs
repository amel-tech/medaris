// Medaris Doğrulama Panosu — yığın PR'larının "kusursuz mu" durumunu tek ekranda birleştirir.
// Bağımlılıksız (yalnız node:*). Başlat: node server.mjs  → http://localhost:<PORT>
// Kaynaklar (canlı okunur, medaris'e hiçbir şey yazılmaz):
//   - local_docs/ekranlar/PLAN.md paket tablosu
//   - local_docs/ekranlar/_kontrol/stack-NN/turN.md (AI'nin tarayıcı ölçümü, ✓/✗) + png'ler
//   - gh pr list (CI, CodeRabbit, head SHA) — 60 sn önbellek
// İnsan onayı, kapılar ve puan bu klasördeki durum/*.json dosyalarında durur.
import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = process.env.MEDARIS_REPO || resolve(HERE, "../..");
const EKRANLAR = join(REPO, "local_docs/ekranlar");
const KONTROL = join(EKRANLAR, "_kontrol");
const DURUM = join(HERE, "durum");
const PORT = Number(process.env.PORT || 5320);

const readJson = (f, fb) => {
  try {
    return JSON.parse(readFileSync(join(DURUM, f), "utf8"));
  } catch {
    return fb;
  }
};
const writeJson = (f, d) => {
  mkdirSync(DURUM, { recursive: true });
  writeFileSync(join(DURUM, f), `${JSON.stringify(d, null, 2)}\n`);
};

function planPaketleri() {
  // local_docs git'e girmez: PLAN.md yoksa paket listesi yalnız gh'deki release/stack-* PR'larından gelir
  const planYolu = join(EKRANLAR, "PLAN.md");
  if (!existsSync(planYolu)) return [];
  const md = readFileSync(planYolu, "utf8");
  const out = [];
  for (const line of md.split("\n")) {
    const m = line.match(
      /^\|\s*(\d+)\s*\|\s*([a-z0-9-]+)\s*\|\s*`([^`]+)`\s*\|(.*)$/
    );
    if (!m) continue;
    const c = m[4].split("|").map((x) => x.trim());
    out.push({
      no: Number(m[1]),
      slug: m[2],
      dal: m[3],
      ekranlar: c[0] === "-" ? [] : c[0].split("<br>").filter(Boolean),
      linear: c[4] || "",
      planDurum: (c[6] || "").replace(/rapor:\s*\/home\/\S+/g, "").trim(),
    });
  }
  return out;
}

function sonTur(no) {
  const dir = join(KONTROL, `stack-${no}`);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir);
  // En son tur = en son yazılan rapor (numara değil: zincir tur1.md'yi yeniden yazabiliyor)
  const turlar = files
    .map((f) => f.match(/^tur(\d+)\.md$/))
    .filter(Boolean)
    .map((m) => ({ n: Number(m[1]), t: statSync(join(dir, m[0])).mtimeMs }))
    .sort((a, b) => a.t - b.t);
  if (!turlar.length) return null;
  const { n, t } = turlar.at(-1);
  const md = readFileSync(join(dir, `tur${n}.md`), "utf8");
  const lines = md.split("\n");
  // Hüküm: "Sonuç" geçen satır ya da başlığın altındaki 2 satır
  let hukum = "yok";
  lines.forEach((l, i) => {
    if (hukum !== "yok" || !/sonuç/i.test(l)) return;
    const blok = lines.slice(i, i + 3).join(" ");
    if (/GEÇMEDİ|KALDI|TAKILDI|BAŞARISIZ/.test(blok)) hukum = "gecmedi";
    else if (/GEÇTİ/.test(blok)) hukum = "gecti";
  });
  const say = (re) => lines.filter((l) => re.test(l)).length;
  const gorseller = files
    .filter(
      (f) => (f.match(/-tur(\d+)(-[a-z0-9]+)?\.png$/) || [])[1] === String(n)
    )
    .sort();
  return {
    tur: n,
    toplamTur: turlar.length,
    baslik: (lines[0] || "").replace(/^#\s*/, ""),
    hukum,
    gecti: say(/^\s*(\d+\.|-)\s*✓/),
    kaldi: say(/^\s*(\d+\.|-)\s*✗/),
    dogrulanamadi: say(/doğrulanamadı/i),
    gorseller: gorseller.map(
      (g) => `/kontrol-gorsel/stack-${no}/${encodeURIComponent(g)}`
    ),
    tarih: new Date(t).toISOString(),
    markdown: md,
  };
}

let gh = { at: 0, data: [], hata: null };
const ghJson = (args) =>
  new Promise((res, rej) =>
    execFile(
      "gh",
      args,
      { cwd: REPO, maxBuffer: 64 * 1024 * 1024, timeout: 60_000 },
      (err, stdout) => {
        if (err) return rej(err);
        try {
          res(JSON.parse(stdout));
        } catch (e) {
          rej(e);
        }
      }
    )
  );
async function ghPrlar() {
  if (Date.now() - gh.at < 60_000) return gh;
  try {
    // Açıklar check'leriyle; merge edilmiş yığın PR'ları hafif sorguyla (CI artık main'de)
    const [acik, merged] = await Promise.all([
      ghJson([
        "pr",
        "list",
        "--state",
        "open",
        "--limit",
        "100",
        "--json",
        "number,title,state,headRefName,baseRefName,headRefOid,url,statusCheckRollup,reviews,isDraft",
      ]),
      ghJson([
        "pr",
        "list",
        "--state",
        "merged",
        "--limit",
        "60",
        "--search",
        "head:release/stack-",
        "--json",
        "number,title,state,headRefName,baseRefName,headRefOid,url,reviews,mergedAt",
      ]),
    ]);
    gh = { at: Date.now(), data: [...acik, ...merged], hata: null };
  } catch (e) {
    gh = {
      ...gh,
      hata: String(e.message || e)
        .split("\n")[0]
        .slice(0, 200),
    };
  }
  return gh;
}

// Aynı check'in birden çok koşusu varsa (yeni push eskisini iptal eder) en sonuncusu sayılır.
function ciOzet(rollup = []) {
  const son = new Map();
  for (const c of rollup) {
    const ad = `${c.workflowName || ""}/${c.name || c.context || ""}`;
    const t = Date.parse(c.completedAt || c.startedAt || 0) || 0;
    const p = son.get(ad);
    if (!p || t >= p.t)
      son.set(ad, { t, s: c.conclusion || c.state || "PENDING" });
  }
  const d = [...son.values()].map((v) => v.s);
  const kirmizi = d.filter((s) =>
    [
      "FAILURE",
      "ERROR",
      "TIMED_OUT",
      "ACTION_REQUIRED",
      "STARTUP_FAILURE",
    ].includes(s)
  ).length;
  const bekleyen = d.filter((s) =>
    ["PENDING", "IN_PROGRESS", "QUEUED", "EXPECTED", "WAITING", ""].includes(s)
  ).length;
  return {
    toplam: d.length,
    kirmizi,
    bekleyen,
    durum: kirmizi ? "kirmizi" : bekleyen ? "bekliyor" : "yesil",
  };
}

async function paketler() {
  const plan = planPaketleri();
  const { data: prs, hata } = await ghPrlar();
  const onaylar = readJson("onaylar.json", {});
  const onemler = readJson("onem.json", {});
  const byDal = new Map();
  for (const p of prs)
    if (!byDal.has(p.headRefName) || p.state === "OPEN")
      byDal.set(p.headRefName, p);
  const planDallar = new Set(plan.map((p) => p.dal));
  const onceki = prs
    .filter(
      (p) =>
        /^release\/stack-\d+/.test(p.headRefName) &&
        !planDallar.has(p.headRefName) &&
        p.state !== "CLOSED"
    )
    .map((p) => ({
      no: Number(p.headRefName.match(/stack-(\d+)/)[1]),
      slug: p.headRefName.replace(/^release\/stack-\d+-/, ""),
      dal: p.headRefName,
      ekranlar: [],
      linear: (p.title.match(/MDRS-\d+/) || [""])[0],
      planDurum: "zincir öncesi yığın (ekransız)",
    }));
  const tekil = new Map();
  for (const p of [...onceki, ...plan]) tekil.set(p.dal, p);
  // PLAN.md'de olmayan tasarım ekranları (landing, telefon görünümleri…) commit'li ek-ekranlar.json'dan gelir; PLAN.md'siz makinede de görünür
  const ekEkranlar = readJson("ek-ekranlar.json", {});
  for (const p of tekil.values()) {
    const ek = ekEkranlar[p.no]?.ekranlar || [];
    p.ekranlar = [...new Set([...p.ekranlar, ...ek])];
  }

  const items = [...tekil.values()]
    .sort((a, b) => a.no - b.no)
    .map((p) => {
      const pr = byDal.get(p.dal);
      const tur = sonTur(p.no);
      const ci =
        pr && pr.state !== "MERGED" ? ciOzet(pr.statusCheckRollup) : null;
      const rr = (pr?.reviews || []).filter((x) =>
        /coderabbit/i.test(x.author?.login || "")
      );
      const imza = `${pr?.headRefOid?.slice(0, 8) || "-"}|${tur ? `tur${tur.tur}` : "-"}`;
      const onay = onaylar[p.no] || null;
      const onayGecerli =
        !!onay && onay.imza === imza && (onay.durum || "tamam") === "tamam";
      const sorunNotu = onay?.durum === "sorun" ? onay : null;
      const takildi = /takıldı|kontrol geçmedi/i.test(p.planDurum);

      let renk = "gri";
      let neden = "henüz kodlanmadı";
      if (pr || tur || takildi || /kodlandı/i.test(p.planDurum)) {
        const sorun = [];
        const eksik = [];
        if (tur?.hukum === "gecmedi")
          sorun.push(`son tur (${tur.tur}) GEÇMEDİ`);
        else if (takildi && tur?.hukum === "gecti")
          eksik.push("çelişki: PLAN 'takıldı' diyor, son tur GEÇTİ");
        else if (takildi) sorun.push("zincirde takıldı");
        if (ci?.kirmizi) sorun.push(`${ci.kirmizi} CI check kırmızı`);
        if (!pr) eksik.push("PR yok");
        if (ci?.bekleyen) eksik.push("CI sürüyor");
        if (p.ekranlar.length && !tur) eksik.push("tarayıcı ölçümü yok");
        if (tur && tur.hukum === "yok") eksik.push("raporda hüküm satırı yok");
        if (tur?.dogrulanamadi)
          eksik.push(`${tur.dogrulanamadi} satır 'doğrulanamadı'`);
        if (pr && !rr.length) eksik.push("CodeRabbit incelemedi");
        if (sorun.length) {
          renk = "kirmizi";
          neden = [...sorun, ...eksik].join(" · ");
        } else if (eksik.length) {
          renk = "sari";
          neden = eksik.join(" · ");
        } else {
          renk = "yesil";
          neden = "otomatik kanıtların hepsi yeşil";
        }
      }
      // Önem (100): taban = açılış kapsamı + yetki/veri riski (durum/onem.json),
      // üstüne canlı kanıt zayıflığı eklenir.
      const o = onemler[p.no] || { taban: 40, kapsam: "?", gerekce: "" };
      const ek = [];
      if (tur?.hukum === "gecmedi") ek.push(["son tur GEÇMEDİ", 10]);
      if (ci?.kirmizi) ek.push(["CI kırmızı", 10]);
      if (takildi && tur?.hukum !== "gecti") ek.push(["takıldı", 10]);
      if (tur?.dogrulanamadi) ek.push(["doğrulanamadı satırı", 5]);
      if (pr && p.ekranlar.length && !tur) ek.push(["tarayıcı ölçümü yok", 5]);
      const puan = Math.min(100, o.taban + ek.reduce((a, [, n]) => a + n, 0));
      const seviye =
        puan >= 75
          ? "kritik"
          : puan >= 60
            ? "yuksek"
            : puan >= 40
              ? "orta"
              : "dusuk";
      return {
        ...p,
        onem: {
          puan,
          seviye,
          taban: o.taban,
          kapsam: o.kapsam,
          gerekce: o.gerekce,
          ek,
        },
        pr: pr
          ? {
              number: pr.number,
              url: pr.url,
              state: pr.state,
              title: pr.title,
              base: pr.baseRefName,
              draft: pr.isDraft,
              mergedAt: pr.mergedAt || null,
            }
          : null,
        ci,
        coderabbit: { sayi: rr.length, son: rr.at(-1)?.state || null },
        tur: tur ? { ...tur, markdown: undefined } : null,
        renk,
        neden,
        imza,
        onay,
        onayGecerli,
        sorunNotu,
        simdiKontrol: renk === "yesil" && !onayGecerli,
      };
    });
  return {
    items,
    ghHata: hata,
    ghZaman: gh.at ? new Date(gh.at).toISOString() : null,
  };
}

// ---- Süreç: iki makinedeki workflow run'ları + kalan iş tahmini ----
const TOPLA = join(HERE, "topla.py");
// Workflow toplayıcı: yerel makine her zaman; ikinci makine yalnız DOGRULAMA_MAC=<ssh-host> verilirse
const MAC = process.env.DOGRULAMA_MAC || "";
const makineler = {
  Linux: () => ["python3", [TOPLA]],
  Mac: () => [
    "ssh",
    ["-o", "ConnectTimeout=8", "-o", "BatchMode=yes", MAC, "python3", "-"],
  ],
};
let surecCache = { at: 0, data: null };
function topla(makine) {
  const [cmd, args] = makineler[makine]();
  return new Promise((res) => {
    const ch = execFile(
      cmd,
      args,
      { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err)
          return res({
            makine,
            hata: String(err.message).split("\n")[0].slice(0, 160),
            runs: [],
            sureler: [],
          });
        try {
          res({ makine, ...JSON.parse(stdout) });
        } catch (e) {
          res({ makine, hata: String(e), runs: [], sureler: [] });
        }
      }
    );
    if (makine === "Mac") ch.stdin.end(readFileSync(TOPLA));
  });
}
const medyan = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 80;
};

async function surec() {
  if (surecCache.data && Date.now() - surecCache.at < 55_000)
    return surecCache.data;
  const [paket, ...mak] = await Promise.all([
    paketler(),
    topla("Linux"),
    ...(MAC ? [topla("Mac")] : []),
  ]);
  const sureler = mak.flatMap((m) => m.sureler);
  const paketDk = medyan(sureler.map((s) => s.dk));
  const prVar = new Set(paket.items.filter((i) => i.pr).map((i) => i.no));
  const runs = mak.flatMap((m) =>
    m.runs.map((r) => ({ ...r, makine: m.makine }))
  );
  const canliAjanlar = runs.flatMap((r) =>
    r.aktifAjanlar.map((a) => ({ ...a, run: r.id, makine: r.makine }))
  );
  const plan = readJson("surec.json", { adimlar: [] });
  const simdi = Date.now();
  let saat = simdi;
  const adimlar = plan.adimlar.map((a) => {
    let durum = "bekliyor";
    let kalanDk = a.dk ?? 0;
    let detay = "";
    if (a.paketler) {
      const biten = a.paketler.filter((n) => prVar.has(n));
      const kalan = a.paketler.filter((n) => !prVar.has(n));
      kalanDk = kalan.length * paketDk;
      for (const n of kalan) {
        const ajan = canliAjanlar.find((x) =>
          new RegExp(`stack-${n}\\b`).test(x.ad)
        );
        if (ajan) {
          // Bu paketin ilk ajanı ne zaman başladı → geçen süreyi düş
          const run = runs.find((r) => r.id === ajan.run);
          const gecen =
            (simdi / 1000 - (run?.paketBaslangic?.[n] ?? ajan.basla)) / 60;
          kalanDk -= Math.min(paketDk - 10, Math.max(0, gecen));
          durum = "suruyor";
          detay = `${ajan.makine} · ${ajan.faz}: ${ajan.ad} · son etkinlik ${Math.round((simdi / 1000 - ajan.son) / 60)} dk önce`;
        }
      }
      if (!kalan.length) {
        durum = "bitti";
        kalanDk = 0;
      }
      detay = detay || `${biten.length}/${a.paketler.length} paketin PR'ı açık`;
    }
    if (a.durum) durum = a.durum;
    if (durum === "bitti") kalanDk = 0;
    saat += Math.max(0, kalanDk) * 60_000;
    const bitis = saat;
    return {
      ...a,
      durum,
      kalanDk: Math.round(Math.max(0, kalanDk)),
      detay,
      tahminiBitis: new Date(bitis).toISOString(),
    };
  });
  const data = {
    zaman: new Date().toISOString(),
    paketDk,
    olcumSayisi: sureler.length,
    makineler: mak.map((m) => ({
      makine: m.makine,
      hata: m.hata || null,
      canliRun: m.runs.filter((r) => r.canli).length,
    })),
    runs: runs.sort((a, b) => b.sonEtkinlik - a.sonEtkinlik).slice(0, 8),
    adimlar,
    toplamKalanDk: adimlar.reduce((x, a) => x + a.kalanDk, 0),
    not: plan.not,
  };
  surecCache = { at: Date.now(), data };
  return data;
}

// ---- Tahmin: görev başına süre, hız ölçümü, saatlik güncelleme geçmişi (durum/tahmin.json) ----
// Kart tahmini saatte bir yazılır; ara dakikalarda ekran son yazılan değeri gösterir.
// Isı = bir görevin tahmininin kaç kez değiştiği (seyir ısı kuralı: +1, düşmez).
const SAATLIK = 60 * 60_000;
// Aşamalar: ilki görünür hedeftir; sonrakiler gizli kalır, ancak saati geçip iş bitmemişse sırayla açılır.
const ASAMALAR = [
  { ad: "Normal", saat: "2026-10-04T21:00:00+03:00" },
  { ad: "Anormal", saat: "2026-10-05T00:00:00+03:00" },
  { ad: "Kriz", saat: "2026-10-05T03:00:00+03:00" },
  { ad: "Seferberlik", saat: "2026-10-05T06:00:00+03:00" },
  { ad: "Son çizgi", saat: "2026-10-05T09:00:00+03:00" },
];
const tahminVarsayilan = () => ({
  hedef: ASAMALAR[0].saat,
  asamalar: ASAMALAR,
  gecmis: [],
  gorev: {},
});
const bekleyenMi = (i) =>
  !i.onayGecerli && i.renk !== "gri" && i.onem.kapsam !== "taha";

// Senin bir kartı kontrol etme süren (dk), hız çarpanı uygulanmadan
function tabanDk(i) {
  let dk = 2;
  const g = i.tur?.gorseller?.length || 0;
  dk += Math.min(4, Math.max(0, g - 2) * 0.5);
  if (i.tur?.dogrulanamadi) dk += 2; // uygulamada elle tıklanacak satır var
  if (i.renk === "kirmizi") dk += 2; // rapor okunacak, not yazılacak
  if (i.onem.kapsam === "acilis") dk += 1; // açılış ekranı uygulamada açılıp bakılmalı
  return dk;
}

// Gidişat: art arda iki onay arası (≤20 dk) = o kartın gerçek süresi; gerçek/taban oranı çarpandır
function hizOlc(items) {
  const byNo = new Map(items.map((i) => [String(i.no), i]));
  const s = Object.entries(readJson("onaylar.json", {}))
    .filter(([, o]) => o.tarih)
    .map(([no, o]) => ({ no, t: Date.parse(o.tarih) }))
    .sort((a, b) => a.t - b.t);
  let gercek = 0;
  let beklenen = 0;
  let n = 0;
  for (let k = 1; k < s.length; k++) {
    const ara = (s[k].t - s[k - 1].t) / 60_000;
    const it = byNo.get(s[k].no);
    if (ara <= 0 || ara > 20 || !it) continue;
    gercek += ara;
    beklenen += tabanDk(it);
    n++;
  }
  const oran = n >= 2 ? Math.min(3, Math.max(0.5, gercek / beklenen)) : 1;
  return {
    oran: Math.round(oran * 100) / 100,
    olcum: n,
    ortDk: n ? Math.round((gercek / n) * 10) / 10 : null,
  };
}
const gorevDk = (i, oran) => Math.max(1, Math.round(tabanDk(i) * oran));

// Günün başlangıcı (bar "09:00'da başladık" buradan sayar)
const GUN_BASLANGIC = "2026-10-04T09:00:00+03:00";
// Dev ortamı adresleri (docs/runbooks/deploy-*.md; 2026-10-04 curl ile 200 doğrulandı)
const LINKLER = {
  web: [
    {
      id: "landing",
      ad: "Landing (ziyaretçi)",
      url: "https://landing-dev.medaris.app",
    },
    {
      id: "tedris",
      ad: "Tedris (talebe)",
      url: "https://tedris-dev.medaris.app/tr",
    },
    {
      id: "nizam",
      ad: "Nizam (yönetim)",
      url: "https://nizam-dev.medaris.app/tr",
    },
    { id: "nazir", ad: "Nazır", url: "https://nazir-dev.medaris.app" },
    {
      id: "keycloak",
      ad: "Keycloak — hesap / giriş (amel-tech-dev)",
      url: "https://auth.medaris.app/realms/amel-tech-dev/account",
    },
    {
      id: "yerel",
      ad: "Yerel demo — tedris, açılış verisi",
      url: "http://localhost:4000/tr/discover",
    },
  ],
  api: [
    {
      ad: "Tedrisat API — Swagger",
      url: "https://api-tedrisat-dev.medaris.net/docs",
    },
    {
      ad: "Tedrisat API — sağlık",
      url: "https://api-tedrisat-dev.medaris.net/health",
    },
    {
      ad: "Teşkilat API — sağlık",
      url: "https://api-teskilat-dev.medaris.net/health",
    },
  ],
};
function gorevLink(proje, ekranlar = []) {
  const w = (id) => LINKLER.web.find((x) => x.id === id);
  if (proje === "landing" && ekranlar.some((e) => e.startsWith("medaris/")))
    return {
      ...w("tedris"),
      not: "Keycloak giriş/kayıt ekranları: tedris'te Giriş Yap'a bas",
    };
  return w(proje) || w("tedris");
}

// ---- Proje grupları, plan sırası, açılışa etki ----
const PROJELER = [
  {
    id: "landing",
    ad: "Landing + giriş",
    not: "ziyaretçi sitesi ve Keycloak giriş/kayıt ekranları",
  },
  { id: "tedris", ad: "Tedris" },
  { id: "nizam", ad: "Nizam" },
  {
    id: "nazir",
    ad: "Nazır",
    istege: true,
    not: "isteğe bağlı — bakılmayabilir",
  },
];
const PROJE_SIRA = Object.fromEntries(PROJELER.map((p, k) => [p.id, k]));

// PR başına değişen dosyalar (10 dk önbellek) — proje tespiti ve açılışa etki için
let dosya = { at: 0, map: new Map() };
async function dosyalar() {
  if (Date.now() - dosya.at < 600_000) return dosya.map;
  try {
    const [m, o] = await Promise.all([
      ghJson([
        "pr",
        "list",
        "--state",
        "merged",
        "--limit",
        "100",
        "--search",
        "head:release/stack-",
        "--json",
        "headRefName,files",
      ]),
      ghJson([
        "pr",
        "list",
        "--state",
        "open",
        "--limit",
        "100",
        "--json",
        "headRefName,files",
      ]),
    ]);
    const map = new Map();
    for (const p of [...m, ...o])
      map.set(
        p.headRefName,
        (p.files || []).map((f) => f.path)
      );
    dosya = { at: Date.now(), map };
  } catch {
    dosya.at = Date.now() - 540_000; // 1 dk sonra yeniden dene
  }
  return dosya.map;
}

const EKRAN_PROJE = {
  medaris: "landing",
  landing: "landing",
  tedris: "tedris",
  nizam: "nizam",
  nazir: "nazir",
};
const DOSYA_PROJE = [
  [/^apps\/(landing|keycloak-theme)\//, "landing"],
  [/^apps\/tedris\//, "tedris"],
  [/^apps\/nizam\//, "nizam"],
  [/^apps\/nazir\//, "nazir"],
];
function projeBul(i, dmap) {
  const say = {};
  for (const e of i.ekranlar) {
    const p = EKRAN_PROJE[e.split("/")[0]];
    if (p) say[p] = (say[p] || 0) + 1;
  }
  if (!Object.keys(say).length)
    for (const f of dmap.get(i.dal) || []) {
      const hit = DOSYA_PROJE.find(([re]) => re.test(f));
      if (hit) say[hit[1]] = (say[hit[1]] || 0) + 1;
    }
  const en = Object.entries(say).sort((a, b) => b[1] - a[1])[0];
  // Açılış paketi web uygulamasına yalnız birkaç dosyayla dokunuyorsa (ör. backend yetki işi) talebe tarafında, tedris'te görülür
  if (en && !i.ekranlar.length && en[1] < 5 && i.onem.kapsam === "acilis")
    return "tedris";
  if (en) return en[0];
  // Yalnız backend/kütüphane: kurulum işi nizam'dan, kalanı tedris'ten görülür
  return i.onem.kapsam === "kurulum" ? "nizam" : "tedris";
}

// Herkesin dokunduğu dosyalar etki sayılmaz (çeviri katalogları, kilit dosyası, belgeler, ≥8 paketin ortak "hub" dosyaları)
const GENEL =
  /^(docs\/|libs\/i18n\/|pnpm-|\.|README|CLAUDE|biome|docker-compose|audit-ci|tools\/ci\/)/;
const kisaYol = (f) => f.split("/").slice(-2).join("/");
function etkilerHesapla(items, acilis, dmap, onaylar) {
  if (!acilis) return [];
  const byNo = new Map();
  for (const i of items) if (!byNo.has(i.no) || i.pr) byNo.set(i.no, i);
  const acilisNo = new Set(acilis.adimlar.flatMap((a) => a.paketler));
  const sayac = new Map();
  for (const i of byNo.values())
    for (const f of new Set(dmap.get(i.dal) || []))
      sayac.set(f, (sayac.get(f) || 0) + 1);
  const dosyaOf = (i) =>
    (dmap.get(i.dal) || []).filter(
      (f) => !GENEL.test(f) && (sayac.get(f) || 0) < 8
    );
  const adimlar = acilis.adimlar.map((a) => {
    const ps = a.paketler.map((n) => byNo.get(n)).filter(Boolean);
    return {
      id: a.id,
      dosya: new Set(ps.flatMap(dosyaOf)),
      ekran: new Set(ps.flatMap((p) => p.ekranlar)),
    };
  });
  const out = [];
  for (const i of byNo.values()) {
    if (acilisNo.has(i.no) || i.renk === "gri") continue;
    const o = onaylar[i.no];
    if (!o) continue; // kontrolü bitmeden etki gösterilmez
    const fs = dosyaOf(i);
    const etkilenen = [];
    const od = new Set();
    const oe = new Set();
    for (const a of adimlar) {
      const d = fs.filter((f) => a.dosya.has(f));
      const e = i.ekranlar.filter((x) => a.ekran.has(x));
      if (!d.length && !e.length) continue;
      etkilenen.push(a.id);
      for (const f of d) od.add(f);
      for (const x of e) oe.add(x);
    }
    if (!etkilenen.length && o.durum !== "sorun") continue;
    const yuzde = Math.round((100 * etkilenen.length) / adimlar.length);
    const sebep = [
      etkilenen.length ? `açılış adımları ${etkilenen.join(", ")} ile` : "",
      oe.size ? `ortak ekran: ${[...oe].slice(0, 4).join(", ")}` : "",
      od.size
        ? `ortak dosya (${od.size}): ${[...od].slice(0, 3).map(kisaYol).join(", ")}${od.size > 3 ? " …" : ""}`
        : "",
      o.durum === "sorun"
        ? `kontrolde sorun notu: “${String(o.not || "").slice(0, 120)}”`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const imza = `${i.imza}|${etkilenen.join(",")}|${o.durum || "tamam"}`;
    const eo = onaylar[`e${i.no}`] || null;
    out.push({
      no: i.no,
      linear: i.linear,
      slug: i.slug,
      pr: i.pr,
      proje: projeBul(i, dmap),
      adimlar: etkilenen,
      yuzde,
      sebep,
      ortakDosya: [...od],
      ortakEkran: [...oe],
      kaynakDurum: o.durum || "tamam",
      imza,
      onay: eo,
      onayGecerli: !!eo && eo.imza === imza && eo.durum === "tamam",
      sorunNotu: eo?.durum === "sorun" ? eo : null,
      dk: 3 + Math.min(5, Math.ceil(od.size / 5)),
    });
  }
  return out.sort((a, b) => b.yuzde - a.yuzde || a.no - b.no);
}

function planHesapla(items, etkiler, acilis, dmap) {
  const t = { ...tahminVarsayilan(), ...readJson("tahmin.json", {}) };
  const oran = hizOlc(items).oran;
  const sonKayit = (k) => {
    const g = t.gorev[k];
    return g?.length && g.at(-1).dk ? g.at(-1).dk : null;
  };
  const acilisNo = new Set(acilis?.adimlar.flatMap((a) => a.paketler) || []);
  // "Sorun var" denmiş ve kod değişmemiş kart kuyruktan çıkar (düzeltme bekler); kod değişirse imza düşer, geri gelir
  const sorunda = (x) => !!x.sorunNotu && x.onay?.imza === x.imza;
  const gorevler = [
    ...etkiler
      .filter((e) => !e.onayGecerli && !sorunda(e))
      .map((e) => ({
        tur: "etki",
        key: `e${e.no}`,
        no: e.no,
        proje: e.proje,
        acilis: true,
        puan: 100,
        dk: e.dk,
      })),
    ...items
      .filter((i) => bekleyenMi(i) && !sorunda(i))
      .map((i) => ({
        tur: "paket",
        key: `p${i.no}`,
        no: i.no,
        proje: projeBul(i, dmap),
        acilis: acilisNo.has(i.no),
        puan: i.onem.puan,
        dk: sonKayit(`p${i.no}`) ?? gorevDk(i, oran),
      })),
  ].sort(
    (a, b) =>
      PROJE_SIRA[a.proje] - PROJE_SIRA[b.proje] ||
      (a.tur === "etki" ? 0 : 1) - (b.tur === "etki" ? 0 : 1) ||
      Number(b.acilis) - Number(a.acilis) ||
      b.puan - a.puan ||
      a.no - b.no
  );
  const simdi = Date.now();
  let imlec = simdi;
  for (const g of gorevler) {
    g.baslangic = new Date(imlec).toISOString();
    imlec += g.dk * 60_000;
    g.bitis = new Date(imlec).toISOString();
  }
  const zorunlu = (g) => !PROJELER[PROJE_SIRA[g.proje]].istege;
  for (const g of gorevler) {
    const it = items.find((i) => i.no === g.no && (i.pr || i.renk !== "gri"));
    g.link = gorevLink(g.proje, it?.ekranlar);
  }
  const bitenPaket = items.filter(
    (i) =>
      (i.onayGecerli || sorunda(i)) &&
      i.onem.kapsam !== "taha" &&
      !PROJELER[PROJE_SIRA[projeBul(i, dmap)]].istege
  ).length;
  const bitenEtki = etkiler.filter((e) => e.onayGecerli || sorunda(e)).length;
  const tamamlanan = [
    ...items
      .filter((i) => (i.onayGecerli || sorunda(i)) && i.onem.kapsam !== "taha")
      .map((i) => ({
        tur: "paket",
        key: `p${i.no}`,
        no: i.no,
        durum: i.onayGecerli ? "tamam" : "sorun",
        tarih: i.onay.tarih,
        not: i.onay.not || "",
        proje: projeBul(i, dmap),
      })),
    ...etkiler
      .filter((e) => e.onayGecerli || sorunda(e))
      .map((e) => ({
        tur: "etki",
        key: `e${e.no}`,
        no: e.no,
        durum: e.onayGecerli ? "tamam" : "sorun",
        tarih: e.onay.tarih,
        not: e.onay.not || "",
        proje: e.proje,
      })),
  ].sort((a, b) => Date.parse(b.tarih) - Date.parse(a.tarih));
  const biten = bitenPaket + bitenEtki;
  const bekleyen = gorevler.filter(zorunlu);
  const toplam = biten + bekleyen.length;

  // Aşamalar: bitmediyse saati geçenler + sıradaki görünür; bitmişse en son onayın düştüğü aşamaya kadar
  const asamalar = t.asamalar || ASAMALAR;
  let aktif = asamalar.findIndex((a) => Date.parse(a.saat) > simdi);
  if (aktif < 0) aktif = asamalar.length - 1;
  if (!bekleyen.length) {
    const son = Math.max(
      0,
      ...Object.values(readJson("onaylar.json", {})).map(
        (o) => Date.parse(o.tarih) || 0
      )
    );
    const k = asamalar.findIndex((a) => Date.parse(a.saat) >= son);
    aktif = k < 0 ? asamalar.length - 1 : k;
  }
  const ilk = Date.parse(t.gecmis[0]?.zaman || new Date(simdi).toISOString());
  const yuzdeAt = (saat) => {
    const kalanDk = (Date.parse(saat) - simdi) / 60_000;
    let n = 0;
    let top = 0;
    for (const g of bekleyen) {
      top += g.dk;
      if (top <= kalanDk) n++;
    }
    return toplam ? Math.round((100 * (biten + n)) / toplam) : 100;
  };
  const gorunen = asamalar.slice(0, aktif + 1).map((a, k) => ({
    ...a,
    sira: k + 1,
    gecti: Date.parse(a.saat) <= simdi,
    yuzde: Date.parse(a.saat) > simdi ? yuzdeAt(a.saat) : null,
  }));
  const hedef = asamalar[aktif];
  const oncekiSaat = aktif ? Date.parse(asamalar[aktif - 1].saat) : ilk;
  const zamanOrani = Math.min(
    1,
    Math.max(0, (simdi - oncekiSaat) / (Date.parse(hedef.saat) - oncekiSaat))
  );

  const gruplar = PROJELER.map((p) => {
    const gs = gorevler.filter((g) => g.proje === p.id);
    const tum = items.filter(
      (i) => i.onem.kapsam !== "taha" && projeBul(i, dmap) === p.id
    );
    const kodsuz = items.filter(
      (i) => i.renk === "gri" && projeBul(i, dmap) === p.id
    ).length;
    return {
      ...p,
      sayi: gs.length,
      dk: gs.reduce((x, g) => x + g.dk, 0),
      acilisSayi: gs.filter((g) => g.acilis).length,
      biten: tum.filter((i) => i.onayGecerli).length,
      kodsuz,
      baslangic: gs[0]?.baslangic || null,
      bitis: gs.at(-1)?.bitis || null,
      asar: gs.some((g) => Date.parse(g.bitis) > Date.parse(hedef.saat)),
      gorevler: gs,
    };
  });
  const ag = gorevler.filter((g) => g.acilis);
  const acilisPaket = items.filter(
    (i) => acilisNo.has(i.no) && i.renk !== "gri"
  );
  return {
    gruplar,
    sira: gorevler,
    tamamlanan,
    linkler: LINKLER,
    gunBaslangic: GUN_BASLANGIC,
    tahmin: {
      asamalar: gorunen,
      aktif: { ...hedef, sira: aktif + 1 },
      toplam,
      biten,
      simdiYuzde: toplam ? Math.round((100 * biten) / toplam) : 100,
      yuzde:
        Date.parse(hedef.saat) > simdi
          ? yuzdeAt(hedef.saat)
          : Math.round((100 * biten) / Math.max(1, toplam)),
      zamanOrani: Math.round(zamanOrani * 100) / 100,
      hepsiBitti: !bekleyen.length,
      tumBitis: bekleyen.at(-1)?.bitis || null,
      kalanDk: bekleyen.reduce((x, g) => x + g.dk, 0),
    },
    acilis: {
      sayi: ag.length,
      dk: ag.reduce((x, g) => x + g.dk, 0),
      bitis: ag.at(-1)?.bitis || null,
      netBitis: ag.length
        ? new Date(
            simdi + ag.reduce((x, g) => x + g.dk, 0) * 60_000
          ).toISOString()
        : null,
      biten: acilisPaket.filter((i) => i.onayGecerli).length,
      toplam: acilisPaket.length,
      etkiBekleyen: ag.filter((g) => g.tur === "etki").length,
    },
  };
}

async function tahminGuncelle(tetik) {
  const t = { ...tahminVarsayilan(), ...readJson("tahmin.json", {}) };
  const { items } = await paketler();
  const s = await surec().catch(() => null);
  const hiz = hizOlc(items);
  const zaman = new Date().toISOString();
  let degisen = 0;
  const yaz = (k, dk) => {
    t.gorev[k] ??= [];
    const g = t.gorev[k];
    const son = g.at(-1);
    if (son && son.dk === dk) return;
    g.push({ zaman, dk, onceki: son ? son.dk : null });
    degisen++;
  };
  let kalanSen = 0;
  let kalanKritik = 0;
  for (const i of items) {
    if (bekleyenMi(i)) {
      const dk = gorevDk(i, hiz.oran);
      yaz(`p${i.no}`, dk);
      kalanSen += dk;
      if (i.onem.puan >= 75) kalanKritik += dk;
    } else if (i.onayGecerli && t.gorev[`p${i.no}`]) yaz(`p${i.no}`, 0);
  }
  if (s) for (const a of s.adimlar) yaz(a.id, a.kalanDk);
  let planOzet = null;
  try {
    const dmap = await dosyalar();
    const acilis = readJson("acilis.json", null);
    const et = etkilerHesapla(
      items,
      acilis,
      dmap,
      readJson("onaylar.json", {})
    );
    for (const e of et) if (!e.onayGecerli) yaz(`e${e.no}`, e.dk);
    planOzet = planHesapla(items, et, acilis, dmap);
  } catch (e) {
    console.error("[plan]", e);
  }
  t.gecmis.push({
    zaman,
    tetik,
    kalanSen,
    kalanKritik,
    yuzde: planOzet?.tahmin.yuzde ?? null,
    hedefAd: planOzet?.tahmin.aktif.ad ?? null,
    acilisDk: planOzet?.acilis.dk ?? null,
    surecDk: s?.toplamKalanDk ?? null,
    surecBitis: s?.adimlar.at(-1)?.tahminiBitis ?? null,
    hiz: hiz.oran,
    olcum: hiz.olcum,
    ortDk: hiz.ortDk,
    kontrolEdilen: items.filter((i) => i.onayGecerli).length,
    degisen,
  });
  writeJson("tahmin.json", t);
  return t;
}
let tahminSuruyor = false;
async function tahminZamanla() {
  if (tahminSuruyor) return;
  const t = readJson("tahmin.json", tahminVarsayilan());
  const son = Date.parse(t.gecmis?.at(-1)?.zaman || 0);
  if (Date.now() - son < SAATLIK) return;
  tahminSuruyor = true;
  try {
    await tahminGuncelle(t.gecmis?.length ? "saatlik" : "ilk");
  } catch (e) {
    console.error("[tahmin]", e);
  } finally {
    tahminSuruyor = false;
  }
}
setInterval(tahminZamanla, 60_000);
setTimeout(tahminZamanla, 2_000);

function tahminOzet() {
  const t = { ...tahminVarsayilan(), ...readJson("tahmin.json", {}) };
  const son = t.gecmis.at(-1)?.zaman || null;
  return {
    hedef:
      (t.asamalar || ASAMALAR).find((a) => Date.parse(a.saat) > Date.now())
        ?.saat || t.hedef,
    son,
    sonraki: son ? new Date(Date.parse(son) + SAATLIK).toISOString() : null,
    gecmis: t.gecmis,
    gorev: t.gorev,
  };
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};
const send = (res, code, body, type = "application/json; charset=utf-8") => {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(
    typeof body === "string" || Buffer.isBuffer(body)
      ? body
      : JSON.stringify(body)
  );
};
const body = (req) =>
  new Promise((r) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => {
      try {
        r(JSON.parse(s || "{}"));
      } catch {
        r({});
      }
    });
  });

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === "/" || p === "/index.html")
      return send(
        res,
        200,
        readFileSync(join(HERE, "index.html")),
        MIME[".html"]
      );
    if (p.startsWith("/kontrol-gorsel/")) {
      const f = normalize(join(KONTROL, p.slice("/kontrol-gorsel/".length)));
      if (!f.startsWith(KONTROL) || !existsSync(f))
        return send(res, 404, "yok", "text/plain");
      return send(
        res,
        200,
        readFileSync(f),
        MIME[extname(f)] || "application/octet-stream"
      );
    }
    if (p === "/api/dogrulama" && req.method === "GET") {
      const d = await paketler();
      const dmap = await dosyalar();
      const acilisJ = readJson("acilis.json", null);
      const etkiler = etkilerHesapla(
        d.items,
        acilisJ,
        dmap,
        readJson("onaylar.json", {})
      );
      const plan = planHesapla(d.items, etkiler, acilisJ, dmap);
      for (const i of d.items) i.proje = projeBul(i, dmap);
      return send(res, 200, {
        ...d,
        etkiler,
        plan,
        projeler: PROJELER,
        kapilar: readJson("kapilar.json", []),
        acilis: readJson("acilis.json", null),
        tahmin: tahminOzet(),
        guncel: new Date().toISOString(),
      });
    }
    if (p === "/api/surec" && req.method === "GET")
      return send(res, 200, await surec());
    let m = p.match(/^\/api\/dogrulama\/(\d+)\/rapor$/);
    if (m)
      return send(res, 200, { markdown: sonTur(Number(m[1]))?.markdown || "" });
    m = p.match(/^\/api\/dogrulama\/(\d+)\/onay$/);
    if (m && req.method === "POST") {
      const b = await body(req);
      const onaylar = readJson("onaylar.json", {});
      if (b.imza)
        onaylar[m[1]] = {
          imza: String(b.imza),
          durum: b.durum === "sorun" ? "sorun" : "tamam",
          not: String(b.not || "").slice(0, 2000),
          tarih: new Date().toISOString(),
        };
      else delete onaylar[m[1]];
      writeJson("onaylar.json", onaylar);
      return send(res, 200, { ok: true });
    }
    m = p.match(/^\/api\/etki\/(\d+)\/onay$/);
    if (m && req.method === "POST") {
      const b = await body(req);
      const onaylar = readJson("onaylar.json", {});
      const k = `e${m[1]}`;
      if (b.imza)
        onaylar[k] = {
          imza: String(b.imza),
          durum: b.durum === "sorun" ? "sorun" : "tamam",
          not: String(b.not || "").slice(0, 2000),
          tarih: new Date().toISOString(),
        };
      else delete onaylar[k];
      writeJson("onaylar.json", onaylar);
      return send(res, 200, { ok: true });
    }
    if (p === "/api/yenile" && req.method === "POST") {
      gh.at = 0;
      surecCache.at = 0;
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: "yok" });
  } catch (e) {
    send(res, 500, { error: String(e) });
  }
}).listen(PORT, "127.0.0.1", () =>
  console.log(`[dogrulama] http://localhost:${PORT} — repo: ${REPO}`)
);
