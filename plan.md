# ScrapMe — Rencana implementasi

## Produk dan pendekatan

ScrapMe adalah aplikasi web berbahasa Indonesia untuk menemukan, menyusun, menjalankan, meninjau, dan mengekspor request REST API. Pengguna memasukkan URL dokumentasi atau endpoint; aplikasi mendukung deteksi spesifikasi OpenAPI/Swagger, input endpoint manual, autentikasi dan request, hasil JSON/tabel, pagination yang dibatasi, koleksi dan riwayat tanpa menyimpan rahasia.

Frontend React + TypeScript berkomunikasi dengan HTTP API pada server Express starter. Endpoint backend terpisah menangani discovery OpenAPI dan request API tujuan sehingga browser memanggil origin ScrapMe sendiri. Proxy memvalidasi URL dan seluruh hasil DNS, menolak tujuan privat/internal, tidak mengikuti redirect, membatasi metode, waktu, jumlah pemanggilan, ukuran body/response, dan rate limit; request kredensial tidak dicatat ke log maupun history. Collector jaringan debug Preview dinonaktifkan untuk mencegah body request masuk ke log. Browser-facing URL tetap relatif.

Tidak diperlukan database untuk MVP: koleksi dan riwayat non-sensitif berada di localStorage browser; kredensial tidak disimpan atau dipulihkan dari riwayat. Koneksi GitHub langsung akan mengisi repository ScrapMe yang diberikan dan masih kosong. Repo pengguna tetap target remote terpisah; tidak ada pembuatan atau pemindahan canonical repo Manus.

## Struktur proyek

- `client/src/pages/Home.tsx`: dashboard, workspace request, dan hasil.
- `client/src/index.css`: tema gelap, layout responsif, komponen workspace.
- `client/public/scrapme-logo.png`: logo asli yang diberikan pengguna, dibundel agar repository dapat dijalankan mandiri.
- `client/public/manus-routes.json`: deklarasi route halaman yang disajikan statis.
- `server/_core/index.ts`: entry server Express starter; integrasikan route REST ScrapMe tanpa mengganggu health/runtime dan tRPC yang sudah ada.
- `server/api-proxy.ts`: validasi URL/DNS/IP publik, timeout, pembatasan request, discovery dokumentasi OpenAPI, dan proxy request.
- `shared/`: tipe request/response bersama bila diperlukan.
- `plan.md` dan `TODO.md`: keputusan desain/arsitektur dan hasil fitur yang sedang/selesai.

## Arah desain

**Design movement:** dashboard developer berkarakter *neon API workbench* yang mengambil warna robot dan wordmark biru terang pada logo ScrapMe.

**Core principles:** hierarki visual tegas; request dan respons berdampingan; detail teknis mudah dipindai; kontrol sebelum pemanggilan berulang.

**Color philosophy:** kanvas navy hampir hitam memberi kontras dan fokus seperti alat developer; biru elektrik/cyan menjadi aksen identitas dan menunjukkan aksi utama; hijau/kuning/merah hanya untuk status.

**Layout paradigm:** navigasi vertikal tipis untuk koleksi/riwayat, workspace request lebar, dan inspector respons di bawah/kanan. Di mobile, panel ditumpuk; bukan dashboard kartu generik yang terpusat.

**Signature elements:** wordmark/logo ScrapMe dari pengguna; kilau/garis biru tipis untuk aksi dan tab aktif; badge metode HTTP berwarna pada daftar request.

**Interaction philosophy:** tiap request eksplisit, ringkasan batas ditampilkan sebelum pagination, state error menjelaskan sebab dan solusi, dan kredensial sensitif tidak disimpan ke koleksi atau riwayat.

**Animation:** transisi tab dan panel singkat (120–180 ms), status loading berdenyut lembut, tanpa gerakan dekoratif besar; hormati `prefers-reduced-motion`.

**Typography:** sans modern sistem/Inter untuk UI dan heading; JetBrains Mono/system monospace untuk URL, header, JSON, dan kode. Ukuran 12–13 px untuk metadata, 14 px teks UI, 24–32 px heading utama.

**Brand essence:** bengkel request REST yang ramah pemula tetapi cukup jelas untuk workflow developer; sifat: langsung, teliti, bersahabat.

**Brand voice:** headline tegas dan singkat; tombol berupa tindakan; microcopy menjelaskan efek. Contoh: “Racik request. Lihat hasil.” dan “Uji satu request dulu sebelum mengambil beberapa halaman.”

**Wordmark & logo:** gunakan logo PNG ScrapMe persis seperti yang dilampirkan, bukan wordmark teks pengganti; tampilkan pada header sidebar dengan tinggi terjaga dan tanpa pemotongan.

**Signature brand color:** biru elektrik `#168BFF`, disandingkan cyan dari logo `#20D7FF`.

## Lingkup implementasi

MVP mengutamakan input URL, deteksi dokumen OpenAPI umum, pemilihan endpoint, pengaturan metode/query/header/auth/body, tes koneksi, JSON/tabel, pencarian, pemilihan kolom dan ekspor. Pagination berhenti pada batas halaman/rekaman/jeda yang ditentukan pengguna dan memiliki kontrol berhenti. Riwayat menyimpan metadata dan data hasil non-rahasia saja; kredensial tidak disimpan. Koleksi tersimpan lokal tanpa nilai rahasia.

Proxy CORS hanya meneruskan request yang diminta secara eksplisit ke URL HTTPS/HTTP publik yang tervalidasi; proxy tidak melewati login/izin tujuan. Implementasi membatasi redirect agar validasi target diulang, SSRF, rate, waktu, dan ukuran respons. API dapat tetap menolak request karena autentikasi atau kebijakan layanannya.
