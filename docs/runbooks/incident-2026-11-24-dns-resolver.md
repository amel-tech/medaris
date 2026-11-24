# Incident, 24 November 2026: the servers could not resolve names

A record of what was reported, what was measured and what was changed on the
servers. Nothing in this repository caused it and nothing in it was changed to
fix it: the fix is one line on two hosts, written down here so the next person
does not start from the video player.

Every number below was read off a command's output on the day. What was not
measured is listed at the end, and says so.

## What was reported

On 24 November a customer reported that five or six talebe said the video
stuck while they watched, and in the evening that the complaint continued and
that uploading a video was as slow.

## What it was

The API and the web apps resolve each other and the database by name, and the
hosts asked only Google's two resolvers. A share of those lookups got no
answer, so a request that needed a new connection waited and then failed.

The line in production tedrisat's log:

```text
ERROR (tedrisat): UNEXPECTED_ERROR
  "message": "getaddrinfo EAI_AGAIN postgres.medaris.net"
```

In the web apps it showed as "Görevleriniz okunamadı", "Ders kayıtları
okunamadı" and "Ders yüklenemedi", after a wait of several seconds.

The name itself was sound: `postgres.medaris.net` answered from the four
authoritative servers and from 1.1.1.1, 8.8.8.8 and 9.9.9.9 on every try from
outside. The loss was between the hosts and their resolvers. Twenty pings from
mdrs2 lost 5% to 8.8.8.8, 10% to 9.9.9.9 and none to 1.1.1.1; that sample is
small.

It was not Bunny Stream, whose status page showed Stream and CDN operational
that day, and it was not the day's release: the one production release went out
at 05:31 UTC and the errors were still arriving at 19:44 UTC.

## Where things run

Read from Coolify (`coolify.medaris.net`) on the day:

| Host | Runs |
|---|---|
| mdrs1 | the web apps (production and development) and Keycloak |
| mdrs2 | tedrisat and teskilat (production and development) |
| mdrs3 | Coolify itself, the production Postgres, SigNoz |

## What was changed

One line, in the same file on two hosts, then `netplan apply`. No container was
restarted: they resolve through the host's resolver and picked the change up.

`/etc/netplan/01-netcfg.yaml` on **mdrs2** and on **mdrs1**:

```diff
       nameservers:
-        addresses: [8.8.8.8,8.8.4.4]
+        addresses: [1.1.1.1,1.0.0.1,8.8.8.8]
```

The file as it was is kept on each host at
`/root/01-netcfg.yaml.once-20261124`.

`/etc/docker/daemon.json` does not exist on mdrs2 and was not created. Setting
`dns` there needs a restart of the Docker daemon, which stops every container
on the host, and the measurements below did not call for it.

## Before and after

Times are UTC. mdrs2 was changed at about 19:44:50, mdrs1 at about 19:51:50.

| Measured | Before | After |
|---|---|---|
| Production tedrisat, `UNEXPECTED_ERROR` lines | 161 in 18:45–19:45 | 0 in 19:45–20:06 |
| Production tedrisat, `getaddrinfo EAI_AGAIN` | 123 in 19:00–19:44 | 0 in 19:45–20:06 |
| Development tedrisat, `getaddrinfo EAI_AGAIN` | 21 in 19:00–19:44 | 0 in 19:45–20:06 |
| Production tedris-web, `EAI_AGAIN` lines | 62 in 18:52–19:52 | 0 in 19:52–20:07 |
| Production tedris-web, `fetch failed` lines | 31 in 18:52–19:52 | 0 in 19:52–20:07 |
| Development nazar-web, `EAI_AGAIN` lines | 70 in 18:52–19:52 | 0 in 19:52–20:07 |
| Development nazar-web, `fetch failed` lines | 137 in 18:52–19:52 | 12 in 19:52–20:07 |
| Lookups from the mdrs2 host, cache flushed each time | 4 of 30 failed | 0 of 30 failed |
| Lookups from the mdrs1 host, cache flushed each time | 1 of 30 failed | 0 of 30 failed |
| Lookups inside the production tedrisat container | 1 of 30 failed, 10.2 s in all | 0 of 60 failed, 0.36 s in all |
| Development Nazar, Ders kayıtları | 2 of 3 loads failed | 6 of 6 loaded, 0.5–1.8 s |

## Not done, and not verified

- **mdrs3 was not looked at.** It holds the production database and Coolify. If
  it carries the same two resolvers it has the same exposure.
- **The packet loss is still there.** The change routes around it for name
  lookups; it does not remove it. It belongs with the hosting provider.
- **Development nazar-web still logged 12 `fetch failed` lines** in the fifteen
  minutes after the change, and development tedris-web 4. Their cause was not
  looked into. Production tedris-web logged none.
- **Playback itself was not watched.** No production account enrolled in a
  course with a recording was at hand, so that a talebe's video now plays
  without sticking was not seen. What was measured is that the requests around
  it stopped failing.
- **The "after" windows are 15 to 21 minutes long.** They show the errors
  stopped; they do not show a day without them.
- **When it began was not established.** The log window read on the day starts
  at 18:45 UTC; the first customer report was at about 12:04 UTC.

## If it comes back

1. Coolify, Projects, Medaris, production, tedrisat-service, Logs: search
   `EAI_AGAIN`. A match after 19:45 UTC on 24 November means the lookups are
   failing again.
2. On the host: `resolvectl status | grep 'DNS Servers'` shows what it asks.
3. Count failures with the cache out of the way:

   ```bash
   f=0; for i in $(seq 1 30); do resolvectl flush-caches; \
     timeout 6 getent hosts postgres.medaris.net >/dev/null || f=$((f+1)); done; \
     echo "failed $f of 30"
   ```

4. Look here before the video provider and before the code. The search of the
   recordings path on the day found no outbound call and no five-second
   timeout in it; the wait was the resolver's.
