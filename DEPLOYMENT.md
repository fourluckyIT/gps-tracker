# GPS Tracker - VPS Deployment Guide

This guide will help you deploy the GPS Tracker application to a Virtual Private Server (VPS) running Ubuntu/Debian.

## Prerequisites

- A VPS (DigitalOcean, Vultr, AWS, etc.)
- SSH access to your VPS
- Domain name (optional, but recommended for HTTPS)

## 1. Prepare Your Server

Connect to your VPS:
```bash
ssh root@your_vps_ip
```

Update packages:
```bash
sudo apt update && sudo apt upgrade -y
```

Install valid tools:
```bash
sudo apt install -y git curl build-essential
```

## 2. Install Node.js (via NVM)

We recommend using NVM (Node Version Manager) to install Node.js:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

Verify installation:
```bash
node -v
npm -v
```

## 3. Install PM2 (Process Manager)

PM2 keeps your app running in the background.

```bash
npm install -g pm2
```

## 4. Setup Project

Clone your repository (replace with your actual repo URL):
```bash
git clone <YOUR_REPO_URL> gps-tracker
cd gps-tracker
```

*If you haven't pushed your code to GitHub yet, you can upload files manually using SFTP (e.g., FileZilla).*

Install dependencies:
```bash
npm install
```

Build the Next.js app:
```bash
npm run build
```

## 5. Start the Application

We use the `ecosystem.config.js` file included in the project.

```bash
pm2 start ecosystem.config.js
```

Save the PM2 list so it restarts on reboot:
```bash
pm2 save
pm2 startup
```
(Run the command output by `pm2 startup` if prompted).

## 6. (Optional) Setup Nginx with SSL

If you want to access your site via a domain (e.g., `tracker.example.com`) instead of `http://IP:3000`.

Install Nginx:
```bash
sudo apt install -y nginx
```

Create a config:
```bash
sudo nano /etc/nginx/sites-available/gps-tracker
```

Paste this (replace `your_domain.com`):
```nginx
server {
    listen 80;
    server_name your_domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable it:
```bash
sudo ln -s /etc/nginx/sites-available/gps-tracker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Secure with Certbot (SSL):
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your_domain.com
```

## 7. Useful Commands

- View logs: `pm2 logs gps-tracker`
- Restart app: `pm2 restart gps-tracker`
- Stop app: `pm2 stop gps-tracker`
- Monitor: `pm2 monit`
