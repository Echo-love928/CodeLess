#!/bin/sh
set -eu
# Preserve all administrator SSH/firewall rules. This chain only restricts our backends.
iptables -w -N CODELESS_BACKENDS 2>/dev/null || true
iptables-restore --wait 5 --noflush <<'RULES'
*filter
-F CODELESS_BACKENDS
-A CODELESS_BACKENDS -i lo -j ACCEPT
-A CODELESS_BACKENDS -i cl-public0 -s 172.28.0.0/24 -j ACCEPT
-A CODELESS_BACKENDS -p tcp -j REJECT --reject-with tcp-reset
COMMIT
RULES
iptables -w -C INPUT -p tcp -m multiport --dports 8080,8788 -j CODELESS_BACKENDS 2>/dev/null ||
  iptables -w -I INPUT 1 -p tcp -m multiport --dports 8080,8788 -j CODELESS_BACKENDS
