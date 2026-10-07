---
name: SuperUtils
description: Hai he giao dien: landing cong khai toi gian nen toi va dashboard dark utility.
surfaces:
  home: "Landing cong khai. Nen toi, CTA Dashboard, gia live va card Discord co du lieu that."
  dashboard: "Workspace cau hinh Discord. Dark utility, uu tien mat do thong tin va thao tac."
---

# Design System: SuperUtils

## Scope

- **Home (`/`)**: theo he SuperUtils Landing.
- **Dashboard (`/dashboard`)**: theo he Dark Utility ben duoi.
- Quy tac theo route duoc uu tien khi hai be mat mau thuan.

## Dashboard: Dark Utility

### Direction

Dashboard van hanh Discord. Nen toi co dinh, giam trang tri, uu tien quet trang thai va cau hinh nhanh. Giu nguyen route, ID markup, API va event handler hien co.

### Tokens

```css
:root {
  --dash-bg: #000000;
  --dash-surface: #111214;
  --dash-surface-raised: #191A1D;
  --dash-muted: #9A9A9A;
  --dash-line: rgba(255,255,255,.14);
  --dash-accent: #F59E0B;
  --dash-accent-hover: #D97706;
  --dash-signal: #22C55E;
}
```

- Cam chi dung cho CTA, gia va nav dang chon.
- Xanh chi dung cho trang thai dang hoat dong.
- Card dung radius 9px den 12px, border manh, khong bong lech.
- Khong them nen trang, manga label, halftone, gradient trang tri, violet accent hoac glass card.

### Layout

- Desktop: sidebar 232px sticky, wordmark SuperUtils, nav theo cot, account action o day sidebar.
- Content desktop: padding 38px 44px 56px, khong co vien bao quanh toan bo main.
- Mobile: header sticky 64px, wordmark va menu. Menu mo thanh drawer 2 cot.
- Status feature wrap thanh chips. Khong marquee, khong cat ngang tren mobile.
- Module config giu HTML hien co; card, input, textarea va dialog nhan tokens chung.

### Interaction And Accessibility

- Button primary nen cam, chu #1A1200. Disabled dung surface toi va chu muted.
- Focus input dung vien cam va ring rgba cam .16.
- Hover chi doi mau hoac dich len 1px. Khong dung card float hay hieu ung lien tuc.
- prefers-reduced-motion: reduce tat transition, animation va smooth scroll.
- Theme dashboard co dinh dark. Theme toggle cu an de khong lam vo app.js hien co.

### Implementation Boundaries

- desktop.css va mobile.css chua Dark Utility theme o cuoi moi file, sau rule cu.
- desktop.html va mobile.html chi doi wordmark va theme boot.
- src/web/index.ts phai serve dashboard.css, cache-bust asset, build roi restart superutils-web khi sua.
- Khong doi id, data-page, endpoint hay ten field. Chinh giao dien truoc, logic sau khi co yeu cau rieng.

## Home: SuperUtils Landing

### Scope

- Route: `/`. Landing công khai tối giản nền tối. Dashboard giữ hệ Discord Client Manga Panel ở phần trên.
- Quy tắc theo route được ưu tiên khi hai bề mặt mâu thuẫn.

### Tokens

```css
:root {
  --home-bg: #000000; --home-ink: #FFFFFF; --home-muted: #9A9A9A;
  --home-line: rgba(255,255,255,.14);
  --home-accent: #F59E0B; --home-accent-hover: #D97706; --home-accent-bright: #FBBF24;
  --home-signal: #22C55E; --home-radius-control: 6px; --home-radius-card: 16px;
  --home-container: 1080px;
}
```

- Theme dark cố định. Nền đen, radial glow cam rất nhẹ ở hero. Không thêm section nền trắng, accent thứ hai, gradient chữ, glass card, card hover float, stock image hay fake UI.
- Cam dành cho CTA và từ khóa nhấn. Xanh chỉ là tín hiệu trạng thái sống. Chữ mô tả dùng `--home-muted`.

### Typography

- Nội dung: `Be Vietnam Pro`, self-hosted, trọng số 400, 500, 600, 800.
- Wordmark `SuperUtils`: chỉ dùng `Little Thiing`, kèm một chấm xanh.
- Hero: 800, `clamp(40px, 6vw, 80px)`, line-height `.98`, letter-spacing `-.03em`. Body: 16px/1.6. Lede: 17px, tối đa 46ch.

### Structure And Layout

1. Sticky nav: wordmark, liên kết tiện ích, CTA Dashboard.
2. Split hero: value proposition trái, Discord card dữ liệu thật phải.
3. Highlights, modules theo hàng phân cách, price CTA từ `/api/price`, footer.
4. Không ghi số lượng công cụ trong heading. Không chuyển modules thành card grid.

- Desktop: container 1080px; nav `18px 24px`; hero `40px 24px 48px`; grid `1.15fr .85fr`; gap 48px.
- Mobile tại `max-width: 820px`: hero một cột, padding `24px 20px 40px`; ẩn nav link phụ, giữ wordmark và CTA.
- Discord card tối đa 360px desktop, 400px mobile; nền `#111214`, border mảnh, radius 16px.
- Nav sticky, nền đen trong mờ, blur khi cuộn; không có thanh phân cách.

### Data, Motion, Accessibility

- Discord card gọi `/api/showcase`, chỉ hiện khi profile và scene hợp lệ. Không thay bằng dashboard giả. API lỗi giữ card ẩn. Không hiện token, ID nhạy cảm hay dữ liệu nội bộ.
- Giá gọi `/api/price`; bội số 1.000 viết `k`; hiển thị giá, ngày, `trên 1 slot`, giá mỗi ngày.
- Reveal dùng `IntersectionObserver`: opacity 0, blur 8px, translateY 18px; `.9s` `cubic-bezier(.16,1,.3,1)`; lặp lại khi ra rồi vào viewport.
- `prefers-reduced-motion: reduce` tắt smooth scroll và reveal. Focus-visible: viền 2px `--home-accent-bright`, offset 3px.
- Kiểm tra Chrome desktop 1365x768, mobile 390x844, `/`, `/api/showcase`, `/api/price`, font wordmark sau mỗi thay đổi.
