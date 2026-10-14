#!/usr/bin/env python3
"""unmozlz4.py <in> <out>: decompress a Firefox mozLz4 file (magic 'mozLz40\\0', u32 size, LZ4 block)."""
import struct
import sys


def lz4_block(src, size):
    out = bytearray()
    i = 0
    while i < len(src):
        token = src[i]; i += 1
        lit = token >> 4
        if lit == 15:
            while True:
                b = src[i]; i += 1; lit += b
                if b != 255:
                    break
        out += src[i:i + lit]; i += lit
        if i >= len(src):
            break
        off = src[i] | (src[i + 1] << 8); i += 2
        ml = token & 15
        if ml == 15:
            while True:
                b = src[i]; i += 1; ml += b
                if b != 255:
                    break
        ml += 4
        start = len(out) - off
        for k in range(ml):
            out.append(out[start + k])
    if len(out) != size:
        raise ValueError(f"decoded mozLz4 size {len(out)} differs from declared {size}")
    return bytes(out)


if __name__ == '__main__':
    data = open(sys.argv[1], 'rb').read()
    if not data.startswith(b'mozLz40\0'):
        sys.exit('not mozLz4: ' + sys.argv[1])
    size = struct.unpack('<I', data[8:12])[0]
    open(sys.argv[2], 'wb').write(lz4_block(data[12:], size))
