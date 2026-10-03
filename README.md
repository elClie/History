# HisTML

Bộ slide lịch sử chạy bằng Electron — trời đêm cháy đỏ, chữ bốc cháy (WebGL) khi chuyển slide.

## Chạy

```bash
npm install          # lần đầu
npm run fonts        # lần đầu — tải font về fonts/ (cần mạng)
npm start            # mở app (cờ GPU hiệu năng cao, không throttle nền)
```

Hoặc double-click `Run-HisTML.command` (macOS) / `Run-HisTML.bat` (Windows).
Xem nhanh trên trình duyệt: `npm run web` → http://127.0.0.1:8766

## Điều khiển

| Phím | Tác dụng |
| --- | --- |
| → · Space · PageDown · click | Slide sau |
| ← · PageUp · click mép trái | Slide trước |
| Home / End | Slide đầu / cuối |
| F | Toàn màn hình |
| D | Hiện FPS / debug |
| `#5` trên URL | Nhảy tới slide 5 |

## Cấu trúc

```
index.html            slide + các lớp hiệu ứng
css/fonts.css         @font-face (sinh bởi tools/fetch-fonts.py)
css/deck.css          token màu, engine slide, khung vàng, chữ
css/atmosphere.css    bầu trời, chân trời, lửa, khói, lớp phim
css/components.css    bố cục slide (goal, timeline, split, quote…)
css/fx.css            lớp cháy, burn-in glow, hiệu ứng CRT
js/burn.js            HisBurn — đốt chữ WebGL (không sửa phần quản lý tài nguyên)
js/fx.js              HisFx — canvas sao/than hồng + gọi HisBurn
js/deck.js            điều hướng, chuyển slide, vị trí mây theo slide
electron/             cửa sổ app + preload (toàn màn hình)
tools/fetch-fonts.py  tải Be Vietnam Pro + Literata (vietnamese/latin-ext/latin)
```

## Thêm slide

Mỗi slide là một `<section class="slide">` trong `main#deck`. `index.html` có sẵn một slide mẫu cho từng bố cục.

- `data-ghost` — chữ viền khổng lồ phía sau slide (mặc định lấy `data-title`).
- Phần tử khớp `FX_SEL` trong `js/deck.js` sẽ cháy khi rời slide và phát sáng khi vào. Thêm class `reveal` cho phần tử khác muốn có hiệu ứng.
- Tối đa 12 phần tử được đốt mỗi slide — giữ slide gọn.
- `.map-panel[data-mark]` — chữ chìm lớn trong khung bản đồ.
- `.archival-figure` — đặt `<img>` hoặc `.archival-glyph` vào khung tư liệu.
