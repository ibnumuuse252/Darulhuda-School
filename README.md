# Qiimeynta Macallimiinta — Railway Deploy

## 1. Ku shub GitHub (ama Railway CLI)
Ku dar folder-kan repo GitHub cusub, ama isticmaal Railway CLI si toos ah loogu shubo.

## 2. Railway — samee project
1. railway.app → **New Project** → **Deploy from GitHub repo** (ama "Empty Project" haddii aad CLI isticmaalayso)
2. Ku dar **PostgreSQL** plugin: *New* → *Database* → *Add PostgreSQL*
3. U tag (Connect) service-ka backend-ka ee `DATABASE_URL` — Railway wuxuu si toos ah u geliyaa variable-ka marka aad isku xidho.

## 3. Environment Variables (Settings → Variables)
Ku dar labadan variable ee service-ka backend-ka:

| Variable | Qiimaha |
|---|---|
| `ADMIN_PASSWORD` | Sirta aad maamulka ku gali doonto (dooro mid adag) |
| `DATABASE_URL` | Waa la geliyaa si toos ah marka Postgres la xidho |

## 4. Deploy
Railway wuxuu si otomaatig ah u aqoonsan doonaa `package.json` ee `npm start` ku shaqeynaysa. Kadib deploy-ka:

- **Maamulka**: `https://<magaca-domain-kaaga>.up.railway.app/` — geli `ADMIN_PASSWORD`
- **Link Macallinka**: markaad macallin ku darto Maamulka, wuxuu kuu soo saarayaa link gaar ah oo qaabkiisu yahay `https://<domain>/t/<token>` — u dir macallinkaas isaga, wuxuu ku arki karaa oo kaliya xogtiisa (wax ma beddeli karo).

## 5. Xog Muhiim Ah
- Xogta oo dhan waxay ku kaydsan tahay Postgres (Railway) — si joogto ah bay u sii jirtaa.
- Link-ka macallinku waa mid gaar ah (token random ah) — haddii aad walaac ka qabto in la ogaado, waad tirtiri kartaa macallinka oo mid cusub abuuri kartaa si link cusub loo dhaliyo.
- Haddii aad rabto inaad is-badasho sirta maamulka, beddel `ADMIN_PASSWORD` Railway variables-ka, dabadeedna kula xiriir dhammaan maamulayaasha si ay u geliyaan sirta cusub (localStorage-kooda waa la nadiifiyaa markay galaan sirta qalad).

## 6. Local testing (ikhtiyaari)
```bash
npm install
export DATABASE_URL="postgres://user:pass@localhost:5432/dbname"
export ADMIN_PASSWORD="testpass123"
npm start
```
