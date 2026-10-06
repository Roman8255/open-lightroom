import numpy as np
from PIL import Image

from app.schemas.edit import EditParams
from app.services.render import curve_lut, render


def _gray(v=128):
    return Image.new("RGB", (32, 32), (v, v, v))


def test_identity_is_noop():
    out = np.asarray(render(_gray(), EditParams()))
    assert abs(int(out[0, 0, 0]) - 128) <= 1


def test_exposure_brightens_and_darkens():
    base = int(np.asarray(render(_gray(), EditParams()))[0, 0, 0])
    assert int(np.asarray(render(_gray(), EditParams(exposure=1)))[0, 0, 0]) > base
    assert int(np.asarray(render(_gray(), EditParams(exposure=-1)))[0, 0, 0]) < base


def test_curve_lut_monotone_and_endpoints():
    lut = curve_lut([[0, 0], [0.25, 0.4], [0.75, 0.6], [1, 1]])
    assert lut[0] == 0 and abs(lut[-1] - 1) < 1e-6
    assert (np.diff(lut) >= -1e-6).all()


def test_all_params_run():
    p = EditParams(temperature=20, tint=-10, contrast=30, highlights=-40, shadows=40, whites=10,
                   blacks=-10, clarity=40, vibrance=30, saturation=10, sharpening=50, vignette=-40,
                   grain=20, hsl={"blue": {"hue": 20, "sat": -30, "lum": 10}})
    assert render(_gray(), p).size == (32, 32)


def test_bw_treatment_is_neutral():
    img = Image.new("RGB", (16, 16), (200, 60, 30))
    px = np.asarray(render(img, EditParams(bw=True)))[0, 0]
    assert px[0] == px[1] == px[2]


# ── v2: geometry, masks, spots, grading, calibration ──
from app.schemas.edit import Mask  # noqa: E402
from app.services.render import cal_matrix, raster_mask  # noqa: E402


def _grad():
    arr = np.zeros((60, 90, 3), np.uint8)
    arr[..., 0] = np.linspace(0, 255, 90, dtype=np.uint8)[None, :]
    arr[..., 1] = np.linspace(0, 255, 60, dtype=np.uint8)[:, None]
    arr[..., 2] = 90
    return Image.fromarray(arr)


def test_crop_changes_output_size_and_content():
    out = render(_grad(), EditParams(crop={"x": 0.5, "y": 0.0, "w": 0.5, "h": 0.5}))
    assert out.size == (45, 30)
    assert np.asarray(out)[0, 0, 0] > 120  # left edge of the crop is mid-gradient


def test_rotate_and_distortion_run():
    p = EditParams(crop={"angle": 20}, distortion=30, vertical=20, horizontal=-20, scale=90, aspect=10)
    assert render(_grad(), p).size == (90, 60)


def test_linear_mask_darkens_top_only():
    p = EditParams(masks=[Mask(type="linear", x1=0.5, y1=0.0, x2=0.5, y2=0.5, adj={"exposure": -2})])
    arr = np.asarray(render(Image.new("RGB", (40, 40), (180, 180, 180)), p))
    assert arr[1, 20, 0] < arr[38, 20, 0] - 40 and arr[38, 20, 0] >= 178


def test_radial_mask_invert_and_brush_raster():
    r = raster_mask(Mask(type="radial", cx=0.5, cy=0.5, rx=0.2, ry=0.2, feather=20), 50, 50)
    assert r[25, 25] > 0.99 and r[0, 0] < 0.01
    assert raster_mask(Mask(type="radial", invert=True), 50, 50)[25, 25] < 0.5
    stroke = {"size": 0.1, "feather": 0.3, "points": [[0.2, 0.5], [0.8, 0.5]]}
    b = raster_mask(Mask(type="brush", strokes=[stroke]), 100, 100)
    assert b[50, 50] > 0.9 and b[5, 5] == 0
    erase = {"size": 0.05, "erase": True, "feather": 0, "points": [[0.5, 0.5]]}
    e = raster_mask(Mask(type="brush", strokes=[{**stroke, "feather": 0.5}, erase]), 100, 100)
    assert e[50, 50] < 0.1 < e[50, 25]


def test_spot_clone_copies_source_and_redeye_reduces_red():
    img = Image.new("RGB", (80, 80), (50, 50, 50))
    img.paste((250, 250, 250), (50, 10, 70, 30))
    spot = {"x": 0.2, "y": 0.2, "r": 0.1, "sx": 0.75, "sy": 0.25, "mode": "clone", "feather": 0.1}
    assert np.asarray(render(img, EditParams(spots=[spot])))[16, 16, 0] > 200
    red = Image.new("RGB", (40, 40), (220, 40, 40))
    eye = np.asarray(render(red, EditParams(red_eyes=[{"x": 0.5, "y": 0.5, "r": 0.1, "amount": 1}])))
    assert eye[20, 20, 0] < 150


def test_grading_calibration_curves_and_detail_work():
    base = np.asarray(render(_gray(), EditParams()), dtype=int)[0, 0]
    zone = {"hue": 0, "sat": 80, "lum": 0}
    g = EditParams(grade={"shadows": zone, "midtones": zone, "highlights": zone})
    tinted = np.asarray(render(_gray(), g), dtype=int)[0, 0]
    assert tinted[0] > base[0] and tinted[1] < base[1]
    assert np.allclose(cal_matrix(EditParams().cal), np.eye(3), atol=1e-5)
    assert render(_gray(), EditParams(cal={"red_hue": 60, "red_sat": 40, "shadow_tint": 30})).size == (32, 32)
    ch = np.asarray(render(_gray(), EditParams(curve_r=[[0, 0], [0.5, 0.8], [1, 1]])), dtype=int)[0, 0]
    assert ch[0] > ch[2]
    p = EditParams(texture=50, dehaze=40, noise_reduction=30, sharpen_radius=2, sharpening=40, lens_vignette=30)
    assert render(_grad(), p).size == (90, 60)


def test_edit_params_validation_limits():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        EditParams(crop={"x": 0.8, "w": 0.5})
    with pytest.raises(ValidationError):
        EditParams(masks=[{"type": "linear"}] * 5)
    with pytest.raises(ValidationError):
        EditParams(curve_g=[[0, 0], [0, 1]])
