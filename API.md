# API Placeholder

Dùng placeholder bằng cách viết `{key}` trong `text-1`, `text-2`, `text-3`.
Key không có dữ liệu sẽ hiện `N/A`.

## Thời gian

| Placeholder | Ý nghĩa |
|---|---|
| `{hour:1}` | Giờ dạng 24h, ví dụ `23` |
| `{hour:2}` | Giờ dạng 12h, ví dụ `11` |
| `{min:1}` | Phút, ví dụ `05` |
| `{min:2}` | Phút kèm AM/PM, ví dụ `05 PM` |
| `{en=date}` | Ngày dạng ordinal, ví dụ `26th` |
| `{th=date}` | Ngày trong tháng |
| `{en=week:1}` | Thứ viết tắt |
| `{en=week:2}` | Thứ đầy đủ |
| `{en=month:1}` | Số tháng 2 chữ số |
| `{th=month:1}` | Số tháng |
| `{en=month:2}` | Tháng viết tắt |
| `{en=month:3}` | Tháng đầy đủ |
| `{en=year:1}` | Năm 2 số |
| `{en=year:2}` | Năm 4 số |

## Thời tiết

Dữ liệu lấy theo `setup.city`. Giá trị dưới đây được cập nhật từ `Đồng Tháp`.

| Placeholder | Ý nghĩa | Giá trị hiện tại |
|---|---|---|
| `{city}` | Thành phố | `Đồng Tháp` |
| `{region}` | Khu vực/tỉnh | `Đồng Tháp` |
| `{country}` | Quốc gia | `Vietnam` |
| `{temp:c}` | Nhiệt độ C | `25` |
| `{temp:f}` | Nhiệt độ F | `77` |
| `{wind:kph}` | Tốc độ gió km/h | `19` |
| `{wind:mph}` | Tốc độ gió mph | `12` |
| `{wind:degree}` | Góc gió | `266` |
| `{wind:dir}` | Hướng gió | `W` |
| `{pressure:mb}` | Áp suất mbar | `1011` |
| `{pressure:in}` | Áp suất inHg | `30` |
| `{precip:mm}` | Lượng mưa mm | `2.7` |
| `{precip:in}` | Lượng mưa inch | `0.1` |
| `{gust:kph}` | Gió giật km/h | `12` |
| `{gust:mph}` | Gió giật mph | `8` |
| `{feelslike:c}` | Nhiệt độ cảm nhận C | `19` |
| `{feelslike:f}` | Nhiệt độ cảm nhận F | `66` |
| `{windchill:c}` | Nhiệt độ gió lạnh C | `25` |
| `{windchill:f}` | Nhiệt độ gió lạnh F | `77` |
| `{heatindex:c}` | Chỉ số nhiệt C | `28` |
| `{heatindex:f}` | Chỉ số nhiệt F | `82` |
| `{dewpoint:c}` | Điểm sương C | `24` |
| `{dewpoint:f}` | Điểm sương F | `75` |
| `{vis:km}` | Tầm nhìn km | `8` |
| `{vis:mi}` | Tầm nhìn mile | `4` |
| `{humidity}` | Độ ẩm | `91` |
| `{cloud}` | Mức độ mây % | `71` |
| `{uv}` | Chỉ số UV | `7` |
| `{co}` | CO | `312` |
| `{no2}` | NO2 | `4.2` |
| `{o3}` | O3 | `77` |
| `{so2}` | SO2 | `5.8` |
| `{pm2.5}` | PM2.5 | `11.6` |
| `{pm10}` | PM10 | `13.2` |

## Người dùng / Server / Emoji

| Placeholder | Ý nghĩa |
|---|---|
| `{user:name}` | Username Discord đang đăng nhập |
| `{guild=members:SERVER_ID}` | Số thành viên server trong cache |
| `{guild=name:SERVER_ID}` | Tên server trong cache |
| `{guild=icon:SERVER_ID}` | Icon server trong cache |
| `{emoji:random}` | Emoji ngẫu nhiên |
| `{emoji:time}` | Emoji theo thời gian trong ngày |
| `{emoji:clock}` | Emoji đồng hồ theo giờ |

## Ảnh RPC

`bigimg` và `smallimg` hỗ trợ:

- Discord CDN: `https://cdn.discordapp.com/attachments/...`
- Discord media proxy: `https://media.discordapp.net/attachments/...`
- URL ngoài như Postimg: tự chuyển sang `mp:external/...`
- Media proxy sẵn: `mp:external/...`
- Dạng đặc biệt: `youtube:VIDEO_ID`, `spotify:IMAGE_ID`, `twitch:USERNAME`

Discord CDN/media URL sẽ được dùng trực tiếp. URL ngoài Discord sẽ được chuyển qua Discord external asset trước khi gửi RPC.

## Timestamp

Trong `scene.json`:

```json
"startTimeStamp": "",
"endTimeStamp": null
```

Hỗ trợ:

- `dd/mm/yyyy`
- `dd-mm-yyyy`
- ISO string
- timestamp millisecond
- `null` để tắt
