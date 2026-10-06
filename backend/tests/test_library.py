import io
import zipfile


def _upload(c, jpeg, name="a.jpg", folder=None):
    data = {"folder": folder} if folder else None
    return c.post("/api/photos", files=[("files", (name, jpeg, "image/jpeg"))], data=data).json()[0]["id"]


def test_collections_filter_and_publish_zip(user_client, jpeg_bytes):
    c = user_client
    p1, p2 = _upload(c, jpeg_bytes, "one.jpg"), _upload(c, jpeg_bytes, "two.jpg")
    col = c.post("/api/collections", json={"name": "Trip"}).json()
    assert c.post("/api/collections", json={"name": "Trip"}).status_code == 409
    assert c.post(f"/api/collections/{col['id']}/photos", json={"photo_ids": [p1]}).status_code == 204
    assert c.post(f"/api/collections/{col['id']}/photos", json={"photo_ids": [p1]}).status_code == 204  # idempotent
    assert c.get("/api/collections").json()[0]["count"] == 1
    assert [p["id"] for p in c.get(f"/api/photos?collection_id={col['id']}").json()] == [p1]
    c.put(f"/api/photos/{p1}/edit", json={"exposure": 1, "masks": [{"type": "radial", "adj": {"exposure": -1}}]})
    r = c.post(f"/api/collections/{col['id']}/export", json={"format": "jpeg", "quality": 70, "max_size": 64})
    assert r.status_code == 200
    assert len(zipfile.ZipFile(io.BytesIO(r.content)).namelist()) == 1
    assert c.post(f"/api/collections/{col['id']}/photos/remove", json={"photo_ids": [p1]}).status_code == 204
    assert c.post(f"/api/collections/{col['id']}/export", json={}).status_code == 400
    assert c.delete(f"/api/collections/{col['id']}").status_code == 204
    assert p2


def test_keywords_apply_filter_remove(user_client, jpeg_bytes):
    c = user_client
    p1, p2 = _upload(c, jpeg_bytes), _upload(c, jpeg_bytes)
    assert c.post("/api/keywords/apply", json={"photo_ids": [p1, p2], "add": ["Beach", " sunset "]}).status_code == 204
    kws = {k["name"]: k for k in c.get("/api/keywords").json()}
    assert kws["beach"]["count"] == 2 and "sunset" in kws
    assert c.get(f"/api/photos/{p1}").json()["keywords"] == ["beach", "sunset"]
    assert len(c.get(f"/api/photos?keyword_id={kws['beach']['id']}").json()) == 2
    c.post("/api/keywords/apply", json={"photo_ids": [p1], "remove": ["beach"]})
    assert c.get(f"/api/photos/{p1}").json()["keywords"] == ["sunset"]
    assert c.delete(f"/api/keywords/{kws['sunset']['id']}").status_code == 204


def test_folders_comments_metadata_and_presets(user_client, jpeg_bytes):
    c = user_client
    pid = _upload(c, jpeg_bytes, folder="Trip 2026")
    _upload(c, jpeg_bytes)
    assert {f["name"]: f["count"] for f in c.get("/api/folders").json()} == {"Trip 2026": 1, "Uploads": 1}
    assert len(c.get("/api/photos?folder=Trip%202026").json()) == 1

    r = c.patch(f"/api/photos/{pid}", json={"title": "Sunrise", "caption": "Over the bay"})
    assert r.json()["title"] == "Sunrise"
    cm = c.post(f"/api/photos/{pid}/comments", json={"text": "nice light"}).json()
    assert c.get(f"/api/photos/{pid}/comments").json()[0]["text"] == "nice light"
    assert c.delete(f"/api/comments/{cm['id']}").status_code == 204
    assert c.get(f"/api/photos/{pid}/comments").json() == []

    saved = c.put("/api/presets/My Look", json={"contrast": 20, "grade": {"shadows": {"hue": 200, "sat": 30, "lum": 0}}}).json()
    assert saved["params"]["contrast"] == 20
    assert c.put("/api/presets/My Look", json={"contrast": 25}).json()["params"]["contrast"] == 25
    assert len(c.get("/api/presets").json()) == 1
    assert c.delete(f"/api/presets/{saved['id']}").status_code == 204


def test_other_user_cannot_touch_library(client, jpeg_bytes):
    client.post("/api/auth/register", json={"email": "own@t.io", "password": "password123"})
    pid = _upload(client, jpeg_bytes)
    cid = client.post("/api/collections", json={"name": "Mine"}).json()["id"]
    client.cookies.clear()
    client.post("/api/auth/register", json={"email": "oth@t.io", "password": "password123"})
    assert client.post(f"/api/collections/{cid}/photos", json={"photo_ids": [pid]}).status_code == 404
    assert client.get(f"/api/photos/{pid}/comments").status_code == 404
    mine = client.post("/api/collections", json={"name": "Mine"})
    assert mine.status_code == 201  # names are per user
    assert client.post("/api/keywords/apply", json={"photo_ids": [pid], "add": ["x"]}).status_code == 204
    assert client.get(f"/api/photos/{pid}").status_code == 404
