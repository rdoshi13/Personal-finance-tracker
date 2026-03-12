# Personal Financial Tracker

## 1. Project and Features
Personal Financial Tracker is a full-stack app to track income, expenses, and subscriptions with monthly reporting.

Features:
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
