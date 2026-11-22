# MichielEdu - web ôn tập bằng trắc nghiệm

Dự án học tập phi lợi nhuận của Nguyễn Xuân Tùng. Web tĩnh chạy trên GitHub Pages: đưa nguyên thư mục này lên GitHub là chạy. Tên file và thư mục không dấu, phân biệt chữ hoa/thường.

Các mục: Trang chủ, Trắc nghiệm, Trắc nghiệm Tổng, Tài liệu, Sổ ôn tập, Lịch sử.

## Cấu trúc

```
web-hoc-tap/
├─ index.html              trang web duy nhất
├─ giao-dien/
│  ├─ style.css            giao diện dùng chung (có nền sáng và tối)
│  └─ app.js               code dùng chung cho mọi môn
├─ du-lieu/
│  ├─ danh-sach-mon.json   danh sách môn học
│  └─ <ma-mon>.json        câu hỏi của từng môn (vd: mang-may-tinh.json)
├─ tai-lieu/<ma-mon>/      file PDF tóm tắt của môn đó
├─ hinh/
│  ├─ logo.svg             logo MichielEdu (biểu tượng tab trình duyệt)
│  └─ mon/<ma-mon>.svg     biểu tượng của từng môn
├─ images/                 ảnh cá nhân dùng ở trang chủ (anh-dai-dien.jpg)
└─ thu-vien/katex/         thư viện vẽ công thức toán (không cần mạng)
```

## Thêm hoặc sửa nội dung
- Sửa câu hỏi: sửa file `du-lieu/<ma-mon>.json`, giữ nguyên `id` câu, tăng `phien_ban`.
- Thêm môn: đặt `<ma-mon>.json` vào `du-lieu/`, khai báo trong `danh-sach-mon.json` (`ma_mon`, `ten`, `khu`, `file_cau_hoi`, `icon`, `tai_lieu`).
- Thêm tài liệu: chép PDF vào `tai-lieu/<ma-mon>/`, thêm một dòng vào `tai_lieu` của môn, dạng
  `{ "ten": "Chương 1 - ...", "loai": "Tóm tắt", "chuong": "c1", "file": "tai-lieu/<ma-mon>/tt-chuong-01-....pdf" }`.
  `chuong` là id chương để hiện nút “Tóm tắt” cạnh chương đó.
- Biểu tượng môn: hình SVG nét một màu trong `hinh/mon/`, web tự tô màu. Chi tiết trong “Quy định tổng cho website”.

## Lưu ý
- Mở `index.html` bằng cách bấm đúp sẽ KHÔNG đọc được file .json (trình duyệt chặn). Xem trên GitHub Pages hoặc chạy server nhỏ (vd: VS Code + Live Server).
- Tiến độ, điểm, Sổ ôn tập, lịch sử và lựa chọn sáng/tối chỉ lưu trong trình duyệt của từng máy.
