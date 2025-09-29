# Task Management System (RBAC) – Quickstart

## Prerequisites

- Node 18.16+
- Windows/macOS/Linux

## Setup

1. Copy `.env.example` to `.env` and adjust values
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run in development mode (renderer + electron):
   ```bash
   npm run dev
   ```

## Build (Packaging)

### Windows

- Run `npm run build`
- Outputs installer at `build/Task Management-<version>-Setup.exe`

### macOS

- Run `npm run build:mac`
- Creates the following outputs:
  - `build/Task Management-<version>-x64.dmg` - For Intel Macs (x86_64)
  - `build/Task Management-<version>-arm64.dmg` - For Apple Silicon Macs (M-series)
  - `build/mac/Task Management.app/` - App bundle for x64
  - `build/mac-arm64/Task Management.app/` - App bundle for arm64
- **Architectures**: `x64` = Intel (x86_64), `arm64` = Apple Silicon (M‑series). If you prefer a single universal binary, you can adjust `electron-builder.yml` to use a universal target or run electron-builder with the `--mac universal` flag.

### Build Notes

- Both commands will: (1) build the React renderer, (2) copy backend + shared packages into the Electron app, (3) package via electron-builder
- Ensure any production overrides are placed in `production.env` (referenced during packaging) or adjust `electron-builder.yml` if not needed
- Artifacts are written to the `build/` directory defined in `electron-builder.yml`

## Renderer (Frontend)

The React-based frontend provides a modern, responsive interface with role-based navigation:

### Available Pages
- **Dashboard** at `/` - Welcome screen with quick navigation (authenticated users)
- **Login page** at `/login` - Email/password authentication with welcome flow
- **Tasks board** at `/tasks` - Task management with filters, drag-and-drop status updates, and category-based access control (authenticated users)
- **Admin panel** at `/admin` - User management, role/permission configuration (owner or users with admin:access permission)
- **Settings** at `/settings` - Application configuration management (owner/admin only)
- **Audit log** at `/audit` - System activity and security audit trail (owner/admin only)

### Key Features
- **Role-based navigation** - Menu items appear based on user permissions
- **Welcome flow** - First-time user onboarding experience
- **Responsive design** - Works on desktop and mobile devices
- **Real-time updates** - Dynamic permission checking and UI updates
- **Dark/light theme support** - Theme switching via ThemeContext
- **Category access control** - Tasks filtered by user's category permissions
- **Personal task privacy** - Personal category tasks only visible to their creator

### Authentication States
- **Unauthenticated** - Redirects to login page
- **First login** - Shows welcome flow before main interface
- **Standard session** - Full access based on user role and permissions
- **Session management** - Automatic token handling and logout functionality

## Backend (Node.js/Express)

The backend is a robust Express.js server with SQLite database and comprehensive RBAC system:

### Architecture
- **Express.js** REST API server with middleware-based architecture
- **SQLite3** database with foreign key constraints and ACID compliance
- **JWT authentication** with bcrypt password hashing
- **RBAC system** with hierarchical roles and granular permissions
- **Audit logging** for security and compliance tracking
- **Modular router design** for maintainable code organization

### Core Libraries
- **express** - Web framework and routing
- **sqlite3** - Database engine with prepared statements
- **jsonwebtoken** - JWT token generation and validation  
- **bcryptjs** - Password hashing and verification
- **dotenv** - Environment configuration management
- **uuid** - Unique identifier generation

### Database Schema
- **organizations** - Multi-tenant organization hierarchy
- **users** - User accounts with role assignments and org membership
- **tasks** - Task management with status, categories, and assignments
- **categories** - Task categorization with role-based access control
- **audit_log** - Comprehensive activity tracking for security
- **role_permissions** - Dynamic permission system for custom roles
- **roles** - Custom role definitions beyond system defaults
- **category_role_access** - Granular category access control

### RBAC System
- **System Roles**: `owner` (full access), `admin` (management), `viewer` (read-only)
- **Custom Roles**: Configurable roles with specific permission sets
- **Permission Catalog**: Granular permissions (e.g., `tasks:create`, `categories:manage`, `audit:view`)
- **Dynamic Permissions**: Database-driven permission overrides for flexibility
- **Organization Scoping**: Multi-tenant isolation and access control
- **Category Access**: Fine-grained access control for task categories

### Security Features
- **JWT tokens** with configurable expiration and secret rotation
- **Password hashing** with bcrypt salt rounds
- **CORS protection** with configurable allowed origins
- **Input validation** and sanitization on all endpoints
- **Audit trail** for all data modifications and access attempts
- **Session management** with secure logout and token invalidation
- **Personal task privacy** - Personal tasks only visible to creator

