# Beta R2 preflight: official sources read on 2026-11-16

Extracts, verbatim, of every passage the runbook's preflight relies on. Each line is `file:line: text` from the provider's own documentation source, at the pinned commit.

## How they were read
- **The pinned revisions:** `git ls-remote https://github.com/<repo> HEAD` gave the commits below.
- **The clones:** `git clone --depth 1`, sparse for `cloudflare-docs`.
- **Tailscale:** `ipn/serve.go` came from `raw.githubusercontent.com` at the pinned commit.
- **What couldn't be read from this session:**
  - tailscale.com: this session's network policy answered 403 to CONNECT;
  - developers.cloudflare.com, www.cloudflare.com, docs.oracle.com, docs.cloud.google.com and aws.amazon.com: they did not resolve;
  - www.oracle.com: it answered HTTP 403.
- **What the runbook does instead:** it states nothing from those sites as fact. It lists what to confirm on each.

## Caddy, caddyserver/website @ c33ee8b02a245045bc18c406a1aa0e06cd1fb772
```
    src/docs/markdown/automatic-https.md:62:- If your domain's A/AAAA records point to your server,
    src/docs/markdown/automatic-https.md:63:- ports `80` and `443` are open externally,
    src/docs/markdown/automatic-https.md:51:- Any client accessing the site without trusting Caddy's root CA certificate will show security errors.
    src/docs/markdown/automatic-https.md:133:Local HTTPS does not use ACME nor does it perform any DNS validation. It works only on the local machine and is trusted only where the CA's root certificate is installed.
    src/docs/markdown/automatic-https.md:198:This challenge does not require any open ports, and the server requesting a certificate does not need to be externally accessible. However, the DNS challenge requires configuration. Caddy needs to know the credentials to access your domain's DNS provider so it can set (and clear) the special `TXT` records. If the DNS challenge is enabled, other challenges are disabled by default.
    src/docs/markdown/automatic-https.md:202:DNS provider support is a community effort. [Learn how to enable the DNS challenge for your provider at our wiki.](https://caddy.community/t/how-to-use-dns-provider-modules-in-caddy-2/8148)
    src/docs/markdown/automatic-https.md:93:- Domains ending in `.ts.net` will not be managed by Caddy. Instead, Caddy will automatically attempt to get these certificates at handshake-time from the locally-running [Tailscale <img src="/old/resources/images/external-link.svg" class="external-link">](https://tailscale.com) instance. This requires that [HTTPS is enabled in your Tailscale account <img src="/old/resources/images/external-link.svg" class="external-link">](https://tailscale.com/kb/1153/enabling-https/) and the Caddy process must either be running as root, or you must configure `tailscaled` to give your Caddy user [permission to fetch certificates](https://github.com/caddyserver/caddy/pull/4541#issuecomment-1021568348).
    src/docs/markdown/caddyfile/directives/reverse_proxy.md:433:The proxy also supports WebSocket connections, performing the HTTP upgrade request then transitioning the connection to a bidirectional tunnel.
    src/docs/markdown/caddyfile/directives/reverse_proxy.md:437:By default, WebSocket connections are forcibly closed (with a Close control message sent to both the client and upstream) when the config is reloaded. Each request holds a reference to the config, so closing old connections is necessary to keep memory usage in check. This closing behaviour can be customized with the [`stream_timeout`](#stream_timeout) and [`stream_close_delay`](#stream_close_delay) options.
    src/docs/markdown/caddyfile/directives/reverse_proxy.md:513:- It sets or augments the [`X-Forwarded-For`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For) header field.
    src/docs/markdown/caddyfile/directives/reverse_proxy.md:517:<span id="trusted_proxies"/> For these `X-Forwarded-*` headers, by default, the proxy will ignore their values from incoming requests, to prevent spoofing.
    src/docs/markdown/caddyfile/directives/reverse_proxy.md:525:If you're using Cloudflare in front of Caddy, be aware that you may be vulnerable to spoofing of the `X-Forwarded-For` header. Our friends at [Authelia](https://www.authelia.com) have documented a [workaround](https://www.authelia.com/integration/proxies/forwarded-headers/) to configure Cloudflare to ignore incoming values for this header.
```

## Let's Encrypt, letsencrypt/website @ c5aba6d794bfabcbbcea2319db9d65734c382461
```
    content/en/docs/challenge-types.md:58:name. It is harder to configure than HTTP-01, but can work in scenarios
    content/en/docs/challenge-types.md:66:Since automation of issuance and renewals is really important, it only
    content/en/docs/challenge-types.md:67:makes sense to use DNS-01 challenges if your DNS provider has an API you
    content/en/docs/challenge-types.md:75:Note that putting your full DNS API credentials on your web server
```

