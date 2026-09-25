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

### 3. Xuất video
- Bấm nút cam **“⬇ Xuất video”** ở góc trên bên phải.
- Lần đầu tiên sẽ tải bộ xử lý video (khoảng 32 MB, các lần sau nhanh hơn).
- Chờ thanh tiến trình chạy tới 100% — **đừng đóng tab** trong lúc xuất. Video 30 giây thường mất khoảng 1–3 phút tuỳ máy.
- Xem lại rồi bấm **“Tải video về máy”**.

---

## Dành cho kỹ thuật

- Vite + JavaScript thuần, [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) bản **single-thread** (chạy được trên GitHub Pages, không cần header COOP/COEP). Bộ xử lý được tự host trong `public/ffmpeg/` khi build.
- Chữ được vẽ bằng `<canvas>` với font **Be Vietnam Pro** (Regular 400, SemiBold 600, ExtraBold 800 – đóng gói qua `@fontsource/be-vietnam-pro`, giấy phép OFL) rồi ghép lên video, nên dấu tiếng Việt luôn hiển thị chuẩn.
- Chạy thử trên máy: `npm install && npm run dev`. Build: `npm run build` (ra thư mục `dist/`).
- Tự động deploy: mỗi lần push lên nhánh `main`, GitHub Actions (`.github/workflows/deploy.yml`) build và đưa lên GitHub Pages.
  - Lần đầu cần bật: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
