#!/bin/sh
set -eu

readonly public_key_file="${KLIKK_DEV_PUBLIC_KEY_FILE:-/run/secrets/klikk_developer_public_key}"
readonly ssh_home="/home/node/.ssh"
readonly ssh_host_key="/var/lib/klikk-sshd/ssh_host_ed25519_key"
readonly dependency_marker="/workspace/node_modules/.klikk-package-lock-sha256"

if [ ! -s "$public_key_file" ]; then
  echo "SSH public key is missing or empty: $public_key_file" >&2
  exit 1
fi

install -d -m 0700 -o node -g node "$ssh_home"
install -m 0600 -o node -g node "$public_key_file" "$ssh_home/authorized_keys"

install -d -m 0700 /var/lib/klikk-sshd
if [ ! -s "$ssh_host_key" ]; then
  ssh-keygen -q -t ed25519 -N '' -f "$ssh_host_key"
fi

install -d -m 0755 -o node -g node /workspace/node_modules

if [ ! -f /workspace/package-lock.json ]; then
  echo "The Klikk V2 repository must be mounted at /workspace." >&2
  exit 1
fi

workspace_lock_hash="$(sha256sum /workspace/package-lock.json | cut -d ' ' -f 1)"
image_lock_hash="$(cat /opt/klikk-deps/package-lock.sha256)"
installed_lock_hash=""

if [ -f "$dependency_marker" ]; then
  installed_lock_hash="$(cat "$dependency_marker")"
fi

if [ "$installed_lock_hash" != "$workspace_lock_hash" ]; then
  if [ "$workspace_lock_hash" = "$image_lock_hash" ]; then
    find /workspace/node_modules -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
    cp -a /opt/klikk-deps/node_modules/. /workspace/node_modules/
    chown -R node:node /workspace/node_modules
  else
    gosu node npm ci
  fi

  printf '%s\n' "$workspace_lock_hash" > "$dependency_marker"
  chown node:node "$dependency_marker"
fi

/usr/sbin/sshd -t
/usr/sbin/sshd -D -e &

exec gosu node "$@"