## Cloudflare, cloudflare/cloudflare-docs @ 2a6ef7a61fe2efc78971fa497438526117ef849c
```
    src/content/docs/tunnel/get-started/quick-tunnels/index.mdx:13:Quick Tunnels create a temporary `trycloudflare.com` URL for a local service. You do not need a Cloudflare account or domain.
    src/content/docs/tunnel/get-started/quick-tunnels/index.mdx:16:Quick Tunnels are for testing and development. For production, [create a Cloudflare Tunnel](/tunnel/get-started/).
    src/content/docs/tunnel/get-started/quick-tunnels/index.mdx:38:Anyone with the URL can access your local service. The URL stops working when you stop the `cloudflared` process.
    src/content/docs/tunnel/get-started/quick-tunnels/index.mdx:93:- Quick Tunnels have no uptime guarantee.
    src/content/docs/tunnel/get-started/quick-tunnels/index.mdx:94:- Each Quick Tunnel supports up to 200 in-flight requests. Additional requests return a `429` response.
    src/content/docs/tunnel/get-started/index.mdx:27:- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
    src/content/docs/tunnel/get-started/index.mdx:28:- A [domain on Cloudflare](/fundamentals/manage-domains/add-site/) (required to publish applications)
    src/content/docs/tunnel/get-started/index.mdx:29:- A server or VM with internet access where you will install `cloudflared`
    src/content/docs/tunnel/get-started/index.mdx:32:If your server is behind a restrictive firewall, verify it can reach Cloudflare on port `7844` before proceeding. Refer to [Connection errors](/tunnel/troubleshooting/#connection-errors).
    src/content/docs/tunnel/index.mdx:26:<Plan type="all" />
    src/content/docs/tunnel/index.mdx:34:No open inbound ports. No public IPs. No attack surface.
    src/content/docs/tunnel/index.mdx:32:Cloudflare Tunnel connects your infrastructure to Cloudflare through an outbound-only, [post-quantum encrypted](/ssl/post-quantum-cryptography/) connection. Instead of exposing a public IP, you install a lightweight daemon called `cloudflared` on your server. It creates a persistent tunnel to Cloudflare's global network, so all traffic to your origins flows through Cloudflare — where CDN caching, WAF, Bot Management, and DDoS protection are applied automatically.
    src/content/docs/network/websockets.mdx:12:Cloudflare supports proxied WebSocket connections without additional configuration.
    src/content/docs/network/websockets.mdx:53:WebSockets are supported on all Cloudflare plans.
    src/content/docs/fundamentals/reference/http-headers.mdx:25:`CF-Connecting-IP` provides the client IP address connecting to Cloudflare to the origin web server.
    src/content/docs/fundamentals/reference/http-headers.mdx:74:`X-Forwarded-For` maintains proxy server and original visitor IP addresses. If there was no existing `X-Forwarded-For`header in the request sent to Cloudflare, `X-Forwarded-For` has an identical value to the `CF-Connecting-IP` header.
```

## Tailscale (source code only), tailscale/tailscale @ 6e16dac9e9beec391730423198b3115eb3422efe
```
    serve.go:640:// CheckFunnelAccess checks whether Funnel access is allowed for the given node
    serve.go:643://  1. HTTPS is enabled on the tailnet
    serve.go:644://  2. the node has the "funnel" nodeAttr
    serve.go:645://  3. the port is allowed for Funnel
    serve.go:668:// It uses the tailcfg.CapabilityFunnelPorts nodeAttr to determine the allowed
```

## Node.js (read by a fetch of the pages)
- [nodejs.org/en/about/previous-releases](https://nodejs.org/en/about/previous-releases): "Production applications should only use _Active LTS_ or _Maintenance LTS_ releases." The status table lists v22 "Jod" as LTS.
- [nodejs/release, release schedule](https://github.com/nodejs/release#release-schedule): Node 22 is in Maintenance LTS, and its end of life is 2027-04-30. "Dates are subject to change."

## Ubuntu's Caddy package (checked here)
- **The package:** `caddy_2.6.2-6ubuntu0.24.04.3_amd64.deb`, sha256 `3a71aa97c7d85ea7a285717601306bf45d6f701073875ab689e893fabf6a819c`. It came from `apt-get download` and was extracted with `dpkg -x`; it was not installed.
- **Its modules:** `caddy list-modules` lists 101 entries. **None** is `dns.providers.*`, and `tls.get_certificate.tailscale` is present.
