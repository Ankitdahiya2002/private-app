# LoveChat 💕

A private, real-time chat application built for two people to stay connected in their own secure space. Designed with a beautiful, modern interface and powered by a robust Python/Supabase backend.

## ✨ Features

- **Real-Time Messaging**: Lightning-fast message delivery using WebSockets.
- **Image Sharing**: Upload and share memories seamlessly.
- **Typing Indicators**: See when the other person is typing in real-time.
- **Seen Status**: Know exactly when your messages have been read.
- **Online Presence**: Live online/offline status updates.
- **Message Deletion**: Ability to delete messages (for yourself or for everyone).
- **Responsive Design**: Looks beautiful on desktop and mobile browsers.
- **Custom Dedication**: Personalized UI elements tailored for a special someone.

## 🛠 Tech Stack

- **Backend**: Python, Flask, Flask-SocketIO (WebSocket)
- **Production Server**: Gunicorn with threaded workers (`gthread`)
- **Database**: Supabase (PostgreSQL)
- **Frontend**: Vanilla HTML, CSS, JavaScript (Zero bloat!)

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- Python 3.10+
- A [Supabase](https://supabase.com) account & project

### 2. Setup
Clone the repository:
```bash
git clone https://github.com/Ankitdahiya2002/private-app.git
cd private-app
```

Install dependencies:
```bash
pip install -r requirements.txt
```

### 3. Environment Variables
Copy the `.env.example` file to `.env` and fill in your Supabase credentials:
```bash
cp .env.example .env
```
Inside `.env`:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-service-key
```

### 4. Database Setup
Run the included `supabase_setup.sql` script in your Supabase SQL Editor to create the required tables and security policies.

### 5. Run the App
Start the development server:
```bash
python app.py
```
Open your browser to `http://localhost:5000`.

## ☁️ Production Deployment

The application is fully prepared for production deployment on platforms like Render, Heroku, or a VPS.

### Render / Heroku
1. Connect this repository to your hosting provider.
2. The platform will automatically detect the **`Procfile`**.
3. Add `SUPABASE_URL` and `SUPABASE_KEY` to your Environment Variables dashboard.
4. Deploy!

### VPS (Ubuntu/Linux)
You can easily launch the production server using the included startup script:
```bash
chmod +x start.sh
./start.sh
```

## 🔒 Security
- **No Passwords by Default**: Rooms are meant to be private but rely on shared codes.
- **Row Level Security**: Supabase tables are protected using RLS policies.
- Ensure `.env` is never committed to version control.

---
*Made with ❤️*
