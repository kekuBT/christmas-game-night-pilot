# The Render image for Christmas Game Night (Beta R4 packaging, handoff 6919813048). A reviewable candidate: nothing is
# deployed from here until the owner's approved setup is created. See README.md in this folder.
#
# The build context is this folder plus the audited archive at artifact/mchezo-7097ac2.tgz (not in git here; .dockerignore
# admits only the listed files, so nothing else, Render's secret files included, can enter the image).
# Every base image is pinned by digest; there is no ARG (Render turns the service's environment variables into build
# arguments, and none is read); the pins live in pins/ and cgn-artifact-gate.sh.

# --- age v1.2.1, built from source: the module comes through the Go proxy and is checked against the Go checksum
#     database (sum.golang.org), and the binary must have the pinned SHA-256 (reproducible: -trimpath, no cgo).
FROM docker.io/library/golang:1.24.4-bookworm@sha256:10f549dc8489597aa7ed2b62008199bb96717f52a8e8434ea035d5b44368f8a6 AS age
ENV CGO_ENABLED=0 GOFLAGS=-trimpath GOTOOLCHAIN=local GOPROXY=https://proxy.golang.org GOSUMDB=sum.golang.org GONOSUMDB= GONOPROXY= GOPRIVATE= GOINSECURE=
COPY pins/age.sha256 /pins/age.sha256
RUN go install filippo.io/age/cmd/age@v1.2.1 \
 && cd /go/bin && sha256sum -c --strict /pins/age.sha256 \
 && ./age --version

# --- The artifact gate: the audited archive, checked and installed (cgn-artifact-gate.sh has every check).
FROM docker.io/library/node:22.16.0-bookworm@sha256:71bcbb3b215b3fa84b5b167585675072f4c270855e37a599803f1a58141a0716 AS gate
COPY pins/ /gate/pins/
COPY cgn-artifact-gate.sh cgn-entrypoint.sh cgn-backup.sh cgn-authorize.sh /gate/
COPY artifact/ /gate/artifact/
RUN sh /gate/cgn-artifact-gate.sh gate /gate /out/app

# --- The runtime image: the pinned Node 22.16.0 slim image, the verified release (read-only, owned by root), the
#     reviewed scripts, age, and a non-root user with a shell and ~/.ssh (Render's SSH needs both). Its password field is
#     "*": no password can ever be used, and the account isn't "locked" ("!"), which some SSH setups refuse for key logins.
FROM docker.io/library/node:22.16.0-bookworm-slim@sha256:048ed02c5fd52e86fda6fbd2f6a76cf0d4492fd6c6fee9e2c463ed5108da0e34 AS runtime
COPY --from=age /go/bin/age /usr/local/bin/age
COPY --from=gate /out/app /app
COPY --from=gate /gate/pins/ /usr/local/share/cgn/pins/
COPY --from=gate /gate/cgn-artifact-gate.sh /usr/local/share/cgn/cgn-artifact-gate.sh
COPY --from=gate /gate/cgn-entrypoint.sh /usr/local/bin/cgn-entrypoint
COPY --from=gate /gate/cgn-backup.sh /usr/local/bin/cgn-backup
COPY --from=gate /gate/cgn-authorize.sh /usr/local/bin/cgn-authorize
RUN set -eu \
 && chmod 0755 /usr/local/bin/age /usr/local/bin/cgn-entrypoint /usr/local/bin/cgn-backup /usr/local/bin/cgn-authorize /usr/local/share/cgn/cgn-artifact-gate.sh \
 && sh /usr/local/share/cgn/cgn-artifact-gate.sh installed /app \
 && [ "$(age --version)" = "v1.2.1" ] \
 && for c in age tar sha256sum timeout mv find grep od sed tr stat date cut ls sleep mkdir rm; do command -v "$c" >/dev/null || { echo "missing $c" >&2; exit 1; }; done \
 && groupadd --gid 10001 cgn \
 && useradd --uid 10001 --gid cgn --home-dir /home/cgn --create-home --shell /bin/bash cgn \
 && usermod -p '*' cgn \
 && install -d -m 0700 -o cgn -g cgn /home/cgn/.ssh \
 && install -d -m 0700 -o cgn -g cgn /var/data \
 && [ -z "$(find /app -perm /022 ! -type l | head -1)" ] && [ -z "$(find /app ! -user root | head -1)" ]
ENV NODE_ENV=production \
    PORT=10000 \
    MCHEZO_LISTEN_HOST=0.0.0.0 \
    CGN_APP_DIR=/app \
    CGN_RUN_DIR=/tmp/cgn \
    CGN_BACKUP_ROOT=/var/data/backups \
    CGN_AUTHORIZED_CONFIG=/var/data/cgn-authorized.conf
USER cgn:cgn
WORKDIR /app
EXPOSE 10000
STOPSIGNAL SIGTERM
CMD ["/usr/local/bin/cgn-entrypoint"]
