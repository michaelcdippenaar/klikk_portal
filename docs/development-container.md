# Klikk V2 development container

This container provides the Vue/Vite development server and key-only SSH
access to the repository mounted at `/workspace`. It proxies `/backend` to the
single existing production backend. It does not run Django or a database.

> **Production data:** requests made through this frontend reach the production
> backend. A write made by the UI is a real production write.

## Server setup

Create the local environment file and set an absolute path to a public key:

```bash
cp .env.v2-dev.example .env.v2-dev
$EDITOR .env.v2-dev
```

The public-key setting may point to one `*.pub` file or an `authorized_keys`
file containing several public keys. Never mount a private key.

Build and start the development service:

```bash
docker compose \
  --env-file .env.v2-dev \
  -f docker-compose.v2-dev.yml \
  up -d --build
```

Check readiness:

```bash
docker compose --env-file .env.v2-dev -f docker-compose.v2-dev.yml ps
curl http://127.0.0.1:4173/_close-overview-preview
```

## SSH from a new project

The container uses the non-root `node` account. When the SSH port remains
bound to localhost, first create a tunnel through the Docker host:

```bash
ssh -N -L 2222:127.0.0.1:2222 your-server-user@your-server
```

Then connect from the new project or remote-development client:

```bash
ssh -p 2222 node@127.0.0.1
```

Optional client entry for `~/.ssh/config`:

```sshconfig
Host klikk-v2-development
  HostName 127.0.0.1
  Port 2222
  User node
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

With the tunnel active, a new project can connect using
`ssh klikk-v2-development` and use `/workspace` as its project directory.

The source is available at `/workspace`. SSH host keys persist in a named
Docker volume, so the fingerprint remains stable across container rebuilds.

To expose SSH directly, set `KLIKK_DEV_SSH_BIND=0.0.0.0` only when the server
firewall restricts port 2222 to trusted addresses. Key authentication remains
mandatory and root/password login remains disabled.

## Operations

View logs:

```bash
docker compose --env-file .env.v2-dev -f docker-compose.v2-dev.yml logs -f frontend-v2
```

Rebuild after changing `package-lock.json` or the container definition:

```bash
docker compose --env-file .env.v2-dev -f docker-compose.v2-dev.yml up -d --build
```

Stop without deleting the persistent dependency or SSH-host-key volumes:

```bash
docker compose --env-file .env.v2-dev -f docker-compose.v2-dev.yml down
```
