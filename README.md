# Personal Financial Tracker

## 1. Project and Features
Personal Financial Tracker is a full-stack app to track income, expenses, and subscriptions with monthly reporting.

Features:
- JWT-based authentication (signup/login/logout) with HTTP-only auth cookie sessions
- Per-user transaction isolation (each user can only access their own transactions)
- Add, edit, and delete transactions
- Separate `Name`, `Category`, `Type`, `Amount`, and `Description` fields
- Search and filter transactions by text, type, category, and date range
- Monthly summary cards (income, expenses, net, transaction count)
- Monthly report split by:
  - Income by category
  - Expenses & subscriptions by category
- Export monthly report to PDF with:
  - Branded header and summary cards
  - Category breakdown sections
  - Monthly transactions table with borders, headers, and pagination
- Dark mode toggle

## 2. Tech Stack
- Frontend: React (Create React App), CSS
- Backend: Node.js, Express
- Database: MongoDB with Mongoose
- PDF Export: jsPDF

## 3. Run Locally
1. Clone the repository and go to the project root:
   ```bash
   git clone <your-repo-url>
   cd Rishabh-finance-tracker
   ```
2. Install backend dependencies:
   ```bash
   npm install
   ```
3. Install frontend dependencies:
   ```bash
   cd finance-tracker-frontend
   npm install
   cd ..
   ```
4. Create backend environment file at `.env`:
   ```env
   MONGO_URI=mongodb://127.0.0.1:27017/finance-tracker
   PORT=5001
   JWT_SECRET=replace-with-a-long-random-secret
   ```
5. Create frontend environment file at `finance-tracker-frontend/.env`:
   ```env
   REACT_APP_API_BASE_URL=http://localhost:5001
   ```
6. Start MongoDB locally (make sure `mongod` is running).
7. Start backend from project root:
   ```bash
   node server.js
   ```
8. In a new terminal, start frontend:
   ```bash
   cd finance-tracker-frontend
   npm start
   ```
9. Open `http://localhost:3000`.

## 4. Deploy (Vercel + MongoDB Atlas)
### Architecture
- Backend: Vercel project from repo root (`/`)
- Frontend: Vercel project from `finance-tracker-frontend`
- Database: MongoDB Atlas M0 cluster

### Production environment variables
Backend (Vercel project at repo root):
```env
MONGO_URI=mongodb+srv://<user>:<password>@<cluster-url>/finance-tracker?retryWrites=true&w=majority
JWT_SECRET=<long-random-secret>
ALLOWED_ORIGINS=https://budget.rishabhdoshi.me
ALLOW_VERCEL_PREVIEWS=true
```

Frontend (Vercel project at `finance-tracker-frontend`):
```env
REACT_APP_API_BASE_URL=https://<backend-project>.vercel.app
```

### Deployment steps
1. Create MongoDB Atlas M0 cluster.
2. Create a DB user and copy the SRV connection string for `MONGO_URI`.
3. In Atlas Network Access, allow `0.0.0.0/0` (quick-launch setup).
4. Create Vercel project for backend:
   - Import this repository
   - Root Directory: `/`
   - Add backend environment variables above
5. Create Vercel project for frontend:
   - Import the same repository
   - Root Directory: `finance-tracker-frontend`
   - Add `REACT_APP_API_BASE_URL` pointing to backend URL
6. Enable GitHub auto-deploy from `main` for both projects.

### Custom domain (`budget.rishabhdoshi.me`)
1. In Vercel, open the **frontend** project.
2. Go to **Settings → Domains** and add `budget.rishabhdoshi.me`.
3. Add the DNS record your Vercel domain screen shows (usually a `CNAME` for `budget`).
4. In backend Vercel env vars, set:
   - `ALLOWED_ORIGINS=https://budget.rishabhdoshi.me`
5. Redeploy backend so updated CORS settings are active.

### CORS behavior in production
- Requests with no `Origin` header are allowed.
- Requests from `ALLOWED_ORIGINS` are allowed.
- If `ALLOW_VERCEL_PREVIEWS=true`, `https://*.vercel.app` preview origins are allowed.
