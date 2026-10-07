# Product

## Register

product

## Users

Người dùng đăng nhập bằng Discord OAuth (`/auth/discord`), liên kết token account Discord (selfbot) vào slot, rồi cấu hình và bật/tắt các module chạy nền cho account đó qua dashboard web.

## Modules thực tế

- **Rich Presence (rpc/)**: hiển thị hoạt động tuỳ chỉnh trên Discord, hỗ trợ mode `RICH_PRESENCE`, `META_QUEST`, `SPOTIFY`; type `PLAYING/STREAMING/LISTENING/WATCHING/COMPETING`; tối đa 2 nút bấm, party size, timestamp, ảnh lớn/nhỏ, đồng bộ giờ địa phương, tự xoay vòng tên/nút theo chu kỳ (`refreshInterval` tối thiểu 15s).
- **Custom Status (status/)**: xoay vòng trạng thái tuỳ chỉnh (emoji + text) theo danh sách cấu hình.
- **Voice (voice/) & Voice Pool (voicepool/)**: tự vào voice channel, tuỳ chọn tự mute/deaf, bật camera, giữ kết nối stream; voicepool quản lý nhiều token cùng lúc trong một channel.
- **Video Stream (stream/)**: phát camera hoặc Go Live vào voice/stage channel từ URL hoặc từ khoá tìm kiếm, có hàng chờ phát (queue), lệnh điều khiển qua chat (play/queue/skip/pause/resume/disconnect).
- **Auto Chat (chat/) & Chat Pool**: gửi tin nhắn tự động vào kênh theo 3 chế độ — `ordered` (tuần tự), `random` (ngẫu nhiên), `text-war` (spam kèm mention 1 user mục tiêu); hỗ trợ đính kèm ảnh, nhiều token chạy song song (tối đa 50 token/pool).
- **Quest (quest/)**: tự động hoàn thành Discord Quest bằng cách giả lập client heartbeat/properties (Windows + Android).
- **Multi-user runner (multi/)**: tiến trình điều phối chính — quản lý slot billing, trạng thái token (active/invalid), tự phát hiện token hết hạn/hết hiệu lực, archive/restore slot, gửi thông báo qua DM Discord và Webhook khi token invalid hoặc slot hết hạn.
- **Web dashboard (web/)**: giao diện quản lý tại các trang `/home /dashboard /billing /deposit /chat /chatpool /voice /voicepool /stream /quest /admin /api-page`; API cho billing (mua/gia hạn/nạp thẻ card2k), quản lý media upload, cấu hình từng module, xem trước (preview) trước khi lưu.

## Gói dịch vụ (Billing)

3 gói trả phí, đơn vị VNĐ/tháng:

| Gói | Giá | Slot | Config | Status | Pool token | Media |
|---|---|---|---|---|---|---|
| Luna (pluna) | 40.000 | 2 | 1 | 5 | 10 | 10MB |
| Terra (pterra) | 60.000 | 4 | 3 | 15 | 20 | 20MB |
| Sol (psol) | 90.000 | 6 | 5 | 25 | 30 | 30MB |

Ngoài ra có slot miễn phí (free plan) với thời gian cooldown giữa các lần dùng là 5 giờ.

## Product Purpose

Cung cấp một workspace tập trung để cấu hình các chức năng Discord (Rich Presence, Status, Voice, Voice Pool, Stream, Auto Chat, Quest), kiểm tra kết quả trước khi lưu, quản lý thanh toán và slot mà không làm gián đoạn luồng thao tác chính.

## Brand Personality

Sắc nét, năng động, có kỷ luật. Phong cách manga tạo nhận diện nhưng không làm giảm khả năng đọc hoặc tốc độ thao tác.

## Anti-references

- Giao diện cổ hủ.
- Bố cục card-grid đồng đều, lặp lại.
- Glassmorphism và gradient trang trí.
- Các khuôn mẫu dễ nhận ra là website do AI tạo.

## Design Principles

- Ưu tiên tác vụ: cấu trúc phải dẫn người dùng từ nhập liệu đến xem trước và lưu.
- Khung manga có mục đích: mỗi panel phải phản ánh quan hệ nội dung hoặc thứ tự thao tác.
- Tương phản có kỷ luật: mực đen và giấy trắng là nền tảng; màu chỉ giữ cho dữ liệu cần nhận biết.
- Trạng thái rõ ràng: hover, focus, active, disabled, error và loading phải phân biệt được.
- Responsive theo cấu trúc: bố cục đổi cột và thứ tự panel, không chỉ thu nhỏ kích thước.

## Accessibility & Inclusion

Duy trì tương phản cao, hỗ trợ điều hướng bàn phím, focus rõ ràng, vùng bấm phù hợp và tôn trọng `prefers-reduced-motion`. Không dùng màu làm dấu hiệu trạng thái duy nhất.
