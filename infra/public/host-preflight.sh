#!/bin/sh
# Read-only inventory. Does not install software, pull images, open ports,
# read credentials, start services, or assert public acceptance.
set -u

if [ "$(uname -s)" != Linux ]; then
    printf '%s\n' 'HOST_INVENTORY=UNSUPPORTED_OS' 'PUBLIC_ACCEPTANCE=NOT_RUN'
    exit 2
fi

printf '%s\n' 'HOST_INVENTORY=BEGIN' 'PUBLIC_ACCEPTANCE=NOT_RUN'
printf 'UTC_TIME='
date -u '+%Y-%m-%dT%H:%M:%SZ'
printf 'ARCH='
uname -m
if [ -r /etc/os-release ]; then
    # Print only OS identification; do not source operator-controlled shell code.
    awk '/^(ID|VERSION_ID)=/ { print "OS_" $0 }' /etc/os-release
fi
printf 'EFFECTIVE_UID=%s\n' "$(id -u)"
printf 'CPU_COUNT='
getconf _NPROCESSORS_ONLN 2>/dev/null || printf '%s\n' UNKNOWN
awk '/^MemTotal:/ { print "MEMORY_TOTAL_KIB=" $2 }
     /^MemAvailable:/ { print "MEMORY_AVAILABLE_KIB=" $2 }
     /^SwapTotal:/ { print "SWAP_TOTAL_KIB=" $2 }' /proc/meminfo
printf '%s\n' 'ROOT_DISK_KIB:'
df -Pk /
if [ -d /srv ]; then
    printf '%s\n' 'SRV_DISK_KIB:'
    df -Pk /srv
fi

# Bound external programs; never run an arbitrary executable without a timeout.
if ! command -v timeout >/dev/null 2>&1; then
    printf '%s\n' 'BOUNDED_COMMANDS=UNAVAILABLE_TIMEOUT_MISSING'
else
    if ! command -v node >/dev/null 2>&1 && [ -x /opt/codeless/tools/node-v24.22.1-linux-x64/bin/node ]; then
        # Process-local lookup for the separately installed locked runtime.
        PATH=/opt/codeless/tools/node-v24.22.1-linux-x64/bin:$PATH
        export PATH
    fi
    for tool in node java git openssl; do
        if command -v "$tool" >/dev/null 2>&1; then
            printf '%s_VERSION:\n' "$tool"
            case "$tool" in
                java) timeout 10 java -version 2>&1 ;;
                openssl) timeout 10 openssl version 2>&1 ;;
                *) timeout 10 "$tool" --version 2>&1 ;;
            esac
            printf 'COMMAND_EXIT=%s\n' "$?"
        else
            printf '%s=NOT_INSTALLED\n' "$tool"
        fi
    done
    if command -v docker >/dev/null 2>&1; then
        printf '%s\n' 'DOCKER_ENGINE:'
        # Do not print environment, registry credentials, or container commands.
        timeout 15 docker info --format \
            'VERSION={{.ServerVersion}} ARCH={{.Architecture}} CPUS={{.NCPU}} MEMORY_BYTES={{.MemTotal}} SECURITY={{json .SecurityOptions}}' 2>/dev/null
        docker_status=$?
        printf 'DOCKER_INFO_EXIT=%s\n' "$docker_status"
        if [ "$docker_status" -ne 0 ]; then
            printf '%s\n' 'DOCKER_ENGINE=UNAVAILABLE_OR_ACCESS_DENIED'
        fi
        printf '%s\n' 'DOCKER_COMPOSE:'
        timeout 10 docker compose version 2>/dev/null
        printf 'COMMAND_EXIT=%s\n' "$?"
    else
        printf '%s\n' 'DOCKER=NOT_INSTALLED'
    fi
fi

if command -v ss >/dev/null 2>&1; then
    printf '%s\n' 'TCP_LISTEN_PORTS:'
    # Only local bind addresses; omit process command lines and credentials.
    ss -H -ltn | awk '{ print $4 }' | sort -u
else
    printf '%s\n' 'TCP_LISTEN_PORTS=UNKNOWN_SS_MISSING'
fi
printf '%s\n' 'HOST_INVENTORY=COLLECTED' \
    'NOTE=Inventory only; DNS, TLS, external reachability, worker isolation and publication remain unverified.' \
    'PUBLIC_ACCEPTANCE=NOT_RUN'
