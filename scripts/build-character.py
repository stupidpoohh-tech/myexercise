"""
캐릭터 원본(assets/character-src)을 앱용 프레임(public/character/<id>/)으로 변환한다.

- <id>excercise.png : 4열×2행 스쿼트 시트. 1행 = 서 있음→최저(하강), 2행 = 최저→서 있음(상승)
- <id>.png          : 대기(서 있는) 자세
배경 제거(필요 시), 칸 분리, 발 위치 기준 정렬, 공통 캔버스 배치 후 WebP 로 저장한다.

  python3 scripts/build-character.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'character-src'
OUT = ROOT / 'public' / 'character'
CHARACTERS = ['1', '2', '3']
OUT_HEIGHT = 560  # 출력 캔버스 높이(px)


def to_rgba(path: Path) -> np.ndarray:
    im = Image.open(path)
    a = np.array(im.convert('RGBA')).astype(np.float32)
    if im.mode == 'RGBA' and (a[:, :, 3] < 10).mean() > 0.2:
        return a
    # 흰 배경 제거: 가장자리와 이어진 밝은 영역만 배경으로 본다 (흰 신발 등 내부는 유지)
    rgb = a[:, :, :3]
    light = rgb.min(axis=2) > 225
    lab, _ = ndimage.label(light)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    alpha = np.where(bg, 0.0, 255.0)
    # 외곽선 주변 밝은 반투명 테두리(흰 띠) 완화
    band = ndimage.binary_dilation(bg, iterations=2) & ~bg
    m = rgb.min(axis=2)
    alpha[band] = np.clip((255 - m[band]) / (255 - 150) * 255, 0, 255)
    a[:, :, 3] = alpha
    return a


def runs(v, minlen=20):
    out, s = [], None
    for i, x in enumerate(v):
        if x and s is None:
            s = i
        elif not x and s is not None:
            if i - s >= minlen:
                out.append((s, i))
            s = None
    if s is not None:
        out.append((s, len(v)))
    return out


def crop(a: np.ndarray) -> np.ndarray:
    m = a[:, :, 3] > 10
    ys, xs = np.where(m)
    return a[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]


def feet_center(a: np.ndarray) -> float:
    m = a[:, :, 3] > 10
    h = m.shape[0]
    xs = np.where(m[int(h * 0.88):].any(axis=0))[0]
    return (xs.min() + xs.max()) / 2


def build(cid: str) -> dict:
    sheet = to_rgba(SRC / f'{cid}excercise.png')
    mask = sheet[:, :, 3] > 10
    rows, cols = runs(mask.any(axis=1)), runs(mask.any(axis=0))
    assert len(rows) == 2 and len(cols) == 4, (cid, rows, cols)
    frames = [crop(sheet[r0:r1, c0:c1]) for r0, r1 in rows for c0, c1 in cols]

    # 대기 자세: 시트 첫 프레임과 같은 키로 맞춘다
    idle = crop(to_rgba(SRC / f'{cid}.png'))
    k = frames[0].shape[0] / idle.shape[0]
    idle_img = Image.fromarray(idle.astype(np.uint8), 'RGBA')
    idle_img = idle_img.resize((round(idle.shape[1] * k), frames[0].shape[0]), Image.LANCZOS)
    idle = np.array(idle_img).astype(np.float32)

    allf = frames + [idle]
    pad = 8
    centers = [feet_center(f) for f in allf]
    half = max(max(c, f.shape[1] - c) for f, c in zip(allf, centers)) + pad
    W, H = int(half * 2), max(f.shape[0] for f in allf) + pad
    scale = OUT_HEIGHT / H
    dst = OUT / cid
    dst.mkdir(parents=True, exist_ok=True)
    names = []
    for i, (f, c) in enumerate(zip(allf, centers)):
        canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        img = Image.fromarray(np.clip(f, 0, 255).astype(np.uint8), 'RGBA')
        canvas.paste(img, (int(round(half - c)), H - f.shape[0] - pad // 2), img)
        canvas = canvas.resize((round(W * scale), OUT_HEIGHT), Image.LANCZOS)
        name = 'idle.webp' if i == 8 else f'squat_{i}.webp'
        canvas.save(dst / name, 'WEBP', quality=88, method=6)
        names.append(name)
    return {'id': cid, 'width': round(W * scale), 'height': OUT_HEIGHT}


if __name__ == '__main__':
    meta = [build(c) for c in CHARACTERS]
    (OUT / 'manifest.json').write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta))
