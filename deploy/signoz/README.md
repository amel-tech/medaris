# SigNoz on Coolify

The observability stack the Medaris apps send their traces, metrics and logs
to. Coolify application `signoz` (uuid `ogwc4g0kwko40wss884kow4c`) on mdrs3
deploys this directory. Until this move it deployed a personal fork,
`zahidcakici/signoz` (branch `main`, base directory `/deploy/docker`), pinned
at SigNoz v0.91.0 with collector v0.128.2: the defaults of that file's
`${VERSION:-v0.91.0}` and `${OTELCOL_TAG:-v0.128.2}`. Checked on 2026-10-12:
the application sets neither in Coolify (its only variables are Coolify's own
`SERVICE_FQDN_*` and `SERVICE_URL_*`), and `/api/v1/version` answers
`v0.91.0`.

This directory carries the stack at **SigNoz v0.143.0** and the path from
v0.91.0 to it. Nothing here deploys itself: Coolify settings change by hand,
in the order of [Moving the Coolify application](#moving-the-coolify-application).

## Files

| Path | What it is |
| --- | --- |
| `docker-compose.coolify.yaml` | The stack Coolify runs: SigNoz v0.143.0, collector v0.144.11, ClickHouse 25.12.5, ZooKeeper 3.7.1. |
| `docker-compose.step1-v0.92.1.yaml` … `step5-v0.135.0.yaml` | One compose per mandatory upgrade stop between v0.91.0 and v0.143.0. Used once, in order. |
| `docker-compose.rollback-v0.91.0.yaml` | The fork's stack, deployable from here. Only together with the volume backup. |
| `config/` | Configs mounted by the final compose and by steps 4 and 5. Derived from `upstream/pours/`. |
| `legacy/` | The fork's configs, byte-identical to upstream SigNoz at v0.91.0, plus upstream's v0.129.0 collector config. Used by steps 1 to 5 and the rollback compose only. |
| `upstream/` | Upstream's layout at the target version: our `casting.yaml` and what Foundry forged from it. Reference only; nothing mounts it. |
| `local/compose.sh` | Runs any of the compose files locally the way Coolify does. |

Once the production upgrade is done and has run for a while, the step files,
the rollback file and `legacy/` can be deleted.

## What runs

| Service | Image | Role | Limit (memory / CPU) | Measured on mdrs3 at v0.91.0 |
| --- | --- | --- | --- | --- |
| `clickhouse` | `clickhouse/clickhouse-server:25.12.5` | Telemetry store, volume `clickhouse` | 2560m / 2 (owner-approved) | 1.25 GiB, 116 % CPU |
| `zookeeper-1` | `signoz/zookeeper:3.7.1` | ClickHouse coordination (replicated tables, `ON CLUSTER` DDL), volume `zookeeper-1` | 512m / 0.5, heap 256 MB | 170 MiB |
| `signoz` | `signoz/signoz:v0.143.0` | UI, API, alerting; users, dashboards and alerts in SQLite on volume `sqlite` | 1g / 1 | 94 MiB |
| `otel-collector` | `signoz/signoz-otel-collector:v0.144.11` | OTLP receiver on 4317 (gRPC) and 4318 (HTTP), host ports on 127.0.0.1 only; 4318 behind `otlp.medaris.net` for `OTLP_ALLOWED_SOURCES` only; writes to ClickHouse | 768m / 1 | 70 MiB |
| `signoz-telemetrystore-migrator` | `signoz/signoz-otel-collector:v0.144.11` | One-shot ClickHouse schema migrations, every deploy | 256m / 0.5 | — |
| `init-clickhouse` | `clickhouse/clickhouse-server:25.12.5` | One-shot: downloads the `histogramQuantile` UDF binary into volume `user-scripts` | 256m / 0.5 | — |

The limits for the services other than ClickHouse are three to eight times
what each used on mdrs3 (the brief's measurement, 2026-10-12): ZooKeeper's JVM
and the collector's 50 000-span batches can grow well past their idle size, and
a limit only caps, it reserves nothing. ZooKeeper's heap is cut from upstream's
1024 MB to 256 MB so that it fits its limit; bitnami's image uses the value for
both `-Xms` and `-Xmx`, and with 1024 MB the local v0.91.0 stack's ZooKeeper
sat at 780 MiB. Locally, after the upgrade with a small load, `docker stats`
read: ClickHouse 898 MiB, signoz 133 MiB, collector 153 MiB, ZooKeeper
182 MiB.

ClickHouse sizes its own memory ceiling from the container limit, so no
setting is needed. Its log says, on 24.1.2, 25.5.6 and 25.12.5 alike:
`max_server_memory_usage ... 2.25 GiB (2.50 GiB available memory * 0.90
max_server_memory_usage_to_ram_ratio)`.

ClickHouse 25.x costs more CPU when idle than 24.1. Measured locally on empty
servers capped at 2 CPUs (cgroup CPU time over 60 s): 24.1.2 about 11 %, 25.5.6
about 70 %, 25.12.5 with upstream's config 82 %. Most of it is the global
sampling profiler, on by default since 25.x
(`global_profiler_real_time_period_ns` and `..._cpu_time_period_ns`, every
thread every 10 s); with both set to 0, side by side, the same server used
31 %. Both are 0 in our config (set in `upstream/casting.yaml`, so the forged
config carries them). They only feed `system.trace_log`, which SigNoz does not
read. With the whole stack upgraded and idle, ClickHouse used 47 % (60 s)
locally with the override and 96 % (30 s) without it; the v0.91.0 stack's
ClickHouse 24.1.2 used 7 % (30 s). mdrs3 has 4 cores; the stack's CPU there is
not measured.

## Coolify adaptations

The fork's ten commits change no upstream file: `common/clickhouse/*` and
`common/signoz/*` are byte-identical copies of upstream's `deploy/common` at
the fork point, moved under `deploy/docker` because Coolify can only mount
files inside the base directory. Its only own file is
`docker-compose.coolify.yaml`, and its differences from upstream's compose are
what this directory carries forward:

| Fork adaptation | Why | Here |
| --- | --- | --- |
| `common/` copied into the base directory, `../common` → `./common` | Coolify copies only the base directory to the server and resolves `./` against it (`/data/coolify/applications/<uuid>/`). | Kept: every bind source is under `deploy/signoz`. |
| YAML anchors and `!!merge <<:` expanded | Coolify's parser does not expand merge keys. | Kept: no anchors anywhere. |
| Bind mounts in long syntax, `is_directory: true` on directories | Coolify creates a missing bind source and, when it cannot tell, makes it a directory. | Kept for `legacy/dashboards` (steps 1–2, rollback). The `user_scripts` bind directory became a named volume, as upstream has it now, so no other directory is bound. |
| `exclude_from_hc: true` on one-shot services | An exited one-shot container would otherwise mark the application unhealthy. | Kept on `init-clickhouse` and the migrator(s). |
| SigNoz published on host port 8081, not 8080 | Coolify's proxy holds host port 8080. | Dropped: no file publishes the UI. Coolify's proxy reaches container port 8080 over the stack's network and serves it behind the domain's TLS; nothing else needs a host port. `local/ui-port.yaml` publishes it for local runs only, on loopback (`127.0.0.1:8081`). || `signoz-net` network made external, then reverted | — | Nothing to carry. |

Coolify deletes `exclude_from_hc` and `is_directory` before it runs Docker
Compose, and plain Docker Compose rejects them; `local/compose.sh` deletes them
the same way. Coolify also replaces `container_name` with a name of its own
built from the service name and the application uuid (per Coolify's source;
not looked at on mdrs3), so the names in the compose files only apply locally.

Dropped, because upstream no longer needs them: the `signoz` service's
`--config=/root/config/prometheus.yml`, the `prometheus.yml` and `dashboards`
mounts and the `DASHBOARDS_PATH`, `STORAGE`, `GODEBUG`, `TELEMETRY_ENABLED`,
`DEPLOYMENT_TYPE`, `DOT_METRICS_ENABLED` variables (removed upstream at
v0.113.0); the two `signoz-schema-migrator` services (replaced by the
collector's `migrate` command at v0.113.0); the collector's
`--feature-gates=-pkg.translator.prometheus.NormalizeName` (removed upstream);
the `signoz.io/scrape` labels (nothing here scrapes them, and the new
ClickHouse config has no Prometheus endpoint); `tty: true` on ClickHouse.
`bitnami/zookeeper:3.7.1` is replaced by `signoz/zookeeper:3.7.1`: Docker Hub
no longer serves the bitnami tag, and the replacement has the same manifest
digest as `bitnamilegacy/zookeeper:3.7.1`
(`sha256:fcc4a3288154ccaa3bdb5ae6dc10180c084d29a8a6a26b62ac8e30a8940dc2e6`).

Volumes keep their keys, `clickhouse`, `sqlite` and `zookeeper-1`. Coolify
names a volume `<uuid>_<key>` and ignores the `name:` in the file, so these
keys are what ties the application to its data. One volume is new,
`user-scripts` (the `histogramQuantile` binary, re-downloaded on every deploy).

No file holds a secret. The final stack needs one, ClickHouse's password,
which Coolify generates ([ClickHouse password](#clickhouse-password)). It
needs no signing secret: since v0.143.0 login sessions are opaque tokens
stored in SQLite (measured: the token is 32 characters, not a JWT).

### JWT secret

The step files and the rollback file need one Coolify variable,
`SIGNOZ_JWT_SECRET`, and refuse to start without it (`${SIGNOZ_JWT_SECRET:?…}`).
Up to v0.142 SigNoz signs login sessions as JWTs with this key; started
without one, it logs `🚨 CRITICAL SECURITY ISSUE: No JWT secret key
specified!`. Locally, with the variable set, every step refused a token that
was not signed with it (401). Generate the value once (`openssl rand -hex 32`)
and keep it in Coolify. The final file does not use it; the rollback file does.

### ClickHouse password

The final file gives ClickHouse's `default` user a password, from the Coolify
variable `SERVICE_PASSWORD_CLICKHOUSE`. Nothing to set by hand: Coolify creates
a value for every `SERVICE_PASSWORD_<ID>` the compose file names when it parses
the file (*Reload Compose File*), keeps it across deployments and lists it
under *Environment Variables*. Its documentation describes the value as a
"Random password without symbols", 32 characters; its generator
(`Str::password(symbols: false)`, read in Coolify's source on 2026-10-13, not
on mdrs3's Coolify version) draws from `a-z`, `A-Z` and `0-9` only, so the
value goes into the DSNs below without URL-encoding. A value set by hand must
keep to letters and digits for the same reason.

- ClickHouse reads it as `CLICKHOUSE_PASSWORD`: the `default` user's
  `password` carries `"@from_env": CLICKHOUSE_PASSWORD` in
  `config/clickhouse/config-0-0.yaml`, the YAML form of XML's
  `<password from_env="CLICKHOUSE_PASSWORD"/>`.
- The migrator, `signoz` and the collector's `migrate sync check` connect with
  `tcp://default:${SERVICE_PASSWORD_CLICKHOUSE}@clickhouse:9000`; the
  collector's exporters read it as `${env:CLICKHOUSE_PASSWORD}` in
  `config/ingester/ingester.yaml`.
- Without the variable Docker Compose refuses to start the final file
  (`${SERVICE_PASSWORD_CLICKHOUSE:?…}`), because ClickHouse alone would log
  `Env variable is not set: CLICKHOUSE_PASSWORD` and fall back to an empty
  password (measured on 25.12.5). Steps 4 and 5 mount the same config without
  the variable, so there `default` keeps the empty password of the earlier
  steps; the password starts with the final file.
- `clickhouse-client` inside the ClickHouse container reads the container's
  `CLICKHOUSE_PASSWORD`, so the `docker exec … clickhouse-client` commands in
  this file need no `--password`.
- `networks` for `default` admits loopback and the private ranges only
  (`::1`, `127.0.0.1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`,
  `fc00::/7`). Docker assigns the stack's addresses at deploy time from its
  private pools, so a single subnet cannot be named; the ranges cover them and
  refuse anything else. ClickHouse publishes no port either. Measured with
  25.12.5 on 2026-10-13: a client on a 172.31.250.0/24 network signed in; one
  on 100.64.250.0/24 was refused with the right password (516).
- The cluster's one replica (`remote_servers.cluster`) connects as `default`
  with the same password. A query that goes through the network to it
  (`clusterAllReplicas(...)` with `prefer_localhost_replica = 0`) answered on
  25.12.5 with it; without it such a query fails with 516. Ordinary traffic
  uses the local replica and never needed it.
- ClickHouse writes its resolved config, password included, to
  `preprocessed_configs/` on the `clickhouse` volume. A [backup](#backup) taken
  after the final step therefore holds the password; keep backups as private
  as the Coolify variable.

### OTLP endpoint

The apps send OTLP over HTTP (`http/protobuf`) to `https://otlp.medaris.net`,
port 443: the collector's Coolify domain (service `otel-collector`, see
[Moving the Coolify application](#moving-the-coolify-application)). Coolify's
proxy, Traefik, terminates TLS and forwards to the collector's OTLP/HTTP
receiver on container port 4318 over the stack's network. Each app's endpoint
and protocol are its own Coolify settings; changing them is a separate step,
not part of this directory.

**Allow-list.** The domain serves only the addresses in the Coolify variable
`OTLP_ALLOWED_SOURCES`: the servers the apps run on, mdrs1 and mdrs2. Any
other client gets `403 Forbidden` from Traefik, and its request does not reach
the collector.

- Format: IPv4 or IPv6 addresses or CIDR ranges, comma-separated, no spaces,
  for example `192.0.2.10/32,198.51.100.20/32` (documentation addresses; the
  real ones live in Coolify only). A bare address is a single host. The
  addresses are the ones mdrs3 sees the servers connect from, their public
  outgoing addresses.
- Every compose file here refuses to start without it (`required variable
  OTLP_ALLOWED_SOURCES is missing a value`). Nothing falls back to allowing
  everyone.
- Coolify's *Escape special characters in labels?* (application, General) must
  be off. It is on by default, and then Coolify writes every `$` in a label as
  `$$`, so Compose hands `${OTLP_ALLOWED_SOURCES…}` to Traefik as literal text.
  Traefik rejects that middleware and disables both routers that use it: the
  domain answers 404 to everyone, closed but useless (measured, below).

The labels on `otel-collector`, identical in every compose file:

| Labels | What they do |
| --- | --- |
| middleware `signoz-otlp-allowlist` | Traefik's `ipAllowList`, `sourceRange` from the variable. Coolify adds every middleware defined in a service's labels to the HTTPS router it generates for that service's domain, so Coolify's own router carries it too. |
| router `signoz-otlp` | `Host(otlp.medaris.net)` on Coolify's `https` entrypoint, TLS from the `letsencrypt` resolver like Coolify's routers, the allow-list, and the collector's port 4318. Priority 100: Coolify sets none, so Traefik ranks its routers by rule length (43 for this domain), and `signoz-otlp` takes every HTTPS request for the domain. |
| router `signoz-otlp-http` | The same host on port 80, priority 100, only Coolify's `redirect-to-https` (307). Port 80 never forwards to the collector, whatever the application's *Force HTTPS* setting. |

Why a router of our own and not only the middleware on Coolify's router:

- Coolify takes the target port from the domain (`https://otlp.medaris.net:4317`
  becomes `loadbalancer.server.port=4317`, the gRPC receiver) and Traefik
  talks plain HTTP/1.1 to it, which a gRPC server does not accept. Locally,
  a router built that way answered an OTLP/HTTP `POST /v1/traces` with 500
  and the collector received nothing; the same router with `:4318` answered
  200.
  `signoz-otlp` fixes the port in this file, whatever the domain field says.
- Coolify v4.1.1 puts label middlewares on its HTTPS router only. Its port-80
  router redirects while *Force HTTPS* is on (the default) and forwards
  without the allow-list when it is off. `signoz-otlp-http` takes that choice
  away.

That a `POST /v1/traces` through the domain answered 200 on 2026-10-12 is not
explained by Coolify's source for a domain ending in `:4317`; the labels of the
running container on mdrs3 were not looked at.

Source read on 2026-10-13, at Coolify's tag v4.1.1 and on its `main`:
`applicationParser` (`bootstrap/helpers/parsers.php`) keeps the labels of the
compose file, appends `defaultLabels` (both escaped when the setting above is
on), then the output of `fqdnLabelsForTraefik` (`bootstrap/helpers/docker.php`),
which names the routers `https-0-<uuid>-otel-collector` and
`http-0-<uuid>-otel-collector` (on `main` the service name gains a hash
suffix), sets entrypoints `https` and `http`, `tls.certresolver=letsencrypt`,
no priority, and on the HTTPS router the middlewares `gzip` plus every one it
finds in the service's labels. mdrs3 ran Coolify 4.1.1 on 2026-10-12 (the
version Coolify stamps on the environment variables it creates), and its
proxy configuration names `traefik:v3.1`, detected as 3.1.7 (Coolify API,
read on 2026-10-12); Coolify v4.1.1 itself starts a new proxy on
`traefik:v3.6`. Every Traefik 3 has `ipAllowList`.

**Client address.** Traefik checks the address of the TCP connection: with no
`ipStrategy`, `X-Forwarded-For` is not consulted, so a client cannot claim
another address. That is the client's own address because
`otlp.medaris.net` resolves straight to mdrs3 and Coolify's Traefik is the
first hop; Docker's NAT rules for the published port 443 keep the IPv4 source
address. None of this was checked on mdrs3, nor these two limits:

- Over IPv6, if the proxy's Docker network has no IPv6, Docker's userland
  proxy accepts the connection and Traefik sees a Docker gateway address,
  which the allow-list refuses. This only matters if the domain gets an AAAA
  record.
- If anything is ever put in front of Traefik (a CDN, a load balancer, a
  tunnel), every request arrives from that hop. The middleware would then need
  `ipstrategy.depth=1` (the address the hop appends to `X-Forwarded-For`),
  and Coolify's proxy configuration would have to trust that header from the
  hop's addresses only (`forwardedHeaders.trustedIPs` on the entrypoint):
  Traefik deletes `X-Forwarded-For` from untrusted peers, and with an empty
  header every request would be refused.

**Measured locally** on 2026-10-13, with Traefik 3.1.7 and 3.6.11 run with
mdrs3's proxy flags (its self-signed default certificate instead of Let's
Encrypt), the real collector image with a minimal OTLP-to-debug config, and
the collector's labels as Coolify v4.1.1's source assembles them for this
domain, ours included. Clients on 203.0.113.0/24 connected to Traefik
directly. Both versions behaved the same:

- `OTLP_ALLOWED_SOURCES=203.0.113.21/32`: from .21, `POST /v1/traces` answered
  200 and the span showed up in the collector's output; from .22 and .23, 403,
  nothing in the collector, and Traefik logged `Rejecting IP`. Over port 80
  both got a 307 to HTTPS and nothing reached the collector.
- `203.0.113.21/32,203.0.113.23/32`: .23 got 200, .22 got 403; .21 got 504,
  see the next paragraph.
- Escaping on: Traefik disabled both routers (`cannot parse CIDRs`), every
  client got 404 and nothing reached the collector; port 80 still redirected.
- Without the variable, `docker compose up` exited 1 and created nothing, and
  `docker compose config` failed the same way for each of the seven files.

**Not addressed here.** Coolify attaches every service to the application's
network (named after its uuid) besides the file's `signoz-net`, and its proxy
joins only the former. With two networks and no `traefik.docker.network`
label, Traefik picks one of a container's addresses at random, per service,
each time it rebuilds its configuration (any container event on the host).
Locally the services sometimes pointed at the `signoz-net` address, which the
proxy cannot reach, and those requests got 504 after the allow-list had let
them through. The same holds for `monitoring.medaris.net` and held for the
fork's stack. A `traefik.docker.network` label naming the application's
network on `otel-collector` and `signoz` would pin the address; that is left
for a separate change.

Every compose file here binds the collector's host ports 4317 (gRPC) and 4318
(HTTP) to 127.0.0.1; they stay only for tooling on mdrs3, such as sending a
test span. Observed on 2026-10-13: tedris-web's OTLP export logs
`ECONNREFUSED`, and tedrisat logs "OpenTelemetry is disabled"; the other apps
were not checked. Once the apps' endpoints are settled and nothing on mdrs3
needs the loopback ports, they can be dropped.

## Upstream reference

SigNoz stopped shipping `deploy/docker` at v0.130.0 (deprecated in favour of
[Foundry](https://github.com/SigNoz/foundry), see upstream's
`deploy/MIGRATION.md`). The last upstream compose is v0.129.0's. Upstream's
layout at the target version is therefore what Foundry generates:
`upstream/casting.yaml` is the casting upstream's migration guide gives for a
legacy Compose install (SQLite metastore, ZooKeeper keeper, the old ClickHouse
macros `shard: "01"`, `replica: example01-01-1`, the old volume names, ZooKeeper
as root), with every image pinned and one override of ours (the profiler
settings below), and `upstream/pours/` is foundryctl v0.3.0's output for it,
unedited.

`docker-compose.coolify.yaml` and `config/` differ from `upstream/pours/` in:

- service names `clickhouse`, `zookeeper-1`, `signoz`, `otel-collector` (Foundry:
  `signoz-telemetrystore-clickhouse-0-0`, …), because Coolify keys the domains
  by service name; `config/` is `pours/` with exactly those three host names
  replaced and the password lines below (`sed` below);
- [ClickHouse password](#clickhouse-password): the `default` user's password
  read from the environment, its network limit and the cluster replica's
  credentials in `config/clickhouse/config-0-0.yaml`, user and
  password in the five exporter DSNs of `config/ingester/ingester.yaml`, and
  in the DSNs of the compose file;
- the OTLP host ports bound to 127.0.0.1 and the proxy labels on
  `otel-collector` ([OTLP endpoint](#otlp-endpoint));
- volume keys `clickhouse`, `sqlite`, `zookeeper-1` (see above);
- Coolify adaptations, resource limits, ZooKeeper heap;
- the two global profiler settings above (in the casting, so also in `pours/`);
- `LOW_CARDINAL_EXCEPTION_GROUPING=false` and `OTEL_RESOURCE_ATTRIBUTES` on the
  collector, `SIGNOZ_ALERTMANAGER_PROVIDER=signoz` on signoz, as the fork had;
  `depends_on: clickhouse` on signoz and the migrator, as upstream's last
  compose had.

Changes the move to upstream's current config brings, compared with the
fork: ClickHouse logs to the console (Docker rotates it at 3 × 50 MB) instead of
up to 10 × 1000 MB of files inside the container; ClickHouse's system log
tables get a one-day TTL; the collector batches up to 50 000 spans every 5 s
instead of 10 000 every 10 s; span metrics carry four dimensions instead of
fourteen (`host.name`, `container.name`, `k8s.*`, `browser.*` are no longer
span-metric dimensions); the collector no longer scrapes its own metrics into
ClickHouse.

## Upgrade path

Upstream's [upgrade path tool](https://signoz.io/upgrade-path/) lists these
mandatory stops after v0.91.0: v0.92.0, v0.94.0, v0.113.0, v0.131.0, v0.135.0,
v0.143.0. Skipping a stop is not supported, so this is five intermediate
deploys and the final one. Each stop has its own compose file, fully pinned.

| Step | Compose file | SigNoz | Collector / migrator | ClickHouse | What happens |
| --- | --- | --- | --- | --- | --- |
| 1 | `docker-compose.step1-v0.92.1.yaml` | v0.92.1 | v0.129.0 (schema-migrator) | 24.1.2 | Query builder v5; dashboards, alerts and saved views migrated in SQLite. |
| 2 | `docker-compose.step2-v0.94.0.yaml` | v0.94.0 | v0.129.4 (schema-migrator) | **25.5.6** | ClickHouse upgrade, required before v0.94.0 runs. |
| 3 | `docker-compose.step3-v0.113.0.yaml` | v0.113.0 | v0.144.1 (`migrate`) | 25.5.6 | Schema migrator image retired; one `signoz-telemetrystore-migrator`. |
| 4 | `docker-compose.step4-v0.131.0.yaml` | v0.131.0 | v0.144.5 | **25.12.5** | ClickHouse upgrade, required before newer collectors; config switches to `config/clickhouse` (YAML). |
| 5 | `docker-compose.step5-v0.135.0.yaml` | v0.135.0 | v0.144.6 | 25.12.5 | Dashboards converted to the v2 schema; the v1 dashboard API is retired. |
| 6 | `docker-compose.coolify.yaml` | **v0.143.0** | v0.144.11 | 25.12.5 | Collector gets `signozspanmapper` and `signozllmpricing`; sessions become opaque tokens, every user signs in once more. |

Upstream pins no collector for v0.131.0 and v0.135.0 (its compose files were
gone by then and Foundry defaults to `latest`); steps 4 and 5 use the newest
collector released before each, and the collector config of step 3, because
the final config needs processors only v0.144.6+ ships. Up to v0.129.0 every
pairing is upstream's own compose. Foundry's compatibility rules hold at every
step: a collector newer than v0.144.5 needs ClickHouse 25.12.5, and SigNoz
v0.143.0 or newer needs collector v0.144.6 or newer.

ZooKeeper stays. Foundry's default is ClickHouse Keeper, but upstream's
migration guide keeps ZooKeeper for existing installs, and the `zookeeper-1`
volume matters more after this upgrade than before. The fork's schema migrator
ran without replication, so at v0.91.0 no SigNoz table is replicated (measured:
0) and ZooKeeper only carries the `ON CLUSTER` DDL queue. The `migrate`
command that replaces it defaults to replication on (upstream's v0.113.0
compose sets it explicitly), so the tables created from step 3 on are
`Replicated*`: 13 after the upgrade, measured, whose metadata lives in
ZooKeeper. Moving to Keeper would need `clickhouse-keeper-converter`; not
needed for this upgrade.

ClickHouse renames a system log table whose structure changed and starts a new
one; after the upgrade tables such as `system.query_log_0` and
`system.query_log_1` (7 and 12 of them in the two local runs) hold the old
rows, without the new one-day TTL. The old config set no TTL on them, so on
mdrs3 they may be large; not measured. See
[After the upgrade](#after-the-upgrade).

Why v0.143.0: the brief asks for the newest release at least two weeks old.
On 2026-10-12 that is v0.143.0 (2026-09-23), not v0.142.1; v0.144.0
(2026-09-29) is 13 days old. v0.143.0 is also a mandatory stop, so stopping at
v0.142.1 would only move this stop into the next upgrade.

### What was proven locally

Two full runs on this machine (Docker 29.8.2, Compose 5.6.0) on 2026-10-12,
on the same named volumes throughout. Run 2 used the files as committed then,
before the ClickHouse password and the loopback ports (item 6 below); run 1
differed only in not yet having the profiler override.

1. **Old stack**: the fork's `docker-compose.coolify.yaml` as it is, with
   Coolify's keys removed (as Coolify does) and `bitnami/zookeeper:3.7.1`
   swapped for `bitnamilegacy/zookeeper:3.7.1` (same digest; the bitnami tag
   is gone). SigNoz v0.91.0, collector and schema migrator v0.128.2,
   ClickHouse 24.1.2.5; the fresh install took 964 s. Data put in:
   telemetrygen v0.135.0 over OTLP gRPC to `otel-collector:4317`, 300 spans,
   200 logs and 120 points of `proof_old_metric` (service `proof-old`); through
   the API an admin (registered), a second user (invited as viewer, accepted),
   one dashboard, one alert rule.
2. **Backup**: stack `down` (volumes kept), the [Backup](#backup) loop, 16 s.
3. **Steps 1 to 5 and the final file**, each `up -d` over the previous one
   without a `down`, as Coolify deploys. Seconds until every service was
   healthy or running and every one-shot container had exited 0:

   | Step | 1 | 2 | 3 | 4 | 5 | final |
   | --- | --- | --- | --- | --- | --- | --- |
   | Run 1 | 286 | 325 | 210 | 129 | 388 | 246 |
   | Run 2 | 356 | 329 | 192 | 217 | 397 | 169 |

   Run 2 took 1867 s from the restore of the backup to the settled final
   stack. After every step: the collector had not restarted; the admin
   signed in with the password set on v0.91.0; both users, the dashboard and
   the alert were listed; ClickHouse held the 300 spans, 200 logs and 120
   points; a token not signed with the configured secret was refused (401);
   ClickHouse's ceiling was 2.25 GiB.
4. **On v0.143.0**: new telemetry (`proof-new`, same amounts) arrived. Through
   SigNoz's own query API (`/api/v5/query_range`), old and new: traces 300 and
   300, logs 200 and 200, metric points 120 and 120 (the new metric showed up
   about a minute after it was sent). The dashboard kept its id and was
   converted (`converted dashboards from v1 to v2 … migrated 1, failed 0`);
   both users signed in with their v0.91.0 passwords, and the admin's session
   token was a 32-character opaque one, not a JWT. Logs: no `unknown type`
   from the collector; two ERROR lines from signoz (no enterprise licence;
   the Prometheus engine's active-query log directory) and one from the
   collector (an OpAMP deprecation notice), none of them about the upgrade.
5. **Rollback** (after run 1): stack `down`, the restore loop from
   [Rollback](#rollback), `docker-compose.rollback-v0.91.0.yaml` up: v0.91.0
   on ClickHouse 24.1.2.5 with the users, dashboard, alert and the `proof-old`
   telemetry, and nothing sent after the backup.
6. **Password and loopback ports** (2026-10-13): the final file as committed
   now, once, on fresh volumes with a throwaway `SERVICE_PASSWORD_CLICKHOUSE`
   of 32 letters and digits; not over the upgrade path, and steps 1 to 5 were
   not run again. Settled after 494 s: ZooKeeper, `init-clickhouse` and
   ClickHouse within 51 s, signoz healthy at 74 s, the collector past its
   sync check at 468 s, the migrator exited 0 at 494 s; no container
   restarted. The host listened on 127.0.0.1 only (4317, 4318, 8081);
   `/api/v1/health` answered `{"status":"ok"}`; after the first sign-up (see
   [Running it locally](#running-it-locally)) an OTLP/HTTP span posted to
   127.0.0.1:4318 was in `signoz_traces.distributed_signoz_index_v3` 6 s
   later. ClickHouse's `system.session_log` showed logins from signoz, the
   collector and the migrator, and no failed login other than the deliberate
   ones: without the password, `clickhouse-client` from another container and
   inside the ClickHouse container (variable removed) got `Authentication
   failed` (code 516), the HTTP interface 401. The password was in no
   container log, not in the collector's OpAMP copy of its config (which keeps
   `${env:CLICKHOUSE_PASSWORD}`) and not on the SQLite volume. With the same
   ClickHouse config and no variable, as steps 4 and 5 mount it, ClickHouse
   started and accepted `default` without a password.

Not proven locally: anything Coolify does (source switch, volume names,
domains, Traefik and TLS in front of 8080, generating
`SERVICE_PASSWORD_CLICKHOUSE`), the duration of the migrations on production's
data, and resource use on mdrs3. The OTLP domain's routing and allow-list were
tested against Traefik with the labels Coolify's source generates, not through
Coolify ([OTLP endpoint](#otlp-endpoint)).

## Moving the Coolify application

All in the Coolify UI of application `signoz`, nothing on the command line
except the backup.

1. **Check two settings before anything else.**
   - *Preserve Repository During Deployment* must be enabled. Without it
     Coolify does not copy the repository to the server and every bind mount
     (`config/…`, `legacy/…`) becomes an empty directory. The fork's stack only
     works with it, so it is expected to be on.
   - Note the current *Docker Compose Location* (`/docker-compose.coolify.yaml`)
     and *Base Directory* (`/deploy/docker`) for the rollback.
2. **Back up** (next section). The ClickHouse upgrades rewrite its data in
   place and cannot be undone without the backup.
3. **Variables and one setting**, all before the reload in the next step:
   - add `SIGNOZ_JWT_SECRET` to the application's environment variables,
     value from `openssl rand -hex 32` ([JWT secret](#jwt-secret));
   - add `OTLP_ALLOWED_SOURCES`, the addresses of mdrs1 and mdrs2 in the
     format of [OTLP endpoint](#otlp-endpoint). Coolify does not create it on
     its own: its parser (v4.1.1 and `main`) picks variables up from
     `environment:` only, and this one sits in a label;
   - turn off *Escape special characters in labels?* (General), or Traefik
     never gets the addresses and the domain answers 404.
4. **Source**: repository `https://github.com/amel-tech/medaris`, branch
   `main`, base directory `/deploy/signoz`, Docker Compose location
   `/docker-compose.step1-v0.92.1.yaml`. The repository is public, so the
   source type stays *Public GitHub*. Click *Reload Compose File*.
5. **Domains**, unchanged: service `signoz` → `https://monitoring.medaris.net:8080`,
   service `otel-collector` → `https://otlp.medaris.net:4317`. The service
   names did not change, so Coolify should keep them; check that both are
   still filled in after the reload. The `:4317` only feeds Coolify's own
   router for the collector, which `signoz-otlp` outranks
   ([OTLP endpoint](#otlp-endpoint)).
6. **Persistent storage**: after the reload the list should show the existing
   `ogwc4g0kwko40wss884kow4c_clickhouse`, `…_sqlite` and `…_zookeeper-1` and a
   new `…_user-scripts`. If a volume shows up under any other name, stop: the
   data would not be mounted.
7. **Deploy**, then wait until every service is running and healthy and the
   one-shot containers have exited 0 (checks below). Then set the compose
   location to the next file, *Reload Compose File*, deploy, and so on through
   step 5, and finally `/docker-compose.coolify.yaml`. Before deploying that
   last one, check that *Environment Variables* lists
   `SERVICE_PASSWORD_CLICKHOUSE` with a value: Coolify creates it on the
   reload ([ClickHouse password](#clickhouse-password)). Without it the file
   does not start: Docker Compose refuses it with `required variable
   SERVICE_PASSWORD_CLICKHOUSE is missing a value` (measured locally).
8. Leave the application on `/docker-compose.coolify.yaml`.

After each step, on mdrs3 (Coolify names containers `<service>-<uuid>`; the
exact names on mdrs3 were not looked at, hence the `grep`):

```bash
U=ogwc4g0kwko40wss884kow4c
c() { docker ps -a --format '{{.Names}}' | grep -m1 "^$1-$U"; }
docker ps -a --filter "name=$U" --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
# migrators: Exited (0); clickhouse, zookeeper-1, signoz: Up (healthy); otel-collector: Up
docker logs --tail 20 "$(c schema-migrator-async)"            # steps 1–2
docker logs --tail 20 "$(c signoz-telemetrystore-migrator)"   # steps 3–6
docker exec "$(c clickhouse)" clickhouse-client -q 'SELECT version()'  # step 6: password from the container's environment
```

And the OTLP domain, once from mdrs1 or mdrs2 and once from any other
machine:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{}' https://otlp.medaris.net/v1/traces
# mdrs1, mdrs2: 200 (an empty export; collector v0.144.11 answered it with 200 locally)
# anywhere else: 403
# 404 from everywhere: label escaping is still on; 504: see "Not addressed here" under OTLP endpoint
```

Locally each step settled (every service healthy, every one-shot container
exited 0) within 2 to 7 minutes on almost no data; see the timings above. On
mdrs3 the migrations work on real data and will take longer; not measured.
Telemetry the apps send while a step runs is lost apart from what their
exporters retry.

Step 3 removes the two `schema-migrator-*` services from the file; Coolify
runs `docker compose up -d` without `--remove-orphans`, so their exited
containers stay behind (they did locally). `docker rm` them after step 3.

`VERSION` and `OTELCOL_TAG`, which the fork's file read, are not used here.

## After the upgrade

- Every user signs in once more (opaque sessions since v0.143.0).
- The v1 dashboard API is gone (upstream's v0.135 guide; on v0.143.0
  `/api/v1/dashboards` serves the web UI's HTML, measured). Anything that
  scripted it moves to `/api/v2/dashboards`.
- The renamed system log tables can go once nobody needs them:

  ```bash
  docker exec "$(c clickhouse)" clickhouse-client -q "SELECT name, formatReadableSize(total_bytes) FROM system.tables WHERE database = 'system' AND match(name, '_[0-9]+$')"
  # then, per table: DROP TABLE system.<name>
  ```

- The step files, the rollback file and `legacy/` can be deleted once a
  rollback is no longer wanted (the backup is useless after that anyway).

## Backup

Stop the application in Coolify first (a copy of a running ClickHouse or SQLite
is not consistent), then on mdrs3:

```bash
U=ogwc4g0kwko40wss884kow4c
docker volume ls --filter "name=$U"        # expect ${U}_clickhouse, ${U}_sqlite, ${U}_zookeeper-1
du -sh /var/lib/docker/volumes/${U}_*/_data # free disk must exceed this
B=/root/signoz-backup-$(date +%Y%m%dT%H%M%S)  # one directory per run; note it for a restore
mkdir "$B"                                     # stops here if it already exists
for v in clickhouse sqlite zookeeper-1; do
  docker run --rm -v "${U}_${v}:/v:ro" -v "$B:/backup" alpine:3.20 \
    tar -C /v -czf "/backup/${v}.tar.gz" .
done
ls -lh "$B"
```

Start the application again only by deploying step 1.

## Rollback

Restoring the backup is required: ClickHouse rewrites its data on first start
after an upgrade and upstream does not support going back ("downgrades are not
guaranteed", v0.131 guide), and from step 1 on SQLite carries migrations
v0.91.0 does not know. Proven locally: backup restored with the commands below,
rollback file deployed, v0.91.0 on ClickHouse 24.1.2 served the pre-upgrade
users, dashboard, alert and telemetry.

1. Stop the application in Coolify.
2. Restore the three volumes:

   ```bash
   U=ogwc4g0kwko40wss884kow4c
   B=/root/signoz-backup-YYYYMMDDTHHMMSS   # the directory the backup made
   for v in clickhouse sqlite zookeeper-1; do
     docker run --rm -v "${U}_${v}:/v" -v "$B:/backup:ro" alpine:3.20 \
       sh -c "find /v -mindepth 1 -delete && tar -C /v -xzf /backup/${v}.tar.gz"
   done
   ```

3. Point the application back at the old source: repository
   `https://github.com/zahidcakici/signoz`, branch `main`, base directory
   `/deploy/docker`, compose `/docker-compose.coolify.yaml`; *Reload Compose
   File*; deploy.

   That file still names `bitnami/zookeeper:3.7.1`, which Docker Hub no longer
   serves, and Coolify pulls every image before it starts a deployment. If the
   deployment fails on that pull, keep this repository as the source and set
   the compose location to `/docker-compose.rollback-v0.91.0.yaml` instead: the
   same stack (v0.91.0, collector v0.128.2, ClickHouse 24.1.2) with the
   identical `signoz/zookeeper:3.7.1`.

   The rollback file keeps the collector's host ports on loopback and the
   [OTLP endpoint](#otlp-endpoint) labels, so it needs `OTLP_ALLOWED_SOURCES`
   like the other files. The fork's own file has neither.

## Running it locally

```bash
export SERVICE_PASSWORD_CLICKHOUSE=$(openssl rand -hex 16)   # Coolify's job on the server
export OTLP_ALLOWED_SOURCES=127.0.0.1/32   # every file requires it; no proxy runs locally
deploy/signoz/local/compose.sh docker-compose.coolify.yaml up -d
deploy/signoz/local/compose.sh docker-compose.coolify.yaml ps
# UI on http://127.0.0.1:8081, OTLP on 127.0.0.1:4317 / 4318
deploy/signoz/local/compose.sh docker-compose.coolify.yaml down   # keeps the volumes
```

On fresh volumes the collector opens 4317 and 4318 only once the first user
has signed up (in the UI, or `POST /api/v1/register`): SigNoz hands the collector its pipelines over OpAMP
only when an organisation exists (`cannot create agent without orgId` until
then), and the collector runs without receivers meanwhile. Measured on
2026-10-13: the collector started its pipelines 12 s after the sign-up,
without a container restart.

The volumes are named `signoz-clickhouse`, `signoz-sqlite`,
`signoz-zookeeper-1`, `signoz-user-scripts` locally. `docker volume rm` them to
start from nothing.

## Upgrading next time

1. Find the stops: [signoz.io/upgrade-path](https://signoz.io/upgrade-path/)
   from v0.143.0 to the target, and read each stop's guide.
2. In `upstream/casting.yaml`, bump the image pins (SigNoz, collector,
   ClickHouse), and download the Foundry release of the same week
   (`gh release download <tag> -R SigNoz/foundry -p 'foundry_linux_amd64.tar.gz'`,
   check it against the release's checksums file).
3. Re-forge, offline and without Foundry's usage ledger, from `upstream/`
   (with the binary in `upstream/foundryctl`, not committed):

   ```bash
   docker run --rm --network none --user "$(id -u):$(id -g)" \
     -v "$PWD/foundryctl:/opt/foundryctl:ro" -v "$PWD:/work" -w /work \
     --entrypoint /opt/foundryctl signoz/zookeeper:3.7.1 \
     forge --no-ledger --no-updater -f casting.yaml
   git diff -- pours/
   ```

4. Bring `config/` up to date with our host names and the
   [ClickHouse password](#clickhouse-password) lines, and carry every other
   change in `pours/deployment/compose.yaml` into `docker-compose.coolify.yaml`
   by hand:

   ```bash
   sub='s/signoz-telemetrystore-clickhouse-0-0/clickhouse/g; s/signoz-telemetrykeeper-zookeeper-0/zookeeper-1/g; s/signoz-signoz-0/signoz/g'
   pw='s/^    password: ""$/    password:\n      "@from_env": CLICKHOUSE_PASSWORD/'
   net='s#^      ip: ::/0$#      ip:\n      - ::1\n      - 127.0.0.1\n      - 10.0.0.0/8\n      - 172.16.0.0/12\n      - 192.168.0.0/16\n      - fc00::/7#'
   rep='s/^        port: 9000$/        port: 9000\n        user: default\n        password:\n          "@from_env": CLICKHOUSE_PASSWORD/'
   dsn='s#tcp://clickhouse:9000/#tcp://default:${env:CLICKHOUSE_PASSWORD}@clickhouse:9000/#g'
   P=pours/deployment
   sed "$sub; $pw; $net; $rep" $P/telemetrystore/clickhouse/config-0-0.yaml > ../config/clickhouse/config-0-0.yaml
   cp $P/telemetrystore/clickhouse/functions.yaml ../config/clickhouse/functions.yaml
   sed "$sub; $dsn" $P/ingester/ingester.yaml > ../config/ingester/ingester.yaml
   sed "$sub" $P/ingester/opamp.yaml > ../config/ingester/opamp.yaml
   git diff -- ../config/   # only upstream's changes should show
   ```

   If a `sed` leaves the upstream line unchanged (upstream renamed or moved
   it), the password, the network limit or the replica's credentials are
   missing: carry them over by hand.

5. Prove it locally on a copy of the old stack's data (`local/compose.sh`,
   old file up, telemetry in, new file up, data still there), then deploy
   through Coolify one stop at a time.
