#!/bin/sh
# Explicit operator step for a fresh Ubuntu 24.04 amd64 host.
# Installs tools only. Does not expose application ports or grant Docker access
# to the API account. Official installation references are in README.md.
set -eu
umask 022

if [ "${CODELESS_BOOTSTRAP_CONFIRM:-}" != install-tools ]; then
    printf '%s\n' 'Set CODELESS_BOOTSTRAP_CONFIRM=install-tools to install host tools.' >&2
    exit 2
fi
[ "$(id -u)" = 0 ] || { printf '%s\n' 'Root required.' >&2; exit 2; }
grep -qx 'ID=ubuntu' /etc/os-release
grep -qx 'VERSION_ID="24.04"' /etc/os-release
[ "$(dpkg --print-architecture)" = amd64 ]

# Do not remove a pre-existing container runtime or replace its configuration.
for package in docker.io docker-compose docker-compose-v2 podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -qx 'install ok installed'; then
        printf 'Conflicting package requires operator review: %s\n' "$package" >&2
        exit 2
    fi
done

export DEBIAN_FRONTEND=noninteractive
apt-get -o Acquire::Retries=3 update
apt-get -y --no-install-recommends install ca-certificates curl xz-utils openjdk-21-jdk-headless
install -d -m 0755 /etc/apt/keyrings
if [ ! -e /etc/apt/keyrings/docker.asc ]; then
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
        --connect-timeout 15 --max-time 120 \
        https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod 0644 /etc/apt/keyrings/docker.asc
fi
if [ ! -e /etc/apt/sources.list.d/docker.sources ]; then
    cat > /etc/apt/sources.list.d/docker.sources <<'SOURCES'
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
SOURCES
fi
apt-get -o Acquire::Retries=3 update
apt-get -y --no-install-recommends install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

node_release=node-v24.16.0-linux-x64
install -d -m 0755 /opt/codeless/tools /var/lib/codeless/bootstrap
if [ ! -e "/opt/codeless/tools/$node_release" ]; then
    # No unverified archive is extracted or executed.
    task_download_dir=$(mktemp -d /var/lib/codeless/bootstrap/node-download.XXXXXX)
    cd "$task_download_dir"
    for name in "$node_release.tar.xz" SHASUMS256.txt; do
        curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
            --connect-timeout 15 --max-time 300 \
            "https://nodejs.org/download/release/v24.16.0/$name" -o "$name"
    done
    awk -v name="$node_release.tar.xz" '$2 == name { print; count++ }
        END { if (count != 1) exit 1 }' SHASUMS256.txt > selected.sha256
    sha256sum -c selected.sha256
    tar -xJf "$node_release.tar.xz" -C /opt/codeless/tools
fi
[ "$(/opt/codeless/tools/$node_release/bin/node --version)" = v24.16.0 ]
printf '%s\n' 'INSTALLED_PACKAGES:'
dpkg-query -W -f='${Package}=${Version}\n' \
    openjdk-21-jdk-headless docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
/opt/codeless/tools/node-v24.16.0-linux-x64/bin/node --version
java -version
systemctl is-active docker
docker info --format 'DOCKER_VERSION={{.ServerVersion}} SECURITY={{json .SecurityOptions}}'
docker compose version
printf '%s\n' 'HOST_TOOLS=INSTALLED' 'PUBLIC_ACCEPTANCE=NOT_RUN'
