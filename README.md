# AWS Route 53 Clone

A full-stack DNS management application inspired by Amazon Route 53. It allows users to create and manage hosted zones, perform DNS record operations, and import or export DNS records using BIND zone files.

## Features

- Create, view, update, and delete hosted zones.
- Manage DNS records with CRUD operations.
- Support for A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, and CAA records.
- Search and filter DNS records.
- Pagination for DNS records.
- Import DNS records from BIND zone files.
- Export hosted zone records as BIND files.
- Interactive web interface inspired by the AWS console.

## Tech Stack

**Frontend:** Next.js, React, TypeScript, CSS

**Backend:** Python, FastAPI

**Database:** SQLite, SQLAlchemy

## Project Structure

```text
route53-clone/
├── backend/
│   ├── main.py
│   ├── models.py
│   ├── schemas.py
│   ├── database.py
│   └── bind_utils.py
└── frontend/
    └── app/
        └── page.tsx
```

## Run Locally

### Backend

```bash
cd backend
python -m venv venv
```

Activate the environment on Windows:

```powershell
.\venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install fastapi uvicorn sqlalchemy pydantic python-multipart
```

Start the server:

```bash
uvicorn main:app --reload
```

Backend API: `http://127.0.0.1:8000`

API documentation: `http://127.0.0.1:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:3000`

## Database

The application uses SQLite with SQLAlchemy ORM. Database tables are created automatically when the backend starts.

## DNS Record Management

The application supports creating, editing, deleting, searching, and filtering DNS records within hosted zones.

## BIND File Support

Hosted zone records can be exported into BIND zone-file format and imported from `.zone` or `.txt` files.

## Purpose

This project demonstrates full-stack development, REST API design, database integration, DNS record management, and frontend-backend communication.