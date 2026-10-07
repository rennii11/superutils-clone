# superutils-clone

Superutils-clone là dịch vụ Node.js gồm web dashboard, quản lý dữ liệu/gói và các worker Discord. TypeScript được biên dịch vào dist; giao diện web được đọc từ src/web khi chạy.

## Thành phần

| Thành phần | Entry point | Chức năng |
| --- | --- | --- |
| Web dashboard | dist/web/index.js | Trang chủ, OAuth Discord, dashboard, cấu hình, media và billing |
| Multi worker | dist/multi/index.js | Quét dữ liệu, đồng bộ trạng thái/gói và quản lý worker |
| Rich Presence | dist/rpc/index.js | Chạy Rich Presence theo scene |
| Voice / Voicepool | dist/voice/index.js, dist/voicepool/index.js | Kết nối voice đơn và nhóm |
| Chat / mention | dist/chat/index.js, dist/mention/index.js | Worker chat và phản hồi mention |
| Status / OwO / stream | dist/status/index.js, dist/owo/index.js, dist/stream/index.js | Các worker trạng thái, OwO và stream |
| Quest | dist/quest/index.js | Được dashboard kích hoạt qua API quest |

Worker ngoài web được multi khởi tạo từ dữ liệu trong MULTI_CONFIG_DIR. Không lưu token Discord vào README, git, log hoặc URL.

## Yêu cầu

- Node.js 22 trở lên.
- npm.
- PM2 nếu chạy nền.
- Tính năng stream cần ffmpeg và yt-dlp trong PATH; có thể đặt YT_DLP_PATH.
- Tính năng dùng Chrome cần CHROME_PATH hoặc Google Chrome tại /usr/bin/google-chrome.

## Cài đặt

~~~sh
git clone git@github.com:rennii11/superutils-clone.git
cd superutils-clone
npm ci
cp .env.example .env
mkdir -p accounts accounts-disabled media stream-users
chmod 700 accounts accounts-disabled media stream-users
npm run build
~~~

Điền các biến cần thiết trong .env. Giữ .env, token, database và dữ liệu tài khoản ngoài git.

## Biến môi trường

Không phải mọi biến đều bắt buộc cho mọi entry point. Danh sách giá trị mẫu nằm trong .env.example.

| Nhóm | Biến | Mục đích |
| --- | --- | --- |
| Web | WEB_HOST, WEB_PORT, WEB_ASSET_DIR | Máy chủ web; mặc định 127.0.0.1:3210 và asset src/web |
| OAuth | DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI | Đăng nhập Discord OAuth |
| Bot/quyền | BOT_TOKEN, ADMIN_IDS, ADMIN_USER_ID | Tích hợp bot và quyền quản trị |
| Dữ liệu | MULTI_CONFIG_DIR, DISABLED_CONFIG_DIR, MEDIA_ROOT_DIR, STREAM_CONFIG_DIR, BILLING_DB_FILE, SESSION_DB_FILE | Vị trí dữ liệu runtime |
| Public media | MEDIA_BASE_URL | URL gốc của media công khai |
| Mã hóa | TOKEN_ENCRYPTION_KEY | Khóa mã hóa token lưu cục bộ |
| SePay | SEPAY_API_TOKEN, SEPAY_BANK_NAME, SEPAY_BANK_ACCOUNT, SEPAY_BANK_ACCOUNT_NAME, SEPAY_QR_BASE_URL, SEPAY_POLL_LOOKBACK_DAYS, SEPAY_QR_EXPIRES_MINUTES, SEPAY_ACCOUNT_NUMBER | QR và đối soát SePay |
| Card2K | CARD2K_PARTNER_ID, CARD2K_PARTNER_KEY, CARD2K_CALLBACK_URL | Nạp thẻ; callback phải dùng HTTPS |
| Spotify | SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET | Tìm metadata nhạc |
| Thông báo | DISCORD_WEBHOOK_URL | Webhook thông báo dịch vụ |
| RPC | CONFIG_PATH, DISCORD_SCENE_APPLICATION_IDS, KOYEB_PUBLIC_DOMAIN, KOYEB_HEALTH_CHECK | Rich Presence chạy độc lập |
| Stream | STREAM_CONFIG_PATH, STREAM_TOKEN_PATH, STREAM_OWNER_ID, YT_DLP_PATH | Stream chạy độc lập |

