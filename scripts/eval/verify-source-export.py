"""Read a real source ZIP without extracting it; verify all bytes against manifest and API snapshot."""
import hashlib, json, pathlib, stat, sys, zipfile

archive, snapshot_file, output = map(pathlib.Path, sys.argv[1:4])
snapshot = json.loads(snapshot_file.read_text(encoding="utf-8"))
sha = lambda b: "sha256:" + hashlib.sha256(b).hexdigest()
with zipfile.ZipFile(archive) as z:
    entries = z.infolist()
    assert len(entries) <= 256 and sum(e.file_size for e in entries) <= 32 * 1024 * 1024
    files = {}
    for e in entries:
        p = pathlib.PurePosixPath(e.filename)
        assert not p.is_absolute() and ".." not in p.parts and "\\" not in e.filename
        assert not any(ord(c) < 32 for c in e.filename)
        assert not any(x in p.parts for x in (".git", ".env", "node_modules"))
        assert stat.S_IFMT(e.external_attr >> 16) != stat.S_IFLNK
        if e.is_dir():
            continue
        assert e.filename not in files
        files[e.filename] = z.read(e)  # zipfile checks CRC during decompression.
    roots = {name.split("/", 1)[0] for name in files}
    assert len(roots) == 1
    root = roots.pop() + "/"
    members = {name[len(root):]: data for name, data in files.items()}
    manifest = json.loads(members["codeless-export.json"])
    assert manifest["protocol"] == "codeless-source-export/v1"
    assert manifest["versionId"] == snapshot["version"]["id"]
    assert manifest["sourceDigest"] == snapshot["version"]["sourceDigest"]
    assert manifest["artifactDigest"] == snapshot["snapshot"]["validation"]["artifactDigest"]
    assert set(members) == {f["path"] for f in manifest["files"]} | {"codeless-export.json"}
    for f in manifest["files"]:
        assert len(members[f["path"]]) == f["bytes"] and sha(members[f["path"]]) == f["digest"]
    for f in snapshot["files"]:
        assert members[f["path"]] == f["content"].encode("utf-8")
        assert sha(members[f["path"]]) == f["digest"]
    canonical = lambda rows: json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    rows = lambda names: [{"path": p, "bytes": len(members[p]), "digest": sha(members[p])} for p in sorted(names)]
    assert sha(canonical(rows(f["path"] for f in manifest["files"]))) == manifest["contentDigest"]
    assert sha(canonical(rows(f["path"] for f in snapshot["files"]))) == manifest["sourceDigest"]
result = {"status": "PASSED", "versionId": manifest["versionId"], "sourceDigest": manifest["sourceDigest"],
          "artifactDigest": manifest["artifactDigest"], "contentDigest": manifest["contentDigest"],
          "zipSha256": sha(archive.read_bytes()), "zipBytes": archive.stat().st_size,
          "membersVerified": len(members), "sourceFilesVerified": len(snapshot["files"]),
          "crcVerified": True, "extractionPerformed": False, "additionalModelRequests": 0}
output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result))
