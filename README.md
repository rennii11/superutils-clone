# superutils-clone

## Yêu cầu

- Node.js 22 trở lên
- npm
- PM2 nếu chạy nền

## Cài đặt

```sh
git clone git@github.com:rennii11/superutils-clone.git
cd superutils-clone
npm ci
cp .env.example .env
```

Mở `.env` và điền các biến cần thiết. Các giá trị `CONFIG_PATH`, `WEB_HOST` và `WEB_PORT` được giữ từ cấu hình gốc. Các key còn lại có chú thích tiếng Việt trong `.env.example`.

## Build

```sh
npm run build
```

## Chạy web cục bộ

```sh
npm run web
```

Web mặc định lắng nghe tại `WEB_HOST:WEB_PORT` trong `.env`.

## Chạy web bằng PM2

```sh
npm install -g pm2
pm2 start dist/web/index.js --name superutils-web --cwd "$(pwd)"
pm2 save
pm2 status
```

Khởi động lại sau khi sửa `.env` hoặc build mới:

```sh
npm run build
pm2 restart superutils-web --update-env
pm2 save
```

## Tên process của bản gốc

| Process | Entry point | Vai trò |
| --- | --- | --- |
| `superutils` | `dist/multi/index.js` | Worker đa tính năng |
| `superutils-web` | `dist/web/index.js` | Web server |
| `superutils-voice` | `dist/multi/index.js` | Worker voice |

Repository sạch không chứa `accounts/`, `accounts-disabled/`, `stream-users/`, token hoặc dữ liệu người dùng. Vì vậy chỉ `superutils-web` có lệnh khởi chạy trong hướng dẫn này.