Mặc định: MULTI_CONFIG_DIR=accounts, DISABLED_CONFIG_DIR=accounts-disabled, MEDIA_ROOT_DIR=media, STREAM_CONFIG_DIR=stream-users, BILLING_DB_FILE=billing.sqlite, SESSION_DB_FILE=sessions.sqlite, CONFIG_PATH=scene.json.

## Lệnh npm

| Lệnh | Thực hiện |
| --- | --- |
| npm run clean | Xóa dist |
| npm run build | Biên dịch TypeScript từ src sang dist |
| npm start | Chạy Rich Presence |
| npm run multi | Chạy điều phối worker |
| npm run web | Chạy web dashboard |
| npm run status | Chạy worker status |
| npm run dev | Build rồi chạy Rich Presence |

Chạy từ thư mục gốc dự án. Web đọc asset ở src/web theo thư mục làm việc hiện tại; nếu dùng cwd khác, đặt WEB_ASSET_DIR là đường dẫn tuyệt đối.

## Chạy web cục bộ

~~~sh
npm run build
npm run web
~~~

Với cấu hình mặc định, web lắng nghe tại http://127.0.0.1:3210. Các trang chính: /, /dashboard; /home chuyển hướng về /.

Các API đáng chú ý:

- OAuth: GET /auth/discord, GET /auth/discord/callback, POST /auth/logout.
- Phiên/người dùng: GET /api/me, POST /api/session/mode, GET /api/users.
- Cấu hình/media: /api/config, /api/config/toggle, /api/media, /api/media/upload, /api/chat/image, /media/owner/file.
- Billing: /api/billing, /api/billing/buy, /api/billing/renew, /api/billing/plan-payment, /api/billing/deposit, /api/billing/card2k, /api/billing/card2k/callback.
- Dashboard khác: /api/spotify/search, /api/stream, /api/quest, /api/owo, /api/mention-log.

Các route api/admin yêu cầu phiên quản trị. Route còn lại kiểm tra phiên/quyền theo từng endpoint.

## Chạy bằng PM2

~~~sh
npm run build
pm2 start dist/web/index.js --name superutils-web --cwd "$(pwd)"
pm2 start dist/multi/index.js --name superutils --cwd "$(pwd)"
pm2 save
pm2 status
~~~

Sau khi thay đổi .env hoặc build mới:

~~~sh
npm run build
pm2 restart superutils-web --update-env
pm2 restart superutils --update-env
pm2 save
~~~

Nếu chỉ vận hành web, không cần khởi động superutils. Process không tự nhận mã đã build lại cho đến khi restart.

## Dữ liệu runtime

| Đường dẫn mặc định | Nội dung |
| --- | --- |
| accounts/ | Cấu hình và dữ liệu đơn vị do multi quản lý |
| accounts-disabled/ | Dữ liệu đơn vị đã vô hiệu hóa/lưu trữ |
| media/ | Media upload |
| stream-users/ | Dữ liệu stream |
| billing.sqlite | Trạng thái billing; multi bật WAL cho SQLite |
| sessions.sqlite | Phiên web |

Sao lưu sau khi dừng process ghi dữ liệu hoặc dùng cơ chế sao lưu SQLite nhất quán. Không commit dữ liệu runtime, .env hoặc khóa mã hóa.

## Cập nhật và kiểm tra

~~~sh
git pull --ff-only
npm ci
npm run build
pm2 restart superutils-web --update-env
pm2 restart superutils --update-env
pm2 status
pm2 logs superutils-web --lines 100
~~~

Chỉ restart process đang vận hành. git pull --ff-only không ghi đè lịch sử phân nhánh hoặc thay đổi cục bộ.

## Xử lý sự cố

- Web không mở: kiểm tra WEB_HOST, WEB_PORT, trạng thái PM2 và log superutils-web.
- OAuth lỗi: kiểm tra DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI và callback đăng ký phải trùng URL cấu hình.
- Asset web không tải: chạy từ thư mục gốc hoặc đặt WEB_ASSET_DIR hợp lệ.
- Build lỗi: xác nhận node --version, sau đó chạy npm ci và npm run build.
- Multi không nhận dữ liệu: kiểm tra các thư mục cấu hình/media/stream tồn tại và process có quyền đọc ghi.

## Bảo mật

- Hạn chế quyền đọc .env, khóa mã hóa, database và thư mục dữ liệu; ví dụ chmod 600 .env.
- Giữ WEB_HOST=127.0.0.1 và dùng reverse proxy HTTPS nếu cần công khai.
- Không chia sẻ token, secret OAuth, thông tin thanh toán hoặc database runtime.
