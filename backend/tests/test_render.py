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
