#!/usr/bin/env bash
# D24-A: who issues the certificate that api.deepseek.com presents on this machine, per connection.
# Read-only: 12 TLS handshakes with SNI, no application data, no credentials, no proxy / truststore / TLS setting is
# touched. Prints only public certificate fields (leaf subject, issuer, chain length, openssl verify result).
# Usage: bash tls-issuer-probe.sh > tls-issuer-probe.out.txt
host=api.deepseek.com
genuine=0
intercepted=0
other=0
for i in $(seq 1 12); do
  out=$(echo | timeout 12 openssl s_client -connect "$host:443" -servername "$host" -showcerts 2>&1)
  subject=$(printf '%s\n' "$out" | grep -m1 -E '^ 0 s:' | sed -E 's/^ 0 s://')
  issuer=$(printf '%s\n' "$out" | grep -m1 -E '^\s+i:' | sed -E 's/^\s+i://')
  verify=$(printf '%s\n' "$out" | grep -m1 'Verify return code' | sed -E 's/^\s*Verify return code: //')
  certs=$(printf '%s\n' "$out" | grep -c 'BEGIN CERTIFICATE')
  echo "$(date -u +%FT%TZ) #$i certs=$certs subject=${subject:-NONE} issuer=${issuer:-NONE} verify=${verify:-NO_HANDSHAKE}"
  case "$issuer" in
    *TrustAsia*) genuine=$((genuine+1)) ;;
    *Kaspersky*) intercepted=$((intercepted+1)) ;;
    *) other=$((other+1)) ;;
  esac
  sleep 1
done
echo "summary handshakes=12 publicCaIssuer=$genuine antivirusRootIssuer=$intercepted other=$other"
