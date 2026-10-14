#!/usr/bin/env python3
"""profile-canaries.py <canaries.json> <path>... [--media] [--label L]

Searches every file under each path for every canary, as UTF-8 and UTF-16LE
case-insensitively for ASCII letters, plus base64 forms of
UTF-8 in all three alignments. Prints one JSON line per hit and a final
summary line {"summary": {canary: hits}} so a no-hit is explicit.

--media also reports plaintext media/document signatures (JPEG, PNG, WebP,
WebM/Matroska, MP4/3GP ftyp, Ogg, WAV, PDF) found at offset 0 of a file.

Hit context is 40 bytes either side, printable ASCII only, so a hit can be
judged without copying anything else out of the file.
"""
import base64
import struct
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

_decoder_spec = spec_from_file_location("profile_moz_decoder", Path(__file__).with_name("unmozlz4.py"))
_decoder = module_from_spec(_decoder_spec)
_decoder_spec.loader.exec_module(_decoder)
lz4_block = _decoder.lz4_block
import json
import os
import sys

MEDIA = {
    b"\xff\xd8\xff": "jpeg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"\x1a\x45\xdf\xa3": "webm/mkv",
    b"OggS": "ogg",
    b"%PDF": "pdf",
}


def variants(value):
    out = {}
    low = value.lower()
    out["utf8"] = low.encode("utf-8")
    out["utf16le"] = low.encode("utf-16-le")
    raw = value.encode("utf-8")
    for shift in range(3):
        pad = b"\x00" * shift
        enc = base64.b64encode(pad + raw)
        # drop the characters that depend on the padding bytes and on what follows
        start = (shift * 4 + 2) // 3 if shift else 0
        core = enc[start: len(enc) - 4]
        if len(core) >= 8:
            out[f"b64.{shift}"] = core
    return out


def printable(b):
    return "".join(chr(c) if 32 <= c < 127 else "." for c in b)


def media_kind(head):
    for sig, kind in MEDIA.items():
        if head.startswith(sig):
            return kind
    if head[4:8] == b"ftyp":
        return "mp4/3gp"
    if head[:4] == b"RIFF" and head[8:12] in (b"WEBP", b"WAVE"):
        return head[8:12].decode().lower()
    return None


def main():
    args = sys.argv[1:]
    media = "--media" in args
    label = None
    if "--label" in args:
        i = args.index("--label")
        label = args[i + 1]
        del args[i:i + 2]
    args = [a for a in args if a != "--media"]
    canaries = json.load(open(args[0]))
    paths = args[1:]
    table = {name: variants(value) for name, value in canaries.items()}
    counts = {name: 0 for name in canaries}
    files = 0
    nbytes = 0
    for root in paths:
        walk = [(root, [], [os.path.basename(root)])] if os.path.isfile(root) else os.walk(root)
        for dirpath, _, names in walk:
            for name in names:
                p = dirpath if os.path.isfile(dirpath) else os.path.join(dirpath, name)
                if os.path.islink(p) or not os.path.isfile(p):
                    continue
                try:
                    data = open(p, "rb").read()
                except OSError as e:
                    print(json.dumps({"error": str(e), "file": p}))
                    continue
                if data.startswith(b"mozLz40\0"):
                    size = struct.unpack("<I", data[8:12])[0]
                    data = lz4_block(data[12:], size)
                    p += " (decoded mozLz4)"
                files += 1
                nbytes += len(data)
                if media:
                    kind = media_kind(data[:16])
                    if kind:
                        print(json.dumps({"media": kind, "file": p, "size": len(data)}))
                hay = data.lower()
                for cname, vs in table.items():
                    for enc, needle in vs.items():
                        h = hay if not enc.startswith("b64") else data
                        start = 0
                        while True:
                            at = h.find(needle, start)
                            if at < 0:
                                break
                            counts[cname] += 1
                            print(json.dumps({"hit": cname, "enc": enc, "file": p, "offset": at,
                                              "context": printable(data[max(0, at - 40): at + len(needle) + 40])}))
                            start = at + 1
    print(json.dumps({"summary": counts, "files": files, "bytes": nbytes, "label": label, "paths": paths}))


if __name__ == "__main__":
    main()