### Environment Configuration
```bash
# Core Settings
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=2h
APP_ALLOWED_ORIGIN=http://localhost:5173
PORT=10469

# Public Variables (shared with frontend)
APP_PUBLIC_APP_NAME="Task Management"
APP_PUBLIC_SUPPORT_EMAIL="support@example.com"
```

The React-based frontend provides a modern, responsive interface with role-based navigation:

### Available Pages
- **Dashboard** at `/` - Welcome screen with quick navigation (authenticated users)
- **Login page** at `/login` - Email/password authentication with welcome flow
- **Tasks board** at `/tasks` - Task management with filters, drag-and-drop status updates, and category-based access control (authenticated users)
- **Admin panel** at `/admin` - User management, role/permission configuration (owner or users with admin:access permission)
- **Settings** at `/settings` - Application configuration management (owner/admin only)
- **Audit log** at `/audit` - System activity and security audit trail (owner/admin only)

### Key Features
- **Role-based navigation** - Menu items appear based on user permissions
- **Welcome flow** - First-time user onboarding experience
- **Responsive design** - Works on desktop and mobile devices
- **Real-time updates** - Dynamic permission checking and UI updates
- **Dark/light theme support** - Theme switching via ThemeContext
- **Category access control** - Tasks filtered by user's category permissions
- **Personal task privacy** - Personal category tasks only visible to their creator

### Authentication States
- **Unauthenticated** - Redirects to login page
- **First login** - Shows welcome flow before main interface
- **Standard session** - Full access based on user role and permissions
- **Session management** - Automatic token handling and logout functionality

## API Overview

### Authentication
```
POST /auth/login
Body: { email, password }
Response: { token, user, scope, firstLogin, firstLoginAt, welcomeVersion }
```

### User Management
```
GET /api/me                    - Get current user profile (Bearer token required)
GET /api/organizations         - List organizations in scope (Bearer token required)
POST /api/session/logout       - Logout current session (Bearer token required)
```

### Tasks
```
GET /api/tasks                 - List tasks with filters (Bearer token, tasks:view permission)
POST /api/tasks                - Create new task (Bearer token, tasks:create permission)
PUT /api/tasks/:id             - Update task (Bearer token, tasks:update permission)
DELETE /api/tasks/:id          - Delete task (Bearer token, tasks:delete permission)
```

### Categories
```
GET /api/categories            - List accessible categories (Bearer token required)
POST /api/categories           - Create category (Bearer token, categories:create permission)
PUT /api/categories/:id        - Update category (Bearer token, categories:update permission)
DELETE /api/categories/:id     - Delete category (Bearer token, categories:delete permission)
GET /api/categories/:id/access - Get role access for category (Bearer token, categories:view permission)
PUT /api/categories/:id/access - Set role access for category (Bearer token, owner only)
```

### Admin (Admin Panel Access Required)
```
GET /api/admin/users           - List users (Bearer token, admin access)
POST /api/admin/users          - Create user (Bearer token, admin access)
PUT /api/admin/users/:id       - Update user (Bearer token, admin access)
DELETE /api/admin/users/:id    - Delete user (Bearer token, admin access)

GET /api/admin/roles           - List custom roles (Bearer token, roles:view permission)
POST /api/admin/roles          - Create custom role (Bearer token, roles:create permission)
PUT /api/admin/roles/:name     - Update custom role (Bearer token, roles:update permission)
DELETE /api/admin/roles/:name  - Delete custom role (Bearer token, roles:delete permission)

GET /api/admin/roles/:name/permissions          - List role permissions (Bearer token, roles:view permission)
PUT /api/admin/roles/:name/permissions/:perm    - Set role permission (Bearer token, owner only)

GET /api/admin/permissions/admin-access         - Check admin access status (Bearer token, admin access)
PUT /api/admin/permissions/admin-access         - Toggle admin access for admin role (Bearer token, owner only)
```

### Audit & System
```
GET /api/audit-log             - List audit events (Bearer token, audit:view permission)
GET /api/welcome               - Get welcome status (Bearer token required)
POST /api/welcome/complete     - Mark welcome as completed (Bearer token required)
GET /api/settings              - Get application settings (Bearer token, admin access)
PUT /api/settings              - Update application settings (Bearer token, admin access)

GET /system/health             - Health check (no auth required)
GET /system/env                - Get public environment config (no auth required)
```

## Important Notes

- JWT token is required for all `/api` routes
- CORS origin is controlled via `APP_ALLOWED_ORIGIN` in `.env`
- Permission `categories:manage` controls creating, updating, deleting categories. Listing is available to authenticated users within organization scope