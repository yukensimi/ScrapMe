# TODO ScrapMe

Status berikut mencerminkan implementasi MVP pada repository ini. Aksi **Kirim request** adalah uji endpoint dengan konfigurasi yang dipilih; tidak ada request uji tersembunyi atau preflight dari aplikasi.

## Dashboard dan identitas ScrapMe — selesai
- [x] Gunakan nama ScrapMe dan logo yang diberikan pengguna; tidak memakai nama atau logo API Scout.
- [x] Sediakan antarmuka utama berbahasa Indonesia dengan layout responsif untuk API Explorer, koleksi, dan riwayat.
- [x] Sediakan petunjuk izin penggunaan, ringkasan batas, status/loading, dan pesan error yang menjelaskan langkah berikutnya.

## Temukan API dan susun request — selesai
- [x] Analisis URL dokumentasi OpenAPI/Swagger JSON pada URL yang diberikan dan path umum; tampilkan endpoint yang ditemukan. Jika tidak ditemukan, izinkan pengguna mengisi endpoint manual.
- [x] Dukung `GET`, `POST`, `PUT`, `PATCH`, dan `DELETE`, query params, header, Bearer token, API key pada header/query, serta body untuk metode yang mendukungnya.
- [x] Izinkan pengguna menjalankan request secara eksplisit dan menampilkan status, waktu, ukuran, serta respons dari API tujuan.

## Proxy backend terkendali — selesai
- [x] Teruskan request terpilih melalui backend ScrapMe agar request yang diizinkan tidak bergantung pada CORS browser.
- [x] Validasi URL, skema dan port; resolusi DNS harus publik dan koneksi memakai IP hasil validasi. Tolak alamat localhost, loopback, private, link-local, dan jaringan internal.
- [x] Cocokkan Origin pemanggil secara tepat dengan `SCRAPME_ALLOWED_ORIGINS`, tolak Fetch Metadata lintas-situs, dan batasi metode, header transport, laju request, timeout, serta ukuran body/response; jangan mengikuti redirect otomatis.
- [x] Jangan menyimpan kredensial di bundle, localStorage, koleksi, riwayat, atau log jaringan debug; teruskan penghentian request ke upstream.
- [x] Jelaskan bahwa proxy bukan cara untuk melewati autentikasi, kontrol akses, atau kebijakan API tujuan.

## Tampilkan, pilih, dan ekspor hasil — selesai
- [x] Tampilkan body dalam mode JSON atau tabel dengan pencarian.
- [x] Sediakan pemilihan kolom, penyalinan respons, dan ekspor JSON/CSV.
- [x] Batasi pratinjau tabel serta tampilkan informasi respons dan pemberitahuan bila redirect diblokir.

## Pagination, koleksi, dan riwayat — selesai
- [x] Tampilkan pratinjau jumlah request/record dan jeda sebelum pagination; batasi maksimum 20 halaman, 100 record per halaman, dan hanya jalankan pagination berurutan untuk `GET`.
- [x] Sediakan jeda terpilih, penggabungan hasil, progres, dan tombol berhenti; pola bawaan adalah `page + pageSize` atau `offset + limit`.
- [x] Simpan koleksi dan riwayat lokal hanya di browser ini. Jangan simpan header, body, nilai token, maupun isi response; samarkan nilai query yang dikenali sensitif.

## Batasan yang belum masuk MVP
- [ ] Tambahkan YAML, `$ref` eksternal, autentikasi saat mengambil dokumen, dan pola pagination cursor/custom bila diperlukan.
- [ ] Tambahkan profil/pengaturan tersimpan atau akun pengguna hanya jika kelak diperlukan; MVP tidak mengunggah koleksi/riwayat ke server.
