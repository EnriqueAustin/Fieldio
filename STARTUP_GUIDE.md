# Startup Guide

Follow these instructions to run the Fieldio application on your local machine.

## Prerequisites

Before starting, ensure you have the following installed:

1.  **Node.js** (Version 18 or higher)
    *   Verify with: `node -v`
2.  **npm** (Installed with Node)
    *   Verify with: `npm -v`
3.  **Docker Desktop** (For Database and Redis)
    *   Verify with: `docker -v`
    *   **Ensure Docker Desktop is running.**

## Quick Start (The "Happy Path")

1.  **Install Dependencies** (Run from root folder `Fieldio`)
    ```bash
    npm install
    ```

2.  **Start Database** (Docker must be running)
    ```bash
    docker-compose up -d
    ```

3.  **Setup Database** (Runs migration & seeds data)
    ```bash
    npm run db:migrate
    npm run db:seed
    ```

4.  **Start App**
    ```bash
    npm run dev
    ```

    - Web: http://localhost:3000
    - API: http://localhost:3001

## 5. Troubleshooting

*   **"EADDRINUSE" Error**: This means port 3000 or 3001 is already taken. Stop other running node processes.
*   **Database Connection Error**: Ensure Docker is running and you ran `docker-compose up`.
*   **"Missing Module" Errors**: Run `npm install` again in the root directory.
*   **Typescript Errors**: If you see type errors, try running `npm run build` to verify checking or restart the dev server.
