# ScrapMe — Spesifikasi MVP

## Ringkasan

**ScrapMe** adalah API workbench web berbahasa Indonesia untuk menemukan endpoint dari dokumentasi OpenAPI/Swagger, menyusun request REST, meninjau respons, dan mengekspor data tanpa harus menulis kode. Pengguna memasukkan URL dokumentasi atau endpoint API; jika spesifikasi yang didukung ditemukan, endpoint dapat dipilih dari daftar. Jika tidak, URL endpoint dapat diisi manual.

ScrapMe ditujukan untuk API publik dan API yang memang pengguna berhak akses. Proxy membantu menangani batas CORS browser; proxy tidak melewati autentikasi, izin akses, atau ketentuan layanan API tujuan.

## Tujuan produk

- Membuat pengujian endpoint REST mudah dilakukan melalui frontend.
- Mendeteksi spesifikasi OpenAPI/Swagger JSON yang tersedia dan menyiapkan daftar endpoint.
- Menyediakan request builder untuk metode, parameter, header, autentikasi, dan body.
- Menampilkan dan mengekspor respons dengan format yang mudah diperiksa.
- Menangani CORS melalui proxy backend yang dibatasi, bukan dengan mematikan proteksi browser.

## Alur pengguna

1. Pengguna memasukkan URL dokumentasi atau URL endpoint API pada **API Explorer**.
2. Tombol **Analisis API** memeriksa URL yang dimasukkan dan lokasi umum OpenAPI/Swagger JSON. Discovery dapat dihentikan. Jika dokumentasi tidak ditemukan, pengguna tetap dapat menguji endpoint secara manual.
3. Pengguna memilih endpoint yang terdeteksi atau mengatur URL dan metode HTTP (`GET`, `POST`, `PUT`, `PATCH`, atau `DELETE`).
4. Pengguna dapat menambahkan query params, header, Bearer token atau API key, dan body JSON/teks sesuai metode.
5. Aksi **Kirim request** menguji endpoint dengan konfigurasi yang dipilih; status, waktu, ukuran, dan body respons ditampilkan. ScrapMe tidak mengirim preflight atau request uji tersembunyi sebelum aksi ini.
6. Jika mengambil data bertahap, panel pagination memperlihatkan batas halaman, perkiraan jumlah record, dan jeda sebelum **Mulai pagination**. Pagination hanya memakai `GET`, membatasi jumlah halaman dan ukuran per halaman, menunggu jeda yang dipilih, menggabungkan hasil, dan menyediakan **Hentikan**.
7. Pengguna meninjau JSON atau tabel, mencari hasil, memilih kolom CSV, menyalin respons, atau mengekspor JSON/CSV.
8. Metode dan URL disimpan sebagai koleksi/riwayat lokal; nilai kredensial, body, dan isi respons tidak ikut disimpan.

## Rancangan frontend

### Navigasi

- **API Explorer** — analisis dokumentasi, request builder, pagination, dan response.
- **Koleksi** — shortcut metode dan URL yang disimpan secara lokal.
- **Riwayat** — metadata request terakhir pada browser yang sama.

### Request builder

Panel request menyediakan metode HTTP dasar `GET`, `POST`, `PUT`, `PATCH`, dan `DELETE`; query params dan header khusus yang dapat ditambah, diaktifkan/dinonaktifkan, dan dihapus; autentikasi tanpa kredensial, Bearer token, atau API key pada header/query; body untuk `POST`, `PUT`, dan `PATCH`; serta tombol kirim/hentikan untuk request aktif. Metode `GET` dan `DELETE` tidak mengirim body.

### Hasil

ScrapMe menampilkan status HTTP, waktu, ukuran respons, dan URL dengan nilai query sensitif yang dikenali disamarkan. Pengguna dapat berpindah antara JSON dan tabel, mencari hasil, memilih kolom, menyalin, serta mengekspor JSON/CSV. Sel teks yang berpotensi ditafsirkan sebagai formula spreadsheet dinetralkan saat ekspor CSV. Pratinjau tabel dibatasi hingga 200 baris yang terlihat sekaligus; ekspor menggunakan seluruh hasil yang tersedia. Redirect ditunjukkan kepada pengguna, tetapi tidak diikuti otomatis.

## Proxy backend dan CORS

