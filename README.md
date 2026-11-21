# ScrapMe



ScrapMe adalah API workbench berbahasa Indonesia untuk menemukan spesifikasi OpenAPI/Swagger, menyusun request REST, membaca respons, dan mengekspor hasil.



## Fitur



- Analisis URL untuk lokasi dokumentasi JSON OpenAPI/Swagger umum; endpoint dapat dipilih dari daftar atau diisi manual.
- 
- Request `GET`, `POST`, `PUT`, `PATCH`, dan `DELETE` dengan query params, custom headers, Bearer token, API key, dan body.
- 
- Tampilan response JSON/tabel, pencarian, pemilihan kolom, salin, ekspor JSON/CSV, serta status/waktu/ukuran.
- 
- Pagination terbatas: maksimum 20 request berurutan, 100 record per halaman, jeda minimum 250 ms, hasil halaman digabung, dan kontrol berhenti.
- 
- Koleksi dan riwayat lokal browser; kredensial, body request, dan isi response tidak disimpan.
- 
- Proxy server-side untuk batas CORS browser, dengan validasi alamat DNS/IP publik, blokir target internal/private, tanpa redirect, rate limit, batas ukuran, dan timeout.
- 


## Menjalankan lokal



Butuh Node.js 20 atau lebih baru dan pnpm 10. Di root repository:



```sh

pnpm install

pnpm dev

```



Buka `http://localhost:3000`. Untuk produksi, jalankan `pnpm build` lalu `pnpm start`. Server mendengarkan pada variabel `PORT` jika diatur, atau port 3000 secara default. MVP tidak memerlukan database.



## Batas keamanan proxy



Proxy ditujukan untuk API publik atau API yang pengguna berwenang akses. Hanya HTTP/HTTPS pada port standar 80/443 yang diteruskan. URL harus terselesaikan ke alamat global publik; target privat/internal, metadata cloud, host lokal, kredensial yang disisipkan dalam URL, custom header transport, dan redirect otomatis ditolak. Respons dibatasi 1 MB dan timeout maksimum 15 detik. API tujuan tetap dapat menolak request, memerlukan autentikasi, atau membatasi pemakaian.



API key/Bearer token hanya digunakan untuk request aktif dan tidak disimpan UI ke koleksi/riwayat. Jangan gunakan proxy untuk mengakses data tanpa izin atau untuk melewati autentikasi dan aturan layanan.



Origin browser harus sama persis dengan salah satu nilai `SCRAPME_ALLOWED_ORIGINS` (daftar origin dipisahkan koma, tanpa wildcard). Mode development mengizinkan `localhost:3000` dan `127.0.0.1:3000`; production gagal tertutup sampai origin publik aplikasi diatur, misalnya `SCRAPME_ALLOWED_ORIGINS=https://scrapme.example.com`. Lihat `.env.example`.



Allowlist Origin adalah pertahanan CSRF untuk browser, bukan sistem login atau otorisasi pengguna. Batas 60 request per menit disimpan per proses, sehingga deployment multi-instance memerlukan rate limiting terpusat dan aplikasi yang hanya untuk pengguna tertentu memerlukan kontrol akses tambahan.



Collector jaringan debug bawaan untuk Preview sengaja tidak dipasang karena dapat menangkap body request. Spesifikasi produk, batasan MVP, dan perilaku privasi dijelaskan di [`SPECIFICATION.md`](./SPECIFICATION.md); status acceptance ada di [`TODO.md`](./TODO.md).



## Catatan MVP



Pencarian spesifikasi saat ini memeriksa URL yang dimasukkan serta beberapa path JSON umum: `/openapi.json`, `/swagger.json`, `/v3/api-docs`, `/api-docs`, dan `/swagger/v1/swagger.json`. YAML, referensi `$ref` eksternal, autentikasi khusus dokumentasi, pola pagination non-umum, dan pagination cursor memerlukan dukungan lanjutan.







