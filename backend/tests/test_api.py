def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_auth_required(client):
    assert client.get("/api/photos").status_code == 401


def test_register_login_duplicate(client):
    body = {"email": "dup@t.io", "password": "password123"}
    assert client.post("/api/auth/register", json=body).status_code == 201
    assert client.post("/api/auth/register", json=body).status_code == 409
    assert client.post("/api/auth/login", json={**body, "password": "wrongpass1"}).status_code == 401
    assert client.post("/api/auth/login", json=body).status_code == 200
    assert client.get("/api/auth/me").json()["email"] == "dup@t.io"


def test_upload_list_patch_delete(user_client, jpeg_bytes):
    c = user_client
    r = c.post("/api/photos", files=[("files", ("a.jpg", jpeg_bytes, "image/jpeg"))])
    assert r.status_code == 201
    p = r.json()[0]
    assert (p["width"], p["height"]) == (120, 80)

    assert c.get(f"/api/photos/{p['id']}/file/thumb").headers["content-type"] == "image/jpeg"
    r = c.patch(f"/api/photos/{p['id']}", json={"rating": 4, "flag": 1, "color_label": "red"})
    assert r.json()["rating"] == 4
    assert len(c.get("/api/photos?rating_min=5").json()) == 0
    assert len(c.get("/api/photos?rating_min=4&flag=1").json()) == 1
    assert c.patch(f"/api/photos/{p['id']}", json={"rating": 9}).status_code == 422

    assert c.delete(f"/api/photos/{p['id']}").status_code == 204
    assert c.get(f"/api/photos/{p['id']}").status_code == 404


def test_bad_upload(user_client):
    r = user_client.post("/api/photos", files=[("files", ("a.txt", b"nope", "text/plain"))])
    assert r.status_code == 415


def test_isolation_between_users(client, jpeg_bytes):
    client.post("/api/auth/register", json={"email": "u1@t.io", "password": "password123"})
    pid = client.post("/api/photos", files=[("files", ("a.jpg", jpeg_bytes, "image/jpeg"))]).json()[0]["id"]
    client.cookies.clear()
    client.post("/api/auth/register", json={"email": "u2@t.io", "password": "password123"})
    assert client.get(f"/api/photos/{pid}").status_code == 404


def test_edit_history_export(user_client, jpeg_bytes):
    c = user_client
    pid = c.post("/api/photos", files=[("files", ("a.jpg", jpeg_bytes, "image/jpeg"))]).json()[0]["id"]
    assert c.get(f"/api/photos/{pid}/edit").json()["params"]["exposure"] == 0
    r = c.put(f"/api/photos/{pid}/edit", json={"exposure": 1.0, "saturation": 20, "vignette": -30,
                                                "hsl": {"red": {"hue": 10, "sat": 20, "lum": 0}},
                                                "curve": [[0, 0], [0.5, 0.6], [1, 1]]})
    assert r.status_code == 200
    assert c.put(f"/api/photos/{pid}/edit", json={"exposure": 99}).status_code == 422
    assert c.get(f"/api/photos/{pid}").json()["has_edits"] is True

    assert c.post(f"/api/photos/{pid}/history", json={"label": "Exposure +1"}).status_code == 201
    assert len(c.get(f"/api/photos/{pid}/history").json()) == 1

    r = c.post(f"/api/photos/{pid}/export", json={"format": "jpeg", "quality": 80, "max_size": 64})
    assert r.status_code == 200 and r.content[:2] == b"\xff\xd8"
    r = c.post(f"/api/photos/{pid}/export", json={"format": "png"})
    assert r.content[:4] == b"\x89PNG"
