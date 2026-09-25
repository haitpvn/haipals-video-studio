# Haipals Video Studio

Công cụ dựng video dọc **9:16 (1080×1920, 30fps, MP4)** cho TikTok / Instagram Reels / Facebook Reels của **Hai & Pals Travel and Visa Ltd**.

👉 **Mở ứng dụng:** https://haitpvn.github.io/haipals-video-studio/

🔒 **Bảo mật:** Mọi thứ chạy ngay trong trình duyệt. Video, ảnh và thông tin khách hàng **không bao giờ được tải lên máy chủ nào**.

---

## Hướng dẫn sử dụng nhanh

> Nên dùng **Google Chrome** hoặc **Microsoft Edge** trên máy tính.

### 1. Thêm clip
- Kéo thả video (MP4, MOV) hoặc ảnh (JPG, PNG) vào ô **“Kéo thả video / ảnh vào đây”**, hoặc bấm vào ô đó để chọn file.
- Đổi thứ tự: kéo thả clip trong danh sách, hoặc bấm ▲ ▼. Bấm ✕ để xoá.
- Video ngang sẽ tự động được đặt vừa chiều ngang, phần trên và dưới là nền mờ (không bị kéo méo).

### 2. Chỉnh từng clip
Bấm vào một clip trong danh sách, rồi ở cột **“Chỉnh clip”**:
- **Cắt clip:** nhập giây bắt đầu / kết thúc, hoặc kéo thanh xem trước tới đúng chỗ rồi bấm **“Đặt đầu tại đây”** / **“Đặt cuối tại đây”**.
- **Ảnh:** chọn số giây hiển thị.
- **Chữ trên video:** gõ **Tiêu đề** (chữ to), **Dòng phụ**, và **Nút màu cam** (không bắt buộc). Chọn vị trí chữ: Trên / Giữa / Dưới. Gõ tiếng Việt có dấu bình thường.
- **Câu lưu ý visa:** tích ô để hiện dòng “Kết quả visa do Đại sứ quán quyết định. Quy định có thể thay đổi.”
- Bấm **“Áp dụng tuỳ chọn này cho tất cả clip”** để dùng cùng vị trí chữ và câu lưu ý cho mọi clip.

Tích **“Hiện vùng an toàn”** dưới khung xem trước để thấy vùng bị che bởi nút bấm của TikTok / Instagram (chữ luôn được tự động đặt trong vùng an toàn).

### 3. Cài đặt chung
- **Thương hiệu:** nhãn nhỏ “Haipals Đi Đâu” ở góc trên bên trái (bật sẵn).
- **Màn hình kết thúc:** bấm **“Tải logo / banner lên”** một lần. Logo được lưu trong trình duyệt, lần sau mở lại vẫn còn. Màn hình kết thúc dài 3 giây, có logo, nút **“Nhắn Haipals ngay”** và **haipals.co.uk**. Bấm **“Xem màn hình kết thúc”** để xem trước.
- **Hiệu ứng:** chọn chuyển cảnh **Không / Mờ dần / Trượt** (0,4 giây), và bật/tắt **zoom nhẹ cho ảnh tĩnh**.
- **Nhạc nền:** chọn một file MP3/M4A/WAV rồi kéo thanh **âm lượng**. Nhạc tự lặp lại nếu ngắn và nhỏ dần ở cuối video. Tiếng gốc của clip vẫn được giữ, trừ clip nào bạn tích **“Tắt tiếng clip này”**.

### 4. Xuất video
- Bấm nút cam **“⬇ Xuất video”** ở góc trên bên phải.
- Lần đầu tiên sẽ tải bộ xử lý video (khoảng 32 MB, các lần sau nhanh hơn).
- Chờ thanh tiến trình chạy tới 100% — **đừng đóng tab** trong lúc xuất. Video 30 giây thường mất khoảng 1–3 phút tuỳ máy.
- Xem lại rồi bấm **“Tải video về máy”**.

### 5. Lưu và làm tiếp
- Bấm **“💾 Lưu dự án”** để tải về một file `.json` chứa thứ tự clip, đoạn cắt, chữ và cài đặt.
- Để làm tiếp: bấm **“📂 Mở dự án”**, chọn file `.json`, rồi bấm **“Chọn lại file”** (hoặc kéo thả) để chọn lại **các video/ảnh/nhạc gốc**. Ứng dụng tự nối lại theo tên file.
- ⚠️ File `.json` **không chứa video**. Hãy giữ các file gốc cùng thư mục và đừng đổi tên chúng.

### Mẹo
- Nếu trình duyệt báo “không xem trước được” (thường gặp với một số video iPhone HEVC), bạn vẫn xuất video bình thường.
- Video càng dài thì xuất càng lâu. Nên để mỗi video khoảng 15–60 giây.
- Máy yếu: đóng bớt các tab khác trong lúc xuất.

---

## Dành cho kỹ thuật

- Vite + JavaScript thuần, [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) bản **single-thread** (chạy được trên GitHub Pages, không cần header COOP/COEP). Bộ xử lý được tự host trong `public/ffmpeg/` khi build.
- Chữ được vẽ bằng `<canvas>` với font **Be Vietnam Pro** (Regular 400, SemiBold 600, ExtraBold 800 – đóng gói qua `@fontsource/be-vietnam-pro`, giấy phép OFL) rồi ghép lên video, nên dấu tiếng Việt luôn hiển thị chuẩn.
- Mỗi clip được dựng thành một đoạn 1080×1920/30fps riêng (nền mờ `boxblur`, video đặt vừa khung, lớp chữ PNG), sau đó ghép lại: dùng stream copy khi không có chuyển cảnh, và `xfade`/`acrossfade` khi có. Nhạc nền được trộn bằng `amix`.
- Vùng an toàn: chữ không bao giờ nằm trong 150px trên cùng, 450px dưới cùng và 120px bên phải (`src/render.js`).
- Chạy thử trên máy: `npm install && npm run dev`. Build: `npm run build` (ra thư mục `dist/`).
- Tự động deploy: mỗi lần push lên nhánh `main`, GitHub Actions (`.github/workflows/deploy.yml`) build và đưa lên GitHub Pages.
  - Lần đầu cần bật: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