Browser memanggil endpoint relatif pada origin ScrapMe (`/api/request` atau `/api/discover`); server ScrapMe memvalidasi dan meneruskan request ke API tujuan. Ini menghindari pembatasan CORS browser untuk request yang diizinkan pengguna, tetapi tidak mengganti autentikasi API tujuan.

Proxy hanya mengizinkan HTTP/HTTPS pada port standar 80/443. URL harus memiliki DNS/IP publik; loopback, jaringan privat/internal, link-local, dan host lokal ditolak. Hasil DNS divalidasi dan koneksi memakai alamat IP yang sudah dipin. Request API dibatasi hingga 60 request per alamat IP per menit; hanya metode yang didukung dan header non-transport yang diteruskan. Ukuran body maksimal 256 KB, ukuran respons maksimal 1 MB, dan timeout maksimal 15 detik. Redirect upstream tidak diikuti otomatis agar target baru tidak melewati validasi. Pembatalan request diteruskan ke upstream, termasuk discovery.

Origin pemanggil harus cocok persis dengan daftar comma-separated `SCRAPME_ALLOWED_ORIGINS`; wildcard tidak didukung. Development mengizinkan `localhost:3000` dan `127.0.0.1:3000` secara default, sedangkan production menolak request bila origin publik belum dikonfigurasi. Fetch Metadata lintas-situs juga ditolak. Origin allowlist adalah pertahanan CSRF browser, bukan sistem login; deployment publik tetap perlu mempertimbangkan autentikasi aplikasi dan pembatasan penggunaan tambahan sesuai audiensnya. Rate limit MVP disimpan per proses, bukan terdistribusi lintas instance.

Proxy tidak ditujukan untuk mengakses data tanpa izin, melewati autentikasi, atau mengakali kebijakan/rate limit API tujuan.

## Data dan privasi

Koleksi dan riwayat non-rahasia disimpan di `localStorage` browser. Header, body, isi respons, dan nilai autentikasi tidak disimpan ke riwayat/koleksi. Kredensial hanya bertahan dalam state frontend selama sesi aktif dan dikirim untuk request yang diminta pengguna; kredensial tidak dipulihkan dari koleksi/riwayat. Collector jaringan debug bawaan Preview dinonaktifkan untuk mencegah body request masuk ke log.

Penyamaran URL query memakai pola nama umum seperti key, token, secret, auth, password, credential, session, signature, `sig`, code, dan JWT. Ini heuristik, bukan jaminan untuk setiap nama parameter; jangan menaruh secret dalam URL jika dapat dikirim melalui header autentikasi. API tujuan tetap dapat menerima dan memproses kredensial/parameter sesuai request, sehingga pengguna harus memeriksa target dan izin aksesnya.

## Batas MVP yang diketahui

Discovery menerima dokumen OpenAPI/Swagger dalam JSON dari URL yang dimasukkan atau path umum: `/openapi.json`, `/swagger.json`, `/v3/api-docs`, `/api-docs`, dan `/swagger/v1/swagger.json`. YAML, autentikasi terpisah untuk mengambil dokumentasi, dan resolusi `$ref` eksternal belum didukung. Pagination otomatis menyediakan pola `page + pageSize` atau `offset + limit`; cursor/pagination khusus perlu diatur di luar MVP. ScrapMe tidak merayapi seluruh halaman/link situs dan tidak melakukan enumerasi endpoint tanpa batas.

## Kriteria keberhasilan MVP

- Pengguna dapat menguji endpoint REST melalui antarmuka berbahasa Indonesia, dengan metode dan konfigurasi request dasar.
- Dokumen OpenAPI/Swagger JSON yang didukung dapat menghasilkan endpoint yang bisa dipilih; input manual tersedia sebagai fallback.
- Pengguna dapat membaca status dan respons JSON/tabel, mencari hasil, memilih kolom, serta menyalin/mengekspor data.
- Pagination memperlihatkan batas dan jeda, dibatasi, dapat dihentikan, dan tidak menjalankan metode selain `GET`.
- Koleksi/riwayat membantu pemakaian ulang tanpa menyimpan nilai kredensial atau isi respons.
- Proxy menolak tujuan privat/internal dan membatasi origin, redirect, metode, ukuran, waktu, serta laju request.
