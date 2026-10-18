#!/usr/bin/python3
"""Node-compatible private IPC client; never receives Docker access."""
import base64
import json
import socket
import struct
import subprocess
import sys

SOCKET = '/run/codeless-worker/worker.sock'


def receive(connection, length):
    result = bytearray()
    while len(result) < length:
        part = connection.recv(length - len(result))
        if not part:
            raise EOFError('Worker disconnected')
        result.extend(part)
    return bytes(result)


def main():
    args = sys.argv[1:]
    if args == ['--version']:
        return subprocess.run(['/opt/codeless/tools/node-v24.16.0-linux-x64/bin/node', '--version'],
                              env={'PATH': '/usr/bin:/bin'}).returncode
    limit = 128 * 1024 if len(args) == 5 else 48 * 1024 * 1024
    data = sys.stdin.buffer.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Input limit')
    request = json.dumps({'argv': args, 'input': base64.b64encode(data).decode('ascii')}).encode()
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        connection.settimeout(245)
        connection.connect(SOCKET)
        connection.sendall(struct.pack('!I', len(request)) + request)
        length = struct.unpack('!I', receive(connection, 4))[0]
        if length > 3 * 1024 * 1024:
            raise ValueError('Output limit')
        result = json.loads(receive(connection, length))
        output = base64.b64decode(result['output'], validate=True)
        sys.stdout.buffer.write(output)
        return result['exit']


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        print('Trusted worker unavailable', file=sys.stderr)
        sys.exit(2)
